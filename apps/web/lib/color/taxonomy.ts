import { z } from "zod";
import { colorRules } from "./rules";
import { regionalColorTarget, type RegionalColorTarget } from "./target";

// Desired visual intent only. Combinations carry no concentration or dominance.
export const taxonomyVersion = "color-target-taxonomy/1.0.0" as const;
export const toneLabels = { NEUTRAL:"Doğal / nötr", ASH_COOL:"Küllü / soğuk", VIOLET:"Viyole", BLUE:"Mavi yansıma", GREEN:"Yeşil yansıma", GOLD_WARM:"Altın / sıcak", COPPER:"Bakır", RED:"Kızıl", MIXED:"Birleşik ton yönü" } as const;
export const families = [
 {id:"NATURAL",label:"Doğal / nötr",tones:["NEUTRAL"],warmth:"NEUTRAL",color:"#87745e"},
 {id:"ASH",label:"Küllü / soğuk",tones:["ASH_COOL"],warmth:"COOL",color:"#877f7c"},
 {id:"BEIGE",label:"Bej",tones:["NEUTRAL","GOLD_WARM"],warmth:"NEUTRAL",color:"#b49b75"},
 {id:"GOLD",label:"Altın / sıcak",tones:["GOLD_WARM"],warmth:"WARM",color:"#b48b46"},
 {id:"CARAMEL",label:"Karamel",tones:["GOLD_WARM","COPPER"],warmth:"WARM",color:"#a86e3e"},
 {id:"COPPER",label:"Bakır",tones:["COPPER"],warmth:"WARM",color:"#ae653d"},
 {id:"RED",label:"Kızıl",tones:["RED"],warmth:"WARM",color:"#913f44"},
 {id:"VIOLET",label:"Viyole",tones:["VIOLET"],warmth:"COOL",color:"#79566f"},
] as const;
export const presets = [
 {id:"COOL_BRUNETTE",label:"Soğuk kahve",level:5,family:"ASH"},
 {id:"WARM_BRUNETTE",label:"Sıcak kahve",level:5,family:"GOLD"},
 {id:"CARAMEL",label:"Karamel",level:7,family:"CARAMEL"},
 {id:"COPPER",label:"Bakır",level:7,family:"COPPER"},
 {id:"NATURAL_BRUNETTE",label:"Doğal kahve",level:5,family:"NATURAL"},
 {id:"BEIGE_BLONDE",label:"Bej sarı",level:9,family:"BEIGE"},
 {id:"GOLD_BLONDE",label:"Altın sarı",level:9,family:"GOLD"},
 {id:"COOL_BLONDE",label:"Soğuk sarı",level:9,family:"ASH"},
] as const;
export const levelLabels = ["Siyah","Çok koyu kahve","Koyu kahve","Orta kahve","Açık kahve","Koyu sarı","Orta sarı","Açık sarı","Çok açık sarı","En açık sarı"];
export const targetOptions = z.strictObject({taxonomyVersion:z.literal(taxonomyVersion),targetSchemaVersion:z.literal(1),
 levels:z.strictObject({value:z.int().min(1).max(10),label:z.string()}).array().length(10),
 families:z.strictObject({id:z.string(),label:z.string(),tones:z.enum(colorRules.tones).array().min(1).max(2),warmth:z.enum(["NEUTRAL","COOL","WARM"]),color:z.string().regex(/^#[a-f0-9]{6}$/)}).array(),
 presets:z.strictObject({id:z.string(),label:z.string(),level:z.int().min(1).max(10),family:z.string()}).array(),
 preview:z.literal("ILLUSTRATIVE_ONLY"),numericPigmentStrength:z.literal("UNKNOWN")});
export const options = targetOptions.parse({taxonomyVersion,targetSchemaVersion:1,levels:levelLabels.map((label,i)=>({value:i+1,label})),families,presets,preview:"ILLUSTRATIVE_ONLY",numericPigmentStrength:"UNKNOWN"});
export function familyPatch(id: string): Partial<RegionalColorTarget> {
 const f=families.find(f=>f.id===id);if(!f)throw new Error("COLOR_TARGET_INVALID");
 return {toneFamily:f.tones.length===1?f.tones[0]:"MIXED",mixedFamilies:f.tones.length===1?[]:[...f.tones].sort(),warmth:f.warmth};
}
export function presetRegion(id:string, region:RegionalColorTarget):RegionalColorTarget {
 const p=presets.find(p=>p.id===id);if(!p)throw new Error("COLOR_TARGET_INVALID");
 return regionalColorTarget.parse({...region,preserve:false,level:p.level,...familyPatch(p.family),toneIntent:"CHANGE",depositPriority:"NORMAL",liftPriority:"NONE"});
}
export function toneDescription(region:RegionalColorTarget) {
 return region.preserve?"Mevcut renk korunacak":region.toneFamily==="MIXED"?region.mixedFamilies.map(t=>toneLabels[t]).join(" + "):region.toneFamily?toneLabels[region.toneFamily]:"Ton seçilmedi";
}
