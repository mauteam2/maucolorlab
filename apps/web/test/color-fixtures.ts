import { fixtureId } from "./confidence-fixtures";
import { riskInput, type RiskChange } from "./risk-fixtures";
import { evaluateConfidence } from "@/lib/confidence/engine";
import { evaluateRisk } from "@/lib/risk/engine";
import type { ColorTarget, RegionalColorTarget, TargetDefinition } from "@/lib/color/target";
export function colorFixture(change:RiskChange={},targetChange:Partial<TargetDefinition>={}) {
 const snapshot=riskInput(change),confidence=evaluateConfidence(snapshot),risk=evaluateRisk(snapshot,confidence);
 const regions:RegionalColorTarget[]=snapshot.pages[0]!.regions.filter(r=>r.status === "ACTIVE").map(r=>({regionId:r.id,level:7,toneFamily:"NEUTRAL",mixedFamilies:[],
  warmth:"NEUTRAL",greyPriority:"NONE",liftPriority:"NONE",depositPriority:"NONE",toneIntent:"CHANGE",contrast:"NONE",preserve:false,handling:"STANDARD",correction:"NONE",intermediateLevel:null}));
 const target:ColorTarget={id:fixtureId(4000),seriesId:fixtureId(4001),version:1,previousVersionId:null,clientId:snapshot.pages[0]!.passport.client_id,
  passportId:snapshot.pages[0]!.passport.id,definition:{schemaVersion:1,mode:"UNIFORM_COLOR",globalIntent:"REFRESH",regions,...targetChange},createdAt:snapshot.evaluatedAt,createdBy:fixtureId(7)};
 return {snapshot,confidence,risk,target};
}
