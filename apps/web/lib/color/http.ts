import "server-only";
import { AccessError } from "@/lib/tenant/bootstrap";
import { executeColorCommand } from "./service";
import type { ColorOperation } from "./contracts";
type Params=Promise<{clientId:string;targetId?:string;planId?:string}>;
export async function colorResponse(request:Request,params:Params,operation:ColorOperation,execute=executeColorCommand) {
 const correlationId=crypto.randomUUID(),headers={"Cache-Control":"private, no-store","X-Correlation-ID":correlationId};
 try {
  const url=new URL(request.url),write=!operation.startsWith("read_");let payload:unknown;
  if(write) {
   let same=false;try{const origin=new URL(request.headers.get("origin")??"");same=origin.protocol===url.protocol&&origin.host===(request.headers.get("host")??url.host);}catch{}
   if(!same)throw new AccessError("FORBIDDEN",403);
   if(url.search||request.headers.get("content-type")?.split(";",1)[0]?.trim().toLowerCase()!=="application/json")throw new AccessError("VALIDATION_FAILED",400);
   const reader=request.body?.getReader(),chunks:Uint8Array[]=[];let size=0;
   if(reader)try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>131072){await reader.cancel();throw new AccessError("VALIDATION_FAILED",400);}chunks.push(value);}}finally{reader.releaseLock();}
   try{payload=JSON.parse(await new Blob(chunks as BlobPart[]).text());}catch{throw new AccessError("VALIDATION_FAILED",400);}
  } else {
   if([...url.searchParams.keys()].some(k=>k!=="include_archived")||url.searchParams.getAll("include_archived").length>1||
    url.searchParams.has("include_archived")&&!['true','false'].includes(url.searchParams.get("include_archived")!))throw new AccessError("VALIDATION_FAILED",400);
   const p=await params;payload={include_archived:url.searchParams.get("include_archived")==="true",...(operation==="read_target"?{target_id:p.targetId}:{plan_id:p.planId})};
  }
  const {clientId}=await params;const result=await execute({operation,client_id:clientId,payload},correlationId,request.headers.get("x-workspace-reference"));
  return Response.json(result,{headers});
 } catch(error) {const known=error instanceof AccessError?error:new AccessError("NETWORK_ERROR",503);return Response.json({code:known.code,message:known.code,correlationId},{headers,status:known.status});}
}
