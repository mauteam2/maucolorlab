"use client";
import { useEffect, useRef, useState, Fragment, type ReactNode } from "react";
import Link from "next/link";
import { BrandLogo } from "./brand-logo";
import { SalonIcon, type SalonIconName } from "./salon-icon";
import { tenantContextSchema, type ActiveTenantContext } from "@/lib/tenant/context";
import { tr } from "@/lib/i18n/tr";
export const salonSections = [
 { id: "dashboard", label: "Bugün", icon: "dashboard", href: "/workspace", group: "Salon", permission: "" },
 { id: "clients", label: "Müşteriler", icon: "clients", href: "/workspace/clients", group: "Salon", permission: "clients.read" },
 { id: "appointments", label: "Randevular", icon: "calendar", href: "/workspace/appointments", group: "Salon", permission: "salon.read" },
 { id: "colorlab", label: "ColorLab", icon: "brush", href: "/workspace/colorlab", group: "Renk zekâsı", permission: "color_plan.read" },
 { id: "live", label: "Canlı uygulama", icon: "clock", href: "/workspace/live-sessions", group: "Renk zekâsı", permission: "live_session.view" },
 { id: "catalog", label: "Marka kütüphanesi", icon: "reports", href: "/workspace/catalog", group: "Renk zekâsı", permission: "color_plan.read" },
 { id: "stock", label: "Stok", icon: "reports", href: "/workspace/stock", group: "İşletme", permission: "stock.view" },
 { id: "finance", label: "Finans", icon: "finance", href: "/workspace/finance", group: "İşletme", permission: "finance.view" },
 { id: "reports", label: "Raporlar", icon: "reports", href: "/workspace/reports", group: "İşletme", permission: "reports.read" },
 { id: "team", label: "Ekip", icon: "team", href: "/workspace/team", group: "İşletme", permission: "salon.read" },
 { id: "settings", label: "Ayarlar", icon: "settings", href: "/workspace/settings", group: "İşletme", permission: "salon.read" },
] as const;
export type SalonSection = typeof salonSections[number]["id"];
export function SalonFrame({ children, active, workspace, context, preview = false }: { children: ReactNode; active: SalonSection; workspace?: string; context?: ActiveTenantContext | null; preview?: boolean }) {
 const [verified, setVerified] = useState<ActiveTenantContext | null>(null);
 const menuButton = useRef<HTMLButtonElement>(null);
 // Navigation is permission-aware, but all route/service guards remain authoritative.
 useEffect(() => {
  if (preview || context !== undefined) return;
  let alive = true, epoch = 0; const controller = new AbortController();
  const clear = () => { epoch++; setVerified(null); };
  async function verify() {
   clear(); const request = epoch; if (document.hidden || !navigator.onLine) return;
   try { const response = await fetch("/api/session", { cache: "no-store", signal: controller.signal });
    if (!response.ok) return;
    const next = tenantContextSchema.parse((await response.json()).context);
    if (alive && request === epoch && !document.hidden && navigator.onLine) setVerified(next);
   } catch { /* Conceal unavailable navigation; the page owns authentication feedback. */ }
  }
  void verify(); const visibility = () => { if (document.hidden) clear(); else void verify(); };
  window.addEventListener("offline", clear); window.addEventListener("focus", verify); document.addEventListener("visibilitychange", visibility);
  return () => { alive = false; controller.abort(); window.removeEventListener("offline", clear); window.removeEventListener("focus", verify); document.removeEventListener("visibilitychange", visibility); };
 }, [context, preview]);
 const identity = context === undefined ? verified : context;
 const navigation = salonSections.filter(section => preview ? !["live", "catalog", "stock"].includes(section.id) : !section.permission || identity?.permissions.includes(section.permission));
 const [open, setOpen] = useState(false);
 useEffect(() => {
  if (open) document.querySelector<HTMLAnchorElement>("#salon-mobile-nav a")?.focus();
 }, [open]);
 const [query, setQuery] = useState("");
 const [privacyLocked, setPrivacyLocked] = useState(false);
 useEffect(() => {
  if (preview) return;
  const conceal = () => { setPrivacyLocked(true); setQuery(""); setOpen(false); };
  const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("elifora-offline-privacy");
  if (channel) channel.onmessage = conceal;
  window.addEventListener("elifora-offline-lock", conceal);
  return () => { channel?.close(); window.removeEventListener("elifora-offline-lock", conceal); };
 }, [preview]);
 const current = salonSections.find(section => section.id === active)!;
 if (privacyLocked) return <main className="container"><BrandLogo /><p role="status">Oturum veya çalışma alanı değişti. Özel bilgiler gizlendi; şifreli taslaklar korunuyor.</p><a className="button" href="/workspace">Çalışma alanını yeniden aç</a></main>;
 return <div className="salon-layout" data-workspace={!preview} onKeyDown={event => { if (event.key === "Escape" && open) { setOpen(false); menuButton.current?.focus(); } }}>
  <a className="skip-link" href="#main-content">İçeriğe geç</a>
  <aside className="salon-sidebar" data-open={open}>
   <Link className="salon-brand" href={preview ? "/preview/salon/dashboard" : "/workspace"} aria-label="ELIFORA ana sayfa"><BrandLogo /></Link>
   {!preview && <div className="salon-mobile-context">{identity ? <><strong>{identity.organization_name}</strong><span>{identity.location_name} · {tr.roles[identity.role]}</span></> : <span>Çalışma alanı doğrulanıyor</span>}<button className="text-link" onClick={() => { setOpen(false); menuButton.current?.focus(); }}>Menüyü kapat</button></div>}
   <nav id="salon-mobile-nav" aria-label="Ana gezinti">{navigation.map((section, index) => <Fragment key={section.id}>
    {navigation[index - 1]?.group !== section.group && <span className="salon-nav-group">{section.group}</span>}
    <Link prefetch={false} href={preview ? `/preview/salon/${section.id}` : section.href} aria-label={`${section.label} bölümü`} aria-current={active === section.id ? "page" : undefined} onClick={() => setOpen(false)}><SalonIcon name={section.icon as SalonIconName}/><span>{section.label}</span></Link>
   </Fragment>)}</nav>
   <div className="salon-account-context">{!preview && identity && <><span className="salon-account-role">{tr.roles[identity.role]}</span><strong>{identity.organization_name}</strong><small>{identity.location_name}</small></>}
   <Link className="salon-workspace-link" prefetch={false} href={preview ? "/preview/salon/settings" : "/workspaces?choose=1"}><SalonIcon name="home" /><span>{preview ? workspace ?? "Salon çalışma alanı" : "Çalışma alanını değiştir"}</span><SalonIcon name="arrow" /></Link></div>
  </aside>
  <div className="salon-body">
   <header className="salon-topbar">
    <button ref={menuButton} className="salon-menu button button-secondary" aria-expanded={open} aria-controls="salon-mobile-nav" onClick={() => setOpen(!open)}>Menü</button>
    <div className="salon-breadcrumb"><span className="salon-context-label">{preview ? "Çalışma alanı" : "ELIFORA / Çalışma alanı"}</span><strong>{current.label}</strong></div>
    {preview ? <span className="salon-preview-tag">Tasarım önizlemesi · örnek veriler</span> : identity?.permissions.includes("clients.read") ? <form className="salon-global-search" action="/workspace/clients"><SalonIcon name="search" /><input aria-label="Müşteri ara" name="query" type="search" maxLength={80} placeholder="Müşteri adı veya telefon ara" value={query} onChange={event => setQuery(event.target.value)} /><button aria-label="Müşteri aramasını aç" type="submit"><SalonIcon name="arrow" /></button></form> : null}
    <span className="salon-identity"><span className="salon-avatar"><SalonIcon name="home" /></span><span>{identity?.organization_name ?? workspace ?? "ELIFORA"}{identity && <small>{identity.location_name} · {tr.roles[identity.role]}</small>}</span></span>
   </header>
   {children}
  </div>
 </div>;
}
export function SalonHeading({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
 return <div className="salon-heading"><div><h1>{title}</h1>{description && <p className="lead">{description}</p>}</div>{actions && <div className="salon-heading-actions">{actions}</div>}</div>;
}
export function SalonCard({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
 return <section className={`salon-card ${className}`}>{title && <h2>{title}</h2>}{children}</section>;
}
export function SalonStat({ label, value, icon }: { label: string; value: ReactNode; icon: SalonIconName }) {
 return <div className="salon-card salon-stat"><span className="salon-icon-disc"><SalonIcon name={icon} /></span><div><p>{label}</p><strong>{value}</strong></div></div>;
}
