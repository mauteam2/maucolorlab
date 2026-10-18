"use server";
import { headers,cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { applicationOrigin } from "@/lib/security/redirect";
import { selectionCookie } from "@/lib/tenant/context";
async function origin(){const h=await headers(),value=applicationOrigin(process.env.ELIFORA_APP_ORIGIN,process.env.ELIFORA_DEPLOYMENT_ENV,h.get("host"));if(h.get("origin")!==value)throw new Error("Origin denied");return value;}
export async function requestRecovery(_state:{code:string},form:FormData){
 // Identical public result for invalid, unknown, rate-limited and known emails.
 const code="RECOVERY_REQUESTED";
 try{const base=await origin(),email=z.email().max(254).safeParse(String(form.get("email")??"").trim());if(email.success){const client=await createClient();await client.auth.resetPasswordForEmail(email.data,{redirectTo:base+"/auth/recovery/callback"});}}catch{/* Never enumerate identities or log provider response. */}
 return {code};
}
export async function updateRecoveredPassword(_state:{code:string},form:FormData){
 try{await origin();const password=z.string().min(12).max(128).safeParse(form.get("password"));if(!password.success||password.data!==form.get("confirm"))return {code:"INVALID_PASSWORD"};
  const client=await createClient(),user=await client.auth.getUser();if(user.error||!user.data.user)return {code:"RECOVERY_INVALID"};
  // Auth JWT signature/user existence alone is not session revocation proof.
  // This identity-only RPC invokes the authoritative Data API session hook and
  // remains valid for accounts that have no salon membership.
  if((await client.rpc("list_workspace_contexts")).error)return {code:"RECOVERY_INVALID"};
  const result=await client.auth.updateUser({password:password.data});if(result.error)return {code:"RECOVERY_INVALID"};
  // No old session may keep technical authority after successful recovery.
  const signedOut=await client.auth.signOut({scope:"global"});
  const jar=await cookies();jar.getAll().filter(c=>c.name.startsWith("sb-")&&c.name.includes("-auth-token")).forEach(c=>jar.delete(c.name));jar.delete(selectionCookie);
  return {code:signedOut.error?"RECOVERY_REVOKE_REQUIRED":"RECOVERY_COMPLETE"};
 }catch{return {code:"RECOVERY_INVALID"};}
}
