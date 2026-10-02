import { expect,it } from "vitest";
import { colorFixture } from "@/test/color-fixtures";
import { evaluateConfidence } from "@/lib/confidence/engine";
import { evaluateRisk } from "@/lib/risk/engine";
import { canonical } from "@/lib/confidence/input";
import { evaluateColorPlanning } from "./engine";
import { colorPlanning } from "./model";
import { fixtureId } from "@/test/confidence-fixtures";
const evaluate=(input:ReturnType<typeof colorFixture>)=>evaluateColorPlanning(input.snapshot,input.confidence,input.risk,input.target);
const fresh=(input:ReturnType<typeof colorFixture>)=>{input.confidence=evaluateConfidence(input.snapshot);input.risk=evaluateRisk(input.snapshot,input.confidence);return input;};
it("same-level tone planning creates an immutable non executable recipe",()=>{
 const result=evaluate(colorFixture());expect(result.feasibility).toBe("DIRECT");expect(result.recipeDraft).toMatchObject({version:1,parentVersionId:null,origin:"ENGINE",executionStatus:"REQUIRES_BRAND_ADAPTER"});
 expect(result.primaryStrategy?.stages.map(s=>s.kind)).toContain("TONE");expect(colorPlanning.safeParse(result).success).toBe(true);
});
it.each([8,9,10,6,4])( "level %s uses controlled delta and stages",level=>{
 const input=colorFixture();input.target.definition.regions.forEach(r=>r.level=level);const result=evaluate(input);
 expect(result.regions[0]?.actions).toContain(level>7?level===8?"LIGHTEN_SMALL":"LIGHTEN_MODERATE":"DARKEN");
 expect(result.recipeDraft?.executionStatus).toBe("REQUIRES_BRAND_ADAPTER");
 if(level===4)expect(result.primaryStrategy?.stages.map(s=>s.kind)).toContain("FILL_PREPIGMENT");
});
it("major lift provides conservative mult-session and qualified partial progress",()=>{
 const input=colorFixture();for(const o of input.snapshot.pages[0]!.observations.items)o.perceived_level={state:"KNOWN",value:4};
 for(const a of [input.snapshot.pages[0]!.core,...input.snapshot.pages[0]!.regions.map(r=>r.assessment)])if(a.state==="ASSESSED")a.observation.perceived_level={state:"KNOWN",value:4};
 input.target.definition.regions.forEach(r=>r.level=9);const result=evaluate(fresh(input));expect(result.feasibility).toBe("MULTI_SESSION");
 expect(result.primaryStrategy?.sessions.min).toBe(2);expect(result.alternatives.map(s=>s.type)).toContain("MULTI_SESSION");
 const partial=result.alternatives.find(s=>s.type==="SINGLE_SESSION_PROGRESS");expect(partial?.tradeoffs.targetAccuracy).toBe("PARTIAL_PROGRESS");
});
it.each([{allUnknown:true},{lowElasticity:true,highPorosity:true,fullTests:true},{missingTests:true},{staleTests:true},{lowConfidence:true},{bleachUnknown:true},{imported:true}])("gate %j cannot produce a normal draft",change=>{
 const input=colorFixture(change),result=evaluate(input);expect(input.risk.gate.canProgress).toBe(false);expect(result.recipeDraft).toBeNull();expect(result.primaryStrategy).toBeNull();expect(result.alternatives).toEqual([]);
 expect(result.requiredPhysicalTests).toEqual(input.risk.requiredPhysicalTests);expect(result.requiredInformation).toEqual(input.risk.requiredInformation);
});
it.each(["NEUTRALIZE","ENHANCE"] as const)("controlled %s tone intent",toneIntent=>{
 const input=colorFixture();input.target.definition.regions.forEach(r=>r.toneIntent=toneIntent);expect(evaluate(input).regions[0]?.actions).toContain(toneIntent==="NEUTRALIZE"?"NEUTRALIZE":"ENHANCE_REFLECTION");
});
it("incomplete correction returns target issues instead of guessing",()=>{
 const input=colorFixture();input.target.definition.regions[0]!.correction="BAND";const result=evaluate(input);
 expect(result.status).toBe("REQUIRES_ASSESSMENT");expect(result.targetIssues.map(i=>i.code)).toContain("TARGET_INTERMEDIATE_REQUIRED");expect(result.recipeDraft).toBeNull();
});
it("regional band correction retains intermediate checkpoint",()=>{
 const input=colorFixture({}, {mode:"COLOR_CORRECTION"});const r=input.target.definition.regions[0]!;r.correction="BAND";r.intermediateLevel=6;
 const result=evaluate(input);expect(result.feasibility).toBe("MULTI_STAGE");expect(result.primaryStrategy?.stages.some(s=>s.kind==="REDUCE_CORRECT"&&s.regionIds.includes(r.regionId))).toBe(true);
 expect(result.regions.find(p=>p.regionId===r.regionId)?.separateHandling).toBe(true);
});
it("porous ends are planned after other regions with assessment checkpoint",()=>{
 const input=colorFixture({highPorosity:true,fullTests:true}),result=evaluate(input);expect(result.status).toBe("DRAFT");
 const ends=result.regions.find(r=>r.porousEndsLater)!;expect(ends).toBeDefined();const stages=result.primaryStrategy!.stages;
 expect(stages.find(s=>s.kind==="ENDS_APPLICATION")!.sequence).toBeGreaterThan(stages.find(s=>s.kind==="ROOT_APPLICATION")!.sequence);
 expect(stages.some(s=>s.kind==="REASSESS"&&s.regionIds.includes(ends.regionId))).toBe(true);
});
it("grey ratio is regional; verified high coverage flags generic natural support",()=>{
 const input=colorFixture({}, {mode:"GREY_COVERAGE"});input.target.definition.regions.forEach(r=>r.greyPriority="COVER");
 for(const o of input.snapshot.pages[0]!.observations.items)o.grey_ratio={state:"KNOWN",value:.7};
 for(const a of [input.snapshot.pages[0]!.core,...input.snapshot.pages[0]!.regions.map(r=>r.assessment)])if(a.state==="ASSESSED")a.observation.grey_ratio={state:"KNOWN",value:.7};
 expect(evaluate(fresh(input)).regions.every(r=>r.naturalBaseSupport)).toBe(true);
});
it("previously lightened region is separate without reading narrative chemistry",()=>{
 const input=colorFixture({historyCount:1,localized:true});expect(evaluate(input).regions.some(r=>r.reasonCodes.includes("PREVIOUS_LIGHTENING_LIMITS_PROGRESS"))).toBe(true);
});
it("preserved lengths get no application stages",()=>{
 const input=colorFixture({}, {mode:"ROOT_REFRESH"});for(const r of input.target.definition.regions.slice(1))Object.assign(r,{preserve:true,level:null,toneFamily:null,toneIntent:"PRESERVE",warmth:"PRESERVE"});
 const result=evaluate(input);expect(result.primaryStrategy?.stages.filter(s=>s.kind.includes("APPLICATION"))).toHaveLength(1);
});
it("regional dimensional objectives remain distinct",()=>{
 const input=colorFixture({}, {mode:"DIMENSIONAL_COLOR"});input.target.definition.regions[1]!.level=6;input.target.definition.regions[1]!.contrast="SOFT";
 expect(evaluate(input).regions.map(r=>r.delta)).toEqual([0,-1,0]);
});
it("target dependent lightening requires a fresh qualified strand test",()=>{
 const input=colorFixture();const page=input.snapshot.pages[0]!;page.physical_tests.items=[];
 // Existing Risk is authoritative even if the target-specific check would also require testing.
 const result=evaluate(fresh(input));expect(result.recipeDraft).toBeNull();expect(result.status).toBe("REQUIRES_TEST");
});
it("a target requiring lift adds a strand check even when upstream Risk permits planning",()=>{
 const input=colorFixture();input.snapshot.pages[0]!.physical_tests.items.forEach(t=>{t.type="POROSITY";t.result={state:"KNOWN",value:"MEDIUM"};});
 fresh(input);expect(input.risk.gate.canProgress).toBe(true);expect(input.risk.requiredPhysicalTests).toEqual([]);
 input.target.definition.regions.forEach(r=>r.level=8);const result=evaluate(input);
 expect(result.status).toBe("REQUIRES_TEST");expect(result.recipeDraft).toBeNull();expect(result.requiredPhysicalTests.every(t=>t.type==="STRAND"&&t.status==="MISSING")).toBe(true);
});
it.each(["confidence","risk","target"] as const)("rejects mismatched %s source binding",part=>{
 const input=colorFixture();if(part==="target")input.target.passportId=fixtureId(999);else input[part].inputFingerprint="0".repeat(64);
 expect(()=>evaluate(input)).toThrow("COLOR_INPUT_INVALID");
});
it("canonical region order preserves deterministic ids and output",()=>{
 const input=colorFixture(),before=evaluate(input);input.target.definition.regions.reverse();expect(canonical(evaluate(input))).toBe(canonical(before));
});
it("source descriptions never become formula output",()=>{
 const input=colorFixture();for(const o of input.snapshot.pages[0]!.observations.items){o.tone={state:"KNOWN",value:"7/1 + 8/0 with 20 vol at 1:1.5"};}
 for(const a of [input.snapshot.pages[0]!.core,...input.snapshot.pages[0]!.regions.map(r=>r.assessment)])if(a.state==="ASSESSED")a.observation.tone={state:"KNOWN",value:"7/1 + 8/0 with 20 vol at 1:1.5"};
 expect(JSON.stringify(evaluate(fresh(input)))).not.toMatch(/20 vol|1:1\.5|7\/1|grams|developerVolume|processingMinutes/);
});
it("100 deterministic in-memory evaluations complete within interactive budget",()=>{
 const input=colorFixture(),start=performance.now();for(let i=0;i<100;i++)evaluate(input);expect(performance.now()-start).toBeLessThan(5000);
});
