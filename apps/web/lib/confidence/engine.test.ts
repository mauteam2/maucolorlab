import { expect, it } from "vitest";
import { performance } from "node:perf_hooks";
import source from "../../../../contracts/fixtures/hair-passport-read.json";
import { hairSnapshot } from "@/lib/hair-passport/contracts";
import { evaluateConfidence } from "./engine";
import { confidenceRules } from "./rules";
import { evidenceQuality } from "./resolver";
import { normalizeInput } from "./input";

export function emptyInput() {
 const snapshot = hairSnapshot.parse(structuredClone(source.empty.data));
 for (const part of [snapshot.observations, snapshot.physical_tests, snapshot.history]) part.page_size = 100;
 return {pages: [snapshot], evaluatedAt: "2026-10-01T12:00:00.000Z"};
}
it("minimal Passport retains unassessed states and required regions", () => {
 const result = evaluateConfidence(emptyInput());
 expect(result.confidence).toBe(0); expect(result.band).toBe("INSUFFICIENT");
 expect(result.significantUnknowns.some(i => i.code === "FIELD_NOT_ASSESSED")).toBe(true);
 expect(result.informationRequirements.filter(r => r.code === "VERIFY_REGION")).toHaveLength(3);
 expect(result.engineVersion).toBe("confidence-engine/1.0.0");
});
it("has identical output for identical input and never reads wall time", () => {
 const input = emptyInput(); expect(evaluateConfidence(input)).toEqual(evaluateConfidence(structuredClone(input)));
 expect(evaluateConfidence(input).inputFingerprint).toMatch(/^[a-f0-9]{64}$/);
});
it("fails closed on invalid state, time, incomplete pagination or extra scope", () => {
 for (const change of [(input: ReturnType<typeof emptyInput>) => { input.pages[0]!.passport.updated_at = "2030-01-01T00:00:00Z"; },
  (input: ReturnType<typeof emptyInput>) => { input.pages[0]!.history.offset = 100; }]) {
  const input = emptyInput(); change(input); expect(() => evaluateConfidence(input)).toThrow("CONFIDENCE_INPUT_INVALID");
 }
 expect(() => evaluateConfidence({...emptyInput(), organizationId: "forged"})).toThrow("CONFIDENCE_INPUT_INVALID");
});
it("centralizes versioned rules and stays below a loose interactive budget", () => {
 expect(confidenceRules.sources.AI_ESTIMATE).toBeLessThan(confidenceRules.sources.PHYSICAL_TEST);
 const start = performance.now(); for (let i = 0; i < 20; i++) evaluateConfidence(emptyInput());
 expect(performance.now() - start).toBeLessThan(2000);
});
it("does not manufacture observations from unassessed values", () => {
 expect(normalizeInput(emptyInput()).candidates).toEqual([]);
});
it("evaluates freshness using observation time instead of recording/serialization time", () => {
 const raw = structuredClone(source.populated.data);
 for (const part of [raw.observations, raw.physical_tests, raw.history]) { part.page_size = 100; part.has_more = false; part.next_offset = null; }
 const input = normalizeInput({pages: [raw], evaluatedAt: "2026-10-01T12:00:00Z"});
 const candidate = input.candidates.find(c => c.field === "porosity");
 expect(candidate).toBeDefined();
 const quality = evidenceQuality({...candidate!, observedAt: "2026-01-01T12:00:00Z"}, input.evaluatedAt);
 expect(quality.freshness).toBe("EXPIRED"); expect(quality.reasons).toContain("EVIDENCE_EXPIRED");
});
