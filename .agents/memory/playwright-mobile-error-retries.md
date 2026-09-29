---
name: Mobile error-state E2E retries
description: Timing constraints when testing failed queries and retry actions in responsive Playwright coverage.
---

When a failed React Query has no cached data, manually refetching it can return the screen to its loading branch and unmount the error notice. With cached data, an error state can remain active during a refetch, so the error branch may stay visible instead of switching to a loading status. Default query retries also delay the settled error state.

**Why:** A mobile error-state test that expected the notice to remain mounted immediately after the first failed retry response was flaky; the request had responded, but subsequent retry attempts were still pending. A separate cached-data retry can keep `isError` true while `isFetching`, so loading-state assertions must reflect the component's branch order.

**How to apply:** Measure error-state layout at each viewport while the query is settled. Exercise retry after those checks and wait for the final response. During a pending refetch, assert the actual error or loading state based on cache availability rather than assuming `isFetching` means a loading message is shown.