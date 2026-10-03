import "server-only";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { verifiedClientContext } from "@/lib/clients/service";
import { workspaceReference } from "@/lib/tenant/context";
import { AccessError } from "@/lib/tenant/bootstrap";
import { executeColorCommand } from "@/lib/color/service";
import { storedColorPlan } from "@/lib/color/contracts";
import { colorHash, evaluateColorPlanning } from "@/lib/color/engine";
import { confidenceInput, normalizeInput } from "@/lib/confidence/input";
import { evaluateConfidence } from "@/lib/confidence/engine";
import { evaluateRisk } from "@/lib/risk/engine";
import { readPilotCatalog } from "./governance-service";
import { controlledOptionsRequest, controlledCreateRequest, storedControlledRecipe, type ControlledCreate } from "./controlled-model";
import { controlledRecipeOptions, buildControlledRecipe } from "./controlled-engine";

const columns="id,series_id,version,supersedes_id,client_id,plan_id,catalog_id,created_at,created_by,product_id,developer_id,color_grams,payload";
type Row={id:string;series_id:string;version:number;supersedes_id:string|null;client_id:string;plan_id:string;catalog_id:string;created_at:string;created_by:string;product_id:string;developer_id:string;color_grams:number;payload:unknown};
function output(row:Row){return storedControlledRecipe.parse({id:row.id,seriesId:row.series_id,version:row.version,supersedesId:row.supersedes_id,clientId:row.client_id,planId:row.plan_id,catalogId:row.catalog_id,createdAt:row.created_at,createdBy:row.created_by,result:row.payload});}
async function access(write=false,reference?:string|null){
 const ctx=await verifiedClientContext(write?"color_plan.create":"color_plan.read");
 if(!["color_plan.read","clients.read","hair_passport.read"].every(p=>ctx.permissions.includes(p))||reference!==undefined&&reference!==workspaceReference(ctx))throw new AccessError("TENANT_CONTEXT_INVALID",403);
 return ctx;
}
async function finalAccess(ctx:Awaited<ReturnType<typeof access>>,write=false){const current=await access(write);if(workspaceReference(current)!==workspaceReference(ctx))throw new AccessError("TENANT_CONTEXT_INVALID",403);}
async function prepare(q:z.infer<typeof controlledOptionsRequest>,correlationId:string){
 const stored=storedColorPlan.parse((await executeColorCommand({operation:"read_plan",client_id:q.client_id,payload:{plan_id:q.plan_id,include_archived:false}},correlationId)).data);
 const client=await createClient(),ctx=await access();
 const {data,error}=await client.rpc("brand_adapter_snapshot",{p_membership_id:ctx.membership_id,p_location_id:ctx.location_id,p_client_id:q.client_id,p_correlation_id:correlationId});
 if(error)throw new AccessError("NETWORK_ERROR",503);if(data?.code)throw new AccessError(data.code,data.code.endsWith("NOT_FOUND")?404:403);
 const snapshot=z.strictObject({data:confidenceInput,sourceToken:z.string().regex(/^[a-f0-9]{64}$/),correlationId:z.uuid()}).safeParse(data);
 if(!snapshot.success||snapshot.data.correlationId!==correlationId)throw new AccessError("CONFIDENCE_INPUT_INVALID",503);
 const plan=stored.result;
 if(colorHash(normalizeInput({...snapshot.data.data,evaluatedAt:plan.evaluatedAt}))!==plan.metadata.hairFingerprint)throw new AccessError("COLOR_PLAN_SOURCE_CONFLICT",409);
 const confidence=evaluateConfidence(snapshot.data.data),risk=evaluateRisk(snapshot.data.data,confidence);
 const fresh=plan.recipeDraft?evaluateColorPlanning(snapshot.data.data,confidence,risk,plan.recipeDraft.target):plan;
 return {stored,fresh,snapshot:snapshot.data,packet:await readPilotCatalog(q.catalog_id)};
}
export async function controlledOptionsService(raw:unknown,correlationId:string,reference:string|null){
 const parsed=controlledOptionsRequest.safeParse(raw);if(!parsed.success)throw new AccessError("VALIDATION_FAILED",400);
 const ctx=await access(false,reference),p=await prepare(parsed.data,correlationId);
 const data=controlledRecipeOptions(p.fresh,p.packet,p.snapshot.data);await finalAccess(ctx);return {data,correlationId};
}
export async function createControlledRecipe(raw:unknown,correlationId:string,reference:string|null){
 const parsed=controlledCreateRequest.safeParse(raw);if(!parsed.success)throw new AccessError("VALIDATION_FAILED",400);
 const q=parsed.data,ctx=await access(true,reference),client=await createClient();
 const {data:auth,error:authError}=await client.auth.getUser();if(authError||!auth.user)throw new AccessError("SESSION_EXPIRED",401);
 const previous=await client.from("controlled_brand_recipes").select(columns).eq("organization_id",ctx.organization_id).eq("created_by",auth.user.id).eq("request_id",q.request_id).maybeSingle();
 if(previous.error)throw new AccessError("NETWORK_ERROR",503);
 if(previous.data){const row=previous.data as Row;if(!sameInput(row,q))throw new AccessError("CONTROLLED_RECIPE_VERSION_CONFLICT",409);await finalAccess(ctx,true);return {data:output(row),correlationId};}
 const p=await prepare(q,correlationId);let result;
 try{if(!p.stored.result.recipeDraft)throw new Error();result=buildControlledRecipe(p.fresh,p.packet,p.snapshot.data,q,p.stored.result.recipeDraft.id);}catch{throw new AccessError("CONTROLLED_RECIPE_CONTEXT_INVALID",409);}
 const secret=process.env.ELIFORA_COLOR_PLAN_SIGNING_KEY;if(!secret||!/^[a-f0-9]{64}$/.test(secret))throw new AccessError("COLOR_ENGINE_UNAVAILABLE",503);
 const envelope=JSON.stringify({organizationId:ctx.organization_id,actorId:auth.user.id,membershipId:ctx.membership_id,locationId:ctx.location_id,input:q,
  sourceToken:p.snapshot.sourceToken,expiresAt:new Date(Date.now()+120000).toISOString(),result});
 const signature=createHmac("sha256",Buffer.from(secret,"hex")).update(envelope).digest("hex");
 const stored=await client.rpc("controlled_recipe_store",{p_membership_id:ctx.membership_id,p_location_id:ctx.location_id,p_envelope:envelope,p_signature:signature,p_correlation_id:correlationId});
 if(stored.error)throw new AccessError("NETWORK_ERROR",503);if(stored.data?.code)throw new AccessError(stored.data.code,stored.data.code.endsWith("CONFLICT")||stored.data.code==="CONTROLLED_RECIPE_CONTEXT_INVALID"?409:400);
 const value=storedControlledRecipe.safeParse(stored.data);
 if(!value.success||value.data.clientId!==q.client_id||value.data.planId!==q.plan_id||value.data.catalogId!==q.catalog_id||value.data.supersedesId!==q.supersedes_id||
  colorHash(value.data.result)!==colorHash(result))throw new AccessError("BRAND_RESULT_INVALID",503);
 await finalAccess(ctx,true);return {data:value.data,correlationId};
}
function sameInput(row:Row,q:ControlledCreate){return row.client_id===q.client_id&&row.plan_id===q.plan_id&&row.catalog_id===q.catalog_id&&row.product_id===q.product_id&&row.developer_id===q.developer_id&&Number(row.color_grams)===q.color_grams&&row.supersedes_id===q.supersedes_id;}
export async function readControlledRecipes(clientId:string,recipeId:string|null,correlationId:string){
 if(!z.uuid().safeParse(clientId).success||recipeId!==null&&!z.uuid().safeParse(recipeId).success)throw new AccessError("VALIDATION_FAILED",400);
 const ctx=await access(),client=await createClient();let query=client.from("controlled_brand_recipes").select(columns).eq("organization_id",ctx.organization_id).eq("client_id",clientId.toLowerCase());
 if(recipeId)query=query.eq("id",recipeId.toLowerCase());
 const rows=await query.order("created_at",{ascending:false}).limit(recipeId?1:25);if(rows.error)throw new AccessError("NETWORK_ERROR",503);
 if(recipeId&&!rows.data?.length)throw new AccessError("BRAND_RECIPE_NOT_FOUND",404);
 const data=(rows.data??[]).map(row=>output(row as Row));await finalAccess(ctx);return {data:recipeId?data[0]:data,correlationId};
}
