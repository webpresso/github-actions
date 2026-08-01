/**
 * Shared contract-test helpers.
 *
 * This repository ships reusable workflows and composite actions; the contract
 * suites treat that YAML as data. Everything the suites need to read a
 * workflow, walk its steps, extract an embedded heredoc script, or build a git
 * fixture repository lives here — one implementation, so the extraction and
 * pin rules cannot silently diverge between suites the way the previous
 * Ruby + node:test pair did.
 *
 * YAML is parsed with `Bun.YAML.parse` (built in — the suites need zero npm
 * dependencies and no `package.json`). Embedded workflow scripts are executed
 * with `node`, never with `bun`, because `node` is what the GitHub Actions
 * runner actually invokes.
 */

import { Glob } from "bun";
import { execFileSync, spawnSync, type SpawnSyncReturns } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** The runtime that GitHub Actions uses for embedded workflow scripts. */
export const NODE_BIN = "node";

export const REPO_ROOT = join(import.meta.dir, "..");
export const WORKFLOWS_DIR = join(REPO_ROOT, ".github", "workflows");
export const ACTIONS_DIR = join(REPO_ROOT, ".github", "actions");

export const WORKFLOW_PREVIEW = join(WORKFLOWS_DIR, "cloudflare-preview.yml");
export const WORKFLOW_PRODUCTION = join(WORKFLOWS_DIR, "cloudflare-production.yml");
export const WORKFLOW_RELEASE = join(WORKFLOWS_DIR, "changesets-release.yml");
export const WORKFLOW_SECURITY = join(WORKFLOWS_DIR, "webpresso-security.yml");
export const WORKFLOW_WEBPRESSO_FRESHNESS = join(WORKFLOWS_DIR, "webpresso-freshness.yml");
export const WORKFLOW_SELF_TEST = join(WORKFLOWS_DIR, "self-test.yml");
export const ACTION_TOOLCHAIN = join(ACTIONS_DIR, "setup-webpresso-toolchain", "action.yml");
export const ACTION_SETUP_WP = join(ACTIONS_DIR, "setup-wp", "action.yml");
export const ACTION_WAIT_FOR_CHECKS = join(ACTIONS_DIR, "wait-for-checks", "action.yml");
export const README_PATH = join(REPO_ROOT, "README.md");

/**
 * The three caller-facing workflows that expose the optional `require_checks`
 * gate. Kept here so the gate contracts and any future consumer cannot drift
 * over which workflows are in the set.
 */
export const REQUIRE_CHECKS_WORKFLOWS: ReadonlyArray<readonly [string, string]> = [
  [WORKFLOW_PREVIEW, "preview"],
  [WORKFLOW_PRODUCTION, "production"],
  [WORKFLOW_RELEASE, "release"],
];

/**
 * The workflows that additionally expose `job_timeout_minutes`. The preview
 * workflow is deliberately absent: only these two had an unbounded job.
 */
export const JOB_TIMEOUT_WORKFLOWS: ReadonlyArray<readonly [string, string]> = [
  [WORKFLOW_PRODUCTION, "production"],
  [WORKFLOW_RELEASE, "release"],
];

/**
 * `webpresso/github-actions/.github/actions/wait-for-checks@<sha>` — the REMOTE
 * pinned form the reusable workflows must use. Derived from the workflows
 * rather than restated as a literal, so bumping the pin is a one-site edit and
 * the suite still proves every site agrees.
 */
export const WAIT_FOR_CHECKS_USES_RE = /\/wait-for-checks@/u;
export const REMOTE_WAIT_FOR_CHECKS_PREFIX = "webpresso/github-actions/.github/actions/wait-for-checks@";

/**
 * webpresso-freshness.yml is not a caller-consuming CI/deploy workflow: it is a
 * repo-maintenance automation (npm registry lookup + git + gh CLI) that keeps
 * other workflows' agent-kit pins fresh. It deliberately does not install
 * pnpm/Vite+/wp -- pulling in the shared toolchain for it would be pure scope
 * creep. Its own contract lives in `freshness.test.ts`.
 *
 * self-test.yml is this repository's own CI gate: it runs the contract suite
 * against the repo itself and is never called by a consumer. Installing the
 * shared toolchain for a Bun test run would be pure scope creep too. Its own
 * contract is `self-test.yml gates the contract suite`.
 */
export const NON_TOOLCHAIN_WORKFLOWS: readonly string[] = [
  WORKFLOW_WEBPRESSO_FRESHNESS,
  WORKFLOW_SELF_TEST,
];

/* -------------------------------------------------------------------------- */
/* YAML access                                                                 */
/* -------------------------------------------------------------------------- */

export type YamlNode =
  | string
  | number
  | boolean
  | null
  | readonly YamlNode[]
  | { readonly [key: string]: YamlNode };

export type YamlRecord = { readonly [key: string]: YamlNode };

export function readRepoFile(path: string): string {
  return readFileSync(path, "utf8");
}

export function loadYaml(path: string): YamlNode {
  const parsed: unknown = Bun.YAML.parse(readRepoFile(path));
  return parsed as YamlNode;
}

export function isRecordNode(node: YamlNode | undefined): node is YamlRecord {
  return typeof node === "object" && node !== null && !Array.isArray(node);
}

export function isArrayNode(node: YamlNode | undefined): node is readonly YamlNode[] {
  return Array.isArray(node);
}

export function asRecord(node: YamlNode | undefined, context: string): YamlRecord {
  if (!isRecordNode(node)) {
    throw new Error(`expected a YAML mapping at ${context}`);
  }
  return node;
}

export function asArray(node: YamlNode | undefined, context: string): readonly YamlNode[] {
  if (!isArrayNode(node)) {
    throw new Error(`expected a YAML sequence at ${context}`);
  }
  return node;
}

/** Ruby `Hash#dig` equivalent: returns `undefined` on any missing/non-mapping hop. */
export function dig(node: YamlNode | undefined, ...keys: readonly string[]): YamlNode | undefined {
  let current: YamlNode | undefined = node;
  for (const key of keys) {
    if (!isRecordNode(current)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

export function digString(node: YamlNode | undefined, ...keys: readonly string[]): string | undefined {
  const value = dig(node, ...keys);
  return typeof value === "string" ? value : undefined;
}

/** GitHub's `on:` key. Kept behind a helper so a YAML boolean-key quirk stays local. */
export function onSection(workflow: YamlNode): YamlRecord {
  const root = asRecord(workflow, "workflow root");
  return asRecord(root["on"] ?? root["true"], "on:");
}

export function workflowCallInputs(workflow: YamlNode): YamlRecord {
  return asRecord(dig(onSection(workflow), "workflow_call", "inputs"), "on.workflow_call.inputs");
}

export function workflowCallSecrets(workflow: YamlNode): YamlRecord {
  return asRecord(dig(onSection(workflow), "workflow_call", "secrets"), "on.workflow_call.secrets");
}

export function stepsOf(container: YamlNode | undefined): readonly YamlRecord[] {
  const steps = dig(container, "steps");
  if (!isArrayNode(steps)) {
    return [];
  }
  return steps.map((step, index) => asRecord(step, `steps[${index}]`));
}

export function allSteps(workflow: YamlNode): readonly YamlRecord[] {
  const jobs = asRecord(dig(workflow, "jobs"), "jobs");
  return Object.values(jobs).flatMap((job) => stepsOf(job));
}

/**
 * Every `steps:` entry anywhere in a document. Unlike `allSteps` this also
 * reaches a composite action's `runs.steps`, so repo-wide pin sweeps can cover
 * workflows and actions with one collector.
 */
export function allStepsAnywhere(node: YamlNode | undefined): readonly YamlRecord[] {
  if (isArrayNode(node)) {
    return node.flatMap((value) => allStepsAnywhere(value));
  }
  if (isRecordNode(node)) {
    return Object.entries(node).flatMap(([key, value]) =>
      key === "steps" && isArrayNode(value) ? value.filter(isRecordNode) : allStepsAnywhere(value),
    );
  }
  return [];
}

export function extractUses(steps: readonly YamlRecord[]): readonly string[] {
  return steps.map((step) => step["uses"]).filter((value): value is string => typeof value === "string");
}

/** Every `uses:` value anywhere in a workflow or composite action document. */
export function allUses(node: YamlNode | undefined): readonly string[] {
  if (isArrayNode(node)) {
    return node.flatMap((value) => allUses(value));
  }
  if (isRecordNode(node)) {
    return Object.entries(node).flatMap(([key, value]) =>
      key === "uses" && typeof value === "string" ? [value] : allUses(value),
    );
  }
  return [];
}

export function findStepById(workflow: YamlNode, id: string): YamlRecord | undefined {
  return allSteps(workflow).find((step) => step["id"] === id);
}

/* -------------------------------------------------------------------------- */
/* File discovery                                                              */
/* -------------------------------------------------------------------------- */

function scanSorted(root: string, pattern: string): readonly string[] {
  return [...new Glob(pattern).scanSync(root)].map((relative) => join(root, relative)).sort();
}

export function workflowPaths(): readonly string[] {
  return scanSorted(WORKFLOWS_DIR, "*.yml");
}

export function workflowAndActionPaths(): readonly string[] {
  return [...scanSorted(WORKFLOWS_DIR, "**/*.yml"), ...scanSorted(ACTIONS_DIR, "**/*.yml")].sort();
}

/* -------------------------------------------------------------------------- */
/* Pin shapes and canonical values                                             */
/* -------------------------------------------------------------------------- */

export const FULL_SHA_USES_RE = /@[0-9a-f]{40}$/u;
export const EXACT_SEMVER_RE = /^\d+\.\d+\.\d+$/u;

const TOOLCHAIN_USES_RE = /\/setup-webpresso-toolchain@/u;
const SETUP_WP_USES_RE = /\/setup-wp@/u;

/**
 * The pins live at many irreducible YAML sites. Asserting a literal here would
 * make the test file one more site that every freshness bump has to edit, so
 * the expected value is derived from a single canonical workflow at runtime and
 * the suites assert cross-site consistency plus value shape instead.
 *
 * The anchor was `webpresso-ci.yml` until that workflow was removed for having
 * zero consumers across the org. Any workflow carrying exactly one toolchain
 * pin, one setup-wp pin, and one agent-kit version works; the production deploy
 * workflow is the most load-bearing survivor, so it is the anchor now.
 */
export const CANONICAL_PIN_WORKFLOW = WORKFLOW_PRODUCTION;

function soleMatch(values: readonly string[], pattern: RegExp, label: string): string {
  const unique = [...new Set(values.filter((value) => pattern.test(value)))];
  if (unique.length !== 1) {
    throw new Error(`expected exactly one distinct ${label} in ${CANONICAL_PIN_WORKFLOW}, got ${unique.length}`);
  }
  return unique[0] as string;
}

const canonicalWorkflow = loadYaml(CANONICAL_PIN_WORKFLOW);
const canonicalUses = allUses(canonicalWorkflow);

/** `webpresso/github-actions/.github/actions/setup-webpresso-toolchain@<sha>` */
export const SETUP_TOOLCHAIN_USES: string = soleMatch(canonicalUses, TOOLCHAIN_USES_RE, "toolchain pin");

/** `webpresso/github-actions/.github/actions/setup-wp@<sha>` */
export const SETUP_WP_USES: string = soleMatch(canonicalUses, SETUP_WP_USES_RE, "setup-wp pin");

/** The exact `@webpresso/agent-kit` semver every `setup-wp` step installs. */
export const SETUP_WP_VERSION: string = (() => {
  const versions = allSteps(canonicalWorkflow)
    .filter((step) => step["uses"] === SETUP_WP_USES)
    .map((step) => digString(step, "with", "version"))
    .filter((value): value is string => typeof value === "string");
  const unique = [...new Set(versions)];
  if (unique.length !== 1) {
    throw new Error(`expected exactly one distinct setup-wp version in ${CANONICAL_PIN_WORKFLOW}, got ${unique.length}`);
  }
  return unique[0] as string;
})();

export function isToolchainUses(value: string): boolean {
  return TOOLCHAIN_USES_RE.test(value);
}

export function isSetupWpUses(value: string): boolean {
  return SETUP_WP_USES_RE.test(value);
}

/* -------------------------------------------------------------------------- */
/* Embedded heredoc scripts                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One source of truth for heredoc boundaries, used by both the extractor and
 * the stripper so they can never disagree.
 *
 * This is the Ruby suite's pattern, deliberately: it also matches
 * `cat > "${FILE}" <<'NODE'` openers, which the old node:test regex
 * (`/node <<'NODE'\n.../`) missed entirely. Group 1 is the opener line, group 2
 * the script body.
 */
const HEREDOC_PATTERN = String.raw`((?:node[^\n]*|cat >[^\n]*) <<'NODE'[^\n]*)\n([\s\S]*?)^\s*NODE$`;

export type EmbeddedHeredoc = {
  /** The opener line, e.g. `node <<'NODE'` or `cat > "${HELPER}" <<'NODE'`. */
  readonly opener: string;
  /** The script body between the delimiters. */
  readonly body: string;
};

export function extractHeredocs(text: string): readonly EmbeddedHeredoc[] {
  const matches = [...text.matchAll(new RegExp(HEREDOC_PATTERN, "gmu"))];
  return matches.map((match) => ({ opener: match[1] ?? "", body: match[2] ?? "" }));
}

/**
 * Strip every embedded NODE heredoc (delimiters + body) so YAML-only analysis
 * cannot be confused by JS source that mentions the string `uses:`.
 * Must be global: replacing only the first body would leave later heredocs in
 * place and could miss real YAML `uses:` lines that follow them.
 */
export function stripHeredocs(text: string): string {
  return text.replace(new RegExp(HEREDOC_PATTERN, "gmu"), "");
}

export const YAML_USES_LINE_RE = /^\s*-\s*uses:\s*(\S+)/gmu;

/* -------------------------------------------------------------------------- */
/* Executing extracted scripts                                                 */
/* -------------------------------------------------------------------------- */

export function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** `node --check` on an extracted script body. Returns the spawn result. */
export function nodeSyntaxCheck(source: string): SpawnSyncReturns<string> {
  const dir = makeTempDir("workflow-script-syntax-");
  const scriptPath = join(dir, "script.cjs");
  writeFileSync(scriptPath, source);
  return spawnSync(NODE_BIN, ["--check", scriptPath], { encoding: "utf8" });
}

export function writeFixtureFile(dir: string, relPath: string, contents: string): void {
  const filePath = join(dir, relPath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}

/** Build a real committed git repository so `git ls-files` based scans see it. */
export function initFixtureRepo(files: Readonly<Record<string, string>>): string {
  const dir = makeTempDir("webpresso-freshness-fixture-");
  for (const [relPath, contents] of Object.entries(files)) {
    writeFixtureFile(dir, relPath, contents);
  }
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  return dir;
}

export type ScanScriptRun = {
  readonly result: SpawnSyncReturns<string>;
  readonly githubOutput: string;
  readonly prBodyFile: string;
};

/** Run an extracted scan script under `node` against a fixture repository. */
export function runScanScript(options: {
  readonly latest: string;
  readonly cwd: string;
  readonly scriptSource: string;
}): ScanScriptRun {
  const scriptPath = join(options.cwd, "__scan.cjs");
  writeFileSync(scriptPath, options.scriptSource);
  const githubOutput = join(options.cwd, "__github_output.txt");
  const prBodyFile = join(options.cwd, "__pr_body.md");
  writeFileSync(githubOutput, "");

  const result = spawnSync(NODE_BIN, [scriptPath], {
    cwd: options.cwd,
    env: {
      ...process.env,
      LATEST_VERSION: options.latest,
      GITHUB_OUTPUT: githubOutput,
      PR_BODY_FILE: prBodyFile,
    },
    encoding: "utf8",
  });

  return { result, githubOutput, prBodyFile };
}
