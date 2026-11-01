import { beforeEach, expect, it, vi } from "vitest";
const { getUser, rpc, bootstrap } = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), bootstrap: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser }, rpc }) }));
vi.mock("@/lib/tenant/bootstrap", async importOriginal => ({ ...await importOriginal<object>(), bootstrap }));
import { acceptMyInvitation, readMyInvitations } from "./service";
import { acceptanceCommand, membershipInvitation } from "./model";
const id = "ab530000-0000-4000-8000-000000000001", requestId = "ab540000-0000-4000-8000-000000000001", correlationId = "ab550000-0000-4000-8000-000000000001";
const invited = { membership_id: id, organization_name: "Synthetic Salon", location_name: "Main", role_code: "colorist", status: "invited", state: "PENDING", invited_at: "2026-11-01T00:00:00+00:00", joined_at: null };
const active = { ...invited, status: "active", state: "ACTIVE", joined_at: "2026-11-01T01:00:00+00:00" };
beforeEach(() => { vi.resetAllMocks(); getUser.mockResolvedValue({ data: { user: { id: "provider-identity" } }, error: null }); bootstrap.mockResolvedValue([]); rpc.mockResolvedValue({ data: { data: [invited] }, error: null }); });
it("discovers own invitations without an active workspace or client authority", async () => {
  expect(await readMyInvitations()).toEqual({ data: [invited] });
  expect(rpc).toHaveBeenCalledExactlyOnceWith("read_my_membership_invitations", { p_membership_id: null });
  expect(bootstrap).not.toHaveBeenCalled();
});
it.each(["user_id", "organization_id", "location_id", "role", "status"])("rejects client %s authority", async field => {
  expect(acceptanceCommand.safeParse({ membership_id: id, request_id: requestId, [field]: "forged" }).success).toBe(false);
  await expect(acceptMyInvitation({ membership_id: id, request_id: requestId, [field]: "forged" }, correlationId)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  expect(rpc).not.toHaveBeenCalled();
});
it.each(["user_id", "organization_id", "location_id", "audit_metadata", "token", "permissions"])("rejects leaked %s in DTO", field => {
  expect(membershipInvitation.safeParse({ ...invited, [field]: "secret" }).success).toBe(false);
});
it("accepts only minimal IDs and resolves fresh normal workspaces after success", async () => {
  rpc.mockResolvedValue({ data: { data: active, correlationId }, error: null });
  const fresh = [{ membership_id: id, from: "authoritative bootstrap" }]; bootstrap.mockResolvedValue(fresh);
  expect(await acceptMyInvitation({ membership_id: id, request_id: requestId }, correlationId)).toEqual({ data: active, correlationId, workspaces: fresh });
  expect(rpc).toHaveBeenCalledExactlyOnceWith("accept_my_membership_invitation", { p_membership_id: id, p_request_id: requestId, p_correlation_id: correlationId });
  expect(bootstrap).toHaveBeenCalledOnce();
  expect(bootstrap.mock.invocationCallOrder[0] ?? 0).toBeGreaterThan(rpc.mock.invocationCallOrder[0] ?? 0);
});
it.each(["INVITATION_REVOKED", "INVITATION_UNAVAILABLE", "INVITATION_REPLAY_CONFLICT", "INVITATION_NOT_FOUND"])("maps %s safely without fabricating contexts", async code => {
  rpc.mockResolvedValue({ data: { code }, error: null });
  await expect(acceptMyInvitation({ membership_id: id, request_id: requestId }, correlationId)).rejects.toMatchObject({ code, status: code === "INVITATION_NOT_FOUND" ? 404 : 409 });
  expect(bootstrap).not.toHaveBeenCalled();
});
it("does not invent active contexts when fresh resolution fails after commit", async () => {
  rpc.mockResolvedValue({ data: { data: active, correlationId }, error: null }); bootstrap.mockRejectedValue(new Error("fresh read failed"));
  await expect(acceptMyInvitation({ membership_id: id, request_id: requestId }, correlationId)).rejects.toThrow("fresh read failed");
});
it("validates identity before invoking a privileged projection", async () => {
  getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthSessionMissingError" } });
  await expect(readMyInvitations()).rejects.toMatchObject({ code: "UNAUTHENTICATED" }); expect(rpc).not.toHaveBeenCalled();
});
it("maps database current-session failures", async () => {
  rpc.mockResolvedValue({ data: null, error: { code: "PT401" } });
  await expect(readMyInvitations()).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
});
it("does not forward provider internal messages", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "provider secret detail" } });
  await expect(readMyInvitations()).rejects.toMatchObject({ code: "NETWORK_ERROR" });
});
it("validates active/terminal membership state and response binding", async () => {
  expect(membershipInvitation.safeParse({ ...invited, state: "ACTIVE" }).success).toBe(false);
  rpc.mockResolvedValue({ data: { data: active, correlationId: requestId }, error: null });
  await expect(acceptMyInvitation({ membership_id: id, request_id: requestId }, correlationId)).rejects.toMatchObject({ code: "NETWORK_ERROR" });
});
it("rejects non-pending list results and mismatched detail locators", async () => {
  rpc.mockResolvedValue({ data: { data: [active] }, error: null });
  await expect(readMyInvitations()).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  await expect(readMyInvitations(requestId)).rejects.toMatchObject({ code: "NETWORK_ERROR" });
});
