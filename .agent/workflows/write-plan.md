---
description: Create detailed implementation plan with bite-sized tasks, dependencies, and rollback steps
---

## Writing Implementation Plans

1. Review design and clarify unknowns.
2. Create/update the structured draft with `blueprint_put`, carrying its returned `bpv1:` version through refinements.
3. Tasks are bite-sized with exact files, tests, commands, and expected output.
4. Include dependencies and rollback per task.
5. Offer execution via `/goal` (autopilot) or `ultragoal`.

**Important:**

- Use t-shirt sizing (XS/S/M/L/XL) for estimates, NEVER day/week estimates
- Remember: exact paths, complete code, DRY/YAGNI/TDD, frequent commits
