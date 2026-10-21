# ELIFORA catalog coverage status

Initial intake: 2026-10-21. Counts below are separate measures; discovery is not technical approval.

| Measure | Count |
| --- | ---: |
| Manufacturer groups recorded | 6 |
| Discovered professional brands | 8 |
| Discovered product lines | 29 |
| Regional entry records | 30 |
| Official source receipts collected | 15 |
| Of these, technical PDFs collected | 1 |
| Shade metadata records | 7 |
| Developer metadata records | 1 |
| Discovery records under review | 0 |
| Discovery records VERIFIED | 0 |
| Existing source-backed technical packs in repository | 1 |
| Newly human-approved technical packs | 0 |
| New published technical packs | 0 |
| Canonical published executable technical packs at intake | 0 |

Executable brands/lines in the canonical environment: **none**. The synthetic published pack in isolated test/recovery environments is a test fixture and is excluded. Runtime catalog support is read from authoritative current database state, not these static counts.

| Brand | Discovered lines |
| --- | --- |
| L’Oréal Professionnel | iNOA; Majirel; Dia Light; Dia Color |
| Wella Professionals | Koleston Perfect; Illumina Color; Koleston Xpress; Color Touch |
| Schwarzkopf Professional | IGORA ROYAL; IGORA ROYAL ABSOLUTES; IGORA VIBRANCE; IGORA ZERO AMM; IGORA ROYAL HIGHLIFTS; IGORA ROYAL FASHION LIGHTS |
| Goldwell | Topchic; Colorance; Elumen; Topchic Zero |
| Matrix | SoColor; SoColor Sync |
| Redken | Shades EQ Gloss; Color Gels Lacquers; Color Gels Oils |
| Keune | Tinta Color; Semi Color; So Pure Color |
| Revlon Professional | Revlonissimo Colorsmetique; Revlonissimo Color Sublime; Color Excel |

Source URLs, retrieval dates, byte hashes and per-line associations are in `contracts/catalogs/global-discovery.json`. All entries remain SOURCE_COLLECTED. Marketing shade totals are not imported. Seven metadata shades are six explicitly displayed IGORA ZERO AMM codes and Matrix SoColor Sync `5M / Medium Brown Mocha`; the developer record is Matrix's literal `10 Volume Matrix Cream Developer` label. All documented levels/tones remain unknown; no notation parsing or compatibility is imported.

The existing `schwarzkopf-igora-royal-absolutes.json` pack remains byte-for-byte unchanged: 1 brand, 1 line, 29 shades, 2 developers, 58 rules, 3 official documents; SHA-256 `c49ea00c8b1a5e9fd365969cf10d02abc48681aa15096228bf20c609df4c49fc`. Source-backed repository coverage does not assert completed canonical human governance. A newer US marketing page advertises a different total; it is retained as discovery evidence, never used to rewrite the original source pack or silently broaden its market/chemistry.

No real salon has been admitted, no human review has been invented, no catalog has been automatically published, and Phase 11 has not started. Further intake is deliberately bounded by source and human-review capacity.
