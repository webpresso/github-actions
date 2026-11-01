/**
 * Caller-selected wp runtime contract: the three reusable workflows expose an
 * optional exact-SemVer `wp_version` input, guard it with a fail-fast
 * validation step that precedes `setup-wp`, and forward the caller's value
 * verbatim to the pinned action. Baseline expectations (the action SHA and the
 * `0.0.6` default) are embedded literals, never reads of local Git history.
 *
 * Passing these tests proves input plumbing and enforcement only; it is NOT
 * evidence that any particular wp version is publicly published or qualified
 * (webpresso/app#2983 owns that).
 */

import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  asRecord,
  dig,
  digString,
  loadYaml,
  NODE_BIN,
  stepsOf,
  workflowCallInputs,
  WORKFLOW_PREVIEW,
  WORKFLOW_PRODUCTION,
  WORKFLOW_RELEASE,
  WORKFLOW_SECURITY,
  type YamlNode,
  type YamlRecord,
} from "./helpers";

const SETUP_WP_USES =
  "webpresso/github-actions/.github/actions/setup-wp@2003ca953f336efb779165f748e1ad8408565428";
const GUARD_STEP_NAME = "Validate wp_version input";
const JOB_FOR_WORKFLOW: ReadonlyArray<readonly [string, string]> = [
  [WORKFLOW_PREVIEW, "preview"],
  [WORKFLOW_PRODUCTION, "production"],
  [WORKFLOW_RELEASE, "release"],
  [WORKFLOW_SECURITY, "security"],
];

const ACCEPTED_VERSIONS = ["0.0.6", "0.0.15", "1.2.3-alpha.1+build.5"];
const REJECTED_VERSIONS = [
  "latest",
  "^0.0.6",
  "~0.0.6",
  "0.0",
  "01.2.3",
  "1.02.3",
  "1.2.3-01",
  "1.2.3++",
  "1.2.3-",
];

function workflowSteps(workflow: YamlNode, jobName: string): readonly YamlRecord[] {
  const jobs = asRecord(dig(workflow, "jobs"), "jobs");
  return stepsOf(asRecord(jobs[jobName], `jobs.${jobName}`));
}

function stepName(step: YamlRecord): string | undefined {
  return typeof step["name"] === "string" ? step["name"] : undefined;
}

function guardStep(steps: readonly YamlRecord[]): YamlRecord {
  const step = steps.find((candidate) => stepName(candidate) === GUARD_STEP_NAME);
  if (step === undefined) {
    throw new Error(`missing "${GUARD_STEP_NAME}" step`);
  }
  return step;
}

function setupWpStep(steps: readonly YamlRecord[]): YamlRecord {
  const step = steps.find(
    (candidate) =>
      typeof candidate["uses"] === "string" && candidate["uses"].includes("/setup-wp@"),
  );
  if (step === undefined) {
    throw new Error("missing setup-wp step");
  }
  return step;
}

function guardRunScript(step: YamlRecord): string {
  const run = digString(step, "run");
  if (run === undefined) {
    throw new Error("guard step has no run block");
  }
  const invocation = /node -e '([^']+)'/u.exec(run);
  if (invocation === null) {
    throw new Error("guard step does not invoke node -e with a single-quoted script");
  }
  return invocation[1];
}

function guardRegex(script: string): RegExp {
  const literal = /const ok = \/(.+?)\/\.test\(v\)/u.exec(script);
  if (literal === null) {
    throw new Error("guard script does not bind a regex literal to `ok`");
  }
  return new RegExp(literal[1]);
}

function runGuardScript(script: string, version: string): number {
  const result = spawnSync(NODE_BIN, ["-e", script], {
    env: { ...process.env, WP_VERSION_INPUT: version },
    encoding: "utf8",
  });
  return result.status ?? -1;
}

describe("caller-selected wp runtime", () => {
  for (const [workflowPath, jobName] of JOB_FOR_WORKFLOW) {
    const shortName = workflowPath.replace(/^.*\//u, "");

    it(`${shortName}: exposes an optional wp_version input defaulting to 0.0.6`, () => {
      const workflow = loadYaml(workflowPath);
      const inputs = asRecord(workflowCallInputs(workflow), "workflow_call inputs");
      const input = asRecord(inputs["wp_version"], "inputs.wp_version");
      expect(input["type"]).toBe("string");
      expect(input["required"]).toBe(false);
      expect(input["default"]).toBe("0.0.6");
      expect(typeof input["description"] === "string" ? input["description"] : "").toContain(
        "Exact",
      );
    });

    it(`${shortName}: guards wp_version with strict SemVer before setup-wp`, () => {
      const steps = workflowSteps(loadYaml(workflowPath), jobName);
      const guardIndex = steps.indexOf(guardStep(steps));
      const setupIndex = steps.indexOf(setupWpStep(steps));
      expect(guardIndex).toBeGreaterThanOrEqual(0);
      expect(setupIndex).toBeGreaterThan(guardIndex);
      const regex = guardRegex(guardRunScript(guardStep(steps)));
      for (const version of ACCEPTED_VERSIONS) {
        expect(regex.test(version), `accept ${version}`).toBe(true);
      }
      for (const version of REJECTED_VERSIONS) {
        expect(regex.test(version), `reject ${version}`).toBe(false);
      }
    });

    it(`${shortName}: executes the embedded guard script through node`, () => {
      const steps = workflowSteps(loadYaml(workflowPath), jobName);
      const script = guardRunScript(guardStep(steps));
      for (const version of ["0.0.6", "0.0.15"]) {
        expect(runGuardScript(script, version), `accept ${version}`).toBe(0);
      }
      for (const version of ["latest", "01.2.3", "1.2.3++"]) {
        expect(runGuardScript(script, version), `reject ${version}`).not.toBe(0);
      }
    });

    it(`${shortName}: forwards wp_version verbatim to the pinned setup-wp action`, () => {
      const steps = workflowSteps(loadYaml(workflowPath), jobName);
      const step = setupWpStep(steps);
      expect(step["uses"]).toBe(SETUP_WP_USES);
      const with_ = step["with"] as YamlRecord;
      expect(with_["version"]).toBe("${{ inputs.wp_version }}");
    });
  }
});
