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
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  const githubOutput = join(dir, "github_output");
  writeFileSync(githubPath, "");
  writeFileSync(githubEnv, "");
  writeFileSync(githubOutput, "");
  const result = spawnSync("bash", [scriptPath], {
    encoding: "utf8",
    env: {
      PATH: process.env["PATH"] ?? "",
      RUNNER_TEMP: dir,
      GITHUB_PATH: githubPath,
      GITHUB_ENV: githubEnv,
      GITHUB_OUTPUT: githubOutput,
      ...env,
    },
  });
  return {
    dir,
    result,
    githubPath: readFileSync(githubPath, "utf8"),
    githubEnv: readFileSync(githubEnv, "utf8"),
    githubOutput: readFileSync(githubOutput, "utf8"),
  };
}

const STEP = {
  era: "Classify the pinned wp release",
  binary: "Install wp binary from the public release repository",
  archive: "Install wp from its verified release archive",
  packageRootNotice: "Note the package-root no-op for archive releases",
  packageRoot: "Install wp package root",
} as const;

function step(name: string): Record<string, unknown> {
  const found = steps.find((candidate) => candidate["name"] === name);
  if (!found) throw new Error(`expected a setup-wp step named '${name}'`);
  return found;
}

function runBody(name: string): string {
  const body = step(name)["run"];
  if (typeof body !== "string") {
    throw new Error(`expected setup-wp step '${name}' to be a run step`);
  }
  return body;
}

function installScript(): string {
  return runBody(STEP.binary);
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
    const installEnv = Object.keys(asRecord(dig(step(STEP.binary), "env"), `${STEP.binary} env`));
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
    expect(dig(step(STEP.packageRoot), "if")).toBe(
      "${{ inputs.package-root == 'true' && steps.era.outputs.archive != 'true' }}",
    );

    // The env exports belong to the opt-in step only; a default install must
    // not point wp at a package root it never fetched.
    const install = installScript();
    for (const name of ["WEBPRESSO_AGENT_KIT_ROOT", "WP_AGENT_KIT_PACKAGE_ROOT", "NODE_PATH"]) {
      expect(install, `${name} must not be exported by the binary install`).not.toInclude(name);
    }
  });

  it("fails loudly when the package root has no catalog", () => {
    // The caller-visible contract is the catalog, not "a tarball extracted".
    // wp setup/sync/audit resolve templates and blueprint migrations from it,
    // so a root without catalog/ is useless and must not pass silently.
    const body = runBody(STEP.packageRoot);
    expect(body).toMatch(/catalog[\s\S]{0,200}exit \d/u);
  });

  it("reads the package root from the public release, with no token and no fallback", () => {
    const body = runBody(STEP.packageRoot);

    // Same release as the binary: one source, one version axis.
    expect(body).toInclude("${WP_RELEASE_REPO}/releases/download/v${WP_VERSION}");

    // No credential anywhere in the step, and no private-repo escape hatch.
    // Both existed before and cost the same two things every time: a cross-repo
    // token, and a pin to the retired 3.x line, because the public 0.0.x line
    // has no matching source tag. A "fallback" would have preserved both and
    // let a misconfigured caller drift back onto the retired line silently.
    expect(body).not.toInclude("GITHUB_TOKEN");
    expect(body).not.toInclude("Authorization");
    // The source-tarball API endpoint specifically -- the word "tarball" also
    // appears in the error text that tells a maintainer to publish the asset.
    expect(body).not.toMatch(/\/tarball\//u);
    expect(body).not.toInclude("api.github.com");
    expect(action).not.toHaveProperty("inputs.github-token");
    expect(dig(action, "inputs", "package-root-repo")).toBeUndefined();
    expect(dig(action, "inputs", "package-root-ref")).toBeUndefined();
  });
});

/** The archive target for the machine running the suite, as setup-wp derives it. */
const TARGET = `${process.platform === "darwin" ? "darwin" : "linux"}-${process.arch === "arm64" ? "arm64" : "x64"}`;

/**
 * A fake wp: `self install --from <bundle>` lays out versions/<v>/bin/wp the way
 * the real installer does, `self activate <v>` records the call. Anything else
 * fails, so an unexpected invocation cannot pass silently.
 */
const FAKE_WP = `#!/bin/sh
set -eu
home="\${WEBPRESSO_HOME:?WEBPRESSO_HOME must be exported}"
case "$1 $2" in
  "self install")
    [ "$3" = "--from" ] || exit 90
    [ "$5" = "--no-activate" ] || exit 91
    mkdir -p "$home/versions/$FAKE_WP_VERSION/bin"
    cp "$0" "$home/versions/$FAKE_WP_VERSION/bin/wp"
    echo "install $4" >> "$home/calls.log" ;;
  "self activate")
    echo "activate $3" >> "$home/calls.log" ;;
  *) exit 92 ;;
esac
`;

/** Publishes one archive release under a file:// host and returns its pieces. */
function publishRelease(version: string, options: { sidecarSha?: string; tinyArchive?: boolean } = {}) {
  const host = makeTempDir("setup-wp-release-host-");
  const tree = makeTempDir("setup-wp-archive-tree-");
  mkdirSync(join(tree, "bin"));
  writeFileSync(join(tree, "bin", "wp"), FAKE_WP.replaceAll("$FAKE_WP_VERSION", version), { mode: 0o755 });
  // Incompressible padding keeps the archive above the 1 MiB truncation floor.
  if (!options.tinyArchive) writeFileSync(join(tree, "blob"), randomBytes(1_200_000));
  const releaseDir = join(host, "webpresso", "app-releases", "releases", "download", `v${version}`);
  mkdirSync(releaseDir, { recursive: true });
  const archive = join(releaseDir, `wp-${TARGET}.tar.gz`);
  const tar = spawnSync("tar", ["-czf", archive, "-C", tree, "."], { encoding: "utf8" });
  if (tar.status !== 0) throw new Error(tar.stderr);
  const sha256 = createHash("sha256").update(readFileSync(archive)).digest("hex");
  const sidecar = {
    schema: 1,
    version,
    target: TARGET,
    archive: `wp-${TARGET}.tar.gz`,
    sha256: options.sidecarSha ?? sha256,
  };
  writeFileSync(`${archive}.json`, `${JSON.stringify(sidecar, null, 2)}\n`);
  return { hostUrl: `file://${host}`, sha256 };
}

function runArchiveInstall(version: string, env: Readonly<Record<string, string>>) {
  const toolCache = env["RUNNER_TOOL_CACHE"] ?? makeTempDir("setup-wp-archive-cache-");
  const run = runScript(runBody(STEP.archive), {
    WP_VERSION: version,
    WP_RELEASE_REPO: "webpresso/app-releases",
    WP_RELEASE_HOST: "file:///nonexistent-release-host",
    WP_CHECKSUM: "",
    RUNNER_TOOL_CACHE: toolCache,
    ...env,
  });
  const home = join(toolCache, "webpresso");
  const calls = existsSync(join(home, "calls.log")) ? readFileSync(join(home, "calls.log"), "utf8") : "";
  return { ...run, home, calls };
}

describe("setup-wp release classification", () => {
  it("routes 0.0.14 and later, prereleases included, to the install archive", () => {
    const cases: Record<string, string> = {
      "0.0.13": "false",
      "0.0.4": "false",
      "0.0.14": "true",
      "0.0.14-rc.1": "true",
      "0.0.15": "true",
      "0.1.0": "true",
      "1.0.0": "true",
    };
    for (const [version, archive] of Object.entries(cases)) {
      const { result, githubOutput } = runScript(runBody(STEP.era), { WP_VERSION: version });
      expect(result.status, result.stdout + result.stderr).toBe(0);
      expect(githubOutput.trim(), version).toBe(`archive=${archive}`);
    }
  });

  it("rejects a range, a dist-tag, or anything else that is not exact semver", () => {
    for (const version of ["1.2", "^3.3.6", "latest", ""]) {
      const { result, githubOutput } = runScript(runBody(STEP.era), { WP_VERSION: version });
      expect(result.status, `expected '${version}' to be rejected`).toBe(2);
      expect(result.stdout).toInclude("must be exact semver");
      expect(githubOutput).toBe("");
    }
  });

  it("runs exactly one install path per release era", () => {
    expect(dig(step(STEP.binary), "if")).toBe("${{ steps.era.outputs.archive != 'true' }}");
    expect(dig(step(STEP.archive), "if")).toBe("${{ steps.era.outputs.archive == 'true' }}");
    expect(dig(step(STEP.packageRootNotice), "if")).toBe(
      "${{ inputs.package-root == 'true' && steps.era.outputs.archive == 'true' }}",
    );
  });
});

describe("setup-wp archive install", () => {
  it("downloads from the public release host with no API call, no token, and no python3", () => {
    const script = runBody(STEP.archive);
    expect(script).toInclude('base="${WP_RELEASE_HOST}/${WP_RELEASE_REPO}/releases/download/v${WP_VERSION}"');
    expect(script).not.toInclude("api.github.com");
    expect(code(script)).not.toInclude("python3");
    expect(dig(action, "inputs", "release-host", "default")).toBe("https://github.com");
    const env = Object.keys(asRecord(dig(step(STEP.archive), "env"), `${STEP.archive} env`));
    expect(env).toStrictEqual(["WP_VERSION", "WP_RELEASE_REPO", "WP_RELEASE_HOST", "WP_CHECKSUM"]);
  });

  it("never exports the legacy package-root variables", () => {
    const script = code(runBody(STEP.archive));
    for (const name of ["WEBPRESSO_PACKAGE_ROOT", "WEBPRESSO_AGENT_KIT_ROOT", "NODE_PATH"]) {
      expect(script, name).not.toInclude(name);
    }
  });

  it("installs through the archive's own wp, then puts the pinned version directory on PATH", () => {
    const release = publishRelease("0.0.99");
    const { result, githubPath, githubEnv, home, calls } = runArchiveInstall("0.0.99", {
      WP_RELEASE_HOST: release.hostUrl,
      WP_CHECKSUM: release.sha256,
    });

    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(calls.trim().split("\n")).toStrictEqual([
      expect.stringMatching(/^install .*webpresso-wp-bundle-0\.0\.99$/u),
      "activate 0.0.99",
    ]);
    // The pinned version's own directory, not the shared bin/wp link, so a
    // concurrent job pinning another version cannot redirect this one.
    expect(githubPath.trim()).toBe(join(home, "versions", "0.0.99", "bin"));
    expect(githubEnv).toInclude(`WEBPRESSO_HOME=${home}\n`);
    expect(githubEnv).toInclude(`WP_INSTALL_DIR=${join(home, "versions", "0.0.99", "bin")}\n`);
  });

  it("re-verifies an installed version through activation without downloading", () => {
    const toolCache = makeTempDir("setup-wp-archive-hit-");
    const bin = join(toolCache, "webpresso", "versions", "0.0.98", "bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "wp"), FAKE_WP.replaceAll("$FAKE_WP_VERSION", "0.0.98"), { mode: 0o755 });

    // The default host does not exist: any download attempt fails the step.
    const { result, calls } = runArchiveInstall("0.0.98", { RUNNER_TOOL_CACHE: toolCache });

    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toInclude("already installed");
    expect(calls.trim()).toBe("activate 0.0.98");
  });

  it("fails before installing when the caller checksum does not match", () => {
    const release = publishRelease("0.0.97");
    const { result, calls } = runArchiveInstall("0.0.97", {
      WP_RELEASE_HOST: release.hostUrl,
      WP_CHECKSUM: "0".repeat(64),
    });
    expect(result.status).toBe(5);
    expect(result.stdout).toInclude("sha256 mismatch");
    expect(calls).toBe("");
  });

  it("fails before installing when the archive disagrees with its sidecar", () => {
    const release = publishRelease("0.0.96", { sidecarSha: "f".repeat(64) });
    const { result, calls } = runArchiveInstall("0.0.96", { WP_RELEASE_HOST: release.hostUrl });
    expect(result.status).toBe(7);
    expect(result.stdout).toInclude("does not match its");
    expect(calls).toBe("");
  });

  it("refuses a truncated archive", () => {
    const release = publishRelease("0.0.95", { tinyArchive: true });
    const { result, calls } = runArchiveInstall("0.0.95", { WP_RELEASE_HOST: release.hostUrl });
    expect(result.status).toBe(4);
    expect(calls).toBe("");
  });

  it("names the missing asset when the release does not publish it", () => {
    const { result } = runArchiveInstall("0.0.94", {});
    expect(result.status).toBe(6);
    expect(result.stdout).toInclude(`wp-${TARGET}.tar.gz`);
  });
});
