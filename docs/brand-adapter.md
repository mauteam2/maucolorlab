# ELIFORA Brand Adapter Foundation

Version: `brand-adapter/1.0.0`. Phase 1F remains unchanged: generic recipes are version 1 with `REQUIRES_BRAND_ADAPTER`. Phase 2A creates a separate immutable schema-version-2 brand draft with a reference to the original recipe fingerprint.

The service loads a caller-authorized stored Color Plan and a complete current Hair Passport snapshot. It compares that snapshot against the original plan's technical data, recomputes Confidence → Risk → Color at the current evaluation time and then derives a Generic Technical Requirement. That requirement preserves regional targets, tone/neutralization intent, lift/deposit and coverage priorities, application strategy, risk restrictions, required tests and checkpoints. Developer selection is restricted to verified compatibility. Clients submit identifiers and an optional controlled salon opt-in; they never submit engine outputs or verification fields.

The adapter only matches exact documented level/tone claims for a simple, single-session, single active objective, using verified relevant pigment and capability facts. No mixing optimizer, neutralization math, multi-region formulation, stock override or manufacturer fallback is introduced. Complex cases remain `BRAND_MATCH_PENDING`. Unresolved safety information/tests produce `BLOCKED_BY_SAFETY`; unknown or untrusted data produce `BLOCKED_UNVERIFIED_PRODUCT`, `BLOCKED_MISSING_TECHNICAL_DATA` or `BLOCKED_COMPATIBILITY`.

`BRAND_READY` means **verified product/developer candidates and operating references are ready for professional review**. It is not authorization to apply chemicals: every resulting draft has `executable: false` and `professionalReviewRequired: true`. Absolute amounts, final formulations and automatic execution are outside this foundation. Verified ratios and processing times are preserved as source facts, never calculated or invented.

Persistence uses caller JWT/RLS and the existing private Color signing key, never a service-role browser credential. The signed envelope binds actor, membership, organization, location, client, plan, request, catalog fingerprint, salon opt-in, current source token and a short expiry. The database independently checks current tenancy, active client/passport, latest target revision, current source, published catalog, product/rule snapshots and blocked Color Plan status before inserting. Reads revalidate access again before returning protected output.

Retries with the same request ID return the original immutable result; changed plan/catalog/client/salon opt-in conflicts. Catalog replacement, product retirement and changed assessment do not rewrite historical drafts. A historical read is not a new permission to execute.

OpenAPI `0.11.0`:

- GET `/api/brands?catalog_id=…`, `/api/brands/{brandId}?catalog_id=…`, `/api/brands/{brandId}/products?catalog_id=…`
- GET `/api/products/{productId}?catalog_id=…`, `/api/products/{productId}/compatibility?catalog_id=…`
- GET `/api/brand-catalog/{catalogId}`
- POST `/api/brand-adapter/evaluate`: `request_id`, `client_id`, `plan_id`, `catalog_id`, optional `allow_salon_verified`; same-origin JSON ≤8 KiB plus `X-Workspace-Reference`.
- GET `/api/brand-recipes/{recipeId}` for authorized immutable history.
- POST `/rest/v1/rpc/brand_catalog_transition` on the environment's Supabase origin: caller JWT + publishable key, catalog UUID, ordered next state, review receipt and correlation UUID. The database requires a private operator for GLOBAL or owning-organization `brand_catalog.manage` for ORGANIZATION. It cannot accept product verification or ownership claims.

All responses are private/no-store with a correlation ID. List parameters are bounded; duplicates and unexpected query/body fields fail validation. Signing envelopes/keys and private operator records are never returned.

Web remains the server execution host; Android continues using the existing service contracts without a second engine. Phase 2A changes no Android UI or salon preview layouts. Randevu, finance, reports, team and settings persistence remain in their later Salon OS phases.
