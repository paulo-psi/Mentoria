---
name: Workspace package installation
description: Installing dependencies in a specific artifact in this pnpm workspace
---

The language-package installation callback invokes `pnpm add` at the workspace root, where pnpm rejects the operation unless the root is explicitly selected. Passing `-w` as a package token is rejected by the callback.

**Why:** Artifact-specific test packages should be declared on the artifact, not the monorepo root; the callback does not offer a workspace filter.

**How to apply:** When the callback cannot target the artifact, use `pnpm --filter @workspace/<artifact> add -D <packages>` for artifact-specific development dependencies. Do not disable pnpm's root-package safety check.