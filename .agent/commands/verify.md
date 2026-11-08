---
description: "Post-implementation quality gate: local checks by default; --merge-ready requires exactly one outside-voice approval. Runs TPH/test-quality audit, dead-code sweep, and docs refresh. Use after implementing a feature or fix, before claiming done, or when finalizing a blueprint."
argument-hint: "<target> [--full|--merge-ready] where target is: package|file|plan-slug|all"
allowed-tools: Read, Write, Edit, Glob, Grep, Task, TodoWrite
---

# Verify Command

Canonical doc: @.agent/skills/verify/SKILL.md
