import { z } from "zod";
import { hairEvidence, hairObservation } from "./contracts";
import { hairTechnicalPatch, hairMutationErrorCodes, hairMutationErrorStatus } from "./mutations";

const uuid = z.uuid().transform(value => value.toLowerCase());
const evidenceCommon = {
 confidence: hairEvidence.shape.confidence.optional(),
 context: hairEvidence.shape.context.optional(), relevant_until: hairEvidence.shape.relevant_until.optional(),
};
export const observationEvidence = z.discriminatedUnion("source", [
 z.strictObject({ ...evidenceCommon, source: z.literal("PROFESSIONAL_VERIFIED"), attestation: z.literal("PERSONALLY_ASSESSED") }),
 z.strictObject({ ...evidenceCommon, source: z.enum(["AI_ESTIMATE", "PHYSICAL_TEST", "HISTORICAL", "IMPORTED_UNVERIFIED"]), observed_at: hairEvidence.shape.observed_at.optional() }),
]).superRefine((e, ctx) => {
 if (e.source !== "PROFESSIONAL_VERIFIED" && e.relevant_until != null &&
  (e.observed_at?.state !== "KNOWN" || Date.parse(e.relevant_until) < Date.parse(e.observed_at.value)))
  ctx.addIssue({ code: "custom", message: "Relevance requires a known earlier observation time" });
});
export const observationRequest = z.strictObject({
 request_id: uuid, expected_version: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER - 1),
 region_id: uuid.nullable().optional(), replace_unverified: z.boolean().optional(),
 technical: hairTechnicalPatch.refine(value => Object.keys(value).length > 0), evidence: observationEvidence,
});
export const observationCommand = z.strictObject({ operation: z.literal("add_observation"), client_id: uuid, payload: observationRequest });
export const observationErrorCodes = [...hairMutationErrorCodes, "INVALID_OBSERVATION", "INVALID_EVIDENCE", "INVALID_CONFIDENCE"] as const;
export const observationResult = z.union([
 z.strictObject({ correlationId: z.uuid(), data: z.strictObject({
  client_id: z.uuid(), passport_id: z.uuid(), target_version: z.number().int().min(2).max(Number.MAX_SAFE_INTEGER), observation: hairObservation,
 }) }),
 z.strictObject({ code: z.enum(observationErrorCodes), message: z.string(), correlationId: z.uuid() }),
]);
export const observationErrorStatus = (code: string) => ["INVALID_OBSERVATION", "INVALID_EVIDENCE", "INVALID_CONFIDENCE"].includes(code) ? 400 : hairMutationErrorStatus(code);
export function observationValidationCode(input: unknown) {
 if (typeof input !== "object" || input === null || !("payload" in input) || typeof input.payload !== "object" || input.payload === null) return "VALIDATION_FAILED";
 const payload = input.payload;
 if (!("technical" in payload) || !hairTechnicalPatch.safeParse(payload.technical).success || Object.keys(payload.technical as object).length === 0) return "INVALID_OBSERVATION";
 if ("evidence" in payload && typeof payload.evidence === "object" && payload.evidence !== null && "confidence" in payload.evidence &&
  !hairEvidence.shape.confidence.safeParse(payload.evidence.confidence).success) return "INVALID_CONFIDENCE";
 if (!("evidence" in payload) || !observationEvidence.safeParse(payload.evidence).success) return "INVALID_EVIDENCE";
 return "VALIDATION_FAILED";
}
