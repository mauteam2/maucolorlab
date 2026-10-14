# ELIFORA entitlement semantics

Versioned capabilities: COLOR_ENGINE, BRAND_ADAPTER, LIVE_SESSION, CRM, STOCK,
FINANCE, COSTING, COMMISSION, REPORTING and the provider-neutral AI_GATEWAY boundary.
Missing capability means unavailable. A capability does not grant a user permission.
Server source gates re-read the authoritative current subscription under a shared
organization SaaS lock. Plan/state changes use its exclusive counterpart.

Creation gates protect Color Plans, controlled recipes, Live Session creation,
new clients, manual inventory movements, new Finance charges/retail/expenses/deposits,
new commission policies, future cost acquisition/basis and reporting configuration.
Existing safety/historical workflows are preserved as documented in lifecycle.
Direct RPC/data writes cannot gain access by forging browser entitlement state.

Web/Android consume one typed current snapshot. It contains version, observed time
and capability reasons; these are UI guidance, not write authorization. Background,
sign-out, organization changes and offline transitions conceal sensitive snapshots.
The Web service rechecks database owner scope and account version before release.
No indefinite offline cached entitlement authorizes a critical write; broader
offline strategy belongs to Phase 8.
