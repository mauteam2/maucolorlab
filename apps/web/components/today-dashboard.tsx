"use client";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import type { ActiveTenantContext } from "@/lib/tenant/context";
import type { Appointment } from "@/lib/salon/model";
import { localTime } from "@/lib/salon/engine";
import { appointmentLabels, precheckLabels } from "@/lib/salon/labels";
import { actionLabels } from "@/lib/crm/labels";
import { reportMoney } from "@/lib/reporting/model";
import { StatusBadge } from "./professional-ui";
import { SalonIcon } from "./salon-icon";
import { dayAppointments, nextAppointment, technicalAccess, useTodayData, type Preparation, type TodayAction } from "./today-data";

const appointmentLink = (a: Appointment) => `/workspace/appointments?appointment_id=${a.id}`;
function TodayDisclosure({ className, title, hint, children, icon }: { className: string; title: string; hint: string; children: ReactNode; icon?: boolean }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(max-width:600px)");
    const update = () => { if (ref.current) ref.current.open = !query.matches; };
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return <details ref={ref} className={`today-secondary ${className}`} open><summary><span>{icon && <SalonIcon name="brush" />}{title}</span><small>{hint}</small></summary>{children}</details>;
}
function preparationLabel(value: Preparation | null | undefined) {
  if (value === undefined) return "Henüz doğrulanmadı";
  if (value === null) return "Kontrol alınamadı";
  if (value.freshness.state === "MISSING") return "Hair Passport eksik";
  if (value.statuses.includes("TEST_REQUIRED")) return "Fiziksel test gerekli";
  if (value.statuses.includes("INFORMATION_REQUIRED")) return "Teknik bilgi gerekli";
  if (value.statuses.includes("RECOVERY_CONSTRAINT")) return "Yeniden değerlendirme gerekli";
  if (value.statuses.includes("REVIEW_REQUIRED") || value.statuses.includes("TECHNICAL_ESCALATION")) return "Uzman incelemesi gerekli";
  if (value.statuses.includes("TIME_WARNING")) return "Ayrılan süreyi gözden geçirin";
  return "Ön kontrolde eksik bildirilmedi";
}
function AppointmentLinks({ a, context }: { a: Appointment; context: ActiveTenantContext }) {
  return <div className="today-focus-actions"><Link className="button button-primary" href={appointmentLink(a)}>Randevuyu aç <SalonIcon name="arrow" /></Link>
    {context.permissions.includes("clients.read") && <Link className="text-link" href={`/workspace/clients/${a.client_id}`}>Profili aç</Link>}
    {context.permissions.includes("color_plan.read") && a.colorlab_required && <Link className="text-link" href={`/workspace/colorlab?client_id=${a.client_id}`}>ColorLab <span aria-hidden="true">↗</span></Link>}</div>;
}
function NowNext({ a, context, preparation }: { a: Appointment | null; context: ActiveTenantContext; preparation: Record<string, Preparation | null> }) {
  const active = a?.status === "IN_SERVICE", arrived = a?.status === "ARRIVED";
  return <section className="today-focus" aria-label="Şimdi ve sırada">
    <div className="today-focus-label"><span className="ui-eyebrow">{active ? "Şimdi · uygulamada" : arrived ? "Şimdi · salonda" : "Sırada"}</span><span className="today-focus-rule" /></div>
    {a ? <><div className="today-focus-content"><div className="today-focus-time"><time dateTime={a.start_at}>{localTime(a.start_at, a.timezone)}</time><small>{localTime(a.end_at, a.timezone)} bitiş · planlanan</small></div>
      <div className="today-focus-person"><h2>{a.client_name}</h2><p>{a.service_name}</p><span className="today-staff"><SalonIcon name="team" />{a.staff_display_name}</span></div><StatusBadge tone={active || arrived ? "success" : "neutral"}>{appointmentLabels[a.status]}</StatusBadge></div>
      {technicalAccess(context) && (a.colorlab_required || a.hair_passport_required || a.precheck_required) && <p className="today-focus-readiness"><SalonIcon name="brush" />{preparationLabel(preparation[a.id])}<small>Teknik hazırlık · işlem onayı değildir</small></p>}
      <AppointmentLinks a={a} context={context} /></> : <div className="today-focus-empty"><h2>Bekleyen randevu yok.</h2><p>Şu an salonda veya ilerleyen saatte bekleyen randevu görünmüyor.</p><Link className="button button-secondary" href="/workspace/appointments">Randevu planını aç</Link></div>}
  </section>;
}
function Agenda({ items, context, preparation, selected }: { items: Appointment[]; context: ActiveTenantContext; preparation: Record<string, Preparation | null>; selected?: string }) {
  return <section className="today-agenda-section" aria-label="Bugünün ajandası"><div className="today-section-heading"><h2>Günün akışı</h2><Link className="text-link" href="/workspace/appointments">Takvimi aç <span aria-hidden="true">↗</span></Link></div>
    {items.length ? <ol className="today-operational-agenda">{items.map(a => <li key={a.id} data-current={a.id === selected} data-color={a.colorlab_required}>
      <time dateTime={a.start_at}>{localTime(a.start_at, a.timezone)}<small>{a.scheduled_duration_minutes} dk</small></time>
      <div className="today-agenda-person"><Link href={appointmentLink(a)}>{a.client_name}</Link><span>{a.service_name}</span><small>{a.staff_display_name}</small></div>
      <div className="today-agenda-state"><StatusBadge tone={["COMPLETED", "IN_SERVICE", "ARRIVED"].includes(a.status) ? "success" : "neutral"}>{appointmentLabels[a.status]}</StatusBadge>
      {technicalAccess(context) && a.colorlab_required && !["COMPLETED", "CANCELLED", "NO_SHOW"].includes(a.status) && <small>{preparationLabel(preparation[a.id])}</small>}</div>
      <Link className="today-agenda-open" href={appointmentLink(a)} aria-label={`${a.client_name} randevusunu aç`}><SalonIcon name="arrow" /></Link>
    </li>)}</ol> : <div className="today-compact-empty"><p>Bugün henüz randevu yok.</p><span>Randevu planını açabilir veya müşteri takiplerini gözden geçirebilirsiniz.</span></div>}
  </section>;
}
function TechnicalPreparation({ items, preparation, context }: { items: Appointment[]; preparation: Record<string, Preparation | null>; context: ActiveTenantContext }) {
  const relevant = items.filter(a => (a.colorlab_required || a.hair_passport_required || a.precheck_required) && !["COMPLETED", "CANCELLED", "NO_SHOW"].includes(a.status));
  const checked = relevant.filter(a => preparation[a.id]);
  const attention = checked.filter(a => preparation[a.id]?.statuses.some(s => s !== "READY")).length;
  return <TodayDisclosure className="today-technical" title="Teknik hazırlık" icon hint={`${checked.length}/${relevant.length} kontrol alındı${attention ? ` · ${attention} inceleme` : ""}`}>
    <div className="today-disclosure-body"><p className="today-section-note">Renk zekâsı · mevcut ön kontrol kayıtları</p>
      {relevant.length ? <ul className="today-preparation-list">{relevant.slice(0, 8).map(a => {
        const value = preparation[a.id];
        return <li key={a.id}><div><Link href={appointmentLink(a)}>{a.client_name}</Link><small>{localTime(a.start_at, a.timezone)} · {a.service_name}</small></div><p>{preparationLabel(value)}</p>
          {value && <div className="today-technical-signals">{value.statuses.filter(s => s !== "READY").map(s => <span key={s}>{precheckLabels[s]}</span>)}</div>}
          <Link className="text-link" href={appointmentLink(a)}>Ön kontrolü incele <span aria-hidden="true">→</span></Link></li>;
      })}</ul> : <p className="today-compact-empty">Bugünün ajandasında teknik ön kontrol gerektiren açık randevu yok.</p>}
      {relevant.length > 8 && <p className="today-section-note">İlk 8 randevu gösteriliyor. Diğer hazırlıkları takvimden inceleyin.</p>}
      <p className="today-section-note">Eksik bildirilmemesi kimyasal işlem onayı değildir. Güncel kararı teknik çalışma alanında inceleyin.</p>
      {context.permissions.includes("color_plan.read") && <Link className="today-section-link" href="/workspace/colorlab">ColorLab çalışma alanı <span aria-hidden="true">↗</span></Link>}
    </div></TodayDisclosure>;
}
const actionReason: Record<TodayAction["kind"], string> = {
  REBOOK: "Dönüş takibi kaydedildi; yeni randevudan önce güncel durumu inceleyin.", WIN_BACK: "İlişki takibi açık; iletişim tercihlerini kontrol edin.", CARE_CHECK: "Bakım kontrolü için açık takip kaydı var.", COLOR_FOLLOWUP: "Renk sonucunun takibi için açık kayıt var.", RECOVERY_REASSESSMENT: "Teknik yeniden değerlendirme takibi açık.", DUPLICATE_REVIEW: "Benzer müşteri kayıtlarının insan incelemesi bekleniyor.",
};
export function TodayDashboard({ context }: { context: ActiveTenantContext }) {
  const { salon, actions, report, preparation, now, refresh } = useTodayData(context);
  const can = (p: string) => context.permissions.includes(p);
  const items = salon.data ? dayAppointments(salon.data, now) : [], next = nextAppointment(items, now);
  const counted = items.filter(a => !["CANCELLED", "NO_SHOW"].includes(a.status));
  const date = salon.data ? new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", weekday: "long", timeZone: salon.data.location.timezone }).format(new Date(now)) : null;
  const visibleActions = actions.data?.items.filter(a => can("crm.notes.technical") || !["COLOR_FOLLOWUP", "RECOVERY_REASSESSMENT"].includes(a.kind)) ?? [];
  const business = ["owner", "manager"].includes(context.role) && can("reports.read");
  const revenue = report.data?.metrics.find(m => m.name === "recognized_net_revenue" && m.unit === "MONEY");
  return <div className="today-workspace">
    <div className="today-heading"><div><h1>Bugün</h1><p className="today-date">{date ?? "Gün doğrulanıyor"}</p>
      {salon.data && <div className="today-day-summary"><span><strong>{salon.data.has_more ? "En az " : ""}{counted.length}</strong> randevu</span><span><strong>{counted.filter(a => a.colorlab_required).length}</strong> renk servisi</span><span>{salon.data.location.timezone}</span></div>}</div>
    </div>
    <nav className="today-command-strip" aria-label="Günlük hızlı işlemler"><span>Çalışmaya başla</span>
      {can("color_plan.read") && <Link href="/workspace/colorlab"><SalonIcon name="brush" />Renk çalışması <span aria-hidden="true">↗</span></Link>}
      {can("clients.create") && <Link href="/workspace/clients/new"><SalonIcon name="clients" />Müşteri ekle <span aria-hidden="true">+</span></Link>}
      {can("salon.read") && <Link href="/workspace/appointments"><SalonIcon name="calendar" />Randevular <span aria-hidden="true">↗</span></Link>}
    </nav>
    <div className="today-composition"><div className="today-main-column">
      {can("salon.read") && (salon.data ? <><NowNext a={next} context={context} preparation={preparation} /><Agenda items={items} context={context} preparation={preparation} selected={next?.id} />{salon.data.has_more && <p role="status">Ajanda 500 kayıtla sınırlı. Tam gün için randevu takvimini inceleyin.</p>}</> : <p role={salon.error ? "alert" : "status"} className="today-read-state">{salon.error ? "Günün ajandası alınamadı." : "Günün ajandası yükleniyor…"}{salon.error && <button className="text-link" onClick={refresh}>Yeniden dene</button>}</p>)}
      {!can("salon.read") && <div className="today-compact-empty">Randevu ajandasını görme yetkiniz yok. Erişiminize açık çalışma alanlarını menüden seçebilirsiniz.</div>}
    </div><aside className="today-context-column" aria-label="Hazırlık ve takip">
      {technicalAccess(context) && salon.data && <TechnicalPreparation items={items} preparation={preparation} context={context} />}
      {can("crm.read") && <TodayDisclosure className="today-action-center" title="Aksiyon merkezi" hint={actions.data ? `${visibleActions.length}${actions.data.has_more ? "+" : ""} açık` : "Takip"}><div className="today-disclosure-body">
        {actions.error ? <p role="alert">Takip kayıtları alınamadı. <button className="text-link" onClick={refresh}>Yeniden dene</button></p> : !actions.data ? <p role="status">Aksiyonlar yükleniyor…</p> : visibleActions.length ? <ul className="today-action-list">{visibleActions.map(a => <li key={a.id}><div><strong>{actionLabels[a.kind]}</strong><time dateTime={a.due_at}>{new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: salon.data?.location.timezone ?? "UTC" }).format(new Date(a.due_at))}</time></div><p>{actionReason[a.kind]}</p><Link className="text-link" href={`/workspace/clients/${a.client_id}`}>Güncel profili incele <span aria-hidden="true">→</span></Link></li>)}</ul> : <p className="today-compact-empty">Görünen listede açık takip aksiyonu yok.</p>}
        <Link className="today-section-link" href="/workspace/clients?view=actions">Takip merkezini aç <span aria-hidden="true">↗</span></Link>
      </div></TodayDisclosure>}
      {business && <details className="today-secondary today-business"><summary><span>İşletme bağlamı</span><small>Bugün</small></summary><div className="today-disclosure-body report-metrics">
        {report.error ? <p role="alert">İşletme özeti alınamadı. <button className="text-link" onClick={refresh}>Yeniden dene</button></p> : !report.data ? <p role="status">İşletme özeti yükleniyor…</p> : <><div className="today-revenue"><span>Tanınan net gelir</span><strong>{can("finance.view") && revenue ? reportMoney(revenue.value, report.data.currency) : "Görünür gelir verisi yok"}</strong></div><p className="today-section-note">{report.data.period.first_date} · {report.data.period.timezone}. Depozito hizmet geliri değildir. Bu değer tahsilat veya muhasebe kârı değildir.</p><p className="today-section-note">{report.data.freshness.status === "CURRENT" ? "Kaynak görünümü güncel" : "Kaynak görünümü güncelleme bekliyor"}</p>
          {report.data.insights.filter(i => can("stock.view") && i.metric === "low_stock" || can("cost.view") && i.metric === "unknown_transactions").map(i => <Link className="today-section-link" key={i.code} href={i.metric === "low_stock" ? "/workspace/stock" : "/workspace/finance/profitability"}>{i.value} {i.metric === "low_stock" ? "ürün stok eşiğinin altında" : "kaydın doğrudan maliyeti bilinmiyor"} <span aria-hidden="true">→</span></Link>)}<Link className="today-section-link" href="/workspace/reports">Kaynak raporunu aç <span aria-hidden="true">↗</span></Link></>}
      </div></details>}
    </aside></div>
  </div>;
}
