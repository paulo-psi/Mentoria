---
name: Mobile error-state E2E retries
description: Timing constraints when testing failed queries and retry actions in responsive Playwright coverage.
---

When a failed React Query has no cached data, manually refetching it can return the screen to its loading branch and unmount the error notice. Default query retries also delay the settled error state.

**Why:** A mobile error-state test that expected the notice to remain mounted immediately after the first failed retry response was flaky; the request had responded, but subsequent retry attempts were still pending.

**How to apply:** Measure error-state layout at each viewport while the query is settled. Exercise the retry action after those checks and wait for its failed response; do not expect the notice to remain visible immediately after the first response unless retries are disabled for that test.