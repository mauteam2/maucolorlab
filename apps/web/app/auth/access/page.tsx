import Link from "next/link";
import { AuthFrame } from "@/components/auth-frame";
import { accessMessage } from "@/lib/auth-entry/presentation";
import { logout } from "@/app/sign-in/actions";
import { PrivacyActionForm } from "@/components/privacy-action-form";
export default async function AccessPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams, message = accessMessage(reason ?? "NETWORK_ERROR");
  const signedOut = reason === "SESSION_EXPIRED" || reason === "UNAUTHENTICATED";
  return <AuthFrame section="Erişim kontrolü"><div className="entry-state-icon" aria-hidden="true">—</div><div role="alert"><h1 id="entry-heading">{message.title}</h1><p className="entry-lead">{message.description}</p></div>
    <div className="entry-actions"><Link className="button button-primary" href={signedOut ? "/sign-in" : reason === "FORBIDDEN" ? "/workspace" : "/workspaces?choose=1"}>{signedOut ? "Yeniden oturum aç" : reason === "FORBIDDEN" ? "Çalışma alanına dön" : "Çalışma alanlarını kontrol et"}</Link>
    {!signedOut && <PrivacyActionForm action={logout}><button className="entry-text-button">Oturumu kapat</button></PrivacyActionForm>}</div>
  </AuthFrame>;
}
