import "server-only";
import { AccessError } from "@/lib/tenant/bootstrap";
import { governanceRequest,pilotRequest } from "./pilot-model";
import { catalogGovernance,evaluatePilotRequest,readCatalogSource,readBrandVersions,readPilotCatalog } from "./governance-service";
export async function governanceResponse(request:Request,kind:"governance"|"import"|"source"|"versions"|"pilot"|"packet",id:string|null=null,command=catalogGovernance,evaluate=evaluatePilotRequest){
 const correlationId=crypto.randomUUID(),headers={"Cache-Control":"private, no-store","X-Correlation-ID":correlationId};
 try{
  const url=new URL(request.url);if(url.search)throw new AccessError("VALIDATION_FAILED",400);let output;
  if(kind==="source")output=await readCatalogSource(id??"",correlationId);
  else if(kind==="packet")output={data:await readPilotCatalog(id??""),correlationId};
  else if(kind==="versions")output=await readBrandVersions(id??"",correlationId);
  else{
   if(request.method!=="POST")throw new AccessError("VALIDATION_FAILED",405);
   if(request.headers.get("origin")!==url.origin)throw new AccessError("FORBIDDEN",403);
   if(request.headers.get("content-type")?.split(";",1)[0]?.trim().toLowerCase()!=="application/json")throw new AccessError("VALIDATION_FAILED",400);
   const reader=request.body?.getReader();let size=0;const chunks:Uint8Array[]=[];
   if(reader)try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();throw new AccessError("VALIDATION_FAILED",400);}chunks.push(value);}}finally{reader.releaseLock();}
   let raw:unknown;try{raw=JSON.parse(await new Blob(chunks as BlobPart[]).text());}catch{throw new AccessError("VALIDATION_FAILED",400);}
   const r=(kind==="pilot"?pilotRequest:governanceRequest).safeParse(raw);if(!r.success)throw new AccessError("VALIDATION_FAILED",400);
   output=kind==="pilot"?await evaluate(r.data,correlationId,request.headers.get("x-workspace-reference")):await command(kind==="import"?null:id,r.data,correlationId);
  }
  return Response.json(output,{headers});
 }catch(error){const e=error instanceof AccessError?error:new AccessError("NETWORK_ERROR",503);return Response.json({code:e.code,message:e.code,correlationId},{status:e.status,headers});}
}
