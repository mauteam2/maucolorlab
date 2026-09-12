# ADR 0012: Atomic observation and evidence writes

Status: accepted for Phase 1C-2B2A.

## One append and current selection

POST `/api/clients/{clientId}/hair-passport/observations` calls the authenticated `hair_observation_operation` RPC. One transaction creates exactly one evidence row and one observation row, selects that observation on the passport or region, appends audit, and stores the receipt. Failure rolls back all five effects. Evidence is mandatory, including UNKNOWN and NOT_ASSESSED observations. There is no standalone evidence creation/update endpoint.

The Phase 1C-1 observation is a complete typed assessment rather than an EAV field row. The `technical` object names any nonempty subset of existing state/value fields or notes; omitted fields become NOT_ASSESSED/null in this **new assessment**, not copied values with new provenance. This differs deliberately from a B1 core partial update. The current pointer is selected explicitly using the target's expected_version, not by source priority, confidence or observation date. New facts automatically supersede the prior current observation and its evidence in the same scope. Prior rows remain immutable and retain their source, actor and timestamps. There is no correction/delete endpoint or event-sourcing framework.

The result embeds the existing HairObservation/HairEvidence read DTOs. Existing GET immediately exposes the selected assessment with `state: ASSESSED`, whose evidence source still determines what is actually verified. Region observations change only that region's pointer/version. Global observations change only the passport pointer/version. No read format or read query changes are required.

Replacing B1 UNVERIFIED state requires `replace_unverified: true` plus the current target version. The operation clears the active unverified flag but never launders those stored values into evidence. Omitted fields in the new observation remain NOT_ASSESSED. Prior unverified columns are inactive, while old evidence-linked facts and supersedes references remain available. The caller's acknowledgement is bound into the receipt hash.

## Sources and professional declarations

All five existing evidence sources are supported. Non-professional sources may carry explicit observed_at, canonical confidence 0–1 or UNKNOWN, context and relevant_until. Missing observation time/confidence means UNKNOWN. Non-professional known observation time cannot follow recording time; relevance requires a known observation time and cannot precede it. The provenance location is the verified selected location, never caller supplied. Recording actor/time always come from the database.

PROFESSIONAL_VERIFIED requires a fresh `attestation: PERSONALLY_ASSESSED` declaration. The server derives verifier identity from auth.uid() and the observed time from statement_timestamp(); callers cannot supply either. Changing an AI source string alone fails validation. A professional may make a new personal assessment that supersedes an AI observation, but the prior AI row cannot be relabelled or acquire a verifier. Authorization is not competency certification.

AI_ESTIMATE records declared AI provenance without calling a model or certifying that a provider ran. It carries no professional verifier. A future trusted AI producer can call the same service boundary after its own authorization; no AI gateway or provider identity protocol is introduced. PHYSICAL_TEST/HISTORICAL provenance may describe external information; it does not create internal physical-test or technical-history records. No final confidence calculation or freshness/risk engine exists here.

## Authorization and concurrency

The existing same-origin, streamed-size-bounded JSON HTTP boundary is reused through an executor parameter; existing core routes keep their executor and behavior. The server verifies the selected workspace and authenticated actor. The private RPC implementation uses the existing NOLOGIN/NOBYPASSRLS hair writer, not a table-owning or service-role connection. The selected active membership must itself hold hair_passport.add_observation. Active organization/location, client, passport and optional same-passport region are checked; access is rechecked after the existing organization advisory lock and before receipt replay. Existing clients.read/hair_passport.read RLS prerequisites remain. Archived and inaccessible resources follow B1 errors without cross-tenant existence disclosure.

add_observation alone permits selecting only an observation appended by this actor in this statement, in the same passport/region. A narrow RLS/guard predicate allows that pointer change and clearing the unverified flag; the guard compares all other columns before database timestamp/version stamping. It grants no core-field, label, lifecycle or ownership edit capability. Existing update permission retains its previous behavior. RLS, immutable fact guards and composite foreign keys remain defense in depth.

The target's expected_version prevents lost current-state selections and coordinates with B1 core edits. Receipt replay precedes the version check. The existing hair_core_mutation_receipts table is reused with the distinct `add_observation` operation in the same canonical hash and organization/actor/request_id key. Retention/retry guarantees remain 24 hours; a key used by another core operation conflicts. Replay returns original data with the current correlation ID. Time-sensitive evidence validation follows successful replay, so a later clock does not invalidate a committed result. After expiry, the old expected_version prevents duplicate appends from the same stale request.

## Audit and verification

The service appends hair_observation.created and hair_evidence.created with IDs, client/passport/region, actor, source and supplied field names, without raw values, context, confidence or notes. Existing .added trigger events remain for compatibility with the original audit consumers and tests. Current-pointer updates retain existing passport/region update audit. Retries add no events.

OpenAPI 0.5.0 adds only this HTTP mutation and its RPC request/result; INVALID_OBSERVATION, INVALID_EVIDENCE and INVALID_CONFIDENCE extend the common error vocabulary. Shared fixtures cover every source and malformed state/provenance. New database tests exercise actual RLS allow/deny, separate add-only permission, full rollback after evidence insertion, retry behavior, retained AI attribution, regional ownership, current-read compatibility, explicit unverified replacement and revocation. The original 489 database assertions are preserved unchanged.

Next: **Phase 1C-2B2B — Physical Test + Technical History mutation service. No Web or Android UI.**
