/**
 * Contracts for the org-governance workflows: the shared PR Policy workflow and
 * the auto-merge sweeper. YAML is read as data; the tier step is executed under
 * bash with a stub `gh`; the sweeper script runs against fixtures, never the
 * network.
 */

import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync as readText, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  REPO_ROOT,
  WORKFLOW_AUTO_MERGE_SWEEPER,
  WORKFLOW_PR_POLICY,
  allSteps,
  allUses,
  dig,
  digString,
  loadYaml,
  onSection,
  readRepoFile,
  type YamlRecord,
} from "./helpers";
import {
  MAX_ARMED_PER_REPO,
  canArm,
  isExpectedArmRefusal,
  liveSource,
  fixtureSource,
  planRepository,
  selectRepositories,
  sweep,
} from "../.github/scripts/auto-merge-sweeper.mjs";

const FULL_SHA_USES = /^[^@\s]+@[0-9a-f]{40}$/u;
const FIXTURE = join(REPO_ROOT, "test", "fixtures", "auto-merge-sweep.json");
const SCRIPT = join(REPO_ROOT, ".github", "scripts", "auto-merge-sweeper.mjs");

function stepNamed(path: string, name: string): YamlRecord {
  const step = allSteps(loadYaml(path)).find((candidate) => candidate["name"] === name);
  if (step === undefined) {
    throw new Error(`${path} has no step named ${name}`);
  }
  return step;
}

describe("pr-policy.yml", () => {
  const workflow = loadYaml(WORKFLOW_PR_POLICY);

  it("triggers on pull_request and merge_group, with read-only permissions", () => {
    const on = onSection(workflow);
    expect(Object.keys(on).sort()).toStrictEqual(["merge_group", "pull_request"]);
    expect(dig(on, "merge_group", "types")).toStrictEqual(["checks_requested"]);
    expect(dig(workflow, "permissions")).toStrictEqual({ contents: "read", "pull-requests": "read" });
  });

  it("pins the same released wp version and SHA-256 as cluster-10409", () => {
    const install = digString(stepNamed(WORKFLOW_PR_POLICY, "Install pinned wp"), "run") ?? "";
    expect(install).toInclude("app-releases/releases/download/v0.0.13/wp-linux-x64");
    expect(install).toInclude("2d9c17dac7174a1b1436a7f5cb32719cb1fad9591850d8481dcf156b28415874");
    expect(install).toInclude("sha256sum --check --strict");
  });

  it("pins every action by full SHA and never reads merge_group.base_sha", () => {
    for (const uses of allUses(workflow)) {
      expect(uses).toMatch(FULL_SHA_USES);
    }
    expect(readRepoFile(WORKFLOW_PR_POLICY)).not.toInclude("merge_group.base_sha");
  });

  it("runs wp from outside the PR checkout", () => {
    for (const name of ["Validate the AI/model disclosure", "Require blueprint coverage"]) {
      expect(digString(stepNamed(WORKFLOW_PR_POLICY, name), "working-directory")).toBe("${{ runner.temp }}");
    }
    const coverage = digString(stepNamed(WORKFLOW_PR_POLICY, "Require blueprint coverage"), "run") ?? "";
    expect(coverage).toInclude('--root "$GITHUB_WORKSPACE/pr"');
    expect(coverage).toInclude('git -C "$GITHUB_WORKSPACE/pr" merge-base');
  });

  it("checks the PR out as data and runs the gates per tier", () => {
    const checkout = stepNamed(WORKFLOW_PR_POLICY, "Check out the pull request as data");
    expect(dig(checkout, "with", "persist-credentials")).toBe(false);
    expect(digString(stepNamed(WORKFLOW_PR_POLICY, "Validate the AI/model disclosure"), "if")).toInclude("'guarded'");
    expect(digString(stepNamed(WORKFLOW_PR_POLICY, "Require blueprint coverage"), "if")).not.toInclude("guarded");
    expect(digString(stepNamed(WORKFLOW_PR_POLICY, "Require blueprint coverage"), "if")).toInclude("'full'");
  });

  describe("tier step", () => {
    const script = digString(stepNamed(WORKFLOW_PR_POLICY, "Read the governance tier"), "run") ?? "";

    function runTier(properties: string): { status: number | null; output: string; log: string; summary: string } {
      const dir = mkdtempSync(join(tmpdir(), "tier-"));
      const bin = join(dir, "bin");
      mkdirSync(bin);
      // Stub gh: applies the --jq filter to the canned properties with jq.
      writeFileSync(
        join(bin, "gh"),
        `#!/usr/bin/env bash\nset -euo pipefail\nfilter=''\nwhile [ $# -gt 0 ]; do [ "$1" = --jq ] && filter="$2"; shift; done\nprintf '%s' "$PROPERTIES" | jq -r "$filter"\n`,
      );
      chmodSync(join(bin, "gh"), 0o755);
      const outputFile = join(dir, "output");
      const summaryFile = join(dir, "summary");
      writeFileSync(outputFile, "");
      writeFileSync(summaryFile, "");
      const result = spawnSync("bash", ["-c", script], {
        encoding: "utf8",
        env: {
          PATH: `${bin}:${process.env["PATH"]}`,
          PROPERTIES: properties,
          GITHUB_REPOSITORY: "webpresso/example",
          GITHUB_OUTPUT: outputFile,
          GITHUB_STEP_SUMMARY: summaryFile,
        },
      });
      return {
        status: result.status,
        output: Bun.file(outputFile).size > 0 ? readText(outputFile, "utf8") : "",
        log: `${result.stdout}${result.stderr}`,
        summary: Bun.file(summaryFile).size > 0 ? readText(summaryFile, "utf8") : "",
      };
    }

    const prop = (value: string | null) =>
      JSON.stringify([{ property_name: "webpresso-governance", value }, { property_name: "other", value: "x" }]);

    it("passes full and guarded through", () => {
      expect(runTier(prop("full"))).toMatchObject({ status: 0, output: "level=full\n" });
      expect(runTier(prop("guarded"))).toMatchObject({ status: 0, output: "level=guarded\n" });
    });

    it("succeeds on off with a stated reason and runs no gate", () => {
      const result = runTier(prop("off"));
      expect(result.status).toBe(0);
      expect(result.output).toBe("level=off\n");
      expect(result.summary).toInclude("not governed");
    });

    it("fails closed on a missing property, an unset value, an unknown value and self", () => {
      for (const properties of ["[]", prop(null), prop("strict"), prop("self"), prop("")]) {
        const result = runTier(properties);
        expect(result.status, properties).toBe(1);
        expect(result.log, properties).toInclude("webpresso-governance");
        expect(result.output, properties).toBe("");
      }
    });
  });
});

describe("auto-merge-sweeper.yml", () => {
  const workflow = loadYaml(WORKFLOW_AUTO_MERGE_SWEEPER);

  it("runs on a 10 minute schedule and workflow_dispatch, never pull_request", () => {
    const on = onSection(workflow);
    expect(Object.keys(on).sort()).toStrictEqual(["schedule", "workflow_dispatch"]);
    expect(dig(on, "schedule")).toStrictEqual([{ cron: "*/10 * * * *" }]);
    expect(dig(on, "workflow_dispatch", "inputs", "repository", "required")).toBe(true);
  });

  it("is off unless the org switch is on, except for dispatch, and stays in this repository", () => {
    const condition = digString(workflow, "jobs", "sweep", "if") ?? "";
    expect(condition).toInclude("vars.WP_AUTO_MERGE_SWEEP == 'on'");
    expect(condition).not.toInclude("!=");
    expect(condition).toInclude("github.event_name == 'workflow_dispatch'");
    expect(condition).toInclude("github.repository == 'webpresso/github-actions'");
  });

  it("runs only from the default branch, so a dispatched branch copy never gets the credentials", () => {
    const condition = digString(workflow, "jobs", "sweep", "if") ?? "";
    expect(condition).toInclude("github.ref == 'refs/heads/main'");
  });

  it("pins every action by full SHA and never checks out PR code", () => {
    for (const uses of allUses(workflow)) {
      expect(uses).toMatch(FULL_SHA_USES);
    }
    const checkouts = allSteps(workflow).filter((step) => String(step["uses"]).startsWith("actions/checkout@"));
    expect(checkouts).toHaveLength(1);
    expect(dig(checkouts[0], "with", "ref")).toBeUndefined();
    expect(dig(checkouts[0], "with", "persist-credentials")).toBe(false);
    expect(readRepoFile(WORKFLOW_AUTO_MERGE_SWEEPER)).not.toInclude("refs/pull/");
  });

  it("mints the Internal App token from Doppler, as pr-auto-update-queue does", () => {
    const uses = allUses(workflow);
    expect(uses).toContain("dopplerhq/secrets-fetch-action@451892f16195f9ac360e1a5bcbf0b5fd0e957534");
    expect(uses).toContain("actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1");
    expect(digString(stepNamed(WORKFLOW_AUTO_MERGE_SWEEPER, "Fetch Webpresso Internal App credentials from Doppler"), "with", "inject-env-vars")).toBeUndefined();
  });
});

describe("auto-merge sweeper script", () => {
  const repository = { fullName: "webpresso/r", defaultBranch: "main" };
  const basePr = {
    id: "x",
    isDraft: false,
    baseRefName: "main",
    author: "alice",
    headRepository: "webpresso/r",
    labels: [] as string[],
    autoMergeEnabled: false,
  };
  const pr = (number: number, overrides: Record<string, unknown> = {}) => ({
    ...basePr,
    number,
    createdAt: `2026-10-${String(number).padStart(2, "0")}T00:00:00Z`,
    ...overrides,
  });
  const writer = async () => ({ permission: "write", role_name: "write" });

  it("reads effective permission from role_name, falling back to permission", () => {
    expect(canArm({ permission: "admin", role_name: "admin" })).toBe(true);
    expect(canArm({ permission: "write", role_name: "maintain" })).toBe(true);
    expect(canArm({ permission: "write", role_name: "write" })).toBe(true);
    expect(canArm({ permission: "read", role_name: "triage" })).toBe(false);
    expect(canArm({ permission: "write", role_name: "custom-role" })).toBe(false);
    expect(canArm({ permission: "write" })).toBe(true);
    expect(canArm({ permission: "none" })).toBe(false);
    expect(canArm(null)).toBe(false);
    expect(canArm("write")).toBe(false);
  });

  it("arms at most three, oldest first", async () => {
    const plan = await planRepository(repository, [pr(5), pr(2), pr(9), pr(1), pr(7)], writer);
    expect(MAX_ARMED_PER_REPO).toBe(3);
    expect(plan.arm.map((entry: { number: number }) => entry.number)).toStrictEqual([1, 2, 5]);
  });

  it("skips drafts, other bases, forks, opt-outs, armed PRs and non-writers", async () => {
    const plan = await planRepository(
      repository,
      [
        pr(1, { isDraft: true }),
        pr(2, { baseRefName: "next" }),
        pr(3, { headRepository: "fork/r" }),
        pr(4, { headRepository: null }),
        pr(5, { labels: ["webpresso:no-automerge"] }),
        pr(6, { autoMergeEnabled: true }),
        pr(7, { author: "reader" }),
        pr(8),
      ],
      async (login: string) => (login === "reader" ? { permission: "read", role_name: "read" } : writer()),
    );
    expect(plan.arm.map((entry: { number: number }) => entry.number)).toStrictEqual([8]);
    expect(plan.skipped).toHaveLength(7);
  });

  it("does not arm when the permission cannot be read", async () => {
    const plan = await planRepository(repository, [pr(1)], async () => {
      throw new Error("403");
    });
    expect(plan.arm).toStrictEqual([]);
    expect(plan.skipped[0].reason).toInclude("unreadable");
  });

  it("does not count already-armed PRs toward the per-sweep cap", async () => {
    const armed = (number: number) => pr(number, { autoMergeEnabled: true });
    const plan = await planRepository(
      repository,
      [armed(1), armed(2), armed(3), pr(4), pr(5), pr(6), pr(7)],
      writer,
    );
    expect(plan.arm.map((entry: { number: number }) => entry.number)).toStrictEqual([4, 5, 6]);
    expect(plan.reserve.map((entry: { number: number }) => entry.number)).toStrictEqual([7]);
  });

  it("does not arm a PR whose labels were truncated unless the opt-out is seen", async () => {
    const plan = await planRepository(
      repository,
      [pr(1, { labelsTruncated: true }), pr(2, { labelsTruncated: true, labels: ["webpresso:no-automerge"] }), pr(3)],
      writer,
    );
    expect(plan.arm.map((entry: { number: number }) => entry.number)).toStrictEqual([3]);
    expect(plan.skipped).toStrictEqual([
      { number: 1, reason: "labels truncated" },
      { number: 2, reason: "labelled webpresso:no-automerge" },
    ]);
  });

  it("reports the real skip reason even past the cap", async () => {
    const plan = await planRepository(
      repository,
      [pr(1), pr(2), pr(3), pr(4, { isDraft: true }), pr(5)],
      writer,
    );
    expect(plan.skipped).toStrictEqual([{ number: 4, reason: "draft" }]);
    expect(plan.reserve.map((entry: { number: number }) => entry.number)).toStrictEqual([5]);
  });

  it("dispatch selects one repository and ignores the org switch; schedule needs it on", () => {
    const repositories = [{ fullName: "webpresso/a" }, { fullName: "webpresso/b" }];
    expect(selectRepositories(repositories, { repository: "webpresso/B", switchValue: "off" })).toStrictEqual([repositories[1]]);
    expect(selectRepositories(repositories, { repository: "webpresso/B", switchValue: undefined })).toStrictEqual([repositories[1]]);
    expect(selectRepositories(repositories, { repository: undefined, switchValue: "off" })).toStrictEqual([]);
    for (const switchValue of [undefined, "", "Off", "ON", "true"]) {
      expect(selectRepositories(repositories, { repository: "", switchValue }), String(switchValue)).toStrictEqual([]);
    }
    expect(selectRepositories(repositories, { repository: "", switchValue: "on" })).toStrictEqual(repositories);
  });

  it("sweeps only full and guarded repositories from the fixture", async () => {
    const lines: string[] = [];
    const fixture = JSON.parse(readText(FIXTURE, "utf8"));
    const result = await sweep({
      source: fixtureSource(fixture),
      owner: "webpresso",
      repository: undefined,
      switchValue: "on",
      dryRun: true,
      log: (line: string) => lines.push(line),
    });
    // sandbox: #1, #6, #9 (limit 3); guarded-repo: #2 (#1 is already armed).
    expect(result).toStrictEqual({ armed: 4, errors: 0 });
    const text = lines.join("\n");
    expect(text).toInclude("webpresso/sandbox#1: would arm");
    expect(text).toInclude("webpresso/sandbox#6: would arm");
    expect(text).toInclude("webpresso/sandbox#9: would arm");
    expect(text).toInclude("webpresso/guarded-repo#2: would arm");
    expect(text).toInclude("webpresso/sandbox#10: not armed, author triager lacks write access");
    expect(text).toInclude("webpresso/sandbox#11: not armed, per-repository limit reached");
    expect(text).toInclude("webpresso/notes: skipped");
    expect(text).toInclude("webpresso/app: skipped");
    expect(text).not.toInclude("webpresso/notes#");
    expect(text).not.toInclude("webpresso/app#");
  });

  it("arms nothing on a scheduled run unless the switch is on, but a dispatch still arms", async () => {
    const fixture = JSON.parse(readText(FIXTURE, "utf8"));
    const common = { source: fixtureSource(fixture), owner: "webpresso", switchValue: "off", dryRun: true, log: () => {} };
    expect(await sweep({ ...common, repository: undefined })).toStrictEqual({ armed: 0, errors: 0 });
    for (const switchValue of [undefined, "", "Off"]) {
      expect(await sweep({ ...common, switchValue, repository: undefined })).toStrictEqual({ armed: 0, errors: 0 });
    }
    expect(await sweep({ ...common, repository: "webpresso/guarded-repo" })).toStrictEqual({ armed: 1, errors: 0 });
    expect(await sweep({ ...common, repository: "webpresso/notes" })).toStrictEqual({ armed: 0, errors: 0 });
  });

  it("rejects a malformed or foreign dispatch repository before any request", async () => {
    const calls: string[] = [];
    const source = {
      repositoryLevel: async (name: string) => {
        calls.push(name);
        return "full";
      },
    };
    const lines: string[] = [];
    for (const repository of ["webpresso/x/../..", "webpresso/x?y=1", "webpresso", "other/repo", "webpresso/a/b"]) {
      const result = await sweep({ source, owner: "webpresso", repository, switchValue: undefined, dryRun: true, log: (line: string) => lines.push(line) });
      expect(result, repository).toStrictEqual({ armed: 0, errors: 1 });
    }
    expect(calls).toStrictEqual([]);
    expect(lines[0]).toInclude("::error::");
  });

  it("reports a dispatch whose property lookup fails as an error, not a crash", async () => {
    const lines: string[] = [];
    const source = {
      repositoryLevel: async () => {
        throw new Error("GET returned 404");
      },
    };
    const result = await sweep({ source, owner: "webpresso", repository: "Webpresso/missing", switchValue: undefined, dryRun: false, log: (line: string) => lines.push(line) });
    expect(result).toStrictEqual({ armed: 0, errors: 1 });
    expect(lines.join("\n")).toInclude("::error::Webpresso/missing");
  });

  it("treats expected arm refusals as skips that do not use up a slot", async () => {
    expect(isExpectedArmRefusal("Pull request is in clean status")).toBe(true);
    expect(isExpectedArmRefusal("Auto merge is not allowed for this repository")).toBe(true);
    expect(isExpectedArmRefusal("Pull request has merge conflicts")).toBe(true);
    expect(isExpectedArmRefusal("Bad credentials")).toBe(false);
    const armedIds: string[] = [];
    const lines: string[] = [];
    const prs = [1, 2, 3, 4, 5, 6].map((n) => pr(n, { id: `PR_${n}` }));
    const source = {
      repositoryLevel: async () => "full",
      listPullRequests: async () => ({ defaultBranch: "main", pullRequests: prs, truncated: false }),
      getPermission: writer,
      arm: async ({ id }: { id: string }) => {
        if (id === "PR_1") throw new Error("Pull request is in clean status");
        if (id === "PR_2") throw new Error("Auto merge is not allowed for this repository");
        armedIds.push(id);
      },
    };
    const result = await sweep({ source, owner: "webpresso", repository: "webpresso/r", switchValue: undefined, dryRun: false, log: (line: string) => lines.push(line) });
    expect(result).toStrictEqual({ armed: 3, errors: 0 });
    expect(armedIds).toStrictEqual(["PR_3", "PR_4", "PR_5"]);
    expect(lines.join("\n")).toInclude("webpresso/r#6: not armed, per-repository limit reached");
    expect(lines.join("\n")).toInclude("::notice::webpresso/r#1: checks already passed");
    expect(lines.join("\n")).not.toInclude("::notice::webpresso/r#2");
  });

  it("counts an unexpected arm failure as an error and still fills the slots", async () => {
    const prs = [1, 2, 3, 4].map((n) => pr(n, { id: `PR_${n}` }));
    const source = {
      repositoryLevel: async () => "full",
      listPullRequests: async () => ({ defaultBranch: "main", pullRequests: prs }),
      getPermission: writer,
      arm: async ({ id }: { id: string }) => {
        if (id === "PR_1") throw new Error("Bad credentials");
      },
    };
    const result = await sweep({ source, owner: "webpresso", repository: "webpresso/r", switchValue: undefined, dryRun: false, log: () => {} });
    expect(result).toStrictEqual({ armed: 3, errors: 1 });
  });

  it("warns when the open pull request list was truncated", async () => {
    const lines: string[] = [];
    const source = {
      repositoryLevel: async () => "full",
      listPullRequests: async () => ({ defaultBranch: "main", pullRequests: [], truncated: true }),
    };
    await sweep({ source, owner: "webpresso", repository: "webpresso/r", switchValue: undefined, dryRun: true, log: (line: string) => lines.push(line) });
    expect(lines.join("\n")).toInclude("::warning::webpresso/r");
  });

  it("retries rate limits and server errors, but not a plain 403", async () => {
    const statuses = [502, 429, 200];
    let calls = 0;
    const sleeps: number[] = [];
    const source = liveSource({
      token: "t",
      apiUrl: "https://api.example",
      graphqlUrl: "https://api.example/graphql",
      sleep: async (ms: number) => void sleeps.push(ms),
      fetchImpl: async () => {
        const status = statuses[calls++] ?? 200;
        return { ok: status === 200, status, json: async () => [], headers: { get: () => null } };
      },
    });
    await source.repositoryLevel("webpresso/r");
    expect(calls).toBe(3);
    expect(sleeps).toHaveLength(2);

    let forbidden = 0;
    const refused = liveSource({
      token: "t",
      apiUrl: "https://api.example",
      graphqlUrl: "https://api.example/graphql",
      sleep: async () => {},
      fetchImpl: async () => {
        forbidden += 1;
        return { ok: false, status: 403, json: async () => ({}), headers: { get: () => null } };
      },
    });
    await expect(refused.repositoryLevel("webpresso/r")).rejects.toThrow("403");
    expect(forbidden).toBe(1);
  });

  it("dry runs from the command line against the fixture with no token", () => {
    const result = spawnSync("node", [SCRIPT], {
      encoding: "utf8",
      env: { PATH: process.env["PATH"], SWEEP_FIXTURE: FIXTURE, SWEEP_OWNER: "webpresso", SWEEP_SWITCH: "on" },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toInclude("Would arm 4 pull request(s), 0 error(s).");
  });

  it("fails without a token when not given a fixture", () => {
    const result = spawnSync("node", [SCRIPT], { encoding: "utf8", env: { PATH: process.env["PATH"] } });
    expect(result.status).toBe(1);
  });

  it("arms through the live source with a squash mutation and records failures", async () => {
    const calls: Array<{ url: string; body?: string }> = [];
    const source = liveSource({
      token: "t",
      apiUrl: "https://api.example",
      graphqlUrl: "https://api.example/graphql",
      fetchImpl: async (url: string, init: { body?: string }) => {
        calls.push({ url, body: init.body });
        return { ok: true, status: 200, json: async () => ({ data: {} }) };
      },
    });
    await source.arm({ id: "PR_1" });
    expect(calls[0]?.body).toInclude("enablePullRequestAutoMerge");
    expect(calls[0]?.body).toInclude("mergeMethod: SQUASH");
    expect(JSON.parse(calls[0]?.body ?? "{}").variables).toStrictEqual({ id: "PR_1" });
  });
});
