# ADR 0008: Organization client identity and explicit duplicate review

Status: Accepted for Phase 1B, 2026-09-11.

## Identity and lifecycle

`Organization → Client` is the durable relationship. `creation_location_id` records
provenance, not ownership. Location-scoped members with an effective client-read
permission can read the organization's clients across locations. No Hair Passport,
technical region, CRM, appointment, finance, consent or merge fields are introduced.

Only full name and phone are required. Email and birth date are optional. Canonical
phone is stored in both the display and comparison columns, allowing a future display
format without changing identity. Phone is deliberately **not unique**. ACTIVE and
ARCHIVED are reversible lifecycle states; all mutations advance a numeric version.
IDs, organization, original actor, creation time and creation location are immutable.
No DELETE grant exists, and a trigger also rejects row deletion by the table owner.

## Service and authorization

Both platforms use `public.client_operation`. Web calls it from a server-only adapter
after checking Auth and the workspace cookie; Android uses the existing authenticated
REST transport, including serialized token refresh. No service-role credential is
used by either application. The contract lives in `contracts/openapi.yaml`.

The public RPC is SECURITY INVOKER. Its private implementation is SECURITY DEFINER
owned by `elifora_client_service`, a NOLOGIN/NOBYPASSRLS role distinct from every
table owner. It inherits authenticated read privileges and has narrowly granted
insert/update/append privileges. Application roles cannot assume that service role.
RLS remains active inside the service. Fixed empty search paths and fully qualified
names prevent search-path substitution. Existing Phase 0/1A policies are unchanged.

Each request resolves the authenticated actor's selected active membership, active
organization and active location, then checks that selected role's permission using
the existing permission tables. Organization IDs, actor IDs and ownership fields in
mutation payloads are rejected. Cross-organization IDs return CLIENT_NOT_FOUND for
both reads and mutations. Invited/revoked memberships cannot use the service. The
existing membership model has no independent ARCHIVED status: access through an
archived organization or location is denied and tested, without introducing staff
administration in this slice.

| Existing role | Read | Create | Update | Archive / restore |
| --- | --- | --- | --- | --- |
| owner / manager | Yes | Yes | Yes | Yes |
| colorist / reception | Yes | Yes | Yes | No |
| assistant | Yes | No | No | No |

Web mutation requests also require `X-Workspace-Reference`. It must match the freshly
resolved selected membership/location. This is a precondition, not authorization:
changing the workspace in another tab cannot redirect an already-open creation form.
Same-origin JSON requests are required to prevent cross-origin cookie mutations.

## Phone and duplicate semantics

The server normalizes Turkish national numbers (`0532…`, `532…`, `90532…`) and
international `+`/`00` country-code formats into E.164-shaped strings. Supported TR
national numbers have ten digits and a leading 2–5. Other regions currently require
an explicit country code; the `phone_region` parameter is an extension seam. This is
format validation, **not number ownership or carrier verification**. No changing
number-allocation dataset or phone uniqueness assumption is embedded in identity.

Matching is restricted to the current organization, including archived identities,
excluding the record being edited. Signals are exact normalized phone, exact
normalized name (including Turkish case/diacritic handling), case-normalized email,
and birth date accompanied by the same three-character name prefix. Exact normalized
name was chosen over fuzzy ranking for predictable review behavior in this slice.
Birth date alone does not match an entire birthday cohort.

At most ten candidates are returned, with ID, name, masked phone, status, update time
and match signals. A strong phone match sorts first. The server issues a random,
single-use, ten-minute review token bound to actor, membership, location, operation,
the exact form payload and a fingerprint of **all** matching IDs and versions. The
confirmation must submit unchanged fields and the token after an explicit user
decision. Altered, expired, consumed or stale review tokens fail closed. A candidate
change requires another review. No client-side flag can suppress the check, and
there is no automatic merge or permanent rejection of legitimate shared numbers.

## Conflicts, retries and audit

Organization-scoped transaction advisory locks serialize duplicate detection and
client mutations. Permissions are rechecked after waiting for that lock. This
prevents two concurrent normal creates from both missing one another. Row locks and
`expected_version` prevent lost updates, including archive/restore races.

Mutations require a UUID `request_id`. A private receipt binds the actor, organization,
selected scope, operation and payload. Identical successful retries return the same
result for 24 hours; reuse for another payload returns CONFLICT. A confirmed retry
keeps its confirmation token. Receipt replay revalidates current access first.
Expired receipts/reviews are unusable immediately and are deleted opportunistically
on subsequent actor/organization mutations. Physical expiration cleanup is not a
scheduled retention guarantee; inactive actors may leave expired private rows until
an operational cleanup is run. There is no background business automation here.

Audit writes are atomic with the client change. Created, updated, archived, restored
and duplicate-override events include correlation IDs and location provenance.
Updates retain old/new identity, status and version values. Tokens, full raw requests
and credentials are not audited. Retries do not duplicate writes or audit events.

Logical RPC failures return an ErrorResponse in HTTP 200 so a duplicate challenge can
commit without a client write. Android distinguishes `code` from `data`; Web maps
logical failures to HTTP 400/401/403/404/409. Provider/transport failures are separately
normalized. Generic error schemas are reused, with optional review metadata.

## UI data lifetime and search

Web routes check session, workspace and permissions on the server; protected client
data loads through a no-store authenticated endpoint. Screens start concealed and
revalidate on foreground/focus/online events and every 15 seconds. Stale in-flight
results cannot restore concealed data. Client drafts and review tokens remain only
in memory. Native lifecycle coordination similarly conceals on background, invalidates
on logout/workspace loss, and revalidates before showing retained drafts. There is no
offline client database in Phase 1B. Revocation applies to the next server request
immediately; an already-visible idle screen is detected by the 15-second poll or a
foreground event. No push-based instantaneous visual revocation is claimed.

Directory responses are bounded to 25 rows by default, at most 50, offset at most
10000, with minimal masked summaries and `has_more`. Name and phone substring search
are tenant/status scoped; active records are the default. Archive access is explicit
through the archive filter or a known detail route. Detail contains only basic identity.

B-tree indexes cover `(organization_id,status,name_normalized,id)` for stable directory
ordering, organization/phone for exact matches, and partial organization/email and
organization/birth/name for optional signals. GIN trigram indexes support substring
name/phone search; foreign-key indexes cover actor and creation-location lookups.
One- and two-character name searches can use the organization/status path; no claim
is made that a trigram index accelerates every short query. Offset pagination and
organization serialization are deliberately bounded initial choices. Measure query
plans and lock waits against realistic staging volumes before changing the search
strategy. No production latency benchmark or heavyweight search infrastructure is
claimed by the synthetic correctness tests.

## Verification and next boundary

pgTAP exercises real RLS, privileged-service calls, immutable ownership, cross-tenant
denials, inactive access, duplicate/confirmation/version behavior and atomic audit.
Desktop and mobile Chromium exercise real disposable Supabase, including concurrent
creates/confirmations. Native JVM tests cover controller behavior and transport
mapping; the instrumentation APK compiles separately from device execution.

The next slice is **Phase 1C — Hair Passport Foundation + Technical Regions +
Evidence/Confidence data model**. It must be requested separately.
