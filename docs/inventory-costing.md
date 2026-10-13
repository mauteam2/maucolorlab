# ELIFORA inventory costing — Phase 5B

The authority is the posted Stock movement and its immutable `stock_cost_basis_events` / `direct_cost_facts`. Quantity is still owned by Stock; costing never posts a second consumption. Costing is an operational direct-cost layer, not purchasing, supplier debt, accounting, or a general ledger.

## Acquisition and valuation

`costing_operation(INTAKE)` wraps an existing OPENING or RECEIPT in the same transaction. It requires both `cost.manage_acquisition` and `stock.receive`, an organization-currency cost, measured quantity, basis timestamp, reason, and optional external reference. Supply either a total minor-unit amount or a rational unit amount, never both. A permanent mutation receipt and source uniqueness prevent duplicate movement/cost creation. An already-posted unpriced receipt cannot be retroactively rewritten through INTAKE.

The selected method is **MOVING_WEIGHTED_AVERAGE** by organization, location and stock item. Under the item row lock, the prior running pool plus incoming exact value gives the new pool. Numerator/denominator arithmetic uses PostgreSQL integer NUMERIC and GCD reduction; no binary floating-point money. Hundredths of inventory units preserve the existing quantity precision. Final minor-unit allocations round half up; cumulative corrections allocate the rounding residual deterministically.

An explicitly selected lot may use its own verified basis. No lot is inferred from a weighted-average pool, and there is no fabricated tube or bowl-to-lot attribution. Unselected movements retain a NULL lot. A known global pool is a valuation fallback, never proof of physical provenance.

## Unknowns and corrections

Unpriced inventory, unresolved conversion, insufficient inventory and negative pool quantity yield UNKNOWN cost, not zero. Mixing an unknown opening balance with a priced receipt remains UNKNOWN until an authorized, measured future correction or exhaustion of the pool. `SET_BASIS` requires positive on-hand quantity, `cost.correct`, organization currency and the current basis version. It appends a future basis and leaves every old movement/cost fact unchanged.

Measured zero acquisition cost is KNOWN zero. UNKNOWN history cannot be healed by a later receipt or basis correction. Material correction uses the original usage basis, including its unknown state. Negative correction value cannot fabricate a safe current pool: the pool becomes UNKNOWN and requires review.

## Locks and permissions

Commands use permanent costing receipt locks, shared organization currency locking and the existing Stock receipt protocol, then item / explicitly selected lot row locks. Cost triggers never acquire Finance or Live-session locks after Stock locks. Finance retail commands retain their existing Finance → Stock order. Policy/charge consumers share the existing `finance-main` location lock, not a new independent lock.

Normal application roles cannot INSERT, UPDATE or DELETE costing facts. RLS requires fresh membership, organization/location access and `cost.view`. Acquisition and correction permissions are distinct. Private SECURITY DEFINER helpers have a fixed empty search path and revoked public execution; exposed commands resolve authorization from database memberships, not user-editable JWT claims. No production migration is part of this delivery.

## Evidence

`costing_valuation`, `costing_material_lineage`, `costing_retail_lineage`, `costing_partial_service` and `costing_commission_privacy` pgTAP tests cover arithmetic, immutable lineage and denials. `scripts/test-costing-concurrency.py` observes blocking between distinct PostgreSQL backends. CI runs them against a freshly reset disposable local Supabase database.
