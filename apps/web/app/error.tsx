"use client";
import { tr } from "@/lib/i18n/tr";
import { logout } from "@/app/sign-in/actions";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="narrow-page"><h1>{tr.network}</h1><button className="button button-primary" onClick={reset}>{tr.retry}</button>
    <form action={logout}><button className="button button-secondary">{tr.logout}</button></form></main>;
}
