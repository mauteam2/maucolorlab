import "server-only";
import { assertOrigin } from "@/lib/live/http";
import { AccessError } from "@/lib/tenant/bootstrap";
import { stockError } from "./model";
import { readStock,mutateStock } from "./service";
export async function stockResponse(request:Request) {
 const correlationId=crypto.randomUUID(),headers={"Cache-Control":"private, no-store","X-Correlation-ID":correlationId};
 try {
  const url=new URL(request.url);let result;
  if(request.method==="GET"){
   if([...url.searchParams.keys()].some(k=>!["query","offset","item_id","lot_id"].includes(k)||url.searchParams.getAll(k).length!==1))throw new AccessError("VALIDATION_FAILED",400);
   const q:Record<string,unknown>=Object.fromEntries(url.searchParams);if(q.offset!==undefined)q.offset=Number(q.offset);result=await readStock(q,correlationId);
  }else{
   assertOrigin(request);if(request.method!=="POST"||url.search||request.headers.get("content-type")?.split(";",1)[0]?.trim()!=="application/json")throw new AccessError("VALIDATION_FAILED",400);
   const reader=request.body?.getReader(),chunks:Uint8Array[]=[];let size=0;
   if(reader)try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>32768){await reader.cancel();throw new AccessError("VALIDATION_FAILED",400);}chunks.push(value);}}finally{reader.releaseLock();}
   let raw;try{raw=JSON.parse(await new Blob(chunks as BlobPart[]).text());}catch{throw new AccessError("VALIDATION_FAILED",400);}
   result=await mutateStock(raw,correlationId,request.headers.get("x-workspace-reference"));
  }
  return Response.json(result,{headers});
 }catch(e){const err=e instanceof AccessError&&stockError.shape.code.options.some(c=>c===e.code)?e:new AccessError("NETWORK_ERROR",503);return Response.json({code:err.code,message:err.code,correlationId},{status:err.status,headers});}
}
