---
type: blueprint
title: "Verified setup-wp"
status: draft
complexity: L
owner: "webpresso/github-actions"
created: "2026-08-23"
last_updated: "2026-08-23"
progress: "Repo-local plan refined; waiting for typed parent and exact upstream identities."
tags:
  - "release-install-consistency-program"
---

# Verified setup-wp

## Product wedge anchor

- **Stage outcome:** Workflows pin qualified action
- **Consuming surface:** GitHub CI
- **New user-visible capability:** Manifest/provenance setup with safe cache

## Summary

Correct docs, fixture candidate, qualify A, self-pin PR B, verify release B.

#### Task 1.1: Correct action/freshness info

**Status:** todo
**Wave:** Wave 1
**Depends:** None
**Produces:** actions-current-truth-merge-sha
**Consumes:** app-current-contract-merge-sha

Reject npm product freshness/stale version wording.

**Acceptance:**
- [ ] Docs/tests current.
- [ ] Merge SHA.

#### Task 2.1: Implement fixture candidate

**Status:** todo
**Wave:** Wave 2
**Depends:** Task 1.1
**Produces:** setup-wp-candidate-merge-sha
**Consumes:** release-manifest-v1-schema

Require release freeze/manifest/checksum/provenance/cache rehash/exact version+root; reject schema/duplicates/extras/poison.

**Acceptance:**
- [ ] Fixture matrix.
- [ ] PR A SHA.
- [ ] No self-pin.

#### Task 3.1: Qualify against A

**Status:** todo
**Wave:** Wave 3
**Depends:** Task 2.1
**Produces:** setup-wp-qualified-sha
**Consumes:** release-a-public-receipt

Live Linux/macOS/Windows cold/cache/poison/provenance.

**Acceptance:**
- [ ] Exact A/root.
- [ ] Fatal failure.
- [ ] Qualified SHA.

#### Task 4.1: Self-pin workflows

**Status:** todo
**Wave:** Wave 4
**Depends:** Task 3.1
**Produces:** actions-self-pin-merge-sha
**Consumes:** release-a-public-receipt

PR B updates old SHAs/0.0.6/npm freshness.

**Acceptance:**
- [ ] Full SHA/A.
- [ ] Self-tests/merge.

#### Task 5.1: Verify B

**Status:** todo
**Wave:** Wave 5
**Depends:** Task 4.1
**Produces:** setup-wp-b-verification
**Consumes:** release-b-public-receipt

Run B cold/cache/provenance.

**Acceptance:**
- [ ] Exact B.
- [ ] Poison rejected.
- [ ] Receipt.

## Trust Dossier

### Readiness Verdict

- promotion-ready: false
- unresolved-count: 1
- verified-at: 2026-08-23
- trust-gate-version: v1

### Material Claims

| ID | Claim | Evidence |
| --- | --- | --- |
| C1 | Current action has optional checksum, unhashed cache and old self-pins. | Pinned action/workflow audit. |

### Material Decisions

| ID | Decision | Chosen option | Rejected alternatives | Rationale |
| --- | --- | --- | --- | --- |
| D1 | Rollout | Candidate, A qualification, self-pin. | Simultaneous mutable change. | Self-reference needs landed SHA. |

### Promotion Gates

| Gate | Command | Expected outcome | Last result | Defer |
| --- | --- | --- | --- | --- |
| Bounded repository readiness | wp format --check | Read-only format gate passes in the exact owner worktree after typed-parent artifacts arrive. | Waiting for parent Tasks 0.0.1-0.0.3. | pre-implementation |

### Residual Unknowns

Typed parent and exact upstream artifact identities must exist before this child starts; no internal design choice remains.
