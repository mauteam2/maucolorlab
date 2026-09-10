import { AppShell } from "@/components/app-shell";
import { SignInForm } from "@/components/sign-in-form";
import { tr } from "@/lib/i18n/tr";
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  return <AppShell><main className="narrow-page" id="main-content">
    <p className="eyebrow">ELIFORA</p><h1>{tr.welcome}</h1><p className="lead">{tr.intro}</p>
    {reason === "SESSION_EXPIRED" && <p role="alert">{tr.expired}</p>}
    <SignInForm />
  </main></AppShell>;
}
