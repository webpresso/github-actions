/**
 * Release-asset contract for `setup-wp`: one install archive per target plus a
 * digest sidecar. The action's shell is executed for real against a fixture
 * archive; `curl` and `uname` are stubbed on PATH so no network is used and
 * every supported platform can be exercised from any host.
 */

import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
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

type TarEntryType = "file" | "dir" | "symlink" | "hardlink" | "chardev";
type TarEntry = {
  readonly name: string;
  readonly type: TarEntryType;
  readonly content?: string;
  readonly linkname?: string;
};

const TAR_TYPEFLAG: Record<TarEntryType, string> = { file: "0", dir: "5", symlink: "2", hardlink: "1", chardev: "3" };

/** Minimal ustar writer: lets a test emit entries the `tar` CLI refuses to create (`../x`, `/abs`). */
function tarGz(entries: readonly TarEntry[]): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const body = Buffer.from(entry.content ?? "");
    const header = Buffer.alloc(512);
    header.write(entry.name, 0, 100, "utf8");
    header.write(entry.type === "dir" ? "0000755\0" : "0000644\0", 100);
    header.write("0000000\0", 108);
    header.write("0000000\0", 116);
    header.write(`${body.length.toString(8).padStart(11, "0")}\0`, 124);
    header.write("00000000000\0", 136);
    header.write("        ", 148);
    header.write(TAR_TYPEFLAG[entry.type], 156);
    header.write(entry.linkname ?? "", 157, 100, "utf8");
    header.write("ustar\0", 257);
    header.write("00", 263);
    const sum = header.reduce((total, byte) => total + byte, 0);
    header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148);
    blocks.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

const GOOD_ENTRIES: readonly TarEntry[] = [
  { name: "bin/", type: "dir" },
  { name: "bin/wp", type: "file", content: FIXTURE_BIN },
  { name: "package-root/", type: "dir" },
  { name: "package-root/catalog/", type: "dir" },
  { name: "package-root/catalog/x", type: "file", content: "x\n" },
];

type FixtureOptions = {
  readonly target: Target;
  readonly withCatalog?: boolean;
  readonly sidecarSha?: string;
  /** Replace the archive with one built from these raw entries. */
  readonly entries?: readonly TarEntry[];
  /** Replace the sidecar file body verbatim. */
  readonly sidecarText?: string;
  /** Per-field overrides of the generated sidecar object. */
  readonly sidecarOverrides?: Readonly<Record<string, string>>;
  /** Do not publish the sidecar, so the stub curl fails its download. */
  readonly omitSidecar?: boolean;
};

/** Build the release asset directory the stub `curl` serves from. */
function buildFixture({
  target,
  withCatalog = true,
  sidecarSha,
  entries,
  sidecarText,
  sidecarOverrides,
  omitSidecar = false,
}: FixtureOptions): string {
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
  if (entries === undefined) {
    const tar = spawnSync("tar", ["-czf", archivePath, "-C", content, "bin", "package-root", "manifest.json"], {
      encoding: "utf8",
    });
    if (tar.status !== 0) throw new Error(`fixture tar failed: ${tar.stderr}`);
  } else {
    writeFileSync(archivePath, tarGz(entries));
  }

  const sidecar = {
    schema: 1,
    version: VERSION,
    target,
    archive: archiveName(target),
    sha256: sidecarSha ?? sha256(readFileSync(archivePath)),
    ...sidecarOverrides,
  };
  if (!omitSidecar) {
    writeFileSync(join(assets, sidecarName(target)), sidecarText ?? `${JSON.stringify(sidecar)}\n`);
  }
  return assets;
}

/**
 * `tar` stubs. "record" logs every call and extracts nothing. "plant" lists a
 * benign archive but, on extraction, plants a symlink at `$PLANT` inside the
 * stage dir, to exercise the post-extraction guard independently of the listing.
 */
type TarStub = "record" | "plant-bin-wp" | "plant-package-root";

function tarStubScript(mode: TarStub): string {
  const lines = ['#!/bin/bash', 'echo "$*" >> "${TAR_LOG}"'];
  if (mode === "record") return `${lines.join("\n")}\nexit 0\n`;
  const plant =
    mode === "plant-bin-wp"
      ? 'mkdir -p "${stage}/bin"; ln -s /bin/sh "${stage}/bin/wp"'
      : 'mkdir -p "${stage}/bin"; echo x > "${stage}/bin/wp"; ln -s /tmp "${stage}/package-root"';
  return [
    ...lines,
    'case "$1" in',
    '  -tzf) echo "bin/wp"; exit 0 ;;',
    '  -tzvf) echo "-rwxr-xr-x 0/0 5 2020-01-01 00:00 bin/wp"; exit 0 ;;',
    "esac",
    'stage=""; while [[ $# -gt 0 ]]; do case "$1" in -C) stage="$2"; shift 2 ;; *) shift ;; esac; done',
    plant,
    "",
  ].join("\n");
}

function writeStubs(os: string, arch: string, tarStub?: TarStub): string {
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
  if (tarStub !== undefined) {
    writeFileSync(join(dir, "tar"), tarStubScript(tarStub));
    chmodSync(join(dir, "tar"), 0o755);
  }
  return dir;
}

type RunOptions = FixtureOptions & {
  readonly platform?: string;
  readonly packageRoot?: boolean;
  readonly checksum?: string;
  readonly tarStub?: TarStub;
};

function runAction(options: RunOptions) {
  const [os, arch] = (options.platform ?? "Linux/x86_64").split("/") as [string, string];
  const assets = buildFixture(options);
  const stubs = writeStubs(os, arch, options.tarStub);
  const dir = makeTempDir("setup-wp-run-");
  const githubPath = join(dir, "github_path");
  const githubEnv = join(dir, "github_env");
  const curlLog = join(dir, "curl.log");
  const tarLog = join(dir, "tar.log");
  for (const file of [githubPath, githubEnv, curlLog, tarLog]) writeFileSync(file, "");
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
      TAR_LOG: tarLog,
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
    tarCalls: readFileSync(tarLog, "utf8").split("\n").filter(Boolean),
    stage: join(dir, "webpresso-wp-archive", "stage"),
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

  describe("failure exits", () => {
    it("exits 6 with a named error when the sidecar download fails", () => {
      const run = runAction({ target: "linux-x64", omitSidecar: true });
      expect(run.result.status, run.output).toBe(6);
      expect(run.output).toInclude(`::error::download failed for ${BASE_URL}/${sidecarName("linux-x64")}`);
      expect(existsSync(join(run.dir, "webpresso-wp", "wp"))).toBe(false);
    });

    for (const field of ["archive", "version", "target"] as const) {
      it(`exits 7 when the sidecar ${field} does not match`, () => {
        const run = runAction({ target: "linux-x64", sidecarOverrides: { [field]: "bogus" } });
        expect(run.result.status, run.output).toBe(7);
        expect(run.output).toInclude(`::error::sidecar wp-linux-x64.tar.gz.json ${field} mismatch`);
        expect(run.output).toInclude("got 'bogus'");
        expect(existsSync(join(run.dir, "webpresso-wp", "wp"))).toBe(false);
      });
    }

    for (const [label, sidecarText] of [
      ["malformed", "{not json at all"],
      ["empty", ""],
    ] as const) {
      it(`exits 7 on ${label} sidecar JSON`, () => {
        const run = runAction({ target: "linux-x64", sidecarText });
        expect(run.result.status, run.output).toBe(7);
        expect(run.output).toInclude("::error::sidecar wp-linux-x64.tar.gz.json archive mismatch");
        expect(existsSync(join(run.dir, "webpresso-wp", "wp"))).toBe(false);
      });
    }

    it("exits 9 when the archive has no bin/wp", () => {
      const run = runAction({
        target: "linux-x64",
        entries: GOOD_ENTRIES.filter((entry) => !entry.name.startsWith("bin/")),
      });
      expect(run.result.status, run.output).toBe(9);
      expect(run.output).toInclude("::error::wp-linux-x64.tar.gz has no bin/wp");
      expect(existsSync(join(run.dir, "webpresso-wp", "wp"))).toBe(false);
    });

    it("exits 11 when package-root is requested but absent from the archive", () => {
      const run = runAction({
        target: "linux-x64",
        packageRoot: true,
        entries: GOOD_ENTRIES.filter((entry) => !entry.name.startsWith("package-root")),
      });
      expect(run.result.status, run.output).toBe(11);
      expect(run.output).toInclude("::error::wp-linux-x64.tar.gz has no package-root/");
      expect(run.githubEnv).not.toInclude("WEBPRESSO_PACKAGE_ROOT");
    });
  });

  describe("hostile archives are refused before extraction", () => {
    const escapeDir = makeTempDir("setup-wp-escape-");
    const absoluteTarget = join(escapeDir, "absolute-escape");
    const hostile: readonly (readonly [string, TarEntry, string])[] = [
      ["symlink", { name: "evil-link", type: "symlink", linkname: "/etc/passwd" }, "evil-link"],
      ["hardlink", { name: "evil-hard", type: "hardlink", linkname: "bin/wp" }, "evil-hard"],
      ["device", { name: "evil-dev", type: "chardev" }, "evil-dev"],
      ["../ traversal", { name: "../escape", type: "file", content: "pwn\n" }, "../escape"],
      ["nested ../ traversal", { name: "bin/../../escape", type: "file", content: "pwn\n" }, "bin/../../escape"],
      ["absolute-path", { name: absoluteTarget, type: "file", content: "pwn\n" }, absoluteTarget],
    ];

    for (const [label, entry, shown] of hostile) {
      it(`refuses a ${label} entry with exit 13 and writes nothing`, () => {
        const run = runAction({ target: "linux-x64", packageRoot: true, entries: [...GOOD_ENTRIES, entry] });
        expect(run.result.status, run.output).toBe(13);
        expect(run.output).toInclude("::error::wp-linux-x64.tar.gz has");
        expect(run.output).toInclude("refusing to extract");
        expect(run.output).toInclude(shown);
        expect(readdirSync(run.stage)).toStrictEqual([]);
        expect(existsSync(join(run.dir, "webpresso-archive-escape"))).toBe(false);
        expect(existsSync(join(run.dir, "webpresso-wp-archive", "escape"))).toBe(false);
        expect(existsSync(absoluteTarget)).toBe(false);
        expect(existsSync(join(run.dir, "webpresso-wp", "wp"))).toBe(false);
        expect(existsSync(join(run.dir, "webpresso-wp-package-root"))).toBe(false);
        expect(run.githubEnv).toBe("");
      });
    }

    it("names the entry kind in the symlink, hardlink and traversal errors", () => {
      const run = runAction({
        target: "linux-x64",
        entries: [...GOOD_ENTRIES, { name: "evil-link", type: "symlink", linkname: "bin/wp" }],
      });
      expect(run.output).toInclude("non-regular entry (symlink, hardlink, or device)");
    });

    for (const [label, mode] of [
      ["bin/wp", "plant-bin-wp"],
      ["package-root", "plant-package-root"],
    ] as const) {
      it(`refuses a symlinked ${label} after extraction with exit 14 and installs no wp`, () => {
        const run = runAction({ target: "linux-x64", packageRoot: true, tarStub: mode });
        expect(run.result.status, run.output).toBe(14);
        expect(run.output).toInclude(`::error::wp-linux-x64.tar.gz extracted ${label} as a symlink; refusing to install`);
        expect(existsSync(join(run.dir, "webpresso-wp", "wp"))).toBe(false);
        expect(existsSync(join(run.dir, "webpresso-wp-package-root"))).toBe(false);
        expect(run.githubEnv).toBe("");
      });
    }
  });

  it("verifies the archive sha256 before any extraction call", () => {
    const run = runAction({ target: "linux-x64", sidecarSha: "f".repeat(64), tarStub: "record" });
    expect(run.result.status, run.output).toBe(8);
    expect(run.tarCalls).toStrictEqual([]);
  });

  it("lists the archive before the first extraction call", () => {
    const run = runAction({ target: "linux-x64", tarStub: "record" });
    const firstExtract = run.tarCalls.findIndex((call) => /^-x/u.test(call));
    const firstList = run.tarCalls.findIndex((call) => /^-t/u.test(call));
    expect(firstList).toBe(0);
    expect(firstExtract).toBeGreaterThan(firstList);
  });
});
