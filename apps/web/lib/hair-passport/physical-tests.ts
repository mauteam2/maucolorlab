import { z } from "zod";
import { hairPhysicalTest } from "./contracts";
import { hairMutationErrorCodes, hairMutationErrorStatus } from "./mutations";

const uuid = z.uuid().transform(value => value.toLowerCase());
export const physicalTestRequest = z.strictObject({
 request_id: uuid, type: hairPhysicalTest.shape.type,
 region_id: uuid.nullable().optional(), location_id: uuid.optional(),
 result: hairPhysicalTest.shape.result, notes: hairPhysicalTest.shape.notes.optional(),
});
export const physicalTestCommand = z.strictObject({ operation: z.literal("add_physical_test"), client_id: uuid, payload: physicalTestRequest });
export const physicalTestErrorCodes = [...hairMutationErrorCodes, "INVALID_PHYSICAL_TEST", "INVALID_TEST_RESULT", "LOCATION_NOT_FOUND"] as const;
export const physicalTestResult = z.union([
 z.strictObject({ correlationId: z.uuid(), data: z.strictObject({ client_id: z.uuid(), passport_id: z.uuid(), test: hairPhysicalTest }) }),
 z.strictObject({ code: z.enum(physicalTestErrorCodes), message: z.string(), correlationId: z.uuid() }),
]);
export const physicalTestErrorStatus = (code: string) => code === "LOCATION_NOT_FOUND" ? 404 :
 ["INVALID_PHYSICAL_TEST", "INVALID_TEST_RESULT"].includes(code) ? 400 : hairMutationErrorStatus(code);
export function physicalTestValidationCode(input: unknown) {
 if (typeof input === "object" && input !== null && "payload" in input && typeof input.payload === "object" && input.payload !== null &&
  (!("result" in input.payload) || !hairPhysicalTest.shape.result.safeParse(input.payload.result).success)) return "INVALID_TEST_RESULT";
 return "INVALID_PHYSICAL_TEST";
}
