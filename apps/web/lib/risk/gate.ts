import type { GateOutcome } from "./rules";
import { riskRules as rules } from "./rules";
import type { HardStop, RequiredPhysicalTest, RiskAssessment, RiskInformationRequirement, RiskReason } from "./model";
import type { RiskInput } from "./dimensions";
export function resolveGate(input: RiskInput, reasons: RiskReason[], tests: RequiredPhysicalTest[], information: RiskInformationRequirement[]) {
 const stops: HardStop[] = [];
 for (const reason of reasons) {
  if (reason.code === "COMBINED_INTEGRITY_CONCERN" || reason.code === "CONFLICTING_INTEGRITY_EVIDENCE")
   stops.push({outcome: "BLOCK_TECHNICAL_PLANNING", target: reason.target, reasonCodes: [reason.code], evidenceRefs: reason.evidenceRefs});
  if (reason.code === "LOW_ELASTICITY_EVIDENCE")
   stops.push({outcome: "REQUIRE_RECOVERY_REASSESSMENT", target: reason.target, reasonCodes: [reason.code], evidenceRefs: reason.evidenceRefs});
 }
 if (input.confidence.band === "INSUFFICIENT") stops.push({outcome: "BLOCK_INSUFFICIENT_INFORMATION", target: "GLOBAL", reasonCodes: ["CONFIDENCE_INSUFFICIENT"], evidenceRefs: []});
 for (const test of tests) if (test.status !== "SATISFIED") stops.push({outcome: test.type === "STRAND" ? "REQUIRE_STRAND_TEST" : "REQUIRE_PHYSICAL_TEST",
  target: test.target, reasonCodes: test.reasonCodes, evidenceRefs: test.evidenceRefs});
 if (input.scope.state === "DECLARED_OUTSIDE_COSMETIC_SCOPE") stops.push({outcome: "OUTSIDE_COSMETIC_SCOPE", target: "GLOBAL",
  reasonCodes: ["OUTSIDE_COSMETIC_SCOPE"], evidenceRefs: input.scope.evidenceRefs});
 const checkpoints = reasons.some(r => r.band !== "LOW") || input.confidence.band !== "HIGH";
 const fallback: GateOutcome = information.length || input.confidence.band === "LOW" ? "REQUIRE_ADDITIONAL_ASSESSMENT" : checkpoints ? "CONTINUE_WITH_CHECKPOINTS" : "CONTINUE_TECHNICAL_PLANNING";
 const outcome = rules.gatePrecedence[Math.max(rules.gatePrecedence.indexOf(fallback), ...stops.map(s => rules.gatePrecedence.indexOf(s.outcome)))]!;
 const reasonCodes = [...new Set(stops.length ? stops.flatMap(s => s.reasonCodes) : reasons.length ? reasons.map(r => r.code) : ["NO_ESCALATING_STRUCTURED_FACT" as const])].sort();
 if (!stops.length && information.length && !reasonCodes.includes("ADDITIONAL_INFORMATION_REQUIRED")) reasonCodes.push("ADDITIONAL_INFORMATION_REQUIRED");
 return {hardStops: stops, gate: {outcome, canProgress: outcome === "CONTINUE_TECHNICAL_PLANNING" || outcome === "CONTINUE_WITH_CHECKPOINTS", reasonCodes} satisfies RiskAssessment["gate"]};
}
