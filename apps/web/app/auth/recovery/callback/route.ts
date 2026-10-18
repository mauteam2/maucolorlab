import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { applicationOrigin,safeRecoveryDestination } from "@/lib/security/redirect";
export async function GET(request:Request){
 const url=new URL(request.url),code=url.searchParams.get("code");let path="/sign-in?reason=RECOVERY_INVALID",base:string;
 try{base=applicationOrigin(process.env.ELIFORA_APP_ORIGIN,process.env.ELIFORA_DEPLOYMENT_ENV,request.headers.get("host")??url.host);}catch{return new Response(null,{status:400,headers:{"Cache-Control":"private, no-store"}});}
 if(code&&code.length<=4096&&url.searchParams.getAll("code").length===1&&[...url.searchParams.keys()].every(k=>k==="code")){
  try{const client=await createClient(),result=await client.auth.exchangeCodeForSession(code);if(!result.error)path=safeRecoveryDestination("/auth/update-password");}catch{/* Public typed failure only. */}
 }
 const response=NextResponse.redirect(new URL(path,base));response.headers.set("Cache-Control","private, no-store");response.headers.set("Referrer-Policy","no-referrer");return response;
}
