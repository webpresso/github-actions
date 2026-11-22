/**
 * Sign-in contract for `setup-wp` (login-only wp from 0.0.24).
 *
 * The sign-in step's shell is extracted from the action YAML and executed with
 * `bash`, exactly as the runner does. A stub `wp` in WP_INSTALL_DIR records
 * argv and stdin, writes the entitlement where the app lane's contract puts it
 * (RUNNER_TEMP/webpresso/auth when GITHUB_ACTIONS is true and RUNNER_TEMP is
 * set, else WEBPRESSO_HOME/auth), prints the token it wrote, and answers
 * `auth status --json` from a fixture, so every branch is proven without a
 * network or a real release.
 *
 * Output assertions read the raw stdout and stderr of the bash process.
 * GitHub's log masking does not run here, so masking is asserted as ordering:
 * a token's `::add-mask::` line precedes every other line that contains it.
 */

import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { ACTION_SETUP_WP, asRecord, dig, digString, loadYaml, makeTempDir } from "./helpers.ts";

const action = loadYaml(ACTION_SETUP_WP);

function signInStep() {
  const steps = dig(action, "runs", "steps");
  if (!Array.isArray(steps) || steps.length < 2)
    throw new Error("expected a sign-in step at runs.steps[1]");
  return asRecord(steps[1], "runs.steps[1]");
}

function signInScript(): string {
  const run = signInStep()["run"];
  if (typeof run !== "string") throw new Error("expected runs.steps[1] to be a run step");
  return run;
}

/** A fake but JWT-shaped CI entitlement the stub `auth ci` writes. */
const OIDC_JWT = "eyJhbGciOiJFZERTQSJ9.eyJraW5kIjoiY2kifQ.c2lnbmF0dXJlLW9pZGM";
/** A fake break-glass entitlement passed through the `entitlement` input. */
const BREAKGLASS_JWT = "eyJhbGciOiJFZERTQSJ9.eyJraW5kIjoiYnJlYWtnbGFzcyJ9.c2lnbmF0dXJlLWJn";

type Status = {
  readonly state: string;
  readonly kind: string;
};

const SIGNED_IN_CI: Status = { state: "signed-in", kind: "ci" };

const STUB_WP = [
  "#!/bin/bash",
  'printf "%s\\n" "$*" >> "${WP_STUB_DIR}/argv"',
  'printf "%s\\n" "${WEBPRESSO_HOME:-<unset>}" >> "${WP_STUB_DIR}/home"',
  // The app lane's auth-directory rule (login-only-apps D7, auth-dir.ts).
  'if [[ "${GITHUB_ACTIONS:-}" == "true" && -n "${RUNNER_TEMP:-}" ]]; then',
  '  auth_dir="${RUNNER_TEMP}/webpresso/auth"',
  "else",
  '  auth_dir="${WEBPRESSO_HOME:-${WP_STUB_DIR}/install-home}/auth"',
  "fi",
  "write_entitlement() {",
  '  [[ -n "${WP_STUB_NO_WRITE:-}" ]] && return 0',
  '  mkdir -p "${auth_dir}"',
  '  if [[ -n "${WP_STUB_SYMLINK:-}" ]]; then',
  '    printf "%s" "$1" > "${WP_STUB_DIR}/elsewhere.jwt"',
  '    ln -sf "${WP_STUB_DIR}/elsewhere.jwt" "${auth_dir}/entitlement.jwt"',
  "  else",
  '    printf "%s" "$1" > "${auth_dir}/entitlement.jwt"',
  "  fi",
  "}",
  'case "$1 $2" in',
  '  "auth ci")',
  '    [[ -n "${WP_STUB_FAIL:-}" ]] && { echo "exchange refused" >&2; exit 3; }',
  '    write_entitlement "${WP_STUB_JWT}"',
  '    echo "signed in for CI with ${WP_STUB_JWT}"',
  "    exit 0 ;;",
  '  "auth import")',
  '    cat > "${WP_STUB_DIR}/stdin"',
  '    [[ -n "${WP_STUB_FAIL:-}" ]] && { echo "entitlement rejected" >&2; exit 3; }',
  '    write_entitlement "$(cat "${WP_STUB_DIR}/stdin")"',
  '    echo "imported $(cat "${WP_STUB_DIR}/stdin")" >&2',
  "    exit 0 ;;",
  '  "auth status")',
  '    cat "${WP_STUB_STATUS}"',
  "    exit 0 ;;",
  "esac",
  "exit 64",
  "",
].join("\n");

type SignInOptions = {
  readonly version: string;
  readonly auth?: string;
  readonly entitlement?: string;
  /** Simulate `permissions: id-token: write` (the runner sets both variables). */
  readonly idToken?: boolean;
  readonly status?: Status;
  readonly fail?: boolean;
  /** The stub reports success but writes no entitlement. */
  readonly noWrite?: boolean;
  /** The stub leaves the entitlement as a symlink. */
  readonly symlinkWrite?: boolean;
  /** Leave GITHUB_ACTIONS unset (the runner always sets it to true). */
  readonly noGithubActions?: boolean;
  /** Leave RUNNER_TEMP unset. */
  readonly noRunnerTemp?: boolean;
  /** A caller-set WEBPRESSO_HOME; a function receives RUNNER_TEMP. */
  readonly presetHome?: string | ((runnerTemp: string) => string);
  /** Plant files or links under RUNNER_TEMP before the step runs. */
  readonly prepare?: (runnerTemp: string) => void;
};

function runSignIn(options: SignInOptions) {
  const script = signInScript();
  const dir = makeTempDir("setup-wp-auth-");
  const runnerTemp = join(dir, "runner-temp");
  const installDir = join(runnerTemp, "webpresso-wp");
  const stubDir = join(dir, "stub");
  mkdirSync(installDir, { recursive: true });
  mkdirSync(stubDir);
  writeFileSync(join(installDir, "wp"), STUB_WP);
  chmodSync(join(installDir, "wp"), 0o755);
  const status = options.status ?? SIGNED_IN_CI;
  const statusFile = join(dir, "status.json");
  writeFileSync(
    statusFile,
    `${JSON.stringify({
      state: status.state,
      email: null,
      org: "webpresso",
      kind: status.kind,
      expiresAt: "2026-11-18T03:00:00Z",
      refreshAfter: "2026-11-17T23:00:00Z",
    })}\n`,
  );
  const githubEnv = join(dir, "github_env");
  const githubPath = join(dir, "github_path");
  writeFileSync(githubEnv, "");
  writeFileSync(githubPath, "");
  const scriptPath = join(dir, "step.sh");
  writeFileSync(scriptPath, script);
  options.prepare?.(runnerTemp);

  const env: Record<string, string> = {
    // A PATH with no wp on it: the step must invoke the installed binary by path.
    PATH: "/usr/bin:/bin",
    GITHUB_ENV: githubEnv,
    GITHUB_PATH: githubPath,
    WP_INSTALL_DIR: installDir,
    WP_VERSION: options.version,
    WP_AUTH: options.auth ?? "auto",
    WP_ENTITLEMENT: options.entitlement ?? "",
    WP_STUB_DIR: stubDir,
    WP_STUB_JWT: OIDC_JWT,
    WP_STUB_STATUS: statusFile,
  };
  if (options.noRunnerTemp !== true) env["RUNNER_TEMP"] = runnerTemp;
  if (options.noGithubActions !== true) env["GITHUB_ACTIONS"] = "true";
  if (options.idToken === true) {
    env["ACTIONS_ID_TOKEN_REQUEST_URL"] = "https://token.actions.example/request";
    env["ACTIONS_ID_TOKEN_REQUEST_TOKEN"] = "runner-request-token";
  }
  if (options.fail === true) env["WP_STUB_FAIL"] = "1";
  if (options.noWrite === true) env["WP_STUB_NO_WRITE"] = "1";
  if (options.symlinkWrite === true) env["WP_STUB_SYMLINK"] = "1";
  if (options.presetHome !== undefined) {
    env["WEBPRESSO_HOME"] =
      typeof options.presetHome === "function"
        ? options.presetHome(runnerTemp)
        : options.presetHome;
  }

  const result = spawnSync("bash", [scriptPath], { encoding: "utf8", env });
  const read = (name: string): string => {
    const path = join(stubDir, name);
    return existsSync(path) ? readFileSync(path, "utf8") : "";
  };
  return {
    result,
    dir,
    runnerTemp,
    stdout: result.stdout,
    stderr: result.stderr,
    output: result.stdout + result.stderr,
    githubEnv: readFileSync(githubEnv, "utf8"),
    argv: read("argv").split("\n").filter(Boolean),
    homes: read("home").split("\n").filter(Boolean),
    stdin: read("stdin"),
  };
}

/**
 * Raw output never shows the runner's masking, so prove the order instead:
 * the token's mask line is on stdout, stderr never carries the token, and
 * every other stdout line containing it comes after the mask line.
 */
function expectMaskedBeforeUse(run: ReturnType<typeof runSignIn>, token: string): number[] {
  const lines = run.stdout.split("\n");
  const maskAt = lines.indexOf(`::add-mask::${token}`);
  expect(maskAt, run.output).toBeGreaterThanOrEqual(0);
  const usedAt = lines.flatMap((line, index) =>
    index !== maskAt && line.includes(token) ? [index] : [],
  );
  for (const index of usedAt) expect(index, run.output).toBeGreaterThan(maskAt);
  expect(run.stderr).not.toInclude(token);
  return usedAt;
}

describe("setup-wp sign-in step shape", () => {
  it("declares auth (default auto) and a secret-valued entitlement input (default empty)", () => {
    expect(digString(action, "inputs", "auth", "default")).toBe("auto");
    expect(digString(action, "inputs", "entitlement", "default")).toBe("");
  });

  it("passes inputs only through the step env, never interpolated into the script", () => {
    const step = signInStep();
    expect(step["shell"]).toBe("bash");
    expect(Object.keys(asRecord(dig(step, "env"), "runs.steps[1].env"))).toStrictEqual([
      "WP_VERSION",
      "WP_AUTH",
      "WP_ENTITLEMENT",
    ]);
    expect(dig(step, "env", "WP_ENTITLEMENT")).toBe("${{ inputs.entitlement }}");
    expect(signInScript()).not.toInclude("${{");
  });

  it("holds the login-only floor in exactly one constant", () => {
    const script = signInScript();
    expect(script.match(/0\.0\.24/gu)).toHaveLength(1);
    expect(script).toInclude('login_floor="0.0.24"');
  });

  it("holds wp's Actions auth directory in exactly one constant and never touches WEBPRESSO_HOME", () => {
    const script = signInScript();
    expect(script.match(/webpresso\/auth/gu)).toHaveLength(1);
    expect(script).toInclude('auth_dir="${RUNNER_TEMP}/webpresso/auth"');
    expect(script).not.toInclude("WEBPRESSO_HOME");
    expect(script).not.toInclude("webpresso-home");
  });
});

describe("setup-wp sign-in behaviour", () => {
  it("(a) auto below the floor never invokes wp and exports nothing", () => {
    const run = runSignIn({ version: "0.0.21", idToken: true });
    expect(run.result.status, run.output).toBe(0);
    expect(run.argv).toStrictEqual([]);
    expect(run.githubEnv).toBe("");
  });

  it("(b) auto at the floor runs `auth ci` once, masks the entitlement before wp's output, exports nothing", () => {
    const run = runSignIn({ version: "0.0.24", idToken: true });
    expect(run.result.status, run.output).toBe(0);
    expect(run.argv).toStrictEqual(["auth ci", "auth status --json"]);
    expect(run.homes).toStrictEqual(["<unset>", "<unset>"]);
    expect(readFileSync(join(run.runnerTemp, "webpresso", "auth", "entitlement.jwt"), "utf8")).toBe(
      OIDC_JWT,
    );
    const used = expectMaskedBeforeUse(run, OIDC_JWT);
    expect(used.length, "wp's captured output is replayed").toBeGreaterThan(0);
    expect(run.githubEnv).toBe("");
    expect(run.stdout).toInclude("kind ci");
    expect(run.stdout).toInclude("2026-11-18T03:00:00Z");
  });

  it("(b) leaves a caller-set WEBPRESSO_HOME untouched and unexported", () => {
    let home = "";
    const run = runSignIn({
      version: "0.0.24",
      idToken: true,
      presetHome: (runnerTemp) => {
        home = join(runnerTemp, "caller-home");
        return home;
      },
    });
    expect(run.result.status, run.output).toBe(0);
    expect(run.homes).toStrictEqual([home, home]);
    expect(existsSync(home)).toBe(false);
    expect(run.githubEnv).toBe("");
  });

  it("(c) required sign-in without an id-token or entitlement exits 17 naming the permission", () => {
    const run = runSignIn({ version: "0.0.24" });
    expect(run.result.status, run.output).toBe(17);
    expect(run.output).toInclude("permissions: id-token: write");
    expect(run.output).toMatch(/fork/iu);
    expect(run.argv).toStrictEqual([]);
    expect(run.githubEnv).toBe("");
  });

  it("(d) auth oidc below the floor exits 20", () => {
    const run = runSignIn({ version: "0.0.21", auth: "oidc", idToken: true });
    expect(run.result.status, run.output).toBe(20);
    expect(run.output).toInclude("::error::");
    expect(run.argv).toStrictEqual([]);
  });

  it("(e) auth none at the floor warns and never invokes wp", () => {
    const run = runSignIn({ version: "0.0.24", auth: "none", idToken: true });
    expect(run.result.status, run.output).toBe(0);
    expect(run.output).toInclude("::warning::");
    expect(run.argv).toStrictEqual([]);
    expect(run.githubEnv).toBe("");
  });

  it("(f) a break-glass entitlement is masked first, piped on stdin, warned about, and never leaks", () => {
    const run = runSignIn({
      version: "0.0.24",
      entitlement: BREAKGLASS_JWT,
      idToken: true,
      status: { state: "signed-in", kind: "breakglass" },
    });
    expect(run.result.status, run.output).toBe(0);
    expect(run.stdout.split("\n")[0]).toBe(`::add-mask::${BREAKGLASS_JWT}`);
    expectMaskedBeforeUse(run, BREAKGLASS_JWT);
    expect(run.stdin).toBe(BREAKGLASS_JWT);
    expect(run.argv).toStrictEqual(["auth import --stdin", "auth status --json"]);
    expect(run.argv.join("\n")).not.toInclude(BREAKGLASS_JWT);
    expect(run.githubEnv).toBe("");
    const warning = run.stdout.split("\n").find((line) => line.startsWith("::warning::"));
    expect(warning, run.output).toBeDefined();
    expect(warning).toInclude("breakglass");
    expect(warning).toInclude("2026-11-18T03:00:00Z");
  });

  it("(g) an entitlement with auth none, or with oidc below the floor, exits 20", () => {
    for (const options of [
      { version: "0.0.24", auth: "none" },
      { version: "0.0.21", auth: "oidc" },
    ]) {
      const run = runSignIn({ ...options, entitlement: BREAKGLASS_JWT, idToken: true });
      expect(run.result.status, `${JSON.stringify(options)}: ${run.output}`).toBe(20);
      expect(run.argv).toStrictEqual([]);
      expect(run.stdout.split("\n")[0]).toBe(`::add-mask::${BREAKGLASS_JWT}`);
    }
  });

  it("(g) an entitlement below the floor in auto mode is ignored with a warning", () => {
    const run = runSignIn({ version: "0.0.21", entitlement: BREAKGLASS_JWT, idToken: true });
    expect(run.result.status, run.output).toBe(0);
    expect(run.stdout.split("\n")[0]).toBe(`::add-mask::${BREAKGLASS_JWT}`);
    expect(run.output).toInclude("::warning::");
    expect(run.argv).toStrictEqual([]);
    expect(run.githubEnv).toBe("");
  });

  it("(h) an unknown auth value exits 20", () => {
    for (const auth of ["always", "", "OIDC"]) {
      const run = runSignIn({ version: "0.0.24", auth, idToken: true });
      expect(run.result.status, `'${auth}': ${run.output}`).toBe(20);
      expect(run.argv).toStrictEqual([]);
    }
  });

  describe("(i) the entitlement cannot be redirected out of RUNNER_TEMP", () => {
    it("refuses a missing RUNNER_TEMP with exit 21", () => {
      const run = runSignIn({ version: "0.0.24", idToken: true, noRunnerTemp: true });
      expect(run.result.status, run.output).toBe(21);
      expect(run.argv).toStrictEqual([]);
    });

    for (const [name, relative] of [
      ["RUNNER_TEMP/webpresso", ["webpresso"]],
      ["RUNNER_TEMP/webpresso/auth", ["webpresso", "auth"]],
    ] as const) {
      it(`refuses ${name} planted as a symlink with exit 21 and writes nothing outside`, () => {
        const outside = makeTempDir("setup-wp-redirect-");
        const run = runSignIn({
          version: "0.0.24",
          idToken: true,
          prepare: (runnerTemp) => {
            const link = join(runnerTemp, ...relative);
            mkdirSync(join(link, ".."), { recursive: true });
            symlinkSync(outside, link);
          },
        });
        expect(run.result.status, run.output).toBe(21);
        expect(run.argv).toStrictEqual([]);
        expect(existsSync(join(outside, "auth"))).toBe(false);
        expect(existsSync(join(outside, "entitlement.jwt"))).toBe(false);
      });

      it(`refuses ${name} planted as a file with exit 21`, () => {
        const run = runSignIn({
          version: "0.0.24",
          idToken: true,
          prepare: (runnerTemp) => {
            const path = join(runnerTemp, ...relative);
            mkdirSync(join(path, ".."), { recursive: true });
            writeFileSync(path, "not a directory");
          },
        });
        expect(run.result.status, run.output).toBe(21);
        expect(run.argv).toStrictEqual([]);
      });
    }

    it("refuses an existing entitlement.jwt symlink before wp runs and leaves its target unchanged", () => {
      const outside = makeTempDir("setup-wp-file-redirect-");
      const target = join(outside, "target.jwt");
      writeFileSync(target, "original");
      const run = runSignIn({
        version: "0.0.24",
        idToken: true,
        prepare: (runnerTemp) => {
          const authDir = join(runnerTemp, "webpresso", "auth");
          mkdirSync(authDir, { recursive: true });
          symlinkSync(target, join(authDir, "entitlement.jwt"));
        },
      });
      expect(run.result.status, run.output).toBe(21);
      expect(run.argv).toStrictEqual([]);
      expect(readFileSync(target, "utf8")).toBe("original");
    });

    it("refuses an existing entitlement.jwt that is a directory with exit 21", () => {
      const run = runSignIn({
        version: "0.0.24",
        idToken: true,
        prepare: (runnerTemp) => {
          mkdirSync(join(runnerTemp, "webpresso", "auth", "entitlement.jwt"), {
            recursive: true,
          });
        },
      });
      expect(run.result.status, run.output).toBe(21);
      expect(run.argv).toStrictEqual([]);
    });

    it("accepts an existing real auth directory holding a regular stale entitlement", () => {
      const run = runSignIn({
        version: "0.0.24",
        idToken: true,
        prepare: (runnerTemp) => {
          const authDir = join(runnerTemp, "webpresso", "auth");
          mkdirSync(authDir, { recursive: true });
          writeFileSync(join(authDir, "entitlement.jwt"), "stale");
        },
      });
      expect(run.result.status, run.output).toBe(0);
      expect(run.argv[0]).toBe("auth ci");
    });
  });

  it("(j) a failing `auth ci` or `auth import` exits 18 and still prints wp's output", () => {
    const oidc = runSignIn({ version: "0.0.24", idToken: true, fail: true });
    expect(oidc.result.status, oidc.output).toBe(18);
    expect(oidc.stdout).toInclude("exchange refused");
    expect(oidc.githubEnv).toBe("");
    const imported = runSignIn({ version: "0.0.24", entitlement: BREAKGLASS_JWT, fail: true });
    expect(imported.result.status, imported.output).toBe(18);
    expect(imported.stdout).toInclude("entitlement rejected");
    expect(imported.githubEnv).toBe("");
  });

  it("(k) a status that is not signed in with kind ci or breakglass exits 19", () => {
    for (const status of [
      { state: "signed-out", kind: "ci" },
      { state: "expired", kind: "ci" },
      { state: "below-min-version", kind: "ci" },
      { state: "signed-in", kind: "user" },
    ]) {
      const run = runSignIn({ version: "0.0.24", idToken: true, status });
      expect(run.result.status, `${JSON.stringify(status)}: ${run.output}`).toBe(19);
      expect(run.githubEnv).toBe("");
    }
  });

  it("(l) compares the floor on the numeric major.minor.patch core", () => {
    // 0.0.23 shipped without the login-only gate (it has no `wp auth ci`), so
    // it and its prereleases and builds must stay on the no-op path.
    const below = [
      "0.0.9",
      "0.0.21",
      "0.0.22",
      "0.0.22-rc.9",
      "0.0.23",
      "0.0.23-rc.1",
      "0.0.23+build.5",
    ];
    const atOrAbove = ["0.0.24-rc.1", "0.0.24", "0.0.100", "0.1.0", "1.0.0", "0.0.24+build.5"];
    for (const version of below) {
      const run = runSignIn({ version, idToken: true });
      expect(run.result.status, `${version}: ${run.output}`).toBe(0);
      expect(run.argv, version).toStrictEqual([]);
    }
    for (const version of atOrAbove) {
      const run = runSignIn({ version, idToken: true });
      expect(run.result.status, `${version}: ${run.output}`).toBe(0);
      expect(run.argv[0], version).toBe("auth ci");
    }
  });

  it("(m) wp reporting success without an entitlement at the contract path exits 19 naming it", () => {
    for (const options of [{ noWrite: true }, { noGithubActions: true }]) {
      const run = runSignIn({ version: "0.0.24", idToken: true, ...options });
      expect(run.result.status, `${JSON.stringify(options)}: ${run.output}`).toBe(19);
      expect(run.output).toInclude(join(run.runnerTemp, "webpresso", "auth", "entitlement.jwt"));
      expect(run.githubEnv).toBe("");
    }
  });

  it("(n) wp leaving the entitlement as a symlink exits 19", () => {
    const run = runSignIn({ version: "0.0.24", idToken: true, symlinkWrite: true });
    expect(run.result.status, run.output).toBe(19);
    expect(
      lstatSync(join(run.runnerTemp, "webpresso", "auth", "entitlement.jwt")).isSymbolicLink(),
    ).toBe(true);
    expect(run.githubEnv).toBe("");
  });
});
