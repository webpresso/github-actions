# Errata: correct-setup-wp-current-information

Out-of-band, append-only corrections for a completed/archived blueprint.

This file lives outside the owning blueprint's own folder on purpose, and
the review subjects treat it differently:

- The PLAN subject hashes only the owning blueprint folder
  (`src/review/subject.ts`), so appending here cannot invalidate a plan
  approval.
- The DELIVERY subject (`wp-git-source-v5`) is source-scoped, so the
  outcome of an append here depends on this erratum's own path:
  - when this erratum's path is non-source for it
    (`src/review/source-scope.ts`), an append does not move that subject
    and a delivery approval recorded under it still binds;
  - when that path is source-scoped, an append moves that subject and the
    recorded approval stops binding.
- Which branch applies is a property of this erratum's own PATH, not of
  any literal prefix and not of whether the root was configured: a
  configured blueprint root (`.webpressorc.json#blueprintsDir`) can place
  this erratum on either side of the scope boundary - at a source-scoped
  path, where the v5 subject moves, or at a non-source one, where it does
  not. Check the path's own scope before relying on either branch.
- The LEGACY whole-tree delivery subject (`wp-git-diff-v4`) does hash this
  file, so an append moves it. It is only a read-side accepted
  alternative, so a v4 record from before the switch can be stranded by
  the append even when, on the non-source branch above, a current
  `wp-git-source-v5` approval is not.

The erratum is still supplied to the reviewer as evidence at the reviewed
SHA, so appending it does not make the correction invisible.

See `catalog/agent/rules/pre-implementation.md`.

## 2026-11-01 — claude

**Section:** Material Claims

Retired evidence: repo:.github/workflows/webpresso-freshness.yml -> repo:.github/workflows/changesets-release.yml
Retired evidence: repo:test/freshness.test.ts -> repo:test/setup-wp.subprocess.test.ts

The freshness scanning surface (workflow and focused suite) was removed from
this repository by the PR #57 deletion lane (merged 2026-10-30). The claims
that cited those files describe the surface as it existed at refinement time;
the surviving reusable-workflow contracts and the setup-wp executable-lock
suite are the retained authority for the claims that still apply.

## 2026-11-01 — claude

**Section:** Material Claims

Retired evidence: repo:test/workflow-shape.test.ts -> repo:test/workflow-shape.subprocess.test.ts
Retired evidence: repo:test/setup-wp-current-information.test.ts -> repo:test/setup-wp-current-information.test.ts

The subprocess-in-unit-lane classification renamed the process-spawning suites
(the workflow-shape and setup-wp contracts now live in *.subprocess.test.ts);
the citations track the renamed files.

## 2026-11-02 — codex

**Section:** Historical evidence and Material Claims

This correction controls the contradictory 2026-11-01 Material Claims entries above. The normalized `__wp-lifecycle-status__` placeholders in historical subject snapshots are intentional reviewed-content normalization, not invalid lifecycle statuses. Preserve those snapshots and all ledgers as historical evidence. Historical verification commands retain the filenames actually recorded at execution; a current test-suite rename is navigation, not retroactive execution or proof that a renamed command ran.

Git deletion commit 778dea1 (2026-10-30, PR #57; preceded by 766bdc5) removed the freshness workflow and focused suite. Their historical claims and receipts remain evidence of that retired scanner, not current behavior. The earlier mappings to the Changesets workflow and setup-wp subprocess suite do not establish semantic equivalence and are retracted. No successor is asserted for those deleted freshness surfaces. The workflow-shape and setup-wp suite renames may help locate current files but do not replace historical evidence or establish identical behavior; the earlier self-mapping of setup-wp-current-information does not document a rename. Read current source for current behavior.
