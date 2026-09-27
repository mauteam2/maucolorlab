import { historyCommand } from "./history";

export type HistoryDraft = {
 category: "COLOR" | "BLEACH_LIGHTENING" | "TONER_GLOSS" | "PERM" | "RELAXER_STRAIGHTENING" | "KERATIN_SMOOTHING" | "OTHER_CHEMICAL";
 dateState: "EXACT" | "APPROXIMATE" | "UNKNOWN";
 date: string;
 productState: "KNOWN" | "UNKNOWN" | "NOT_APPLICABLE";
 product: string;
 description: string;
 regionIds: string[];
 source: "HISTORICAL" | "IMPORTED_UNVERIFIED";
 context: string;
};

export class HistoryDraftError extends Error {
 constructor(public field: "category" | "date" | "product" | "description" | "region" | "context") { super(field); }
}

export const newHistoryDraft = (): HistoryDraft => ({
 category: "COLOR", dateState: "UNKNOWN", date: "", productState: "UNKNOWN", product: "", description: "", regionIds: [], source: "HISTORICAL", context: "",
});

export function historyCommandFromDraft(clientId: string, requestId: string, draft: HistoryDraft) {
 const description = draft.description.trim(), product = draft.product.trim(), context = draft.context.trim();
 if (!description || description.length > 2000) throw new HistoryDraftError("description");
 if (draft.productState === "KNOWN" && (!product || product.length > 500)) throw new HistoryDraftError("product");
 if (context.length > 2000) throw new HistoryDraftError("context");
 if (draft.dateState !== "UNKNOWN" && (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || Number.isNaN(Date.parse(draft.date)) || new Date(draft.date).toISOString().slice(0, 10) !== draft.date || draft.date < "1900-01-01" || draft.date > new Date().toISOString().slice(0, 10))) throw new HistoryDraftError("date");
 if (new Set(draft.regionIds).size !== draft.regionIds.length) throw new HistoryDraftError("region");
 const input = {
  operation: "add_history", client_id: clientId,
  payload: { request_id: requestId, category: draft.category,
   performed_on: draft.dateState === "UNKNOWN" ? { state: "UNKNOWN", value: null } : { state: draft.dateState, value: draft.date },
   product: draft.productState === "KNOWN" ? { state: "KNOWN", value: product } : { state: draft.productState, value: null },
   description, region_ids: draft.regionIds,
   evidence: { source: draft.source, ...(context ? { context } : {}) },
  },
 };
 const parsed = historyCommand.safeParse(input);
 if (!parsed.success) {
  const path = parsed.error.issues[0]?.path.join(".") ?? "";
  throw new HistoryDraftError(path.includes("category") ? "category" : path.includes("performed_on") ? "date" : path.includes("product") ? "product" : path.includes("region_ids") ? "region" : path.includes("context") ? "context" : "description");
 }
 return parsed.data;
}
