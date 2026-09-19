import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn(), user: vi.fn() }));
vi.mock("@/lib/clients/service", () => ({ verifiedClientContext: mocks.context }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc, auth: { getUser: mocks.user } }) }));
import { AccessError } from "@/lib/tenant/bootstrap";
import { addHairPhysicalTest } from "./physical-test-service";
import fixtures from "../../../../contracts/fixtures/hair-physical-test-mutation.json";
const correlation = fixtures.results[0]!.correlationId;
const context = { membership_id: "membership", location_id: fixtures.location, organization_id: "organization" };
const reference = context.membership_id + ":" + context.location_id;
beforeEach(() => {
 vi.clearAllMocks(); mocks.context.mockResolvedValue(context);
 mocks.user.mockResolvedValue({ data: { user: { id: fixtures.actor } }, error: null });
 mocks.rpc.mockResolvedValue({ data: structuredClone(fixtures.results[0]), error: null, status: 200 });
});
it.each(fixtures.valid.map((command, index) => ({ command, index })))("records $command.payload.type with verified add_test context", async ({ command, index }) => {
 mocks.rpc.mockResolvedValue({ data: fixtures.results[index] });
 expect(await addHairPhysicalTest(command, correlation, reference)).toEqual(fixtures.results[index]);
 expect(mocks.context).toHaveBeenCalledWith("hair_passport.add_test");
 expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("hair_physical_test_operation", {
  p_membership_id: context.membership_id, p_location_id: context.location_id, p_client_id: command.client_id,
  p_payload: command.payload, p_correlation_id: correlation,
 });
});
it("retains the request identity and result on retry", async () => {
 expect(await addHairPhysicalTest(fixtures.valid[0], correlation, reference)).toEqual(await addHairPhysicalTest(fixtures.valid[0], correlation, reference));
 expect(mocks.rpc.mock.calls[0]![1]).toEqual(mocks.rpc.mock.calls[1]![1]);
});
it.each(["FORBIDDEN", "MEMBERSHIP_REVOKED", "TENANT_CONTEXT_INVALID"])("%s blocks before RPC", async code => {
 mocks.context.mockRejectedValue(new AccessError(code, 403));
 await expect(addHairPhysicalTest(fixtures.valid[0], correlation, reference)).rejects.toMatchObject({ code, status: 403 });
 expect(mocks.rpc).not.toHaveBeenCalled();
});
it("rejects stale workspace and missing authenticated actor", async () => {
 await expect(addHairPhysicalTest(fixtures.valid[0], correlation, "stale")).rejects.toMatchObject({ code: "TENANT_CONTEXT_INVALID" });
 mocks.user.mockResolvedValue({ data: { user: null }, error: null });
 await expect(addHairPhysicalTest(fixtures.valid[0], correlation, reference)).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
 expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each([["CLIENT_NOT_FOUND",404], ["HAIR_PASSPORT_NOT_FOUND",404], ["HAIR_REGION_NOT_FOUND",404], ["LOCATION_NOT_FOUND",404], ["INVALID_PHYSICAL_TEST",400], ["INVALID_TEST_RESULT",400], ["CONFLICT",409]] as const)("maps %s", async (code, status) => {
 mocks.rpc.mockResolvedValue({ data: { code, message: code, correlationId: correlation } });
 await expect(addHairPhysicalTest(fixtures.valid[0], correlation, reference)).rejects.toMatchObject({ code, status });
});
it("fails closed on forged result ownership, performer, source, time, result or correlation", async () => {
 const variants = Array.from({ length: 7 }, () => structuredClone(fixtures.results[0]!));
 variants[0]!.data.client_id = variants[0]!.data.passport_id;
 variants[1]!.data.test.performed_by = variants[1]!.data.passport_id;
 variants[2]!.data.test.evidence.source = "AI_ESTIMATE";
 variants[3]!.data.test.performed_at = "2020-01-01T00:00:00Z";
 variants[4]!.data.test.result.value = "changed";
 variants[5]!.correlationId = variants[5]!.data.passport_id;
 variants[6]!.data.test.region_id = variants[6]!.data.passport_id;
 for (const data of [{}, ...variants]) {
  mocks.rpc.mockResolvedValue({ data });
  await expect(addHairPhysicalTest(fixtures.valid[0], correlation, reference)).rejects.toMatchObject({ code: "NETWORK_ERROR", status: 503 });
 }
});
it("rejects malformed and forged requests before invoking the provider", async () => {
 for (const payload of [{ performed_by: fixtures.actor }, { result: "HIGH" }]) {
  await expect(addHairPhysicalTest({ ...fixtures.valid[0], payload: { ...fixtures.valid[0]!.payload, ...payload } }, correlation, reference)).rejects.toMatchObject({ status: 400 });
 }
 expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each([[401,"SESSION_EXPIRED"], [403,"FORBIDDEN"], [500,"NETWORK_ERROR"]] as const)("normalizes provider status %s", async (status, code) => {
 mocks.rpc.mockResolvedValue({ error: { message: "private provider data" }, status });
 await expect(addHairPhysicalTest(fixtures.valid[0], correlation, reference)).rejects.toMatchObject({ code });
});
