import { AccessError } from "@/lib/tenant/bootstrap";
import { verifiedClientContext } from "@/lib/clients/service";
import { workspaceReference } from "@/lib/tenant/context";
import { databaseReleaseStatus, releaseFingerprint } from "@/lib/pilot/release";
export async function GET(request: Request) {
 const correlationId=crypto.randomUUID(),headers={"Cache-Control":"private, no-store","X-Correlation-ID":correlationId};
 try {
  if(new URL(request.url).search) throw new AccessError("VALIDATION_FAILED",400);
  const ctx=await verifiedClientContext("salon.read");
  if(ctx.role!=="owner") throw new AccessError("FORBIDDEN",403);
  const database=await databaseReleaseStatus();
  const current=await verifiedClientContext("salon.read");
  if(current.role!=="owner"||workspaceReference(ctx)!==workspaceReference(current)||ctx.organization_id!==current.organization_id) throw new AccessError("TENANT_CONTEXT_INVALID",403);
  return Response.json({data:{release:{...releaseFingerprint,publishedCatalogs:database.catalogs},database,scope:"CONFIGURATION_ONLY",hostedEmailVerified:false,backupVerified:false},correlationId},{headers});
 } catch(e) {
  const failure=e instanceof AccessError?e:new AccessError("RELEASE_NOT_READY",503);
  return Response.json({code:failure.code,correlationId},{status:failure.status,headers});
 }
}
