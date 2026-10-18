"use client";
import { useState } from "react";
import { families, presets, levelLabels, familyPatch, presetRegion, toneDescription } from "@/lib/color/taxonomy";
import type { TargetDefinition } from "@/lib/color/target";
import type { RegionalColorTarget } from "@/lib/color/target";
import { toneLabels } from "@/lib/color/taxonomy";
import type { HairSnapshot } from "@/lib/hair-passport/contracts";
import { regionName } from "@/lib/hair-passport/display";
import { hairTr } from "@/lib/i18n/hair-tr";
export function ColorTargetPicker({definition,snapshot,disabled,onChange}:{definition:TargetDefinition;snapshot:HairSnapshot;disabled:boolean;onChange:(next:TargetDefinition)=>void}){
 const [level,setLevel]=useState(7),[family,setFamily]=useState("NATURAL"),[scope,setScope]=useState("ALL");
 function selected(p:typeof presets[number]){
  const patch=familyPatch(p.family),regions=definition.regions.filter(r=>scope==="ALL"||r.regionId===scope);
  return level===p.level&&family===p.family&&regions.length>0&&regions.every(r=>!r.preserve&&r.level===p.level&&r.toneFamily===patch.toneFamily&&r.warmth===patch.warmth&&[...r.mixedFamilies].sort().join()===patch.mixedFamilies?.join());
 }
 function apply(preset?:string){
  const choice=presets.find(p=>p.id===preset);if(choice){setLevel(choice.level);setFamily(choice.family);}
  onChange({...definition,regions:definition.regions.map(r=>scope!=="ALL"&&r.regionId!==scope?r:preset?presetRegion(preset,r):{...r,preserve:false,level,...familyPatch(family),toneIntent:"CHANGE"})});
 }
 return <section aria-label="Hızlı hedef oluşturucu" className="color-target-picker"><h3>Hedefinizi tanımlayın</h3><p className="salon-muted">Önce derinlik, sonra ton yönü. Bunlar istediğiniz renk sonucunu tarif eder; üretici tonu değildir.</p>
 <fieldset disabled={disabled}><legend>Hızlı başlangıçlar</legend><div className="color-preset-list">{presets.map(p=><button key={p.id} type="button" className="button button-secondary" aria-pressed={selected(p)} onClick={()=>apply(p.id)}>{p.label}</button>)}</div></fieldset>
 <div className="salon-form-grid"><label>Hedef derinlik<select aria-label="Hedef derinlik" disabled={disabled} value={level} onChange={e=>setLevel(Number(e.target.value))}>{levelLabels.map((label,i)=><option key={i} value={i+1}>{i+1} · {label}</option>)}</select></label><label>Uygulanacak bölge<select aria-label="Uygulanacak bölge" disabled={disabled} value={scope} onChange={e=>setScope(e.target.value)}><option value="ALL">Tüm aktif bölgeler</option>{definition.regions.map(r=><option key={r.regionId} value={r.regionId}>{regionName(snapshot,r.regionId)}</option>)}</select></label></div>
 <fieldset disabled={disabled}><legend>Hedef ton yönü</legend><div className="color-family-list">{families.map(f=><label key={f.id} className="color-family-option"><input type="radio" name="target-family" checked={family===f.id} onChange={()=>setFamily(f.id)}/><span className="color-family-chip" style={{backgroundColor:f.color}} aria-hidden="true"/>{f.label}</label>)}</div></fieldset>
 <p className="salon-muted">Renk örnekleri yalnız ton ailesini anlatır; sonuç simülasyonu değildir. Birleşik ton yönleri yoğunluk veya karışım oranı belirtmez.</p>
 <button type="button" className="button button-secondary" disabled={disabled} onClick={()=>apply()}>Yapılandırılmış hedefi uygula</button>
 <p>Farklı dip, boy ve uç hedeflerini aşağıda ayrı ayrı düzenleyebilirsiniz.</p></section>;
}
export function ColorTargetSummary({definition,snapshot}:{definition:TargetDefinition;snapshot:HairSnapshot}){
 return <section aria-label="Değerlendirme öncesi hedef özeti" className="salon-notice"><h3>Değerlendirmeden önce</h3>{definition.regions.map(r=>{
 const source=snapshot.regions.find(s=>s.id===r.regionId)!,a=source.assessment;
 const fields=["natural_level","perceived_level","grey_ratio","porosity","elasticity","thickness","density","cosmetic_color_history","bleach_history","chemical_history"] as const;
 const missing=fields.filter(f=>a.state!=="ASSESSED"||a.observation[f].state==="UNKNOWN");
 const known=a.state==="ASSESSED"?Object.values(a.observation).filter(v=>v&&typeof v==="object"&&"state" in v&&v.state==="KNOWN").length:0;
 return <div key={r.regionId}><strong>{regionName(snapshot,r.regionId)}</strong><p>Mevcut değerlendirme: {a.state==="ASSESSED"?"Kayıt var; güncellik ve güveni motor değerlendirecek":"Eksik"} · Bilinen teknik alan: {known}</p><p>Hedef: {r.preserve?"Mevcut renk":`${r.level??"Seçilmedi"} · ${toneDescription(r)}`}{r.greyPriority==="COVER"?" · Beyaz kapama":r.greyPriority==="BLEND"?" · Beyaz harmanlama":""}</p>{a.state==="ASSESSED"&&<p>Mevcut seviye: {a.observation.perceived_level.state==="KNOWN"?a.observation.perceived_level.value:"Bilinmiyor"} · Beyaz oranı: {a.observation.grey_ratio.state==="KNOWN"?`%${Math.round(a.observation.grey_ratio.value*100)}`:"Bilinmiyor"}</p>}{missing.length>0&&<p>Bilinmeyen / değerlendirilmemiş: {missing.map(f=>hairTr.fields[f]).join(", ")}</p>}</div>;
 })}<p>Geçmiş kayıt: {snapshot.history.items.length} · Fiziksel test kaydı: {snapshot.physical_tests.items.length}. Kayıt sayısı geçerli kanıt veya işlem onayı sayılmaz. Eksik, eski ve çelişkili kanıt değerlendirmede ayrıca gösterilir.</p></section>;
}
export function SecondaryDirection({region,onChange}:{region:RegionalColorTarget;onChange:(patch:Partial<RegionalColorTarget>)=>void}){
 const primary=region.toneFamily==="MIXED"?region.mixedFamilies[0]:region.toneFamily;
 return <label>İkincil ton yönü<select aria-label="İkincil ton yönü" disabled={!primary} value={region.toneFamily==="MIXED"?region.mixedFamilies[1]??"":""} onChange={e=>{
  const secondary=e.target.value as RegionalColorTarget["mixedFamilies"][number]|"";
  if(primary)onChange(secondary?{toneFamily:"MIXED",mixedFamilies:[primary as RegionalColorTarget["mixedFamilies"][number],secondary].sort()}:{toneFamily:primary,mixedFamilies:[]});
 }}><option value="">Yok</option>{Object.entries(toneLabels).filter(([key])=>key!=="MIXED"&&key!==primary).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><span className="salon-muted">Birlikte tarif edilen yönlerdir; baskınlık ve doz oranı belirlenmez.</span></label>;
}
