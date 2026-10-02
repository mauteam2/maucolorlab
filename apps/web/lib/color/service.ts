import "server-only";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { verifiedClientContext } from "@/lib/clients/service";
import { createClient } from "@/lib/supabase/server";
import { AccessError } from "@/lib/tenant/bootstrap";
import { workspaceReference } from "@/lib/tenant/context";
import { evaluateConfidence } from "@/lib/confidence/engine";
import { evaluateRisk } from "@/lib/risk/engine";
import { evaluateColorPlanning } from "./engine";
import { colorCommand,colorErrorStatus,preparationResult,targetResult,planResult } from "./contracts";
export async function executeColorCommand(input:unknown,correlationId:string,expectedReference?:string|null) {
 const parsed=colorCommand.safeParse(input);if(!parsed.success)throw new AccessError("VALIDATION_FAILED",400);
 const command=parsed.data,write=!command.operation.startsWith("read_"),permission=write?"color_plan.create":"color_plan.read";
 const context=await verifiedClientContext(permission);
 if(!context.permissions.includes("clients.read")||!context.permissions.includes("hair_passport.read"))throw new AccessError("FORBIDDEN",403);
 if(write&&expectedReference!==workspaceReference(context))throw new AccessError("TENANT_CONTEXT_INVALID",403);
 const client=await createClient();
 const call=async<T extends z.ZodType>(rpc:string,operation:string,payload:unknown,schema:T):Promise<z.infer<T>>=>{
  const {data,error,status}=await client.rpc(rpc,{p_membership_id:context.membership_id,p_location_id:context.location_id,p_client_id:command.client_id,p_operation:operation,p_payload:payload,p_correlation_id:correlationId});
  if(error)throw new AccessError(status===401?"SESSION_EXPIRED":status===403?"FORBIDDEN":"NETWORK_ERROR",status===401?401:status===403?403:503);
  const result=schema.safeParse(data);if(!result.success||data?.correlationId!==correlationId)throw new AccessError("COLOR_INPUT_INVALID",503);
  if(data?.code)throw new AccessError(data.code,colorErrorStatus(data.code));return result.data;
 };
 let result;
 if(command.operation==="generate_plan") {
  const prepared=await call("color_plan_operation","prepare",command.payload,preparationResult);
  if("code" in prepared)throw new AccessError(prepared.code,colorErrorStatus(prepared.code));
  if(prepared.data.existing)result={data:prepared.data.existing,correlationId};
  else {
   const {target,snapshot,sourceToken}=prepared.data;
   if(target.clientId!==command.client_id||snapshot.pages.some(p=>p.passport.client_id!==command.client_id||p.passport.status!=="ACTIVE"||p.passport.client_status!=="ACTIVE"))throw new AccessError("COLOR_INPUT_INVALID",503);
   const secret=process.env.ELIFORA_COLOR_PLAN_SIGNING_KEY;
   if(!secret||!/^[a-f0-9]{64}$/.test(secret))throw new AccessError("COLOR_ENGINE_UNAVAILABLE",503);
   let planning;
   try {const confidence=evaluateConfidence(snapshot);planning=evaluateColorPlanning(snapshot,confidence,evaluateRisk(snapshot,confidence),target);}
   catch {throw new AccessError("COLOR_INPUT_INVALID",503);}
   const {data:auth,error:authError}=await client.auth.getUser();
   if(authError||!auth.user)throw new AccessError("SESSION_EXPIRED",401);
   const envelope=JSON.stringify({organizationId:context.organization_id,actorId:auth.user.id,membershipId:context.membership_id,locationId:context.location_id,
    clientId:command.client_id,targetId:target.id,requestId:command.payload.request_id,sourceToken,expiresAt:new Date(Date.now()+120000).toISOString(),result:planning});
   const signature=createHmac("sha256",Buffer.from(secret,"hex")).update(envelope).digest("hex");
   result=await call("color_plan_operation","store",{envelope,signature},planResult);
  }
 } else result=await call(command.operation.endsWith("target")?"color_target_operation":"color_plan_operation",
  command.operation==="create_target"?"create":command.operation==="revise_target"?"revise":"read",command.payload,command.operation.endsWith("target")?targetResult:planResult);
 if("code" in result)throw new AccessError(result.code,colorErrorStatus(result.code));
 if(result.data.clientId!==command.client_id)throw new AccessError("COLOR_INPUT_INVALID",503);
 const current=await verifiedClientContext(permission);
 if(!current.permissions.includes("clients.read")||!current.permissions.includes("hair_passport.read"))throw new AccessError("FORBIDDEN",403);
 if(workspaceReference(current)!==workspaceReference(context)||current.organization_id!==context.organization_id)throw new AccessError("TENANT_CONTEXT_INVALID",403);
 return result;
}
