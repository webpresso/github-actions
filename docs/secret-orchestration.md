# Secret orchestration reusable workflows

This repo owns the shared reusable workflow shells for the secret orchestration
platform.

Current reusable surfaces:
- `.github/workflows/cloudflare-preview.yml`
- `.github/workflows/cloudflare-production.yml`
- `.github/workflows/wp-e2e.yml`
- `.github/workflows/wp-cleanup-preview.yml`

Contract highlights:
- callers pass `ci_secret_provider_token` explicitly
- reusable workflows do **not** rely on `secrets: inherit`
- secret-bearing third-party actions are pinned to full SHAs
- OIDC-ready secret workflows request `id-token: write`

Consumers should pin these reusable workflows by full commit SHA, never `@main`.
