# ADR 0014: Append-only technical-history mutation service

Status: accepted for Phase 1C-2B2B2.

POST `/api/clients/{clientId}/hair-passport/history` invokes authenticated
`hair_history_operation`. One database transaction appends one immutable history
event, zero or more deduplicated region relations, one evidence row, the requested
audit event and an existing 24-hour mutation receipt. A failed region relation
rolls back every preceding effect. The operation creates no observation, physical
test, risk conclusion, correction, recommendation or mutable current pointer.

Categories remain the seven Phase 1C-1 values. Event dates retain EXACT,
APPROXIMATE or UNKNOWN state. The first two carry a real calendar date from 1900
through the database's current UTC date; UNKNOWN carries null. APPROXIMATE does
not claim that the represented day is exact. Product state remains KNOWN, UNKNOWN
or NOT_APPLICABLE. KNOWN carries bounded descriptive text; the other states carry
null. Description is required while external salon and professional attribution
remain optional text. These values are input facts, not Brand Adapter identifiers.

An omitted or empty region list means whole hair. Supplied duplicate IDs collapse
to one sorted relation and one response ID. Every distinct region must belong to
the same organization/passport. Existing archived region identity may remain a
valid historical target because history outlives the active map; missing, foreign
and other-passport IDs share HAIR_REGION_NOT_FOUND. The existing composite foreign
keys and append-only guards remain defense in depth.

Evidence source is restricted to HISTORICAL or IMPORTED_UNVERIFIED. Optional
confidence and context preserve declared provenance. Verifier, actor, timestamps,
relevance and correction links are not request fields. The evidence observed time
stays UNKNOWN: the event already carries date precision and manufacturing a time
from an exact or approximate calendar date would add false precision. Optional
location is copied to event and evidence only after active same-organization
validation; omission stays null rather than attributing old history to today's
selected salon.

Fresh workspace bootstrap and the shared bounded same-origin HTTP boundary are
reused. The selected active membership must itself hold add_history; permission
does not certify competency. Organization derives from that workspace. Client,
active passport, regions and optional location are verified, then authorization
is repeated after the existing organization advisory lock and before receipt
replay. Revoked membership cannot replay a prior success. Cross-tenant resources
remain indistinguishable from missing resources.

The existing NOLOGIN/NOBYPASSRLS writer still owns no tables. A forward guard and
policy adjustment lets add_history create only HISTORICAL or
IMPORTED_UNVERIFIED evidence. Observation and physical-test permissions keep their
existing source boundaries. The public RPC is SECURITY INVOKER; its private
SECURITY DEFINER implementation has an empty search path, current actor checks,
FORCE RLS and narrow function grants.

The existing organization/actor/request_id receipt hash gains the distinct
add_history operation and binds selected workspace, client and full payload.
Identical retries within 24 hours return original data with the current correlation
ID and add no rows or audits. Changed payload/context/operation conflicts. After
expiry the same append may run again; no permanent deduplication is claimed.

The explicit hair_history_event.created audit includes event, client/passport,
category, sorted region IDs, evidence and source identifiers. It excludes
description, product text, attribution and evidence context. Existing legacy
hair_history.recorded, hair_history.region_added and hair_evidence.added trigger
events remain compatible.

OpenAPI 0.7.0 adds only this mutation and RPC. The result embeds the existing
HairHistoryEvent DTO, so the existing independently paginated Hair Passport GET
shows the committed event without another read API or pagination change.

Next: **Phase 1C-3A — Web Hair Passport read-only UI: client profile to Hair
Passport overview, technical regions, evidence, physical tests and history. No
editing yet.**
