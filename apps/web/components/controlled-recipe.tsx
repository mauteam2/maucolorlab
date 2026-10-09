"use client";
import { useEffect, useRef, useState } from "react";
import { controlledCatalogs, controlledOptions, storedControlledRecipe, colorGrams } from "@/lib/brand/controlled-model";
import { SalonCard } from "./salon-frame";
import Link from "next/link";
import {RecipeStockAvailability} from "./recipe-stock-availability";
type Saved=ReturnType<typeof storedControlledRecipe.parse>;
type Props={clientId:string;planId:string;reference:string;enabled:boolean;canCreate:boolean;stockEnabled?:boolean};
const errors:Record<string,string>={COLOR_PLAN_SOURCE_CONFLICT:"Saç kaydı değişti. Yeni renk planı oluşturun.",CONTROLLED_RECIPE_CONTEXT_INVALID:"Güncel değerlendirme veya üretici koşulları bu seçime izin vermiyor.",CONTROLLED_RECIPE_VERSION_CONFLICT:"Bu sürüm değişmiş. Geçmişi yeniden yükleyin.",TENANT_CONTEXT_INVALID:"Çalışma alanını yeniden doğrulayın.",VALIDATION_FAILED:"Ton ve boya miktarını kontrol edin.",FORBIDDEN:"Bu işlem için yetkiniz yok."};
export function ControlledRecipe({clientId,planId,reference,enabled,canCreate,stockEnabled=false}:Props){
 const [catalogs,setCatalogs]=useState<ReturnType<typeof controlledCatalogs.parse>>([]),[catalogId,setCatalogId]=useState("");
 const [options,setOptions]=useState<ReturnType<typeof controlledOptions.parse>|null>(null),[pair,setPair]=useState(""),[grams,setGrams]=useState("");
 const [history,setHistory]=useState<Saved[]>([]),[saved,setSaved]=useState<Saved|null>(null),[parent,setParent]=useState<Saved|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[refresh,setRefresh]=useState(0);
 const generation=useRef(0),nonce=useRef<string|null>(null);
 useEffect(()=>{
  const generationRef=generation,current=++generationRef.current,controller=new AbortController();
  if(!enabled)return;
  async function load(){try{
   const [a,b]=await Promise.all([fetch("/api/controlled-brand-recipes/catalogs",{cache:"no-store",signal:controller.signal}),fetch(`/api/controlled-brand-recipes?client_id=${clientId}`,{cache:"no-store",signal:controller.signal})]);
   const [ca,hi]=await Promise.all([a.json(),b.json()]);if(!a.ok||!b.ok)throw new Error(ca.code??hi.code);
   const list=controlledCatalogs.parse(ca.data),records=storedControlledRecipe.array().parse(hi.data);
   if(current!==generation.current)return;setCatalogs(list);setCatalogId(old=>list.some(c=>c.id===old)?old:list[0]?.id??"");setHistory(records);setError(null);
  }catch(e){if(current===generation.current&&!controller.signal.aborted)setError(errors[e instanceof Error?e.message:""]??"Bağlantı kurulamadı. Yeniden deneyin.");}}
  void load();return()=>{++generationRef.current;controller.abort();};
 },[clientId,planId,reference,enabled,refresh]);
 function edit(){nonce.current=null;setSaved(null);setError(null);}
 async function request(create:boolean){
  if(busy||!enabled)return;const current=generation.current;setBusy(true);setError(null);
  try{
   const candidate=options?.candidates.find(c=>`${c.productId}:${c.developerId}`===pair);
   if(create&&(!candidate||!colorGrams.safeParse(Number(grams)).success))throw new Error("VALIDATION_FAILED");
   if(create)nonce.current??=crypto.randomUUID();
   const payload={client_id:clientId,plan_id:planId,catalog_id:catalogId,...(create?{request_id:nonce.current,product_id:candidate!.productId,developer_id:candidate!.developerId,color_grams:Number(grams),supersedes_id:parent?.id??null}:{})};
   const response=await fetch(`/api/controlled-brand-recipes${create?"":"/options"}`,{method:"POST",headers:{"Content-Type":"application/json","X-Workspace-Reference":reference},body:JSON.stringify(payload),cache:"no-store",signal:AbortSignal.timeout(15000)});
   const body=await response.json();if(!response.ok)throw new Error(body.code);
   if(current!==generation.current||document.hidden||!navigator.onLine)return;
   if(create){const record=storedControlledRecipe.parse(body.data);if(record.clientId!==clientId||record.planId!==planId||record.catalogId!==catalogId)throw new Error("TENANT_CONTEXT_INVALID");setSaved(record);setParent(record);nonce.current=null;setRefresh(x=>x+1);}
   else{const result=controlledOptions.parse(body.data);if(result.catalogId!==catalogId)throw new Error("TENANT_CONTEXT_INVALID");setOptions(result);setPair("");edit();}
  }catch(e){if(current===generation.current)setError(errors[e instanceof Error?e.message:""]??"İşlem tamamlanamadı. Aynı girdilerle yeniden deneyebilirsiniz.");}
  finally{setBusy(false);}
 }
 const candidate=options?.candidates.find(c=>`${c.productId}:${c.developerId}`===pair);
 return <section hidden={!enabled} aria-label="Kontrollü marka reçetesi" style={{marginTop:24}}><SalonCard title="Kontrollü marka reçetesi">
 <p>IGORA ROYAL ABSOLUTES · Dip yenileme. Ton ve boya gramı uzman seçiminizdir. Sistem doğrulanmış 1:1 oranını hesaplar; uygulama izni vermez.</p>
 {error&&<p className="salon-notice" role="alert">{error}<button className="button button-secondary" onClick={()=>setRefresh(x=>x+1)}>Geçmişi yeniden yükle</button></p>}
 <div className="salon-form-grid"><label>Doğrulanmış katalog<select disabled={busy} value={catalogId} onChange={e=>{setCatalogId(e.target.value);setOptions(null);setPair("");edit();}}><option value="">Yayımlanmış katalog seçin</option>{catalogs.map(c=><option key={c.id} value={c.id}>IGORA ROYAL ABSOLUTES · Sürüm {c.version}</option>)}</select></label><div className="salon-toolbar"><button className="button button-secondary" disabled={busy||!catalogId} onClick={()=>void request(false)}>Uyumlu tonları getir</button></div></div>
 {!catalogs.length&&<p className="salon-muted">Yayımlanmış doğrulanmış pilot katalog bulunamadı.</p>}
 {options&&<><p role="status" className="salon-notice">{options.explanation}{options.whiteRatio!==null&&` Dip beyaz oranı: %${Math.round(options.whiteRatio*10000)/100}.`}</p>{options.status==="OPTIONS_FOR_REVIEW"&&<><div className="salon-form-grid"><label>Uzman ton ve geliştirici seçimi<select disabled={busy} value={pair} onChange={e=>{setPair(e.target.value);edit();}}><option value="">Seçin</option>{options.candidates.map(c=><option key={`${c.productId}:${c.developerId}`} value={`${c.productId}:${c.developerId}`}>{c.manufacturerCode} · {c.developerName}</option>)}</select></label><label>Boya miktarı (g)<input disabled={busy} type="number" min="0.01" max="1000" step="0.01" inputMode="decimal" value={grams} onChange={e=>{setGrams(e.target.value);edit();}}/></label></div>
 {candidate&&<><p><strong>{candidate.displayName} · {candidate.developerName}</strong></p><p className="salon-muted">Resmi karışım oranı {candidate.mixingRatio} · Belgelendirilmiş süre aralığı {candidate.processingMinutes.min}–{candidate.processingMinutes.max} dakika. Tek bir süre veya doz önerisi üretilmez.</p></>}
 {candidate&&stockEnabled&&<RecipeStockAvailability key={`${candidate.productId}:${candidate.developerId}:${reference}`} productId={candidate.productId} developerId={candidate.developerId} reference={reference}/>}
 {parent&&<p>Yeni sürümün önceki kaydı: Sürüm {parent.version}. Önceki kayıt korunur.<button className="button button-secondary" disabled={busy} onClick={()=>{setParent(null);edit();}}>Yeni reçete serisi</button></p>}
 <button className="button button-primary" disabled={busy||!canCreate||!candidate||!colorGrams.safeParse(Number(grams)).success} onClick={()=>void request(true)}>{busy?"Kontrol ediliyor…":parent?"Yeni reçete sürümünü kaydet":"Kontrollü taslağı kaydet"}</button></>}</>}
 {saved&&<RecipeSummary record={saved}/>}
 <h3>Değişmez reçete geçmişi</h3><p className="salon-muted">Son 25 kayıt. Tarihsel sonuç güncel güvenlik veya uygulama onayı değildir.</p>
 {!history.length?<p>Henüz kayıt yok.</p>:<div className="salon-stack">{history.map(record=><details key={record.id}><summary>{record.result.selected.manufacturerCode} · Sürüm {record.version} · {record.result.colorGrams} g · {new Date(record.createdAt).toLocaleString("tr-TR")}</summary><RecipeSummary record={record}/><button className="button button-secondary" disabled={busy||!canCreate} onClick={()=>{setParent(record);edit();}}>Bu kayıttan yeni sürüm oluştur</button></details>)}</div>}
 </SalonCard></section>;
}
function RecipeSummary({record}:{record:Saved}){
 const r=record.result;
 return <div className="salon-notice" role="status"><strong>Profesyonel inceleme gerekli · Sürüm {record.version}</strong><p>{r.selected.manufacturerCode} · {r.selected.developerName} · {r.selected.mixingRatio}</p><p>Boya: {r.colorGrams} g · Geliştirici: {r.developerGrams} g · Toplam: {r.totalGrams} g</p><p>Uygulama başlatılamaz. Belgelendirilmiş süre: {r.selected.processingMinutes.min}–{r.selected.processingMinutes.max} dakika.</p><p>Kaynaklar: {r.sources.map(s=><a key={s.id} href={s.source_url} target="_blank" rel="noreferrer" style={{display:"block",overflowWrap:"anywhere"}}>{s.document_title}</a>)}</p><Link className="button button-secondary" href={`/workspace/live-sessions?client_id=${record.clientId}&recipe_id=${record.id}`}>Profesyonel inceleme ve canlı seans</Link><Link href={`/workspace/live-sessions?client_id=${record.clientId}`}>Canlı seans geçmişi</Link></div>;
}
