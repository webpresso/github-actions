const assert = require("node:assert/strict");
const { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } = require("node:fs");
const { execFileSync, spawnSync } = require("node:child_process");
const { join, dirname } = require("node:path");
const { tmpdir } = require("node:os");
const { test } = require("node:test");

const WORKFLOW_PATH = join(__dirname, "agent-kit-freshness.yml");
const workflow = readFileSync(WORKFLOW_PATH, "utf8");

function extractEmbeddedScript() {
  const match = workflow.match(/node <<'NODE'\n([\s\S]*?)^\s*NODE$/mu);
  assert.ok(match, "expected an embedded NODE heredoc script in agent-kit-freshness.yml");
  return match[1];
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

function runScanScript({ latest, cwd }) {
  const script = extractEmbeddedScript();
  const scriptPath = join(cwd, "__scan.cjs");
  writeFileSync(scriptPath, script);
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

test("agent-kit-freshness.yml uses a fixed idempotent branch name and edits an existing open PR instead of duplicating it", () => {
  assert.match(workflow, /BRANCH: chore\/bump-agent-kit-version/u);
  assert.match(workflow, /gh pr list --head "\$\{BRANCH\}" --state open/u);
  assert.match(workflow, /gh pr edit "\$\{existing\}"/u);
  assert.match(workflow, /gh pr create --title/u);
});

test("agent-kit-freshness.yml only relies on the caller's GITHUB_TOKEN, never a PAT or app token", () => {
  assert.match(workflow, /GITHUB_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/u);
  assert.match(workflow, /GH_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/u);
  assert.doesNotMatch(workflow, /secrets\.[A-Z0-9_]*(PAT|APP)[A-Z0-9_]*/u);
});

test("agent-kit-freshness.yml pins every third-party action reference by full commit SHA", () => {
  // Scan only the real YAML step lines, not the embedded scan script (which
  // contains a JS regex literal referencing the string "uses:").
  const yamlOnly = workflow.replace(extractEmbeddedScript(), "");
  let sawUses = false;
  for (const m of yamlOnly.matchAll(/^\s*-\s*uses:\s*(\S+)/gmu)) {
    const value = m[1];
    if (value.startsWith("./")) continue;
    sawUses = true;
    assert.match(value, /@[0-9a-f]{40}$/u, `expected full SHA pin for ${value}`);
  }
  assert.ok(sawUses, "expected at least one pinned third-party action reference");
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
    // Shape 1 (env/shell assignment) + shape 2 (shell default), reproducing
    // edge-matte ci.yml:31 and ingest-lens ci.yml:87.
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
    // Shape 4 (composite input default), reproducing
    // monorepo .github/actions/setup-ci-workspace/action.yml:12.
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
  // Unrelated `version:`/`release_version:` keys must be left untouched.
  assert.match(ci, /version: \$\{\{ steps\.pnpm\.outputs\.version \}\}/u);
  assert.match(ci, /release_version: 3\.1\.17/u);

  const action = readFileSync(join(dir, ".github/actions/setup-ci-workspace/action.yml"), "utf8");
  assert.match(action, /default: "3\.1\.30"/u);

  const prBody = readFileSync(prBodyFile, "utf8");
  assert.match(prBody, /3\.1\.30/u);

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
