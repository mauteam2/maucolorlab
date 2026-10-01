import { expect, it } from "vitest";
import { performance } from "node:perf_hooks";
import { goldenInput, fixtureId } from "@/test/confidence-fixtures";
import { evaluateConfidence } from "./engine";

it.each(["unrecognized-state", "known-null", "forged-verifier", "wrong-test-category", "duplicate-region-type", "missing-current-observation", "future-region", "self-supersession", "foreign-supersession", "cyclic-supersession"])("malformed %s input cannot produce any assessment", name => {
 const input = goldenInput({extraSource: "PROFESSIONAL_VERIFIED"}); const page = input.pages[0]!;
 const first = page.observations.items.find(o => o.region_id === null)!;
 const extra = page.observations.items.at(-1)!;
 if (name === "unrecognized-state") (first.porosity as {state: string}).state = "GUESS";
 if (name === "known-null") (first.porosity as {value: unknown}).value = null;
 if (name === "forged-verifier") first.evidence.verified_by = null;
 if (name === "wrong-test-category") page.physical_tests.items[0]!.type = "POROSITY";
 if (name === "duplicate-region-type") page.regions[1]!.type = "ROOT";
 if (name === "missing-current-observation") page.observations.items = page.observations.items.filter(o => o.id !== first.id);
 if (name === "future-region") page.regions[0]!.updated_at = "2030-01-01T00:00:00Z";
 if (name === "self-supersession") {extra.supersedes_id = extra.id;}
 if (name === "foreign-supersession") {extra.supersedes_id = fixtureId(999);}
 if (name === "cyclic-supersession") {first.supersedes_id = extra.id; extra.supersedes_id = first.id; if (page.core.state === "ASSESSED") page.core.observation = structuredClone(first);}
 expect(() => evaluateConfidence(input)).toThrow("CONFIDENCE_INPUT_INVALID");
});
it("current explicit unknown cannot be undone by older verified information", () => {
 const input = goldenInput({globalStates: {natural_level: "UNKNOWN"}}); const page = input.pages[0]!;
 const older = goldenInput().pages[0]!.observations.items[0]!;
 older.id = fixtureId(800); older.evidence.id = fixtureId(801); older.evidence.observed_at = {state: "KNOWN", value: "2026-09-01T12:00:00Z"};
 page.observations.items.push(older);
 const field = evaluateConfidence(input).domains.find(d => d.domain === "LEVEL")!.fields.find(f => f.field === "natural_level" && f.target === "GLOBAL")!;
 expect(field.state).toBe("UNKNOWN"); expect(field.confidence).toBe(0);
});
it("newer relevant structured physical evidence can enrich explicit unknown", () => {
 const input = goldenInput({globalStates: {porosity: "UNKNOWN"}}); const test = input.pages[0]!.physical_tests.items[0]!;
 test.type = "POROSITY"; test.result = {state: "KNOWN", value: "MEDIUM"};
 test.performed_at = "2026-10-01T11:00:00Z"; test.recorded_at = test.performed_at; test.evidence.recorded_at = test.performed_at;
 test.evidence.observed_at = {state: "KNOWN", value: test.performed_at};
 const field = evaluateConfidence(input).domains.find(d => d.domain === "INTEGRITY")!.fields.find(f => f.field === "porosity" && f.target === "GLOBAL")!;
 expect(field.state).toBe("KNOWN"); expect(field.evidenceRefs[0]!.kind).toBe("PHYSICAL_TEST");
});
it("old professional information can lose to recent AI without hiding its expired state", () => {
 const input = goldenInput({extraSource: "AI_ESTIMATE"}); const page = input.pages[0]!;
 const old = page.observations.items.find(o => o.region_id === null && o.evidence.source === "PROFESSIONAL_VERIFIED")!;
 old.evidence.observed_at = {state: "KNOWN", value: "2025-01-01T12:00:00Z"};
 if (page.core.state === "ASSESSED") page.core.observation = structuredClone(old);
 const result = evaluateConfidence(input); const field = result.domains[0]!.fields.find(f => f.field === "perceived_level" && f.target === "GLOBAL")!;
 expect(field.evidenceRefs[0]!.id).toBe(fixtureId(200));
 expect(result.staleEvidence.some(i => i.field === "perceived_level" && i.target === "GLOBAL")).toBe(true);
 expect(result.band).toBe("INSUFFICIENT");
});
it("valid supersession removes only the explicitly replaced evidence", () => {
 const input = goldenInput({conflict: {field: "perceived_level", value: 10}}); const page = input.pages[0]!;
 page.observations.items.at(-1)!.supersedes_id = page.observations.items[0]!.id;
 expect(evaluateConfidence(input).conflicts).toEqual([]);
});
it("equivalent timestamp offsets normalize to the same complete output", () => {
 const input = goldenInput(); const result = evaluateConfidence(input);
 const serialized = JSON.stringify(input).replaceAll("2026-09-30T12:00:00.000Z", "2026-09-30T15:00:00+03:00");
 expect(evaluateConfidence(JSON.parse(serialized))).toEqual(result);
});
it("complete multi-page input stays within an interactive budget and rejects incomplete tails", () => {
 const input = goldenInput(); const original = input.pages[0]!;
 const extra = Array.from({length: 496}, (_, i) => {
  const observation = structuredClone(original.observations.items[0]!); observation.id = fixtureId(1000 + i); observation.evidence.id = fixtureId(2000 + i); return observation;
 });
 const observations = [...original.observations.items, ...extra];
 input.pages = Array.from({length: 5}, (_, index) => {
  const page = structuredClone(original);
  for (const kind of ["observations", "physical_tests", "history"] as const) {
   page[kind].offset = index * 100; page[kind].has_more = kind === "observations" && index < 4; page[kind].next_offset = page[kind].has_more ? (index + 1) * 100 : null;
   if (index > 0) page[kind].items = [];
  }
  page.observations.items = observations.slice(index * 100, (index + 1) * 100); return page;
 });
 const start = performance.now(); const result = evaluateConfidence(input);
 expect(result.inputCounts.observations).toBe(500); expect(result.band).toBe("HIGH");
 expect(performance.now() - start).toBeLessThan(5000);
 input.pages.pop(); expect(() => evaluateConfidence(input)).toThrow("CONFIDENCE_INPUT_INVALID");
});
