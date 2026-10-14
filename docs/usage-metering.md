# ELIFORA usage metering

Immutable durable events own usage. A successful authoritative Color Plan with
status DRAFT records one ENGINE_EXECUTIONS event after source insert, in the same
transaction. The source ID, request ID and recorded status bind its minimal hash.
Blocked safety outputs, failed validation, UI preview rendering and historical replay
do not create another event. No commercial charging/price semantics are inferred.

Permanent uniqueness is organization/category/source domain/source ID. Same-source
replay is idempotent; changed quantity/hash/location conflicts. Source IDs and category
are sufficient: no Hair Passport payload, recipe details, photo or client PII enters
the usage ledger. Atomic counters are rebuildable from durable events; quotas never
rely on a mutable-only counter. Rebuild is scoped, serialized and audited.

Usage periods are explicitly configured non-overlapping half-open UTC instants.
Production does not assume calendar months. Missing active period fails metered new
work closed. CI uses an explicit synthetic UTC month fixture only. Storage metering
has a reserved typed category but current storage usage is UNKNOWN until an
authoritative adapter is implemented; finite storage limits are rejected rather
than enforced against an invented zero. AI Gateway remains an unconfigured interface.
