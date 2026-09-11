# ADR 0009: Hair Passport database foundation

Status: Accepted for Phase 1C-1, 2026-09-11.

## Ownership and current state

One durable `hair_passports` row belongs to one organization/client pair. ACTIVE
and ARCHIVED are reversible states; restoring reuses that passport. Composite
foreign keys enforce organization, client, passport and region boundaries. The
only change to existing tables is an additive unique organization/id constraint
on clients; no existing data or migrations are rewritten.

The passport's `current_observation_id` selects an immutable, typed whole-hair
assessment in `hair_observations`. Each `hair_regions` row can similarly select
its own assessment. Scope checks prevent either pointer selecting another region
or passport. Natural/perceived level, grey ratio, thickness, density, porosity,
elasticity, tone, three history summaries and notes are relational observation
columns, not duplicated mutable values or EAV properties. A missing current
assessment means not yet assessed. Selection does not upgrade its evidence source
or claim professional verification; consumers must read the linked evidence.

ROOT, MID_LENGTHS and ENDS are optional conceptual defaults, each unique while
active. Specialized regions may repeat; CUSTOM requires a label. Region identity
is stable and may be archived. No automatic three-region creation is required.

## Unknowns, evidence and corrections

Every measured field distinguishes NOT_ASSESSED, UNKNOWN and KNOWN. KNOWN requires
a valid value; other states prohibit one. NOT_APPLICABLE is supported for relevant
fields, but not natural/perceived level. Levels use 1–10; grey ratio uses 0–1.
Text notes may be absent without pretending a measurement was made.

`hair_evidence` keeps AI_ESTIMATE, PROFESSIONAL_VERIFIED, PHYSICAL_TEST, HISTORICAL
and IMPORTED_UNVERIFIED distinct. Only professional evidence carries a verifier,
which must be the authenticated actor and requires an observation timestamp.
Recorded timestamps and actors are database stamped. Observation-time and
confidence unknowns are explicit. Canonical confidence is PostgreSQL numeric in
the inclusive range 0–1, without rounding before validation; NaN is rejected.
Optional relevant_until cannot precede the observation. No freshness algorithm
or Case Confidence calculation is implemented.

Observations, evidence, physical tests, history events and event/region links are
append-only. Corrections use same-passport supersedes_id links; assessment/test
corrections preserve region scope, and test corrections also preserve test type.
Prior rows remain available. Mutable passport/region pointers advance a database
controlled version and retain old assessments. This is a current-state selection
with durable evidence, not event sourcing or a complete field conflict engine.

`hair_physical_tests` supports optional POROSITY, ELASTICITY and STRAND tests,
explicit result states, physical evidence, authenticated performer and timestamp.
Historical chemical/color events use controlled categories, UNKNOWN/EXACT/
APPROXIMATE date precision, explicit product state, evidence and optional external
salon/professional attribution as text. Recording actor and historical attribution
are separate. `hair_history_regions` supports multiple affected regions. Correcting
an event creates a new event and its region links; original links stay intact.

## Authorization and audit

| Existing role | Read | Create/update | Add observation/test/history |
| --- | --- | --- | --- |
| owner / manager / colorist | Yes | Yes | Yes |
| assistant | Yes | No | No |
| reception | No | No | No |

These grants extend existing Role → Permission rows; they are authorization,
not technical competency certification. Active membership at an active location
permits organization-wide history access, including other locations' provenance.
Evidence/events may store a same-organization location, never location ownership.
Revoked/invited memberships and archived locations/organizations confer no access.
The existing membership model has no separate archived membership status.

Every new table has FORCE RLS. Authenticated callers receive only SELECT, subject
to hair_passport.read. Anonymous and service_role receive no table grants. The
internal NOLOGIN/NOBYPASSRLS `elifora_hair_writer` inherits authenticated access,
has narrowly scoped write policies, owns no tables and cannot be assumed by
application roles. No new callable write function or public endpoint exists.
Its invoker triggers require real membership permissions and active client/parent
passport rows. Future Phase 1C-2 must resolve selected workspace/actor, validate
payloads, enforce expected versions and normalize missing/foreign identifier
errors before invoking this writer through the server boundary.

Client archive preserves readable history but rejects all technical writes.
Technical writes use the same organization advisory lock as Phase 1B client
mutations to serialize against archive. IDs, organization/client ownership and
creation attribution cannot change. No application DELETE/TRUNCATE grants exist;
row triggers also reject deletion and rewriting append-only facts by the owner.

Audit triggers append lifecycle events atomically. Metadata includes client and
passport IDs plus changed field names, with actor/correlation IDs. It excludes
raw notes, measurement payloads and historical descriptions. A caller may supply
a correlation UUID for a future service transaction; updates otherwise generate
a new one. Existing audit immutability and read policies remain intact.

## Indexes and deferred work

Unique tenant/client keys support current passport lookup and composite foreign
keys. Tenant/passport timeline indexes cover evidence, regional observations,
tests and history dates; current pointers and event/region joins are indexed.
Referencing ownership, evidence, correction, provenance and actor keys have
indexes for joins and restrictive foreign-key checks. Nullable correction and
provenance indexes are partial. There are no speculative search/engine indexes.

UI, media, capture, AI analysis, risk/color rules, appointments, competency gates,
server CRUD, idempotency/offline conflict contracts and OpenAPI operations are
deferred. Next: **Phase 1C-2 — Hair Passport server/service contract + read/write
operations + OpenAPI, with no Web or Android UI.**

Design references: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
and [PostgreSQL 17 constraints](https://www.postgresql.org/docs/17/ddl-constraints.html).
