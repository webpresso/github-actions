Summary: the PR head addresses the previous blocker. The archive sha256 is checked against the sidecar (`action.yml:156-161`) before any `tar` call. Both listings run on that verified file (`:173-174`) before the only extraction (`:214`). The listing check now refuses any line with a ` link to ` or ` -> ` annotation (`:199-204`) before it looks at the first character. That catches the sized ustar hardlink that bsdtar lists as `-rw-r--r-- … link to …`, and GNU tar's `h…` lines. After extraction there is a second check: `find` for any non-file, non-directory entry and for any file with more than one link (`:225-232`). It runs before the stage is used at all: before `cp` (`:242`), `mv` (`:284`), the catalog check (`:288`) and `npm install` (`:308`). I listed the two cached real release archives (0.0.15 darwin-arm64 with 3,623 entries, and a second cached archive with 5,135). Every entry starts with `-`, and none carries a ` link to ` or ` -> ` annotation, so the new checks do not refuse a real release today. The old bare asset names, the GitHub API, tokens and python are all gone. A pinned `checksum` is now checked on a tool-cache hit, failing with exit 16, and the README now describes `package-root: true` on a cache hit correctly. I ran `bun test test/setup-wp-archive-contract.test.ts test/setup-wp.test.ts test/setup-wp-current-information.test.ts` from the checkout on macOS (bsdtar): 58 pass, 0 fail, 323 expect() calls. `gh pr checks 61` shows 6 passed and 0 failed; I did not confirm those runs are on the current head SHA or which runner OS they use. What remains are test-quality and hygiene nits. I found no blockers.

Verdict: APPROVE-WITH-NITS

**Answers to the five questions**

1. **Is the sha256 verified before anything is extracted? Yes.**
   - Sidecar fields `archive`, `version` and `target` must match or the run exits 7 (`action.yml:146-154`).
   - An empty or mismatched sha256 exits 8 (`:156-161`).
   - Only after that are the archive names listed (`tar -tzf`, `:173`) and the entry types listed (`tar -tzvf`, `:174`), then checked (`:182-212`). The first `tar -x` is at `:214`.
   - Two tests prove the order. "verifies the archive sha256 before any extraction call" (`test/setup-wp-archive-contract.test.ts:512-516`) shows no `tar` call at all on a sha mismatch. "lists the archive before the first extraction call" (`:518-524`) shows both `-t` calls come before `-x`.

2. **Can a link, device, fifo or other non-regular entry survive into the stage or `WEBPRESSO_PACKAGE_ROOT`? No, on both tars.**
   - **First line of defence, before extraction:** the annotation check (`:199-204`) plus the first-character allow-list of `-` and `d` (`:205-211`).
     - bsdtar always prints ` link to ` for a hardlink and ` -> ` for a symlink.
     - GNU tar prints `h`, `l`, `c`, `b` or `p` as the first character, and `?` or `V` for odd entry types. Unknown typeflags that bsdtar shows as `-` are extracted as regular files.
     - A name cannot hide the annotation, because the annotation is appended after the name. Both tars escape newlines in names, so a name cannot add a fake line either.
   - **Second line of defence, after extraction:** `find "${stage}" ! -type f ! -type d -print -quit`, then `find "${stage}" -type f -links +1 -print -quit` (`:225-228`).
     - GNU find and BSD/macOS find both support `-type`, `-links +1`, `-print` and `-quit` with the same meaning.
     - The only argument is `${stage}`, an absolute path the action controls, so names with leading dashes, spaces or newlines are never parsed. They only end up in the error message.
     - A hardlink to an inode outside the stage also has a link count of 2 or more, so it is caught too.
     - If `find` itself fails (for example, an unreadable directory when running as non-root), `set -e` stops the step. That fails closed, but without a named error.
   - **Ordering:** the symlink check (`:216-221`) and the `find` checks (`:225-232`) run before any use of the stage.
   - **Wrongful refusal of a real release:** any hard-linked file in a future release will now be refused. That is fail-closed and fine. Today's real archives contain only `-` entries, so nothing is refused now. If the release builder ever packs a pnpm or hardlinked tree, the build must dereference links (for example GNU `--hard-dereference`).

3. **Path traversal and odd names fail closed with a named error.**
   - Absolute paths are matched by `/*` (`:184-187`).
   - `..` is matched as `*/../*` on `/${entry}/` (`:189-193`). That covers a bare `..`, `a/..`, `./../x` and `bin/../../x`.
   - The listing escaping on both tars only adds characters, so it cannot hide a real `/../`.
   - A pax `path=` override is checked through the listed effective name (test `:416-420`).
   - A legitimate name containing ` -> ` or ` link to ` is refused with exit 13 and a named error. That is a deliberate false positive, and it is tested (`:421-422`).
   - The name and type listings are each swept completely, so a disagreement between them cannot let an entry through. The extra line-count check (`:178-181`) is in effect unreachable; see the first nit.
   - Both tars also refuse `..` and strip a leading `/` on extraction, which is a further layer of defence.

4. **Sidecar failures, the cache hit, and the README.**
   - A missing sidecar makes `curl -f` fail with exit 6 (`:137-143`, test `:346-351`).
   - A malformed or empty sidecar fails the `archive` field check with exit 7 (test `:363-373`).
   - An empty `sha256` field exits 8 (`:158`).
   - On a cache hit with `checksum` set, the cached binary is hashed and a mismatch exits 16 before anything is written to `GITHUB_PATH` (`:105-112`). Tests `:490-503` cover both the match and the mismatch.
   - With `package-root: true` on a cache hit, the archive is still downloaded, verified and extracted, and only `bin/wp` installation is skipped (`:115-117`, `:234`). The README now says exactly that: `package-root/` comes from the verified archive and `wp` comes from the cache. That is accurate.
   - Remaining gap: without `checksum`, a cached `wp` is trusted as provisioned. This is documented, not a defect.

5. **Old asset names, API, tokens, python, and the re-pinned hash.**
   - `action.yml` has no `wp-linux-x64`, `wp-darwin-arm64` or `wp-package-root.tgz` names and no fallback path. It has no `api.github.com`, no token input or env, and no python3; the sidecar is parsed with `sed` (`:121-123`).
   - `test/setup-wp.test.ts` still asserts no `api.github.com`, no python3, and the exact env key set.
   - Re-pinned hash (`test/setup-wp-current-information.test.ts:14`): it still hashes the whole action minus descriptions (`:111-118`). The re-pin follows from the intended code change and does not narrow what the hash covers.
   - The surrounding assertions were adapted rather than weakened:
     - M2 now asserts all four targets and their `wp-<target>.tar.gz` README entries, plus `.tar.gz.json` and `package-root/`.
     - M3 now anchors the checksum-ordering check on the cache-miss `sha256_of "${install_dir}/wp"`. This is needed because `WP_CHECKSUM` now first appears in the cache-hit branch.
     - M4 now slices from `package_root="` to the end, and still pins the export list and `exit 12`.
     - One assertion did become weaker: the opt-in ordering check in `setup-wp.test.ts`; see the second nit.

**Per-test judgement** (would each hostile test fail if the check it names were removed?)

- **Symlink** (`:402`): yes. If either check is removed, the other still gives exit 13. If both are removed, the run exits 14, not 13.
- **Zero-size hardlink** (`:403`): yes on both tars (`h` first character on GNU tar, ` link to ` on bsdtar).
- **Sized hardlink** (`:404-408`): yes on bsdtar. Without the annotation check, the post-extraction `find` gives exit 14, not 13, so the test fails. On GNU tar the `h` check catches it anyway, so on Linux this test does not isolate the annotation check.
- **Character device and block device** (`:409-410`): yes. Without the first-character check, a non-root `mknod` fails and `tar` exits with 1 or 2, not 13.
- **Fifo** (`:411`): yes. Without the listing check, `find` catches it with exit 14, not 13.
- **`../`, nested `../`, bare `..`, `./../`, pax path** (`:412-420`): yes. Removing the `*/../*` case lets extraction proceed, or makes tar refuse with its own exit code, not 13.
- **Names containing ` -> ` or ` link to `** (`:421-422`): yes. Without the annotation check, the install succeeds with exit 0.
- **Absolute path** (`:423`): yes on bsdtar. On GNU tar it depends on whether `tar -t` prints the leading `/`. CI is green, which suggests it does, but I did not confirm the CI runner's OS.
- **Exit 15, corrupt and truncated archives** (`:442-456`): yes. These close the earlier nit that exit 15 was untested.
- **Post-extraction hardlink and fifo** (`:458-470`, using a `tar` stub): yes. Removing either `find` gives exit 11, not 14.
- **Symlinked `bin/wp` and `package-root`** (`:472-484`): yes. They assert the exact `as a symlink` message.
- **Vacuous or weak tests:**
  - The `setup-wp.test.ts` opt-in ordering assertion is effectively vacuous; see the second nit.
  - "still skips verification on a cache hit when no checksum is given" (`:505-509`) only asserts that some text is absent.
- **Hostile cases with no test:**
  - The ambiguous-listing exit 13 at `:178-181`.
  - A cache hit combined with `package-root: true`.
  - A hardlink whose target is outside the stage (the classic write-through-hardlink case; it is caught by the same annotation and `h` checks).
  - A stage containing an unreadable directory.
  - Setuid or ownership bits when the action runs as root.

**Findings**

There are no blockers.

1. **nit — the line-count check is unreachable and untested.**
   - Where: `.github/actions/setup-wp/action.yml:178-181`, with the comment at `:168-169`.
   - Trigger: none in practice. GNU tar and bsdtar both escape newlines in names in `-t` and `-tv` output, so the two line counts always match.
   - Impact: dead code, and a comment that claims a protection the code does not actually supply. No security effect, because the per-line checks are already safe on escaped names.
   - Fix: delete the check and its comment, or keep it and add a test fixture that can actually trigger it.

2. **nit — the opt-in ordering assertion passes vacuously.**
   - Where: `test/setup-wp.test.ts`, in "is opt-in and off by default", at `expect(install.indexOf('"${WP_PACKAGE_ROOT}" != "true"')).toBeLessThan(install.indexOf("WEBPRESSO_PACKAGE_ROOT="))`.
   - Trigger: the first `!= "true"` match is the cache-hit branch at `action.yml:115`. So the test still passes if the real gate at `:271` is removed.
   - Impact: the default-off behaviour is guarded only by the behavioural test `setup-wp-archive-contract.test.ts:305`. That test does catch it, so this is not a gap in coverage.
   - Fix: use `lastIndexOf`, or assert on the substring from `package_root="` onward, or drop this assertion in favour of the behavioural one.

3. **nit — a broken formatting line will likely fail `format --check`.**
   - Where: `test/setup-wp-current-information.test.ts:84`, which contains `…/gu)]      .map((match) => match[1])`.
   - Trigger: any format check run over this file.
   - Impact: a hygiene problem only.
   - Fix: restore the line break before `.map`.

4. **nit — the cache-hit-without-checksum test is weak, and the cache hit with `package-root: true` is untested.**
   - Where: `test/setup-wp-archive-contract.test.ts:505-509`; `action.yml:115-117`, `:234`.
   - Trigger: a regression that, on a cache hit with `package-root: true`, overwrites the cached `wp` or skips archive verification would pass the suite.
   - Impact: the README claim that `package-root/` comes from the verified archive while `wp` comes from the cache is not proven by any test.
   - Fix:
     - In the existing test, assert `curlUrls` is empty and `WP_INSTALL_DIR` is the cache root.
     - Add a test for a cache hit with `packageRoot: true`. It should assert two downloads, an exported `WEBPRESSO_PACKAGE_ROOT`, a `PATH` entry pointing at the cache root, and no `webpresso-wp/wp`.
     - Add one with a bad sidecar sha, asserting exit 8.

5. **nit — running as root keeps archive ownership and mode bits.**
   - Where: `action.yml:214`, which runs `tar -xzf` with no `--no-same-owner` or `--no-same-permissions`.
   - Trigger: a container job running as root. GNU tar as root restores the archive's uid and gid and keeps setuid/setgid bits on files under `package-root/`.
   - Impact: low. The archive is already hash-verified, and an attacker able to change it could ship a malicious `wp` anyway. Still, it widens what a compromised release can drop on disk.
   - Fix: add `--no-same-owner --no-same-permissions`; both GNU tar and bsdtar accept these flags.

6. **nit — wrongful refusal is possible if the release ever includes hardlinks.**
   - Where: `action.yml:199-211`, `:227`.
   - Trigger: a future release packed from a tree with hardlinks, such as a pnpm store, produces hardlink entries.
   - Impact: every consumer's install fails closed with exit 13. That is safe, but it would be a fleet-wide outage. Today's archives have no hardlinks, as checked above.
   - Fix: add a note or check on the release-producer side (dereference hardlinks when packing), so the refusal never fires on a legitimate release.
