import type { CaseConfidenceAssessment, EvidenceRef } from "@/lib/confidence/model";
import type { RequirementCode, Severity, TechnicalField } from "@/lib/confidence/rules";
import type { GateOutcome, RiskBand, RiskDimension, RiskReasonCode, riskRequirementCodes } from "./rules";
export type RiskReason = { code: RiskReasonCode; dimension: RiskDimension; band: RiskBand; target: string;
 field: TechnicalField | null; evidenceRefs: EvidenceRef[]; context: { state: string | null; value: string | number | null; count: number | null } };
export type DimensionRisk = { dimension: RiskDimension; band: RiskBand; reasons: RiskReason[] };
export type RiskInformationRequirement = { code: RequirementCode | typeof riskRequirementCodes[number]; target: string;
 severity: Severity; reasonCodes: string[]; evidenceRefs: EvidenceRef[] };
export type RequiredPhysicalTest = { type: "POROSITY" | "ELASTICITY" | "STRAND"; target: string;
 status: "SATISFIED" | "MISSING" | "STALE" | "UNRELIABLE"; reasonCodes: RiskReasonCode[]; evidenceRefs: EvidenceRef[] };
export type HardStop = { outcome: GateOutcome; reasonCodes: RiskReasonCode[]; target: string; evidenceRefs: EvidenceRef[] };
export type RiskAssessment = { engineVersion: string; evaluatedAt: string; inputFingerprint: string; rulesFingerprint: string;
 passportId: string; passportVersion: number; overallBand: RiskBand; dimensions: DimensionRisk[];
 regions: {target: string; band: RiskBand; dimensions: DimensionRisk[]}[];
 gate: {outcome: GateOutcome; canProgress: boolean; reasonCodes: RiskReasonCode[]}; hardStops: HardStop[];
 requiredPhysicalTests: RequiredPhysicalTest[]; requiredInformation: RiskInformationRequirement[]; dominantReasons: RiskReason[];
 confidence: Pick<CaseConfidenceAssessment, "engineVersion" | "inputFingerprint" | "rulesFingerprint" | "band" | "confidence">;
 scopeAssessment: "NOT_ASSESSED" | "DECLARED_OUTSIDE_COSMETIC_SCOPE" };
export class RiskInputError extends Error {
 constructor(public code: "RISK_INPUT_INVALID" = "RISK_INPUT_INVALID") { super(code); }
}
