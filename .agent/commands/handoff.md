---
description: "Cross-session/agent handoff: session_context continuation brief (no transcript paste). Use for continue, take over, resume other host."
argument-hint: "[--host <claude|codex|opencode>] [session-id|brief]"
allowed-tools: Read, Glob, Grep, Task, TodoWrite
---

# Handoff

Canonical doc: @.agent/skills/handoff/SKILL.md

Follow the handoff skill for `$ARGUMENTS`. Emit a ≤40-line continuation with
session_context / capture refs — never paste a full transcript.
