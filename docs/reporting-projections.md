# ELIFORA reporting projections

`app_private.report_facts` is a private, typed source-identity projection with
organization, location, domain, time, client, performer, service, exact monetary
columns, status, cost coverage state and minimal domain-specific lineage. It has
RLS enabled and no SELECT/INSERT/UPDATE/DELETE grants to normal application roles
or service_role. It is accessible only through the authorized reporting boundary.

Every source INSERT/UPDATE appends a `report_invalidations` row in the source
transaction. An uncommitted source change is not visible to a reporter. No trigger
reads/locks the reporting projection or acquires its lifecycle lock. Source domain
locks, immutable journal constraints and authorization remain unchanged.

Readers incrementally refresh at most 500 committed invalidations under the scoped
`hashtextextended(org:location:reports,61)` lock. The batch projects each distinct
source identity once, then deletes only its captured invalidation IDs. All reporters
share that protocol. An event processed twice remains one projection row because
the primary key is organization/location/domain/source ID.

Rebuild uses the same lock and one transaction: delete derived rows, re-read source
facts, insert deterministic projections, publish report_state. Concurrent readers
see the old committed or new committed projection, never an empty half-rebuild.
It never deletes source facts. New source writers remain free to commit while
rebuild runs. Invalidation IDs are captured as a concrete visible set. Sequence
allocation is not commit order: a lower-ID event committing late is not accidentally
deleted by a `<= watermark` range. Remaining events drive subsequent refresh.
Captured IDs are joined as a relation for queue deletion, so a large rebuild does
not repeatedly scan a large parameter array. The administrator rebuild budget is
120 seconds; the scale harness waits for that real server result and records the
elapsed time, rather than treating its shorter normal-read transport limit as an
application result.

Sources include appointment lifecycle, revenue recognition/adjustments, commission
accrual/adjustment, zero-cost declarations, retail attribution, direct cost facts,
Stock source event status and ledger movements, expenses/reversals, cash closing,
Live status/outcome, CRM identity/merge/reversal and relationship configuration.
CRM/expiry snapshot rows are invalidated on local calendar change, with a bounded
500-row enqueue and duplicate-pending check. Large backlogs remain explicitly
PENDING/STALE_CALENDAR until drained or rebuilt; they are never presented as guaranteed
real-time results.

`report_state` returns metric_version 1, last refresh, last rebuild, the highest
processed observed sequence marker and pending event count. The sequence marker
is diagnostic rather than proof that every lower transaction already committed.
Metrics are a repeatable function of authoritative source state and the documented
calendar/cohort definitions; refresh timestamps deliberately change on refresh.

`reporting_operation(REBUILD)` requires active scoped `reports.manage` and creates
an immutable audit event. SETTINGS uses conditional versions and explicit nullable
thresholds. EXPORT requires reports.export, uses the same authorized view and audit,
and returns at most one 50-row page. Rebuild and CSV are management workflows only.

Run locally against a disposable Supabase: ordered migrations, db lint, db tests,
then `CI=true python scripts/test-reporting-concurrency.py`. CI resets the disposable
schema between domain harnesses. No production connection is accepted. The report
evidence artifact contains real backend races, 10k posted revenue facts, 40k
historical appointments, 50k+ rebuildable projections and executed internal
EXPLAIN ANALYZE BUFFERS range/keyset/detail plans.
