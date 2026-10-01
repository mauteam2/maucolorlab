import "server-only";
import { readTechnicalAssessment } from "@/lib/confidence/service";
import { AccessError } from "@/lib/tenant/bootstrap";
import { evaluateRisk } from "./engine";
import { RiskInputError } from "./model";
export async function readCaseRisk(clientId: string, options: unknown, correlationId: string) {
 try { return await readTechnicalAssessment(clientId, options, correlationId, evaluateRisk); }
 catch (error) { if (error instanceof RiskInputError) throw new AccessError(error.code, 503); throw error; }
}
