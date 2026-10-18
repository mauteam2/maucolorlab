import { it,expect } from "vitest";
import { boundedPhoto } from "./upload";
it("actual bytes cannot exceed the declared reservation",async()=>{const request=new Request("http://localhost/photo",{method:"POST",headers:{"content-length":"2","content-type":"image/png"},body:new Uint8Array([1,2,3])});await expect(boundedPhoto(request)).rejects.toMatchObject({code:"VALIDATION_FAILED"});});
it("over-limit stream is cancelled despite a forged small Content-Length",async()=>{let cancelled=false;const body=new ReadableStream({start(c){c.enqueue(new Uint8Array(10*1024*1024+1));},cancel(){cancelled=true;}});const request={headers:new Headers({"content-length":"1"}),body} as Request;await expect(boundedPhoto(request)).rejects.toMatchObject({status:400});expect(cancelled).toBe(true);});
