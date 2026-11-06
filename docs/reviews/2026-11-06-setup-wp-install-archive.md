# Independent review: setup-wp install-archive change

- Subject: branch `fix/setup-wp-install-archive`, diff against its merge base with `origin/main`
- Reviewer: a fresh read-only reviewer agent, run through the `sonnet` model alias (the harness accepts aliases only; the resolved model id is not recorded by the harness). It was given the repository path, the diff base and five questions, and none of the author's conclusions.
- Date: 2026-11-06
- Why it exists: this repository has no review-gate ledger, and `setup-wp` installs the `wp` binary into every consumer's CI and verifies its digest, so it is a supply-chain trust surface.

Verdict: APPROVE-WITH-NITS

## Reviewer report (verbatim)

The action never extracts or runs anything before it checks the archive's sha256 against its sidecar, and it has no old asset names, API calls, tokens or python. Its weakness is that the sidecar is not an independent trust root. The extraction step has no hardening of its own. The three test files pass (25 pass, 0 fail). The contract suite is missing tests for the missing-sidecar and field-mismatch failures and for the ordering of verify and extract.

### 1. Verify before extract: yes

- The sha256 comparison is at `action.yml:141-146` and exits 8 on any mismatch. The first `tar -xzf` is at `:150`, and nothing else touches the archive before it.
- `bin/wp` is copied at `:160` and `package-root` is moved at `:202`, both after the extract.
- The test at `test/setup-wp-archive-contract.test.ts:199-204` checks exit 8, the error text and that no `wp` was installed. It would still pass if the verify moved after the extract, because the step would exit before the copy either way. So it does not prove the ordering.

### 2. Digest source: it is not the archive, but it is not independent either

- The digest comes from `wp-<target>.tar.gz.json` (`:116`, `:141`). Both files are fetched from the same `${base_url}` and `v${WP_VERSION}` (`:117`, `:122-128`).
- The `archive`, `version` and `target` fields must equal the expected values (`:131-139`, exit 7). This blocks swapping in another release's or another target's pair.
- Archive-only attacker: loses, because the sha256 mismatches.
- Sidecar-only attacker: loses, because the archive's real digest will not match a forged one.
- Attacker who controls the release repo, or a mirror set through `release-repo`: wins by publishing both files, since the sidecar adds integrity but no authenticity.
- The optional `checksum` input (`:163-170`) is the only independent anchor. It is checked against the extracted `bin/wp`, not the archive, and it does not cover `package-root`. The README and description should say this plainly.
- A tool-cache hit (`:87-95`) installs a binary that is never verified. This is documented as runner-provisioned. With `package-root: true`, the archive is still downloaded and verified, but the cached binary stays unverified.

### 3. Extraction safety: nothing in the action defends it

- `tar -xzf … -C stage` (`:150`) has no `--no-same-owner`, no entry listing or filtering, and no rejection of links.
- It relies on the default behaviour of GNU tar and bsdtar, which strip absolute paths and refuse `..`. Their behaviour on symlinks and hardlinks differs between the two.
- The archive's digest is checked first, so only a validly published malicious archive can exploit this. Two concrete cases:
  - If `package-root` is a symlink to an arbitrary path, then `mv` (`:202`), the `-d catalog` check (`:206`) and `npm install --prefix` (`:226`) all follow it. That writes outside the install directory.
  - If `bin/wp` is a symlink, `cp` (`:160`) copies the target's contents into the installed binary.
- No test covers any of this. The fixture is a plain `tar -czf`.

### 4. Missing or malformed sidecar: fails with a named error, never continues

- A failed download exits 6 with a named error (`:124-127`).
- A missing or empty field fails with exit 7 (`:135-138`). An empty sha256 fails with exit 8 (`:143`). Under `set -euo pipefail`, nothing continues.
- There is no test for exit 6 (missing sidecar) or exit 7 (field mismatch or malformed JSON). The contract suite only exercises exit 8.

### 5. Fallbacks, API, token, python: none

- A search for old asset names, `api.github`, `GITHUB_TOKEN`, `gh api`, `python` and `token` found only prose such as "no token" and "no python". The README lines 128 and 167-197 are unrelated sections.
- The one remote install is `npm install --omit=dev --ignore-scripts` at `:226`. It is not a binary fallback. It is non-fatal and runs untrusted dependency resolution from the network; it is only warned on (`:230`).

### Contract test strength

- The checks that would fail if removed:
  - Download URL list: each target is tested, and the list must equal exactly the two URLs.
  - sha256 mismatch: tested.
  - Missing `catalog`: tested.
  - Checksum input mismatch: tested.
- The checks that would not:
  - The ordering of verify and extract (see point 1).
  - The sidecar field checks for `archive`, `version` and `target` (not tested).
  - Download failure exit 6 (not tested).
  - `bin/wp` missing, exit 9 (not tested).
  - `package-root` missing, exit 11 (not tested).
- One test would pass vacuously. "pins the supported targets" (`:146-156`) only greps the action's source text.

### Findings (no blockers)

1. **Nit: no extraction hardening or tests** (`action.yml:150`, `:160`, `:202`)
   - Trigger: a validly published archive whose `package-root` or `bin/wp` is a symlink.
   - Impact: writes outside the install directory, or an arbitrary file copied in as `wp`. Exploiting it needs a compromised release, but then the sidecar gives no protection.
   - Fix: check `tar -tzvf` for entries that are not regular files or directories, or have `/` or `..` paths. Add `[[ -L ]]` guards on `bin/wp` and `package-root`. Add a hostile-archive fixture test for each.

2. **Nit: the sidecar is not an independent trust root** (`:117-146`, README line 51)
   - Trigger: a compromised release repo, or a `release-repo` mirror.
   - Impact: both files are attacker-controlled and the install proceeds. The wording "verified" overstates the guarantee.
   - Fix: say so in the description and README. Recommend pinning `checksum`, and consider making it cover the archive.

3. **Nit: `json_field` is a greedy sed over text** (`:106-108`)
   - Trigger: a sidecar with duplicate or nested keys.
   - Impact: it matches the last key on a line, so it is fragile. It fails closed and only the sidecar's own publisher can influence it.
   - Fix: parse with `jq`, which is present on hosted runners, or accept the fragility and document it.

4. **Nit: test gaps** (`test/setup-wp-archive-contract.test.ts`)
   - Missing tests: exit 6 (missing sidecar), exit 7 (each field and malformed JSON), exits 9 and 11, and a spy proving no `tar` call happens before the verify.
   - The "pins" test (`:146-156`) is source-grep only.

## Author disposition

No blockers. All four nits are accepted as real. They are recorded as follow-up work on this branch before merge is considered; the merge itself is held by the release coordinator until the 0.0.17 asset layout is on `main`.
