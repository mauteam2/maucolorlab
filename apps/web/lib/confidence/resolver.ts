import { confidenceRules as rules, type ReasonCode, type TechnicalField } from "./rules";
import { canonical } from "./input";
import type { Candidate, Quality } from "./model";
export function evidenceQuality(candidate: Candidate, evaluatedAt: string): Quality {
 const reasons: ReasonCode[] = ["SOURCE_QUALITY_LIMIT"];
 let score = candidate.source === null ? rules.unverifiedQuality : rules.sources[candidate.source];
 if (candidate.source === null || candidate.source === "IMPORTED_UNVERIFIED") reasons.push("LOW_QUALITY_EVIDENCE");
 if (candidate.field.endsWith("history") && candidate.source !== "PROFESSIONAL_VERIFIED") reasons.push("HISTORY_UNVERIFIED");
 if (candidate.confidence === null) { score *= rules.unspecifiedConfidence; reasons.push("CONFIDENCE_UNSPECIFIED"); }
 else if (candidate.confidence < 1) { score *= candidate.confidence; reasons.push("EXPLICIT_CONFIDENCE_LIMIT"); }
 const ttl = rules.freshnessDays[candidate.field];
 const ageDays = candidate.observedAt === null ? null : (Date.parse(evaluatedAt) - Date.parse(candidate.observedAt)) / 86400000;
 let freshness: Quality["freshness"] = ttl === null ? "HISTORICAL" : ageDays === null ? "UNKNOWN" : ageDays <= ttl ? "FRESH" : ageDays <= 2 * ttl ? "STALE" : "EXPIRED";
 if (candidate.relevantUntil !== null && Date.parse(candidate.relevantUntil) < Date.parse(evaluatedAt)) freshness = "EXPIRED";
 if (freshness === "UNKNOWN") { score *= rules.unknownTimeFactor; reasons.push("EVIDENCE_TIME_UNKNOWN"); }
 if (freshness === "STALE") { score *= rules.staleFactor; reasons.push("EVIDENCE_STALE"); }
 if (freshness === "EXPIRED") { score *= rules.expiredFactor; reasons.push("EVIDENCE_EXPIRED"); }
 return { score, freshness, reasons, ageDays };
}
export function differs(field: TechnicalField, a: Candidate, b: Candidate): boolean {
 if (typeof a.value === "number" && typeof b.value === "number")
  return Math.abs(a.value - b.value) >= (field === "grey_ratio" ? rules.greyConflictDelta : rules.levelConflictDelta);
 return canonical(a.value) !== canonical(b.value);
}
export function resolveEvidence(candidates: Candidate[], evaluatedAt: string) {
 const ranked = candidates.filter(c => c.state !== "NOT_ASSESSED").map(candidate => ({ candidate, quality: evidenceQuality(candidate, evaluatedAt) }))
  .sort((a, b) => b.quality.score - a.quality.score ||
   (b.candidate.observedAt === null ? -Infinity : Date.parse(b.candidate.observedAt)) - (a.candidate.observedAt === null ? -Infinity : Date.parse(a.candidate.observedAt)) ||
   Number(b.candidate.current) - Number(a.candidate.current) || (canonical(a.candidate.ref) < canonical(b.candidate.ref) ? -1 : 1));
 // A current explicit UNKNOWN/NOT_APPLICABLE is a knowledge-state boundary. Old values cannot undo it.
 // A newer, relevant measured/verified fact may enrich it; an unverified edit has no authoritative measurement time.
 const boundary = candidates.find(c => c.current && ["UNKNOWN", "NOT_APPLICABLE"].includes(c.state));
 const eligible = boundary ? ranked.filter(({ candidate }) => candidate === boundary ||
  (candidate.state === "KNOWN" && candidate.observedAt !== null && boundary.observedAt !== null &&
   Date.parse(candidate.observedAt) > Date.parse(boundary.observedAt) && ["PROFESSIONAL_VERIFIED", "PHYSICAL_TEST"].includes(candidate.source ?? ""))) : ranked;
 const selected = eligible[0] ?? (boundary ? {candidate: boundary, quality: evidenceQuality(boundary, evaluatedAt)} : undefined);
 const comparable = ranked.filter(({candidate, quality}) => candidate.state === "KNOWN" && candidate.conflictEligible &&
  quality.score >= rules.conflictMinimumQuality && !["STALE", "EXPIRED", "UNKNOWN"].includes(quality.freshness));
 const strongest = comparable[0];
 const contradictory = strongest && comparable.find(({candidate}) => differs(candidate.field, strongest.candidate, candidate));
 return { selected, conflict: contradictory ? [strongest.candidate.ref, contradictory.candidate.ref] : null,
  stale: ranked.filter(({quality}) => ["STALE", "EXPIRED"].includes(quality.freshness)).map(({candidate}) => candidate.ref) };
}
