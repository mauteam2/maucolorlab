# ELIFORA reporting architecture — Phase 6

Reporting is a disposable read model, never a posting authority. Source appointments,
canonical CRM, Live outcomes, Stock movements, Finance and Phase 5B contribution
remain authoritative. No report writes a price, appointment, cost or commission.

The private projection stores one row per source identity and domain. Source changes
append invalidations in the same transaction. A bounded refresh processes committed
invalidations; a scoped rebuild atomically replaces derived rows. Reporting workers
serialize only with one another, never acquire domain locks, and never block a
source writer by locking its records. New invalidations during rebuild survive its
captured watermark. Idempotent upserts prevent duplicate source effects.

Read authorization resolves active database memberships and existing source-domain
permissions. The browser receives minimum necessary fields. Owner/manager views
are permission scoped; technical staff views are self scoped; reception receives
no acquisition costs, colleague commissions, technical payloads or private notes.

Intervals are location-local calendar dates converted to half-open UTC instants.
Custom periods are at most 90 days. Monetary aggregates remain exact integer minor
unit strings. Zero comparison denominators return no percentage. Unknown costs
remain unavailable, with separate KNOWN/PARTIAL/UNKNOWN count and revenue coverage.

The reports workspace and dashboard use dedicated indexed projections, not the
legacy Finance offset list. Every response identifies metric version, dates,
freshness and bounded source drill-down. Projection rebuild is management-only and
audited. Exports use the same permissions and filters, are bounded, and neutralize
spreadsheet formula prefixes. No Phase 7, prediction, payroll or accounting scope.
