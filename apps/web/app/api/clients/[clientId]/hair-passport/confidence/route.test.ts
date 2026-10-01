import { beforeEach, expect, it, vi } from "vitest";
const read = vi.hoisted(() => vi.fn());
vi.mock("@/lib/confidence/service", () => ({readCaseConfidence: read}));
import { AccessError } from "@/lib/tenant/bootstrap";
import { GET } from "./route";
const url = "https://elifora.test/api/clients/client/hair-passport/confidence";
const params = Promise.resolve({clientId: "client"});
beforeEach(() => {vi.clearAllMocks(); read.mockImplementation(async (_id, _options, correlationId) => ({data: {band: "INSUFFICIENT"}, correlationId}));});
it("returns a private no-store correlated read-only result", async () => {
 const response = await GET(new Request(url), {params}); const body = await response.json();
 expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
 expect(response.headers.get("x-correlation-id")).toBe(body.correlationId);
 expect(read).toHaveBeenCalledExactlyOnceWith("client", {include_archived: false}, body.correlationId);
});
it.each(["organization_id=forged", "include_archived=true&include_archived=false", "include_archived=1", "evaluatedAt=2030-01-01", "engineVersion=forged"])("rejects unsupported/ambiguous query %s", async query => {
 const response = await GET(new Request(`${url}?${query}`), {params});
 expect(response.status).toBe(400); expect(read).not.toHaveBeenCalled();
 expect((await response.json()).code).toBe("VALIDATION_FAILED");
});
it("historical read flag is explicit", async () => {
 await GET(new Request(`${url}?include_archived=true`), {params});
 expect(read).toHaveBeenCalledWith("client", {include_archived: true}, expect.any(String));
});
it.each(["MEMBERSHIP_REVOKED", "CLIENT_NOT_FOUND", "CONFIDENCE_INPUT_INVALID"])("error %s returns no assessment", async code => {
 read.mockRejectedValue(new AccessError(code, code === "MEMBERSHIP_REVOKED" ? 403 : code === "CLIENT_NOT_FOUND" ? 404 : 503));
 const response = await GET(new Request(url), {params}); const body = await response.json();
 expect(body.code).toBe(code); expect(body).not.toHaveProperty("data");
 expect(body.correlationId).toBe(response.headers.get("x-correlation-id"));
});
it("unexpected failures never expose source data or exception messages", async () => {
 read.mockRejectedValue(new Error("secret source notes")); const response = await GET(new Request(url), {params});
 expect(response.status).toBe(503); expect(await response.text()).not.toContain("secret source notes");
});
