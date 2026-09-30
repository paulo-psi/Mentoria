---
name: Playwright test filtering with pnpm
description: Run one workspace Playwright spec without accidentally invoking the whole suite
---

For a single Playwright spec in the Hub workspace, invoke the CLI through `pnpm --filter @workspace/hub-mentorias exec playwright test --config playwright.config.ts <spec-path>`. Passing a path after `pnpm run test:e2e --` inserted an additional separator after the script's own Playwright options, and Playwright ran the full suite instead of just the requested spec.

**Why:** A mistaken filter caused an unnecessary full end-to-end run while preparing safe screenshots.

**How to apply:** Use `pnpm exec playwright test` with the config and spec path as direct CLI arguments when targeting one test file. Verify the test runner reports the expected test count before waiting on a longer suite.