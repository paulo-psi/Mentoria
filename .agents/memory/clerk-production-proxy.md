---
name: Clerk production proxy
description: Why the managed Clerk frontend proxy URL may be absent from source and development environment.
---

Keep the Replit-managed Clerk provider's proxy URL wired directly to the platform-provided build variable, even when it appears unset in development. Do not add a hardcoded production fallback or a mode gate.

**Why:** Replit injects the proxy URL separately for published builds; development intentionally talks to Clerk directly. A source-only review mistakenly flagged the missing repository value as a production failure, but the Clerk setup guidance explicitly requires the existing wiring.

**How to apply:** If production login needs debugging, check the published environment and its proxy route rather than inferring failure from the development environment or source tree. Re-read the current Clerk setup guidance before changing this connection.