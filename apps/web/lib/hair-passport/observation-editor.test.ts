import { expect, it } from "vitest";
import { newObservationDraft, observationCommandFromDraft, ObservationDraftError } from "./observation-editor";

const client = "b7000000-0000-4000-8000-000000000031";
const request = "b7000000-0000-4000-8000-000000000101";
const region = "b7000000-0000-4000-8000-000000000051";
const build = (draft: ReturnType<typeof newObservationDraft>) => observationCommandFromDraft(client, request, 2, draft);

it("requires professional attestation and sends no caller-controlled verifier", () => {
 expect(() => build({ ...newObservationDraft(), value: "5" })).toThrow(ObservationDraftError);
 const command = build({ ...newObservationDraft(), value: "5", verified: true });
 expect(command.payload.evidence).toEqual({ source: "PROFESSIONAL_VERIFIED", attestation: "PERSONALLY_ASSESSED" });
 expect(command.payload.technical).toEqual({ natural_level: { state: "KNOWN", value: 5 } });
});
it("scopes one observation to a region, preserving explicit unknown and not assessed states", () => {
 expect(build({ ...newObservationDraft(), field: "porosity", regionId: region, state: "UNKNOWN", value: "HIGH", verified: true }).payload)
  .toMatchObject({ region_id: region, technical: { porosity: { state: "UNKNOWN", value: null } } });
 expect(build({ ...newObservationDraft(), field: "elasticity", state: "NOT_ASSESSED", verified: true }).payload.technical)
  .toEqual({ elasticity: { state: "NOT_ASSESSED", value: null } });
});
it("converts percentage inputs to the canonical 0–1 representation", () => {
 const command = build({ ...newObservationDraft(), field: "grey_ratio", value: "25", confidence: "80", verified: true });
 expect(command.payload.technical).toEqual({ grey_ratio: { state: "KNOWN", value: 0.25 } });
 expect(command.payload.evidence).toMatchObject({ confidence: { state: "KNOWN", value: 0.8 } });
});
it.each([
 { field: "natural_level" as const, state: "KNOWN" as const, value: "11", confidence: "" },
 { field: "porosity" as const, state: "KNOWN" as const, value: "INVALID", confidence: "" },
 { field: "grey_ratio" as const, state: "KNOWN" as const, value: "101", confidence: "" },
 { field: "natural_level" as const, state: "KNOWN" as const, value: "5", confidence: "101" },
])("rejects invalid field or confidence input %j", change => {
 expect(() => build({ ...newObservationDraft(), ...change, verified: true })).toThrow(ObservationDraftError);
});
