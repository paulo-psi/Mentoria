---
name: Package installation quirks
description: Package-install callback limitations for artifact dependencies and standalone Go tools
---

The language-package installation callback invokes `pnpm add` at the workspace root, where pnpm rejects the operation unless the root is explicitly selected. Passing `-w` as a package token is rejected by the callback.

**Why:** Artifact-specific test packages should be declared on the artifact, not the monorepo root; the callback does not offer a workspace filter.

**How to apply:** When the callback cannot target the artifact, use `pnpm --filter @workspace/<artifact> add -D <packages>` for artifact-specific development dependencies. Do not disable pnpm's root-package safety check.

For standalone Go verification tools, the language-package installation callback rejected `language: "go"` with `no such language: go` even though the Go executable was available.

**Why:** The installed toolchain does not imply the package-install callback supports that language in this environment.

**How to apply:** If that callback still rejects Go, use a pinned official prebuilt binary in a temporary directory for local verification; keep temporary tooling out of the project dependencies.