import { AccessError } from "@/lib/tenant/bootstrap";
import {it,expect,vi,beforeEach} from "vitest";
const mocks=vi.hoisted(()=>({read:vi.fn(),write:vi.fn()}));vi.mock("server-only",()=>({}));vi.mock("./service",()=>({readFinance:mocks.read,mutateFinance:mocks.write}));
import {financeResponse} from "./http";
beforeEach(()=>{vi.clearAllMocks();mocks.read.mockResolvedValue({data:{}});mocks.write.mockResolvedValue({data:{}});});
it("bounds duplicate read parameters",async()=>{expect((await financeResponse(new Request("http://localhost/api/finance?offset=0&offset=1"))).status).toBe(400);expect(mocks.read).not.toHaveBeenCalled();});
it("rejects unknown query AST",async()=>expect((await financeResponse(new Request("http://localhost/api/finance?organization_id=x"))).status).toBe(400));
it("returns private no-store read",async()=>expect((await financeResponse(new Request("http://localhost/api/finance"))).headers.get("Cache-Control")).toBe("private, no-store"));
it("rejects cross origin mutation",async()=>{expect((await financeResponse(new Request("http://localhost/api/finance",{method:"POST",headers:{origin:"http://evil.test","content-type":"application/json"},body:"{}"}))).status).toBe(403);expect(mocks.write).not.toHaveBeenCalled();});
it("limits raw request before service",async()=>{expect((await financeResponse(new Request("http://localhost/api/finance",{method:"POST",headers:{origin:"http://localhost","content-type":"application/json"},body:JSON.stringify({x:"x".repeat(33000)})}))).status).toBe(400);expect(mocks.write).not.toHaveBeenCalled();});

it.each(["FEATURE_UNAVAILABLE","SUBSCRIPTION_RESTRICTED"])("retains controlled SaaS rejection %s at HTTP boundary",async code=>{mocks.write.mockRejectedValue(new AccessError(code,409));const response=await financeResponse(new Request("http://localhost/api/finance",{method:"POST",headers:{origin:"http://localhost","content-type":"application/json"},body:"{}"}));expect(response.status).toBe(409);expect((await response.json()).code).toBe(code);});
it("never exposes unknown internal database codes",async()=>{mocks.write.mockRejectedValue(new AccessError("INTERNAL_DB_DETAIL",409));const response=await financeResponse(new Request("http://localhost/api/finance",{method:"POST",headers:{origin:"http://localhost","content-type":"application/json"},body:"{}"}));expect(response.status).toBe(503);expect((await response.json()).code).toBe("NETWORK_ERROR");});
