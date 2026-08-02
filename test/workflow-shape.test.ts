/**
 * Structural contracts over the reusable workflow / composite action YAML:
 * pins, permissions, secret-sink scoping, toolchain wiring, README parity.
 *
 * Ported from the former `test/workflow_contract_test.rb`.
 */

import { describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import {
  ACTION_TOOLCHAIN,
  CANONICAL_PIN_WORKFLOW,
  EXACT_SEMVER_RE,
  FULL_SHA_USES_RE,
  NODE_BIN,
  NON_TOOLCHAIN_WORKFLOWS,
  README_PATH,
  SETUP_TOOLCHAIN_USES,
  SETUP_WP_USES,
  SETUP_WP_VERSION,
  WORKFLOW_WEBPRESSO_FRESHNESS,
  WORKFLOW_PREVIEW,
  WORKFLOW_PRODUCTION,
  WORKFLOW_RELEASE,
  WORKFLOW_SECURITY,
  WORKFLOW_SELF_TEST,
  allSteps,
  allStepsAnywhere,
  allUses,
  asRecord,
  dig,
  digString,
  extractHeredocs,
  extractUses,
  findStepById,
  isSetupWpUses,
  isToolchainUses,
  loadYaml,
  makeTempDir,
  nodeSyntaxCheck,
  onSection,
  readRepoFile,
  stepsOf,
  workflowAndActionPaths,
  workflowCallInputs,
  workflowCallSecrets,
  workflowPaths,
  type YamlRecord,
} from "./helpers.ts";

const DEPLOY_WORKFLOWS: ReadonlyArray<readonly [string, string]> = [
  [WORKFLOW_PREVIEW, "preview"],
  [WORKFLOW_PRODUCTION, "production"],
];

function usesOfStep(step: YamlRecord): string | undefined {
  const value = step["uses"];
  return typeof value === "string" ? value : undefined;
}

function stepUses(path: string): readonly string[] {
  return extractUses(allSteps(loadYaml(path)));
}

function envKeys(node: YamlRecord | undefined): readonly string[] {
  const env = dig(node, "env");
  return env === undefined ? [] : Object.keys(asRecord(env, "env"));
}

describe("deploy workflow bootstrap contract", () => {
  it("preview workflow declares required sink inputs, id-token write, and pinned bootstrap actions", () => {
    const workflow = loadYaml(WORKFLOW_PREVIEW);
    const inputs = workflowCallInputs(workflow);
    expect(dig(inputs, "secret_profile", "required")).toBe(true);
    expect(dig(inputs, "secret_sink", "required")).toBe(true);
    expect(dig(inputs, "github_environment", "required")).toBe(true);
    expect(dig(workflowCallSecrets(workflow), "ci_secret_provider_token", "required")).toBe(false);
    expect(dig(inputs, "doppler_identity_id", "type")).toBe("string");
    expect(dig(workflow, "jobs", "preview", "permissions", "id-token")).toBe("write");
    expect(dig(workflow, "jobs", "preview", "environment")).toBe("${{ inputs.github_environment }}");
    expect(stepUses(WORKFLOW_PREVIEW)).toContain(
      "DopplerHQ/cli-action@4819d808ab99e5cde19a0637a16536a4038fad73",
    );
    expect(stepUses(WORKFLOW_PREVIEW)).toContain(SETUP_TOOLCHAIN_USES);
  });

  it("production workflow declares required sink inputs, id-token write, and pinned bootstrap actions", () => {
    const workflow = loadYaml(WORKFLOW_PRODUCTION);
    const inputs = workflowCallInputs(workflow);
    expect(dig(inputs, "secret_profile", "required")).toBe(true);
    expect(dig(inputs, "secret_sink", "required")).toBe(true);
    expect(dig(inputs, "github_environment", "required")).toBe(true);
    expect(dig(workflowCallSecrets(workflow), "ci_secret_provider_token", "required")).toBe(false);
    expect(dig(inputs, "doppler_identity_id", "type")).toBe("string");
    expect(dig(workflow, "jobs", "production", "permissions", "id-token")).toBe("write");
    expect(dig(workflow, "jobs", "production", "environment")).toBe("${{ inputs.github_environment }}");
    expect(stepUses(WORKFLOW_PRODUCTION)).toContain(
      "DopplerHQ/cli-action@4819d808ab99e5cde19a0637a16536a4038fad73",
    );
    expect(stepUses(WORKFLOW_PRODUCTION)).toContain(SETUP_TOOLCHAIN_USES);
  });

  it("deploy workflows allow callers to pin a trusted checkout", () => {
    for (const [path, jobName] of DEPLOY_WORKFLOWS) {
      const workflow = loadYaml(path);
      expect(dig(workflowCallInputs(workflow), "checkout_ref", "default")).toBe("");

      const checkout = allSteps(workflow).find(
        (step) => usesOfStep(step) === "actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd",
      );
      expect(checkout, path).toBeDefined();
      expect(dig(checkout, "with", "ref")).toBe("${{ inputs.checkout_ref || github.sha }}");
      expect(dig(workflow, "jobs", jobName, "environment")).toBe("${{ inputs.github_environment }}");
    }
  });
});

describe("same-run artifact and evidence contract", () => {
  it("exposes optional input-artifact pattern/path and evidence name/path inputs", () => {
    for (const [path] of DEPLOY_WORKFLOWS) {
      const inputs = workflowCallInputs(loadYaml(path));
      for (const name of [
        "input_artifact_pattern",
        "input_artifact_path",
        "evidence_artifact_name",
        "evidence_artifact_path",
      ]) {
        expect(dig(inputs, name, "type"), `${path} ${name}`).toBe("string");
        expect(dig(inputs, name, "required"), `${path} ${name}`).toBe(false);
        expect(dig(inputs, name, "default"), `${path} ${name}`).toBe("");
      }
    }
  });

  it("downloads only a same-run artifact and never grants a cross-run relay", () => {
    for (const [path] of DEPLOY_WORKFLOWS) {
      const workflow = loadYaml(path);
      const download = allSteps(workflow).find((step) =>
        usesOfStep(step)?.startsWith("actions/download-artifact@"),
      );
      expect(download, `${path} download step`).toBeDefined();
      if (download === undefined) continue;
      expect(dig(download, "if")).toBe("${{ inputs.input_artifact_pattern != '' }}");
      expect(dig(download, "with", "pattern")).toBe("${{ inputs.input_artifact_pattern }}");
      expect(dig(download, "with", "run-id")).toBe("${{ github.run_id }}");
      expect(dig(download, "with", "repository")).toBeUndefined();
      expect(dig(download, "with", "github-token")).toBeUndefined();
      expect(dig(download, "with", "merge-multiple")).toBe(true);

      const contents = readRepoFile(path);
      expect(contents).toMatch(/PR_HEAD_REPOSITORY/u);
      expect(contents).toMatch(/pull_request_target/u);
      expect(contents).toMatch(/REF_PROTECTED/u);
      expect(contents).toMatch(/input_artifact_path must be a safe workspace-relative directory/u);
      expect(contents).not.toMatch(/actions:\s*write/u);
    }
  });

  it("uploads optional evidence with always semantics and no permission elevation", () => {
    for (const [path] of DEPLOY_WORKFLOWS) {
      const workflow = loadYaml(path);
      const upload = allSteps(workflow).find((step) =>
        usesOfStep(step)?.startsWith("actions/upload-artifact@"),
      );
      expect(upload, `${path} evidence upload step`).toBeDefined();
      if (upload === undefined) continue;
      expect(dig(upload, "if")).toBe(
        "${{ always() && inputs.evidence_artifact_name != '' && inputs.evidence_artifact_path != '' }}",
      );
      expect(dig(upload, "with", "name")).toBe("${{ inputs.evidence_artifact_name }}");
      expect(dig(upload, "with", "path")).toBe("${{ inputs.evidence_artifact_path }}");
      expect(dig(upload, "with", "if-no-files-found")).toBe("warn");
      expect(readRepoFile(path)).not.toMatch(/actions:\s*write/u);
    }
  });

  it("keeps artifact and evidence steps inside the fixed least-privilege job boundary", () => {
    for (const [path, jobName] of DEPLOY_WORKFLOWS) {
      const workflow = loadYaml(path);
      expect(dig(workflow, "jobs", jobName, "permissions"), path).toStrictEqual({
        contents: "read",
        packages: "read",
        "id-token": "write",
        checks: "read",
      });

      const steps = allSteps(workflow);
      const downloadIndex = steps.findIndex((step) =>
        usesOfStep(step)?.startsWith("actions/download-artifact@"),
      );
      const evidenceIndex = steps.findIndex((step) =>
        usesOfStep(step)?.startsWith("actions/upload-artifact@"),
      );
      const failureGateIndex = steps.findIndex((step) => step["id"] === "smoke_failure");
      expect(downloadIndex, `${path} download step`).toBeGreaterThan(-1);
      expect(evidenceIndex, `${path} evidence step`).toBeGreaterThan(failureGateIndex);

      const download = steps[downloadIndex];
      const evidence = steps[evidenceIndex];
      expect(dig(download, "permissions"), path).toBeUndefined();
      expect(dig(evidence, "permissions"), path).toBeUndefined();
      expect(dig(evidence, "with", "github-token"), path).toBeUndefined();
      expect(dig(evidence, "with", "repository"), path).toBeUndefined();
      expect(dig(evidence, "if"), path).toContain("always()");
    }
  });
});

describe("secret-sink boundary", () => {
  it("deploy workflows never export profiles or runtime secrets job-wide", () => {
    for (const [path, jobName] of DEPLOY_WORKFLOWS) {
      const workflow = loadYaml(path);
      const job = dig(workflow, "jobs", jobName);
      const leaking = envKeys(job === undefined ? undefined : asRecord(job, jobName)).filter((name) =>
        /(?:TOKEN|PASSWORD|_KEY)$/u.test(name),
      );
      expect(leaking, path).toStrictEqual([]);

      const contents = readRepoFile(path);
      expect(contents).not.toInclude("inject-env-vars");
      expect(contents).not.toInclude("DopplerHQ/secrets-fetch-action@");
      expect(contents).not.toInclude("Infisical/secrets-action@");
      expect(contents).not.toInclude("CLOUDFLARE_API_TOKEN");
      expect(contents).not.toInclude("PULUMI_ACCESS_TOKEN");
    }
  });

  it("provider auth is scoped to secret-gated mutation steps", () => {
    const allowedByWorkflow: ReadonlyArray<readonly [string, readonly string[]]> = [
      [WORKFLOW_PREVIEW, ["deploy", "destroy", "rollback"]],
      [WORKFLOW_PRODUCTION, ["deploy", "rollback"]],
    ];

    for (const [path, allowedIds] of allowedByWorkflow) {
      const workflow = loadYaml(path);
      const steps = allSteps(workflow);

      const tokenSteps = steps.filter((step) => envKeys(step).includes("DOPPLER_TOKEN"));
      expect(tokenSteps.length, path).toBeGreaterThan(0);
      const unexpected = tokenSteps
        .map((step) => step["id"])
        .filter((id): id is string => typeof id === "string")
        .filter((id) => !allowedIds.includes(id));
      expect(unexpected, path).toStrictEqual([]);

      const providerSecretSteps = steps.filter((step) =>
        JSON.stringify(step).includes("secrets.ci_secret_provider_token"),
      );
      expect(providerSecretSteps.map((step) => step["id"]), path).toStrictEqual([...allowedIds]);

      for (const id of ["install", "verify", "smoke"]) {
        const step = findStepById(workflow, id);
        if (step === undefined) {
          continue;
        }
        const expected =
          id === "install" ? ["GITHUB_TOKEN", "NODE_AUTH_TOKEN", "INSTALL_COMMAND"] : [`${id.toUpperCase()}_COMMAND`];
        expect(envKeys(step), `${path} ${id} must remain provider-runtime-secretless`).toStrictEqual(expected);
      }
    }
  });

  it("deploy workflows validate the sink and fail closed for Infisical", () => {
    for (const [path] of DEPLOY_WORKFLOWS) {
      const contents = readRepoFile(path);
      expect(contents).toInclude("Missing workflow_call input secret_sink.");
      expect(contents).toInclude('Unknown secret sink "${secretSink}"');
      expect(contents).toInclude("does not allow the run operation");
      expect(contents).toInclude('Unknown secret profile "${secretProfile}"');
      expect(contents).toInclude("Infisical is not supported by the sink-scoped reusable deploy harness");
    }
  });

  it("Doppler OIDC exchanges for a masked short-lived token only", () => {
    for (const [path] of DEPLOY_WORKFLOWS) {
      const contents = readRepoFile(path);
      expect(contents).toInclude("id: doppler_oidc");
      expect(contents).toInclude("ACTIONS_ID_TOKEN_REQUEST_URL");
      expect(contents).toInclude("https://api.doppler.com/v3/auth/oidc");
      expect(contents.split("https://api.doppler.com/v3/auth/oidc").length - 1).toBe(1);
      expect(contents).toInclude("::add-mask::");
      expect(contents).toInclude("token=${token}");
      expect(contents).not.toInclude("inject-env-vars");
    }
  });

  it("mutation commands run only through the caller-selected secret sink", () => {
    for (const [path] of DEPLOY_WORKFLOWS) {
      const contents = readRepoFile(path);
      expect(contents).toInclude(
        'wp secrets run --sink "${SECRET_SINK}" --profile "${SECRET_PROFILE}" -- bash -leo pipefail -c',
      );
      expect(contents).not.toMatch(/^\s+bash -leo pipefail -c "\$(?:DEPLOY|DESTROY|ROLLBACK)_COMMAND"$/mu);
    }
  });

  it("smoke failure runs the optional rollback and still fails the run", () => {
    for (const [path] of DEPLOY_WORKFLOWS) {
      const workflow = loadYaml(path);
      expect(dig(workflowCallInputs(workflow), "rollback_command", "default")).toBe("");

      const deploy = findStepById(workflow, "deploy");
      const smoke = findStepById(workflow, "smoke");
      const rollback = findStepById(workflow, "rollback");
      const failureGate = findStepById(workflow, "smoke_failure");

      expect(deploy, path).toBeDefined();
      expect(smoke?.["continue-on-error"], path).toBe(true);
      expect(digString(rollback, "if")).toInclude("steps.deploy.outcome == 'success'");
      expect(digString(rollback, "if")).toInclude("steps.smoke.outcome == 'failure'");
      expect(dig(rollback, "env", "RELEASE_ID")).toBe("${{ steps.deploy.outputs.release_id }}");
      expect(digString(failureGate, "if")).toInclude("steps.smoke.outcome == 'failure'");
      expect(digString(failureGate, "run")).toInclude("exit 1");
    }
  });
});

describe("embedded workflow scripts", () => {
  it("every embedded node program in the deploy workflows parses", () => {
    for (const [path] of DEPLOY_WORKFLOWS) {
      const programs = extractHeredocs(readRepoFile(path));
      expect(programs.length, path).toBeGreaterThan(0);
      for (const program of programs) {
        const result = nodeSyntaxCheck(program.body);
        expect(result.status, `${path} contains invalid embedded JavaScript:\n${result.stderr}`).toBe(0);
      }
    }
  });

  it("the Doppler OIDC helper is shared and exchanges only provider auth", () => {
    const helperFor = (path: string): string => {
      const helpers = extractHeredocs(readRepoFile(path)).filter((heredoc) =>
        heredoc.opener.includes("DOPPLER_OIDC_HELPER"),
      );
      expect(helpers.length, path).toBe(1);
      return helpers[0]?.body ?? "";
    };

    const previewHelper = helperFor(WORKFLOW_PREVIEW);
    const productionHelper = helperFor(WORKFLOW_PRODUCTION);
    expect(previewHelper).toStrictEqual(productionHelper);

    const directory = makeTempDir("doppler-oidc-contract-");
    const helperPath = join(directory, "exchange.cjs");
    const preloadPath = join(directory, "mock-fetch.cjs");
    const outputPath = join(directory, "github-output");
    writeFileSync(helperPath, previewHelper);
    writeFileSync(
      preloadPath,
      [
        "global.fetch = async (url, options = {}) => {",
        '  if (url === "https://github.example.test/oidc") {',
        '    if (options.headers?.Authorization !== "Bearer request-token") {',
        '      throw new Error("missing GitHub request authorization");',
        "    }",
        '    return { ok: true, status: 200, json: async () => ({ value: "github-oidc-token" }) };',
        "  }",
        '  if (url === "https://api.doppler.com/v3/auth/oidc") {',
        '    const body = JSON.parse(options.body ?? "{}");',
        '    if (body.identity !== "identity-id" || body.token !== "github-oidc-token") {',
        '      throw new Error("invalid Doppler exchange payload");',
        "    }",
        '    return { ok: true, status: 200, json: async () => ({ token: "dp.said.short-lived" }) };',
        "  }",
        "  throw new Error(`unexpected URL: ${url}`);",
        "};",
        "",
      ].join("\n"),
    );

    const stdout = execFileSync(NODE_BIN, ["--require", preloadPath, helperPath], {
      encoding: "utf8",
      env: {
        ...process.env,
        ACTIONS_ID_TOKEN_REQUEST_URL: "https://github.example.test/oidc",
        ACTIONS_ID_TOKEN_REQUEST_TOKEN: "request-token",
        DOPPLER_IDENTITY_ID: "identity-id",
        GITHUB_OUTPUT: outputPath,
      },
    });

    expect(stdout).toInclude("::add-mask::github-oidc-token");
    expect(stdout).toInclude("::add-mask::dp.said.short-lived");
    expect(readRepoFile(outputPath)).toBe("token=dp.said.short-lived\n");
  });
});

describe("shared toolchain wiring", () => {
  it("the release workflow uses the shared toolchain setup", () => {
    const steps = stepsOf(dig(loadYaml(WORKFLOW_RELEASE), "jobs", "release"));
    expect(extractUses(steps)).toContain(SETUP_TOOLCHAIN_USES);
    expect(readRepoFile(WORKFLOW_RELEASE)).not.toInclude("Resolve caller pnpm version");
  });

  it("the shared toolchain action is fully pinned", () => {
    const action = loadYaml(ACTION_TOOLCHAIN);
    expect(dig(action, "runs", "using")).toBe("composite");
    const usesValues = extractUses(stepsOf(dig(action, "runs")));
    expect(usesValues).toContain("pnpm/action-setup@0e279bb959325dab635dd2c09392533439d90093");
    expect(usesValues).toContain("actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444");
    expect(usesValues).toContain("actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e");
    expect(usesValues).toContain("oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6");
    for (const value of usesValues) {
      if (value.startsWith("./")) {
        continue;
      }
      expect(value, `expected full SHA pin for ${value}`).toMatch(FULL_SHA_USES_RE);
    }
  });

  it("the shared toolchain action uses catalog-aware Vite+ setup", () => {
    const action = loadYaml(ACTION_TOOLCHAIN);
    const setupVp = stepsOf(dig(action, "runs")).find(
      (step) => usesOfStep(step) === "voidzero-dev/setup-vp@250f29ce396baf5e8f24498e17c0dfdebabc26eb",
    );

    expect(setupVp).toBeDefined();
    expect(dig(setupVp, "with", "run-install")).toBe(false);
    expect(Object.keys(asRecord(dig(action, "inputs"), "inputs"))).not.toContain("cli-global-packages");
    expect(readRepoFile(ACTION_TOOLCHAIN)).not.toInclude("npm install -g");
  });

  it("reusable workflows do not request the removed global CLI input", () => {
    for (const path of workflowPaths()) {
      const contents = readRepoFile(path);
      expect(contents, path).not.toInclude("/tmp/webpresso-cli-globals");
      expect(contents, `${path} should not install globals from cat output inline`).not.toMatch(
        /npm\s+install\s+-g\s+\$\(cat\s+[^)]*\)/u,
      );

      if (NON_TOOLCHAIN_WORKFLOWS.includes(path)) {
        continue;
      }

      const toolchainSteps = allSteps(loadYaml(path)).filter((step) => usesOfStep(step) === SETUP_TOOLCHAIN_USES);
      expect(toolchainSteps.length, path).toBeGreaterThan(0);
      for (const step of toolchainSteps) {
        const withKeys = step["with"] === undefined ? [] : Object.keys(asRecord(step["with"], "with"));
        expect(withKeys, path).not.toContain("cli-global-packages");
      }
    }
  });

  it("every reusable toolchain workflow uses caller-versioned agent-kit setup", () => {
    const candidatePaths = workflowPaths().filter((path) => !NON_TOOLCHAIN_WORKFLOWS.includes(path));
    const toolchainPaths = candidatePaths.filter((path) => allUses(loadYaml(path)).includes(SETUP_TOOLCHAIN_USES));
    expect(toolchainPaths).toStrictEqual(candidatePaths);

    for (const path of toolchainPaths) {
      const workflow = loadYaml(path);
      expect(Object.keys(workflowCallInputs(workflow)), path).not.toContain("agent_kit_version");

      let setupWpCount = 0;
      for (const job of Object.values(asRecord(dig(workflow, "jobs"), "jobs"))) {
        const steps = stepsOf(job);
        steps.forEach((step, index) => {
          if (usesOfStep(step) !== SETUP_WP_USES) {
            return;
          }
          setupWpCount += 1;
          const toolchainIndex = steps.findIndex((candidate) => usesOfStep(candidate) === SETUP_TOOLCHAIN_USES);
          expect(toolchainIndex, path).toBeGreaterThanOrEqual(0);
          expect(toolchainIndex, path).toBeLessThan(index);
          expect(digString(step, "with", "version"), path).toBe(SETUP_WP_VERSION);
        });
      }
      expect(setupWpCount, path).toBeGreaterThan(0);

      const contents = readRepoFile(path);
      expect(contents, path).not.toMatch(/@webpresso\/agent-kit@/u);
      expect(contents, path).not.toInclude("agent_kit_version");
    }
  });
});

describe("pin consistency", () => {
  // The setup-wp SHA, the toolchain SHA, and the agent-kit version each live at
  // many irreducible YAML sites. Asserting literals here would make this file
  // one more site every freshness bump has to edit, so the expectation is
  // derived from the canonical workflow at runtime and what is asserted is
  // cross-site agreement plus value shape.
  it("derives the canonical pins from a single workflow and they are correctly shaped", () => {
    expect(CANONICAL_PIN_WORKFLOW).toBe(WORKFLOW_PRODUCTION);
    expect(SETUP_TOOLCHAIN_USES).toMatch(FULL_SHA_USES_RE);
    expect(SETUP_TOOLCHAIN_USES).toStartWith(
      "webpresso/github-actions/.github/actions/setup-webpresso-toolchain@",
    );
    expect(SETUP_WP_USES).toMatch(FULL_SHA_USES_RE);
    expect(SETUP_WP_USES).toStartWith("webpresso/github-actions/.github/actions/setup-wp@");
    expect(SETUP_WP_VERSION).toMatch(EXACT_SEMVER_RE);
  });

  it("every setup-webpresso-toolchain reference in the repo is the same full-SHA pin", () => {
    const references = workflowAndActionPaths().flatMap((path) =>
      allUses(loadYaml(path)).filter((value) => isToolchainUses(value)),
    );
    expect(references.length).toBeGreaterThan(0);
    expect([...new Set(references)]).toStrictEqual([SETUP_TOOLCHAIN_USES]);
  });

  it("every setup-wp reference in the repo is the same full-SHA pin", () => {
    const references = workflowAndActionPaths().flatMap((path) =>
      allUses(loadYaml(path)).filter((value) => isSetupWpUses(value)),
    );
    expect(references.length).toBeGreaterThan(0);
    expect([...new Set(references)]).toStrictEqual([SETUP_WP_USES]);
  });

  it("every setup-wp step installs the same exact agent-kit semver", () => {
    const versions = workflowAndActionPaths().flatMap((path) =>
      allStepsAnywhere(loadYaml(path))
        .filter((step) => {
          const uses = usesOfStep(step);
          return uses !== undefined && isSetupWpUses(uses);
        })
        .map((step) => digString(step, "with", "version") ?? `<missing in ${path}>`),
    );
    expect(versions.length).toBeGreaterThan(0);
    expect([...new Set(versions)]).toStrictEqual([SETUP_WP_VERSION]);
  });
});

describe("repo-wide pin and prose contracts", () => {
  it("all workflow and action uses are full SHA pins", () => {
    for (const path of workflowAndActionPaths()) {
      for (const value of allUses(loadYaml(path))) {
        if (value.startsWith("./")) {
          continue;
        }
        expect(value, `expected full SHA pin for ${value} in ${path}`).toMatch(FULL_SHA_USES_RE);
      }
    }
  });

  it("the README describes the sink-scoped secret contract", () => {
    const readme = readRepoFile(README_PATH);
    expect(readme).toInclude("repo-owned secret profiles");
    expect(readme).toInclude("ci_secret_provider_token");
    expect(readme).toInclude("secret_sink");
    expect(readme).toInclude("github_environment");
    expect(readme).toInclude("rollback_command");
    expect(readme).toInclude("full commit SHA");
    expect(readme).toInclude("does not self-resolve a version");
    expect(readme).toInclude("must not add `@webpresso/agent-kit`");
    expect(readme).toInclude("workspace catalogs");
    expect(readme).toInclude("`run-install: false`");
    expect(readme).not.toInclude("cli-global-packages");
  });

  // webpresso-ci.yml was removed: an org-wide code search found zero `uses:`
  // consumers (the one repo that wanted its pattern hand-rolled it locally),
  // and an unused reusable workflow is a maintained pin surface that pays for
  // nothing. This asserts the removal instead of leaving a silent hole, since
  // the file was also the suite's canonical pin anchor.
  it("the unconsumed shared CI workflow stays removed", () => {
    expect(workflowPaths().map((path) => path.split("/").pop())).not.toContain("webpresso-ci.yml");
    expect(readRepoFile(README_PATH)).not.toInclude("webpresso-ci.yml");
  });

  it("the shared security workflow uses pinned scanners and the shared toolchain", () => {
    const workflow = loadYaml(WORKFLOW_SECURITY);
    const inputs = workflowCallInputs(workflow);
    expect(dig(inputs, "install_command", "type")).toBe("string");
    expect(dig(inputs, "security_command", "type")).toBe("string");
    expect(stepUses(WORKFLOW_SECURITY)).toContain(
      "gitleaks/gitleaks-action@ff98106e4c7b2bc287b24eaf42907196329070c7",
    );
    expect(stepUses(WORKFLOW_SECURITY)).toContain(
      "google/osv-scanner-action/osv-scanner-action@9a498708959aeaef5ef730655706c5a1df1edbc2",
    );
    expect(stepUses(WORKFLOW_SECURITY)).toContain(SETUP_TOOLCHAIN_USES);
  });
});

describe("toolchain exceptions", () => {
  it("webpresso-freshness.yml is a deliberate toolchain exception", () => {
    expect(Bun.file(WORKFLOW_WEBPRESSO_FRESHNESS).size, `expected ${WORKFLOW_WEBPRESSO_FRESHNESS} to exist`).toBeGreaterThan(0);
    const workflow = loadYaml(WORKFLOW_WEBPRESSO_FRESHNESS);
    const on = onSection(workflow);
    expect(Object.keys(on), "must be callable as a reusable workflow").toContain("workflow_call");
    expect(Object.keys(on), "must be manually exercisable without waiting for a schedule").toContain(
      "workflow_dispatch",
    );

    const job = dig(workflow, "jobs", "freshness");
    expect(job, "expected a `freshness` job").toBeDefined();
    expect(dig(job, "permissions", "contents")).toBe("write");
    expect(dig(job, "permissions", "pull-requests")).toBe("write");

    // Deliberately excluded from the shared-toolchain invariant above: this is
    // a repo-maintenance automation, not a caller-consuming CI/deploy workflow,
    // so it does not install pnpm/Vite+/wp.
    expect(allUses(workflow)).not.toContain(SETUP_TOOLCHAIN_USES);
    expect(allUses(workflow)).not.toContain(SETUP_WP_USES);
  });

  // The README calls this a *caller*-scheduled workflow. Pin the exact trigger
  // set so prose and YAML cannot drift into claiming a `schedule:` that does
  // not exist here (adding one would run the scan against this library instead
  // of the consumer).
  it("webpresso-freshness.yml declares exactly workflow_call and workflow_dispatch, never a schedule", () => {
    const on = onSection(loadYaml(WORKFLOW_WEBPRESSO_FRESHNESS));
    expect(Object.keys(on).sort()).toStrictEqual(["workflow_call", "workflow_dispatch"]);
    expect(readRepoFile(README_PATH)).toInclude("caller-scheduled reusable workflow");
  });

  // The gate that makes every other test in this file binding. Without an
  // executor the suite is documentation: a broken contract merges green because
  // nothing ran it. Pin the trigger and the invocation so the gate cannot be
  // silently narrowed or gutted.
  it("self-test.yml gates the contract suite on every pull request", () => {
    expect(Bun.file(WORKFLOW_SELF_TEST).size, `expected ${WORKFLOW_SELF_TEST} to exist`).toBeGreaterThan(0);
    const workflow = loadYaml(WORKFLOW_SELF_TEST);
    const on = onSection(workflow);
    expect(Object.keys(on), "contract suite must gate every pull request").toContain("pull_request");
    expect(dig(on, "push", "branches"), "main must stay proven after merge").toStrictEqual(["main"]);

    expect(dig(workflow, "permissions", "contents")).toBe("read");
    expect(dig(workflow, "permissions", "pull-requests"), "read-only gate needs no write scope").toBeUndefined();

    const job = dig(workflow, "jobs", "contract-tests");
    expect(job, "expected a `contract-tests` job").toBeDefined();
    const commands = stepsOf(job)
      .map((step) => step["run"])
      .filter((value): value is string => typeof value === "string");
    expect(commands).toContain("bun test");

    // Deliberately excluded from the shared-toolchain invariant above: this
    // gate runs the repo's own contract suite and is never called by a
    // consumer, so it does not install pnpm/Vite+/wp.
    expect(allUses(workflow)).not.toContain(SETUP_TOOLCHAIN_USES);
    expect(allUses(workflow)).not.toContain(SETUP_WP_USES);
  });
});
