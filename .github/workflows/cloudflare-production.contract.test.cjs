const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");

const workflow = readFileSync(join(__dirname, "cloudflare-production.yml"), "utf8");

test("deploy GitHub auth is explicit, opt-in, and scoped to the deploy step", () => {
  assert.match(
    workflow,
    /deploy_github_token:\n\s+description:[^\n]+\n\s+required: false\n\s+default: false\n\s+type: boolean/u,
  );
  assert.match(
    workflow,
    /permissions:\n\s+contents: read\n\s+packages: read\n\s+id-token: write[\s\S]*?issues: write/u,
  );

  const deployStep = workflow.match(
    /- name: Run caller deploy block through the secret sink[\s\S]*?(?=\n\s+- name:)/u,
  )?.[0];
  assert.ok(deployStep, "deploy step must exist");
  assert.match(
    deployStep,
    /GITHUB_TOKEN: \$\{\{ inputs\.deploy_github_token && secrets\.GITHUB_TOKEN \|\| '' \}\}/u,
  );
  assert.match(
    deployStep,
    /GH_TOKEN: \$\{\{ inputs\.deploy_github_token && secrets\.GITHUB_TOKEN \|\| '' \}\}/u,
  );

  const beforeDeploy = workflow.slice(0, workflow.indexOf(deployStep));
  const withoutInstallStep = beforeDeploy.replace(
    /- name: Install caller dependencies[\s\S]*?(?=\n\s+- name:)/u,
    "",
  );
  assert.doesNotMatch(withoutInstallStep, /deploy_github_token && secrets\.GITHUB_TOKEN/u);
});
