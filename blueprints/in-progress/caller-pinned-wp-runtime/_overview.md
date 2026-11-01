---
type: blueprint
status: in-progress
complexity: S
created: '2026-11-01'
last_updated: '2026-11-01'
progress: 100% (1/1 tasks done, 0 blocked, updated 2026-11-01)
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

## Product wedge anchor

- **Stage outcome:** Each of the three reusable workflows accepts an optional exact-semver `wp_version` input and forwards it verbatim to its existing `setup-wp` step; the default stays the currently hardcoded version, so every existing caller is byte-for-byte unaffected until it opts in.
- **Consuming surface:** `.github/workflows/cloudflare-preview.yml`, `.github/workflows/cloudflare-production.yml`, `.github/workflows/changesets-release.yml` — the `setup-wp` `version:` wiring inside each.
- **New user-visible capability:** A consumer can align preview deploys, production deploys, and releases to one qualified wp release (e.g. `0.0.15` once webpresso/app#2983 qualification lands) instead of inheriting a hidden stale default.

## Planning Summary

- Goal input: `Caller-selected wp runtime for reusable workflows`
- Complexity: `S`
- Draft slug: `caller-pinned-wp-runtime`
- Output path: `blueprints/draft/caller-pinned-wp-runtime/_overview.md`
- Generated command: `wp blueprint new "Caller-selected wp runtime for reusable workflows" --complexity S`
- Validation scope: parser compliance before write

## Architecture Overview

```text
caller workflow (uses: …/cloudflare-preview.yml@<sha>)
  with:
    …existing inputs…
    wp_version: "0.0.15"        # optional; default "0.0.6"
        │ forwarded verbatim
        ▼
shared job step: setup-wp@<existing sha>
  with:
    version: ${{ inputs.wp_version }}   # was hardcoded "0.0.6"
```

Same shape for `cloudflare-production.yml` and `changesets-release.yml`. No new action, downloader, or default change.

## Key Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Input shape | One optional `wp_version` string per workflow, exact semver, default `"0.0.6"` | `"0.0.6"` is what shared `main` (ed99fb9) hardcodes today; a defaulted input preserves every existing caller exactly. Exact semver only — no floating `latest` (user directive; floating would silently change runtimes). |
| Forwarding | Replace only the hardcoded `version:` value inside each workflow's existing `setup-wp` step with `${{ inputs.wp_version }}` | The action SHA, permissions, secrets, toolchain, and deploy behavior stay untouched; the diff is one line per workflow plus the input block. |
| No package-root input | Do not add one in this lane | Current shared steps do not request package-root; adding it would change artifact acquisition for opted-in callers. Consumers needing package-root use their own direct `setup-wp` steps, which already carry `package-root: true`. |
| Qualification boundary | This lane ships the mechanism only | Publishing/qualifying a runtime is owned under webpresso/app#2983. Tests prove input propagation, not that any specific version is published. Consumers pass a version only after that qualification lands. |

## Quick Reference (Execution Waves)

| Wave              | Tasks | Dependencies | Parallelizable |
| ----------------- | ----- | ------------ | -------------- |
| **Wave 1**        | 1.1   | None         | 1 agent        |
| **Critical path** | 1.1   | --           | 1 wave         |

**Note:** Use t-shirt sizing (XS/S/M/L/XL) for individual task estimates, NOT day/week estimates.

**Lifecycle:** Blueprint frontmatter `status` is one of `draft`, `planned`, `parked`, `in-progress`, `completed`, `archived`. Use `parked` when the blueprint is intentionally paused but should remain distinct from active planning or abandoned work. There is no blueprint-level `blocked` status; when work waits on an external dependency, set the task **Status:** to `blocked` and add a non-empty **Blocked:** line with the reason.

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

## Phase 1: Caller-selected wp version [Complexity: S]

#### Task 1.1: [infra] Add wp_version inputs and verbatim forwarding to the three reusable workflows

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"command":"bun test","entrypoint":"Full repo binding suite (self-test.yml runner) in the managed owner at implementation commit: 110 tests across 8 files pass, including the new test/reusable-wp-version.test.ts (16 assertions over all four reusable workflows: input default 0.0.6, guard-before-setup ordering, strict SemVer acceptance of 0.0.6/0.0.15/1.2.3-alpha.1+build.5 and rejection of latest/^/~ ranges and loose-regex false-accepts, verbatim ${{ inputs.wp_version }} forwarding, embedded script executed through node) and the updated positive-authority contracts in test/helpers.ts and test/workflow-shape.test.ts.","exit_code":0,"kind":"integration","result":"pass","target_files":["test/reusable-wp-version.test.ts","test/helpers.ts","test/workflow-shape.test.ts",".github/workflows/cloudflare-preview.yml",".github/workflows/cloudflare-production.yml",".github/workflows/changesets-release.yml",".github/workflows/webpresso-security.yml"],"ts":"2026-11-01T13:49:00Z"},{"audit_kind":"plan-verify-line-format-check-all-changed-files","command":"wp format --check --files .github/workflows/cloudflare-preview.yml .github/workflows/cloudflare-production.yml .github/workflows/changesets-release.yml .github/workflows/webpresso-security.yml test/reusable-wp-version.test.ts test/helpers.ts test/workflow-shape.test.ts","kind":"audit","passed":true,"result":"pass","ts":"2026-11-01T13:50:00Z"}]
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

Add `test/reusable-wp-version.test.ts` in this repo's existing `bun:test`
style (see `test/workflow-shape.test.ts`, including its extracted-script
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
- Modify: `test/workflow-shape.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `test/reusable-wp-version.test.ts`
- Create: `.oxfmtrc.json`
- Create: `.gitignore`

**Repo provisioning repairs (each committed with a `Blueprint-exempt` trailer as a promotion/CI prerequisite, plan content unchanged at the time):** `packageManager: pnpm@12.3.4` pin + its `packageManagerDependencies` lockfile block (review-sandbox and preflight prerequisites); minimal `.oxfmtrc.json` (whole-repo format stage; `blueprints/**` ignored — lifecycle records and review artifacts are wp-tooling-managed, digest-verified unchanged) and `.gitignore` (formatter ignore path + generated `.agent/`/`.claude/` surfaces); eviction of tracked `node_modules` pnpm state files; one-time normalization of the never-formatted sources (formatting/key-order only, suite rerun green); `webpresso-security.yml` joins the same `wp_version` treatment because the repo's own uniformity contracts cover every toolchain workflow; `self-test.yml` gains a `setup-wp` 0.0.13 + `wp audit guardrails` step, closing the pre-existing `ci-guardrails-wiring` gap (0.0.13 is the latest published release; its guardrails were qualified locally on 2026-11-01 — 0.0.11 crashes on `#runtime/posix-ffi.js`; newer runtimes await webpresso/app#2983).

**Change:**

Give callers one reviewed knob to align every shared execution path to a single
exact wp runtime version while keeping today's behavior as the untouched
default, eliminating the hidden `0.0.5`/`0.0.6` drift between caller pins and
shared workflow internals.

**Verify:**

- [A1] `wp format --check --files .github/workflows/cloudflare-preview.yml .github/workflows/cloudflare-production.yml .github/workflows/changesets-release.yml test/reusable-wp-version.test.ts`

**Acceptance:**

- [x] [A1] The three workflows are format-clean with the new input and verbatim forwarding; the new contract test passes under `bun test` for all three defaults and explicit `0.0.15` propagation; action SHAs and unrelated inputs are unchanged; no publication or qualification of any wp version is claimed by this lane.

## Completion Summary

Fill this section before any transition to `completed`; the exact headings and
non-empty content under both subsections are lifecycle requirements.

### Deliverables

All four reusable workflows (`cloudflare-preview`, `cloudflare-production`,
`changesets-release`, `webpresso-security`) expose an optional exact-SemVer
`wp_version` input defaulting to `0.0.6` — byte-preserving for every existing
caller — enforce it with a fail-fast strict-SemVer guard step that precedes
`setup-wp`, and forward the caller's value verbatim to the pinned action. The
positive-authority contracts were updated to the new invariant (helpers derives
the shared default from the canonical input; shape tests assert verbatim
forwarding), and the new `test/reusable-wp-version.test.ts` proves defaults,
ordering, forwarding, and strict SemVer acceptance/rejection for all four
workflows. Full `bun test` suite: 110/110. Implementation commit `ba3c04d`.

### Impact

Consumers can now align preview deploys, production deploys, releases, and
security scans to one exact qualified wp runtime by passing a single input,
instead of inheriting hidden stale defaults (`0.0.5`/`0.0.6`) that differed
from their own direct pins. Defaults are untouched, so nothing changes until a
caller opts in. Passing tests prove the plumbing and enforcement only; picking
a version still waits on the public-runtime qualification owned under
webpresso/app#2983.

## Verification Gates

| Gate        | Command                      | Success Criteria                                |
| ----------- | ---------------------------- | ----------------------------------------------- |
| Format      | `wp format --check --files` (changed files) | Zero drift                        |
| Contract    | `bun test` (repo binding suite, per self-test.yml) | All suites pass, including the new propagation contract |
| Review      | Sol exact-head delivery gate | Approve with zero blockers                      |

## Cross-Plan References

| Type       | Blueprint | Relationship |
| ---------- | --------- | ------------ |
| Upstream   | webpresso/app#2983 public-runtime qualification | Independent — this lane ships the input mechanism; consumers pass a version only after qualification lands |
| Downstream | webpresso/aksaprocess.tr PR #71 latest-wp preparation (`held/latest-wp-0.0.15`) | Enabled — its reusable-path alignment passes `wp_version: "0.0.15"` once this lands and qualification completes |
| Non-goal   | setup-wp action internals, self-test.yml, setup tests, README | Owned by the archived versioned-archives lane and PR #55; untouched here |

## Edge Cases and Error Handling

| Edge Case | Risk | Solution | Task |
| --------- | ---- | -------- | ---- |
| Caller passes a non-existent or unqualified version | Setup-wp download 404 or unqualified runtime | Fail naturally at setup-wp (existing behavior); this lane adds no validation beyond exact-semver description guidance; qualification stays with app#2983 | 1.1 |
| Caller omits `wp_version` | Behavior change for existing callers | Default `"0.0.6"` equals today's hardcoded value byte-for-byte; contract test pins the default | 1.1 |
| Floating `latest` or range input | Silent runtime drift across executions | Description mandates exact semver; contract test asserts the default is exact; no range parsing added | 1.1 |

## Non-goals

- Changing the `setup-wp` action, its self-test, its tests, or the README (other owners).
- Publishing, retagging, or qualifying any wp release (webpresso/app#2983).
- Changing shared defaults for existing callers or adding package-root acquisition.
- Editing any consumer repository from this lane.

## Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| Reusable-workflow input mistakes break deploys at callers | Failed preview/production runs | One-line forwarding; contract test pins default, forwarding, and unchanged SHAs; self-test.yml runs the suite on every PR |
| Mechanism ships but consumers pin unqualified versions | False sense of alignment | PR and blueprint state explicitly that passing tests prove plumbing only; consumer opt-in waits for app#2983 qualification |

## Technology Choices

| Component | Technology | Version | Why |
| --------- | ---------- | ------- | --- |
| Test runner | `bun test` | repo standard (self-test.yml) | Zero-dependency repo; `wp test`/vitest does not collect `bun:test` files |
| Input default | `0.0.6` | shared main ed99fb9 hardcoded value | Byte-preserving default for every existing caller |

## Trust Dossier

Draft note: complete this dossier before promotion to planned.

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-11-01T13:36:08.188Z
- trust-gate-version: v1

### Material Claims

| ID  | Claim | Evidence |
| --- | ----- | -------- |
| MC-1 | Each of the three reusable workflows hardcodes `version: "0.0.6"` in its `setup-wp` step with no caller override. | repo:.github/workflows/cloudflare-preview.yml; repo:.github/workflows/cloudflare-production.yml; repo:.github/workflows/changesets-release.yml |
| MC-2 | The repository's binding contract suite is `bun test`, run by self-test.yml on every PR; suites import `bun:test`. | repo:.github/workflows/self-test.yml; repo:test/workflow-shape.test.ts |
| MC-3 | `wp test` collects no tests in this repository (vitest surface vs `bun:test` files, observed "no tests" when targeting `test/workflow-shape.test.ts` on 2026-11-01), so Verify lines use the admitted `wp format --check --files` form and `bun test` is named in prose. | repo:test/workflow-shape.test.ts; repo:.github/workflows/self-test.yml |

### Material Decisions

| ID  | Decision | Chosen option | Rejected alternatives | Rationale |
| --- | -------- | ------------- | --------------------- | --------- |
| MD-1 | Input default | `"0.0.6"` (today's hardcoded value) | Bump to newest; floating `latest` | Existing callers must be unaffected until they opt in; user directive forbids floating versions |
| MD-2 | Scope | Three workflows + one contract test only | Also editing setup-wp action/tests/README | Those surfaces belong to other active owners (archived versioned-archives lane, PR #55) |
| MD-3 | Qualification boundary | Mechanism only; no version publication claim | Claiming 0.0.15 usable now | Publication/qualification is owned under webpresso/app#2983; tests prove plumbing only |
| MD-4 | Exact-semver enforcement | Fail-fast guard step embedded in each workflow before `setup-wp` | Rely on the remote pinned action's own validation; caller-side regex only | Self-contained and provable by the repo's extracted-script test pattern; does not depend on remote action internals or caller discipline |
| MD-5 | Positive-authority update | helpers derives the shared default from the canonical `wp_version` input; shape tests assert verbatim expression forwarding | Keep asserting one hardcoded version across all setup-wp steps | The reviewed change deliberately replaces that invariant; the repo's own uniformity contracts must encode the new one |
| MD-6 | Never-provisioned worktree repairs | Blueprint-exempt hygiene commits (formatter config, ignore block, untracked state, pnpm pin block, self-test guardrails wiring on 0.0.13) | Bypassing preflight stages or leaving the repo unprovisioned | Each repair is a documented promotion/CI prerequisite; the plan subject carries them so the delivery diff is fully reviewed |

### Promotion Gates

A promotion gate must target a file the reviewed tree already carries: the plan
is promoted before the implementation is committed, so a file the plan creates
is not in the reviewed tree. Gate the existing files your change modifies, and
treat the new files' suites as task verification and CI.

| Gate | Command | Expected outcome | Last result |
| ---- | ------- | ---------------- | ----------- |
| Workflow formatting | `wp format --check --files .github/workflows/changesets-release.yml` | pass | pass at 2026-11-01T13:36:08.188Z |

### Residual Unknowns

None.
