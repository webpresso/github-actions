---
description: "Bounded tooling/harness fix path: one opportunistic fix (fix_budget=1); overflow to tech-debt. Use for MCP inefficiency, hook thrash."
argument-hint: "[symptom]"
allowed-tools: Read, Write, Edit, Glob, Grep, Task, TodoWrite
---

# Harness hygiene

Thin command for "fix tooling inefficiency you come across" without expanding
epic scope.

1. Load `@.agent/skills/fix/SKILL.md` for `$ARGUMENTS` with **fix_budget=1**.
2. Prefer MCP `wp_*` / session tools; run `hooks-doctor` only for install health.
3. Additional findings → `@.agent/skills/tech-debt/SKILL.md` capture or backlog.
4. Do not thrash primary checkout; use managed worktrees for non-trivial edits.
