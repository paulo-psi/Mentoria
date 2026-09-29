---
name: Delayed query response E2E
description: How to test a delayed Playwright API response when changing React Query keys can abort its fetch.
---

When a filter change switches a React Query observer to a different key, the old query's forwarded `AbortSignal` can cancel its browser fetch. A mocked route can still finish its delayed `route.fulfill`, while Playwright never emits the old request's normal response event.

**Why:** Waiting for `page.waitForResponse` on an intentionally released old-filter request timed out even though the route had been released and the selected filter's UI stayed correct.

**How to apply:** Signal when the mocked route begins and when its delayed `route.fulfill` finishes. After changing filters, verify the new query and attribution before releasing the old route, then assert they remain unchanged; don't rely on a browser response event for a canceled fetch.