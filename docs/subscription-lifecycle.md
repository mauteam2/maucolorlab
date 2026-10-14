# ELIFORA subscription lifecycle

Each change appends a subscription with an organization-unique version, immutable
plan version, authoritative effective instant, source, actor, reason and correlation.
The current account pointer updates atomically under the SaaS organization lock.
Old subscription/plan definitions are never edited. Downgrade does not remove users,
locations or source facts; current usage can exceed a new limit while new growth is
rejected. Management requests store intent without automatically changing state.

ACTIVE permits configured new capabilities. TRIAL additionally requires an explicit
server-authoritative trial end; expiry resolves to TRIAL_EXPIRED. PAST_DUE blocks new
work unless an explicitly configured future grace end resolves to GRACE. SUSPENDED,
CANCELLED, EXPIRED and UNCONFIGURED block new premium work. No trial/grace duration
or billing schedule is assumed. Historical state retains its configured timestamps;
current derived expiry is computed from the database clock.

Historical reads and bounded exports continue under existing permissions. Existing
Live Session updates, safety stop/abort, material reconciliation, trusted historical
Stock compensation, automatic direct-cost/commission facts and historical financial
settlement/refund/reversal remain possible. New sessions and new commercial work are
gated; neither subscription nor stock availability alters chemistry/safety decisions.
