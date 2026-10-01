/** Product information-quality defaults, never clinical or service-safety thresholds. */
export const confidenceRules = {
 version: "confidence-engine/1.0.0",
 sources: { PHYSICAL_TEST: 0.95, PROFESSIONAL_VERIFIED: 0.9, HISTORICAL: 0.65, AI_ESTIMATE: 0.35, IMPORTED_UNVERIFIED: 0.25 },
 unverifiedQuality: 0.25, unspecifiedConfidence: 0.9, unknownTimeFactor: 0.5,
 freshnessDays: { natural_level: 180, perceived_level: 30, grey_ratio: 60, thickness: 180, density: 90,
  porosity: 30, elasticity: 30, cosmetic_color_history: null, bleach_history: null, chemical_history: null, physical_test: 30 },
 staleFactor: 0.5, expiredFactor: 0.2, conflictFactor: 0.6,
 conflictMinimumQuality: 0.2, levelConflictDelta: 2, greyConflictDelta: 0.2,
 criticalFields: ["natural_level", "bleach_history", "porosity", "elasticity"], criticalMinimumQuality: 0.4,
 bands: { HIGH: 0.8, MEDIUM: 0.6, LOW: 0.3 },
 standardRegions: ["ROOT", "MID_LENGTHS", "ENDS"],
 limits: { pages: 10, pageSize: 100, regions: 100 },
 domains: {
  LEVEL: ["natural_level", "perceived_level"], GREY: ["grey_ratio"],
  INTEGRITY: ["porosity", "elasticity", "thickness", "density"],
  COSMETIC_COLOR_HISTORY: ["cosmetic_color_history"], BLEACH_HISTORY: ["bleach_history"], CHEMICAL_HISTORY: ["chemical_history"],
 },
 domainWeights: { LEVEL: 2, GREY: 1, INTEGRITY: 3, COSMETIC_COLOR_HISTORY: 2, BLEACH_HISTORY: 3,
  CHEMICAL_HISTORY: 3, REGIONAL_COVERAGE: 3, PHYSICAL_TEST: 3 },
} as const;
export type TechnicalField = keyof typeof confidenceRules.freshnessDays;
export type Domain = keyof typeof confidenceRules.domainWeights;
export type Band = "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";
export type Severity = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
export type InformationState = "KNOWN" | "UNKNOWN" | "NOT_ASSESSED" | "NOT_APPLICABLE";
export const reasonCodes = ["FIELD_NOT_ASSESSED", "FIELD_UNKNOWN", "EVIDENCE_STALE", "EVIDENCE_EXPIRED", "EVIDENCE_TIME_UNKNOWN",
 "LOW_QUALITY_EVIDENCE", "SOURCE_QUALITY_LIMIT", "CONFIDENCE_UNSPECIFIED", "EXPLICIT_CONFIDENCE_LIMIT", "CONFLICTING_EVIDENCE",
 "DIVERGENT_HISTORY_SUMMARIES", "REGION_NOT_ASSESSED", "HISTORY_UNVERIFIED", "PHYSICAL_TEST_MISSING", "CRITICAL_INFORMATION_GAP"] as const;
export const requirementCodes = ["ASSESS_NATURAL_LEVEL", "ASSESS_CURRENT_LEVEL", "ASSESS_GREY", "ASSESS_POROSITY", "ASSESS_ELASTICITY",
 "ASSESS_INTEGRITY", "VERIFY_COLOR_HISTORY", "VERIFY_BLEACH_HISTORY", "VERIFY_CHEMICAL_HISTORY", "PERFORM_STRAND_TEST",
 "VERIFY_REGION", "REVIEW_CONFLICTING_EVIDENCE", "VERIFY_IMPORTED_HISTORY", "REFRESH_EVIDENCE"] as const;
export type ReasonCode = typeof reasonCodes[number];
export type RequirementCode = typeof requirementCodes[number];
