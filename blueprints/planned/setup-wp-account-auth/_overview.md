---
type: blueprint
title: "setup-wp account sign-in for login-only wp"
status: planned
complexity: M
owner: "webpresso/github-actions"
created: "2026-11-17"
last_updated: "2026-11-17"
tags:
  - "setup-wp"
  - "login-only"
  - "oidc"
  - "reusable-workflows"
---

<!-- wp-blueprint-source-v1 {"blueprint_id":"ba0cd834-ccbc-46ea-b33d-f6abcb4dcbdf","head_id":"fec46470-5b90-49dd-86ea-0f16e0bf7aca","content_version_id":"f6ca2478-c02f-4e32-b4ec-284634714f1c","relationship_revision_id":"17061fef-a49f-460c-bc8f-905dd169cb00"} -->

# setup-wp account sign-in for login-only wp

## Product wedge anchor

- **Stage outcome:** Consumer CI can move to the login-only wp 0.0.23 with no stored secret
- **Consuming surface:** setup-wp action inputs and the workflow_call contract of the four reusable workflows
- **New user-visible capability:** GitHub OIDC sign-in for wp inside Actions jobs, a masked break-glass entitlement input, and a caller-selected wp version on every reusable workflow

## Summary

The user decided on 2026-11-17 that the wp CLI and Webpresso Desktop are login-only, with one login-only release, product version 0.0.23 (0.0.22 shipped ungated). The user also approved amending VISION ('local-first / no account') and ADR 0004 for sign-in; neither lives in this repository, so the amendment is recorded in docs/research/2026-11-17-setup-wp-login-only.md as the authority for this lane. From 0.0.23, every non-exempt wp command exits 77 unless a verified entitlement exists. Consumer CI installs wp only through this repository: the setup-wp composite action and the reusable workflows changesets-release, cloudflare-preview, cloudflare-production and webpresso-security. This blueprint makes them able to sign wp in without a stored secret, while every caller on an older version keeps working.

Wave 1 (PR A, merged commit S) changes setup-wp only. A second composite step signs wp in after the install step. New input `auth` (auto, oidc or none; default auto) and new secret-valued input `entitlement` (break-glass only, default empty). The login-only floor 0.0.23 is one constant in that step; the comparison uses the numeric major.minor.patch core, so a 0.0.23 prerelease counts as login-only. auto signs in when the version is at or above the floor and is a no-op below it; oidc requires the floor; none never signs in and warns when the version is at or above the floor. When sign-in is required and neither ACTIONS_ID_TOKEN_REQUEST_URL nor an entitlement is present, the step fails before any network call and names the fix: `permissions: id-token: write` (fork pull requests receive no id-token). An entitlement is masked with ::add-mask:: before any other output, passed through the step env to `wp auth import --stdin` (never argv, never GITHUB_ENV), and takes precedence over OIDC, because break-glass exists for the case where api.webpresso.ai cannot exchange. Otherwise the step runs `wp auth ci`, which owns the OIDC request (audience https://api.webpresso.ai) and the exchange. Both run with WEBPRESSO_HOME=${RUNNER_TEMP}/webpresso-home (mode 0700, exported through GITHUB_ENV only on the sign-in path), so the entitlement never lands in $HOME, caches or a persistent runner. A caller-set WEBPRESSO_HOME outside RUNNER_TEMP is refused. After sign-in the step requires `wp auth status --json` to report state signed-in with kind ci or breakglass, masks the written entitlement file, and prints only kind and expiry. The step invokes the installed binary by its WP_INSTALL_DIR path, not by PATH lookup. Tool-cache hits become verified: the expected digest is the caller `checksum` when set, else a `wp.sha256` record that setup-wp seeds next to the cached binary from the verified archive. A hit with no expected digest is treated as a miss and downloaded; a mismatch fails with exit 16. The checksum input stays the only independent trust root, because anything able to write the tool cache can rewrite both files. A self-test job runs the in-repo action against the published 0.0.21 with auth auto and no id-token, proving the skip path for real.

Wave 2 (PR B, merged commit W) repins the four reusable workflows from setup-wp@2003ca95 to S. Each workflow gains an optional `wp_version` input forwarded verbatim to setup-wp `version`, so W can land before 0.0.23 exists and consumers choose the login-only version by input; this breaks the R8/R10b circular pin of the program. Each also gains an optional `wp_entitlement` workflow_call secret, forwarded only to setup-wp `entitlement`. The default cannot stay 0.0.6: S installs only releases that publish the archive contract, and the dated asset listing in the research note shows 0.0.6 and 0.0.13 publish none. The default is therefore the current Latest, 0.0.21. `id-token: write` is added to the changesets-release and webpresso-security jobs (both run wp; preview and production already grant it). A caller moving its pin to W must grant id-token: write on those calls, or GitHub refuses the run at startup. That is the one caller-visible change at the new pin; the README states it as a migration step. PR #60 is superseded: its wp_version idea is carried here with an installable default; its formatter, tsconfig, guardrail and test-rename work is not. Only its .oxfmtrc.json and .gitignore are reused verbatim in the plan commit, because `wp format --check` is the only admitted promotion row this Bun-native repository can execute.

Out of scope: refusing versions below the floor or non-default release-repo mirrors (the distribution-removal lane, after consumers are repinned); the wp CLI verbs themselves (webpresso/app); OIDC trust bindings and the exchange endpoint (monorepo); consumer repins. Handoff to the removal lane: before v0.0.21 is deleted, the wp_version default and the self-test live job must move to 0.0.23.

## Wave 1: 1

<!-- wp-blueprint-wave-v1 {"id":"3c295069-d831-4f11-b04b-72085aa75bdc","ref":"1","title":"1"} -->

#### Task 1.1: setup-wp sign-in step, verified tool-cache hits, README and live skip proof
<!-- wp-blueprint-task-v1 {"id":"94739f57-c6f4-416d-8cb3-55044c1ed391","ref":"1.1"} -->

**Status:** todo
**Wave:** 1
**Lane:** setup-wp
**Depends:** None
**Produces:** setup-wp-auth-sha

Authority at task start: re-read .github/actions/setup-wp/action.yml, test/helpers.ts, test/setup-wp.test.ts, test/setup-wp-archive-contract.test.ts, test/setup-wp-current-information.test.ts, test/workflow-shape.test.ts, .github/workflows/self-test.yml and README.md on the owner branch rebased on origin/main; re-read the app lane's src/account contract on webpresso/app origin/main if it has landed. If a CLI verb, flag, status field or the entitlement path differs from docs/research/2026-11-17-setup-wp-login-only.md, stop, correct this blueprint and get a fresh plan review before RED.

RED first: new test/setup-wp-auth.test.ts extracts the sign-in step's run script from runs.steps[1] (pattern of setup-wp-archive-contract.test.ts) and executes it with bash, a temp RUNNER_TEMP, GITHUB_ENV and GITHUB_PATH files, and a stub wp in WP_INSTALL_DIR that logs argv, stdin and WEBPRESSO_HOME and answers `auth status --json` from a fixture. Cases: (a) auto + 0.0.21 + id-token env: wp never invoked, GITHUB_ENV gains nothing, exit 0; (b) auto + 0.0.23 + id-token env: exactly one `auth ci`, WEBPRESSO_HOME exported as ${RUNNER_TEMP}/webpresso-home with mode 0700, the written entitlement masked, exit 0; (c) auto + 0.0.23 without id-token or entitlement: exit 17, output names `permissions: id-token: write`, wp never invoked; (d) oidc + 0.0.21: exit 20; (e) none + 0.0.23: warning, wp never invoked, exit 0; (f) entitlement + 0.0.23: the first output line is the ::add-mask:: of the entitlement, `auth import --stdin` receives it on stdin, it never appears in argv, GITHUB_ENV or any other output line, and `auth ci` is not called; (g) entitlement with auth none, or with 0.0.21: exit 20; (h) an unknown auth value: exit 20; (i) a preset WEBPRESSO_HOME outside RUNNER_TEMP: exit 21; (j) `auth ci` or `auth import` exiting non-zero: exit 18; (k) status signed-out, expired, below-min-version or kind user: exit 19; (l) floor comparison table: 0.0.22 below, 0.0.23-rc.1, 0.0.23, 0.1.0 and 1.0.0 at or above. Cache cases join setup-wp-archive-contract.test.ts: a hit whose wp.sha256 record matches downloads nothing; a hit whose record mismatches exits 16; a hit with neither record nor checksum downloads, verifies and installs from the archive; a fresh seed writes wp.sha256; a caller checksum still wins over the record.

Then implement in .github/actions/setup-wp/action.yml (new inputs auth and entitlement, one floor constant, the sign-in step, the cache record), update SETUP_WP_ACTION_BEHAVIOR_SHA256 and the M3 cache assertions in test/setup-wp-current-information.test.ts to the new truth, extend that test with a parity case for the sign-in contract (auth modes, entitlement, id-token: write, RUNNER_TEMP, floor 0.0.23, exit codes), and update the README setup-wp section to match. Add a self-test.yml job that runs ./.github/actions/setup-wp with version 0.0.21 and auth auto under contents: read only, then asserts wp is on PATH and WEBPRESSO_HOME is unset; assert that job in test/workflow-shape.test.ts. Format the action with wp format.

**Acceptance:**
- [ ] V1.1-red: test/setup-wp-auth.test.ts and the new cache cases are committed failing before the action changes, with every case (a)-(l) and every cache case present.
- [ ] V1.1-green: `bun test` passes the whole suite (138 baseline tests plus the new ones) on the owner branch, recorded as task evidence with its exit code.
- [ ] V1.1-format: `wp format --check --files .github/actions/setup-wp/action.yml` passes.
- [ ] V1.1-live: the self-test job on PR A installs the published 0.0.21 through the in-repo action with auth auto, skips sign-in, and is green on GitHub; PR A merges and its merge commit S on main is recorded as setup-wp-auth-sha.

## Wave 2: 2

<!-- wp-blueprint-wave-v1 {"id":"585eff9e-9b62-4837-bb7b-656efcbec2ee","ref":"2","title":"2"} -->

#### Task 2.1: Reusable workflows: repin to S, caller wp_version, wp_entitlement secret, id-token on wp jobs
<!-- wp-blueprint-task-v1 {"id":"513c2998-4aef-474b-80f4-6d2c0be3e0c2","ref":"2.1"} -->

**Status:** todo
**Wave:** 2
**Lane:** workflows
**Depends:** Task 1.1
**Produces:** reusable-workflows-login-ready-sha
**Consumes:** setup-wp-auth-sha

Starts only after PR A merged and S is reachable from main. Re-read the four workflows, test/helpers.ts and test/workflow-shape.test.ts on a fresh rebase; stop and re-plan on drift.

RED first in test/workflow-shape.test.ts (and test/helpers.ts, which derives SETUP_WP_VERSION from the canonical workflow's wp_version default instead of a literal step value): every reusable workflow declares input wp_version (type string, required false, the same default in all four) and secret wp_entitlement (required false); every setup-wp step uses S with version exactly `${{ inputs.wp_version }}` and entitlement exactly `${{ secrets.wp_entitlement }}`; secrets.wp_entitlement appears nowhere else in any workflow; every job that contains a setup-wp step grants id-token: write and no other job does; the default is an archive-publishing release.

Then edit changesets-release.yml, cloudflare-preview.yml, cloudflare-production.yml and webpresso-security.yml: repin setup-wp to S, add the input with default 0.0.21 and the secret, forward both, and add id-token: write to the release and security jobs. README: document wp_version, wp_entitlement, the caller's id-token: write requirement at the new pin with the startup refusal it prevents, break-glass use (a temporary environment secret passed as wp_entitlement, deleted afterwards), the fork-PR limit, and the order consumers follow (move the pin to W and grant id-token, then set wp_version to 0.0.23 once it ships). The CI entitlement is readable by every later step of the job; the README says so and that it grants Webpresso CLI use only, never provider or runtime secrets. In the PR B description, state that it supersedes PR #60 and what is not carried; closing #60 happens only after PR B merges.

**Acceptance:**
- [ ] V2.1-red: the new workflow-shape assertions are committed failing before the workflow edits.
- [ ] V2.1-green: `bun test` passes the whole suite on the owner branch, recorded as task evidence with its exit code.
- [ ] V2.1-pin: the self-test remote-pin and shape checks resolve S from all four workflows, and PR B's self-test run on GitHub is green; PR B's merge commit W is recorded as reusable-workflows-login-ready-sha.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-11-17T20:24:47.119Z
- trust-gate-version: v1

### Material Claims

| ID | Claim | Evidence |
| --- | --- | --- |
| C1 | setup-wp has one composite run step (runs.steps[0]) and inputs version, release-repo, checksum and package-root; it performs no sign-in. | repo:.github/actions/setup-wp/action.yml |
| C2 | A tool-cache hit is trusted without any verification unless the caller passes checksum; a seeded cache entry carries no digest record. | repo:.github/actions/setup-wp/action.yml |
| C3 | setup-wp installs only the per-target wp tar.gz install archive plus its json digest sidecar and fails with exit 6 when the release does not publish them. | repo:.github/actions/setup-wp/action.yml |
| C4 | Releases 0.0.6 and 0.0.13 publish no install archive, while 0.0.16, 0.0.20 and 0.0.21 (Latest) do, so the current setup-wp cannot install the 0.0.6 the reusable workflows pin today. | repo:docs/research/2026-11-17-setup-wp-login-only.md |
| C5 | cloudflare-production.yml pins setup-wp@2003ca953f336efb779165f748e1ad8408565428 with version 0.0.6 as a literal, declares only ci_secret_provider_token as a secret, and already grants id-token: write. | repo:.github/workflows/cloudflare-production.yml |
| C6 | cloudflare-preview.yml uses the same setup-wp pin and literal version and already grants id-token: write. | repo:.github/workflows/cloudflare-preview.yml |
| C7 | The changesets-release job installs wp through the same pin, declares a job-level permissions block without id-token, and declares no workflow_call secrets. | repo:.github/workflows/changesets-release.yml |
| C8 | The webpresso-security job installs wp through the same pin, declares permissions contents: read and packages: read only, and declares no workflow_call secrets. | repo:.github/workflows/webpresso-security.yml |
| C9 | The shape suite requires every setup-wp reference to be one full-SHA pin and every setup-wp step's with.version to equal one version derived from the canonical workflow. | repo:test/workflow-shape.test.ts |
| C10 | SETUP_WP_VERSION and SETUP_WP_USES are derived at runtime from the canonical pin workflow cloudflare-production.yml. | repo:test/helpers.ts |
| C11 | A behavior-boundary test locks a sha256 over the non-description projection of the setup-wp action, and M3 asserts the current cache-hit prose, so a behavior change must update both deliberately. | repo:test/setup-wp-current-information.test.ts |
| C12 | Archive-contract tests execute the action's run script from runs.steps[0] under bash with curl and uname stubbed on PATH, the pattern the sign-in tests reuse with a stub wp. | repo:test/setup-wp-archive-contract.test.ts |
| C13 | self-test.yml runs bun test on every pull request with top-level permissions contents: read and no id-token, and already runs live jobs against GitHub. | repo:.github/workflows/self-test.yml |
| C14 | The README requires first-party remote uses: pins to stay reachable from a branch, and documents the cache-hit-trusted-unless-checksum contract this lane changes. | repo:README.md |

### Material Decisions

| ID | Decision | Chosen option | Rejected alternatives | Rationale |
| --- | --- | --- | --- | --- |
| D1 | How setup-wp decides to sign in | auth input with modes auto, oidc and none, default auto; one floor constant 0.0.23 compared on the numeric core; auto signs in at or above the floor and is a no-op below; oidc requires the floor; none never signs in and warns at or above it. | Probe the installed binary with wp auth status (an old binary's unknown-command path is not a contract and costs a process per job); always sign in (breaks every pre-floor caller); a floor input (a second place for the user's single decision). | The user fixed the login-only version at 0.0.23, so a version comparison is deterministic, testable without a binary, and keeps every older caller byte-for-byte unaffected. |
| D2 | Which component talks to GitHub OIDC and the platform | setup-wp delegates to the wp verbs auth ci, auth import --stdin and auth status --json from the app lane's single contract module; setup-wp never requests an id-token, parses claims or writes the entitlement itself, and stops for re-planning if those verbs drift. | curl the OIDC token and the exchange endpoint in shell (a second implementation of the audience, endpoint and error handling that can drift from the CLI); WP_ENTITLEMENT exported job-wide. | One owner for the auth contract; the action stays a thin installer with an ordering and a failure surface. |
| D3 | Where the CI entitlement lives | WEBPRESSO_HOME set to RUNNER_TEMP/webpresso-home, mode 0700, exported only on the sign-in path; a caller-set WEBPRESSO_HOME outside RUNNER_TEMP fails with exit 21. | The runner HOME (captured by caches, artifacts and persistent self-hosted runners); exporting WEBPRESSO_HOME for every version (changes pre-floor behavior); silently overriding a caller value. | Security review: the runner deletes RUNNER_TEMP per job, so the at most 6-hour entitlement cannot outlive the job on disk. |
| D4 | Break-glass entitlement handling | Input entitlement, masked before any output, piped from the step env to wp auth import --stdin, precedence over OIDC, refused (exit 20) with auth none or a pre-floor version; the reusable workflows forward an optional wp_entitlement secret to it and nowhere else. | Pass the token on argv or through GITHUB_ENV; write the file directly (skips offline verification); ignore a misconfigured entitlement with a warning. | Break-glass is for an unreachable api.webpresso.ai, so it must not depend on the exchange; an unused credential is a misconfiguration and fails closed. |
| D5 | Required sign-in without an id-token | Fail with exit 17 before any network call, naming permissions id-token: write and the fork-PR limit. | Warn and continue (every later wp call then exits 77 far from the cause). | The error appears at the step that can name the fix. |
| D6 | Verifying tool-cache hits | The expected digest is the caller checksum, else a wp.sha256 record seeded from the verified archive; no expected digest means a miss and a verified download; a mismatch exits 16. | Trust unverified hits (status quo, flagged by the security review); re-download the archive on every hit (defeats the cache). | Detects corruption and image-baked binaries of unknown provenance; the README states honestly that only the checksum input is an independent trust root. |
| D7 | Reusable-workflow version and secret surface | Optional wp_version input, default 0.0.21, forwarded verbatim (setup-wp's exact-semver check is the only guard); optional wp_entitlement secret; id-token: write on the release and security jobs, which both run wp. | Keep 0.0.6 as the default (not installable by S); require the input (breaks callers at the pin bump); a separate guard step as in PR #60 (duplicates setup-wp's check); leave id-token off the release and security jobs (wp 0.0.23 cannot sign in there). | W can land before 0.0.23 exists, and consumers select the login-only version by input. The id-token grant is the only caller-visible change at the new pin, and 0.0.23 needs it anyway. |
| D8 | Delivery shape | Two PRs under this one blueprint: PR A (setup-wp, wave 1) yields S on main; PR B (workflow repin, wave 2) consumes S, yields W and completes the blueprint. | One PR whose workflows pin its own setup-wp commit (unreachable after squash merge, an opaque workflow-file error for every caller). | The repository's own pin-reachability rule. |
| D9 | PR #60 | Superseded: the wp_version idea is carried with an installable default; its formatter, tsconfig, guardrail and test-rename work is not; its .oxfmtrc.json and .gitignore are reused verbatim; PR #60 is closed with a pointer only after PR B merges. | Rebase and land PR #60 first (DIRTY, default 0.0.6 not installable by current setup-wp, unrelated scope); leave both open. | One owner for the workflow version input; no lifecycle record of PR #60 exists on main. |
| D10 | Verification boundary while 0.0.23 does not exist | Sign-in paths are proven by contract tests with a stub wp; the skip path is proven live in self-test against the published 0.0.21; a real 0.0.23 sign-in is proven by the consumer lanes after release. | Wait for 0.0.23 before landing (recreates the circular pin); a fake release in a mirror repository (tests a mirror, not the product). | Each claim is proven where it can be proven today; the remaining proof belongs to the lane that holds the real binary. |
| D11 | Promotion gate form | A wp format check of .github/actions/setup-wp/action.yml, enabled by the reused .oxfmtrc.json; the Bun suites are task verification and CI. | wp test --files on a Bun suite (the venue runs Vitest and cannot resolve bun:test); an all-deferred dossier (leaves delivery no executable row). | The only admitted executable row this Bun-native repository can run. |

### Promotion Gates

| Gate | Command | Expected outcome | Last result |
| --- | --- | --- | --- |
| setup-wp action formatting | wp format --check --files .github/actions/setup-wp/action.yml | pass | pass at 2026-11-17T20:24:47.119Z [command c20f9b3a20a43a4c] |

### Residual Unknowns

None.
