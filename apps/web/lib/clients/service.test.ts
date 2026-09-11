import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ bootstrap: vi.fn(), cookies: vi.fn(), rpc: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/tenant/bootstrap", () => ({ bootstrap: mocks.bootstrap, AccessError: class extends Error { constructor(public code: string, public status: number) { super(code); } } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));
import { executeClientCommand, verifiedClientContext } from "./service";
const context = { membership_id: "m", organization_id: "org-a", location_id: "loc-a", permissions: ["clients.read", "clients.create"] };
beforeEach(() => { vi.clearAllMocks(); mocks.bootstrap.mockResolvedValue([context]); mocks.cookies.mockResolvedValue({ get: () => ({ value: "m:loc-a" }) }); mocks.rpc.mockResolvedValue({ data: { data: {} }, error: null }); });
it("derives RPC scope from freshly verified membership", async () => {
  await executeClientCommand({ operation: "list", payload: {} }, "correlation");
  expect(mocks.bootstrap).toHaveBeenCalledOnce();
  expect(mocks.rpc).toHaveBeenCalledWith("client_operation", { p_membership_id: "m", p_location_id: "loc-a", p_operation: "list", p_payload: {}, p_correlation_id: "correlation" });
});
it("revocation denies before calling client service", async () => {
  mocks.bootstrap.mockResolvedValue([]);
  await expect(verifiedClientContext()).rejects.toMatchObject({ status: 403 }); expect(mocks.rpc).not.toHaveBeenCalled();
});
it("forged selected reference cannot fall back to another membership", async () => {
  mocks.cookies.mockResolvedValue({ get: () => ({ value: "other:loc-b" }) });
  await expect(verifiedClientContext()).rejects.toMatchObject({ code: "TENANT_CONTEXT_INVALID" });
});
it("read permission does not permit archive", async () => {
  await expect(verifiedClientContext("clients.archive")).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("preserves logical duplicate error and does not attach protected context to failures", async () => {
  mocks.rpc.mockResolvedValue({ data: { code: "DUPLICATE_CLIENT_CANDIDATES", candidates: [] }, error: null });
  const result = await executeClientCommand({ operation: "list", payload: {} }, "correlation");
  expect(result.code).toBe("DUPLICATE_CLIENT_CANDIDATES"); expect(result.context).toBeUndefined(); expect(result.correlationId).toBe("correlation");
});
it("normalizes provider authentication failures", async () => {
  mocks.rpc.mockResolvedValue({ error: { message: "provider details" }, status: 401 });
  await expect(executeClientCommand({ operation: "list", payload: {} }, "correlation")).rejects.toMatchObject({ code: "SESSION_EXPIRED", status: 401 });
});
it("a form opened in another workspace cannot create under a changed selection", async () => {
  const command = { operation: "create" as const, payload: { full_name: "Person", phone: "05321234567", phone_region: "TR", request_id: "70000000-0000-4000-8000-000000000001" } };
  await expect(executeClientCommand(command, "correlation", "old:workspace")).rejects.toMatchObject({ code: "TENANT_CONTEXT_INVALID" });
  expect(mocks.rpc).not.toHaveBeenCalled();
  await expect(executeClientCommand(command, "correlation")).rejects.toMatchObject({ code: "TENANT_CONTEXT_INVALID" });
  await executeClientCommand(command, "correlation", "m:loc-a");
  expect(mocks.rpc).toHaveBeenCalledOnce();
});
