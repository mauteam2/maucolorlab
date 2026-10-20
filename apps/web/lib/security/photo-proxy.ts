import "server-only";
import { createHash, createHmac } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { AccessError } from "@/lib/tenant/bootstrap";
import { normalizePhoto } from "./photo-image";

export async function proxyPhoto(context:{membership_id:string;location_id:string}, sessionId:string, photoId:string, clientId:string, file:Blob|null) {
 let image:Blob|null=null;
 if(file) try { image=await normalizePhoto(file); } catch { throw new AccessError("VALIDATION_FAILED",400); }
 const key=process.env.ELIFORA_COLOR_PLAN_SIGNING_KEY;
 if(!key||!/^[a-f0-9]{64}$/.test(key))throw new AccessError("COLOR_ENGINE_UNAVAILABLE",503);
 const client=await createClient(),auth=await client.auth.getSession();
 if(auth.error||!auth.data.session)throw new AccessError("SESSION_EXPIRED",401);
 // getSession supplies transport credentials only. Both RPC calls in the proxy
 // validate the provider session and authoritative database membership.
 const envelope=JSON.stringify({membershipId:context.membership_id,locationId:context.location_id,sessionId,photoId,clientId,method:image?"POST":"GET",
  digest:image?createHash("sha256").update(Buffer.from(await image.arrayBuffer())).digest("hex"):null,
  size:image?.size??0,expiresAt:new Date(Date.now()+60000).toISOString()});
 const signature=createHmac("sha256",Buffer.from(key,"hex")).update("elifora/photo-proxy/v1\n"+envelope).digest("hex");
 const url=new URL("/functions/v1/live-photo",process.env.NEXT_PUBLIC_SUPABASE_URL);
 const r=await fetch(url,{method:image?"POST":"GET",headers:{Authorization:`Bearer ${auth.data.session.access_token}`,apikey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  "X-Elifora-Envelope":Buffer.from(envelope).toString("base64"),"X-Elifora-Signature":signature,...(image?{"Content-Type":image.type}:{})},body:image,cache:"no-store",signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw new AccessError(r.status===401?"SESSION_EXPIRED":r.status===403?"FORBIDDEN":r.status===404?"LIVE_PHOTO_NOT_FOUND":"LIVE_PHOTO_UPLOAD_FAILED",r.status===401?401:r.status===403?403:r.status===404?404:409);
 return image?null:await r.blob();
}
