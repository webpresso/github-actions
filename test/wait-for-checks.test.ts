/**
 * Behavioral contracts for the `wait-for-checks` composite action.
 *
 * The polling program is extracted from its heredoc in the action YAML and
 * executed under `node` — the runtime the runner actually uses — against a
 * mocked GitHub API injected with `--require`, the same technique the Doppler
 * OIDC helper contract uses. That keeps the load-bearing decisions (skipped is
 * a failure, same-name multiplicity is never guessed at, an auth error is not
 * "pending", a timeout distinguishes PENDING from NEVER OBSERVED) proven
 * against real execution without needing a live commit or a live API.
 */

import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ACTION_WAIT_FOR_CHECKS,
  NODE_BIN,
  WORKFLOW_SELF_TEST,
  allUses,
  asRecord,
  dig,
  extractHeredocs,
  loadYaml,
  makeTempDir,
  nodeSyntaxCheck,
  readRepoFile,
  stepsOf,
  type YamlRecord,
} from "./helpers.ts";

const action = loadYaml(ACTION_WAIT_FOR_CHECKS);

const actionSteps: readonly YamlRecord[] = (() => {
  const value = dig(action, "runs", "steps");
  if (!Array.isArray(value)) {
    throw new Error("expected runs.steps in wait-for-checks/action.yml");
  }
  return value.map((step, index) => asRecord(step, `runs.steps[${index}]`));
})();

const waitStepRun: string = (() => {
  const body = actionSteps[0]?.["run"];
  if (typeof body !== "string") {
    throw new Error("expected runs.steps[0].run in wait-for-checks/action.yml");
  }
  return body;
})();

/** The polling program itself, lifted out of the `cat > … <<'NODE'` heredoc. */
const helperSource: string = (() => {
  const heredocs = extractHeredocs(readRepoFile(ACTION_WAIT_FOR_CHECKS));
  if (heredocs.length !== 1) {
    throw new Error(`expected exactly one embedded NODE program, got ${heredocs.length}`);
  }
  return heredocs[0]?.body ?? "";
})();

/* -------------------------------------------------------------------------- */
/* Mocked-API harness                                                          */
/* -------------------------------------------------------------------------- */

type CheckRunFixture = {
  readonly name: string;
  readonly status: "queued" | "in_progress" | "completed";
  readonly conclusion?: string | null;
  readonly details_url?: string;
  readonly completed_at?: string;
};

type WorkflowRunFixture = { readonly name: string; readonly path: string };

type HelperResult = {
  readonly status: number | null;
  readonly output: string;
  readonly summary: string;
  readonly stepOutput: string;
  readonly elapsedMs: number;
  readonly pollCount: number;
};

type HelperOptions = {
  /** One entry per poll; the last entry is reused for any further poll. */
  readonly polls: readonly (readonly CheckRunFixture[])[];
  readonly workflowRuns?: Readonly<Record<string, WorkflowRunFixture>>;
  /** Force a non-200 status on every check-runs request. */
  readonly httpStatus?: number;
  readonly contexts: string;
  readonly timeoutSeconds?: string;
  readonly pollIntervalSeconds?: string;
  readonly workflow?: string;
  readonly token?: string;
};

const RUN_URL = "https://github.com/webpresso/repo/actions/runs";

function checkRun(overrides: Partial<CheckRunFixture> & { readonly name: string }): CheckRunFixture {
  return {
    status: "completed",
    conclusion: "success",
    details_url: `${RUN_URL}/1/job/10`,
    completed_at: "2026-07-31T09:00:00Z",
    ...overrides,
  };
}

function mockFetchSource(options: HelperOptions, pollLogPath: string): string {
  return [
    `const fs = require("node:fs");`,
    `const POLLS = ${JSON.stringify(options.polls)};`,
    `const WORKFLOW_RUNS = ${JSON.stringify(options.workflowRuns ?? {})};`,
    `const HTTP_STATUS = ${JSON.stringify(options.httpStatus ?? 200)};`,
    `let poll = 0;`,
    `const respond = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });`,
    `global.fetch = async (url) => {`,
    `  const target = String(url);`,
    `  const runMatch = /\\/actions\\/runs\\/(\\d+)$/u.exec(target);`,
    `  if (runMatch) {`,
    `    const run = WORKFLOW_RUNS[runMatch[1]];`,
    `    return run ? respond(200, run) : respond(404, {});`,
    `  }`,
    `  if (target.includes("/check-runs")) {`,
    `    if (HTTP_STATUS !== 200) { return respond(HTTP_STATUS, {}); }`,
    `    const page = Number(/[?&]page=(\\d+)/u.exec(target)?.[1] ?? "1");`,
    `    if (page > 1) { return respond(200, { check_runs: [] }); }`,
    `    const index = Math.min(poll, POLLS.length - 1);`,
    `    poll += 1;`,
    `    fs.appendFileSync(${JSON.stringify(pollLogPath)}, "poll\\n");`,
    `    return respond(200, { check_runs: POLLS[index] ?? [] });`,
    `  }`,
    `  throw new Error("unexpected URL: " + target);`,
    `};`,
    ``,
  ].join("\n");
}

function runHelper(options: HelperOptions): HelperResult {
  const directory = makeTempDir("wait-for-checks-");
  const scriptPath = join(directory, "wait.cjs");
  const preloadPath = join(directory, "mock-fetch.cjs");
  const summaryPath = join(directory, "summary.md");
  const stepOutputPath = join(directory, "step-output.txt");
  const pollLogPath = join(directory, "polls.log");
  writeFileSync(scriptPath, helperSource);
  writeFileSync(preloadPath, mockFetchSource(options, pollLogPath));
  writeFileSync(summaryPath, "");
  writeFileSync(stepOutputPath, "");
  writeFileSync(pollLogPath, "");

  const startedAt = Date.now();
  const result = spawnSync(NODE_BIN, ["--require", preloadPath, scriptPath], {
    encoding: "utf8",
    env: {
      PATH: process.env["PATH"] ?? "",
      GITHUB_API_URL: "https://api.github.test",
      GITHUB_STEP_SUMMARY: summaryPath,
      GITHUB_OUTPUT: stepOutputPath,
      WAIT_CONTEXTS: options.contexts,
      WAIT_REF: "cafe1234",
      WAIT_REPOSITORY: "webpresso/repo",
      WAIT_TIMEOUT_SECONDS: options.timeoutSeconds ?? "2",
      WAIT_POLL_INTERVAL_SECONDS: options.pollIntervalSeconds ?? "0.05",
      WAIT_TOKEN: options.token ?? "test-token",
      WAIT_WORKFLOW: options.workflow ?? "",
    },
  });

  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    summary: readFileSync(summaryPath, "utf8"),
    stepOutput: readFileSync(stepOutputPath, "utf8"),
    elapsedMs: Date.now() - startedAt,
    pollCount: readFileSync(pollLogPath, "utf8").split("\n").filter(Boolean).length,
  };
}

/* -------------------------------------------------------------------------- */
/* Success                                                                     */
/* -------------------------------------------------------------------------- */

describe("wait-for-checks success", () => {
  it("passes when every named context completed successfully", () => {
    const result = runHelper({ contexts: "wp-check", polls: [[checkRun({ name: "wp-check" })]] });
    expect(result.status, result.output).toBe(0);
    expect(result.output).toInclude("all 1 context(s) succeeded");
  });

  it("requires every context in a comma- and newline-separated list", () => {
    const result = runHelper({
      contexts: "quality, e2e\nsecurity",
      polls: [[checkRun({ name: "quality" }), checkRun({ name: "e2e" }), checkRun({ name: "security" })]],
    });
    expect(result.status, result.output).toBe(0);
    expect(result.output).toInclude("all 3 context(s) succeeded");
  });

  it("does not pass while one of several contexts is still missing", () => {
    const result = runHelper({
      contexts: "quality,e2e",
      polls: [[checkRun({ name: "quality" })]],
      timeoutSeconds: "0.3",
    });
    expect(result.status).toBe(1);
    expect(result.output).toInclude("e2e: NEVER OBSERVED");
  });

  it("keeps polling a pending check and succeeds when it completes green", () => {
    const result = runHelper({
      contexts: "wp-check",
      polls: [
        [checkRun({ name: "wp-check", status: "in_progress", conclusion: null })],
        [checkRun({ name: "wp-check" })],
      ],
      timeoutSeconds: "5",
    });
    expect(result.status, result.output).toBe(0);
    expect(result.pollCount).toBeGreaterThan(1);
  });

  it("emits a step-summary line per context with its final state", () => {
    const result = runHelper({
      contexts: "quality,e2e",
      polls: [[checkRun({ name: "quality" }), checkRun({ name: "e2e" })]],
    });
    expect(result.summary).toInclude("- `quality`: SUCCESS");
    expect(result.summary).toInclude("- `e2e`: SUCCESS");
  });

  // Each step gets its OWN GITHUB_STEP_SUMMARY file, so a later step cannot
  // read the wait's summary. The `states` output is the only thing a caller
  // can assert on, and it must therefore be set on the failure paths too.
  it("writes a machine-readable states output on success", () => {
    const result = runHelper({
      contexts: "quality,e2e",
      polls: [[checkRun({ name: "quality" }), checkRun({ name: "e2e" })]],
    });
    expect(result.stepOutput).toBe("states=quality=SUCCESS,e2e=SUCCESS\n");
  });

  it("writes the states output on the timeout path too", () => {
    const result = runHelper({
      contexts: "slow-check,typo-check",
      polls: [[checkRun({ name: "slow-check", status: "queued", conclusion: null })]],
      timeoutSeconds: "0.3",
    });
    expect(result.status).toBe(1);
    expect(result.stepOutput).toBe("states=slow-check=PENDING,typo-check=NEVER OBSERVED\n");
  });

  it("writes the states output on the terminal-failure path too", () => {
    const result = runHelper({
      contexts: "wp-check",
      polls: [[checkRun({ name: "wp-check", conclusion: "failure" })]],
    });
    expect(result.status).toBe(1);
    expect(result.stepOutput).toBe("states=wp-check=FAILED\n");
  });
});

/* -------------------------------------------------------------------------- */
/* Success only — every other conclusion fails                                 */
/* -------------------------------------------------------------------------- */

describe("wait-for-checks treats only `success` as a pass", () => {
  for (const conclusion of ["failure", "cancelled", "timed_out", "action_required", "neutral", "stale"]) {
    it(`fails on a "${conclusion}" conclusion`, () => {
      const result = runHelper({
        contexts: "wp-check",
        polls: [[checkRun({ name: "wp-check", conclusion })]],
      });
      expect(result.status).toBe(1);
      expect(result.output).toInclude(`"wp-check" concluded "${conclusion}"`);
    });
  }

  // The decision most likely to be "corrected" by a future reader: GitHub's own
  // branch protection counts a skipped required check as a pass. Inheriting
  // that here would let a deploy proceed from a commit whose gate never ran.
  it("fails on `skipped` and says why, instead of inheriting branch protection's convention", () => {
    const result = runHelper({
      contexts: "wp-check",
      polls: [[checkRun({ name: "wp-check", conclusion: "skipped" })]],
    });
    expect(result.status).toBe(1);
    expect(result.output).toInclude('"wp-check" concluded "skipped"');
    expect(result.output).toInclude("branch protection counts it as a pass");
  });

  it("fails closed on a conclusion it has never heard of", () => {
    const result = runHelper({
      contexts: "wp-check",
      polls: [[checkRun({ name: "wp-check", conclusion: "invented_by_github_next_year" })]],
    });
    expect(result.status).toBe(1);
    expect(result.output).toInclude('is not "success"');
  });

  it("fails fast on a terminal conclusion instead of polling to the bound", () => {
    // A ten-minute bound with a one-minute poll: only an immediate exit can
    // finish this test quickly, so the assertion cannot pass by accident.
    const result = runHelper({
      contexts: "wp-check",
      polls: [[checkRun({ name: "wp-check", conclusion: "failure" })]],
      timeoutSeconds: "600",
      pollIntervalSeconds: "60",
    });
    expect(result.status).toBe(1);
    expect(result.elapsedMs).toBeLessThan(10_000);
    expect(result.pollCount).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Same-name multiplicity                                                      */
/* -------------------------------------------------------------------------- */

describe("wait-for-checks same-name multiplicity", () => {
  // Verified live on webpresso/monorepo: one commit carried two check runs
  // named `schema-codegen`, from two different workflows, concluding `skipped`
  // and `success`. Whichever the API happens to return first would decide the
  // gate — so a disagreement is an error, not a coin flip.
  const conflicting: readonly CheckRunFixture[] = [
    checkRun({ name: "schema-codegen", conclusion: "skipped", details_url: `${RUN_URL}/111/job/1` }),
    checkRun({ name: "schema-codegen", conclusion: "success", details_url: `${RUN_URL}/222/job/2` }),
  ];

  it("fails loudly, naming every conflicting run and its URL, instead of picking one", () => {
    const result = runHelper({ contexts: "schema-codegen", polls: [conflicting] });
    expect(result.status).toBe(1);
    expect(result.output).toInclude("Refusing to guess");
    expect(result.output).toInclude("skipped, success");
    expect(result.output).toInclude(`${RUN_URL}/111/job/1`);
    expect(result.output).toInclude(`${RUN_URL}/222/job/2`);
  });

  it("accepts re-runs that agree, taking the most recent", () => {
    const result = runHelper({
      contexts: "wp-check",
      polls: [
        [
          checkRun({ name: "wp-check", completed_at: "2026-07-31T09:00:00Z" }),
          checkRun({ name: "wp-check", completed_at: "2026-07-31T10:00:00Z" }),
        ],
      ],
    });
    expect(result.status, result.output).toBe(0);
  });

  it("disambiguates by workflow file name when the caller names one", () => {
    const result = runHelper({
      contexts: "schema-codegen",
      polls: [conflicting],
      workflow: "ci.yml",
      workflowRuns: {
        "111": { name: "Preview Deploy", path: ".github/workflows/preview-deploy.yml" },
        "222": { name: "CI", path: ".github/workflows/ci.yml" },
      },
    });
    expect(result.status, result.output).toBe(0);
  });

  it("disambiguates by workflow path and by display name too", () => {
    const workflowRuns = {
      "111": { name: "Preview Deploy", path: ".github/workflows/preview-deploy.yml" },
      "222": { name: "CI", path: ".github/workflows/ci.yml" },
    } as const;
    for (const workflow of [".github/workflows/ci.yml", "CI"]) {
      const result = runHelper({ contexts: "schema-codegen", polls: [conflicting], workflow, workflowRuns });
      expect(result.status, `${workflow}: ${result.output}`).toBe(0);
    }
  });

  // Filtering must be able to select the FAILING run: a `workflow` input that
  // silently preferred the green one would be worse than no filter at all.
  it("still fails when the selected workflow's run is the failing one", () => {
    const result = runHelper({
      contexts: "schema-codegen",
      polls: [conflicting],
      workflow: "preview-deploy.yml",
      workflowRuns: {
        "111": { name: "Preview Deploy", path: ".github/workflows/preview-deploy.yml" },
        "222": { name: "CI", path: ".github/workflows/ci.yml" },
      },
    });
    expect(result.status).toBe(1);
    expect(result.output).toInclude('"schema-codegen" concluded "skipped"');
  });

  it("reports NEVER OBSERVED when no run of the named workflow produced the context", () => {
    const result = runHelper({
      contexts: "schema-codegen",
      polls: [[checkRun({ name: "schema-codegen", details_url: `${RUN_URL}/111/job/1` })]],
      workflow: "ci.yml",
      workflowRuns: { "111": { name: "Preview Deploy", path: ".github/workflows/preview-deploy.yml" } },
      timeoutSeconds: "0.3",
    });
    expect(result.status).toBe(1);
    expect(result.output).toInclude("schema-codegen: NEVER OBSERVED");
    expect(result.output).toInclude('no run of workflow "ci.yml"');
  });
});

/* -------------------------------------------------------------------------- */
/* Bounded expiry                                                              */
/* -------------------------------------------------------------------------- */

describe("wait-for-checks expiry", () => {
  it("distinguishes PENDING from NEVER OBSERVED and stays inside the bound", () => {
    const result = runHelper({
      contexts: "slow-check,typo-check",
      polls: [[checkRun({ name: "slow-check", status: "queued", conclusion: null })]],
      timeoutSeconds: "1",
      pollIntervalSeconds: "0.2",
    });
    expect(result.status).toBe(1);
    expect(result.output).toInclude("slow-check: PENDING");
    expect(result.output).toInclude("typo-check: NEVER OBSERVED");
    expect(result.output).toInclude("timed out after");
    expect(result.elapsedMs).toBeLessThan(15_000);
    expect(result.summary).toInclude("- `slow-check`: PENDING");
    expect(result.summary).toInclude("- `typo-check`: NEVER OBSERVED");
  });

  it("names the remediation for a never-observed context", () => {
    const result = runHelper({
      contexts: "typo-check",
      polls: [[]],
      timeoutSeconds: "0.3",
    });
    expect(result.status).toBe(1);
    expect(result.output).toInclude("CI never triggered for this event/commit");
  });

  it("does not mention NEVER OBSERVED remediation when everything was merely pending", () => {
    const result = runHelper({
      contexts: "slow-check",
      polls: [[checkRun({ name: "slow-check", status: "in_progress", conclusion: null })]],
      timeoutSeconds: "0.3",
    });
    expect(result.status).toBe(1);
    expect(result.output).toInclude("slow-check: PENDING");
    expect(result.output).not.toInclude("NEVER OBSERVED");
  });
});

/* -------------------------------------------------------------------------- */
/* Auth and transport                                                          */
/* -------------------------------------------------------------------------- */

describe("wait-for-checks API failures", () => {
  for (const status of [401, 403, 404]) {
    it(`treats HTTP ${status} as an immediate loud failure, not as "not yet appeared"`, () => {
      const result = runHelper({
        contexts: "wp-check",
        polls: [[]],
        httpStatus: status,
        // A bound big enough that a stall would hang the suite: only an
        // immediate abort finishes.
        timeoutSeconds: "600",
        pollIntervalSeconds: "60",
      });
      expect(result.status).toBe(1);
      expect(result.output).toInclude(`HTTP ${status}`);
      expect(result.output).toInclude("checks: read");
      expect(result.output).toInclude("authorization/visibility failure");
      expect(result.elapsedMs).toBeLessThan(10_000);
    });
  }

  it("retries a server error inside the bound instead of aborting", () => {
    const result = runHelper({
      contexts: "wp-check",
      polls: [[]],
      httpStatus: 503,
      timeoutSeconds: "0.6",
      pollIntervalSeconds: "0.1",
    });
    expect(result.status).toBe(1);
    expect(result.output).toInclude("::warning::");
    expect(result.output).toInclude("HTTP 503");
    expect(result.output).toInclude("timed out after");
  });
});

/* -------------------------------------------------------------------------- */
/* Input validation                                                            */
/* -------------------------------------------------------------------------- */

describe("wait-for-checks input validation", () => {
  it("rejects an empty context list", () => {
    const result = runHelper({ contexts: "  ,\n ", polls: [[]] });
    expect(result.status).toBe(2);
    expect(result.output).toInclude("input `contexts` is required");
  });

  it("rejects a non-positive timeout", () => {
    const result = runHelper({ contexts: "wp-check", polls: [[]], timeoutSeconds: "0" });
    expect(result.status).toBe(2);
    expect(result.output).toInclude("timeout-seconds must be a positive number");
  });
});

/* -------------------------------------------------------------------------- */
/* Structure                                                                   */
/* -------------------------------------------------------------------------- */

describe("wait-for-checks action shape", () => {
  it("is a checkout-free composite whose only step is the wait", () => {
    expect(dig(action, "runs", "using")).toBe("composite");
    expect(actionSteps.length).toBe(1);
    // No `uses:` at all — in particular no checkout, so the action can be the
    // first step of a job. (The prose above names actions/checkout, which is
    // why this asserts over `uses:` values rather than raw text.)
    expect(allUses(action)).toStrictEqual([]);
  });

  it("declares the documented inputs and defaults", () => {
    expect(dig(action, "inputs", "contexts", "required")).toBe(true);
    // NOT a bare `github.sha`: on a pull_request event that is the ephemeral
    // merge commit, which carries zero check runs — verified live, and caught
    // by this repo's own gate before the action shipped.
    expect(dig(action, "inputs", "ref", "default")).toBe("${{ github.event.pull_request.head.sha || github.sha }}");
    expect(dig(action, "inputs", "repository", "default")).toBe("${{ github.repository }}");
    expect(dig(action, "inputs", "timeout-seconds", "default")).toBe("900");
    expect(dig(action, "inputs", "poll-interval-seconds", "default")).toBe("20");
    expect(dig(action, "inputs", "token", "default")).toBe("${{ github.token }}");
    expect(dig(action, "inputs", "workflow", "default")).toBe("");
    expect(dig(action, "outputs", "states", "value")).toBe("${{ steps.wait.outputs.states }}");
    expect(actionSteps[0]?.["id"], "the states output must be wired to a real step id").toBe("wait");
  });

  it("passes every caller-controlled value through env, never into the script body", () => {
    const env = Object.keys(asRecord(dig(actionSteps[0], "env"), "runs.steps[0].env"));
    for (const name of [
      "WAIT_CONTEXTS",
      "WAIT_REF",
      "WAIT_REPOSITORY",
      "WAIT_TIMEOUT_SECONDS",
      "WAIT_POLL_INTERVAL_SECONDS",
      "WAIT_TOKEN",
      "WAIT_WORKFLOW",
    ]) {
      expect(env).toContain(name);
    }
    // Template injection: no expression may be interpolated into the shell or
    // the JavaScript that the shell writes out.
    expect(waitStepRun).not.toInclude("${{");
  });

  it("needs neither the GitHub CLI nor jq on the runner image", () => {
    const code = waitStepRun
      .split("\n")
      .filter((line) => !/^\s*(?:#|\*|\/\*)/u.test(line))
      .join("\n");
    expect(code).not.toMatch(/\bgh\s+api\b/u);
    expect(code).not.toMatch(/\bjq\b/u);
  });

  it("embeds a program that parses under node", () => {
    const result = nodeSyntaxCheck(helperSource);
    expect(result.status, result.stderr).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Live coverage in this repository's own gate                                 */
/* -------------------------------------------------------------------------- */

describe("self-test.yml exercises the action against the live API", () => {
  const selfTest = loadYaml(WORKFLOW_SELF_TEST);
  const jobs = asRecord(dig(selfTest, "jobs"), "jobs");

  function localActionSteps(jobName: string): readonly YamlRecord[] {
    return stepsOf(jobs[jobName]).filter((step) => step["uses"] === "./.github/actions/wait-for-checks");
  }

  it("waits on a real green check produced earlier in the same run", () => {
    const job = jobs["wait-for-checks-success"];
    expect(job, "expected a `wait-for-checks-success` job").toBeDefined();
    expect(dig(job, "needs")).toBe("contract-tests");
    expect(dig(job, "permissions", "checks")).toBe("read");
    const steps = localActionSteps("wait-for-checks-success");
    expect(steps.length).toBe(1);
    expect(dig(steps[0], "with", "contexts")).toBe("contract-tests");
  });

  it("proves the bounded never-observed failure against the live API", () => {
    const job = jobs["wait-for-checks-bounded-failure"];
    expect(job, "expected a `wait-for-checks-bounded-failure` job").toBeDefined();
    expect(dig(job, "permissions", "checks")).toBe("read");
    const steps = localActionSteps("wait-for-checks-bounded-failure");
    expect(steps.length).toBe(1);
    expect(dig(steps[0], "with", "contexts")).toBe("this-context-does-not-exist");
    expect(dig(steps[0], "with", "timeout-seconds")).toBe(30);
    expect(steps[0]?.["continue-on-error"]).toBe(true);

    // The assertion step must check the outcome, the elapsed bound, and that
    // the message distinguished a never-observed context from a pending one.
    const assertion = stepsOf(jobs["wait-for-checks-bounded-failure"]).find((step) => step["id"] === "assert");
    const body = typeof assertion?.["run"] === "string" ? assertion["run"] : "";
    expect(body).toInclude("NEVER OBSERVED");
    expect(body).toInclude("failure");

    // It must read the wait's `states` OUTPUT. Reading GITHUB_STEP_SUMMARY
    // instead is vacuous — every step gets its own summary file — and that
    // mistake shipped once already.
    expect(dig(assertion, "env", "STATES")).toBe("${{ steps.bounded.outputs.states }}");
    expect(body).not.toInclude("GITHUB_STEP_SUMMARY");
  });

  it("keeps the action referenced from this repo by path, so the gate tests the working tree", () => {
    expect(existsSync(ACTION_WAIT_FOR_CHECKS)).toBe(true);
    expect(readRepoFile(WORKFLOW_SELF_TEST)).toInclude("./.github/actions/wait-for-checks");
  });
});
