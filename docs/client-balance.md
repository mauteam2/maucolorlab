# ELIFORA client balance

CLIENT ledger convention:

| Fact | Signed effect |
| --- | --- |
| Service charge / retail sale / client debit | Positive debt |
| Payment / deposit / administrative client credit | Negative credit |
| Actual refund | Positive debt or reduction of credit |
| Administrative reversal | Exact inverse of original entries |

Positive aggregate balance means the client owes the salon; negative means the
salon holds client credit. Zero means net settled. This is reconstructed from
immutable ledger facts, never a mutable `client.balance` field.

Outstanding charges and available credit are separate projections. Both can
coexist because credit application is explicit. CLIENT_CREDIT is an authorized
administrative account correction and creates no actual money-method receipt;
it can be explicitly allocated. CLIENT_DEBIT is an account correction and is
distinct from a service sale. Neither is an employee/customer score.

Canonical CRM profile reads include historical facts across the client family at
the selected location. Merge and archive never rewrite financial `client_id` or
financial attribution. Archived history remains readable with finance.view.
New manual/payment/deposit/credit activity requires an active canonical identity;
refund/reversal corrections retain the original historic identity.

Expense and discrepancy details remain separately permissioned. Technical staff
are not automatically granted full client financial history. Appointment and
client Web panels request fresh scoped projections only for finance.view users;
ColorLab does not embed finance history or financial risk scoring.
