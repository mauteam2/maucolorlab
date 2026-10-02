import { expect,it } from "vitest";
import fixtures from "../../../../contracts/fixtures/color-golden.json";
import { colorFixture } from "@/test/color-fixtures";
import { fixtureId } from "@/test/confidence-fixtures";
import { evaluateConfidence } from "@/lib/confidence/engine";
import { evaluateRisk } from "@/lib/risk/engine";
import type { TargetDefinition } from "./target";
import { evaluateColorPlanning } from "./engine";
import type { RiskChange } from "@/test/risk-fixtures";
type Change={risk?:RiskChange;currentLevel?:number;cosmetic?:boolean;variation?:boolean;extra?:"BANDED_AREA"|"CUSTOM";grey?:"HIGH"|"REGIONAL";mode?:TargetDefinition["mode"];preserveLengths?:boolean;rootLevel?:number;correction?:"REFLECTION";customLevel?:number};
export function scenario(change:Change={},level=7) {
 const i=colorFixture(change.risk,{mode:change.mode??(change.variation||change.extra?"MULTI_REGION_CUSTOM":"UNIFORM_COLOR")}),p=i.snapshot.pages[0]!;
 if(change.variation) {
  // Regional variation requires qualified porosity and elasticity checks, independent of strand evidence.
  const complete=colorFixture({fullTests:true}).snapshot.pages[0]!;
  p.physical_tests.items=complete.physical_tests.items;
 }
 if(change.extra) {
  const source=p.regions[0]!,r=structuredClone(source);r.id=fixtureId(900);r.type=change.extra;r.label="Synthetic specialized region";
  if(r.assessment.state==="ASSESSED"){r.assessment.observation.id=fixtureId(901);r.assessment.observation.region_id=r.id;r.assessment.observation.evidence.id=fixtureId(902);p.observations.items.push(structuredClone(r.assessment.observation));}
  p.regions.push(r);const t=structuredClone(p.physical_tests.items[0]!);t.id=fixtureId(903);t.evidence.id=fixtureId(904);t.region_id=r.id;p.physical_tests.items.push(t);
  i.target.definition.regions.push({...structuredClone(i.target.definition.regions[0]!),regionId:r.id});
 }
 for(const o of p.observations.items) {
  if(change.currentLevel!==undefined)o.perceived_level={state:"KNOWN",value:change.currentLevel};
  if(change.variation&&o.region_id===p.regions[0]!.id)o.perceived_level={state:"KNOWN",value:4};
  if(change.grey)o.grey_ratio={state:"KNOWN",value:change.grey==="HIGH"||o.region_id===p.regions[0]!.id ? .8:.1};
 }
 for(const a of [p.core,...p.regions.map(r=>r.assessment)])if(a.state==="ASSESSED")a.observation=structuredClone(p.observations.items.find(o=>o.id===a.observation.id)!);
 if(change.cosmetic) {
  const history=colorFixture({historyCount:1}).snapshot.pages[0]!.history.items[0]!;history.category="COLOR";p.history.items.push(history);
 }
 for(const r of i.target.definition.regions) {
  r.level=r.regionId===p.regions[0]!.id&&change.rootLevel!==undefined?change.rootLevel:r.regionId===fixtureId(900)&&change.customLevel!==undefined?change.customLevel:level;
  if(change.grey)r.greyPriority="COVER";
  if(change.correction){r.correction=change.correction;r.toneIntent="NEUTRALIZE";}
  if(change.cosmetic){r.correction="DARK_ACCUMULATION";r.intermediateLevel=5;}
  if(change.preserveLengths&&r.regionId!==p.regions[0]!.id)Object.assign(r,{preserve:true,level:null,toneFamily:null,toneIntent:"PRESERVE",warmth:"PRESERVE"});
 }
 i.confidence=evaluateConfidence(i.snapshot);i.risk=evaluateRisk(i.snapshot,i.confidence);return i;
}
it.each(fixtures.cases)("golden $name",test=>{
 const i=scenario(test.change as Change,test.level),result=evaluateColorPlanning(i.snapshot,i.confidence,i.risk,i.target);
 expect(result.status).toBe(test.status);expect(result.feasibility).toBe(test.feasibility);
 expect(result.requiredPhysicalTests).toEqual(expect.arrayContaining(i.risk.requiredPhysicalTests));expect(result.requiredInformation).toEqual(expect.arrayContaining(i.risk.requiredInformation));
 if(test.stage) {
  expect(result.primaryStrategy?.type).toBe("CONSERVATIVE");expect(result.primaryStrategy?.eligibility).toBe("ELIGIBLE_FOR_PLANNING");
  const stages=result.primaryStrategy!.stages;expect(stages.map(s=>s.kind)).toContain(test.stage);expect(stages[0]?.kind).toBe("ASSESS");expect(stages.at(-1)?.kind).toBe("FINALIZE");
  expect(stages.map(s=>s.sequence)).toEqual(stages.map((_,index)=>index+1));expect(stages.filter(s=>s.checkpoint).length).toBeGreaterThan(0);
  expect(result.recipeDraft?.executionStatus).toBe("REQUIRES_BRAND_ADAPTER");expect(result.reasonCodes).toContain("BRAND_ADAPTER_REQUIRED");
  expect(result.regions.map(r=>r.regionId)).toEqual([...i.target.definition.regions.map(r=>r.regionId)].sort());
 }else{expect(result.recipeDraft).toBeNull();expect(result.primaryStrategy).toBeNull();expect(result.reasonCodes).toContain("SAFETY_GATE_BLOCKS_PLANNING");}
 if(test.name==="banded area")expect(result.regions.find(r=>r.regionId===fixtureId(900))?.separateHandling).toBe(true);
 if(test.name==="regional grey differences")expect(result.regions.map(r=>r.naturalBaseSupport)).toEqual([true,false,false]);
 expect(evaluateColorPlanning(i.snapshot,i.confidence,i.risk,i.target)).toEqual(result);
});
