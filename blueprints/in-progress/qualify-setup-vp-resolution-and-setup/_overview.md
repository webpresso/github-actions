---
type: blueprint
status: in-progress
complexity: M
created: '2026-09-06'
last_updated: "2026-09-06"
progress: 0% (0/3 tasks done, 0 blocked, updated 2026-09-06)
depends_on: []
cross_repo_depends_on: []
tags:
  - "github-actions"
  - "setup-vp"
  - "setup-wp"
  - "runner-qualification"

approvals: []
title: "Qualify caller setup resolution"
owner: "webpresso/github-actions"
review_dispositions:
  - finding_id: "gate:04344b598ab9257d:codex:gpt-5.6-sol#1"
    disposition: fixed
    evidence: "Task runner-setup-vp-resolution executes the local consumer-facing setup-webpresso-toolchain composite and parsed tests assert embedded setup-vp SHA, run-install false, no version override, and root default working directory."
  - finding_id: "gate:04344b598ab9257d:codex:gpt-5.6-sol#2"
    disposition: fixed
    evidence: "Task runner-setup-wp-cache now uses separate fresh seed and hit jobs with a tar artifact, so no first-pass GITHUB_PATH or WP_INSTALL_DIR state reaches the hit invocation."
  - finding_id: "gate:04344b598ab9257d:codex:gpt-5.6-sol#3"
    disposition: fixed
    evidence: "Task public-contract-delivery requires a successful hosted Self-test receipt covering all matrix cases and both cache jobs; ci-act remains supplemental."
  - finding_id: "gate:04344b598ab9257d:codex:gpt-5.6-sol#4"
    disposition: fixed
    evidence: "Task public-contract-delivery limits SHA enforcement to changed remote action references and permits local ./ action paths."
  - finding_id: "gate:04344b598ab9257d:codex:gpt-5.6-sol#5"
    disposition: fixed
    evidence: "The seed job begins with a non-executable partial cache entry and requires it to become executable before archiving."
  - finding_id: "gate:04344b598ab9257d:codex:gpt-5.6-sol#6"
    disposition: fixed
    evidence: "The unresolved catalog matrix case must fail and the follow-up assertion emits the stable marker unresolved-named-catalog rejected only for that expected failure."
  - finding_id: "gate:a8821cb979d66f28:codex:gpt-5.6-sol#1"
    disposition: fixed
    evidence: "Task runner-setup-wp-cache transfers only the seeded cache artifact to a fresh hit job, eliminating ambient first-pass PATH and WP_INSTALL_DIR state; the hit action must republish cache-owned variables."
  - finding_id: "gate:a8821cb979d66f28:codex:gpt-5.6-sol#2"
    disposition: fixed
    evidence: "The unresolved fixture assertion emits a stable unresolved-named-catalog rejected workflow marker after requiring the composite outcome failure; hosted delivery evidence retains the underlying action log."
  - finding_id: "gate:a8821cb979d66f28:codex:gpt-5.6-sol#3"
    disposition: not-a-blocker
    evidence: "The standalone wp binary intentionally reports product-axis 0.0.0 for wp --version; current setup-wp code and tests prohibit using that output as release provenance. Deliberate non-default Vite+ versions cover resolution; setup-wp provenance is the version-directory cache path plus public release input."
  - finding_id: "gate:a8821cb979d66f28:codex:gpt-5.6-sol#4"
    disposition: fixed
    evidence: "Both seed and fresh-hit jobs execute the exact cache executable with --help after asserting the expected cache path, proving usability without relying on misleading wp --version."
worktree_owner_id: owner-751c870b702c
worktree_owner_branch: bp/qualify-setup-vp-resolution-and-setup
---

<!-- wp-blueprint-source-v1 {"blueprint_id":"5ca8099d-4441-4358-84da-4adcc517c88f","head_id":"8169adea-1c13-446f-a83e-d456546876a3","content_version_id":"0ea37ede-479c-47ec-a59d-b0eb492cd160","relationship_revision_id":"2df618a8-2228-46b1-b0a2-6a97abc343dd"} -->

# Qualify caller setup resolution

## Product wedge anchor

- **Stage outcome:** The public reusable-workflow stage delivers deterministic, tokenless tool installation for Webpresso consumer CI.
- **Consuming surface:** .github/workflows/self-test.yml exercises .github/actions/setup-webpresso-toolchain/action.yml and .github/actions/setup-wp/action.yml on GitHub-hosted runners.
- **New user-visible capability:** Consumer workflows can rely on qualified Vite+ manifest/catalog resolution and a setup-wp cache miss that demonstrably becomes a cache hit without credentials.

## Summary

Add narrow GitHub-runner qualifications for the consumer-facing setup-webpresso-toolchain composite's manifest-range/catalog resolution and setup-wp's partial-seed-to-fresh-runner-hit cache behavior. Keep PR #54's staged rollout only as provenance; do not change public release routing or credentials.

#### Task 99.1: Qualify consumer composite manifest-range and catalog resolution on a runner

**Status:** todo
**Wave:** 1
**Lane:** qa
**Depends:** None
**Produces:** runner-setup-vp-resolution-receipt
**Consumes:** public-tokenless-setup-wp-contract, pinned-setup-vp-action

Add a GitHub-hosted matrix qualification to self-test.yml that executes the consumer-facing local setup-webpresso-toolchain composite. Each runner checkout writes root package.json with caller pnpm metadata and: a vite-plus ^0.1.0 range plus lockfile 0.1.0; vite-plus catalog:vp plus named workspace catalog and lockfile 0.1.1; or vite-plus catalog:missing without that catalog. The valid versions deliberately differ and are not the action's default. Give only the unresolved case continue-on-error around the composite; a following assertion requires failure and emits the stable unresolved-named-catalog rejected marker. Extend parsed YAML tests to bind behavior to the local composite invocation.

**Acceptance:**
- [ ] The runner qualification invokes the local ./.github/actions/setup-webpresso-toolchain composite, whose embedded voidzero-dev/setup-vp remote reference remains immutable SHA 49c3e4e92c52e7f8392712a9267bbe71c5ab30e5, with run-install: false and no version or working-directory override.
- [ ] A matrix creates root caller fixtures: a manifest range ^0.1.0 with pnpm-lock.yaml resolving 0.1.0; a named catalog:vp with pnpm-workspace.yaml and lockfile resolving 0.1.1; and catalog:missing with no matching named catalog. The valid versions are deliberate, distinct, and non-default controls.
- [ ] Valid cases run vp and match their exact lockfile value; the unresolved case makes the local composite fail and only then emits the stable unresolved-named-catalog rejected marker, preventing a silent latest fallback.
- [ ] A colocated parsed-YAML contract test asserts all fixtures, local composite use, root default working directory, embedded immutable setup-vp pin, run-install false, absent version override, exact expected versions, and success/failure controls.
- [ ] bun test and actionlint pass.

#### Task 99.2: Qualify setup-wp partial-seed-to-fresh-hit behavior on hosted runners

**Status:** todo
**Wave:** 2
**Lane:** qa
**Depends:** Task 99.1
**Produces:** runner-setup-wp-cache-receipt
**Consumes:** runner-setup-vp-resolution-receipt, public-tokenless-setup-wp-contract

Add two dependent hosted runner jobs for setup-wp cache qualification. The seed job starts with a non-executable partial exact cache entry, uses the public local composite to safely reseed it, executes the new cached binary, and tars only the version subtree. Upload the tar with the verified immutable upload-artifact SHA. The fresh hit job downloads the tar with the verified immutable download-artifact SHA, restores it into a new runner-local tool cache, calls local setup-wp using an invalid repository, and proves that action itself republished and runs the exact restored binary. This excludes any ambient state from the seed job.

**Acceptance:**
- [ ] A writable RUNNER_TOOL_CACHE seed job creates a non-executable partial entry at wp/0.0.6/x64/wp, invokes local setup-wp against the public release, requires the exact path to become executable, and executes it with --help.
- [ ] The seed job archives only the exact cache subtree with tar and uploads it through actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02.
- [ ] A separate fresh hosted hit job downloads the archive through actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093, restores it under its own writable RUNNER_TOOL_CACHE, and invokes local setup-wp at 0.0.6 with a deliberately nonexistent release-repo.
- [ ] The fresh hit job asserts WP_INSTALL_DIR and command -v wp each equal its restored cache executable, then executes that exact executable with --help. No first-pass PATH or environment state exists in the fresh job.
- [ ] A colocated parsed-YAML contract test asserts partial seed, artifact-only transfer, two job dependency, remote artifact SHAs, fresh-hit invalid-network control, exact paths, and binary execution.
- [ ] bun test and actionlint pass.

#### Task 99.3: Verify public contract and hosted delivery evidence

**Status:** todo
**Wave:** 3
**Lane:** verification
**Depends:** Task 99.2
**Produces:** public-contract-delivery-review
**Consumes:** runner-setup-vp-resolution-receipt, runner-setup-wp-cache-receipt

Validate the narrow public contract through contract tests, actionlint, and sanctioned ci-act where available. Treat successful hosted Self-test execution over all setup-vp matrix cases and both artifact-isolated cache jobs as mandatory delivery evidence. Preserve PR #54 only as historical plan evidence and do not revive its token, private release API, or source archive.

**Acceptance:**
- [ ] The final diff contains no github-token input, GitHub API release query, Authorization header, private webpresso/app endpoint, or source-archive fallback.
- [ ] Every changed remote action reference is a full immutable SHA; repository-local ./ action paths are explicitly permitted and tested as local paths.
- [ ] bun test and actionlint pass, and sanctioned wp ci-act is attempted as supplemental local evidence without weakening the hosted test.
- [ ] After the replacement PR is open, a successful GitHub-hosted Self-test run provides a URL or exact run receipt showing all setup-vp matrix cases plus cache-seed and cache-hit jobs passed; the unresolved fixture's hosted log includes the stable workflow marker.
- [ ] The exact delivery review approves the authority subject, and the completed blueprint records all local and hosted receipts without overstating evidence.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-09-06T10:48:35.680Z
- trust-gate-version: v1

### Material Claims

| ID | Claim | Evidence |
| --- | --- | --- |
| C1 | Current setup-webpresso-toolchain delegates Vite+ discovery to immutable setup-vp without an explicit version, requiring runner proof for range/catalog behavior through the consumer-facing composite. | repo:.github/actions/setup-webpresso-toolchain/action.yml |
| C2 | Current setup-wp can seed a version-directory runner cache after public download, while local tests cover only an already-present hit and not partial-seed-to-fresh-runner-hit behavior. | repo:.github/actions/setup-wp/action.yml |
| C3 | Current public setup-wp accepts no github-token input and uses no GitHub API or source-archive fallback, so the replacement scope must not restore those retired paths. | repo:.github/actions/setup-wp/action.yml |
| C4 | Public webpresso/app-releases v0.0.6 exists and includes wp-linux-x64, enabling an immutable current product-axis cache fixture for ubuntu-latest. | repo:.github/workflows/cloudflare-production.yml |

### Material Decisions

| ID | Decision | Chosen option | Rejected alternatives | Rationale |
| --- | --- | --- | --- | --- |
| D1 | Evidence shape | Runner jobs through local consumer composites plus parsed contract assertions. | Direct setup-vp-only runner test; static checks alone; tokenized/private fallback; source archive. | Hosted jobs exercise what consumers invoke; parsed tests retain local/remote distinction, immutable pins, and discriminating controls. |
| D2 | Cache-hit proof | Transfer only the cache subtree from seed job to dependent fresh hit job through immutable artifact actions. | Reset PATH in the same job; rely on logs alone; treat a pre-existing cache hit as seed evidence. | A fresh job cannot inherit first-pass GITHUB_PATH or WP_INSTALL_DIR, so action-owned cache-hit exports and executable use are independently observable. |
| D3 | Vite+ fixture versions | Use ^0.1.0→0.1.0 and catalog:vp→0.1.1 as deliberate non-default resolution controls. | Use current/default versions; a single valid fixture; infer resolution from YAML only. | Distinct resolved values prevent both valid fixtures from accidentally agreeing with setup-vp latest fallback. |
| D4 | Owner routing | Existing bp/qualify-setup-vp-resolution-and-setup owner. | Primary checkout; bp/verified-setup-wp; generic unmanaged worktree. | Existing owner and its untracked template can be replaced by the narrow draft without raw worktree creation. |
| D5 | Delivery evidence | Require hosted successful Self-test receipt after PR creation; use wp ci-act only as supplemental local evidence. | Local bun/actionlint only; ci-act as sole runner proof; static-only qualification. | Only GitHub-hosted execution proves exact runner behavior of external composites; local act supports iteration but cannot replace it. |

### Promotion Gates

| Gate | Command | Expected outcome | Last result | Defer |
| --- | --- | --- | --- | --- |
| Focused contract baseline | wp test --files test/workflow-shape.test.ts | Focused parsed-workflow contract test is green before and after the qualification change. | deferred: pre-implementation (explicit defer marker) | pre-implementation |
| Policy baseline | wp audit security-quality-regressions | Repository policy audit reports no security-quality regression. | deferred: pre-implementation (explicit defer marker) | pre-implementation |

### Residual Unknowns

None.
