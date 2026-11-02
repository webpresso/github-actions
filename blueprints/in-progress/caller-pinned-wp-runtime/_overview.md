---
type: blueprint
status: in-progress
complexity: S
created: '2026-11-01'
last_updated: '2026-11-02'
progress: 2/4 tasks done, 1 blocked (updated 2026-11-02)
depends_on: []
cross_repo_depends_on: []
tags: []
approvals: []
review_dispositions:
  - finding_id: "gate:83610e96da08beb6:codex:gpt-6.1-sol#1"
    disposition: fixed
    evidence: "Task 1.1 and MD-4 now embed a fail-fast exact-semver guard step before setup-wp in all three workflows, and the contract test asserts rejection of latest/^/~ ranges via the repo's extracted-script pattern; the round-1 nit is likewise addressed by embedding baseline literals (SHA 2003ca953f336efb779165f748e1ad8408565428, default 0.0.6) instead of reading local Git history."
  - finding_id: "gate:97d51d7e092bdeb0:codex:gpt-6.1-sol#1"
    disposition: fixed
    evidence: "The guard now uses the official strict SemVer pattern from semver.org (no leading zeros in numeric components or identifiers; prerelease and build metadata may appear together), and the contract test adds the demanded regression cases: rejects 01.2.3, 1.02.3, 1.2.3-01, 1.2.3++, 1.2.3- (loose-regex false-accepts); accepts 1.2.3-alpha.1+build.5 alongside 0.0.6 and 0.0.15."
title: Caller-selected wp runtime for reusable workflows
owner: Claude Code
worktree_owner_id: owner-273f97207038
worktree_owner_branch: bp/caller-pinned-wp-runtime
---

# Caller-selected wp runtime for reusable workflows

**Goal:** Let a caller pin one exact wp runtime version across the shared preview, production, and Changesets reusable workflows without changing today's defaults for existing callers.

## Current decision and authority

Task 1.1 and its original approval and dispositions are historical records, limited to their original reviewed subject and proof. Its three-workflow and full-SemVer contract, old scope claims and old acceptance are superseded for future work by Tasks 1.3 and 1.4 below. They do not approve this amendment. The implementation is unmerged and does not yet satisfy the new contract.

**Decision:** accept only exact stable `major.minor.patch` with no leading zeros. In a JavaScript regex literal the intended pattern is `/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/`; its backslashes escape literal dots in that context. Require a full-length match as well: JavaScript `$` can match before a final line terminator. Reject prerelease, build metadata, ranges, `latest`, whitespace including a trailing newline, and a `v` prefix. Default `0.0.6` and verbatim forwarding stay unchanged; never strip or normalize the input. All accepted values fit the pinned action guard. This is a new unmerged caller input, so narrowing it sacrifices no existing caller version contract. [SemVer 2.0.0](https://semver.org/spec/v2.0.0.html) defines stable versions and suffixes; this API intentionally supports only the stable subset.

**Principles:** preserve immutable historical evidence; fail closed at the wrapper; keep one runtime qualification owner. **Drivers:** compatibility with the immutable action, unchanged defaults for existing callers, and the smallest change for qualified stable releases.

| Option | Benefits | Costs and decision |
| --- | --- | --- |
| Stable-only wrapper (chosen) | Every accepted value fits the existing pinned guard; no action change | Suffixes rejected explicitly; sufficient for latest qualified stable wp. |
| Full SemVer plus action guard repair and new immutable pin | Supports prerelease plus build metadata | Requires coordination with the live action owner and a new pin; unnecessary for this requirement. Rejected. |

The remote `setup-wp@2003ca953f336efb779165f748e1ad8408565428` guard is `^[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z.-]+)?$`; it rejects `1.2.3-alpha.1+build.5` before download while the existing wrapper admits it. Do not change the action, downloader or SHA. The live action owner is `/Users/ozby-mac/repos/webpresso/_worktrees/github-actions-setup-wp-archives`, branch `feat/setup-wp-versioned-archives`, HEAD `3167474db93eabd2cd3964d5706b43d4884c54d4`, with an unpushed commit. This plan avoids that owner's files; no ownership handoff is assumed.

PR #55 was observed open at head `29a81bcd6ec45691f75d5e569a86c52052e9c399`; it changes `.github/workflows/self-test.yml`, `test/workflow-shape.test.ts` and a completed blueprint. It overlaps this branch's self-test and renamed shape suite. Integrate only after a verified merge or an explicit documented handoff, preserving all PR #55 changes. Do not edit its owner. This is an execution dependency, not a cleared overlap.

The actual `ed99fb9..69eff86` scope is: modified `.github/workflows/{changesets-release,cloudflare-preview,cloudflare-production,self-test,webpresso-security}.yml`, `README.md`, `package.json`, `pnpm-lock.yaml`, `test/{helpers,production-auth.test,production-outputs.test,require-checks-gating.test,setup-wp-current-information.test}.ts`; added `.gitignore`, `.oxfmtrc.json`, `test/reusable-wp-version.subprocess.test.ts`, `tsconfig.json`, `tsconfig.test.json`; deleted `node_modules/.modules.yaml` and `node_modules/.pnpm-workspace-state-v1.json`; renamed `test/setup-wp.test.ts` to `test/setup-wp.subprocess.test.ts`, `test/wait-for-checks.test.ts` to `test/wait-for-checks.subprocess.test.ts`, and `test/workflow-shape.test.ts` to `test/workflow-shape.subprocess.test.ts`. Documentation also adds the erratum, this overview, five review artifacts and the review ledger. These are actual existing changes, not a claim of approved ownership or provisioning exemption.

**Package root and qualification:** the wrappers do not request package-root. Version alignment alone does not qualify every consumer path. The runtime owner must qualify actual consumer commands without overrides under webpresso/app#2983. If reusable paths need package-root, make an explicit downstream amendment before implementing that behavior; direct steps are not proof. No runtime publishing, package-root acquisition change or duplicate runtime writer belongs here.

Installed preflight source `src/cli/commands/ci-preflight-snapshot.ts` at `1362ff` deletes `WEBPRESSO_WP_BIN` and drops the source selector for consumer snapshots; `resolveWpLauncher` prefers installed runtime context. Resolve that authority mismatch without retries, shims or gate bypass. Exact-head preflight, Sol delivery, current CI, lifecycle and landing remain outstanding.

**Affected engineering and DevEx checks:** the chosen guard preserves caller bytes, fails before download, and exercises the wrapper plus a pinned action compatibility oracle; actionable errors name the invalid value and exact stable format. Existing callers retain their default. Current execution is blocked until current-subject approval and the integration prerequisites below. This is infrastructure with no UI or product-strategy change, so UI and CEO review are not needed. No further research is needed for this choice. Historical reviews are not restarted.

## Dependency graph

Historical 1.1 and recovery 1.2 → current plan approval → stable contract fix 1.3 → integration 1.4. In parallel with plan approval, the independent PR #55 merge or documented handoff and app#2983 consumer-command qualification may progress under their owners. Neither qualifies delivery by itself.

## Approvals (required before promotion to `planned`)

Promotion `draft → planned` requires **either 1 provenance-backed Claude/Codex
approval or 1 provenance-backed OpenCode-Go model approval**. Authority may come
from a content-addressed v2 `review-events.jsonl` event or the legacy frontmatter
`approvals:` plus committed `reviews.md` structured record and tracked artifact.
This checklist is only a human-readable mirror. Enforced by `wp audit
blueprint-lifecycle` and the `wp blueprint promote` command. See the owning
repositories' pre-implementation rules.

- [x] Claude (`/claude`) or Codex (`/codex`) approval — Codex `gpt-6.1-sol`, gate `cc055a886d0c8d06` APPROVE (2026-11-01, round 3; rounds 1-2 REJECTs answered via review_dispositions)
- Alternative: OpenCode-Go model approval — `/deepseek` / `/glm` / `/hy3` / `/kimi` /
  `/mimo` / `/minimax` / `/qwen`

The approval above applies only to its original reviewed subject; it does not authorize the amended scope or resolve the hold.

## Phase 1: Caller-selected wp version [Complexity: S]

Task 1.1 below is preserved historical proof and its original contract is superseded by the current decision and Task 1.3.

#### Task 1.1: [infra] Add wp_version inputs and verbatim forwarding to the three reusable workflows

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"command":"bun test","entrypoint":"Full repo binding suite (self-test.yml runner) in the managed owner at implementation commit: 110 tests across 8 files pass, including the new test/reusable-wp-version.subprocess.test.ts (16 assertions over all four reusable workflows: input default 0.0.6, guard-before-setup ordering, strict SemVer acceptance of 0.0.6/0.0.15/1.2.3-alpha.1+build.5 and rejection of latest/^/~ ranges and loose-regex false-accepts, verbatim ${{ inputs.wp_version }} forwarding, embedded script executed through node) and the updated positive-authority contracts in test/helpers.ts and test/workflow-shape.subprocess.test.ts.","exit_code":0,"kind":"integration","result":"pass","target_files":["test/reusable-wp-version.subprocess.test.ts","test/helpers.ts","test/workflow-shape.subprocess.test.ts",".github/workflows/cloudflare-preview.yml",".github/workflows/cloudflare-production.yml",".github/workflows/changesets-release.yml",".github/workflows/webpresso-security.yml"],"ts":"2026-11-01T13:49:00Z"},{"audit_kind":"plan-verify-line-format-check-all-changed-files","command":"wp format --check --files .github/workflows/cloudflare-preview.yml .github/workflows/cloudflare-production.yml .github/workflows/changesets-release.yml .github/workflows/webpresso-security.yml test/reusable-wp-version.subprocess.test.ts test/helpers.ts test/workflow-shape.subprocess.test.ts","kind":"audit","passed":true,"result":"pass","ts":"2026-11-01T13:50:00Z"}]
```

**Depends:** None

Add an optional `wp_version` input (type `string`, required `false`, default
`"0.0.6"`, description naming exact-SemVer-only) to the `workflow_call` input
maps of `.github/workflows/cloudflare-preview.yml`,
`.github/workflows/cloudflare-production.yml`, and
`.github/workflows/changesets-release.yml`. In each workflow, ADD one small
fail-fast validation step BEFORE the existing `setup-wp` step — an embedded
`node -e` script (env-passed input, no shell interpolation) that exits
nonzero unless `inputs.wp_version` matches the official strict SemVer pattern
from semver.org (core `0|[1-9]\d*` components with no leading zeros; optional
prerelease of dot-separated identifiers where numeric identifiers have no
leading zeros; optional build metadata; prerelease and build metadata MAY
appear together), naming the offending value. Loose shapes such as
`01.2.3`, `1.02.3`, `1.2.3-01`, or `1.2.3++` MUST be rejected. The promised
exact-only contract is therefore enforced by these workflows themselves, not
delegated to remote action internals. Then, in each workflow's existing
`setup-wp` step, replace the hardcoded `version: "0.0.6"` with
`version: ${{ inputs.wp_version }}`. Change nothing else: action SHAs, job
permissions, secrets, toolchain steps, deploy commands, and every other input
keep their current bytes. Ownership note: the `setup-wp` action itself and its
tests belong to other lanes (the archived versioned-archives owner and PR #55);
this task edits only the three caller-facing reusable workflows and adds one
new focused contract test.

Add `test/reusable-wp-version.subprocess.test.ts` in this repo's existing `bun:test`
style (see `test/workflow-shape.subprocess.test.ts`, including its extracted-script
pattern for embedded `node` scripts): parse each of the three workflow YAML
files and assert (1) the `wp_version` input exists with default `"0.0.6"` and
required `false`; (2) a validation step precedes `setup-wp` and its embedded
script REJECTS `latest`, `^0.0.6`, `~0.0.6`, `0.0`, and the loose-regex
false-accepts `01.2.3`, `1.02.3`, `1.2.3-01`, `1.2.3++`, `1.2.3-` while
ACCEPTING `0.0.6`, `0.0.15`, and `1.2.3-alpha.1+build.5` (prerelease and build
metadata together); (3) the `setup-wp` step's `version:` equals
`${{ inputs.wp_version }}` verbatim; (4) the `setup-wp` `uses:` SHA equals
the literal `2003ca953f336efb779165f748e1ad8408565428` embedded in the test —
baseline expectations are embedded literals, never reads of local Git history,
so the suite is history-independent. The repo's binding suite is `bun test`
(run by `.github/workflows/self-test.yml`); `wp test` does not collect
`bun:test` files here, so it is not used as a Verify command. The
default, forwarding, and rejection tests prove input plumbing and enforcement
only — they are not evidence that any particular wp version is publicly
published or qualified (webpresso/app#2983 owns that).

**Files:**

- Modify: `.github/workflows/cloudflare-preview.yml`
- Modify: `.github/workflows/cloudflare-production.yml`
- Modify: `.github/workflows/changesets-release.yml`
- Modify: `.github/workflows/webpresso-security.yml`
- Modify: `.github/workflows/self-test.yml`
- Modify: `test/helpers.ts`
- Modify: `test/workflow-shape.subprocess.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `test/reusable-wp-version.subprocess.test.ts`
- Create: `.oxfmtrc.json`
- Create: `.gitignore`

**Repo provisioning repairs (each committed with a `Blueprint-exempt` trailer as a promotion/CI prerequisite, plan content unchanged at the time):** `packageManager: pnpm@12.3.4` pin + its `packageManagerDependencies` lockfile block (review-sandbox and preflight prerequisites); minimal `.oxfmtrc.json` (whole-repo format stage; `blueprints/**` ignored — lifecycle records and review artifacts are wp-tooling-managed, digest-verified unchanged) and `.gitignore` (formatter ignore path + generated `.agent/`/`.claude/` surfaces); eviction of tracked `node_modules` pnpm state files; one-time normalization of the never-formatted sources (formatting/key-order only, suite rerun green); `webpresso-security.yml` joins the same `wp_version` treatment because the repo's own uniformity contracts cover every toolchain workflow; `self-test.yml` gains a `setup-wp` 0.0.13 + `wp audit guardrails` step, closing the pre-existing `ci-guardrails-wiring` gap (0.0.13 is the latest published release; its guardrails were qualified locally on 2026-11-01 — 0.0.11 crashes on `#runtime/posix-ffi.js`; newer runtimes await webpresso/app#2983).

**Change:**

Give callers one reviewed knob to align every shared execution path to a single
exact wp runtime version while keeping today's behavior as the untouched
default, eliminating the hidden `0.0.5`/`0.0.6` drift between caller pins and
shared workflow internals.

**Verify:**

- [A1] `wp format --check --files .github/workflows/cloudflare-preview.yml .github/workflows/cloudflare-production.yml .github/workflows/changesets-release.yml test/reusable-wp-version.subprocess.test.ts`

**Acceptance:**

- [x] [A1] The three workflows are format-clean with the new input and verbatim forwarding; the new contract test passes under `bun test` for all three defaults and explicit `0.0.15` propagation; action SHAs and unrelated inputs are unchanged; no publication or qualification of any wp version is claimed by this lane.

#### Task 1.2: [docs] Recover historical evidence

**Status:** done

Restored the ten historical files to original base bytes and appended a controlling erratum. At 2026-11-02T05:47:37Z, exact byte comparisons against ed99fb922279138571781036ad323a98af5a4dde passed for all ten, and the changed-path whitelist contained exactly the twelve authorized Markdown paths. `git diff --check` passed. `wp audit blueprint-pr-coverage --base ed99fb922279138571781036ad323a98af5a4dde` failed: 22 implementation paths lack a valid completed owner. The initial unstaged `wp audit blueprint-lifecycle --affected` skipped because it scopes to staged files. At 2026-11-02T05:47:55Z, `wp audit blueprint-lifecycle --affected --branch` failed because the amended plan has no matching approval; `wp blueprint audit` failed with invalid type/status schema errors. Staging was denied by the filesystem at the linked Git index lock; no commit was made. The human subsequently committed this recovery with normal hooks as `69eff86bf6a0f99bbdef6a8c3d4d0e8dce327ca4`.

#### Task 1.3: [infra] Enforce the stable runtime contract

**Status:** todo
**Depends:** Current amended plan approval; Task 1.2.

After approval, update the `wp_version` description, actionable error and env-passed `node -e` guard in all four reusable workflows: `.github/workflows/cloudflare-preview.yml`, `.github/workflows/cloudflare-production.yml`, `.github/workflows/changesets-release.yml`, `.github/workflows/webpresso-security.yml`. Apply the stable-only literal in Current decision; retain default `0.0.6`, guard-before-setup ordering, action SHA and verbatim forwarding. Update relevant wrapper documentation to say exact stable, not generic SemVer. Preserve unrelated action behavior and inputs.

Update `test/reusable-wp-version.subprocess.test.ts`, reusing `guardRunScript`, `runGuardScript`, `JOB_FOR_WORKFLOW` and existing YAML helpers. Execute each extracted guard, and execute an embedded exact reviewed action guard as a compatibility oracle tied to the same literal SHA; never download or run action code. Assert all accepted stable cases (including `0.0.6`, `0.0.15`, `1.2.3`) pass both guards; verify grammar and no-leading-zero property, defaults, order, pin and verbatim forwarding. Assert wrapper rejection of `1.2.3-alpha.1+build.5`, standalone prerelease and build suffixes, leading-zero components, `latest`, ranges, whitespace including trailing newline, `v` prefix and incomplete versions. The oracle demonstrates that the combined suffix is rejected by the pinned action. The new test must first expose the current wrapper's suffix acceptance, then pass after the repair. No dependency is added.

**Verify:** Run focused `bun test test/reusable-wp-version.subprocess.test.ts`, the binding `bun test` suite, and applicable changed-file `wp format --check --files ...` after implementation. Capture actual results at execution; none is claimed here.

#### Task 1.4: [infra] Integrate and qualify delivery

**Status:** blocked
**Blocked:** PR #55 verified merge or explicit documented handoff, app#2983 qualification of actual consumer commands without overrides, current amended plan approval, and Task 1.3 are prerequisites. Exact-head preflight, Sol delivery review, current CI and lifecycle are outstanding.
**Depends:** Task 1.3 and the independent prerequisites above.

After verifying PR #55's merge or documenting an explicit handoff, integrate preserving all its changes and re-evaluate the changed-file scope. Confirm runtime-owner qualification of the actual consumer commands. If package-root is necessary in reusable paths, stop and make an explicit downstream amendment before implementing it. Resolve preflight runtime authority as described above, then run exact-head preflight, Sol delivery review, current CI and lifecycle/coverage checks. Do not bypass gates or claim landing until their actual results support it.

## Completion Summary

### Deliverables

Historical Task 1.1 implementation and Task 1.2 evidence recovery exist. The stable-only wrapper guard, compatibility tests and current descriptions remain to be implemented after current plan approval. Integration and delivery checks remain blocked as stated in Task 1.4.

### Impact

The intended consumer can select a qualified stable runtime while existing callers retain `0.0.6`; the current unmerged implementation has a suffix compatibility defect and must not be presented as delivery-ready. Qualification of actual consumer commands belongs to app#2983.

## Verification Gates

| Gate | Required evidence |
| --- | --- |
| Contract | Task 1.3 focused and full binding suite, including extracted wrapper and pinned-action oracle cases. |
| Format | Changed-file `wp format --check --files` after implementation. |
| Delivery | Exact-head preflight, Sol delivery, current CI and lifecycle/coverage after integration prerequisites. |

## Cross-Plan References and Non-goals

- PR #55 owns overlapping self-test and workflow-shape changes; integration is conditional on verified merge or documented handoff, preserving all its changes.
- The setup-wp archives owner retains the action and downloader. This lane does not alter its files or pin.
- app#2983 exclusively owns runtime publishing and qualification. Consumer changes, package-root acquisition and release publication are outside this lane.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-11-02T06:31:25Z
- trust-gate-version: v1

The amended design choices and references have been checked for plan review; current-subject approval is still outstanding. This readiness flag does not assert delivery or integration readiness. `unresolved-count` refers to architectural choices, not the explicit execution prerequisites or unrun delivery gates.

### Material Claims

| ID | Claim | Evidence |
| --- | --- | --- |
| MC-1 | Four existing wrapper guards accept combined suffixes while the pinned action guard rejects them. | repo:.github/workflows/cloudflare-preview.yml; repo:.github/workflows/cloudflare-production.yml; repo:.github/workflows/changesets-release.yml; repo:.github/workflows/webpresso-security.yml; repo:test/reusable-wp-version.subprocess.test.ts; web:https://github.com/webpresso/github-actions/blob/2003ca953f336efb779165f748e1ad8408565428/.github/actions/setup-wp/action.yml (2026-11-02) |
| MC-2 | The binding test is Bun and the current guard can be extracted and executed using its `guardRunScript` and `runGuardScript` helpers. | repo:test/reusable-wp-version.subprocess.test.ts; repo:.github/workflows/self-test.yml |
| MC-3 | Stable versions are a SemVer subset; suffixes are excluded by this contract. | web:https://semver.org/spec/v2.0.0.html (2026-11-02) |

### Material Decisions

| ID | Decision | Chosen option | Rejected alternatives | Rationale |
| --- | --- | --- | --- | --- |
| D1 | Runtime input | Exact stable, full-length match, unchanged default and verbatim forwarding | Full SemVer plus action repair and new pin | Fits the pinned guard and qualified stable requirement without touching the live action owner. |
| D2 | Integration | Verified PR #55 merge or documented handoff, then preserve its changes | Assume the overlapping work is cleared | Avoids overwriting another owner. |
| D3 | Qualification | Runtime owner qualifies actual consumer commands without overrides | Infer qualification from version alignment | Package-root needs and runtime behavior require explicit evidence. |

The three principles and drivers are recorded in Current decision. Integration and qualification remain execution dependencies.

### Promotion Gates

| Gate | Command | Expected outcome | Last result |
| --- | --- | --- | --- |
| Workflow formatting | `wp format --check --files .github/workflows/changesets-release.yml` | pass | deferred: amended subject; prior timestamp is historical and no format command was run in this planning pass. |

### Residual Unknowns

None.
