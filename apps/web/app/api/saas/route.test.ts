import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/saas/service", () => ({ executeSaas: mock.run }));
import { AccessError } from "@/lib/tenant/bootstrap";
import { GET, POST } from "./route";
beforeEach(() => { vi.clearAllMocks(); mock.run.mockResolvedValue({ data: {} }); });
it("returns a private no-store snapshot with server correlation", async () => {
  const response = await GET(new Request("http://localhost/api/saas")); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(response.headers.get("x-correlation-id")).toMatch(/^[a-f0-9-]{36}$/);
});
it.each(["?organization_id=forged", "?status=ACTIVE"])("rejects caller-owned GET authority %s", async query => {
  expect((await GET(new Request("http://localhost/api/saas" + query))).status).toBe(400); expect(mock.run).not.toHaveBeenCalled();
});
it("rejects cross-origin mutations before the service", async () => {
  expect((await POST(new Request("http://localhost/api/saas", { method: "POST", headers: { origin: "http://evil.test", "content-type": "application/json" }, body: "{}" }))).status).toBe(403); expect(mock.run).not.toHaveBeenCalled();
});
it.each(["{", "x".repeat(4097)])("rejects malformed or excessive request bodies", async body => {
  expect((await POST(new Request("http://localhost/api/saas", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body }))).status).toBe(400); expect(mock.run).not.toHaveBeenCalled();
});
it("passes the workspace reference and bounded intent to the service", async () => {
  const q = { type: "REBUILD_USAGE" }; const response = await POST(new Request("http://localhost/api/saas", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json", "x-workspace-reference": "current" }, body: JSON.stringify(q) }));
  expect(response.status).toBe(200); expect(mock.run).toHaveBeenCalledWith(q, expect.any(String), "current");
});
it("keeps membership denial distinct from subscription rejection", async () => {
  mock.run.mockRejectedValue(new AccessError("FORBIDDEN", 403)); const response = await GET(new Request("http://localhost/api/saas")); expect(response.status).toBe(403); expect((await response.json()).code).toBe("FORBIDDEN");
});
