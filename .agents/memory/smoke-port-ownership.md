---
name: Smoke-check port ownership
description: Why a successful loopback health response may not belong to the server under test
---

In this workspace, a loopback port thought to be free was owned by a Replit proxy and answered the API health request. The newly launched server had failed to bind, yet the smoke check initially passed against the existing app.

**Why:** An HTTP response alone does not prove that the freshly launched process started or owns the port, so startup regressions can be hidden by another service.

**How to apply:** Before starting a smoke-test server, confirm the chosen port can be bound; request it directly without an HTTP proxy and check that the launched process stays alive through the assertion. Stop that exact process with a cleanup trap.