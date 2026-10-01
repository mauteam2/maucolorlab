import { expect, it } from "vitest";
import { evaluateConfidence } from "@/lib/confidence/engine";
import { riskGolden, riskInput } from "@/test/risk-fixtures";
import { evaluateRisk } from "./engine";
import { riskResult } from "./contracts";
import { fixtureId } from "@/test/confidence-fixtures";
for (const scenario of riskGolden.cases) it(scenario.name, () => {
 const input = riskInput(scenario.change), confidence = evaluateConfidence(input);
 const scope = scenario.change.outside ? {state:"DECLARED_OUTSIDE_COSMETIC_SCOPE",evidenceRefs:confidence.domains[0]!.fields[0]!.evidenceRefs}:undefined;
 const result = evaluateRisk(input,confidence,scope);
 expect(result.overallBand).toBe(scenario.band); expect(result.gate.outcome).toBe(scenario.gate);
 expect(result.hardStops.length>0).toBe(scenario.hardStop);
 expect([...new Set(result.requiredPhysicalTests.map(t=>t.type))].sort()).toEqual([...scenario.tests].sort());
 expect(result.requiredInformation.map(r=>r.code)).toEqual(expect.arrayContaining(scenario.information));
 if (!scenario.information.length) expect(result.requiredInformation).toEqual([]);
 expect(result.dominantReasons.map(r=>r.code)).toEqual(expect.arrayContaining(scenario.reasons));
 expect(riskResult.safeParse({data:result,correlationId:fixtureId(500)}).success).toBe(true);
 expect(evaluateRisk(input,confidence,scope)).toEqual(result);
});
