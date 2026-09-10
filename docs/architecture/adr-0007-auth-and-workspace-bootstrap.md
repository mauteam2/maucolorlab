# ADR 0007: Real authentication and verified workspace context

Status: Accepted for Phase 1A.

## Decision

Keep the Phase 0 Supabase Auth, RLS, native Compose, and Next.js boundaries.
Expose one parameterless, read-only SECURITY INVOKER RPC:
`list_workspace_contexts()`. Its explicit `auth.uid()` predicate returns only
the caller's memberships, even when an owner could otherwise inspect coworkers
under existing membership-read policies. Roles and permissions come from database
memberships and role_permissions, never editable JWT metadata.

Each active organization-wide membership expands to its active locations. A scoped
membership yields only its assigned active location. An organization without an
active location has no usable workspace in this slice. Archived organizations,
archived locations, invited memberships, and revoked memberships are excluded.
No client endpoint creates organizations, locations, memberships, or roles.

`ActiveTenantContext` is the shared contract in `contracts/openapi.yaml`.
It is display and selection information, not a portable authorization grant.
Persist only `membership_id:location_id` as the selection reference. Re-fetch the
RPC after restoring auth and match this reference exactly. A missing saved reference
does not silently fall back to a different workspace. One usable context with no
saved reference auto-selects; multiple contexts require an explicit selection.

## Web

Use the existing Supabase JavaScript/SSR packages. Server actions sign in and sign
out; proxy refreshes cookies and forwards SSR cache headers. Every protected page
and session data request calls the server bootstrap; a reusable layout is not an
authorization boundary. The selector action validates its submitted reference
against a fresh RPC response. Cookies hold the auth session and an HttpOnly selection
reference. No protected page is statically cached.

The visible shell revalidates every 15 seconds, on focus, connectivity restoration,
and page restoration. It conceals context before checking, when hidden, and when
offline. Network failure shows retry without interactive tenant content. Invalid
references are deleted before returning to selection. Session endpoints emit
`Cache-Control: private, no-store` and a UUID `X-Correlation-ID` matching the body.

## Android

Use a small Supabase Auth REST adapter behind AuthRepository and WorkspaceRepository,
using Coroutines IO and the platform HTTP client. This avoids adding a second
application architecture or an auth SDK dependency tree for four REST operations.
The provider-neutral interface can later accept Google credentials without UI or
workspace-state changes; Google sign-in is not implemented here.

Auth REST follows the provider's [documented token/user/logout endpoints](https://github.com/supabase/auth#post-token).
Validate identity through /auth/v1/user. Serialize refresh and authenticated requests
with a Mutex, refresh 60 seconds before expiry, persist token rotation, and retry
one 401 only. Do not locally interpret JWT metadata for tenant authorization.
Keep access and refresh tokens encrypted with AES-GCM using a non-exportable Android
Keystore key. Disable backup and exclude preferences from device transfer.
Only the selection reference is stored separately. Passwords are never saved.
Debug cleartext transport is limited to localhost/emulator loopback; release uses
Android's HTTPS default.

WorkspaceController exposes explicit states rather than booleans. It serializes
operations and discards results invalidated by backgrounding or logout. Activity
restart performs auth restore and fresh membership bootstrap. Foreground polling
uses the same 15-second interval. Compose receives state and callbacks, not a
Supabase client. FLAG_SECURE prevents task snapshots from retaining salon content.

## Revocation and errors

RLS denies newly executed salon reads immediately after membership revocation,
independently of token lifetime. An already rendered shell may retain its display
identity until the next 15-second check; it is concealed before that network check.
There is no salon business data or business action in Phase 1A. Every future data
operation must enforce server authorization again; polling is only UI invalidation.
This is not a promise of instantaneous push notification of revocation.

Both platforms use:

| Code | Meaning |
| --- | --- |
| UNAUTHENTICATED | No usable authenticated session |
| SESSION_EXPIRED | Provider rejects an existing session/refresh |
| MEMBERSHIP_REQUIRED | Authenticated, but no workspace selected/available |
| MEMBERSHIP_REVOKED | Previously selected access is no longer usable and no contexts remain |
| TENANT_CONTEXT_INVALID | Submitted/saved reference is absent from fresh usable contexts |
| FORBIDDEN | Server denies an authenticated operation |
| INVALID_CREDENTIALS | Email/password sign-in rejected |
| NETWORK_ERROR | Transient transport/provider failure; retry without tenant content |

MEMBERSHIP_REVOKED intentionally does not disclose a hidden revoked row: it also
covers removal or archival that makes previous access unusable. Android preserves
a request correlation ID in AccessFailure while normalizing raw provider errors.
Raw Supabase REST errors are not falsely documented as ELIFORA error envelopes.
The existing lower-case Phase 0 future-domain error codes remain in the contract.

Logout clears local credentials and selection even when provider logout is
unreachable. Online logout requests local-session refresh-token revocation.
As with Supabase generally, an already issued JWT can remain valid until expiry;
membership RLS revocation remains independent and immediate.

## Narrow Phase 0 correction

The previous private user_has_permission LEFT JOIN treated a nonexistent location
as having a null archived_at. The forward migration requires a real, unarchived
location in the requested organization. Regression tests exercise a permitted real
location, a nonexistent UUID, and a location owned by a different organization.
No historical migration or audit policy was rewritten.
