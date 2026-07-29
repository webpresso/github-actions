# webpresso/github-actions

Public reusable GitHub Actions workflows for Webpresso consumer repositories.

Current workflows:
- `.github/workflows/webpresso-ci.yml`
- `.github/workflows/webpresso-security.yml`
- `.github/workflows/cloudflare-preview.yml`
- `.github/workflows/cloudflare-production.yml`
- `.github/workflows/changesets-release.yml`
- `.github/workflows/agent-kit-freshness.yml`
- `.github/actions/setup-webpresso-toolchain/action.yml`

Consumers should pin reusable workflow references by full commit SHA.

## Contributing: the contract tests

The workflows and composite actions in this repo are consumed by every
Webpresso repository, so their YAML is covered by a contract suite that treats
it as data — pins, permission scopes, secret-sink boundaries, and the embedded
workflow scripts (which are extracted from their heredocs and executed against
real git fixtures).

**Prerequisite:** [Bun](https://bun.sh) >= 1.2 (for `Bun.YAML`). **Command:**

```bash
bun test
```

That is the whole thing: no `package.json`, no dependency install, no other
runtime to provision. The suite lives in `test/*.test.ts` and shares
`test/helpers.ts`. `node` is used *inside* the tests to execute the workflows'
embedded scripts, matching what the GitHub Actions runner does; it is
preinstalled on GitHub-hosted runners and on any normal dev machine.

`.github/workflows/self-test.yml` runs `bun test` on every pull request and on
every push to `main`, so a broken contract cannot merge green.

Shared toolchain action (`setup-webpresso-toolchain`):
- resolves the caller's pnpm version from `package.json` and configures pnpm, Node.js, Corepack, Vite+, and (optionally) Bun
- installs Vite+ with the immutable official setup action, which resolves the caller's pinned version from `package.json`, workspace catalogs, and the lockfile
- configures Vite+ with `run-install: false`; dependency installation remains owned by each reusable workflow so setup never performs a duplicate install

wp install contract (`setup-wp`):
- every reusable workflow invokes one immutable `setup-wp` action commit, hosted in this public repo so callers outside the `webpresso` GitHub org can resolve it (the equivalent action in the private source monorepo cannot be shared across organizations)
- `setup-wp` takes a required `version` input — the caller supplies the exact wp release semver to install; the action does not self-resolve a version
- the binary is downloaded from the **public** `webpresso/app-releases` repository by direct release-asset URL. There is no GitHub API call, no token, and no `python3` dependency on the runner; `github-token` is still accepted (so existing callers keep working) but no longer takes part in the install
- the release line restarted at `0.0.1` when the private `webpresso/agent-kit` repository was renamed to `webpresso/app`, and `v0.0.2` is a byte-identical mirror of the last private `3.3.6` build. A caller still on the old `3.3.x` axis must move the `version` input onto the new line in the same commit that bumps the pinned `setup-wp` SHA — the two pins are only valid together
- before downloading, the action short-circuits on the `@actions/tool-cache` layout: if `${RUNNER_TOOL_CACHE:-/opt/hostedtoolcache}/wp/<version>/<arch>/wp` is executable it goes straight onto `PATH`. Self-hosted images that bake wp in therefore never hit the network; GitHub-hosted runners miss and fall through to the download, which then seeds that same path best-effort
- the cache is keyed on the version **directory**, never on `wp --version`: a standalone release binary reports the product axis from a package root it does not carry, so every published binary prints `0.0.0`. Nothing in a workflow may assert that `wp --version` equals the pinned version
- an optional `checksum` input pins the sha256 of the downloaded asset for callers that want the binary bound as tightly as the action SHAs
- `wp` is placed on `PATH` after Vite+ setup, so consumers must not add `@webpresso/agent-kit` as a repository dependency
- the agent-kit package root (`WEBPRESSO_AGENT_KIT_ROOT`, `WP_AGENT_KIT_PACKAGE_ROOT`, `NODE_PATH`) is **opt-in** via `package-root: true` and is off by default: the public release repository ships only the five `wp-*` binaries, and current binaries resolve their own catalog and migration assets. The opt-in path reads the private source monorepo, so it additionally needs `github-token` and an explicit `package-root-ref` (the private tag axis, e.g. `v3.3.6`, does not track the public `version`). A package root that lacks blueprint migrations now warns instead of failing the install
- consumers update their reusable-workflow commit SHA and, independently, the pinned `version` input when they want a newer wp release

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
- GitHub authentication is absent from deploy blocks by default. A trusted
  caller may set `deploy_github_token: true` and must explicitly grant only the
  GitHub permission that block needs; the called workflow cannot elevate it.

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

## agent-kit freshness (`agent-kit-freshness.yml`)

Consumers pin `@webpresso/agent-kit` in their own workflow YAML (an env
assignment, a shell default, a `setup-wp` `with: version:` input, or a
composite action's `agent-kit-version` input default), and those pins tend to
go stale because nothing else in the ecosystem watches them — Renovate isn't
installed on these orgs and Dependabot can't read a version out of arbitrary
workflow YAML. This reusable workflow closes that gap: it resolves the latest
published `@webpresso/agent-kit` version from npm, scans the calling repo's
own `.github/**/*.yml`/`.yaml` files for the four known pin shapes, and opens
(or updates) a single PR bumping every stale pin. If it finds *zero* pins in a
repo that called it, it fails the run instead of passing silently — that's
the signal that the pin shape drifted and the scan needs fixing, not a
"nothing to do" result.

It runs entirely on the caller's own `GITHUB_TOKEN` (no PAT, no GitHub App) and
never runs `wp setup`. It does not touch `setup-wp`'s exact-version install
contract described above.

⚠️ This workflow still resolves "latest" from the **npm** `@webpresso/agent-kit`
version, which is no longer the axis `setup-wp` installs from: the binary now
comes from the `webpresso/app-releases` release line that restarted at `0.0.1`.
Until that resolver is repointed at the release line, do not schedule this
workflow against a repository whose `setup-wp` `version:` input is on the new
axis — it would "bump" a valid `0.0.x` pin to an npm version that has no
published binary.

This is a **caller-scheduled reusable workflow**: it declares only
`workflow_call` and `workflow_dispatch`, so it has no `schedule:` trigger of its
own. The cadence lives in the caller's workflow. (Adding a `schedule:` here
would scan *this* library instead of the consumer repository, which is not what
the workflow is for.) A contract test pins that trigger set so this description
and the YAML cannot drift apart.

Add a tiny caller workflow — this is where the schedule lives — to adopt it:

```yaml
# .github/workflows/agent-kit-freshness.yml
name: agent-kit freshness

on:
  schedule:
    - cron: "0 6 * * 1" # weekly, Monday 06:00 UTC
  workflow_dispatch: {}

permissions:
  contents: write
  pull-requests: write

jobs:
  freshness:
    uses: webpresso/github-actions/.github/workflows/agent-kit-freshness.yml@<full-commit-sha>
```

The caller workflow's own `permissions:` block above is required: a called
reusable workflow can narrow the caller's token but never elevate it, so
without `contents: write` and `pull-requests: write` here the called job
cannot push the bump branch or open the PR.
