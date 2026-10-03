import { z } from "zod";
import { pilotCandidate, sourceDocument } from "./pilot-model";

const uuid = z.uuid().transform(value => value.toLowerCase());
// API precision/size limits, not manufacturer dosage recommendations.
export const colorGrams = z.number().finite().positive().max(1000).refine(
 value => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8,
 "Color grams must have at most two decimal places",
).transform(value=>Math.round(value*100)/100);
export const controlledOptionsRequest = z.strictObject({ client_id: uuid, plan_id: uuid, catalog_id: uuid });
export const controlledCreateRequest = controlledOptionsRequest.extend({
 request_id: uuid, product_id: uuid, developer_id: uuid, color_grams: colorGrams,
 supersedes_id: uuid.nullable().default(null),
});
export const controlledOptions = z.strictObject({
 schemaVersion: z.literal(1), status: z.enum(["OPTIONS_FOR_REVIEW", "BLOCKED_BY_SAFETY", "CATALOG_UNAVAILABLE", "ASSESSMENT_REQUIRED", "NO_VERIFIED_MATCH"]),
 catalogId: uuid, catalogVersion: z.int().positive(), catalogFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
 candidates: pilotCandidate.array().max(100), whiteRatio: z.number().min(0).max(1).nullable(),
 evidenceIds: uuid.array().max(100), regionId: uuid.nullable(), executable: z.literal(false),
 explanation: z.string(),
});
export const controlledRecipe = z.strictObject({
 schemaVersion: z.literal(3), engineVersion: z.literal("controlled-brand-recipe/1.0.0"),
 state: z.literal("DRAFT_FOR_PROFESSIONAL_REVIEW"), executable: z.literal(false), professionalReviewRequired: z.literal(true),
 selectionOrigin: z.literal("PROFESSIONAL_INPUT"), parentRecipeId: z.string().regex(/^[a-f0-9]{64}$/),
 selected: pilotCandidate, colorGrams, developerGrams: colorGrams, totalGrams: z.number().positive().max(2000),
 amountBasis: z.literal("USER_ENTERED_COLOR_GRAMS"),
 context: z.strictObject({ regionId: uuid, whiteRatio: z.number().min(0).max(1), evidenceIds: uuid.array().min(1).max(100) }),
 sources: sourceDocument.array().min(1).max(3),
 snapshots: z.strictObject({ catalogId: uuid, catalogVersion: z.int().positive(), catalogFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  productVersion: z.int().positive(), developerVersion: z.int().positive(), ruleVersion: z.int().positive(),
  colorEngine: z.string(), riskEngine: z.string(), hairFingerprint: z.string().regex(/^[a-f0-9]{64}$/), evaluatedAt: z.iso.datetime({offset:true}) }),
}).superRefine((r,c) => {
 if (r.selected.mixingRatio !== "1:1" || Math.round(r.colorGrams*100) !== Math.round(r.developerGrams*100) ||
  Math.round(r.totalGrams*100) !== Math.round(r.colorGrams*100)*2 ||
  r.sources.some(s=>s.catalog_id!==r.snapshots.catalogId || s.review_status!=="APPROVED" || s.verification_status!=="ELIFORA_VERIFIED") ||
  r.selected.sourceIds.some(id=>!r.sources.some(s=>s.id===id)))
  c.addIssue({code:"custom",message:"Controlled recipe arithmetic or source integrity invalid"});
});
export const storedControlledRecipe = z.strictObject({ id: uuid, seriesId: uuid, version: z.int().positive(), supersedesId: uuid.nullable(),
 clientId: uuid, planId: uuid, catalogId: uuid, createdAt: z.iso.datetime({offset:true}), createdBy: uuid, result: controlledRecipe });
export type ControlledCreate = z.infer<typeof controlledCreateRequest>;
export const controlledCatalogs = z.strictObject({ id: uuid, version: z.int().positive() }).array().max(25);
