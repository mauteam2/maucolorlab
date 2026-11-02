"use client";
import { useActionState, useEffect, useRef } from "react";
import { signIn } from "@/app/sign-in/actions";
import { tr } from "@/lib/i18n/tr";
import { PasswordField } from "./password-field";
export function SignInForm({ returnTo = "" }: { returnTo?: string }) {
  const [state, action, pending] = useActionState(signIn, { code: "" });
  const feedback = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (state.code) feedback.current?.focus(); }, [state]);
  return <form action={action} className="auth-form entry-sign-in-form" aria-busy={pending}>
    {returnTo === "/invitations" && <input type="hidden" name="returnTo" value="/invitations" />}
    <label htmlFor="email">{tr.email}</label>
    <input id="email" name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={254} aria-invalid={state.code === "INVALID_CREDENTIALS" || undefined} aria-describedby={state.code ? "sign-in-error" : undefined} />
    <PasswordField id="password" name="password" label={tr.password} autoComplete="current-password" maxLength={1024} invalid={state.code === "INVALID_CREDENTIALS"} describedBy={state.code ? "sign-in-error" : undefined} />
    {state.code && <p id="sign-in-error" ref={feedback} tabIndex={-1} role="alert" className="entry-feedback">{state.code === "INVALID_CREDENTIALS" ? tr.invalid : tr.network}</p>}
    <button className="button button-primary" disabled={pending}>{pending ? tr.pending : tr.signIn}</button>
    <a className="text-link" href="/auth/recovery">Parolamı unuttum</a>
    <p className="entry-controlled">ELIFORA erişimi yetkilendirilmiş salon hesabı üzerinden sağlanır.</p>
  </form>;
}
