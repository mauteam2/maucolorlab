import { z } from "zod";
import { hairAssessment, hairRegion, hairSnapshot, hairTechnicalState, hairReadErrorCodes, hairReadErrorStatus } from "./contracts";

const uuid = z.uuid().transform(value => value.toLowerCase());
const version = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const label = z.string().min(1).max(120).refine(value => value.trim().length > 0).nullable();
export const hairTechnicalPatch = hairTechnicalState.partial();
const initial = { request_id: uuid, technical: hairTechnicalPatch.optional() };
export const createPassportRequest = z.strictObject(initial);
export const updatePassportRequest = z.strictObject({ ...initial, expected_version: version, technical: hairTechnicalPatch.refine(p => Object.keys(p).length > 0) });
export const createRegionRequest = z.strictObject({ ...initial, region_type: hairRegion.shape.type, label: label.optional() })
 .refine(r => r.region_type !== "CUSTOM" || r.label != null);
export const updateRegionRequest = z.strictObject({ ...initial, expected_version: version, label: label.optional() })
 .refine(r => r.label !== undefined || (r.technical !== undefined && Object.keys(r.technical).length > 0));
export const hairMutationCommand = z.discriminatedUnion("operation", [
 z.strictObject({ operation: z.literal("create_passport"), client_id: uuid, payload: createPassportRequest }),
 z.strictObject({ operation: z.literal("update_passport"), client_id: uuid, payload: updatePassportRequest }),
 z.strictObject({ operation: z.literal("create_region"), client_id: uuid, payload: createRegionRequest }),
 z.strictObject({ operation: z.literal("update_region"), client_id: uuid, region_id: uuid, payload: updateRegionRequest }),
]);
export type HairMutationCommand = z.infer<typeof hairMutationCommand>;
export type HairMutationOperation = HairMutationCommand["operation"];
export const hairMutationErrorCodes = [...hairReadErrorCodes, "CLIENT_ARCHIVED", "HAIR_PASSPORT_ALREADY_EXISTS", "HAIR_REGION_NOT_FOUND", "HAIR_REGION_ALREADY_EXISTS", "INVALID_TECHNICAL_STATE", "CONFLICT"] as const;
export const hairMutationResult = z.union([
 z.strictObject({ correlationId: z.uuid(), data: z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("PASSPORT"), passport: hairSnapshot.shape.passport, core: hairAssessment, regions: hairRegion.array() })
   .refine(r => r.passport.status === "ACTIVE" && r.passport.client_status === "ACTIVE" &&
    Date.parse(r.passport.updated_at) >= Date.parse(r.passport.created_at) &&
    (r.core.state !== "ASSESSED" || r.core.observation.region_id === null) &&
    new Set(r.regions.map(region => region.id)).size === r.regions.length),
  z.strictObject({ kind: z.literal("REGION"), client_id: z.uuid(), passport_id: z.uuid(), region: hairRegion })
   .refine(r => r.region.status === "ACTIVE"),
 ]) }),
 z.strictObject({ code: z.enum(hairMutationErrorCodes), message: z.string(), correlationId: z.uuid() }),
]);
export const hairMutationErrorStatus = (code: string) => ({
 CLIENT_ARCHIVED: 409, HAIR_PASSPORT_ALREADY_EXISTS: 409, HAIR_REGION_NOT_FOUND: 404,
 HAIR_REGION_ALREADY_EXISTS: 409, INVALID_TECHNICAL_STATE: 400, CONFLICT: 409,
}[code] ?? hairReadErrorStatus(code));
