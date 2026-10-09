# Physical counts and reconciliation

An authorized stock.count member records a draft containing item, optional real lot and measured quantity. The server records the ledger basis; the client cannot submit it. Lines are bounded to 50, duplicate item/lot scopes are rejected, units are enforced and UNKNOWN cannot silently become zero. Initial measurements use the explicit opening workflow; later physical counts reconcile established opening facts.

Confirmation locks the count header, location cutover row and sorted item rows. It re-reads balances and pending/failed technical deliveries. A changed basis or unresolved delivery returns STOCK_COUNT_STALE without posting an adjustment. Record a new factual count after resolving the discrepancy; do not force the old one through.

Technical enqueue holds KEY SHARE on the cutover row until its transaction commits. Confirmation's FOR UPDATE either sees a previously committed source delivery and rejects the stale count, or commits before later technical enqueue; that later usage then posts after the physical count. Ordinary balance posting remains item-scoped.

Confirmed nonzero differences append ADJUSTMENT_IN/OUT with actor, reason and mutation/correlation identity. Measured zero and zero differences remain explicit confirmed count facts without zero movement rows. Confirmed count lines and ledger rows are immutable; a second confirmation conflicts. No historical balance is overwritten. Duplicate network requests use permanent receipts.

Opening, receipt and adjustments require factual effective date, two-decimal quantity (integer for UNIT), explicit reason and optional external reference. Manual mistakes use one immutable REVERSAL, subject to negative-stock policy. Automatic Live source movement reversal is rejected in favor of factual technical reconciliation.
