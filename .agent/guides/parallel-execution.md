---
type: core
last_updated: 2026-04-22
---

# Parallel Execution Guide

Execute blueprint-shaped work with a parallel orchestration surface while
keeping blueprint lifecycle state on the shipped MCP surface.

> [!NOTE]
> **Canonical reference:** the `autopilot` skill (`/goal`) and the `ultragoal`
> skill for durable multi-blueprint runs. The former `/pll` command is
> retired; this guide describes the live execution lane.

## Quick Start

```text
# 1. Inspect and transition the current bpv1 version to in-progress
blueprint_get -> blueprint_transition

# 2. Inspect the active plan
wp blueprint show <slug>

# 3. Execute via the native goal pipeline (autopilot) or ultragoal for
#    durable multi-blueprint runs
/goal blueprints/in-progress/<slug>.md
# or, for folder-shaped blueprints:
/goal blueprints/in-progress/<slug>/_overview.md

# 3. Verify tasks and complete
blueprint_task_verify -> audit -> blueprint_finalize
```

## Architecture

The plan execution surface has three layers:

1. **Blueprint lifecycle** (`blueprint_*`, plan-only `review_gate`,
   `audit`) — durable repo-owned plan state.
2. **Blueprint DAG helpers** (`webpresso/blueprint`) — task graph,
   executor, and related local analysis utilities.
3. **Parallel operator workflow** (`/goal` + `autopilot`, `ultragoal`,
   subagents / team lanes) — prompt / skill-driven orchestration over the
   repo state.

## Core Rules

| Rule                                      | Implementation                                                                                            |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Blueprint is canonical**                | Task / lifecycle truth lives in the blueprint file plus shipped `wp blueprint` commands                   |
| **No direct `move` for normal execution** | `move` is recovery-only; use `start`, `task ...`, and `finalize`                                          |
| **Operator UX is separate**               | `/goal`, `autopilot`, `ultragoal`, and lane commands are orchestration surfaces, not durable state stores |
| **Generic engine vs adapter**             | The parallel engine is reusable; `autopilot`/`ultragoal` are the blueprint-aware adapters                 |
| **Verification stays repo-owned**         | Use `wp blueprint audit`, targeted tests, lint, and typecheck to prove completion                         |

> [!NOTE]
> Blueprint markdown is allowed to be historically mixed. For execution
> safety, rely on `blueprint_get` and the strict blueprint lifecycle audit
> instead of assuming every blueprint
> matches one final section template.

## How It Works

When `/goal` (via `autopilot`) is used with a blueprint path or active
blueprint context:

1. `blueprint_get` or the blueprint file provides the durable
   task list.
2. The orchestrator decides which tasks are ready and which can safely run in
   parallel.
3. Ready work is delegated through the available parallel execution surface.
4. Lifecycle state is written back through structured task tools.
5. Completion is proved with repo verification commands, then the blueprint
   is finalized through `blueprint_finalize`.

## References

- **Canonical skills**: `autopilot` (native `/goal` pipeline), `ultragoal`
  (durable multi-blueprint runs)
- **Lifecycle CLI**: the shipped `wp blueprint` subcommands
- **DAG engine**: `webpresso/blueprint` DAG helpers
