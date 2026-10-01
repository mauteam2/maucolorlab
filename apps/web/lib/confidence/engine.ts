import { createHash } from "node:crypto";
import { canonical, normalizeInput } from "./input";
import { resolveEvidence } from "./resolver";
import { confidenceRules as rules, type Band, type Domain, type TechnicalField, type RequirementCode, type ReasonCode } from "./rules";
import type { CaseConfidenceAssessment, DomainConfidence, FieldConfidence, InformationRequirement, UncertaintyItem, EvidenceConflict } from "./model";

const hash = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
const round = (value: number) => Math.round(value * 1000) / 1000;
const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 1;
export const confidenceBand = (score: number): Band => score >= rules.bands.HIGH ? "HIGH" : score >= rules.bands.MEDIUM ? "MEDIUM" : score >= rules.bands.LOW ? "LOW" : "INSUFFICIENT";
const requirements: Record<TechnicalField, RequirementCode> = {
 natural_level: "ASSESS_NATURAL_LEVEL", perceived_level: "ASSESS_CURRENT_LEVEL", grey_ratio: "ASSESS_GREY", porosity: "ASSESS_POROSITY",
 elasticity: "ASSESS_ELASTICITY", thickness: "ASSESS_INTEGRITY", density: "ASSESS_INTEGRITY", cosmetic_color_history: "VERIFY_COLOR_HISTORY",
 bleach_history: "VERIFY_BLEACH_HISTORY", chemical_history: "VERIFY_CHEMICAL_HISTORY", physical_test: "PERFORM_STRAND_TEST",
};
export function evaluateConfidence(raw: unknown): CaseConfidenceAssessment {
 const input = normalizeInput(raw);
 const unknowns: UncertaintyItem[] = [], stale: UncertaintyItem[] = [], conflicts: EvidenceConflict[] = [], information: InformationRequirement[] = [];
 const grouped = new Map<string, typeof input.candidates>();
 input.candidates.forEach(c => { const key = `${c.target}:${c.field}`; grouped.set(key, [...(grouped.get(key) ?? []), c]); });
 let hardGap = input.missingRegions.length > 0;
 const domains: DomainConfidence[] = [];
 for (const [domain, fields] of [...Object.entries(rules.domains), ["PHYSICAL_TEST", ["physical_test"]]] as [Domain, TechnicalField[]][]) {
  const resolved: FieldConfidence[] = [];
  for (const target of input.targets) for (const field of fields) {
   const { selected, conflict, stale: staleRefs } = resolveEvidence(grouped.get(`${target}:${field}`) ?? [], input.evaluatedAt);
   const state = selected?.candidate.state ?? "NOT_ASSESSED";
   const critical = (rules.criticalFields as readonly string[]).includes(field);
   const refs = selected ? [selected.candidate.ref] : [];
   const reasons: ReasonCode[] = selected ? [...selected.quality.reasons] : [];
   let score = state === "KNOWN" ? selected!.quality.score : 0;
   if (state === "UNKNOWN" || state === "NOT_ASSESSED") {
    const code = field === "physical_test" && !selected ? "PHYSICAL_TEST_MISSING" : state === "UNKNOWN" ? "FIELD_UNKNOWN" : "FIELD_NOT_ASSESSED";
    reasons.push(code);
    unknowns.push({domain, field, target, state, code, severity: critical ? "CRITICAL" : field === "physical_test" ? "HIGH" : "MODERATE", evidenceRefs: refs});
   }
   if (conflict) {
    const code = field.endsWith("history") ? "DIVERGENT_HISTORY_SUMMARIES" : "CONFLICTING_EVIDENCE";
    conflicts.push({domain, field, target, severity: critical ? "CRITICAL" : "HIGH", code, evidenceRefs: conflict});
    reasons.push(code); score *= rules.conflictFactor;
    information.push({code: "REVIEW_CONFLICTING_EVIDENCE", domain, field, target, severity: critical ? "CRITICAL" : "HIGH", reasonCodes: [code], evidenceRefs: conflict});
    if (critical) hardGap = true;
   }
   if (staleRefs.length) stale.push({domain, field, target, state, code: "EVIDENCE_STALE", severity: "MODERATE", evidenceRefs: staleRefs});
   if (state !== "NOT_APPLICABLE" && (state !== "KNOWN" || score < rules.criticalMinimumQuality || critical && selected?.quality.freshness === "EXPIRED")) {
    if (critical) { hardGap = true; reasons.push("CRITICAL_INFORMATION_GAP"); }
    information.push({code: requirements[field], domain, field, target, severity: critical ? "CRITICAL" : "MODERATE", reasonCodes: [...reasons], evidenceRefs: refs});
   }
   if (selected && state === "KNOWN") {
    if (selected.quality.score < rules.criticalMinimumQuality && !reasons.includes("LOW_QUALITY_EVIDENCE")) reasons.push("LOW_QUALITY_EVIDENCE");
    if (selected.quality.freshness === "STALE" || selected.quality.freshness === "EXPIRED") information.push({code: "REFRESH_EVIDENCE", domain, field, target,
     severity: critical ? "HIGH" : "MODERATE", reasonCodes: [selected.quality.freshness === "EXPIRED" ? "EVIDENCE_EXPIRED" : "EVIDENCE_STALE"], evidenceRefs: refs});
    if (selected.candidate.source === "IMPORTED_UNVERIFIED" || field.endsWith("history") && selected.candidate.source !== "PROFESSIONAL_VERIFIED")
     information.push({code: "VERIFY_IMPORTED_HISTORY", domain, field, target, severity: "HIGH", reasonCodes: [field.endsWith("history") ? "HISTORY_UNVERIFIED" : "LOW_QUALITY_EVIDENCE"], evidenceRefs: refs});
   }
   resolved.push({field, target, state, confidence: round(score), evidenceRefs: refs, reasons: [...new Set(reasons)].sort(), freshness: selected?.quality.freshness ?? "UNKNOWN"});
  }
  // Preserve the weakest relevant region; strong ROOT evidence cannot average away unknown ENDS.
  const score = Math.min(...input.targets.map(target => mean(resolved.filter(f => f.target === target && f.state !== "NOT_APPLICABLE").map(f => f.confidence))));
  domains.push({domain, confidence: round(score), band: confidenceBand(score), fields: resolved});
 }
 for (const type of input.missingRegions) {
  const item: UncertaintyItem = {domain: "REGIONAL_COVERAGE", field: null, target: `MISSING:${type}`, severity: "CRITICAL", code: "REGION_NOT_ASSESSED", state: "NOT_ASSESSED", evidenceRefs: []};
  unknowns.push(item); information.push({code: "VERIFY_REGION", domain: item.domain, field: null, target: item.target, severity: "CRITICAL", reasonCodes: [item.code], evidenceRefs: []});
 }
 const regional = input.missingRegions.length ? 0 : Math.min(...input.targets.filter(t => t !== "GLOBAL").map(target => mean(domains.filter(d => d.domain !== "PHYSICAL_TEST").flatMap(d => d.fields).filter(f => f.target === target && f.state !== "NOT_APPLICABLE").map(f => f.confidence))));
 domains.push({domain: "REGIONAL_COVERAGE", confidence: round(regional), band: confidenceBand(regional), fields: []});
 for (const target of input.targets.filter(t => t !== "GLOBAL")) if (domains.some(d => d.fields.some(f => f.target === target && f.state !== "NOT_APPLICABLE" && f.confidence < rules.criticalMinimumQuality)))
  information.push({code: "VERIFY_REGION", domain: "REGIONAL_COVERAGE", field: null, target, severity: "HIGH", reasonCodes: ["REGION_NOT_ASSESSED"], evidenceRefs: []});
 const score = domains.reduce((sum, d) => sum + d.confidence * rules.domainWeights[d.domain], 0) / Object.values(rules.domainWeights).reduce((a, b) => a + b, 0);
 const sorted = <T>(items: T[]) => items.sort((a, b) => canonical(a) < canonical(b) ? -1 : 1);
 return {confidence: round(score), band: hardGap ? "INSUFFICIENT" : confidenceBand(score), domains,
  significantUnknowns: sorted(unknowns), conflicts: sorted(conflicts), staleEvidence: sorted(stale), informationRequirements: sorted(information),
  engineVersion: rules.version, evaluatedAt: input.evaluatedAt, inputFingerprint: hash(input), rulesFingerprint: hash(rules),
  passportId: input.passportId, passportVersion: input.passportVersion, inputCounts: input.counts};
}
