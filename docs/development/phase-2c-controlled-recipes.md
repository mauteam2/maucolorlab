# ELIFORA Phase 2C — controlled professional recipes

Accepted scope: a professional chooses one verified IGORA ROYAL ABSOLUTES shade
and color grams. The server selects only documented compatible developers and
calculates the documented 1:1 ratio. This is a saved draft for professional
review, not permission to apply chemistry. Numeric pigment vectors remain UNKNOWN.

## Workflow and limits

Open Web ColorLab, select a client with an assessed Hair Passport, define a
single ROOT_REFRESH target and preserve the other active regions, then generate
the Color Plan. The controlled recipe card discovers published pilot catalogs,
loads context-qualified shade/developer pairs, and accepts professional color
grams. There is no prefilled quantity or inferred manufacturer dosage.

The ROOT white-hair ratio must be current, conflict-free, KNOWN and supported by
PROFESSIONAL_VERIFIED evidence. Exactly 90% uses the documented 9% condition;
above 90% permits the documented 6% pure-deposit condition. Unverified or global
fallback alone is insufficient. Existing Confidence → Risk → Color gates are
recomputed before storage. Unsupported contexts, stale plans, missing evidence,
unpublished/retired catalogs and mismatched pairs cannot create a new draft.

The documented processing time stays a **30–45 minute range**. No single duration,
heat instruction, optimization, blend, pigment calibration or expected color
prediction is generated. The API quantity bound 0.01–1000 g with two decimal
places is a storage/precision limit, not a recommended dose. Integer centigrams
protect ratio arithmetic; total grams are the sum of color and developer grams.

## Shared boundary

OpenAPI 0.13.0 adds, without changing earlier domain schemas:

- GET `/api/controlled-brand-recipes/catalogs`: published pilot projection.
- POST `/api/controlled-brand-recipes/options`: current qualified candidates.
- POST `/api/controlled-brand-recipes`: create an immutable version.
- GET `/api/controlled-brand-recipes?client_id=…`: latest 25 historical records.
- GET `/api/controlled-brand-recipes/{recipeId}?client_id=…`: exact stored record.
- Caller-JWT RPC `controlled_recipe_store`: signed, authorized storage boundary.

Browser writes require the same origin, an expected workspace reference, bounded
strict JSON and server-resolved membership permissions. Caller input contains
identifiers, professional grams and optional parent only; it cannot claim
ownership, white ratio, computed grams, verification, processing time or execution.
Responses are private/no-store and carry a correlation ID. Browser code imports
models only; signing keys and persistence remain server-only. Android is unchanged
and buildable; Phase 2C does not claim an Android editing UI.

## History, concurrency and authorization

The new table owns each record explicitly by organization, client, plan and
location, with relational catalog/product/developer/rule references. INSERT is
available only through the dedicated NOLOGIN/NOBYPASSRLS definer role and signed
RPC. Normal application roles cannot insert, update or delete records. RLS checks
fresh database membership, location and Color Plan/client/passport permissions.
Anonymous and service-role RPC access is denied.

Each record snapshots the qualified pair, quantities, official source documents,
catalog fingerprint, product/rule versions, Hair Passport fingerprint and engine
versions. Changes create a new row in the same series. Only its latest version
can be superseded. Advisory locks serialize idempotency/version checks and catalog
publication changes. Repeated actor/request IDs with identical input return the
original row; changing input with that ID is a conflict. A historical replay is
not a fresh safety approval. An append-only audit records each created version,
not every retry. Revoked/cross-tenant reads reveal no protected result.

The Web hides pending output on lost context, visibility or network validation;
the service revalidates workspace and permissions before delivery. A stale browser
result cannot substitute for the server's current safety checks.

## Verification

Pure tests cover ratio/precision, the 90% boundary, unverified/unknown evidence,
unsupported developer, retired catalog, safety block and forged execution/output.
Service/HTTP tests cover stale workspace/passport, signing, input reuse, response
integrity, bounded history, origin/port, query/body limits and private failures.
Real PostgreSQL tests cover caller-JWT storage, versioning, arithmetic, source
binding, replay, actor/tenant/revocation, immutable history and audit. Playwright
uses disposable local Auth and RLS, performs the actual ColorLab workflow, checks
320 px overflow and captures desktop/mobile results. All existing Web/Android,
contract, lint and database checks remain required.

The Windows workstation lacks local Docker/PostgreSQL. Database and authenticated
browser checks run in CI's disposable local Supabase environment; no production
migration or production catalog approval is performed. Pilot source review actors
in those tests are synthetic and are not production governance approval.

Phase 3 live sessions, execution controls, timers, consumption and outcomes remain
deferred. See the ignored local delivery report for exact final CI evidence.
