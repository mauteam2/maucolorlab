import { z } from "zod";
import { hairEvidence, hairHistoryEvent } from "./contracts";
import { hairMutationErrorCodes, hairMutationErrorStatus } from "./mutations";

const uuid = z.uuid().transform(value => value.toLowerCase());
export const historyEvidence = z.strictObject({
 source: z.enum(["HISTORICAL", "IMPORTED_UNVERIFIED"]),
 confidence: hairEvidence.shape.confidence.optional(),
 context: hairEvidence.shape.context.optional(),
});
export const historyRequest = z.strictObject({
 request_id: uuid,
 category: hairHistoryEvent.shape.category,
 performed_on: hairHistoryEvent.shape.performed_on,
 product: hairHistoryEvent.shape.product,
 description: hairHistoryEvent.shape.description,
 region_ids: uuid.array().max(100).optional(),
 location_id: uuid.nullable().optional(),
 attributed_salon: hairHistoryEvent.shape.attributed_salon.optional(),
 attributed_professional: hairHistoryEvent.shape.attributed_professional.optional(),
 evidence: historyEvidence,
});
export const historyCommand = z.strictObject({ operation: z.literal("add_history"), client_id: uuid, payload: historyRequest });
export const historyErrorCodes = [...hairMutationErrorCodes, "INVALID_HISTORY_EVENT", "INVALID_HISTORY_CATEGORY", "INVALID_HISTORY_DATE", "INVALID_EVIDENCE", "LOCATION_NOT_FOUND"] as const;
export const historyResult = z.union([
 z.strictObject({ correlationId: z.uuid(), data: z.strictObject({ client_id: z.uuid(), passport_id: z.uuid(), history: hairHistoryEvent }) }),
 z.strictObject({ code: z.enum(historyErrorCodes), message: z.string(), correlationId: z.uuid() }),
]);
export const historyErrorStatus = (code: string) => code === "LOCATION_NOT_FOUND" ? 404 :
 ["INVALID_HISTORY_EVENT", "INVALID_HISTORY_CATEGORY", "INVALID_HISTORY_DATE", "INVALID_EVIDENCE"].includes(code) ? 400 : hairMutationErrorStatus(code);
export function historyValidationCode(input: unknown) {
 if (typeof input !== "object" || input === null || !("payload" in input) || typeof input.payload !== "object" || input.payload === null) return "INVALID_HISTORY_EVENT";
 const payload = input.payload;
 if (!("category" in payload) || !hairHistoryEvent.shape.category.safeParse(payload.category).success) return "INVALID_HISTORY_CATEGORY";
 if (!("performed_on" in payload) || !hairHistoryEvent.shape.performed_on.safeParse(payload.performed_on).success) return "INVALID_HISTORY_DATE";
 if (!("evidence" in payload) || !historyEvidence.safeParse(payload.evidence).success) return "INVALID_EVIDENCE";
 return "INVALID_HISTORY_EVENT";
}
