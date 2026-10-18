import { beforeEach,expect,it,vi } from "vitest";
import { AccessError } from "@/lib/tenant/bootstrap";
const context=vi.hoisted(()=>vi.fn());
vi.mock("@/lib/clients/service",()=>({verifiedClientContext:context}));
import { GET } from "@/app/api/color-target-options/route";
beforeEach(()=>{context.mockReset();});
it("options require current technical authority and contain intent only",async()=>{
 context.mockResolvedValue({permissions:["hair_passport.read","clients.read","color_plan.read"]});
 const r=await GET(new Request("http://localhost/api/color-target-options")),body=await r.json();
 expect(r.status).toBe(200);expect(context).toHaveBeenCalledWith("color_plan.read");expect(body.data.levels).toHaveLength(10);expect(body.data.families).toHaveLength(8);expect(body.data.numericPigmentStrength).toBe("UNKNOWN");expect(r.headers.get("cache-control")).toContain("no-store");
 expect(JSON.stringify(body)).not.toMatch(/manufacturerCode|developerGrams|processingMinutes/);
});
it("reception cannot use target metadata as a technical bypass",async()=>{context.mockResolvedValue({permissions:["clients.read"]});expect((await GET(new Request("http://localhost/api/color-target-options"))).status).toBe(403);});
it("revoked membership and unauthenticated failures stay safe",async()=>{context.mockImplementation(async()=>{throw new AccessError("SESSION_EXPIRED",401);});const r=await GET(new Request("http://localhost/api/color-target-options"));expect(r.status).toBe(401);expect(await r.json()).not.toHaveProperty("data");});
it("unrecognized target-options query never reaches authority",async()=>{const r=await GET(new Request("http://localhost/api/color-target-options?organization_id=foreign"));expect(r.status).toBe(400);expect(context).not.toHaveBeenCalled();});
