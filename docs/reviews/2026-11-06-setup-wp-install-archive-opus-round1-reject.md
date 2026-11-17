**Summary.** The order is right. The archive sha256 is checked (`action.yml:147-152`) before anything is extracted. Both listings (`:164-165`) run on that verified file, and the only `tar -x` comes after them (`:197`). The expected digest comes from the separate sidecar, and its `archive`, `version` and `target` fields are compared exactly (`:137-145`). A missing sidecar fails with exit 6, and a malformed or empty one with exit 7. There is no fallback to the old bare asset names, no API call, no token and no python. The README and action description now state the trust boundary honestly. The hardening has one real gap. The type filter reads only the first character of the `tar -tv` line (`:187-195`). On bsdtar, the tar on the macOS runners, a ustar hardlink entry with a non-zero size field is listed as `-rw-r--r-- … name link to target`. So it passes as a regular file, and extraction leaves a hardlink behind. I confirmed this on this machine (bsdtar 3.5.3, libarchive 3.7.4) by piping an in-memory archive into `tar -tvf -`, with no files written. The line was `-rw-r--r--  0 0  0  0 Jan  1  1970 package-root/evil-hard link to bin/wp` and the exit code was 0. The post-extraction `-L` check (`:199-204`) cannot see hardlinks. libarchive's default secure flags still refuse absolute and `..` link targets, so I found no write outside the stage directory. But your blocker definition counts "leave a link behind". I did **not** run `bun test`: plan mode is active in this session and the suites create temp directories, which counts as a write. My judgments about which tests would bite come from reading the tests and from the bsdtar probe above.

Verdict: REJECT

**Findings**

1. **blocker: bsdtar lists a sized hardlink as a regular file, so it passes the filter and is extracted as a link**
   - **File:** `.github/actions/setup-wp/action.yml:187-195` (and `:199-204`)
   - **Trigger:** The runner is darwin-x64 or darwin-arm64, which use bsdtar. The archive holds a typeflag `1` entry whose size field is greater than 0. In ustar the body can be omitted, because libarchive ignores the size for non-pax archives, so the listing stays clean and exits 0. libarchive sets the file type to regular when the size is above 0, and `archive_entry_strmode` then prints `-`. GNU tar always prints `h`, so Linux runners are not affected.
   - **Impact:**
     - `tar -x` creates a real hardlink in the stage, for example `package-root/evil-hard` sharing an inode with `stage/bin/wp`.
     - `mv` (`:256`) carries it into `WEBPRESSO_PACKAGE_ROOT`. With pax "hardlink with data", the entry's body is written through the link into the target's inode.
     - The targets stay inside the stage, because libarchive refuses `..` and absolute hardlink targets by default. So nothing is written outside, but the "no link left behind" promise in the README and in the code comment at `:155-160` is false on macOS.
     - The link target name is never validated by the action itself (`tar -t` prints only the entry name), so containment rests entirely on tar's defaults.
     - The existing hardlink test (`test/setup-wp-archive-contract.test.ts:376`) uses size 0, which both tars list as `h`, so it does not cover this case.
   - **Fix:** Add a check after extraction and before any use that does not depend on parsing listing text. Refuse if `find "$stage" ! -type f ! -type d -print -quit` or `find "$stage" -type f -links +1 -print -quit` prints anything, and exit with a named error. Also refuse kinds lines matching ` link to ` or ` -> ` as an early fail-closed check. Add a test with a sized hardlink entry that must be refused on both tars. Run the hostile suite on a macOS runner too: today the Linux CI only exercises GNU tar.

2. **nit: the line-count "ambiguous listing" check can never fire, and exit 15 is untested**
   - **File:** `action.yml:164-172`
   - **Trigger:** An entry name containing a newline.
   - **Impact:** GNU tar (default escape quoting style) and bsdtar (`safe_fprintf`) both print control characters as escapes, so the two listings always have the same number of lines. The guard is harmless but gives false comfort. Neither exit 13-ambiguous nor exit 15 (cannot list) has a test.
   - **Fix:** Keep the check if you like, but rely on the post-extraction `find` from finding 1 as the real backstop. Add a truncated or corrupt archive test for exit 15.

3. **nit: the README cache-hit statement is inaccurate when `package-root: true`**
   - **File:** `README.md` (the "a version-directory tool-cache hit skips both the download…" line) vs `action.yml:93-101`, `:206`
   - **Trigger:** A tool-cache hit with `package-root: true`.
   - **Impact:** The archive is still downloaded and extracted. Then `package-root/` comes from the verified archive while `wp` comes from the unverified cache, and `checksum` is ignored. This was already the case before this PR, but the doc now misdescribes it.
   - **Fix:** Reword the line. Optionally, on a cache hit, compare the cached `wp` against the archive's `bin/wp` (or against `checksum`).

4. **nit: a pinned `checksum` is skipped on a tool-cache hit, which allows cache poisoning on persistent self-hosted runners**
   - **File:** `action.yml:93-101`, `:230-236`
   - **Trigger:** Job A runs without `checksum`, or from a mirror, and seeds `${RUNNER_TOOL_CACHE}/wp/<ver>`. Job B on the same self-hosted runner pins `checksum`.
   - **Impact:** Job B runs job A's binary without verifying it. This predates the PR and is documented, but the README now recommends pinning `checksum` "for high-assurance installs", and on such runners the pin is silently skipped.
   - **Fix:** When `checksum` is set, verify the cached binary against it too, or skip the cache entirely.

5. **nit: a weak test that does not assert the exit status**
   - **File:** `test/setup-wp-archive-contract.test.ts:400-406`
   - **Trigger:** It checks only the message text.
   - **Impact:** It would still pass if the refusal message were printed but the script went on. Its case is also covered by the loop at `:383-398`, so it adds little.
   - **Fix:** Add `toBe(13)` and the empty-stage assertion, or delete the test.

6. **nit: hostile cases with no test**
   - **File:** `test/setup-wp-archive-contract.test.ts:374-381`
   - **Trigger:** The hostile list stops at six cases.
   - **Impact:** These cases are untested: a fifo (`p`) and a block device, a bare `..` entry, a `./../x` entry, a pax `path=` override, a GNU long-name traversal, a name containing ` -> ` or ` link to `, and the sized hardlink from finding 1.
   - **Fix:** Add them to the table, with the expected exit 13 and an empty stage.

**Answers to your questions:**
1. Yes, on both counts. The sha256 check is at `:147-152`, the listings at `:164-165`, and the first `tar -x` at `:197`. The test at `:423-435` proves it with a recording tar stub: no tar call at all on a digest mismatch, and listing before extraction.
2. Mostly yes.
   - An attacker who controls only the archive loses (exit 8). One who controls only the sidecar also loses: the digest must still match the real archive. One who controls both wins, through a compromised release repo or a hostile `release-repo` mirror. A pinned `checksum` stops that for `bin/wp`, but not for `package-root/`, whose code `wp` then loads, and not on a cache hit (finding 4).
   - The description (`:8-12`), the `checksum` input doc (`:28-33`) and the README state this without overclaiming. The exceptions are the hardlink claim (finding 1) and the cache-hit line (finding 3).
   - The `json_field` sed takes the first match and is not a real JSON parser. It fails closed through the exact-match comparisons, which is acceptable.
3. Absolute paths and `..` segments (including nested ones and `.` segments) are caught by `case "/${entry}/" in */../*` (`:173-186`). Escaping of odd bytes cannot hide a literal `..`. Very long paths are listed in full and get the same checks. On time-of-check versus time-of-use: the archive sits in `RUNNER_TEMP` and nobody else writes it during the step, and gzip decompression is deterministic, so I see no practical gap. Case and Unicode tricks cannot produce a `..` component. Symlinks and devices show up as `l`, `c`, `b` or `p` on both tars and are refused. The remaining hole is the bsdtar sized hardlink (finding 1).
4. Yes. A missing sidecar exits 6 (`:130-133`), as tested at `:320`. A malformed or empty one exits 7 (`:141-144`), as tested at `:337-347`. An empty `sha256` field exits 8 (`:149`).
5. None. The only "python" and "token" strings are in prose comments and messages, and the tests at `setup-wp.test.ts:76-83` and `:169-185` assert there is no API call, no token and no `python3`.

**Would each hostile test fail if its check were removed?** I judged this by reading the tests, not by running them:
- Symlink, hardlink (size 0) and device: yes. Without the check, extraction succeeds or `mknod` fails, so the exit code is not 13 and the stage is not empty.
- `../` and nested `../`: yes. tar refuses or strips the entry with a different exit code.
- Absolute path: yes. tar strips the leading `/` and writes into the stage.
- The post-extraction symlink tests at `:408-420`: yes, they use planting stubs.
- None of them passes vacuously except the weak message-only test (finding 5) and the unreachable line-count path (finding 2).
