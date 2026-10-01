import { beforeEach, expect, it, vi } from "vitest";
import { goldenInput, fixtureId } from "@/test/confidence-fixtures";
const mocks = vi.hoisted(() => ({context: vi.fn(), rpc: vi.fn()}));
vi.mock("@/lib/clients/service", () => ({verifiedClientContext: mocks.context}));
vi.mock("@/lib/supabase/server", () => ({createClient: async () => ({rpc: mocks.rpc})}));
import { AccessError } from "@/lib/tenant/bootstrap";
import { readCaseRisk } from "./service";
const context = {membership_id: fixtureId(5), organization_id: fixtureId(6), location_id: fixtureId(2), permissions: ["clients.read", "hair_passport.read"]};
const correlation = fixtureId(500), client = fixtureId(4);
beforeEach(() => {
 vi.clearAllMocks(); mocks.context.mockResolvedValue(context);
 mocks.rpc.mockResolvedValue({data: {data: goldenInput(), correlationId: correlation}, error: null, status: 200});
});
it("authorized read-only user uses complete caller-scoped RPC and returns assessment without source text", async () => {
 const result = await readCaseRisk(client, {}, correlation);
 expect(result.data.overallBand).toBe("LOW"); expect(result.correlationId).toBe(correlation);
 expect(mocks.context).toHaveBeenCalledTimes(2);
 expect(mocks.context).toHaveBeenCalledWith("hair_passport.read");
 expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("hair_confidence_snapshot", {p_membership_id: context.membership_id, p_location_id: context.location_id,
  p_client_id: client, p_include_archived: false, p_correlation_id: correlation});
 expect(JSON.stringify(result)).not.toContain("Recorded chemical history");
});
it.each(["UNAUTHENTICATED", "MEMBERSHIP_REVOKED", "FORBIDDEN", "TENANT_CONTEXT_INVALID"])("denies fresh context %s before any evidence read", async code => {
 mocks.context.mockRejectedValue(new AccessError(code, code === "UNAUTHENTICATED" ? 401 : 403));
 await expect(readCaseRisk(client, {}, correlation)).rejects.toMatchObject({code}); expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each(["CLIENT_NOT_FOUND", "HAIR_PASSPORT_NOT_FOUND", "MEMBERSHIP_REVOKED", "CONFIDENCE_INPUT_LIMIT"])("denies database logical %s without derived data", async code => {
 mocks.rpc.mockResolvedValue({data: {code, message: code, correlationId: correlation}});
 await expect(readCaseRisk(client, {}, correlation)).rejects.toMatchObject({code});
});
it("revoked membership after loading evidence cannot return an assessment", async () => {
 mocks.context.mockResolvedValueOnce(context).mockRejectedValueOnce(new AccessError("MEMBERSHIP_REVOKED", 403));
 await expect(readCaseRisk(client, {}, correlation)).rejects.toMatchObject({code: "MEMBERSHIP_REVOKED"});
});
it("workspace switch during computation cannot leak the previous tenant result", async () => {
 mocks.context.mockResolvedValueOnce(context).mockResolvedValueOnce({...context, organization_id: fixtureId(999)});
 await expect(readCaseRisk(client, {}, correlation)).rejects.toMatchObject({code: "TENANT_CONTEXT_INVALID"});
});
it("requires client-read permission as well as Hair Passport read", async () => {
 mocks.context.mockResolvedValue({...context, permissions: ["hair_passport.read"]});
 await expect(readCaseRisk(client, {}, correlation)).rejects.toMatchObject({code: "FORBIDDEN"}); expect(mocks.rpc).not.toHaveBeenCalled();
});
it("invalid client and forged scope never reach the database", async () => {
 await expect(readCaseRisk("forged", {}, correlation)).rejects.toMatchObject({code: "VALIDATION_FAILED"});
 await expect(readCaseRisk(client, {organization_id: fixtureId(6)}, correlation)).rejects.toMatchObject({code: "VALIDATION_FAILED"});
 expect(mocks.rpc).not.toHaveBeenCalled();
});
it("checks server client identity and correlation before computing", async () => {
 const input = goldenInput(); input.pages[0]!.passport.client_id = fixtureId(999);
 mocks.rpc.mockResolvedValue({data: {data: input, correlationId: correlation}});
 await expect(readCaseRisk(client, {}, correlation)).rejects.toMatchObject({code: "CONFIDENCE_INPUT_INVALID"});
 mocks.rpc.mockResolvedValue({data: {data: goldenInput(), correlationId: fixtureId(999)}});
 await expect(readCaseRisk(client, {}, correlation)).rejects.toMatchObject({code: "CONFIDENCE_INPUT_INVALID"});
});
it("archived-client semantics require explicit historical read", async () => {
 mocks.rpc.mockResolvedValue({data: {data: goldenInput({archived: true}), correlationId: correlation}});
 await expect(readCaseRisk(client, {}, correlation)).rejects.toMatchObject({code: "CONFIDENCE_INPUT_INVALID"});
 expect((await readCaseRisk(client, {include_archived: true}, correlation)).data.overallBand).toBe("LOW");
});
it.each([401,403,500])("normalizes provider status %s without exposing details", async status => {
 mocks.rpc.mockResolvedValue({error: {message: "private database detail"}, status});
 await expect(readCaseRisk(client, {}, correlation)).rejects.toMatchObject({code: status === 401 ? "SESSION_EXPIRED" : status === 403 ? "FORBIDDEN" : "NETWORK_ERROR"});
});
it("malformed source data fails closed", async () => {
 mocks.rpc.mockResolvedValue({data: {data: {pages: []}, correlationId: correlation}});
 await expect(readCaseRisk(client, {}, correlation)).rejects.toMatchObject({code: "CONFIDENCE_INPUT_INVALID"});
});
