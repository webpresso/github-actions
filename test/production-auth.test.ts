/**
 * GitHub-token exposure contract for `cloudflare-production.yml`.
 *
 * Ported from the former `.github/workflows/cloudflare-production.contract.test.cjs`.
 */

import { describe, expect, it } from "bun:test";
import { WORKFLOW_PRODUCTION, readRepoFile } from "./helpers.ts";

const workflow = readRepoFile(WORKFLOW_PRODUCTION);

describe("cloudflare-production.yml GitHub auth", () => {
  it("is explicit, opt-in, and scoped to the deploy step", () => {
    expect(workflow).toMatch(
      /deploy_github_token:\n\s+description:[^\n]+\n\s+required: false\n\s+default: false\n\s+type: boolean/u,
    );
    expect(workflow).toMatch(
      /permissions:\n\s+contents: read\n\s+packages: read\n\s+id-token: write[\s\S]*?issues: write/u,
    );

    const deployStep = workflow.match(
      /- name: Run caller deploy block through the secret sink[\s\S]*?(?=\n\s+- name:)/u,
    )?.[0];
    expect(deployStep, "deploy step must exist").toBeDefined();
    expect(deployStep).toMatch(/GITHUB_TOKEN: \$\{\{ inputs\.deploy_github_token && secrets\.GITHUB_TOKEN \|\| '' \}\}/u);
    expect(deployStep).toMatch(/GH_TOKEN: \$\{\{ inputs\.deploy_github_token && secrets\.GITHUB_TOKEN \|\| '' \}\}/u);

    const beforeDeploy = workflow.slice(0, workflow.indexOf(deployStep ?? ""));
    const withoutInstallStep = beforeDeploy.replace(
      /- name: Install caller dependencies[\s\S]*?(?=\n\s+- name:)/u,
      "",
    );
    expect(withoutInstallStep).not.toMatch(/deploy_github_token && secrets\.GITHUB_TOKEN/u);
  });
});
