import "server-only";
import { AccessError } from "@/lib/tenant/bootstrap";
import { createControlledRecipe, controlledOptionsService, readControlledRecipes } from "./controlled-service";
import { controlledCreateRequest, controlledOptionsRequest } from "./controlled-model";
export async function controlledResponse(request:Request,kind:"options"|"create"|"read",id:string|null=null,create=createControlledRecipe,options=controlledOptionsService,read=readControlledRecipes){
 const correlationId=crypto.randomUUID(),headers={"Cache-Control":"private, no-store","X-Correlation-ID":correlationId};
 try{
  const url=new URL(request.url);let data;
  if(kind==="read"){
   if(request.method!=="GET"||[...url.searchParams.keys()].some(k=>k!=="client_id")||url.searchParams.getAll("client_id").length!==1)throw new AccessError("VALIDATION_FAILED",400);
   data=await read(url.searchParams.get("client_id")??"",id,correlationId);
  }else{
   let same=false;try{const origin=new URL(request.headers.get("origin")??"");same=origin.protocol===url.protocol&&origin.host===(request.headers.get("host")??url.host);}catch{}
   if(!same)throw new AccessError("FORBIDDEN",403);
   if(request.method!=="POST"||url.search||request.headers.get("content-type")?.split(";",1)[0]?.trim().toLowerCase()!=="application/json")throw new AccessError("VALIDATION_FAILED",400);
   const reader=request.body?.getReader(),chunks:Uint8Array[]=[];let size=0;
   if(reader)try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();throw new AccessError("VALIDATION_FAILED",400);}chunks.push(value);}}finally{reader.releaseLock();}
   let raw:unknown;try{raw=JSON.parse(await new Blob(chunks as BlobPart[]).text());}catch{throw new AccessError("VALIDATION_FAILED",400);}
   const parsed=(kind==="create"?controlledCreateRequest:controlledOptionsRequest).safeParse(raw);
   if(!parsed.success)throw new AccessError("VALIDATION_FAILED",400);
   data=await (kind==="create"?create:options)(parsed.data,correlationId,request.headers.get("x-workspace-reference"));
  }
  return Response.json(data,{headers});
 }catch(error){const e=error instanceof AccessError?error:new AccessError("NETWORK_ERROR",503);return Response.json({code:e.code,message:e.code,correlationId},{status:e.status,headers});}
}
