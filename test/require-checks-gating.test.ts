/**
 * Contracts for the optional `require_checks` gate and the job timeout bounds
 * on the caller-facing reusable workflows.
 *
 * The gate's whole value is POSITIONAL: it must run before the caller spends
 * setup time and strictly before any credential is exchanged. "The step
 * exists" would be a vacuous assertion, so what is pinned here is its index,
 * the shape of its `uses:` reference, and the permission that makes it able to
 * read check runs at all.
 */

import { describe, expect, it } from "bun:test";
import {
  FULL_SHA_USES_RE,
  JOB_TIMEOUT_WORKFLOWS,
  REMOTE_WAIT_FOR_CHECKS_PREFIX,
  REQUIRE_CHECKS_WORKFLOWS,
  WAIT_FOR_CHECKS_USES_RE,
  WORKFLOW_PREVIEW,
  WORKFLOW_PRODUCTION,
  WORKFLOW_RELEASE,
  WORKFLOW_SELF_TEST,
  allUses,
  asRecord,
  dig,
  digString,
  loadYaml,
  stepsOf,
  workflowAndActionPaths,
  workflowCallInputs,
  type YamlRecord,
} from "./helpers.ts";

/** Step keys that mean "this step can see or mint a credential". */
const CREDENTIAL_MARKERS: readonly string[] = [
  "secrets.",
  "ACTIONS_ID_TOKEN_REQUEST",
  "DOPPLER_TOKEN",
  "DOPPLER_IDENTITY_ID",
  "GITHUB_TOKEN",
  "NODE_AUTH_TOKEN",
];

function jobOf(path: string, jobName: string): YamlRecord {
  return asRecord(dig(loadYaml(path), "jobs", jobName), `${path} jobs.${jobName}`);
}

function gateStepOf(path: string, jobName: string): YamlRecord {
  const first = stepsOf(jobOf(path, jobName))[0];
  expect(first, `${path} ${jobName} has no steps`).toBeDefined();
  return first as YamlRecord;
}

describe("require_checks input surface", () => {
  it("is optional with an empty default on every caller-facing workflow", () => {
    for (const [path] of REQUIRE_CHECKS_WORKFLOWS) {
      const inputs = workflowCallInputs(loadYaml(path));

      // Optional-with-default is what keeps every existing SHA-pinned consumer
      // working untouched: an absent input resolves to "" and the gate step's
      // `if:` evaluates false, so the job behaves exactly as it did before.
      expect(dig(inputs, "require_checks", "type"), path).toBe("string");
      expect(dig(inputs, "require_checks", "required"), path).toBe(false);
      expect(dig(inputs, "require_checks", "default"), path).toBe("");

      expect(dig(inputs, "require_checks_timeout_seconds", "type"), path).toBe("number");
      expect(dig(inputs, "require_checks_timeout_seconds", "required"), path).toBe(false);
      expect(dig(inputs, "require_checks_timeout_seconds", "default"), path).toBe(900);
    }
  });
});

describe("require_checks gate placement", () => {
  it("is the FIRST step of the job on every caller-facing workflow", () => {
    for (const [path, jobName] of REQUIRE_CHECKS_WORKFLOWS) {
      const gate = gateStepOf(path, jobName);
      expect(digString(gate, "uses"), `${path} ${jobName} step[0] must be the wait`).toMatch(
        WAIT_FOR_CHECKS_USES_RE,
      );
      expect(digString(gate, "if"), path).toInclude("inputs.require_checks != ''");
    }
  });

  it("precedes checkout, toolchain setup, and every credential-bearing step", () => {
    for (const [path, jobName] of REQUIRE_CHECKS_WORKFLOWS) {
      const steps = stepsOf(jobOf(path, jobName));
      const gateIndex = steps.findIndex((step) => WAIT_FOR_CHECKS_USES_RE.test(String(step["uses"] ?? "")));
      expect(gateIndex, path).toBe(0);

      // A checkout must exist and must come later -- otherwise "first step"
      // would be trivially true for a job that never checks anything out.
      const checkoutIndex = steps.findIndex((step) => String(step["uses"] ?? "").startsWith("actions/checkout@"));
      expect(checkoutIndex, `${path} has no checkout to precede`).toBeGreaterThan(gateIndex);

      const credentialIndexes = steps
        .map((step, index) => [index, JSON.stringify(step)] as const)
        .filter(([, body]) => CREDENTIAL_MARKERS.some((marker) => body.includes(marker)))
        .map(([index]) => index);
      expect(credentialIndexes.length, `${path} exercises no credential at all`).toBeGreaterThan(0);
      expect(
        Math.min(...credentialIndexes),
        `${path} exchanges a credential at or before the gate`,
      ).toBeGreaterThan(gateIndex);
    }
  });

  it("grants checks: read without dropping any pre-existing permission", () => {
    // Job-level `permissions:` REPLACES the default token scopes rather than
    // merging, so this asserts the whole expected set, not just the addition.
    const expected: ReadonlyArray<readonly [string, string, readonly string[]]> = [
      [WORKFLOW_PREVIEW, "preview", ["contents", "packages", "id-token", "checks"]],
      [WORKFLOW_PRODUCTION, "production", ["contents", "packages", "id-token", "issues", "checks"]],
      [WORKFLOW_RELEASE, "release", ["contents", "pull-requests", "packages", "checks"]],
    ];

    for (const [path, jobName, scopes] of expected) {
      const permissions = asRecord(dig(jobOf(path, jobName), "permissions"), `${path} permissions`);
      expect(Object.keys(permissions).sort(), path).toStrictEqual([...scopes].sort());
      expect(permissions["checks"], path).toBe("read");
    }
  });
});

describe("require_checks gate reference", () => {
  it("uses the REMOTE pinned form, never a relative path, branch, or tag", () => {
    for (const [path, jobName] of REQUIRE_CHECKS_WORKFLOWS) {
      const uses = digString(gateStepOf(path, jobName), "uses") ?? "";

      // Relative would resolve against the CALLER's checkout, which has not
      // happened yet at step 0 -- the reference would simply not exist.
      expect(uses, path).not.toStartWith("./");
      expect(uses, path).toStartWith(REMOTE_WAIT_FOR_CHECKS_PREFIX);
      // A branch or tag is mutable; a 40-hex SHA is not.
      expect(uses, path).toMatch(FULL_SHA_USES_RE);
    }
  });

  it("pins one single wait-for-checks commit across every remote reference", () => {
    const remote = workflowAndActionPaths()
      .flatMap((path) => allUses(loadYaml(path)))
      .filter((value) => WAIT_FOR_CHECKS_USES_RE.test(value) && !value.startsWith("./"));
    expect(remote.length).toBeGreaterThan(0);
    expect([...new Set(remote)].length, "every remote wait-for-checks pin must be the same commit").toBe(1);
  });

  // Reachability cannot be proven by reading YAML -- an unreachable pin is a
  // property of the remote repository, not of this file. So it is proven at
  // runtime: self-test.yml resolves the very same reference on every pull
  // request, and an unreachable commit fails that job. This binds the two so
  // the runtime proof cannot silently stop covering the pin the workflows use.
  it("is the same commit self-test.yml resolves on every pull request", () => {
    const selfTestPins = [...new Set(
      allUses(loadYaml(WORKFLOW_SELF_TEST)).filter(
        (value) => WAIT_FOR_CHECKS_USES_RE.test(value) && value.startsWith(REMOTE_WAIT_FOR_CHECKS_PREFIX),
      ),
    )];
    expect(selfTestPins.length, "self-test.yml must exercise the remote pinned form").toBe(1);

    for (const [path, jobName] of REQUIRE_CHECKS_WORKFLOWS) {
      expect(digString(gateStepOf(path, jobName), "uses"), path).toBe(selfTestPins[0]);
    }
  });
});

describe("require_checks gate wiring", () => {
  it("passes the caller's contexts and bound through to the action", () => {
    for (const [path, jobName] of REQUIRE_CHECKS_WORKFLOWS) {
      const gate = gateStepOf(path, jobName);
      expect(dig(gate, "with", "contexts"), path).toBe("${{ inputs.require_checks }}");
      expect(dig(gate, "with", "timeout-seconds"), path).toBe("${{ inputs.require_checks_timeout_seconds }}");
    }
  });

  it("gates the exact commit the deploy workflows will check out", () => {
    // The gate and the checkout must not be able to disagree: a caller that
    // pinned checkout_ref must have THAT commit proven, not the triggering one.
    for (const [path, jobName] of [
      [WORKFLOW_PREVIEW, "preview"],
      [WORKFLOW_PRODUCTION, "production"],
    ] as const) {
      expect(dig(gateStepOf(path, jobName), "with", "ref"), path).toBe(
        "${{ inputs.checkout_ref || github.event.pull_request.head.sha || github.sha }}",
      );
    }
  });

  it("leaves ref to the action's own default on the release workflow", () => {
    // changesets-release.yml has no checkout_ref input, so the commit under
    // release is the triggering one and the action's default is exactly right.
    // Restating it would create a second site to drift.
    expect(workflowCallInputs(loadYaml(WORKFLOW_RELEASE))["checkout_ref"]).toBeUndefined();
    expect(dig(gateStepOf(WORKFLOW_RELEASE, "release"), "with", "ref")).toBeUndefined();
  });
});

describe("job timeout bounds", () => {
  it("exposes job_timeout_minutes and applies it as the job's timeout-minutes", () => {
    for (const [path, jobName] of JOB_TIMEOUT_WORKFLOWS) {
      // A CALLER cannot set `timeout-minutes` on a job that `uses:` a reusable
      // workflow, so the bound can only live here, behind an input. This is an
      // ADDED missing bound: these jobs previously had none, leaving a hung run
      // to hold the caller's concurrency lock until GitHub's 6h default.
      const inputs = workflowCallInputs(loadYaml(path));
      expect(dig(inputs, "job_timeout_minutes", "type"), path).toBe("number");
      expect(dig(inputs, "job_timeout_minutes", "required"), path).toBe(false);
      expect(dig(inputs, "job_timeout_minutes", "default"), path).toBe(30);

      expect(dig(jobOf(path, jobName), "timeout-minutes"), path).toBe("${{ inputs.job_timeout_minutes }}");
    }
  });

  it("does not add the bound to the preview workflow", () => {
    // Kept out on purpose: preview lanes are the short-lived ones and no
    // unbounded-hang incident motivated a bound there. Asserted so the absence
    // reads as a decision rather than an oversight.
    expect(workflowCallInputs(loadYaml(WORKFLOW_PREVIEW))["job_timeout_minutes"]).toBeUndefined();
    expect(dig(jobOf(WORKFLOW_PREVIEW, "preview"), "timeout-minutes")).toBeUndefined();
  });
});
