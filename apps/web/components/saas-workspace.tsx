"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { SalonFrame, SalonHeading, SalonCard } from "./salon-frame";
import { capabilityLabels, entitlementSnapshot, saasMessage, type EntitlementSnapshot } from "@/lib/saas/model";
import { tenantContextSchema, workspaceReference, type ActiveTenantContext } from "@/lib/tenant/context";

const stateLabels: Record<string, string> = { ACTIVE: "Aktif", TRIAL: "Deneme", GRACE: "Yapılandırılmış ek süre", PAST_DUE: "Ödeme durumu inceleme gerektiriyor", SUSPENDED: "Askıya alınmış", CANCELLED: "İptal edilmiş", UNCONFIGURED: "Yapılandırılmamış", EXPIRED: "Süresi dolmuş", TRIAL_EXPIRED: "Deneme süresi dolmuş" };
const quotaLabels: Record<string, string> = { LOCATIONS: "Aktif şubeler", ACTIVE_MEMBERS: "Aktif / davetli kişiler", STORAGE_BYTES: "Depolama · bayt", ENGINE_EXECUTIONS: "Başarılı Color Engine işlemleri" };
const quotaStates: Record<string, string> = { UNKNOWN: "Ölçüm veya sınır doğrulanamıyor", UNCAPPED: "Yapılandırılmış sayısal üst sınır yok", EXCEEDED: "Yeni sınır aşılıyor; mevcut kayıtlar korunur", AT_LIMIT: "Sınıra ulaşıldı", AVAILABLE: "Sınır içinde" };
export function SaasWorkspace() {
  const [data, setData] = useState<EntitlementSnapshot | null>(null), [ctx, setCtx] = useState<ActiveTenantContext | null>(null), [error, setError] = useState("");
  const [reason, setReason] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const epoch = useRef(0), requestId = useRef<string | null>(null);
  const conceal = useCallback(() => { epoch.current++; setData(null); setCtx(null); setReason(""); setNotice(""); }, []);
  const load = useCallback(async () => {
    if (document.hidden || !navigator.onLine) return;
    const token = ++epoch.current; setData(null); setCtx(null); setError("");
    try {
      const response = await fetch("/api/saas", { cache: "no-store", signal: AbortSignal.timeout(15000) }), body = await response.json();
      if (!response.ok) throw new Error(body.code ?? "NETWORK_ERROR");
      const snapshot = entitlementSnapshot.parse(body.data), context = tenantContextSchema.parse(body.context);
      if (snapshot.organization_id !== context.organization_id || snapshot.location_id !== context.location_id) throw new Error("TENANT_CONTEXT_INVALID");
      if (token !== epoch.current || document.hidden || !navigator.onLine) return;
      setData(snapshot); setCtx(context);
    } catch (e) { if (token === epoch.current) setError(e instanceof Error && e.message === "FORBIDDEN" ? "Hesap görünümü için yetkiniz yok." : "Hesap durumu yüklenemedi. Yeniden deneyin."); }
  }, []);
  useEffect(() => {
    const start = setTimeout(() => void load(), 0), timer = setInterval(() => void load(), 15000), refresh = () => void load(), visibility = () => { conceal(); if (!document.hidden) void load(); };
    window.addEventListener("blur", conceal); window.addEventListener("focus", refresh); window.addEventListener("offline", conceal); window.addEventListener("online", refresh); document.addEventListener("visibilitychange", visibility);
    return () => { clearTimeout(start); clearInterval(timer); conceal(); window.removeEventListener("blur", conceal); window.removeEventListener("focus", refresh); window.removeEventListener("offline", conceal); window.removeEventListener("online", refresh); document.removeEventListener("visibilitychange", visibility); };
  }, [load, conceal]);
  async function operate(type: "REQUEST_CHANGE" | "REBUILD_USAGE") {
    if (!ctx || busy || !navigator.onLine) return; setBusy(true); setNotice("");
    const token = epoch.current, reference = workspaceReference(ctx); requestId.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/saas", { method: "POST", headers: { "content-type": "application/json", "x-workspace-reference": reference }, body: JSON.stringify(type === "REQUEST_CHANGE" ? { type, request_id: requestId.current, reason } : { type }), cache: "no-store" });
      const body = await response.json(); if (!response.ok) throw new Error(body.code);
      if (token !== epoch.current || document.hidden || !navigator.onLine) return;
      if (type === "REQUEST_CHANGE") { requestId.current = null; setReason(""); setNotice("Değişiklik talebi kaydedildi. Abonelik durumu otomatik değiştirilmedi."); }
      else { await load(); setNotice("Kullanım özeti kalıcı kaynak olaylarından yeniden oluşturuldu."); }
    } catch (e) { if (token === epoch.current) setNotice(saasMessage(e instanceof Error ? e.message : "")); } finally { setBusy(false); }
  }
  return <SalonFrame active="settings" workspace={ctx?.organization_name}><main id="main-content" className="salon-main saas-workspace">
    <SalonHeading title="Plan, abonelik ve kullanım" description="Kuruluş hesabınızın yapılandırılmış erişimini ve kullanım sınırlarını inceleyin." actions={<button className="button button-secondary" onClick={() => void load()}>Yenile</button>} />
    <Link className="text-link" prefetch={false} href="/workspace/settings">Salon ayarlarına dön →</Link>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}{!data && !error && <p role="status">Hesap durumu yükleniyor…</p>}
    {data && <><SalonCard title="Abonelik durumu"><strong>{stateLabels[data.status]}</strong><p>Gözlem: {new Date(data.observed_at).toLocaleString("tr-TR", { timeZone: "UTC" })} UTC · sürüm {data.version}</p><p>Abonelik erişimi, mevcut kullanıcı izinlerinizden ayrıdır. Geçmiş kayıtlarınız normal izinlerle okunabilir; çalışan oturumların güvenli durdurma ve mutabakat işlemleri korunur.</p>{data.plan && <p>Plan: <strong>{data.plan.label}</strong> · tanım sürümü {data.plan.version}{data.plan.development_only && " · geliştirme yapılandırması"}</p>}{!data.management_allowed && <p>Plan yönetimi ve kuruluş kullanım ayrıntıları kuruluş sahibine açıktır.</p>}</SalonCard>
    <div className="saas-columns"><SalonCard title="Yapılandırılmış yetenekler"><div className="saas-capabilities">{data.entitlements.map(e => <article key={e.capability}><strong>{capabilityLabels[e.capability]}</strong><p>{e.creation_allowed ? "Yeni işler için abonelik erişimi açık" : e.reason === "FEATURE_NOT_INCLUDED" ? "Bu özellik mevcut planda yer almıyor." : saasMessage(data.status === "UNCONFIGURED" ? "SAAS_UNCONFIGURED" : "SUBSCRIPTION_RESTRICTED")}</p></article>)}</div></SalonCard>
    {data.management_allowed && <SalonCard title="Kullanım ve sınırlar">{data.period ? <p>{new Date(data.period.start).toLocaleString("tr-TR", { timeZone: "UTC" })} – {new Date(data.period.end).toLocaleString("tr-TR", { timeZone: "UTC" })} UTC (son an hariç)</p> : <p>Geçerli kullanım dönemi yapılandırılmamış.</p>}<dl className="saas-quotas">{data.quotas.map(q => <div key={q.code}><dt>{quotaLabels[q.code]}</dt><dd><strong>{q.used ?? "Bilinmiyor"}{q.limit !== null ? ` / ${q.limit}` : ""}</strong><p>{quotaStates[q.status]}</p></dd></div>)}</dl><button className="button button-secondary" disabled={busy} onClick={() => void operate("REBUILD_USAGE")}>Kullanım özetini yeniden oluştur</button>{data.diagnostics?.usage_projection_mismatch && <p role="alert">Kullanım özeti kalıcı olaylarla farklı. Yeniden oluşturun.</p>}</SalonCard>}</div>
    {data.management_allowed && <SalonCard title="Plan değişikliği talebi"><form onSubmit={e => { e.preventDefault(); void operate("REQUEST_CHANGE"); }}><label>Talep nedeni<textarea aria-label="Talep nedeni" required maxLength={500} value={reason} onChange={e => { setReason(e.target.value); requestId.current = null; }} /></label><button className="button button-primary" disabled={busy || !reason.trim()}>Değişiklik talebi kaydet</button></form><p>Talep inceleme için kaydedilir. Ticari ödeme veya otomatik yükseltme işlemi oluşturmaz.</p></SalonCard>}</>}
  </main></SalonFrame>;
}
