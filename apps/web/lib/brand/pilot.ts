import type { ColorPlanning } from "@/lib/color/model";
import { pilotPacket,pilotResult,type PilotPacket } from "./pilot-model";
import { verifiedFact } from "./engine";
/** A source-backed candidate is never a calibrated pigment model or executable formula. */
export function evaluatePilotCandidates(plan:ColorPlanning,raw:PilotPacket){
 const p=pilotPacket.parse(raw),catalog=p.catalog;
 const result={schemaVersion:1 as const,status:"NO_VERIFIED_MATCH" as "NO_VERIFIED_MATCH"|"BLOCKED_BY_SAFETY"|"CATALOG_UNAVAILABLE"|"CANDIDATES_FOR_REVIEW",catalogId:catalog.release.id,catalogVersion:catalog.release.version,catalogFingerprint:catalog.release.versionFingerprint,candidates:[] as Array<ReturnType<typeof pilotResult.parse>["candidates"][number]>,executable:false as const,professionalReviewRequired:true as const,explanation:{summary:"Doğrulanmış ürün adayı bulunamadı.",unknowns:["Sayısal pigment vektörü","Kesin işlem süresi","Kimyasal uygulama kararı"],limitations:["Yalnızca dip bölgesi; üreticinin tam güvenlik talimatı ve profesyonel inceleme gerekir.","Geliştirici seçiminin beyaz oranı ve lift bağlamı ayrıca doğrulanmalıdır."]}};
 if(plan.status!=="DRAFT"||!plan.safetyGate.canProgress||!plan.recipeDraft||plan.requiredInformation.length||plan.requiredPhysicalTests.some(t=>t.status!=="SATISFIED")){result.status="BLOCKED_BY_SAFETY";result.explanation.summary="Güvenlik değerlendirmesi tamamlanmadan ürün adayı önerilemez.";return pilotResult.parse(result);}
 if(catalog.release.state!=="PUBLISHED"||p.sources.some(s=>s.review_status!=="APPROVED"||s.verification_status!=="ELIFORA_VERIFIED")||!p.governance.reviewedBy||!p.governance.approvedBy||!p.governance.publishedBy){result.status="CATALOG_UNAVAILABLE";return pilotResult.parse(result);}
 const goals=plan.recipeDraft.target.definition.regions.filter(r=>!r.preserve);
 if(goals.length!==1||plan.recipeDraft.target.definition.mode!=="ROOT_REFRESH"||plan.primaryStrategy?.sessions.max!==1||plan.primaryStrategy.tradeoffs.complexity!=="SIMPLE")return pilotResult.parse(result);
 const goal=goals[0]!,intent=plan.regions.find(r=>r.regionId===goal.regionId);
 if(goal.mixedFamilies.length||goal.correction!=="NONE"||goal.toneIntent==="NEUTRALIZE"||goal.handling!=="STANDARD"||!intent||intent.delta===null)return pilotResult.parse(result);
 const approvedSource=(id:string)=>p.sources.some(s=>s.id===id&&s.review_status==="APPROVED"&&s.verification_status==="ELIFORA_VERIFIED");
 for(const product of [...catalog.products].sort((a,b)=>a.id.localeCompare(b.id))){
  const evidence=p.evidence.find(e=>e.product_id===product.id);
  if(product.productType!=="SHADE"||!product.active||product.verificationStatus!=="ELIFORA_VERIFIED"||!evidence||!approvedSource(evidence.source_id)||!approvedSource(evidence.notation_source_id)||evidence.manufacturer_level!==goal.level||!evidence.normalized_tone||evidence.normalized_tone!==goal.toneFamily||!evidence.manufacturer_tone||!evidence.processing_minutes_min||!evidence.processing_minutes_max)continue;
  for(const rule of catalog.compatibility.filter(r=>r.productId===product.id)){
   const developer=catalog.products.find(d=>d.id===rule.developerId),usage=p.ruleSources.find(r=>r.rule_id===rule.id);
   if(!developer||developer.brandId!==product.brandId||developer.productType!=="DEVELOPER"||!developer.active||developer.verificationStatus!=="ELIFORA_VERIFIED"||rule.outcome!=="VERIFIED_RESTRICTED"||rule.source!=="MANUFACTURER_DOCUMENTATION"||!rule.verifiedBy||!rule.verifiedAt||!rule.sourceReference||!rule.mixingRatio||rule.mixingRatio!==verifiedFact(product,"mixing_ratio",false)?.value||!verifiedFact(developer,"developer_strength",false)||rule.technique!=="ROOT_REFRESH"||rule.applicationContext!==goal.handling||!usage||!usage.regrowth_only||!approvedSource(usage.source_id)||usage.max_lift===null||intent.delta>usage.max_lift)continue;
   // White percentage is not part of the Color TechnicalRequirement. Preserve
   // exact documentary restrictions for professional review; never claim satisfied.
   result.candidates.push({productId:product.id,manufacturerCode:product.manufacturerCode,displayName:product.displayName,manufacturerTone:evidence.manufacturer_tone,normalizedTone:evidence.normalized_tone,developerId:developer.id,developerName:developer.displayName,compatibilityRuleId:rule.id,compatibility:"VERIFIED_RESTRICTED",mixingRatio:rule.mixingRatio,processingMinutes:{min:evidence.processing_minutes_min,max:evidence.processing_minutes_max},restrictions:{whitePercentGreaterThan:usage.white_min_exclusive,whitePercentAtMost:usage.white_max_inclusive,maxLift:usage.max_lift,regrowthOnly:true,safetyReviewRequired:true},sourceIds:[...new Set([evidence.source_id,evidence.notation_source_id,usage.source_id])],executable:false});
  }
 }
 if(result.candidates.length){result.status="CANDIDATES_FOR_REVIEW";result.explanation.summary="Üretici kodu, hedef seviye ve belgelenmiş ton ailesi eşleşen adaylar bulundu. Beyaz oranına bağlı geliştirici sınırları profesyonel inceleme bekliyor.";}
 return pilotResult.parse(result);
}
