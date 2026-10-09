# Product and lot traceability

Inventory cards reference a verified catalog product version or a custom operational product. Operational stock fields do not edit the technical catalog. Catalog/source/unit/tracking identity is immutable on an existing card; operational name, SKU, barcode, active state, lot requirement and threshold use conditional versions and audited reasons. Retired catalog history remains readable; existing operational metadata can be maintained without republishing a retired release.

Lots belong to exactly one organization/location/item through composite foreign keys. Record the actual lot number, optional batch/expiry/open timestamp and factual received timestamp. No post-opening shelf life or technical efficacy is inferred. A lot has UNKNOWN quantity until its physical opening fact exists. Product quantity is the total ledger; lot quantity is the same ledger restricted to that lot.

Required-lot items demand an explicit valid lot for new usage. The worker never invents a FIFO allocation or chooses the first lot. Optional-lot usage remains product-level when no lot is recorded. Once applied, a technical source's lot allocation is retained on later factual corrections. Making future lots mandatory cannot fabricate a lot for previously unallocated historical usage.

The item detail shows movements, source, actor, reason and positive/negative balance effects. Lot recall reads consumed movements → original Live Session → historically associated client. Appointment navigation uses only the validated relational appointment/live link. Read permission for technical session and client identity is required for recall links. Legacy UUIDs and CRM merges never rewrite attribution. Absence of a lot record means no factual lot recall is possible for that source.

EXPIRING_SOON means the actual expiry is between today and 30 days ahead; EXPIRED means before today. A missing expiry is unknown. These are operational warnings, not manufacturer verification or a new technical safety engine. Barcode/SKU/manufacturer-code text search is supported; camera scanning is deferred.
