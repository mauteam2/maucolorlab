import { z } from "zod";

const uuid = z.uuid();
const timestamp = z.iso.datetime({ offset: true });
const boundedText = (max: number) => z.string().min(1).max(max).refine(value => value.trim().length > 0);
const lifecycle = z.enum(["ACTIVE", "ARCHIVED"]);
const version = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const known = <T extends z.ZodType>(value: T) => z.strictObject({ state: z.literal("KNOWN"), value });
const unknown = z.strictObject({ state: z.literal("UNKNOWN"), value: z.null() });
const unassessed = z.strictObject({ state: z.literal("NOT_ASSESSED"), value: z.null() });
const inapplicable = z.strictObject({ state: z.literal("NOT_APPLICABLE"), value: z.null() });
const level = z.discriminatedUnion("state", [known(z.number().min(1).max(10)), unknown, unassessed]);
const measured = <T extends z.ZodType>(value: T) => z.discriminatedUnion("state", [known(value), unknown, unassessed, inapplicable]);
const result = <T extends z.ZodType>(value: T) => z.discriminatedUnion("state", [known(value), unknown, inapplicable]);
const recorded = { recorded_at: timestamp, recorded_by: uuid, supersedes_id: uuid.nullable() };

export const hairReadOptions = z.strictObject({
 include_archived: z.boolean().default(false),
 page_size: z.number().int().min(1).max(100).default(50),
 tests_offset: z.number().int().min(0).max(10000).default(0),
 history_offset: z.number().int().min(0).max(10000).default(0),
});
export type HairReadOptions = z.input<typeof hairReadOptions>;
export const hairReadRequest = z.strictObject({ client_id: uuid.transform(value => value.toLowerCase()), options: hairReadOptions.default({ include_archived: false, page_size: 50, tests_offset: 0, history_offset: 0 }) });

export const hairEvidence = z.strictObject({
 id: uuid, source: z.enum(["AI_ESTIMATE","PROFESSIONAL_VERIFIED","PHYSICAL_TEST","HISTORICAL","IMPORTED_UNVERIFIED"]),
 observed_at: z.discriminatedUnion("state", [known(timestamp), unknown]),
 confidence: z.discriminatedUnion("state", [known(z.number().min(0).max(1)), unknown]),
 verified_by: uuid.nullable(), ...recorded, relevant_until: timestamp.nullable(),
 location_id: uuid.nullable(), context: boundedText(2000).nullable(),
}).superRefine((e, ctx) => {
 if ((e.source === "PROFESSIONAL_VERIFIED") !== (e.verified_by !== null) ||
  (e.source === "PROFESSIONAL_VERIFIED" && e.observed_at.state !== "KNOWN"))
  ctx.addIssue({ code: "custom", message: "Invalid verification provenance" });
 if (e.observed_at.state === "KNOWN" && Date.parse(e.observed_at.value) > Date.parse(e.recorded_at))
  ctx.addIssue({ code: "custom", message: "Observation follows recording" });
 if (e.relevant_until !== null && (e.observed_at.state !== "KNOWN" || Date.parse(e.relevant_until) < Date.parse(e.observed_at.value)))
  ctx.addIssue({ code: "custom", message: "Invalid evidence relevance" });
});

export const hairObservation = z.strictObject({
 id: uuid, region_id: uuid.nullable(), ...recorded, evidence: hairEvidence,
 natural_level: level, perceived_level: level, grey_ratio: measured(z.number().min(0).max(1)),
 thickness: measured(z.enum(["FINE","MEDIUM","COARSE"])),
 density: measured(z.enum(["LOW","MEDIUM","HIGH"])),
 porosity: measured(z.enum(["LOW","MEDIUM","HIGH"])),
 elasticity: measured(z.enum(["LOW","NORMAL","HIGH"])),
 tone: measured(boundedText(120)), cosmetic_color_history: measured(boundedText(2000)),
 bleach_history: measured(boundedText(2000)), chemical_history: measured(boundedText(2000)),
 technical_notes: boundedText(4000).nullable(), integrity_notes: boundedText(2000).nullable(),
});
export const hairAssessment = z.discriminatedUnion("state", [
 z.strictObject({ state: z.literal("NOT_ASSESSED"), observation: z.null() }),
 z.strictObject({ state: z.literal("ASSESSED"), observation: hairObservation }),
]);
export const hairRegion = z.strictObject({
 id: uuid, type: z.enum(["ROOT","MID_LENGTHS","ENDS","FACE_FRAME","CROWN","NAPE","BANDED_AREA","BLEACHED_AREA","HIGHLIGHTED_AREA","CUSTOM"]), label: boundedText(120).nullable(),
 status: lifecycle, version, updated_at: timestamp, assessment: hairAssessment,
}).superRefine((r, ctx) => {
 if ((r.type === "CUSTOM" && r.label === null) || (r.assessment.state === "ASSESSED" && r.assessment.observation.region_id !== r.id))
  ctx.addIssue({ code: "custom", message: "Invalid regional assessment" });
});
export const hairPhysicalTest = z.strictObject({
 id: uuid, region_id: uuid.nullable(), type: z.enum(["POROSITY","ELASTICITY","STRAND"]),
 result: result(boundedText(1000)), performed_by: uuid, performed_at: timestamp, ...recorded,
 notes: boundedText(2000).nullable(), evidence: hairEvidence,
}).superRefine((t, ctx) => {
 if (t.evidence.source !== "PHYSICAL_TEST" || Date.parse(t.performed_at) > Date.parse(t.recorded_at))
  ctx.addIssue({ code: "custom", message: "Invalid physical test provenance" });
});
export const hairHistoryEvent = z.strictObject({
 id: uuid, category: z.enum(["COLOR","BLEACH_LIGHTENING","TONER_GLOSS","PERM","RELAXER_STRAIGHTENING","KERATIN_SMOOTHING","OTHER_CHEMICAL"]),
 performed_on: z.discriminatedUnion("state", [
  z.strictObject({ state: z.enum(["EXACT", "APPROXIMATE"]), value: z.iso.date().min(10) }), unknown,
 ]),
 product: result(boundedText(500)), description: boundedText(2000),
 attributed_salon: boundedText(160).nullable(), attributed_professional: boundedText(160).nullable(),
 location_id: uuid.nullable(), region_ids: uuid.array(), ...recorded, evidence: hairEvidence,
}).superRefine((h, ctx) => {
 if (new Set(h.region_ids).size !== h.region_ids.length ||
  (h.performed_on.state !== "UNKNOWN" && (h.performed_on.value < "1900-01-01" || Date.parse(h.performed_on.value) > Date.parse(h.recorded_at))))
  ctx.addIssue({ code: "custom", message: "Invalid historical date or region links" });
});
const page = <T extends z.ZodType>(item: T) => z.strictObject({
 items: z.array(item).max(100), offset: z.number().int().min(0).max(10000),
 page_size: z.number().int().min(1).max(100), has_more: z.boolean(),
 next_offset: z.number().int().min(1).max(10100).nullable(),
}).superRefine((p, ctx) => {
 if (p.items.length > p.page_size || p.next_offset !== (p.has_more ? p.offset + p.page_size : null) ||
  (p.has_more && p.items.length !== p.page_size))
  ctx.addIssue({ code: "custom", message: "Invalid page metadata" });
});
export const hairSnapshot = z.strictObject({
 passport: z.strictObject({
  id: uuid, client_id: uuid, status: lifecycle, client_status: lifecycle, version,
  created_at: timestamp, updated_at: timestamp,
 }),
 core: hairAssessment, regions: hairRegion.array(),
 physical_tests: page(hairPhysicalTest), history: page(hairHistoryEvent),
}).superRefine((s, ctx) => {
 const ids = new Set(s.regions.map(r => r.id));
 if (ids.size !== s.regions.length ||
  new Set(s.physical_tests.items.map(t => t.id)).size !== s.physical_tests.items.length ||
  new Set(s.history.items.map(h => h.id)).size !== s.history.items.length ||
  (s.core.state === "ASSESSED" && s.core.observation.region_id !== null) ||
  s.physical_tests.items.some(t => t.region_id !== null && !ids.has(t.region_id)) ||
  s.history.items.some(h => h.region_ids.some(id => !ids.has(id))) ||
  Date.parse(s.passport.updated_at) < Date.parse(s.passport.created_at))
  ctx.addIssue({ code: "custom", message: "Inconsistent technical snapshot" });
});
export const hairReadErrorCodes = ["UNAUTHENTICATED", "SESSION_EXPIRED", "MEMBERSHIP_REQUIRED", "MEMBERSHIP_REVOKED", "TENANT_CONTEXT_INVALID", "FORBIDDEN", "CLIENT_NOT_FOUND", "HAIR_PASSPORT_NOT_FOUND", "VALIDATION_FAILED", "NETWORK_ERROR"] as const;
export const hairReadResult = z.union([
 z.strictObject({ data: hairSnapshot, correlationId: uuid }),
 z.strictObject({ code: z.enum(hairReadErrorCodes), message: z.string(), correlationId: uuid }),
]);
export type HairSnapshot = z.infer<typeof hairSnapshot>;
export const hairReadErrorStatus = (code: string) => ({
 UNAUTHENTICATED: 401, SESSION_EXPIRED: 401, MEMBERSHIP_REQUIRED: 403, MEMBERSHIP_REVOKED: 403,
 TENANT_CONTEXT_INVALID: 403, FORBIDDEN: 403, CLIENT_NOT_FOUND: 404, HAIR_PASSPORT_NOT_FOUND: 404,
 VALIDATION_FAILED: 400,
}[code] ?? 503);
