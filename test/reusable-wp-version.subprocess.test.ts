/**
 * Caller-selected wp runtime contract: the four reusable workflows expose an
 * optional exact stable `wp_version` input (`major.minor.patch` only), guard it
 * with a fail-fast validation step that precedes `setup-wp`, and forward the
 * caller's value verbatim to the pinned action. Baseline expectations (the
 * action SHA and the `0.0.6` default) are embedded literals, never reads of
 * local Git history.
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
// Exact version expression from setup-wp/action.yml at the immutable SHA above.
// This is a compatibility oracle only; the action is never downloaded or run.
const PINNED_SETUP_WP_VERSION_GUARD = /^[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z.-]+)?$/;
const GUARD_STEP_NAME = "Validate wp_version input";
const JOB_FOR_WORKFLOW: ReadonlyArray<readonly [string, string]> = [
  [WORKFLOW_PREVIEW, "preview"],
  [WORKFLOW_PRODUCTION, "production"],
  [WORKFLOW_RELEASE, "release"],
  [WORKFLOW_SECURITY, "security"],
];

const ACCEPTED_VERSIONS = ["0.0.6", "0.0.15", "1.2.3", "12.34.56"];
const REJECTED_VERSIONS = [
  "latest",
  "^0.0.6",
  "~0.0.6",
  "0.0",
  "1.2",
  "01.2.3",
  "1.02.3",
  "1.2.3-01",
  "1.2.3++",
  "1.2.3-",
  "1.2.3-alpha.1",
  "1.2.3+build.5",
  "1.2.3-alpha.1+build.5",
  " 1.2.3",
  "1.2.3 ",
  "1.2.3\n",
  "\t1.2.3",
  "v1.2.3",
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
  const literal = /const stableVersion = \/(.+?)\/\.exec\(v\)/u.exec(script);
  if (literal === null) {
    throw new Error("guard script does not bind a regex literal to `stableVersion`");
  }
  return new RegExp(literal[1]);
}

function regexMatchesWholeInput(regex: RegExp, version: string): boolean {
  const match = regex.exec(version);
  return match !== null && match[0] === version;
}

function runGuardScripts(
  scripts: readonly string[],
  versions: readonly string[],
): readonly (readonly number[])[] {
  const harness = `
const vm = require("node:vm");
const guardScripts = ${JSON.stringify(scripts)};
const versions = ${JSON.stringify(versions)};
const exitSignal = {};
const statuses = guardScripts.map((guardScript) => versions.map((version) => {
  let status = 0;
  const guardProcess = {
    env: { WP_VERSION_INPUT: version },
    exit(code) {
      status = code;
      throw exitSignal;
    },
  };
  try {
    vm.runInNewContext(
      guardScript,
      {
        process: guardProcess,
        console: { error: () => {} },
      },
      { timeout: 500 },
    );
  } catch (error) {
    if (error !== exitSignal) throw error;
  }
  return status;
}));
process.stdout.write(JSON.stringify(statuses));
`;
  const result = spawnSync(NODE_BIN, ["-e", harness], {
    env: process.env,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      result.stderr || `Node guard harness exited with status ${String(result.status)}`,
    );
  }
  const parsed: unknown = JSON.parse(result.stdout);
  if (
    !Array.isArray(parsed) ||
    parsed.some(
      (statuses) =>
        !Array.isArray(statuses) || statuses.some((status) => typeof status !== "number"),
    )
  ) {
    throw new Error("Node guard harness returned malformed statuses");
  }
  return parsed;
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
      const description = typeof input["description"] === "string" ? input["description"] : "";
      expect(description).toContain("stable");
      expect(description).toContain("major.minor.patch");
      expect(description).not.toMatch(/prerelease|build/iu);
    });

    it(`${shortName}: guards stable wp_version before setup-wp`, () => {
      const steps = workflowSteps(loadYaml(workflowPath), jobName);
      const guardIndex = steps.indexOf(guardStep(steps));
      const setupIndex = steps.indexOf(setupWpStep(steps));
      expect(guardIndex).toBeGreaterThanOrEqual(0);
      expect(setupIndex).toBeGreaterThan(guardIndex);
      const regex = guardRegex(guardRunScript(guardStep(steps)));
      for (const version of ACCEPTED_VERSIONS) {
        expect(regexMatchesWholeInput(regex, version), `accept ${version}`).toBe(true);
      }
      for (const version of REJECTED_VERSIONS) {
        expect(regexMatchesWholeInput(regex, version), `reject ${version}`).toBe(false);
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

  it("executes each embedded guard across the complete version matrix", () => {
    const versions = [...ACCEPTED_VERSIONS, ...REJECTED_VERSIONS];
    const scripts = JOB_FOR_WORKFLOW.map(([workflowPath, jobName]) => {
      const steps = workflowSteps(loadYaml(workflowPath), jobName);
      return guardRunScript(guardStep(steps));
    });
    const statuses = runGuardScripts(scripts, versions);

    for (const [workflowIndex, [workflowPath]] of JOB_FOR_WORKFLOW.entries()) {
      const workflowStatuses = statuses[workflowIndex];
      if (workflowStatuses === undefined) {
        throw new Error(`missing Node statuses for ${workflowPath}`);
      }
      const shortName = workflowPath.replace(/^.*\//u, "");
      for (const [index, version] of ACCEPTED_VERSIONS.entries()) {
        expect(workflowStatuses[index], `${shortName}: accept ${version}`).toBe(0);
      }
      for (const [index, version] of REJECTED_VERSIONS.entries()) {
        const statusIndex = ACCEPTED_VERSIONS.length + index;
        expect(workflowStatuses[statusIndex], `${shortName}: reject ${version}`).not.toBe(0);
      }
    }
  });

  it("mirrors the pinned setup-wp version guard as a compatibility oracle", () => {
    for (const version of ACCEPTED_VERSIONS) {
      expect(PINNED_SETUP_WP_VERSION_GUARD.test(version), `accept ${version}`).toBe(true);
    }
    expect(PINNED_SETUP_WP_VERSION_GUARD.test("1.2.3-alpha.1")).toBe(true);
    expect(PINNED_SETUP_WP_VERSION_GUARD.test("1.2.3+build.5")).toBe(true);
    expect(PINNED_SETUP_WP_VERSION_GUARD.test("1.2.3-alpha.1+build.5")).toBe(false);
  });
});
