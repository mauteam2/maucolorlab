import { expect,it } from "vitest";
import matrix from "../../../../contracts/fixtures/color-pilot-matrix.json";
import { colorFixture } from "@/test/color-fixtures";
import { evaluateConfidence } from "@/lib/confidence/engine";
import { evaluateRisk } from "@/lib/risk/engine";
import type { RiskChange } from "@/test/risk-fixtures";
import { evaluateColorPlanning } from "./engine";
import { familyPatch, families, presets, presetRegion } from "./taxonomy";
import { interpretTarget } from "./interpretation";
import { colorPlanning } from "./model";
import { targetDefinition } from "./target";
import { mkdirSync,writeFileSync } from "node:fs";
import { join } from "node:path";
import { pilotFixture } from "@/test/pilot-fixtures";
import { evaluatePilotCandidates } from "@/lib/brand/pilot";
type Case={id:string;family:string;level:number;risk?:RiskChange;current?:number;grey?:boolean;variation?:boolean;history?:string;correction?:string;expected:string;feasibility?:string;noMapping?:boolean};
it.each(matrix.cases as Case[])("pilot matrix $id",c=>{
 const i=colorFixture(c.risk,{mode:c.variation?"MULTI_REGION_CUSTOM":c.correction?"COLOR_CORRECTION":c.grey?"GREY_COVERAGE":"UNIFORM_COLOR"}),p=i.snapshot.pages[0]!;
 for(const o of p.observations.items){if(c.current)o.perceived_level={state:"KNOWN",value:c.current};if(c.grey)o.grey_ratio={state:"KNOWN",value:.8};if(c.variation&&o.region_id===p.regions[0]!.id)o.perceived_level={state:"KNOWN",value:4};}
 for(const a of [p.core,...p.regions.map(r=>r.assessment)])if(a.state==="ASSESSED")a.observation=structuredClone(p.observations.items.find(o=>o.id===a.observation.id)!);
 if(c.history){const h=colorFixture({historyCount:1}).snapshot.pages[0]!.history.items[0]!;h.category="COLOR";p.history.items.push(h);}
 for(const r of i.target.definition.regions){Object.assign(r,{level:c.level,...familyPatch(c.family)});if(c.grey)r.greyPriority="COVER";if(c.correction){r.correction="BAND";r.intermediateLevel=6;}}
 i.confidence=evaluateConfidence(i.snapshot);i.risk=evaluateRisk(i.snapshot,i.confidence);
 if(c.risk?.outside){const o=p.observations.items[0]!;i.risk=evaluateRisk(i.snapshot,i.confidence,{state:"DECLARED_OUTSIDE_COSMETIC_SCOPE",evidenceRefs:[{kind:"OBSERVATION",id:o.id,evidenceId:o.evidence.id}]});}
 const r=evaluateColorPlanning(i.snapshot,i.confidence,i.risk,i.target);
 expect(r.engineVersion).toBe(matrix.modelVersion);expect(r.targetInterpretation).toEqual(interpretTarget(i.target.definition));
 expect(r.confidenceBand).toBe(i.confidence.band);expect(r.riskBand).toBe(i.risk.overallBand);
 if(c.expected==="BLOCKED"){expect(r.status).not.toBe("DRAFT");expect(r.recipeDraft).toBeNull();expect(r.safetyGate.canProgress).toBe(false);}else expect(r.status).toBe(c.expected);
 if(c.feasibility)expect(r.feasibility).toBe(c.feasibility);
 if(c.variation){expect(r.regions.map(r=>r.currentLevel)).toContain(4);expect(r.regions.map(r=>r.currentLevel)).toContain(7);}
 if(c.correction)expect(r.regions.every(r=>r.separateHandling)).toBe(true);
 expect(r.requiredPhysicalTests).toEqual(expect.arrayContaining(i.risk.requiredPhysicalTests));
 if(c.noMapping){const {packet}=pilotFixture();expect(evaluatePilotCandidates(r,packet).candidates).toEqual([]);}
 expect(JSON.stringify(r)).not.toMatch(/developerGrams|processingMinutes|pigmentConcentration/);
 expect(evaluateColorPlanning(i.snapshot,i.confidence,i.risk,i.target)).toEqual(r);
});
it.each(presets)("preset $id is canonical target intent, no hidden engine branch",p=>{
 const i=colorFixture();i.target.definition.regions=i.target.definition.regions.map(r=>presetRegion(p.id,r));
 expect(targetDefinition.safeParse(i.target.definition).success).toBe(true);
 expect(i.target.definition.regions.every(r=>r.level===p.level)).toBe(true);
 expect(i.target.definition).not.toHaveProperty("preset");expect(i.target.definition).not.toHaveProperty("manufacturerCode");
 expect(interpretTarget(i.target.definition).numericPigmentStrength).toBe("UNKNOWN");
});
it.each(families)("$id cannot bypass unknown or high risk",f=>{
 for(const risk of [{allUnknown:true},{highPorosity:true,lowElasticity:true,fullTests:true}]){
 const i=colorFixture(risk);i.target.definition.regions.forEach(r=>Object.assign(r,familyPatch(f.id)));
 const r=evaluateColorPlanning(i.snapshot,i.confidence,i.risk,i.target);expect(r.recipeDraft).toBeNull();expect(r.primaryStrategy).toBeNull();
 }
});
it("historical 1.0 plan reads without rewriting or pretending new interpretation existed",()=>{
 const i=colorFixture(),r=evaluateColorPlanning(i.snapshot,i.confidence,i.risk,i.target),old=JSON.parse(JSON.stringify(r));
 old.engineVersion=old.metadata.colorVersion="color-engine/1.0.0";old.primaryStrategy.engineVersion="color-engine/1.0.0";
 old.recipeDraft.strategy.engineVersion=old.recipeDraft.metadata.colorVersion="color-engine/1.0.0";
 delete old.targetInterpretation;delete old.confidenceBand;delete old.riskBand;
 const bytes=JSON.stringify(old);expect(colorPlanning.parse(old).engineVersion).toBe("color-engine/1.0.0");expect(JSON.stringify(old)).toBe(bytes);
 expect(colorPlanning.safeParse({...old,engineVersion:"color-engine/1.1.0"}).success).toBe(false);
});
it("measures interpretation, full evaluation and brand mapping without omitting safety",()=>{
 const i=colorFixture(),{packet,plan:pilotPlan}=pilotFixture(),samples=20;
 let start=performance.now();for(let n=0;n<samples;n++)interpretTarget(i.target.definition);const interpretation=(performance.now()-start)/samples;
 start=performance.now();for(let n=0;n<samples;n++)evaluateColorPlanning(i.snapshot,i.confidence,i.risk,i.target);const evaluation=(performance.now()-start)/samples;
 start=performance.now();for(let n=0;n<samples;n++)evaluatePilotCandidates(pilotPlan,packet);const mapping=(performance.now()-start)/samples;
 expect(evaluatePilotCandidates(pilotPlan,packet).status).toBe("CANDIDATES_FOR_REVIEW");
 const metrics={samples,target_interpretation_mean_ms:interpretation,color_engine_evaluation_mean_ms:evaluation,brand_adapter_mapping_mean_ms:mapping};
 expect(Object.values(metrics).every(v=>Number.isFinite(v)&&v>=0)).toBe(true);
 if(process.env.RUNNER_TEMP){mkdirSync(process.env.RUNNER_TEMP,{recursive:true});writeFileSync(join(process.env.RUNNER_TEMP,"color-pilot-engine-performance.json"),JSON.stringify(metrics));}
 console.info("Color pilot synthetic performance",JSON.stringify(metrics));
});
