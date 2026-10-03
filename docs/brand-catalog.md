# ELIFORA Verified Brand Catalog

The domain is a versioned catalog release containing Brands, Product Lines, Products, scalar Technical Facts and Compatibility Rules. Product types currently cover SHADE, DEVELOPER, LIGHTENER, TONER, CORRECTOR, ACTIVATOR, TREATMENT and BOND. Adding another type requires a forward schema/contract change and an explicit adapter policy; an unknown type never silently becomes a shade.

Catalog releases are `GLOBAL` (organization is null) or `ORGANIZATION` (organization is mandatory). The database enforces ownership on every child through composite catalog foreign keys. Global published/retired releases are readable by active members authorized for color planning; organization releases are visible only to authorized members of that organization. Unpublished global content is available only to database-maintained catalog operators. Operator assignments are private and never derive from JWT user metadata.

Verification is `ELIFORA_VERIFIED`, `SALON_VERIFIED`, `UNVERIFIED` or `DEPRECATED`. Central verification belongs to global releases; salon verification belongs to organization releases and has SALON_VALIDATED provenance. The adapter requires explicit salon opt-in and the freshly checked `brand_catalog.manage` permission, assigned to owners/managers. Unverified and deprecated products remain historically readable but cannot produce a new brand-ready draft.

Governance follows `DRAFT → TECHNICAL_REVIEW → GOLDEN_TEST → APPROVED → PUBLISHED → RETIRED`. APPROVED requires a reference to the reviewed golden receipt. The authorized reviewer is responsible for checking the referenced artifact; this foundation does not integrate an external document-signing or CI-attestation provider. Publication and retirement are serialized across the catalog series. Publishing a replacement retires previously published versions and preserves their contents and fingerprints.

Technical intake currently uses controlled database maintenance, with a real authenticated actor and an explicit database operator assignment for global catalogs; public application roles have no direct table writes. Organization intake must act as an owner/manager of the owning organization. The only public governance RPC, `brand_catalog_transition`, validates authority and legal transitions in a private function behind a security-invoker wrapper. No production catalog editing UI or unrestricted product mutation endpoint is introduced.

Published content is immutable. Product V2 is a new row in a later catalog release, linked by its stable series/version. Version gaps, moving a product series to another tenant/catalog series, changing its type or rebinding its manufacturer code are rejected. Historical recipe snapshots contain complete product/fact/rule versions; they never join the current product to reconstruct old chemistry.

Migrations:

- `20261002184411_brand_catalog_adapter_foundation.sql`: releases, brands, lines, products, facts, rules, catalog audit, immutable brand recipe drafts, caller-authorized RPCs and RLS.
- `20261003080150_brand_catalog_version_hardening.sql`: technical units, version lineage, series serialization, catalog creation audit and immutable audit history.

`brand_catalog_audit` is separate from tenant `audit_events` because global releases have no organization. Technical changes, verification approval, product/deprecation changes, compatibility changes and publication are audited. Brand Adapter evaluations use existing tenant audit events. Audit stores identifiers and outcomes rather than customer payloads or signing material.

Catalog packets are capped at 100 brands, 100 lines, 100 products and 1,000 rules. Reads use indexed catalog/brand/product keys; HTTP lists return at most 50 items with offset bounded at 10,000. Larger official catalogs should use deliberately partitioned reviewed releases rather than silently truncating an engine snapshot.
