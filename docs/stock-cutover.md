# Enabling location inventory

1. An authorized stock.manage_items member enables inventory for the selected location. The server retains the first enabled timestamp; repeating ENABLE cannot shift cutover.
2. Create location cards, map published verified technical products where appropriate, select explicit units and set thresholds. Salon operational products remain technically unverified.
3. Physically measure existing stock. Record OPENING with actual date, quantity, reason and reference; record genuine lots first when required. Zero is a valid measurement. Do not count a product aggregate and the same lot quantities twice.
4. Start the authenticated server outbox executor for this development/staging/pilot location. Review failed deliveries and actual lot requirements in the stock Action Center.
5. New post-cutover Live sessions create reliable stock events. Receipt, adjustments and physical counts keep the operational ledger current.

Sessions created before the enabled timestamp are PRE_STOCK_HISTORY / NOT_IMPORTED, including material facts recorded later. The initialization never backfills estimated past consumption or deducts old planned recipes. Cards without an opening measurement expose UNKNOWN rather than a fabricated zero. Receipts/count confirmation do not silently establish an assumed initial balance.

Failed usage is not synchronized usage. Missing mapping/unit/lot/opening or measured amount must be resolved factually, then retried. BLOCK_NEGATIVE shortages retain technical truth. WARN_NEGATIVE requires an explicit audited policy and shows the resulting discrepancy. Deployment scheduling and credentials are environment configuration; no production connection or production migrations are part of Phase 4C.

Verification uses forward migrations, pgTAP, existing Gate 1 two-connection races, stock-specific distinct-backend lock barriers, a 10,000 synthetic movement ledger, Web unit/E2E checks and Android unit/lint/build. CI uploads stock database performance JSON and desktop/mobile UI captures. Measurements describe the disposable CI environment, not a production capacity promise.
