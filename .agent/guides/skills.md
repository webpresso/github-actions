---
type: core
last_updated: 2026-08-03
---

# Agent Skills Notes

Skill inventories drift fast. Use the skill directories under `.agent/skills/`
(catalog SSOT: `catalog/agent/skills/`) as the source of truth — open the
matching `SKILL.md` and follow it.

## Routing

- Freeform user phrases → skill map:
  [`catalog/agent/rules/workflow-skills-routing.md`](../rules/workflow-skills-routing.md)
  (section **Freeform → skill map**).
- If you retype a mantra twice, it belongs in that map or a skill's body "Use
  when" section — not only in chat.
- Default packaged skill **descriptions** are capped at **120 bytes** for host
  listing cost. Long trigger lists stay in the routing map / skill body.

## Command behavior while using skills

- Prefer repo-owned facades: `wp` → `vp` → package managers.
- Prefer MCP `wp_*` over shell reimplementations for quality, session, and
  blueprint work.
- Slash/commands under `.agent/commands/` are ergonomic loaders; skills own the
  protocol.

## Related files

- `.agent/skills/`
- `catalog/agent/rules/workflow-skills-routing.md`
- `.agent/guides/agent-guardrails.md`
- `AGENTS.md`
