/**
 * Caller-facing output contract for `cloudflare-production.yml`.
 *
 * The deploy step already materializes whatever the caller's deploy block
 * writes to `$GITHUB_OUTPUT`; this suite pins the two-hop plumbing that makes
 * one of those keys (`deploy_outputs`) visible to a `workflow_call` consumer:
 * step output -> job output -> workflow_call output. Asserted over the parsed
 * YAML structure, never source text.
 */

import { describe, expect, it } from "bun:test";
import { WORKFLOW_PRODUCTION, dig, digString, loadYaml, onSection } from "./helpers.ts";

const workflow = loadYaml(WORKFLOW_PRODUCTION);

describe("cloudflare-production.yml deploy_outputs passthrough", () => {
  it("declares a workflow_call output wired to the production job output", () => {
    const output = dig(onSection(workflow), "workflow_call", "outputs", "deploy_outputs");
    expect(output, "on.workflow_call.outputs.deploy_outputs must exist").toBeDefined();
    expect(digString(output, "value")).toBe("${{ jobs.production.outputs.deploy_outputs }}");
    const description = digString(output, "description") ?? "";
    expect(description.length, "the output must carry a description").toBeGreaterThan(0);
  });

  it("wires the production job output to the deploy step output", () => {
    expect(dig(workflow, "jobs", "production", "outputs", "deploy_outputs")).toBe(
      "${{ steps.deploy.outputs.deploy_outputs }}",
    );
  });
});
