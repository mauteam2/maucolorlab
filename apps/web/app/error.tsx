"use client";
import { tr } from "@/lib/i18n/tr";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="narrow-page"><h1>{tr.network}</h1><button className="button button-primary" onClick={reset}>{tr.retry}</button>
    <a className="text-link" href="/sign-in">{tr.signIn}</a></main>;
}
