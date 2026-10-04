import "server-only";
import { AccessError } from "@/lib/tenant/bootstrap";
import { mutateLiveSession,readLiveSessions,livePhoto } from "./service";
export function assertOrigin(request:Request){const url=new URL(request.url);let valid=false;try{const origin=new URL(request.headers.get("origin")??"");valid=origin.protocol===url.protocol&&origin.host===(request.headers.get("host")??url.host);}catch{}if(!valid)throw new AccessError("FORBIDDEN",403);}
export async function liveResponse(request:Request,id:string|null=null,photoId:string|null=null){
 const correlationId=crypto.randomUUID(),headers={"Cache-Control":"private, no-store","X-Correlation-ID":correlationId,"X-Server-Time":new Date().toISOString()};
 try{
  const url=new URL(request.url);if([...url.searchParams.keys()].some(k=>k!=="client_id")||url.searchParams.getAll("client_id").length>1)throw new AccessError("VALIDATION_FAILED",400);
  if(request.method!=="GET")assertOrigin(request);
  const clientId=url.searchParams.get("client_id"),reference=request.headers.get("x-workspace-reference");
  if(photoId&&id){if(!clientId)throw new AccessError("VALIDATION_FAILED",400);let blob=null;if(request.method==="POST"){const size=Number(request.headers.get("content-length"));if(!size||size>10*1024*1024)throw new AccessError("VALIDATION_FAILED",400);blob=await request.blob();}const photo=await livePhoto(id,photoId,clientId,blob,correlationId,reference);return photo?new Response(photo,{headers:{...headers,"Content-Type":photo.type,"X-Content-Type-Options":"nosniff"}}):Response.json({data:{uploaded:true},correlationId},{headers});}
  if(request.method==="GET"){if(!clientId)throw new AccessError("VALIDATION_FAILED",400);return Response.json(await readLiveSessions(clientId,id,correlationId),{headers});}
  if(request.method!=="POST"||request.headers.get("content-type")?.split(";",1)[0]?.trim()!=="application/json"||!id&&clientId)throw new AccessError("VALIDATION_FAILED",400);
  const reader=request.body?.getReader(),chunks:Uint8Array[]=[];let size=0;if(reader)try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){await reader.cancel();throw new AccessError("VALIDATION_FAILED",400);}chunks.push(value);}}finally{reader.releaseLock();}
  let raw;try{raw=JSON.parse(await new Blob(chunks as BlobPart[]).text());}catch{throw new AccessError("VALIDATION_FAILED",400);}
  return Response.json(await mutateLiveSession(raw,id,clientId,correlationId,reference),{headers});
 }catch(e){const error=e instanceof AccessError?e:new AccessError("NETWORK_ERROR",503);return Response.json({code:error.code,message:error.code,correlationId},{status:error.status,headers});}
}
