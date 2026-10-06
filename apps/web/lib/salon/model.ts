import { z } from "zod";

const id = z.uuid().transform(value=>value.toLowerCase());
const text = (n: number) => z.string().trim().min(1).max(n);
const version = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const timestamp = z.iso.datetime({ offset: true });
export const categoryCode = z.string().regex(/^[A-Z][A-Z0-9_]{0,39}$/);
export const capabilityCodes = ["GENERAL_COLOR", "GREY_COVERAGE", "BLONDING", "ADVANCED_BLONDING", "CORRECTION", "VIVID", "RECOVERY"] as const;
export const competencyLevels = ["NOT_AUTHORIZED", "ASSISTED", "INDEPENDENT", "SENIOR_REVIEWER"] as const;
export const competency = z.strictObject({ code: z.enum(capabilityCodes), level: z.enum(competencyLevels) });
export const resourceTypes = ["CHAIR", "WASH_UNIT", "COLOR_STATION", "EQUIPMENT", "CUSTOM"] as const;
const minutes = z.number().int().min(0).max(1440);
export const hoursDay = z.strictObject({ day: z.number().int().min(1).max(7), closed: z.boolean(), opens: minutes.nullable(), closes: minutes.nullable() }).refine(d => d.closed ? d.opens === null && d.closes === null : d.opens !== null && d.closes !== null && d.opens < d.closes);
export const shift = z.strictObject({ day: z.number().int().min(1).max(7), type: z.enum(["SHIFT", "BREAK"]), starts: minutes, ends: minutes }).refine(s => s.starts < s.ends);
export const requirement = z.strictObject({ type: z.enum(resourceTypes), units: z.number().int().min(1).max(100) });
const distinct = <T>(values: T[], key: (v: T) => string | number) => new Set(values.map(key)).size === values.length;
export const serviceDefinition = z.strictObject({
 name: text(160), category: categoryCode, description: z.string().max(2000).nullable(), organization_wide: z.boolean(),
 base_duration_minutes: z.number().int().min(5).max(720), buffer_before_minutes: z.number().int().min(0).max(120), buffer_after_minutes: z.number().int().min(0).max(120),
 base_price: z.number().finite().min(0).max(9999999.99).multipleOf(.01), tax_rate: z.number().min(0).max(100).multipleOf(.01), tax_inclusive: z.boolean(),
 requires_colorlab: z.boolean(), requires_hair_passport: z.boolean(), requires_precheck: z.boolean(), active: z.boolean(),
 eligible_membership_ids: id.array().max(200), capabilities: z.strictObject({ code: z.enum(capabilityCodes), level: z.enum(["ASSISTED", "INDEPENDENT", "SENIOR_REVIEWER"]) }).array().max(7), resources: requirement.array().max(5),
}).refine(s => distinct(s.eligible_membership_ids, v => v) && distinct(s.capabilities, v => v.code) && distinct(s.resources, v => v.type));
export const staffDefinition = z.strictObject({ display_name: text(120), active: z.boolean(), bookable: z.boolean(), working_capacity: z.number().int().min(1).max(20).nullable(), notes: z.string().max(2000).nullable(), competencies: competency.array().max(7), shifts: shift.array().max(42) }).refine(s => distinct(s.competencies, v => v.code));
export const resourceDefinition = z.strictObject({ name: text(120), type: z.enum(resourceTypes), capacity: z.number().int().min(1).max(100), active: z.boolean() });
export const appointmentStates = ["DRAFT", "CONFIRMED", "ARRIVED", "IN_SERVICE", "COMPLETED", "CANCELLED", "NO_SHOW"] as const;
export const appointmentInput = z.strictObject({ client_id: id, service_id: id, staff_membership_id: id,
 local_start: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/), utc_offset_minutes: z.number().int().min(-840).max(840).nullable(),
 scheduled_duration_minutes: z.number().int().min(5).max(720).nullable(), adjustment_reason: z.string().trim().min(1).max(500).nullable(), notes: z.string().max(2000).nullable(), status: z.enum(["DRAFT", "CONFIRMED"]),
});
const mutation = { mutation_id: id };
const target = { id, expected_version: version };
export const salonCommand = z.discriminatedUnion("type", [
 z.strictObject({ type: z.literal("CATEGORY_SAVE"), ...mutation, code: categoryCode, label: text(120), expected_version: version }),
 z.strictObject({ type: z.literal("SERVICE_SAVE"), ...mutation, ...target, definition: serviceDefinition }),
 z.strictObject({ type: z.literal("STAFF_SAVE"), ...mutation, membership_id: id, expected_version: version, definition: staffDefinition }),
 z.strictObject({ type: z.literal("HOURS_SAVE"), ...mutation, expected_version: version, days: hoursDay.array().length(7) }).refine(c => distinct(c.days, v => v.day)),
 z.strictObject({ type: z.literal("EXCEPTION_SAVE"), ...mutation, ...target, date: z.iso.date(), reason: text(500), active: z.boolean(), closed: z.boolean(), opens: minutes.nullable(), closes: minutes.nullable() }).refine(c => c.closed ? c.opens === null && c.closes === null : c.opens !== null && c.closes !== null && c.opens < c.closes),
 z.strictObject({ type: z.literal("AVAILABILITY_SAVE"), ...mutation, ...target, membership_id: id, type_of_absence: z.enum(["SHIFT", "BREAK", "LEAVE", "UNAVAILABLE"]), starts_at: timestamp, ends_at: timestamp, reason: text(500), active: z.boolean() }).refine(c => Date.parse(c.ends_at) > Date.parse(c.starts_at) && Date.parse(c.ends_at) - Date.parse(c.starts_at) <= 366 * 86400000),
 z.strictObject({ type: z.literal("RESOURCE_SAVE"), ...mutation, ...target, definition: resourceDefinition }),
 z.strictObject({ type: z.literal("APPOINTMENT_SAVE"), ...mutation, ...target, definition: appointmentInput }),
 z.strictObject({ type: z.literal("APPOINTMENT_TRANSITION"), ...mutation, ...target, status: z.enum(appointmentStates), reason: text(500) }),
 z.strictObject({ type: z.literal("LINK_LIVE_SESSION"), ...mutation, ...target, live_session_id: id }),
]);
export type SalonCommand = z.infer<typeof salonCommand>;
export function permissionFor(type: SalonCommand["type"]) {
 return type === "CATEGORY_SAVE" || type === "SERVICE_SAVE" ? "salon.catalog.manage" : type === "STAFF_SAVE" || type === "AVAILABILITY_SAVE" ? "salon.staff.manage" : type === "HOURS_SAVE" || type === "EXCEPTION_SAVE" ? "salon.hours.manage" : type === "RESOURCE_SAVE" ? "salon.resources.manage" : "salon.appointments.manage";
}
const owned = { organization_id: id, location_id: id, version: version, created_at: timestamp, updated_at: timestamp };
export const service = z.strictObject(serviceDefinition.shape).omit({ organization_wide: true }).extend({ id, ...owned, location_id: id.nullable(), currency: z.string().length(3), created_by: id, updated_by: id });
export const staff = staffDefinition.safeExtend({ membership_id: id, ...owned, default_location_id: id, role: z.enum(["owner", "manager", "colorist", "assistant", "reception"]), membership_status: z.enum(["active", "invited", "revoked"]), user_id: id, created_by: id, updated_by: id });
export const resource = resourceDefinition.extend({ id, ...owned, created_by: id, updated_by: id });
export const dateException = z.strictObject({ id, ...owned, date: z.iso.date(), reason: z.string(), active: z.boolean(), closed: z.boolean(), opens: minutes.nullable(), closes: minutes.nullable(), created_by: id, updated_by: id });
export const availability = z.strictObject({ id, ...owned, membership_id: id, type: z.enum(["SHIFT", "BREAK", "LEAVE", "UNAVAILABLE"]), starts_at: timestamp, ends_at: timestamp, reason: z.string(), active: z.boolean(), created_by: id, updated_by: id });
export const allocation = z.strictObject({ resource_id: id, name: z.string(), type: z.enum(resourceTypes), units: z.number().int().positive() });
export const appointment = z.strictObject({ id, ...owned, client_id: id, client_name: z.string(), service_id: id, service_name: z.string(), service_version: version, staff_membership_id: id, staff_user_id: id, staff_display_name: z.string(),
 start_at: timestamp, end_at: timestamp, occupied_start_at: timestamp, occupied_end_at: timestamp, timezone: z.string(), status: z.enum(appointmentStates),
 default_duration_minutes: z.number().int().positive(), scheduled_duration_minutes: z.number().int().positive(), adjustment_reason: z.string().nullable(),
 base_price: z.number(), tax_rate: z.number(), tax_inclusive: z.boolean(), quoted_total: z.number(), currency: z.string().length(3),
 buffer_before_minutes: z.number().int(), buffer_after_minutes: z.number().int(), colorlab_required: z.boolean(), hair_passport_required: z.boolean(), precheck_required: z.boolean(),
 notes: z.string().nullable(), created_by: id, updated_by: id, cancelled_at: timestamp.nullable(), arrived_at: timestamp.nullable(), started_at: timestamp.nullable(), completed_at: timestamp.nullable(), actual_duration_seconds: z.number().int().nonnegative().nullable(),
 resources: allocation.array().max(100), live_session_ids: id.array().max(25),
});
export type Appointment = z.infer<typeof appointment>;
export const salonSnapshot = z.strictObject({ location: z.strictObject({ id, organization_id: id, name: z.string(), timezone: z.string(), currency: z.string().length(3) }),
 categories: z.strictObject({ code: categoryCode, label: z.string(), version }).array().max(64), services: service.array().max(200), staff: staff.array().max(200), resources: resource.array().max(100),
 members: z.strictObject({ id, user_id: id, role: z.string(), display_name: z.string().nullable() }).array().max(200),
 hours: z.strictObject({ version, days: hoursDay.array().max(7) }), exceptions: dateException.array().max(400), availability: availability.array().max(400),
 appointments: appointment.array().max(500), has_more: z.boolean(), evaluated_at: timestamp,
});
export type SalonSnapshot = z.infer<typeof salonSnapshot>;
export const slotRequest = z.strictObject({ client_id: id, service_id: id, staff_membership_id: id, from_date: z.iso.date(), to_date: z.iso.date(), duration_minutes: z.number().int().min(5).max(720).nullable(), limit: z.number().int().min(1).max(20) }).refine(c => Date.parse(c.to_date) >= Date.parse(c.from_date) && Date.parse(c.to_date) - Date.parse(c.from_date) <= 6 * 86400000);
export const slotResult = z.strictObject({ timezone: z.string(), slots: z.strictObject({ start_at: timestamp, end_at: timestamp, local_start: z.string(), utc_offset_minutes: z.number().int() }).array().max(20), candidates_checked: z.number().int().max(672), truncated: z.boolean() });
export const conflictCodes = ["LOCATION_CLOSED", "STAFF_UNAVAILABLE", "STAFF_DOUBLE_BOOKED", "STAFF_NOT_ELIGIBLE", "RESOURCE_UNAVAILABLE", "INVALID_DURATION", "OUTSIDE_WORKING_HOURS", "TECHNICAL_ESCALATION"] as const;
export const salonError = z.strictObject({ code: z.enum([...conflictCodes, "UNAUTHENTICATED", "SESSION_EXPIRED", "FORBIDDEN", "MEMBERSHIP_REQUIRED", "MEMBERSHIP_REVOKED", "TENANT_CONTEXT_INVALID", "VALIDATION_FAILED", "NETWORK_ERROR", "SALON_NOT_FOUND", "SALON_CONFLICT", "INVALID_TRANSITION", "APPOINTMENT_IMMUTABLE", "INVALID_LOCAL_TIME", "AMBIGUOUS_LOCAL_TIME", "SALON_LIMIT_REACHED", "RESOURCE_HAS_BOOKINGS"]), message: z.string(), correlationId: id });
export const precheckStatuses = ["READY", "INFORMATION_REQUIRED", "TEST_REQUIRED", "REVIEW_REQUIRED", "RECOVERY_CONSTRAINT", "TIME_WARNING", "TECHNICAL_ESCALATION"] as const;
export const precheckResult = z.strictObject({ appointment_id: id, appointment_version: version, evaluated_at: timestamp, statuses: z.enum(precheckStatuses).array().min(1), reasons: z.string().array(),
 risk: z.strictObject({ gate: z.string(), band: z.string(), can_progress: z.boolean(), passport_version: version }).nullable(),
 freshness: z.strictObject({ state: z.enum(["MISSING", "CURRENT", "REVIEW_REQUIRED"]), updated_at: timestamp.nullable() }),
 recovery: z.enum(["NOT_ASSESSED", "REASSESSMENT_REQUIRED"]), complexity: z.enum(["UNKNOWN", "LOW", "MODERATE", "HIGH", "CRITICAL"]),
 integrity_history: z.string().array().max(20), recent_technical_history: z.strictObject({ id, category: z.string(), date: z.string().nullable(), date_state: z.string() }).array().max(100),
 last_formula: z.strictObject({ session_id: id, recipe_id: id, label: z.string(), color_grams: z.number(), developer_grams: z.number(), completed_at: timestamp }).nullable(),
 last_outcome: z.strictObject({ session_id: id, assessment: z.string(), actual_duration_seconds: z.number().nonnegative().nullable(), used_grams: z.number().nonnegative(), waste_grams: z.number().nonnegative() }).nullable(),
 duration: z.strictObject({ source: z.enum(["SERVICE_DEFAULT", "OWN_SALON_MEDIAN"]), sample_count: z.number().int().nonnegative(), estimated_minutes: z.number().int().positive(), allocated_minutes: z.number().int().positive(), additional_minutes: z.number().int().nonnegative() }),
 competencies: competency.array().max(7), recipe_created: z.literal(false),
});
