"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { discoveryLabels, discoveryStates, registryPage, unsupportedRegistryMessage, type RegistryPage } from "@/lib/brand/registry-model";
import { SalonCard, SalonFrame, SalonHeading } from "./salon-frame";

function useRegistry(search: string, enabled = true) {
 const [page, setPage] = useState<RegistryPage | null>(null);
 const [error, setError] = useState("");
 useEffect(() => {
  if (!enabled) return;
  const controller = new AbortController();
  let active = true;
  fetch(`/api/color-registry?${search}`, { cache: "no-store", signal: controller.signal }).then(async response => {
   if (!response.ok) throw new Error("Katalog yüklenemedi. Bağlantınızı ve çalışma alanı erişiminizi kontrol edin.");
   const next = registryPage.parse((await response.json()).data);
   if (active) { setPage(next); setError(""); }
  }).catch(error => { if (active) { setPage(null); setError(error instanceof Error ? error.message : "Katalog yüklenemedi."); } });
  return () => { active = false; controller.abort(); };
 }, [search, enabled]);
 return { page, error };
}

export function ColorRegistryLibrary() {
 const [search, setSearch] = useState("limit=25");
 const { page, error } = useRegistry(search);
 function paginate(offset: number) { const params = new URLSearchParams(search); params.set("offset", String(offset)); setSearch(params.toString()); }
 return <SalonFrame active="colorlab"><main id="main-content" className="salon-main">
  <SalonHeading title="Marka kütüphanesi" description="ELIFORA’da listelenen seriler ve doğrulanmış teknik reçete desteği." actions={<Link href="/workspace/colorlab" className="button button-secondary">ColorLab’a dön</Link>} />
  <div className="salon-notice"><strong>Katalogda bulunması reçete desteği anlamına gelmez.</strong><p>Pazarlar birbirinin yerine geçmez. UNKNOWN, bölgesel kapsamın henüz doğrulanmadığını belirtir. Ton ve geliştirici sayıları yalnızca kaydedilen metadata satırlarıdır; üreticinin toplam ürün sayısı değildir.</p></div>
  <SalonCard><form className="salon-form-grid" onSubmit={event => {
   event.preventDefault(); const data = new FormData(event.currentTarget); const params = new URLSearchParams({ limit: "25" });
   for (const [key, value] of data) if (String(value)) params.set(key, String(value)); setSearch(params.toString());
  }}>
   <label>Marka veya seri ara<input type="search" name="query" maxLength={80}/></label>
   <label>Marka<select name="brand"><option value="">Tüm markalar</option>{page?.brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label>
   <label>Pazar<select name="region"><option value="">Tüm pazarlar</option>{page?.regions.map(region => <option key={region}>{region}</option>)}</select></label>
   <label>İnceleme durumu<select name="state"><option value="">Tüm durumlar</option>{discoveryStates.map(state => <option key={state} value={state}>{discoveryLabels[state]}</option>)}</select></label>
   <button className="button button-primary">Filtrele</button>
  </form></SalonCard>
  {error && <p role="alert">{error}</p>}{!page && !error && <p role="status">Katalog yükleniyor…</p>}
  {page && <div className="salon-stack"><p role="status">{page.total} bölgesel kayıt · Sayfa {Math.floor(page.offset / page.limit) + 1}</p>
   {!page.items.length && <SalonCard><p>Bu filtrelerde seri bulunamadı. Reçete verisi başka bir markadan tamamlanmaz.</p></SalonCard>}
   {page.items.map(entry => <SalonCard key={entry.id} title={`${entry.brand} · ${entry.line}`}>
    <div className="salon-toolbar"><span className="salon-badge">ELIFORA kataloğunda mevcut</span><span className={`salon-badge ${entry.recipeSupport ? "success" : "warning"}`}>{discoveryLabels[entry.state]}</span><span>Pazar: {entry.region}</span></div>
    <p>{entry.manufacturer} · Ton metadata: {entry.shadeCount} · Geliştirici metadata: {entry.developerCount} · Yayınlanmış kural: {entry.ruleCount}</p>
    <p>Son teknik inceleme: {entry.lastReviewedAt ? new Date(entry.lastReviewedAt).toLocaleDateString("tr-TR") : "Henüz yapılmadı"}</p>
    <p>{entry.recipeSupport ? "Doğrulanmış reçete desteği mevcut. Güvenlik ve bağlama özel uyumluluk ayrıca kontrol edilir." : unsupportedRegistryMessage}</p>
    <details><summary>{entry.sources.length} resmî kaynak · {entry.sources.some(source => ["TECHNICAL_GUIDE", "IFU", "COMPATIBILITY_GUIDE"].includes(source.documentType)) ? "Teknik belge toplandı; inceleme gerekir" : "Teknik kural doğrulaması eksik"}</summary>
     {entry.sources.map(source => <div key={source.id} style={{ overflowWrap: "anywhere", paddingBlock: 12 }}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a><p>{source.documentType} · {source.region} · {source.language} · {source.reviewStatus}</p><p>Belge sürümü: {source.documentVersion ?? "UNKNOWN"} · Belge tarihi: {source.documentDate ?? "UNKNOWN"}</p><p>Toplandı: {new Date(source.retrievedAt).toLocaleDateString("tr-TR")} · SHA-256: <code>{source.sha256}</code></p></div>)}
    </details>
   </SalonCard>)}
   <div className="salon-toolbar"><button className="button button-secondary" disabled={!page.offset} onClick={() => paginate(Math.max(0, page.offset - page.limit))}>Önceki</button><button className="button button-secondary" disabled={page.offset + page.limit >= page.total || page.offset >= 10000} onClick={() => paginate(page.offset + page.limit)}>Sonraki</button></div>
  </div>}
 </main></SalonFrame>;
}

/** Information-only selection has no catalog ID, product or execution side effect. */
export function CatalogDiscoverySelector() {
 const [enabled, setEnabled] = useState(false);
 const { page, error } = useRegistry("limit=50", enabled);
 const [selected, setSelected] = useState("");
 const entry = page?.items.find(item => item.id === selected);
 return <SalonCard title="Marka ve seri keşfi"><details onToggle={event => { if (event.currentTarget.open) setEnabled(true); }}><summary onClick={() => setEnabled(true)}>Listelenen serileri incele</summary><p>Bu seçim bilgi amaçlıdır; kontrollü reçetenin üretici seçimini değiştirmez.</p>
  {enabled && !page && !error && <p role="status">Seriler yükleniyor…</p>}{error && <p role="alert">{error}</p>}
  <label>Listelenen seri<select value={selected} onChange={event => setSelected(event.target.value)}><option value="">Seri inceleyin</option>{page?.items.map(item => <option key={item.id} value={item.id}>{item.brand} · {item.line} · {item.region}</option>)}</select></label>
  {entry && <p role="status">{entry.recipeSupport ? "Yayınlanmış destek mevcut; kontrollü reçetede bağlama özel doğrulama gerekir." : unsupportedRegistryMessage}</p>}
  </details>
  <Link href="/workspace/catalog" className="button button-secondary">Marka kütüphanesini aç</Link>
 </SalonCard>;
}
