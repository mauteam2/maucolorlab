import { beforeEach, expect, it, vi } from "vitest";
const execute = vi.hoisted(() => vi.fn());
vi.mock("@/lib/clients/service", () => ({ executeClientCommand: execute }));
import { POST } from "./route";
const request = (payload: object, origin = "http://localhost:4173") => new Request("http://localhost:4173/api/clients", { method: "POST", headers: { origin, host: "localhost:4173", "content-type": "application/json" }, body: JSON.stringify(payload) });
beforeEach(() => { vi.clearAllMocks(); execute.mockResolvedValue({ data: { items: [], has_more: false, offset: 0 } }); });
it("rejects cross-origin cookie mutations", async () => {
  expect((await POST(request({ operation: "list", payload: {} }, "https://other.test"))).status).toBe(403); expect(execute).not.toHaveBeenCalled();
});
it("returns no-store list and correlation header", async () => {
  const result = await POST(request({ operation: "list", payload: {} }));
  expect(result.status).toBe(200); expect(result.headers.get("cache-control")).toContain("no-store"); expect(result.headers.get("x-correlation-id")).toBeTruthy();
});
it("invalid payload cannot reach the service", async () => {
  expect((await POST(request({ operation: "create", payload: { full_name: "A" } }))).status).toBe(400); expect(execute).not.toHaveBeenCalled();
});
it("returns duplicate review using the shared conflict status", async () => {
  execute.mockResolvedValue({ code: "DUPLICATE_CLIENT_CANDIDATES", message: "DUPLICATE_CLIENT_CANDIDATES", candidates: [] });
  expect((await POST(request({ operation: "list", payload: {} }))).status).toBe(409);
});
