import { AccountRecoveryForm } from "@/components/account-recovery-form";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
export default async function UpdatePasswordPage(){const client=await createClient(),result=await client.auth.getUser();if(result.error||!result.data.user)redirect("/sign-in?reason=RECOVERY_INVALID");return <AppShell><main id="main-content" className="hero"><h1>Yeni parola belirleyin</h1><AccountRecoveryForm update/></main></AppShell>;}
