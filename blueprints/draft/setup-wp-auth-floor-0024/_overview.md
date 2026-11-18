---
type: blueprint
title: "setup-wp sign-in floor moves to wp 0.0.24"
status: draft
complexity: XS
owner: "webpresso/github-actions"
created: "2026-11-18"
last_updated: "2026-11-18"
tags:
  - "setup-wp"
  - "login-only"
  - "correction"
review_dispositions:
  - finding_id: "gate:0472ed708200d4f8:codex:gpt-6-luna#1"
    disposition: not-a-blocker
    evidence: "D3 now records the prerelease rule. It is the parent plan's approved rule (setup-wp-account-auth: a prerelease of the floor counts as login-only), kept unchanged on purpose: a prerelease of the login-only release is cut from the gated line, and excluding prereleases would leave a gated 0.0.24 prerelease signed out, so every non-exempt command exits 77. A caller that tests a prerelease lacking the gate has the existing exit: auth none never invokes wp, only warns, and exits 0 (contract case (e)). Changing the comparison is outside this one-constant correction."
---

<!-- wp-blueprint-source-v1 {"blueprint_id":"c646af53-84c1-4f3b-93da-448c79fb0f86","head_id":"b7046d59-dbc5-4c87-b0ed-6fbb70b396ae","content_version_id":"a525c225-04e2-4772-9223-20e21dba0a27","relationship_revision_id":"6b5b38be-c9f7-4ad1-84aa-54746db081fc"} -->

# setup-wp sign-in floor moves to wp 0.0.24

## Product wedge anchor

- **Stage outcome:** A caller that installs wp 0.0.23 through setup-wp is not signed in, because 0.0.23 ships without the login-only gate; sign-in starts at 0.0.24
- **Consuming surface:** setup-wp input auth (default auto) and the wp_version input of the four reusable workflows
- **New user-visible capability:** Callers can install the ungated wp 0.0.23 through setup-wp with auth auto without a failing sign-in step

## Summary

PR #62 (merged cd003ce0) gave setup-wp a sign-in step whose single floor constant, login_floor in the second composite step of .github/actions/setup-wp/action.yml, is 0.0.23: with auth auto, setup-wp runs `wp auth ci` for every version at or above it. On 2026-11-18 the wp release lane cut 0.0.23 without the login-only gate, so 0.0.23 has no `wp auth ci` and the login-only release becomes 0.0.24. A caller of setup-wp at cd003ce0 that selects 0.0.23 would run a command wp does not have and fail the job.

This correction moves the floor constant to 0.0.24 and keeps everything else unchanged: the comparison on the numeric major.minor.patch core, the exit codes, the install boundary 0.0.16 (the first release with install archives), and the reusable workflows' default wp_version 0.0.21. The README setup-wp section, the auth input description, the contract tests and the dated research note follow the constant. The contract suite gains 0.0.23, a 0.0.23 prerelease and a 0.0.23 build to its below-floor set, so the ungated release is proven to stay on the no-op path, and the setup-wp behaviour-boundary digest is re-pinned for the one changed constant.

Prereleases keep the parent plan's rule (decision D3): a 0.0.24 prerelease counts as login-only, because it is cut from the gated line and would otherwise run signed out with every non-exempt command exiting 77. A caller testing a prerelease that lacks the gate sets auth none, which never invokes wp and only warns.

The reusable workflows pin setup-wp at cd003ce0, whose floor is still 0.0.23. A pin must name a merged commit, so they cannot move to this change in the same PR. This PR corrects their wp_version descriptions and comments to 0.0.24 and states, in each wp_version description and in the README, that a caller must not select 0.0.23 at that pin. A follow-up commit repins them once this change is merged.

The parent blueprint setup-wp-account-auth is still planned (task 2.1 open in its own owner worktree), so the errata path, which accepts only terminal blueprints, is not available, and editing its approved plan from this lane would discard that plan's approval. This XS blueprint owns the correction instead.

## Wave 1: 1

<!-- wp-blueprint-wave-v1 {"id":"2caef3a0-4e8e-4e7e-985f-540ffa4c9dce","ref":"1","title":"1"} -->

#### Task 1.1: Move the setup-wp sign-in floor to 0.0.24 and correct its documentation
<!-- wp-blueprint-task-v1 {"id":"8a77424e-65ae-48ef-95d5-f6dc4994dca7","ref":"1.1"} -->

**Status:** todo
**Wave:** 1
**Lane:** setup-wp
**Depends:** None

Change login_floor in the sign-in step of .github/actions/setup-wp/action.yml from 0.0.23 to 0.0.24 and the auth input description with it. In test/setup-wp-auth.test.ts change every at-floor fixture version and the one-constant assertion to 0.0.24, and add 0.0.23, 0.0.23-rc.1 and 0.0.23+build.5 to the below-floor list of case (l). In test/setup-wp-current-information.test.ts change the expected floor to 0.0.24 and re-pin SETUP_WP_ACTION_BEHAVIOR_SHA256 to the digest of the changed action. Update README.md (setup-wp sign-in section, the temporary-default note, the consumer order, and a note that the reusable workflows' pinned setup-wp still has floor 0.0.23 so 0.0.23 must not be selected there), the wp_version descriptions and sign-in comments of changesets-release.yml, cloudflare-preview.yml, cloudflare-production.yml and webpresso-security.yml, and append a dated correction to docs/research/2026-11-17-setup-wp-login-only.md. Run the changed suites first against the unchanged action to see them fail (RED), then with the change (GREEN), then the full contract suite.

**Acceptance:**
- [ ] The sign-in step holds the floor in exactly one constant, login_floor="0.0.24", and with auth auto never invokes wp for 0.0.23, a 0.0.23 prerelease or a 0.0.23 build
- [ ] Run against the unchanged action, the changed suites fail on the floor constant, on case (l) for 0.0.23 and on the README floor parity
- [ ] bun test passes for the full contract suite, which is the command the Self-test workflow runs
- [ ] README, the auth input description and the four reusable workflows name 0.0.24 as the first login-only release and keep 0.0.16 as the install boundary

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-11-18T12:30:00.000Z
- trust-gate-version: v1

### Material Claims

| ID | Claim | Evidence |
| --- | --- | --- |
| C1 | The sign-in step of setup-wp holds the login-only floor in one constant, login_floor, and compares versions on the numeric major.minor.patch core (at_or_above_floor in runs.steps[1].run). | repo:.github/actions/setup-wp/action.yml |
| C2 | The contract suite asserts the floor constant, executes the sign-in step for versions below and at the floor (case (l)), proves auth none never invokes wp and only warns (case (e)), and pins a digest of the action's behaviour. | repo:test/setup-wp-auth.test.ts;repo:test/setup-wp-current-information.test.ts |
| C3 | The four reusable workflows pin setup-wp at cd003ce04712ed5c7f24c3724969d81e35353d97 and default wp_version to 0.0.21. | repo:.github/workflows/changesets-release.yml;repo:.github/workflows/cloudflare-preview.yml;repo:.github/workflows/cloudflare-production.yml;repo:.github/workflows/webpresso-security.yml |
| C4 | wp 0.0.23 ships without the login-only gate and the login-only release is 0.0.24 (recorded as a dated correction in the research note). | repo:docs/research/2026-11-17-setup-wp-login-only.md |
| C5 | The parent plan setup-wp-account-auth decided that a prerelease of the floor release counts as login-only. | repo:blueprints/planned/setup-wp-account-auth/_overview.md |

### Material Decisions

| ID | Decision | Chosen option | Rejected alternatives | Rationale |
| --- | --- | --- | --- | --- |
| D1 | Where the correction is owned | A new XS blueprint | An errata entry on setup-wp-account-auth, which the errata tool refuses because that blueprint is still planned; an edit of its approved plan, which would discard its plan approval and collide with its open owner worktree | The parent lane stays untouched and this change still has an owning plan |
| D2 | How the reusable workflows follow the new floor | Correct their documentation now and repin setup-wp in a follow-up commit after this change merges | Repinning in this PR, which is impossible because a pin must name a merged commit; pinning to the unmerged branch head, which a squash merge orphans | Same two-wave order as PR #62 and PR #63; the default wp_version 0.0.21 is unaffected meanwhile |
| D3 | Whether 0.0.24 prereleases count as login-only | Keep the parent plan's numeric-core rule: a 0.0.24 prerelease signs in under auth auto | Excluding prereleases from the floor, which would leave a gated prerelease signed out so every non-exempt command exits 77, and would change the approved comparison beyond a one-constant correction | Prereleases of the login-only release are cut from the gated line; a caller testing one that lacks the gate sets auth none, which never invokes wp and only warns |

### Promotion Gates

| Gate | Command | Expected outcome | Last result |
| --- | --- | --- | --- |
| format | wp format --check --files .github/actions/setup-wp/action.yml | No format issues | pass |

### Residual Unknowns

None.
