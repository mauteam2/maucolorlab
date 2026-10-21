import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/clients/service", () => ({ verifiedClientContext: mocks.context }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));
import { readColorRegistry } from "./registry-service";
import { registryResponse } from "./registry-http";
import { fixtureId } from "@/test/confidence-fixtures";
const context = { organization_id: fixtureId(1), membership_id: fixtureId(2), location_id: fixtureId(3), permissions: ["color_plan.read"] };
beforeEach(() => { vi.resetAllMocks(); mocks.context.mockResolvedValue(context); mocks.rpc.mockResolvedValue({ data: { schemaVersion: 1, total: 0, offset: 0, limit: 25, brands: [], regions: [], items: [] }, error: null }); });
it("uses only a membership-authorized, validated, bounded RPC projection", async () => {
 await readColorRegistry({ region: "TR", brand: "keune" }, fixtureId(4));
 expect(mocks.context).toHaveBeenCalledWith("color_plan.read");
 expect(mocks.rpc).toHaveBeenCalledWith("color_registry_browse", { p_query: "", p_brand: "keune", p_region: "TR", p_state: null, p_offset: 0, p_limit: 25 });
 expect(mocks.context).toHaveBeenCalledTimes(2);
});
it("rejects changed workspace after read", async () => {
 mocks.context.mockResolvedValueOnce(context).mockResolvedValueOnce({ ...context, location_id: fixtureId(8) });
 await expect(readColorRegistry({}, fixtureId(4))).rejects.toMatchObject({ code: "TENANT_CONTEXT_INVALID" });
});
it("revoked membership and malformed database authority fail closed", async () => {
 mocks.rpc.mockResolvedValueOnce({ error: { code: "42501" } });
 await expect(readColorRegistry({}, fixtureId(4))).rejects.toMatchObject({ code: "FORBIDDEN" });
 mocks.rpc.mockResolvedValueOnce({ data: { executable: true } });
 await expect(readColorRegistry({}, fixtureId(4))).rejects.toMatchObject({ code: "BRAND_CATALOG_INVALID" });
});
it("HTTP rejects duplicate filters and authority injection; never caches catalog access", async () => {
 for (const query of ["region=US&region=TR", "organization_id=forged", "limit=51"]) {
  const response = await registryResponse(new Request(`https://example.invalid/api/color-registry?${query}`));
  expect(response.status).toBe(400); expect(response.headers.get("cache-control")).toBe("private, no-store");
 }
 expect(mocks.rpc).not.toHaveBeenCalled();
});
