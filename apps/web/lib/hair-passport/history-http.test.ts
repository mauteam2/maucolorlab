import { expect, it, vi } from "vitest";
const add = vi.hoisted(() => vi.fn(async (_input, correlationId) => ({ data: {}, correlationId })));
vi.mock("./history-service", () => ({ addHairHistory: add }));
import { POST } from "@/app/api/clients/[clientId]/hair-passport/history/route";
it("uses the existing bounded same-origin boundary for history", async () => {
 const params = Promise.resolve({ clientId: "client" });
 const headers = { origin: "https://elifora.test", "content-type": "application/json", "x-workspace-reference": "workspace" };
 const url = "https://elifora.test/api/clients/client/hair-passport/history";
 const response = await POST(new Request(url, { method: "POST", headers, body: "{}" }), { params });
 const body = await response.json();
 expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
 expect(response.headers.get("x-correlation-id")).toBe(body.correlationId);
 expect(add).toHaveBeenCalledExactlyOnceWith({ operation: "add_history", client_id: "client", payload: {} }, body.correlationId, "workspace");
 const denied = await POST(new Request(url, { method: "POST", headers: { ...headers, origin: "https://foreign.test" }, body: "{}" }), { params });
 expect(denied.status).toBe(403); expect(add).toHaveBeenCalledTimes(1);
});
