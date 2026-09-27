import { expect, it } from "vitest";
import { hairSnapshot } from "./contracts";
import { initialTechnicalDraft, technicalChanges } from "./editor";
import { readFixtures } from "@/test/hair-passport-fixtures";

it("creates a minimal passport without invented technical values", () => {
 const draft = initialTechnicalDraft();
 expect(technicalChanges(draft, draft)).toEqual({});
});
it("builds only changed technical values and preserves untouched fields", () => {
 const snapshot = hairSnapshot.parse(readFixtures.populated.data);
 const base = initialTechnicalDraft(snapshot.core), draft = structuredClone(base);
 draft.values.porosity = { state: "KNOWN", raw: "HIGH" };
 expect(technicalChanges(base, draft)).toEqual({ porosity: { state: "KNOWN", value: "HIGH" } });
});
it("encodes explicit unknown, not assessed and inapplicable states", () => {
 const base = initialTechnicalDraft(), draft = structuredClone(base);
 draft.values.natural_level.state = "UNKNOWN";
 draft.values.grey_ratio.state = "NOT_APPLICABLE";
 draft.values.tone.state = "UNKNOWN";
 expect(technicalChanges(base, draft)).toEqual({ natural_level: { state: "UNKNOWN", value: null }, grey_ratio: { state: "NOT_APPLICABLE", value: null }, tone: { state: "UNKNOWN", value: null } });
});
it("converts percent to canonical ratio and checks domain bounds", () => {
 const base = initialTechnicalDraft(), draft = structuredClone(base);
 draft.values.grey_ratio = { state: "KNOWN", raw: "25" };
 expect(technicalChanges(base, draft)).toEqual({ grey_ratio: { state: "KNOWN", value: .25 } });
 draft.values.grey_ratio.raw = "101";
 expect(() => technicalChanges(base, draft)).toThrowError(expect.objectContaining({ field: "grey_ratio", code: "range" }));
});
it("rejects a known state without a value and invalid notes", () => {
 const base = initialTechnicalDraft(), draft = structuredClone(base);
 draft.values.natural_level.state = "KNOWN";
 expect(() => technicalChanges(base, draft)).toThrowError(expect.objectContaining({ field: "natural_level", code: "required" }));
 draft.values.natural_level.raw = "5";
 draft.technical_notes = "   ";
 expect(technicalChanges(base, draft)).toEqual({ natural_level: { state: "KNOWN", value: 5 }, technical_notes: null });
});
