# Backup and recovery runbook — design, not a production restore claim

No production/pilot environment is deployed by Phase 9. RPO/RTO cannot be stated
without an actually operated backup schedule and timed restore drills.

1. Define environment ownership, provider backup/PITR retention and independent
   encrypted logical backup retention before pilot. Verify backups complete and
   restrict credentials/operators; do not assume a provider plan includes PITR.
2. Preserve compatible migration history, immutable authoritative facts and the
   environment's signing/offline wrapping key material in separate secret storage.
   A DB dump alone is not a Storage object backup or an Auth/SMTP configuration backup.
3. Restore to a new isolated environment with inbound traffic/worker execution
   disabled. Match PostgreSQL/extensions/provider versions and apply the correct
   ordered migrations. Do not replay a newer application against an older schema.
4. Restore provider identities and relational parents before scoped clients,
   technical/catalog snapshots, operations, stock/finance/cost/commission facts,
   version/receipt/audit and SaaS histories. Use provider-supported restoration
   tooling; do not disable application immutability in a live environment.
5. Restore private objects and metadata together, verify reserved paths/size/digests
   and privacy. Confirm signing configuration matches the recovered environment.
   Revoke restored sessions as part of the incident decision; never carry stolen
   sessions into a restored environment without review.
6. Rebuild derived reports and compare source-derived usage counters with immutable
   usage events. Do not reconstruct finance/stock ledgers from report aggregates.
7. Run migration lint, full RLS allow/deny matrix, security inventory/grant audit,
   replay/epoch/terminal tests, ledger/commission invariants, source-to-projection
   comparisons and production-mode browser tests. Validate no public bucket,
   private response cache or operator bypass emerged.
8. An authorized operator reviews evidence, DNS/HTTPS/SMTP/webhook configuration,
   client compatibility and rollback before traffic resumes. This document does
   not authorize production cutover.

`phase_9_recovery.test.sql` is a logical source-fixture recovery drill on a freshly
migrated disposable DB: it seeds authoritative operational history, builds a real
projection, removes derived rows, rebuilds and compares canonical contents while
proving source history unchanged. Existing reporting/SaaS tests exercise full
source-derived rebuild and usage-event idempotency. It is not a cloud backup restore,
Storage disaster recovery test or measured production RPO/RTO.

Recoverability: archived clients restore only via controlled permission/version
and active-operation/canonical-family rules. Appointments and Live history remain
versioned/immutable; stopped sessions use append-only reconciliation. Stock,
finance, cost and commission corrections append/reverse source facts. Report
projections rebuild; SaaS history stays immutable and counters remain derived.
Already-erased pre-Phase-8 receipt identities cannot be reconstructed from facts.
