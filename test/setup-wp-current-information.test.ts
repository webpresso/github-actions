import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import {
  ACTION_SETUP_WP,
  ACTION_TOOLCHAIN,
  README_PATH,
  asRecord,
  dig,
  digString,
  loadYaml,
  readRepoFile,
} from "./helpers.ts";

const SETUP_WP_ACTION_BEHAVIOR_SHA256 =
  "33b59ce976b2e3619141bcac95b302cdc8a8aade931ffae944e745abd8541114";
const ACTION_BEHAVIOR_SHA256 = "24ea153009ff3e6a0347be7f978978e73bf01ed653cb940724e5e1aae4f33dc2";

const readme = readRepoFile(README_PATH);
const actionText = readRepoFile(ACTION_SETUP_WP);
const action = loadYaml(ACTION_SETUP_WP);
const toolchainAction = loadYaml(ACTION_TOOLCHAIN);
const inputs = asRecord(dig(action, "inputs"), "setup-wp inputs");
const steps = (() => {
  const value = dig(action, "runs", "steps");
  if (!Array.isArray(value)) throw new Error("expected setup-wp runs.steps");
  return value.map((step, index) => asRecord(step, `setup-wp runs.steps[${index}]`));
})();
const installScript = digString(steps[0], "run") ?? "";
// The package-root phase of the single install step: everything from the
// extraction of package-root/ onward.
const packageRootScript = installScript.slice(installScript.indexOf('package_root="'));
const wpSection =
  readme.split("wp install contract (`setup-wp`):")[1]?.split("## Gating on test outcomes")[0] ??
  "";

function withoutDescriptions(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutDescriptions);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "description")
      .map(([key, child]) => [key, withoutDescriptions(child)]),
  );
}

describe("setup-wp current information", () => {
  it("M1 documents the public tokenless source independently from the action SHA", () => {
    expect(digString(inputs["release-repo"], "default")).toBe("webpresso/app-releases");
    expect(inputs).not.toHaveProperty("github-token");
    expect(actionText).toInclude("no GitHub API");
    expect(actionText).toInclude("no token");

    expect(wpSection).toInclude("public `webpresso/app-releases`");
    expect(wpSection).toMatch(
      /exact (?:caller-pinned )?product semver.*independent of the pinned action SHA/iu,
    );
    expect(wpSection).not.toMatch(
      /github-token|GITHUB_TOKEN|private source monorepo|api\.github\.com/iu,
    );
  });

  it("M2 documents the complete action-supported assets and same-release package root", () => {
    const targets = [...installScript.matchAll(/target="((?:linux|darwin)-(?:x64|arm64))"/gu)]
      .map((match) => match[1])
      .filter((target): target is string => target !== undefined)
      .sort();
    expect(targets).toStrictEqual(["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64"]);

    for (const target of targets) {
      expect(wpSection).toInclude(`wp-${target}.tar.gz`);
    }
    expect(wpSection).toInclude(".tar.gz.json");
    expect(wpSection).toInclude("package-root/");
    expect(wpSection).toMatch(/same release.*same version/iu);
    expect(wpSection).not.toMatch(
      /source[- ]archive|\/tarball\/|private source monorepo|package-root-ref|token fallback/iu,
    );
  });

  it("M3 documents cache-hit, download-miss, checksum, and best-effort seed ordering", () => {
    expect(installScript.indexOf("RUNNER_TOOL_CACHE")).toBeLessThan(
      installScript.indexOf("curl -fsSL"),
    );
    expect(installScript.indexOf("curl -fsSL")).toBeLessThan(
      installScript.indexOf('sha256_of "${stage}/bin/wp"'),
    );
    expect(installScript.indexOf('sha256_of "${stage}/bin/wp"')).toBeLessThan(
      installScript.indexOf('mv "${stage}" "${install_root}"'),
    );
    expect(installScript).toInclude("Best effort");

    // A hit is verified against the caller checksum, else the seeded digest
    // record; with neither it is a miss. The record is seeded only after the
    // whole tree is swapped into place, so a failed seed never leaves a stale record.
    expect(installScript).toInclude('"${cache_root}/wp.sha256"');
    expect(installScript.indexOf('mv "${cache_stage}" "${cache_root}"')).toBeLessThan(
      installScript.indexOf('mv "${cache_root}/wp.sha256.tmp"'),
    );
    expect(wpSection).toMatch(/cache hit.*`checksum`.*`wp\.sha256`/isu);
    expect(wpSection).toMatch(/neither.*treated as a (?:cache )?miss/isu);
    expect(wpSection).toMatch(/verified cache hit skips the download/isu);
    expect(wpSection).toMatch(/only independent trust root/isu);
    expect(wpSection).toMatch(/cache miss.*direct release-asset URL/isu);
    expect(wpSection).toMatch(/caller-supplied.*sha256/isu);
    expect(wpSection).toMatch(/best-effort.*seed/isu);
    expect(wpSection).not.toMatch(
      /actions\/cache|cache store|cache restore|automatic provenance|mandatory checksum/iu,
    );
  });

  it("M4 documents current exports and fail-closed catalog behavior", () => {
    const exports = [...packageRootScript.matchAll(/echo "([A-Z_]+)=/gu)]
      .map((match) => match[1])
      .filter((name): name is string => name !== undefined);
    expect(exports).toStrictEqual(["WEBPRESSO_PACKAGE_ROOT", "NODE_PATH"]);
    expect(packageRootScript).toMatch(/catalog[\s\S]{0,200}exit 12/u);

    const packageRootDescription = digString(inputs["package-root"], "description") ?? "";
    for (const name of exports) {
      expect(wpSection).toInclude(name);
      expect(packageRootDescription).toInclude(name);
    }
    expect(wpSection).toInclude("fails closed");
    expect(packageRootDescription).toInclude("fails closed");
    for (const retired of ["WEBPRESSO_AGENT_KIT_ROOT", "WP_AGENT_KIT_PACKAGE_ROOT"]) {
      expect(wpSection).not.toInclude(retired);
      expect(packageRootDescription).not.toInclude(retired);
    }
  });

  it("M5 documents exact caller selection and no self-update", () => {
    expect(digString(inputs["version"], "description")).toMatch(/Exact wp release semver/iu);
    expect(installScript).toMatch(/must be exact semver/iu);

    expect(wpSection).toMatch(/exact caller-pinned product semver/iu);
    expect(wpSection).toMatch(/never resolves? `latest` and never self-updates/iu);
    expect(wpSection).not.toMatch(/setup-wp[^\n]*(?:range|dist-tag)|self-update fallback/iu);
  });

  it("M6 documents the sign-in contract the action implements", () => {
    const signInScript = digString(steps[1], "run") ?? "";
    // Exit statements only (one per line), not prose such as "exit 77" in a warning.
    const exitCodes = [
      ...new Set([...signInScript.matchAll(/^\s*exit (\d+)\s*$/gmu)].map((match) => match[1])),
    ]
      .filter((code): code is string => code !== undefined && code !== "0")
      .sort();
    expect(exitCodes).toStrictEqual(["17", "18", "19", "20", "21"]);
    for (const code of exitCodes) {
      expect(wpSection, `README names exit ${code}`).toInclude(`exit ${code}`);
    }

    const floor = /login_floor="([0-9.]+)"/u.exec(signInScript)?.[1];
    expect(floor).toBe("0.0.24");
    expect(wpSection).toInclude(`\`${floor}\``);

    const authDescription = digString(inputs["auth"], "description") ?? "";
    for (const mode of ["auto", "oidc", "none"]) {
      expect(authDescription).toInclude(mode);
      expect(wpSection).toInclude(`\`${mode}\``);
    }
    expect(authDescription).toInclude("0.0.24");
    expect(digString(inputs["entitlement"], "description") ?? "").toMatch(/break-glass/iu);

    for (const term of [
      "`auth`",
      "`entitlement`",
      "`permissions: id-token: write`",
      "`RUNNER_TEMP`",
      "`wp auth ci`",
      "`wp auth import --stdin`",
      "::add-mask::",
    ]) {
      expect(wpSection, term).toInclude(term);
    }
    expect(wpSection).toMatch(/fork/iu);
    expect(wpSection).toMatch(/older .*unchanged|unchanged .*older|below .*no-op/isu);

    // The CI auth directory is wp's own (app lane login-only-apps D7), held as
    // one constant; setup-wp no longer chooses or exports a WEBPRESSO_HOME.
    const authDir = /auth_dir="\$\{RUNNER_TEMP\}\/([a-z/]+)"/u.exec(signInScript)?.[1];
    expect(authDir).toBe("webpresso/auth");
    expect(wpSection).toInclude(`\`\${RUNNER_TEMP}/${authDir}\``);
    expect(wpSection).not.toInclude("webpresso-home");
    expect(digString(inputs["auth"], "description") ?? "").not.toInclude("WEBPRESSO_HOME");
    // Honest compatibility, masking and actor boundaries.
    expect(wpSection).toInclude("`0.0.16`");
    expect(wpSection).toMatch(/dependabot/iu);
    expect(wpSection).toInclude("`secrets.*`");
    expect(wpSection).not.toMatch(/only the kind and the expiry are printed/iu);
  });

  it("action behavior boundary", () => {
    expect(
      createHash("sha256")
        .update(JSON.stringify(withoutDescriptions(action)))
        .digest("hex"),
    ).toBe(SETUP_WP_ACTION_BEHAVIOR_SHA256);
    expect(
      createHash("sha256")
        .update(JSON.stringify(withoutDescriptions(toolchainAction)))
        .digest("hex"),
    ).toBe(ACTION_BEHAVIOR_SHA256);
  });
});
