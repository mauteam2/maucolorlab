import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { seedAccount, login, expectReady } from "./local-auth";
async function createClient(page: Page) {
 const session=await (await page.request.get("/api/session")).json();
 const headers={origin:"http://127.0.0.1:4173","x-workspace-reference":`${session.context.membership_id}:${session.context.location_id}`};
 const response=await page.request.post("/api/clients",{headers,data:{operation:"create",payload:{full_name:"Sentetik Risk Profili",phone:"05329998866",request_id:randomUUID()}}});
 expect(response.ok(),await response.text()).toBeTruthy(); return {client:(await response.json()).data,headers};
}
test("real risk read stops combined integrity concern and preserves archive, revoked and read-only semantics",async({page})=>{
 test.setTimeout(120000);
 const account=await seedAccount(); await login(page,account); await expectReady(page);
 const {client,headers}=await createClient(page),base=`/api/clients/${client.id}/hair-passport`;
 const create=await page.request.post(base,{headers,data:{request_id:randomUUID()}}); expect(create.ok(),await create.text()).toBeTruthy();
 const initial=await page.request.get(`${base}/risk`); expect(initial.ok(),await initial.text()).toBeTruthy();
 const empty=await initial.json(); expect(empty.data.gate.outcome).toBe("BLOCK_INSUFFICIENT_INFORMATION"); expect(empty.data.gate.canProgress).toBe(false);
 expect(empty.data.dimensions).toHaveLength(8); expect(empty.data.engineVersion).toBe("risk-engine/1.0.0");
 expect(empty.data.confidence.band).toBe("INSUFFICIENT");
 expect(initial.headers()["cache-control"]).toBe("private, no-store"); expect(initial.headers()["x-correlation-id"]).toBe(empty.correlationId);
 for(const [type,value] of [["POROSITY","HIGH"],["ELASTICITY","LOW"]]) {
  const physical=await page.request.post(`${base}/tests`,{headers,data:{request_id:randomUUID(),type,result:{state:"KNOWN",value}}});
  expect(physical.ok(),await physical.text()).toBeTruthy();
 }
 const populated=await page.request.get(`${base}/risk`); expect(populated.ok(),await populated.text()).toBeTruthy();
 const assessment=(await populated.json()).data;
 expect(assessment.overallBand).toBe("CRITICAL"); expect(assessment.gate.outcome).toBe("BLOCK_TECHNICAL_PLANNING");
 expect(assessment.hardStops.some((s:{reasonCodes:string[]})=>s.reasonCodes.includes("COMBINED_INTEGRITY_CONCERN"))).toBe(true);
 expect(assessment.dominantReasons.some((r:{evidenceRefs:{kind:string}[]})=>r.evidenceRefs.some(e=>e.kind === "PHYSICAL_TEST"))).toBe(true);
 expect(assessment.inputFingerprint).not.toBe(empty.data.inputFingerprint);
 const archive=await page.request.post("/api/clients",{headers,data:{operation:"archive",payload:{client_id:client.id,expected_version:client.version,request_id:randomUUID()}}});
 expect(archive.ok(),await archive.text()).toBeTruthy();
 expect((await page.request.get(`${base}/risk`)).status()).toBe(404); expect((await page.request.get(`${base}/risk?include_archived=true`)).status()).toBe(200);
 const assistant=await account.addMember("assistant"); await account.revoke();
 const denied=await page.request.get(`${base}/risk?include_archived=true`); expect(denied.status()).toBe(403); expect(await denied.json()).not.toHaveProperty("data");
 await page.context().clearCookies(); await login(page,assistant); await expectReady(page);
 expect((await page.request.get(`${base}/risk?include_archived=true`)).status()).toBe(200);
});
test("anonymous, foreign tenant and forged risk bypass parameters expose no assessment",async({page,browser})=>{
 test.setTimeout(120000);
 const anonymous=await page.request.get(`/api/clients/${randomUUID()}/hair-passport/risk`); expect(anonymous.status()).toBe(401); expect(await anonymous.json()).not.toHaveProperty("data");
 const account=await seedAccount(); await login(page,account); await expectReady(page);
 const foreignAccount=await seedAccount(), foreignContext=await browser.newContext({baseURL:"http://127.0.0.1:4173"});
 try {
  const foreignPage=await foreignContext.newPage(); await login(foreignPage,foreignAccount); await expectReady(foreignPage);
  const {client:foreign}=await createClient(foreignPage);
  const response=await page.request.get(`/api/clients/${foreign.id}/hair-passport/risk`), missing=await page.request.get(`/api/clients/${randomUUID()}/hair-passport/risk`);
  expect(response.status()).toBe(404); const concealed=await response.json(); expect(concealed.code).toBe((await missing.json()).code); expect(concealed).not.toHaveProperty("data");
  for(const query of ["organization_id=forged","ignoreRisk=true","risk=LOW","confidence=1","evidence=[]","scopeConcern=NONE"]) {
   const denied=await page.request.get(`/api/clients/${foreign.id}/hair-passport/risk?${query}`);
   expect(denied.status()).toBe(400); expect(await denied.json()).not.toHaveProperty("data");
  }
 } finally {await foreignContext.close();}
});
