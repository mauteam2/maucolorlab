# Pilot release, support and recovery operations

Named support owner, channel, duty hours, escalation contact and hosting/operator
access recovery are required human gate fields. They have not been supplied in
this task. No customer outreach or external messages are sent automatically.

## Severity and response

| Severity | Trigger | First action |
|---|---|---|
| P0 | Wrong tenant exposure, technical safety regression, duplicate finance/stock fact, irrecoverable Live/data corruption, leaked secret | Stop affected new work/access; escalate immediately to named security/domain operator; preserve evidence and authoritative history |
| P1 | Cannot create client/book/generate plan, stuck Live, payment cannot post | Record typed error/correlation/release, reproduce in isolated synthetic tenant; inspect current membership/entitlement/controller/version/source gates |
| P2 | Significant defect with bounded workaround | Triage and review a release fix with regression evidence |
| P3 | Usability/minor/feature request | Review feedback; no automatic product or chemistry authority |

P0 runbook: bound affected scope; revoke compromised sessions/memberships or disable
affected server operation using deployment controls; preserve sanitized correlation,
audit IDs and immutable facts; prevent duplicate retries; investigate with separately
authorized operator access, not invisible tenant impersonation. A technical safety
issue stops execution, not just a warning banner. For duplicate material/payment,
identify original idempotency/source IDs and reviewed reversal/reconciliation. Never
delete ledger facts or run destructive repair automatically. Restore into isolation
if needed; verify RLS/history/signing and approval before reopening. Key exposure
requires scoped rotation with offline wrap/key-retention impact review. Notify
responsible parties through the approved incident process; this tool sends none.

P1 flow: capture version, typed code, correlation, timestamp/timezone, action and
online/controller state; do not attach client payloads. Determine whether request
committed before retry. Reuse existing request/mutation identity and fingerprint;
do not generate new financial/stock facts to clear an error. Re-read current state,
refresh session, use authorized Live takeover or append-only material reconciliation
where appropriate. Escalate reproducible defect with a synthetic case. Operator
interventions must be scoped, reasoned and audited; no hidden support membership.

## Safe diagnostics and alerts

Owner `/api/pilot/status` checks DB connectivity/migration, signing match, private
bucket configuration and global published catalog versions; current provider Auth
is checked before and after. Web availability is an external GET/sign-in probe;
Auth mail, object read/write/deny and backups require controlled hosted smoke.
Never expose a general unauthenticated internal status dump or return a secret.

Use deployment/provider dashboards for aggregated HTTP/server error counts and
typed engine/finance failures, existing Live recovery/sync conflict audit, stock
outbox PENDING/FAILED backlog, Reports freshness and SaaS rejection summaries.
No new hidden user tracking is installed. Do not infer feature success or safety
from request volume. Record only reviewed aggregate counts without client IDs,
photos, recipes or financial payloads; feedback ratings never tune the engine.

Pilot alert policy: migration/signing/security-inventory mismatch → stop deployment;
any confirmed wrong-tenant/safety/duplicate-fact incident → P0; failed stock outbox
not draining over the reviewed processing interval or stale Reports beyond measured
baseline → investigate domain worker/locks; repeated typed 5xx or failed Auth
recovery → P1. Set numeric hosted thresholds after measuring this deployment and
support capacity. Alert on state transitions, suppress duplicates and close only
after evidence; do not claim an active hosted monitoring service here.

## Release record and change control

Record pilot version, exact Git SHA/CI, migration head+digest, Web artifact, Android
build if distributed, engine version and published catalog IDs/version/fingerprint.
Generated safe source fingerprint appears in owner diagnostics/feedback. Actual
DB published catalog versions are separate from the source-pack checksum. Include
those actual IDs/versions in support evidence for technical issues. No “latest”.

Release notes per deployment: new, fixed, known limitations, engine/catalog changes,
migration/checkpoint notes, gates and rollback compatibility. Phase 10 introduces
readiness configuration, controlled admission, setup/feedback and deployment docs;
engine 1.1.0/chemistry/catalog source pack remain unchanged. Pilot admission/health
migration `20261019121555` and operator-assumption correction `20261019125352` are
forward only. No real tenant or commercial plan seeded. The correction assigns the
new non-login operator role only to the existing migration administrator, postgres;
authenticated, anon, service_role and authenticator receive no role membership.

The first CI found two scanner matches in deterministic repeated-hex test inputs,
not actual credentials. Current tests generate ephemeral random bytes. Only the
two exact historical commit/file/line fingerprints are excluded; no path/rule is
disabled and full-history scanning remains required.

Feature flags may expose optional pilot UX; no flag grants permission, entitlement,
RLS bypass, safety exemption or catalog verification. Public production is refused
by this phase's hosted validator until a separately approved release changes policy.
See [environment runbook](pilot-environment.md) and [recovery policy](pilot-data-and-recovery.md).

## Regression and evidence

CI retains DB/RLS and all 89 previous multi-connection cases, plus 2 new real
admission barriers; Web/Android units, contracts/inventory negative tests, strict
Phase 8/9/ColorLab, production-build full browser suite and 80 reliability repeats,
gitleaks and production npm audit. New strict pilot group reuses the real verified
IGORA cross-domain journey after empty controlled admission, adds payment replay,
owner export and setup/privacy/320px coverage. Reuse shares assertions, not mocked
outputs; existing journey remains an independent original test.

Security inventory intentionally classifies the two new functions and one new
HTTP method. GLOBAL-only catalog diagnostics never query another salon's private
catalog. Pilot admission receipt has forced RLS/no client grants/immutable guard.
New operator is NOLOGIN/NOBYPASSRLS; only its private definer function can bootstrap.
Existing source/currency/stock/finance/catalog lifecycle locks are unchanged.
