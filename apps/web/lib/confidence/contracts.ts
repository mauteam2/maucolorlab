import { z } from "zod";
import { hairReadErrorCodes } from "@/lib/hair-passport/contracts";
import { confidenceInput } from "./input";
export const confidenceOptions = z.strictObject({include_archived: z.boolean().default(false)});
export const confidenceRequest = z.strictObject({client_id: z.uuid().transform(v => v.toLowerCase()), options: confidenceOptions.default({include_archived: false})});
export const confidenceErrorCodes = [...hairReadErrorCodes, "CONFIDENCE_INPUT_INVALID", "CONFIDENCE_INPUT_LIMIT"] as const;
export const confidenceReadResult = z.union([
 z.strictObject({data: confidenceInput, correlationId: z.uuid()}),
 z.strictObject({code: z.enum(confidenceErrorCodes), message: z.string(), correlationId: z.uuid()}),
]);
