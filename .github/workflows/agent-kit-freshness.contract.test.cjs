const assert = require("node:assert/strict");
const { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } = require("node:fs");
const { execFileSync, spawnSync } = require("node:child_process");
const { join, dirname } = require("node:path");
const { tmpdir } = require("node:os");
const { test } = require("node:test");

const WORKFLOW_PATH = join(__dirname, "agent-kit-freshness.yml");
const workflow = readFileSync(WORKFLOW_PATH, "utf8");

/** Matches every `node <<'NODE' … NODE` embedded script body (interior only). */
const EMBEDDED_NODE_HEREDOC_RE = /node <<'NODE'\n([\s\S]*?)^\s*NODE$/gmu;

/**
 * Strip every embedded NODE heredoc (delimiters + body) so YAML-only analysis
 * cannot be confused by JS source that mentions the string `uses:`.
 * Must be global: replacing only the first body would leave later heredocs in
 * place and could miss real YAML `uses:` lines that follow them.
 */
function stripEmbeddedNodeHeredocs(text) {
  return text.replace(/node <<'NODE'\n[\s\S]*?^\s*NODE$/gmu, "");
}

function extractEmbeddedScripts(text = workflow) {
  const scripts = [];
  for (const match of text.matchAll(EMBEDDED_NODE_HEREDOC_RE)) {
    scripts.push(match[1]);
  }
  assert.ok(scripts.length > 0, "expected at least one embedded NODE heredoc in agent-kit-freshness.yml");
  return scripts;
}

function extractEmbeddedScript(text = workflow) {
  // The scan/bump script is the first NODE heredoc in the workflow.
  return extractEmbeddedScripts(text)[0];
}

function writeFixtureFile(dir, relPath, contents) {
  const filePath = join(dir, relPath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}

function initFixtureRepo(files) {
  const dir = mkdtempSync(join(tmpdir(), "agent-kit-freshness-fixture-"));
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

function runScanScript({ latest, cwd, scriptSource = extractEmbeddedScript() }) {
  const scriptPath = join(cwd, "__scan.cjs");
  writeFileSync(scriptPath, scriptSource);
  const githubOutput = join(cwd, "__github_output.txt");
  const prBodyFile = join(cwd, "__pr_body.md");
  writeFileSync(githubOutput, "");

  const result = spawnSync(process.execPath, [scriptPath], {
    cwd,
    env: {
      ...process.env,
      LATEST_VERSION: latest,
      GITHUB_OUTPUT: githubOutput,
      PR_BODY_FILE: prBodyFile,
    },
    encoding: "utf8",
  });

  return { result, githubOutput, prBodyFile };
}

test("agent-kit-freshness.yml declares workflow_call and workflow_dispatch triggers with least-privilege permissions", () => {
  assert.match(workflow, /on:\n\s+workflow_call: \{\}\n\s+workflow_dispatch: \{\}/u);
  assert.match(workflow, /permissions:\n\s+contents: write\n\s+pull-requests: write/u);
});

test("agent-kit-freshness.yml uses a fixed idempotent branch name and refreshes title+body when editing an existing open PR", () => {
  assert.match(workflow, /BRANCH: chore\/bump-agent-kit-version/u);
  assert.match(workflow, /gh pr list --head "\$\{BRANCH\}" --state open/u);
  // Idempotent re-runs must refresh both title and body so a stale version
  // number cannot linger on an existing open PR (Opus nit).
  assert.match(
    workflow,
    /gh pr edit "\$\{existing\}" --title "\$\{title\}" --body-file "\$\{PR_BODY_FILE\}"/u,
  );
  assert.match(workflow, /gh pr create --title/u);
});

test("agent-kit-freshness.yml only relies on the caller's GITHUB_TOKEN, never a PAT or app token", () => {
  assert.match(workflow, /GITHUB_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/u);
  assert.match(workflow, /GH_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/u);
  assert.doesNotMatch(workflow, /secrets\.[A-Z0-9_]*(PAT|APP)[A-Z0-9_]*/u);
});

test("agent-kit-freshness.yml pins every third-party action reference by full commit SHA", () => {
  // Scan only the real YAML step lines, not embedded scan-script source.
  const yamlOnly = stripEmbeddedNodeHeredocs(workflow);
  let sawUses = false;
  for (const m of yamlOnly.matchAll(/^\s*-\s*uses:\s*(\S+)/gmu)) {
    const value = m[1];
    if (value.startsWith("./")) continue;
    sawUses = true;
    assert.match(value, /@[0-9a-f]{40}$/u, `expected full SHA pin for ${value}`);
  }
  assert.ok(sawUses, "expected at least one pinned third-party action reference");
});

test("stripEmbeddedNodeHeredocs removes every NODE heredoc so later real uses: lines stay scannable", () => {
  // Synthetic multi-heredoc document: first body contains a JS `uses:` regex
  // (must not count as a step), a real pinned step sits between heredocs, and a
  // second heredoc follows. First-only strip would leave the second body and
  // could confuse analysis; full strip must preserve the real step.
  const synthetic = [
    "jobs:",
    "  x:",
    "    steps:",
    "      - run: |",
    "          node <<'NODE'",
    "          const re = /uses:\\s*\\S+/u;",
    "          NODE",
    "      - uses: actions/checkout@0123456789abcdef0123456789abcdef01234567",
    "      - run: |",
    "          node <<'NODE'",
    "          // second embedded script also mentions uses:",
    "          const again = 'uses: evil@v1';",
    "          NODE",
    "      - uses: actions/setup-node@fedcba9876543210fedcba9876543210fedcba98",
    "",
  ].join("\n");

  const yamlOnly = stripEmbeddedNodeHeredocs(synthetic);
  assert.doesNotMatch(yamlOnly, /node <<'NODE'/u);
  assert.doesNotMatch(yamlOnly, /const re = /u);
  assert.doesNotMatch(yamlOnly, /const again = /u);

  const pins = [...yamlOnly.matchAll(/^\s*-\s*uses:\s*(\S+)/gmu)].map((m) => m[1]);
  assert.deepEqual(pins, [
    "actions/checkout@0123456789abcdef0123456789abcdef01234567",
    "actions/setup-node@fedcba9876543210fedcba9876543210fedcba98",
  ]);
});

test("embedded scan script has valid syntax", () => {
  const script = extractEmbeddedScript();
  const tmp = mkdtempSync(join(tmpdir(), "agent-kit-freshness-syntax-"));
  const scriptPath = join(tmp, "scan.cjs");
  writeFileSync(scriptPath, script);
  const result = spawnSync(process.execPath, ["--check", scriptPath]);
  assert.equal(result.status, 0, result.stderr.toString());
  rmSync(tmp, { recursive: true, force: true });
});

test("scan script matches all four documented pin shapes and bumps them to latest, leaving unrelated version: keys untouched", () => {
  const dir = initFixtureRepo({
    // Shape 1 (env assignment) + shape 2 (shell default) + shape 3 (setup-wp).
    ".github/workflows/ci.yml": [
      "name: ci",
      "on: [push]",
      "jobs:",
      "  build:",
      "    steps:",
      '      - run: echo "AGENT_KIT_VERSION=2.4.1" >> "$GITHUB_ENV"',
      "      - run: |",
      '          WP_SETUP_AGENT_KIT_VERSION="${WP_SETUP_AGENT_KIT_VERSION:-3.1.17}"',
      "      - uses: pnpm/action-setup@abc",
      "        with:",
      "          version: ${{ steps.pnpm.outputs.version }}",
      "      - uses: webpresso/github-actions/.github/actions/setup-wp@c2c71a7a4be446fc6858e6b57bf55a11ccfa2d88",
      "        with:",
      '          version: "3.1.17"',
      "      - uses: some/other-action@def",
      "        with:",
      "          release_version: 3.1.17",
      "",
    ].join("\n"),
    // Shape 4 (composite input default).
    ".github/actions/setup-ci-workspace/action.yml": [
      "name: setup-ci-workspace",
      "inputs:",
      "  agent-kit-version:",
      '    description: "pinned agent-kit version"',
      '    default: "3.1.28"',
      "runs:",
      "  using: composite",
      "  steps:",
      "    - run: echo hi",
      "",
    ].join("\n"),
  });

  const { result, githubOutput, prBodyFile } = runScanScript({ latest: "3.1.30", cwd: dir });
  assert.equal(result.status, 0, result.stderr);

  const output = readFileSync(githubOutput, "utf8");
  assert.match(output, /changed=true/u);
  assert.match(output, /pins_found=4/u);
  assert.match(output, /pins_bumped=4/u);

  const ci = readFileSync(join(dir, ".github/workflows/ci.yml"), "utf8");
  assert.match(ci, /AGENT_KIT_VERSION=3\.1\.30/u);
  assert.match(ci, /WP_SETUP_AGENT_KIT_VERSION:-3\.1\.30/u);
  assert.match(ci, /version: "3\.1\.30"/u);
  assert.match(ci, /version: \$\{\{ steps\.pnpm\.outputs\.version \}\}/u);
  assert.match(ci, /release_version: 3\.1\.17/u);

  const action = readFileSync(join(dir, ".github/actions/setup-ci-workspace/action.yml"), "utf8");
  assert.match(action, /default: "3\.1\.30"/u);

  const prBody = readFileSync(prBodyFile, "utf8");
  assert.match(prBody, /3\.1\.30/u);

  rmSync(dir, { recursive: true, force: true });
});

test("scan script bumps setup-wp with: version (shape 3) in isolation", () => {
  // Opus nit: shape 3 must have an explicit fixture like shapes 1/2/4.
  const dir = initFixtureRepo({
    ".github/workflows/ci.yml": [
      "name: ci",
      "on: [push]",
      "jobs:",
      "  build:",
      "    steps:",
      "      - uses: webpresso/github-actions/.github/actions/setup-wp@c2c71a7a4be446fc6858e6b57bf55a11ccfa2d88",
      "        with:",
      '          version: "3.1.17"',
      "",
    ].join("\n"),
  });

  const { result, githubOutput } = runScanScript({ latest: "3.1.30", cwd: dir });
  assert.equal(result.status, 0, result.stderr);
  const output = readFileSync(githubOutput, "utf8");
  assert.match(output, /pins_found=1/u);
  assert.match(output, /pins_bumped=1/u);
  assert.match(output, /changed=true/u);

  const ci = readFileSync(join(dir, ".github/workflows/ci.yml"), "utf8");
  assert.match(ci, /version: "3\.1\.30"/u);
  assert.doesNotMatch(ci, /version: "3\.1\.17"/u);

  rmSync(dir, { recursive: true, force: true });
});

test("scan script is idempotent: no-op and no PR body when every pin is already at latest", () => {
  const dir = initFixtureRepo({
    ".github/workflows/ci.yml": [
      "name: ci",
      "on: [push]",
      "jobs:",
      "  build:",
      "    steps:",
      "      - uses: webpresso/github-actions/.github/actions/setup-wp@c2c71a7a4be446fc6858e6b57bf55a11ccfa2d88",
      "        with:",
      '          version: "3.1.30"',
      "",
    ].join("\n"),
  });

  const { result, githubOutput } = runScanScript({ latest: "3.1.30", cwd: dir });
  assert.equal(result.status, 0, result.stderr);
  const output = readFileSync(githubOutput, "utf8");
  assert.match(output, /changed=false/u);
  assert.match(output, /pins_found=1/u);
  assert.match(output, /pins_bumped=0/u);

  rmSync(dir, { recursive: true, force: true });
});

test("scan script fails loudly (does not silently pass) when zero agent-kit pins are found", () => {
  const dir = initFixtureRepo({
    ".github/workflows/ci.yml": [
      "name: ci",
      "on: [push]",
      "jobs:",
      "  build:",
      "    steps:",
      "      - run: echo hi",
      "",
    ].join("\n"),
  });

  const { result } = runScanScript({ latest: "3.1.30", cwd: dir });
  assert.notEqual(result.status, 0, "expected the scan script to fail when it finds zero agent-kit pins");
  assert.match(result.stderr, /No @webpresso\/agent-kit version pins found/u);

  rmSync(dir, { recursive: true, force: true });
});
