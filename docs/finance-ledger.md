# ELIFORA operational finance — Phase 5A

Finance is an operational salon ledger, not regulatory accounting, profitability,
commissions, invoices, supplier accounts, hardware or payment-provider processing.
All posted facts use `finance_documents`, `finance_ledger_entries`, allocations,
payments, expenses and retail lines. Application roles cannot insert, update or
delete these facts directly. Corrections append a documented inverse or refund.

## Currency and exact amounts

`organizations.base_currency` and its controlled finance configuration describe
one organization currency. Configuration changes use `CURRENCY_SET` under the
exclusive Gate 1 organization lock, updating both sources atomically. Financial
activity, including a cash opening, seals the currency. A database trigger also
blocks subsequent organization currency changes. Historical amounts are never
converted. Supported registry: TRY/EUR/USD/GBP exponent 2, JPY 0 and KWD 3.
Further supported currencies require a reviewed additive registry/contract change.

Database amounts use integer minor units, API values use canonical decimal
strings, Web uses `BigInt`, Android uses `BigInteger`. No float transports money.
Each posted amount is positive and at most 9,000,000,000,000,000 minor units;
ledger direction is signed. Currency/exponent are explicit. Retail quantities
retain the Phase 4C decimal stock unit and are independent of monetary precision.

Tax is an immutable snapshot in integer basis points. Inclusive tax is
`floor((gross * rate + (10000 + rate)/2) / (10000 + rate))`, net is the remainder.
Exclusive tax is `floor((net * rate + 5000) / 10000)`. Both round half up using
exact PostgreSQL numeric arithmetic, then integer minor units. Retail quantity ×
unit price uses half-up minor-unit rounding. Existing appointment quotes are used
as stored; incompatible currency precision is rejected rather than converted.

## Sources and attribution

`SERVICE_CHARGE` requires a COMPLETED appointment and copies its stored quote,
service/version/name, tax and performing staff. Current catalog prices have no
effect. Manual charges require `finance.charge` and explicit professional input.
One appointment creates one original charge; re-entry is not automatic.
`recorded_by` differs from appointment `performed_by`.

Only `salon_appointment_live_links` establishes the operational live-session
relation. Caller-supplied session IDs and legacy UUIDs cannot authorize it.
Historical client IDs remain unchanged through CRM merge/archive; canonical
family reads consolidate them, while new manual activity requires the current
active canonical identity. Historical refunds and permitted reversals preserve
the original source identity.

## Authorization and locks

Every RPC resolves current authenticated database membership and scoped
permissions. Fresh checks occur again after lock acquisition; Web/Android also
recheck context before releasing responses. Technical staff receive no default
finance permission. Reception can view operational finance and record charges,
payments/refunds/opening, but cannot read expenses, close discrepancies or adjust.
Expense originals, reversals and corresponding ledger rows are hidden under RLS.
Cash detail is omitted, not filled with fabricated zeros, without closing rights.

Money commands use permanent actor/organization mutation receipts. Identical
payloads return their first result; changed payloads conflict. Controlled failures
are also permanent; correction uses a new mutation ID. Receipts do not expire.
Financial writes use a private NOLOGIN/NOBYPASSRLS role through controlled RPCs.

Lock order: mutation receipt advisory lock → shared Gate 1 organization identity
lock (exclusive for currency changes) → location MAIN finance register advisory
lock → cash row → financial document rows → stock item/lot when applicable.
The location lock deliberately serializes V1 money commands for that register;
different locations/organizations are independent. Scale evidence describes this
tradeoff and does not claim enterprise accounting throughput.

Bounded reads return 100 documents, 200 related allocations/entries, 50 accounts,
200 current clients, 100 uncharged completed appointments and 20 cash sessions.
Historical pages support offsets through 10,000. Daily boundaries use the location
timezone. A client/appointment filter permits bounded historical reads.

Gate P2 notes G1-07 receipt TTL, G1-08 controller recovery, G1-09 E2E diagnostics,
G1-10 reception technical projection and G1-11 RPC coverage remain separately
tracked. Finance receipts themselves have no TTL. Phase 5A does not implement
the unrelated P2 remediation or Phase 5B cost/profitability work.
