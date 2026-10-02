import { createHash } from "node:crypto";
import { canonical, normalizeInput, type ConfidenceInput } from "@/lib/confidence/input";
import type { CaseConfidenceAssessment } from "@/lib/confidence/model";
import type { TechnicalField } from "@/lib/confidence/rules";
import { confidenceRules } from "@/lib/confidence/rules";
import type { RiskAssessment } from "@/lib/risk/model";
import { riskAssessment } from "@/lib/risk/contracts";
import { riskRules } from "@/lib/risk/rules";
import { assessPhysicalTest } from "@/lib/risk/physical-tests";
import { colorTarget, validateTarget, type ColorTarget } from "./target";
import { colorRules as rules } from "./rules";
import { ColorInputError, colorPlanning, type ColorPlanning, type RegionPlan, type ColorReasonCode, type ColorStage, type ColorStrategy } from "./model";
export const colorHash=(value:unknown)=>createHash("sha256").update(canonical(value)).digest("hex");
const stable=<T>(items:T[])=>[...new Map(items.map(i=>[canonical(i),i])).entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([,i])=>i);
/** Pure planning only. Confidence/Risk are supplied by the authoritative server chain. */
export function evaluateColorPlanning(snapshot:ConfidenceInput,confidence:CaseConfidenceAssessment,risk:RiskAssessment,target:ColorTarget):ColorPlanning {
 let n:ReturnType<typeof normalizeInput>;
 try {
  n=normalizeInput(snapshot); colorTarget.parse(target); riskAssessment.parse(risk);
  const scope={state:risk.scopeAssessment,evidenceRefs:stable(risk.hardStops.filter(s=>s.reasonCodes.includes("OUTSIDE_COSMETIC_SCOPE")).flatMap(s=>s.evidenceRefs))};
  if(confidence.inputFingerprint!==colorHash(n)||confidence.rulesFingerprint!==colorHash(confidenceRules)||confidence.engineVersion!==confidenceRules.version||
   confidence.passportId!==n.passportId||confidence.passportVersion!==n.passportVersion||confidence.evaluatedAt!==n.evaluatedAt||
   risk.inputFingerprint!==colorHash({technical:n,confidence,scope})||risk.rulesFingerprint!==colorHash({risk:riskRules,confidence:confidenceRules})||
   risk.passportId!==n.passportId||risk.passportVersion!==n.passportVersion||risk.evaluatedAt!==n.evaluatedAt||
   canonical(risk.confidence)!==canonical({engineVersion:confidence.engineVersion,inputFingerprint:confidence.inputFingerprint,rulesFingerprint:confidence.rulesFingerprint,band:confidence.band,confidence:confidence.confidence})||
   target.passportId!==n.passportId||target.clientId!==snapshot.pages[0]!.passport.client_id||
   new Set(risk.dimensions.map(d=>d.dimension)).size!==8||canonical(risk.regions.map(r=>r.target).sort())!==canonical(n.targets.filter(t=>t!=="GLOBAL").sort())||
   risk.gate.canProgress&&(risk.hardStops.length>0||confidence.band==="INSUFFICIENT")) throw new ColorInputError();
 } catch {throw new ColorInputError();}
 const validation=validateTarget(target.definition,snapshot.pages[0]!);
 const normalizedTarget={...target,definition:validation.definition??target.definition};
 const metadata={colorVersion:rules.version,colorRulesFingerprint:colorHash(rules),inputFingerprint:colorHash({technical:n,confidence,risk,target:normalizedTarget,rules}),
  passportId:n.passportId,passportVersion:n.passportVersion,hairFingerprint:colorHash(n),targetId:target.id,targetVersion:target.version,targetFingerprint:colorHash(normalizedTarget),
  confidenceVersion:"confidence-engine/1.0.0" as const,confidenceFingerprint:confidence.inputFingerprint,confidenceRulesFingerprint:confidence.rulesFingerprint,
  riskVersion:"risk-engine/1.0.0" as const,riskFingerprint:risk.inputFingerprint,riskRulesFingerprint:risk.rulesFingerprint};
 const result:ColorPlanning={engineVersion:rules.version,evaluatedAt:n.evaluatedAt,metadata,status:"DRAFT",feasibility:"DIRECT",targetIssues:validation.issues,
  regions:[],safetyGate:risk.gate,requiredPhysicalTests:stable(risk.requiredPhysicalTests),requiredInformation:stable(riskAssessment.shape.requiredInformation.parse(risk.requiredInformation)),reasonCodes:["BRAND_ADAPTER_REQUIRED"],
  primaryStrategy:null,alternatives:[],recipeDraft:null};
 const blocked=(status:ColorPlanning["status"],feasibility:ColorPlanning["feasibility"],code:ColorReasonCode)=>{
  result.status=status;result.feasibility=feasibility;result.reasonCodes=stable([...result.reasonCodes,code]);return colorPlanning.parse(result);
 };
 if(!risk.gate.canProgress) return blocked(risk.gate.outcome==="REQUIRE_RECOVERY_REASSESSMENT"?"REQUIRES_RECOVERY":["BLOCK_INSUFFICIENT_INFORMATION","REQUIRE_ADDITIONAL_ASSESSMENT"].includes(risk.gate.outcome)?"REQUIRES_ASSESSMENT":["REQUIRE_PHYSICAL_TEST","REQUIRE_STRAND_TEST"].includes(risk.gate.outcome)?"REQUIRES_TEST":"BLOCKED_BY_RISK",
  risk.gate.outcome==="REQUIRE_RECOVERY_REASSESSMENT"?"RECOVERY_REQUIRED":["BLOCK_INSUFFICIENT_INFORMATION","REQUIRE_ADDITIONAL_ASSESSMENT","REQUIRE_PHYSICAL_TEST","REQUIRE_STRAND_TEST"].includes(risk.gate.outcome)?"INFORMATION_REQUIRED":"BLOCKED_BY_SAFETY_GATE","SAFETY_GATE_BLOCKS_PLANNING");
 if(validation.issues.length) return blocked("REQUIRES_ASSESSMENT","INFORMATION_REQUIRED","TARGET_INFORMATION_INCOMPLETE");
 const selected=(region:string,field:TechnicalField)=>{
  const f=confidence.domains.flatMap(d=>d.fields).find(f=>f.target===region&&f.field===field);
  if(f?.state!=="KNOWN"||f.confidence<rules.minimumFieldQuality||["UNKNOWN","EXPIRED","STALE"].includes(f.freshness)) return null;
  const ref=f.evidenceRefs[0];return n.candidates.find(c=>c.target===region&&c.field===field&&canonical(c.ref)===canonical(ref))?.value??null;
 };
 const numeric=(value:unknown)=>typeof value==="number"?value:null;
 let missing=false,major=false,processedMajor=false,staged=false;
 for(const objective of normalizedTarget.definition.regions) {
  const region=snapshot.pages[0]!.regions.find(r=>r.id===objective.regionId)!;
  const current=numeric(selected(region.id,"perceived_level")),natural=numeric(selected(region.id,"natural_level"));
  const delta=current===null||objective.level===null?null:objective.level-current;
  const actions:RegionPlan["actions"]=[],reasons:ColorReasonCode[]=[];
  const history=n.candidates.filter(c=>c.target===region.id&&c.ref.kind==="HISTORY");
  const bleached=history.some(c=>c.field==="bleach_history"),cosmetic=history.some(c=>c.field==="cosmetic_color_history");
  const porous=region.type==="ENDS"&&selected(region.id,"porosity")==="HIGH";
  const separate=region.type==="BANDED_AREA"||objective.correction==="BAND"||objective.handling==="ISOLATE"||bleached||porous;
  const naturalBase=!objective.preserve&&objective.greyPriority==="COVER"&&(numeric(selected(region.id,"grey_ratio"))??-1)>=rules.greyNaturalBaseThreshold;
  if(objective.preserve) {actions.push("PRESERVE");reasons.push("PRESERVE_EXISTING_REGION");}
  else {
   if(delta===null) {missing=true;reasons.push("CURRENT_STATE_INFORMATION_REQUIRED");actions.push("CURRENT_UNKNOWN");}
   else if(delta>0) {actions.push(delta<=rules.smallLiftMax?"LIGHTEN_SMALL":delta<=rules.moderateLiftMax?"LIGHTEN_MODERATE":"LIGHTEN_MAJOR");reasons.push("TARGET_REQUIRES_LIGHTENING");
    result.requiredPhysicalTests.push(assessPhysicalTest(snapshot,n,region.id,"STRAND"));
    if(delta>rules.moderateLiftMax) {major=true;processedMajor ||=bleached;reasons.push("MULTI_SESSION_REQUIRED");}
    if(cosmetic) {staged=true;reasons.push("COSMETIC_HISTORY_REQUIRES_REVIEW");}
   } else if(delta<0) {actions.push("DARKEN");reasons.push("TARGET_REQUIRES_DARKENING");
    if(-delta>=rules.fillDarkeningDelta||target.definition.mode==="FILL_PREPIGMENTATION") {actions.push("FILL_REQUIRED_CANDIDATE");reasons.push("FILL_PREPIGMENTATION_CANDIDATE");staged=true;}
   } else {actions.push("SAME_LEVEL");reasons.push("TARGET_SAME_LEVEL");}
   if(objective.toneIntent!=="PRESERVE") {actions.push(objective.toneIntent==="NEUTRALIZE"?"NEUTRALIZE":objective.toneIntent==="ENHANCE"?"ENHANCE_REFLECTION":"TONE_ONLY");reasons.push(objective.toneIntent==="NEUTRALIZE"?"NEUTRALIZATION_INTENT":"TONE_ADJUSTMENT_INTENT");}
   if(objective.correction!=="NONE") {actions.push("CORRECTION_REQUIRED_CANDIDATE");staged=true;reasons.push("CORRECTION_REQUIRES_INTERMEDIATE_GOAL");}
   if(objective.greyPriority!=="NONE") {reasons.push("GREY_COVERAGE_PRIORITY");if(numeric(selected(region.id,"grey_ratio"))===null)missing=true;}
   if(naturalBase) reasons.push("NATURAL_BASE_SUPPORT_CANDIDATE");
   if(separate) reasons.push("REGION_REQUIRES_SEPARATE_STRATEGY");
   if(region.type==="BANDED_AREA"||objective.correction==="BAND")reasons.push("BAND_REQUIRES_ISOLATION");
   if(bleached)reasons.push("PREVIOUS_LIGHTENING_LIMITS_PROGRESS");
   if(porous)reasons.push("POROUS_ENDS_REQUIRE_CHECKPOINT");
  }
  result.regions.push({regionId:region.id,currentLevel:current,naturalLevel:natural,targetLevel:objective.level,delta,actions,separateHandling:separate,porousEndsLater:porous,naturalBaseSupport:naturalBase,reasonCodes:stable(reasons)});
 }
 result.reasonCodes=stable([...result.reasonCodes,...result.regions.flatMap(r=>r.reasonCodes)]);
 result.requiredPhysicalTests=stable(result.requiredPhysicalTests);
 if(missing)return blocked("REQUIRES_ASSESSMENT","INFORMATION_REQUIRED","CURRENT_STATE_INFORMATION_REQUIRED");
 if(result.requiredPhysicalTests.some(t=>t.status!=="SATISFIED"))return blocked("REQUIRES_TEST","INFORMATION_REQUIRED","PHYSICAL_TEST_REQUIRED");
 if(result.requiredInformation.some(i=>i.severity==="CRITICAL"))return blocked("REQUIRES_ASSESSMENT","INFORMATION_REQUIRED","CURRENT_STATE_INFORMATION_REQUIRED");
 result.feasibility=major?"MULTI_SESSION":staged?"MULTI_STAGE":risk.gate.outcome==="CONTINUE_WITH_CHECKPOINTS"||result.regions.some(r=>r.separateHandling)?"CONDITIONAL":"DIRECT";
 if(risk.gate.outcome==="CONTINUE_WITH_CHECKPOINTS")result.reasonCodes=stable([...result.reasonCodes,"RISK_CHECKPOINTS_REQUIRED"]);
 const ids=result.regions.map(r=>r.regionId),stages:ColorStage[]=[];
 const add=(kind:ColorStage["kind"],regionIds:string[],checkpoint=false,reasonCodes:ColorReasonCode[]=[])=>stages.push({sequence:stages.length+1,kind,regionIds,checkpoint,reasonCodes});
 add("ASSESS",ids,true);add("PREPARE",ids);
 const ordered=[...result.regions].sort((a,b)=>Number(a.porousEndsLater)-Number(b.porousEndsLater)||Number(b.separateHandling)-Number(a.separateHandling)||(a.regionId<b.regionId?-1:1));
 for(const r of ordered) {
  if(r.actions.includes("PRESERVE"))continue;
  const id=[r.regionId],kind=snapshot.pages[0]!.regions.find(x=>x.id===r.regionId)!.type;
  if(r.porousEndsLater)add("REASSESS",id,true,["POROUS_ENDS_REQUIRE_CHECKPOINT"]);
  if(kind==="ROOT"||kind==="MID_LENGTHS"||kind==="ENDS")
   add(kind==="ROOT"?"ROOT_APPLICATION":kind==="ENDS"?"ENDS_APPLICATION":"LENGTHS_APPLICATION",id,r.separateHandling,r.reasonCodes);
  else if(r.separateHandling)add("REASSESS",id,true,r.reasonCodes);
  if(r.actions.includes("CORRECTION_REQUIRED_CANDIDATE")){add("REDUCE_CORRECT",id,false,r.reasonCodes);add("REASSESS",id,true,["CORRECTION_REQUIRES_INTERMEDIATE_GOAL"]);}
  if(r.actions.includes("FILL_REQUIRED_CANDIDATE")){add("FILL_PREPIGMENT",id,false,["FILL_PREPIGMENTATION_CANDIDATE"]);add("REASSESS",id,true);}
  if(r.actions.some(a=>a.startsWith("LIGHTEN"))){add("LIGHTEN",id,false,["TARGET_REQUIRES_LIGHTENING"]);add("REASSESS",id,true);}
  if(r.actions.includes("DARKEN")||r.naturalBaseSupport||normalizedTarget.definition.regions.find(t=>t.regionId===r.regionId)?.greyPriority==="COVER")add("DEPOSIT",id);
  if(r.actions.includes("NEUTRALIZE"))add("NEUTRALIZE",id);
  else if(r.actions.includes("TONE_ONLY")||r.actions.includes("ENHANCE_REFLECTION"))add("TONE",id);
 }
 add("FINALIZE",ids,true);
 const checkpoints:ColorStrategy["requiredCheckpoints"]=["RISK_REASSESSMENT","REGIONAL_INTEGRITY"];
 if(staged)checkpoints.push("INTERMEDIATE_TARGET_REVIEW");if(result.regions.some(r=>r.porousEndsLater))checkpoints.push("BEFORE_ENDS");if(major)checkpoints.push("BETWEEN_SESSIONS");
 const strategy=(type:ColorStrategy["type"],partial=false):ColorStrategy=>({id:colorHash({input:metadata.inputFingerprint,type}),type,eligibility:"ELIGIBLE_FOR_PLANNING",engineVersion:rules.version,
  sessions:partial?rules.sessions.direct:major?(processedMajor?rules.sessions.processedMajor:rules.sessions.major):staged?rules.sessions.staged:rules.sessions.direct,
  regionIds:ids,stages,technicalIntent:result.regions,requiredCheckpoints:checkpoints,requiredPhysicalTests:result.requiredPhysicalTests,requiredInformation:result.requiredInformation,
  riskConsiderations:risk.dominantReasons,tradeoffs:{integrityPreservation:"PRIORITIZED",targetAccuracy:partial?"PARTIAL_PROGRESS":"FULL_INTENT",complexity:major?"MULTI_SESSION":staged?"STAGED":"SIMPLE",
   uncertainty:confidence.band==="HIGH"?"LOW":confidence.band==="MEDIUM"?"MODERATE":"HIGH",maintenance:"REQUIRES_PROFESSIONAL_REVIEW"},reasonCodes:stable([...result.reasonCodes,...(partial?["PARTIAL_PROGRESS_ONLY" as const]:[])])});
 result.primaryStrategy=strategy("CONSERVATIVE");
 if(major){result.alternatives.push(strategy("MULTI_SESSION"));if(!processedMajor&&!staged&&!result.regions.some(r=>r.separateHandling)&&risk.overallBand!=="HIGH")result.alternatives.push(strategy("SINGLE_SESSION_PROGRESS",true));}
 result.recipeDraft={id:colorHash({input:metadata.inputFingerprint,strategy:result.primaryStrategy.id,version:1}),version:1,parentVersionId:null,origin:"ENGINE",executionStatus:"REQUIRES_BRAND_ADAPTER",
  target:normalizedTarget,strategy:result.primaryStrategy,metadata,reasonCodes:result.reasonCodes};
 return colorPlanning.parse(result);
}
