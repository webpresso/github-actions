# Resume condition (parked 2026-08-10)

Parked during multi-host residual recovery. Implementation is ~99% complete; remaining open item is **caller production proof**.

## Resume when

1. A caller repo (app or monorepo) runs production deploy/smoke against the shared setup + OIDC workflows with evidence.
2. Cross-repo dependency formerly noted as a local path to agent-kit e2e secrets supervisor is re-expressed as a proper `{repo, slug, require_status}` dependency or dropped as obsolete.
3. Exclusive managed worktree owns the branch; do not leave this as `in-progress` without an active executor.

## Park rationale

No exclusive active execution this session; false in-progress ledger blocked residual-recovery terminal disposition.
