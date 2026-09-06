---
type: blueprint
status: in-progress
complexity: M
created: '2026-09-06'
last_updated: "2026-09-06"
progress: "Recorded fallback 0.3.0 is evidence only. The workflow now captures current upstream fallback dynamically in a dedicated job and makes valid fixture jobs prove their fixed versions differ from it."
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
    evidence: "Consumer composite runner test."
  - finding_id: "gate:04344b598ab9257d:codex:gpt-5.6-sol#2"
    disposition: fixed
    evidence: "Fresh artifact-isolated cache hit."
  - finding_id: "gate:04344b598ab9257d:codex:gpt-5.6-sol#3"
    disposition: fixed
    evidence: "Hosted Self-test delivery gate."
  - finding_id: "gate:04344b598ab9257d:codex:gpt-5.6-sol#4"
    disposition: fixed
    evidence: "Remote SHA requirement only."
  - finding_id: "gate:04344b598ab9257d:codex:gpt-5.6-sol#5"
    disposition: fixed
    evidence: "Partial cache coverage."
  - finding_id: "gate:04344b598ab9257d:codex:gpt-5.6-sol#6"
    disposition: not-a-blocker
    evidence: "Missing catalog successful fallback is now explicitly controlled."
  - finding_id: "gate:a8821cb979d66f28:codex:gpt-5.6-sol#1"
    disposition: fixed
    evidence: "Fresh cache artifact handoff."
  - finding_id: "gate:a8821cb979d66f28:codex:gpt-5.6-sol#2"
    disposition: not-a-blocker
    evidence: "Latest fallback is supported behavior."
  - finding_id: "gate:a8821cb979d66f28:codex:gpt-5.6-sol#3"
    disposition: not-a-blocker
    evidence: "wp --version has no release provenance."
  - finding_id: "gate:a8821cb979d66f28:codex:gpt-5.6-sol#4"
    disposition: fixed
    evidence: "Exact cache binaries run --help."
  - finding_id: "gate:b873a2cbcdfb5bd0:codex:gpt-5.6-sol#1"
    disposition: fixed
    evidence: "Fallback becomes an explicit dynamic control."
  - finding_id: "gate:b873a2cbcdfb5bd0:codex:gpt-5.6-sol#2"
    disposition: fixed
    evidence: "Non-executable poison marker must be removed."
  - finding_id: "gate:b873a2cbcdfb5bd0:codex:gpt-5.6-sol#3"
    disposition: fixed
    evidence: "Artifact retention is one day."
  - finding_id: "gate:96a86cb897737edb:codex:gpt-5.6-sol#1"
    disposition: fixed
    evidence: "Dedicated fallback job outputs parsed current fallback; valid dependent matrix asserts both fixed values differ from its output."
worktree_owner_id: owner-751c870b702c
worktree_owner_branch: bp/qualify-setup-vp-resolution-and-setup
---

<!-- wp-blueprint-source-v1 {"blueprint_id":"5ca8099d-4441-4358-84da-4adcc517c88f","head_id":"af2db578-5343-45bd-baae-2d4135dcb1d1","content_version_id":"c5035555-d7fc-4aba-90cb-dca35d3f8282","relationship_revision_id":"75eef61c-d15e-45d0-ba70-0f798fd0709d"} -->

# Qualify caller setup resolution

## Product wedge anchor

- **Stage outcome:** The public reusable-workflow stage delivers deterministic, tokenless tool installation for Webpresso consumer CI.
- **Consuming surface:** .github/workflows/self-test.yml exercises .github/actions/setup-webpresso-toolchain/action.yml and .github/actions/setup-wp/action.yml on GitHub-hosted runners.
- **New user-visible capability:** Consumer workflows can rely on qualified Vite+ manifest/catalog resolution and a setup-wp cache miss that demonstrably becomes a cache hit without credentials.

## Summary

Qualify consumer composite range/catalog resolution against a dynamically captured latest fallback, and setup-wp poison-seed-to-fresh-runner-hit behavior without private routing or credentials.

#### Task 99.1: Qualify range and catalog resolution against dynamic fallback

**Status:** todo
**Wave:** 1
**Lane:** qa
**Depends:** None
**Produces:** runner-setup-vp-resolution-receipt
**Consumes:** public-tokenless-setup-wp-contract, pinned-setup-vp-action

Create a dedicated hosted fallback job that runs local composite with catalog:missing and emits parsed vp version through GITHUB_OUTPUT. Then run only valid ^0.1.0→0.1.0 and catalog:vp→0.1.1 matrix cases after it; each validates current fallback output is nonempty/different before checking exact output. This avoids mutable-latest hardcoding while proving valid manifest routes do not silently fall back.

**Acceptance:**
- [ ] Dedicated local-composite fallback job creates missing catalog fixture and outputs the parsed current vp fallback version; 0.3.0 is recorded evidence only, not expected contract.
- [ ] Dependent range/catalog matrix invokes same local composite at immutable setup-vp SHA 49c3e4e92c52e7f8392712a9267bbe71c5ab30e5 with run-install false/package-manager-cache false/no version or working directory override.
- [ ] Range ^0.1.0 locks 0.1.0 and catalog:vp locks 0.1.1. Each valid job asserts its expected output differs from dynamically captured fallback and equals vp output.
- [ ] Parsed contract test binds job dependency/output flow, both fixed fixtures, dynamic fallback capture, composite inputs/pin, and root directory.
- [ ] bun test/actionlint pass.

#### Task 99.2: Qualify setup-wp poison-seed-to-fresh-hit behavior

**Status:** todo
**Wave:** 2
**Lane:** qa
**Depends:** Task 99.1
**Produces:** runner-setup-wp-cache-receipt
**Consumes:** runner-setup-vp-resolution-receipt, public-tokenless-setup-wp-contract

Seed a deterministic non-executable poison cache file, require byte replacement by public local setup-wp, transfer exact subtree for one day, and prove fresh invalid-network hit republishes/runs it.

**Acceptance:**
- [ ] Seed writes unique non-executable poison marker into cache, setup-wp removes it, executable runs --help.
- [ ] Seed tar is one-day artifact via immutable upload SHA.
- [ ] Fresh hit download/restores via immutable SHA, invalid repository proves no network fallback, and asserts own install dir/path/help.
- [ ] Parsed test binds poison, artifact isolation/pins/retention, invalid control, paths/execution.
- [ ] bun test/actionlint pass.

#### Task 99.3: Verify public contract and hosted delivery evidence

**Status:** todo
**Wave:** 3
**Lane:** verification
**Depends:** Task 99.2
**Produces:** public-contract-delivery-review
**Consumes:** runner-setup-vp-resolution-receipt, runner-setup-wp-cache-receipt

Validate local/hosted/delivery evidence without reviving PR #54 behavior.

**Acceptance:**
- [ ] No private token/API/archive behavior.
- [ ] Remote actions immutable; local actions permitted/tested.
- [ ] bun/actionlint pass and ci-act supplement recorded.
- [ ] Hosted Self-test passes fallback, both valid resolution cases, seed and hit.
- [ ] Exact delivery review and completed blueprint record evidence.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-09-06T11:12:00Z
- trust-gate-version: v1

### Material Claims

| ID | Claim | Evidence |
| --- | --- | --- |
| C1 | Composite delegates version discovery to immutable setup-vp. | repo:.github/actions/setup-webpresso-toolchain/action.yml |
| C2 | setup-wp needs hosted poison-seed/fresh-hit coverage. | repo:.github/actions/setup-wp/action.yml |
| C3 | setup-wp is public tokenless no-source-archive. | repo:.github/actions/setup-wp/action.yml |
| C4 | Public 0.0.6 workflow pin supports cache fixture. | repo:.github/workflows/cloudflare-production.yml |

### Material Decisions

| ID | Decision | Chosen option | Rejected alternatives | Rationale |
| --- | --- | --- | --- | --- |
| D1 | Evidence | Hosted local composite and parsed contracts. | Direct/static/private. | Consumer behavior proof. |
| D2 | Cache | Fresh artifact hit. | Same job. | No ambient state. |
| D3 | Resolution | Dynamic fallback output controls fixed routes. | 0.3.0 expected; no fallback. | No mutable latest hardcode. |
| D4 | Partial cache | Poison nonexec bytes. | Empty/chmod. | Proves replacement. |
| D5 | Delivery | Hosted test mandatory. | Local only. | Authoritative runner. |

### Promotion Gates

| Gate | Command | Expected outcome | Last result | Defer |
| --- | --- | --- | --- | --- |
| Focused | wp test --files test/workflow-shape.test.ts | Focused contract green. | bun native. | pre-implementation |
| Policy | wp audit security-quality-regressions | No policy regression. | actionlint required. | pre-implementation |

### Residual Unknowns

None.
