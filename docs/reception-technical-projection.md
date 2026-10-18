# Reception operational preparation

`appointment_readiness` is a new narrow RPC; the Web GET endpoint is
`/api/salon/appointments/{id}/readiness`. Shared semantics live in
`contracts/reception.schemas.json`; Web Zod and the Android repository reject extra
fields. This is not the full precheck DTO with properties hidden by the UI.

Output contains schema version, appointment ID/version, evaluation time,
preparation status, whether consultation is required, UNKNOWN/NOT_REQUIRED strand
test status, allocated minutes from the appointment, its explicit duration source,
and `technical_clearance=false`.

No extra technical precheck requirement yields NOT_REQUIRED. Missing active Hair
Passport with a required technical service yields CONSULTATION_REQUIRED. Existing
Hair data still yields REVIEW_REQUIRED: its mere existence never proves readiness.
No persisted authoritative strand-test decision currently exists for this narrow
projection, so the requirement remains UNKNOWN, not false or invented clearance.
This intentionally conservative operational status does not replace the existing
authorized Risk/technical assessment or create a chemical recipe.

The function locks the caller's own membership row for share, rechecks current DB
membership/permission/location, then resolves an unarchived client and scoped
appointment. Foreign IDs give the same not-found result as unavailable IDs. It
constructs only permitted scalar fields; it never serializes Hair or Live payloads.

Reception's old `live_session.view` grant is removed. Existing RLS consequently
denies live heads/versions/technical photos as well as Hair/recipes already denied.
CRM visibility checks and reports' source-domain permissions prevent re-leakage.
Search remains the authorized client directory; dashboard/appointment views use
operational data. Exports require separate reports.export and source permissions.
Owner/manager and authorized technical access remain unchanged.

Evidence: phase_9_reception SQL, live_color_session SQL (stronger reception denial),
readiness service/contract/native tests, security E2E, actual revoke/readiness races.
