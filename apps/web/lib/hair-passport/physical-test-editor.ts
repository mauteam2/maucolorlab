import { physicalTestCommand } from "./physical-tests";

export type PhysicalTestDraft = {
 type: "POROSITY" | "ELASTICITY" | "STRAND";
 regionId: string;
 state: "KNOWN" | "UNKNOWN" | "NOT_APPLICABLE";
 value: string;
 notes: string;
};

export class PhysicalTestDraftError extends Error {
 constructor(public field: "region" | "result" | "notes") { super(field); }
}

export const newPhysicalTestDraft = (): PhysicalTestDraft => ({ type: "POROSITY", regionId: "", state: "KNOWN", value: "", notes: "" });

export function physicalTestCommandFromDraft(clientId: string, requestId: string, draft: PhysicalTestDraft) {
 const value = draft.value.trim();
 const notes = draft.notes.trim();
 if (draft.state === "KNOWN" && (!value || value.length > 1000)) throw new PhysicalTestDraftError("result");
 if (notes.length > 2000) throw new PhysicalTestDraftError("notes");
 const input = {
  operation: "add_physical_test", client_id: clientId,
  payload: { request_id: requestId, type: draft.type,
   ...(draft.regionId ? { region_id: draft.regionId } : {}),
   result: draft.state === "KNOWN" ? { state: "KNOWN", value } : { state: draft.state, value: null },
   ...(notes ? { notes } : {}),
  },
 };
 if (!physicalTestCommand.safeParse(input).success) throw new PhysicalTestDraftError("result");
 return physicalTestCommand.parse(input);
}
