---
type: blueprint
title: "GitHub Actions: shared setup, OIDC bootstrap, cache, pin hardening"
owner: webpresso
status: in-progress
complexity: M
created: "2026-06-19"
last_updated: "2026-06-19"
progress: "80% (capability-aware reusable deploy bootstrap, shared toolchain setup action, SHA-pinned provider actions, and fixture-style contract tests landed)"
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

## Verification

- workflow syntax / fixture checks available in repo
- audit evidence that secret-bearing actions are pinned

## Current completion evidence

- `cloudflare-preview.yml` and `cloudflare-production.yml` now request
  `permissions: id-token: write`.
- Added shared local composite action:
  - `.github/actions/setup-webpresso-toolchain/action.yml`
  which centralizes pnpm version resolution, pnpm install, Node setup,
  Corepack activation, and optional Bun setup.
- `cloudflare-preview.yml`, `cloudflare-production.yml`, and
  `changesets-release.yml` now reuse that shared setup action instead of
  inlining duplicated setup steps.
- Added zero-dependency contract test:
  - `test/workflow_contract_test.rb`
  covering:
  - capability-aware reusable workflow inputs
  - `id-token: write`
  - full SHA pinning for shared setup/provider actions
  - shared setup action reuse
  - README security contract wording
- Replaced broad `DOPPLER_TOKEN` / `INFISICAL_TOKEN` bootstrap exports with a
  capability-aware contract: Doppler may use `ci_secret_provider_token` or
  `doppler_identity_id`; Infisical stays OIDC-only via
  `infisical_identity_id`.
- Added explicit non-secret OIDC identity inputs:
  - `doppler_identity_id`
  - `infisical_identity_id`
- Doppler secrets now fetch through `DopplerHQ/secrets-fetch-action` using
  either the `ci_secret_provider_token` fallback or `auth-method: oidc`
  depending on account capability.
- Infisical secrets now fetch through `Infisical/secrets-action` with
  `method: oidc`.
- Narrowed optional direct runtime secrets from job-wide `GITHUB_ENV` export to
  step-local env on caller verify/deploy/destroy/smoke blocks only.
- Reusable workflows still parse as valid YAML after the hardening pass.
