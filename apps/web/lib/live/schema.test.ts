import { it,expect } from "vitest";
import { z } from "zod";
import { readFileSync,writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as model from "./model";
import { liveFixture } from "@/test/live-fixtures";
it("shared live schemas and fixture match runtime boundaries",()=>{
 const schemas=Object.fromEntries(Object.entries({LiveSession:model.liveSession,LiveSessionStep:model.liveStep,LiveBowl:model.liveBowl,LiveTimer:model.liveTimer,LiveCheckpoint:model.liveCheckpoint,LiveUsage:model.liveUsage,LiveDeviation:model.liveDeviation,LiveRiskEvent:model.liveRiskEvent,OutcomeProfile:model.outcomeProfile,CompletionReview:model.completionReview,CreateLiveSession:model.createLiveRequest,LiveSessionCommand:model.liveCommand}).map(([name,schema])=>{const value=z.toJSONSchema(schema,{io:"input",unrepresentable:"any"});delete value.$schema;return [name,value];}));
 const file=resolve("../../contracts/live-session.schemas.json");
 const fixture=resolve("../../contracts/fixtures/live-session-contract.json");
 const f=liveFixture();
 if(process.env.ELIFORA_REGENERATE_LIVE_CONTRACT==="1"){writeFileSync(file,JSON.stringify(schemas,null,2)+"\n");writeFileSync(fixture,JSON.stringify({request:f.q,session:f.s},null,2)+"\n");}
 expect(JSON.parse(readFileSync(file,"utf8"))).toEqual(schemas);
 model.createLiveRequest.parse(JSON.parse(readFileSync(fixture,"utf8")).request);
 model.liveSession.parse(JSON.parse(readFileSync(fixture,"utf8")).session);
});
