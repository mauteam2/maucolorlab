import { expect, it } from "vitest";
import { goldenInput, fixtureId } from "@/test/confidence-fixtures";
import { evaluateConfidence } from "./engine";
import { normalizeInput } from "./input";
import { evidenceQuality } from "./resolver";

it("adding matching stronger relevant evidence does not lower confidence", () => {
 for (const source of ["AI_ESTIMATE", "IMPORTED_UNVERIFIED", "HISTORICAL"] as const) {
  const input = goldenInput();
  const base = input.pages[0]!;
  base.core = {state: "NOT_ASSESSED", observation: null};
  const global = base.observations.items.find(o => o.region_id === null)!;
  global.evidence.source = source; global.evidence.verified_by = null;
  const before = evaluateConfidence(input);
  const strong = goldenInput().pages[0]!.observations.items.find(o => o.region_id === null)!;
  strong.id = fixtureId(700); strong.evidence.id = fixtureId(701); base.observations.items.push(strong);
  const after = evaluateConfidence(input);
  expect(after.confidence).toBeGreaterThanOrEqual(before.confidence); expect(after.conflicts).toEqual([]);
 }
});
it("removing relevant verified evidence does not increase confidence", () => {
 const input = goldenInput({extraSource: "AI_ESTIMATE"}); const before = evaluateConfidence(input);
 const snapshot = input.pages[0]!; snapshot.core = {state: "NOT_ASSESSED", observation: null};
 snapshot.observations.items = snapshot.observations.items.filter(o => o.region_id !== null || o.evidence.source !== "PROFESSIONAL_VERIFIED");
 expect(evaluateConfidence(input).confidence).toBeLessThanOrEqual(before.confidence);
});
it("cross-region or global evidence cannot satisfy another region", () => {
 const input = goldenInput({regionStates: {ENDS: {porosity: "NOT_ASSESSED"}}});
 const field = evaluateConfidence(input).domains.find(d => d.domain === "INTEGRITY")!.fields.find(f => f.field === "porosity" && f.target === fixtureId(12))!;
 expect(field.state).toBe("NOT_ASSESSED"); expect(field.confidence).toBe(0);
 expect(field.evidenceRefs).toEqual([]);
});
it("NOT_APPLICABLE is excluded while UNKNOWN remains a zero-valued gap", () => {
 expect(evaluateConfidence(goldenInput({globalStates: {grey_ratio: "NOT_APPLICABLE"}})).confidence).toBeGreaterThan(evaluateConfidence(goldenInput({globalStates: {grey_ratio: "UNKNOWN"}})).confidence);
});
it("AI provenance and unknown states survive normalization", () => {
 const input = goldenInput({extraSource: "AI_ESTIMATE", globalStates: {natural_level: "UNKNOWN"}});
 const candidates = normalizeInput(input).candidates;
 expect(candidates.filter(c => c.source === "AI_ESTIMATE").every(c => c.ref.kind === "OBSERVATION")).toBe(true);
 const field = evaluateConfidence(input).domains[0]!.fields.find(f => f.target === "GLOBAL" && f.field === "natural_level")!;
 expect(field.state).toBe("UNKNOWN"); expect(field.confidence).toBe(0);
});
it("freshness boundary is inclusive and independent of recording time", () => {
 const input = goldenInput(); const candidate = normalizeInput(input).candidates.find(c => c.field === "porosity")!;
 const atAge = (days: number) => evidenceQuality({...candidate, observedAt: new Date(Date.parse(input.evaluatedAt) - days * 86400000).toISOString()}, input.evaluatedAt);
 expect(atAge(30).freshness).toBe("FRESH"); expect(atAge(30.001).freshness).toBe("STALE");
 expect(atAge(60).freshness).toBe("STALE"); expect(atAge(60.001).freshness).toBe("EXPIRED");
 expect(atAge(61).score).toBeLessThan(atAge(31).score);
});
it("order permutations preserve the complete result and fingerprint", () => {
 const input = goldenInput({extraSource: "PROFESSIONAL_VERIFIED", unknownHistoryDate: true}); const before = evaluateConfidence(input);
 input.pages[0]!.regions.reverse(); input.pages[0]!.observations.items.reverse(); input.pages[0]!.physical_tests.items.reverse();
 expect(evaluateConfidence(input)).toEqual(before);
});
