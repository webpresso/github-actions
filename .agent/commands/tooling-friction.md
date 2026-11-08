---
description: "After land, capture MCP/CLI friction tips (optional; never blocks.)"
argument-hint: "[--promote] [blueprint-slug|pr-number|session]"
allowed-tools: Read, Write, Edit, Glob, Grep
---

# Tooling Friction Command

Canonical doc: @.agent/skills/tooling-friction/SKILL.md

Resolve the capture destination with the read-only `tooling_friction_path`
MCP tool. Its summary embeds the absolute path (`tooling-friction path: …`) —
copy that path for the write; never invent fleet worktree folder slugs or
worktree-keyed desktop-state paths. For human CLI use,
`wp tooling-friction path --file <file>` prints the same absolute path.
