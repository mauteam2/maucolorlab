"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { BrandLogo } from "./brand-logo";
import { SalonIcon, type SalonIconName } from "./salon-icon";
export const salonSections = [
 { id: "dashboard", label: "Ana panel", icon: "dashboard", href: "/workspace" },
 { id: "colorlab", label: "ColorLab", icon: "brush", href: "/workspace/colorlab" },
 { id: "clients", label: "Müşteriler", icon: "clients", href: "/workspace/clients" },
 { id: "appointments", label: "Randevular", icon: "calendar", href: null },
 { id: "finance", label: "Finans", icon: "finance", href: null },
 { id: "reports", label: "Raporlar", icon: "reports", href: null },
 { id: "team", label: "Ekip", icon: "team", href: null },
 { id: "settings", label: "Ayarlar", icon: "settings", href: null },
] as const;
export type SalonSection = typeof salonSections[number]["id"];
export function SalonFrame({ children, active, workspace, preview = false }: { children: ReactNode; active: SalonSection; workspace?: string; preview?: boolean }) {
 const [open, setOpen] = useState(false);
 const [query, setQuery] = useState("");
 const current = salonSections.find(section => section.id === active)!;
 return <div className="salon-layout">
  <a className="skip-link" href="#main-content">İçeriğe geç</a>
  <aside className="salon-sidebar" data-open={open}>
   <Link className="salon-brand" href={preview ? "/preview/salon/dashboard" : "/workspace"} aria-label="ELIFORA ana sayfa"><BrandLogo /></Link>
   <nav id="salon-mobile-nav" aria-label="Ana gezinti">{salonSections.map(section => {
    const content = <><SalonIcon name={section.icon as SalonIconName} /><span>{section.label}</span></>;
    const href = preview ? `/preview/salon/${section.id}` : section.href;
    return href ? <Link key={section.id} prefetch={false} href={href} aria-label={`${section.label} bölümü`} aria-current={active === section.id ? "page" : undefined} onClick={() => setOpen(false)}>{content}</Link> : <span key={section.id} className="salon-upcoming" title="Bu modül sonraki fazda açılacak">{content}<small>Yakında</small></span>;
   })}</nav>
   <Link className="salon-workspace-link" prefetch={false} href={preview ? "/preview/salon/settings" : "/workspaces?choose=1"}><SalonIcon name="home" /><span>{workspace ?? "Salon çalışma alanı"}</span><SalonIcon name="arrow" /></Link>
  </aside>
  <div className="salon-body">
   <header className="salon-topbar">
    <button className="salon-menu button button-secondary" aria-expanded={open} aria-controls="salon-mobile-nav" onClick={() => setOpen(!open)}>Menü</button>
    <div className="salon-breadcrumb">Çalışma alanı <span>/</span> <strong>{current.label}</strong></div>
    {preview ? <span className="salon-preview-tag">Tasarım önizlemesi · örnek veriler</span> : <form className="salon-global-search" action="/workspace/clients"><SalonIcon name="search" /><input aria-label="Müşteri ara" name="query" type="search" maxLength={80} placeholder="Müşteri adı veya telefon ara" value={query} onChange={event => setQuery(event.target.value)} /><button aria-label="Müşteri aramasını aç" type="submit"><SalonIcon name="arrow" /></button></form>}
    <span className="salon-identity"><span className="salon-avatar"><SalonIcon name="home" /></span><span>{workspace ?? "ELIFORA"}</span></span>
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
