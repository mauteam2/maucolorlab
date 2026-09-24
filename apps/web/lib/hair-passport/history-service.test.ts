import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn(), user: vi.fn() }));
vi.mock("@/lib/clients/service", () => ({ verifiedClientContext: mocks.context }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc, auth: { getUser: mocks.user } }) }));
import { AccessError } from "@/lib/tenant/bootstrap";
import { addHairHistory } from "./history-service";
import fixtures from "../../../../contracts/fixtures/hair-history-mutation.json";
const correlation = fixtures.results[0]!.correlationId;
const context = { membership_id: "membership", location_id: fixtures.location, organization_id: "organization" };
const reference = context.membership_id + ":" + context.location_id;
beforeEach(() => {
 vi.clearAllMocks(); mocks.context.mockResolvedValue(context);
 mocks.user.mockResolvedValue({ data: { user: { id: fixtures.actor } }, error: null });
 mocks.rpc.mockResolvedValue({ data: structuredClone(fixtures.results[0]), error: null, status: 200 });
});
it.each(fixtures.valid.map((command, index) => ({ command, index })))("records $command.payload.category through add_history", async ({ command, index }) => {
 mocks.rpc.mockResolvedValue({ data: fixtures.results[index] });
 expect(await addHairHistory(command, correlation, reference)).toEqual(fixtures.results[index]);
 expect(mocks.context).toHaveBeenCalledWith("hair_passport.add_history");
 expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("hair_history_operation", {
  p_membership_id: context.membership_id, p_location_id: context.location_id, p_client_id: command.client_id,
  p_payload: command.payload, p_correlation_id: correlation,
 });
});
it("passes unchanged request_id on retry", async () => {
 expect(await addHairHistory(fixtures.valid[0], correlation, reference)).toEqual(await addHairHistory(fixtures.valid[0], correlation, reference));
 expect(mocks.rpc.mock.calls[0]![1]).toEqual(mocks.rpc.mock.calls[1]![1]);
});
it.each(["FORBIDDEN", "MEMBERSHIP_REVOKED", "TENANT_CONTEXT_INVALID"])("%s blocks before RPC", async code => {
 mocks.context.mockRejectedValue(new AccessError(code, 403));
 await expect(addHairHistory(fixtures.valid[0], correlation, reference)).rejects.toMatchObject({ code, status: 403 });
 expect(mocks.rpc).not.toHaveBeenCalled();
});
it("requires the selected workspace and a current actor", async () => {
 await expect(addHairHistory(fixtures.valid[0], correlation, "stale")).rejects.toMatchObject({ code: "TENANT_CONTEXT_INVALID" });
 mocks.user.mockResolvedValue({ data: { user: null }, error: null });
 await expect(addHairHistory(fixtures.valid[0], correlation, reference)).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
 expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each([["CLIENT_NOT_FOUND",404], ["HAIR_PASSPORT_NOT_FOUND",404], ["HAIR_REGION_NOT_FOUND",404], ["LOCATION_NOT_FOUND",404], ["INVALID_HISTORY_EVENT",400], ["INVALID_HISTORY_CATEGORY",400], ["INVALID_HISTORY_DATE",400], ["INVALID_EVIDENCE",400], ["CONFLICT",409]] as const)("maps %s", async (code, status) => {
 mocks.rpc.mockResolvedValue({ data: { code, message: code, correlationId: correlation } });
 await expect(addHairHistory(fixtures.valid[0], correlation, reference)).rejects.toMatchObject({ code, status });
});
it("fails closed on ownership, actor, regions, provenance, payload or correlation drift", async () => {
 const variants = Array.from({ length: 8 }, () => structuredClone(fixtures.results[0]!));
 variants[0]!.data.client_id = variants[0]!.data.passport_id;
 variants[1]!.data.history.recorded_by = variants[1]!.data.passport_id;
 variants[2]!.data.history.region_ids = [fixtures.region_a];
 variants[3]!.data.history.evidence.source = "AI_ESTIMATE";
 variants[4]!.data.history.description = "changed";
 variants[5]!.data.history.performed_on.value = "2020-01-01";
 variants[6]!.correlationId = variants[6]!.data.passport_id;
 (variants[7]!.data.history.evidence as { verified_by: string | null }).verified_by = fixtures.actor;
 for (const data of [{}, ...variants]) {
  mocks.rpc.mockResolvedValue({ data });
  await expect(addHairHistory(fixtures.valid[0], correlation, reference)).rejects.toMatchObject({ code: "NETWORK_ERROR", status: 503 });
 }
});
it("rejects forged and malformed requests before provider access", async () => {
 for (const payload of [{ created_by: fixtures.actor }, { category: "HAIRCUT" }, { performed_on: "2020-01-01" }, { evidence: { source: "PROFESSIONAL_VERIFIED" } }]) {
  await expect(addHairHistory({ ...fixtures.valid[0], payload: { ...fixtures.valid[0]!.payload, ...payload } }, correlation, reference)).rejects.toMatchObject({ status: 400 });
 }
 expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each([[401,"SESSION_EXPIRED"], [403,"FORBIDDEN"], [500,"NETWORK_ERROR"]] as const)("normalizes provider %s", async (status, code) => {
 mocks.rpc.mockResolvedValue({ error: { message: "private provider data" }, status });
 await expect(addHairHistory(fixtures.valid[0], correlation, reference)).rejects.toMatchObject({ code });
});
