import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { riskInput } from "@/test/risk-fixtures";
import { fixtureId } from "@/test/confidence-fixtures";
import { evaluateConfidence } from "@/lib/confidence/engine";
import { evaluateRisk } from "./engine";
it("shared examples preserve full explained decisions for permissive, uncertain and blocked profiles", () => {
 const examples = [{}, {highPorosity:true,lowElasticity:true}, {minimal:true}].map(change => {
  const input=riskInput(change); return {data:evaluateRisk(input,evaluateConfidence(input)),correlationId:fixtureId(500)};
 });
 const path=resolve(process.cwd(),"../../contracts/fixtures/risk-results.json");
 if(process.env.ELIFORA_UPDATE_RISK_FIXTURES === "1") writeFileSync(path,JSON.stringify(examples,null,2)+"\n");
 expect(JSON.parse(readFileSync(path,"utf8"))).toEqual(examples);
});
