import { afterEach, expect, it, vi } from "vitest";
import { sendHairMutation } from "./mutate";
import { readFixtures } from "@/test/hair-passport-fixtures";
const id = "b2000000-0000-4000-8000-000000000031", org = "b2000000-0000-4000-8000-000000000001";
const context = { membership_id: org, organization_id: org, organization_name: "Synthetic", location_id: org, location_name: "Synthetic", role: "owner", membership_status: "active", permissions: ["hair_passport.read", "hair_passport.create", "hair_passport.update"] };
const reference = `${org}:${org}`;
const request_id = "b2000000-0000-4000-8000-000000000099";
const success = { correlationId: request_id, data: { kind: "PASSPORT", passport: readFixtures.empty.data.passport, core: readFixtures.empty.data.core, regions: readFixtures.empty.data.regions } };
function mock(permission = context.permissions, result: object = success, status = 200) {
 const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ context: { ...context, permissions: permission } }))).mockResolvedValueOnce(new Response(JSON.stringify(result), { status }));
 vi.stubGlobal("fetch", fetch); return fetch;
}
afterEach(() => vi.unstubAllGlobals());
it("sends a minimal create request with the workspace precondition", async () => {
 const fetch = mock();
 await sendHairMutation({ operation: "create_passport", client_id: id, payload: { request_id } }, reference, new AbortController().signal);
 expect(fetch).toHaveBeenCalledTimes(2);
 expect(fetch.mock.calls[1]![0]).toBe(`/api/clients/${id}/hair-passport`);
 expect(fetch.mock.calls[1]![1]).toMatchObject({ method: "POST", headers: { "X-Workspace-Reference": reference }, body: JSON.stringify({ request_id }) });
});
it("sends only a partial core patch and preserves its request id", async () => {
 const fetch = mock();
 await sendHairMutation({ operation: "update_passport", client_id: id, payload: { request_id, expected_version: 1, technical: { natural_level: { state: "UNKNOWN", value: null } } } }, reference, new AbortController().signal);
 expect(fetch.mock.calls[1]![1].method).toBe("PATCH");
 expect(JSON.parse(fetch.mock.calls[1]![1].body)).toEqual({ request_id, expected_version: 1, technical: { natural_level: { state: "UNKNOWN", value: null } } });
});
it("denies a read-only user and a changed workspace before mutation", async () => {
 const fetch = mock(["hair_passport.read"]);
 await expect(sendHairMutation({ operation: "create_passport", client_id: id, payload: { request_id } }, reference, new AbortController().signal)).rejects.toMatchObject({ code: "FORBIDDEN" });
 expect(fetch).toHaveBeenCalledTimes(1);
 vi.unstubAllGlobals(); const changed = mock();
 await expect(sendHairMutation({ operation: "create_passport", client_id: id, payload: { request_id } }, "different", new AbortController().signal)).rejects.toMatchObject({ code: "TENANT_CONTEXT_INVALID" });
 expect(changed).toHaveBeenCalledTimes(1);
});
it("returns a version conflict without claiming success", async () => {
 mock(context.permissions, { code: "CONFLICT", message: "CONFLICT", correlationId: request_id }, 409);
 await expect(sendHairMutation({ operation: "update_passport", client_id: id, payload: { request_id, expected_version: 1, technical: { natural_level: { state: "UNKNOWN", value: null } } } }, reference, new AbortController().signal)).rejects.toMatchObject({ code: "CONFLICT" });
});
