---
type: blueprint
title: "Reusable workflows pin setup-wp at the 0.0.24 sign-in floor"
status: planned
complexity: XS
owner: "webpresso/github-actions"
created: "2026-11-18"
last_updated: "2026-11-18"
tags:
  - "setup-wp"
  - "login-only"
  - "pin"
review_dispositions:
  - finding_id: "gate:ded3abf05ea9cd74:codex:gpt-6-luna#1"
    disposition: fixed
    evidence: "Task 1.1 now adds a self-test job, setup-wp-remote-pin, that resolves the exact remote setup-wp pin on every pull request (the same pattern wait-for-checks-remote-pin uses), plus a contract test binding that job's pin to the pin of the four reusable workflows. Acceptance also requires `git merge-base --is-ancestor <sha> origin/main` and `gh api repos/webpresso/github-actions/compare/<sha>...main` (status identical or behind) before the push; both already pass at planning time (compare status: identical)."
  - finding_id: "gate:ded3abf05ea9cd74:codex:gpt-6-luna#2"
    disposition: fixed
    evidence: "Acceptance requires `git grep -n login_floor= 56134240116afe7a3c6da92245de1adc04b08a64 -- .github/actions/setup-wp/action.yml` to print login_floor=\"0.0.24\" (it does; cd003ce0 prints 0.0.23). The new setup-wp-remote-pin self-test job installs the published pre-login release 0.0.23 through the remote pin with auth auto and no id-token and asserts wp is installed and signed out: at the old pin that same step fails with exit 17 (sign-in required, no id-token), so the job discriminates the two pins live. The 0.0.24 sign-in path is proven by the stub-wp contract suite (setup-wp-auth.test.ts), which tests the action content at that commit; 0.0.24 is not published yet, so it cannot be installed live."
progress: 0% (0/1 tasks done, 0 blocked, updated 2026-11-18)
---

<!-- wp-blueprint-source-v1 {"blueprint_id":"c5d0c0ca-bbed-42d9-9162-d857180d4c96","head_id":"e5a8bca8-b0b5-496b-8e57-5f40ea1e515e","content_version_id":"484f1c27-b620-42b5-8f27-03280c699f8f","relationship_revision_id":"8d0baef0-a4ee-4b8b-a65b-5a7fed214e18"} -->

# Reusable workflows pin setup-wp at the 0.0.24 sign-in floor

## Product wedge anchor

- **Stage outcome:** A caller of the four reusable workflows that sets wp_version to 0.0.23 installs it signed out instead of failing the job, and 0.0.24 or later signs in
- **Consuming surface:** The wp_version input of changesets-release.yml, cloudflare-preview.yml, cloudflare-production.yml and webpresso-security.yml
- **New user-visible capability:** Callers of the reusable workflows can select any archive-publishing wp release, including 0.0.23, without a failing sign-in step

## Summary

PR #63 (merged 2dc7860d) pinned the four reusable workflows (changesets-release, cloudflare-preview, cloudflare-production, webpresso-security) to setup-wp at cd003ce04712ed5c7f24c3724969d81e35353d97, whose sign-in floor is 0.0.23. PR #64 (merged 56134240116afe7a3c6da92245de1adc04b08a64, blueprint setup-wp-auth-floor-0024) moved the floor to 0.0.24, the first login-only wp, because 0.0.23 shipped without the login-only gate and has no `wp auth ci`. At the old pin a caller that selects 0.0.23 runs `wp auth ci` and fails the job; #64 documented that caveat and named this repin as its follow-up (decision D2).

This change repins setup-wp in all four reusable workflows to 56134240116afe7a3c6da92245de1adc04b08a64, the squash-merge commit of #64 on main. `git grep` at that commit shows login_floor="0.0.24" (cd003ce0 shows 0.0.23), and the GitHub compare API reports it identical to main at planning time, so it is reachable for remote `uses:` resolution. The 0.0.23 caveat is removed from each wp_version description, the sign-in comments name 0.0.24 as the pinned floor, and the README replaces its caveat bullet with the new pin and floor. The wp_version default stays 0.0.21: 0.0.24 is not published yet, and a later change moves the default after release.

Nothing in CI resolves the remote setup-wp pin today: self-test.yml runs only the in-repo `./.github/actions/setup-wp`, and the contract suite asserts pin shape and cross-site agreement, not reachability or the pinned commit's floor. So this change adds a self-test job, setup-wp-remote-pin, modelled on wait-for-checks-remote-pin: with no checkout and no id-token, it runs the exact remote pin with version 0.0.23 (published with install archives) and auth auto, and asserts wp is installed and the job is signed out. An unreachable pin fails that job, and so does a pin whose floor is 0.0.23 or lower (that step would demand an id-token and exit 17). A contract test binds the job's pin to the reusable workflows' pin, so the runtime proof cannot drift from the pin callers use, and the existing self-test test that forbids the remote setup-wp pin in self-test.yml is narrowed to allow it in that one job. When the pre-login releases are deleted, this job moves its version together with setup-wp-live-skip.

The contract suite needs no literal SHA: test/helpers.ts derives the setup-wp pin from the canonical workflow, and workflow-shape.test.ts asserts every setup-wp reference is the same full-SHA pin. The install path (exact-semver check, exit 6 for an unavailable release) is unchanged between the two pins and stays covered by setup-wp.test.ts and setup-wp-archive-contract.test.ts.

## Wave 1: 1

<!-- wp-blueprint-wave-v1 {"id":"c3b0404e-8801-4db5-89ac-3f5de1b5cd25","ref":"1","title":"1"} -->

#### Task 1.1: Repin setup-wp in the reusable workflows to the 0.0.24-floor commit, prove the pin live, and drop the 0.0.23 caveat
<!-- wp-blueprint-task-v1 {"id":"a99bcf2f-0d63-43f5-87ed-ac853abf59d8","ref":"1.1"} -->

**Status:** todo
**Wave:** 1
**Lane:** workflows
**Depends:** None

In changesets-release.yml, cloudflare-preview.yml, cloudflare-production.yml and webpresso-security.yml change the setup-wp `uses:` pin from cd003ce04712ed5c7f24c3724969d81e35353d97 to 56134240116afe7a3c6da92245de1adc04b08a64, remove the do-not-select-0.0.23 clause from the wp_version description, and change the sign-in comment to name 0.0.24 as the floor of the pinned setup-wp. In README.md replace the bullet that says the workflows still pin cd003ce0 with one naming the new pin 56134240 and its 0.0.24 floor (0.0.23 installs and stays signed out). Keep the wp_version default 0.0.21. In self-test.yml add a job setup-wp-remote-pin (needs contract-tests, permissions contents: read only, no checkout) whose setup-wp step uses the exact remote pin with version 0.0.23 and auth auto, followed by a step asserting wp resolves to WP_INSTALL_DIR/wp and WEBPRESSO_HOME is unset. In test/workflow-shape.test.ts add a test that this job exists with that shape and that its pin equals SETUP_WP_USES, and narrow the assertion that self-test.yml never contains SETUP_WP_USES so it holds for every job except setup-wp-remote-pin. Before pushing, confirm the pin with git grep (login_floor="0.0.24" at the pinned commit), git merge-base --is-ancestor against origin/main, and the GitHub compare API. Run bun test, the command the Self-test workflow runs, and wp format --check on every changed file.

**Acceptance:**
- [ ] Every setup-wp reference in the four reusable workflows and in the setup-wp-remote-pin job is webpresso/github-actions/.github/actions/setup-wp@56134240116afe7a3c6da92245de1adc04b08a64, and no file outside blueprints/ and the dated research note names cd003ce0 as the current pin
- [ ] git grep at 56134240116afe7a3c6da92245de1adc04b08a64 shows login_floor="0.0.24" in .github/actions/setup-wp/action.yml, the commit is an ancestor of origin/main, and the GitHub compare API from it to main reports identical or behind
- [ ] self-test.yml has a setup-wp-remote-pin job that installs 0.0.23 through the remote pin with auth auto and no id-token and asserts wp is installed and signed out, and a contract test binds its pin to the reusable workflows' pin
- [ ] No wp_version description or README bullet tells callers to avoid 0.0.23, and the wp_version default is still 0.0.21
- [ ] bun test passes for the full contract suite
- [ ] wp format --check passes on every changed file

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-11-18T08:46:08.187Z
- trust-gate-version: v1

### Material Claims

| ID | Claim | Evidence |
| --- | --- | --- |
| C1 | The four reusable workflows pin setup-wp at cd003ce04712ed5c7f24c3724969d81e35353d97 and their wp_version descriptions warn against 0.0.23 because that pin's floor is 0.0.23. | repo:.github/workflows/changesets-release.yml |
| C2 | The setup-wp action on main (merged by #64 as 56134240116afe7a3c6da92245de1adc04b08a64) holds login_floor="0.0.24", and with auth auto a version at or above the floor with no id-token fails with exit 17 while a version below it is a no-op. | repo:.github/actions/setup-wp/action.yml |
| C3 | The contract suite derives the setup-wp pin from the canonical workflow, asserts every setup-wp reference is one full-SHA pin, and asserts self-test.yml does not contain that pin; it asserts no literal setup-wp SHA. | repo:test/workflow-shape.test.ts |
| C4 | self-test.yml exercises setup-wp only through the in-repo ./.github/actions/setup-wp path, and resolves the remote wait-for-checks pin in a checkout-free job. | repo:.github/workflows/self-test.yml |
| C5 | The README names cd003ce0 and the 0.0.23 caveat in the reusable-workflow section. | repo:README.md |

### Material Decisions

| ID | Decision | Chosen option | Rejected alternatives | Rationale |
| --- | --- | --- | --- | --- |
| D1 | Which commit the workflows pin | 56134240116afe7a3c6da92245de1adc04b08a64, the squash-merge commit of #64 on main | The #64 branch head, which the squash merge orphans and Actions cannot resolve; a later main commit, which would pull unrelated changes into the pin | The merged commit of the floor change is reachable from main and changes exactly the floor relative to cd003ce0's setup-wp |
| D2 | Whether to move the wp_version default now | Keep 0.0.21 | Move the default to 0.0.24, which is not published yet, so every caller relying on the default would fail with exit 6 | A later change moves the default once 0.0.24 is released; the self-test live job installs the default and would fail too |
| D3 | How reachability and the floor of the remote pin are proven | A checkout-free self-test job that runs the exact remote pin with 0.0.23 and auth auto on every pull request, bound to the workflows' pin by a contract test, plus pre-push git and GitHub API checks | A contract test reading the pinned commit through git, which fails in the shallow Self-test checkout; pre-push checks only, which do not catch a later regression | Same pattern as wait-for-checks-remote-pin; 0.0.23 is the one published release that discriminates the 0.0.24 floor from the 0.0.23 floor without an id-token |

### Promotion Gates

| Gate | Command | Expected outcome | Last result |
| --- | --- | --- | --- |
| format-release | wp format --check --files .github/workflows/changesets-release.yml | No format issues | pass at 2026-11-18T08:46:08.187Z [command d868b66b9aa25cbd] |
| format-preview | wp format --check --files .github/workflows/cloudflare-preview.yml | No format issues | pass at 2026-11-18T08:46:08.187Z [command 20c8cf6481babaa6] |
| format-production | wp format --check --files .github/workflows/cloudflare-production.yml | No format issues | pass at 2026-11-18T08:46:08.187Z [command 179144820fa41505] |
| format-security | wp format --check --files .github/workflows/webpresso-security.yml | No format issues | pass at 2026-11-18T08:46:08.187Z [command fc628fdf73bce497] |
| format-self-test | wp format --check --files .github/workflows/self-test.yml | No format issues | pass at 2026-11-18T08:46:08.187Z [command d065b033b2302993] |
| format-readme | wp format --check --files README.md | No format issues | pass at 2026-11-18T08:46:08.187Z [command 1d19d7e3a5c23979] |
| format-shape-test | wp format --check --files test/workflow-shape.test.ts | No format issues | pass at 2026-11-18T08:46:08.187Z [command 3a31cf89e2eb5339] |

### Residual Unknowns

None.
