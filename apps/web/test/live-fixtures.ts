import { fixtureId } from "@/test/confidence-fixtures";
import { brandFixture,actorId } from "@/test/brand-fixtures";
import { pilotFixture } from "@/test/pilot-fixtures";
import { evaluateConfidence } from "@/lib/confidence/engine";
import { evaluateRisk } from "@/lib/risk/engine";
import { evaluateColorPlanning } from "@/lib/color/engine";
import { buildControlledRecipe,controlledRecipeOptions } from "@/lib/brand/controlled-engine";
import { createSession,applyCommand,timerElapsed,type Authority } from "@/lib/live/engine";
import { liveCommand,createLiveRequest,livePermissions,type LiveSession } from "@/lib/live/model";
import { draftable,reconcileDraft } from "@/lib/live/offline";
export function liveFixture(){const f=brandFixture(),{packet}=pilotFixture();f.input.target.definition.regions[0]!.level=8;for(const p of f.input.snapshot.pages){for(const a of [p.core,...p.regions.map(r=>r.assessment)])if(a.state==="ASSESSED")a.observation.grey_ratio={state:"KNOWN",value:.9};for(const o of p.observations.items)o.grey_ratio={state:"KNOWN",value:.9};}const confidence=evaluateConfidence(f.input.snapshot),plan=evaluateColorPlanning(f.input.snapshot,confidence,evaluateRisk(f.input.snapshot,confidence),f.input.target),opt=controlledRecipeOptions(plan,packet,f.input.snapshot),candidate=opt.candidates[0]!;
 const result=buildControlledRecipe(plan,packet,f.input.snapshot,{client_id:f.input.target.clientId,plan_id:fixtureId(500),catalog_id:packet.catalog.release.id,product_id:candidate.productId,developer_id:candidate.developerId,color_grams:30,request_id:fixtureId(501),supersedes_id:null},plan.recipeDraft!.id);
 const recipe={id:fixtureId(502),seriesId:fixtureId(503),version:1,supersedesId:null,clientId:f.input.target.clientId,planId:fixtureId(500),catalogId:packet.catalog.release.id,createdAt:plan.evaluatedAt,createdBy:actorId,result};let n=600;
 const a:Authority={actorId,now:"2026-10-04T12:00:00Z",permissions:[...livePermissions],id:()=>fixtureId(n++),recipe,target:f.input.target,sourceToken:"a".repeat(64),risk:{engineVersion:"risk-engine/1.0.0",gate:"PROCEED",fingerprint:"b".repeat(64)}};
 const q=createLiveRequest.parse({mutation_id:fixtureId(504),device_id:fixtureId(505),client_id:recipe.clientId,recipe_id:recipe.id,professional_review:true,review_note:"Personally reviewed verified pilot and customer"});
 return {a,q,s:createSession(q,a,fixtureId(2),fixtureId(1))};}
