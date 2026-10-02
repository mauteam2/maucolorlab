import { expect,test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { seedAccount,login,expectReady } from "./local-auth";
test("real target revision, server-signed blocked and normal drafts retain historical authorization",async({page,browser})=>{
 test.setTimeout(180000);const account=await seedAccount();await login(page,account);await expectReady(page);
 const context=(await(await page.request.get("/api/session")).json()).context;
 const headers={origin:"http://127.0.0.1:4173","x-workspace-reference":`${context.membership_id}:${context.location_id}`};
 const create=await page.request.post("/api/clients",{headers,data:{operation:"create",payload:{full_name:"Sentetik Color Engine",phone:"05329997755",request_id:randomUUID()}}});expect(create.ok(),await create.text()).toBeTruthy();
 const client=(await create.json()).data,base=`/api/clients/${client.id}`;
 const hp=await page.request.post(`${base}/hair-passport`,{headers,data:{request_id:randomUUID()}});expect(hp.ok(),await hp.text()).toBeTruthy();
 const snapshot=(await(await page.request.get(`${base}/hair-passport`)).json()).data;
 const definition={schemaVersion:1,mode:"UNIFORM_COLOR",globalIntent:"REFRESH",regions:snapshot.regions.map((r:{id:string})=>({regionId:r.id,level:7,toneFamily:"NEUTRAL",mixedFamilies:[],warmth:"NEUTRAL",greyPriority:"NONE",liftPriority:"NONE",depositPriority:"NONE",toneIntent:"CHANGE",contrast:"NONE",preserve:false,handling:"STANDARD",correction:"NONE",intermediateLevel:null}))};
 const targetRequest={request_id:randomUUID(),definition},targetCreate=await page.request.post(`${base}/color-targets`,{headers,data:targetRequest});expect(targetCreate.ok(),await targetCreate.text()).toBeTruthy();
 const target=(await targetCreate.json()).data;expect(target.version).toBe(1);
 const request={request_id:randomUUID(),target_id:target.id};const blocked=await page.request.post(`${base}/color-plans`,{headers,data:request});expect(blocked.ok(),await blocked.text()).toBeTruthy();
 const blockedPlan=(await blocked.json()).data;expect(blockedPlan.result.status).toBe("REQUIRES_ASSESSMENT");expect(blockedPlan.result.recipeDraft).toBeNull();
 expect(blocked.headers()["cache-control"]).toBe("private, no-store");
 const replay=await page.request.post(`${base}/color-plans`,{headers,data:request});expect((await replay.json()).data.id).toBe(blockedPlan.id);
 const technical={natural_level:{state:"KNOWN",value:6},perceived_level:{state:"KNOWN",value:7},grey_ratio:{state:"KNOWN",value:.2},porosity:{state:"KNOWN",value:"MEDIUM"},elasticity:{state:"KNOWN",value:"NORMAL"},
  thickness:{state:"KNOWN",value:"FINE"},density:{state:"KNOWN",value:"MEDIUM"},cosmetic_color_history:{state:"KNOWN",value:"Professionally reviewed"},bleach_history:{state:"KNOWN",value:"Professionally reviewed"},chemical_history:{state:"KNOWN",value:"Professionally reviewed"}};
 for(const region_id of [null,...snapshot.regions.map((r:{id:string})=>r.id)]) {
  const current=(await(await page.request.get(`${base}/hair-passport`)).json()).data;
  const expected_version=region_id===null?current.passport.version:current.regions.find((r:{id:string})=>r.id===region_id).version;
  const observation=await page.request.post(`${base}/hair-passport/observations`,{headers,data:{request_id:randomUUID(),expected_version,region_id,technical,
   evidence:{source:"PROFESSIONAL_VERIFIED",attestation:"PERSONALLY_ASSESSED",confidence:{state:"KNOWN",value:1}}}});expect(observation.ok(),await observation.text()).toBeTruthy();
  const strand=await page.request.post(`${base}/hair-passport/tests`,{headers,data:{request_id:randomUUID(),region_id,type:"STRAND",result:{state:"KNOWN",value:"Professionally reviewed candidate"}}});expect(strand.ok(),await strand.text()).toBeTruthy();
 }
 const normal=await page.request.post(`${base}/color-plans`,{headers,data:{request_id:randomUUID(),target_id:target.id}});expect(normal.ok(),await normal.text()).toBeTruthy();const plan=(await normal.json()).data;
 expect(plan.result.status).toBe("DRAFT");expect(plan.result.recipeDraft.executionStatus).toBe("REQUIRES_BRAND_ADAPTER");expect(plan.result.recipeDraft.version).toBe(1);expect(plan.result.recipeDraft.parentVersionId).toBeNull();
 for(const field of ["risk","confidence","ignoreRisk","organization_id","evidence","recipeDraft"]) {const denied=await page.request.post(`${base}/color-plans`,{headers,data:{request_id:randomUUID(),target_id:target.id,[field]:{}}});expect(denied.status()).toBe(400);expect(await denied.json()).not.toHaveProperty("data");}
 const revise=await page.request.patch(`${base}/color-targets`,{headers,data:{request_id:randomUUID(),series_id:target.seriesId,expected_version:1,definition:{...definition,regions:definition.regions.map((r:object)=>({...r,level:6}))}}});expect(revise.ok(),await revise.text()).toBeTruthy();expect((await revise.json()).data.previousVersionId).toBe(target.id);
 const stale=await page.request.post(`${base}/color-plans`,{headers,data:{request_id:randomUUID(),target_id:target.id}});expect(stale.status()).toBe(409);
 expect((await(await page.request.get(`${base}/color-targets/${target.id}`)).json()).data.definition.regions[0].level).toBe(7);
 expect((await(await page.request.get(`${base}/color-plans/${plan.id}`)).json()).data.result.metadata.targetVersion).toBe(1);
 const foreign=await seedAccount(),foreignContext=await browser.newContext({baseURL:"http://127.0.0.1:4173"});
 try {const fp=await foreignContext.newPage();await login(fp,foreign);await expectReady(fp);const denied=await fp.request.get(`${base}/color-plans/${plan.id}`);expect(denied.status()).toBe(404);expect(await denied.json()).not.toHaveProperty("data");}finally{await foreignContext.close();}
 const assistant=await account.addMember("assistant");await account.revoke();expect((await page.request.get(`${base}/color-plans/${plan.id}`)).status()).toBe(403);
 await page.context().clearCookies();await login(page,assistant);await expectReady(page);expect((await page.request.get(`${base}/color-plans/${plan.id}`)).status()).toBe(200);
 const session=(await(await page.request.get("/api/session")).json()).context;const assistantHeaders={...headers,"x-workspace-reference":`${session.membership_id}:${session.location_id}`};
 expect((await page.request.post(`${base}/color-plans`,{headers:assistantHeaders,data:{request_id:randomUUID(),target_id:target.id}})).status()).toBe(403);
 await page.context().clearCookies();expect((await page.request.get(`${base}/color-plans/${plan.id}`)).status()).toBe(401);
});
