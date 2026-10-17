import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { fixtureId } from "@/test/confidence-fixtures";
import { AccessError } from "@/lib/tenant/bootstrap";
const mocks = vi.hoisted(() => ({ context: vi.fn(), user: vi.fn(), unwrap: vi.fn() }));
vi.mock("@/lib/clients/service", () => ({ verifiedClientContext: mocks.context }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.user } }) }));
vi.mock("@/lib/offline/server-keywrap", () => ({ legacyEncryptionPublicKey: () => "04" + "1".repeat(128), unwrapLegacyKey: mocks.unwrap }));
import { GET, POST } from "./route";
const ctx = { membership_id: fixtureId(1), organization_id: fixtureId(2), organization_name: "Synthetic", location_id: fixtureId(3), location_name: "Local", role: "owner", membership_status: "active", permissions: ["clients.read", "live_session.view"] };
const payload = () => ({ scope: [ctx.membership_id, ctx.location_id, fixtureId(4), fixtureId(5)].join(":"), ephemeral_public_key: "04" + "1".repeat(128), iv: "2".repeat(24), wrapped_key: "3".repeat(96) });
const get = (device = fixtureId(4)) => GET(new Request(`http://localhost:4173/api/offline-context?device_id=${device}`));
const post = (body: unknown = payload(), origin = "http://localhost:4173") => POST(new Request("http://localhost:4173/api/offline-context", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) }));
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("ELIFORA_COLOR_PLAN_SIGNING_KEY", "a".repeat(64)); mocks.context.mockResolvedValue(ctx); mocks.user.mockResolvedValue({ data: { user: { id: fixtureId(6) } }, error: null }); mocks.unwrap.mockReturnValue("b".repeat(64)); });
afterEach(() => vi.unstubAllEnvs());
it("returns only derived scope key, never master material, with no-store and correlation", async () => {
 const response = await get(), body = await response.json(); expect(response.status).toBe(200);
 expect(body.key === "a".repeat(64)).toBe(false); expect(body.key).toMatch(/^[a-f0-9]{64}$/);
 expect(response.headers.get("cache-control")).toContain("no-store"); expect(response.headers.get("x-correlation-id")).toBeTruthy();
 expect(mocks.context).toHaveBeenCalledTimes(2);
});
it("user, membership, location and device each separate derived encryption scopes", async () => {
 const original = (await (await get()).json()).key;
 expect((await (await get(fixtureId(99))).json()).key === original).toBe(false);
 for (const field of ["membership_id", "organization_id", "location_id"] as const) {
  mocks.context.mockResolvedValue({ ...ctx, [field]: fixtureId(99) }); expect((await (await get()).json()).key === original).toBe(false);
 }
 mocks.context.mockResolvedValue(ctx); mocks.user.mockResolvedValue({ data: { user: { id: fixtureId(99) } }, error: null });
 expect((await (await get()).json()).key === original).toBe(false);
});
it("revocation or workspace change during derivation releases no key", async () => {
 mocks.context.mockResolvedValueOnce(ctx).mockRejectedValueOnce(new AccessError("MEMBERSHIP_REVOKED", 403));
 const response = await get(); expect(response.status).toBe(403); expect(await response.json()).not.toHaveProperty("key");
 mocks.context.mockResolvedValueOnce(ctx).mockResolvedValueOnce({ ...ctx, location_id: fixtureId(90) });
 expect((await get()).status).toBe(403);
});
it("legacy unwrap requires same-origin and original fresh membership/location", async () => {
 expect((await post(undefined, "https://other.test")).status).toBe(403); expect(mocks.unwrap).not.toHaveBeenCalled();
 expect((await post({ ...payload(), scope: [fixtureId(99), ctx.location_id, fixtureId(4), fixtureId(5)].join(":") })).status).toBe(403);
 expect(mocks.unwrap).not.toHaveBeenCalled();
 expect((await post()).status).toBe(200); expect(mocks.context).toHaveBeenLastCalledWith("live_session.view");
});
it("unwrap failures, forged authority and oversized payloads reveal no key", async () => {
 expect((await post({ ...payload(), role: "owner" })).status).toBe(400);
 expect((await post({ ...payload(), scope: "x".repeat(5000) })).status).toBe(400);
 mocks.unwrap.mockImplementation(() => { throw new Error("Invalid tag"); }); const response = await post();
 expect(response.status).toBe(400); expect(await response.json()).not.toHaveProperty("key");
});
