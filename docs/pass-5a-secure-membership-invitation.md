# ELIFORA PASS 5A — SECURE INVITE ACCEPTANCE

## Exact Git Head

The exact application/domain SHA and its completed CI run are recorded in the final
delivery. This source document describes the implementation; it is not a substitute
for execution evidence. Branch: `codex/pass-5a-secure-invite-acceptance`.

## Baseline

Accepted application `346306a41601be8d28c00d5ecf4015ebb9c8a5ae`. Passes 1–4 stay intact.
No visual redesign, hosted migration, canonical staging promotion, catalog publication,
DNS change, initial OWNER provisioning change or existing-tenant mutation is included.

## Existing Membership Lifecycle Audit

`salon_memberships` already has invited/active/revoked states and timestamp constraints.
`saas_structure_operation(CREATE_MEMBER)` creates a row bound to an existing provider
identity, reserving a distinct-person seat. `list_workspace_contexts` only returns active
membership in available organization/location scope. Those functions and RLS policies
remain unchanged. `pilot_provision` remains operator-only initial salon admission.

## Pending Invitation Read Boundary

`read_my_membership_invitations(p_membership_id default null)` lists only the caller's
pending memberships. With an explicit locator, it returns only that caller's current
membership state, including active/revoked/archived states. Foreign and absent locators
both return `INVITATION_NOT_FOUND`. Returned fields: membership locator, organization
and optional location display names, role code, status, invitation/join timestamps and
PENDING/ACTIVE/REVOKED/ORGANIZATION_UNAVAILABLE/LOCATION_UNAVAILABLE classification.
No organization/location/user IDs, permissions, audit metadata, other users or tokens.

`GET /api/membership-invitations` and `GET /api/membership-invitations/{membershipId}`
provide private no-store identity-authenticated adapters without requiring an active
workspace. Pending RLS visibility is not broadened on base tables.

## Acceptance Service

`accept_my_membership_invitation(p_membership_id,p_request_id,p_correlation_id)` accepts
only a pre-existing row for `auth.uid()`. The Web endpoint is same-origin
`POST /api/membership-invitations/{membershipId}`, body `{request_id}` only, maximum
4096 streamed bytes. No caller-supplied user, organization, role, location or status.
Unknown authority fields are rejected rather than silently stripped. Errors map to
stable product-safe codes; provider/database messages are not exposed.

## Auth UID Binding

Normal provider `getUser` plus the authoritative database `require_active_session`
guard applies. Every SQL projection/transition matches membership.user_id to auth.uid.
The current workspace, JWT user metadata, a URL role or UUID secrecy are not authority.
Authenticated users can call this boundary with zero active workspaces.

## State Transition

Only `invited -> active`, setting `joined_at` with the database clock. The existing
updated-at trigger runs naturally. Organization/location/user/role/invited_at/created_by
are preserved. No membership, organization, location, plan or entitlement is created.

## Idempotency

A private RLS-protected immutable receipt carries explicit organization ownership
and binds `(actor_id,request_id)` to one target,
across organizations. Different-target reuse returns `INVITATION_REPLAY_CONFLICT`.
Already-active own membership returns current canonical data, preserves joined_at and
adds no acceptance audit. New request IDs may bind to that same active target; they
do not activate it twice. A receipt is request provenance, never cached authority.
Current revocation/archive status wins even when replaying an earlier success.
Legitimate owned targets rejected by current archive/revocation eligibility also
retain their request binding; a failed request cannot be repurposed to another
owned membership. Foreign/absent targets create no receipt and reveal no owner.

## Concurrency

A recipient-scoped transaction advisory lock serializes request bindings. The service
holds organization and scoped-location SHARE archive fences, then locks/re-reads the
owned membership FOR UPDATE. These row locks precede the existing quota trigger's
organization/SaaS advisory locks, avoiding the advisory-before-membership-row inversion
with normal reviewed revocation. A concurrent scope edit invalidating the fenced scope
fails closed. Normal PostgreSQL transaction rollback rolls back state, receipt and audit.

The new real multi-connection harness observes `pg_blocking_pids` before release:
same/different request acceptance, changed target across organizations, rollback/retry,
revocation in both orders, organization/location archive first and acceptance archive
fence first. No mocked parallelism or increased deadlines.

## Revoked / Archived Handling

Revoked memberships return `INVITATION_REVOKED`; archived/mismatched organization or
scoped location returns `INVITATION_UNAVAILABLE`. No replacement membership, scope
repair or resurrection. Safe own-state reads distinguish archive states; acceptance
errors deliberately consolidate unusable scope. No invitation expiry/consumed-token
state is invented because no second invitation token system exists in this slice.

## Workspace Bootstrap Integration

After acceptance, the Web adapter calls existing `bootstrap()` again and returns those
fresh DB-derived contexts. It sets no workspace cookie and fabricates no context or
permissions. UI navigation remains a future pass. If the fresh read fails after commit,
the caller can retry safely; no locally fabricated success is substituted. Multiple
contexts are left to existing workspace choice. Hosted release fingerprint checks remain.

## RLS / Permission Integrity

No existing RLS policy or table-write grant changes. Public/anon/service_role cannot
execute either recipient RPC; only authenticated receives EXECUTE. SQL checks auth.uid
and current provider session anyway. The projection helper has no client EXECUTE.
The receipt table is private with RLS enabled and no client privileges. Fixed empty
search_path, no dynamic SQL, explicit minimal grants. Ordinary tables keep active-only
authorization. Accepted reception still lacks technical Hair Passport permission.

## Audit

Only the first transition inserts `membership.invite_accepted`, actor auth.uid, membership
entity, organization, caller correlation and request_id provenance. No password, email,
token or provider/service credential enters metadata. Existing immutable audit and receipt
triggers are retained. Failed and duplicate transitions emit no successful acceptance.

## Contract

`contracts/membership-invitations.schemas.json` and `contracts/openapi.yaml` define safe
DTOs, minimal HTTP/RPC inputs and stable errors. Web Zod schemas mirror those semantics.
Authoritative contract tests reject role/scope/user authority and leaked fields. Android
needs no change because existing contracts are additive and there is no new Android UI
or competing lifecycle implementation. The security inventory explicitly classifies
three new SQL functions and three new HTTP methods; existing approvals are preserved.

## Migration

One forward migration: `20261101142658_pass_5a_secure_membership_invitation.sql`.
Repository count 116, previous 115/head `20261021144458`. New expected local/CI head
`20261101142658`. No historical migration is edited. Canonical staging remains 115 and
the previous head; **do not apply this migration there as part of Pass 5A**.

## Security Review

1. Can I accept someone else's UUID? **NO** — foreign/absent yield the same not-found result.
2. Can I choose OWNER during acceptance? **NO** — role is not an input; only a legitimately existing invited owner can accept its stored role.
3. Can I move the invitation to another location? **NO** — no scope parameter/write.
4. Can I reactivate revoked membership? **NO** — locked re-read, including successful receipt replay.
5. Can I gain access before acceptance? **NO** — existing active-only workspace and RLS remain.
6. Can a retry duplicate audit/side effects? **NO** — one state transition/join timestamp/audit, no second seat; immutable request bindings and real lock barriers cover retries.
7. Can service response enumerate another user's invite? **NO** — own-user read predicate and identical foreign/absent error.
8. Can this create a new organization? **NO** — only updates an existing own membership.
9. Can this close SMTP readiness? **NO** — no email integration/delivery evidence.

## Tests

New database assertions cover grants, missing identity/session, foreign/absent equality,
pre/post RLS and permissions, field preservation, timestamp, audit, retry, receipt mutation,
replay conflict, revoked/archive, reception privacy, existing invited owner and no new rows.
Nine additional real concurrency cases use separate backend connections and observed locks.
Focused Web model/service/HTTP tests and a real Auth -> owner CREATE_MEMBER -> recipient
read/accept -> fresh workspace -> revocation E2E run in both existing browser projects.
No existing assertion, retry/deadline requirement or test was weakened or skipped.

## Full CI

The existing four-job authoritative workflow retains all prior Web, Android, DB/RLS,
concurrency, contract and secret checks. Adds the invitation E2E with zero retries and
real database concurrency evidence upload. Completed exact-SHA results belong in the
final delivery; this section does not predeclare green. Local Windows lacks Docker,
so actual PostgreSQL/concurrency/browser regression executes on disposable CI databases,
never a hosted staging database.

## Known Limitations

No invite email sender, token expiry model, account/password onboarding UI, wizard,
invitation landing page or first-owner provisioning redesign. This boundary begins
only after normal authenticated identity exists. No canonical staging application or
schema promotion. A later independently approved release must include the forward
migration and matching release fingerprint before hosted use.

## Email / SMTP Boundary

OPEN/BLOCKED_EXTERNAL_DEPENDENCY. Normal synthetic provider confirmation in disposable
tests proves only authenticated membership acceptance, not hosted email verification,
delivery, invitation callbacks or recovery readiness. Public signup remains disabled.

## Preserved Phase 10 Gates

All human/external gates remain OPEN. No pilot admission/GO, Phase 11, catalog
publication, production access/deploy, persistent staging account/password rotation or
unrelated data mutation. Stop after this domain boundary and its full CI/security review;
do not begin Pass 5 visual productization.
