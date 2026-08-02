# webpresso/github-actions

Public reusable GitHub Actions workflows for Webpresso consumer repositories.

Current workflows:
- `.github/workflows/webpresso-security.yml`
- `.github/workflows/cloudflare-preview.yml`
- `.github/workflows/cloudflare-production.yml`
- `.github/workflows/changesets-release.yml`
- `.github/workflows/agent-kit-freshness.yml`
- `.github/actions/setup-webpresso-toolchain/action.yml`
- `.github/actions/wait-for-checks/action.yml`

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

## Gating on test outcomes (`wait-for-checks`)

`wait-for-checks` blocks until the named check runs on a commit have **completed
successfully**, or fails. It is checkout-free and uses only `node`, so it can be
the first step of a job — before `actions/checkout`, before any toolchain setup,
and strictly before any credential exchange. A deploy that must not ship an
unproven commit therefore fails before it costs setup time or touches a secret
manager.

```yaml
- uses: webpresso/github-actions/.github/actions/wait-for-checks@<full-commit-sha>
  with:
    contexts: wp-check # comma and/or newline separated check-run NAMES
    timeout-seconds: 900 # hard upper bound (default)
    poll-interval-seconds: 20 # default
    workflow: ci.yml # optional; only needed to disambiguate (see below)
```

The calling job must grant `permissions: { checks: read }` — plus
`actions: read` when `workflow` is set, because attributing a check run to its
workflow requires reading the owning workflow run.

`ref` defaults to `${{ github.event.pull_request.head.sha || github.sha }}`,
**not** a bare `github.sha`: on a `pull_request` event `github.sha` is the
ephemeral merge commit, which carries **zero** check runs (verified against the
live API — the merge commit reports `total_count: 0` while the PR head carries
the whole suite), so a bare default would make every PR-triggered wait fail as
`NEVER OBSERVED`. The action also exposes a `states` output (`name=STATE` pairs)
so a caller using `continue-on-error` can inspect why the wait ended; a later
step cannot read the wait's step summary, because the runner gives every step
its own `GITHUB_STEP_SUMMARY` file.

Three decisions are load-bearing:

- **Only `success` passes, and `skipped` is a failure.** GitHub's branch
  protection counts a skipped required check as a pass; this action does not. A
  gate that never ran has proven nothing about the commit, and inheriting that
  convention would let a deploy proceed from exactly the commit this is meant to
  stop. Every other conclusion (`failure`, `cancelled`, `timed_out`,
  `action_required`, `neutral`, `stale`, …) fails too, and an unrecognised
  future conclusion fails closed.
- **Same-name multiplicity is reported, never guessed.** One commit can carry
  several check runs with the same name — two workflows can each define a job
  with that name, and a `pull_request` suite and a `push` suite can both attach
  to one SHA. When the runs disagree, the action fails and prints every
  conflicting run with its URL; set `workflow` to pick the owning workflow (by
  file name, repo-relative path, or display name). Runs that agree (re-runs) are
  fine and the most recent is used.
- **The bound is loud and specific.** On timeout each context is reported as
  either `PENDING` (a check run exists but has not completed) or
  `NEVER OBSERVED` (no check run with that name) — different symptoms with
  different fixes. An HTTP 401/403/404 aborts immediately naming the missing
  scope instead of masquerading as "not yet appeared", and a terminal
  non-success conclusion fails fast rather than polling to the bound.

### Gating a reusable workflow on it (`require_checks`)

`cloudflare-preview.yml`, `cloudflare-production.yml`, and
`changesets-release.yml` each accept an optional `require_checks` input. When it
is non-empty the wait runs as the **first step of the job** — before
`actions/checkout`, before toolchain setup, and strictly before any Doppler /
OIDC credential exchange — so a caller that must not ship an unproven commit
fails before spending setup time or touching a secret manager.

```yaml
jobs:
  deploy:
    permissions:
      contents: read
      packages: read
      id-token: write
      checks: read # job-level permissions REPLACE the defaults; list them all
    uses: webpresso/github-actions/.github/workflows/cloudflare-production.yml@<full-commit-sha>
    with:
      require_checks: wp-check # empty (the default) disables the gate entirely
      require_checks_timeout_seconds: 900
      job_timeout_minutes: 30
      # …existing inputs unchanged
```

Three things about this surface are load-bearing:

- **It is optional with a default, so it is backward compatible.** An existing
  SHA-pinned caller that passes nothing resolves `require_checks` to `""`, the
  step's `if:` evaluates false, and the job behaves exactly as it did before.
  A required input would have broken every pinned consumer on their next pin
  bump.
- **The composite is referenced by its remote pinned SHA, never `./…`.** Inside
  a reusable workflow a relative `uses:` resolves against the *caller's*
  checkout, which does not exist at step 0. The pin must also stay **reachable
  from a branch**: Actions refuses to resolve a `uses:` pin to an unreachable
  commit — the classic source being a squash-merged PR branch that was then
  deleted — and reports only an opaque "workflow file issue" with zero jobs
  created. `self-test.yml` resolves the same pinned reference on every pull
  request so that failure surfaces here rather than in a consumer's deploy.
- **`job_timeout_minutes` exists because callers cannot bound a `uses:` job.**
  `timeout-minutes` is not permitted on a job that calls a reusable workflow, so
  the bound has to be exposed from inside. This *adds a missing* bound rather
  than raising one: `cloudflare-production.yml` and `changesets-release.yml`
  previously had none, so a hung run held the caller's concurrency lock until
  GitHub's 6h default.

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

### Same-run artifacts and evidence

The preview and production deploy workflows expose four optional inputs for
artifact handoff:

```yaml
with:
  input_artifact_pattern: build-*       # empty (the default) skips download
  input_artifact_path: build-input     # workspace-relative, outside .github/.webpresso
  evidence_artifact_name: deploy-evidence-${{ github.run_id }}
  evidence_artifact_path: artifacts/evidence/**
```

`input_artifact_pattern` is downloaded with `actions/download-artifact` using
the current `github.run_id`, with no repository or token override. This is a
same-run handoff, never a cross-run or cross-repository lookup. The optional
destination is workspace-relative and rejects absolute paths, traversal, and
`.github`/`.webpresso` policy or secret directories. Fork pull-request artifacts
are rejected before download in preview; production rejects all pull-request
input artifacts because it is an environment-owned privileged job. Non-PR
artifact consumers must also run from a protected ref; this prevents a manual
dispatch or branch push from smuggling untrusted bytes into a privileged job.

When both evidence inputs are present, `actions/upload-artifact` runs with
`always()` after the final deployment step, so install, verify, deploy, smoke,
rollback, and validation failures still leave the requested evidence when the
path exists. The upload action does not add a permission scope; callers keep
the existing reusable-workflow permission intersection.

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
