import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/clients/service", () => ({ verifiedClientContext: mocks.context }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));
import { AccessError } from "@/lib/tenant/bootstrap";
import { mutateHairPassport } from "./mutation-service";
import fixtures from "../../../../contracts/fixtures/hair-core-mutation.json";
const correlation = fixtures.created.correlationId;
const reference = "membership-a:location-a";
const context = { membership_id: "membership-a", location_id: "location-a", organization_id: "org-a" };
beforeEach(() => {
 vi.clearAllMocks(); mocks.context.mockResolvedValue(context);
 mocks.rpc.mockResolvedValue({ data: structuredClone(fixtures.created), error: null, status: 200 });
});
it("creates in the freshly selected scope and accepts deterministic standard regions", async () => {
 expect(await mutateHairPassport(fixtures.valid[0], correlation, reference)).toEqual(fixtures.created);
 expect(mocks.context).toHaveBeenCalledWith("hair_passport.create");
 expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("hair_core_operation", {
  p_membership_id: context.membership_id, p_location_id: context.location_id, p_client_id: fixtures.valid[0]!.client_id,
  p_operation: "create_passport", p_payload: fixtures.valid[0]!.payload, p_correlation_id: correlation,
 });
});
it("sends a partial update without expanding omitted values", async () => {
 const response = structuredClone(fixtures.enriched);
 response.data.passport.version = 2; response.data.regions = [];
 mocks.rpc.mockResolvedValue({ data: response });
 expect(await mutateHairPassport(fixtures.valid[2], correlation, reference)).toEqual(response);
 expect(mocks.context).toHaveBeenCalledWith("hair_passport.update");
 expect(mocks.rpc.mock.calls[0]![1].p_payload).toEqual(fixtures.valid[2]!.payload);
});
it("creates custom regions and validates stable identity on region updates", async () => {
 const response = structuredClone(fixtures.region);
 mocks.rpc.mockResolvedValue({ data: response });
 expect(await mutateHairPassport(fixtures.valid[3], correlation, reference)).toEqual(response);
 response.data.region.version = 2;
 expect(await mutateHairPassport(fixtures.valid[4], correlation, reference)).toEqual(response);
 expect(mocks.rpc.mock.calls[1]![1].p_payload.region_id).toBe(fixtures.valid[4]!.region_id);
});
it.each(["FORBIDDEN", "MEMBERSHIP_REVOKED", "TENANT_CONTEXT_INVALID"])("fresh %s stops mutation before RPC", async code => {
 mocks.context.mockRejectedValue(new AccessError(code, 403));
 await expect(mutateHairPassport(fixtures.valid[0], correlation, reference)).rejects.toMatchObject({ code, status: 403 });
 expect(mocks.rpc).not.toHaveBeenCalled();
});
it("rejects a changed workspace reference", async () => {
 await expect(mutateHairPassport(fixtures.valid[0], correlation, "stale")).rejects.toMatchObject({ code: "TENANT_CONTEXT_INVALID" });
 expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each([
 ["HAIR_PASSPORT_ALREADY_EXISTS", 409], ["CLIENT_NOT_FOUND", 404], ["HAIR_REGION_NOT_FOUND", 404],
 ["INVALID_TECHNICAL_STATE", 400], ["CONFLICT", 409], ["MEMBERSHIP_REVOKED", 403],
] as const)("normalizes backend %s", async (code, status) => {
 mocks.rpc.mockResolvedValue({ data: { code, message: code, correlationId: correlation } });
 await expect(mutateHairPassport(fixtures.valid[0], correlation, reference)).rejects.toMatchObject({ code, status });
});
it("rejects malformed responses, wrong clients, correlations, defaults and versions", async () => {
 const badClient = structuredClone(fixtures.created); badClient.data.passport.client_id = badClient.data.passport.id;
 const duplicate = structuredClone(fixtures.created); duplicate.data.regions[1] = duplicate.data.regions[0]!;
 const stale = structuredClone(fixtures.created); stale.data.passport.version = 2;
 for (const data of [{}, badClient, duplicate, stale, { ...fixtures.created, correlationId: fixtures.created.data.passport.id }]) {
  mocks.rpc.mockResolvedValue({ data });
  await expect(mutateHairPassport(fixtures.valid[0], correlation, reference)).rejects.toMatchObject({ code: "NETWORK_ERROR", status: 503 });
 }
});
it("rejects invalid technical values before touching the database", async () => {
 await expect(mutateHairPassport({ ...fixtures.valid[0], payload: { ...fixtures.valid[0]!.payload, technical: { natural_level: { state: "KNOWN", value: null } } } }, correlation, reference)).rejects.toMatchObject({ code: "INVALID_TECHNICAL_STATE" });
 expect(mocks.rpc).not.toHaveBeenCalled();
});
it("maps provider errors without exposing raw details", async () => {
 mocks.rpc.mockResolvedValue({ error: { message: "private detail" }, status: 401 });
 await expect(mutateHairPassport(fixtures.valid[0], correlation, reference)).rejects.toMatchObject({ code: "SESSION_EXPIRED", status: 401 });
});
