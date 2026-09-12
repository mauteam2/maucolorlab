import { beforeEach, expect, it, vi } from "vitest";
const read = vi.hoisted(() => vi.fn());
vi.mock("@/lib/hair-passport/service", () => ({ readHairPassport: read }));
import { AccessError } from "@/lib/tenant/bootstrap";
import { GET } from "./route";
import { readFixtures } from "@/test/hair-passport-fixtures";
const params = Promise.resolve({ clientId: readFixtures.empty.data.passport.client_id });
const request = (query = "") => new Request("http://localhost/api/clients/" + readFixtures.empty.data.passport.client_id + "/hair-passport" + query);
beforeEach(() => {
 vi.clearAllMocks();
 read.mockImplementation(async (_client, _options, correlationId) => ({ ...readFixtures.empty, correlationId }));
});
it("returns a no-store read response with matching correlation identifiers", async () => {
 const response = await GET(request(), { params });
 expect(response.status).toBe(200);
 const body = await response.json();
 expect(body.correlationId).toBe(response.headers.get("x-correlation-id"));
 expect(response.headers.get("cache-control")).toBe("private, no-store");
 expect(read).toHaveBeenCalledWith(readFixtures.empty.data.passport.client_id,
  { include_archived: false, page_size: 50, tests_offset: 0, history_offset: 0 }, body.correlationId);
});
it("passes explicit history and independent pagination", async () => {
 await GET(request("?include_archived=true&page_size=1&tests_offset=2&history_offset=3"), { params });
 expect(read).toHaveBeenCalledWith(readFixtures.empty.data.passport.client_id,
  { include_archived: true, page_size: 1, tests_offset: 2, history_offset: 3 }, expect.any(String));
});
it.each(["?organization_id=1", "?passport_id=1", "?include_archived=1", "?page_size=0", "?page_size=101", "?tests_offset=-1", "?history_offset=1.5", "?page_size=1&page_size=2"])("rejects unsafe query %s", async query => {
 expect((await GET(request(query), { params })).status).toBe(400);
 expect(read).not.toHaveBeenCalled();
});
it.each([["CLIENT_NOT_FOUND", 404], ["HAIR_PASSPORT_NOT_FOUND", 404], ["FORBIDDEN", 403], ["MEMBERSHIP_REVOKED", 403], ["SESSION_EXPIRED", 401]] as const)("returns shared %s envelope without data", async (code, status) => {
 read.mockRejectedValue(new AccessError(code, status));
 const response = await GET(request(), { params });
 const body = await response.json();
 expect(response.status).toBe(status); expect(body).toEqual({ code, message: code, correlationId: response.headers.get("x-correlation-id") });
 expect(response.headers.get("cache-control")).toContain("no-store");
});
it("never returns raw unexpected errors", async () => {
 read.mockRejectedValue(new Error("private provider detail"));
 const response = await GET(request(), { params });
 expect(response.status).toBe(503); expect(await response.text()).not.toContain("private provider detail");
});
