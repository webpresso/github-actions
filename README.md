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
- every reusable workflow accepts `agent_kit_version`, defaulting to `3.1.10`
- callers may override it with an exact published version; ranges and dist-tags are rejected by the immutable `setup-wp` action
- `wp` is installed globally after Vite+ setup, so consumers must not add `@webpresso/agent-kit` as a repository dependency
- a shared-workflow revision updates the default for all consumers that omit the input; repositories only need an explicit input when intentionally holding a different version

Security contract:
- reusable deployment workflows use repo-owned secret profiles plus provider-specific bootstrap
- Doppler callers may pass `ci_secret_provider_token` (for example preview / production config tokens) or a non-secret OIDC identity ID
- Infisical callers use OIDC identity IDs
- secret-bearing third-party actions are pinned by full commit SHA
