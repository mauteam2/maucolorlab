import { z } from "zod";
import { reasonCodes, requirementCodes } from "@/lib/confidence/rules";
import { riskRules, riskReasonCodes, riskRequirementCodes } from "./rules";
const band = z.enum(riskRules.bands), dimension = z.enum(riskRules.dimensions), code = z.enum(riskReasonCodes);
const target = z.string().regex(/^(GLOBAL|MISSING:(ROOT|MID_LENGTHS|ENDS)|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/);
const refs = z.strictObject({kind: z.enum(["OBSERVATION", "PHYSICAL_TEST", "HISTORY", "UNVERIFIED_STATE"]), id: z.uuid(), evidenceId: z.uuid().nullable()}).array().max(1000);
const codes = code.array().max(30);
export const riskReason = z.strictObject({code, dimension, band, target,
 field: z.enum(["natural_level", "perceived_level", "grey_ratio", "porosity", "elasticity", "thickness", "density", "cosmetic_color_history", "bleach_history", "chemical_history", "physical_test"]).nullable(),
 evidenceRefs: refs, context: z.strictObject({state: z.string().nullable(), value: z.union([z.string(), z.number()]).nullable(), count: z.int().min(0).max(1000).nullable()})});
const dimensionRisk = z.strictObject({dimension, band, reasons: riskReason.array().max(2000)});
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
const outcome = z.enum(riskRules.gatePrecedence);
export const riskAssessment = z.strictObject({engineVersion: z.literal(riskRules.version), evaluatedAt: z.iso.datetime({offset: true}), inputFingerprint: fingerprint, rulesFingerprint: fingerprint,
 passportId: z.uuid(), passportVersion: z.int().positive(), overallBand: band, dimensions: dimensionRisk.array().length(8),
 regions: z.strictObject({target, band, dimensions: dimensionRisk.array().length(8)}).array().max(100),
 gate: z.strictObject({outcome, canProgress: z.boolean(), reasonCodes: codes.min(1)}),
 hardStops: z.strictObject({outcome, reasonCodes: codes.min(1), target, evidenceRefs: refs}).array().max(2000),
 requiredPhysicalTests: z.strictObject({type: z.enum(["POROSITY", "ELASTICITY", "STRAND"]), target,
  status: z.enum(["SATISFIED", "MISSING", "STALE", "UNRELIABLE"]), reasonCodes: codes, evidenceRefs: refs}).array().max(303),
 requiredInformation: z.strictObject({code: z.enum([...requirementCodes, ...riskRequirementCodes]), target, severity: z.enum(riskRules.bands),
  reasonCodes: z.enum([...reasonCodes, ...riskReasonCodes]).array().max(40), evidenceRefs: refs}).array().max(5000),
 dominantReasons: riskReason.array().max(5000), confidence: z.strictObject({engineVersion: z.literal("confidence-engine/1.0.0"), inputFingerprint: fingerprint, rulesFingerprint: fingerprint,
  band: z.enum(["HIGH", "MEDIUM", "LOW", "INSUFFICIENT"]), confidence: z.number().min(0).max(1)}),
 scopeAssessment: z.enum(["NOT_ASSESSED", "DECLARED_OUTSIDE_COSMETIC_SCOPE"]),
});
export const riskResult = z.strictObject({data: riskAssessment, correlationId: z.uuid()});
