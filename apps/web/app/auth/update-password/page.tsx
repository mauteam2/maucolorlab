import { AccountRecoveryForm } from "@/components/account-recovery-form";
import { AuthFrame } from "@/components/auth-frame";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
export default async function UpdatePasswordPage(){
 const client=await createClient(),result=await client.auth.getUser();
 const valid = !result.error && result.data.user && !(await client.rpc("list_workspace_contexts")).error;
 return <AuthFrame section="Parola güncelleme">{valid ? <><h1 id="entry-heading">Yeni parola belirleyin</h1><p className="entry-lead">Hesabınıza özel bir parola seçin. Güncelleme tamamlandığında yeniden oturum açacaksınız.</p><AccountRecoveryForm update/></> : <><h1 id="entry-heading">Kurtarma oturumu kullanılamıyor</h1><p role="alert" className="entry-lead">Bağlantının süresi dolmuş veya oturum doğrulanamamış olabilir. Yeni bir kurtarma isteği oluşturabilirsiniz.</p><div className="entry-actions"><Link className="button button-primary" href="/auth/recovery">Yeni kurtarma isteği</Link><Link href="/sign-in">Oturum açmaya dön</Link></div></>}</AuthFrame>;
}
