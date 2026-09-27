import { hairTechnicalPatch } from "./mutations";
import type { HairSnapshot } from "./contracts";

export const technicalFields = [
 { key: "natural_level", kind: "level" }, { key: "perceived_level", kind: "level" },
 { key: "grey_ratio", kind: "percent" }, { key: "thickness", kind: "thickness" },
 { key: "density", kind: "density" }, { key: "porosity", kind: "porosity" },
 { key: "elasticity", kind: "elasticity" }, { key: "tone", kind: "text" },
 { key: "cosmetic_color_history", kind: "longText" }, { key: "bleach_history", kind: "longText" },
 { key: "chemical_history", kind: "longText" },
] as const;
export type TechnicalKey = typeof technicalFields[number]["key"];
export type TechnicalState = "KNOWN" | "UNKNOWN" | "NOT_ASSESSED" | "NOT_APPLICABLE";
export type FieldDraft = { state: TechnicalState; raw: string };
export type TechnicalDraft = { values: Record<TechnicalKey, FieldDraft>; technical_notes: string; integrity_notes: string };
export type TechnicalPatch = Record<string, unknown>;
export class DraftValidationError extends Error { constructor(public field: string, public code: "required" | "range" | "invalid") { super(code); } }

export function initialTechnicalDraft(assessment?: HairSnapshot["core"]): TechnicalDraft {
 const values = assessment?.state === "ASSESSED" ? assessment.observation : assessment?.state === "UNVERIFIED" ? assessment.values : null;
 return {
  values: Object.fromEntries(technicalFields.map(({ key }) => {
   const item = values?.[key];
   return [key, { state: item?.state ?? "NOT_ASSESSED", raw: item?.state === "KNOWN" ? String(key === "grey_ratio" ? Number(item.value) * 100 : item.value) : "" }];
  })) as TechnicalDraft["values"],
  technical_notes: values?.technical_notes ?? "", integrity_notes: values?.integrity_notes ?? "",
 };
}

export function technicalChanges(initial: TechnicalDraft, draft: TechnicalDraft): TechnicalPatch {
 const patch: TechnicalPatch = {};
 for (const { key, kind } of technicalFields) {
  const before = initial.values[key], after = draft.values[key];
  if (before.state === after.state && (after.state !== "KNOWN" || before.raw === after.raw)) continue;
  if (after.state !== "KNOWN") { patch[key] = { state: after.state, value: null }; continue; }
  const raw = after.raw.trim();
  if (!raw) throw new DraftValidationError(key, "required");
  if (kind === "level" || kind === "percent") {
   const number = Number(raw);
   if (!Number.isFinite(number) || number < (kind === "level" ? 1 : 0) || number > (kind === "level" ? 10 : 100)) throw new DraftValidationError(key, "range");
   patch[key] = { state: "KNOWN", value: kind === "percent" ? number / 100 : number };
  } else patch[key] = { state: "KNOWN", value: raw };
 }
 for (const key of ["technical_notes", "integrity_notes"] as const) {
  if (initial[key] !== draft[key]) patch[key] = draft[key].trim() || null;
 }
 if (!hairTechnicalPatch.safeParse(patch).success) throw new DraftValidationError("technical", "invalid");
 return patch;
}
