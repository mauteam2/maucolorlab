import { expect, it } from "vitest";
import { goldenInput } from "@/test/confidence-fixtures";
import { evaluateConfidence } from "@/lib/confidence/engine";
import { normalizeRiskInput } from "./input";
import { evaluateDimensions, maxBand } from "./dimensions";
it("does not fabricate integrity concerns from missing information", () => {
 const input = goldenInput({minimal: true});
 const reasons = evaluateDimensions(normalizeRiskInput(input, evaluateConfidence(input)));
 expect(reasons.some(r => r.dimension === "HAIR_INTEGRITY")).toBe(false);
 expect(reasons.some(r => r.code === "CONFIDENCE_INSUFFICIENT")).toBe(true);
});
it("critical localized risk cannot be diluted by lower dimensions", () => {
 expect(maxBand(["LOW", "CRITICAL", "MODERATE", "LOW"])).toBe("CRITICAL");
});
it("rejects a confidence result not bound to the current snapshot", () => {
 const input = goldenInput(), confidence = evaluateConfidence(input);
 expect(() => normalizeRiskInput(input, {...confidence, confidence: 1})).toThrow("RISK_INPUT_INVALID");
});
