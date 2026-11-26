---
type: blueprint
title: "Verify the whole cached setup-wp tree and refuse privilege-bit extractions"
status: draft
complexity: S
owner: "Claude Code"
created: "2026-11-27"
last_updated: "2026-11-27"
tags:
  - "post-merge-audit"
---

<!-- wp-blueprint-source-v1 {"blueprint_id":"dd5b1f3d-b79b-4424-90d4-a9fc09b76352","head_id":"d8ac828f-14c4-439d-8cbf-73c8f213b2c0","content_version_id":"4523625e-2a90-49fc-8e39-171d4ef4083f","relationship_revision_id":"267af576-6fa9-418d-b1f6-dc6017e728c7"} -->

# Verify the whole cached setup-wp tree and refuse privilege-bit extractions

## Product wedge anchor

- **Stage outcome:** README.md, the wp install contract (setup-wp) bullets and the Security contract section: every consumer repository's CI installs wp through setup-wp with integrity it can rely on, so a restored tool cache carries the same release-verified content the download path verified, and the reusable workflows in this repository are the first consumers of that guarantee
- **Consuming surface:** the setup-wp composite action (.github/actions/setup-wp/action.yml) consumed by the four reusable workflows and by every consumer repository pinning webpresso/github-actions/.github/actions/setup-wp, exercised live by .github/workflows/self-test.yml
- **New user-visible capability:** a consumer whose runner tool cache was corrupted or planted with foreign files gets a named exit 16 failure or an honest re-download instead of silently serving a tampered wp binary, helper set or package-root tree, and a root-run runner can no longer have archive ownership or setuid bits restored onto disk

## Summary

**Goal.** Make a setup-wp tool-cache hit as trustworthy as the download it skips: every file the action serves from the cache is content-verified, extraction cannot restore ownership or privilege bits on root-run runners, and at least one sign-in-contract proof drives the real published wp CLI instead of the repo-local stub.

**Diagnosis (verified 2026-11-27 at b5dd92d, owner HEAD, by reading the tree and running probes).** On a full-tree tool-cache hit the action hashes only bin/wp (action.yml:228) against a record seeded from the staged binary alone (:389, written at :416-417), then serves the cached package-root/ tree verbatim through cp -Rp (:455) on structural checks only, not a symlink with catalog/ present (:242-245), into WEBPRESSO_PACKAGE_ROOT (:500); bin/* siblings and manifest.json serve unverified into PATH and WP_INSTALL_DIR (:236-237). The contract suite pins this verbatim zero-download serving (test/setup-wp-archive-contract.test.ts:700-716) with no content check. Extraction is a plain tar -xzf (:346) with no --no-same-owner or --no-same-permissions anywhere under .github/ or test/ (git grep matches only docs/reviews), the follow-up PR #61's round-2 review accepted (docs/reviews/2026-11-06-setup-wp-install-archive-opus-round2-approve-with-nits.md:74 and :105-111) and PR #66's rewrite dropped; the later chmod +x (:388) does not clear setuid and the cp -Rp seed (:412) carries surviving bits into the install tree and the cache. Every sign-in proof drives the STUB_WP bash script (test/setup-wp-auth.test.ts:58, 517 lines); the live jobs install real 0.0.21 and 0.0.23 but assert only install and skip (.github/workflows/self-test.yml:452, :469, :509), and test/workflow-shape.test.ts:844 pins that self-test never grants id-token.

**Probe corrections (2026-11-27, darwin-arm64 archives, sidecar digests verified).** The published v0.0.23 and v0.0.24 binaries answer auth status --json with Unknown command: auth (exit 1) and help --full lists no auth command, so no published release carries the sign-in surface yet: a real wp auth exercise is impossible today, and the floor's liveable proof is the refusal side, where 0.0.24 with auth auto and no id-token fails with exit 17 before invoking the binary (:591-594) while the real binary itself runs and reports 0.0.24. The same archives list only 0644 and 0755 modes (tar -tvzf), so a privilege-bit refusal cannot false-positive on healthy releases, and their manifest.json is a complete whole-tree digest (6366 files, exact set match, zero digest mismatches). A non-root bsdtar extraction of a 4755 fixture drops the bit with and without the flags, so only a listing-level refusal can enforce the rule on every platform.

**Approach.** Seed a wp.tree.sha256 record beside wp.sha256 at cache seed time, one line per regular file pairing its sha256 digest with the path relative to the cache root, sorted bytewise, and on every full-tree cache hit re-derive that text from the cache and byte-compare it: any changed, missing or extra file exits 16 with a named mismatch, and a full-tree hit without the record becomes an honest miss that re-downloads, re-verifies against the sidecar and reseeds, so package-root true serves the cached tree only after whole-tree verification and the download-path guarantee is restored. Extraction adds --no-same-owner --no-same-permissions and the kinds listing refusal rejects any entry carrying setuid, setgid or sticky bits (exit 13 before extraction), because the flags alone leave setuid set under root GNU tar (the umask does not cover the 4000 and 2000 bits). The rejected alternative for the record is parsing the release's own manifest.json: it is the natural digest, but the composite parses JSON with sed only (no python3, and jq is not guaranteed on ARC images), while the seeded record sits in the same sidecar-verified trust chain. The real-CLI proof is a new self-test job installing the real 0.0.24 with auth auto, no id-token and continue-on-error, asserting the exit-17 refusal and then executing the real binary, whose wp --version prints 0.0.24; granting self-test id-token stays refused because workflow-shape pins its absence and pull_request forks receive none.

**Lane alignment (2026-11-27 census).** gh pr list --state open on this repository returned no pull requests, and no other worktree claims these files.

**Risk.** Low. The record requirement converts caches seeded by the current action into a one-time re-download per runner per version, visible only after a consumer moves its action pin. The privilege-bit refusal cannot false-refuse the published release line (probed listings carry no such bits). The contract suite runs with bun test, which the wp test facade cannot host (it routes to vitest, which cannot load bun:test), so the Verify rows use the facade's format check, probed passing on every file this plan modifies.

**Origin.** Post-merge audit of 2026-11-26, findings github-actions:#66:0, sys:11:64, sys:11:66.

## Wave 1: 1

<!-- wp-blueprint-wave-v1 {"id":"caf65185-07e7-425f-9465-165828287340","ref":"1","title":"1"} -->

#### Task 1.1: Seed and require a whole-tree digest record on tool-cache hits
<!-- wp-blueprint-task-v1 {"id":"f5a16277-65df-4af5-8935-d2662ff9fa9a","ref":"1.1"} -->

**Status:** todo
**Wave:** 1
**Lane:** backend
**Depends:** None

**Files:**

- Modify: `.github/actions/setup-wp/action.yml`
- Modify: `test/setup-wp-archive-contract.test.ts`
- Modify: `test/setup-wp-current-information.test.ts`
- Modify: `README.md`

**Change:**
The action seeds a whole-tree digest record into the tool cache and requires it on every full-tree cache hit. At seed time the action derives one sha256 digest per regular file of the staged tree, pairs each digest with the path relative to the cache root, sorts the lines bytewise, and writes wp.tree.sha256 into the cache root atomically before the wp.sha256 record, invalidating both records before any reseed so an interrupted seed still leaves no usable record. On a hit the action re-derives that text from the cached tree and byte-compares it: a changed, missing or extra file fails with the named exit 16 mismatch, and a full-tree hit carrying no tree record becomes an honest cache miss that re-downloads, re-verifies the archive against its sidecar and reseeds both records, so package-root true serves the cached tree only after whole-tree verification, restoring the download-path guarantee every package-root run had before PR #66. Legacy flat cache hits keep today's binary-only rule, because only the binary is served from them. The stale cache comment claiming every release binary reports version 0.0.0 is corrected: archive-layout releases identify themselves through the sibling manifest.json, probed on the published 0.0.23 and 0.0.24. In test/setup-wp-archive-contract.test.ts the whole-tree fixture gains a seeded record, and new tests prove that a tampered cached package-root file exits 16, that an extra unlisted cache file exits 16, that a full-tree hit with only the binary record becomes a miss which downloads and reseeds, and that the seeded record byte-equals the text re-derived from the seeded tree over a non-empty file set, while the existing zero-download hit test keeps passing through the record. test/setup-wp-current-information.test.ts recomputes the action behavior hash and extends the README agreement bullets, and README.md documents the tree record and the one-time migration miss. The contract suite runs with bun test (test/setup-wp-archive-contract.test.ts, 54 passing tests in about 12 seconds today) and must stay green; the wp test facade routes this repository to vitest and cannot load bun:test, so it is deliberately not a Verify row.

**Verify:**

- [A1] `wp format --check --files .github/actions/setup-wp/action.yml test/setup-wp-archive-contract.test.ts test/setup-wp-current-information.test.ts README.md`

**Acceptance:**
- [ ] [A1] Scoped format check passes on the action, the archive contract test, the current-information test and the README

## Wave 2: 2

<!-- wp-blueprint-wave-v1 {"id":"d9c1955c-7d4e-43d5-8e68-629ed3132295","ref":"2","title":"2"} -->

#### Task 2.1: Extract the archive without preserving ownership or privilege bits
<!-- wp-blueprint-task-v1 {"id":"c249776d-1848-45a0-874a-110f99bc5eee","ref":"2.1"} -->

**Status:** todo
**Wave:** 2
**Lane:** backend
**Depends:** Task 1.1

**Files:**

- Modify: `.github/actions/setup-wp/action.yml`
- Modify: `test/setup-wp-archive-contract.test.ts`
- Modify: `test/setup-wp-current-information.test.ts`
- Modify: `README.md`

**Change:**
Extraction stops preserving ownership and privilege bits. The tar invocation at action.yml:346 gains --no-same-owner and --no-same-permissions, which GNU tar and bsdtar both accept, so a root-run extraction no longer restores archive uid and gid; this is the follow-up PR #61's round-2 review accepted and PR #66's rewrite dropped. Because the permissions flag applies only the umask, which does not cover the 4000 and 2000 bits, the action also extends the kinds-listing allow-list at action.yml:328-344 to refuse any entry whose mode field carries setuid, setgid or sticky bits, failing with the named exit 13 before anything is extracted; a silent post-extraction strip is rejected because it would install a compromised release's payload quietly, and a disk-level refusal alone cannot fire because a non-root extraction drops the bit before any check observes it, probed on darwin bsdtar where a 4755 fixture extracts as 755 with and without the flags. In test/setup-wp-archive-contract.test.ts a real-tar fixture whose file carries the setuid bit is refused with exit 13 naming the entry, and the recording tar stub asserts the extraction call carries both flags, extending the call-ordering assertions at test lines 795 to 807. README.md documents the extraction posture beside the checksum bullet, and test/setup-wp-current-information.test.ts recomputes the action behavior hash. The published release line lists only 0644 and 0755 modes, probed on v0.0.23 and v0.0.24 darwin-arm64, so the refusal cannot false-positive on healthy archives, and the contract suite under bun test must stay green.

**Verify:**

- [A1] `wp format --check --files .github/actions/setup-wp/action.yml test/setup-wp-archive-contract.test.ts test/setup-wp-current-information.test.ts README.md`

**Acceptance:**
- [ ] [A1] Scoped format check passes on the action, the archive contract test, the current-information test and the README after the extraction change

#### Task 2.2: Prove the login floor live against the real published release
<!-- wp-blueprint-task-v1 {"id":"b6742a10-0e71-4136-ad39-98c26d281ea2","ref":"2.2"} -->

**Status:** todo
**Wave:** 2
**Lane:** backend
**Depends:** Task 1.1

**Files:**

- Modify: `.github/workflows/self-test.yml`
- Modify: `test/workflow-shape.test.ts`

**Change:**
self-test.yml gains a setup-wp-live-floor job, modelled on setup-wp-live-skip, that proves the floor's refusal side live against the real published release and drives the real CLI. The job checks out with persist-credentials false, grants contents read only, installs the real published 0.0.24 through the in-repo action with auth auto and no id-token under continue-on-error, then asserts the step failed with the exit 17 no-id-token refusal, which the action emits before invoking the binary (action.yml:591-594), and finally executes the real installed binary and asserts wp --version prints 0.0.24. This is the first sign-in-contract proof driven by the real CLI: every proof in test/setup-wp-auth.test.ts runs the STUB_WP bash script, and the published 0.0.23 and 0.0.24 binaries answer auth status --json with Unknown command: auth, so driving a real wp auth surface is impossible until a release ships one; the completed blueprint reusable-setup-wp-floor-0024 recorded the same gap when 0.0.24 was still unpublished, and this job keeps proving the floor refusal whichever way the release line evolves. The cache-seed job's required seeded files gain wp.tree.sha256 so the live cache pair exercises the whole-tree record end to end. test/workflow-shape.test.ts pins the new job's shape beside the existing live-skip pins: version 0.0.24, auth auto, permissions contents read only, the expected-failure pattern, and the real-binary assertion text. The contract suite under bun test must stay green.

**Verify:**

- [A1] `wp format --check --files .github/workflows/self-test.yml test/workflow-shape.test.ts`

**Acceptance:**
- [ ] [A1] Scoped format check passes on the self-test workflow and the workflow-shape test after the live floor proof lands

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-11-27T01:58:00.000Z
- trust-gate-version: v1

### Material Claims

| ID | Claim | Evidence |
| --- | --- | --- |
| C1 | On a full-tree tool-cache hit the action hashes only bin/wp against a record seeded from the staged binary alone, then serves the cached package-root/ verbatim on structural checks only (.github/actions/setup-wp/action.yml:228, :236-237, :242-245, :389, :412, :416-417, :455, :500) | repo:.github/actions/setup-wp/action.yml |
| C2 | The contract suite pins the verbatim zero-download whole-tree cache hit, including package-root true, with no content verification of the cached tree (test/setup-wp-archive-contract.test.ts:700-716) | repo:test/setup-wp-archive-contract.test.ts |
| C3 | The only extraction is a plain tar -xzf at .github/actions/setup-wp/action.yml:346, and git grep for no-same-owner or no-same-permissions over .github and test matches only docs/reviews at b5dd92d | repo:.github/actions/setup-wp/action.yml |
| C4 | Every sign-in proof drives the STUB_WP bash script (test/setup-wp-auth.test.ts:58, 517 lines), the live jobs assert only install and skip (.github/workflows/self-test.yml:452, :469, :509), and self-test is pinned to never grant id-token (test/workflow-shape.test.ts:844) | repo:test/setup-wp-auth.test.ts |
| C5 | Probed 2026-11-27 by downloading the sidecar-verified darwin-arm64 archives of v0.0.23 and v0.0.24: both binaries answer auth status --json with Unknown command: auth (exit 1) and help --full lists no auth command, while wp --version prints the release version from the sibling manifest.json, so no published release carries the sign-in surface and the floor refusal at .github/actions/setup-wp/action.yml:591-594 is the liveable real-binary proof | repo:.github/actions/setup-wp/action.yml |
| C6 | Probed 2026-11-27 with tar -tvzf on v0.0.23 and v0.0.24 darwin-arm64: release listings carry only 0644 and 0755 file modes, and v0.0.24's manifest.json is a complete whole-tree digest with 6366 files, an exact set match against the extracted tree and zero digest mismatches (README.md:56 documents manifest.json as part of the installed archive tree) | repo:README.md |
| C7 | The wp facade in this repository routes wp test to vitest, which cannot load bun:test, and wp lint false-reds on the test files through a type-aware rule over an unresolved Buffer, while wp format --check passes on every file this plan modifies, probed 2026-11-27 in the owner worktree; bun test remains the suite command (README.md:31) and ran 54 passing tests on the archive contract file in about 12 seconds | repo:README.md |

### Material Decisions

| ID | Decision | Chosen option | Rejected alternatives | Rationale |
| --- | --- | --- | --- | --- |
| D1 | How the cache proves whole-tree integrity on a hit | an action-written sha256-format wp.tree.sha256 record, seeded only from the sidecar-verified staged tree and byte-compared on the hit by re-deriving the same text | parsing the release's own manifest.json (a complete digest per C6, but the composite parses JSON with sed only, python3 is excluded by contract and jq is not guaranteed on ARC images, and a 6366-entry nested object is not line-parseable); verify-by-redownload on every package-root hit (defeats the zero-network hit the cache exists for); trusting wp.sha256 alone (the confirmed unverified-serve regression) | the record sits in the same trust chain as the release sidecar, is portable plain text the composite already produces and compares, and byte-comparison names drift of any kind, changed, missing or extra |
| D2 | What a full-tree cache hit without a tree record does | an honest cache miss that re-downloads, re-verifies the archive against its sidecar and reseeds both records | accepting legacy hits with binary-only verification (the exact unverified-serve regression finding github-actions:#66:0 confirms) and hard-failing with exit 16 when the record is merely absent (caches seeded by the current action would fail forever instead of migrating once per runner) | a missing record proves nothing about the tree, and one re-download per runner per version is the cheapest honest migration, visible only after a consumer moves its action pin |
| D3 | How ownership and privilege bits are handled at extraction | refuse any listing entry carrying setuid, setgid or sticky bits with exit 13 before extraction, and extract with --no-same-owner --no-same-permissions | a silent post-extraction strip (a compromised release's payload would install quietly with bits cleared, hiding the signal, and the strip is unobservable running as non-root) and a disk-level refusal alone (a non-root extraction drops the bit before any check observes it, probed on darwin bsdtar with a 4755 fixture) | the listing guard bites on every platform and the fixture can prove it, the flags fix the ownership half the accepted review follow-up named, and the published release line carries no such bits so the refusal has no false positives (C6) |
| D4 | What the real-CLI proof drives | a live self-test job proving the floor refusal on the real published 0.0.24 (exit 17 before any binary invocation) and then executing the real binary, asserting wp --version prints 0.0.24 | driving a real wp auth surface (no published release ships one per C5); granting self-test id-token (pinned absent at test/workflow-shape.test.ts:844, and pull_request forks receive none); downloading releases inside the bun contract suite (the suite is hermetic by design, its header says no network) | the refusal side is provable today against the real release line, it discriminates a floor regression from a binary drift (exit 17 versus a binary attempt), and it keeps proving the contract whichever way the release line evolves |

### Promotion Gates

| Gate | Command | Expected outcome | Last result |
| --- | --- | --- | --- |
| Format | wp format --check --files .github/actions/setup-wp/action.yml | No format issues | pass |
| Format | wp format --check --files README.md | No format issues | pass |
| Format | wp format --check --files .github/workflows/self-test.yml | No format issues | pass |

### Residual Unknowns

None.
