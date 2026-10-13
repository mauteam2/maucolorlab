# ELIFORA metric dictionary — version 1

All reporting intervals are `[start, end)` instants derived from the selected
location timezone. Week starts Monday. THIS_MONTH and LAST_MONTH are complete
calendar months, compared with the preceding calendar month, including its actual
length. CUSTOM takes inclusive local dates, at most 90 calendar days, and compares
with the immediately preceding equal number of local days. DST can make elapsed
hours unequal while calendar-day equivalence remains exact. Current periods can
include future appointment starts; charts/values never claim those are visits.

## Appointment cohort

Source: `salon_appointments` → private APPOINTMENT projection. Time basis:
historical scheduled `start_at`. Existing lifecycle statuses are reused. Source
permission: `salon.read`; colorist/assistant are restricted to `staff_user_id =
auth.uid()`. Only COMPLETED is a visit. CANCELLED and NO_SHOW are excluded.

| Metric | Formula / unknown behavior |
| --- | --- |
| appointments_scheduled | Count of all appointments starting in interval |
| completed_visits | Current COMPLETED count in that scheduled cohort |
| cancelled | Current CANCELLED count in cohort |
| no_show | Current NO_SHOW count in cohort |
| cancellation_rate_bps | cancelled × 10,000 / scheduled, truncated; unavailable if zero denominator |
| booked_minutes | Scheduled duration plus recorded before/after buffers for DRAFT, CONFIRMED, ARRIVED, IN_SERVICE and COMPLETED |
| available_staff_minutes | Unavailable: V1 has no complete immutable historical capacity denominator |
| utilization_bps | Unavailable rather than infer past capacity from today's shifts |

Service volume uses those completed appointment facts. Service grouping uses
historical service IDs/names/version snapshots, never a current catalog price.
Average duration is the average of recorded `actual_duration_seconds` for completed
appointments only; absent samples remain unavailable. Staff grouping uses the
appointment performer and Phase 5B `performed_by`, never cashier, recorder or Live
controller. Missing performer remains unattributed, not silently assigned.

## Revenue and contribution cohort

Source: Phase 5B `profitability_revenue_facts`, whose recognition basis is the
authoritative posted Phase 5A SERVICE_CHARGE/RETAIL_SALE. Time basis: `eligible_at`.
Permission: `finance.view` for recognized revenue, `cost.view` for direct cost and
coverage, `commission.view_all` for team commission / after-commission contribution.
Technical self views do not inherit those broad permissions. Acquisition valuations
never appear in reception report rows.

Refunds and reversals **restate the original recognition cohort**, following Phase
5B, rather than pretending to be cash-period sales. `profitability_breakdown` is
the sole direct-cost/commission status calculation; reporting does not reimplement
it. A later reconciliation changes the read model of the source cohort but never
rewrites its immutable source facts. Deposits, payments, credit allocations,
appointment quotations and current catalog prices are not recognized revenue.

| Metric | Formula / unknown behavior |
| --- | --- |
| recognized_net_revenue | Sum of source net revenue plus immutable net adjustments; excludes tax |
| refunds_net | Sum(original net minus adjusted net) in original eligible cohort |
| eligible_transactions | Number of recognition facts in cohort, including compensated originals |
| known_direct_product_cost | Sum of known cost components, explicitly a known subtotal, not an inferred complete cost |
| known_transactions / partial_transactions / unknown_transactions | Count of source breakdown statuses KNOWN / PARTIAL / UNKNOWN |
| known_count_coverage_bps | KNOWN transaction count × 10,000 / eligible transaction count |
| known_revenue_coverage_bps | Adjusted net revenue of KNOWN transactions × 10,000 / eligible adjusted net revenue; unavailable when denominator ≤ 0 |
| contribution_before_commission | Sum net revenue minus direct cost; unavailable if any eligible cost is PARTIAL/UNKNOWN |
| known_subset_contribution_before_commission | Complete-cost subset only, with its count denominator shown |
| contribution_after_commission | Complete net revenue minus direct cost minus authoritative commission; unavailable if any cost is incomplete or commission disclosure is unauthorized |
| retail_recognized_revenue | Same recognition formula restricted to RETAIL |
| retail_quantity_original | Original recorded retail quantity; deliberately labelled original rather than net of returns |

Coverage exposes both count and revenue denominators, including explicit
KNOWN/PARTIAL/UNKNOWN counts. A measured zero is KNOWN; absence of evidence is not.
Per-service/group contribution is unavailable when that group contains incomplete
cost. Groups are ranked by completed volume only; no opaque employee score or
exact-contribution ranking of incomplete services is generated.

## Commission, expenses and cash

| Metric | Source / time / formula / permission |
| --- | --- |
| commission_accrual | Immutable commission accrual amounts at original `eligible_at`; view_all or own view_self |
| commission_adjustments | Immutable adjustment amounts restating that same cohort |
| net_accrued_commission | Accrual plus adjustments; never salary paid |
| operating_expenses_recorded | Authoritative EXPENSE amount at `occurred_at`, compensated once by reversal; `finance.expense.view`; never subtracted to invent accounting profit |
| cash_sessions_opened | Cash sessions opened in period; `finance.cash.close` |
| cash_sessions_closed | Current CLOSED count among sessions opened in period, not a second closure-time cohort |
| cash_expected_closed_or_review | Known expected values for CLOSED/CLOSING_REVIEW sessions of opening cohort; null when none measured |
| cash_counted_closed_or_review | Measured counted values of that cohort |
| cash_difference_closed_or_review | Counted minus expected values of that cohort; no blame or score |

## Canonical clients — explicit current snapshot

Source: the existing `crm_family` and `crm_summary` definitions, never a second
returning/inactive model. Permission: `crm.read`, with broad client reporting omitted
from technical self mode. Family reads consolidate historical facts without
rewriting original client IDs. Family creation date is the earliest original
identity's creation date; a merged family appears once. A merge reversal rebuilds
the separate canonical rows through the same invalidation protocol.

`new_clients` counts active canonical families created in period.
`returning_clients_snapshot`, `inactive_clients_snapshot`,
`rebooking_due_snapshot`, `overdue_clients_snapshot` and
`future_appointments_clients_snapshot` count the current CRM relationship/return
states, explicitly labelled snapshot. Time-derived states refresh at local-day
boundaries. These snapshot counts have no historical-period comparison: V1 does
not invent past return-window states, retention probability, churn or LTV.

## Stock — current snapshot and ledger period

Source: Stock items/openings/movements, private projection; `stock.view`.
Current metrics: `stock_items`, `low_stock`, `out_of_stock`, `unknown_stock`,
`expiring_lots_30_days`. Low thresholds come from the actual item configuration;
UNKNOWN quantity is not an out-of-stock zero. Pending/failed counts come from
committed Stock source events and remain operational reconciliation signals.

`stock_movement_count` counts immutable ledger rows at `occurred_at`.
`actual_consumption_gram`, `actual_consumption_milliliter` and
`actual_consumption_unit` are minus the net sum of actual source-session movement
deltas. Reconciliation and reversal deltas therefore compensate originals once.
Units are never combined or inferred from planned recipe grams. Stock availability
does not influence risk classification or recommendation.

## Technical / recorded outcome

Permission: `live_session.view` AND `crm.notes.technical`; self mode uses only
validated appointment-linked performers. Source time: completed_at, else
started_at, else creation time. `technical_sessions`, `completed_color_sessions`,
`recorded_outcomes`, `recipe_revised_sessions`, `recorded_risk_events` count
recorded domain facts, not inferred success, medical status or recommendation.
`technical_followups_snapshot` sums existing CRM follow-up facts for authorized
management views. Raw technical payloads, photos, signatures, private notes and
customer health details never enter report projections.

## Comparisons and details

For period metrics: current, previous, absolute delta and percentage delta in basis
points. Percentage is available only when previous > 0; otherwise absolute change
is shown with unavailable percentage. There is no NaN or Infinity. Money uses exact
server integers and string serialization; Web uses BigInt, Android BigDecimal /
BigInteger, without floating-point monetary aggregation.

Staff/service/category filters affect supported period aggregates and rows.
Domain/segment/source-ID/cursor filters limit the source drill-down only, and the
interface says so. Stable cursor is `(at, source_id, domain)` descending. A page and
its CSV contain at most 50 source rows, plus period metrics. Current snapshot metrics
are explicitly independent of the selected period. No deep OFFSET report path.
