import { evidenceQuality } from "@/lib/confidence/resolver";
import { canonical } from "@/lib/confidence/input";
import type { ConfidenceInput } from "@/lib/confidence/input";
import type { NormalizedInput } from "@/lib/confidence/model";
import type { RequiredPhysicalTest, RiskReason } from "./model";
import type { RiskInput } from "./dimensions";
import { riskRules as rules } from "./rules";
export function resolvePhysicalTests(input: RiskInput, reasons: RiskReason[]): RequiredPhysicalTest[] {
 const fields = input.confidence.domains.flatMap(d => d.fields);
 const result: RequiredPhysicalTest[] = [];
 for (const target of input.normalized.targets) {
  const local = reasons.filter(r => r.target === target);
  const knownConcern = local.some(r => ["HIGH_POROSITY_EVIDENCE", "LOW_ELASTICITY_EVIDENCE", "REGIONAL_VARIATION_HIGH", "CONFLICTING_INTEGRITY_EVIDENCE"].includes(r.code));
  const history = local.some(r => ["LIGHTENING_HISTORY_PRESENT", "CHEMICAL_HISTORY_PRESENT", "LIGHTENING_HISTORY_UNKNOWN", "CHEMICAL_HISTORY_UNKNOWN", "HISTORY_UNVERIFIED"].includes(r.code));
  const requested = new Set<RequiredPhysicalTest["type"]>();
  for (const [field, type] of [["porosity", "POROSITY"], ["elasticity", "ELASTICITY"]] as const) {
   const f = fields.find(f => f.target === target && f.field === field);
   if (f?.state !== "NOT_APPLICABLE" && (knownConcern || f?.state !== "KNOWN" || f.confidence < rules.minimumEvidenceQuality || f.freshness !== "FRESH")) requested.add(type);
  }
  // Phase 1D's generic physical-test information request is narrowed to STRAND only here.
  const physical = fields.find(f => f.target === target && f.field === "physical_test");
  if (knownConcern || history || physical?.state !== "NOT_APPLICABLE" && physical?.freshness !== "FRESH" ||
   input.confidence.informationRequirements.some(r => r.target === target && r.code === "PERFORM_STRAND_TEST")) requested.add("STRAND");
  for (const type of [...requested].sort()) {
   result.push(assessPhysicalTest(input.snapshot, input.normalized, target, type));
  }
 }
 return result;
}
/** Shared evidence qualification; does not evaluate Confidence or Risk. */
export function assessPhysicalTest(snapshot: ConfidenceInput, normalized: NormalizedInput, target: string, type: RequiredPhysicalTest["type"]): RequiredPhysicalTest {
 const tests = new Map(snapshot.pages.flatMap(p => p.physical_tests.items).map(t => [t.id, t]));
   const candidates = normalized.candidates.filter(c => c.target === target && c.field === "physical_test" &&
    c.ref.kind === "PHYSICAL_TEST" && tests.get(c.ref.id)?.type === type);
   const evaluated = candidates.map(candidate => ({candidate, quality: evidenceQuality(candidate, normalized.evaluatedAt)}));
   const sufficient = evaluated.filter(x => x.candidate.state === "KNOWN" && x.candidate.source === "PHYSICAL_TEST" &&
    x.quality.freshness === "FRESH" && x.quality.score >= rules.minimumEvidenceQuality)
    .sort((a,b) => b.quality.score - a.quality.score || (canonical(a.candidate.ref) < canonical(b.candidate.ref) ? -1 : 1));
   const stale = evaluated.some(x => ["STALE", "EXPIRED"].includes(x.quality.freshness));
   const status = sufficient.length ? "SATISFIED" : !candidates.length ? "MISSING" : stale ? "STALE" : "UNRELIABLE";
   return {type, target, status, reasonCodes: status === "SATISFIED" ? [] : [status === "MISSING" ? "PHYSICAL_TEST_MISSING" : status === "STALE" ? "PHYSICAL_TEST_STALE" : "PHYSICAL_TEST_UNRELIABLE"],
    evidenceRefs: sufficient.length ? [sufficient[0]!.candidate.ref] : candidates.map(c => c.ref)};
}
