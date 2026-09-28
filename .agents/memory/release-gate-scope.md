---
name: Release gate scope
description: Distinguish GitHub release checks from Replit publishing
---

GitHub tag-based releases can be made dependent on a database-backed CI check. Do not describe that check as blocking Replit's separate, user-initiated Publish action.

**Why:** A successful or failed GitHub Actions workflow does not control whether someone clicks Publish in Replit.

**How to apply:** When changing release policy or communicating release readiness, name which release path is protected. Address Replit publishing separately if it needs an enforceable preflight.