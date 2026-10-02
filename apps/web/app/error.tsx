"use client";
import { tr } from "@/lib/i18n/tr";
import { logout } from "@/app/sign-in/actions";
import { SalonFrame, SalonCard } from "@/components/salon-frame";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <SalonFrame active="dashboard"><main id="main-content" className="salon-main"><SalonCard><h1>{tr.network}</h1><div className="salon-toolbar" style={{marginTop:24}}><button className="button button-primary" onClick={reset}>{tr.retry}</button>
    <form action={logout}><button className="button button-secondary">{tr.logout}</button></form></div></SalonCard></main></SalonFrame>;
}
