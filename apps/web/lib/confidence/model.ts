import type { Band, Domain, InformationState, ReasonCode, RequirementCode, Severity, TechnicalField } from "./rules";
export type EvidenceRef = { kind: "OBSERVATION" | "PHYSICAL_TEST" | "HISTORY" | "UNVERIFIED_STATE"; id: string; evidenceId: string | null };
export type Candidate = {
 field: TechnicalField; target: string; state: InformationState; value: string | number | null;
 source: "AI_ESTIMATE" | "PROFESSIONAL_VERIFIED" | "PHYSICAL_TEST" | "HISTORICAL" | "IMPORTED_UNVERIFIED" | null;
 confidence: number | null; observedAt: string | null; relevantUntil: string | null;
 ref: EvidenceRef; supersedes: string | null; conflictEligible: boolean; current: boolean;
};
export type Quality = { score: number; freshness: "FRESH" | "STALE" | "EXPIRED" | "UNKNOWN" | "HISTORICAL"; reasons: ReasonCode[]; ageDays: number | null };
export type FieldConfidence = { field: TechnicalField; target: string; state: InformationState; confidence: number;
 evidenceRefs: EvidenceRef[]; reasons: ReasonCode[]; freshness: Quality["freshness"] };
export type UncertaintyItem = { domain: Domain; field: TechnicalField | null; target: string; severity: Severity;
 code: ReasonCode; state: InformationState | null; evidenceRefs: EvidenceRef[] };
export type EvidenceConflict = { domain: Domain; field: TechnicalField; target: string; severity: Severity;
 code: "CONFLICTING_EVIDENCE" | "DIVERGENT_HISTORY_SUMMARIES"; evidenceRefs: EvidenceRef[] };
export type InformationRequirement = { code: RequirementCode; domain: Domain; field: TechnicalField | null; target: string;
 severity: Severity; reasonCodes: ReasonCode[]; evidenceRefs: EvidenceRef[] };
export type DomainConfidence = { domain: Domain; confidence: number; band: Band; fields: FieldConfidence[] };
export type CaseConfidenceAssessment = {
 confidence: number; band: Band; domains: DomainConfidence[]; significantUnknowns: UncertaintyItem[];
 conflicts: EvidenceConflict[]; staleEvidence: UncertaintyItem[]; informationRequirements: InformationRequirement[];
 engineVersion: string; evaluatedAt: string; inputFingerprint: string; rulesFingerprint: string;
 passportId: string; passportVersion: number; inputCounts: { regions: number; observations: number; physicalTests: number; history: number };
};
export type NormalizedInput = { passportId: string; passportVersion: number; evaluatedAt: string; targets: string[];
 missingRegions: string[]; candidates: Candidate[]; counts: CaseConfidenceAssessment["inputCounts"] };
export class ConfidenceInputError extends Error {
 constructor(public code: "CONFIDENCE_INPUT_INVALID" | "CONFIDENCE_INPUT_LIMIT" = "CONFIDENCE_INPUT_INVALID") { super(code); }
}
