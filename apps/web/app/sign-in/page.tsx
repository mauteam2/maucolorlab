import { SignInIntro } from "@/components/sign-in-intro";
import { SignInForm } from "@/components/sign-in-form";
import { tr } from "@/lib/i18n/tr";
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  return <SignInIntro>
    <h1 id="sign-in-heading">{tr.welcome}</h1><p className="lead">{tr.intro}</p>
    {reason === "SESSION_EXPIRED" && <p role="alert">{tr.expired}</p>}
    <SignInForm />
  </SignInIntro>;
}
