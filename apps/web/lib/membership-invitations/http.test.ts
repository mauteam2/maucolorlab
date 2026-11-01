import { beforeEach, expect, it, vi } from "vitest";
const { read, accept } = vi.hoisted(() => ({ read: vi.fn(), accept: vi.fn() }));
vi.mock("./service", () => ({ readMyInvitations: read, acceptMyInvitation: accept }));
import { invitationResponse } from "./http";
const id = "ab530000-0000-4000-8000-000000000001";
beforeEach(() => { vi.resetAllMocks(); read.mockResolvedValue({ data: [] }); accept.mockResolvedValue({ data: {}, workspaces: [] }); });
const post = (raw: string, origin = "https://elifora.example") => new Request("https://elifora.example/api/membership-invitations/" + id, { method: "POST", headers: { origin, "content-type": "application/json" }, body: raw });
it("reads with private no-store and correlation provenance", async () => {
  const result = await invitationResponse(new Request("https://elifora.example/api/membership-invitations"));
  expect(result.status).toBe(200); expect(result.headers.get("Cache-Control")).toContain("no-store"); expect(result.headers.get("X-Correlation-ID")).toBeTruthy();
});
it("requires same-origin acceptance", async () => {
  expect((await invitationResponse(post('{"request_id":"x"}', "https://evil.example"), id)).status).toBe(403); expect(accept).not.toHaveBeenCalled();
});
it.each(["user_id", "role", "organization_id", "location_id", "membership_id", "status"])("rejects %s instead of stripping it", async field => {
  expect((await invitationResponse(post(JSON.stringify({ request_id: id, [field]: id })), id)).status).toBe(400); expect(accept).not.toHaveBeenCalled();
});
it("binds target to route and permits only request identifier in body", async () => {
  expect((await invitationResponse(post(JSON.stringify({ request_id: id })), id)).status).toBe(200);
  expect(accept).toHaveBeenCalledWith({ membership_id: id, request_id: id }, expect.any(String));
});
it("bounds streaming input without trusting declared size", async () => {
  expect((await invitationResponse(post("x".repeat(4097)), id)).status).toBe(400); expect(accept).not.toHaveBeenCalled();
});
it("rejects query authority and malformed JSON", async () => {
  expect((await invitationResponse(new Request("https://elifora.example/api/membership-invitations?user_id=x"))).status).toBe(400);
  expect((await invitationResponse(post("{"), id)).status).toBe(400); expect(read).not.toHaveBeenCalled();
});
