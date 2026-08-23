---
type: blueprint
title: "Correct setup-wp current information"
status: __wp-lifecycle-status__
complexity: M
owner: "webpresso/github-actions"
created: "2026-08-23"
---

# Correct setup-wp current information

## Product wedge anchor

- **Stage outcome:** Action consumers can distinguish current compatibility behavior from the future verified public installer target
- **Consuming surface:** github-actions README, setup-wp action contract/comments, freshness workflow name/comments, and contract tests
- **New user-visible capability:** Truthful version, source, credentials, asset, pin, and integrity semantics for setup-wp

## Summary

Correct current setup-wp information without changing behavior, public inputs, asset names, or pins. The `version` input is an exact wp product release version independent from the setup action SHA. The current action still downloads private `webpresso/app` assets using a token and legacy package-root names; `webpresso/app-releases` is the future public source but is not consumable by this action yet. The npm `@webpresso/agent-kit` freshness workflow is deprecated migration debt, and checksum, provenance, cache rehash, arbitrary-version, and self-update guarantees do not exist today.

#### Task 1.1: Correct setup-wp and freshness current truth

**Status:** __wp-task-status__
**Wave:** 1
**Lane:** truth
**Depends:** None
**Produces:** actions-current-truth-merge-sha

Write `test/setup-wp-current-information.test.ts` first and capture its failure against the present wording. Then update README plus comments/descriptions/names that communicate behavior in `.github/actions/setup-wp/action.yml` and `.github/workflows/agent-kit-freshness.yml`. Change no executable action/workflow behavior, public input key, asset name, source URL, version/action pin, cache behavior, or reusable-workflow contract.

**Acceptance:**
- [_] The focused test inspects README.md and `.github/actions/setup-wp/action.yml`: both identify the current private `webpresso/app` exact-tag source, and they state that `github-token`/GITHUB_TOKEN must be able to read its private release assets (default `github.token` may need a caller-supplied token).
- [_] The focused test requires the `version` input to be described as an exact wp product semver independent from the immutable setup-wp action commit SHA; it forbids wording that calls this an `@webpresso/agent-kit` npm version.
- [_] README and action comments state that `webpresso/app-releases` is the future public source, is not consumable/configurable by the current action, and must not be selected before `qualify-setup-wp-against-release-a` lands.
- [_] The focused test rejects README/action claims of checksum or digest verification, provenance verification, version ranges/latest/arbitrary versions, cache rehashing, or wp self-update; current limitations are stated plainly.
- [_] The focused test inspects `.github/workflows/agent-kit-freshness.yml` and README: the workflow's own name/comments and README call npm `@webpresso/agent-kit` scanning deprecated migration debt and never a wp product updater.
- [_] The diff changes only prose/comments/display names and the focused test/blueprint evidence; no YAML input key, executable shell/JavaScript, pin, URL, asset identifier, permissions block, trigger, dependency, or release behavior changes.
- [_] Focused contract passes through the supported test facade; `bun test test/setup-wp-current-information.test.ts test/freshness.test.ts test/workflow-shape.test.ts` passes as implementation evidence and normal PR CI remains green; controller records exact merge SHA.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- trust-gate-version: 1

### Material Claims

| ID | Claim | Evidence |
| --- | --- | --- |
| claim-1 | Current setup-wp downloads exact release tags from private webpresso/app and requires a token able to read those release assets. | repo:.github/actions/setup-wp/action.yml |
| claim-2 | Current agent-kit freshness queries npm and is not a wp product updater. | repo:.github/workflows/agent-kit-freshness.yml |

### Material Decisions

| ID | Decision | Chosen option | Rejected alternatives | Rationale |
| --- | --- | --- | --- | --- |
| decision-1 | Do not disguise target-state action behavior as current. | Make a prose/comment/display-name-only truth correction, then repair downloads, integrity, and qualification in `qualify-setup-wp-against-release-a` owned by this repo under `release-install-consistency-program`. | Rename public inputs/assets or change downloads, self-pins, cache, and public guidance in one unqualified PR. | Truth can land without compatibility risk; the named successor owns supply-chain behavior and live Release A evidence. |
| decision-2 | Keep Bun integration proof outside fixed-budget promotion commands. | Use the focused supported-facade contract as the promotion gate and require exact Bun suites as task evidence and PR CI. | Invent an unsupported `wp run` promotion command, convert the repo test framework, or omit integration proof. | Promotion gates accept only bounded wp commands, while this repository's existing contracts intentionally run on Bun. |

### Promotion Gates

| Gate | Command | Expected outcome | __wp-gate-result__ | Defer |
| --- | --- | --- | __wp-gate-result__ | --- |
| docs-frontmatter | wp audit docs-frontmatter | Documentation surfaces contain no invalid frontmatter. | __wp-gate-result__ |  |
| truth-test | wp test --files test/setup-wp-current-information.test.ts | Focused file-level current-truth assertions pass after implementation. | __wp-gate-result__ | pre-implementation |

### Residual Unknowns

None.
