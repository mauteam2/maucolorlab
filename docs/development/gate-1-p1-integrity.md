# ELIFORA Gate 1 corrective integrity slice

Scope: G1-01–G1-06 only. Stock and Finance are not implemented.

## Lock protocol

Tenant critical writes serialize on the existing transaction advisory key
`hashtextextended(organization_id::text, 0)`. CRM and Salon acquire this BEFORE
their organization-row lock. Client mutations and Live already use that key.
Merge/reversal lock source and target client rows in ascending UUID order,
reload them and validate the review fingerprint under lock. Conditional updates
return actual after-versions used in the immutable merge record.

Ordering: organization advisory → organization row (where required) → ascending
client rows → session/appointment rows → catalog series advisory (seed 2).
Catalog governance never acquires a tenant advisory lock after the series lock.
All commit-sensitive catalog consumers use `app_private.lock_brand_catalog`,
then read authoritative published/source/product/compatibility state. Historical
catalog versions remain readable; retirement is not retroactive history editing.

## Active operation policy

Merge rejects either canonical family containing any non-terminal appointment
or Live Session, across all organization locations. The error is
`CRM_MERGE_ACTIVE_OPERATION`. Close the operational work, refresh the review and
make explicit field decisions. No technical FK/history is reassigned.
The private boolean helper derives organization from fresh authenticated global
owner/manager membership. It returns no operational or technical payload.

## Recipe revision

Old unstarted steps become SUPERSEDED and remain visible in version history.
Already-started/completed steps, original bowls and usage are retained. A new
reviewed recipe projects a fresh bowl, pending root step and required integrity
checkpoint. The target snapshot follows the reviewed revision. STEP_START also
revalidates current technical input/catalog/recipe and rejects old-recipe bowls.
An invalidated unit cannot be restored by a generic sequence edit.

## Post-stop material accounting

`MATERIAL_RECONCILE` is accepted only for COMPLETED/CANCELLED/ABORTED sessions,
using the existing usage permission and expected session version/control epoch.
It appends a material event; it never restarts execution or changes steps,
original usage, outcome or Hair Passport history. Corrections reference the
current preceding event for that bowl. Stable mutation receipts prevent replay
from creating another event; changed-input replay conflicts.

Prepared/used/waste values are measured **total bowl mixture** in grams (the
existing verified 1:1 recipe context applies). Each quantity can independently
be null: UNKNOWN is never converted to zero or inferred from another field.
All-known values must conserve material. Zero is an explicit measured value.
Stock is not implemented; a future consumer must join the immutable recipe and
product/version snapshots and handle completeness, source-event dedup and
correction lineage explicitly. It must not sum original usage plus corrected
replacement measurements as additional physical consumption.

The optional `materialReconciliations` property is absent from historical signed
payloads until first reconciliation; no default field is injected during parsing.
Offline drafts are explicitly synced with original mutation/version fields;
conflicts require review rather than automatic reconciliation.

## Appointment transition policy

New Live CREATE accepts only omitted/null `appointment_link`. Non-null UUIDs,
including same-tenant ones, are rejected. `live_sessions.appointment_link` and
historical payload `appointmentLink` are retained unchanged solely as
**UNVERIFIED_LEGACY** external references. They confer no ownership/relationship.

The only authoritative relationship is `salon_appointment_live_links`, created
through `LINK_LIVE_SESSION`. Its existing server checks and composite ownership
FKs require an existing appointment in the permitted organization/location and
the appropriate original client. One session cannot be linked to two appointments.
Legacy mismatch is tolerated as historical unverified input, never preferred
over a validated link. Future cost/stock consumers must use this relation and
must not join appointments on the legacy UUID.

## Verification

Forward migrations only; test fixtures are synthetic transaction-local inputs.
`scripts/test-gate-1-concurrency.py` uses separate real Docker/psql backends and
observes `pg_blocking_pids` before releasing the first transaction. It is wired
into the Database/RLS CI job and refuses execution outside disposable CI.
New pgTAP tests cover active-family guards, version/history preservation and
append-only material events/authorization. Web tests cover execution invalidation,
historical hash compatibility, late quantities and explicit offline conflict review.

This document describes the correction contract, not a declaration of completed
validation. Final executed counts and CI checkpoint belong in the delivery report.
Gate 1 P2/P3 findings remain out of scope.
