# ELIFORA Client CRM — Phase 4B

CRM extends `public.clients`; it does not introduce another customer identity table. Name and normalized phone remain required. Email and birth date remain optional. A normalized phone match is a warning, never a unique identity or automatic merge.

`crm_read` and `crm_operation` resolve an authenticated membership, organization, location and actual role permissions before accessing data. Web validates inputs, RPC output scope and membership again before release. Android uses the same RPC shapes with authenticated transport and a membership check before and after reads. Organization/location/role claims in request bodies are rejected. UI filtering is not isolation; every tenant table has forced RLS.

The responsive Web directory supports identity search, relationship filters, an editable interpreted search, and the CRM action center. Profiles expose four CRM sections: overview, bounded timeline, notes and appointment history. Preferences, source-backed actions and reviewed duplicate resolution are collapsed within the overview. Existing identity forms and Hair Passport remain separate. Android adds the professional customer summary, next appointment, timeline pagination and versioned action completion/dismissal inside the existing customer screen. Background/resume or workspace changes conceal protected snapshots before revalidation. Web derived summaries refresh after local writes and every 15 seconds while visible and online; refresh is deferred while a CRM form is being edited. An explicit refresh button is available.

## Unknowns and configuration

Visits mean stored `COMPLETED` appointments. Cancelled/no-show records are transparent facts. Unknown visit interval, missing return window and missing preference stay unknown. Financial value is `NOT_AVAILABLE`; CRM does not fabricate lifetime spending. There are no loyalty, inventory, commissions, customer portal, automatic messaging or online booking features.

Service return windows are optional salon configuration (`min_days`, `max_days`, both null or 1–730). A location can configure inactivity as additional overdue days (1–3650); no default is imposed. Configuration versions are independent from service versions so CRM policy edits do not silently rewrite existing appointment quotes.

## Operations and concurrency

All writes require a stable mutation UUID, explicit authorization, organization serialization, optimistic versions where mutable, a correlation UUID and append-only audit. Exact retries return a permanent receipt only after fresh authorization; reusing a mutation UUID for different input conflicts. Notes, preferences, return windows, relationship policy and actions have controlled versions. Mutations never authorize from user-editable JWT metadata.

Action records have `OPEN`, `SNOOZED`, `DONE`, `DISMISSED`. Expired snoozes read as effectively open without mutating history. Terminal actions cannot reopen. Creating an action rechecks its actual visit/outcome/recovery/duplicate source server-side. Completing an action does not modify Hair Passport, risk decisions or clinical/technical evidence. The rebooking/win-back action shortcut fetches a fresh authorized summary and opens the appointment editor with the canonical client, actual latest service and applicable preferred staff; the operator chooses date/time and confirms the booking. Operators inspect the current profile before rebooking; action source snapshots remain historical and a later booking does not silently erase an action.

## API and operational boundaries

OpenAPI 0.16.0 adds the CRM command/read AST and shared summary/preference/timeline/note/action/search/merge vocabulary. `/api/crm/read`, `/api/crm`, `/api/crm/interpret`, `/api/crm/contact` are same-origin bounded JSON POST services with private `no-store` responses. The contact endpoint returns a bare `wa.me` link only after explicit WhatsApp preference, manual-contact permission, no contact prohibition and a valid E.164 phone; it never sends a message. No provider campaign API or background worker is configured.

Database migrations apply only in forward order. Development validation uses disposable local Supabase in CI, never production. The writer role is NOLOGIN/NOBYPASSRLS; anon and service-role execution is denied. Private note and merge history reads are owner/manager-bound. Append audit metadata contains identifiers, versions, operations and visibility transitions, not note bodies or contact payloads.

The directory scans at most 200 candidates per request and returns at most 50 results with the next scan offset. Timeline/history/actions are independently bounded. Option catalogs are bounded to 200 visible services/staff. No technical media is transferred by the CRM directory or timeline. Larger option catalogs require a later paged selector, not a silently invented name match.

Phase 4C is not implemented by this slice. It can consider further booking/operational workflows after Phase 4B acceptance.

The last technical memory projects the actual completed session assessment and its stored recipe quantities, with original client/session/recipe IDs. Reception receives no technical memory. Recovery follow-ups point to the newest existing recovery Color Plan ID/time; CRM performs no new risk assessment.
