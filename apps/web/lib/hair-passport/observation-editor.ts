import { observationCommand } from "./observations";
import { technicalFields, type TechnicalKey, type TechnicalState } from "./editor";

export type ObservationDraft = {
 field: TechnicalKey;
 state: TechnicalState;
 value: string;
 regionId: string;
 verified: boolean;
 confidence: string;
};

export class ObservationDraftError extends Error {
 constructor(public field: string) { super(field); }
}

export const newObservationDraft = (): ObservationDraft => ({
 field: "natural_level", state: "KNOWN", value: "", regionId: "", verified: false, confidence: "",
});

export function observationCommandFromDraft(clientId: string, requestId: string, expectedVersion: number, draft: ObservationDraft) {
 const kind = technicalFields.find(field => field.key === draft.field)?.kind;
 if (!kind || !draft.verified) throw new ObservationDraftError(!draft.verified ? "verified" : "field");
 if (kind === "level" && draft.state === "NOT_APPLICABLE") throw new ObservationDraftError("state");
 let value: string | number | null = null;
 if (draft.state === "KNOWN") {
  const raw = draft.value.trim();
  if (!raw) throw new ObservationDraftError("value");
  if (kind === "level" || kind === "percent") {
   const number = Number(raw);
   if (!Number.isFinite(number) || number < (kind === "level" ? 1 : 0) || number > (kind === "level" ? 10 : 100)) throw new ObservationDraftError("value");
   value = kind === "percent" ? number / 100 : number;
  } else value = raw;
 }
 const rawConfidence = draft.confidence.trim();
 const confidence = rawConfidence ? Number(rawConfidence) : null;
 if (confidence !== null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 100)) throw new ObservationDraftError("confidence");
 const input = {
  operation: "add_observation", client_id: clientId,
  payload: { request_id: requestId, expected_version: expectedVersion,
   ...(draft.regionId ? { region_id: draft.regionId } : {}),
   technical: { [draft.field]: { state: draft.state, value } },
   evidence: { source: "PROFESSIONAL_VERIFIED", attestation: "PERSONALLY_ASSESSED",
    ...(confidence === null ? {} : { confidence: { state: "KNOWN", value: confidence / 100 } }) },
  },
 };
 if (!observationCommand.safeParse(input).success) throw new ObservationDraftError("field");
 return observationCommand.parse(input);
}
