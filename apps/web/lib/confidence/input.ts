import { z } from "zod";
import { hairSnapshot, type HairSnapshot } from "@/lib/hair-passport/contracts";
import { confidenceRules as rules, type TechnicalField } from "./rules";
import { ConfidenceInputError, type Candidate, type NormalizedInput } from "./model";

export const confidenceInput = z.strictObject({ pages: hairSnapshot.array().min(1).max(rules.limits.pages), evaluatedAt: z.iso.datetime({ offset: true }) });
export type ConfidenceInput = z.infer<typeof confidenceInput>;
const fields = Object.values(rules.domains).flat() as Exclude<TechnicalField, "physical_test">[];
const lexical = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export function canonical(value: unknown): string {
 if (value === null || typeof value !== "object") return JSON.stringify(value);
 if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
 return `{${Object.entries(value).sort(([a], [b]) => lexical(a, b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}
export function normalizeInput(raw: unknown): NormalizedInput {
 const parsed = confidenceInput.safeParse(raw);
 if (!parsed.success) throw new ConfidenceInputError();
 const { pages, evaluatedAt } = parsed.data;
 const first = pages[0]!; // The schema enforces a nonempty page set.
 if (first.regions.length > rules.limits.regions) throw new ConfidenceInputError("CONFIDENCE_INPUT_LIMIT");
 const identity = canonical([first.passport, first.core, [...first.regions].sort((a, b) => lexical(a.id, b.id))]);
 const sections = ["observations", "physical_tests", "history"] as const;
 pages.forEach((page, index) => {
  if (canonical([page.passport, page.core, [...page.regions].sort((a, b) => lexical(a.id, b.id))]) !== identity) throw new ConfidenceInputError();
  sections.forEach(section => {
   const part = page[section];
   if (part.offset !== index * rules.limits.pageSize || part.page_size !== rules.limits.pageSize ||
    (index === pages.length - 1 && part.has_more) ||
    (index > 0 && !pages[index - 1]![section].has_more && part.items.length > 0)) throw new ConfidenceInputError();
  });
  if (index > 0 && !sections.some(section => pages[index - 1]![section].has_more)) throw new ConfidenceInputError();
 });
 const observations = pages.flatMap(p => p.observations.items);
 const tests = pages.flatMap(p => p.physical_tests.items);
 const history = pages.flatMap(p => p.history.items);
 for (const items of [observations, tests, history]) if (new Set(items.map(i => i.id)).size !== items.length) throw new ConfidenceInputError();
 const active = first.regions.filter(r => r.status === "ACTIVE");
 const uniqueTypes = active.filter(r => r.type !== "CUSTOM").map(r => r.type);
 if (new Set(uniqueTypes).size !== uniqueTypes.length) throw new ConfidenceInputError();
 const observationIds = new Set(observations.map(o => o.id));
 for (const assessment of [first.core, ...first.regions.map(r => r.assessment)])
  if (assessment.state === "ASSESSED" && !observationIds.has(assessment.observation.id)) throw new ConfidenceInputError();
 const targets = ["GLOBAL", ...active.map(r => r.id).sort(lexical)];
 const candidates: Candidate[] = [];
 const evidenceDefinitions = new Map<string, string>();
 const time = Date.parse(evaluatedAt);
 if (Date.parse(first.passport.updated_at) > time) throw new ConfidenceInputError();
 if (first.regions.some(r => Date.parse(r.updated_at) > time)) throw new ConfidenceInputError();
 const observed = new Map<string, string>();
 function addObservation(o: HairSnapshot["observations"]["items"][number], current: boolean) {
  if (Date.parse(o.recorded_at) > time) throw new ConfidenceInputError();
  const signature = canonical(o);
  if (observed.has(o.id)) { if (observed.get(o.id) !== signature) throw new ConfidenceInputError();
   if (current) candidates.filter(c => c.ref.kind === "OBSERVATION" && c.ref.id === o.id).forEach(c => { c.current = true; }); return; }
  observed.set(o.id, signature);
  fields.forEach(field => { const fact = o[field];
   candidates.push({ field, target: o.region_id ?? "GLOBAL", state: fact.state, value: fact.value,
    source: o.evidence.source, confidence: o.evidence.confidence.value, observedAt: o.evidence.observed_at.value,
    relevantUntil: o.evidence.relevant_until, ref: { kind: "OBSERVATION", id: o.id, evidenceId: o.evidence.id },
    supersedes: o.supersedes_id, conflictEligible: true, current }); });
 }
 function assessment(a: HairSnapshot["core"], target: string) {
  if (a.state === "ASSESSED") addObservation(a.observation, true);
  else if (a.state === "UNVERIFIED") fields.forEach(field => {
   const fact = a.values[field];
   candidates.push({ field, target, ...fact, source: null, confidence: null, observedAt: null, relevantUntil: null,
    ref: { kind: "UNVERIFIED_STATE", id: target === "GLOBAL" ? first.passport.id : target, evidenceId: null },
    supersedes: null, conflictEligible: true, current: true });
  });
 }
 const allEvidence = [...observations.map(o => o.evidence), ...tests.map(t => t.evidence), ...history.map(h => h.evidence),
  ...(first.core.state === "ASSESSED" ? [first.core.observation.evidence] : []),
  ...first.regions.flatMap(r => r.assessment.state === "ASSESSED" ? [r.assessment.observation.evidence] : [])];
 allEvidence.forEach(e => {
  if (Date.parse(e.recorded_at) > time || (e.observed_at.value !== null && Date.parse(e.observed_at.value) > time)) throw new ConfidenceInputError();
  const signature = canonical(e); if (evidenceDefinitions.has(e.id) && evidenceDefinitions.get(e.id) !== signature) throw new ConfidenceInputError();
  evidenceDefinitions.set(e.id, signature);
 });
 [...observations, ...tests, ...history].forEach(i => { if (Date.parse(i.recorded_at) > time) throw new ConfidenceInputError(); });
 assessment(first.core, "GLOBAL"); active.forEach(r => assessment(r.assessment, r.id)); observations.forEach(o => addObservation(o, false));
 tests.forEach(t => {
  if (t.type !== "STRAND" && t.result.state === "KNOWN" &&
   !(t.type === "POROSITY" ? ["LOW", "MEDIUM", "HIGH"] : ["LOW", "NORMAL", "HIGH"]).includes(t.result.value)) throw new ConfidenceInputError();
  for (const field of ["physical_test", ...(t.type === "POROSITY" ? ["porosity"] : t.type === "ELASTICITY" ? ["elasticity"] : [])] as TechnicalField[]) {
   candidates.push({ field, target: t.region_id ?? "GLOBAL", state: t.result.state, value: t.result.value,
    source: t.evidence.source, confidence: t.evidence.confidence.value, observedAt: t.performed_at,
    relevantUntil: t.evidence.relevant_until, ref: {kind: "PHYSICAL_TEST", id: t.id, evidenceId: t.evidence.id},
    supersedes: t.supersedes_id, conflictEligible: field !== "physical_test", current: false });
  }
 });
 history.forEach(h => {
  const field: TechnicalField = h.category === "BLEACH_LIGHTENING" ? "bleach_history" : ["COLOR", "TONER_GLOSS"].includes(h.category) ? "cosmetic_color_history" : "chemical_history";
  for (const target of h.region_ids.length ? h.region_ids : ["GLOBAL"]) candidates.push({ field, target, state: "KNOWN", value: h.description,
   source: h.evidence.source, confidence: h.evidence.confidence.value, observedAt: h.evidence.observed_at.value,
   relevantUntil: h.evidence.relevant_until, ref: {kind: "HISTORY", id: h.id, evidenceId: h.evidence.id}, supersedes: h.supersedes_id,
   conflictEligible: false, current: false });
 });
 // Invalid supersession must not silently delete evidence before scoring.
 const candidateKeys = new Set(candidates.map(c => `${c.ref.kind}:${c.ref.id}:${c.target}:${c.field}`));
 const links = new Map<string, string>();
 candidates.forEach(c => {
  if (c.supersedes !== null) {
   if (!candidateKeys.has(`${c.ref.kind}:${c.supersedes}:${c.target}:${c.field}`)) throw new ConfidenceInputError();
   links.set(`${c.ref.kind}:${c.ref.id}`, `${c.ref.kind}:${c.supersedes}`);
  }
 });
 const visited = new Set<string>();
 for (const start of links.keys()) {
  const path = new Set<string>(); let node: string | undefined = start;
  while (node !== undefined && !visited.has(node)) {
   if (path.has(node)) throw new ConfidenceInputError(); path.add(node); node = links.get(node);
  }
  path.forEach(id => visited.add(id));
 }
 // Explicit supersession is scoped to the same record kind, target and field. Never erase a foreign target.
 const replaced = new Set(candidates.filter(c => c.supersedes !== null).map(c => `${c.ref.kind}:${c.supersedes}:${c.target}:${c.field}`));
 const retained = candidates.filter(c => !replaced.has(`${c.ref.kind}:${c.ref.id}:${c.target}:${c.field}`) && targets.includes(c.target));
 return { passportId: first.passport.id, passportVersion: first.passport.version, evaluatedAt: new Date(time).toISOString(), targets,
  missingRegions: rules.standardRegions.filter(type => !active.some(r => r.type === type)),
  candidates: retained.map(c => ({...c, observedAt: c.observedAt === null ? null : new Date(c.observedAt).toISOString(),
   relevantUntil: c.relevantUntil === null ? null : new Date(c.relevantUntil).toISOString()})).sort((a, b) => lexical(canonical(a), canonical(b))),
  counts: { regions: active.length, observations: observed.size, physicalTests: tests.length, history: history.length } };
}
