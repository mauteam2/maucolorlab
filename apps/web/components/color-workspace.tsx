"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SalonFrame, SalonHeading, SalonCard } from "./salon-frame";
import { clientDirectory } from "@/lib/clients/contracts";
import { tenantContextSchema, workspaceReference } from "@/lib/tenant/context";
import { loadPassport, PassportLoadError } from "@/lib/hair-passport/load";
import { regionName, orderedRegions } from "@/lib/hair-passport/display";
import { targetResult, planResult } from "@/lib/color/contracts";
import { colorRules } from "@/lib/color/rules";
import { validateTarget, type RegionalColorTarget, type TargetDefinition } from "@/lib/color/target";
import { ControlledRecipe } from "./controlled-recipe";
import type { ColorPlanning } from "@/lib/color/model";
const tones = ["Nötr", "Küllü / soğuk", "Viyole", "Mavi", "Yeşil", "Altın / sıcak", "Bakır", "Kırmızı", "Karışık"];
const modes = ["Tek renk", "Dip yenileme", "Dip gölgeleme", "Beyaz kapama", "Açma", "Tonlama", "Renk düzeltme", "Ön pigmentasyon", "Boyutlu renk", "Bölgesel çalışma"];
const states = { DRAFT: "Renk planı taslağı", REQUIRES_ASSESSMENT: "Değerlendirme gerekli", REQUIRES_TEST: "Fiziksel test gerekli", REQUIRES_RECOVERY: "Toparlanma gerekli", BLOCKED_BY_RISK: "Güvenlik değerlendirmesi ilerlemeyi durdurdu" };
function initialRegion(regionId: string): RegionalColorTarget { return { regionId, level: null, toneFamily: null, mixedFamilies: [], warmth: "NEUTRAL", greyPriority: "NONE", liftPriority: "NONE", depositPriority: "NORMAL", toneIntent: "CHANGE", contrast: "NONE", preserve: false, handling: "STANDARD", correction: "NONE", intermediateLevel: null }; }
function errorText(code: string) { return ({ NETWORK_ERROR: "Bağlantı kurulamadı. Yeniden deneyin.", FORBIDDEN: "Bu işlem için yetkiniz yok.", COLOR_TARGET_INVALID: "Bölgesel hedefleri kontrol edin.", COLOR_PLAN_SOURCE_CONFLICT: "Saç kaydı değişti. Güncel kaydı yeniden açın.", COLOR_ENGINE_UNAVAILABLE: "Renk değerlendirmesi şu anda tamamlanamıyor." } as Record<string,string>)[code] ?? "İşlem tamamlanamadı. Güncel saç kaydını ve hedef bilgilerini kontrol edin."; }
export function ColorWorkspace() {
 const [directory, setDirectory] = useState<ReturnType<typeof clientDirectory.parse> | null>(null);
 const [clientId, setClientId] = useState("");
 const [loaded, setLoaded] = useState<Awaited<ReturnType<typeof loadPassport>> | null>(null);
 const [definition, setDefinition] = useState<TargetDefinition | null>(null);
 const [targetId, setTargetId] = useState<string | null>(null);
 const [planId,setPlanId]=useState<string|null>(null);
 const [plan, setPlan] = useState<ColorPlanning | null>(null);
 const [error, setError] = useState<string | null>(null);
 const [busy, setBusy] = useState(false);
 const [visible, setVisible] = useState(false);
 const [query, setQuery] = useState("");
 const [offset, setOffset] = useState(0);
 const reference = useRef<string | null>(null);
 const generation = useRef(0);
 const requestIds = useRef<{ target: string; plan: string } | null>(null);
 const sourceSnapshot = useRef<string | null>(null);
 const verify = useCallback(async () => {
  const current = ++generation.current; setVisible(false); setError(null);
  if (document.hidden || !navigator.onLine) return;
  try {
   const response = await fetch("/api/session", { cache: "no-store", signal: AbortSignal.timeout(10000) });
   if (response.status === 401) { window.location.replace("/sign-in?reason=SESSION_EXPIRED"); return; }
   if (response.status === 403) { window.location.replace("/auth/workspace-reset"); return; }
   if (!response.ok) throw new Error("NETWORK_ERROR");
   const context = tenantContextSchema.parse((await response.json()).context);
   const nextReference = workspaceReference(context);
   if (reference.current && reference.current !== nextReference) { setLoaded(null); setDefinition(null); setDirectory(null); setTargetId(null); setPlan(null);setPlanId(null); window.location.replace("/workspace/colorlab"); return; }
   reference.current = nextReference;
   const response2 = await fetch("/api/clients", { method: "POST", headers: { "Content-Type": "application/json", "X-Workspace-Reference": nextReference }, cache: "no-store", body: JSON.stringify({ operation: "list", payload: { status: "ACTIVE", limit: 25, query, offset } }), signal: AbortSignal.timeout(10000) });
   const body = await response2.json();
   if (response2.status === 401) { window.location.replace("/sign-in?reason=SESSION_EXPIRED"); return; }
   if (["MEMBERSHIP_REVOKED","MEMBERSHIP_REQUIRED","TENANT_CONTEXT_INVALID"].includes(body.code)) { window.location.replace("/auth/workspace-reset"); return; }
   if (body.code) throw new Error(body.code);
   if (workspaceReference(tenantContextSchema.parse(body.context)) !== nextReference) throw new Error("TENANT_CONTEXT_INVALID");
   const nextDirectory = clientDirectory.parse(body.data);
   const next = clientId ? await loadPassport(clientId, {}, AbortSignal.timeout(15000)) : null;
   if (next && next.workspaceReference !== nextReference) throw new Error("TENANT_CONTEXT_INVALID");
   if (current !== generation.current || document.hidden || !navigator.onLine) return;
   setDirectory(nextDirectory); setLoaded(next);
   const snapshot = next?.snapshot;
   const currentSnapshot = snapshot ? JSON.stringify(snapshot) : null;
   if (sourceSnapshot.current !== currentSnapshot) { setPlan(null);setPlanId(null); sourceSnapshot.current = currentSnapshot; }
   if (snapshot) setDefinition(previous => previous && previous.regions.length === snapshot.regions.filter(r=>r.status==="ACTIVE").length && previous.regions.every(r=>snapshot.regions.some(region=>region.id===r.regionId&&region.status==="ACTIVE")) ? previous : { schemaVersion:1, mode:"MULTI_REGION_CUSTOM", globalIntent:"TRANSFORM", regions:orderedRegions(snapshot).filter(r=>r.status==="ACTIVE").map(r=>initialRegion(r.id)) });
   setVisible(true);
  } catch (cause) { if(current===generation.current) { const code = cause instanceof Error ? cause.message : "NETWORK_ERROR"; if(cause instanceof PassportLoadError && ["SESSION_EXPIRED","MEMBERSHIP_REVOKED","TENANT_CONTEXT_INVALID","MEMBERSHIP_REQUIRED"].includes(cause.code)) { window.location.replace(cause.code==="SESSION_EXPIRED"?"/sign-in?reason=SESSION_EXPIRED":"/auth/workspace-reset"); } setError(errorText(code)); } }
 }, [clientId, query, offset]);
 useEffect(() => {
  const generationRef = generation;
  const refresh = () => { void verify(); };
  const hide = () => { ++generation.current; setVisible(false); if (!document.hidden) refresh(); };
  const offline = () => { ++generation.current; setVisible(false); setError(errorText("NETWORK_ERROR")); };
  queueMicrotask(refresh); const interval = setInterval(refresh,15000);
  window.addEventListener("focus",refresh); window.addEventListener("online",refresh); window.addEventListener("pageshow",refresh); window.addEventListener("offline",offline); document.addEventListener("visibilitychange",hide);
  return () => { ++generationRef.current; clearInterval(interval); window.removeEventListener("focus",refresh); window.removeEventListener("online",refresh); window.removeEventListener("pageshow",refresh); window.removeEventListener("offline",offline); document.removeEventListener("visibilitychange",hide); };
 },[verify]);
 function change(next: TargetDefinition) { setDefinition(next); setTargetId(null); setPlan(null);setPlanId(null); setError(null); requestIds.current = null; }
 function regionChange(index: number, patch: Partial<RegionalColorTarget>) { if(definition) change({...definition,regions:definition.regions.map((r,i)=>i===index?{...r,...patch}:r)}); }
 async function save(generate: boolean) {
  if (!loaded?.snapshot || loaded.client.status !== "ACTIVE" || !definition || busy || !visible) return;
  const validation=validateTarget(definition,loaded.snapshot);
  if(validation.issues.length) { setError("Her aktif bölge için hedef seviye ve ton seçin. Korunacak bölgelerde yalnızca mevcut rengi koruma seçeneğini kullanın; öncelik ve düzeltme bilgilerini kontrol edin."); return; }
  setBusy(true); setError(null); const current=generation.current;
  requestIds.current ??= {target:crypto.randomUUID(),plan:crypto.randomUUID()};
  try {
   let id=targetId;
   if(!id) {
    const result=targetResult.parse(await (await fetch(`/api/clients/${clientId}/color-targets`,{method:"POST",headers:{"Content-Type":"application/json","X-Workspace-Reference":loaded.workspaceReference},body:JSON.stringify({request_id:requestIds.current.target,definition:validation.definition}),cache:"no-store",signal:AbortSignal.timeout(15000)})).json());
    if("code" in result) throw new Error(result.code);
    id=result.data.id;
    if(current!==generation.current || document.hidden || !navigator.onLine) return;
    setTargetId(id);
   }
   if(generate) {
    const result=planResult.parse(await(await fetch(`/api/clients/${clientId}/color-plans`,{method:"POST",headers:{"Content-Type":"application/json","X-Workspace-Reference":loaded.workspaceReference},body:JSON.stringify({request_id:requestIds.current.plan,target_id:id}),cache:"no-store",signal:AbortSignal.timeout(15000)})).json());
    if("code" in result) throw new Error(result.code);
    if(current===generation.current && !document.hidden && navigator.onLine) {setPlan(result.data.result);setPlanId(result.data.id);}
   }
  } catch(cause) { if(current===generation.current) { const code=cause instanceof Error?cause.message:"NETWORK_ERROR"; if(["UNAUTHENTICATED","SESSION_EXPIRED","MEMBERSHIP_REVOKED","TENANT_CONTEXT_INVALID","MEMBERSHIP_REQUIRED","FORBIDDEN"].includes(code)){setVisible(false);void verify();} setError(errorText(code)); } }
  finally {setBusy(false);}
 }
 return <SalonFrame active="colorlab"><main id="main-content" className="salon-main"><SalonHeading title="Yeni renk planı" description="Saç analizini, bölgesel hedefi ve güvenli renk planını tek yerde düzenleyin." />{error&&<p className="salon-notice" role="alert">{error}<button className="button button-secondary" onClick={()=>void verify()}>Yeniden dene</button></p>}{!visible?<p role="status">Güvenli çalışma alanı yükleniyor…</p>:<>
 <div className="salon-columns"><SalonCard title="Müşteri"><form className="salon-toolbar" onSubmit={event=>{event.preventDefault();setOffset(0);setQuery(String(new FormData(event.currentTarget).get("query")??""));}}><input name="query" type="search" maxLength={80} aria-label="Müşteri adı veya telefon" placeholder="Ad veya telefon ile ara"/><button className="button button-secondary">Ara</button></form><select aria-label="Renk planı müşterisi" value={clientId} onChange={event=>{++generation.current;setVisible(false);setLoaded(null);setDefinition(null);setTargetId(null);setPlan(null);setPlanId(null);requestIds.current=null;setClientId(event.target.value);}}><option value="">Müşteri seçin</option>{loaded&&!directory?.items.some(item=>item.id===clientId)&&<option value={clientId}>{loaded.client.full_name}</option>}{directory?.items.map(client=><option key={client.id} value={client.id}>{client.full_name}</option>)}</select><div className="salon-toolbar" style={{marginTop:12}}><button className="button button-secondary" disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-25))}>Önceki</button><span>Sayfa {offset/25+1}</span><button className="button button-secondary" disabled={!directory?.has_more||offset>=10000} onClick={()=>setOffset(offset+25)}>Sonraki</button></div>{loaded&&<><p><Link href={`/workspace/clients/${clientId}/hair-passport`} prefetch={false} className="button button-secondary">Hair Passport kaydını aç</Link></p>{!loaded.snapshot?<p className="salon-notice">Renk hedefi için önce Hair Passport oluşturun.</p>:definition&&<><h2>Hedef renk</h2><div className="salon-form-grid"><label>Çalışma türü<select disabled={busy} value={definition.mode} onChange={event=>change({...definition,mode:event.target.value as TargetDefinition["mode"]})}>{colorRules.targetModes.map((mode,index)=><option key={mode} value={mode}>{modes[index]}</option>)}</select></label><label>Genel amaç<select disabled={busy} value={definition.globalIntent} onChange={event=>change({...definition,globalIntent:event.target.value as TargetDefinition["globalIntent"]})}><option value="PRESERVE">Koru</option><option value="REFRESH">Yenile</option><option value="TRANSFORM">Dönüştür</option><option value="CORRECT">Düzelt</option></select></label></div>{definition.regions.map((region,index)=><fieldset key={region.regionId} disabled={busy} className="salon-region-editor"><legend>{regionName(loaded.snapshot!,region.regionId)}</legend><label><input type="checkbox" checked={region.preserve} onChange={event=>regionChange(index,event.target.checked?{...initialRegion(region.regionId),preserve:true,level:null,toneFamily:null,mixedFamilies:[],warmth:"PRESERVE",toneIntent:"PRESERVE",depositPriority:"NONE"}:{...initialRegion(region.regionId)})}/> Mevcut rengi koru</label>{!region.preserve&&<div className="salon-form-grid"><label>Hedef seviye<input type="number" min={1} max={10} step={0.5} value={region.level??""} onChange={event=>regionChange(index,{level:event.target.value?Number(event.target.value):null})}/></label><label>Ton ailesi<select value={region.toneFamily??""} onChange={event=>regionChange(index,{toneFamily:(event.target.value||null) as RegionalColorTarget["toneFamily"],mixedFamilies:[]})}><option value="">Seçin</option>{colorRules.tones.map((tone,i)=><option key={tone} value={tone}>{tones[i]}</option>)}</select></label>{region.toneFamily==="MIXED"&&<label className="wide">Karışık ton aileleri (2–3)<select multiple value={region.mixedFamilies} onChange={event=>regionChange(index,{mixedFamilies:Array.from(event.target.selectedOptions,option=>option.value) as RegionalColorTarget["mixedFamilies"]})}>{colorRules.tones.filter(tone=>tone!=="MIXED").map((tone,i)=><option key={tone} value={tone}>{tones[i]}</option>)}</select></label>}{([
 ["warmth","Sıcaklık",["NEUTRAL","COOL","WARM","PRESERVE"],["Nötr","Soğuk","Sıcak","Koru"]],
 ["greyPriority","Beyaz önceliği",["NONE","BLEND","COVER"],["Yok","Harmanla","Kapat"]],
 ["liftPriority","Açma önceliği",["NONE","NORMAL","HIGH"],["Yok","Normal","Yüksek"]],
 ["depositPriority","Pigment önceliği",["NONE","NORMAL","HIGH"],["Yok","Normal","Yüksek"]],
 ["toneIntent","Ton amacı",["PRESERVE","NEUTRALIZE","ENHANCE","CHANGE"],["Koru","Nötrleştir","Güçlendir","Değiştir"]],
 ["contrast","Kontrast",["NONE","SOFT","PRONOUNCED"],["Yok","Yumuşak","Belirgin"]],
 ["handling","Bölgesel uygulama",["STANDARD","ISOLATE"],["Standart","İzole et"]],
 ["correction","Düzeltme",["NONE","BAND","UNEVEN","REFLECTION","DARK_ACCUMULATION"],["Yok","Bant","Düzensizlik","Yansıma","Koyu birikim"]],
 ] as const).map(([key,label,values,labels])=><label key={key}>{label}<select value={region[key]} onChange={event=>regionChange(index,{[key]:event.target.value})}>{values.map((value,i)=><option key={value} value={value}>{labels[i]}</option>)}</select></label>)}<label>Ara hedef seviye<input type="number" min={1} max={10} step={0.5} value={region.intermediateLevel??""} onChange={event=>regionChange(index,{intermediateLevel:event.target.value?Number(event.target.value):null})}/></label></div>}</fieldset>)}<div className="salon-toolbar"><button className="button button-secondary" disabled={busy||loaded.client.status!=="ACTIVE"||!loaded.permissions.includes("color_plan.create")} onClick={()=>void save(false)}>Hedefi kaydet</button><button className="button button-primary" disabled={busy||loaded.client.status!=="ACTIVE"||!loaded.permissions.includes("color_plan.create")} onClick={()=>void save(true)}>{busy?"Değerlendiriliyor…":"Renk planı oluştur"}</button></div>{targetId&&<p role="status" className="salon-notice">Bölgesel hedef kaydedildi.</p>}</>}</>}
 </SalonCard><div className="salon-stack"><SalonCard title="Danışmanlık özeti">{plan?<><span className={`salon-badge ${plan.status==="DRAFT"?"success":"warning"}`}>{states[plan.status]}</span><p>Bu plan, markadan bağımsız teknik hedefi tanımlar. Ürün, oksidan, oran ve süre için Brand Adapter gerekir.</p>{plan.primaryStrategy&&<p>Öngörülen seans aralığı: {plan.primaryStrategy.sessions.min}–{plan.primaryStrategy.sessions.max}</p>}<p>Gerekli fiziksel test: {plan.requiredPhysicalTests.length}</p><p>Tamamlanması gereken bilgi: {plan.requiredInformation.length}</p>{plan.regions.map(region=><div key={region.regionId} className="salon-notice"><strong>{loaded?.snapshot?regionName(loaded.snapshot,region.regionId):"Saç bölgesi"}</strong><p>Mevcut seviye: {region.currentLevel??"Bilinmiyor"} · Hedef: {region.targetLevel??"Korunuyor"}</p></div>)}</>:<p className="salon-muted">Müşteri seçin, Hair Passport bilgilerini doğrulayın ve tüm aktif bölgeler için hedefi tanımlayın. Güvenlik değerlendirmesi planın oluşturulmasını belirler.</p>}</SalonCard><SalonCard title="Hair Passport"><p className="salon-muted">Doğrulanmamış saç bilgileri ve eksik testler planlama sırasında dikkate alınır.</p>{clientId&&<Link href={`/workspace/clients/${clientId}/hair-passport`} prefetch={false}>Saç kaydını incele →</Link>}</SalonCard></div></div></>}
 {planId&&loaded&&<ControlledRecipe key={`${clientId}:${planId}:${loaded.workspaceReference}`} clientId={clientId} planId={planId} reference={loaded.workspaceReference} enabled={visible} canCreate={loaded.permissions.includes("color_plan.create")} />}
 </main></SalonFrame>;
}
