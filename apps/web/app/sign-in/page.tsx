import { SignInIntro } from "@/components/sign-in-intro";
import { SignInForm } from "@/components/sign-in-form";
import { tr } from "@/lib/i18n/tr";
import { accessMessage } from "@/lib/auth-entry/presentation";
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ reason?: string; returnTo?: string }> }) {
  const { reason, returnTo } = await searchParams;
  return <SignInIntro>
    <h1 id="sign-in-heading">{tr.welcome}</h1><p className="lead">{tr.intro}</p>
    {reason && <p role="alert" className="entry-feedback">{reason === "RECOVERY_INVALID" ? "Bu kurtarma bağlantısı kullanılamıyor. Yeni bir kurtarma isteği oluşturabilirsiniz." : <><strong>{accessMessage(reason).title}</strong><br />{accessMessage(reason).description}</>}</p>}
    <SignInForm returnTo={returnTo} />
  </SignInIntro>;
}
