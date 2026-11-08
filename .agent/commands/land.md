---
description: "Land / merge-ready gate: run verify --merge-ready + land-policy (dual labels, exactly one outside voice unless N). Never invent a land-now skip."
argument-hint: "<target>  # package|file|plan-slug|all"
allowed-tools: Read, Write, Edit, Glob, Grep, Task, TodoWrite
---

# Land

Canonical protocol:

1. Load and follow `@.agent/skills/verify/SKILL.md` in **`--merge-ready`** mode
   for `$ARGUMENTS`.
2. Apply `land-policy` dual product/process labels; never invent a land-now skip.
3. Outside voice: **exactly one sequential** reviewer unless the user set N.
4. Open/update/merge PR only when the user asked to merge/land and gates pass.
