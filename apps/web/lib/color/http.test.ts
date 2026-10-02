import { expect,it,vi } from "vitest";
import { colorResponse } from "./http";
const params=Promise.resolve({clientId:crypto.randomUUID(),targetId:crypto.randomUUID()});
it.each(["foreign_origin","missing_origin","query","media","json","oversize"])("HTTP denies %s before service",async change=>{
 const headers:Record<string,string>={origin:"http://localhost","content-type":"application/json"};
 if(change==="foreign_origin")headers.origin="http://evil.test";if(change==="missing_origin")delete headers.origin;if(change==="media")headers["content-type"]="text/plain";
 const request=new Request(`http://localhost/api${change==="query"?"?ignoreRisk=true":""}`,{method:"POST",headers,body:change==="json"?"{":change==="oversize"?"x".repeat(131073):"{}"});
 const execute=vi.fn();const response=await colorResponse(request,params,"generate_plan",execute);expect(response.status).toBe(change.includes("origin")?403:400);expect(execute).not.toHaveBeenCalled();expect(await response.json()).not.toHaveProperty("data");
});
it.each(["ignoreRisk=true","include_archived=yes","include_archived=true&include_archived=false","risk=LOW"])("GET rejects %s",async query=>{const execute=vi.fn();expect((await colorResponse(new Request(`http://localhost/api?${query}`),params,"read_target",execute)).status).toBe(400);expect(execute).not.toHaveBeenCalled();});
it("response correlates and forbids caching",async()=>{const execute=vi.fn(async(_input,correlationId)=>({data:{},correlationId}));const response=await colorResponse(new Request("http://localhost/api"),params,"read_target",execute as never);expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("private, no-store");expect((await response.json()).correlationId).toBe(response.headers.get("x-correlation-id"));});
