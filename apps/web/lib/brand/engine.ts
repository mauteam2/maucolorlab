import { catalogPacket, requirement, adapterEvaluation, type CatalogPacket, type Product, type Fact, type AdapterEvaluation } from "./model";
import type { ColorPlanning } from "@/lib/color/model";

const toneChannel:Record<string,string>={NEUTRAL:"neutral",ASH_COOL:"ash",VIOLET:"violet",BLUE:"blue",GREEN:"green",GOLD_WARM:"gold",COPPER:"copper",RED:"red"};
export function verifiedFact(product:Product,key:string,allowSalon:boolean):Fact|null {
 const f=product.facts.find(f=>f.key===key);
 return f&&f.value!==null&&f.confidence!==null&&f.confidence>0&&(f.verificationStatus==="ELIFORA_VERIFIED"||allowSalon&&f.verificationStatus==="SALON_VERIFIED")?f:null;
}
/** No manufacturer defaults, vector interpolation, percentage inference, or stock override. */
export function evaluateBrandAdapter(rawPlan:ColorPlanning,rawCatalog:CatalogPacket,organizationId:string,allowSalon=false):AdapterEvaluation {
 const technicalRequirement=requirement.parse({schemaVersion:1,plan:rawPlan,developerConstraints:"VERIFIED_COMPATIBILITY_ONLY"}),plan=technicalRequirement.plan,catalog=catalogPacket.parse(rawCatalog);
 const result:AdapterEvaluation={engineVersion:"brand-adapter/1.0.0",status:"BRAND_MATCH_PENDING",candidateIds:[],reasons:[],recipe:null};
 const stop=(status:AdapterEvaluation["status"],reason:string)=>adapterEvaluation.parse({...result,status,reasons:[reason]});
 if(catalog.release.scope==="ORGANIZATION"&&catalog.release.organizationId!==organizationId)throw new Error("FORBIDDEN");
 if(plan.status!=="DRAFT"||!plan.safetyGate.canProgress||!plan.recipeDraft||plan.requiredPhysicalTests.some(t=>t.status!=="SATISFIED")||plan.requiredInformation.length)return stop("BLOCKED_BY_SAFETY","COLOR_SAFETY_REQUIREMENTS_UNSATISFIED");
 if(catalog.release.state!=="PUBLISHED")return stop("BRAND_MATCH_PENDING","CATALOG_NOT_PUBLISHED");
 // Complete multi-region formulation and mixing optimization belong to a later controlled slice.
 const objectives=plan.recipeDraft.target.definition.regions.filter(r=>!r.preserve);
 if(objectives.length!==1||plan.primaryStrategy?.tradeoffs.complexity!=="SIMPLE"||plan.primaryStrategy.sessions.max!==1)return stop("BRAND_MATCH_PENDING","REGIONAL_OR_STAGED_FORMULATION_REQUIRES_REVIEW");
 const goal=objectives[0]!,intent=plan.regions.find(r=>r.regionId===goal.regionId)!;
 if(!toneChannel[goal.toneFamily??""]||goal.mixedFamilies.length||goal.correction!=="NONE"||goal.toneIntent==="NEUTRALIZE")return stop("BRAND_MATCH_PENDING","QUANTITATIVE_NEUTRALIZATION_OR_MIXING_NOT_VALIDATED");
 const ids=new Set(catalog.products.map(p=>p.id));
 if(ids.size!==catalog.products.length||catalog.products.some(p=>p.catalogId!==catalog.release.id||!catalog.brands.some(b=>b.id===p.brandId&&b.catalogId===p.catalogId)||!catalog.lines.some(l=>l.id===p.lineId&&l.catalogId===p.catalogId&&l.brandId===p.brandId))||catalog.compatibility.some(r=>r.catalogId!==catalog.release.id||!ids.has(r.productId)||!ids.has(r.developerId)))throw new Error("BRAND_CATALOG_INVALID");
 const eligible=(p:Product)=>p.active&&(p.verificationStatus==="ELIFORA_VERIFIED"&&catalog.release.scope==="GLOBAL"||p.verificationStatus==="SALON_VERIFIED"&&catalog.release.scope==="ORGANIZATION"&&allowSalon);
 const products=catalog.products.filter(p=>["SHADE","TONER"].includes(p.productType));
 const trusted=products.filter(eligible);
 if(!trusted.length)return stop("BLOCKED_UNVERIFIED_PRODUCT","NO_ACTIVE_VERIFIED_PRODUCT");
 let missing=false,compatibility=false;
 for(const p of [...trusted].sort((a,b)=>a.id.localeCompare(b.id))) {
  const fact=(k:string)=>verifiedFact(p,k,allowSalon);
  if(fact("shade_level")?.value!==goal.level||fact("tone_family")?.value!==goal.toneFamily){missing=true;continue;}
  const needed=["level_effect",toneChannel[goal.toneFamily!]!,"opacity",...(intent.delta!>0?["lift_behavior","lift_levels"]:["deposit_strength","deposit_capability"]),...(goal.greyPriority==="COVER"?["coverage_strength","grey_coverage"]:[])];
  if(needed.some(k=>!fact(k))||intent.delta!>0&&(typeof fact("lift_levels")?.value!=="number"||Number(fact("lift_levels")!.value)<intent.delta!)||intent.delta!<=0&&fact("deposit_capability")?.value!==true||goal.greyPriority==="COVER"&&fact("grey_coverage")?.value!==true){missing=true;continue;}
  result.candidateIds.push(p.id);
  const rules=catalog.compatibility.filter(r=>r.productId===p.id&&r.technique===plan.recipeDraft!.target.definition.mode&&r.applicationContext===goal.handling);
  for(const rule of rules.sort((a,b)=>a.id.localeCompare(b.id))) {
   const d=catalog.products.find(d=>d.id===rule.developerId)!;
   if(!eligible(d)||!["DEVELOPER","ACTIVATOR"].includes(d.productType)||!rule.outcome.startsWith("VERIFIED_")){compatibility=true;continue;}
   // Ambiguous or contradictory rules fail closed; no optimistic rule selection.
   if(rules.filter(r=>r.developerId===d.id).length!==1||rule.restrictions.length||rule.conditions.some(c=>c==="NO_LIFT"&&intent.delta!>0||c==="NO_GREY_COVERAGE"&&goal.greyPriority!=="NONE"||c==="STANDARD_REGION_ONLY"&&(intent.separateHandling||goal.handling!=="STANDARD"))){compatibility=true;continue;}
   if(catalog.release.scope==="GLOBAL"&&rule.source==="SALON_VALIDATED"||catalog.release.scope==="ORGANIZATION"&&rule.source!=="SALON_VALIDATED"){compatibility=true;continue;}
   const ratio=fact("mixing_ratio"),time=fact("processing_minutes"),strength=verifiedFact(d,"developer_strength",allowSalon);
   if(!ratio||ratio.unit!=="RATIO"||typeof ratio.value!=="string"||!/^\d+(\.\d+)?:\d+(\.\d+)?$/.test(ratio.value)||ratio.value.split(":").some(v=>Number(v)<=0)||!time||time.unit!=="MINUTES"||typeof time.value!=="number"||time.value<=0||!strength||strength.unit!=="PERCENT"||typeof strength.value!=="number"||strength.value<=0){missing=true;continue;}
   return adapterEvaluation.parse({...result,status:"BRAND_READY",recipe:{schemaVersion:2,version:1,parentRecipeId:plan.recipeDraft!.id,executionStatus:"BRAND_READY",executable:false,professionalReviewRequired:true,product:p,developer:d,compatibility:rule,technicalRequirement,snapshots:{colorEngine:plan.engineVersion,riskEngine:plan.metadata.riskVersion,brandAdapter:result.engineVersion,brandCatalogId:catalog.release.id,brandCatalogVersion:catalog.release.version,catalogFingerprint:catalog.release.versionFingerprint,compatibilityMatrixVersion:rule.version,productVersions:[p.version,d.version],pigmentVectorVersion:"pigment-vector/1.0.0"}}});
  }
  if(!rules.length)compatibility=true;
 }
 return stop(compatibility?"BLOCKED_COMPATIBILITY":missing?"BLOCKED_MISSING_TECHNICAL_DATA":"BRAND_MATCH_PENDING",compatibility?"COMPATIBILITY_NOT_VERIFIED":missing?"VERIFIED_TECHNICAL_DATA_MISSING":"NO_EXACT_DOCUMENTED_MATCH");
}
