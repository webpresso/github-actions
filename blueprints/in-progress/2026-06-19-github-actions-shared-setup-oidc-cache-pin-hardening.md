---
type: blueprint
title: "GitHub Actions: shared setup, OIDC bootstrap, cache, pin hardening"
owner: webpresso
status: in-progress
complexity: M
created: "2026-06-19"
last_updated: "2026-07-13"
progress: "97% (shared setup now owns catalog-aware Vite+ bootstrap; immutable consumer repin and production proof remain)"
depends_on: []
cross_repo_depends_on:
  - /Users/ozby/repos/_worktrees/agent-kit-dedupe/blueprints/in-progress/2026-06-19-agent-kit-wp-shared-e2e-secrets-act-supervisor.md
tags:
  - github-actions
  - oidc
  - cache
  - setup
  - security
---

# GitHub Actions: shared setup, capability-aware bootstrap, cache, pin hardening

**Goal:** Centralize reusable setup/workflow logic in `webpresso/github-actions` with layered caching, capability-aware secret bootstrap, minimal secret exposure, and SHA-pinned third-party actions.

## Tasks

1. Define shared setup surface for install/cache/tool bootstrap. ✅
2. Standardize reusable e2e/deploy/cleanup workflow shells. ◐
3. Ensure capability-aware bootstrap for provider auth in CI. ✅
4. Remove broad job-wide secret exports. ✅
5. SHA-pin every third-party action in secret-bearing jobs. ✅
6. Add fixture-style workflow validation where this repo supports it. ✅
7. Route provider-managed mutations through caller-owned secret sinks. ✅
8. Bind called jobs to caller-selected GitHub environments. ✅
9. Preserve smoke failures while optionally rolling back a known release. ✅
10. Allow cleanup/recovery callers to pin a trusted base commit instead of executing pull-request code with deploy credentials. ✅
11. Guarantee that the shared setup action provides `vp` before `setup-wp`, including callers that pin Vite+ through a workspace catalog. ◐

## Verification

- workflow syntax / fixture checks available in repo
- audit evidence that secret-bearing actions are pinned

## Current completion evidence

- `cloudflare-preview.yml` and `cloudflare-production.yml` now request
  `permissions: id-token: write`.
- Added shared local composite action:
  - `.github/actions/setup-webpresso-toolchain/action.yml`
  which centralizes pnpm version resolution, pnpm install, Node setup,
  Corepack activation, catalog-aware Vite+ setup, and optional Bun setup.
- `cloudflare-preview.yml`, `cloudflare-production.yml`, and
  `changesets-release.yml` now reuse that shared setup action instead of
  inlining duplicated setup steps.
- Added zero-dependency contract test:
  - `test/workflow_contract_test.rb`
  covering:
  - required profile, sink, and GitHub environment inputs
  - `id-token: write`
  - full SHA pinning for shared setup/provider actions
  - mutation-only provider authentication
  - failure-preserving rollback and release ID handoff
  - shared setup action reuse
  - README security contract wording
- Added required `secret_sink` and `github_environment` inputs beside the
  required repo-owned `secret_profile`.
- Removed direct runtime-secret inputs and all profile-wide secret-fetch
  actions. Install, verify, and smoke remain provider-runtime-secretless.
- Doppler static bootstrap tokens are mapped only onto mutation steps. Doppler
  OIDC exchanges the GitHub token for a masked, short-lived provider token;
  profile resolution then stays behind `wp secrets run`. The primary and
  rollback exchanges reuse one syntax-checked helper per workflow, and contract
  coverage locks the preview and production helpers to identical source.
- Infisical now fails closed until a short-lived provider credential can be
  passed to `wp secrets run` without exporting the profile job-wide.
- Deploy, destroy, and rollback execute only through the caller-selected sink,
  which must allow the `run` operation in committed metadata.
- Added optional failure-preserving rollback. A failed smoke step can trigger a
  secret-gated rollback using the deploy step's explicit `release_id` output,
  after which the workflow still exits non-zero.
- Added an optional `checkout_ref` trust boundary. Cleanup/recovery callers can
  pin the checked-out repository to an explicitly trusted base commit; other
  callers default to the triggering commit.
- Reusable workflows still parse as valid YAML after the hardening pass.
- Production run `29236597774` exposed a setup-owner invariant violation before
  any provider authentication or deploy mutation: the generic global-package
  resolver skipped `vite-plus` when the caller declared it through `catalog:`,
  then `setup-wp` failed because `vp` was absent. The shared action now uses the
  SHA-pinned official `voidzero-dev/setup-vp` action with `run-install: false`;
  that action natively resolves package-manager catalogs and leaves dependency
  installation to the existing workflow install step. Contract coverage rejects
  the removed npm-global heuristic and requires the immutable Vite+ setup pin.
