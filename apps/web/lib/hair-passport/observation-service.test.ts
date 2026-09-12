import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn(), user: vi.fn() }));
vi.mock("@/lib/clients/service", () => ({ verifiedClientContext: mocks.context }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc, auth: { getUser: mocks.user } }) }));
import { AccessError } from "@/lib/tenant/bootstrap";
import { addHairObservation } from "./observation-service";
import fixtures from "../../../../contracts/fixtures/hair-observation-mutation.json";
const correlation = fixtures.results[0]!.correlationId;
const context = { membership_id: "membership", location_id: fixtures.location, organization_id: "organization" };
const reference = context.membership_id + ":" + context.location_id;
beforeEach(() => {
 vi.clearAllMocks(); mocks.context.mockResolvedValue(context);
 mocks.user.mockResolvedValue({ data: { user: { id: fixtures.actor } }, error: null });
 mocks.rpc.mockResolvedValue({ data: structuredClone(fixtures.results[0]), error: null, status: 200 });
});
it.each(fixtures.valid.map((command, index) => ({ command, index })))("records $command.payload.evidence.source through the authenticated RPC", async ({ command, index }) => {
 mocks.rpc.mockResolvedValue({ data: fixtures.results[index] });
 expect(await addHairObservation(command, correlation, reference)).toEqual(fixtures.results[index]);
 expect(mocks.context).toHaveBeenCalledWith("hair_passport.add_observation");
 expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("hair_observation_operation", {
  p_membership_id: context.membership_id, p_location_id: context.location_id, p_client_id: command.client_id,
  p_payload: command.payload, p_correlation_id: correlation,
 });
});
it("passes unchanged request_id on retries and accepts the original result", async () => {
 expect(await addHairObservation(fixtures.valid[0], correlation, reference)).toEqual(await addHairObservation(fixtures.valid[0], correlation, reference));
 expect(mocks.rpc.mock.calls[0]![1]).toEqual(mocks.rpc.mock.calls[1]![1]);
});
it.each(["FORBIDDEN", "MEMBERSHIP_REVOKED", "TENANT_CONTEXT_INVALID"])("%s stops the write before RPC", async code => {
 mocks.context.mockRejectedValue(new AccessError(code, 403));
 await expect(addHairObservation(fixtures.valid[0], correlation, reference)).rejects.toMatchObject({ code, status: 403 });
 expect(mocks.rpc).not.toHaveBeenCalled();
});
it("requires the same selected workspace and a current authenticated actor", async () => {
 await expect(addHairObservation(fixtures.valid[0], correlation, "stale")).rejects.toMatchObject({ code: "TENANT_CONTEXT_INVALID" });
 mocks.user.mockResolvedValue({ data: { user: null }, error: null });
 await expect(addHairObservation(fixtures.valid[0], correlation, reference)).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
 expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each([["CLIENT_NOT_FOUND",404], ["HAIR_REGION_NOT_FOUND",404], ["INVALID_CONFIDENCE",400], ["INVALID_EVIDENCE",400], ["INVALID_OBSERVATION",400], ["CONFLICT",409]] as const)("normalizes %s without leaking backend payload", async (code, status) => {
 mocks.rpc.mockResolvedValue({ data: { code, message: code, correlationId: correlation } });
 await expect(addHairObservation(fixtures.valid[0], correlation, reference)).rejects.toMatchObject({ code, status });
});
it("rejects malformed response, swapped ownership, provenance or target version", async () => {
 const wrongClient = structuredClone(fixtures.results[0]!); wrongClient.data.client_id = wrongClient.data.passport_id;
 const wrongActor = structuredClone(fixtures.results[0]!); wrongActor.data.observation.evidence.recorded_by = wrongActor.data.passport_id;
 const wrongRegion = structuredClone(fixtures.results[0]!); wrongRegion.data.observation.region_id = wrongRegion.data.passport_id;
 const wrongVersion = structuredClone(fixtures.results[0]!); wrongVersion.data.target_version = 9;
 for (const data of [{}, wrongClient, wrongActor, wrongRegion, wrongVersion, { ...fixtures.results[0], correlationId: wrongClient.data.passport_id }]) {
  mocks.rpc.mockResolvedValue({ data });
  await expect(addHairObservation(fixtures.valid[0], correlation, reference)).rejects.toMatchObject({ code: "NETWORK_ERROR" });
 }
});
it("rejects forged verifier and malformed confidence before any RPC", async () => {
 for (const [evidence, code] of [
  [{ source: "PROFESSIONAL_VERIFIED", attestation: "PERSONALLY_ASSESSED", verified_by: fixtures.actor }, "INVALID_EVIDENCE"],
  [{ source: "AI_ESTIMATE", confidence: { state: "KNOWN", value: 2 } }, "INVALID_CONFIDENCE"],
 ] as const) {
  await expect(addHairObservation({ ...fixtures.valid[0], payload: { ...fixtures.valid[0]!.payload, evidence } }, correlation, reference)).rejects.toMatchObject({ code });
 }
 expect(mocks.rpc).not.toHaveBeenCalled();
});
