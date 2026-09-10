import { beforeEach, expect, it, vi } from "vitest";
const { getUser, rpc } = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser }, rpc }) }));
import { bootstrap } from "./bootstrap";
beforeEach(() => {
  vi.resetAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "authenticated-user" } }, error: null });
  rpc.mockResolvedValue({ data: [], error: null });
});
it("does not query memberships without authoritative auth", async () => {
  getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthSessionMissingError", status: 400 } });
  await expect(bootstrap()).rejects.toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
  expect(rpc).not.toHaveBeenCalled();
});
it("normalizes expired sessions", async () => {
  getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthApiError", status: 401 } });
  await expect(bootstrap()).rejects.toMatchObject({ code: "SESSION_EXPIRED", status: 401 });
});
it("preserves transient errors as retryable without granting access", async () => {
  getUser.mockResolvedValue({ data: { user: null }, error: { status: 503 } });
  await expect(bootstrap()).rejects.toMatchObject({ code: "NETWORK_ERROR", status: 503 });
});
it("calls only the parameterless read-only contract", async () => {
  expect(await bootstrap()).toEqual([]);
  expect(rpc).toHaveBeenCalledExactlyOnceWith("list_workspace_contexts");
});
it("normalizes RLS denial", async () => {
  rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
  await expect(bootstrap()).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
});
it("does not mislabel an expired RPC token as a network failure", async () => {
  rpc.mockResolvedValue({ data: null, error: { code: "PGRST301" }, status: 401 });
  await expect(bootstrap()).rejects.toMatchObject({ code: "SESSION_EXPIRED", status: 401 });
});
it("rejects provider payloads that violate the context contract", async () => {
  rpc.mockResolvedValue({ data: [{ role: "forged-owner" }], error: null });
  await expect(bootstrap()).rejects.toThrow();
});
