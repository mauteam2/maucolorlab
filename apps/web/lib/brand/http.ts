import "server-only";
import { z } from "zod";
import { AccessError } from "@/lib/tenant/bootstrap";
import { evaluateRequest } from "./model";
import { evaluateBrandRequest, readBrandCatalog } from "./service";
export async function brandResponse(request:Request,kind:Parameters<typeof readBrandCatalog>[1]|"evaluate",params:Promise<Record<string,string>>=Promise.resolve({}),execute=evaluateBrandRequest,read=readBrandCatalog) {
 const correlationId=crypto.randomUUID(),headers={"Cache-Control":"private, no-store","X-Correlation-ID":correlationId};
 try {
  const url=new URL(request.url);let result;
  if(kind==="evaluate") {
   let same=false;try{const origin=new URL(request.headers.get("origin")??"");same=origin.protocol===url.protocol&&origin.host===(request.headers.get("host")??url.host);}catch{}
   if(!same)throw new AccessError("FORBIDDEN",403);
   if(url.search||request.headers.get("content-type")?.split(";",1)[0]?.trim().toLowerCase()!=="application/json")throw new AccessError("VALIDATION_FAILED",400);
   const reader=request.body?.getReader(),chunks:Uint8Array[]=[];let size=0;
   if(reader)try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();throw new AccessError("VALIDATION_FAILED",400);}chunks.push(value);}}finally{reader.releaseLock();}
   let raw:unknown;try{raw=JSON.parse(await new Blob(chunks as BlobPart[]).text());}catch{throw new AccessError("VALIDATION_FAILED",400);}
   const parsed=evaluateRequest.safeParse(raw);if(!parsed.success)throw new AccessError("VALIDATION_FAILED",400);
   result=await execute(parsed.data,correlationId,request.headers.get("x-workspace-reference"));
  } else {
   const p=await params;for(const value of Object.values(p))if(!z.uuid().safeParse(value).success)throw new AccessError("VALIDATION_FAILED",400);
   const allowed=p.catalogId?["limit","offset"]:["catalog_id","limit","offset"];
   if([...url.searchParams.keys()].some(k=>!allowed.includes(k)||url.searchParams.getAll(k).length!==1))throw new AccessError("VALIDATION_FAILED",400);
   result=await read({...Object.fromEntries(url.searchParams),...(p.catalogId?{catalog_id:p.catalogId}:{}),...(p.brandId?{brand_id:p.brandId}:{}),...(p.productId?{product_id:p.productId}:{})},kind,correlationId);
  }
  return Response.json(result,{headers});
 }catch(error){const known=error instanceof AccessError?error:new AccessError("NETWORK_ERROR",503);return Response.json({code:known.code,message:known.code,correlationId},{headers,status:known.status});}
}
