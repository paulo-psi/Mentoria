---
name: React Query live announcements
description: Prevent stale cached data from being announced as a completed refresh.
---

For polite result announcements, require a successful fetch after mount and keep the live region empty while the query is fetching or errored.

**Why:** The roster-history query uses `staleTime: 0` and `refetchOnMount: 'always'`. A cached result can briefly appear before its forced refresh; announcing it and then the current response can produce duplicate or stale screen-reader output.

**How to apply:** Gate completion text on `isFetchedAfterMount`, `!isFetching`, and `!isError`. Verify the live region stays empty during loading and errors and announces once after success, including empty results.