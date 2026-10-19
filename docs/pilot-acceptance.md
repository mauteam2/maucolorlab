# Controlled pilot acceptance

Decision vocabulary: CONTROLLED_PILOT_GO, CONTROLLED_PILOT_GO_WITH_LIMITATIONS,
NO_GO. This phase currently has **NO_GO**: hosted identity/mail/storage/backup
and professional review/support decisions cannot be inferred from automated CI.
Real salons must not be admitted before the complete gate and explicit approval.

`contracts/pilot-acceptance-checklist.json` is the BLOCKED intake checklist pinned
to the approved entry base. Copy it to the release evidence directory, set the
actual candidate SHA, and attach versioned evidence/reviewer/time per category.
Do not treat that source template as a completed current-head gate. Validate with
`python scripts/pilot_readiness.py checklist PATH`; BLOCKED/FAIL and even an
inapplicable required domain return NO_GO/nonzero. All fourteen categories apply
to this Web pilot. A structural PASS does not authenticate an operator's claims;
review the actual evidence and ensure it matches the deployed fingerprint.

| Category | Required evidence before PASS |
|---|---|
| SECURITY | Matching exact-head CI; actual hosted function/grant/RLS/session/Storage inspection; secrets and bundle scan; all closed Gate findings retained |
| DATA | At least two separate synthetic organizations through real browser/API, revoked access denied, no synthetic records copied into a real tenant; approved notice/data return/retention |
| AUTH | Hosted invite/confirmation/login/logout/recovery delivery, refresh/global revocation, membership selection; no public signup |
| COLOR_ENGINE | Broad targets, risk/UNKNOWN/high-risk block, recovery, regional reasoning, multi-session, historical 1.0/1.1, current signed plan, controlled recipe/Live/outcome; final professional usability review recorded |
| BRAND_DATA | Exact 1/1/29/2/58/3 source coverage; 0 additions; governed hosted version; no unverified executable chemistry; limitations visible |
| LIVE | Sequencer/step/bowl revision invalidation, immutable executed facts, controller recovery/epoch, stop safety and append-only material accounting |
| STOCK | Verified product/lot lineage, measured consumption, idempotent outbox/reconciliation with UNKNOWN distinct from zero; no duplicate facts |
| FINANCE | Idempotent payment/allocation/retry, reversal, actual costs, commission attribution and unknown margins; no duplicate or hidden edits |
| REPORTING | Source-linked projections/freshness/rebuild and scoped audited owner export |
| OFFLINE | Interruption/reconnect, durable bounded replay, rejected stale/changed inputs, lock/background/revocation concealment; safety commands not queued as ordinary drafts |
| BACKUP | Actual hosted backup availability, Storage bytes, key escrow, approved retention, isolated restore drill or explicitly reviewed bounded restore evidence; never a synthetic projection-only claim |
| PERFORMANCE | Separate hosted vs CI measurements for login/client/passport/options/engine/plan/booking/Live/stock/finance/report; Live latency investigated without weakening locks |
| UX | Chromium desktop/mobile/320px ColorLab, Live, appointments, profile, passport; genuine empty salon + realistic multi-staff day/failure workflow; no native parity claim |
| SUPPORT | Named owner/channel/coverage, tested P0/P1 escalation/recovery, versioned release notes and structured private feedback |

## Professional and browser scope

Web is primary. Actual Chromium desktop/mobile profiles and 320px checks are the
automated scope; Safari/Firefox remain unclaimed. Android unit/lint/debug and test
APK builds remain mandatory engineering regressions, but no emulator/real device
has been exercised here. Without controlled device evidence native Android is not
included in pilot-critical acceptance or distribution readiness.

Professional colorist usability review is an independent human gate. Record
reviewer identity/role, staging release, synthetic or consenting case category,
the ten dimensions, terms/UNKNOWN/recipe-limit interpretation, speed and concerns.
It is not scientific outcome validation. If scheduled as the final human gate,
no salon onboarding may happen until completed and reviewed.

## Bug bash evidence map

The new retries=0 pilot group starts with confirmed synthetic identity and the
actual private admission procedure, an empty business tenant, then the shared
existing real IGORA browser journey: setup/staff/service → client/passport → plan
and controlled recipe → booking → linked Live controller/steps/outcome → material
lineage → cost/commission/Reports → payment retry and owner export. The same
journey demonstrates broad caramel strategy with NO_VERIFIED_MATCH and old signed
history. A separate pilot test verifies opt-in feedback download, owner-only
diagnostics, revoked access and 320px. No user-facing fictional brand fixtures.

Existing salon-operations cases exercise multiple staff/reservations, hours,
cancellation/no-show/state immutability and conflicts. Existing finance/costing/
Reports, Phase 8 offline and Phase 9 security strict suites remain independent;
they supply the realistic-day/failure-day regressions, not claims of a human salon
visit. Two-tenant API/real browser denials remain in controlled recipe/Live and
existing CRM/security/finance tests. All original 89 real DB races remain, plus
two admission lock/rollback barriers. Full production-build suite and 80 repeated
first-pass reliability cases remain required, not replaced by the new group.

## Hosted performance recording

Record environment/project class and release, sample count, measured wall/HTTP
latency, server compute only when separately instrumented, and network overhead
only when actually distinguishable. Current earlier CI baseline: options ~54ms,
plan HTTP ~0.5s, pure engine ~9.6ms; do not present them as hosted values or p95.
Pilot artifact `phase-10-workflow-performance.json` contains only named synthetic
journeys/numeric timings, not customer responses or credentials. Existing retained
Live and ColorLab artifacts contain pure computation vs UI/HTTP measurements.
Missing measurements are BLOCKED/NOT_MEASURED, never zero.

P0/unsafe chemistry, tenant leakage, signed plan/Live safety break, duplicate
stock/finance facts, irrecoverable migration, missing backup for real data, broken
Auth/recovery or exposed secret always means NO_GO. Controlled pilot approval
never grants public production launch.
