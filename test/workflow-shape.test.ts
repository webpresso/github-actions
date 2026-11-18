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
  SETUP_WP_ENTITLEMENT_EXPRESSION,
  SETUP_WP_USES,
  setupWpVersionDefault,
  SETUP_WP_VERSION_EXPRESSION,
  SETUP_WP_WORKFLOWS,
  WP_ENTITLEMENT_SECRET,
  WP_VERSION_INPUT,
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
    expect(dig(workflow, "jobs", "preview", "environment")).toBe(
      "${{ inputs.github_environment }}",
    );
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
    expect(dig(workflow, "jobs", "production", "environment")).toBe(
      "${{ inputs.github_environment }}",
    );
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
        (step) => usesOfStep(step) === "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
      );
      expect(checkout, path).toBeDefined();
      expect(dig(checkout, "with", "ref")).toBe("${{ inputs.checkout_ref || github.sha }}");
      expect(dig(workflow, "jobs", jobName, "environment")).toBe(
        "${{ inputs.github_environment }}",
      );
    }
  });
});

describe("secret-sink boundary", () => {
  it("deploy workflows never export profiles or runtime secrets job-wide", () => {
    for (const [path, jobName] of DEPLOY_WORKFLOWS) {
      const workflow = loadYaml(path);
      const job = dig(workflow, "jobs", jobName);
      const leaking = envKeys(job === undefined ? undefined : asRecord(job, jobName)).filter(
        (name) => /(?:TOKEN|PASSWORD|_KEY)$/u.test(name),
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
      expect(
        providerSecretSteps.map((step) => step["id"]),
        path,
      ).toStrictEqual([...allowedIds]);

      for (const id of ["install", "verify", "smoke"]) {
        const step = findStepById(workflow, id);
        if (step === undefined) {
          continue;
        }
        const expected =
          id === "install"
            ? ["GITHUB_TOKEN", "NODE_AUTH_TOKEN", "INSTALL_COMMAND"]
            : [`${id.toUpperCase()}_COMMAND`];
        expect(
          envKeys(step),
          `${path} ${id} must remain provider-runtime-secretless`,
        ).toStrictEqual(expected);
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
      expect(contents).toInclude(
        "Infisical is not supported by the sink-scoped reusable deploy harness",
      );
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
      expect(contents).not.toMatch(
        /^\s+bash -leo pipefail -c "\$(?:DEPLOY|DESTROY|ROLLBACK)_COMMAND"$/mu,
      );
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
        expect(
          result.status,
          `${path} contains invalid embedded JavaScript:\n${result.stderr}`,
        ).toBe(0);
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
    const inputs = asRecord(dig(action, "inputs"), "toolchain inputs");
    const steps = stepsOf(dig(action, "runs"));
    const usesValues = extractUses(steps);
    expect(digString(inputs["node-version"], "default")).toBe("24.20.0");
    expect(digString(inputs["bun-version"], "default")).toBe("1.4.2");
    expect(usesValues).toContain("pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413");
    expect(usesValues).toContain("actions/setup-node@820762786026740c76f36085b0efc47a31fe5020");
    expect(usesValues).toContain("oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6");

    const cacheEnabledSetup = steps.find(
      (step) => digString(step, "if") === "${{ inputs.package-manager-cache != 'false' }}",
    );
    expect(cacheEnabledSetup === undefined ? undefined : usesOfStep(cacheEnabledSetup)).toBe(
      "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
    );
    expect(dig(cacheEnabledSetup, "with", "cache")).toBe("${{ inputs.package-manager-cache }}");

    const cacheDisabledSetup = steps.find(
      (step) => digString(step, "if") === "${{ inputs.package-manager-cache == 'false' }}",
    );
    expect(cacheDisabledSetup === undefined ? undefined : usesOfStep(cacheDisabledSetup)).toBe(
      "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
    );
    expect(dig(cacheDisabledSetup, "with", "package-manager-cache")).toBe(false);

    const setupBun = steps.find(
      (step) => usesOfStep(step) === "oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6",
    );
    expect(dig(setupBun, "with", "bun-version")).toBe("${{ inputs.bun-version }}");
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
      (step) =>
        usesOfStep(step) === "voidzero-dev/setup-vp@49c3e4e92c52e7f8392712a9267bbe71c5ab30e5",
    );

    expect(setupVp).toBeDefined();
    expect(dig(setupVp, "with", "run-install")).toBe(false);
    expect(Object.keys(asRecord(dig(action, "inputs"), "inputs"))).not.toContain(
      "cli-global-packages",
    );
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

      const toolchainSteps = allSteps(loadYaml(path)).filter(
        (step) => usesOfStep(step) === SETUP_TOOLCHAIN_USES,
      );
      expect(toolchainSteps.length, path).toBeGreaterThan(0);
      for (const step of toolchainSteps) {
        const withKeys =
          step["with"] === undefined ? [] : Object.keys(asRecord(step["with"], "with"));
        expect(withKeys, path).not.toContain("cli-global-packages");
      }
    }
  });

  it("every reusable toolchain workflow uses caller-versioned wp setup", () => {
    const candidatePaths = workflowPaths().filter(
      (path) => !NON_TOOLCHAIN_WORKFLOWS.includes(path),
    );
    const toolchainPaths = candidatePaths.filter((path) =>
      allUses(loadYaml(path)).includes(SETUP_TOOLCHAIN_USES),
    );
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
          const toolchainIndex = steps.findIndex(
            (candidate) => usesOfStep(candidate) === SETUP_TOOLCHAIN_USES,
          );
          expect(toolchainIndex, path).toBeGreaterThanOrEqual(0);
          expect(toolchainIndex, path).toBeLessThan(index);
          expect(digString(step, "with", "version"), path).toBe(SETUP_WP_VERSION_EXPRESSION);
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
  // First-party action references are immutable reviewed merge SHAs. This
  // repository intentionally has no tags; these shape and cross-reference
  // checks do not establish tag provenance (which applies to third-party pins).
  // The setup-wp SHA, the toolchain SHA, and the wp version each live at
  // many irreducible YAML sites. Asserting literals here would make this file
  // one more site every pin bump has to edit, so the expectation is
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
    expect(setupWpVersionDefault()).toMatch(EXACT_SEMVER_RE);
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

  it("every setup-wp step installs the caller's wp_version and forwards only wp_entitlement", () => {
    const setupWpSteps = workflowAndActionPaths().flatMap((path) =>
      allStepsAnywhere(loadYaml(path))
        .filter((step) => {
          const uses = usesOfStep(step);
          return uses !== undefined && isSetupWpUses(uses);
        })
        .map((step) => [path, step] as const),
    );
    expect(setupWpSteps.map(([path]) => path)).toStrictEqual([...SETUP_WP_WORKFLOWS].sort());
    for (const [path, step] of setupWpSteps) {
      // version and entitlement only: auth stays setup-wp's default (auto), so
      // a pre-floor caller is unchanged and a login-only one signs in.
      expect(step["with"], path).toStrictEqual({
        version: SETUP_WP_VERSION_EXPRESSION,
        entitlement: SETUP_WP_ENTITLEMENT_EXPRESSION,
      });
    }
  });
});

// Wave 2 of blueprint setup-wp-account-auth: the reusable workflows expose
// the login-only caller surface while every pre-floor caller keeps working.
describe("login-only wp caller surface", () => {
  it("every wp workflow declares an optional wp_version input with one shared default", () => {
    for (const path of SETUP_WP_WORKFLOWS) {
      const input = dig(workflowCallInputs(loadYaml(path)), WP_VERSION_INPUT);
      expect(dig(input, "type"), path).toBe("string");
      expect(dig(input, "required"), path).toBe(false);
      expect(dig(input, "default"), path).toBe(setupWpVersionDefault());
    }
  });

  // setup-wp installs only releases that publish the per-target install
  // archive (0.0.16 or later; 0.0.6, 0.0.9, 0.0.10 and 0.0.13 publish flat
  // binaries). The default must also be the release the self-test live job
  // installs through the in-repo action on every pull request, so an
  // uninstallable default cannot merge green.
  it("the wp_version default is the archive-publishing release the live self-test installs", () => {
    const fallback = setupWpVersionDefault();
    expect(fallback).toMatch(EXACT_SEMVER_RE);
    expect(
      Bun.semver.order(fallback, "0.0.16"),
      `${fallback} predates the install-archive contract`,
    ).toBeGreaterThanOrEqual(0);

    const liveSkip = dig(loadYaml(WORKFLOW_SELF_TEST), "jobs", "setup-wp-live-skip");
    const liveSetup = stepsOf(liveSkip).find(
      (step) => step["uses"] === "./.github/actions/setup-wp",
    );
    expect(String(dig(liveSetup, "with", "version"))).toBe(fallback);
  });

  it("every wp workflow declares an optional wp_entitlement secret", () => {
    for (const path of SETUP_WP_WORKFLOWS) {
      const secret = dig(workflowCallSecrets(loadYaml(path)), WP_ENTITLEMENT_SECRET);
      expect(secret, path).toBeDefined();
      expect(dig(secret, "required"), path).toBe(false);
    }
  });

  // The break-glass entitlement is a credential: it may reach setup-wp, which
  // masks it before any output, and nothing else (no env, run, if or other
  // action input).
  it("secrets.wp_entitlement appears nowhere but the setup-wp entitlement input", () => {
    for (const path of workflowAndActionPaths()) {
      const occurrences = readRepoFile(path).split(`secrets.${WP_ENTITLEMENT_SECRET}`).length - 1;
      const sinks = allStepsAnywhere(loadYaml(path)).filter((step) => {
        const uses = usesOfStep(step);
        return (
          uses !== undefined &&
          isSetupWpUses(uses) &&
          digString(step, "with", "entitlement") === SETUP_WP_ENTITLEMENT_EXPRESSION
        );
      }).length;
      expect(occurrences, path).toBe(sinks);
    }
  });

  // id-token: write is job-wide: every later step can mint an OIDC token for
  // any audience and read the CI entitlement. It belongs on exactly the jobs
  // that run wp (preview and production also exchange it with Doppler), never
  // on a workflow-level block and never on a job without setup-wp.
  it("id-token: write is granted on exactly the jobs that install wp", () => {
    for (const path of workflowPaths()) {
      const workflow = loadYaml(path);
      expect(dig(workflow, "permissions", "id-token"), path).toBeUndefined();
      for (const [name, job] of Object.entries(asRecord(dig(workflow, "jobs"), "jobs"))) {
        const installsWp = stepsOf(job).some((step) => {
          const uses = usesOfStep(step);
          return uses !== undefined && isSetupWpUses(uses);
        });
        const grant = dig(job, "permissions", "id-token");
        expect(grant, `${path} job ${name}`).toBe(installsWp ? "write" : undefined);
      }
    }
  });

  // The grant reaches every step of the job, so every action not owned by
  // this repository (or actions/checkout) that runs under it is listed here
  // deliberately: Doppler's CLI installer in the deploy jobs and the
  // changesets action that publishes in the release job. The security
  // workflow's scanners run in a separate job without the grant.
  it("third-party actions run under id-token: write only where listed", () => {
    const allowed: Record<string, readonly string[]> = {
      [WORKFLOW_PREVIEW]: ["DopplerHQ/cli-action"],
      [WORKFLOW_PRODUCTION]: ["DopplerHQ/cli-action"],
      [WORKFLOW_RELEASE]: ["changesets/action"],
    };
    for (const path of workflowPaths()) {
      const workflow = loadYaml(path);
      const thirdParty: string[] = [];
      for (const job of Object.values(asRecord(dig(workflow, "jobs"), "jobs"))) {
        if (dig(job, "permissions", "id-token") !== "write") {
          continue;
        }
        for (const step of stepsOf(job)) {
          const uses = usesOfStep(step);
          if (
            uses === undefined ||
            uses.startsWith("./") ||
            uses.startsWith("webpresso/github-actions/") ||
            uses.startsWith("actions/checkout@")
          ) {
            continue;
          }
          thirdParty.push(uses.slice(0, uses.indexOf("@")));
        }
      }
      expect(thirdParty.sort(), path).toStrictEqual([...(allowed[path] ?? [])].sort());
    }
  });

  it("the security scanners run in a scan job the wp job requires to succeed", () => {
    const jobs = asRecord(dig(loadYaml(WORKFLOW_SECURITY), "jobs"), "jobs");
    expect(Object.keys(jobs).sort()).toStrictEqual(["scan", "security"]);
    const scan = jobs["scan"];
    expect(dig(scan, "permissions")).toStrictEqual({ contents: "read" });
    expect(stepsOf(scan).map((step) => usesOfStep(step))).toStrictEqual([
      "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
      "gitleaks/gitleaks-action@e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e",
      "google/osv-scanner-action/osv-scanner-action@6e4298ebc4db23e847df9b2e2de2939d6f066c67",
    ]);

    // A failed scan must fail the `security` check, not skip it: a skipped
    // required check passes branch protection.
    const security = jobs["security"];
    expect(dig(security, "name")).toBe("security");
    expect(dig(security, "needs")).toBe("scan");
    expect(dig(security, "if")).toBe("${{ !cancelled() }}");
    const [guard] = stepsOf(security);
    expect(dig(guard, "if")).toBe("${{ needs.scan.result != 'success' }}");
    expect(dig(guard, "env", "SCAN_RESULT")).toBe("${{ needs.scan.result }}");
    expect(String(dig(guard, "run"))).toInclude("exit 1");
  });

  it("the security scan guard fails for every scan result but success", () => {
    const [guard] = stepsOf(asRecord(dig(loadYaml(WORKFLOW_SECURITY), "jobs"), "jobs")["security"]);
    const script = String(dig(guard, "run"));
    for (const result of ["failure", "cancelled", "skipped"]) {
      let status = 0;
      let output = "";
      try {
        execFileSync("bash", ["-c", script], {
          env: { PATH: "/usr/bin:/bin", SCAN_RESULT: result },
          stdio: "pipe",
        });
      } catch (error) {
        const failure = error as { status: number; stdout: Buffer };
        status = failure.status;
        output = failure.stdout.toString();
      }
      expect(status, result).toBe(1);
      expect(output, result).toInclude(
        `::error::The scan job (Gitleaks and OSV Scanner) ended '${result}'`,
      );
    }
  });

  // Break-glass routing depends on whether the wp job binds an environment:
  // GitHub resolves a secret from the job's environment before the value a
  // caller passed, and a job that calls a reusable workflow cannot declare
  // `environment:` itself. The README and each workflow's comment must say
  // which route applies, so they are tied here to the job structure.
  it("break-glass routing in the README and comments matches each wp job's environment", () => {
    const readme = readRepoFile(README_PATH);
    const bullet = (marker: string): string => {
      const line = readme.split("\n").find((text) => text.includes(marker));
      expect(line, marker).toBeDefined();
      return line as string;
    };
    const environmentBullet = bullet("environment secret named `WP_ENTITLEMENT`");
    const repositoryBullet = bullet("short-lived repository secret");
    expect(environmentBullet).toInclude("forces break-glass on every run");
    expect(repositoryBullet).toInclude("cannot declare one");
    expect(repositoryBullet).toInclude("wp_entitlement: ${{ secrets.WP_ENTITLEMENT }}");
    expect(readme).toInclude("pass the secret explicitly rather than through `secrets: inherit`");

    for (const path of SETUP_WP_WORKFLOWS) {
      const wpJobs = Object.values(asRecord(dig(loadYaml(path), "jobs"), "jobs")).filter((job) =>
        stepsOf(job).some((step) => {
          const uses = usesOfStep(step);
          return uses !== undefined && isSetupWpUses(uses);
        }),
      );
      expect(wpJobs.length, path).toBe(1);
      const bindsEnvironment = dig(wpJobs[0], "environment") !== undefined;
      const file = `\`${path.split("/").pop()}\``;
      expect(environmentBullet.includes(file), `${path} in the environment bullet`).toBe(
        bindsEnvironment,
      );
      expect(repositoryBullet.includes(file), `${path} in the repository-secret bullet`).toBe(
        !bindsEnvironment,
      );
      const source = readRepoFile(path);
      expect(source.includes("WP_ENTITLEMENT in that environment"), path).toBe(bindsEnvironment);
      expect(source.includes("an environment secret never reaches it"), path).toBe(
        !bindsEnvironment,
      );
    }
  });

  it("the README documents the caller surface and the migration at the new pin", () => {
    const readme = readRepoFile(README_PATH);
    expect(readme).toInclude(`\`${WP_VERSION_INPUT}\``);
    expect(readme).toInclude(`\`${WP_ENTITLEMENT_SECRET}\``);
    expect(readme).toInclude(`defaults to \`${setupWpVersionDefault()}\``);
    expect(readme).toInclude("refuses the run at startup");
    expect(readme).toInclude("`secrets: inherit`");
    // Moving the pin moves the installed wp even for a caller that sets
    // nothing, and the default itself moves before its release is deleted.
    expect(readme).toInclude(
      "moving the pin changes the installed wp even when a caller sets nothing",
    );
    expect(readme).toInclude(`the \`${setupWpVersionDefault()}\` default is temporary`);
    expect(readme).toInclude("before the deletion");
  });

  it("the release and security jobs grant id-token: write for wp sign-in", () => {
    expect(dig(loadYaml(WORKFLOW_RELEASE), "jobs", "release", "permissions", "id-token")).toBe(
      "write",
    );
    expect(dig(loadYaml(WORKFLOW_SECURITY), "jobs", "security", "permissions", "id-token")).toBe(
      "write",
    );
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
      "gitleaks/gitleaks-action@e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e",
    );
    expect(stepUses(WORKFLOW_SECURITY)).toContain(
      "google/osv-scanner-action/osv-scanner-action@6e4298ebc4db23e847df9b2e2de2939d6f066c67",
    );
    expect(stepUses(WORKFLOW_SECURITY)).toContain(SETUP_TOOLCHAIN_USES);
  });
});

describe("toolchain exceptions", () => {
  // The gate that makes every other test in this file binding. Without an
  // executor the suite is documentation: a broken contract merges green because
  // nothing ran it. Pin the trigger and the invocation so the gate cannot be
  // silently narrowed or gutted.
  it("self-test.yml gates the contract suite on every pull request", () => {
    expect(
      Bun.file(WORKFLOW_SELF_TEST).size,
      `expected ${WORKFLOW_SELF_TEST} to exist`,
    ).toBeGreaterThan(0);
    const workflow = loadYaml(WORKFLOW_SELF_TEST);
    const on = onSection(workflow);
    expect(Object.keys(on), "contract suite must gate every pull request").toContain(
      "pull_request",
    );
    expect(dig(on, "push", "branches"), "main must stay proven after merge").toStrictEqual([
      "main",
    ]);

    expect(dig(workflow, "permissions", "contents")).toBe("read");
    expect(
      dig(workflow, "permissions", "pull-requests"),
      "read-only gate needs no write scope",
    ).toBeUndefined();

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

  // The sign-in step's branches are proven against a stub wp in
  // setup-wp-auth.test.ts. This job proves the one branch a stub cannot: the
  // in-repo action installs a real published pre-login release with auth auto
  // and NO id-token, and leaves the job signed out and unchanged.
  it("self-test.yml proves the setup-wp sign-in skip path live without an id-token", () => {
    const workflow = loadYaml(WORKFLOW_SELF_TEST);
    expect(dig(workflow, "permissions", "id-token")).toBeUndefined();

    const job = dig(workflow, "jobs", "setup-wp-live-skip");
    expect(job, "expected a `setup-wp-live-skip` job").toBeDefined();
    expect(dig(job, "needs")).toBe("contract-tests");
    expect(dig(job, "permissions")).toStrictEqual({ contents: "read" });

    const steps = stepsOf(job);
    const checkout = steps.find((step) => String(step["uses"]).startsWith("actions/checkout@"));
    expect(dig(checkout, "with", "persist-credentials")).toBe(false);
    const setup = steps.find((step) => step["uses"] === "./.github/actions/setup-wp");
    expect(setup, "the job must run the in-repo action").toBeDefined();
    expect(digString(setup, "with", "version")).toBe("0.0.21");
    expect(digString(setup, "with", "auth")).toBe("auto");
    expect(dig(setup, "with", "entitlement")).toBeUndefined();

    const assertion = steps
      .slice(steps.indexOf(setup as YamlRecord) + 1)
      .map((step) => step["run"])
      .join("\n");
    expect(assertion).toInclude("command -v wp");
    expect(assertion).toInclude("WP_INSTALL_DIR");
    expect(assertion).toInclude("WEBPRESSO_HOME");
  });
});
