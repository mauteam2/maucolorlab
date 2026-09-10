"use client";
import { useActionState } from "react";
import { signIn } from "@/app/sign-in/actions";
import { tr } from "@/lib/i18n/tr";
export function SignInForm() {
  const [state, action, pending] = useActionState(signIn, { code: "" });
  return <form action={action} className="auth-form">
    <label htmlFor="email">{tr.email}</label>
    <input id="email" name="email" type="email" autoComplete="username" required maxLength={254} />
    <label htmlFor="password">{tr.password}</label>
    <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={1024} />
    {state.code && <p role="alert">{state.code === "INVALID_CREDENTIALS" ? tr.invalid : tr.network}</p>}
    <button className="button button-primary" disabled={pending}>{pending ? tr.pending : tr.signIn}</button>
  </form>;
}
