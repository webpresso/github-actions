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

const SETUP_WP_ACTION_BEHAVIOR_SHA256 = "7cc24562bdd020390449e004127ce33e015aea7dd0f97431b82337fe8ac213f4";
const ACTION_BEHAVIOR_SHA256 = "49a8edf41c6a9992244340c54e9e4dca67862bdf150c0dfaf6dfa34f49daa0a2";

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
const packageRootScript = digString(steps[1], "run") ?? "";
const wpSection = readme.split("wp install contract (`setup-wp`):")[1]?.split("## Gating on test outcomes")[0] ?? "";

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
    expect(wpSection).toMatch(/exact (?:caller-pinned )?product semver.*independent of the pinned action SHA/iu);
    expect(wpSection).not.toMatch(/github-token|GITHUB_TOKEN|private source monorepo|api\.github\.com/iu);
  });

  it("M2 documents the complete action-supported assets and same-release package root", () => {
    const binaryAssets = [...installScript.matchAll(/asset="(wp-(?:linux|darwin)-(?:x64|arm64))"/gu)]
      .map((match) => match[1])
      .filter((asset): asset is string => asset !== undefined)
      .sort();
    expect(binaryAssets).toStrictEqual([
      "wp-darwin-arm64",
      "wp-darwin-x64",
      "wp-linux-arm64",
      "wp-linux-x64",
    ]);
    const packageRootAsset = digString(steps[1], "env", "PACKAGE_ROOT_ASSET");
    expect(packageRootAsset).toBe("wp-package-root.tgz");

    for (const asset of [...binaryAssets, packageRootAsset]) {
      expect(wpSection).toInclude(asset ?? "missing package-root asset");
    }
    expect(wpSection).toMatch(/same release.*same version/iu);
    expect(wpSection).not.toMatch(/source[- ]archive|\/tarball\/|private source monorepo|package-root-ref|token fallback/iu);
  });

  it("M3 documents cache-hit, download-miss, checksum, and best-effort seed ordering", () => {
    expect(installScript.indexOf("RUNNER_TOOL_CACHE")).toBeLessThan(installScript.indexOf("curl -fsSL"));
    expect(installScript.indexOf("curl -fsSL")).toBeLessThan(installScript.indexOf("WP_CHECKSUM"));
    expect(installScript).toInclude("Best effort");

    expect(wpSection).toMatch(/cache hit.*skips? (?:both )?(?:the )?download.*checksum/isu);
    expect(wpSection).toMatch(/cache miss.*direct release-asset URL/isu);
    expect(wpSection).toMatch(/caller-supplied.*sha256/isu);
    expect(wpSection).toMatch(/best-effort.*seed/isu);
    expect(wpSection).not.toMatch(/actions\/cache|cache store|cache restore|automatic provenance|mandatory checksum/iu);
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

  it("action behavior boundary", () => {
    expect(
      createHash("sha256").update(JSON.stringify(withoutDescriptions(action))).digest("hex"),
    ).toBe(SETUP_WP_ACTION_BEHAVIOR_SHA256);
    expect(
      createHash("sha256").update(JSON.stringify(withoutDescriptions(toolchainAction))).digest("hex"),
    ).toBe(ACTION_BEHAVIOR_SHA256);
  });
});
