"use client";
import { useEffect, useState } from "react";
import type { HairSnapshot } from "@/lib/hair-passport/contracts";
import type { CaseConfidenceAssessment } from "@/lib/confidence/model";
import { riskAssessment } from "@/lib/risk/contracts";
import { tenantContextSchema, workspaceReference } from "@/lib/tenant/context";
import { formatHairDate, regionName } from "@/lib/hair-passport/display";
import { hairTr as t } from "@/lib/i18n/hair-tr";
import type { z } from "zod";
type Assessment = { source: string; confidence: CaseConfidenceAssessment; risk: z.infer<typeof riskAssessment> };
const confidenceLabels={HIGH:"Yüksek",MEDIUM:"Orta",LOW:"Düşük",INSUFFICIENT:"Yetersiz"};
const riskLabels={LOW:"Düşük",MODERATE:"Orta",HIGH:"Yüksek",CRITICAL:"Kritik"};
const gates={CONTINUE_TECHNICAL_PLANNING:"Teknik planlamaya geçilebilir",CONTINUE_WITH_CHECKPOINTS:"Kontrol noktalarıyla planlama",REQUIRE_ADDITIONAL_ASSESSMENT:"Ek değerlendirme gerekli",REQUIRE_PHYSICAL_TEST:"Fiziksel test gerekli",REQUIRE_STRAND_TEST:"Tutam testi gerekli",BLOCK_INSUFFICIENT_INFORMATION:"Eksik bilgi nedeniyle planlama durduruldu",REQUIRE_RECOVERY_REASSESSMENT:"Önce toparlanma değerlendirmesi",BLOCK_TECHNICAL_PLANNING:"Teknik planlama durduruldu",OUTSIDE_COSMETIC_SCOPE:"Kozmetik kapsam dışında"};
export function EvidenceAssessment({ snapshot, reference }: { snapshot: HairSnapshot; reference?: string }) {
 const [stored,setResult]=useState<Assessment|null>(null),[failed,setFailed]=useState(false),[revision,setRevision]=useState(0);
 const id=snapshot.passport.id,version=snapshot.passport.version,clientId=snapshot.passport.client_id,archived=snapshot.passport.client_status==="ARCHIVED";
 const source=JSON.stringify([id,version,snapshot.regions.map(r=>[r.id,r.version]),snapshot.observations.items.map(r=>r.id),snapshot.physical_tests.items.map(r=>r.id),snapshot.history.items.map(r=>r.id)]);
 useEffect(()=>{
  let alive=true;const controller=new AbortController();
  queueMicrotask(async()=>{if(!alive)return;setResult(null);setFailed(false);if(!reference||document.hidden||!navigator.onLine)return;
   try{
    const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(15000)]);
    const read=async(path:string)=>{const r=await fetch(path,{cache:"no-store",signal});if(!r.ok)throw Error("ASSESSMENT_UNAVAILABLE");return r.json();};
    const base=`/api/clients/${clientId}/hair-passport`;
    const [c,r]=await Promise.all([read(`${base}/confidence?include_archived=${archived}`),read(`${base}/risk?include_archived=${archived}`)]);
    const confidence=c.data as CaseConfidenceAssessment,risk=riskAssessment.parse(r.data);
    if(confidence.passportId!==id||confidence.passportVersion!==version||risk.passportId!==id||risk.passportVersion!==version||risk.confidence.band!==confidence.band||!(confidence.band in confidenceLabels)||![confidence.conflicts,confidence.staleEvidence,confidence.informationRequirements,confidence.significantUnknowns].every(Array.isArray))throw Error("ASSESSMENT_SOURCE_CHANGED");
    const current=tenantContextSchema.parse((await read("/api/session")).context);
    if(workspaceReference(current)!==reference||!current.permissions.includes("hair_passport.read")||!current.permissions.includes("clients.read"))throw Error("ASSESSMENT_AUTHORITY_CHANGED");
    if(alive&&!document.hidden&&navigator.onLine)setResult({source,confidence,risk});
   }catch{if(alive){setResult(null);setFailed(true);}}
  });
  return()=>{alive=false;controller.abort();};
 },[clientId,id,version,archived,reference,source,revision]);
 const result=stored?.source===source?stored:null;
 return <section className="dossier-assessment" aria-label="Yetkili kanıt ve güvenlik değerlendirmesi"><div className="dossier-section-label"><h2>Kanıt ve teknik dikkat</h2><button type="button" className="hp-text-button" onClick={()=>setRevision(v=>v+1)}>Kanıt değerlendirmesini yenile</button></div>{!result?<p role="status">{failed?"Kanıt değerlendirmesi doğrulanamadı. Kayıtlı değerler işlem izni olarak yorumlanmamalı.":"Kanıt güncelliği ve teknik güvenlik henüz bu görünümde doğrulanmadı."}</p>:<><div className="dossier-signals"><div><h3>Kanıt güveni</h3><strong>{confidenceLabels[result.confidence.band]}</strong><p>Kanıt yeterliliğidir; renk başarısı olasılığı değildir.</p></div><div><h3>Teknik risk</h3><strong>{riskLabels[result.risk.overallBand]}</strong><p>{gates[result.risk.gate.outcome]}</p></div><div><h3>Eksik kanıt</h3><strong>{result.confidence.informationRequirements.length} bilgi gereksinimi</strong><p>{result.risk.requiredPhysicalTests.filter(x=>x.status!=="SATISFIED").length} fiziksel test ön koşulu</p></div></div><div className="dossier-evidence-flags"><span data-attention={result.confidence.conflicts.length>0}>{result.confidence.conflicts.length} çelişkili kanıt</span><span data-attention={result.confidence.staleEvidence.length>0}>{result.confidence.staleEvidence.length} güncelliğini yitirmiş kanıt</span><span>Değerlendirme: {formatHairDate(result.confidence.evaluatedAt)}</span></div>{(result.confidence.informationRequirements.length>0||result.risk.requiredPhysicalTests.some(x=>x.status!=="SATISFIED"))&&<details><summary>Eksik bilgi ve fiziksel test ön koşulları</summary>{result.confidence.informationRequirements.map((x,i)=><p key={`info-${i}`}>{regionName(snapshot,x.target==="GLOBAL"?null:x.target)} · {x.field&&x.field in t.fields?t.fields[x.field as keyof typeof t.fields]:"Teknik kanıt"} · bilgi kaydı gerekli</p>)}{result.risk.requiredPhysicalTests.filter(x=>x.status!=="SATISFIED").map((x,i)=><p key={`test-${i}`}>{regionName(snapshot,x.target==="GLOBAL"?null:x.target)} · {t.testTypes[x.type]} · {x.status==="STALE"?"Güncel test gerekli":x.status==="UNRELIABLE"?"Güvenilir test kaydı gerekli":"Test kaydı gerekli"}</p>)}</details>}<details><summary>Çelişki ve güncellik ayrıntıları</summary>{[...result.confidence.conflicts.map(x=>({...x,label:"Çelişkili kanıt"})),...result.confidence.staleEvidence.map(x=>({...x,label:"Güncelliğini yitirmiş kanıt"}))].map((x,i)=><p key={i}>{x.label} · {regionName(snapshot,x.target==="GLOBAL"?null:x.target)} · {x.field&&x.field in t.fields?t.fields[x.field as keyof typeof t.fields]:"Kanıt kaydı"}</p>)}<p>Bu görünüm mevcut servis değerlendirmesini gösterir; güven, güncellik veya güvenlik sonucu hesaplamaz.</p></details></>}</section>;
}
