import { afterEach, expect, it, vi } from "vitest";
import { loadPassport } from "./load";
import { readFixtures } from "@/test/hair-passport-fixtures";
const id = "b2000000-0000-4000-8000-000000000031", org = "b2000000-0000-4000-8000-000000000001";
const context = { membership_id: org, organization_id: org, organization_name: "Synthetic", location_id: org, location_name: "Synthetic", role: "owner", membership_status: "active", permissions: ["clients.read", "hair_passport.read"] };
const client = { id, organization_id: org, full_name: "Synthetic", phone: "", phone_normalized: "", email: null, birth_date: null, status: "ACTIVE", version: 1, created_at: "2026-01-01", updated_at: "2026-01-01", created_by: org, updated_by: org, creation_location_id: org };
function mock(last: object = { context }, status = 200, empty = false) {
 const s = structuredClone(readFixtures.empty); s.data.history.page_size = 10; s.data.physical_tests.page_size = 10;
 const values = [{ context }, { context, data: client }, empty ? { code: "HAIR_PASSPORT_NOT_FOUND", message: "missing", correlationId: org } : s, last];
 const fetch = vi.fn(); values.forEach((v, i) => fetch.mockResolvedValueOnce(new Response(JSON.stringify(v), { status: i === 3 ? status : i === 2 && empty ? 404 : 200 })));
 vi.stubGlobal("fetch", fetch); return fetch;
}
afterEach(() => vi.unstubAllGlobals());
it("uses existing APIs with no cache and final membership verification", async () => {
 const fetch = mock(); expect((await loadPassport(id, {}, new AbortController().signal)).client.id).toBe(id);
 expect(fetch).toHaveBeenCalledTimes(4); expect(fetch.mock.calls.every(c => c[1].cache === "no-store")).toBe(true);
 expect(fetch.mock.calls[2]![0]).toContain("include_archived=false");
});
it("handles missing passport after client authorization", async () => { mock({ context }, 200, true); expect((await loadPassport(id, {}, new AbortController().signal)).snapshot).toBeNull(); });
it.each(["MEMBERSHIP_REVOKED", "FORBIDDEN", "SESSION_EXPIRED"])("rejects %s after data arrives", async code => { mock({ code }, code === "SESSION_EXPIRED" ? 401 : 403); await expect(loadPassport(id, {}, new AbortController().signal)).rejects.toMatchObject({ code }); });
it("rejects workspace changes in flight", async () => { mock({ context: { ...context, location_id: id } }); await expect(loadPassport(id, {}, new AbortController().signal)).rejects.toMatchObject({ code: "TENANT_CONTEXT_INVALID" }); });
