import {it,expect,vi,beforeEach} from "vitest";
const mocks=vi.hoisted(()=>({read:vi.fn(),write:vi.fn()}));vi.mock("server-only",()=>({}));vi.mock("./service",()=>({readStock:mocks.read,mutateStock:mocks.write}));
import {stockResponse} from "./http";
beforeEach(()=>{vi.clearAllMocks();mocks.read.mockResolvedValue({data:{}});mocks.write.mockResolvedValue({data:{}});});
it("bounds duplicate read parameters",async()=>{expect((await stockResponse(new Request("http://localhost/api/stock?offset=0&offset=1"))).status).toBe(400);expect(mocks.read).not.toHaveBeenCalled();});
it("rejects unknown query AST",async()=>expect((await stockResponse(new Request("http://localhost/api/stock?organization_id=x"))).status).toBe(400));
it("returns private no-store read",async()=>expect((await stockResponse(new Request("http://localhost/api/stock"))).headers.get("Cache-Control")).toBe("private, no-store"));
it("rejects cross origin mutation",async()=>{expect((await stockResponse(new Request("http://localhost/api/stock",{method:"POST",headers:{origin:"http://evil.test","content-type":"application/json"},body:"{}"}))).status).toBe(403);expect(mocks.write).not.toHaveBeenCalled();});
it("limits raw request before service",async()=>{expect((await stockResponse(new Request("http://localhost/api/stock",{method:"POST",headers:{origin:"http://localhost","content-type":"application/json"},body:JSON.stringify({x:"x".repeat(33000)})}))).status).toBe(400);expect(mocks.write).not.toHaveBeenCalled();});
