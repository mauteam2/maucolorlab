# ADR 0010: Hair Passport read service

Status: Accepted for Phase 1C-2A, 2026-09-11.

The stable SECURITY INVOKER RPC `hair_passport_snapshot` implements one read-only
snapshot operation. It verifies the authenticated actor, selected membership,
active organization and selected active location, then checks that selected role's
`hair_passport.read` permission. An additional membership with more permissions
cannot authorize the selected role. Existing client-read RLS also applies to the
client lookup. All technical-table RLS remains unchanged; no privileged writer,
new role, direct query interface or mutation is exposed.

Membership/location arguments are references, never authorization claims.
Organization comes from the verified membership. Client lookup uses that
organization; passport lookup uses both organization and client. There is no
passport-ID override. Foreign and nonexistent client IDs both return
CLIENT_NOT_FOUND. An authorized client with no passport returns
HAIR_PASSPORT_NOT_FOUND. Revocation is checked on every call with current database
membership data, independently of JWT lifetime. No technical data accompanies an
error. Existing shared error and correlation conventions are reused.
When RLS hides a selected membership, the RPC follows workspace bootstrap:
no usable contexts yields MEMBERSHIP_REVOKED; another usable context yields
TENANT_CONTEXT_INVALID. This avoids disclosing whether an arbitrary reference
identifies a hidden revoked row. Revocation still denies the very next read.
Omitted RPC correlation IDs use a call-site UUID default. Explicit null is an
invalid RPC argument (provider error); generating random values inside the STABLE
read body is avoided so its volatility declaration remains accurate.

The Web server adapter reuses verified workspace bootstrap, then invokes this
RPC with the authenticated Supabase client. GET `/api/clients/{clientId}/hair-passport`
accepts only read options; organization, location, membership, role and passport
overrides are rejected. Every response is private, no-store with a matching
body/header correlation UUID. The adapter validates the complete result before
returning it, including requested client, archive option, page metadata, regional
relationships and evidence semantics. Malformed provider data fails closed as
NETWORK_ERROR without exposing raw payloads or provider messages.

The OpenAPI 0.3.0 read model is an explicit projection, not a raw row dump:

- Passport identity/status and client archive status; core assessment.
- All technical regions, labelled ACTIVE/ARCHIVED, with current assessments.
- Typed observations nested under core/region assessments, each with evidence.
- Independent pages of physical tests and chemical history with region links.
- Evidence includes source, confidence, observation/recording times, actor,
  verifier, optional provenance location/context and correction reference.

There is no current observation when assessment state is NOT_ASSESSED. Field
states retain KNOWN/UNKNOWN/NOT_ASSESSED/NOT_APPLICABLE exactly; null is meaningful
only alongside its state. Confidence stays numeric 0–1 or explicitly UNKNOWN.
AI evidence cannot carry a professional verifier. Evidence is embedded only
where needed to understand returned values/tests/history; unrelated or superseded
observations and orphan evidence are not a general evidence-directory endpoint.
Correction IDs preserve links without expanding the full historical version graph.

Default reads exclude archived clients/passports with their corresponding
NOT_FOUND error. `include_archived=true` explicitly requests retained technical
history with the same authorization checks. Passport ownership is organization
level; another same-organization location's provenance never blocks safety history.
Archived region records remain labelled in snapshots so historical links resolve.

One stable database invocation sees one statement snapshot. A set of current
observation IDs joins directly to observations and evidence, avoiding a scan of
superseded observations. Test/history queries select one lookahead row, then join
evidence and aggregate affected region links in sets, with no per-item SQL calls.
Existing organization/passport, current-reference and timeline indexes cover the
queries; no new index is needed. Regions sort by creation time/ID. Tests sort by
performed time descending/ID ascending; history sorts by performed date descending
(unknown dates first)/ID ascending. Paging defaults to 50, maximum 100; independent
offsets are bounded at 10000 like the existing directory approach. `has_more` and
`next_offset` disclose truncation. Pages are fresh reads; appends can shift later
offsets. This is not a cross-request historical snapshot or an export API.

Reads do not append audit events or modify technical records. There is no UI,
Android adapter, mutation, AI/confidence calculation, risk/color logic or new media
workflow. Shared fixtures exercise OpenAPI and strict server mapping; pgTAP checks
actual RPC authorization and serialization while preserving all prior assertions.

Next: **Phase 1C-2B — Hair Passport mutation service contract: create/update
passport, regions, observations, evidence, physical tests and history. No Web or
Android UI.**
