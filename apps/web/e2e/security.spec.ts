import { test } from "./reliability-test";
import { expect,type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { seedAccount,login,expectReady } from "./local-auth";
import { appointmentReadiness } from "@/lib/salon/readiness";
async function api(page:Page,path:string,body?:object){return page.evaluate(async({path,body})=>{const context=await (await fetch("/api/session",{cache:"no-store"})).json();const r=await fetch(path,{method:body?"POST":"GET",cache:"no-store",headers:body?{"Content-Type":"application/json","x-workspace-reference":`${context.context.membership_id}:${context.context.location_id}`}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json(),cache:r.headers.get("cache-control")};},{path,body});}
async function fixture(page:Page){
 const account=await seedAccount(),reception=await account.addMember("reception");await login(page,account);await expectReady(page);
 const client=(await api(page,"/api/clients",{operation:"create",payload:{full_name:"Synthetic security client",phone:"05321114455",request_id:randomUUID()}})).body.data;
 const save=async(command:object)=>{const r=await api(page,"/api/salon",{mutation_id:randomUUID(),...command});expect(r.status,JSON.stringify(r.body)).toBe(200);return r.body.data;};
 await save({type:"HOURS_SAVE",expected_version:0,days:Array.from({length:7},(_,i)=>({day:i+1,closed:false,opens:540,closes:1080}))});
 await save({type:"STAFF_SAVE",membership_id:account.membershipId,expected_version:0,definition:{display_name:"Security specialist",active:true,bookable:true,working_capacity:null,notes:null,competencies:[],shifts:Array.from({length:7},(_,i)=>({day:i+1,type:"SHIFT",starts:540,ends:1080}))}});
 const service=randomUUID();await save({type:"SERVICE_SAVE",id:service,expected_version:0,definition:{name:"Security consultation",category:"COLOR",description:null,organization_wide:false,base_duration_minutes:60,buffer_before_minutes:0,buffer_after_minutes:0,base_price:100,tax_rate:0,tax_inclusive:true,requires_colorlab:true,requires_hair_passport:true,requires_precheck:true,active:true,eligible_membership_ids:[account.membershipId],capabilities:[],resources:[]}});
 const day=new Date();day.setUTCDate(day.getUTCDate()+14);const date=day.toISOString().slice(0,10),id=randomUUID();
 await save({type:"APPOINTMENT_SAVE",id,expected_version:0,definition:{client_id:client.id,service_id:service,staff_membership_id:account.membershipId,local_start:date+"T10:00",utc_offset_minutes:null,scheduled_duration_minutes:null,adjustment_reason:null,notes:null,status:"CONFIRMED"}});
 const financeStart=Date.now();expect((await api(page,"/api/finance")).status).toBe(200);const financeReadMs=Date.now()-financeStart;
 const reportStart=Date.now();expect((await api(page,"/api/reporting?kind=OVERVIEW&period=THIS_MONTH")).status).toBe(200);const reportSummaryMs=Date.now()-reportStart;
 return {account,reception,client,id,date,financeReadMs,reportSummaryMs};
}
test("reception gets only operational preparation; technical APIs, reports, exports and direct URL deny",async({page},info)=>{
 test.setTimeout(150000);const f=await fixture(page);await page.getByRole("button",{name:"Oturumu kapat"}).click();await login(page,f.reception);await expectReady(page);
 const start=Date.now(),r=await api(page,`/api/salon/appointments/${f.id}/readiness`);expect(r.status).toBe(200);const minimal=appointmentReadiness.parse(r.body.data);expect(minimal.preparation_status).toBe("CONSULTATION_REQUIRED");expect(minimal.technical_clearance).toBe(false);expect(r.cache).toContain("no-store");
 await info.attach("phase-9-security-performance",{body:JSON.stringify({reception_projection_ms:Date.now()-start,finance_read_ms:f.financeReadMs,report_summary_ms:f.reportSummaryMs}),contentType:"application/json"});
 for(const path of [`/api/clients/${f.client.id}/hair-passport`,`/api/clients/${f.client.id}/hair-passport/confidence`,`/api/clients/${f.client.id}/hair-passport/risk`,`/api/clients/${f.client.id}/color-plans/${randomUUID()}`,`/api/live-sessions?client_id=${f.client.id}`,"/api/costing?kind=COST_BASIS","/api/costing?kind=COMMISSION_ALL","/api/reporting?kind=TECHNICAL&period=THIS_MONTH"]){const denied=await api(page,path);expect(denied.status,path).toBe(403);expect(denied.body).not.toHaveProperty("data");}
 const report=await api(page,"/api/reporting?kind=OVERVIEW&period=THIS_MONTH");expect(report.status).toBe(200);expect(JSON.stringify(report.body)).not.toMatch(/developer_grams|color_grams|professionalAssessment|recipeDraft/);
 const exported=await api(page,"/api/reporting",{type:"EXPORT",request:{kind:"TECHNICAL",period:"THIS_MONTH"}});expect(exported.status).toBe(403);
 await page.goto("/workspace/appointments");await page.getByLabel("Takvim başlangıcı").fill(f.date);await page.getByRole("button",{name:/10:00 · Synthetic security client/}).click();await page.getByRole("button",{name:"Randevu hazırlığını kontrol et"}).click();await expect(page.getByText("Teknik danışmanlık gerekli.", {exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Teknik ön kontrol",exact:true})).toHaveCount(0);
 await page.screenshot({path:info.outputPath("phase-9-reception.png"),fullPage:true});
 await page.setViewportSize({width:320,height:740});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath("phase-9-reception-320.png"),fullPage:true});
 await page.goto(`/workspace/clients/${f.client.id}/hair-passport`);await expect(page.getByRole("alert")).toBeVisible();await expect(page.getByRole("button",{name:"Hair Passport Oluştur"})).toHaveCount(0);await expect(page.locator("#hp-regions")).toHaveCount(0);await f.account.cleanup();
});
test("foreign appointment UUID and revoked authority never expose readiness",async({page})=>{
 test.setTimeout(120000);const f=await fixture(page),foreign=await seedAccount();await page.getByRole("button",{name:"Oturumu kapat"}).click();await login(page,foreign);await expectReady(page);
 const r=await api(page,`/api/salon/appointments/${f.id}/readiness`);expect(r.status).toBe(404);expect(r.body).not.toHaveProperty("data");await foreign.revoke();const revoked=await api(page,`/api/salon/appointments/${f.id}/readiness`);expect(revoked.status).toBe(403);await f.account.cleanup();await foreign.cleanup();
});
test("security headers and callback destinations resist injection without identity enumeration",async({page})=>{
 const response=await page.goto("/auth/recovery");expect(response?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");expect(response?.headers()["x-content-type-options"]).toBe("nosniff");expect(response?.headers()["cache-control"]).toContain("no-store");
 await page.getByLabel("E-posta",{exact:true}).fill(`unknown-${randomUUID()}@elifora.test`);await page.getByRole("button",{name:"Kurtarma bağlantısı gönder"}).click();await expect(page.getByText("Bu adres için kurtarma mümkünse e-posta gönderilecektir.")).toBeVisible();
 const callback=await page.request.get("/auth/recovery/callback?code=fake&next=https://evil.test",{maxRedirects:0});expect(callback.status()).toBe(307);expect(callback.headers().location).toBe("http://127.0.0.1:4173/sign-in?reason=RECOVERY_INVALID");expect(callback.headers()["referrer-policy"]).toBe("no-referrer");
});
test("provider session revoke rejects an unexpired JWT at the actual Data API boundary",async({page})=>{
 const account=await seedAccount();await login(page,account);await expectReady(page);
 const result=await account.verifyRevokedSessionRejected();expect(result.before).toBe(200);expect(result.after).toBe(401);expect(result.code).toBe("SESSION_EXPIRED");
 const sensitive=await page.request.get("/api/session");expect(sensitive.status()).toBe(401);
 await account.cleanup();
});
