/**
 * Sign-in contract for `setup-wp` (login-only wp from 0.0.23).
 *
 * The sign-in step's shell is extracted from the action YAML and executed with
 * `bash`, exactly as the runner does. A stub `wp` in WP_INSTALL_DIR records
 * argv, stdin and WEBPRESSO_HOME and answers `auth status --json` from a
 * fixture, so every branch is proven without a network or a real release.
 */

import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ACTION_SETUP_WP, asRecord, dig, digString, loadYaml, makeTempDir } from "./helpers.ts";

const action = loadYaml(ACTION_SETUP_WP);

function signInStep() {
  const steps = dig(action, "runs", "steps");
  if (!Array.isArray(steps) || steps.length < 2) throw new Error("expected a sign-in step at runs.steps[1]");
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
  'case "$1 $2" in',
  '  "auth ci")',
  '    [[ -n "${WP_STUB_FAIL:-}" ]] && { echo "exchange refused" >&2; exit 3; }',
  '    mkdir -p "${WEBPRESSO_HOME}/auth"',
  '    printf "%s" "${WP_STUB_JWT}" > "${WEBPRESSO_HOME}/auth/entitlement.jwt"',
  '    echo "signed in for CI"',
  "    exit 0 ;;",
  '  "auth import")',
  '    cat > "${WP_STUB_DIR}/stdin"',
  '    [[ -n "${WP_STUB_FAIL:-}" ]] && { echo "entitlement rejected" >&2; exit 3; }',
  '    mkdir -p "${WEBPRESSO_HOME}/auth"',
  '    cp "${WP_STUB_DIR}/stdin" "${WEBPRESSO_HOME}/auth/entitlement.jwt"',
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
  /** A caller-set WEBPRESSO_HOME; a function receives RUNNER_TEMP. */
  readonly presetHome?: string | ((runnerTemp: string) => string);
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

  const env: Record<string, string> = {
    // A PATH with no wp on it: the step must invoke the installed binary by path.
    PATH: "/usr/bin:/bin",
    RUNNER_TEMP: runnerTemp,
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
  if (options.idToken === true) {
    env["ACTIONS_ID_TOKEN_REQUEST_URL"] = "https://token.actions.example/request";
    env["ACTIONS_ID_TOKEN_REQUEST_TOKEN"] = "runner-request-token";
  }
  if (options.fail === true) env["WP_STUB_FAIL"] = "1";
  if (options.presetHome !== undefined) {
    env["WEBPRESSO_HOME"] =
      typeof options.presetHome === "function" ? options.presetHome(runnerTemp) : options.presetHome;
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
    output: result.stdout + result.stderr,
    githubEnv: readFileSync(githubEnv, "utf8"),
    argv: read("argv").split("\n").filter(Boolean),
    homes: read("home").split("\n").filter(Boolean),
    stdin: read("stdin"),
  };
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
    expect(script.match(/0\.0\.23/gu)).toHaveLength(1);
    expect(script).toInclude('login_floor="0.0.23"');
  });
});

describe("setup-wp sign-in behaviour", () => {
  it("(a) auto below the floor never invokes wp and exports nothing", () => {
    const run = runSignIn({ version: "0.0.21", idToken: true });
    expect(run.result.status, run.output).toBe(0);
    expect(run.argv).toStrictEqual([]);
    expect(run.githubEnv).toBe("");
  });

  it("(b) auto at the floor with an id-token runs `auth ci` once under RUNNER_TEMP and masks the entitlement", () => {
    const run = runSignIn({ version: "0.0.23", idToken: true });
    expect(run.result.status, run.output).toBe(0);
    expect(run.argv).toStrictEqual(["auth ci", "auth status --json"]);
    const home = join(run.runnerTemp, "webpresso-home");
    expect(run.homes).toStrictEqual([home, home]);
    expect(run.githubEnv).toBe(`WEBPRESSO_HOME=${home}\n`);
    expect(statSync(home).mode & 0o777).toBe(0o700);
    expect(run.stdout).toInclude(`::add-mask::${OIDC_JWT}`);
    const unmasked = run.output.split("\n").filter((line) => line.includes(OIDC_JWT) && !line.startsWith("::add-mask::"));
    expect(unmasked).toStrictEqual([]);
    expect(run.stdout).toInclude("kind ci");
    expect(run.stdout).toInclude("2026-11-18T03:00:00Z");
  });

  it("(c) required sign-in without an id-token or entitlement exits 17 naming the permission", () => {
    const run = runSignIn({ version: "0.0.23" });
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
    const run = runSignIn({ version: "0.0.23", auth: "none", idToken: true });
    expect(run.result.status, run.output).toBe(0);
    expect(run.output).toInclude("::warning::");
    expect(run.argv).toStrictEqual([]);
    expect(run.githubEnv).toBe("");
  });

  it("(f) a break-glass entitlement is masked first, piped on stdin, and never leaks", () => {
    const run = runSignIn({
      version: "0.0.23",
      entitlement: BREAKGLASS_JWT,
      idToken: true,
      status: { state: "signed-in", kind: "breakglass" },
    });
    expect(run.result.status, run.output).toBe(0);
    expect(run.stdout.split("\n")[0]).toBe(`::add-mask::${BREAKGLASS_JWT}`);
    expect(run.stdin).toBe(BREAKGLASS_JWT);
    expect(run.argv).toStrictEqual(["auth import --stdin", "auth status --json"]);
    expect(run.argv.join("\n")).not.toInclude(BREAKGLASS_JWT);
    expect(run.githubEnv).not.toInclude(BREAKGLASS_JWT);
    const lines = run.output.split("\n");
    expect(lines.slice(1).filter((line) => line.includes(BREAKGLASS_JWT))).toStrictEqual([]);
  });

  it("(g) an entitlement with auth none, or below the floor, exits 20", () => {
    for (const options of [
      { version: "0.0.23", auth: "none" },
      { version: "0.0.21", auth: "auto" },
      { version: "0.0.21", auth: "oidc" },
    ]) {
      const run = runSignIn({ ...options, entitlement: BREAKGLASS_JWT, idToken: true });
      expect(run.result.status, `${JSON.stringify(options)}: ${run.output}`).toBe(20);
      expect(run.argv).toStrictEqual([]);
      expect(run.stdout.split("\n")[0]).toBe(`::add-mask::${BREAKGLASS_JWT}`);
    }
  });

  it("(h) an unknown auth value exits 20", () => {
    for (const auth of ["always", "", "OIDC"]) {
      const run = runSignIn({ version: "0.0.23", auth, idToken: true });
      expect(run.result.status, `'${auth}': ${run.output}`).toBe(20);
      expect(run.argv).toStrictEqual([]);
    }
  });

  describe("(i) a caller-set WEBPRESSO_HOME must stay inside RUNNER_TEMP", () => {
    it("refuses a home outside RUNNER_TEMP with exit 21", () => {
      const outside = makeTempDir("setup-wp-outside-home-");
      const run = runSignIn({ version: "0.0.23", idToken: true, presetHome: join(outside, "home") });
      expect(run.result.status, run.output).toBe(21);
      expect(run.argv).toStrictEqual([]);
      expect(existsSync(join(outside, "home"))).toBe(false);
      expect(run.githubEnv).toBe("");
    });

    it("refuses a home that escapes through a symlink with exit 21 and creates nothing outside", () => {
      const outside = makeTempDir("setup-wp-symlink-target-");
      const run = runSignIn({
        version: "0.0.23",
        idToken: true,
        presetHome: (runnerTemp) => {
          symlinkSync(outside, join(runnerTemp, "escape"));
          return join(runnerTemp, "escape", "home");
        },
      });
      expect(run.result.status, run.output).toBe(21);
      expect(run.argv).toStrictEqual([]);
      expect(existsSync(join(outside, "home"))).toBe(false);
    });

    it("refuses a dot-dot home with exit 21", () => {
      const run = runSignIn({
        version: "0.0.23",
        idToken: true,
        presetHome: (runnerTemp) => join(runnerTemp, "x") + "/../../escaped-home",
      });
      expect(run.result.status, run.output).toBe(21);
      expect(run.argv).toStrictEqual([]);
    });

    it("accepts a home inside RUNNER_TEMP and exports it", () => {
      let home = "";
      const run = runSignIn({
        version: "0.0.23",
        idToken: true,
        presetHome: (runnerTemp) => {
          home = join(runnerTemp, "custom-home");
          return home;
        },
      });
      expect(run.result.status, run.output).toBe(0);
      expect(run.homes[0]).toBe(home);
      expect(run.githubEnv).toBe(`WEBPRESSO_HOME=${home}\n`);
    });
  });

  it("(j) a failing `auth ci` or `auth import` exits 18", () => {
    const oidc = runSignIn({ version: "0.0.23", idToken: true, fail: true });
    expect(oidc.result.status, oidc.output).toBe(18);
    expect(oidc.githubEnv).toBe("");
    const imported = runSignIn({ version: "0.0.23", entitlement: BREAKGLASS_JWT, fail: true });
    expect(imported.result.status, imported.output).toBe(18);
    expect(imported.githubEnv).toBe("");
  });

  it("(k) a status that is not signed in with kind ci or breakglass exits 19", () => {
    for (const status of [
      { state: "signed-out", kind: "ci" },
      { state: "expired", kind: "ci" },
      { state: "below-min-version", kind: "ci" },
      { state: "signed-in", kind: "user" },
    ]) {
      const run = runSignIn({ version: "0.0.23", idToken: true, status });
      expect(run.result.status, `${JSON.stringify(status)}: ${run.output}`).toBe(19);
      expect(run.githubEnv).toBe("");
    }
  });

  it("(l) compares the floor on the numeric major.minor.patch core", () => {
    const below = ["0.0.9", "0.0.21", "0.0.22", "0.0.22-rc.9"];
    const atOrAbove = ["0.0.23-rc.1", "0.0.23", "0.0.100", "0.1.0", "1.0.0", "0.0.23+build.5"];
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
});
