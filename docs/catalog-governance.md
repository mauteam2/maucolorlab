# ELIFORA technical catalog governance

Phase 2B adds a narrow internal control plane over the Phase 2A catalog. It does not replace catalog tables or the signed immutable recipe store.

The internal Web area is `/internal/catalogs`, with a per-version page. It shows official source documents, review/verification states, products, documented compatibility limits and contextual lifecycle actions using the existing Salon Design System. There is no normal salon navigation item and no self-service operator enrollment. Every page, REST mutation and database mutation checks the private database operator assignment. UI visibility is not authorization. Operator assignments require controlled database administration; user JWT metadata never grants access.

Workflow:

1. IMPORT: server-owned manifest → new GLOBAL DRAFT; all sources/products/facts/rules start unverified. Caller submits only note and optional previous UUID.
2. START_REVIEW: DRAFT → TECHNICAL_REVIEW.
3. COMPLETE_REVIEW: operator acknowledges official-document extraction review. Sources and known facts receive database-owned verifier/time. Unknown channels remain UNKNOWN. Restricted compatibility remains restricted. Reviewer is recorded; state becomes GOLDEN_TEST.
4. VALIDATE_GOLDEN: the database checks ten persisted source/product/notation/ratio/developer/unknown-data validation groups against the registered manifest. It stores an immutable run bound to the catalog fingerprint and manifest hash.
5. APPROVE: requires the actual persisted golden run and matching fingerprint. Approval actor/time are recorded. Client receipt text cannot bypass this gate.
6. PUBLISH: requires prior source review, golden validation and approval. Publisher actor/time are recorded. Previous published versions retire without content changes.
7. REJECT is available from pre-publication states and is terminal. RETIRE is available after publication. A rejected or retired version needs a new draft cycle; it cannot be silently reopened.

Created/reviewed/approved/published actors are distinct domain fields. The same authenticated operator may exercise them in development V1. Independent-human four-eyes enforcement is not claimed; it is a future deployment policy. CI reviewers are explicitly synthetic test actors, not production experts.

Six Web endpoints:

- POST /api/admin/catalogs/import
- POST /api/admin/catalogs/{catalogId}/governance
- GET /api/catalog-sources/{sourceId}
- GET /api/brands/{brandId}/catalog/versions
- GET /api/brand-catalog/{catalogId}/pilot
- POST /api/brand-adapter/pilot (read-only candidate evaluation; client_id, plan_id, catalog_id and X-Workspace-Reference)

Three shared Supabase RPC contracts: catalog_governance, catalog_pilot_packet, catalog_operator_access. OpenAPI is 0.12.0. POST HTTP bodies are bounded, same-origin, strict schemas. Owner IDs, verification results and reviewer identities are not request fields. Response caching is private/no-store.

Additional tables: catalog_sources, catalog_product_evidence, catalog_fact_sources, catalog_rule_sources and catalog_golden_runs; private brand_pilot_manifests supplies controlled intake. Catalog audit stores source creation/replacement, review/validation/approval/rejection/publication/retirement decisions and notes, in addition to existing technical/compatibility/verification events. Audit and golden runs are immutable. All new public tables have explicit grants, RLS and foreign-key indexes. A salon owner cannot modify the global catalog. Existing organization-scoped salon catalog isolation and Phase 2A opt-in semantics are preserved.

The legacy brand_catalog_transition RPC cannot bypass a pilot source review or persisted golden run. The old recipe packet shape remains unchanged. Historical brand drafts remain pinned to their original version; pilot evidence is a separate immutable published read packet.
