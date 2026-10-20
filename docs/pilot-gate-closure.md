# Phase 10 — Pilot Gate Closure

Base: 270fc08720f1d49485b5d4d4299f9e9929a52ba5 / CI 39271452350.
This slice admits no real salons and adds no manufacturer chemistry.

## Release acceptance and rollback

Runtime attestation checks migration **head**, current signing-key match and
private bucket presence. The build migration digest fingerprints source files;
it does not attest the complete hosted schema definition. CI/pre-deploy checks
inspect actual function ownership, grants, search paths, RLS and security inventory.
Bind evidence to Git SHA, CI, deployment/alias, migration head, OpenAPI,
engine/catalog versions, Edge version and signing match.

Deploy the photo Edge function, restrictive migration, then matching Web release.
During transition fail closed. Old Web builds cannot bypass Storage policy.
An incompatible expected migration head fails bootstrap with RELEASE_NOT_READY.
Vercel rollback does not reverse PostgreSQL or Edge. Prefer a reviewed forward
fix; roll back an application only when its expected head/protocol still match.
Never remove facts or immutable events to make a binary compatible.

## Live clock

Responses carry server receive and send timestamps. The browser records monotonic
request/receipt times, subtracts server processing from RTT and estimates the
return-leg delay. Later client work uses the original receipt anchor. Display
network uncertainty; asymmetric networks prevent an exact clock promise.
Use an independent professional timer. No safety/controller/version lock changes.

## Processing and backlog

No autonomous hosted worker is claimed. The synthetic test operator explicitly
runs bounded stock PROCESS_BATCH, costing and report commands through existing
authorization. Before/after each service and every five minutes during work the
assigned operator must inspect pending/blocked stock sources, cost/commission
state and report freshness. Stop financial conclusions while sources are pending.
Retry original mutation IDs; resolve mapping/basis/permission through domain
commands. Never edit ledgers or silently replace UNKNOWN with zero. The real
pilot support owner remains OPEN; nobody is assumed to have accepted this duty.

## Pilot SaaS

Synthetic staging only: PILOT_SYNTHETIC_V1; no commercial price. Explicit enabled
entitlements: COLOR_ENGINE, BRAND_ADAPTER, LIVE_SESSION, CRM, STOCK, FINANCE,
COSTING, COMMISSION, REPORTING. AI_GATEWAY is not granted. Quotas: 1 location,
5 active members, 500 engine executions per explicitly created UTC usage period.
STORAGE_BYTES remains explicitly uncapped: the current adapter rejects finite
limits without an authoritative byte meter. This is a disclosed limitation;
per-file 4 MiB still applies. Only named synthetic admissions receive operator
subscriptions. Entitlement never grants permission; no automatic default/trigger.

## Human boundaries

Colorist, support owner, privacy/retention/legal and real email remain OPEN.
Email is BLOCKED_EXTERNAL_DEPENDENCY. No synthetic reviewer represents human
manufacturer review. Stop catalog transitions before unavailable attestation.
Do not claim the complete hosted recipe journey without governed publication.
