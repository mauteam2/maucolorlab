import { z } from "zod";
import { storedControlledRecipe } from "@/lib/brand/controlled-model";
import { colorTarget } from "@/lib/color/target";
const id=z.uuid().transform(value=>value.toLowerCase()),time=z.iso.datetime({offset:true}),text=z.string().trim().min(1).max(2000);
export const grams=z.number().finite().min(0).max(2000).refine(v=>Math.abs(v*100-Math.round(v*100))<1e-8).transform(v=>Math.round(v*100)/100);
export const sessionStatuses=["PREPARING","READY","IN_PROGRESS","PAUSED","CHECKPOINT_REQUIRED","COMPLETION_REVIEW","COMPLETED","CANCELLED","ABORTED"] as const;
export const terminal=(status:string)=>["COMPLETED","CANCELLED","ABORTED"].includes(status);
export const liveStep=z.strictObject({id,sequenceIndex:z.int().nonnegative(),regionId:id,bowlId:id,instructionType:z.enum(["APPLICATION","CHECKPOINT","RINSE"]),instructionText:text,
 createdFrom:z.enum(["VERIFIED_RECIPE","PROFESSIONAL_INPUT"]),professionalModified:z.boolean(),status:z.enum(["PENDING","IN_PROGRESS","COMPLETED","SUPERSEDED"]),actualStart:time.nullable(),actualFinish:time.nullable()});
export const liveBowl=z.strictObject({id,label:z.string().trim().min(1).max(80),recipeId:id,regionIds:id.array().min(1).max(20),plannedGrams:grams,preparedGrams:grams.nullable(),usedGrams:grams.nullable(),wasteGrams:grams.nullable(),closed:z.boolean()});
export const liveTimer=z.strictObject({id,label:z.string().trim().min(1).max(80),stepId:id.nullable(),regionId:id.nullable(),plannedDuration:z.int().min(1).max(86400),startedAt:time.nullable(),anchorAt:time.nullable(),elapsedSeconds:z.number().nonnegative(),status:z.enum(["RUNNING","PAUSED","COMPLETED","CANCELLED"])});
export const liveCheckpoint=z.strictObject({id,type:z.enum(["LIFT_CHECK","TONE_CHECK","HAIR_INTEGRITY_CHECK","ELASTICITY_CHECK","VISUAL_CHECK","CUSTOM"]),stepId:id,required:z.boolean(),result:z.enum(["PENDING","PASS","CONCERN","FAIL"]),note:z.string().max(2000),completedBy:id.nullable(),completedAt:time.nullable()});
export const liveUsage=z.strictObject({id,bowlId:id,recipeId:id,productId:id,productVersion:z.int().positive(),preparedGrams:grams,usedGrams:grams,wasteGrams:grams,recordedBy:id,recordedAt:time});
// Optional on historical payloads: parsing must not change their signed hash.
export const materialReconciliation=z.strictObject({id,mutationId:id,bowlId:id,recipeId:id,supersedesId:id.nullable(),preparedGrams:grams.nullable(),usedGrams:grams.nullable(),wasteGrams:grams.nullable(),reason:text,recordedBy:id,recordedAt:time});
export const liveDeviation=z.strictObject({id,type:z.enum(["PRODUCT_CHANGED","GRAM_CHANGED","REGION_CHANGED","TIME_CHANGED","SEQUENCE_CHANGED","CHECKPOINT_FAILED","PROFESSIONAL_DECISION","OTHER"]),reason:text,changedBy:id,at:time,before:z.unknown(),after:z.unknown()});
export const liveRiskEvent=z.strictObject({id,type:z.enum(["UNEXPECTED_BREAKAGE","UNEXPECTED_LIFT","ELASTICITY_CONCERN","UNEXPECTED_BAND","SCALP_CONCERN"]),note:text,action:z.enum(["CHECKPOINT_REQUIRED","PAUSE","REASSESS","STOP"]),recordedBy:id,at:time,resolvedAt:time.nullable()});
const rating=z.enum(["ACCEPTABLE","CONCERN","UNACCEPTABLE","UNKNOWN"]);
export const outcomeProfile=z.strictObject({colorAccuracy:rating,uniformity:rating,hairIntegrity:rating,processEfficiency:rating,formulaStability:rating});
export const regionalOutcome=z.strictObject({regionId:id,achievedLevel:z.number().min(1).max(12),achievedTone:z.string().trim().min(1).max(160),uniformity:rating,hairIntegrity:rating,assessment:text});
export const completionReview=z.strictObject({regionalResults:regionalOutcome.array().min(1).max(20),profile:outcomeProfile,professionalAssessment:text,deviationsReviewed:z.literal(true)});
export const sessionPhoto=z.strictObject({id,kind:z.enum(["BEFORE","CHECKPOINT","PROCESS","AFTER"]),path:z.string().max(300),contentType:z.enum(["image/png","image/jpeg","image/webp"]),uploadedBy:id,createdAt:time});
export const liveSession=z.strictObject({schemaVersion:z.literal(1),id,clientId:id,locationId:id,passportId:id,colorCaseLink:id.nullable(),appointmentLink:id.nullable(),status:z.enum(sessionStatuses),recordVersion:z.int().positive(),
 controllerUserId:id,controllerDeviceId:id,controlEpoch:z.int().positive(),startedBy:id,createdAt:time,updatedAt:time,startedAt:time.nullable(),pausedAt:time.nullable(),completedAt:time.nullable(),cancelledAt:time.nullable(),
 originalRecipeId:id,currentRecipeId:id,recipes:storedControlledRecipe.array().min(1).max(20),targetSnapshot:colorTarget,review:z.strictObject({by:id,at:time,note:text}),
 riskSnapshot:z.strictObject({engineVersion:z.string(),gate:z.string(),fingerprint:z.string().regex(/^[a-f0-9]{64}$/)}),sourceToken:z.string().regex(/^[a-f0-9]{64}$/),
 steps:liveStep.array().max(50),bowls:liveBowl.array().max(20),timers:liveTimer.array().max(50),checkpoints:liveCheckpoint.array().max(100),usage:liveUsage.array().max(40),deviations:liveDeviation.array().max(200),riskEvents:liveRiskEvent.array().max(100),photos:sessionPhoto.array().max(50),
 notes:z.strictObject({id,text,by:id,at:time}).array().max(200),materialReconciliations:materialReconciliation.array().max(100).optional(),outcome:completionReview.nullable(),actualProcessSeconds:z.number().nonnegative().nullable()});
export type LiveSession=z.infer<typeof liveSession>;
const common={mutation_id:id,device_id:id};
export const createLiveRequest=z.strictObject({...common,client_id:id,recipe_id:id,review_note:text,professional_review:z.literal(true),color_case_link:id.nullable().default(null),appointment_link:z.null().default(null)});
const base={...common,expected_version:z.int().positive(),control_epoch:z.int().positive()};
const command=<T extends string,S extends z.ZodRawShape>(type:T,shape:S)=>z.strictObject({...base,type:z.literal(type),...shape});
export const liveCommand=z.discriminatedUnion("type",[
 command("READY",{}),command("START",{}),command("PAUSE",{}),command("RESUME",{}),command("TRANSFER_CONTROL",{user_id:id,target_device_id:id,reason:text}),
 command("STEP_START",{step_id:id}),command("STEP_COMPLETE",{step_id:id}),
 command("SEQUENCE",{steps:z.strictObject({id,region_id:id,bowl_id:id,instruction_type:z.enum(["APPLICATION","CHECKPOINT","RINSE"]),instruction_text:text}).array().min(1).max(50),reason:text}),
 command("BOWL_ADD",{label:z.string().trim().min(1).max(80),region_id:id,planned_grams:grams.refine(v=>v>0),reason:text}),
 command("USAGE",{bowl_id:id,prepared_grams:grams.refine(v=>v>0),used_grams:grams,reason:text}),
 command("MATERIAL_RECONCILE",{bowl_id:id,supersedes_id:id.nullable(),prepared_grams:grams.nullable(),used_grams:grams.nullable(),waste_grams:grams.nullable(),reason:text}),
 command("TIMER_ADD",{label:z.string().trim().min(1).max(80),step_id:id.nullable(),region_id:id.nullable(),duration_seconds:z.int().min(1).max(86400)}),
 command("TIMER_ACTION",{timer_id:id,action:z.enum(["PAUSE","RESUME","COMPLETE","CANCEL"])}),
 command("CHECKPOINT_ADD",{step_id:id,checkpoint_type:liveCheckpoint.shape.type,required:z.boolean()}),
 command("CHECKPOINT_RECORD",{checkpoint_id:id,result:z.enum(["PASS","CONCERN","FAIL"]),note:text}),
 command("RISK_EVENT",{event_type:liveRiskEvent.shape.type,note:text}),command("REASSESS",{reason:text}),
 command("DEVIATION",{deviation_type:liveDeviation.shape.type,reason:text}),command("NOTE",{text}),
 command("RECIPE_REVISION",{recipe_id:id,professional_review:z.literal(true),review_note:text,reason:text}),
 command("PHOTO",{photo_id:id,kind:sessionPhoto.shape.kind,content_type:sessionPhoto.shape.contentType}),
 command("COMPLETION_REVIEW",{outcome:completionReview}),command("COMPLETE",{}),command("CANCEL",{reason:text}),command("ABORT",{reason:text}),
]);
export type LiveCommand=z.infer<typeof liveCommand>;
export const livePermissions=["live_session.view","live_session.start","live_session.control","live_session.contribute","live_session.usage","live_session.checkpoint","live_session.revise","live_session.complete","live_session.cancel"] as const;
export const liveError=z.strictObject({code:z.enum(["UNAUTHENTICATED","SESSION_EXPIRED","MEMBERSHIP_REQUIRED","MEMBERSHIP_REVOKED","TENANT_CONTEXT_INVALID","FORBIDDEN","VALIDATION_FAILED","NETWORK_ERROR","SESSION_START_BLOCKED_STALE_INPUT","LIVE_SESSION_NOT_FOUND","LIVE_SESSION_CONFLICT","LIVE_CONTROLLER_CONFLICT","LIVE_SESSION_IMMUTABLE","LIVE_SESSION_TRANSITION_INVALID","LIVE_CHECKPOINT_REQUIRED","LIVE_USAGE_INVALID","LIVE_REGION_UNSUPPORTED","LIVE_USE_STRUCTURED_COMMAND","LIVE_COMPLETION_INCOMPLETE","LIVE_PHOTO_NOT_FOUND","LIVE_PHOTO_UPLOAD_FAILED","LIVE_PHOTO_MISSING","LIVE_RESULT_INVALID","COLOR_PLAN_SIGNATURE_INVALID","COLOR_ENGINE_UNAVAILABLE","CONFIDENCE_INPUT_INVALID","BRAND_RECIPE_NOT_FOUND","BRAND_CATALOG_NOT_FOUND"]),message:z.string(),correlationId:id});
export function permissionFor(c:LiveCommand["type"]){return c==="USAGE"||c==="MATERIAL_RECONCILE"?"live_session.usage":c==="CHECKPOINT_RECORD"||c==="CHECKPOINT_ADD"?"live_session.checkpoint":c==="NOTE"||c==="PHOTO"||c==="RISK_EVENT"?"live_session.contribute":c==="RECIPE_REVISION"?"live_session.revise":c==="COMPLETE"||c==="COMPLETION_REVIEW"?"live_session.complete":c==="CANCEL"||c==="ABORT"?"live_session.cancel":"live_session.control";}
