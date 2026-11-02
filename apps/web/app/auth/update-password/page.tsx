import { AccountRecoveryForm } from "@/components/account-recovery-form";
import { AuthFrame } from "@/components/auth-frame";
import { createClient } from "@/lib/supabase/server";
export default async function UpdatePasswordPage(){
 const client=await createClient(),result=await client.auth.getUser();
 const valid = !result.error && result.data.user && !(await client.rpc("list_workspace_contexts")).error;
 return <AuthFrame section="Parola güncelleme"><AccountRecoveryForm update validSession={Boolean(valid)}/></AuthFrame>;
}
