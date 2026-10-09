# ELIFORA payments and explicit allocations

CASH, CARD, BANK_TRANSFER and OTHER describe recorded methods. CARD does not
contact a payment provider. External references are optional factual references.
Payments append one negative CLIENT entry and a positive money-method entry.
Each allocation is a separate immutable relation between a payment and a charge.
Client balance is unaffected by allocation: money is counted once, at payment.

Multiple payments may settle a charge (split methods) and each payment can settle
up to 20 explicitly selected charges. A payment's net allocations cannot exceed
its unrefunded amount; a charge's net allocations cannot exceed its gross amount.
Currency, organization, location and canonical client family must agree. Commands
hold the shared identity protocol and serialize finance mutations per location.
Each authoritative outstanding/available amount is reread under lock.

Unallocated payment money becomes client credit only when the caller explicitly
sets `confirm_credit=true`. Deposits intentionally remain unallocated advances.
`ALLOCATE` explicitly applies existing credit and records its audit event. The
system never silently consumes a deposit at service completion.

Example, TRY minor units: charge 100000, CARD payment/allocation 60000 → account
debt and charge remaining 40000. Deposit 10000 → account debt 30000, charge
remaining 40000, available credit 10000. Explicit deposit allocation → remaining
30000 and credit zero; account debt stays 30000. CASH payment/allocation 30000
settles both. A later allocated CARD refund 20000 reopens 20000 debt/remaining.

Money-changing commands require a stable mutation ID and stable payload across
network retries. The server stores permanent success and controlled-failure
receipts. Changed input under an existing mutation ID returns FINANCE_CONFLICT.
Use a new mutation ID when correcting input or retrying a previously rejected
business operation after authoritative state changed.
