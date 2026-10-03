import type { ColorPlanning } from "@/lib/color/model";
import { normalizeInput, type ConfidenceInput } from "@/lib/confidence/input";
import { evaluateConfidence } from "@/lib/confidence/engine";
import { evaluatePilotCandidates } from "./pilot";
import type { PilotPacket } from "./pilot-model";
import { controlledOptions, controlledRecipe, controlledCreateRequest, type ControlledCreate } from "./controlled-model";

/** Professional selections plus documented ratio arithmetic; never a pigment solver. */
export function controlledRecipeOptions(plan: ColorPlanning, packet: PilotPacket, input: ConfidenceInput) {
 const pilot = evaluatePilotCandidates(plan, packet);
 const result = {schemaVersion:1 as const, status:pilot.status as "NO_VERIFIED_MATCH"|"BLOCKED_BY_SAFETY"|"CATALOG_UNAVAILABLE"|"ASSESSMENT_REQUIRED"|"OPTIONS_FOR_REVIEW",
  catalogId:pilot.catalogId,catalogVersion:pilot.catalogVersion,catalogFingerprint:pilot.catalogFingerprint,
  candidates:[] as typeof pilot.candidates,whiteRatio:null as number|null,evidenceIds:[] as string[],regionId:null as string|null,
  executable:false as const,explanation:pilot.explanation.summary};
 if(pilot.status!=="CANDIDATES_FOR_REVIEW")return controlledOptions.parse(result);
 const goal=plan.recipeDraft!.target.definition.regions.find(r=>!r.preserve)!;
 const region=input.pages[0]!.regions.find(r=>r.id===goal.regionId&&r.type==="ROOT"&&r.status==="ACTIVE");
 if(!region){result.status="NO_VERIFIED_MATCH";return controlledOptions.parse(result);}
 const confidence=evaluateConfidence(input),normalized=normalizeInput(input);
 const field=confidence.domains.flatMap(d=>d.fields).find(f=>f.field==="grey_ratio"&&f.target===region.id);
 const selected=normalized.candidates.filter(c=>c.field==="grey_ratio"&&field?.evidenceRefs.some(r=>r.id===c.ref.id&&r.evidenceId===c.ref.evidenceId));
 if(!field||field.state!=="KNOWN"||field.freshness!=="FRESH"||!selected.length||
  confidence.conflicts.some(c=>c.field==="grey_ratio"&&(c.target===region.id||c.target==="GLOBAL"))||
  selected.some(c=>c.state!=="KNOWN"||c.source!=="PROFESSIONAL_VERIFIED"||!c.ref.evidenceId||typeof c.value!=="number"||c.value<0||c.value>1)||
  new Set(selected.map(c=>c.value)).size!==1){
  result.status="ASSESSMENT_REQUIRED";result.explanation="Dip bölgesinin güncel, doğrulanmış beyaz oranı gerekli. Hair Passport değerlendirmesini tamamlayın.";
  return controlledOptions.parse(result);
 }
 const ratio=selected[0]!.value as number;
 result.whiteRatio=ratio;result.regionId=region.id;result.evidenceIds=[...new Set(selected.map(c=>c.ref.evidenceId!))];
 result.candidates=pilot.candidates.filter(c=>c.mixingRatio==="1:1"&&
  (c.restrictions.whitePercentGreaterThan===null||ratio>c.restrictions.whitePercentGreaterThan/100)&&
  (c.restrictions.whitePercentAtMost===null||ratio<=c.restrictions.whitePercentAtMost/100));
 result.status=result.candidates.length?"OPTIONS_FOR_REVIEW":"NO_VERIFIED_MATCH";
 result.explanation=result.candidates.length?"Üretici koşullarıyla uyumlu seçenekler. Ton ve boya miktarı profesyonel seçiminizdir; oran hesabı uygulama izni değildir.":"Güncel saç bağlamına uygun doğrulanmış seçenek bulunamadı.";
 return controlledOptions.parse(result);
}

export function buildControlledRecipe(plan:ColorPlanning,packet:PilotPacket,input:ConfidenceInput,raw:ControlledCreate,parentRecipeId:string){
 const q=controlledCreateRequest.parse(raw),options=controlledRecipeOptions(plan,packet,input);
 if(q.catalog_id!==packet.catalog.release.id)throw new Error("CONTROLLED_RECIPE_CONTEXT_INVALID");
 const selected=options.candidates.find(c=>c.productId===q.product_id&&c.developerId===q.developer_id);
 if(options.status!=="OPTIONS_FOR_REVIEW"||!selected||!options.regionId||options.whiteRatio===null)throw new Error("CONTROLLED_RECIPE_CONTEXT_INVALID");
 const colorCentiGrams=Math.round(q.color_grams*100);
 return controlledRecipe.parse({schemaVersion:3,engineVersion:"controlled-brand-recipe/1.0.0",state:"DRAFT_FOR_PROFESSIONAL_REVIEW",
  executable:false,professionalReviewRequired:true,selectionOrigin:"PROFESSIONAL_INPUT",parentRecipeId,selected,
  colorGrams:colorCentiGrams/100,developerGrams:colorCentiGrams/100,totalGrams:colorCentiGrams*2/100,amountBasis:"USER_ENTERED_COLOR_GRAMS",
  context:{regionId:options.regionId,whiteRatio:options.whiteRatio,evidenceIds:options.evidenceIds},
  sources:packet.sources.filter(s=>selected.sourceIds.includes(s.id)),
  snapshots:{catalogId:packet.catalog.release.id,catalogVersion:packet.catalog.release.version,catalogFingerprint:packet.catalog.release.versionFingerprint,
   productVersion:packet.catalog.products.find(p=>p.id===selected.productId)!.version,developerVersion:packet.catalog.products.find(p=>p.id===selected.developerId)!.version,
   ruleVersion:packet.catalog.compatibility.find(r=>r.id===selected.compatibilityRuleId)!.version,colorEngine:plan.engineVersion,riskEngine:plan.metadata.riskVersion,
   hairFingerprint:plan.metadata.hairFingerprint,evaluatedAt:plan.evaluatedAt}});
}
