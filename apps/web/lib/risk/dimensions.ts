import type { Candidate, CaseConfidenceAssessment } from "@/lib/confidence/model";
import type { RiskReason } from "./model";
import { riskRules as rules, type RiskBand, type RiskDimension, type RiskReasonCode } from "./rules";
import type { normalizeRiskInput } from "./input";
export type RiskInput = ReturnType<typeof normalizeRiskInput>;
export const maxBand = (bands: RiskBand[]): RiskBand => rules.bands[Math.max(0, ...bands.map(b => rules.bands.indexOf(b)))]!;
export function evaluateDimensions(input: RiskInput): RiskReason[] {
 const {normalized: n, confidence} = input;
 const reasons: RiskReason[] = [];
 const add = (code: RiskReasonCode, dimension: RiskDimension, band: RiskBand, target: string, field: RiskReason["field"] = null,
  candidates: Candidate[] = [], context: RiskReason["context"] = {state: null, value: null, count: null}) => {
  reasons.push({code, dimension, band, target, field, evidenceRefs: candidates.map(c => c.ref), context});
 };
 const fields = new Map(confidence.domains.flatMap(d => d.fields).map(f => [`${f.target}:${f.field}`, f]));
 const candidates = new Map(n.candidates.map(c => [`${c.target}:${c.field}:${c.ref.kind}:${c.ref.id}`, c]));
 const selected = (target: string, field: string) => {
  const f = fields.get(`${target}:${field}`);
  const ref = f?.evidenceRefs[0];
  return {f, c: ref ? candidates.get(`${target}:${field}:${ref.kind}:${ref.id}`) : undefined};
 };
 const reliable = (f: ReturnType<typeof selected>["f"]) => f?.state === "KNOWN" && f.confidence >= rules.minimumEvidenceQuality && !["UNKNOWN", "EXPIRED"].includes(f.freshness);
 for (const target of n.targets) {
  const porosity = selected(target, "porosity"), elasticity = selected(target, "elasticity");
  const high = reliable(porosity.f) && porosity.c?.value === "HIGH";
  const low = reliable(elasticity.f) && elasticity.c?.value === "LOW";
  for (const dimension of ["HAIR_INTEGRITY", "POROSITY_ELASTICITY"] as const) {
   if (high) add("HIGH_POROSITY_EVIDENCE", dimension, "HIGH", target, "porosity", [porosity.c!], {state: "KNOWN", value: "HIGH", count: null});
   if (low) add("LOW_ELASTICITY_EVIDENCE", dimension, "HIGH", target, "elasticity", [elasticity.c!], {state: "KNOWN", value: "LOW", count: null});
   if (high && low) add("COMBINED_INTEGRITY_CONCERN", dimension, "CRITICAL", target, null, [porosity.c!, elasticity.c!]);
  }
  if ([porosity, elasticity].some(x => x.f?.state !== "NOT_APPLICABLE" && !reliable(x.f)))
   add("INTEGRITY_INFORMATION_UNKNOWN", "EVIDENCE_INFORMATION", "HIGH", target);
  // Event categories are structured. Summary text never proves the presence/absence of processing.
  for (const [field, dimension, present, unknown] of [
   ["bleach_history", "LIGHTENING_HISTORY", "LIGHTENING_HISTORY_PRESENT", "LIGHTENING_HISTORY_UNKNOWN"],
   ["chemical_history", "CHEMICAL_HISTORY", "CHEMICAL_HISTORY_PRESENT", "CHEMICAL_HISTORY_UNKNOWN"],
  ] as const) {
   const summary = selected(target, field);
   const events = n.candidates.filter(c => c.target === target && c.field === field && c.ref.kind === "HISTORY");
   if (events.length) add(present, dimension, "MODERATE", target, field, events, {state: "KNOWN", value: null, count: events.length});
   if (field === "bleach_history" && events.length >= rules.repeatedLighteningEvents)
    add("REPEATED_LIGHTENING_HISTORY", dimension, "HIGH", target, field, events, {state: "KNOWN", value: null, count: events.length});
   if (field === "chemical_history" && events.length >= 2)
    add("CHEMICAL_HISTORY_COMPLEX", dimension, "HIGH", target, field, events, {state: "KNOWN", value: null, count: events.length});
   if (summary.f?.state !== "NOT_APPLICABLE" && !reliable(summary.f)) add(unknown, "EVIDENCE_INFORMATION", "HIGH", target, field);
   if (confidence.significantUnknowns.some(u => u.target === target && u.field === field && u.code === "HISTORY_UNVERIFIED"))
    add("HISTORY_UNVERIFIED", "EVIDENCE_INFORMATION", "HIGH", target, field, events);
  }
 }
 // Comparisons stay within regional structured facts, never fill a region from global evidence.
 for (const field of ["porosity", "elasticity", "perceived_level"] as const) {
  const regional = n.targets.filter(t => t !== "GLOBAL").map(t => ({target: t, ...selected(t, field)})).filter(x => reliable(x.f) && x.c);
  const values = new Set(regional.map(x => x.c!.value));
  const numbers = regional.map(x => x.c!.value).filter((v): v is number => typeof v === "number");
  const differs = field === "perceived_level" ? numbers.length > 1 && Math.max(...numbers) - Math.min(...numbers) >= rules.regionalLevelDelta : values.size > 1;
  if (differs) for (const region of regional) add("REGIONAL_VARIATION_HIGH", "REGIONAL_COMPLEXITY", "HIGH", region.target, field, [region.c!]);
 }
 for (const type of n.missingRegions) add("REGION_INFORMATION_MISSING", "REGIONAL_COMPLEXITY", "HIGH", `MISSING:${type}`);
 for (const conflict of confidence.conflicts) {
  const integrity = ["porosity", "elasticity"].includes(conflict.field);
  reasons.push({code: integrity ? "CONFLICTING_INTEGRITY_EVIDENCE" : "CONFLICTING_TECHNICAL_EVIDENCE", dimension: "TECHNICAL_CONSISTENCY",
   band: conflict.severity === "CRITICAL" ? "CRITICAL" : "HIGH", target: conflict.target, field: conflict.field, evidenceRefs: conflict.evidenceRefs,
   context: {state: null, value: null, count: null}});
 }
 const bandReason = {INSUFFICIENT: "CONFIDENCE_INSUFFICIENT", LOW: "CONFIDENCE_LOW", MEDIUM: "CONFIDENCE_MODERATE"} as const;
 if (confidence.band !== "HIGH") add(bandReason[confidence.band], "EVIDENCE_INFORMATION", confidence.band === "MEDIUM" ? "MODERATE" : "HIGH", "GLOBAL");
 for (const requirement of confidence.informationRequirements) if (requirement.severity === "CRITICAL")
  reasons.push({code: "CRITICAL_INFORMATION_GAP", dimension: "EVIDENCE_INFORMATION", band: "HIGH", target: requirement.target,
   field: requirement.field, evidenceRefs: requirement.evidenceRefs, context: {state: null, value: null, count: null}});
 return reasons;
}
export function confidenceFields(confidence: CaseConfidenceAssessment) { return confidence.domains.flatMap(d => d.fields); }
