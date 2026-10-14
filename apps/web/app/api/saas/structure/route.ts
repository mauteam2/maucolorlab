import { AccessError } from "@/lib/tenant/bootstrap";
import { verifiedClientContext } from "@/lib/clients/service";
import { createClient } from "@/lib/supabase/server";
import { workspaceReference } from "@/lib/tenant/context";
import { assertOrigin } from "@/lib/live/http";
import { saasStructureCommand, saasOperationResult } from "@/lib/saas/model";
import { throwSaasError } from "@/lib/saas/errors";
export async function POST(request: Request) {
  const correlationId = crypto.randomUUID(), headers = { "Cache-Control": "private, no-store", "X-Correlation-ID": correlationId };
  try {
    assertOrigin(request);
    if (new URL(request.url).search || request.headers.get("content-type")?.split(";",1)[0] !== "application/json") throw new AccessError("VALIDATION_FAILED",400);
    const reader=request.body?.getReader(),chunks:Uint8Array[]=[];let size=0;
    if(reader)try{for(;;){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();throw new AccessError("VALIDATION_FAILED",400);}chunks.push(value);}}finally{reader.releaseLock();}
    let raw;try{raw=JSON.parse(await new Blob(chunks as BlobPart[]).text());}catch{throw new AccessError("VALIDATION_FAILED",400);}
    const parsed=saasStructureCommand.safeParse(raw);if(!parsed.success)throw new AccessError("VALIDATION_FAILED",400);
    const permission=parsed.data.type==="CREATE_MEMBER"?"memberships.manage":"location.manage",ctx=await verifiedClientContext(permission);
    if(ctx.role!=="owner"||request.headers.get("x-workspace-reference")!==workspaceReference(ctx))throw new AccessError("FORBIDDEN",403);
    const client=await createClient(),reply=await client.rpc("saas_structure_operation",{p_membership_id:ctx.membership_id,p_location_id:ctx.location_id,p_command:parsed.data,p_correlation_id:correlationId});
    throwSaasError(reply.error);if(reply.error)throw new AccessError("NETWORK_ERROR",503);
    if(reply.data?.code)throw new AccessError(reply.data.code,reply.data.code==="FORBIDDEN"?403:reply.data.code==="VALIDATION_FAILED"?400:409);
    const result=saasOperationResult.safeParse(reply.data);if(!result.success||result.data.correlationId!==correlationId||result.data.data.id!==parsed.data.id)throw new AccessError("NETWORK_ERROR",503);
    const current=await verifiedClientContext(permission);if(workspaceReference(current)!==workspaceReference(ctx)||current.organization_id!==ctx.organization_id||current.role!==ctx.role)throw new AccessError("TENANT_CONTEXT_INVALID",403);
    return Response.json({...result.data,context:current},{headers});
  }catch(e){const failure=e instanceof AccessError?e:new AccessError("NETWORK_ERROR",503);return Response.json({code:failure.code,correlationId},{status:failure.status,headers});}
}
