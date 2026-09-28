---
name: PostgreSQL query config mutation
description: Runtime and type-system pitfalls of per-query timeouts with the installed pg client
---

The installed pg client accepts `query_timeout` in a query config at runtime, but its TypeScript declarations do not list that option on `QueryConfig`. Declare the config as a variable before passing it to `pool.query`, rather than using an inline object literal.

**Why:** `pg-pool` adds a callback to the passed config object. Reusing that object across requests contaminates later queries; an inline object with `query_timeout` also fails TypeScript's excess-property check even though the runtime supports it.

**How to apply:** Create a new config object for each timed query. If the HTTP request must also be bounded while waiting for a pool connection, use a separate request deadline; the driver's per-query timeout alone does not cover that wait.