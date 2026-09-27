import { expect, it } from "vitest";
import { HistoryDraftError, historyCommandFromDraft, newHistoryDraft } from "./history-editor";

const clientId = "c8000000-0000-4000-8000-000000000031";
const requestId = "c8000000-0000-4000-8000-000000000901";
const regionA = "c8000000-0000-4000-8000-000000000051", regionB = "c8000000-0000-4000-8000-000000000052";
it.each(["COLOR", "BLEACH_LIGHTENING", "TONER_GLOSS", "OTHER_CHEMICAL"] as const)("builds a %s event", category => {
 const command = historyCommandFromDraft(clientId, requestId, { ...newHistoryDraft(), category, description: "Önceki işlem" });
 expect(command.payload).toMatchObject({ category, performed_on: { state: "UNKNOWN", value: null }, product: { state: "UNKNOWN", value: null }, evidence: { source: "HISTORICAL" } });
 expect(JSON.stringify(command)).not.toMatch(/recorded_by|organization_id|actor_id|verified_by|supersedes_id/);
});
it("preserves exact and approximate dates without generating a day", () => {
 for (const dateState of ["EXACT", "APPROXIMATE"] as const) {
  const command = historyCommandFromDraft(clientId, requestId, { ...newHistoryDraft(), description: "Önceki işlem", dateState, date: "2024-09-17" });
  expect(command.payload.performed_on).toEqual({ state: dateState, value: "2024-09-17" });
 }
 expect(historyCommandFromDraft(clientId, requestId, { ...newHistoryDraft(), description: "Önceki işlem", date: "2024-09-17" }).payload.performed_on).toEqual({ state: "UNKNOWN", value: null });
});
it("sends known product and multiple regions, while unknown/inapplicable products have null value", () => {
 const base = { ...newHistoryDraft(), description: "Önceki işlem", regionIds: [regionA, regionB] };
 const known = historyCommandFromDraft(clientId, requestId, { ...base, productState: "KNOWN", product: "Sentetik boya", source: "IMPORTED_UNVERIFIED", context: "Müşteri anlatımı" });
 expect(known.payload).toMatchObject({ product: { state: "KNOWN", value: "Sentetik boya" }, region_ids: [regionA, regionB], evidence: { source: "IMPORTED_UNVERIFIED", context: "Müşteri anlatımı" } });
 for (const state of ["UNKNOWN", "NOT_APPLICABLE"] as const) expect(historyCommandFromDraft(clientId, requestId, { ...base, productState: state, product: "stale" }).payload.product).toEqual({ state, value: null });
});
it("rejects invalid date, empty description, missing known product and duplicate region", () => {
 const base = { ...newHistoryDraft(), description: "Önceki işlem" };
 for (const draft of [{ ...base, dateState: "EXACT" as const }, { ...base, dateState: "APPROXIMATE" as const, date: "2025-02-30" }, { ...base, dateState: "EXACT" as const, date: "1899-12-31" }]) expect(() => historyCommandFromDraft(clientId, requestId, draft)).toThrowError(HistoryDraftError);
 expect(() => historyCommandFromDraft(clientId, requestId, { ...base, description: " " })).toThrowError(HistoryDraftError);
 expect(() => historyCommandFromDraft(clientId, requestId, { ...base, productState: "KNOWN" })).toThrowError(HistoryDraftError);
 expect(() => historyCommandFromDraft(clientId, requestId, { ...base, regionIds: [regionA, regionA] })).toThrowError(HistoryDraftError);
});
