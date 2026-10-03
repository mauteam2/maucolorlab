import { colorFixture } from "./color-fixtures";
import { fixtureId } from "./confidence-fixtures";
import { evaluateConfidence } from "@/lib/confidence/engine";
import { evaluateRisk } from "@/lib/risk/engine";
import { evaluateColorPlanning } from "@/lib/color/engine";
import { catalogPacket, type Fact } from "@/lib/brand/model";
export const brandId=fixtureId(8000),orgId=fixtureId(8001),actorId=fixtureId(7);
export function brandFixture(){
 const i=colorFixture({fullTests:true},{mode:"ROOT_REFRESH"});
 for(const r of i.target.definition.regions.slice(1))Object.assign(r,{preserve:true,level:null,toneFamily:null,toneIntent:"PRESERVE",warmth:"PRESERVE"});
 i.confidence=evaluateConfidence(i.snapshot);i.risk=evaluateRisk(i.snapshot,i.confidence);
 const plan=evaluateColorPlanning(i.snapshot,i.confidence,i.risk,i.target);
 const fact=(key:Fact["key"],value:Fact["value"],unit:Fact["unit"]):Fact=>({key,value,unit,source:"MANUFACTURER_DOCUMENTATION",verificationStatus:"ELIFORA_VERIFIED",sourceReference:"TEST_ONLY_SYNTHETIC_DOCUMENT",version:1,verifiedBy:actorId,verifiedAt:i.snapshot.evaluatedAt,confidence:1});
 const base={version:1,catalogId:brandId,brandId:fixtureId(8002),lineId:fixtureId(8003),professionalCategory:"SYNTHETIC_TEST_ONLY",countryRegion:null,manufacturerSourceReference:"TEST_ONLY_SYNTHETIC_DOCUMENT",verificationStatus:"ELIFORA_VERIFIED",active:true,verifiedBy:actorId,verifiedAt:i.snapshot.evaluatedAt,pigmentVectorVersion:"pigment-vector/1.0.0"};
 const catalog=catalogPacket.parse({release:{id:brandId,version:1,scope:"GLOBAL",organizationId:null,state:"PUBLISHED",versionFingerprint:"a".repeat(64)},brands:[{id:base.brandId,catalogId:brandId,displayName:"Test-only fictional brand"}],lines:[{id:base.lineId,catalogId:brandId,brandId:base.brandId,displayName:"Test-only line"}],products:[
 {...base,id:fixtureId(8004),seriesId:fixtureId(8005),manufacturerCode:"TEST-SHADE",displayName:"Synthetic shade, not a real product",productType:"SHADE",facts:[fact("shade_level",7,"LEVEL"),fact("tone_family","NEUTRAL","CATEGORY"),fact("level_effect",0,"SOURCE_SCALE"),fact("neutral",1,"SOURCE_SCALE"),fact("opacity",1,"SOURCE_SCALE"),fact("deposit_strength",1,"SOURCE_SCALE"),fact("deposit_capability",true,"BOOLEAN"),fact("mixing_ratio","1:1","RATIO"),fact("processing_minutes",1,"MINUTES")]},
 {...base,id:fixtureId(8006),seriesId:fixtureId(8007),manufacturerCode:"TEST-DEVELOPER",displayName:"Synthetic developer, not a real product",productType:"DEVELOPER",facts:[fact("developer_strength",1,"PERCENT")]},
 ],compatibility:[{id:fixtureId(8008),catalogId:brandId,version:1,productId:fixtureId(8004),developerId:fixtureId(8006),technique:"ROOT_REFRESH",applicationContext:"STANDARD",mixingRatio:"1:1",outcome:"VERIFIED_ALLOWED",reason:"Synthetic fixture, no manufacturer claim",source:"MANUFACTURER_DOCUMENTATION",sourceReference:"TEST_ONLY_SYNTHETIC_DOCUMENT",verifiedBy:actorId,verifiedAt:i.snapshot.evaluatedAt,conditions:[],restrictions:[]}]});
 return {plan,catalog,organizationId:orgId,input:i};
}
