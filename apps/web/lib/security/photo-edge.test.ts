import {beforeEach,expect,it,vi} from "vitest";
import {createHash} from "node:crypto";
import {createPhotoHandler} from "../../../../supabase/functions/live-photo/handler";
const bytes=new Uint8Array([137,80,78,71,13,10,26,10,1,2,3,4]),digest=createHash("sha256").update(bytes).digest("hex");
let stored:Uint8Array|null,denied:boolean,calls:string[];
const transport=vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>{
 const path=String(url);calls.push(`${init?.method??"GET"} ${path}`);
 if(path.includes("/rpc/"))return Response.json(denied?{code:"MEMBERSHIP_REVOKED"}:{data:{path:"org/session/actor/photo",contentType:"image/png",actorId:"actor"}});
 if(init?.method==="POST"){stored=new Uint8Array(await (init.body as Blob).arrayBuffer());return new Response(null,{status:200});}
 return stored?new Response(new Uint8Array(stored)):new Response(null,{status:404});
});
const handler=createPhotoHandler({url:"https://synthetic.test",anonKey:"public-fixture",serviceKey:"private-fixture"},transport as typeof fetch);
function request(method="POST",extra:Record<string,string>={},body:Uint8Array=bytes){const e={method,digest,size:body.length};return new Request("https://synthetic.test/functions/v1/live-photo",{method,headers:{authorization:"Bearer user-fixture","content-type":"image/png","x-elifora-envelope":btoa(JSON.stringify(e)),"x-elifora-signature":"a".repeat(64),...extra},body:method==="POST"?new Uint8Array(body):undefined});}
beforeEach(()=>{stored=null;denied=false;calls=[];transport.mockClear();});
it("does not use privileged Storage before the scoped proof is accepted",async()=>{denied=true;expect((await handler(request())).status).toBe(403);expect(calls).toHaveLength(1);});
it("missing application proof cannot call Storage",async()=>{expect((await handler(request("GET",{"x-elifora-signature":""}))).status).toBe(403);expect(calls).toHaveLength(0);});
it("immutable accepted bytes replay after response loss without another write",async()=>{expect((await handler(request())).status).toBe(204);expect((await handler(request())).status).toBe(204);expect(calls.filter(c=>c.startsWith("POST ")&&c.includes("/storage/"))).toHaveLength(1);});
it("changed bytes cannot replace a reserved object",async()=>{stored=new Uint8Array([99]);expect((await handler(request())).status).toBe(409);expect(calls.some(c=>c.startsWith("POST ")&&c.includes("/storage/"))).toBe(false);});
it("body must match the application-approved digest",async()=>{expect((await handler(request("POST",{},new Uint8Array(12)))).status).toBe(400);expect(calls).toHaveLength(1);});
it("rejects valid-looking bytes under an invalid declared MIME",async()=>{expect((await handler(request("POST",{"content-type":"image/svg+xml"}))).status).toBe(400);expect(stored).toBeNull();});
it("does not release downloaded bytes if membership is revoked during fetch",async()=>{stored=bytes;const original=transport.getMockImplementation()!;transport.mockImplementationOnce(original).mockImplementationOnce(async()=>{denied=true;return new Response(bytes);});expect((await handler(request("GET"))).status).toBe(403);});
it("download is private/no-store and service credential is confined to Storage",async()=>{stored=bytes;const r=await handler(request("GET"));expect(r.status).toBe(200);expect(r.headers.get("cache-control")).toBe("private, no-store");expect(r.headers.get("x-content-type-options")).toBe("nosniff");const first=transport.mock.calls[0]![1]!;expect(JSON.stringify(first.headers)).not.toContain("private-fixture");});
