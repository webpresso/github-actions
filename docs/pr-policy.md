# PR Policy

`.github/workflows/pr-policy.yml` is the shared `PR Policy` workflow for the
`webpresso` organization. An organization `workflows` ruleset requires it from
`refs/heads/main` of this repository. It runs the released, checksum-pinned `wp`
binary (see the version and SHA-256 in the workflow) against the pull request,
checked out as inert data.

It triggers on `pull_request` and on `merge_group` (`checks_requested`). A merge
group event has no pull request payload, so the PR number is parsed from the
queue ref `gh-readonly-queue/<base>/pr-<N>-<sha>` and the live PR is read from
the API; anything unprovable fails the job.

## Tiers

The tier is the repository's `webpresso-governance` custom property, read with
`GITHUB_TOKEN`.

| Value | Gates | Outcome |
| --- | --- | --- |
| `full` | `wp pr validate-description` and `wp audit blueprint-pr-coverage` | Both must pass |
| `guarded` | `wp pr validate-description` only | Must pass |
| `off` | None | Succeeds, with the reason "not governed" |
| missing | None run | Fails closed, naming the property |
| unknown (including `self`) | None run | Fails closed, naming the property and value |

`self` repositories run their own source-built policy and are excluded from the
`workflows` rule, so reaching this workflow with `self` is a misconfiguration.

## Replay expectation

Replaying the last four merges of each repository below must reproduce this
table. Coverage verdicts were measured on 2026-10-22 with the released `wp`
0.0.13. `fundraising` is excluded: it has no merged PRs, and its history is
direct pushes, which the base rules now forbid.

| Repository | Level | Coverage failures in last 4 merges | Expected PR Policy outcome on those merges |
| --- | --- | --- | --- |
| framework | full | 1 | 1 blocked |
| github-actions | full | 2 | 2 blocked |
| monorepo | full | 2 | 2 blocked |
| aksaprocess.tr | guarded | 4 (coverage not run) | 4 blocked: disclosure failed on #65 to #68 (no AI/model fields) |

## Auto-merge sweeper

`.github/workflows/auto-merge-sweeper.yml` arms squash auto-merge on eligible
pull requests in `full` and `guarded` repositories, as the Webpresso Internal
App. Logic and contract: `.github/scripts/auto-merge-sweeper.mjs`.

An open PR is armed only when all of these hold:

- it is not a draft and targets the repository's default branch;
- its head branch is in the same repository (never a fork);
- its author's effective permission is `write`, `maintain` or `admin`, read from
  `GET /repos/{owner}/{repo}/collaborators/{user}/permission` (an unreadable
  permission means it is not armed);
- it does not carry the `webpresso:no-automerge` label (a PR with more than 100
  labels and no opt-out label among the first 100 is not armed);
- auto-merge is not already enabled.

At most 3 PRs per repository are newly armed per sweep, oldest first. PRs that
already have auto-merge enabled do not count, so stuck armed PRs never block
newer ones. A PR whose checks have already passed is refused by GitHub (clean
status) and is not merged by the sweeper: each tick logs a `::notice::` naming
it, and it needs a manual merge. A refusal GitHub gives for
the PR or repository (clean status, auto-merge not allowed, conflicts) is logged
as a skip, not an error, and the next candidate takes the slot. A repository
with more than 500 open PRs logs a warning, because only the oldest 500 are read.

The sweeper ships off. Scheduled sweeps run only when the org variable
`WP_AUTO_MERGE_SWEEP` is `on`; unset, empty or any other value means stopped.
Create it as `off` before merging, and set `on` only once CI capacity is clear.
A `workflow_dispatch` run takes a `repository` input (`owner/name`, in this
organization), arms only that repository and ignores the org switch. Dispatch
is accepted only from `refs/heads/main`. Add `dry_run` to plan without arming.

Eligibility is checked when a PR is armed, once. Auto-merge stays armed if the
author is later demoted, a label is added, or someone pushes to the head
branch; disarm by hand. Bot authors (such as `dependabot`) have no readable
collaborator permission, so they are never armed; arming Webpresso App PRs is
deferred.

Local dry run against a fixture, with no network:

```sh
SWEEP_FIXTURE=test/fixtures/auto-merge-sweep.json SWEEP_OWNER=webpresso SWEEP_SWITCH=on \
  node .github/scripts/auto-merge-sweeper.mjs
```

## Org rulesets

Record every ruleset id this workflow depends on here when the org baseline is
applied.
