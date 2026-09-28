---
name: Independent workflow validation
description: Why release workflow syntax needs an independent pull-request check
---

Keep workflow syntax validation independent of the release workflow on pull requests, while reusing the same validator for the tag-release gate.

**Why:** GitHub rejects malformed workflow YAML before any jobs inside that workflow start. An internal lint job cannot detect a syntax error in its own workflow, and duplicating lint setup across concurrent pull-request jobs wastes time and risks drift.

**How to apply:** Preserve an independently triggered pull-request check when changing release CI. A tag gate can call that validator as a reusable workflow. A failing pull-request check alone does not prevent a merge unless branch rules require its status.