# webpresso/github-actions

Public reusable GitHub Actions workflows for Webpresso consumer repositories.

Current workflows:
- `.github/workflows/cloudflare-preview.yml`
- `.github/workflows/cloudflare-production.yml`
- `.github/actions/setup-webpresso-toolchain/action.yml`

Consumers should pin reusable workflow references by full commit SHA.

Security contract:
- reusable deployment workflows use repo-owned secret profiles plus provider-specific bootstrap
- Doppler callers may pass `ci_secret_provider_token` (for example preview / production config tokens) or a non-secret OIDC identity ID
- Infisical callers use OIDC identity IDs
- secret-bearing third-party actions are pinned by full commit SHA
