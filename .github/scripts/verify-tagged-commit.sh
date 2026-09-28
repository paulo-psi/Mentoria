#!/usr/bin/env bash
set -euo pipefail

git fetch --no-tags origin main:refs/remotes/origin/main
if ! git merge-base --is-ancestor "$GITHUB_SHA" refs/remotes/origin/main; then
  echo "::error::Refusing to publish a release from a commit that is not reachable from main." >&2
  exit 1
fi