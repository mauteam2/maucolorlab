import { expect, it } from "vitest";
import { newPhysicalTestDraft, physicalTestCommandFromDraft, PhysicalTestDraftError } from "./physical-test-editor";

const clientId = "b2000000-0000-4000-8000-000000000001";
const requestId = "b2000000-0000-4000-8000-000000000002";
it.each(["POROSITY", "ELASTICITY", "STRAND"] as const)("builds a %s test without client-supplied provenance", type => {
 const draft = { ...newPhysicalTestDraft(), type, value: type === "STRAND" ? "Tutam bütünlüğü korundu" : "HIGH", regionId: "b2000000-0000-4000-8000-000000000003", notes: "Ölçüm notu" };
 const command = physicalTestCommandFromDraft(clientId, requestId, draft);
 expect(command.payload).toEqual({ request_id: requestId, type, region_id: draft.regionId, result: { state: "KNOWN", value: draft.value }, notes: draft.notes });
 expect(JSON.stringify(command)).not.toMatch(/performed_by|performed_at|evidence|actor_id|organization_id/);
});
it("allows global unknown and inapplicable states without a measured value", () => {
 for (const state of ["UNKNOWN", "NOT_APPLICABLE"] as const) {
  const command = physicalTestCommandFromDraft(clientId, requestId, { ...newPhysicalTestDraft(), state, value: "stale" });
  expect(command.payload).toMatchObject({ result: { state, value: null } });
  expect(command.payload).not.toHaveProperty("region_id");
 }
});
it("requires a bounded known result", () => {
 expect(() => physicalTestCommandFromDraft(clientId, requestId, newPhysicalTestDraft())).toThrowError(PhysicalTestDraftError);
 expect(() => physicalTestCommandFromDraft(clientId, requestId, { ...newPhysicalTestDraft(), value: "x".repeat(1001) })).toThrowError(PhysicalTestDraftError);
});
