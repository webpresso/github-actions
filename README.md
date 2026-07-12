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
- reusable deployment workflows use repo-owned secret profiles and require a
  `secret_profile` input plus a
  run-capable `secret_sink`; only deploy, destroy, and rollback execute through
  `wp secrets run --sink <sink> --profile <profile> -- ...`
- install, verify, and smoke blocks receive no provider credentials or runtime
  secrets
- Doppler callers may pass `ci_secret_provider_token` (for example preview /
  production config tokens) or a non-secret `doppler_identity_id`; OIDC is
  exchanged for a masked short-lived Doppler token immediately before mutation
- the shared job binds the caller-selected `github_environment`, allowing
  approval rules and environment-scoped bootstrap credentials to remain owned
  by the caller repository
- Infisical fails closed until its OIDC exchange can hand a short-lived provider
  credential to `wp secrets run` without exporting the secret profile job-wide
- optional `rollback_command` executes through the same sink after a failed
  smoke check, receives `RELEASE_ID` from the deploy step's `release_id` output,
  and never turns the failed workflow green
- secret-bearing third-party actions are pinned by full commit SHA

Deployment callers must now pass these inputs explicitly:

```yaml
with:
  secret_profile: production
  secret_sink: deploy-wrangler
  github_environment: production
secrets:
  ci_secret_provider_token: ${{ secrets.CI_SECRET_PROVIDER_TOKEN_PRODUCTION }}
```

The selected sink must declare `run` in
`.webpresso/secrets.config.json#sinks.<sink>.allowedOps`; `wp secrets run`
enforces the same contract again at execution time. Callers using Doppler OIDC
set `doppler_identity_id` and omit `ci_secret_provider_token`. To enable
rollback, the caller's deploy block writes `release_id=<id>` to
`$GITHUB_OUTPUT` and reads the provided `RELEASE_ID` in `rollback_command`.
