---
name: plan-refine
description: >-
  Refine a blueprint to 100% confidence: zero assumptions, code pinpoints,
  official docs, max parallel tasks
argument-hint: <slug>
allowed-tools: Read, Write, Edit, Glob, Grep, WebSearch, WebFetch
---

# Plan Refine (`/plan-refine`)

Refine a blueprint by applying the canonical plan-refine methodology to the actual file, not just reviewing it.

**Arguments**: `$ARGUMENTS`

## Usage

```bash
/plan-refine <slug>
/plan-refine customer-runtime-zero-legacy-confidence
```

## What This Command Does

Edits the canonical blueprint markdown (`blueprints/*/<slug>/_overview.md` for current generated plans, or legacy `blueprints/*/<slug>.md`) so the blueprint is:

- at **100% confidence**: zero material assumptions left standing
- fact-checked against **official/upstream docs at the latest or plan-pinned versions** (not blogs or model memory)
- **code-pinpointed**: every local claim has path + symbol evidence
- optimized for **elegance, durability, and efficiency** — not merely correct
- structured for **maximum** parallel execution via `/goal` (autopilot) or `ultragoal`
- explicit about risks, edge cases, and cross-plan dependencies

## Execution Protocol

### Step 1: Locate the blueprint

```text
blueprint_list({})
blueprint_get({"slug":"<slug>"})
```

If MCP is unavailable, use `find` against the source repository as a bounded
fallback. If no matching blueprint exists, stop and report that.

### Step 2: Load the canonical methodology

Read the host-visible `plan-refine` skill (`.agent/skills/plan-refine/SKILL.md`) and use it as the source of truth for refinement criteria.

### Step 3: Refine the blueprint end to end

Apply the methodology directly to the blueprint, persisting the resulting
whole-document replacement through `blueprint_put` with the current
`expected_version`.

Use `blueprint_put` for the mutation; do not edit lifecycle files or use a
shell replacement as the normal path.

Then apply the methodology directly to the blueprint. **Run steps 1–3 in parallel** when tools allow:

1. Technology fact-check (official, latest)
   - verify library, API, runtime, and platform claims against **official** docs for the **exact latest or pinned version**
   - record source URL + version; replace vague or unverified claims
2. Codebase verification (pinpoint)
   - confirm paths, package boundaries, exports, and signatures with **path + symbol** anchors
   - drop or rewrite any local claim you cannot pinpoint
3. Architecture review
   - concurrency, retries, error cascades, auth/session edges, platform limits
   - pick the most elegant, durable, efficient shape; reject heavier-but-working options in writing
4. Cross-plan alignment
   - verify referenced blueprints still exist and still support the stated dependency contract
5. Blueprint enforcement (max parallel)
   - split coarse tasks; add explicit dependencies; CP = 0 per wave
   - ensure TDD steps, exact files, exact commands, and verification steps are present
   - use t-shirt sizing only
   - prefer the repo's preferred database workflow (e.g. `db push` over migrations) when the repo has chosen one

### Step 4: Apply edits, do not stop at findings

Update the blueprint file directly instead of only producing a report.

Expected edits commonly include:

- rewriting tasks into smaller blueprint-format units
- fixing stale paths or APIs
- adding missing edge cases and risks
- tightening acceptance criteria
- adding cross-plan reference corrections
- replacing speculative language with verified statements

### Step 5: Validate the refined artifact

Read the refined blueprint through `blueprint_get`, then run the strict
blueprint lifecycle audit with `audit`.

If the refinement changes markdown structure enough to warrant a lint pass, run
the repository's markdown linter through its `wp`/`vp` facade against the
canonical blueprint markdown for that slug.

### Step 6: Report the outcome

Summarize:

- what changed in the blueprint
- what claims were corrected (with code pinpoints and/or official doc URL + version)
- confidence status (ready only when residual material unknowns are None)
- what risks or unknowns still remain (as closed decisions or tech-debt, not open prose)
- whether any notable risks still need a separate manual review

## Guardrails

- Do not invent supporting code that does not exist.
- Do not preserve stale technology claims for compatibility.
- Do not leave large, multi-file, ambiguous tasks when they can be split.
- **Primary sources only** for third-party behavior; version-pin every external claim.
- **Zero assumptions** — unverified material claims block readiness.
- Prefer parallel verification and parallel task graphs over serial convenience.
- Keep the refined plan executable by the next agent without extra interpretation.
