---
name: Drizzle raw SQL subquery aliases
description: Alias raw SQL and aggregate selections explicitly before referencing them from an outer Drizzle query.
---

When selecting aggregate or raw SQL expressions into a Drizzle subquery, give each expression an explicit `.as("...")` alias before accessing it from the outer query.

**Why:** Drizzle can type-check a subquery field whose SQL expression has no explicit alias, then fail at request time when the outer query references that raw field.

**How to apply:** Alias `count(...)` and `sql\`...\`` selections inside subqueries, and keep an integration test that executes the composed query.