import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import {
  ACTION_SETUP_WP,
  ACTION_TOOLCHAIN,
  README_PATH,
  WORKFLOW_WEBPRESSO_FRESHNESS,
  asRecord,
  dig,
  digString,
  loadYaml,
  readRepoFile,
} from "./helpers.ts";

const FRESHNESS_SHA256 = "3ca9d1652f61900048af4628de555a557f326fda34023e3c13a6639275d78ff2";
const SETUP_WP_ACTION_BEHAVIOR_SHA256 = "04e8d5569bec90f93e58f041e7cb8d387c8888434ad50bfbd6a579e51b49bf57";
const ACTION_BEHAVIOR_SHA256 = "edd5eff38818f5a386906f2090513212626c6c1d8e69c9680418936e835e7640";

const readme = readRepoFile(README_PATH);
const actionText = readRepoFile(ACTION_SETUP_WP);
const freshnessText = readRepoFile(WORKFLOW_WEBPRESSO_FRESHNESS);
const action = loadYaml(ACTION_SETUP_WP);
const toolchainAction = loadYaml(ACTION_TOOLCHAIN);
const freshness = loadYaml(WORKFLOW_WEBPRESSO_FRESHNESS);
const inputs = asRecord(dig(action, "inputs"), "setup-wp inputs");
const steps = (() => {
  const value = dig(action, "runs", "steps");
  if (!Array.isArray(value)) throw new Error("expected setup-wp runs.steps");
  return value.map((step, index) => asRecord(step, `setup-wp runs.steps[${index}]`));
})();
const installScript = digString(steps[0], "run") ?? "";
const packageRootScript = digString(steps[1], "run") ?? "";
const wpSection = readme.split("wp install contract (`setup-wp`):")[1]?.split("## Gating on test outcomes")[0] ?? "";
const freshnessSection = readme.split("## webpresso freshness")[1] ?? "";

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
    expect(exports).toStrictEqual([
      "WEBPRESSO_PACKAGE_ROOT",
      "WEBPRESSO_AGENT_KIT_ROOT",
      "NODE_PATH",
    ]);
    expect(packageRootScript).toMatch(/catalog[\s\S]{0,200}exit 12/u);

    const packageRootDescription = digString(inputs["package-root"], "description") ?? "";
    for (const name of exports) {
      expect(wpSection).toInclude(name);
      expect(packageRootDescription).toInclude(name);
    }
    expect(wpSection).toInclude("fails closed");
    expect(packageRootDescription).toInclude("fails closed");
    expect(wpSection).not.toInclude("WP_AGENT_KIT_PACKAGE_ROOT");
    expect(packageRootDescription).not.toInclude("WP_AGENT_KIT_PACKAGE_ROOT");
  });

  it("M5 documents exact caller selection and no self-update", () => {
    expect(digString(inputs["version"], "description")).toMatch(/Exact wp release semver/iu);
    expect(installScript).toMatch(/must be exact semver/iu);

    expect(wpSection).toMatch(/exact caller-pinned product semver/iu);
    expect(wpSection).toMatch(/never resolves? `latest` and never self-updates/iu);
    expect(wpSection).not.toMatch(/setup-wp[^\n]*(?:range|dist-tag)|self-update fallback/iu);
  });

  it("M6 documents the current three-shape freshness migration workflow", () => {
    expect(digString(freshness, "name")).toBe("Reusable webpresso freshness");
    expect(Object.keys(asRecord(dig(freshness, "jobs"), "freshness jobs"))).toStrictEqual(["freshness"]);
    expect(digString(freshness, "jobs", "freshness", "name")).toBe("webpresso-freshness");
    expect(freshnessText).toInclude("ENV_RE");
    expect(freshnessText).toInclude("SHELL_DEFAULT_RE");
    expect(freshnessText).toInclude("COMPOSITE_KEY_RE");

    expect(readme).toInclude(".github/workflows/webpresso-freshness.yml");
    expect(freshnessSection).toInclude("Reusable webpresso freshness");
    expect(freshnessSection).toInclude("webpresso-freshness");
    expect(freshnessSection).toMatch(/exactly three npm pin shapes/iu);
    expect(freshnessSection).toMatch(/setup-wp.*excluded/isu);
    expect(freshnessSection).toMatch(/migration debt.*not an installer\s+or updater/isu);
    expect(readme).not.toInclude("agent-kit-freshness.yml");
    expect(freshnessSection).not.toMatch(/four known pin shapes/iu);
  });

  it("action and freshness behavior boundary", () => {
    expect(createHash("sha256").update(freshnessText).digest("hex")).toBe(FRESHNESS_SHA256);
    expect(
      createHash("sha256").update(JSON.stringify(withoutDescriptions(action))).digest("hex"),
    ).toBe(SETUP_WP_ACTION_BEHAVIOR_SHA256);
    expect(
      createHash("sha256").update(JSON.stringify(withoutDescriptions(toolchainAction))).digest("hex"),
    ).toBe(ACTION_BEHAVIOR_SHA256);
  });
});
