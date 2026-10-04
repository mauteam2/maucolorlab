import "server-only";
import { createHmac,randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { verifiedClientContext } from "@/lib/clients/service";
import { workspaceReference } from "@/lib/tenant/context";
import { AccessError } from "@/lib/tenant/bootstrap";
import { revalidateControlledRecipe } from "@/lib/brand/controlled-service";
import { colorHash } from "@/lib/color/engine";
import { createLiveRequest,liveCommand,liveSession,permissionFor } from "./model";
import { createSession,applyCommand,type Authority,LiveError } from "./engine";
import { z } from "zod";
async function access(permission:string,reference?:string|null){const ctx=await verifiedClientContext(permission);if(reference!==undefined&&reference!==workspaceReference(ctx))throw new AccessError("TENANT_CONTEXT_INVALID",403);return ctx;}
async function finish(ctx:Awaited<ReturnType<typeof access>>,permission:string){await access(permission,workspaceReference(ctx));}
function dbError(code:string){return new AccessError(code,["UNAUTHENTICATED","SESSION_EXPIRED"].includes(code)?401:["FORBIDDEN","TENANT_CONTEXT_INVALID","MEMBERSHIP_REVOKED","MEMBERSHIP_REQUIRED"].includes(code)?403:code.endsWith("NOT_FOUND")?404:code.endsWith("CONFLICT")||code.startsWith("LIVE_")||code==="SESSION_START_BLOCKED_STALE_INPUT"?409:400);}
export async function readLiveSessions(clientId:string,id:string|null,correlationId:string){
 if(!z.uuid().safeParse(clientId).success||id!==null&&!z.uuid().safeParse(id).success)throw new AccessError("VALIDATION_FAILED",400);
 const ctx=await access("live_session.view"),client=await createClient();let q=client.from("live_sessions").select("payload").eq("organization_id",ctx.organization_id).eq("location_id",ctx.location_id).eq("client_id",clientId);
 if(id)q=q.eq("id",id);const {data,error}=await q.order("updated_at",{ascending:false}).limit(id?1:25);
 if(error)throw new AccessError("NETWORK_ERROR",503);if(id&&!data?.length)throw new AccessError("LIVE_SESSION_NOT_FOUND",404);
 const records=(data??[]).map(r=>liveSession.parse(r.payload));await finish(ctx,"live_session.view");return {data:id?records[0]:records,correlationId};
}
export async function mutateLiveSession(raw:unknown,id:string|null,clientId:string|null,correlationId:string,reference:string|null){
 const parsed=(id?liveCommand:createLiveRequest).safeParse(raw);if(!parsed.success||id!==null&&!z.uuid().safeParse(id).success)throw new AccessError("VALIDATION_FAILED",400);
 const command=id?liveCommand.parse(parsed.data):null,q=id?null:createLiveRequest.parse(parsed.data),permission=command?permissionFor(command.type):"live_session.start";
 const ctx=await access(permission,reference),client=await createClient(),auth=await client.auth.getUser();if(auth.error||!auth.data.user)throw new AccessError("SESSION_EXPIRED",401);
 // Receipt lookup still checks current membership. Historical replay never
 // grants control, changes the active head, or serves as a new safety approval.
 const old=await client.rpc("live_session_receipt",{p_membership_id:ctx.membership_id,p_location_id:ctx.location_id,p_mutation_id:parsed.data.mutation_id,p_input:parsed.data,p_session_id:id,p_correlation_id:correlationId});
 if(old.error)throw new AccessError("NETWORK_ERROR",503);if(old.data?.code)throw dbError(old.data.code);if(old.data?.schemaVersion){await finish(ctx,permission);return {data:liveSession.parse(old.data),correlationId};}
 const clock=await client.rpc("live_session_clock");if(clock.error||!z.iso.datetime({offset:true}).safeParse(clock.data).success)throw new AccessError("NETWORK_ERROR",503);
 const authority:Authority={actorId:auth.data.user.id,now:clock.data,permissions:ctx.permissions,id:randomUUID};let current=null;
 if(id){if(!clientId)throw new AccessError("VALIDATION_FAILED",400);current=liveSession.parse((await readLiveSessions(clientId,id,correlationId)).data);}
 const recipeId=q?.recipe_id??(command?.type==="RECIPE_REVISION"?command.recipe_id:current?.currentRecipeId);
 if(q||command&&["START","RESUME","REASSESS","RECIPE_REVISION"].includes(command.type)){
  Object.assign(authority,await revalidateControlledRecipe(q?.client_id??current!.clientId,recipeId!,correlationId));
 }
 if(command?.type==="TRANSFER_CONTROL"){
  const allowed=await client.rpc("live_session_transfer_allowed",{p_user_id:command.user_id,p_organization_id:ctx.organization_id,p_location_id:ctx.location_id});
  authority.transferAllowed=!allowed.error&&allowed.data===true;
 }
 if(command?.type==="PHOTO")authority.photoPath=`${ctx.organization_id}/${id}/${auth.data.user.id}/${command.photo_id}`;
 let next;try{next=q?createSession(q,authority,ctx.location_id,authority.passportId??""):applyCommand(current!,command!,authority);}catch(e){if(e instanceof LiveError)throw new AccessError(e.code,e.status);throw e;}
 const secret=process.env.ELIFORA_COLOR_PLAN_SIGNING_KEY;if(!secret||!/^[a-f0-9]{64}$/.test(secret))throw new AccessError("COLOR_ENGINE_UNAVAILABLE",503);
 const envelope=JSON.stringify({organizationId:ctx.organization_id,actorId:auth.data.user.id,membershipId:ctx.membership_id,locationId:ctx.location_id,input:parsed.data,sessionId:id,
 previousHash:current?colorHash(current):null,resultHash:colorHash(next),expiresAt:new Date(Date.now()+120000).toISOString(),result:next});
 const signature=createHmac("sha256",Buffer.from(secret,"hex")).update(envelope).digest("hex");
 const stored=await client.rpc("live_session_store",{p_membership_id:ctx.membership_id,p_location_id:ctx.location_id,p_envelope:envelope,p_signature:signature,p_correlation_id:correlationId});
 if(stored.error)throw new AccessError("NETWORK_ERROR",503);if(stored.data?.code)throw dbError(stored.data.code);
 const result=liveSession.parse(stored.data);if(colorHash(result)!==colorHash(next))throw new AccessError("LIVE_RESULT_INVALID",503);
 await finish(ctx,permission);return {data:result,correlationId};
}
export async function livePhoto(id:string,photoId:string,clientId:string,file:Blob|null,correlationId:string,reference?:string|null){
 const ctx=await access(file?"live_session.contribute":"live_session.view",file?reference:undefined),s=liveSession.parse((await readLiveSessions(clientId,id,correlationId)).data),p=s.photos.find(p=>p.id===photoId);
 if(!p)throw new AccessError("LIVE_PHOTO_NOT_FOUND",404);const client=await createClient();
 if(file){if(file.size>10*1024*1024||file.type!==p.contentType)throw new AccessError("VALIDATION_FAILED",400);const r=await client.storage.from("live-technical").upload(p.path,file,{contentType:p.contentType,upsert:false});if(r.error)throw new AccessError("LIVE_PHOTO_UPLOAD_FAILED",409);}
 else{const r=await client.storage.from("live-technical").download(p.path);if(r.error)throw new AccessError("LIVE_PHOTO_NOT_FOUND",404);await finish(ctx,"live_session.view");return r.data;}
 await finish(ctx,"live_session.contribute");return null;
}
