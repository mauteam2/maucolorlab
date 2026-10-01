# ELIFORA Confidence Engine 1.0.0

This engine assesses the reliability and completeness of technical information. It does not assess hair safety, approve a service, interpret strand-test text, or suggest chemical products, formulas or processing parameters.

## Architecture and reproducibility

`lib/confidence/input.ts` strictly validates existing Hair Passport snapshots and normalizes evidence. `rules.ts` centralizes the immutable versioned product defaults. `resolver.ts` evaluates evidence quality and relevance. `engine.ts` produces domains, uncertainty, conflicts and information requirements. These modules have no database, network, auth, UI, randomness or implicit clock. SHA-256 is used only as a deterministic hash.

The caller supplies `evaluatedAt`. The same normalized input and rules yield the same entire result. Input and rules fingerprints are SHA-256 over canonical, sorted JSON; source records are not logged. The engine version is `confidence-engine/1.0.0`. Changing any rule requires a new version and reviewed golden expectations. Defaults are configuration in source, not clinically validated expiration periods and not a runtime client/admin rule editor. No derived assessment is persisted; source Hair Passport evidence remains authoritative. A future consumer retaining an assessment must retain its version, rules fingerprint and evaluation time.

## Quality and resolution

Source caps: physical test 0.95, professional verification 0.90, historical 0.65, AI estimate 0.35, imported/unverified state 0.25. Verification is not infallible. Explicit confidence, if present, multiplies the cap; unspecified confidence uses a documented 0.90 information-quality factor, never a fabricated explicit probability. Evidence is considered only in its own field and target. A physical porosity/elasticity test additionally contributes to that structured field; strand-test narrative is never interpreted as porosity/elasticity or safety.

Candidates rank by quality after freshness, then authoritative observation time, current-assessment relevance, then stable reference. NOT_ASSESSED default fields in unrelated append observations do not erase older information. Explicit current UNKNOWN or NOT_APPLICABLE forms a boundary: older observations cannot resurrect a value; only a newer relevant professional observation or physical test can enrich it. Unverified current explicit unknowns lack authoritative observation time and require re-assessment. Supersession applies only within a record kind, field and target. Historical events establish reported event presence, not proof that the entire history is complete or that no other chemical events occurred.

Global and regional evidence are separate. ROOT information does not fill ENDS, and a whole-hair test does not claim region-specific results. Every active specialized/custom region counts; archived regions are excluded. ROOT, MID_LENGTHS and ENDS must exist or a missing-region gap is returned.

## Freshness

Product defaults in days: perceived level, porosity, elasticity and physical tests 30; grey ratio 60; density 90; natural level and thickness 180. At exactly the threshold evidence remains fresh. Between one and two thresholds the quality factor is 0.50; beyond twice the threshold it is 0.20. An elapsed explicit `relevant_until` makes evidence expired. Unknown observation time uses 0.50. Recording or serialization time never substitutes for observation time. Unverified values have unknown measurement time.

Cosmetic color, bleach/lightening and chemical history have no time-based expiration. An old event remains historical evidence; unknown event dates remain unknown. Imported/unverified history remains marked for verification. Freshness is an information-quality heuristic, not a chemical/manufacturer recommendation.

## Confidence and uncertainty

Domains: LEVEL (natural/current), GREY, INTEGRITY (porosity/elasticity/thickness/density), COSMETIC_COLOR_HISTORY, BLEACH_HISTORY, CHEMICAL_HISTORY, REGIONAL_COVERAGE and PHYSICAL_TEST. A known field receives resolved quality; UNKNOWN and NOT_ASSESSED receive zero with distinct reason codes; NOT_APPLICABLE is excluded from the denominator, not penalized as unknown. An entirely inapplicable target contributes 1 as an exclusion convention, never an inferred measurement.

Each field domain takes the minimum of its target means. Regional coverage takes the minimum technical mean across active regions, or zero if a standard region is missing. This prevents averaging away regional uncertainty. Domain weights, respectively, are 2, 1, 3, 2, 3, 3, 3, 3. Overall confidence is their weighted mean, expressed in the existing 0–1 confidence representation and rounded to three decimals. Bands: HIGH >= 0.80, MEDIUM >= 0.60, LOW >= 0.30, otherwise INSUFFICIENT. Consumers should show bands or whole percentages, not exaggerated numerical precision.

Critical fields are natural level, bleach history, porosity and elasticity in each applicable target. Missing/unknown, resolved quality below 0.40, expired evidence, or an unresolved conflict on a critical field overrides the overall band to INSUFFICIENT. Missing standard regions also override it. This means insufficient technical information for a later reliable decision, never unsafe hair or denied service. The numerical summary is retained alongside the hard-gap explanations.

Conflicts are evaluated between fresh or historical known field observations with quality >= 0.20. Level differences >= 2, grey differences >= 0.20 and differing structured categories are significant. Different history summary strings receive DIVERGENT_HISTORY_SUMMARIES: they require review, but the engine does not interpret free text as proof of incompatible chemistry. Distinct historical events are additive, not contradictions merely because their descriptions differ. One conflict item per field/target includes the strongest opposing references; the selected field quality is multiplied by 0.60. Stale evidence remains reported even when stronger recent evidence resolves the field. A selected stale/expired item generates a refresh requirement.

Severity describes information limitations: critical-field gaps/conflicts and missing standard regions CRITICAL; physical-test absence, regional gaps and verification needs HIGH; other missing/stale information MODERATE. LOW is reserved for later rules. No severity is a damage, medical or service risk score.

## Stable codes

Reasons: FIELD_NOT_ASSESSED, FIELD_UNKNOWN, EVIDENCE_STALE, EVIDENCE_EXPIRED, EVIDENCE_TIME_UNKNOWN, LOW_QUALITY_EVIDENCE, SOURCE_QUALITY_LIMIT, CONFIDENCE_UNSPECIFIED, EXPLICIT_CONFIDENCE_LIMIT, CONFLICTING_EVIDENCE, DIVERGENT_HISTORY_SUMMARIES, REGION_NOT_ASSESSED, HISTORY_UNVERIFIED, PHYSICAL_TEST_MISSING, CRITICAL_INFORMATION_GAP.

Information requirements: ASSESS_NATURAL_LEVEL, ASSESS_CURRENT_LEVEL, ASSESS_GREY, ASSESS_POROSITY, ASSESS_ELASTICITY, ASSESS_INTEGRITY, VERIFY_COLOR_HISTORY, VERIFY_BLEACH_HISTORY, VERIFY_CHEMICAL_HISTORY, PERFORM_STRAND_TEST, VERIFY_REGION, REVIEW_CONFLICTING_EVIDENCE, VERIFY_IMPORTED_HISTORY, REFRESH_EVIDENCE. Requirements propose information gathering only, and are never automatically performed.

Result metadata uses stable domain/field/target and reason codes with evidence references, not copied notes or history text. A target is GLOBAL, an authorized region UUID, or MISSING followed by a standard-region type. UI localization can map these codes in a later phase; there is no new UI in Phase 1D.

## Secure read API

`GET /api/clients/{clientId}/hair-passport/confidence?include_archived=false` requires fresh client and Hair Passport read permissions. It accepts no organization, rule version, clock, evidence payload or score override. The server uses the caller's session and verified selected membership/location; it never uses a service-role credential. It rechecks the workspace after evaluation before returning sensitive derived data. Results and failures are private/no-store, with matching correlation headers/envelopes. Archive reads remain opt-in and read-only. Foreign client IDs and missing client IDs share CLIENT_NOT_FOUND.

`hair_confidence_snapshot` is a STABLE SECURITY INVOKER RPC with caller RLS and an empty search path. It reuses existing snapshot projection/authorization within the same database MVCC snapshot and one transport round trip. It returns at most ten 100-record pages per timeline and at most 100 regions. Every page is validated for identity, offsets, complete lookahead, duplicate references and consistency before scoring. The operational bound fails closed with CONFIDENCE_INPUT_LIMIT; truncation never produces HIGH. Malformed source input fails closed with CONFIDENCE_INPUT_INVALID. No schema of existing Hair Passport tables or RLS policies changes; no audit events or derived-score tables are created.

The forward lint-correction migration removes a redundant outer loop-index declaration reported by `plpgsql_check`; PostgreSQL's integer FOR loop already declares that index. It preserves the read behavior, security mode, grants and limits. Database tests exercise the final migration chain rather than bypassing lint warnings.

The existing technical-history browser test assumed that region links were ordered by display name, although the contract serializes the region-ID set in UUID order. Its regression assertion now checks the exact selected region set within the matching lightening-history record. It still rejects missing, extra and duplicate region labels, and leaves the existing UI unchanged. This corrects the demonstrated CI nondeterminism rather than changing production ordering or skipping coverage.
