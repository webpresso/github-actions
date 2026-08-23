---
type: blueprint
title: "Correct setup-wp current information"
status: completed
complexity: S
owner: "webpresso/github-actions"
created: "2026-08-23"
last_updated: "2026-08-23"
progress: 100% (1/1 tasks done, 0 blocked, updated 2026-08-23)
tags:
  - "setup-wp"
  - "release"
  - "documentation"
  - "current-state"
review_dispositions:
  - finding_id: "gate:2db3694004216441:claude:claude-opus-5#1"
    disposition: fixed
    evidence: "Re-grounded to executable action/workflow/tests with source-parity assertions and an immutable no-behavior-change boundary."
  - finding_id: "gate:2db3694004216441:claude:claude-opus-5#2"
    disposition: fixed
    evidence: "Re-grounded to executable action/workflow/tests with source-parity assertions and an immutable no-behavior-change boundary."
  - finding_id: "gate:2db3694004216441:claude:claude-opus-5#3"
    disposition: fixed
    evidence: "Re-grounded to executable action/workflow/tests with source-parity assertions and an immutable no-behavior-change boundary."
  - finding_id: "gate:2db3694004216441:claude:claude-opus-5#4"
    disposition: fixed
    evidence: "Re-grounded to executable action/workflow/tests with source-parity assertions and an immutable no-behavior-change boundary."
  - finding_id: "gate:2db3694004216441:claude:claude-opus-5#5"
    disposition: fixed
    evidence: "Re-grounded to executable action/workflow/tests with source-parity assertions and an immutable no-behavior-change boundary."
  - finding_id: "gate:2db3694004216441:claude:claude-opus-5#6"
    disposition: fixed
    evidence: "Re-grounded to executable action/workflow/tests with source-parity assertions and an immutable no-behavior-change boundary."
  - finding_id: "gate:2db3694004216441:claude:claude-opus-5#7"
    disposition: fixed
    evidence: "Re-grounded to executable action/workflow/tests with source-parity assertions and an immutable no-behavior-change boundary."
  - finding_id: "gate:4b7cbc9f282dcd4c:claude:claude-opus-5#1"
    disposition: fixed
    evidence: "Re-grounded to executable action/workflow/tests with source-parity assertions and an immutable no-behavior-change boundary."
  - finding_id: "gate:4b7cbc9f282dcd4c:claude:claude-opus-5#2"
    disposition: fixed
    evidence: "Re-grounded to executable action/workflow/tests with source-parity assertions and an immutable no-behavior-change boundary."
  - finding_id: "gate:4b7cbc9f282dcd4c:claude:claude-opus-5#3"
    disposition: fixed
    evidence: "Re-grounded to executable action/workflow/tests with source-parity assertions and an immutable no-behavior-change boundary."
  - finding_id: "gate:4b7cbc9f282dcd4c:claude:claude-opus-5#4"
    disposition: fixed
    evidence: "Re-grounded to executable action/workflow/tests with source-parity assertions and an immutable no-behavior-change boundary."
  - finding_id: "gate:4b7cbc9f282dcd4c:claude:claude-opus-5#5"
    disposition: fixed
    evidence: "Re-grounded to executable action/workflow/tests with source-parity assertions and an immutable no-behavior-change boundary."
  - finding_id: "gate:4b7cbc9f282dcd4c:claude:claude-opus-5#6"
    disposition: fixed
    evidence: "Re-grounded to executable action/workflow/tests with source-parity assertions and an immutable no-behavior-change boundary."
  - finding_id: "gate:4b7cbc9f282dcd4c:claude:claude-opus-5#7"
    disposition: fixed
    evidence: "Re-grounded to executable action/workflow/tests with source-parity assertions and an immutable no-behavior-change boundary."
  - finding_id: "gate:d0108066f38e6e91:claude:claude-opus-5#1"
    disposition: fixed
    evidence: "Re-grounded to executable action/workflow/tests with source-parity assertions and an immutable no-behavior-change boundary."
  - finding_id: "gate:d0108066f38e6e91:claude:claude-opus-5#2"
    disposition: fixed
    evidence: "Re-grounded to executable action/workflow/tests with source-parity assertions and an immutable no-behavior-change boundary."
  - finding_id: "gate:d0108066f38e6e91:claude:claude-opus-5#3"
    disposition: fixed
    evidence: "Re-grounded to executable action/workflow/tests with source-parity assertions and an immutable no-behavior-change boundary."
  - finding_id: "gate:9e07b5d2879a10bd:claude:claude-opus-5#1"
    disposition: fixed
    evidence: "Re-grounded to executable action/workflow/tests with source-parity assertions and an immutable no-behavior-change boundary."
  - finding_id: "gate:9e07b5d2879a10bd:claude:claude-opus-5#2"
    disposition: fixed
    evidence: "Re-grounded to executable action/workflow/tests with source-parity assertions and an immutable no-behavior-change boundary."
  - finding_id: "gate:9e07b5d2879a10bd:claude:claude-opus-5#3"
    disposition: fixed
    evidence: "Re-grounded to executable action/workflow/tests with source-parity assertions and an immutable no-behavior-change boundary."
  - finding_id: "gate:9e07b5d2879a10bd:claude:claude-opus-5#4"
    disposition: fixed
    evidence: "Re-grounded to executable action/workflow/tests with source-parity assertions and an immutable no-behavior-change boundary."
  - finding_id: "gate:9e07b5d2879a10bd:claude:claude-opus-5#5"
    disposition: fixed
    evidence: "Re-grounded to executable action/workflow/tests with source-parity assertions and an immutable no-behavior-change boundary."
  - finding_id: "gate:d6591bd36b76e38b:claude:claude-opus-5#1"
    disposition: fixed
    evidence: "Public configurable webpresso/app-releases and tokenless direct-download truth is derived from executable source; source wins on drift."
  - finding_id: "gate:d6591bd36b76e38b:claude:claude-opus-5#2"
    disposition: fixed
    evidence: "Checksum, cache-hit, best-effort seed, and download-on-miss wording is consistent and re-derived from executable source at task start."
  - finding_id: "gate:d6591bd36b76e38b:claude:claude-opus-5#3"
    disposition: fixed
    evidence: "The action has no github-token input; the task removes stale token prose and locks tokenless behavior from source."
  - finding_id: "gate:55752e1b5cd7160f:grok:grok-4.5#1"
    disposition: fixed
    evidence: "Summary and D1 make latest-main executable source at task start the sole authority. 36b412a is historical only; drift requires typed rewrite, validation, and re-review before implementation."
  - finding_id: "gate:55752e1b5cd7160f:grok:grok-4.5#2"
    disposition: not-a-blocker
    evidence: "The exact four suites remain mandatory Task 1.1 verification and canonical evidence. Current trust execution cannot safely represent Bun-native files: wp test routes through Vitest and wp exec is not an allowed Promotion Gate. The table therefore contains only the directly relevant, representable github-actions-secrets audit."
  - finding_id: "gate:55752e1b5cd7160f:grok:grok-4.5#3"
    disposition: fixed
    evidence: "C6 cites both test/setup-wp.test.ts and test/freshness.test.ts for its two-part executable-lock claim."
  - finding_id: "gate:b806ebecbcb277cf:grok:grok-4.5#1"
    disposition: fixed
    evidence: "Task 1.1 now freezes input keys/defaults/required flags and runs.steps/workflow behavior while explicitly permitting descriptive metadata fields, including inputs.package-root.description, to change for source parity."
  - finding_id: "gate:b806ebecbcb277cf:grok:grok-4.5#2"
    disposition: fixed
    evidence: "C8 now attributes token/package-root/export/failure drift to README plus inputs.package-root.description; C9 separately attributes freshness filename/pin-shape drift to README only."
  - finding_id: "gate:22e0817511c712a5:grok:grok-4.5#1"
    disposition: fixed
    evidence: "Every focused-test and authority reference now uses README.md, .github/actions/setup-wp/action.yml, .github/workflows/webpresso-freshness.yml, and the exact test paths consistently."
  - finding_id: "gate:22e0817511c712a5:grok:grok-4.5#2"
    disposition: fixed
    evidence: "Task 1.1 names test/helpers.ts and the exact existing symbols README_PATH, ACTION_SETUP_WP, WORKFLOW_WEBPRESSO_FRESHNESS, readRepoFile, loadYaml, asRecord, dig, and digString."
  - finding_id: "gate:22e0817511c712a5:grok:grok-4.5#3"
    disposition: fixed
    evidence: "Acceptance now requires a named task-start SHA scope/byte-boundary test, defines its allowlist and baseline comparisons, and requires separate canonical integration evidence."
  - finding_id: "gate:22e0817511c712a5:grok:grok-4.5#4"
    disposition: fixed
    evidence: "The sole Promotion Gate expected outcome is limited to GitHub Actions secret-reference policy; tokenless prose parity remains owned by M1 in the focused test."
  - finding_id: "gate:22e0817511c712a5:grok:grok-4.5#5"
    disposition: fixed
    evidence: "Acceptance defines six positive-and-negative contradiction classes M1-M6 covering source/token/version, assets, cache/integrity, exports/failure, version/self-update, and freshness semantics."
  - finding_id: "gate:97651a2fdc0c8fc1:grok:grok-4.5#1"
    disposition: fixed
    evidence: "The repository-wide task-start changed-path allowlist is now a one-time canonical integration check only. The permanent Bun test keeps M1-M6 plus action non-description and freshness byte contracts, and never inspects the repo-wide diff."
worktree_owner_id: owner-19be7eb9f9d6
worktree_owner_branch: bp/correct-setup-wp-current-information
completed_at: "2026-08-23"
---

# Correct setup-wp current information

## Product wedge anchor

- **Stage outcome:** Consumers can distinguish the setup action's current public download behavior from future qualification and updater work
- **Consuming surface:** README setup-wp/freshness guidance, setup-wp input descriptions, and focused source-parity tests
- **New user-visible capability:** Truthful source, assets, token, version, checksum, cache, package-root, export, and freshness semantics

## Summary

At task start, align the owner worktree with latest origin/main and treat `.github/actions/setup-wp/action.yml`, `.github/workflows/webpresso-freshness.yml`, `test/setup-wp.test.ts`, `test/freshness.test.ts`, and `test/workflow-shape.test.ts` in that aligned tree as the sole authority for current behavior. Commit 36b412a is historical evidence only, never authority after drift. Before writing the RED proof, re-read those exact paths and compare every embedded path, name, asset, input, export, cache, and download statement below; if any differs, stop and rewrite this typed blueprint to executable source, validate it, and obtain a fresh review. Source always wins over blueprint literals. At refinement time, source shows configurable public webpresso/app-releases, tokenless direct URLs, exact semver, four action-supported platform binaries, same-release wp-package-root.tgz without a source-archive fallback, optional checksum verification, versioned tool-cache hit/best-effort seed, current plus legacy package-root exports, no self-update, and a separate three-shape npm freshness scanner that excludes setup-wp. Correct prose and add a focused contract without changing behavior, identifiers, pins, or future qualification scope. Permanent tests protect durable behavior and prose parity; the task-start repository-wide changed-path allowlist is one-time canonical integration evidence only.

#### Task 1.1: Correct README and action metadata truth without behavior changes

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"agent":"codex-gpt-5","command":"wp exec bun test test/setup-wp-current-information.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-08-23T21:33:27.000Z"},{"agent":"codex-gpt-5","command":"wp exec bun test test/setup-wp.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-08-23T21:33:27.000Z"},{"agent":"codex-gpt-5","command":"wp exec bun test test/freshness.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-08-23T21:33:27.000Z"},{"agent":"codex-gpt-5","command":"wp exec bun test test/workflow-shape.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-08-23T21:33:27.000Z"},{"agent":"codex-gpt-5","command":"wp exec bun test test/setup-wp-current-information.test.ts","dispositioned_count":6,"expected_count":6,"kind":"enumeration","result":"pass","ts":"2026-08-23T21:33:27.000Z"},{"agent":"codex-gpt-5","command":"git diff --quiet 36b412a36849b33f5cdf6a4001c4b45e7a93ea14 -- . ':(exclude)README.md' ':(exclude).github/actions/setup-wp/action.yml' ':(exclude)test/setup-wp-current-information.test.ts' ':(exclude)blueprints/in-progress/correct-setup-wp-current-information/**'","entrypoint":"task-start SHA changed-path allowlist","exit_code":0,"kind":"integration","result":"pass","target_files":["README.md",".github/actions/setup-wp/action.yml",".github/workflows/webpresso-freshness.yml","test/setup-wp-current-information.test.ts"],"ts":"2026-08-23T21:33:27.000Z"},{"agent":"codex-gpt-5","audit_kind":"github-actions-secrets","command":"WP_MCP_UNAVAILABLE=1 wp audit github-actions-secrets","exit_code":0,"kind":"audit","passed":true,"result":"pass","ts":"2026-08-23T21:33:27.000Z"}]
```
**Wave:** 1
**Lane:** truth
**Depends:** None
**Produces:** actions-current-truth-merge-sha

Preflight latest main and apply the Summary/D1 authority rule before RED. Write `test/setup-wp-current-information.test.ts` first and observe failure on stale prose. Correct `README.md` setup-wp/freshness guidance and stale descriptive metadata fields in `.github/actions/setup-wp/action.yml`, including `inputs.package-root.description` where source parity requires it; `.github/workflows/webpresso-freshness.yml` remains byte-identical. Action input keys, defaults, and required flags plus action `runs.steps` remain unchanged; only action `description` fields may change. Reuse `README_PATH`, `ACTION_SETUP_WP`, `WORKFLOW_WEBPRESSO_FRESHNESS`, `readRepoFile`, `loadYaml`, `asRecord`, `dig`, and `digString` from `test/helpers.ts`; do not add a parser or abstraction. Compare prose with executable source; do not encode unsupported product inventory or future updater/qualification behavior. Keep repository-wide changed-path enforcement out of permanent tests and record it once as canonical integration evidence.

**Acceptance:**
- [x] Authority and baseline: before RED, record the aligned task-start main SHA and re-read `.github/actions/setup-wp/action.yml`, `.github/workflows/webpresso-freshness.yml`, `test/helpers.ts`, `test/setup-wp.test.ts`, `test/freshness.test.ts`, and `test/workflow-shape.test.ts`. If any embedded blueprint path, literal, helper, or behavior differs, stop: update this typed blueprint to source, validate, and re-review before implementation; executable source wins.
- [x] Focused RED and helper ownership: `test/setup-wp-current-information.test.ts` imports `README_PATH`, `ACTION_SETUP_WP`, `WORKFLOW_WEBPRESSO_FRESHNESS`, `readRepoFile`, `loadYaml`, `asRecord`, `dig`, and `digString` from `test/helpers.ts`; it reads `README.md`, `.github/actions/setup-wp/action.yml`, and `.github/workflows/webpresso-freshness.yml`. Before prose correction, it must fail on the known stale text with at least one failing assertion in every contradiction class M1-M6 below.
- [x] M1 source, token, and product-version truth: positive assertions derive and require configurable public `webpresso/app-releases`, tokenless direct release URLs, and exact product semver independent from the action SHA in `README.md` and `.github/actions/setup-wp/action.yml`; negative assertions reject private-source, GitHub API, `github-token`, `GITHUB_TOKEN`, or token-required install claims.
- [x] M2 asset and package-root truth: positive assertions derive the complete platform asset set from `.github/actions/setup-wp/action.yml` selection logic and require exact README parity—at refinement `wp-linux-x64`, `wp-linux-arm64`, `wp-darwin-x64`, and `wp-darwin-arm64`—plus same-release `wp-package-root.tgz` derived from `PACKAGE_ROOT_ASSET`; negative assertions reject extra invented assets, source/tag-archive fallback, a second repository/version, or token fallback. Task-start source wins.
- [x] M3 cache, download, and integrity truth: positive assertions derive the ordering in `.github/actions/setup-wp/action.yml` and require optional caller-supplied sha256 verification on downloads, version-directory tool-cache hits that skip download, direct download on misses, and best-effort seeding; negative assertions reject rehash/checksum on cache hit, mandatory or automatic provenance verification, downloads on every invocation, and cache store/restore claims. Task-start source wins.
- [x] M4 export and failure truth: positive assertions require `README.md` and `.github/actions/setup-wp/action.yml` `inputs.package-root.description` to match executable exports `WEBPRESSO_PACKAGE_ROOT`, legacy `WEBPRESSO_AGENT_KIT_ROOT`, and `NODE_PATH`, and require missing `catalog/` to fail closed; negative assertions reject removed `WP_AGENT_KIT_PACKAGE_ROOT`, warn-and-continue catalog behavior, or any other export/failure contract. Executable export and failure behavior remains unchanged.
- [x] M5 setup-wp selection and self-update truth: positive assertions require an exact caller-pinned semver and source-derived direct release selection; negative assertions reject setup-wp ranges, dist-tags, latest resolution, or self-update. These negatives are scoped to setup-wp version/source behavior and must not reject truthful npm latest-version wording in freshness guidance.
- [x] M6 freshness truth: positive assertions require `README.md` to name `.github/workflows/webpresso-freshness.yml`, workflow `Reusable webpresso freshness`, job `webpresso-freshness`, and exactly three npm pin shapes—environment assignment, shell default, and composite `agent-kit-version` default—while stating setup-wp's product-version input is excluded and the scanner is migration debt, not a wp installer/updater; negative assertions reject the retired freshness path/names, a fourth pin shape, setup-wp scanning, or installer/updater claims. `.github/workflows/webpresso-freshness.yml` itself remains byte-identical; source wins.
- [x] Permanent behavior-boundary regression: the focused file includes a test named `action and freshness behavior boundary`. It computes sha256 over the exact `.github/workflows/webpresso-freshness.yml` bytes and requires `bba32c456674db528686108c703432bd93eba20b5252b29c633e4269c6a784a6`. It also computes sha256 over the stable `JSON.stringify(withoutDescriptions(action))` projection and requires `04e8d5569bec90f93e58f041e7cb8d387c8888434ad50bfbd6a579e51b49bf57`, covering the action name, input keys/defaults/required flags, and all `runs.steps` while permitting descriptive metadata changes. This permanent test must not inspect repository history or enforce a repository-wide changed-path diff.
- [x] One-time scope evidence: after staging only task-owned new files, run one fail-closed changed-path allowlist check comparing the recorded task-start SHA with the final worktree/index. The only permitted paths are `README.md`, `.github/actions/setup-wp/action.yml`, `test/setup-wp-current-information.test.ts`, and files under `blueprints/in-progress/correct-setup-wp-current-information/`; `.github/workflows/webpresso-freshness.yml` is deliberately absent because it must remain unchanged. Preserve and exclude pre-existing unrelated untracked bootstrap/runtime files. Record this check once as canonical passing `kind: integration` task evidence with the exact resolved command, `exit_code: 0`, and target files `README.md`, `.github/actions/setup-wp/action.yml`, `.github/workflows/webpresso-freshness.yml`, and `test/setup-wp-current-information.test.ts`; do not encode the repository-wide allowlist in a permanent test.
- [x] Run exactly `wp exec bun test test/setup-wp-current-information.test.ts`, `wp exec bun test test/setup-wp.test.ts`, `wp exec bun test test/freshness.test.ts`, and `wp exec bun test test/workflow-shape.test.ts`. Each command must exit 0 and be recorded independently in Task 1.1 canonical `kind: test` verification evidence with its exact command, `result: pass`, and `exit_code: 0`; these four commands are task verification evidence, explicitly not Trust Dossier Promotion Gates.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-08-23T21:31:05.000Z
- trust-gate-version: v1

### Material Claims

| ID | Claim | Evidence |
| --- | --- | --- |
| C1 | At refinement, setup-wp uses configurable public webpresso/app-releases and tokenless direct release URLs; github-token is not an input. | repo:.github/actions/setup-wp/action.yml; repo:test/setup-wp.test.ts |
| C2 | At refinement, the action accepts exact semver only and selects four exact platform assets plus same-release wp-package-root.tgz with no source archive fallback. | repo:.github/actions/setup-wp/action.yml; repo:test/setup-wp.test.ts |
| C3 | At refinement, optional checksum verification and versioned tool-cache hit/best-effort seed are executable behavior; cache hits skip download and misses use direct release URLs. | repo:.github/actions/setup-wp/action.yml; repo:test/setup-wp.test.ts |
| C4 | At refinement, executable package-root exports are WEBPRESSO_PACKAGE_ROOT, legacy WEBPRESSO_AGENT_KIT_ROOT, and NODE_PATH; missing catalog fails closed. | repo:.github/actions/setup-wp/action.yml; repo:test/setup-wp.test.ts |
| C5 | At refinement, freshness is .github/workflows/webpresso-freshness.yml, named Reusable webpresso freshness with job webpresso-freshness, scans three npm pin shapes, and excludes setup-wp's product axis. | repo:.github/workflows/webpresso-freshness.yml; repo:test/freshness.test.ts |
| C6 | Existing Bun suites lock current setup-wp executable behavior and freshness scanning behavior. | repo:test/setup-wp.test.ts; repo:test/freshness.test.ts |
| C7 | The workflow-shape suite locks the freshness workflow path, callable triggers, and deliberate shared-toolchain exclusion. | repo:test/workflow-shape.test.ts |
| C8 | README and inputs.package-root.description contain stale token, package-root source, export, and failure prose that conflicts with executable source. | repo:README.md; repo:.github/actions/setup-wp/action.yml |
| C9 | README alone contains the stale freshness filename and four-pin-shape guidance; current workflow and tests establish the replacement truth in C5. | repo:README.md |
| C10 | The repository contract surface is Bun-native, and self-test uses default shallow actions/checkout; permanent regressions therefore cannot require a historical task-start Git object. | repo:README.md; repo:.github/workflows/self-test.yml; repo:test/setup-wp.test.ts; repo:test/freshness.test.ts; repo:test/workflow-shape.test.ts |
| C11 | test/helpers.ts already owns the authoritative repository paths and YAML access primitives needed by the focused parity test. | repo:test/helpers.ts; repo:test/setup-wp.test.ts; repo:test/freshness.test.ts; repo:test/workflow-shape.test.ts |

### Material Decisions

| ID | Decision | Chosen option | Rejected alternatives | Rationale |
| --- | --- | --- | --- | --- |
| D1 | Authority after source advance | Latest origin/main executable action, freshness workflow, and existing tests at task start are sole authority; any path/literal/behavior drift requires typed blueprint rewrite, validation, and re-review before implementation. | Treat 36b412a as permanent authority; preserve embedded names after drift; roll back behavior; blend future qualification claims. | 36b412a is historical evidence of plan staleness only. One task-start authority and fail-closed rewrite rule prevents another truth/source split. |
| D2 | Change scope | README, stale setup-wp descriptive metadata, one focused parity test, and blueprint/review evidence only. | Modify executable action/workflow; duplicate behavior tests; introduce a doc generator; implement updater or release qualification. | Contradictions are prose-level. Reusing README_PATH, ACTION_SETUP_WP, WORKFLOW_WEBPRESSO_FRESHNESS, readRepoFile, loadYaml, asRecord, dig, and digString from test/helpers.ts and preserving executable bytes is the smallest durable correction. |
| D3 | Regression style | Permanent semantic source-to-prose parity through M1-M6 plus sha256 locks for exact freshness bytes and the stable JSON.stringify action non-description projection; repository-wide changed-path scope is proven once as canonical integration evidence. | A permanent task-start repo diff or git-show baseline; snapshot whole prose files; presence-only substring checks; hand-maintained unsupported inventory; prose-only change without RED proof. | Durable product contracts belong in Bun tests and must work in default shallow CI checkouts. Content digests lock the intended action/workflow behavior without depending on historical Git objects; the task-scoped repo-wide allowlist remains one-time evidence. |
| D4 | Current truth versus future work | Describe current installer and deprecated npm freshness scanner only; keep qualification, provenance policy, and self-update behavior in separately sequenced blueprints. | Advertise planned support; alter install behavior in a truth PR; leave known current contradictions until future work. | Truth lands independently without pre-announcing or silently implementing future contracts. |
| D5 | Bun verification versus trust-executed gates | Run the four exact wp exec bun test file commands as Task 1.1 verification and record each independently as canonical passing test evidence; keep only wp audit github-actions-secrets in Promotion Gates, deferred so completion reruns it after implementation. | Route bun:test files through wp test and Vitest; admit the unsupported wp exec family into Promotion Gates; add a package script to a repository intentionally requiring none; retain the failing format or drifted sync gates. | This split preserves exact behavior coverage and durable evidence without claiming the current trust runner can execute a command family it rejects. The audit was observed passing on the aligned owner branch and directly covers GitHub Actions secret references relevant to the tokenless metadata contract. |
| D6 | No-behavior-change proof | Keep permanent sha256 regressions for the action's stable non-description JSON projection and the exact freshness workflow bytes, and run the task-start changed-path allowlist exactly once as canonical integration evidence before verification. | Embed a permanent repo-wide diff or git show against a frozen SHA; rely only on suite greens; manually eyeball the final diff; permit action name, inputs, runs.steps, or workflow drift. | The digest locks remain available in shallow and merge-ref CI checkouts, while the repository-wide path delta is delivery-specific. Separating them preserves durable behavior protection without requiring a historical task-start object. |

### Promotion Gates

| Gate | Command | Expected outcome | Last result | Defer |
| --- | --- | --- | --- | --- |
| GitHub Actions secret-reference audit | wp audit github-actions-secrets | GitHub Actions workflows and action metadata satisfy repository secret-reference policy. | pass at 2026-08-23T21:42:17.528Z | pre-implementation |

### Residual Unknowns

None.
