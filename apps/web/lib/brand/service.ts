import "server-only";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { verifiedClientContext } from "@/lib/clients/service";
import { createClient } from "@/lib/supabase/server";
import { AccessError } from "@/lib/tenant/bootstrap";
import { workspaceReference } from "@/lib/tenant/context";
import { executeColorCommand } from "@/lib/color/service";
import { storedColorPlan } from "@/lib/color/contracts";
import { colorHash, evaluateColorPlanning } from "@/lib/color/engine";
import { normalizeInput, confidenceInput } from "@/lib/confidence/input";
import { evaluateConfidence } from "@/lib/confidence/engine";
import { evaluateRisk } from "@/lib/risk/engine";
import { evaluateBrandAdapter } from "./engine";
import { evaluateRequest, catalogQuery, catalogPacket, adapterEvaluation } from "./model";

export const storedBrandRecipe=z.strictObject({id:z.uuid(),clientId:z.uuid(),planId:z.uuid(),catalogId:z.uuid(),createdAt:z.iso.datetime({offset:true}),result:adapterEvaluation});
const snapshotPacket=z.strictObject({data:confidenceInput,sourceToken:z.string().regex(/^[a-f0-9]{64}$/),correlationId:z.uuid()});
export async function readBrandCatalog(raw:unknown,kind:"catalog"|"brands"|"brand"|"products"|"product"|"compatibility",correlationId:string) {
 const q=catalogQuery.safeParse(raw);if(!q.success)throw new AccessError("VALIDATION_FAILED",400);
 const ctx=await verifiedClientContext("color_plan.read"),client=await createClient();
 const {data,error}=await client.rpc("brand_catalog_packet",{p_catalog_id:q.data.catalog_id});
 if(error)throw new AccessError("NETWORK_ERROR",503);if(!data)throw new AccessError("BRAND_CATALOG_NOT_FOUND",404);
 const packet=catalogPacket.safeParse(data);if(!packet.success)throw new AccessError("BRAND_CATALOG_INVALID",503);
 const c=packet.data;if(c.release.scope==="ORGANIZATION"&&c.release.organizationId!==ctx.organization_id)throw new AccessError("BRAND_CATALOG_NOT_FOUND",404);
 const current=await verifiedClientContext("color_plan.read");if(workspaceReference(current)!==workspaceReference(ctx))throw new AccessError("TENANT_CONTEXT_INVALID",403);
 if(kind==="catalog")return {data:c.release,correlationId};
 let items:Array<typeof c.brands[number]|typeof c.compatibility[number]|typeof c.products[number]>=kind==="brands"||kind==="brand"?c.brands:kind==="compatibility"?c.compatibility:c.products;
 if(q.data.brand_id)items=items.filter(p=>"brandId" in p?p.brandId===q.data.brand_id:p.id===q.data.brand_id);
 if(q.data.product_id)items=items.filter(p=>"productId" in p?p.productId===q.data.product_id:p.id===q.data.product_id);
 if(kind==="brand"||kind==="product") {if(items.length!==1)throw new AccessError("BRAND_CATALOG_NOT_FOUND",404);return {data:items[0],correlationId};}
 return {data:items.slice(q.data.offset,q.data.offset+q.data.limit),pagination:{offset:q.data.offset,limit:q.data.limit,total:items.length},correlationId};
}
export async function evaluateBrandRequest(raw:unknown,correlationId:string,expectedReference?:string|null) {
 const parsed=evaluateRequest.safeParse(raw);if(!parsed.success)throw new AccessError("VALIDATION_FAILED",400);const q=parsed.data;
 const ctx=await verifiedClientContext("color_plan.create");
 if(expectedReference!==workspaceReference(ctx)||!["color_plan.read","clients.read","hair_passport.read"].every(p=>ctx.permissions.includes(p)))throw new AccessError("TENANT_CONTEXT_INVALID",403);
 if(q.allow_salon_verified&&!ctx.permissions.includes("brand_catalog.manage"))throw new AccessError("FORBIDDEN",403);
 const client=await createClient();
 const {data:auth,error:authError}=await client.auth.getUser();if(authError||!auth.user)throw new AccessError("SESSION_EXPIRED",401);
 const {data:existing,error:lookupError}=await client.from("brand_recipe_drafts").select("id,client_id,plan_id,catalog_id,created_at,payload,created_by,allow_salon_verified").eq("request_id",q.request_id).eq("organization_id",ctx.organization_id).eq("created_by",auth.user.id).limit(1);
 if(lookupError)throw new AccessError("NETWORK_ERROR",503);
 const previous=existing?.find(r=>r.created_by===auth.user.id);
 if(previous){if(previous.client_id!==q.client_id||previous.plan_id!==q.plan_id||previous.catalog_id!==q.catalog_id||previous.allow_salon_verified!==q.allow_salon_verified)throw new AccessError("COLOR_PLAN_VERSION_CONFLICT",409);await finalAccess();return {data:storedBrandRecipe.parse({id:previous.id,clientId:previous.client_id,planId:previous.plan_id,catalogId:previous.catalog_id,createdAt:previous.created_at,result:previous.payload}),correlationId};}
 const stored=await executeColorCommand({operation:"read_plan",client_id:q.client_id,payload:{plan_id:q.plan_id,include_archived:false}},correlationId);
 const {data:rawCatalog,error:catalogError}=await client.rpc("brand_catalog_packet",{p_catalog_id:q.catalog_id});
 if(catalogError)throw new AccessError("NETWORK_ERROR",503);if(!rawCatalog)throw new AccessError("BRAND_CATALOG_NOT_FOUND",404);
 const catalog=catalogPacket.safeParse(rawCatalog);if(!catalog.success)throw new AccessError("BRAND_CATALOG_INVALID",503);
 if(catalog.data.release.scope==="ORGANIZATION"&&catalog.data.release.organizationId!==ctx.organization_id)throw new AccessError("BRAND_CATALOG_NOT_FOUND",404);
 if(catalog.data.release.state!=="PUBLISHED")throw new AccessError("CATALOG_STATE_CONFLICT",409);
 const {data:rawSnapshot,error:snapshotError}=await client.rpc("brand_adapter_snapshot",{p_membership_id:ctx.membership_id,p_location_id:ctx.location_id,p_client_id:q.client_id,p_correlation_id:correlationId});
 if(snapshotError)throw new AccessError("NETWORK_ERROR",503);if(rawSnapshot?.code)throw new AccessError(rawSnapshot.code,rawSnapshot.code.endsWith("NOT_FOUND")?404:403);
 const packet=snapshotPacket.safeParse(rawSnapshot);if(!packet.success||packet.data.correlationId!==correlationId)throw new AccessError("CONFIDENCE_INPUT_INVALID",503);
 const plan=storedColorPlan.parse(stored.data).result;
 if(colorHash(normalizeInput({...packet.data.data,evaluatedAt:plan.evaluatedAt}))!==plan.metadata.hairFingerprint)throw new AccessError("COLOR_PLAN_SOURCE_CONFLICT",409);
 let result;
 if(plan.recipeDraft){
  const freshConfidence=evaluateConfidence(packet.data.data),freshRisk=evaluateRisk(packet.data.data,freshConfidence);
  const freshPlan=evaluateColorPlanning(packet.data.data,freshConfidence,freshRisk,plan.recipeDraft.target);
  result=evaluateBrandAdapter(freshPlan,catalog.data,ctx.organization_id,q.allow_salon_verified);
  if(result.recipe)result=adapterEvaluation.parse({...result,recipe:{...result.recipe,parentRecipeId:plan.recipeDraft.id}});
 }else result=evaluateBrandAdapter(plan,catalog.data,ctx.organization_id,q.allow_salon_verified);
 const secret=process.env.ELIFORA_COLOR_PLAN_SIGNING_KEY;if(!secret||!/^[a-f0-9]{64}$/.test(secret))throw new AccessError("COLOR_ENGINE_UNAVAILABLE",503);
 const envelope=JSON.stringify({organizationId:ctx.organization_id,actorId:auth.user.id,membershipId:ctx.membership_id,locationId:ctx.location_id,clientId:q.client_id,planId:q.plan_id,catalogId:q.catalog_id,requestId:q.request_id,sourceToken:packet.data.sourceToken,expiresAt:new Date(Date.now()+120000).toISOString(),catalogFingerprint:catalog.data.release.versionFingerprint,allowSalonVerified:q.allow_salon_verified,result});
 const signature=createHmac("sha256",Buffer.from(secret,"hex")).update(envelope).digest("hex");
 const {data,error}=await client.rpc("brand_recipe_store",{p_membership_id:ctx.membership_id,p_location_id:ctx.location_id,p_envelope:envelope,p_signature:signature,p_correlation_id:correlationId});
 if(error)throw new AccessError("NETWORK_ERROR",503);if(data?.code)throw new AccessError(data.code,data.code.endsWith("CONFLICT")?409:400);
 const output=storedBrandRecipe.safeParse(data);if(!output.success||output.data.clientId!==q.client_id||output.data.planId!==q.plan_id||output.data.catalogId!==q.catalog_id)throw new AccessError("BRAND_RESULT_INVALID",503);
 await finalAccess();return {data:output.data,correlationId};
 async function finalAccess(){const current=await verifiedClientContext("color_plan.create");if(workspaceReference(current)!==workspaceReference(ctx)||!["clients.read","hair_passport.read","color_plan.read"].every(p=>current.permissions.includes(p))||q.allow_salon_verified&&!current.permissions.includes("brand_catalog.manage"))throw new AccessError("TENANT_CONTEXT_INVALID",403);}
}
