# ELIFORA quota governance

Entitlements are feature availability; quotas are quantities. Configurable quota
codes: LOCATIONS, ACTIVE_MEMBERS, STORAGE_BYTES, ENGINE_EXECUTIONS. A missing row
means UNKNOWN. A present row with NULL limit explicitly means uncapped; it is never
inferred from a missing plan. Unknown authority returns a controlled error.

Locations count non-archived source rows. Member seats count distinct users with
active or invited membership in the organization; invitations reserve a seat, and
another location membership for the same current user does not consume another seat.
Reactivation and new users are growth. Existing over-limit identities remain intact.

Lock order for structural operations: existing organization lifecycle (seed 0), then
SaaS organization (seed 71). Source triggers protect growth even outside the new
structural RPC. Metered engine stores take the exclusive SaaS lock before the shared
feature check, avoiding shared-to-exclusive upgrade deadlocks. Checks and source
inserts commit together; concurrent edge operations cannot both consume one slot.

Usage is read from durable events. Structural RPC quota denials append a minimal
diagnostic after the failed source subtransaction, so rollback never invents growth.
Normal clients cannot edit plan limits, usage, subscriber state or provider events.
Storage quotas remain explicitly UNKNOWN/unavailable pending an authoritative meter.
