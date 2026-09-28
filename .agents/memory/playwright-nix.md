---
name: Local Playwright browser on Nix
description: Why browser tests need a different Chromium executable locally than in Ubuntu CI
---

Playwright's downloaded headless Chromium did not start in the local Nix environment because common Linux shared libraries, beginning with libglib, were unavailable to its loader. The environment already provides a wrapped Chromium that works with its library set.

**Why:** A browser-launch failure here says nothing about the app or test assertions; downloading Playwright's browser alone is insufficient locally.

**How to apply:** For local runs, use the browser-test configuration's executable override with the provided Chromium wrapper. On Ubuntu CI, leave the override unset and install Playwright's browser with its system dependencies.