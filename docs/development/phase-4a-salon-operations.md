# ELIFORA — Phase 4A Salon Operations Core

This slice adds the service catalog, membership-backed staff profiles, independent technical competency, location working hours and exceptions, weekly shifts/breaks and dated availability, resource capacity, appointments and a read-only technical precheck. It preserves the approved salon design, integrated f/brush logo, sign-in intro, Color Engine, Brand Adapter and reviewed Live Color Session behavior. Finance, stock, commissions, reports, full CRM and automatic scheduling are outside this phase.

## Working screens

- `/workspace`: actual appointment, active service and bookable staff counts for the visible interval. Existing verified workspace controls remain.
- `/workspace/appointments`: day/week/31-day calendar, staff filter, customer search, appointment form, alternatives, selected appointment, explicit status transitions, technical precheck and links to client/ColorLab/live session.
- `/workspace/team`: profiles selected from existing active memberships, competency levels, weekly shifts and breaks, dated shifts/breaks/leave/unavailability. Role and user identity are never edited here.
- `/workspace/settings`: service catalog and extensible categories, default/buffer duration, price/tax, technical requirements, explicit eligible memberships, resource requirements, weekly location hours and dated exceptions, capacity resources.

Initially there are no operational records. Configure salon hours, staff profiles and shifts, service eligibility, and any required resources before booking. Standard category labels are lookup vocabulary, not fabricated service records. Development-only `/preview/salon/*` references remain clearly identified sample screens; workspace routes use persisted data.

## Service boundary and tenancy

Browser calls same-origin, private/no-store `/api/salon`, `/api/salon/slots`, and GET-only `/api/salon/appointments/{id}/precheck`. Shared shapes are generated from strict runtime schemas into `contracts/salon-operations.schemas.json` and added to OpenAPI 0.15.0. The server derives membership, organization and location from the verified session and workspace cookie. Mutation/slot requests require the selected workspace precondition. Auth membership is refreshed before protected results are released.

PostgreSQL tables force RLS. Normal application roles receive scoped SELECT only. SECURITY INVOKER public RPC wrappers call private functions owned by a NOLOGIN/NOBYPASSRLS writer. Those functions check live membership/permission before and after taking the organization lock. No service-role write escape or user-editable JWT role is accepted. Commands reject unknown keys and caller price/ownership claims.

Writes require optimistic `expected_version`, permanent organization/actor `mutation_id` receipts, correlation IDs, minimal audit events and append-only historical command/result versions. A identical retry returns the original result; changed input under the same ID conflicts. Completed/cancelled/no-show appointment records and relational live-session links are immutable to ordinary roles. Deactivation preserves historical attribution.

## Scheduling policy

All Phase 4A writes serialize on the organization row. Each reservation validates current service, active eligible staff membership, independently approved competency, salon opening/exception, staff shift/break/leave, same-user appointments across locations, and required resource capacity. A GiST exclusion constraint also prevents overlapping active staff reservations. Resource capacity is the maximum simultaneous occupancy over the whole interval, rather than the sum of unrelated overlaps. Resources are allocated deterministically by ID; staff and resources reserve the entire before/after-buffer interval. DRAFT also reserves capacity. Cancellation and terminal completion release future reservation capacity.

No appointment moves automatically. Hours, shifts, eligibility and service changes keep existing bookings; reconfirm/arrival/start performs current checks. Service version changes require review/edit. Resource type/deactivation/capacity reduction with future active reservations is rejected. A person's optional working-capacity field never permits double booking. A configured capacity resource can have multiple units.

Local appointment wall time is converted using the persisted location IANA timezone, then stored as UTC `timestamptz`. Nonexistent DST times fail; repeated times require an explicit UTC offset. Slot search skips ambiguous/missing wall times. V1 disallows overnight hours/appointments; a day can close at minute 1440 through the API. Date exceptions override weekly hours. A dated SHIFT overrides the regular shift for that business day; BREAK/LEAVE/UNAVAILABLE still block. Availability editor accepts explicit ISO 8601 offsets; it never assumes the browser timezone.

Alternative search is deterministic and limited to seven inclusive dates, 15-minute candidate spacing (672 checks), and at most 20 results. It uses the service's authoritative resource requirements and current location, cannot accept caller resource bypasses, and rechecks again when saved. Calendar reads are limited to 31 dates/500 appointments and expose `has_more`; narrow the period when necessary.

## Technical precheck

Precheck reuses the existing Risk Engine and Hair Passport read boundary. It reports missing/freshness state, required information/tests, risk/gate/recovery reassessment, competency/escalation, technical-history truncation and timing warnings. The latest own-location completed live session supplies the actual recorded formula, outcome, process duration, used grams and waste. Missing memory is `null`/UNKNOWN, never a invented formula or industry estimate. The active Recovery module is not implemented in earlier phases: absence is explicitly `NOT_ASSESSED`; an existing Risk Engine recovery requirement is surfaced.

Duration estimate uses the latest 100 own-location completed appointments for the same service and staff. With at least five valid 1–720 minute samples it uses the deterministic median rounded up; otherwise the configured service duration remains the default. No ML, prediction from invented cases or automatic duration update occurs. Appointment duration override requires a separate permission and written reason. The quote snapshots server catalog price/tax/currency but is not a payment or finance operation.

Precheck has multiple structured statuses and **never creates a recipe**. Professionals still use the reviewed recipe flow. An IN_SERVICE appointment can explicitly link an existing same-customer, same-organization, same-location live session; this adds a relational association without rewriting Phase 3 history.

## Verification

Critical coverage includes schema rejection, same-origin/bounded HTTP, fresh authorization and output tenancy, historical duration, unknown technical memory, SQL allow/deny, revoked/cross-tenant reads and writes, DST, explicit eligibility/competency, buffered reservations, resource capacity, versions, permanent retry and state transitions. Real local-Auth/SQL browser tests exercise forms, resource concurrency, calendar, precheck, immutable completion and 320 px layout. No real salon/customer records or production connection is used.

Local Windows lacks Docker/PostgreSQL, so database migrations and real Auth browser tests run against disposable Supabase in the existing CI. Android is unchanged and its existing test/lint/APK jobs remain required. Final executed counts and visual captures are reported with the final verified commit.
