import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/clients/service", () => ({ verifiedClientContext: mocks.context }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));
import { AccessError } from "@/lib/tenant/bootstrap";
import { readHairPassport } from "./service";
import { readFixtures, cloneReadFixture } from "@/test/hair-passport-fixtures";
const correlation = readFixtures.populated.correlationId;
const clientId = readFixtures.populated.data.passport.client_id;
const context = { membership_id: "membership-a", location_id: "location-a", organization_id: "org-a" };
beforeEach(() => {
 vi.clearAllMocks(); mocks.context.mockResolvedValue(context);
 mocks.rpc.mockResolvedValue({ data: cloneReadFixture(), error: null, status: 200 });
});
it("derives scope from fresh verified workspace and uses only the read RPC", async () => {
 expect(await readHairPassport(clientId, {}, correlation)).toEqual(readFixtures.populated);
 expect(mocks.context).toHaveBeenCalledWith("hair_passport.read");
 expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("hair_passport_snapshot", {
  p_membership_id: context.membership_id, p_location_id: context.location_id, p_client_id: clientId,
  p_options: { include_archived: false, page_size: 50, tests_offset: 0, history_offset: 0 }, p_correlation_id: correlation,
 });
});
it.each(["MEMBERSHIP_REVOKED", "FORBIDDEN", "TENANT_CONTEXT_INVALID"])("fresh workspace %s denies before read", async code => {
 mocks.context.mockRejectedValue(new AccessError(code, 403));
 await expect(readHairPassport(clientId, {}, correlation)).rejects.toMatchObject({ code, status: 403 });
 expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each(readFixtures.errors)("normalizes logical $code without returning technical data", async failure => {
 mocks.rpc.mockResolvedValue({ data: failure, error: null });
 await expect(readHairPassport(clientId, {}, correlation)).rejects.toMatchObject({ code: failure.code });
});
it.each([401, 403, 500])("normalizes provider HTTP %s without raw errors", async status => {
 mocks.rpc.mockResolvedValue({ error: { message: "private database detail" }, status });
 await expect(readHairPassport(clientId, {}, correlation)).rejects.toMatchObject({ code: status === 401 ? "SESSION_EXPIRED" : status === 403 ? "FORBIDDEN" : "NETWORK_ERROR" });
});
it("rejects a malformed service payload instead of manufacturing a model", async () => {
 mocks.rpc.mockResolvedValue({ data: { data: {}, correlationId: correlation }, error: null });
 await expect(readHairPassport(clientId, {}, correlation)).rejects.toMatchObject({ code: "NETWORK_ERROR" });
});
it("rejects response client mismatch", async () => {
 const f = cloneReadFixture(); f.data.passport.client_id = f.data.passport.id;
 mocks.rpc.mockResolvedValue({ data: f, error: null });
 await expect(readHairPassport(clientId, {}, correlation)).rejects.toMatchObject({ code: "NETWORK_ERROR" });
});
it("rejects response correlation mismatch", async () => {
 const f = cloneReadFixture(); f.correlationId = f.data.passport.id;
 mocks.rpc.mockResolvedValue({ data: f, error: null });
 await expect(readHairPassport(clientId, {}, correlation)).rejects.toMatchObject({ code: "NETWORK_ERROR" });
});
it("requires explicit historical access", async () => {
 const f = cloneReadFixture(); f.data.passport.client_status = "ARCHIVED";
 mocks.rpc.mockResolvedValue({ data: f, error: null });
 await expect(readHairPassport(clientId, {}, correlation)).rejects.toMatchObject({ code: "NETWORK_ERROR" });
 expect(await readHairPassport(clientId, { include_archived: true }, correlation)).toEqual(f);
});
it("rejects wrong page before accepting a valid-shaped snapshot", async () => {
 await expect(readHairPassport(clientId, { tests_offset: 1 }, correlation)).rejects.toMatchObject({ code: "NETWORK_ERROR" });
});
it("invalid client identifier never reaches database", async () => {
 await expect(readHairPassport("forged", {}, correlation)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
 expect(mocks.rpc).not.toHaveBeenCalled();
});
it("normalizes a valid uppercase UUID before request and response comparison", async () => {
 expect(await readHairPassport(clientId.toUpperCase(), {}, correlation)).toEqual(readFixtures.populated);
 expect(mocks.rpc).toHaveBeenCalledWith("hair_passport_snapshot", expect.objectContaining({ p_client_id: clientId }));
});
