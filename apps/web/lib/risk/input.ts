import { createHash } from "node:crypto";
import { z } from "zod";
import { canonical, confidenceInput, normalizeInput } from "@/lib/confidence/input";
import { evaluateConfidence } from "@/lib/confidence/engine";
import type { CaseConfidenceAssessment } from "@/lib/confidence/model";
import { RiskInputError } from "./model";
export const riskHash = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
const ref = z.strictObject({kind: z.enum(["OBSERVATION", "PHYSICAL_TEST", "HISTORY", "UNVERIFIED_STATE"]), id: z.uuid(), evidenceId: z.uuid().nullable()});
export const scopeConcern = z.discriminatedUnion("state", [
 z.strictObject({state: z.literal("NOT_ASSESSED"), evidenceRefs: ref.array().length(0)}),
 z.strictObject({state: z.literal("DECLARED_OUTSIDE_COSMETIC_SCOPE"), evidenceRefs: ref.array().min(1).max(100)}),
]);
/** Internal authoritative declaration capability; GET never accepts a scope override. No narrative inference. */
export function normalizeRiskInput(snapshot: unknown, confidence: CaseConfidenceAssessment, concern: unknown = {state: "NOT_ASSESSED", evidenceRefs: []}) {
 const parsed = confidenceInput.safeParse(snapshot), scope = scopeConcern.safeParse(concern);
 if (!parsed.success || !scope.success) throw new RiskInputError();
 try {
  const normalized = normalizeInput(parsed.data);
  // Bind the entire Phase 1D result to this snapshot, clock and rules. A forged band/ref cannot bypass a stop.
  const expected = evaluateConfidence(parsed.data);
  if (canonical(expected) !== canonical(confidence)) throw new RiskInputError();
  const refs = new Set(normalized.candidates.map(c => canonical(c.ref)));
  if (scope.data.evidenceRefs.some(r => !refs.has(canonical(r)))) throw new RiskInputError();
  return {snapshot: parsed.data, normalized, confidence: expected, scope: {...scope.data,
   evidenceRefs: [...new Map(scope.data.evidenceRefs.map(r => [canonical(r), r])).values()].sort((a,b) => canonical(a) < canonical(b) ? -1 : canonical(a) > canonical(b) ? 1 : 0)}};
 } catch { throw new RiskInputError(); }
}
