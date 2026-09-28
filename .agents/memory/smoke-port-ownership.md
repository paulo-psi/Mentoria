---
name: Smoke-check port ownership
description: Why a successful loopback health response may not belong to the server under test
---

In this workspace, a Replit proxy or an old child process from an artifact workflow can keep a port open after an environment reload. A request may return a valid page or health response even while the new server fails with “port already in use.”

**Why:** An HTTP response alone does not prove that the freshly launched process started or owns the port, so startup regressions can be hidden by another service or a leftover workflow process.

**How to apply:** For artifact workflow port conflicts, inspect the listener with `lsof`, confirm what it serves, and restart the exact managed workflow once rather than changing ports or killing an unverified process. For smoke tests, confirm the chosen port can be bound, bypass HTTP proxies, and verify the launched PID stays alive through the assertion; stop that exact process with a cleanup trap.