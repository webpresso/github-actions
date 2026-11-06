# Independent Opus review: setup-wp install-archive change (PR #61)

Verdict on the current head (`7c0a7b7`): **APPROVE-WITH-NITS**, no blockers.

- Subject: branch `fix/setup-wp-install-archive` of webpresso/github-actions, diff against `origin/main`
- Date: 2026-11-06
- Why it exists: this repository has no review-gate ledger, and `setup-wp` installs the `wp` binary into every consumer's CI and verifies it, so it is a supply-chain trust surface.
- Reviewer: `claude-opus-5-5`, an explicit model id, run as a headless read-only CLI child so the harness's model-alias map cannot substitute another model. Exact command, with the prompt supplied on stdin from a file that holds the repo path, the diff base, the five checks and the report shape:

      claude -p --model claude-opus-5-5 --permission-mode plan < review-prompt.md > review-output.md

  The prompt gave the reviewer no author conclusions beyond what the previous round had found.
- Earlier review, disclosed: before these rounds, a read-only reviewer subagent ran on the earlier head (`b823faf`) through the Agent tool's `sonnet` alias, because the `opus` alias resolved on this machine to a model that returned HTTP 404. The resolved model id of that run is not recorded by the harness. It returned APPROVE-WITH-NITS and is superseded by the rounds below. It is kept only for the record in `2026-11-06-setup-wp-install-archive.md`.

## Rounds (reports are committed verbatim, unedited)

| Round | Head | Verdict | Report |
| --- | --- | --- | --- |
| 1 | `2d9f17c` | REJECT: one blocker, bsdtar lists a sized ustar hardlink as a regular file so it passed the type filter and extraction left a hardlink in the stage | `2026-11-06-setup-wp-install-archive-opus-round1-reject.md` |
| 2 | `7c0a7b7` | APPROVE-WITH-NITS: the blocker is judged fixed; the reviewer also ran the three test files on macOS (58 pass) and listed real release archives to confirm the new checks refuse none | `2026-11-06-setup-wp-install-archive-opus-round2-approve-with-nits.md` |

A first attempt at round 2 printed only a closing sentence to stdout (the report stayed in the conversation, which a headless run does not capture), so it was discarded and re-run once with an explicit instruction to put the complete report in the final message. Its verdict was the same.

## Author disposition

No blockers remain. Round 2's six nits are accepted as follow-up work and are not fixed in this change: the unreachable line-count check, the vacuous opt-in ordering assertion in `test/setup-wp.test.ts`, the broken formatting line in `test/setup-wp-current-information.test.ts`, the missing cache-hit-with-`package-root` tests, `--no-same-owner --no-same-permissions` on extraction, and a release-producer note to dereference hardlinks when packing. Merge is held by the release coordinator until the 0.0.17 asset layout is on `main`.
