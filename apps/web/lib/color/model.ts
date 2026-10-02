import { z } from "zod";
import { riskAssessment } from "@/lib/risk/contracts";
import { colorTarget, targetValidationIssue } from "./target";
import { colorRules, colorReasonCodes } from "./rules";
export const fingerprint=z.string().regex(/^[a-f0-9]{64}$/);
const reasons=z.enum(colorReasonCodes).array().max(50);
export const colorDelta=z.enum(["PRESERVE","CURRENT_UNKNOWN","SAME_LEVEL","DARKEN","LIGHTEN_SMALL","LIGHTEN_MODERATE","LIGHTEN_MAJOR","TONE_ONLY","NEUTRALIZE","ENHANCE_REFLECTION","FILL_REQUIRED_CANDIDATE","CORRECTION_REQUIRED_CANDIDATE"]);
export const regionPlan=z.strictObject({regionId:z.uuid(),currentLevel:z.number().min(1).max(10).nullable(),naturalLevel:z.number().min(1).max(10).nullable(),
 targetLevel:z.number().min(1).max(10).nullable(),delta:z.number().min(-9).max(9).nullable(),actions:colorDelta.array().min(1),
 separateHandling:z.boolean(),porousEndsLater:z.boolean(),naturalBaseSupport:z.boolean(),reasonCodes:reasons});
export const colorStage=z.strictObject({sequence:z.int().positive(),kind:z.enum(colorRules.stages),regionIds:z.uuid().array().min(1).max(100),
 checkpoint:z.boolean(),reasonCodes:reasons});
const tests=riskAssessment.shape.requiredPhysicalTests;
const information=riskAssessment.shape.requiredInformation;
export const engineMetadata=z.strictObject({colorVersion:z.literal(colorRules.version),colorRulesFingerprint:fingerprint,inputFingerprint:fingerprint,
 passportId:z.uuid(),passportVersion:z.int().positive(),hairFingerprint:fingerprint,targetId:z.uuid(),targetVersion:z.int().positive(),targetFingerprint:fingerprint,
 confidenceVersion:z.literal("confidence-engine/1.0.0"),confidenceFingerprint:fingerprint,confidenceRulesFingerprint:fingerprint,
 riskVersion:z.literal("risk-engine/1.0.0"),riskFingerprint:fingerprint,riskRulesFingerprint:fingerprint});
export const colorStrategy=z.strictObject({id:fingerprint,type:z.enum(colorRules.strategies),eligibility:z.literal("ELIGIBLE_FOR_PLANNING"),
 engineVersion:z.literal(colorRules.version),sessions:z.strictObject({min:z.int().positive().max(6),max:z.int().positive().max(6)}),
 regionIds:z.uuid().array().min(1).max(100),stages:colorStage.array().min(1).max(2000),technicalIntent:regionPlan.array().min(1).max(100),
 requiredCheckpoints:z.enum(["RISK_REASSESSMENT","REGIONAL_INTEGRITY","INTERMEDIATE_TARGET_REVIEW","BEFORE_ENDS","BETWEEN_SESSIONS"]).array().max(5),
 requiredPhysicalTests:tests,requiredInformation:information,riskConsiderations:riskAssessment.shape.dominantReasons,
 tradeoffs:z.strictObject({integrityPreservation:z.literal("PRIORITIZED"),targetAccuracy:z.enum(["FULL_INTENT","PARTIAL_PROGRESS"]),
 complexity:z.enum(["SIMPLE","STAGED","MULTI_SESSION"]),uncertainty:z.enum(["LOW","MODERATE","HIGH"]),maintenance:z.literal("REQUIRES_PROFESSIONAL_REVIEW")}),reasonCodes:reasons});
export const recipeDraft=z.strictObject({id:fingerprint,version:z.literal(1),parentVersionId:z.null(),origin:z.literal("ENGINE"),
 executionStatus:z.literal("REQUIRES_BRAND_ADAPTER"),target:colorTarget,strategy:colorStrategy,metadata:engineMetadata,reasonCodes:reasons});
export const colorPlanning=z.strictObject({engineVersion:z.literal(colorRules.version),evaluatedAt:z.iso.datetime({offset:true}),metadata:engineMetadata,
 status:z.enum(["DRAFT","REQUIRES_ASSESSMENT","REQUIRES_TEST","REQUIRES_RECOVERY","BLOCKED_BY_RISK"]),feasibility:z.enum(colorRules.feasibility),
 targetIssues:targetValidationIssue.array().max(1000),regions:regionPlan.array().max(100),safetyGate:riskAssessment.shape.gate,
 requiredPhysicalTests:tests,requiredInformation:information,reasonCodes:reasons,primaryStrategy:colorStrategy.nullable(),alternatives:colorStrategy.array().max(2),recipeDraft:recipeDraft.nullable()
}).superRefine((value,ctx)=>{
 if((value.status==="DRAFT")!==Boolean(value.recipeDraft&&value.primaryStrategy) ||
  (!value.safetyGate.canProgress&&(value.recipeDraft!==null||value.primaryStrategy!==null||value.alternatives.length>0)))
  ctx.addIssue({code:"custom",message:"Inconsistent planning progression"});
});
export type RegionPlan=z.infer<typeof regionPlan>;
export type ColorStage=z.infer<typeof colorStage>;
export type ColorStrategy=z.infer<typeof colorStrategy>;
export type ColorPlanning=z.infer<typeof colorPlanning>;
export type ColorReasonCode=typeof colorReasonCodes[number];
export class ColorInputError extends Error {constructor(){super("COLOR_INPUT_INVALID");}}
