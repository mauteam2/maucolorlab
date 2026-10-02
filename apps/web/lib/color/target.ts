import { z } from "zod";
import type { HairSnapshot } from "@/lib/hair-passport/contracts";
import { canonical } from "@/lib/confidence/input";
import { colorRules, targetIssueCodes } from "./rules";
export const regionalColorTarget=z.strictObject({
 regionId:z.uuid().transform(v=>v.toLowerCase()), level:z.number().min(1).max(10).nullable(), toneFamily:z.enum(colorRules.tones).nullable(),
 mixedFamilies:z.enum(["NEUTRAL","ASH_COOL","VIOLET","BLUE","GREEN","GOLD_WARM","COPPER","RED"]).array().max(3),
 warmth:z.enum(["NEUTRAL","COOL","WARM","PRESERVE"]), greyPriority:z.enum(["NONE","BLEND","COVER"]),
 liftPriority:z.enum(["NONE","NORMAL","HIGH"]), depositPriority:z.enum(["NONE","NORMAL","HIGH"]),
 toneIntent:z.enum(["PRESERVE","NEUTRALIZE","ENHANCE","CHANGE"]), contrast:z.enum(["NONE","SOFT","PRONOUNCED"]),
 preserve:z.boolean(), handling:z.enum(["STANDARD","ISOLATE"]),
 correction:z.enum(["NONE","BAND","UNEVEN","REFLECTION","DARK_ACCUMULATION"]), intermediateLevel:z.number().min(1).max(10).nullable(),
});
export const targetDefinition=z.strictObject({schemaVersion:z.literal(1),mode:z.enum(colorRules.targetModes),
 globalIntent:z.enum(["PRESERVE","REFRESH","TRANSFORM","CORRECT"]), regions:regionalColorTarget.array().min(1).max(100)});
export type TargetDefinition=z.infer<typeof targetDefinition>;
export type RegionalColorTarget=z.infer<typeof regionalColorTarget>;
export const targetValidationIssue=z.strictObject({code:z.enum(targetIssueCodes),regionId:z.uuid().nullable(),field:z.string()});
export type TargetValidationIssue=z.infer<typeof targetValidationIssue>;
export function validateTarget(raw:unknown,snapshot:HairSnapshot):{definition:TargetDefinition|null;issues:TargetValidationIssue[]} {
 const parsed=targetDefinition.safeParse(raw); if(!parsed.success) return {definition:null,issues:[{code:"TARGET_INVALID",regionId:null,field:"definition"}]};
 const definition=parsed.data, issues:TargetValidationIssue[]=[], active=snapshot.regions.filter(r=>r.status === "ACTIVE"), ids=new Set<string>();
 const add=(code:TargetValidationIssue["code"],regionId:string|null,field:string)=>issues.push({code,regionId,field});
 for(const region of definition.regions) {
  if(!active.some(r=>r.id === region.regionId)) add("TARGET_REGION_INVALID",region.regionId,"regionId");
  if(ids.has(region.regionId)) add("TARGET_REGION_DUPLICATE",region.regionId,"regionId"); ids.add(region.regionId);
  if(region.preserve && (region.level!==null || region.toneFamily!==null || region.toneIntent!=="PRESERVE" || region.greyPriority!=="NONE" || region.liftPriority!=="NONE" || region.depositPriority!=="NONE" || region.correction!=="NONE" || region.intermediateLevel!==null || region.warmth!=="PRESERVE" || region.mixedFamilies.length)) add("TARGET_PRESERVE_CONFLICT",region.regionId,"preserve");
  if(!region.preserve && region.level === null) add("TARGET_LEVEL_REQUIRED",region.regionId,"level");
  if(!region.preserve && region.toneIntent!=="PRESERVE" && region.toneFamily === null) add("TARGET_TONE_REQUIRED",region.regionId,"toneFamily");
  if(region.toneFamily === "MIXED" ? new Set(region.mixedFamilies).size<2 || new Set(region.mixedFamilies).size!==region.mixedFamilies.length : region.mixedFamilies.length>0) add("TARGET_MIXED_TONE_INVALID",region.regionId,"mixedFamilies");
  if(region.liftPriority!=="NONE" && region.depositPriority!=="NONE") add("TARGET_PRIORITY_CONFLICT",region.regionId,"liftPriority");
  if(["BAND","DARK_ACCUMULATION"].includes(region.correction) && region.intermediateLevel===null) add("TARGET_INTERMEDIATE_REQUIRED",region.regionId,"intermediateLevel");
 }
 for(const region of active) if(!ids.has(region.id)) add("TARGET_REGION_MISSING",region.id,"regions");
 if(definition.mode === "UNIFORM_COLOR") {
  const goals=definition.regions.filter(r=>!r.preserve).map(r=>canonical([r.level,r.toneFamily,[...r.mixedFamilies].sort(),r.warmth]));
  if(definition.regions.some(r=>r.preserve) || new Set(goals).size>1) add("TARGET_UNIFORM_CONFLICT",null,"mode");
 }
 return {definition:{...definition,regions:definition.regions.map(r=>({...r,mixedFamilies:[...r.mixedFamilies].sort()})).sort((a,b)=>a.regionId<b.regionId?-1:1)},issues};
}
export const colorTarget=z.strictObject({id:z.uuid(),seriesId:z.uuid(),version:z.int().positive().max(Number.MAX_SAFE_INTEGER),previousVersionId:z.uuid().nullable(),
 clientId:z.uuid(),passportId:z.uuid(),definition:targetDefinition,createdAt:z.iso.datetime({offset:true}),createdBy:z.uuid()});
export type ColorTarget=z.infer<typeof colorTarget>;
export const createTargetRequest=z.strictObject({request_id:z.uuid(),definition:targetDefinition});
export const reviseTargetRequest=z.strictObject({request_id:z.uuid(),series_id:z.uuid(),expected_version:z.int().positive().max(Number.MAX_SAFE_INTEGER),definition:targetDefinition});
