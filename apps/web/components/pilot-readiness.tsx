"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SalonFrame, SalonHeading, SalonCard } from "./salon-frame";
import { feedbackCategories, reviewDimensions, feedbackDocument } from "@/lib/pilot/feedback";
type Release={gitSha:string;colorEngineVersion:string;catalogs:unknown[];publishedCatalogs?:unknown[];migrationHead:string;buildVersion:string};
const setup=[
 ["Salon, şube, saat dilimi ve çalışma saatleri","/workspace/settings"],
 ["Ekip, roller ve teknik yetkinlikler","/workspace/team"],
 ["Hizmetler, süreler, fiyatlar ve kaynaklar","/workspace/settings"],
 ["Stok kalemleri, birimler ve ölçülen açılış","/workspace/stock"],
 ["İlk müşteri","/workspace/clients/new"],
 ["Müşteri profilinden ilk Hair Passport","/workspace/clients"],
 ["İlk hedef ve Color Engine değerlendirmesi","/workspace/colorlab"],
 ["Ana para birimi ve kasa düzeni","/workspace/finance"],
 ["Plan, Color Engine hakkı ve sonlu kotalar","/workspace/settings/subscription"],
 ["Raporlar ve yetkili veri dışa aktarımı","/workspace/reports"],
] as const;
export function PilotReadiness() {
 const [release,setRelease]=useState<Release|null>(null),[error,setError]=useState("");
 const [category,setCategory]=useState<typeof feedbackCategories[number]>(feedbackCategories[0]),[severity,setSeverity]=useState("P3"),[comment,setComment]=useState(""),[ratings,setRatings]=useState<(number|null)[]>(Array(10).fill(null)),[consent,setConsent]=useState(false);
 useEffect(()=>{
  let alive=true,epoch=0;
  const clear=()=>{epoch++;setRelease(null);setComment("");setRatings(Array(10).fill(null));setConsent(false);};
  const load=async()=>{clear();const generation=epoch;if(document.hidden||!navigator.onLine)return;try{const r=await fetch("/api/pilot/status",{cache:"no-store",signal:AbortSignal.timeout(10000)});const b=await r.json();if(!alive||generation!==epoch||document.hidden||!navigator.onLine)return;if(!r.ok)throw Error();setRelease(b.data.release);setError("");}catch{if(alive&&generation===epoch)setError("Pilot tanılaması doğrulanamadı. Oturumu ve ortam yapılandırmasını kontrol edin.");}};
  const visibility=()=>{if(document.hidden)clear();else void load();};
  void load();const timer=setInterval(()=>void load(),60000);window.addEventListener("focus",load);window.addEventListener("online",load);window.addEventListener("offline",clear);window.addEventListener("elifora-offline-lock",clear);document.addEventListener("visibilitychange",visibility);
  return()=>{alive=false;clearInterval(timer);window.removeEventListener("focus",load);window.removeEventListener("online",load);window.removeEventListener("offline",clear);window.removeEventListener("elifora-offline-lock",clear);document.removeEventListener("visibilitychange",visibility);};
 },[]);
 function download(){if(!release||!consent)return;const body=feedbackDocument({category,severity,comment,ratings},release),url=URL.createObjectURL(new Blob([JSON.stringify(body,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download="elifora-pilot-feedback.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),0);}
 return <SalonFrame active="settings"><main className="salon-main pilot-readiness" id="main-content"><SalonHeading title="Kontrollü pilot hazırlığı" description="Color Engine, uzmanın kararını destekler. Pilot katılımı ayrıca onay gerektirir."/>
 {error&&<p role="alert">{error}</p>}{!release&&!error&&<p role="status">Sürüm ve oturum doğrulanıyor…</p>}
 {release&&<><SalonCard title="İlk gün kurulum sırası"><p>Bu kılavuz teknik veya işletme onayı vermez. Her bağlantıda mevcut yetki ve abonelik denetimleri uygulanır. Adımlar otomatik tamamlandı sayılmaz.</p><ol>{setup.map(([label,href])=><li key={label}><Link prefetch={false} href={href}>{label}</Link></li>)}</ol></SalonCard>
 <SalonCard title="Hedef, strateji ve reçete farklıdır"><p>Geniş hedef tanımı desteklenir. Teknik strateji, doğrulanmış üretici eşleşmesi ve kontrollü reçete ayrı değerlendirilir.</p><p>Doğrulanmış kapsam: Schwarzkopf Professional · IGORA ROYAL ABSOLUTES · 29 ton · 2 geliştirici · 58 kural · 3 resmî belge. Yeni doğrulanmış marka: 0.</p><p>Uygun tek dip bölgesi ve dip yenileme koşullarında uzman doğrulanmış tonu seçer. Diğer hedeflerde strateji bulunabilir; doğrulanmış üretici reçetesi bulunmayabilir. Güncel kanıtı ve fiziksel testleri tamamlayın; uygun ürün kapsamı için teknik kaynak incelemesi isteyin.</p><p>Web, ColorLab pilotunun birincil yüzeyidir. Android ColorLab eşdeğerliği ve bilimsel sonuç doğrulaması iddia edilmez.</p></SalonCard>
 <SalonCard title="Sürüm ve destek"><dl><dt>Git</dt><dd>{release.gitSha}</dd><dt>Yapı</dt><dd>{release.buildVersion}</dd><dt>Color Engine</dt><dd>{release.colorEngineVersion}</dd><dt>Veritabanı sürümü</dt><dd>{release.migrationHead}</dd></dl><p>Bu kontrol yapılandırmayı doğrular; hosted e-posta, yedek geri yükleme ve uzman incelemesini kanıtlamaz.</p><p>P0: güvenlik / teknik güvenlik / veri kaybı. Etkilenen iş akışını durdurun ve salonun belirlenmiş pilot destek sorumlusuna bildirin. P1: engellenen iş akışı. Hata kodunu, ekrandaki korelasyon kimliğini ve sürümü paylaşın; müşteri içeriğini eklemeyin.</p></SalonCard>
 <SalonCard title="Uzman değerlendirmesi ve geri bildirim"><p>Dosya yalnızca burada yazdıklarınızı ve güvenli sürüm bilgisini içerir. Kendiliğinden gönderilmez veya saklanmaz. İndirdikten sonra belirlenmiş destek sürecinizle paylaşın. Müşteri adı, fotoğraf, teknik içerik veya mali veri yazmayın.</p><form onSubmit={e=>{e.preventDefault();download();}}><label>Kategori<select aria-label="Kategori" value={category} onChange={e=>setCategory(e.target.value as typeof category)}>{feedbackCategories.map(c=><option key={c}>{c}</option>)}</select></label><label>Önem<select aria-label="Önem" value={severity} onChange={e=>setSeverity(e.target.value)}>{["P0","P1","P2","P3"].map(s=><option key={s}>{s}</option>)}</select></label>{reviewDimensions.map((d,i)=><label key={d}>{d}<select aria-label={d} value={ratings[i]??""} onChange={e=>setRatings(r=>r.map((v,j)=>i===j?e.target.value?Number(e.target.value):null:v))}><option value="">Değerlendirilmedi</option>{[1,2,3,4,5].map(v=><option key={v}>{v}</option>)}</select></label>)}<label>Yorum<textarea aria-label="Yorum" maxLength={2000} value={comment} onChange={e=>setComment(e.target.value)}/></label><label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>Dosya içeriğini kontrol ettim; bu cihazda indirmek istiyorum.</label><button className="button button-primary" disabled={!consent}>Geri bildirim dosyasını indir</button></form><p>Puanlar Color Engine kurallarını veya doğrulanmış kataloğu otomatik değiştirmez.</p></SalonCard></>}
 </main></SalonFrame>;
}
