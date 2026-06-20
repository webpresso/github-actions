# webpresso/github-actions

Public reusable GitHub Actions workflows for Webpresso consumer repositories.

Current workflows:
- `.github/workflows/cloudflare-preview.yml`
- `.github/workflows/cloudflare-production.yml`
- `.github/workflows/wp-e2e.yml`
- `.github/workflows/wp-cleanup-preview.yml`
- `.github/workflows/wp-secret-orchestration-smoke.yml`

Consumers should pin reusable workflow references by full commit SHA.

Secret orchestration contract:
- Consumers pass repo-owned secret profiles through `secret_profile`.
- Consumers pass provider bootstrap through `ci_secret_provider_token`; reusable workflows fail closed when it is missing.
- Consumers should pin reusable workflow references by full commit SHA.
