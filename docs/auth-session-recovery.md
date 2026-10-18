# Authentication and account/session recovery

Supabase/Auth remains the identity/password authority. There is no custom password
store, fake device intelligence, fingerprinting or platform impersonation.

`/auth/recovery` sends a provider PKCE reset email and always returns the same
public message for known, unknown, invalid, rate-limited or unavailable identities.
Provider configured request budgets apply; no process-memory pseudo distributed
rate limiter or commercial usage limit is introduced. CI's elevated Auth budget
is restricted to finite synthetic loopback fixtures and is not a production setting.

The callback accepts only a bounded single `code`, exchanges it through the provider
and redirects to a constant application destination. No next/return URL is forwarded.
The update page verifies a fresh provider user; the action validates same-origin,
password confirmation and length, calls provider updateUser, then globally signs
out and clears local auth/workspace cookies. Provider session deletion blocks
old JWT business requests immediately through the Data API hook and Storage RLS.
If global sign-out cannot be confirmed, the UI explicitly requires support follow-up;
it does not claim all other sessions were revoked. Recovery pages broadcast the
Phase 8 privacy lock so old private content and draft keys are concealed.

Outside development, configure `ELIFORA_APP_ORIGIN` as an explicit HTTPS origin
and allowlist exactly its callback in provider Auth settings. Local development
accepts only literal loopback hosts. No wildcard callback, request-controlled
external origin or javascript/data destination is supported. Provider PKCE verifier
binding means the initiating browser must retain its provider cookie.

The existing logout remains local-session logout, distinct from recovery's global
logout. Workspace selection always resolves current memberships; it never trusts
the cookie as tenant authority. Existing generation guards protect account/org
switch, background/foreground, delayed responses and encrypted drafts. A provider
session listing/revoke UI was not previously present, so none is invented here.

Test real provider login/refresh/logout and the Data API's still-valid-JWT revocation
case. Provider mail delivery and hosted SMTP are not claimed tested in production.
