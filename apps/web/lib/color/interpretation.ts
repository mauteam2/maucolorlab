import { z } from "zod";
import { colorRules } from "./rules";
import { taxonomyVersion } from "./taxonomy";
import type { TargetDefinition } from "./target";
export const targetInterpretation=z.strictObject({schemaVersion:z.literal(1),taxonomyVersion:z.literal(taxonomyVersion),
 mode:z.enum(colorRules.targetModes),globalIntent:z.enum(["PRESERVE","REFRESH","TRANSFORM","CORRECT"]),
 regions:z.strictObject({regionId:z.uuid(),level:z.number().min(1).max(10).nullable(),tones:z.enum(colorRules.tones).array().max(3),
  warmth:z.enum(["NEUTRAL","COOL","WARM","PRESERVE"]),greyIntent:z.enum(["NONE","BLEND","COVER"]),preserve:z.boolean(),
  correction:z.enum(["NONE","BAND","UNEVEN","REFLECTION","DARK_ACCUMULATION"]),intermediateLevel:z.number().min(1).max(10).nullable()}).array().min(1).max(100),
 numericPigmentStrength:z.literal("UNKNOWN"),preview:z.literal("ILLUSTRATIVE_ONLY")});
export function interpretTarget(t:TargetDefinition){return targetInterpretation.parse({schemaVersion:1,taxonomyVersion,mode:t.mode,globalIntent:t.globalIntent,
 regions:[...t.regions].sort((a,b)=>a.regionId.localeCompare(b.regionId)).map(r=>({regionId:r.regionId,level:r.level,
 tones:r.toneFamily==="MIXED"?[...r.mixedFamilies].sort():r.toneFamily?[r.toneFamily]:[],warmth:r.warmth,greyIntent:r.greyPriority,preserve:r.preserve,correction:r.correction,intermediateLevel:r.intermediateLevel})),
 numericPigmentStrength:"UNKNOWN",preview:"ILLUSTRATIVE_ONLY"});}
