# ELIFORA durable factual replay

Phase 8 retains all remaining Hair receipt identities and all future accepted Hair
core, observation, physical-test and history operations. The legacy `expires_at`
column is inert metadata: no mutation deletes expired receipts and the writer no
longer has DELETE permission or an expiry policy. Immutable guards protect identity,
payload hash and accepted response; normal application roles cannot enumerate or
modify private receipt data.

Acceptance, factual append, evidence, audit and receipt occur in the same transaction
under the existing shared organization/client locking protocol. Same actor, tenant,
request and payload replay the original result even beyond the former 24-hour TTL.
A changed payload under the same identity conflicts. Current revoked membership,
archived client or foreign scope is rejected before any private replay response.

The migration cannot recreate receipt identities already erased before Phase 8:
historical factual rows/audits did not store the original request UUID/hash. Never
guess provenance or silently import such an unknown legacy retry as accepted. New
Phase 8 queues preserve identities permanently; older unproven imported intent
requires explicit review. This limitation is separate from permanent future replay.

Live versions/material reconciliation, stock source events, finance immutable facts
and SaaS metering retain their existing domain deduplication systems. Phase 8 does
not replace them with a generic receipt authority. No TTL-based table cleanup is
allowed to erase accepted Hair identity. Audit/technical history remains append-only.
