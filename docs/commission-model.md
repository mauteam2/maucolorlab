# ELIFORA operational commission — Phase 5B

Commission is an operational accrual from recognized revenue. It is not salary, payroll, a staff payment or a tax filing. There is one explicit performer in the current appointment model; no inferred equal splitting. Service commission uses immutable `performed_by`, not `recorded_by`, cashier or session controller. A retail sale requires authorized explicit `ATTRIBUTE_RETAIL` before an accrual can be created; the recorder is never silently substituted.

## Immutable rules and effective time

Policies have separate SERVICE / RETAIL domains. Versioned methods are PERCENT_GROSS, PERCENT_NET_OF_TAX and FIXED_AMOUNT. Basis and result are organization-currency minor-unit integers, percentages are integer basis points, and final results round half up. Fixed commission is capped at the eligible net basis; percentages are capped at their explicitly chosen gross/net basis.

Assignment precedence is the performer's exact service → service category → domain default → no commission. Same-priority effective ranges cannot overlap. Assignment endings are separate immutable records; they do not rewrite the original assignment. Policy changes require the expected version and future effect. Commands refuse backdating across existing revenue facts. The authoritative eligible time is appointment completion, or retail occurrence time, not payment or subsequent charge processing time. Historical accruals retain policy ID/version, assignment, performer, basis, method/rate/fixed value and calculated amount.

## Refund and reversal

Only posted SERVICE_CHARGE / RETAIL_SALE revenue earns commission. Payments and deposits do not create additional revenue or commission. Allocated refunds create immutable negative revenue and commission adjustments. The cumulative refunded gross fraction determines the cumulative net and commission reduction; successive refunds use the residual rather than independently rounding each share. Reductions are capped at the original amount. An administrative charge reversal compensates all remaining revenue/commission. Retail reversal also reverses the physical Stock movement and its original cost; a money refund alone does not restore physical inventory.

`PROCESS_CHARGE` is idempotent and uses the shared Finance lifecycle lock. Unique charge/accrual and source/adjustment constraints are a second barrier. Late explicit retail attribution replays existing negative adjustments, so already-refunded revenue cannot acquire unreduced commission. Arbitrary manager amount overrides are not exposed in this phase; `commission.adjust` is reserved separately from policy management.

## Privacy

`commission.view_self` exposes only the authenticated user's rows; `commission.view_all` exposes authorized team earnings. `commission.manage_policies` allows policy/assignment management. Reception has no automatic earnings visibility; technical access does not imply acquisition cost or team commission visibility. Fresh membership and location scope are checked before and after reads, with immutable-table RLS as a separate barrier. Source customer identity requires the existing client-read permission.

Web and Android discard late results on context changes, permission changes, sign-out or concealment. Web private screens conceal data on blur / hidden visibility and recheck on focus and at 15-second intervals. This is controlled online access, not an offline earnings cache. Staff deactivation preserves historical earnings for authorized management.
