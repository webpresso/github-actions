---
type: blueprint
status: completed
completed_at: '2026-09-06'
complexity: M
created: "2026-09-06"
last_updated: "2026-09-06"
progress: 100% (3/3 tasks done, 0 blocked, updated 2026-09-06)
tags:
  - github-actions
  - setup-vp
  - setup-wp
  - runner-qualification

approvals: []
title: Qualify caller setup resolution
owner: webpresso/github-actions
review_dispositions:
  - finding_id: gate:04344b598ab9257d:codex:gpt-5.6-sol#1
    disposition: fixed
    evidence: Consumer composite runner test.
  - finding_id: gate:04344b598ab9257d:codex:gpt-5.6-sol#2
    disposition: fixed
    evidence: Fresh artifact-isolated cache hit.
  - finding_id: gate:04344b598ab9257d:codex:gpt-5.6-sol#3
    disposition: fixed
    evidence: Hosted Self-test delivery gate.
  - finding_id: gate:04344b598ab9257d:codex:gpt-5.6-sol#4
    disposition: fixed
    evidence: Remote SHA requirement only.
  - finding_id: gate:04344b598ab9257d:codex:gpt-5.6-sol#5
    disposition: fixed
    evidence: Partial cache coverage.
  - finding_id: gate:04344b598ab9257d:codex:gpt-5.6-sol#6
    disposition: not-a-blocker
    evidence: Missing catalog successful fallback is now explicitly controlled.
  - finding_id: gate:a8821cb979d66f28:codex:gpt-5.6-sol#1
    disposition: fixed
    evidence: Fresh cache artifact handoff.
  - finding_id: gate:a8821cb979d66f28:codex:gpt-5.6-sol#2
    disposition: not-a-blocker
    evidence: Latest fallback is supported behavior.
  - finding_id: gate:a8821cb979d66f28:codex:gpt-5.6-sol#3
    disposition: not-a-blocker
    evidence: wp --version has no release provenance.
  - finding_id: gate:a8821cb979d66f28:codex:gpt-5.6-sol#4
    disposition: fixed
    evidence: Exact cache binaries run --help.
  - finding_id: gate:b873a2cbcdfb5bd0:codex:gpt-5.6-sol#1
    disposition: fixed
    evidence: Fallback becomes an explicit dynamic control.
  - finding_id: gate:b873a2cbcdfb5bd0:codex:gpt-5.6-sol#2
    disposition: fixed
    evidence: Non-executable poison marker must be removed.
  - finding_id: gate:b873a2cbcdfb5bd0:codex:gpt-5.6-sol#3
    disposition: fixed
    evidence: Artifact retention is one day.
  - finding_id: gate:96a86cb897737edb:codex:gpt-5.6-sol#1
    disposition: fixed
    evidence: Dedicated fallback job outputs parsed current fallback; valid dependent matrix asserts both fixed values differ from its output.
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

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"agent":"claude-fable-5.1","command":"bun test test/workflow-shape.test.ts","entrypoint":"bun test (repo-native runner, 28 pass / 297 expect)","exit_code":0,"kind":"integration","result":"pass","target_files":[".github/workflows/self-test.yml","test/workflow-shape.test.ts",".github/actions/setup-webpresso-toolchain/action.yml"],"ts":"2026-09-06T13:56:38Z"},{"agent":"claude-fable-5.1","command":"bun test","exit_code":0,"kind":"test","result":"pass","ts":"2026-09-06T13:56:38Z"},{"agent":"claude-fable-5.1","audit_kind":"actionlint","command":"actionlint","exit_code":0,"kind":"audit","passed":true,"result":"pass","ts":"2026-09-06T13:56:38Z"},{"actor":"claude-fable-5.1","agent":"claude-fable-5.1","allow_manual":true,"description":"Hosted GitHub-runner qualification receipts for dynamic-fallback capture and both valid vp resolution routes at head 7f9b520a1f504ebbb210f80a0b6c54729b72eb36. Hosted runner conclusions cannot be produced by a local command, so they are recorded as attested external receipts with their immutable job ids.","kind":"manual","log_excerpt":"run https://github.com/webpresso/github-actions/actions/runs/34036257625 head_sha=7f9b520a1f504ebbb210f80a0b6c54729b72eb36 conclusion=success\njob setup-vp-fallback id=101494803764 conclusion=success (parses current upstream vp fallback via local composite with catalog:missing and publishes it through GITHUB_OUTPUT)\njob setup-vp-resolution (manifest-range, 0.1.0) id=101494862501 conclusion=success (^0.1.0 locks 0.1.0 and asserts the value differs from the dynamically captured fallback)\njob setup-vp-resolution (named-catalog, 0.1.1) id=101494862497 conclusion=success (catalog:vp locks 0.1.1 and asserts the value differs from the dynamically captured fallback)\nlocal: bun test 109 pass / 0 fail; actionlint exit 0","result":"pass","ts":"2026-09-06T13:56:38Z"}]
```
**Wave:** 1
**Lane:** qa
**Depends:** None
**Produces:** runner-setup-vp-resolution-receipt
**Consumes:** public-tokenless-setup-wp-contract, pinned-setup-vp-action

Create a dedicated hosted fallback job that runs local composite with catalog:missing and emits parsed vp version through GITHUB_OUTPUT. Then run only valid ^0.1.0→0.1.0 and catalog:vp→0.1.1 matrix cases after it; each validates current fallback output is nonempty/different before checking exact output. This avoids mutable-latest hardcoding while proving valid manifest routes do not silently fall back.

**Acceptance:**
- [x] Dedicated local-composite fallback job creates missing catalog fixture and outputs the parsed current vp fallback version; 0.3.0 is recorded evidence only, not expected contract.
- [x] Dependent range/catalog matrix invokes same local composite at immutable setup-vp SHA 49c3e4e92c52e7f8392712a9267bbe71c5ab30e5 with run-install false/package-manager-cache false/no version or working directory override.
- [x] Range ^0.1.0 locks 0.1.0 and catalog:vp locks 0.1.1. Each valid job asserts its expected output differs from dynamically captured fallback and equals vp output.
- [x] Parsed contract test binds job dependency/output flow, both fixed fixtures, dynamic fallback capture, composite inputs/pin, and root directory.
- [x] bun test/actionlint pass.

#### Task 99.2: Qualify setup-wp poison-seed-to-fresh-hit behavior

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"agent":"claude-fable-5.1","command":"bun test test/workflow-shape.test.ts","entrypoint":"bun test (repo-native runner, 28 pass / 297 expect)","exit_code":0,"kind":"integration","result":"pass","target_files":[".github/workflows/self-test.yml","test/workflow-shape.test.ts",".github/actions/setup-wp/action.yml"],"ts":"2026-09-06T13:56:38Z"},{"agent":"claude-fable-5.1","command":"bun test","exit_code":0,"kind":"test","result":"pass","ts":"2026-09-06T13:56:38Z"},{"agent":"claude-fable-5.1","audit_kind":"actionlint","command":"actionlint","exit_code":0,"kind":"audit","passed":true,"result":"pass","ts":"2026-09-06T13:56:38Z"},{"actor":"claude-fable-5.1","agent":"claude-fable-5.1","allow_manual":true,"description":"Hosted GitHub-runner qualification receipts for the setup-wp poison-seed-to-fresh-hit cache contract at head 7f9b520a1f504ebbb210f80a0b6c54729b72eb36. Hosted runner conclusions cannot be produced by a local command, so they are recorded as attested external receipts with their immutable job ids.","kind":"manual","log_excerpt":"run https://github.com/webpresso/github-actions/actions/runs/34036257625 head_sha=7f9b520a1f504ebbb210f80a0b6c54729b72eb36 conclusion=success\njob setup-wp-cache-seed id=101494803785 conclusion=success (writes the unique non-executable poison marker into the cache, local setup-wp replaces the bytes, the executable answers --help, and the seed tar is uploaded as a one-day artifact through an immutable upload-artifact SHA)\njob setup-wp-cache-hit id=101494839973 conclusion=success (fresh runner restores the seed through an immutable download-artifact SHA, runs setup-wp against an invalid repository so no network fallback can mask the hit, and asserts its own install dir, PATH entry and --help)\nlocal: bun test 109 pass / 0 fail; actionlint exit 0","result":"pass","ts":"2026-09-06T13:56:38Z"}]
```
**Wave:** 2
**Lane:** qa
**Depends:** Task 99.1
**Produces:** runner-setup-wp-cache-receipt
**Consumes:** runner-setup-vp-resolution-receipt, public-tokenless-setup-wp-contract

Seed a deterministic non-executable poison cache file, require byte replacement by public local setup-wp, transfer exact subtree for one day, and prove fresh invalid-network hit republishes/runs it.

**Acceptance:**
- [x] Seed writes unique non-executable poison marker into cache, setup-wp removes it, executable runs --help.
- [x] Seed tar is one-day artifact via immutable upload SHA.
- [x] Fresh hit download/restores via immutable SHA, invalid repository proves no network fallback, and asserts own install dir/path/help.
- [x] Parsed test binds poison, artifact isolation/pins/retention, invalid control, paths/execution.
- [x] bun test/actionlint pass.

#### Task 99.3: Verify public contract and hosted delivery evidence

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"agent":"claude-fable-5.1","command":"grep -c -E \"uses: [^.]\" .github/workflows/self-test.yml (11 non-relative uses) vs grep -c -E \"uses: [^ ]*@[0-9a-f]{40}\" .github/workflows/self-test.yml (11 SHA-pinned)","dispositioned_count":11,"expected_count":11,"kind":"enumeration","result":"pass","ts":"2026-09-06T13:56:38Z"},{"agent":"claude-fable-5.1","command":"bun test","exit_code":0,"kind":"test","result":"pass","ts":"2026-09-06T13:56:38Z"},{"agent":"claude-fable-5.1","audit_kind":"actionlint","command":"actionlint","exit_code":0,"kind":"audit","passed":true,"result":"pass","ts":"2026-09-06T13:56:38Z"},{"actor":"claude-fable-5.1","agent":"claude-fable-5.1","allow_manual":true,"description":"Whole-run hosted delivery evidence at head 7f9b520a1f504ebbb210f80a0b6c54729b72eb36: every Self-test job green, no private token/API/source-archive behavior, remote actions immutable and local actions exercised, PR #55 CLEAN/MERGEABLE with green required checks.","kind":"manual","log_excerpt":"run https://github.com/webpresso/github-actions/actions/runs/34036257625 head_sha=7f9b520a1f504ebbb210f80a0b6c54729b72eb36 conclusion=success\nwait-for-checks-bounded-failure id=101494773805 success\ncontract-tests id=101494773885 success\nsetup-vp-fallback id=101494803764 success\nwait-for-checks-remote-pin id=101494803765 success\nwait-for-checks-success id=101494803767 success\nsetup-wp-cache-seed id=101494803785 success\nsetup-wp-cache-hit id=101494839973 success\nsetup-vp-resolution (named-catalog, 0.1.1) id=101494862497 success\nsetup-vp-resolution (manifest-range, 0.1.0) id=101494862501 success\nPR https://github.com/webpresso/github-actions/pull/55 state=OPEN mergeStateStatus=CLEAN mergeable=MERGEABLE required check contract-tests=SUCCESS\nlocal: bun test 109 pass / 0 fail; bun test test/workflow-shape.test.ts 28 pass / 0 fail; actionlint exit 0","result":"pass","ts":"2026-09-06T13:56:38Z"}]
```
**Wave:** 3
**Lane:** verification
**Depends:** Task 99.2
**Produces:** public-contract-delivery-review
**Consumes:** runner-setup-vp-resolution-receipt, runner-setup-wp-cache-receipt

Validate local/hosted/delivery evidence without reviving PR #54 behavior.

**Acceptance:**
- [x] No private token/API/archive behavior.
- [x] Remote actions immutable; local actions permitted/tested.
- [x] bun/actionlint pass and ci-act supplement recorded.
- [x] Hosted Self-test passes fallback, both valid resolution cases, seed and hit.
- [x] Exact delivery review and completed blueprint record evidence.

## Completion Summary

### Deliverables

- `.github/workflows/self-test.yml`: a dedicated `setup-vp-fallback` job runs the local `setup-webpresso-toolchain` composite against a `catalog:missing` fixture and publishes the parsed current upstream vp fallback version through `GITHUB_OUTPUT`, so no mutable "latest" version is hardcoded in the suite.
- `.github/workflows/self-test.yml`: a dependent `setup-vp-resolution` matrix runs only the two valid routes -- manifest range `^0.1.0` locking `0.1.0` and named catalog `catalog:vp` locking `0.1.1` -- each asserting its expected version is non-empty and different from the dynamically captured fallback before comparing it to the composite output, at the immutable setup-vp SHA `49c3e4e92c52e7f8392712a9267bbe71c5ab30e5`.
- `.github/workflows/self-test.yml`: `setup-wp-cache-seed` writes a unique non-executable poison marker into the wp cache, proves the local `setup-wp` action replaces those bytes with a binary that answers `--help`, and uploads the exact cache subtree as a one-day artifact through an immutable `actions/upload-artifact` SHA.
- `.github/workflows/self-test.yml`: `setup-wp-cache-hit` restores that seed on a fresh runner through an immutable `actions/download-artifact` SHA and runs `setup-wp` against a deliberately invalid repository, so a genuine cache hit is the only way the job can succeed and no network fallback can mask it.
- `test/workflow-shape.test.ts`: parsed-YAML contract tests bind the fallback job's output flow, both fixed resolution fixtures, the composite inputs and action pin, the poison marker and the artifact isolation/retention/pins, the invalid-repository control, and the asserted install directory, PATH entry and execution.
- `blueprints/.../qualify-setup-vp-resolution-and-setup/`: the plan record, six Codex `gpt-5.6-sol` plan-gate artifacts, the content-bound `review-events.jsonl` ledger, and per-task Evidence Contract receipts.

### Impact

- Consumer CI can rely on qualified Vite+ version resolution: a manifest range and a named catalog entry are each proven on a GitHub-hosted runner to resolve to their pinned version rather than silently falling back to the upstream default.
- The fallback contract is qualified dynamically instead of against a recorded `0.3.0`, so an upstream vp release can no longer turn a passing suite red nor make a silent fallback look like a correct resolution.
- `setup-wp` cache behavior is qualified end to end without credentials: a poisoned partial cache is provably replaced, and a real cross-job cache hit is proven on a fresh runner with the network route disabled.
- Every qualification run is tokenless against public surfaces only, with all 11 remote `uses:` references SHA-pinned and the local actions exercised directly, so the reusable workflows stay safe to consume from outside the organization.
- Hosted evidence at head `7f9b520a1f504ebbb210f80a0b6c54729b72eb36`: Self-test run 34036257625 green across all nine jobs; local `bun test` 109 pass / 0 fail and `actionlint` exit 0.

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
| Focused | wp test --files test/workflow-shape.test.ts | Focused contract green. | pass: bun test test/workflow-shape.test.ts 28 pass / 0 fail (repo-native runner). | pre-implementation |
| Policy | wp audit security-quality-regressions | No policy regression. | pass: actionlint exit 0 (repo-native policy gate). | pre-implementation |

### Residual Unknowns

None.
