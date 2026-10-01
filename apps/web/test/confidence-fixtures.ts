import source from "../../../contracts/fixtures/confidence-golden.json";
import { hairSnapshot, type HairSnapshot } from "@/lib/hair-passport/contracts";
export const goldenFixtures = source;
export const fixtureId = (n: number) => `c1000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
type State = "KNOWN" | "UNKNOWN" | "NOT_ASSESSED" | "NOT_APPLICABLE";
type Change = {minimal?: boolean; globalStates?: Record<string, string | undefined>; regionStates?: Record<string, Record<string, string | undefined> | undefined>;
 onlyImportedHistory?: boolean; extraSource?: string; testAgeDays?: number; conflict?: {field: string; value: string | number; region?: string};
 customUnassessed?: boolean; allUnknown?: boolean; tests?: string; structuredTests?: boolean; archived?: boolean; unknownHistoryDate?: boolean; oldHistory?: boolean};
export function goldenInput(change: Change = {}) {
 const snapshot = hairSnapshot.parse(structuredClone(source.baseSnapshot));
 const base = snapshot.core.state === "ASSESSED" ? snapshot.core.observation : undefined;
 if (!base) throw new Error("Golden baseline requires an assessment");
 const assessments = () => [snapshot.core, ...snapshot.regions.map(r => r.assessment)];
 const setState = (o: typeof base, field: string, state: string) => {
  const fact = o[field as keyof typeof o] as {state: State; value: unknown};
  fact.state = state as State; if (state !== "KNOWN") fact.value = null;
 };
 for (const [field, state] of Object.entries(change.globalStates ?? {})) if (state) setState(base, field, state);
 for (const [type, fields] of Object.entries(change.regionStates ?? {})) {
  const region = snapshot.regions.find(r => r.type === type);
  if (fields && region?.assessment.state === "ASSESSED") for (const [field, state] of Object.entries(fields)) if (state) setState(region.assessment.observation, field, state);
 }
 if (change.allUnknown) assessments().forEach(a => { if (a.state === "ASSESSED") for (const field of ["natural_level", "perceived_level", "grey_ratio", "thickness", "density", "porosity", "elasticity", "cosmetic_color_history", "bleach_history", "chemical_history"]) setState(a.observation, field, "UNKNOWN"); });
 if (change.customUnassessed) snapshot.regions.push({id: fixtureId(90), type: "CUSTOM", label: "Important band", status: "ACTIVE", version: 1, updated_at: base.recorded_at, assessment: {state: "NOT_ASSESSED", observation: null}});
 if (change.minimal || change.onlyImportedHistory) {
  snapshot.core = {state: "NOT_ASSESSED", observation: null}; snapshot.regions.forEach(r => { r.assessment = {state: "NOT_ASSESSED", observation: null}; });
  snapshot.physical_tests.items = []; if (change.minimal) snapshot.regions = [];
 }
 snapshot.observations.items = assessments().flatMap(a => a.state === "ASSESSED" ? [structuredClone(a.observation)] : []);
 if (change.tests === "NONE") snapshot.physical_tests.items = [];
 if (change.testAgeDays) for (const test of snapshot.physical_tests.items) {
  const old = new Date(Date.parse(source.evaluatedAt) - change.testAgeDays * 86400000).toISOString();
  test.performed_at = old; test.evidence.observed_at = {state: "KNOWN", value: old};
 }
 if (change.structuredTests) snapshot.physical_tests.items.forEach(t => { t.type = "POROSITY"; t.result = {state: "KNOWN", value: "MEDIUM"}; });
 if (change.extraSource || change.conflict) {
  const original = change.conflict?.region ? snapshot.regions.find(r => r.type === change.conflict!.region)?.assessment : snapshot.core;
  if (original?.state !== "ASSESSED") throw new Error("Golden conflict requires an assessed target");
  const extra = structuredClone(original.observation); extra.id = fixtureId(200); extra.evidence.id = fixtureId(201);
  if (change.extraSource === "AI_ESTIMATE") { extra.evidence.source = "AI_ESTIMATE"; extra.evidence.verified_by = null; }
  if (change.conflict) (extra[change.conflict.field as keyof typeof extra] as {state: State; value: unknown}).value = change.conflict.value;
  snapshot.observations.items.push(extra);
 }
 if (change.archived) snapshot.passport.client_status = "ARCHIVED";
 if (change.onlyImportedHistory || change.unknownHistoryDate) {
  for (const [index, category] of (change.onlyImportedHistory ? ["COLOR", "BLEACH_LIGHTENING", "PERM"] : ["BLEACH_LIGHTENING"]).entries()) {
   const evidence = structuredClone(base.evidence); evidence.id = fixtureId(300 + index); evidence.source = change.onlyImportedHistory ? "IMPORTED_UNVERIFIED" : "HISTORICAL";
   evidence.verified_by = null; evidence.observed_at = {state: "UNKNOWN", value: null};
   const history: HairSnapshot["history"]["items"][number] = {id: fixtureId(310 + index), category: category as "COLOR" | "BLEACH_LIGHTENING" | "PERM",
    performed_on: {state: "UNKNOWN", value: null}, product: {state: "UNKNOWN", value: null}, description: "Reported historical event",
    attributed_salon: null, attributed_professional: null, location_id: null, region_ids: [], recorded_at: base.recorded_at,
    recorded_by: base.recorded_by, supersedes_id: null, evidence};
   if (change.oldHistory) { history.recorded_at = "2020-01-01T12:00:00Z"; history.evidence.recorded_at = history.recorded_at; }
   snapshot.history.items.push(history);
  }
 }
 return {pages: [snapshot], evaluatedAt: source.evaluatedAt};
}
