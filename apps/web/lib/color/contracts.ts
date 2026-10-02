import { z } from "zod";
import { confidenceErrorCodes } from "@/lib/confidence/contracts";
import { colorTarget,createTargetRequest,reviseTargetRequest } from "./target";
import { colorPlanning,fingerprint } from "./model";
import { confidenceInput } from "@/lib/confidence/input";
export const colorErrorCodes=[...confidenceErrorCodes,"COLOR_TARGET_INVALID","COLOR_TARGET_INCOMPLETE","COLOR_TARGET_NOT_FOUND","TARGET_VERSION_CONFLICT",
 "COLOR_INPUT_INVALID","COLOR_PLAN_NOT_FOUND","COLOR_PLAN_SIGNATURE_INVALID","COLOR_PLAN_SOURCE_CONFLICT","COLOR_PLAN_VERSION_CONFLICT","COLOR_ENGINE_UNAVAILABLE",
 "COLOR_PLAN_BLOCKED_BY_RISK","COLOR_PLAN_REQUIRES_ASSESSMENT","COLOR_PLAN_REQUIRES_TEST","COLOR_PLAN_REQUIRES_RECOVERY"] as const;
export const colorError=z.strictObject({code:z.enum(colorErrorCodes),message:z.string(),correlationId:z.uuid()});
export const storedColorPlan=z.strictObject({id:z.uuid(),clientId:z.uuid(),targetId:z.uuid(),createdAt:z.iso.datetime({offset:true}),createdBy:z.uuid(),result:colorPlanning});
export const targetResult=z.union([z.strictObject({data:colorTarget,correlationId:z.uuid()}),colorError]);
export const planResult=z.union([z.strictObject({data:storedColorPlan,correlationId:z.uuid()}),colorError]);
export const preparationResult=z.union([z.strictObject({data:z.union([
 z.strictObject({existing:storedColorPlan}),z.strictObject({existing:z.null(),target:colorTarget,snapshot:confidenceInput,sourceToken:fingerprint})]),correlationId:z.uuid()}),colorError]);
export const generatePlanRequest=z.strictObject({request_id:z.uuid(),target_id:z.uuid()});
export const historicalRead=z.strictObject({include_archived:z.boolean().default(false)});
export const colorCommand=z.discriminatedUnion("operation",[
 z.strictObject({operation:z.literal("create_target"),client_id:z.uuid(),payload:createTargetRequest}),
 z.strictObject({operation:z.literal("revise_target"),client_id:z.uuid(),payload:reviseTargetRequest}),
 z.strictObject({operation:z.literal("generate_plan"),client_id:z.uuid(),payload:generatePlanRequest}),
 z.strictObject({operation:z.literal("read_target"),client_id:z.uuid(),payload:historicalRead.extend({target_id:z.uuid()})}),
 z.strictObject({operation:z.literal("read_plan"),client_id:z.uuid(),payload:historicalRead.extend({plan_id:z.uuid()})}),
]);
export type ColorOperation=z.infer<typeof colorCommand>["operation"];
export function colorErrorStatus(code:string) {
 if(["UNAUTHENTICATED","SESSION_EXPIRED"].includes(code))return 401;
 if(["FORBIDDEN","MEMBERSHIP_REVOKED","MEMBERSHIP_REQUIRED","TENANT_CONTEXT_INVALID"].includes(code))return 403;
 if(code.endsWith("NOT_FOUND"))return 404;
 if(code.endsWith("CONFLICT"))return 409;
 if(["NETWORK_ERROR","COLOR_INPUT_INVALID","COLOR_ENGINE_UNAVAILABLE","COLOR_PLAN_SIGNATURE_INVALID","CONFIDENCE_INPUT_INVALID","CONFIDENCE_INPUT_LIMIT"].includes(code))return 503;
 return 400;
}
