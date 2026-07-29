/**
 * Behavioral contracts for the `setup-wp` composite action.
 *
 * The install script is extracted from the action YAML and executed with
 * `bash` — the same shell the runner uses — so the cache short-circuit and the
 * input validation are proven, not just read. The one path that would need the
 * network (a cache miss) is asserted structurally instead.
 */

import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ACTION_SETUP_WP, asRecord, dig, loadYaml, makeTempDir } from "./helpers.ts";

const action = loadYaml(ACTION_SETUP_WP);

const steps = (() => {
  const value = dig(action, "runs", "steps");
  if (!Array.isArray(value)) {
    throw new Error("expected runs.steps in setup-wp/action.yml");
  }
  return value.map((step, index) => asRecord(step, `runs.steps[${index}]`));
})();

function runScript(body: string, env: Readonly<Record<string, string>>) {
  const dir = makeTempDir("setup-wp-script-");
  const scriptPath = join(dir, "step.sh");
  writeFileSync(scriptPath, body);
  const githubPath = join(dir, "github_path");
  const githubEnv = join(dir, "github_env");
  writeFileSync(githubPath, "");
  writeFileSync(githubEnv, "");
  const result = spawnSync("bash", [scriptPath], {
    encoding: "utf8",
    env: {
      PATH: process.env["PATH"] ?? "",
      RUNNER_TEMP: dir,
      GITHUB_PATH: githubPath,
      GITHUB_ENV: githubEnv,
      ...env,
    },
  });
  return { dir, result, githubPath: readFileSync(githubPath, "utf8"), githubEnv: readFileSync(githubEnv, "utf8") };
}

function runBody(index: number): string {
  const body = steps[index]?.["run"];
  if (typeof body !== "string") {
    throw new Error(`expected runs.steps[${index}] to be a run step`);
  }
  return body;
}

function installScript(): string {
  return runBody(0);
}

/**
 * The shell that actually executes, with comment lines removed. The comments
 * explain *why* a rule exists and necessarily name the thing being banned
 * (`python3`, `wp --version`), so a ban asserted over raw text would forbid
 * documenting the ban.
 */
function code(body: string): string {
  return body
    .split("\n")
    .filter((line) => !/^\s*#/u.test(line))
    .join("\n");
}

/** The tool-cache arch segment for the machine running the suite. */
const TOOL_ARCH = process.arch === "arm64" ? "arm64" : "x64";

describe("setup-wp binary install", () => {
  it("downloads from the public release repo with no API call, no token, and no python3", () => {
    expect(dig(action, "inputs", "release-repo", "default")).toBe("webpresso/app-releases");

    const script = installScript();
    expect(script).toInclude('https://github.com/${WP_RELEASE_REPO}/releases/download/v${WP_VERSION}/${asset}');
    expect(script).not.toInclude("api.github.com");
    expect(script, "the asset host redirects; curl must follow it").toInclude("curl -fsSL");
    expect(code(script), "the runner image must not need a python3 for this").not.toInclude("python3");

    // The install step must not be able to see a token at all: a public
    // download that quietly depends on one is how the private-repo coupling
    // came back last time.
    const installEnv = Object.keys(asRecord(dig(steps[0], "env"), "runs.steps[0].env"));
    expect(installEnv).toStrictEqual(["WP_VERSION", "WP_RELEASE_REPO", "WP_CHECKSUM"]);
  });

  it("never identifies an installed binary by `wp --version`", () => {
    // Every published standalone binary prints 0.0.0 (it reports the product
    // axis from a package root it does not carry), so any equality assertion
    // against the pinned version is guaranteed to fail.
    for (const body of steps.map((step) => step["run"]).filter((body): body is string => typeof body === "string")) {
      expect(code(body)).not.toMatch(/wp\s+--version/u);
    }
  });

  it("short-circuits on the tool cache before touching the network", () => {
    const script = installScript();
    expect(script.indexOf("RUNNER_TOOL_CACHE")).toBeLessThan(script.indexOf("curl -fsSL"));
    expect(script).toInclude('cache_root="${RUNNER_TOOL_CACHE:-/opt/hostedtoolcache}/wp/${WP_VERSION}/${tool_arch}"');
  });

  it("puts a cached wp on PATH without downloading anything", () => {
    const cacheRoot = makeTempDir("setup-wp-toolcache-");
    const versionDir = join(cacheRoot, "wp", "9.9.9", TOOL_ARCH);
    mkdirSync(versionDir, { recursive: true });
    const cachedBinary = join(versionDir, "wp");
    writeFileSync(cachedBinary, "#!/bin/sh\nexit 0\n");
    chmodSync(cachedBinary, 0o755);

    const { result, githubPath, githubEnv } = runScript(installScript(), {
      WP_VERSION: "9.9.9",
      // A repository that cannot resolve: any download attempt fails the step.
      WP_RELEASE_REPO: "webpresso/does-not-exist",
      WP_CHECKSUM: "",
      RUNNER_TOOL_CACHE: cacheRoot,
    });

    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toInclude("tool-cache hit");
    expect(result.stdout).not.toInclude("downloading");
    expect(githubPath.trim()).toBe(versionDir);
    expect(githubEnv.trim()).toBe(`WP_INSTALL_DIR=${versionDir}`);
  });

  it("rejects a range, a dist-tag, or anything else that is not exact semver", () => {
    for (const version of ["1.2", "^3.3.6", "latest", ""]) {
      const { result } = runScript(installScript(), {
        WP_VERSION: version,
        WP_RELEASE_REPO: "webpresso/app-releases",
        WP_CHECKSUM: "",
        RUNNER_TOOL_CACHE: makeTempDir("setup-wp-empty-cache-"),
      });
      expect(result.status, `expected '${version}' to be rejected`).toBe(2);
      expect(result.stdout).toInclude("must be exact semver");
    }
  });
});

describe("setup-wp package root", () => {
  it("is opt-in and off by default", () => {
    expect(dig(action, "inputs", "package-root", "default")).toBe("false");
    expect(dig(steps[1], "if")).toBe("${{ inputs.package-root == 'true' }}");

    // The env exports belong to the opt-in step only; a default install must
    // not point wp at a package root it never fetched.
    const install = installScript();
    for (const name of ["WEBPRESSO_AGENT_KIT_ROOT", "WP_AGENT_KIT_PACKAGE_ROOT", "NODE_PATH"]) {
      expect(install, `${name} must not be exported by the binary install`).not.toInclude(name);
    }
  });

  it("warns rather than fails when the package root lacks blueprint migrations", () => {
    const body = runBody(1);
    expect(body).toInclude("::warning::");
    expect(body).not.toMatch(/blueprint migrations[\s\S]{0,120}exit \d/u);
  });

  it("keeps accepting the callers' github-token input", () => {
    // Every reusable workflow in this repo still passes it; removing the input
    // would make each of them log an unexpected-input warning.
    expect(dig(action, "inputs", "github-token", "required")).toBe(false);
    expect(dig(action, "inputs", "github-token", "default")).toBe("");
  });
});
