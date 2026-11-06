/**
 * Release-asset contract for `setup-wp`: one install archive per target plus a
 * digest sidecar. The action's shell is executed for real against a fixture
 * archive; `curl` and `uname` are stubbed on PATH so no network is used and
 * every supported platform can be exercised from any host.
 */

import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ACTION_SETUP_WP, asRecord, dig, loadYaml, makeTempDir } from "./helpers.ts";

/** `uname -s`/`uname -m` pair -> release target. The single source of truth for this suite. */
const SUPPORTED_TARGETS = {
  "Linux/x86_64": "linux-x64",
  "Linux/aarch64": "linux-arm64",
  "Darwin/x86_64": "darwin-x64",
  "Darwin/arm64": "darwin-arm64",
} as const;
type Target = (typeof SUPPORTED_TARGETS)[keyof typeof SUPPORTED_TARGETS];

const archiveName = (target: Target): string => `wp-${target}.tar.gz`;
const sidecarName = (target: Target): string => `${archiveName(target)}.json`;

const VERSION = "1.2.3";
const RELEASE_REPO = "webpresso/app-releases";
const BASE_URL = `https://github.com/${RELEASE_REPO}/releases/download/v${VERSION}`;
const FIXTURE_BIN = "#!/bin/sh\necho wp fixture\n";

const action = loadYaml(ACTION_SETUP_WP);
const installScript = (() => {
  const steps = dig(action, "runs", "steps");
  if (!Array.isArray(steps)) throw new Error("expected runs.steps");
  const run = asRecord(steps[0], "runs.steps[0]")["run"];
  if (typeof run !== "string") throw new Error("expected a run step");
  return run;
})();

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

type FixtureOptions = { readonly target: Target; readonly withCatalog?: boolean; readonly sidecarSha?: string };

/** Build the release asset directory the stub `curl` serves from. */
function buildFixture({ target, withCatalog = true, sidecarSha }: FixtureOptions): string {
  const root = makeTempDir("setup-wp-fixture-");
  const content = join(root, "content");
  mkdirSync(join(content, "bin"), { recursive: true });
  writeFileSync(join(content, "bin", "wp"), FIXTURE_BIN);
  chmodSync(join(content, "bin", "wp"), 0o755);
  mkdirSync(join(content, "package-root", withCatalog ? "catalog" : "dist"), { recursive: true });
  writeFileSync(join(content, "package-root", withCatalog ? "catalog" : "dist", "x"), "x\n");
  writeFileSync(join(content, "manifest.json"), "{}\n");

  const assets = join(root, "assets");
  mkdirSync(assets);
  const archivePath = join(assets, archiveName(target));
  const tar = spawnSync("tar", ["-czf", archivePath, "-C", content, "bin", "package-root", "manifest.json"], {
    encoding: "utf8",
  });
  if (tar.status !== 0) throw new Error(`fixture tar failed: ${tar.stderr}`);

  const sidecar = {
    schema: 1,
    version: VERSION,
    target,
    archive: archiveName(target),
    sha256: sidecarSha ?? sha256(readFileSync(archivePath)),
  };
  writeFileSync(join(assets, sidecarName(target)), `${JSON.stringify(sidecar)}\n`);
  return assets;
}

function writeStubs(os: string, arch: string): string {
  const dir = makeTempDir("setup-wp-stubs-");
  writeFileSync(
    join(dir, "curl"),
    [
      "#!/bin/bash",
      'out=""; url=""',
      'while [[ $# -gt 0 ]]; do',
      '  case "$1" in -o) out="$2"; shift 2 ;; -*) shift ;; *) url="$1"; shift ;; esac',
      "done",
      'echo "${url}" >> "${CURL_LOG}"',
      'src="${FIXTURE_ASSETS}/$(basename "${url}")"',
      '[[ -f "${src}" ]] || exit 22',
      'cp "${src}" "${out}"',
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(dir, "uname"),
    `#!/bin/bash\ncase "$1" in -s) echo "${os}" ;; -m) echo "${arch}" ;; *) echo "${os}" ;; esac\n`,
  );
  chmodSync(join(dir, "curl"), 0o755);
  chmodSync(join(dir, "uname"), 0o755);
  return dir;
}

type RunOptions = FixtureOptions & {
  readonly platform?: string;
  readonly packageRoot?: boolean;
  readonly checksum?: string;
};

function runAction(options: RunOptions) {
  const [os, arch] = (options.platform ?? "Linux/x86_64").split("/") as [string, string];
  const assets = buildFixture(options);
  const stubs = writeStubs(os, arch);
  const dir = makeTempDir("setup-wp-run-");
  const githubPath = join(dir, "github_path");
  const githubEnv = join(dir, "github_env");
  const curlLog = join(dir, "curl.log");
  for (const file of [githubPath, githubEnv, curlLog]) writeFileSync(file, "");
  const scriptPath = join(dir, "step.sh");
  writeFileSync(scriptPath, installScript);
  const result = spawnSync("bash", [scriptPath], {
    encoding: "utf8",
    env: {
      PATH: `${stubs}:${process.env["PATH"] ?? ""}`,
      RUNNER_TEMP: dir,
      RUNNER_TOOL_CACHE: join(dir, "toolcache"),
      GITHUB_PATH: githubPath,
      GITHUB_ENV: githubEnv,
      FIXTURE_ASSETS: assets,
      CURL_LOG: curlLog,
      WP_VERSION: VERSION,
      WP_RELEASE_REPO: RELEASE_REPO,
      WP_CHECKSUM: options.checksum ?? "",
      WP_PACKAGE_ROOT: options.packageRoot === true ? "true" : "false",
    },
  });
  return {
    result,
    dir,
    output: result.stdout + result.stderr,
    githubEnv: readFileSync(githubEnv, "utf8"),
    curlUrls: readFileSync(curlLog, "utf8").split("\n").filter(Boolean),
  };
}

describe("setup-wp install archive contract", () => {
  it("pins the supported targets and asset names the action text agrees with", () => {
    expect(Object.keys(SUPPORTED_TARGETS).length).toBeGreaterThan(0);
    for (const [platform, target] of Object.entries(SUPPORTED_TARGETS)) {
      const [os, arch] = platform.split("/");
      expect(installScript, `${platform} -> ${target}`).toMatch(
        new RegExp(`${os}/${arch}[^\\n]*target="${target}"`, "u"),
      );
    }
    expect(installScript).toInclude('archive_name="wp-${target}.tar.gz"');
    expect(installScript).toInclude('sidecar_name="${archive_name}.json"');
  });

  for (const [platform, target] of Object.entries(SUPPORTED_TARGETS)) {
    it(`downloads exactly ${archiveName(target)} and its sidecar on ${platform}`, () => {
      const run = runAction({ target, platform });
      expect(run.result.status, run.output).toBe(0);
      expect(run.curlUrls).toStrictEqual([`${BASE_URL}/${archiveName(target)}`, `${BASE_URL}/${sidecarName(target)}`]);
    });
  }

  it("installs bin/wp from the archive and exports the install dir", () => {
    const run = runAction({ target: "linux-x64" });
    expect(run.result.status, run.output).toBe(0);
    const installed = join(run.dir, "webpresso-wp", "wp");
    expect(readFileSync(installed, "utf8")).toBe(FIXTURE_BIN);
    expect(lstatSync(installed).mode & 0o111).not.toBe(0);
    expect(run.githubEnv).toInclude(`WP_INSTALL_DIR=${join(run.dir, "webpresso-wp")}`);
    expect(run.githubEnv).not.toInclude("WEBPRESSO_PACKAGE_ROOT");
  });

  it("extracts package-root/ from the same archive with no second download", () => {
    const run = runAction({ target: "linux-x64", packageRoot: true });
    expect(run.result.status, run.output).toBe(0);
    expect(run.curlUrls).toHaveLength(2);
    const packageRoot = join(run.dir, "webpresso-wp-package-root");
    expect(existsSync(join(packageRoot, "catalog", "x"))).toBe(true);
    expect(run.githubEnv).toInclude(`WEBPRESSO_PACKAGE_ROOT=${packageRoot}`);
    expect(run.githubEnv).toInclude("NODE_PATH=");
    expect(lstatSync(join(run.dir, "webpresso-node-modules", "@webpresso", "agent-kit")).isSymbolicLink()).toBe(true);
  });

  it("accepts a matching checksum for the extracted bin/wp", () => {
    const run = runAction({ target: "linux-x64", checksum: sha256(FIXTURE_BIN) });
    expect(run.result.status, run.output).toBe(0);
    expect(run.output).toInclude("sha256 verified");
  });

  it("fails with a named error on a checksum input mismatch", () => {
    const run = runAction({ target: "linux-x64", checksum: "0".repeat(64) });
    expect(run.result.status, run.output).toBe(5);
    expect(run.output).toInclude("::error::sha256 mismatch for bin/wp");
  });

  it("fails with a named error when the archive sha256 differs from the sidecar", () => {
    const run = runAction({ target: "linux-x64", sidecarSha: "f".repeat(64) });
    expect(run.result.status, run.output).toBe(8);
    expect(run.output).toInclude("::error::sha256 mismatch for wp-linux-x64.tar.gz");
    expect(existsSync(join(run.dir, "webpresso-wp", "wp"))).toBe(false);
  });

  it("fails closed with a named error when package-root/ has no catalog/", () => {
    const run = runAction({ target: "linux-x64", packageRoot: true, withCatalog: false });
    expect(run.result.status, run.output).toBe(12);
    expect(run.output).toInclude("::error::wp-linux-x64.tar.gz package-root/ has no catalog/");
    expect(run.githubEnv).not.toInclude("WEBPRESSO_PACKAGE_ROOT");
  });
});
