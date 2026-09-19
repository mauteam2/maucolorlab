# ADR 0013: Live physical-test mutation service

Status: accepted for Phase 1C-2B2B1.

POST `/api/clients/{clientId}/hair-passport/tests` invokes authenticated
`hair_physical_test_operation`. It appends one physical test and one directly
linked PHYSICAL_TEST evidence row, required audit and an existing mutation receipt
in a single transaction. It creates no observation, history event or assessment
selection. Previous facts, passport/region versions and unverified state remain
unchanged. No optimistic version is needed for this independent append.

The existing schema names are POROSITY, ELASTICITY and STRAND. Results reuse the
required KNOWN/UNKNOWN/NOT_APPLICABLE state/value union. KNOWN requires bounded
nonblank text, the other states require null. Phase 1C-1 defines no per-test
outcome enum; inventing one would redesign the established contract. Bare text,
numeric/object values, missing results and contradictory states are rejected.
Notes remain optional bounded text. There are no pass/fail, safety, recipe or
service eligibility decisions.

Current live recording derives performer from auth.uid() and performed/observed
time from statement_timestamp(). Created actor/time are stamped by the existing
guards. Evidence confidence is UNKNOWN, verifier/context/relevance are null.
Callers cannot set ownership, actors, timestamps, source or correction links.
Optional location is validated as an accessible active same-organization location
under existing location RLS; omission records the selected workspace location.
No imported/historical-performer workflow is introduced.

The server reuses fresh workspace bootstrap and the shared bounded same-origin
JSON HTTP boundary. The selected active membership must hold add_test; another
membership's stronger role cannot authorize it. Existing clients.read and
hair_passport.read remain parent-access prerequisites. Organization comes from
the verified workspace. Client/passport/optional active region ownership and
provenance location are checked before receipt replay, with authorization repeated
after the existing organization advisory lock. Foreign and missing references
share the same NOT_FOUND errors; revoked membership cannot replay prior success.
Permission is not competency certification.

The existing NOLOGIN/NOBYPASSRLS writer owns no tables. FORCE RLS, immutable guards
and authenticated SELECT-only grants remain. A verified foundation dependency
blocked add_test-only roles: evidence insert required add_observation. The forward
migration narrowly extends that policy and guard to PHYSICAL_TEST evidence when
the actor has add_test. All other evidence sources still require add_observation.
No observation service behavior, public evidence endpoint or additional writer is
introduced. The service creates the required test in the same transaction.

The shared organization/actor/request_id receipt stores the original result for
24 hours. The hash includes operation, selected membership/location, client and
payload. Same-key changed data/context/operation conflicts; identical retries
return original data with the current correlation and create no new facts/audit.
After expiry a request can append again; this is the existing bounded retry
guarantee, not permanent deduplication or event sourcing. Any transaction failure
rolls back evidence, test, audit and receipt together.

The new hair_physical_test.created event identifies test type, region, evidence,
client/passport and actor without raw results or notes. Existing hair_test.recorded
and hair_evidence.added trigger events remain compatible. Audit read policies
are unchanged.

OpenAPI 0.6.0 adds one HTTP mutation and its RPC transport, strict command/result
shapes, common errors and shared fixtures. The response embeds the existing
HairPhysicalTest DTO. Existing paginated GET exposes appended tests without any
read-model or pagination change. Focused pgTAP and service tests protect these
boundaries; the previous 524 database assertions remain unchanged.

Next: **Phase 1C-2B2B2 — Technical History mutation service only. No Web or Android UI.**
