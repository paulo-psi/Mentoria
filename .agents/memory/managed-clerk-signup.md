---
name: Replit-managed Clerk sign-up limits
description: Account creation and sign-up boundaries for Replit-managed Clerk
---

The Replit-managed Clerk Auth pane's Users tab cannot create or invite individual accounts; it only manages users who have already signed up. New users sign up through the application, and Development and Production maintain separate user stores. Hiding the app's sign-up UI does not globally prevent identities from being created through Clerk; application access must still be enforced by the server-side allowlist.

**Why:** Replit Docs confirms the Users tab is for existing accounts and that account creation happens through application sign-up. A UI-only lock must not be described as a provider-wide signup restriction.

**How to apply:** When an approved test user has not signed up yet, the person must complete sign-up and email verification in Development. If temporarily reopening app sign-up, state that other identities may be created during that window but remain unable to access the HUB unless allowlisted; close the app flow after the approved account is ready.