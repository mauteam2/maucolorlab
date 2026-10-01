import { expect, it } from "vitest";
import { goldenInput } from "@/test/confidence-fixtures";
import { evaluateConfidence } from "@/lib/confidence/engine";
import { evaluateRisk } from "./engine";
it("complete benign structured profile permits technical planning without a safety guarantee", () => {
 const input = goldenInput(); const result = evaluateRisk(input, evaluateConfidence(input));
 expect(result.overallBand).toBe("LOW"); expect(result.gate.outcome).toBe("CONTINUE_TECHNICAL_PLANNING");
 expect(result.dimensions).toHaveLength(8); expect(result.regions).toHaveLength(3);
 expect(result.hardStops).toEqual([]); expect(result.requiredPhysicalTests).toEqual([]);
});
it("insufficient information prevents planning without inventing damage", () => {
 const input = goldenInput({minimal: true}); const result = evaluateRisk(input, evaluateConfidence(input));
 expect(result.gate.outcome).toBe("BLOCK_INSUFFICIENT_INFORMATION");
 expect(result.dimensions.find(d => d.dimension === "HAIR_INTEGRITY")?.band).toBe("LOW");
 expect(result.requiredPhysicalTests.some(t => t.type === "POROSITY")).toBe(true);
});
it("stale tests require renewal", () => {
 const input = goldenInput({testAgeDays: 45}); const result = evaluateRisk(input, evaluateConfidence(input));
 expect(result.requiredPhysicalTests.filter(t => t.type === "STRAND")).toHaveLength(4);
 expect(result.requiredPhysicalTests.filter(t => t.type === "STRAND").every(t => t.status === "STALE")).toBe(true);
 expect(result.gate.canProgress).toBe(false);
});
