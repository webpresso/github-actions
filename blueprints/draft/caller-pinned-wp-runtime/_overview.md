---
type: blueprint
status: draft
complexity: S
created: '2026-11-01'
last_updated: '2026-11-01'
progress: 0% (drafted)
depends_on: []
cross_repo_depends_on: []
tags: []
approvals: []
title: Caller-selected wp runtime for reusable workflows
owner: Claude Code
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

- [ ] Claude (`/claude`) or Codex (`/codex`) approval (satisfies the gate alone)
- Alternative: OpenCode-Go model approval — `/deepseek` / `/glm` / `/hy3` / `/kimi` /
  `/mimo` / `/minimax` / `/qwen`

## Phase 1: Caller-selected wp version [Complexity: S]

#### Task 1.1: [infra] Add wp_version inputs and verbatim forwarding to the three reusable workflows

**Status:** todo

**Depends:** None

Add an optional `wp_version` input (type `string`, required `false`, default
`"0.0.6"`, description naming exact-semver-only) to the `workflow_call` input
maps of `.github/workflows/cloudflare-preview.yml`,
`.github/workflows/cloudflare-production.yml`, and
`.github/workflows/changesets-release.yml`. In each workflow's existing
`setup-wp` step, replace the hardcoded `version: "0.0.6"` with
`version: ${{ inputs.wp_version }}`. Change nothing else: action SHAs, job
permissions, secrets, toolchain steps, deploy commands, and every other input
keep their current bytes. Ownership note: the `setup-wp` action itself and its
tests belong to other lanes (the archived versioned-archives owner and PR #55);
this task edits only the three caller-facing reusable workflows and adds one
new focused contract test.

Add `test/reusable-wp-version.test.ts` in this repo's existing `bun:test`
style (see `test/workflow-shape.test.ts`): parse each of the three workflow
YAML files and assert (1) the `wp_version` input exists with default `"0.0.6"`
and required `false`; (2) the `setup-wp` step's `version:` equals
`${{ inputs.wp_version }}` verbatim; (3) the `setup-wp` `uses:` SHA is
unchanged from current `main`; (4) no other top-level workflow input or job
changed relative to the checked-out baseline (compare against `git show
ed99fb922279138571781036ad323a98af5a4dde:<path>` where practical). The repo's
binding suite is `bun test` (run by `.github/workflows/self-test.yml`);
`wp test` does not collect `bun:test` files here, so it is not used as a Verify
command. The default-and-forward tests prove input plumbing only — they are not
evidence that any particular wp version is publicly published or qualified
(webpresso/app#2983 owns that).

**Files:**

- Modify: `.github/workflows/cloudflare-preview.yml`
- Modify: `.github/workflows/cloudflare-production.yml`
- Modify: `.github/workflows/changesets-release.yml`
- Create: `test/reusable-wp-version.test.ts`

**Change:**

Give callers one reviewed knob to align every shared execution path to a single
exact wp runtime version while keeping today's behavior as the untouched
default, eliminating the hidden `0.0.5`/`0.0.6` drift between caller pins and
shared workflow internals.

**Verify:**

- [A1] `wp format --check --files .github/workflows/cloudflare-preview.yml .github/workflows/cloudflare-production.yml .github/workflows/changesets-release.yml test/reusable-wp-version.test.ts`

**Acceptance:**

- [ ] [A1] The three workflows are format-clean with the new input and verbatim forwarding; the new contract test passes under `bun test` for all three defaults and explicit `0.0.15` propagation; action SHAs and unrelated inputs are unchanged; no publication or qualification of any wp version is claimed by this lane.

## Completion Summary

Fill this section before any transition to `completed`; the exact headings and
non-empty content under both subsections are lifecycle requirements.

### Deliverables

<!-- Summarize the concrete artifacts and behavior delivered. -->

### Impact

<!-- Summarize the resulting user, operator, or system impact. -->

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

- promotion-ready: false
- unresolved-count: 0
- verified-at: not verified
- trust-gate-version: v1

### Material Claims

| ID  | Claim | Evidence |
| --- | ----- | -------- |
| MC-1 | Each of the three reusable workflows hardcodes `version: "0.0.6"` in its `setup-wp` step with no caller override. | repo:.github/workflows/cloudflare-preview.yml; repo:.github/workflows/cloudflare-production.yml; repo:.github/workflows/changesets-release.yml |
| MC-2 | The repository's binding contract suite is `bun test`, run by self-test.yml on every PR; suites import `bun:test`. | repo:.github/workflows/self-test.yml; repo:test/workflow-shape.test.ts |
| MC-3 | `wp test` collects no tests in this repository (vitest surface, `bun:test` files), so Verify lines use the admitted `wp format --check --files` form. | observed: `wp test --files test/workflow-shape.test.ts` reports "no tests" (2026-11-01) |

### Material Decisions

| ID  | Decision | Chosen option | Rejected alternatives | Rationale |
| --- | -------- | ------------- | --------------------- | --------- |
| MD-1 | Input default | `"0.0.6"` (today's hardcoded value) | Bump to newest; floating `latest` | Existing callers must be unaffected until they opt in; user directive forbids floating versions |
| MD-2 | Scope | Three workflows + one contract test only | Also editing setup-wp action/tests/README | Those surfaces belong to other active owners (archived versioned-archives lane, PR #55) |
| MD-3 | Qualification boundary | Mechanism only; no version publication claim | Claiming 0.0.15 usable now | Publication/qualification is owned under webpresso/app#2983; tests prove plumbing only |

### Promotion Gates

A promotion gate must target a file the reviewed tree already carries: the plan
is promoted before the implementation is committed, so a file the plan creates
is not in the reviewed tree. Gate the existing files your change modifies, and
treat the new files' suites as task verification and CI.

| Gate | Command | Expected outcome | Last result |
| ---- | ------- | ---------------- | ----------- |
| Workflow formatting | `wp format --check --files .github/workflows/changesets-release.yml` | pass | Not run |

### Residual Unknowns

None.
