import { expect,it } from "vitest";
import { colorFixture } from "@/test/color-fixtures";
import { fixtureId } from "@/test/confidence-fixtures";
import { evaluateColorPlanning } from "./engine";
import { colorPlanning } from "./model";
import { evaluateRisk } from "@/lib/risk/engine";
const evaluate=(i:ReturnType<typeof colorFixture>)=>evaluateColorPlanning(i.snapshot,i.confidence,i.risk,i.target);
it("more ambitious lift cannot reduce session complexity without new evidence",()=>{
 const i=colorFixture();const counts=[];for(const level of [7,8,9,10]){i.target.definition.regions.forEach(r=>r.level=level);counts.push(evaluate(i).primaryStrategy!.sessions.min);}expect(counts).toEqual([...counts].sort((a,b)=>a-b));
});
it("target revision changes fingerprints and preserves original immutable output",()=>{
 const i=colorFixture(),old=evaluate(i);i.target={...i.target,id:fixtureId(8000),version:2,previousVersionId:i.target.id,definition:{...i.target.definition,regions:i.target.definition.regions.map(r=>({...r,level:6}))}};
 const next=evaluate(i);expect(next.metadata.targetFingerprint).not.toBe(old.metadata.targetFingerprint);expect(next.recipeDraft?.id).not.toBe(old.recipeDraft?.id);expect(old.recipeDraft?.target.version).toBe(1);
});
it("foreign target regions cannot enter strategy or recipe",()=>{
 const i=colorFixture();i.target.definition.regions[0]!.regionId=fixtureId(999);const result=evaluate(i);expect(result.recipeDraft).toBeNull();expect(result.regions).toEqual([]);expect(result.targetIssues.map(x=>x.code)).toContain("TARGET_REGION_INVALID");
});
it("UNKNOWN is retained and never converted into an assumed current state",()=>{
 const i=colorFixture({allUnknown:true}),result=evaluate(i);expect(result.recipeDraft).toBeNull();expect(result.regions).toEqual([]);expect(result.requiredInformation.length).toBeGreaterThan(0);
});
it("NOT_APPLICABLE integrity does not create UNKNOWN test requirements",()=>{
 const i=colorFixture({integrityNA:true}),result=evaluate(i);expect(result.status).toBe("DRAFT");expect(result.requiredPhysicalTests.filter(t=>t.type!=="STRAND")).toEqual([]);
});
it("Risk requirements and regional concerns survive the draft without global averaging",()=>{
 const i=colorFixture({historyCount:1,localized:true}),result=evaluate(i);expect(result.recipeDraft?.strategy.requiredPhysicalTests).toEqual(expect.arrayContaining(i.risk.requiredPhysicalTests));
 const ends=i.snapshot.pages[0]!.regions.find(r=>r.type==="ENDS")!.id;expect(result.regions.find(r=>r.regionId===ends)?.separateHandling).toBe(true);
 expect(result.primaryStrategy?.riskConsiderations).toEqual(i.risk.dominantReasons);
});
it("outside scope cannot create any strategy",()=>{
 const i=colorFixture(),ref=i.confidence.domains.flatMap(d=>d.fields).flatMap(f=>f.evidenceRefs)[0]!;
 i.risk=evaluateRisk(i.snapshot,i.confidence,{state:"DECLARED_OUTSIDE_COSMETIC_SCOPE",evidenceRefs:[ref]});const result=evaluate(i);expect(result.feasibility).toBe("BLOCKED_BY_SAFETY_GATE");expect(result.recipeDraft).toBeNull();expect(result.alternatives).toEqual([]);
});
it("forged executable status and formula fields fail closed at result boundary",()=>{
 const result=evaluate(colorFixture());expect(colorPlanning.safeParse({...result,recipeDraft:{...result.recipeDraft,executionStatus:"EXECUTABLE"}}).success).toBe(false);
 expect(colorPlanning.safeParse({...result,recipeDraft:{...result.recipeDraft,grams:50}}).success).toBe(false);
});
it("a progressing gate cannot suppress supplied hard stops",()=>{
 const i=colorFixture({highPorosity:true,lowElasticity:true});i.risk.gate={outcome:"CONTINUE_TECHNICAL_PLANNING",canProgress:true,reasonCodes:["NO_ESCALATING_STRUCTURED_FACT"]};expect(()=>evaluate(i)).toThrow("COLOR_INPUT_INVALID");
});
