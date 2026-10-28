"use client";
import { LoadingState } from "./professional-ui";
import { CatalogDiscoverySelector } from "./color-registry";
import { LocalIntentButton } from "./local-intent-button";
import { OfflineDraftPanel } from "./offline-draft-panel";
import { saasErrorMessages } from "@/lib/saas/model";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SalonFrame } from "./salon-frame";
import { clientDirectory } from "@/lib/clients/contracts";
import { tenantContextSchema, workspaceReference } from "@/lib/tenant/context";
import { loadPassport, PassportLoadError } from "@/lib/hair-passport/load";
import { regionName, orderedRegions } from "@/lib/hair-passport/display";
import { targetResult, planResult } from "@/lib/color/contracts";
import { colorRules } from "@/lib/color/rules";
import { validateTarget, type RegionalColorTarget, type TargetDefinition } from "@/lib/color/target";
import { ColorTargetPicker, ColorTargetSummary } from "./color-target-picker";
import { RegionalColorTargetEditor } from "./regional-color-target";
import { ColorPlanReview } from "./color-plan-review";
import { ControlledRecipe } from "./controlled-recipe";
import type { ColorPlanning } from "@/lib/color/model";
import { TargetDirection } from "./colorlab/target-direction";
import { HairContext, HairOrientation } from "./colorlab/hair-context";
const modes = ["Tek renk", "Dip yenileme", "Dip gölgeleme", "Beyaz kapama", "Açma", "Tonlama", "Renk düzeltme", "Ön pigmentasyon", "Boyutlu renk", "Bölgesel çalışma"];
const states = { DRAFT: "Renk planı taslağı", REQUIRES_ASSESSMENT: "Değerlendirme gerekli", REQUIRES_TEST: "Fiziksel test gerekli", REQUIRES_RECOVERY: "Toparlanma gerekli", BLOCKED_BY_RISK: "Güvenlik değerlendirmesi ilerlemeyi durdurdu" };
function initialRegion(regionId: string): RegionalColorTarget { return { regionId, level: null, toneFamily: null, mixedFamilies: [], warmth: "NEUTRAL", greyPriority: "NONE", liftPriority: "NONE", depositPriority: "NORMAL", toneIntent: "CHANGE", contrast: "NONE", preserve: false, handling: "STANDARD", correction: "NONE", intermediateLevel: null }; }
function errorText(code: string) { return ({ ...saasErrorMessages, NETWORK_ERROR: "Bağlantı kurulamadı. Yeniden deneyin.", FORBIDDEN: "Bu işlem için yetkiniz yok.", COLOR_TARGET_INVALID: "Bölgesel hedefleri kontrol edin.", COLOR_PLAN_SOURCE_CONFLICT: "Saç kaydı değişti. Güncel kaydı yeniden açın.", COLOR_ENGINE_UNAVAILABLE: "Renk değerlendirmesi şu anda tamamlanamıyor." } as Record<string,string>)[code] ?? "İşlem tamamlanamadı. Güncel saç kaydını ve hedef bilgilerini kontrol edin."; }
export function ColorWorkspace({initialClientId}:{initialClientId?:string}={}) {
 const [directory, setDirectory] = useState<ReturnType<typeof clientDirectory.parse> | null>(null);
 const [clientId, setClientId] = useState(initialClientId??"");
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
 const [stage, setStage] = useState(initialClientId?1:0);
 const [expert, setExpert] = useState(false);
 const steps = ["Saç", "Hedef", "Kanıt", "Değerlendirme", "Strateji", "Reçete"];
 function navigate(next: number) { setStage(next); requestAnimationFrame(()=>document.getElementById(`cl-stage-${next}`)?.scrollIntoView({block:"start"})); }
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
   if(next&&!snapshot)setStage(0);
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
    if(current===generation.current && !document.hidden && navigator.onLine) {setPlan(result.data.result);setPlanId(result.data.id);navigate(3);}
   }
  } catch(cause) { if(current===generation.current) { const code=cause instanceof Error?cause.message:"NETWORK_ERROR"; if(["UNAUTHENTICATED","SESSION_EXPIRED","MEMBERSHIP_REVOKED","TENANT_CONTEXT_INVALID","MEMBERSHIP_REQUIRED","FORBIDDEN"].includes(code)){setVisible(false);void verify();} setError(errorText(code)); } }
  finally {setBusy(false);}
 }
 return <SalonFrame active="colorlab"><main id="main-content" className="salon-main color-workbench cl-workstation" data-stage={stage}>
 <OfflineDraftPanel/><header className="cl-title"><div><span className="ui-eyebrow">ELIFORA / Color Intelligence</span><h1>Renk çalışma alanı</h1><p>Saçı anlayın. Hedefi tanımlayın. Teknik yolu değerlendirin.</p></div><span className="cl-workspace-note">Markadan bağımsız teknik planlama</span></header>
 {error&&<p className="salon-notice" role="alert">{error}<button className="button button-secondary" onClick={()=>void verify()}>Yeniden dene</button></p>}
 {!visible?<LoadingState label="Güvenli çalışma alanı yükleniyor…"/>:<>
 <section className="cl-client-bar" aria-label="Renk çalışması müşterisi"><div><span className="ui-eyebrow">Müşteri / çalışma bağlamı</span><select aria-label="Renk planı müşterisi" value={clientId} onChange={event=>{if(event.target.value===clientId)return;++generation.current;setVisible(false);setLoaded(null);setDefinition(null);setTargetId(null);setPlan(null);setPlanId(null);requestIds.current=null;setStage(1);setClientId(event.target.value);}}><option value="">Müşteri seçin</option>{loaded&&!directory?.items.some(item=>item.id===clientId)&&<option value={clientId}>{loaded.client.full_name}</option>}{directory?.items.map(client=><option key={client.id} value={client.id}>{client.full_name}</option>)}</select></div>
 {loaded&&<div className="cl-client-status"><strong>{loaded.snapshot?`Hair Passport · v${loaded.snapshot.passport.version}`:"Hair Passport eksik"}</strong><span>{loaded.snapshot?`${loaded.snapshot.regions.filter(r=>r.status==="ACTIVE").length} aktif bölge · kanıt motor tarafından değerlendirilecek`:"Teknik değerlendirme için saç kaydı gerekli"}</span></div>}
 <details className="cl-client-search"><summary>Müşteri bul / sayfala</summary><form className="salon-toolbar" onSubmit={event=>{event.preventDefault();setOffset(0);setQuery(String(new FormData(event.currentTarget).get("query")??""));}}><input name="query" type="search" maxLength={80} aria-label="Müşteri adı veya telefon" placeholder="Ad veya telefon ile ara"/><button className="button button-secondary">Ara</button></form><div className="salon-toolbar"><button className="button button-secondary" disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-25))}>Önceki</button><span>Sayfa {offset/25+1}</span><button className="button button-secondary" disabled={!directory?.has_more||offset>=10000} onClick={()=>setOffset(offset+25)}>Sonraki</button></div></details></section>
 <nav className="cl-workflow" aria-label="ColorLab çalışma adımları">{steps.map((name,index)=><button key={name} type="button" aria-current={stage===index?"step":undefined} disabled={index>0&&!loaded?.snapshot} onClick={()=>navigate(index)}><span aria-hidden="true">{String(index+1).padStart(2,"0")}</span>{name}</button>)}</nav>
 {!loaded&&<section className="cl-start"><span className="ui-eyebrow">Profesyonel renk çalışması</span><h2>Her renk yönü, saçın kendi kanıtıyla başlar.</h2><p>Bir müşteri seçerek Hair Passport bağlamını ve hedef kartelasını açın. Teknik değerlendirme öncesinde bilinmeyen bilgiler görünür kalır.</p><CatalogDiscoverySelector/></section>}
 {loaded&&<>
 {loaded.snapshot&&<HairOrientation snapshot={loaded.snapshot} onInspect={()=>navigate(0)}/>}
 <div className="cl-step-surface" data-cl-step="0" id="cl-stage-0"><HairContext snapshot={loaded.snapshot} clientId={clientId}/><button type="button" className="button button-secondary cl-mobile-next" disabled={!loaded.snapshot} onClick={()=>navigate(1)}>Hedefe devam et →</button></div>
 {loaded.snapshot&&definition&&<>
 <div className="cl-composition"><div className="cl-primary">
 <section className="cl-step-surface" data-cl-step="1" id="cl-stage-1"><ColorTargetPicker definition={definition} snapshot={loaded.snapshot} disabled={busy} onChange={change}/>
 <div className="cl-target-intent salon-form-grid"><label>Çalışma türü<select disabled={busy} value={definition.mode} onChange={event=>{setExpert(true);change({...definition,mode:event.target.value as TargetDefinition["mode"]});}}>{colorRules.targetModes.map((mode,index)=><option key={mode} value={mode}>{modes[index]}</option>)}</select></label><label>Genel amaç<select disabled={busy} value={definition.globalIntent} onChange={event=>change({...definition,globalIntent:event.target.value as TargetDefinition["globalIntent"]})}><option value="PRESERVE">Koru</option><option value="REFRESH">Yenile</option><option value="TRANSFORM">Dönüştür</option><option value="CORRECT">Düzelt</option></select></label></div>
 <details className="cl-expert" open={expert} onToggle={event=>setExpert(event.currentTarget.open)}><summary>Bölgesel / uzman hedef kontrolü <span>İkincil yön, beyaz, düzeltme</span></summary><p className="cl-caption">Her bölge aynı kanonik hedef modeline yazılır. İkincil yönler baskınlık veya karışım oranı belirtmez.</p>{definition.regions.map((region,index)=><RegionalColorTargetEditor key={region.regionId} region={region} name={regionName(loaded.snapshot!,region.regionId)} disabled={busy} onChange={patch=>regionChange(index,patch)}/>)}</details>
 <div className="cl-local-intent"><LocalIntentButton domain="COLOR_TARGET" entityId={clientId} baseVersion={loaded.snapshot.passport.version} prepare={()=>({definition})}/></div>
 <button type="button" className="button button-secondary cl-mobile-next" onClick={()=>navigate(2)}>Kanıtı incele →</button></section>
 <section className="cl-step-surface cl-evidence" data-cl-step="2" id="cl-stage-2"><div className="cl-section-heading"><div><span className="ui-eyebrow">03 / Kanıt</span><h2>Değerlendirmenin dayanağı</h2></div><Link href={`/workspace/clients/${clientId}/hair-passport`} prefetch={false}>Saç kaydını tamamla ↗</Link></div><p>Eksik, eski veya çelişen kayıtlar değerlendirmede ayrıca gösterilir. Buradaki alan sayısı güven puanı değildir.</p><details><summary>Bölgesel kanıt ve hedef ayrıntıları</summary><ColorTargetSummary definition={definition} snapshot={loaded.snapshot}/></details><p className="cl-caption">Hedefi kaydetmek veya motor değerlendirmesi istemek mevcut sürüm ve güvenlik kontrollerine tabidir.</p></section>
 <section className="cl-step-surface" data-cl-step="3" id="cl-stage-3">{plan?<ColorPlanReview plan={plan} snapshot={loaded.snapshot} clientId={clientId} part="reasoning"/>:<p>Henüz teknik değerlendirme yok. Hedef ve kanıtı doğrulayın.</p>}<button type="button" className="button button-secondary" onClick={()=>navigate(4)}>Stratejiyi incele →</button></section><section className="cl-step-surface" data-cl-step="4" id="cl-stage-4">{plan?<ColorPlanReview plan={plan} snapshot={loaded.snapshot} clientId={clientId} part="strategy"/>:<p>Strateji için önce motor değerlendirmesi gerekir.</p>}<button type="button" className="button button-secondary" onClick={()=>navigate(5)}>Marka desteğini incele →</button></section><div className="cl-persist-actions"><button className="button button-secondary" disabled={busy||loaded.client.status!=="ACTIVE"||!loaded.permissions.includes("color_plan.create")} onClick={()=>void save(false)}>Hedefi kaydet</button><button className="button button-primary" disabled={busy||loaded.client.status!=="ACTIVE"||!loaded.permissions.includes("color_plan.create")} onClick={()=>void save(true)}>{busy?"Değerlendiriliyor…":"Renk planı oluştur"}</button></div>{targetId&&<p role="status" className="cl-saved">Bölgesel hedef kaydedildi.</p>}
 </div><aside className="cl-intelligence" aria-label="Renk zekâsı paneli"><TargetDirection definition={definition} snapshot={loaded.snapshot}/>
 {plan?<><p className="cl-plan-state" role="status">{states[plan.status]}</p><ColorPlanReview plan={plan} snapshot={loaded.snapshot} clientId={clientId} part="signals"/></>:<section className="cl-awaiting"><span className="ui-eyebrow">Motor yorumu</span><h2>Önce hedef ve kanıt.</h2><p>Risk, kanıt güveni ve uygulanabilirlik henüz değerlendirilmedi. Seçili görsel bunların yerine geçmez.</p><Link href={`/workspace/clients/${clientId}/hair-passport`} prefetch={false}>Eksik saç kanıtını tamamla ↗</Link></section>}
 </aside></div>
 <section className="cl-step-surface cl-formulation" data-cl-step="5" id="cl-stage-5"><div className="cl-section-heading"><div><span className="ui-eyebrow">06 / Doğrulanmış destek</span><h2>Stratejiden üreticiye</h2></div></div><p>Marka keşfi, yayımlanmış teknik destek ve uzmanın kontrollü reçetesi ayrı adımlardır. Bir seri kaydı reçete veya uygulama yetkisi vermez.</p><CatalogDiscoverySelector/>
 {planId?<ControlledRecipe key={`${clientId}:${planId}:${loaded.workspaceReference}`} clientId={clientId} planId={planId} reference={loaded.workspaceReference} enabled={visible} canCreate={loaded.permissions.includes("color_plan.create")} stockEnabled={loaded.permissions.includes("stock.view")}/>:<p className="cl-no-recipe">Kontrollü formülasyon için önce teknik değerlendirme oluşturun. Yayımlanmış ve bağlama uygun doğrulanmış destek olmadan üretici reçetesi oluşturulmaz.</p>}</section>
 </>}
 </>}
 </>}
 </main></SalonFrame>;
}
