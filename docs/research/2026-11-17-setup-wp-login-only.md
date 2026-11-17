# setup-wp and the login-only wp release: research note (2026-11-17)

Owner blueprint: `setup-wp-account-auth` (branch `bp/setup-wp-account-auth`).
Base: `origin/main` at `2243bb501cdeb761d0054536d1daddd814dd43eb`.

## User decisions this lane implements (2026-11-17)

The user decided the following on 2026-11-17. They are recorded here because
this repository is where consumer CI meets them:

- Both apps (the wp CLI and Webpresso Desktop) are login-only.
- Offline window 72 hours, refresh every 12 hours; signup stays invite-only.
- Exactly one login-only release: product version `0.0.23`. Version `0.0.22`
  already shipped ungated.
- Old public versions are deleted only after every consumer is repinned and
  verified (another lane owns the deletion).
- The npm plugins are not deprecated or removed.
- The user approved amending VISION ("local-first / no account") and ADR 0004
  for sign-in. Neither document lives in this repository; this note records
  the amendment as the authority for the sign-in requirement that setup-wp now
  serves.

## What the release repository can install today

`setup-wp` on `main` consumes exactly one install archive per target plus a
digest sidecar (`wp-<target>.tar.gz` and `wp-<target>.tar.gz.json`). Release
asset listings read with `gh release view <tag> --repo webpresso/app-releases`
on 2026-11-17:

| Tag | Assets | Installable by setup-wp on main |
| --- | --- | --- |
| v0.0.6 | flat binaries `wp-<target>`, `wp-package-root.tgz`, `wp-windows-x64.exe` | no |
| v0.0.13 | flat binaries `wp-<target>`, `wp-package-root.tgz`, `wp-windows-x64.exe` | no |
| v0.0.16 | `wp-<target>.tar.gz` + `.json` for five targets | yes |
| v0.0.20 | `wp-<target>.tar.gz` + `.json` for five targets | yes |
| v0.0.21 (Latest) | `wp-<target>.tar.gz` + `.json` for five targets | yes |

Consequence: the reusable workflows pin `setup-wp@2003ca95…` with version
`0.0.6`. Repinning them to any `setup-wp` commit that contains the archive
contract cannot keep `0.0.6` as the default, because that release publishes
no archive. The smallest installable default that exists today is the current
Latest, `0.0.21`.

## CLI contract setup-wp codes against

The wp CLI lane (webpresso/app, `src/account/`) defines these verbs. setup-wp
uses only them and never parses or signs a JWT itself:

- `wp auth ci`: requests a GitHub OIDC token with audience
  `https://api.webpresso.ai` from `ACTIONS_ID_TOKEN_REQUEST_URL`, exchanges it
  at `POST /api/cli/v1/oidc/github/exchange` for a `kind=ci` entitlement
  (expiry at most 6 hours, `repo_id` claim) and writes it to
  `${WEBPRESSO_HOME}/auth/entitlement.jwt` with mode 0600.
- `wp auth import --stdin`: reads an entitlement JWT from stdin, verifies it
  offline against the pinned keys, and only then writes it (break-glass path;
  break-glass tokens use a separate kid valid only for `kind=breakglass` with a
  matching `repo_id`).
- `wp auth status --json`: prints `{state, email, org, kind, expiresAt,
  refreshAfter}`, where `state` is one of `signed-in`, `signed-out`,
  `expired`, `below-min-version`.

Signed-out hard-gated commands exit 77. The exempt set includes
`--version`, help, `login`, `logout`, `auth status|whoami`, `self status|install|repair|activate`,
`update`, `doctor` and `mcp status|doctor|manifest`.

## Security inputs from the program reviews

- Write the CI entitlement under `RUNNER_TEMP`, never `$HOME`, so caches,
  artifacts and persistent self-hosted runners do not capture it.
- Register `::add-mask::` before any output; never print a JWT segment or a
  device user code. This repository is public, so its own workflow logs are
  public.
- Grant `id-token: write` only to jobs that run wp.
- A tool-cache hit must be verified, not trusted.

## PR #60 (`bp/caller-pinned-wp-runtime`, DIRTY)

PR #60 adds a caller-selected `wp_version` input to the four reusable
workflows with a default of `0.0.6`, plus unrelated tooling adoption
(formatter and TypeScript config, guardrails wiring, test renames). Its
blueprint never reached `main`. The `wp_version` idea is carried by this
lane, with a default the current `setup-wp` can install; the rest is not
carried. Only its `.oxfmtrc.json` and `.gitignore` are reused verbatim, so the
one admitted executable promotion row (`wp format --check`) can run here.
