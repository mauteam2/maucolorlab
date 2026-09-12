# ADR 0011: Hair Passport core mutation service

Status: accepted for Phase 1C-2B1.

## Scope and storage

Four commands create a passport, partially update its core, create a region, or partially update a region. No Web/Android UI and no evidence, observation, test or history writes are introduced.

ADR 0009 stored all technical values in immutable, evidence-linked observations; passport/region rows only selected a current observation. Initial core values cannot use that storage without manufacturing provenance, which this phase expressly forbids. The forward migration therefore adds the same typed relational state/value columns and constraints to passports and regions, plus an explicit `has_unverified_state` flag. This is mutable core state, not a new observation or a JSON payload store.

The read assessment union gains `UNVERIFIED { values }`. Existing `NOT_ASSESSED { observation: null }` and `ASSESSED { observation }` remain unchanged. Minimal creation remains NOT_ASSESSED. Every supplied technical field has its existing explicit state/value semantics. Omitted fields remain unchanged; notes can explicitly become null. Empty updates are rejected. All state is validated independently in Zod, OpenAPI and SQL. Both request and database payload size are bounded to 32768 bytes (JSONB overhead can make the database limit stricter).

On the first technical edit of an evidence-backed current state, omitted technical values are copied from the current observation, then the patch is applied. The resulting summary is explicitly UNVERIFIED. Existing observation/evidence records and pointers remain untouched, preserving their historical identity and attribution. Label-only region edits do not demote an assessment. Phase 1C-2B2 must explicitly reconcile/clear the unverified flag when promoting a new evidence-backed current assessment; that workflow is not implemented here.

## Boundary, permission and lifecycle

The same-origin, JSON-only Next.js routes accept a mandatory `X-Workspace-Reference` precondition. Fresh membership-backed bootstrap remains authoritative. Public `hair_core_operation` is a SECURITY INVOKER wrapper around a private function owned by the existing `elifora_hair_writer` NOLOGIN NOBYPASSRLS role. It is not a table owner; the seven existing technical tables retain FORCE RLS and authenticated SELECT-only access. No service-role secret is used.

Membership and location are selection references. The selected membership must belong to the authenticated user, remain active, match the selected active location, and hold the exact command permission in an active organization. The service rechecks after the existing organization advisory lock and before receipt replay. Creation requires `hair_passport.create`; the other commands require `hair_passport.update`. Existing `clients.read` and `hair_passport.read` policies remain prerequisites. Another membership's stronger role cannot authorize the selected role. Organization derives from the verified membership and authorized client. Unknown/foreign clients and regions return their NOT_FOUND errors. Hidden revoked memberships follow the existing workspace error semantics without probing inaccessible rows.

Passports and regions are organization-owned technical history; location selects authorization scope and does not partition a client's retained technical state. Client, organization, passport relation, region type, creation identity, status and current observation pointers are not mutable request fields. Archived clients return CLIENT_ARCHIVED; archived passports reject updates and reserve their durable unique client relationship; archived regions return HAIR_REGION_NOT_FOUND. No archive/restore operation is exposed.

Passport creation atomically inserts ROOT, MID_LENGTHS and ENDS. A narrow internal initialization predicate allows these three inserts with create permission only when the parent was created by this actor in the same statement and is active at version 1. Independent region creation still requires selected-context update permission. The existing unique index prevents duplicate active defaults. CUSTOM requires a nonblank label; other region types retain the foundation's optional-label behavior.

## Concurrency, retries and audit

All four commands use the existing organization advisory lock, shared with client archive and technical guards. Updates require the current positive integer `expected_version`; existing guards increment it once. Stale updates return CONFLICT. An update explicitly supplying unchanged values is accepted and advances the version, consistent with the existing guarded update boundary.

Private RLS-protected receipts are keyed by organization, authenticated actor and request_id, retained for 24 hours. A canonical JSONB SHA-256 hash binds operation, selected membership/location, client and payload excluding request_id. Identical retries replay original result data before checking expected_version; the current request gets its own correlation ID. Reusing a key with different data yields CONFLICT. Expired receipts are cleaned for the current actor/organization during writes. After expiry, durable passport/default uniqueness and expected_version still prevent accidental duplication or lost updates. A repeated custom-region create after expiry requires a new product decision; the retry guarantee is explicitly 24 hours.

Receipts contain only the affected resource DTO: passport creation includes the three defaults, passport update returns an empty regions array, and region mutations return only that region. Existing read projection supplies the result; physical-test/history collections are never persisted in receipts or returned by these operations. A replay returns the historical successful mutation result, not a fresh snapshot. Current authorization and parent lifecycle are checked first. The transaction rolls back the write, audit and receipt together on failure.

Existing append-only audit triggers record hair_passport.created/updated and hair_region.created/updated, database-stamped actor, organization, resource/client/passport identity and correlation ID. Update metadata contains changed column names only, never raw technical values or notes. Successful retries add no audit events. Default creation generates three region events alongside the passport event.

## Contracts and verification

OpenAPI 0.4.0 defines four HTTP mutations, their shared technical partial-state shapes, the strict command/result models and authenticated RPC transport. Common errors gain HAIR_PASSPORT_ALREADY_EXISTS, HAIR_REGION_NOT_FOUND, HAIR_REGION_ALREADY_EXISTS and INVALID_TECHNICAL_STATE. Responses carry private/no-store and matching correlation headers; provider errors and malformed responses are normalized by the server adapter.

The original 445 pgTAP assertions remain unchanged. Focused new database tests cover real allow/deny behavior, tenancy, revoked membership, immutable request fields, partial states, retained observations, optimistic versions, retries, deterministic defaults, archive behavior, direct-write denial and payload-free audit. Shared request fixtures validate both OpenAPI and Zod; server and route tests cover permissions, malformed responses, workspace changes, CSRF, bounded bodies and error mapping. Existing CI also builds and checks unchanged Android and runs Web browser regressions.

Next: Phase 1C-2B2 — Technical observation + evidence + physical test + technical history mutation service. No Web or Android UI.
