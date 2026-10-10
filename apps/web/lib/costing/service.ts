import "server-only";
import {createClient} from "@/lib/supabase/server";
import {verifiedClientContext} from "@/lib/clients/service";
import {workspaceReference} from "@/lib/tenant/context";
import {AccessError} from "@/lib/tenant/bootstrap";
import {costingCommand,costingReadRequest,costingResult,costingSnapshot,costingPermission,costingReadPermission} from "./model";
export function costingStatus(code:string){return ["UNAUTHENTICATED","SESSION_EXPIRED"].includes(code)?401:["FORBIDDEN","MEMBERSHIP_REQUIRED","MEMBERSHIP_REVOKED","TENANT_CONTEXT_INVALID"].includes(code)?403:code==="VALIDATION_FAILED"?400:code.endsWith("NOT_FOUND")?404:code==="NETWORK_ERROR"?503:409;}
export async function executeCosting(raw:unknown,correlationId:string,reference?:string|null){
 const write=reference!==undefined,p=write?costingCommand.safeParse(raw):costingReadRequest.safeParse(raw);if(!p.success)throw new AccessError("VALIDATION_FAILED",400);
 const q=p.data,permission=write?costingPermission((q as {type:Parameters<typeof costingPermission>[0]}).type):costingReadPermission((q as {kind?:string}).kind),context=await verifiedClientContext(permission);
 if(write&&reference!==workspaceReference(context))throw new AccessError("TENANT_CONTEXT_INVALID",403);
 const client=await createClient(),reply=await client.rpc(write?"costing_operation":"costing_snapshot",{p_membership_id:context.membership_id,p_location_id:context.location_id,...(write?{p_command:q,p_correlation_id:correlationId}:{p_request:q})});
 if(reply.error)throw new AccessError("NETWORK_ERROR",503);
 const envelope=reply.data as {code?:string;data?:unknown}|null;if(envelope?.code)throw new AccessError(envelope.code,costingStatus(envelope.code));
 const parsed=write?costingResult.safeParse(envelope?.data):costingSnapshot.safeParse(envelope?.data);if(!parsed.success)throw new AccessError("NETWORK_ERROR",503);
 const fresh=await verifiedClientContext(permission);if(workspaceReference(fresh)!==workspaceReference(context)||fresh.organization_id!==context.organization_id||JSON.stringify([...fresh.permissions].sort())!==JSON.stringify([...context.permissions].sort()))throw new AccessError("TENANT_CONTEXT_INVALID",403);
 if(!write){const data=costingSnapshot.parse(parsed.data),rows=[...data.items,...data.policies,...data.assignments,...data.cost_basis,...data.assignment_endings];if(data.organization_id!==context.organization_id||data.location_id!==context.location_id||rows.some(r=>r.organization_id!==context.organization_id||r.location_id!==context.location_id))throw new AccessError("NETWORK_ERROR",503);
  const request=costingReadRequest.parse(q);if(request.kind==="COMMISSION_SELF"){
   const {data:auth,error}=await client.auth.getUser();if(error||!auth.user||data.items.some(r=>!("staff_user_id" in r)||r.staff_user_id!==auth.user.id))throw new AccessError("NETWORK_ERROR",503);
  }
  if(request.charge_id&&data.items.some(r=>!("charge_id" in r)||r.charge_id!==request.charge_id))throw new AccessError("NETWORK_ERROR",503);
  return {data,context:fresh,correlationId};
 }
 return {data:parsed.data,context:fresh,correlationId};
}
