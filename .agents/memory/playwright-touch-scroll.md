---
name: Playwright touch-scroll limits
description: Synthetic Chromium touch events did not trigger native overflow scrolling in the Hub E2E page.
---

In the Hub's mobile-emulated Playwright page, CDP `Input.dispatchTouchEvent` did not move the table's horizontal overflow scroller, even after enabling mobile touch emulation. This does not establish whether a real device gesture is broken; the same scroller exposes horizontal overflow, has `touch-action: pan-x`, and is operable through keyboard arrows.

**Why:** Synthetic input can fail independently of the browser's native touch gesture path, producing false failures in mobile interaction tests.

**How to apply:** Do not interpret a stuck CDP swipe as proof that touch scrolling is broken. Prefer a real-device/browser test or a reliable gesture harness, while retaining scroll geometry and keyboard-operation checks.