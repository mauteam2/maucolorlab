# ELIFORA operational profitability — Phase 5B

Recognized operational revenue comes only from posted immutable service and retail charges, plus their compensating refund/reversal facts. Cash collection, outstanding receivables, payments, deposits and catalog prices remain distinct concepts. Expenses remain separate existing Finance records, without silent allocation to a service.

## Formula

The displayed contribution basis is **NET_OF_TAX**:

```
net revenue = original net charge + immutable net revenue adjustments
direct product cost = actual component cost facts + cost compensations
gross contribution = net revenue - direct product cost
commission = original accrual + negative revenue-linked adjustments
contribution after commission = gross contribution - commission
gross contribution margin = gross contribution / net revenue
```

Known cost is required for contribution and margin. UNKNOWN / PARTIAL return NULL for total direct cost, gross contribution, after-commission contribution and margin; known component subtotal stays distinct. Zero net revenue has no percentage margin. Commission privacy independently suppresses commission and after-commission values when not authorized. Complete cost with undisclosed commission still supports authorized pre-commission contribution.

These figures exclude salary, rent allocation, full overhead, depreciation, inventory write-down accounting, financing and tax treatment. They are direct operational contributions, not accounting net profit. No expense allocation, payroll or reporting/intelligence engine is introduced.

## Bounded API and UI

`GET /api/costing` dispatches explicit PROFITABILITY / COST_BASIS / POLICIES / COMMISSION_SELF / COMMISSION_ALL reads. `POST /api/costing` accepts strict controlled commands and a workspace reference, checks same-origin, bounds streamed JSON to 32 KiB and returns private/no-store data plus a correlation ID. Browser code never supplies calculated cost, commission, policy snapshots or ownership. Shared shapes are in `contracts/costing.schemas.json` and OpenAPI 0.19.0.

Revenue and commission reads use explicit periods (maximum 366 days), 50 rows per page and offset ≤10,000. Cost source, adjustment and policy collections are bounded. Provenance truncation is explicit; totals use every scoped immutable source. Periods are half-open, with the end date exclusive. The phase does not calculate an organization's lifetime contribution for a normal page load.

## Performance and verification

Phase 5A's real 10k Finance baseline was approximately 6,666 ms day summary / 6,250 ms client balance. Phase 5B removes repeated full Stock ledger sums on each priced receipt using immutable running basis state under the item lock. Narrow private Finance CLIENT-only aggregates authorize once instead of repeating row-level membership predicates and nested available/outstanding scans. Last-basis reads use the existing coalesced-lot/version index rather than a non-indexable generic NULL-equality filter. Direct-table RLS remains unchanged; helpers require fresh permission and tenant/client-family validation.

CI captures five read families, raw samples and EXPLAIN ANALYZE BUFFERS in `costing-database-verification/costing-performance.json`; existing Finance performance evidence remains separately uploaded. Delivery reports must cite executed measurements rather than infer performance from the implementation. Run the existing Gate, Stock and Finance concurrency suites as well as eight new real backend races. The new 10k costing population and existing mixed Finance population are different fixtures and must be identified when comparing results.

Known Gate P2 tracking remains: G1-07 factual receipt TTL, G1-08 controller recovery, G1-09 E2E diagnostics/retries, G1-10 reception technical projection and G1-11 RPC coverage. Costing's permanent receipts do not claim to close the older domains' TTL finding. Android instrumentation APK compilation is not device execution. Production deployment is outside this development phase.
