import { expect,it } from "vitest";
import { colorFixture } from "@/test/color-fixtures";
import { fixtureId } from "@/test/confidence-fixtures";
import { validateTarget } from "./target";
it("supports complete extensible regional objectives",()=>{
 const input=colorFixture(); expect(validateTarget(input.target.definition,input.snapshot.pages[0]!).issues).toEqual([]);
});
it.each(["missing_level","foreign_region","duplicate","preserve_conflict","uniform_conflict","priority_conflict","intermediate_missing","mixed_invalid","brand_formula"])("rejects %s without guessing target",change=>{
 const input=colorFixture(),definition=input.target.definition,region=definition.regions[0]!;
 if(change === "missing_level") region.level=null;
 if(change === "foreign_region") region.regionId=fixtureId(999);
 if(change === "duplicate") definition.regions.push(structuredClone(region));
 if(change === "preserve_conflict") region.preserve=true;
 if(change === "uniform_conflict") region.level=9;
 if(change === "priority_conflict") {region.liftPriority="HIGH";region.depositPriority="HIGH";}
 if(change === "intermediate_missing") region.correction="BAND";
 if(change === "mixed_invalid") region.toneFamily="MIXED";
 if(change === "brand_formula") Object.assign(region,{shadeCode:"7/1",developerVolume:20});
 expect(validateTarget(definition,input.snapshot.pages[0]!).issues.length).toBeGreaterThan(0);
});
it("missing custom-region objectives are explicit incompleteness",()=>{
 const input=colorFixture({custom:true}); input.target.definition.regions.pop();
 expect(validateTarget(input.target.definition,input.snapshot.pages[0]!).issues.map(i=>i.code)).toContain("TARGET_REGION_MISSING");
});
it("regional order and mixed tone order normalize deterministically",()=>{
 const input=colorFixture({}, {mode:"MULTI_REGION_CUSTOM"}); const r=input.target.definition.regions[0]!; r.toneFamily="MIXED";r.mixedFamilies=["RED","COPPER"];
 const before=validateTarget(input.target.definition,input.snapshot.pages[0]!); input.target.definition.regions.reverse(); r.mixedFamilies.reverse();
 expect(validateTarget(input.target.definition,input.snapshot.pages[0]!)).toEqual(before);
});
