---
name: Drizzle CLI limitations
description: Non-obvious restrictions when generating disposable schemas with Drizzle Kit.
---

Drizzle Kit 0.31 rejects `generate --config ... --out ...`, and its package exports block resolving `drizzle-kit/bin.cjs`.

**Why:** Both otherwise plausible invocation patterns failed in this workspace. These are tool restrictions, not schema errors.

**How to apply:** Invoke the installed CLI through `pnpm exec` in the package that owns the dependency. To redirect output while retaining application configuration, use a temporary config that imports the real config and overrides only `out`. Do not replace schema generation with a manually maintained SQL copy.