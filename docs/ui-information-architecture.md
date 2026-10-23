# ELIFORA workspace information architecture

The shell groups work by intent instead of repeating a flat administration menu.

| Group | Destination | Existing permission |
| --- | --- | --- |
| Salon | Bugün | Authenticated workspace |
| Salon | Müşteriler | `clients.read` |
| Salon | Randevular | `salon.read` |
| Renk zekâsı | ColorLab | `color_plan.read` |
| Renk zekâsı | Canlı uygulama | `live_session.view` |
| Renk zekâsı | Marka kütüphanesi | `color_plan.read` |
| İşletme | Stok | `stock.view` |
| İşletme | Finans | `finance.view` |
| İşletme | Raporlar | `reports.read` |
| İşletme | Ekip / Ayarlar | `salon.read` |

Navigation uses verified database-membership context, never user-editable JWT metadata. Pages that already load context pass it to the shell; other shell consumers perform a no-store session read. Navigation remains concealed until validation. This is a presentation filter, not a replacement for page, service or RLS checks. Privacy notifications conceal cached content.

## Bugün

Organization, location and role precede the day's work. Permission-scoped shortcuts lead to customer creation, ColorLab and the existing CRM action center. The existing salon read model defaults to a day agenda in this composition. Its count labels explicitly describe the selected interval. Appointment details retain readiness and lifecycle actions. Report metrics and action signals use only the existing authorized server projection. A zero action count is not a claim that all technical evidence is complete.

No fabricated cash, next-appointment, engine-activity or technical-readiness aggregate is added when the current API does not provide it. Such information remains at its authoritative detail surface.

## Client dossier

Client identity and contact remain at the top. Existing CRM overview, preferences, communication permissions, notes, timeline, appointments, follow-up and merge history are retained. Hair Passport, ColorLab and Live-history links are permission scoped and preserve client identity in the destination. Desktop client results use compact structured rows; mobile results keep identity, contact, relationship and visit information together.

## Business and library

Stock preserves quantity/lot/source history and its domain action boundary. Finance separates service charges, payments, deposits, refunds and expenses. Reports retain exact decimal strings, coverage, comparative periods and source drill-down. Library entries are reference dossiers with regional scope, source receipts, metadata counts, review dates and an explicit recipe-support boundary; they are not purchasable products.

Unknown source fields, unavailable technical support and empty lists have explanatory next steps. The work does not add public booking, consumer journeys or another product phase.
