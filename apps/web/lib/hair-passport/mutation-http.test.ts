import { beforeEach, expect, it, vi } from "vitest";
const mutate = vi.hoisted(() => vi.fn());
vi.mock("./mutation-service", () => ({ mutateHairPassport: mutate }));
import { AccessError } from "@/lib/tenant/bootstrap";
import { POST, PATCH } from "@/app/api/clients/[clientId]/hair-passport/route";
import { POST as createRegion } from "@/app/api/clients/[clientId]/hair-passport/regions/route";
import { PATCH as updateRegion } from "@/app/api/clients/[clientId]/hair-passport/regions/[regionId]/route";
const params = Promise.resolve({ clientId: "client-id", regionId: "region-id" });
const request = (body = "{}", headers: Record<string, string> = {}) => new Request("https://elifora.test/api/clients/client-id/hair-passport", {
 method: "POST", headers: { origin: "https://elifora.test", "content-type": "application/json", "x-workspace-reference": "selected", ...headers }, body,
});
beforeEach(() => { vi.clearAllMocks(); mutate.mockImplementation(async (_input, correlationId) => ({ data: {}, correlationId })); });
it("routes only the four core operations and returns matching private correlation headers", async () => {
 for (const [handler, operation] of [[POST, "create_passport"], [PATCH, "update_passport"], [createRegion, "create_region"], [updateRegion, "update_region"]] as const) {
  const response = await handler(request(), { params }); const body = await response.json();
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-correlation-id")).toBe(body.correlationId);
  expect(mutate).toHaveBeenLastCalledWith({ operation, client_id: "client-id", ...(operation === "update_region" ? { region_id: "region-id" } : {}), payload: {} }, body.correlationId, "selected");
 }
});
it("denies absent, malformed and foreign origins", async () => {
 for (const origin of ["", "invalid", "https://foreign.test", "http://elifora.test"]) expect((await POST(request("{}", { origin }), { params })).status).toBe(403);
 expect(mutate).not.toHaveBeenCalled();
});
it("rejects non-JSON, malformed and oversized bodies", async () => {
 for (const req of [request("{}", { "content-type": "text/plain" }), request("{"), request('"' + "x".repeat(32768) + '"')]) expect((await POST(req, { params })).status).toBe(400);
 expect(mutate).not.toHaveBeenCalled();
});
it("normalizes domain failure with the current request correlation", async () => {
 mutate.mockRejectedValue(new AccessError("HAIR_PASSPORT_ALREADY_EXISTS", 409));
 const response = await POST(request(), { params }); const body = await response.json();
 expect(response.status).toBe(409); expect(body.code).toBe("HAIR_PASSPORT_ALREADY_EXISTS");
 expect(body.correlationId).toBe(response.headers.get("x-correlation-id"));
});
