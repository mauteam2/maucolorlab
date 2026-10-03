# ELIFORA catalog source provenance

Each source row records manufacturer, title, unknown-or-known document version/date, official URL, retrieved timestamp, source type and SHA-256 of the retrieved PDF. These sources were reached from the official Schwarzkopf Professional US page. Full copyrighted PDFs are not committed; the repository stores bounded factual extraction and hashes.

Official records:

| Document | URL | SHA-256 |
| --- | --- | --- |
| Assortment | https://dm.henkel-dam.com/is/content/henkel/SKP_ICT_IG_Igora_Assortments_Absolutes_920x660 | 7fd50ca3e97bd40dc4861f65e2b56f59eeb654b42b74df5f145d504c7164fd6d |
| Instructions For Use | https://dm.henkel-dam.com/is/content/henkel/IGORA_ROYAL_ABSOLUTES_Instruction_For_Use | 4be6f4e16016649ac5a18edc000cb09b8f4e61f84669e3d87526cd56656d6ac1 |
| Technical Manual | https://dm.henkel-dam.com/is/content/henkel/IGORA_ROYAL_ABSOLUTES_Technical_Manual | 9905d3d3d11357a85fbbb462959bca1a5694d44021cbb0beead8aaf94d5013a8 |

Source registration is UNVERIFIED/PENDING. An authenticated catalog operator must review the original documents before completing technical review. Review actor/time are database-owned. Product, fact and compatibility references use composite source/catalog foreign keys; a source in another release cannot be substituted. Unknown facts have no invented verification or measurement.

The source manifest is version-controlled in contracts/catalogs/schwarzkopf-igora-royal-absolutes.json. `python scripts/check-catalog-sources.py` performs a bounded, read-only official PDF hash check. It rejects unqualified hosts/redirects, reports CHANGED_NEW_DRAFT_REQUIRED and never auto-verifies/publishes. A document change requires fresh qualification/extraction, a forward manifest migration and a new draft with the previous release ID. Published rows and historical sources are never overwritten. The new draft resets review and approval even if its source bytes are unchanged.

Document dates and version numbers are not inferred from URL names, retrieval times or website copyright dates. They remain null/UNKNOWN. Source approval acknowledges reviewed identity and extracted facts; it does not create a numeric pigment calibration or replace a professional chemical safety assessment.
