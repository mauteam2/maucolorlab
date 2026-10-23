"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { SalonFrame } from "./salon-frame";
import { ActionItem, LoadingState } from "./professional-ui";
import { type ActiveTenantContext, tenantContextSchema } from "@/lib/tenant/context";
import { tr } from "@/lib/i18n/tr";
import { OfflineDraftPanel } from "./offline-draft-panel";
import { PrivacyActionForm } from "./privacy-action-form";
import { logout } from "@/app/sign-in/actions";
import { changeWorkspace } from "@/app/workspaces/actions";
import { SalonOperations } from "./salon-operations";
import { ReportingWorkspace } from "./reporting-workspace";
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
  return <SalonFrame active="dashboard" context={context} workspace={context?.organization_name}><main className="salon-main" id="main-content">
    {context ? <><div className="today-heading"><div><span className="ui-eyebrow">Salon çalışma alanı</span><h1>Bugün</h1><p className="lead">Günün planı, teknik hazırlık ve takip gerektiren kayıtlar.</p></div><div className="today-context"><strong>{context.organization_name}</strong><p>{context.location_name} · {tr.roles[context.role]}</p><PrivacyActionForm action={changeWorkspace}><button className="text-link">{tr.change}</button></PrivacyActionForm></div></div>
      <div className="today-actions">
      {context.permissions.includes("clients.create") && <ActionItem href="/workspace/clients/new" title="Müşteri ekle" icon="clients">Yeni müşteri kaydı oluşturun.</ActionItem>}
      {context.permissions.includes("color_plan.read") && <ActionItem href="/workspace/colorlab" title="Renk çalışması" icon="brush">Saç analiziyle teknik planı hazırlayın.</ActionItem>}
      {context.permissions.includes("crm.read") && <ActionItem href="/workspace/clients?view=actions" title="Takip merkezi" icon="clock">Müşteri takibini ve açık aksiyonları inceleyin.</ActionItem>}
      </div>{context.permissions.includes("salon.read")&&<SalonOperations section="dashboard"/>}</>
      : <LoadingState label={failed ? tr.network : tr.loading}/>}
    {context?.permissions.includes("reports.read") && <ReportingWorkspace embedded />}
    {failed && <a href="/workspace" className="text-link">{tr.retry}</a>}
    {context?.role === "owner" && <Link prefetch={false} className="button button-secondary" href="/workspace/settings/pilot">Kontrollü pilot kurulum kılavuzu</Link>}
    <OfflineDraftPanel />
    <PrivacyActionForm action={logout}><button className="button button-primary">{tr.logout}</button></PrivacyActionForm>
  </main></SalonFrame>;
}
