# ADR 0015 — Atomic salon reservations and independent competency

Accepted for Phase 4A, 2026-10-06.

Staff profiles extend existing salon memberships per location. Membership role controls API permissions; technical competency and explicit service eligibility independently control whether a person may perform a service. No second staff identity or implicit competency derived from an owner/manager role is introduced.

Salon configuration and bookings use one organization-row transaction lock. This deliberately favors predictable correctness for small salon organizations over high concurrent booking throughput. It serializes capacity checks with edits to services, staff, hours and resources. A same-user GiST exclusion constraint protects staff across locations. Full buffered resource occupancy uses an interval peak calculation so nonconcurrent overlaps do not falsely consume summed capacity. A future scaling phase may replace the coarse lock only with equivalent concurrency tests.

Versions and permanent actor-scoped mutation receipts preserve auditable retries. Historical snapshots retain service, staff identity, duration and quote attribution. Live-session associations are relational and append-only; existing reviewed technical sessions are not modified by scheduling.

The precheck reads actual technical memory and existing Risk Engine decisions; it does not generate recipes or bypass safety gates. Missing Recovery state remains explicitly unassessed. Deterministic own-salon median duration is advisory and never automatically reschedules a booking.
