# ELIFORA cash sessions

Phase 5A supports one configured MAIN register per location, with one active
session. The explicit register column permits a future reviewed multi-register
extension. Opening requires measured integer cash, actor and time; no prior-day
balance is carried forward automatically.

Expected cash = opening + cash payments + cash deposits − cash refunds − cash
expenses + signed explicit cash adjustments and allowed administrative inverses.
Cash In and Cash Out are the positive and negative method-ledger aggregates.
All actual CASH entries belong to an open or closing-review session. Backdating
before that session opening is rejected; a payment provider is not involved.

OPEN → CASH_CLOSE_SUBMIT → CLOSING_REVIEW → CASH_CLOSE_CONFIRM → CLOSED.
Submit records counted cash, derived expected, difference=counted−expected,
ledger basis count and version. Positive difference is SURPLUS, negative SHORTAGE,
zero MATCH. A discrepancy requires explicit acknowledgement and an audit reason.
No automatic balancing adjustment, punishment or employee attribution is made.

Late cash transactions during review change the authoritative basis/version.
Confirm must match the reviewed version, expected amount and ledger basis; stale
confirmation returns CASH_CLOSE_STALE and requires a new count. A location
register lock orders concurrent late payments/close so an incorrect close cannot
silently commit. Closed session history is immutable. Refunds of old payments
are actual money returned in a new open cash session; administrative reversal of
a fact in a closed session is rejected.

Reception can open the cash register but has no default finance.cash.close or
finance.adjust permission. Its projection exposes status/identity/version only,
with no opening, expected, counted or discrepancy details. Closing rights and
expense permissions are resolved from memberships independently of role labels.
