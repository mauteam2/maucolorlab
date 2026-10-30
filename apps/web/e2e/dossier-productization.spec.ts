import { test,expect,type Page,type TestInfo } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { colorPilotFixture } from "./color-pilot-flow";
import { controlledRecipeJourney } from "./controlled-recipe-flow";
import { login,expectReady } from "./local-auth";
async function capture(page:Page,info:TestInfo,state:string,width:number,anchor?:string){
 const height=width===1440?1000:width===390?844:900;
 await page.setViewportSize({width,height});await expect(page.locator("main h1").first()).toBeVisible();
 await page.evaluate(async()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();await document.fonts.ready;window.scrollTo(0,0);await new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())));});
 if(anchor)await page.locator(anchor).scrollIntoViewIfNeeded();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${state} ${width}px overflow`).toBe(true);
 await expect(page.locator('.salon-sidebar [aria-current="page"]')).toHaveCount(1);await expect(page.locator('.salon-sidebar [href="/workspace/clients"]')).toHaveAttribute("aria-current","page");
 const name=`ui-ux-pass3-${state}-${width}`;await page.screenshot({path:info.outputPath(`${name}.png`)});await page.screenshot({path:info.outputPath(`${name}-full.png`),fullPage:true});
 await writeFile(info.outputPath(`${name}.json`),JSON.stringify({source:"REAL_AUTHENTICATED_DISPOSABLE_SUPABASE",appSha:process.env.GITHUB_SHA??"local-uncommitted",runId:process.env.GITHUB_RUN_ID??null,project:info.project.name,state,width,height,route:new URL(page.url()).pathname,anchor:anchor??null,capturedAt:new Date().toISOString()},null,2));
}
async function readyPassport(page:Page,base:string){await page.goto(`/workspace/clients/${base.split("/").at(-1)}/hair-passport`);await expect(page.getByText("Kanıt güveni",{exact:true})).toBeVisible();}
test("client dossier and current-evidence passport remain practical at 1440/390/320 and edit only on intent",async({page},info)=>{
 test.setTimeout(240000);const f=await colorPilotFixture(page,{variation:true,variationRegion:"ROOT",high:true});
 try{
  const save=async(command:object)=>{const r=await page.request.post("/api/salon",{headers:f.headers,data:{mutation_id:randomUUID(),...command}});expect(r.ok(),await r.text()).toBe(true);return (await r.json()).data;};
  await save({type:"HOURS_SAVE",expected_version:0,days:Array.from({length:7},(_,i)=>({day:i+1,closed:false,opens:540,closes:1080}))});
  await save({type:"STAFF_SAVE",membership_id:f.account.membershipId,expected_version:0,definition:{display_name:"Sentetik renk uzmanı",active:true,bookable:true,working_capacity:null,notes:null,competencies:[{code:"GENERAL_COLOR",level:"INDEPENDENT"}],shifts:Array.from({length:7},(_,i)=>({day:i+1,type:"SHIFT",starts:540,ends:1080}))}});
  const serviceId=randomUUID();await save({type:"SERVICE_SAVE",id:serviceId,expected_version:0,definition:{name:"Sentetik renk danışmanlığı",category:"COLOR",description:"Geçici görsel kabul ortamı",organization_wide:false,base_duration_minutes:60,buffer_before_minutes:0,buffer_after_minutes:0,base_price:1000,tax_rate:20,tax_inclusive:false,requires_colorlab:true,requires_hair_passport:true,requires_precheck:true,active:true,eligible_membership_ids:[f.account.membershipId],capabilities:[{code:"GENERAL_COLOR",level:"INDEPENDENT"}],resources:[]}});
  await save({type:"APPOINTMENT_SAVE",id:randomUUID(),expected_version:0,definition:{client_id:f.client.id,service_id:serviceId,staff_membership_id:f.account.membershipId,local_start:new Date(Date.now()+7*86400000).toISOString().slice(0,10)+"T10:00",utc_offset_minutes:null,scheduled_duration_minutes:null,adjustment_reason:null,notes:null,status:"CONFIRMED"}});
  for(const [category,description,date] of [["BLEACH_LIGHTENING","Sentetik önceki bölgesel açma kaydı","2026-08-10"],["COLOR","Sentetik önceki tonlama kaydı","2026-09-10"]]){
   const h=await page.request.post(`${f.base}/hair-passport/history`,{headers:f.headers,data:{request_id:randomUUID(),category,performed_on:{state:"EXACT",value:date},product:{state:"UNKNOWN",value:null},description,evidence:{source:"HISTORICAL"}}});expect(h.ok(),await h.text()).toBe(true);
  }
  await page.goto(`/workspace/clients/${f.client.id}`);await expect(page.getByText("Mevcut saçın kayıtlı kanıtı",{exact:true})).toBeVisible();await expect(page.locator(".dossier-timeline li").first()).toBeVisible();
  await expect(page.locator(".dossier-profile-header")).toBeVisible();await expect(page.locator(".dossier-profile-header .salon-avatar")).toHaveCount(0);
  for(const width of [1440,390,320])await capture(page,info,"client-profile",width);
  await readyPassport(page,f.base);await expect(page.locator(".hp-editor")).toHaveCount(0);await expect(page.getByRole("button",{name:"Kaydet",exact:true})).toHaveCount(0);
  const map=page.getByLabel("Bölgesel saç değerlendirmesi");await expect(map.locator('[data-region="ROOT"]')).toContainText("4");await expect(map.locator('[data-region="ENDS"]')).toContainText("7");await expect(page.getByText("Eksik kanıt",{exact:true})).toBeVisible();
  for(const width of [1440,390,320])await capture(page,info,"hair-passport",width);
  const mobileRecords=page.locator("#hp-tests .dossier-record-disclosure");await expect(mobileRecords).not.toHaveAttribute("open","");
  await mobileRecords.locator(":scope > summary").focus();await page.keyboard.press("Enter");await expect(mobileRecords).toHaveAttribute("open","");
  const custom=await page.request.post(`${f.base}/hair-passport/regions`,{headers:f.headers,data:{request_id:randomUUID(),region_type:"CUSTOM",label:"Ön hatta önceki açma alanı"}});expect(custom.ok(),await custom.text()).toBe(true);await page.setViewportSize({width:1440,height:1000});await readyPassport(page,f.base);
  await capture(page,info,"regional-technical",1440,"#hp-regions");
  await page.getByRole("button",{name:"Genel durumu düzenle",exact:true}).click();await expect(page.locator("#hp-editor-title")).toBeFocused();
  await expect(page.getByRole("group",{name:"Kimyasal geçmiş",exact:true})).toBeVisible();
  for(const width of [1440,320])await capture(page,info,"hair-passport-edit",width,".hp-editor");
  // No change is saved by entering or leaving edit mode.
  const before=(await(await page.request.get(`${f.base}/hair-passport`)).json()).data;await page.getByRole("button",{name:"Vazgeç",exact:true}).click();await expect(page.getByRole("button",{name:"Genel durumu düzenle",exact:true})).toBeFocused();const after=(await(await page.request.get(`${f.base}/hair-passport`)).json()).data;expect(after.passport.version).toBe(before.passport.version);
  await page.getByRole("link",{name:"ColorLab’da plan oluştur →",exact:true}).click();await expect(page.getByLabel("Renk planı müşterisi")).toHaveValue(f.client.id);
 }finally{await f.account.cleanup();}
});
test("explicit UNKNOWN, missing evidence, conflicting records and expired provenance stay honest",async({page},info)=>{
 test.setTimeout(240000);const f=await colorPilotFixture(page,{variation:true,variationRegion:"ROOT"});
 try{
  const read=async()=>(await(await page.request.get(`${f.base}/hair-passport`)).json()).data;
  let s=await read();const root=s.regions.find((r:{type:string})=>r.type==="ROOT"),mid=s.regions.find((r:{type:string})=>r.type==="MID_LENGTHS");
  for(const payload of [{region_id:root.id,expected_version:root.version,technical:{perceived_level:{state:"KNOWN",value:9},porosity:{state:"KNOWN",value:"HIGH"}},evidence:{source:"PROFESSIONAL_VERIFIED",attestation:"PERSONALLY_ASSESSED",confidence:{state:"KNOWN",value:1}}},{region_id:mid.id,expected_version:mid.version,technical:{perceived_level:{state:"UNKNOWN",value:null},porosity:{state:"KNOWN",value:"HIGH"},elasticity:{state:"UNKNOWN",value:null}},evidence:{source:"PHYSICAL_TEST",observed_at:{state:"KNOWN",value:new Date(Date.now()-60*86400000).toISOString()},relevant_until:new Date(Date.now()-30*86400000).toISOString(),confidence:{state:"KNOWN",value:.9},context:"Sentetik süresi geçmiş ölçüm kaydı"}}]){
   const r=await page.request.post(`${f.base}/hair-passport/observations`,{headers:f.headers,data:{request_id:randomUUID(),...payload}});expect(r.ok(),await r.text()).toBe(true);
  }
  const c=await page.request.get(`${f.base}/hair-passport/confidence`);expect(c.ok(),await c.text()).toBe(true);const canonical=(await c.json()).data;expect(canonical.conflicts.length).toBeGreaterThan(0);expect(canonical.staleEvidence.length).toBeGreaterThan(0);
  await readyPassport(page,f.base);await expect(page.getByText(`${canonical.conflicts.length} çelişkili kanıt`,{exact:true})).toBeVisible();await page.getByText("Çelişki ve güncellik ayrıntıları",{exact:true}).click();await capture(page,info,"conflicting-stale-evidence",1440,".dossier-assessment");
  s=await read();const midDetails=page.locator(`#region-${mid.id} details`);await midDetails.locator(":scope > summary").click();await expect(midDetails.getByText("Geçerlilik tarihi geçti")).toBeVisible();await capture(page,info,"expired-source-provenance",1440,`#region-${mid.id}`);
  const r=await page.request.post("/api/clients",{headers:f.headers,data:{operation:"create",payload:{full_name:"Sentetik bilinmeyen teknik dosya",phone:"05329995522",request_id:randomUUID()}}});expect(r.ok(),await r.text()).toBe(true);const client=(await r.json()).data,base=`/api/clients/${client.id}`;
  const hp=await page.request.post(`${base}/hair-passport`,{headers:f.headers,data:{request_id:randomUUID()}});expect(hp.ok(),await hp.text()).toBe(true);const empty=(await(await page.request.get(`${base}/hair-passport`)).json()).data;
  const unknown=await page.request.post(`${base}/hair-passport/observations`,{headers:f.headers,data:{request_id:randomUUID(),expected_version:empty.regions[0].version,region_id:empty.regions[0].id,technical:{perceived_level:{state:"UNKNOWN",value:null},grey_ratio:{state:"KNOWN",value:0},porosity:{state:"UNKNOWN",value:null},elasticity:{state:"NOT_ASSESSED",value:null}},evidence:{source:"PROFESSIONAL_VERIFIED",attestation:"PERSONALLY_ASSESSED"}}});expect(unknown.ok(),await unknown.text()).toBe(true);
  await readyPassport(page,base);await expect(page.getByText("Eksik bilgi nedeniyle planlama durduruldu",{exact:true})).toBeVisible();await expect(page.getByLabel("Bölgesel saç değerlendirmesi").locator('[data-region="ROOT"]')).toContainText("Bilinmiyor");for(const width of [1440,320])await capture(page,info,"unknown-missing-evidence",width);
 }finally{await f.account.cleanup();}
});
test("reception cannot see the technical dossier or private management material",async({page,browser})=>{
 test.setTimeout(180000);const f=await colorPilotFixture(page),reception=await f.account.addMember("reception"),other=await browser.newContext({baseURL:"http://127.0.0.1:4173"});
 try{
  const note=await page.request.post("/api/crm",{headers:f.headers,data:{type:"NOTE_SAVE",mutation_id:randomUUID(),id:randomUUID(),client_id:f.client.id,expected_version:0,visibility:"PRIVATE_MANAGEMENT",body:"SYNTHETIC PRIVATE MANAGEMENT NOTE",archived:false}});expect(note.ok(),await note.text()).toBe(true);
  const staff=await other.newPage();await login(staff,reception);await expectReady(staff);await staff.goto(`/workspace/clients/${f.client.id}`);await expect(staff.getByRole("heading",{name:f.client.full_name,exact:true})).toBeVisible();await expect(staff.getByRole("button",{name:"Notlar",exact:true})).toBeVisible();await expect(staff.locator(".dossier-client-technical,.dossier-color-journey")).toHaveCount(0);await expect(staff.getByText("SYNTHETIC PRIVATE MANAGEMENT NOTE")).toHaveCount(0);expect((await staff.request.get(`${f.base}/hair-passport`)).status()).toBe(403);
  await f.account.revoke();await page.goto(`/workspace/clients/${f.client.id}/hair-passport`);await expect(page.locator(".dossier-region-map")).toHaveCount(0);await expect(page).toHaveURL(/\/workspaces/, {timeout:25000});
 }finally{await other.close();await f.account.cleanup();}
});
test("the client color journey exposes actual governed Live history without inventing a color result",async({page,browser},info)=>{
 await controlledRecipeJourney(page,browser,info,undefined,{afterLive:async clientId=>{
  const viewport=page.viewportSize();await page.goto(`/workspace/clients/${clientId}`);await expect(page.getByText("Mevcut saçın kayıtlı kanıtı",{exact:true})).toBeVisible();await expect(page.locator('.dossier-timeline [data-source="live_session"]').first()).toBeVisible();await capture(page,info,"client-color-live-history",1440,".dossier-color-journey");if(viewport)await page.setViewportSize(viewport);
 }});
});
