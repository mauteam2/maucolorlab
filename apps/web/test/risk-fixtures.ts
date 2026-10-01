import { goldenInput, fixtureId } from "./confidence-fixtures";
import source from "../../../contracts/fixtures/risk-golden.json";
import type { HairSnapshot } from "@/lib/hair-passport/contracts";
export const riskGolden = source;
export type RiskChange = {greyUnknown?:boolean; minimal?:boolean; bleachUnknown?:boolean; historyCount?:number; highPorosity?:boolean;
 lowElasticity?:boolean; fullTests?:boolean; staleTests?:boolean; missingTests?:boolean; conflictPorosity?:boolean; conflictElasticity?:boolean;
 regionalHigh?:boolean; localized?:boolean; custom?:boolean; imported?:boolean; matchingAI?:boolean; lowConfidence?:boolean;
 naturalUnknown?:boolean; porosityUnknown?:boolean; integrityNA?:boolean; allUnknown?:boolean; archived?:boolean; outside?:boolean};
export function riskInput(change: RiskChange = {}) {
 const input = goldenInput({minimal: change.minimal, customUnassessed: change.custom, allUnknown: change.allUnknown, archived: change.archived,
  tests: change.missingTests ? "NONE" : undefined, testAgeDays: change.staleTests ? 45 : undefined,
  onlyImportedHistory: change.imported, extraSource: change.matchingAI ? "AI_ESTIMATE" : undefined,
  conflict: change.conflictPorosity ? {field: "porosity", value: "HIGH"} : change.conflictElasticity ? {field: "elasticity", value: "LOW"} : undefined});
 const page = input.pages[0]!;
 for (const observation of page.observations.items) {
  if (change.highPorosity || change.regionalHigh && observation.region_id === page.regions[2]!.id) observation.porosity = {state:"KNOWN",value:"HIGH"};
  if (change.lowElasticity) observation.elasticity = {state:"KNOWN",value:"LOW"};
  if (change.greyUnknown && observation.region_id === null) observation.grey_ratio = {state:"UNKNOWN",value:null};
  if (change.bleachUnknown) observation.bleach_history = {state:"UNKNOWN",value:null};
  if (change.naturalUnknown) observation.natural_level = {state:"UNKNOWN",value:null};
  if (change.porosityUnknown) observation.porosity = {state:"UNKNOWN",value:null};
  if (change.integrityNA) {observation.porosity = {state:"NOT_APPLICABLE",value:null}; observation.elasticity = {state:"NOT_APPLICABLE",value:null};}
  if (change.lowConfidence) for (const field of ["perceived_level","grey_ratio","thickness","density","cosmetic_color_history","chemical_history"] as const)
   observation[field] = {state:"UNKNOWN",value:null};
 }
 for (const assessment of [page.core,...page.regions.map(r=>r.assessment)]) if (assessment.state === "ASSESSED")
  assessment.observation = structuredClone(page.observations.items.find(o=>o.id === assessment.observation.id)!);
 const template = page.physical_tests.items[0];
 if (change.fullTests && template) for (const [i,target] of [null,...page.regions.map(r=>r.id)].entries()) for (const [j,type] of ["POROSITY","ELASTICITY"].entries()) {
  const test = structuredClone(template); test.id = fixtureId(600+i*10+j); test.evidence.id=fixtureId(700+i*10+j); test.region_id=target;
  test.type=type as "POROSITY"|"ELASTICITY"; test.result={state:"KNOWN",value:type === "POROSITY" ? change.highPorosity ? "HIGH":"MEDIUM":change.lowElasticity?"LOW":"NORMAL"};
  page.physical_tests.items.push(test);
 }
 const base = page.observations.items[0];
 if (base) for(let i=0;i<(change.historyCount??0);i++) {
  const evidence=structuredClone(base.evidence); evidence.id=fixtureId(800+i);
  const event: HairSnapshot["history"]["items"][number] = {id:fixtureId(850+i),category:"BLEACH_LIGHTENING",performed_on:{state:"EXACT",value:"2026-09-20"},
   product:{state:"UNKNOWN",value:null},description:"Professionally recorded prior lightening",attributed_salon:null,attributed_professional:null,location_id:null,
   region_ids:change.localized?[page.regions[2]!.id]:[],recorded_at:base.recorded_at,recorded_by:base.recorded_by,supersedes_id:null,evidence};
  page.history.items.push(event);
 }
 return input;
}
