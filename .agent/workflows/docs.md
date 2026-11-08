---
description: Update documentation and agent instructions based on recent context.
---

1. Review recent context (task files + recent changes).
2. Identify targets (AGENTS.md, docs/\*, tool entry points).
3. Edit with apply_patch; follow templates in `docs/`.
4. Validate with the repo's documentation check through `wp run docs:check`
   when available, then `wp run docs:check`, and only then a raw
   package-manager command.
5. Summarize updates and locations.
