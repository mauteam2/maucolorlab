import { expect,it } from "vitest";
import golden from "../../../../contracts/fixtures/brand-golden.json";
import { brandFixture, orgId } from "@/test/brand-fixtures";
import { fixtureId } from "@/test/confidence-fixtures";
import { evaluateBrandAdapter } from "./engine";
it.each(golden.cases)("golden $name",test=>{
 const {plan,catalog}=brandFixture(),p=catalog.products[0]!,d=catalog.products[1]!,rule=catalog.compatibility[0]!;let organizationId=orgId,allow=false;
 const fact=(key:string)=>p.facts.find(f=>f.key===key)!;
 switch(test.change){
  case "UNVERIFIED":case "DEPRECATED":p.verificationStatus=test.change;break;
  case "INACTIVE":p.active=false;break;
  case "UNKNOWN":case "INCOMPATIBLE":case "NOT_RECOMMENDED":rule.outcome=test.change;break;
  case "NO_RULE":catalog.compatibility=[];break;
  case "UNVERIFIED_DEVELOPER":d.verificationStatus="UNVERIFIED";break;
  case "DEPRECATED_DEVELOPER":d.verificationStatus="DEPRECATED";break;
  case "NO_RATIO":p.facts=p.facts.filter(f=>f.key!=="mixing_ratio");break;
  case "ZERO_RATIO":fact("mixing_ratio").value="0:1";break;
  case "NO_TIME":p.facts=p.facts.filter(f=>f.key!=="processing_minutes");break;
  case "ZERO_TIME":fact("processing_minutes").value=0;break;
  case "NO_STRENGTH":d.facts=[];break;
  case "NO_PIGMENT":p.facts=p.facts.filter(f=>f.key!=="neutral");break;
  case "UNVERIFIED_PIGMENT":fact("neutral").verificationStatus="UNVERIFIED";break;
  case "ZERO_CONFIDENCE":fact("neutral").confidence=0;break;
  case "TONE_MISMATCH":fact("tone_family").value="COPPER";break;
  case "LEVEL_MISMATCH":fact("shade_level").value=6;break;
  case "RESTRICTED_NO_LIFT":rule.outcome="VERIFIED_RESTRICTED";rule.conditions=["NO_LIFT"];break;
  case "RESTRICTION":rule.outcome="VERIFIED_RESTRICTED";rule.restrictions=["Professional technical review required"];break;
  case "RETIRED":case "DRAFT":case "TECHNICAL_REVIEW":case "APPROVED":catalog.release.state=test.change;break;
  case "STAGED":plan.primaryStrategy!.tradeoffs.complexity="STAGED";break;
  case "SALON_ALLOWED":case "SALON_NOT_ALLOWED":case "CROSS_TENANT":
   catalog.release.scope="ORGANIZATION";catalog.release.organizationId=orgId;
   for(const product of catalog.products){product.verificationStatus="SALON_VERIFIED";for(const f of product.facts){f.verificationStatus="SALON_VERIFIED";f.source="SALON_VALIDATED";}}
   rule.source="SALON_VALIDATED";allow=test.change!=="SALON_NOT_ALLOWED";if(test.change==="CROSS_TENANT")organizationId=fixtureId(9999);break;
 }
 const before=JSON.stringify({plan,catalog});
 if(test.status==="FORBIDDEN")expect(()=>evaluateBrandAdapter(plan,catalog,organizationId,allow)).toThrow("FORBIDDEN");
 else {const result=evaluateBrandAdapter(plan,catalog,organizationId,allow);expect(result.status).toBe(test.status);expect(result.recipe?.executable??false).toBe(false);expect(result.recipe!==null).toBe(test.status==="BRAND_READY");expect(evaluateBrandAdapter(plan,catalog,organizationId,allow)).toEqual(result);}
 expect(JSON.stringify({plan,catalog})).toBe(before);
});
