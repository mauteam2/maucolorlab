import { colorRules } from "@/lib/color/rules";
import { toneLabels } from "@/lib/color/taxonomy";
import type { RegionalColorTarget } from "@/lib/color/target";
import { SecondaryDirection } from "./color-target-picker";
export function RegionalColorTargetEditor({region,name,disabled,onChange}:{region:RegionalColorTarget;name:string;disabled:boolean;onChange:(patch:Partial<RegionalColorTarget>)=>void}){
 return <fieldset disabled={disabled} className="salon-region-editor"><legend>{name}</legend>
 <label><input type="checkbox" checked={region.preserve} onChange={e=>onChange(e.target.checked?{preserve:true,level:null,toneFamily:null,mixedFamilies:[],warmth:"PRESERVE",toneIntent:"PRESERVE",greyPriority:"NONE",liftPriority:"NONE",depositPriority:"NONE",contrast:"NONE",handling:"STANDARD",correction:"NONE",intermediateLevel:null}:{preserve:false,level:null,toneFamily:null,mixedFamilies:[],warmth:"NEUTRAL",toneIntent:"CHANGE",depositPriority:"NORMAL"})}/> Mevcut rengi koru</label>
 {!region.preserve&&<><div className="salon-form-grid"><label>Hedef seviye<input type="number" min={1} max={10} step={0.5} value={region.level??""} onChange={e=>onChange({level:e.target.value?Number(e.target.value):null})}/></label><label>Ton ailesi<select value={region.toneFamily??""} onChange={e=>onChange({toneFamily:(e.target.value||null) as RegionalColorTarget["toneFamily"],mixedFamilies:[]})}><option value="">Seçin</option>{colorRules.tones.map(t=><option key={t} value={t}>{toneLabels[t]}</option>)}</select></label>
 <SecondaryDirection region={region} onChange={onChange}/><label>Beyaz önceliği<select value={region.greyPriority} onChange={e=>onChange({greyPriority:e.target.value as RegionalColorTarget["greyPriority"]})}><option value="NONE">Yok</option><option value="BLEND">Harmanla</option><option value="COVER">Kapat</option></select></label></div>
 <details className="color-regional-details" open={region.correction!=="NONE"||region.handling!=="STANDARD"||region.liftPriority!=="NONE"||region.toneIntent!=="CHANGE"||region.contrast!=="NONE"}><summary>Ayrıntılı bölgesel ayarlar</summary><div className="salon-form-grid">
 {region.toneFamily==="MIXED"&&<label className="wide">Karışık ton aileleri (2–3)<select multiple value={region.mixedFamilies} onChange={e=>onChange({mixedFamilies:Array.from(e.target.selectedOptions,o=>o.value) as RegionalColorTarget["mixedFamilies"]})}>{colorRules.tones.filter(t=>t!=="MIXED").map(t=><option key={t} value={t}>{toneLabels[t]}</option>)}</select></label>}
 {([
 ["warmth","Sıcaklık",["NEUTRAL","COOL","WARM","PRESERVE"],["Nötr","Soğuk","Sıcak","Koru"]],
 ["liftPriority","Açma önceliği",["NONE","NORMAL","HIGH"],["Yok","Normal","Yüksek"]],
 ["depositPriority","Pigment önceliği",["NONE","NORMAL","HIGH"],["Yok","Normal","Yüksek"]],
 ["toneIntent","Ton amacı",["PRESERVE","NEUTRALIZE","ENHANCE","CHANGE"],["Koru","Nötrleştir","Güçlendir","Değiştir"]],
 ["contrast","Kontrast",["NONE","SOFT","PRONOUNCED"],["Yok","Yumuşak","Belirgin"]],
 ["handling","Bölgesel uygulama",["STANDARD","ISOLATE"],["Standart","İzole et"]],
 ["correction","Düzeltme",["NONE","BAND","UNEVEN","REFLECTION","DARK_ACCUMULATION"],["Yok","Bant","Düzensizlik","Yansıma","Koyu birikim"]],
 ] as const).map(([key,label,values,labels])=><label key={key}>{label}<select value={region[key]} onChange={e=>onChange({[key]:e.target.value})}>{values.map((value,i)=><option key={value} value={value}>{labels[i]}</option>)}</select></label>)}
 <label>Ara hedef seviye<input type="number" min={1} max={10} step={0.5} value={region.intermediateLevel??""} onChange={e=>onChange({intermediateLevel:e.target.value?Number(e.target.value):null})}/></label></div></details></>}
 </fieldset>;
}
