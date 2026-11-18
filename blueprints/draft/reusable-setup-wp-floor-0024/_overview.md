---
type: blueprint
title: "Reusable workflows pin setup-wp at the 0.0.24 sign-in floor"
status: draft
complexity: XS
owner: "webpresso/github-actions"
created: "2026-11-18"
last_updated: "2026-11-18"
tags:
  - "setup-wp"
  - "login-only"
  - "pin"
---

<!-- wp-blueprint-source-v1 {"blueprint_id":"c5d0c0ca-bbed-42d9-9162-d857180d4c96","head_id":"3ea66e44-7c12-4c9b-b0db-173ba5bdbfb8","content_version_id":"ff540d0b-3ae2-40c2-b854-322b4916404a","relationship_revision_id":"46675643-2fcb-4b00-bc30-377f8e655ad1"} -->

# Reusable workflows pin setup-wp at the 0.0.24 sign-in floor

## Product wedge anchor

- **Stage outcome:** A caller of the four reusable workflows that sets wp_version to 0.0.23 installs it signed out instead of failing the job, and 0.0.24 or later signs in
- **Consuming surface:** The wp_version input of changesets-release.yml, cloudflare-preview.yml, cloudflare-production.yml and webpresso-security.yml
- **New user-visible capability:** Callers of the reusable workflows can select any archive-publishing wp release, including 0.0.23, without a failing sign-in step

## Summary

PR #63 (merged 2dc7860d) pinned the four reusable workflows (changesets-release, cloudflare-preview, cloudflare-production, webpresso-security) to setup-wp at cd003ce04712ed5c7f24c3724969d81e35353d97, whose sign-in floor is 0.0.23. PR #64 (merged 56134240116afe7a3c6da92245de1adc04b08a64, blueprint setup-wp-auth-floor-0024) moved the floor to 0.0.24, the first login-only wp, because 0.0.23 shipped without the login-only gate and has no `wp auth ci`. At the old pin a caller that selects 0.0.23 runs `wp auth ci` and fails the job; #64 documented that caveat and named this repin as its follow-up (decision D2).

This change repins setup-wp in all four reusable workflows to 56134240116afe7a3c6da92245de1adc04b08a64, a commit on main and therefore reachable for remote `uses:` resolution. No other workflow in the repository references setup-wp remotely: self-test.yml uses the in-repo `./.github/actions/setup-wp`. The 0.0.23 caveat is removed from each wp_version description, the sign-in comments name 0.0.24 as the pinned floor, and the README replaces its caveat bullet with the new pin and floor. The wp_version default stays 0.0.21: 0.0.24 is not published yet, and a later change moves the default after release.

The contract suite needs no literal change: test/helpers.ts derives the setup-wp pin from the canonical workflow, and workflow-shape.test.ts asserts every setup-wp reference is the same full-SHA pin, so the repin is covered as long as all four sites move together. No test asserts the setup-wp SHA literally (require-checks-gating's reachability binding covers only wait-for-checks).

## Wave 1: 1

<!-- wp-blueprint-wave-v1 {"id":"c3b0404e-8801-4db5-89ac-3f5de1b5cd25","ref":"1","title":"1"} -->

#### Task 1.1: Repin setup-wp in the reusable workflows to the 0.0.24-floor commit and drop the 0.0.23 caveat
<!-- wp-blueprint-task-v1 {"id":"a99bcf2f-0d63-43f5-87ed-ac853abf59d8","ref":"1.1"} -->

**Status:** todo
**Wave:** 1
**Lane:** workflows
**Depends:** None

In changesets-release.yml, cloudflare-preview.yml, cloudflare-production.yml and webpresso-security.yml change the setup-wp `uses:` pin from cd003ce04712ed5c7f24c3724969d81e35353d97 to 56134240116afe7a3c6da92245de1adc04b08a64, remove the do-not-select-0.0.23 clause from the wp_version description, and change the sign-in comment to name 0.0.24 as the floor of the pinned setup-wp. In README.md replace the bullet that says the workflows still pin cd003ce0 with one naming the new pin 56134240 and its 0.0.24 floor (0.0.23 installs and stays signed out). Keep the wp_version default 0.0.21. Run bun test, the command the Self-test workflow runs, and wp format --check on every changed file.

**Acceptance:**
- [ ] Every setup-wp reference in the four reusable workflows is webpresso/github-actions/.github/actions/setup-wp@56134240116afe7a3c6da92245de1adc04b08a64, and no file outside blueprints/ and the dated research note names cd003ce0 as the current pin
- [ ] No wp_version description or README bullet tells callers to avoid 0.0.23, and the wp_version default is still 0.0.21
- [ ] bun test passes for the full contract suite
- [ ] wp format --check passes on every changed file

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-11-18T12:00:00.000Z
- trust-gate-version: v1

### Material Claims

| ID | Claim | Evidence |
| --- | --- | --- |
| C1 | The four reusable workflows pin setup-wp at cd003ce04712ed5c7f24c3724969d81e35353d97 and their wp_version descriptions warn against 0.0.23 because that pin's floor is 0.0.23. | repo:.github/workflows/changesets-release.yml |
| C2 | The setup-wp action on main (merged by #64 as 56134240116afe7a3c6da92245de1adc04b08a64) holds login_floor="0.0.24". | repo:.github/actions/setup-wp/action.yml |
| C3 | The contract suite derives the setup-wp pin from the canonical workflow and asserts every setup-wp reference is one full-SHA pin; it asserts no literal setup-wp SHA. | repo:test/workflow-shape.test.ts |
| C4 | self-test.yml exercises setup-wp only through the in-repo ./.github/actions/setup-wp path, not a remote pin. | repo:.github/workflows/self-test.yml |
| C5 | The README names cd003ce0 and the 0.0.23 caveat in the reusable-workflow section. | repo:README.md |

### Material Decisions

| ID | Decision | Chosen option | Rejected alternatives | Rationale |
| --- | --- | --- | --- | --- |
| D1 | Which commit the workflows pin | 56134240116afe7a3c6da92245de1adc04b08a64, the squash-merge commit of #64 on main | The #64 branch head, which the squash merge orphans and Actions cannot resolve; a later main commit, which would pull unrelated changes into the pin | The merged commit of the floor change is reachable from main and changes exactly the floor relative to cd003ce0's setup-wp |
| D2 | Whether to move the wp_version default now | Keep 0.0.21 | Move the default to 0.0.24, which is not published yet, so every caller relying on the default would fail with exit 6 | A later change moves the default once 0.0.24 is released; the self-test live job installs the default and would fail too |
| D3 | Whether to add a test for the pinned commit's floor | No new test; rely on the existing single-pin assertion | A test reading the pinned commit's action.yml through git, which fails in the shallow Self-test checkout | The floor of a remote pin is a property of another commit; the existing suite already forces all four sites to move together |

### Promotion Gates

| Gate | Command | Expected outcome | Last result |
| --- | --- | --- | --- |
| format | wp format --check --files .github/workflows/changesets-release.yml | No format issues | not run |

### Residual Unknowns

None.
