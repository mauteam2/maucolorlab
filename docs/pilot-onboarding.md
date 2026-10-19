# ELIFORA controlled salon onboarding

**Not open for real salon onboarding.** The readiness checklist currently says
NO_GO. Complete hosted evidence and professional review, then obtain explicit
approval before creating real salon accounts. Do not contact candidates from this
task. Start with 2–3 salons: one color specialist, one frequent-service salon,
one multi-staff salon. Avoid a chain. Name a support owner and a finite user/seat
limit for each salon; do not promise unlimited access or a production SLA.

## Admission and identity

1. Record gate/release approval, salon representative, support coverage, approved
   data notice and intended region. Provider administrator sends the reviewed
   invitation only after authorization. Public signup stays disabled. Test actual
   hosted invitation/recovery mail first; no automatic email is sent by this code.
2. Owner confirms the provider identity. An authorized operator assumes only
   `elifora_pilot_operator` on the isolated pilot database and invokes
   `app_private.pilot_provision(request_id, confirmed_owner_user_id, definition,
   controlled_actor, reason, correlation_id)`. The definition has exactly `name`,
   `location_name`, `timezone`, `base_currency`. Use parameter binding in the
   approved SQL runner, never interpolate user input into a shell/SQL command.
   The database environment setting must be staging or pilot. Establish it only
   after matching the reviewed project reference, never on public production.
3. The function transaction creates one organization, one location, one global
   active owner membership and an immutable admission receipt/audit. A per-owner
   lock serializes retries. Same request and input returns original IDs; changed
   input conflicts; a second request cannot silently create a second salon. The
   function is inaccessible to anonymous, authenticated and service-role clients.
   It creates no customer, appointment, product, price, finance fact or plan.
4. SaaS remains UNCONFIGURED in a real environment. A separately authorized SaaS
   operator provisions a reviewed finite plan/quota/usage period through existing
   `saas_control`; never run configure-disposable-saas.py on hosted data. Initial
   owner/location bootstrap is the existing exception; additional seats/locations
   still reserve quota. Owner opens the actual authenticated workspace.

## First day

The owner dashboard links to `/workspace/settings/pilot`. The guide links to real
screens; it does not grant permissions or mark work complete without evidence.
Follow: salon identity/timezone → hours → team/roles/competencies/shifts → services,
durations, tax/prices and resources → stock foundation → first client → Hair
Passport → first ColorLab evaluation. Also review base currency, cash register,
Color Engine entitlement and bounded usage before business operations.

Only real salon-provided configuration belongs in the real tenant. No example
staff, fake balances, demo clients or synthetic recipe records. Reserve team seats
using existing owner `CREATE_MEMBER` after provider identity exists; invited status
is not active authorization. Activation/revocation remains the reviewed membership
lifecycle, with operator reason/correlation audit and no role from user metadata.
The existing product does not send/accept hosted team invitation emails itself;
the controlled provider/operator step is explicit and must be exercised before
claiming multi-user onboarding readiness.

## Colorist workflow

Use [colorist guide](colorist-pilot-guide.md): Hair Passport → target → evidence →
Color Engine interpretation → Risk → feasibility → strategy → verified brand
availability → professional selection/controlled recipe when possible → Live →
outcome. Color Engine is the primary differentiator; appointment/CRM setup enables
this workflow. A supported target does not promise an executable recipe.

Owner checks appointments and actual completion, measured stock reconciliation,
payment/allocation, known/unknown direct cost, configured commission and Reports.
See [owner guide](salon-owner-pilot-guide.md). Do not invent zero costs or stock.

## Support and exit

Before admission fill the named support contact and response coverage in the gate
evidence. Users report severity, typed error, correlation and release, without
client payloads. Settings → pilot guide exports optional structured feedback for
the agreed support channel; it sends nothing automatically. See [runbook](pilot-operations.md).

For exit, suspend access through reviewed SaaS/membership/provider session controls,
lock local drafts, obtain authorized existing exports, agree return/retention and
archive only after active work is resolved. Do not delete immutable technical,
stock, finance, commission or audit history. A whole-tenant portable export is not
implemented: current Reports exports are authorized bounded projections, so plan
a separately approved operator export for records those exports do not cover.
