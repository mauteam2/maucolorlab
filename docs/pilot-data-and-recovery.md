# Pilot data, notice and recovery foundation

This is a product/operations draft, not legal compliance certification. Before real
onboarding a named legal/privacy reviewer must approve controller/processor roles,
jurisdiction, notices, lawful processing basis, client photo permissions, retention,
export/return and incident obligations. Unapproved retention must not be invented.
The gate remains BLOCKED until these decisions are recorded.

## Minimum data and notice draft

“ELIFORA stores the salon-provided client identity/contact, appointments, staff
roles/work plans, Hair Passport evidence and technical history, controlled plans/
recipes and outcomes, stock and financial/commission records needed for the agreed
pilot. Optional technical photos are uploaded for the expressly stated salon
service/evidence purpose. Professional access follows current membership and role.
No customer data is assumed available for AI training. Feedback contains only
what you explicitly type plus safe release context; it is not sent automatically.
Contact the named salon/pilot privacy owner for access, return and retention.”

Fill actual responsible parties/contact, hosting location/subprocessors, purposes,
retention and rights procedure before presenting this draft as an approved notice.
Do not collect unnecessary identity attributes or hidden analytics. Never include
client names, Hair Passport JSON, photos, recipes, finance payloads or tokens in
operational logs/feedback attachments. Free-text feedback is explicit content and
may still contain PII: the user must review it before download/support submission.

Photos remain `live-technical` private objects with current session/membership and
location/technical permission checks. No public URL or training-use assumption.
Existing history-linked photo references cannot be casually deleted; archive and
authorized deletion requests need impact review of retention, reference history,
Storage object and backup copies. A public bucket or signed URL in a support log
is a P0 incident, not a normal troubleshooting tool.

## Backup and restore before real data

Inventory hosted backup availability/retention, logical backup method, isolated
restore destination, operator credentials and approval. Preserve signing material
and offline wrap dependencies in restricted escrow with access recovery. A DB
backup does **not** contain Storage object bytes. Preserve private objects and
metadata consistently and review provider configuration/secrets separately.
Record observed RPO/RTO only after a real timed drill; no unmeasured promises.

Non-production drill: checkpoint → restore into a separate isolated project with
outbound mail/notifications disabled → retain original tenant IDs, immutable
ledgers/history/catalog snapshots → copy private object bytes with reviewed
mapping → verify integrity/hashes/row counts → reapply current RLS/grants/session
guard → test two synthetic organizations plus revoked access → verify signed
historical plan and current signer compatibility → rebuild only derived Reports/
usage projections → verify counts/stock/finance/cost/commission → record timings
and evidence → reviewed cutover decision. Never restore/reset over a real salon as
a test, silently regenerate facts, or run disposable fixture scripts on hosted DB.

Phase 9's synthetic logical projection recovery remains useful regression evidence;
it is not hosted backup/PITR, Storage disaster recovery or key-loss recovery proof.
No hosted backup or actual hosted restore has been executed by Phase 10 so far.

## Pilot exit

Record request/authority, stop new access and revoke provider sessions/memberships,
conceal local drafts, complete/resolvably stop active sessions with existing safety
rules, deliver authorized Reports exports plus separately scoped missing-record
export, agree approved retention, archive organization/location where permitted.
Keep immutable ledger/technical/audit facts; reversal is not deletion. Review local
encrypted drafts and Storage/backup retention explicitly. Do not trap data behind
an unsupported promise of a complete self-service export.
