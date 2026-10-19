# Pilot brand-content gate and manufacturer intake

Engine acceptance and catalog breadth are separate gates. Current verified pack:
Schwarzkopf Professional / IGORA ROYAL ABSOLUTES; 1 brand, 1 line, 29 shades,
2 developers, 58 restricted rules, 3 official documents, 0 new verified additions.
The existing [source provenance](catalog-source-provenance.md),
[verification](brand-verification.md) and [governance](catalog-governance.md)
remain authoritative. No new chemistry is introduced by Phase 10.

| Professional pilot demonstration | Strategy | Executable manufacturer recipe |
|---|---|---|
| Supported simple single-root ROOT_REFRESH with fresh qualifying evidence and official IGORA context | Current engine/risk checks | Controlled professional selection only, current source gates and 1:1 ratio; not automatic approval |
| Natural, ash, beige, gold, caramel, copper, red, violet targets | Canonical qualitative intent and current feasibility/safety strategy | No implied mapping outside existing exact restricted pilot |
| Lightening, correction, multi-region, dimensional, filler or multi-session goals | Conditional/information/recovery/blocked states as evidence requires | Unverified manufacturer chemistry remains unavailable |
| UNKNOWN history, inadequate evidence, required physical tests or high-risk block | Clear missing-information/test/review next steps | No safety bypass or synthesized chemistry |

All target presets are house intent, not product composition, dominant pigment
ratios or quantitative neutralization. The UI names actual verified line/version.
It must never imply compatibility across brands/lines or present NO_VERIFIED_MATCH
as a generic system error. The Colorist guide and pilot UI explain this distinction.

## Intake, review and publication are separate

`contracts/pilot-document-review-queue.json` is an initially empty operational
review queue. It is not loaded by the application or importer. Each document records
manufacturer, brand, line, title, edition/date (UNKNOWN if absent), region (UNKNOWN
if absent), official origin URL, SHA-256 and append-only review events with state,
reviewedAt, controlled reviewedBy, method, reason and official-origin confirmation.
Keep originals in restricted reviewed source storage; do not commit copyrighted
manuals or private customer content accidentally.

Workflow: RECEIVED → UNDER_REVIEW → VERIFIED or REJECTED; VERIFIED → SUPERSEDED.
RECEIVED may be rejected directly. `python scripts/pilot_readiness.py queue PATH`
checks transitions, timestamps, required provenance and human attestation. Queue
updates are code-reviewed append-only operational records; the tool never publishes
catalog chemistry. VERIFIED requires HUMAN_DOCUMENT_REVIEW and confirmed official
origin. A human must actually verify the manufacturer domain, document checksum,
edition and regional applicability; a URL/checksum alone is not verification.
OCR/AI notes are aids and cannot attest, approve or publish ratios, processing
times, developer compatibility, lift, shade behavior or grey rules. Retailer copy,
blogs and social posts cannot become verified chemistry.

Required evidence pack: technical guide, professional shade chart, developer
documentation, mixing instructions, compatibility/application guidance. One
official document may cover multiple classes, but every claimed rule must cite
its exact source section and human review. Incomplete classes remain explicit
gaps. Review cross-document consistency, product/region/version, constraints,
UNKNOWN values and golden cases before using existing catalog lifecycle:
import → technical review → golden validation → approval → publication. This
separate lifecycle uses the shared catalog lock/re-read protocol. Old signed
recipes keep their original snapshots/version; no reinterpretation.

For each pilot catalog change release note: documents/checksums, reviewers,
catalog version/fingerprint, affected products/rules, compatibility impact and
golden/regression results. Semantic engine changes separately require version,
scenario/golden/regression evidence and notes. Phase 10 does not auto-tune either
from ratings or aggregate metrics.
