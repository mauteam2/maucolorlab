# ELIFORA sync semantics

`SyncCoordinator` drains at most ten intents per explicit batch through existing
domain endpoints. Web uses a browser lock to prevent overlapping tab drains;
Android serializes through a coroutine mutex. A recovered SYNCING intent retries
its original identity, hash, command, expected version and controller epoch.

States: LOCAL → PENDING_SYNC → SYNCING → SYNCED, CONFLICT, REJECTED or
REVIEW_REQUIRED. Missing/failed parent acceptance produces DEPENDENCY_BLOCKED.
Children never bypass an unaccepted parent. A transport failure remains pending
with bounded exponential backoff (up to five minutes). Background cancellation
never allocates a replacement identity or infers server rollback.

Fresh actor/workspace resolution occurs before dispatch and again before applying
an accepted result. Old offline authorization is insufficient. Scope changes and
revocation conceal private intent. Server domain commands still recompute and
authorize every operational relation. Persisted organization/location/device
fields are selection hints, never trusted ownership or controller claims.

Conflicts distinguish version, controller epoch, authority, workspace, payload,
dependency, appointment availability, subscription, stock and cash state. No
last-write-wins merge, automatic rebase, price override or technical approval.
The original payload remains available for deliberate comparison/re-entry by the
same authorized identity. A changed payload receives a new explicit mutation ID.

Financial/stock preparations and Color/Client form drafts remain REVIEW_REQUIRED.
They do not enter a generic auto-finalization queue. Cash expected totals and
stock count bases are obtained afresh from the server; intervening facts require
review/recount. A draft is never presented as a receipt, payment, movement or
completed live session. Terminal material reconciliation preserves NULL=UNKNOWN
and 0=measured zero and uses its original append identity.

The final accepted acknowledgment and the authoritative UI readback are distinct.
Hair periodic refresh is blocked while a mutation/readback is in flight; foreground
revalidation still conceals identity and invalidates superseded responses. A
successful sync clears only editors whose request IDs match the accepted intents,
preserving any newer user edit.
