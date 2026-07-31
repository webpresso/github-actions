/**
 * Behavioral contracts for `webpresso-freshness.yml`: the embedded scan script
 * is extracted from its heredoc and executed under `node` against real git
 * fixture repositories, which is what the Actions runner does.
 *
 * Ported from the former `.github/workflows/agent-kit-freshness.contract.test.cjs`.
 */

import { describe, expect, it } from "bun:test";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  FULL_SHA_USES_RE,
  WORKFLOW_WEBPRESSO_FRESHNESS,
  YAML_USES_LINE_RE,
  extractHeredocs,
  initFixtureRepo,
  nodeSyntaxCheck,
  readRepoFile,
  runScanScript,
  stripHeredocs,
} from "./helpers.ts";

const workflow = readRepoFile(WORKFLOW_WEBPRESSO_FRESHNESS);

/** The scan/bump script is the first NODE heredoc in the workflow. */
function extractScanScript(): string {
  const scripts = extractHeredocs(workflow);
  expect(scripts.length, "expected at least one embedded NODE heredoc in webpresso-freshness.yml").toBeGreaterThan(0);
  return scripts[0]?.body ?? "";
}

function usesLinesIn(text: string): readonly string[] {
  return [...text.matchAll(new RegExp(YAML_USES_LINE_RE.source, "gmu"))]
    .map((match) => match[1])
    .filter((value): value is string => typeof value === "string");
}

function readOutput(path: string): string {
  return readFileSync(path, "utf8");
}

describe("webpresso-freshness.yml shape", () => {
  it("declares workflow_call and workflow_dispatch triggers with least-privilege permissions", () => {
    expect(workflow).toMatch(/on:\n\s+workflow_call: \{\}\n\s+workflow_dispatch: \{\}/u);
    expect(workflow).toMatch(/permissions:\n\s+contents: write\n\s+pull-requests: write/u);
  });

  it("uses a fixed idempotent branch name and refreshes title+body when editing an existing open PR", () => {
    expect(workflow).toMatch(/BRANCH: chore\/bump-agent-kit-version/u);
    expect(workflow).toMatch(/gh pr list --head "\$\{BRANCH\}" --state open/u);
    // Idempotent re-runs must refresh both title and body so a stale version
    // number cannot linger on an existing open PR.
    expect(workflow).toMatch(/gh pr edit "\$\{existing\}" --title "\$\{title\}" --body-file "\$\{PR_BODY_FILE\}"/u);
    expect(workflow).toMatch(/gh pr create --title/u);
  });

  it("only relies on the caller's GITHUB_TOKEN, never a PAT or app token", () => {
    expect(workflow).toMatch(/GITHUB_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/u);
    expect(workflow).toMatch(/GH_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/u);
    expect(workflow).not.toMatch(/secrets\.[A-Z0-9_]*(PAT|APP)[A-Z0-9_]*/u);
  });

  it("pins every third-party action reference by full commit SHA", () => {
    // Scan only the real YAML step lines, not embedded scan-script source.
    const pins = usesLinesIn(stripHeredocs(workflow)).filter((value) => !value.startsWith("./"));
    expect(pins.length, "expected at least one pinned third-party action reference").toBeGreaterThan(0);
    for (const value of pins) {
      expect(value, `expected full SHA pin for ${value}`).toMatch(FULL_SHA_USES_RE);
    }
  });
});

describe("heredoc stripping", () => {
  it("removes every NODE heredoc so later real uses: lines stay scannable", () => {
    // Synthetic multi-heredoc document: first body contains a JS `uses:` regex
    // (must not count as a step), a real pinned step sits between heredocs, and
    // a second heredoc follows. First-only strip would leave the second body and
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

    const yamlOnly = stripHeredocs(synthetic);
    expect(yamlOnly).not.toMatch(/node <<'NODE'/u);
    expect(yamlOnly).not.toMatch(/const re = /u);
    expect(yamlOnly).not.toMatch(/const again = /u);

    expect(usesLinesIn(yamlOnly)).toStrictEqual([
      "actions/checkout@0123456789abcdef0123456789abcdef01234567",
      "actions/setup-node@fedcba9876543210fedcba9876543210fedcba98",
    ]);
  });

  it("also removes `cat >` heredocs, which the previous node:test regex missed", () => {
    const synthetic = [
      "jobs:",
      "  x:",
      "    steps:",
      "      - run: |",
      '          cat > "${HELPER}" <<\'NODE\'',
      "          const sneaky = 'uses: evil@v1';",
      "          NODE",
      "      - uses: actions/checkout@0123456789abcdef0123456789abcdef01234567",
      "",
    ].join("\n");

    const yamlOnly = stripHeredocs(synthetic);
    expect(yamlOnly).not.toMatch(/const sneaky = /u);
    expect(usesLinesIn(yamlOnly)).toStrictEqual([
      "actions/checkout@0123456789abcdef0123456789abcdef01234567",
    ]);
  });
});

describe("embedded scan script behavior", () => {
  it("has valid syntax", () => {
    const result = nodeSyntaxCheck(extractScanScript());
    expect(result.status, result.stderr).toBe(0);
  });

  it("matches all three documented npm pin shapes and bumps them to latest, leaving setup-wp and unrelated version: keys untouched", () => {
    const dir = initFixtureRepo({
      // Shape 1 (env assignment) + shape 2 (shell default). The setup-wp step
      // below is deliberately present and must NOT be bumped: its version is on
      // the app-releases axis, not the npm axis this workflow resolves.
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
      // Shape 3 (composite input default).
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

    const { result, githubOutput, prBodyFile } = runScanScript({
      latest: "3.1.30",
      cwd: dir,
      scriptSource: extractScanScript(),
    });
    expect(result.status, result.stderr).toBe(0);

    const output = readOutput(githubOutput);
    expect(output).toMatch(/changed=true/u);
    expect(output).toMatch(/pins_found=3/u);
    expect(output).toMatch(/pins_bumped=3/u);

    const ci = readOutput(join(dir, ".github/workflows/ci.yml"));
    expect(ci).toMatch(/AGENT_KIT_VERSION=3\.1\.30/u);
    expect(ci).toMatch(/WP_SETUP_AGENT_KIT_VERSION:-3\.1\.30/u);
    // The setup-wp version is on the app-releases axis and must survive
    // untouched. Rewriting it to an npm-axis value produced a tag that does
    // not exist, so setup-wp 404s and every "freshened" consumer breaks.
    expect(ci).toMatch(/version: "3\.1\.17"/u);
    expect(ci).not.toMatch(/version: "3\.1\.30"/u);
    expect(ci).toMatch(/version: \$\{\{ steps\.pnpm\.outputs\.version \}\}/u);
    expect(ci).toMatch(/release_version: 3\.1\.17/u);

    const action = readOutput(join(dir, ".github/actions/setup-ci-workspace/action.yml"));
    expect(action).toMatch(/default: "3\.1\.30"/u);

    expect(readOutput(prBodyFile)).toMatch(/3\.1\.30/u);

    rmSync(dir, { recursive: true, force: true });
  });

  it("never rewrites a setup-wp with: version -- it is a different version axis", () => {
    // Regression guard. This workflow resolves LATEST from the npm package
    // @webpresso/agent-kit (3.x). The setup-wp action resolves its `version`
    // input against webpresso/app-releases (0.0.x). Bumping the latter with the
    // former writes a release tag that does not exist, so setup-wp fails the
    // download and breaks every consumer the bot touched.
    const dir = initFixtureRepo({
      ".github/workflows/ci.yml": [
        "name: ci",
        "on: [push]",
        "jobs:",
        "  build:",
        "    steps:",
        "      - uses: webpresso/github-actions/.github/actions/setup-wp@c2c71a7a4be446fc6858e6b57bf55a11ccfa2d88",
        "        with:",
        '          version: "0.0.5"',
        "",
      ].join("\n"),
    });

    const { result } = runScanScript({
      latest: "3.1.30",
      cwd: dir,
      scriptSource: extractScanScript(),
    });

    // A repo whose only version-shaped pin is setup-wp has nothing on the npm
    // axis to freshen, so the scan reports no pins rather than inventing work.
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/No @webpresso\/agent-kit version pins found/u);

    const ci = readOutput(join(dir, ".github/workflows/ci.yml"));
    expect(ci).toMatch(/version: "0\.0\.5"/u);
    expect(ci).not.toMatch(/3\.1\.30/u);

    rmSync(dir, { recursive: true, force: true });
  });

  it("is idempotent: no-op and no PR body when every pin is already at latest", () => {
    const dir = initFixtureRepo({
      ".github/workflows/ci.yml": [
        "name: ci",
        "on: [push]",
        "jobs:",
        "  build:",
        "    steps:",
        '      - run: echo "AGENT_KIT_VERSION=3.1.30" >> "$GITHUB_ENV"',
        "",
      ].join("\n"),
    });

    const { result, githubOutput } = runScanScript({
      latest: "3.1.30",
      cwd: dir,
      scriptSource: extractScanScript(),
    });
    expect(result.status, result.stderr).toBe(0);
    const output = readOutput(githubOutput);
    expect(output).toMatch(/changed=false/u);
    expect(output).toMatch(/pins_found=1/u);
    expect(output).toMatch(/pins_bumped=0/u);

    rmSync(dir, { recursive: true, force: true });
  });

  it("fails loudly (does not silently pass) when zero agent-kit pins are found", () => {
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

    const { result } = runScanScript({ latest: "3.1.30", cwd: dir, scriptSource: extractScanScript() });
    expect(result.status, "expected the scan script to fail when it finds zero agent-kit pins").not.toBe(0);
    expect(result.stderr).toMatch(/No @webpresso\/agent-kit version pins found/u);

    rmSync(dir, { recursive: true, force: true });
  });
});
