import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  bootstrap: vi.fn(), get: vi.fn(), set: vi.fn(), remove: vi.fn(),
  AccessError: class extends Error {
    constructor(public code: string, public status: number) { super(code); }
  },
}));
vi.mock("@/lib/tenant/bootstrap", () => ({ bootstrap: mocks.bootstrap, AccessError: mocks.AccessError }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.get, set: mocks.set, delete: mocks.remove }) }));
import { GET } from "./route";
const context = {
  membership_id: "10000000-0000-4000-8000-000000000001", organization_id: "20000000-0000-4000-8000-000000000001",
  organization_name: "Salon A", location_id: "30000000-0000-4000-8000-000000000001", location_name: "Bolu",
  role: "owner", membership_status: "active", permissions: [],
};
beforeEach(() => { vi.resetAllMocks(); mocks.bootstrap.mockResolvedValue([context]); });
it("returns verified context with correlation and no-store headers", async () => {
  const response = await GET(); const body = await response.json();
  expect(body.context).toEqual(context);
  expect(body.correlationId).toBe(response.headers.get("X-Correlation-ID"));
  expect(body.correlationId).toMatch(/^[0-9a-f-]{36}$/);
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(mocks.set).toHaveBeenCalled();
});
it("invalidates a forged reference without returning tenant data", async () => {
  mocks.get.mockReturnValue({ value: "forged" });
  const response = await GET(); const body = await response.json();
  expect(response.status).toBe(403);
  expect(body.code).toBe("TENANT_CONTEXT_INVALID"); expect(body.context).toBeUndefined();
  expect(mocks.remove).toHaveBeenCalledWith("elifora-workspace");
});
it("distinguishes removed membership from no prior membership", async () => {
  mocks.bootstrap.mockResolvedValue([]); mocks.get.mockReturnValue({ value: "previous" });
  expect((await (await GET()).json()).code).toBe("MEMBERSHIP_REVOKED");
  mocks.get.mockReturnValue(undefined);
  expect((await (await GET()).json()).code).toBe("MEMBERSHIP_REQUIRED");
});
it("keeps authentication errors and their correlation envelope", async () => {
  mocks.bootstrap.mockRejectedValue(new mocks.AccessError("SESSION_EXPIRED", 401));
  const response = await GET(); const body = await response.json();
  expect(response.status).toBe(401); expect(body.code).toBe("SESSION_EXPIRED");
  expect(body.correlationId).toBe(response.headers.get("X-Correlation-ID"));
  expect(body.context).toBeUndefined();
});
it("does not expose provider exception details on transient failure", async () => {
  mocks.bootstrap.mockRejectedValue(new Error("private provider payload"));
  const response = await GET(); const body = await response.json();
  expect(response.status).toBe(503); expect(body.code).toBe("NETWORK_ERROR");
  expect(JSON.stringify(body)).not.toContain("private provider payload");
});
