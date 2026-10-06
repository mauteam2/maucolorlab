"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { SalonFrame, SalonHeading, SalonCard } from "./salon-frame";
import { SalonIcon } from "./salon-icon";
import { type ActiveTenantContext, tenantContextSchema } from "@/lib/tenant/context";
import { tr } from "@/lib/i18n/tr";
import { logout } from "@/app/sign-in/actions";
import { changeWorkspace } from "@/app/workspaces/actions";
import { SalonOperations } from "./salon-operations";
export function WorkspaceShell() {
  // Router/back-forward caches can retain old server payloads. Start concealed on every mount.
  const [context, setContext] = useState<ActiveTenantContext | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let busy = false;
    async function verify() {
      if (busy || !active || document.visibilityState === "hidden") return;
      busy = true; setContext(null);
      try {
        const response = await fetch("/api/session", { cache: "no-store", signal: AbortSignal.timeout(10000) });
        const body = await response.json();
        if (!active || document.hidden || !navigator.onLine) return;
        if (response.status === 401) { window.location.replace("/sign-in?reason=SESSION_EXPIRED"); return; }
        if (response.status === 403) { window.location.replace("/workspaces?reason=TENANT_CONTEXT_INVALID"); return; }
        if (!response.ok) throw new Error("NETWORK_ERROR");
        setContext(tenantContextSchema.parse(body.context)); setFailed(false);
      } catch { if (active) { setContext(null); setFailed(true); } }
      finally { busy = false; }
    }
    const hide = () => { setContext(null); if (document.visibilityState === "visible") void verify(); };
    const offline = () => { setContext(null); setFailed(true); };
    const timer = window.setInterval(() => void verify(), 15000);
    void verify();
    window.addEventListener("focus", verify); window.addEventListener("online", verify);
    window.addEventListener("offline", offline); window.addEventListener("pageshow", verify);
    document.addEventListener("visibilitychange", hide);
    return () => { active = false; clearInterval(timer); window.removeEventListener("focus", verify);
      window.removeEventListener("online", verify); window.removeEventListener("offline", offline);
      window.removeEventListener("pageshow", verify); document.removeEventListener("visibilitychange", hide); };
  }, []);
  return <SalonFrame active="dashboard" workspace={context?.organization_name}><main className="salon-main" id="main-content">
    {context ? <><SalonHeading title="Salonunuza genel bakış" description="Müşteri kayıtlarına ve renk çalışmalarınıza ulaşın." />
      <div className="salon-columns"><SalonCard title={tr.ready}><p className="salon-muted">{context.organization_name} · {context.location_name}</p><p>{tr.roles[context.role]}</p><p>Salonunuzun müşteri bilgileri, Hair Passport kayıtları ve teknik geçmişi güvenli çalışma alanınızda tutulur.</p><form action={changeWorkspace}><button className="button button-secondary">{tr.change}</button></form></SalonCard><SalonCard title="Hızlı işlemler"><div className="salon-stack">
      {context.permissions.includes("clients.read") && <Link prefetch={false} className="salon-quick" href="/workspace/clients"><span className="salon-icon-disc"><SalonIcon name="clients" /></span><strong>Müşteriler</strong><SalonIcon name="arrow" /></Link>}
      {context.permissions.includes("clients.create") && <Link prefetch={false} className="salon-quick" href="/workspace/clients/new"><span className="salon-icon-disc"><SalonIcon name="plus" /></span><strong>Yeni müşteri</strong><SalonIcon name="arrow" /></Link>}
      {context.permissions.includes("hair_passport.read") && <Link prefetch={false} className="salon-quick" href="/workspace/colorlab"><span className="salon-icon-disc"><SalonIcon name="brush" /></span><strong>ColorLab</strong><SalonIcon name="arrow" /></Link>}
      </div></SalonCard></div>{context.permissions.includes("salon.read")&&<SalonOperations section="dashboard"/>}</>
      : <p role="status">{failed ? tr.network : tr.loading}</p>}
    {failed && <a href="/workspace" className="text-link">{tr.retry}</a>}
    <form action={logout}><button className="button button-primary">{tr.logout}</button></form>
  </main></SalonFrame>;
}
