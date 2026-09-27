---
name: PostgreSQL URL database precedence
description: A real driver behavior differs from the runner's deliberately conservative fake URL parser.
---

The installed `pg` client selected the URL pathname database when the connection URL also had a conflicting `database` query option. The runner's fake client models the opposite precedence as a defensive worst case. Do not assume the fake reflects the driver's actual parsing order.

**Why:** A live connection to a nonexistent pathname failed even when the query option named an existing database. This was surprising because the old runner comment claimed the query option overrides the pathname.

**How to apply:** Keep real-client checks with a valid pathname and a conflicting query option; continue removing the option when generating disposable database URLs, regardless of current driver precedence.