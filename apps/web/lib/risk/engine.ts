import type { CaseConfidenceAssessment } from "@/lib/confidence/model";
import { canonical } from "@/lib/confidence/input";
import { confidenceRules } from "@/lib/confidence/rules";
import { normalizeRiskInput, riskHash } from "./input";
import { evaluateDimensions, maxBand } from "./dimensions";
import { resolvePhysicalTests } from "./physical-tests";
import { resolveGate } from "./gate";
import { riskRules as rules } from "./rules";
import type { DimensionRisk, RiskAssessment, RiskInformationRequirement } from "./model";
const stable = <T>(items: T[]) => [...new Map(items.map(i => [canonical(i), i])).entries()].sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([,i]) => i);
export function evaluateRisk(snapshot: unknown, confidence: CaseConfidenceAssessment, scopeConcern?: unknown): RiskAssessment {
 const input = normalizeRiskInput(snapshot, confidence, scopeConcern);
 const reasons = evaluateDimensions(input);
 const tests = resolvePhysicalTests(input, reasons);
 for (const test of tests) if (test.status !== "SATISFIED") for (const code of test.reasonCodes)
  reasons.push({code, dimension: "PHYSICAL_TEST_SUFFICIENCY", band: "HIGH", target: test.target, field: null,
   evidenceRefs: test.evidenceRefs, context: {state: test.status, value: test.type, count: null}});
 if (input.scope.state === "DECLARED_OUTSIDE_COSMETIC_SCOPE") reasons.push({code: "OUTSIDE_COSMETIC_SCOPE", dimension: "TECHNICAL_CONSISTENCY", band: "CRITICAL",
  target: "GLOBAL", field: null, evidenceRefs: input.scope.evidenceRefs, context: {state: input.scope.state, value: null, count: null}});
 const information: RiskInformationRequirement[] = confidence.informationRequirements.filter(r => r.code !== "PERFORM_STRAND_TEST").map(r => ({code: r.code, target: r.target,
  severity: r.severity, reasonCodes: r.reasonCodes, evidenceRefs: r.evidenceRefs}));
 for (const reason of reasons) if (reason.code === "HISTORY_UNVERIFIED") information.push({code: "VERIFY_IMPORTED_HISTORY", target: reason.target,
  severity: "HIGH", reasonCodes: [reason.code], evidenceRefs: reason.evidenceRefs});
 for (const test of tests) if (test.status !== "SATISFIED") information.push({code: test.type === "STRAND" ? "PERFORM_STRAND_TEST" : test.type === "POROSITY" ? "PERFORM_POROSITY_TEST" : "PERFORM_ELASTICITY_TEST",
  target: test.target, severity: "HIGH", reasonCodes: test.reasonCodes, evidenceRefs: test.evidenceRefs});
 for (const reason of reasons) if (["LOW_ELASTICITY_EVIDENCE", "COMBINED_INTEGRITY_CONCERN"].includes(reason.code))
  information.push({code: "REASSESS_HAIR_INTEGRITY", target: reason.target, severity: reason.band === "CRITICAL" ? "CRITICAL" : "HIGH", reasonCodes: [reason.code], evidenceRefs: reason.evidenceRefs});
 const requiredInformation = stable(information);
 const {gate, hardStops} = resolveGate(input, reasons, tests, requiredInformation);
 const dimensionsFor = (target?: string): DimensionRisk[] => rules.dimensions.map(dimension => {
  const items = stable(reasons.filter(r => r.dimension === dimension && (!target || r.target === target)));
  return {dimension, band: maxBand(items.map(r => r.band)), reasons: items};
 });
 const dimensions = dimensionsFor();
 return {engineVersion: rules.version, evaluatedAt: input.normalized.evaluatedAt,
  inputFingerprint: riskHash({technical: input.normalized, confidence, scope: input.scope}),
  rulesFingerprint: riskHash({risk: rules, confidence: confidenceRules}), passportId: input.normalized.passportId,
  passportVersion: input.normalized.passportVersion, overallBand: maxBand(dimensions.map(d => d.band)), dimensions,
  regions: input.normalized.targets.filter(t => t !== "GLOBAL").map(target => { const dimensions = dimensionsFor(target); return {target, band: maxBand(dimensions.map(d => d.band)), dimensions}; }),
  gate, hardStops: stable(hardStops), requiredPhysicalTests: stable(tests), requiredInformation,
  dominantReasons: stable(reasons.filter(r => r.band === maxBand(reasons.map(r => r.band)))),
  confidence: {engineVersion: confidence.engineVersion, inputFingerprint: confidence.inputFingerprint, rulesFingerprint: confidence.rulesFingerprint,
   band: confidence.band, confidence: confidence.confidence}, scopeAssessment: input.scope.state};
}
