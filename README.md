# webpresso/github-actions

Public reusable GitHub Actions workflows for Webpresso consumer repositories.

Current workflows:
- `.github/workflows/webpresso-ci.yml`
- `.github/workflows/webpresso-security.yml`
- `.github/workflows/cloudflare-preview.yml`
- `.github/workflows/cloudflare-production.yml`
- `.github/workflows/changesets-release.yml`
- `.github/actions/setup-webpresso-toolchain/action.yml`

Consumers should pin reusable workflow references by full commit SHA.

Shared toolchain action (`setup-webpresso-toolchain`):
- resolves the caller's pnpm version from `package.json` and configures pnpm, Node.js, Corepack, and (optionally) Bun
- `cli-global-packages` (optional, space-separated) installs the named CLIs globally at the caller's pinned version, read from `package.json`
- explicit package specs pass through unchanged when another global CLI needs an owner-controlled version
- entries resolving to `catalog:`/`workspace:`/`link:` are skipped. This replaces per-workflow inline install blocks so the bootstrap lives in one place.

Agent-kit contract:
- every reusable workflow invokes one immutable `setup-wp` action commit, which self-resolves its exact published version from the owning agent-kit release
- `wp` is installed globally after Vite+ setup, so consumers must not add `@webpresso/agent-kit` as a repository dependency
- consumers update only their reusable-workflow commit SHA; agent-kit version changes remain owned by this repository's immutable action reference

Security contract:
- reusable deployment workflows use repo-owned secret profiles plus provider-specific bootstrap
- Doppler callers may pass `ci_secret_provider_token` (for example preview / production config tokens) or a non-secret OIDC identity ID
- Infisical callers use OIDC identity IDs
- secret-bearing third-party actions are pinned by full commit SHA
