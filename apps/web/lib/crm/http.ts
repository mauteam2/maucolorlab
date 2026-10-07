import "server-only";
import { AccessError } from "@/lib/tenant/bootstrap";
import { assertOrigin } from "@/lib/live/http";
import { readCrm,mutateCrm,interpretCrm,manualContact } from "./service";
import { crmError } from "./model";
export async function crmResponse(request:Request,endpoint:"read"|"write"|"interpret"|"contact"){
 const correlationId=crypto.randomUUID(),headers={"Cache-Control":"private, no-store","X-Correlation-ID":correlationId};
 try{assertOrigin(request);if(request.method!=="POST"||new URL(request.url).search||request.headers.get("content-type")?.split(";",1)[0]?.trim()!=="application/json")throw new AccessError("VALIDATION_FAILED",400);const reader=request.body?.getReader(),chunks:Uint8Array[]= [];let size=0;if(reader)try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>32768){await reader.cancel();throw new AccessError("VALIDATION_FAILED",400);}chunks.push(value);}}finally{reader.releaseLock();}let raw;try{raw=JSON.parse(await new Blob(chunks as BlobPart[]).text());}catch{throw new AccessError("VALIDATION_FAILED",400);}const ref=request.headers.get("x-workspace-reference"),result=await ({read:readCrm,write:mutateCrm,interpret:interpretCrm,contact:manualContact}[endpoint])(raw,correlationId,ref);return Response.json(result,{headers});}catch(e){const err=e instanceof AccessError&&crmError.shape.code.options.some(c=>c===e.code)?e:new AccessError("NETWORK_ERROR",503);return Response.json({code:err.code,message:err.code,correlationId},{status:err.status,headers});}
}
