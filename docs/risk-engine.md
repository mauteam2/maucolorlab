# ELIFORA Risk Engine 1.0.0

This deterministic technical planning assessment describes observed cosmetic concerns and unresolved information. LOW means no escalating structured fact in the available profile, never guaranteed safe hair, an approved service, a cleared allergy, or a formula. There is no medical diagnosis, product compatibility inference, lift prediction, processing instruction, new UI or persisted assessment.

## Architecture and Confidence relationship

`lib/risk/input.ts` validates the same complete bounded Hair Passport input as Phase 1D, including provenance, region identity, chronology, pagination and supersession. The entire supplied Confidence result must equal the result of the existing Confidence engine on this snapshot and clock. Forging just a band, ref, fingerprint or unknown property fails with RISK_INPUT_INVALID. This binding deliberately runs Phase 1D again in memory; it does not recreate Confidence rules or query the database again. `dimensions.ts`, `physical-tests.ts`, `gate.ts` and `engine.ts` separate facts, test requirements, hard stops and final assembly. `rules.ts` centralizes versioned defaults and vocabulary. All core functions have no database, HTTP, implicit clock, randomness or provider dependency.

Version is `risk-engine/1.0.0`. Evaluation time comes from the caller's validated server snapshot. Fingerprints use canonical sorted JSON and SHA-256 and incorporate Confidence input/rules and any explicit scope declaration. Same input/clock/rules produces the entire same result. Rule changes require a reviewed version and golden expectations. No optional numerical risk score is used; ordinal severity and reasons are authoritative.

## Dimensions and facts

Eight dimensions: HAIR_INTEGRITY, CHEMICAL_HISTORY, LIGHTENING_HISTORY, REGIONAL_COMPLEXITY, POROSITY_ELASTICITY, EVIDENCE_INFORMATION, PHYSICAL_TEST_SUFFICIENCY and TECHNICAL_CONSISTENCY. Each dimension and the overall risk use the maximum meaningful band: LOW, MODERATE, HIGH, CRITICAL. Regional results retain each active standard/custom region separately. Global observations never fill regional facts; an ENDS concern never becomes a ROOT integrity concern. A material variation can request tests in each compared region but remains a separate complexity dimension.

Only selected KNOWN structured porosity HIGH or elasticity LOW with Phase 1D resolved confidence >= 0.40 and a non-unknown/non-expired observation time generates an integrity concern (HIGH). Both in the same target produce COMBINED_INTEGRITY_CONCERN (CRITICAL). Lower-quality, unknown, unassessed or expired information remains an information gap rather than a fabricated damage finding. NOT_APPLICABLE is excluded and does not request an integrity test. A known serious conflict is retained even when the selected value looks benign.

Processing presence comes only from retained structured history-event categories. BLEACH_LIGHTENING is MODERATE; at least two such distinct events per target are HIGH. Supported other chemical categories map through Phase 1D chemical history: one event MODERATE, at least two HIGH. Superseded events do not inflate counts. Unknown lightening/chemical history and unverified event provenance generate information/verification requirements. Distinct historical events are additive. Professional summaries do not erase imported events. No free-text summary, product name, integrity note or strand narrative proves absence/presence of processing, incompatible chemistry, an allergy, deterioration, or a passed physical test.

Reliable differing regional porosity/elasticity or perceived-level difference >= 2 creates HIGH regional complexity. Missing standard regions and insufficient custom-region evidence remain uncertainty. Phase 1D conflicts become HIGH or CRITICAL consistency factors; critical porosity/elasticity conflicts block planning. HIGH Confidence never clears an explicit concern. LOW/INSUFFICIENT Confidence affects only information handling and gate progression, not inferred integrity.

## Adaptive physical tests

Tests are requested per exact target. Porosity/elasticity tests are required when their corresponding applicable field lacks reliable current evidence, or known integrity/variation/conflict requires a fresh technical checkpoint. STRAND is required for known or unknown processing history, unverified history, integrity concern, material regional variation/conflict, a Phase 1D physical-test request, or non-current physical-test evidence. A complete benign profile with current relevant information is not asked every possible question.

Required tests are SATISFIED only by a retained actual physical test of the exact type/target with KNOWN result, PHYSICAL_TEST provenance, FRESH Phase 1D quality and quality >= 0.40. Confidence's 30-day test freshness is reused, including exact threshold, explicit relevance expiry and uncertainty; no independent TTL exists. Superseded/foreign/global evidence cannot satisfy regional tests. Unsatisfied status distinguishes MISSING, STALE and UNRELIABLE and returns stable reason codes and refs. Any fresh narrative STRAND result proves only that a current test was recorded; its prose is never interpreted as a pass, a lifting capability or chemical approval. Any conflicting structured test observations still require conflict review even if a recorded test exists.

Required information reuses Phase 1D codes and adds only PERFORM_POROSITY_TEST, PERFORM_ELASTICITY_TEST and REASSESS_HAIR_INTEGRITY. Requirements are specific to unresolved fields/targets. Satisfied physical requirements remain visible as checkpoints with their refs; they do not create missing-information requests.

## Gate precedence and hard stops

Highest outcome wins in this ascending order:

1. CONTINUE_TECHNICAL_PLANNING
2. CONTINUE_WITH_CHECKPOINTS
3. REQUIRE_ADDITIONAL_ASSESSMENT
4. REQUIRE_PHYSICAL_TEST
5. REQUIRE_STRAND_TEST
6. BLOCK_INSUFFICIENT_INFORMATION
7. REQUIRE_RECOVERY_REASSESSMENT
8. BLOCK_TECHNICAL_PLANNING
9. OUTSIDE_COSMETIC_SCOPE

`canProgress` is true only for the first two outcomes. This describes future technical planning eligibility, never automatic recipe generation. All active stops remain listed, including lower-priority ones. Missing required tests are hard stops. Confidence INSUFFICIENT creates a block even without observed damage; other unresolved information requires assessment. LOW elasticity requires recovery reassessment without any treatment protocol. Combined integrity concern and critical integrity conflict block planning. Recovery cannot be overridden by high confidence or good unrelated regions. No role or query override exists.

The pure domain input supports an explicit DECLARED_OUTSIDE_COSMETIC_SCOPE concern with existing authorized source refs. It always dominates and returns no diagnosis. The present Hair Passport has no structured scope declaration field; the server reports NOT_ASSESSED and does not infer one from narrative notes or offer a new capture workflow. NOT_ASSESSED is not a cleared cosmetic/medical scope. A later structured capture integration must use this existing domain stop; this phase neither invents stored declarations nor accepts a client scope parameter.

## Explainability and API

Every escalation includes stable code, dimension, band, target, optional field, evidence refs and typed context (structured value/count/state). Overall dominant reasons retain localized and information factors. Result includes eight dimensions, regions, gate reasons, hard stops, required tests/information, Confidence relationship, passport/version, clock and fingerprints. No source notes or historical descriptions are copied into responses.

`GET /api/clients/{clientId}/hair-passport/risk?include_archived=false` uses the shared protected assessment reader. One `hair_confidence_snapshot` RPC uses caller JWT and existing SECURITY INVOKER/RLS; no service role, extra SQL schema or migration. Fresh client/Hair Passport permissions are checked before read and again after both engines; workspace changes/revocation deny derived output. Complete input bounds are inherited: ten pages of 100 per timeline, 100 regions. Bounds fail closed, never truncate into LOW. Client identity and correlation must match. Archived client/passport reads require explicit opt-in. Foreign and missing clients are concealed alike. Unknown/duplicate queries (scores, evidence, clock, rules, organization, scope, ignoreRisk) are rejected. Responses/failures are private/no-store with common correlation/error envelopes. OpenAPI 0.9.0 reuses Confidence evidence, target, field and quality contracts.

## Performance and verification

One technical snapshot round trip; no N+1 queries and no network in core evaluation. Grouped Phase 1D resolution and bounded in-memory passes/hash assembly keep interactive evaluation limited. A deterministic synthetic 100-region regression requires pure Risk evaluation, including its Confidence binding, under a generous 2-second CI budget. This is a regression guard, not an end-to-end latency SLA or a claim about all worst-case timelines. Provider/database/page serialization latency is separate.

Human-readable golden fixtures cover complete, uncertain, unknown, historical, regional, damaged-fact, stale/missing tests and scope-declaration profiles. Invariants cover hard-stop dominance, benign confirmation, source authority, exact freshness boundary, ordering determinism, NOT_APPLICABLE, region isolation, malformed/forged inputs and narrative non-inference. Real browser/API security tests run against disposable local Supabase and exercise current physical facts, revocation, archives, read-only roles, cross-tenant concealment and rejected bypasses. Existing Confidence and DB/RLS suites remain required.
