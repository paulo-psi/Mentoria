---
name: Roster test helper returns
description: Prevent automatic semicolon insertion from breaking roster test fixtures.
---

Keep object-return expressions syntactically attached to `return`, such as `return { ... };`. A line break between `return` and the object starts an empty return statement, which can make many fixture-based tests fail through a single helper bug.

**Why:** Roster test helpers had object literals on the next line; JavaScript automatic semicolon insertion caused fixture builders and snapshots to return `undefined`.

**How to apply:** When changing roster test helpers, keep value expressions explicit and run the roster test typecheck and suite to catch cascading fixture failures.