"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "./app-shell";
import { type ActiveTenantContext, tenantContextSchema, workspaceReference } from "@/lib/tenant/context";
import { type Candidate, type Client, type Directory, clientDetail, clientDirectory, duplicateCandidate, clientErrorText } from "@/lib/clients/contracts";
import { formatClientDate as date } from "@/lib/clients/display";

type Draft = { full_name: string; phone: string; email: string; birth_date: string; request_id: string; expected_version?: number };
type Review = { candidates: Candidate[]; token: string };
export function ClientWorkspace({ route }: { route: string }) {
  const router = useRouter();
  const [context, setContext] = useState<ActiveTenantContext | null>(null);
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [archive, setArchive] = useState(false);
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ code: string; correlationId?: string } | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState({ query: "", status: "ACTIVE", offset: 0 });
  const generation = useRef(0);
  const scope = useRef<string | null>(null);
  const busy = useRef(false);
  const archiveRequest = useRef<string | null>(null);
  const call = useCallback(async (operation: string, payload: object) => {
    const concealAccess = () => {
      generation.current++; setVisible(false); setContext(null); setDirectory(null);
      setClient(null); setDraft(null); setReview(null); setArchive(false);
    };
    const response = await fetch("/api/clients", { method: "POST", headers: { "Content-Type": "application/json", ...(scope.current ? { "X-Workspace-Reference": scope.current } : {}) }, body: JSON.stringify({ operation, payload }), cache: "no-store", signal: AbortSignal.timeout(10000) });
    const body = await response.json();
    if (response.status === 401) { concealAccess(); window.location.replace("/sign-in?reason=SESSION_EXPIRED"); throw new Error("SESSION_EXPIRED"); }
    if (["TENANT_CONTEXT_INVALID", "MEMBERSHIP_REQUIRED", "MEMBERSHIP_REVOKED"].includes(body.code)) { concealAccess(); window.location.replace("/auth/workspace-reset"); throw new Error(body.code); }
    if (body.context) {
      const next = tenantContextSchema.parse(body.context);
      const reference = workspaceReference(next);
      if (scope.current && scope.current !== reference) { concealAccess(); window.location.replace("/workspace/clients"); throw new Error("TENANT_CONTEXT_INVALID"); }
      scope.current = reference;
    }
    return body;
  }, []);
  const verify = useCallback(async () => {
    if (busy.current || document.hidden || !navigator.onLine) return;
    busy.current = true;
    const current = ++generation.current;
    setVisible(false);
    try {
      const body = await call(route === "directory" || route === "new" ? "list" : "detail", route === "directory" ? { ...filter, limit: 25 } : route === "new" ? { limit: 1 } : { client_id: route });
      if (current !== generation.current || document.hidden || !navigator.onLine) return;
      if (body.code) { setError(body); return; }
      const next = tenantContextSchema.parse(body.context);
      if (route === "new" && !next.permissions.includes("clients.create")) { setError({ code: "FORBIDDEN" }); return; }
      setContext(next);
      if (route === "directory") setDirectory(clientDirectory.parse(body.data));
      else if (route !== "new") {
        const loaded = clientDetail.parse(body.data); setClient(loaded);
        if (!next.permissions.includes("clients.update") || loaded.status === "ARCHIVED") { setDraft(null); setReview(null); }
        if (!next.permissions.includes("clients.archive")) setArchive(false);
      }
      else setDraft(previous => previous ?? { full_name: "", phone: "", email: "", birth_date: "", request_id: crypto.randomUUID() });
      setError(null); setVisible(true);
    } catch { if (current === generation.current) setError({ code: "NETWORK_ERROR" }); }
    finally { busy.current = false; }
  }, [route, filter, call]);
  useEffect(() => {
    let mounted = true;
    const invalidate = () => { generation.current++; };
    const hide = () => { generation.current++; setVisible(false); if (!document.hidden) void verify(); };
    const offline = () => { generation.current++; setVisible(false); setError({ code: "NETWORK_ERROR" }); };
    const timer = window.setInterval(() => void verify(), 15000);
    queueMicrotask(() => { if (mounted) void verify(); });
    window.addEventListener("focus", verify); window.addEventListener("online", verify); window.addEventListener("pageshow", verify);
    window.addEventListener("offline", offline); document.addEventListener("visibilitychange", hide);
    return () => { mounted = false; invalidate(); clearInterval(timer); window.removeEventListener("focus", verify); window.removeEventListener("online", verify); window.removeEventListener("pageshow", verify); window.removeEventListener("offline", offline); document.removeEventListener("visibilitychange", hide); };
  }, [verify]);
  async function mutate(operation: string, payload: object) {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError(null);
    const current = ++generation.current;
    try {
      const body = await call(operation, payload);
      if (current !== generation.current || document.hidden || !navigator.onLine) return;
      if (body.code === "DUPLICATE_CLIENT_CANDIDATES") {
        setReview({ candidates: duplicateCandidate.array().parse(body.candidates), token: body.confirmation_token });
      } else if (body.code) {
        setError(body);
        if (body.code === "DUPLICATE_CONFIRMATION_INVALID") setReview(null);
        if (body.code === "FORBIDDEN") setVisible(false);
      } else {
        const saved = clientDetail.parse(body.data);
        if (operation === "create") { router.push(`/workspace/clients/${saved.id}`); return; }
        setClient(saved); setDraft(null); setReview(null); setArchive(false); archiveRequest.current = null;
      }
    } catch { if (current === generation.current) setError({ code: "NETWORK_ERROR" }); }
    finally { busy.current = false; setSaving(false); }
  }
  function save(token?: string) {
    if (!draft) return;
    void mutate(route === "new" ? "create" : "update", { ...draft, phone_region: "TR", ...(route === "new" ? {} : { client_id: route }), ...(token ? { confirmation_token: token } : {}) });
  }
  function changeField(field: keyof Draft, value: string) {
    setDraft(previous => previous && { ...previous, [field]: value, request_id: crypto.randomUUID() }); setReview(null); setError(null);
  }
  return <AppShell><main id="main-content" className="narrow-page clients-page">
    <nav aria-label="Müşteri gezintisi"><Link prefetch={false} href="/workspace">Çalışma alanı</Link><span aria-hidden="true"> / </span><Link prefetch={false} href="/workspace/clients">Müşteriler</Link></nav>
    {error && <div role="alert" className="client-notice"><p>{clientErrorText[error.code] ?? "Erişim doğrulanamadı. Yeniden deneyin."}</p>{error.correlationId && <small>İşlem: {error.correlationId}</small>}
      <div><button className="button button-secondary" onClick={() => void verify()}>Yeniden dene</button></div>
      {error.code === "CONFLICT" && <Link prefetch={false} href={`/workspace/clients/${route}`}>Güncel kaydı aç</Link>}</div>}
    {!visible ? <p role="status">{error ? "Müşteri bilgileri gösterilemiyor." : "Güvenli çalışma alanı yükleniyor…"}</p> : <>
      <p className="eyebrow">{context?.organization_name} · {context?.location_name}</p>
      {route === "directory" ? <>
        <div className="client-heading"><h1>Müşteriler</h1>{context?.permissions.includes("clients.create") && <Link prefetch={false} className="button button-primary" href="/workspace/clients/new">Yeni müşteri</Link>}</div>
        <p className="lead">Salonunuzun müşteri rehberi.</p>
        <form className="client-search" onSubmit={event => { event.preventDefault(); setFilter({ ...filter, query, offset: 0 }); }}>
          <label htmlFor="client-search">Ad soyad veya telefon</label><div className="client-actions"><input id="client-search" value={query} onChange={event => setQuery(event.target.value)} maxLength={80} type="search" /><button className="button button-secondary">Ara</button></div>
          <label htmlFor="client-status">Kayıt durumu</label><select id="client-status" value={filter.status} onChange={event => setFilter({ ...filter, status: event.target.value, offset: 0 })}><option value="ACTIVE">Aktif müşteriler</option><option value="ARCHIVED">Arşivlenen müşteriler</option></select>
        </form>
        {directory?.items.length === 0 ? <div className="client-notice"><h2>{filter.query ? "Eşleşen müşteri bulunamadı" : "Henüz müşteri yok"}</h2><p>{filter.query ? "Adı veya telefon numarasını kontrol edin." : "İlk müşterinizi yalnızca ad soyad ve telefonla oluşturun."}</p></div> : <ul className="client-list">{directory?.items.map(item => <li key={item.id}><Link prefetch={false} href={`/workspace/clients/${item.id}`}><strong>{item.full_name}</strong><span>{item.phone_masked}</span><small>{item.status === "ARCHIVED" ? "Arşivde · " : ""}Güncelleme: {date(item.updated_at)}</small></Link></li>)}</ul>}
        <div className="client-actions"><button className="button button-secondary" disabled={!filter.offset} onClick={() => setFilter({ ...filter, offset: Math.max(0, filter.offset - 25) })}>Önceki</button><span>Sayfa {filter.offset / 25 + 1}</span><button className="button button-secondary" disabled={!directory?.has_more || filter.offset >= 10000} onClick={() => setFilter({ ...filter, offset: filter.offset + 25 })}>Sonraki</button></div>
      </> : <>
        <h1>{route === "new" ? "Yeni müşteri" : draft ? "Müşteriyi düzenle" : client?.full_name}</h1>
        {draft ? <form className="auth-form client-form" onSubmit={event => { event.preventDefault(); save(); }}>
          <fieldset disabled={saving || !!review}><legend>Temel bilgiler</legend>
            <label htmlFor="full-name">Ad Soyad *</label><input id="full-name" autoComplete="name" required minLength={2} maxLength={160} value={draft.full_name} onChange={event => changeField("full_name", event.target.value)} />
            <label htmlFor="phone">Telefon *</label><input id="phone" type="tel" autoComplete="tel" required minLength={8} maxLength={40} aria-describedby="phone-hint" value={draft.phone} onChange={event => changeField("phone", event.target.value)} /><small id="phone-hint">Türkiye için 05…; diğer ülkeler için + ülke koduyla yazın.</small>
            <label htmlFor="email">E-posta</label><input id="email" type="email" autoComplete="email" maxLength={254} value={draft.email} onChange={event => changeField("email", event.target.value)} />
            <label htmlFor="birth-date">Doğum Tarihi</label><input id="birth-date" type="date" min="1900-01-01" max={new Date().toISOString().slice(0, 10)} value={draft.birth_date} onChange={event => changeField("birth_date", event.target.value)} />
          </fieldset>
          {!review && <button className="button button-primary" disabled={saving}>{saving ? "Kaydediliyor…" : route === "new" ? "Müşteri Oluştur" : "Değişiklikleri kaydet"}</button>}
          {route !== "new" && <button type="button" disabled={saving} className="button button-secondary" onClick={() => { setDraft(null); setReview(null); setError(null); }}>Vazgeç</button>}
        </form> : client && <>
          <p className="client-status">{client.status === "ACTIVE" ? "Aktif müşteri" : "Arşivde"}</p>
          <dl className="client-details"><dt>Telefon</dt><dd>{client.phone}</dd><dt>E-posta</dt><dd>{client.email ?? "Eklenmedi"}</dd><dt>Doğum Tarihi</dt><dd>{client.birth_date ? date(client.birth_date) : "Eklenmedi"}</dd><dt>Oluşturma</dt><dd>{date(client.created_at)}</dd><dt>Son güncelleme</dt><dd>{date(client.updated_at)}</dd></dl>
          <div className="client-actions">{client.status === "ACTIVE" && context?.permissions.includes("clients.update") && <button className="button button-primary" disabled={saving} onClick={() => setDraft({ full_name: client.full_name, phone: client.phone, email: client.email ?? "", birth_date: client.birth_date ?? "", expected_version: client.version, request_id: crypto.randomUUID() })}>Düzenle</button>}
          {context?.permissions.includes("clients.archive") && <button className="button button-secondary" disabled={saving} onClick={() => {
            archiveRequest.current ??= crypto.randomUUID();
            if (client.status === "ACTIVE") setArchive(true);
            else void mutate("restore", { client_id: client.id, expected_version: client.version, request_id: archiveRequest.current });
          }}>{client.status === "ACTIVE" ? "Arşivle" : "Arşivden çıkar"}</button>}</div>
          {archive && <section className="client-notice" aria-label="Arşiv onayı"><h2>Müşteri arşivlensin mi?</h2><p>Kayıt korunur ve aktif müşteri listesinden kaldırılır. Daha sonra arşivden çıkarabilirsiniz.</p><div className="client-actions"><button className="button button-primary" disabled={saving} onClick={() => void mutate("archive", { client_id: client.id, expected_version: client.version, request_id: archiveRequest.current })}>Evet, arşivle</button><button className="button button-secondary" disabled={saving} onClick={() => setArchive(false)}>Vazgeç</button></div></section>}
        </>}
        {review && <section className="client-notice" aria-label="Benzer müşteri incelemesi"><h2>Benzer müşteri bulundu</h2><p>Mevcut kaydı açın veya farklı bir kişi olduğunu doğrulayın. Kayıtlar birleştirilmez.</p><ul className="client-list">{review.candidates.map(candidate => <li key={candidate.id}><Link prefetch={false} href={`/workspace/clients/${candidate.id}`}><strong>{candidate.full_name}</strong><span>{candidate.phone_masked}</span><small>{candidate.signals.includes("PHONE") ? "Aynı telefon · " : "Benzer bilgiler · "}{candidate.status === "ARCHIVED" ? "Arşivde · " : ""}Son güncelleme: {date(candidate.updated_at)}</small><span>Mevcut müşteriyi aç</span></Link></li>)}</ul><div className="client-actions"><button className="button button-primary" disabled={saving} onClick={() => save(review.token)}>Farklı kişi olduğunu onaylıyorum</button><button className="button button-secondary" disabled={saving} onClick={() => { setReview(null); setError(null); }}>Bilgileri gözden geçir</button></div></section>}
      </>}
    </>}
  </main></AppShell>;
}
