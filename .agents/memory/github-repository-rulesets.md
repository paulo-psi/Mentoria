---
name: GitHub repository rulesets
description: Plan limits and verification behavior for branch rulesets on connected GitHub repositories.
---

For private repositories on plans without private-repository branch protection, GitHub can reject both branch-protection and ruleset API access with an upgrade-required 403. If the user authorizes changing visibility, public repositories on GitHub Free can use rulesets. Bind required status checks to the originating GitHub Actions app when the API supports `integration_id`, and leave `bypass_actors` empty when contributors and admins must not bypass.

**Why:** An active ruleset can protect a branch even while the classic branch-protection endpoint reports “Branch not protected”; checking only the legacy endpoint gives a false negative. The effective rules endpoint reports ruleset enforcement.

**How to apply:** Inspect repository visibility and plan errors before changing settings. Verify a ruleset via `GET /repos/{owner}/{repo}/rulesets/{id}` and effective branch rules via `GET /repos/{owner}/{repo}/rules/branches/{branch}`.