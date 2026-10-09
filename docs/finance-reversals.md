# ELIFORA refunds, reversals and retail provenance

REFUND means actual money returned. It references an original PAYMENT/DEPOSIT,
preserves the original fact and appends the same recorded method with negative
money and positive client-account effect. Cumulative valid refunds cannot exceed
the original payment. Available unallocated credit returns first; allocated funds
are released deterministically from the latest allocations using negative
allocation rows referencing their originals. No allocation is edited/deleted.

REVERSAL means an administrative entry was incorrect. It appends an exact inverse
of original ledger facts and retains a permanent reversal_of relationship.
One original has at most one reversal. Refunded payments, refund/reversal records
and financial facts in a CLOSED cash session cannot be reversed. Charges with
current net allocated payments must first have those payment facts corrected.
Expenses require both adjustment and expense-management permission to reverse.
Reason, actor and correlation remain audited.

ADJUSTMENT is an explicit measured cash correction, requiring finance.adjust and
an active register. CLIENT_CREDIT/DEBIT are explicit client-account corrections.
They are never silently created by a discrepancy or a refund.

Phase 5A retail records one stock item/lot and positive quantity per sale. Price
and tax snapshots remain immutable. Its source is finance_document_id on the
existing Phase 4C stock ledger, with permanent uniqueness. Retry cannot consume
stock twice. Finance and stock item/lot locks preserve the existing unit precision,
opening, mandatory lot and negative-stock policies. Financial and stock changes
commit atomically or both roll back. No second quantity or stock-cost truth exists.

A retail administrative reversal appends an authoritative stock inverse and
financial inverse together. Ordinary stock reversal cannot independently erase a
finance-owned movement. A money REFUND does not assert that a product was
physically returned and therefore does not silently restock it. Physical return
handling can use a factual stock receipt under existing permissions, or a future
reviewed returns slice. Stock receipts do not automatically create expenses,
supplier liabilities, payables or invoices; an expense may optionally reference
an actual scoped RECEIPT movement.
