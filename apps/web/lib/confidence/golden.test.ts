import { expect, it } from "vitest";
import { goldenFixtures, goldenInput } from "@/test/confidence-fixtures";
import { evaluateConfidence } from "./engine";

for (const fixture of goldenFixtures.cases) it(`golden: ${fixture.name}`, () => {
 const input = goldenInput(fixture.change);
 const assessment = evaluateConfidence(input);
 const expected = fixture.expected;
 expect(assessment.band).toBe(expected.band);
 if (expected.scoreMin !== undefined) expect(assessment.confidence).toBeGreaterThanOrEqual(expected.scoreMin);
 if (expected.scoreMax !== undefined) expect(assessment.confidence).toBeLessThanOrEqual(expected.scoreMax);
 if (expected.conflicts !== undefined) expect(assessment.conflicts).toHaveLength(expected.conflicts);
 if (expected.reason) expect(assessment.significantUnknowns.some(i => i.code === expected.reason)).toBe(true);
 if (expected.requirement) expect(assessment.informationRequirements.some(i => i.code === expected.requirement)).toBe(true);
 if (expected.testFreshness) expect(assessment.domains.find(d => d.domain === "PHYSICAL_TEST")!.fields.every(f => f.freshness === expected.testFreshness)).toBe(true);
 expect(assessment).toEqual(evaluateConfidence(structuredClone(input)));
 expect(assessment.engineVersion).toBe("confidence-engine/1.0.0");
 expect(JSON.stringify(assessment)).not.toContain("Recorded chemical history");
});
