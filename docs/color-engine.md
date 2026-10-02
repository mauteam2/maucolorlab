# ELIFORA Color Engine 1.0.0

Phase 1F provides brand-independent technical planning. It creates immutable targets and an initial Recipe Draft; every draft has `executionStatus: REQUIRES_BRAND_ADAPTER`. There are no manufacturer codes, developers, mixing ratios, grams, processing times, prices or chemical compatibility decisions. Web and Android screens remain unchanged.

## Authoritative chain

The server loads target and the complete bounded Hair Passport in one caller-RLS snapshot. It invokes the existing Confidence and Risk engines, then the pure Color Engine. Color Engine never calls either upstream engine. It checks source, clock, identity and rule fingerprints and consumes the supplied assessments. Fingerprints establish reproducibility, not authentication of a caller-supplied assessment. The API accepts only target and request IDs. The existing Risk Engine independently verifies its Confidence binding in memory; that behavior is unchanged.

The Color Engine is deterministic: explicit snapshot clock, no database access, network, randomness or implicit time. Rules and controlled reasons are in `apps/web/lib/color/rules.ts`. Substantive changes require a reviewed engine version. Generic tone families express professional target intent; source tone narratives are never interpreted as manufacturer chemistry.

Non-progressing gates return structured `REQUIRES_ASSESSMENT`, `REQUIRES_TEST`, `REQUIRES_RECOVERY` or `BLOCKED_BY_RISK` results with no primary strategy, alternatives or Recipe Draft. All Risk physical tests and information requirements survive unchanged. Target-specific lift additionally requires qualified regional strand evidence through the same evidence qualification helper used by Risk. An UNKNOWN current level is never inferred from a global or neighboring region. NOT_APPLICABLE integrity remains distinct from UNKNOWN.

## Regional targets and planning defaults

Schema 1 supports ten modes: UNIFORM_COLOR, ROOT_REFRESH, ROOT_SHADOW, GREY_COVERAGE, LIGHTENING, TONING, COLOR_CORRECTION, FILL_PREPIGMENTATION, DIMENSIONAL_COLOR and MULTI_REGION_CUSTOM. Every active region needs an explicit objective, including preserve intent. Region identifiers are relationally bound to the same client/passport. Optional custom, face-frame and banded regions are supported alongside ROOT, MID_LENGTHS and ENDS. Numeric levels allow 1–10. Tone vocabulary is NEUTRAL, ASH_COOL, VIOLET, BLUE, GREEN, GOLD_WARM, COPPER, RED or MIXED with two or three distinct controlled families.

Targets record warmth, grey coverage, lift/deposit priority, reflection intent, contrast, preservation, isolated handling and correction/intermediate goals. Missing levels/tones, duplicate/foreign/absent regions, conflicting preservation or priorities, mixed-tone errors, conflicting uniform goals and missing band/accumulation intermediate goals produce structured issues. No target is guessed.

Positive current→target delta up to 1 is SMALL; above 1 through 3 is MODERATE; above 3 is MAJOR. A darkening delta of at least 3 suggests generic fill/prepigmentation. These are planning thresholds, not achievable-lift predictions. Known cosmetic history prompts review; actual previous lightening prompts separate handling. Histories use structured event categories, never keywords in narratives. Grey COVER with verified regional ratio ≥0.5 flags a natural-base support candidate without a manufacturer ratio. Porous ends are scheduled later with an integrity checkpoint. Actual banded areas are isolated. Resistance is not inferred when no structured evidence exists.

Feasibility is DIRECT, CONDITIONAL, MULTI_STAGE, MULTI_SESSION, INFORMATION_REQUIRED, RECOVERY_REQUIRED or BLOCKED_BY_SAFETY_GATE. The conservative strategy is primary. Major lift may offer a MULTI_SESSION alternative; SINGLE_SESSION_PROGRESS is offered only for qualified simpler profiles and explicitly compromises to partial progress. Strategies are eligible for planning and remain non-executable until Brand Adapter. Session ranges are planning estimates: simple 1; staged 1–2; major 2–4; previously lightened major 3–6. They guarantee neither an outcome nor service clearance.

Stages use controlled ASSESS, PREPARE, FILL_PREPIGMENT, REDUCE_CORRECT, LIGHTEN, DEPOSIT, NEUTRALIZE, TONE, ROOT_APPLICATION, LENGTHS_APPLICATION, ENDS_APPLICATION, REASSESS, RECOVERY and FINALIZE vocabulary. Only applicable stages are emitted. Strategies retain regional intentions, checkpoints, physical tests, information, Risk reasons and tradeoffs. Recipe V1 has ENGINE origin, null parent, deterministic identity, target revision, strategy and engine metadata. Future lineage can support professional/test/session revisions; those workflows are not implemented.

## Persistence and trust boundary

`color_target_versions` is append-only with revision series, previous-version linkage, actor, organization/client/passport/location, request identity/hash and ordered version. `color_target_regions` retains relational region ownership and objective core fields. Revision writes use expected version and idempotent request IDs. Old plans retain their exact historical target revision.

`color_plans` stores relational owner/client/target/passport/version, engine versions, fingerprints, lifecycle and execution status, recipe identity/version and actor/time plus a strictly modeled structured result. The app never updates or deletes existing targets or plans. Correlation IDs and meaningful created/revised/generated audit events use existing append-only audit infrastructure. Reads and idempotent replays add no audit spam.

Both public RPCs are SECURITY INVOKER. Controlled private writers inherit authenticated, have NOBYPASSRLS and run with an empty search path. Forced RLS and fresh database membership permissions enforce tenancy. No app write uses a service-role key. Owner, manager and colorist can create/read; assistant can read; reception cannot access this slice.

Plan generation uses two bounded RPC calls, not region-by-region queries. Preparation returns a complete snapshot plus a database SHA-256 token over its technical pages. The server signs an exact UTF-8 JSON envelope using HMAC-SHA256. Store verifies its signature, authenticated actor/membership/location/client/organization, target revision, clock/expiry and a newly loaded technical source token under the existing organization write lock. Changed source or revision produces a 409 conflict; the caller must obtain a new request and reassess. Identical successful requests return the original stored result. Signing envelopes are private and excluded from read projections.

The signing key lives in the unexposed private key table. Only the narrow private verification helper reads it. Normal JWT callers cannot sign arbitrary plans. A private server environment variable `ELIFORA_COLOR_PLAN_SIGNING_KEY` must match the selected environment's private key. Missing configuration fails closed with COLOR_ENGINE_UNAVAILABLE. Key rotation/infrastructure provisioning are operational responsibilities; there is no public key-retrieval endpoint. CI provisions a randomly generated disposable local key, masks it and checks browser bundles for its absence. Do not copy this key to NEXT_PUBLIC variables, Android, fixtures, logs or commits.

## API and verification

- POST `/api/clients/{clientId}/color-targets` creates a target.
- PATCH the same path appends a revision with series_id and expected_version.
- GET `/api/clients/{clientId}/color-targets/{targetId}` reads an exact revision.
- POST `/api/clients/{clientId}/color-plans` accepts request_id and target_id only.
- GET `/api/clients/{clientId}/color-plans/{planId}` reads an immutable result.

Writes require same-origin JSON and a current X-Workspace-Reference; bodies are streamed with a 128 KiB limit. Reads accept only optional include_archived=true/false. Replies include correlation headers and private/no-store. Foreign and missing resources share the same error class. Supplied risk, confidence, evidence, organization, overrides or chemistry are rejected. Non-progressing planning is a successful persisted assessment with an explicit status; forbidden access, invalid targets and conflicts use controlled HTTP errors. OpenAPI 0.10.0 includes the strict schemas and common error envelope.

Golden fixtures cover the requested 26 scenarios, with stage ordering, checks, reasons, regional handling and execution-status assertions. Invariants cover ambition monotonicity, unknown/inapplicable states, target revision identity, source binding, regional concern preservation and hard stops. DB pgTAP checks signing, tenant isolation, revoked/anonymous/assistant permissions, target lineage, audit, source conflicts and immutable ownership. Real-session Playwright exercises blocked and normal signed persistence in desktop and mobile browser contexts. Performance checks evaluate 100 canonical plans in memory within five seconds without N+1 reads.

Local database/RLS and E2E require Docker and disposable Supabase. This Windows environment lacks Docker and the browser development server lacks local Supabase configuration; CI performs those checks against disposable local services. No production environment is connected or migrated.

Next phase: **Phase 2A — Pigment Vector Engine + Verified Brand Catalog/Brand Adapter Foundation + Chemical Compatibility Matrix.** It is not started here.
