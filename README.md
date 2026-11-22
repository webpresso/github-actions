# webpresso/github-actions

Public reusable GitHub Actions workflows for Webpresso consumer repositories.

Current workflows:

- `.github/workflows/webpresso-security.yml`
- `.github/workflows/cloudflare-preview.yml`
- `.github/workflows/cloudflare-production.yml`
- `.github/workflows/changesets-release.yml`
- `.github/actions/setup-webpresso-toolchain/action.yml`
- `.github/actions/wait-for-checks/action.yml`

Consumers should pin reusable workflow references by full commit SHA.

## Contributing: the contract tests

The workflows and composite actions in this repo are consumed by every
Webpresso repository, so their YAML is covered by a contract suite that treats
it as data — pins, permission scopes, secret-sink boundaries, and the embedded
workflow scripts (which are extracted from their heredocs and executed against
real git fixtures).

### Toolchain

`.tool-versions` is the single pin source for this repo's toolchain; mise and asdf read it natively.

**Prerequisite:** [Bun](https://bun.sh) >= 1.2 (for `Bun.YAML`). **Command:**

```bash
bun test
```

That is the whole thing: no dependency install and no other runtime to
provision. The root `package.json` declares only a name and `private: true`;
it carries no scripts or dependencies and exists because `wp format` needs a
workspace root. The suite lives in `test/*.test.ts` and shares
`test/helpers.ts`. `node` is used _inside_ the tests to execute the workflows'
embedded scripts, matching what the GitHub Actions runner does; it is
preinstalled on GitHub-hosted runners and on any normal dev machine.

`.github/workflows/self-test.yml` runs `bun test` on every pull request and on
every push to `main`, so a broken contract cannot merge green.

Shared toolchain action (`setup-webpresso-toolchain`):

- installs the caller's pnpm (from `package.json#packageManager`, read by `pnpm/action-setup`) and configures Node.js, Vite+, and (optionally) Bun
- installs Vite+ with the immutable official setup action, which resolves the caller's pinned version from `package.json`, workspace catalogs, and the lockfile
- configures Vite+ with `run-install: false`; dependency installation remains owned by each reusable workflow so setup never performs a duplicate install

wp install contract (`setup-wp`):

- every reusable workflow invokes one immutable `setup-wp` action commit from this public repository
- `setup-wp` does not self-resolve a version: the required `version` input is an exact caller-pinned product semver, independent of the pinned action SHA; the action never resolves `latest` and never self-updates
- `wp` comes from public `webpresso/app-releases` by direct release-asset URL, without a GitHub API call, credential, or `python3` dependency
- one install archive per target: supported assets are exactly `wp-linux-x64.tar.gz`, `wp-linux-arm64.tar.gz`, `wp-darwin-x64.tar.gz`, and `wp-darwin-arm64.tar.gz`, each with a digest sidecar (`wp-<target>.tar.gz.json`); the archive sha256 is verified against the sidecar (`archive`, `version`, `target` must also match) and the action fails with a named error on any mismatch; the archive is listed and refused (before anything is extracted) if any entry is not a regular file or directory, is an absolute path, or contains `..`; `bin/wp` is extracted from the archive
- the sidecar digest is **not** an independent trust root: the archive and its sidecar come from the same release location, so it protects against corruption and partial downloads, not against a compromised release repository or a mirror set through `release-repo`; high-assurance consumers should pin the `checksum` input, which verifies the extracted `bin/wp` and does not cover `package-root/`
- a version-directory tool-cache hit is verified before it is used: against `checksum` when set, else against the `wp.sha256` digest record that `setup-wp` writes next to a binary it verified from a release archive (exit 16 on a mismatch); a cached `wp` with neither is treated as a cache miss and downloaded again. Only a verified cache hit skips the download. Anything able to write the tool cache can rewrite both files, so the `checksum` input stays the only independent trust root; the record catches corruption and binaries of unknown provenance. With `package-root: true` the archive is still downloaded, verified and extracted on a hit, so `package-root/` comes from the verified archive while `wp` comes from the cache
- a cache miss uses the direct release-asset URL, applies optional caller-supplied sha256 verification of the extracted `bin/wp` (not of the archive), then attempts a best-effort seed of that same cache path: the binary first, then its `wp.sha256` record
- the cache is keyed on the version directory, never on `wp --version`; a standalone binary cannot reliably identify its release version
- `wp` is placed on `PATH` after Vite+ setup, so consumers must not add `@webpresso/agent-kit` as a repository dependency
- `package-root: true` additionally extracts `package-root/` from the same archive, so the same release and same version as the binary with no second download; it exports `WEBPRESSO_PACKAGE_ROOT` and `NODE_PATH`, and fails closed when the extracted root lacks `catalog/`
- consumers update the reusable-workflow commit SHA and pinned product version independently

Sign-in for login-only wp (`setup-wp` inputs `auth` and `entitlement`):

- wp is login-only from `0.0.24`: signed out, its non-exempt commands exit 77. `0.0.23` shipped without the gate and has no `wp auth ci`, so it is a pre-login release. After the install, a second step signs wp in for the job. Input `auth` selects the mode: `auto` (the default) signs in at or above `0.0.24` and is a no-op below it; `oidc` requires a login-only version (exit 20 otherwise); `none` never signs in and warns for a login-only version. The floor is compared on the numeric major.minor.patch core, so a `0.0.24` prerelease is login-only
- callers on older versions run unchanged by the sign-in step, but this revision installs only releases that publish install archives, which means `0.0.16` or later. `0.0.6`, `0.0.9`, `0.0.10` and `0.0.13` publish flat binaries and fail with exit 6, so a caller on one of them moves its version together with its pin (this boundary came with the archive contract, before sign-in)
- the default sign-in runs `wp auth ci`, which requests the job's GitHub OIDC token (audience `https://api.webpresso.ai`), masks it, and exchanges it for a short-lived CI entitlement (at most 6 hours). No stored secret is involved, but the calling job must grant `permissions: id-token: write`; job-level permissions replace the defaults, so list the others too. When sign-in is required and the job has no id-token, the step fails with exit 17 before any network call and names that permission
- pull requests from forks never receive an id-token, so a login-only wp cannot sign in there. Treat Dependabot pull requests the same way (whether their runs receive an id-token is not verified here): skip wp-dependent jobs for them, for example with `if: github.actor != 'dependabot[bot]'`, or accept the failing check
- wp keeps the CI entitlement in its own Actions auth directory, `${RUNNER_TEMP}/webpresso/auth` (`entitlement.jwt`), whenever `GITHUB_ACTIONS` is `true`, whatever `WEBPRESSO_HOME` says. The runner empties `RUNNER_TEMP` after every job, so the entitlement never reaches `$HOME`, a cache or an artifact, and later steps find it without an exported variable; `setup-wp` neither sets nor exports `WEBPRESSO_HOME`. Before running wp the step refuses with exit 21 when `RUNNER_TEMP` is missing, when `webpresso` or `webpresso/auth` under it exists as anything but a real directory, or when `entitlement.jwt` exists as a symlink or another non-regular file, so a planted link cannot carry the write out of `RUNNER_TEMP`
- `entitlement` is break-glass only, for when api.webpresso.ai cannot exchange. Pass it from `secrets.*`: the step registers it with `::add-mask::` before its own output, but the runner prints a composite step's env before the step runs, so only a registered secret is masked from the start. It is piped to `wp auth import --stdin` (never argv, never `GITHUB_ENV`), takes precedence over OIDC, and a break-glass sign-in ends with a warning naming kind `breakglass` and the expiry, so a left-over secret shows on every run. With a version below the floor and `auth: auto` it is ignored with a warning, so a caller that forwards the secret before moving to a login-only wp keeps working; with `auth: none`, or with `auth: oidc` below the floor, it fails with exit 20, as does an unknown `auth` value
- the step calls the installed binary by path and holds the output of `wp auth ci` or `wp auth import --stdin` in a private file under `RUNNER_TEMP` until the entitlement wp wrote is masked; only then is that output printed. A failing `wp auth ci` or `wp auth import --stdin` fails the step with exit 18. If wp reports success but `${RUNNER_TEMP}/webpresso/auth/entitlement.jwt` is not a regular file inside `RUNNER_TEMP`, wp and `setup-wp` disagree on the contract: the step withholds wp's output and fails with exit 19. Afterwards `wp auth status --json` must report `signed-in` with kind `ci` or `breakglass`, or the step fails with exit 19
- `permissions: id-token: write` covers the whole job: every later step, including a caller's install command, can mint an OIDC token for any audience and read the entitlement. The entitlement grants Webpresso CLI use only, never provider or runtime secrets; keep `id-token: write` off jobs that do not run wp

Login-only wp in the reusable workflows (`wp_version` and `wp_entitlement`):

- all four reusable workflows install wp through the same `setup-wp` commit and leave its `auth` at `auto`. The optional input `wp_version` selects the release and defaults to `0.0.21`, a pre-login release that publishes install archives. The value is passed verbatim to `setup-wp` `version` and must be an exact semver of `0.0.16` or later
- moving the pin changes the installed wp even when a caller sets nothing: the earlier pins install `0.0.6` (`ed99fb92`) or `0.0.5` (`2003ca95`), and this pin installs `0.0.21`, still signed out. In the same change as the pin move, set `wp_version` to a release you have tested, or check every wp command your install and command blocks run against `0.0.21` (for example a `wp exec` in a pnpm `postinstall`)
- the `0.0.21` default is temporary. Before the pre-login releases are deleted from `webpresso/app-releases`, the release-removal lane moves the default to `0.0.24`, the login-only release, in a new commit of this repository. That does not change a caller pinned to this commit: such a caller must set `wp_version` to `0.0.24` or later before the deletion, or setup-wp fails with exit 6 (download failed) once the release is gone
- these workflows pin `setup-wp` at `56134240`, whose sign-in floor is `0.0.24`, so `0.0.23` (which has no `wp auth ci`) installs and stays signed out like any pre-login release. Earlier commits of these workflows, from `2dc7860d` up to this change, pin `setup-wp` at `cd003ce0`, whose floor is `0.0.23`: there `0.0.23` runs `wp auth ci`, which it does not have, and fails the job, so a caller on one of those commits moves its pin here before selecting `0.0.23`. Self-test's `setup-wp-remote-pin` job runs this exact pin with `0.0.23` on every pull request, so an unreachable pin or a lower floor fails there first
- the optional secret `wp_entitlement` is forwarded to `setup-wp` `entitlement` and to nothing else. It is break-glass only, for when api.webpresso.ai cannot exchange OIDC tokens; every run that uses it ends with a warning naming kind `breakglass`. How it reaches the job depends on whether the job binds an environment:
  - `changesets-release.yml` and `webpresso-security.yml`: their jobs declare no `environment:`, and a job that calls a reusable workflow cannot declare one, so an environment secret can never reach them. Store the break-glass entitlement as a short-lived repository secret, pass it explicitly as `wp_entitlement: ${{ secrets.WP_ENTITLEMENT }}`, and delete the secret once the exchange works again
  - `cloudflare-preview.yml` and `cloudflare-production.yml`: their jobs declare `environment: <github_environment>`, so GitHub takes `wp_entitlement` from an environment secret named `WP_ENTITLEMENT` in that environment when one exists, instead of the value the caller passed. Store the break-glass entitlement there and delete it afterwards. A standing environment secret of that name forces break-glass on every run at a login-only `wp_version`, however the caller is written
  - pass the secret explicitly rather than through `secrets: inherit`, so a break-glass entitlement reaches only the workflows that need it. Below the login-only floor `setup-wp` ignores it with a warning, so forwarding it explicitly or through `secrets: inherit` before moving `wp_version` does not break a run
- every job that runs wp, and only those jobs, requests `id-token: write`: the preview and production jobs already did for Doppler, and the release (`changesets-release.yml`) and security (`webpresso-security.yml`) jobs do from this pin on. A reusable workflow cannot hold more than its caller grants, so GitHub refuses the run at startup, before any job is scheduled, when the calling job does not grant `id-token: write`. A caller that has no `permissions:` block gets no id-token from the default token grant, and a job-level block replaces the defaults, so list every scope the callee requests (for `changesets-release.yml`: `contents: write`, `pull-requests: write`, `packages: write`, `checks: read` and `id-token: write`)
- the grant lets every later step of the job, including the caller's install and command blocks, mint OIDC tokens for any audience and read the CI entitlement under `RUNNER_TEMP`. The entitlement grants Webpresso CLI use only, never provider or runtime secrets. In `webpresso-security.yml` the third-party scanners (Gitleaks and OSV Scanner) therefore run in a separate `scan` job with `contents: read` only; the `security` job, which holds the grant, waits for it and fails unless `scan` succeeded, so requiring the `security` check still covers both scanners
- pull requests from forks get no id-token, and Dependabot pull requests should be treated the same way: once `wp_version` is login-only, skip these workflows for them (for example `if: github.actor != 'dependabot[bot]'` on the calling job) or accept the failing check
- consumer order: first move the pin to this commit, grant `id-token: write` on every calling job and set `wp_version` to a tested release (wp is not signed in below `0.0.24`); then set `wp_version` to `0.0.24` once that release ships, before the pre-login releases are deleted. A caller still on `0.0.6`, `0.0.9`, `0.0.10` or `0.0.13` must set `wp_version` (or accept the default) in the same change as the pin move, because those releases publish no install archive

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
  a reusable workflow a relative `uses:` resolves against the _caller's_
  checkout, which does not exist at step 0. The pin must also stay **reachable
  from a branch**: Actions refuses to resolve a `uses:` pin to an unreachable
  commit — the classic source being a squash-merged PR branch that was then
  deleted — and reports only an opaque "workflow file issue" with zero jobs
  created. `self-test.yml` resolves the same pinned reference on every pull
  request so that failure surfaces here rather than in a consumer's deploy.
- **`job_timeout_minutes` exists because callers cannot bound a `uses:` job.**
  `timeout-minutes` is not permitted on a job that calls a reusable workflow, so
  the bound has to be exposed from inside. This _adds a missing_ bound rather
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
