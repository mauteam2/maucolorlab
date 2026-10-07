# ELIFORA client timeline

The timeline composes existing records. It does not copy raw audit events into a customer-facing feed, download media or create a shadow technical ledger.

Sources include client creation, appointment creation and terminal status, current Hair Passport update, technical-history entry, color-plan creation, controlled-recipe record, live session/outcome, current visible note update, CRM action update and restricted merge event. An event carries stable key/type, timestamp, original source domain/UUID, original client UUID, actor UUID where recorded, source summary and visibility class. A controlled recipe record is not described as approved or executable merely because it exists.

Events are ordered descending by timestamp and stable key, with offset/limit (1–50) and `has_more`. Mobile and Android paginate rather than loading unbounded history. Web combines loaded pages by source event key to avoid displaying a repeated source twice. Offset pagination can move under concurrent updates; refreshing returns the current ordered page, not an immutable historical snapshot.

Hair Passport remains the structured technical system. Notes do not replace observations, physical tests, evidence confidence or outcomes. Technical notes require technical access; reception sees reception notes; management-private notes and merge events require owner/manager permissions. Changing visibility checks both the old and new class and records an audit event. Archived notes remain stored but leave the active note/timeline view.

Merged profiles compose the canonical client plus original aliases, keeping each original source client ID. Source references are not rewritten. Archived original passports are accessible via the existing authorized read-only archived-client flow; technical mutations on archived identities remain denied. No media payload is returned by the timeline.
