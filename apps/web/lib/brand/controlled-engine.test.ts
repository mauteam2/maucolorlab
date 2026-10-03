import { expect, it } from "vitest";
import { pilotFixture } from "@/test/pilot-fixtures";
import { brandFixture } from "@/test/brand-fixtures";
import { fixtureId } from "@/test/confidence-fixtures";
import { controlledRecipeOptions, buildControlledRecipe } from "./controlled-engine";
import { controlledCreateRequest, controlledRecipe } from "./controlled-model";

function setup(ratio=.9){
 const {plan,packet}=pilotFixture(),input=brandFixture().input.snapshot;
 for(const page of input.pages){
  for(const assessment of [page.core,...page.regions.map(r=>r.assessment)])if(assessment.state==="ASSESSED")assessment.observation.grey_ratio={state:"KNOWN",value:ratio};
  for(const observation of page.observations.items)observation.grey_ratio={state:"KNOWN",value:ratio};
 }
 const options=controlledRecipeOptions(plan,packet,input),candidate=options.candidates[0];
 const request={request_id:fixtureId(50001),client_id:fixtureId(50002),plan_id:fixtureId(50003),catalog_id:packet.catalog.release.id,
  product_id:candidate?.productId??fixtureId(50004),developer_id:candidate?.developerId??fixtureId(50005),color_grams:30.15,supersedes_id:null};
 return {plan,packet,input,options,request};
}
it("90% boundary allows only the documented 9% candidate",()=>{const {options}=setup();expect(options.status).toBe("OPTIONS_FOR_REVIEW");expect(options.candidates.length).toBeGreaterThan(0);expect(options.candidates.every(c=>c.developerName.includes("9%"))).toBe(true);});
it("above 90% deposit selects only the documented 6% candidates",()=>{const {options}=setup(.9001);expect(options.status).toBe("OPTIONS_FOR_REVIEW");expect(options.candidates.every(c=>c.developerName.includes("6%"))).toBe(true);});
it.each([.01,.1,1,30.15,1000])("exact ratio arithmetic preserves professional input %s",grams=>{const f=setup();const r=buildControlledRecipe(f.plan,f.packet,f.input,{...f.request,color_grams:grams},f.plan.recipeDraft!.id);expect(r.colorGrams).toBe(grams);expect(r.developerGrams).toBe(grams);expect(r.totalGrams).toBe(Math.round(grams*100)*2/100);expect(r.executable).toBe(false);expect(r.professionalReviewRequired).toBe(true);expect(r.selected.processingMinutes).toEqual({min:30,max:45});expect(r.selectionOrigin).toBe("PROFESSIONAL_INPUT");});
it.each([0,-1,1000.01,.001,Number.NaN,Infinity])("invalid technical quantity %s cannot create a draft",color_grams=>{expect(controlledCreateRequest.safeParse({...setup().request,color_grams}).success).toBe(false);});
it.each(["white_ratio","verified","developer_grams","processing_minutes","executable","organization_id"])("client cannot forge %s",field=>{expect(controlledCreateRequest.safeParse({...setup().request,[field]:true}).success).toBe(false);});
it("unverified white-hair observation blocks professional selection",()=>{const f=setup();for(const page of f.input.pages){for(const a of [page.core,...page.regions.map(r=>r.assessment)])if(a.state==="ASSESSED"){a.observation.evidence.source="AI_ESTIMATE";a.observation.evidence.verified_by=null;}for(const o of page.observations.items){o.evidence.source="AI_ESTIMATE";o.evidence.verified_by=null;}}expect(controlledRecipeOptions(f.plan,f.packet,f.input).status).toBe("ASSESSMENT_REQUIRED");});
it("unknown white ratio blocks instead of assuming the developer condition",()=>{const f=setup();for(const page of f.input.pages){for(const a of [page.core,...page.regions.map(r=>r.assessment)])if(a.state==="ASSESSED")a.observation.grey_ratio={state:"UNKNOWN",value:null};for(const o of page.observations.items)o.grey_ratio={state:"UNKNOWN",value:null};}expect(controlledRecipeOptions(f.plan,f.packet,f.input).status).toBe("ASSESSMENT_REQUIRED");});
it("wrong developer for measured white ratio cannot produce a recipe",()=>{const f=setup();const wrong=f.packet.catalog.products.find(p=>p.productType==="DEVELOPER"&&p.displayName.includes("6%"))!;expect(()=>buildControlledRecipe(f.plan,f.packet,f.input,{...f.request,developer_id:wrong.id},f.plan.recipeDraft!.id)).toThrow("CONTROLLED_RECIPE_CONTEXT_INVALID");});
it("unsafe or retired data cannot be made ready by entered grams",()=>{const f=setup();f.plan.safetyGate.canProgress=false;expect(controlledRecipeOptions(f.plan,f.packet,f.input).status).toBe("BLOCKED_BY_SAFETY");f.plan.safetyGate.canProgress=true;f.packet.catalog.release.state="RETIRED";expect(controlledRecipeOptions(f.plan,f.packet,f.input).status).toBe("CATALOG_UNAVAILABLE");});
it("forged computed arithmetic or execution fields fail result validation",()=>{const f=setup();const r=buildControlledRecipe(f.plan,f.packet,f.input,f.request,f.plan.recipeDraft!.id);for(const change of [{executable:true},{professionalReviewRequired:false},{developerGrams:31},{totalGrams:1},{totalGrams:60.3001}])expect(controlledRecipe.safeParse({...r,...change}).success).toBe(false);});
