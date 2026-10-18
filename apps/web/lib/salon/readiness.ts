import { z } from "zod";
// Shared minimum-necessary projection. Deliberately not a partial technical DTO.
export const appointmentReadiness = z.strictObject({
 schema_version:z.literal(1), appointment_id:z.uuid(), appointment_version:z.number().int().positive(),
 evaluated_at:z.iso.datetime({offset:true}), preparation_status:z.enum(["NOT_REQUIRED","CONSULTATION_REQUIRED","REVIEW_REQUIRED"]),
 consultation_required:z.boolean(), strand_test_status:z.enum(["UNKNOWN","NOT_REQUIRED"]),
 allocated_minutes:z.number().int().min(5).max(720), duration_source:z.literal("APPOINTMENT_ALLOCATION"),technical_clearance:z.literal(false),
});
export type AppointmentReadiness=z.infer<typeof appointmentReadiness>;
