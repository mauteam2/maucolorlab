import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { verifiedClientContext } from "@/lib/clients/service";
import { AccessError } from "@/lib/tenant/bootstrap";
import { workspaceReference } from "@/lib/tenant/context";
import { governanceRequest,pilotPacket,pilotRequest,sourceDocument } from "./pilot-model";
import { evaluatePilotCandidates } from "./pilot";
import { executeColorCommand } from "@/lib/color/service";
import { storedColorPlan } from "@/lib/color/contracts";
import { normalizeInput,confidenceInput } from "@/lib/confidence/input";
import { evaluateConfidence } from "@/lib/confidence/engine";
import { evaluateRisk } from "@/lib/risk/engine";
import { colorHash,evaluateColorPlanning } from "@/lib/color/engine";
async function session(){const client=await createClient();const {data,error}=await client.auth.getUser();if(error||!data.user)throw new AccessError("UNAUTHENTICATED",401);return client;}

export async function catalogOperator(){
 const client=await createClient(),{data,error}=await client.auth.getUser();if(error||!data.user)throw new AccessError("UNAUTHENTICATED",401);
 const result=await client.rpc("catalog_operator_access");if(result.error)throw new AccessError("NETWORK_ERROR",503);if(result.data!==true)throw new AccessError("FORBIDDEN",403);return client;
}
export async function catalogGovernance(catalogId:string|null,raw:unknown,correlationId:string){
 const parsed=governanceRequest.safeParse(raw);if(!parsed.success||catalogId&&!z.uuid().safeParse(catalogId).success)throw new AccessError("VALIDATION_FAILED",400);
 const r=parsed.data;if((r.operation==="IMPORT")!==(catalogId===null))throw new AccessError("VALIDATION_FAILED",400);
 const client=await catalogOperator();const {data,error}=await client.rpc("catalog_governance",{p_operation:r.operation,p_catalog_id:catalogId?.toLowerCase()??null,p_note:r.note,p_correlation_id:correlationId,p_previous_id:r.previous_id??null});
 if(error)throw new AccessError(error.code==="42501"?"FORBIDDEN":error.code==="23514"||error.code==="23505"?"CATALOG_STATE_CONFLICT":"NETWORK_ERROR",error.code==="42501"?403:error.code==="23514"||error.code==="23505"?409:503);
 await catalogOperator();return {data:z.object({catalogId:z.uuid(),goldenRunId:z.uuid().nullable().optional()}).parse(data),correlationId};
}
export async function readPilotCatalog(id:string){
 if(!z.uuid().safeParse(id).success)throw new AccessError("VALIDATION_FAILED",400);
 const client=await session(),{data,error}=await client.rpc("catalog_pilot_packet",{p_catalog_id:id.toLowerCase()});if(error)throw new AccessError("NETWORK_ERROR",503);if(!data)throw new AccessError("BRAND_CATALOG_NOT_FOUND",404);return pilotPacket.parse(data);
}
export async function readCatalogSource(id:string,correlationId:string){
 if(!z.uuid().safeParse(id).success)throw new AccessError("VALIDATION_FAILED",400);
 const client=await session(),{data,error}=await client.from("catalog_sources").select("*").eq("id",id.toLowerCase()).maybeSingle();if(error)throw new AccessError("NETWORK_ERROR",503);if(!data)throw new AccessError("BRAND_CATALOG_NOT_FOUND",404);return {data:sourceDocument.parse(data),correlationId};
}
export async function listInternalCatalogs(){const client=await catalogOperator();const {data,error}=await client.from("brand_catalog_releases").select("id,version,state,created_by,reviewed_by,approved_by,published_by,pilot_key").not("pilot_key","is",null).order("version",{ascending:false}).limit(50);if(error)throw new AccessError("NETWORK_ERROR",503);return data??[];}
export async function readBrandVersions(id:string,correlationId:string){
 if(!z.uuid().safeParse(id).success)throw new AccessError("VALIDATION_FAILED",400);const client=await session();const {data,error}=await client.from("catalog_brands").select("display_name").eq("id",id.toLowerCase()).maybeSingle();if(error)throw new AccessError("NETWORK_ERROR",503);if(!data)throw new AccessError("BRAND_CATALOG_NOT_FOUND",404);
 const rows=await client.from("catalog_brands").select("id,catalog_id,display_name,brand_catalog_releases!inner(id,version,state)").eq("display_name",data.display_name).order("catalog_id").limit(50);if(rows.error)throw new AccessError("NETWORK_ERROR",503);return {data:rows.data,correlationId};
}
export async function evaluatePilotRequest(raw:unknown,correlationId:string,reference:string|null){
 const q=pilotRequest.safeParse(raw);if(!q.success)throw new AccessError("VALIDATION_FAILED",400);
 const ctx=await verifiedClientContext("color_plan.read");if(reference!==workspaceReference(ctx)||!["clients.read","hair_passport.read"].every(p=>ctx.permissions.includes(p)))throw new AccessError("TENANT_CONTEXT_INVALID",403);
 const stored=await executeColorCommand({operation:"read_plan",client_id:q.data.client_id,payload:{plan_id:q.data.plan_id,include_archived:false}},correlationId),plan=storedColorPlan.parse(stored.data).result;
 const client=await createClient(),{data,error}=await client.rpc("brand_adapter_snapshot",{p_membership_id:ctx.membership_id,p_location_id:ctx.location_id,p_client_id:q.data.client_id,p_correlation_id:correlationId});
 if(error)throw new AccessError("NETWORK_ERROR",503);if(data?.code)throw new AccessError(data.code,403);
 const snapshot=z.strictObject({data:confidenceInput,sourceToken:z.string().regex(/^[a-f0-9]{64}$/),correlationId:z.uuid()}).parse(data);
 if(snapshot.correlationId!==correlationId||colorHash(normalizeInput({...snapshot.data,evaluatedAt:plan.evaluatedAt}))!==plan.metadata.hairFingerprint)throw new AccessError("COLOR_PLAN_SOURCE_CONFLICT",409);
 const confidence=evaluateConfidence(snapshot.data),risk=evaluateRisk(snapshot.data,confidence),fresh=plan.recipeDraft?evaluateColorPlanning(snapshot.data,confidence,risk,plan.recipeDraft.target):plan;
 const result=evaluatePilotCandidates(fresh,await readPilotCatalog(q.data.catalog_id));
 const current=await verifiedClientContext("color_plan.read");if(workspaceReference(current)!==workspaceReference(ctx)||!["clients.read","hair_passport.read"].every(p=>current.permissions.includes(p)))throw new AccessError("TENANT_CONTEXT_INVALID",403);
 return {data:result,correlationId};
}
