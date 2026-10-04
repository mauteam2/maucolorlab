# ELIFORA — Phase 3 live color sessions

Accepted scope: live professional execution of the existing controlled-review recipe,
without turning Phase 2C historical drafts into executable engine predictions.
Base checkpoint: `5d04d15063d875ff254ca38315e5662b6b16aad8` (all four CI jobs passed).

## Controlled professional approval

ColorLab → stored recipe → **Profesyonel inceleme ve canlı seans** → explicit
professional review note and acknowledgement → PREPARING → READY → START.
The original recipe remains `DRAFT_FOR_PROFESSIONAL_REVIEW`, `executable:false`.
The session records a separate professional approval, actor, time and recipe
version. This is permission to manage the reviewed workflow, not proof of
technical competency or a medical assessment.

CREATE, START, RESUME, REASSESS and RECIPE_REVISION re-run the same Confidence,
Risk, Color and verified pilot compatibility path. Hair fingerprints, current
target, catalog publication/fingerprint, active products, source review,
evidence freshness and selected developer conditions must still match. The
database locks the organization and catalog and compares the source token
again. A 24-hour recipe review window is an ELIFORA safety policy, not a
manufacturer expiry claim. Stale dependencies return HTTP 409
`SESSION_START_BLOCKED_STALE_INPUT`; no safety override exists.

## Application plan and bowls

The domain preserves Hair Passport region UUIDs and current Color Plan target.
The current verified IGORA ROYAL ABSOLUTES pilot supports ROOT_REFRESH only.
MID, ENDS and custom names never acquire inferred manufacturer instructions.
One root application step plus a required integrity checkpoint is initialized;
the professional can write/reorder pending steps while preserving required
checkpoint identities. Changes record structured before/after deviations.

Multiple bowls and concurrent timers are supported. Additional bowls use the
current reviewed recipe and its supported region. Recipe revision binds a new
stored, freshly validated recipe, explicit review and immutable deviation;
existing bowls and usage stay bound to their old recipe. Create a new bowl to
use the revised recipe. There is no silent product substitution.

## Controller and security

Controller is authenticated user + tab device UUID + monotonically increasing
control epoch. Mutation requires expected record version and caller permission.
Transfer requires current controller and an active target professional with
control permission at the same organization/location. Concurrent or stale
commands return 409; no last-write-wins path exists.

Assistants can contribute notes, photos, checkpoints and usage; reception can
view. Neither can approve recipe revisions or complete sessions. Roles resolve
from database memberships, never editable JWT metadata. Critical commands use
the existing server HMAC key with caller JWT, a short expiry, exact input,
previous state hash and signed next state. Keys never enter client bundles.

POST/GET `/api/live-sessions`; GET/POST
`/api/live-sessions/{id}?client_id=…`. The POST body is a strictly validated
discriminated command, not an arbitrary state patch. This keeps one atomic
mutation convention for steps, timers, checkpoints, usage, transfer, review and
completion. Every mutation has a correlation ID and permanent actor-scoped
idempotency receipt. Retries return the prior version without duplicate audit,
usage or passport history; they do not grant current control or approval.

## Usage and private photos

Planned mixed grams come from the recipe; prepared/used mixed grams are
professional measured input. Bowl closure has no reuse: prepared ≥ used;
waste = prepared − used. Each 1:1 product component gets half of the measured
mixture; mixed quantities must be multiples of 0.02 g to preserve exact 0.01 g
component accounting. Events include product/version, recipe, bowl, actor and
time; no stock balance, cost, hair-length estimate or predictive dosing exists.

BEFORE/CHECKPOINT/PROCESS/AFTER photo metadata is reserved by an authorized
command. Bytes go to a private, 10 MiB image-only bucket with membership and
session RLS; no upsert, delete, public URL or automatic face manipulation.
Uploads are audited. Photos are read through a fresh-authorized server download.
Completion blocks reserved photos whose bytes were not uploaded.

## Platform and operational boundaries

Phase 3 delivers the responsive Web live workflow and shared OpenAPI 0.14.0.
Android remains buildable with its existing features; this phase does not claim
a new native live-session screen or offline Android execution. Web includes a
320 px layout, tablet two-column adaptation and larger three-column layout.
The approved logo, intro and design system remain intact.

Realtime is deliberately not introduced yet: manual refresh and focus/reconnect
refresh provide viewer updates. Timers are calculated from timestamps, without
server polling. Controller mutations remain authoritative regardless of viewer
refresh delay. Optional case/appointment UUIDs are external references, not
new persistence or fabricated ownership links. No production database is used.

Next candidate phase: review the recorded outcomes and immutable usage events
with professionals, then plan stock consumption integration and client recipe
memory selection with fresh Risk/Color evaluation. Phase 4 is not implemented.
