import { test,expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir,rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seedAccount,login,expectReady } from "./local-auth";

test("controlled professional recipe keeps exact arithmetic, immutable history, current safety and real tenant isolation",async({page,browser},info)=>{
 test.setTimeout(240000);
 page.setDefaultTimeout(15000);
 const lock=join(tmpdir(),"elifora-pilot-browser-governance-lock");let locked=false;const start=Date.now();
 while(!locked&&Date.now()-start<180000){try{await mkdir(lock);locked=true;}catch(e){if((e as NodeJS.ErrnoException).code!=="EEXIST")throw e;await new Promise(r=>setTimeout(r,200));}}
 if(!locked)throw new Error("Pilot governance lock timed out");
 try{
 const account=await seedAccount();if(!/^[a-f0-9-]{36}$/.test(account.userId))throw new Error("Invalid disposable UUID");
 execFileSync("docker",["exec","supabase_db_elifora","psql","-U","postgres","-v","ON_ERROR_STOP=1","-c",`insert into app_private.catalog_operators(user_id) values ('${account.userId}'::uuid);`],{stdio:"pipe"});
 await login(page,account);await expectReady(page);
 const latest=execFileSync("docker",["exec","supabase_db_elifora","psql","-U","postgres","-Atc","select id from public.brand_catalog_releases where pilot_key='schwarzkopf-igora-royal-absolutes' order by version desc limit 1"],{encoding:"utf8"}).trim();
 const governance=(id:string|null,operation:string,previous?:string)=>page.request.post(id?`/api/admin/catalogs/${id}/governance`:"/api/admin/catalogs/import",{headers:{origin:"http://127.0.0.1:4173"},data:{operation,note:"Disposable Phase 2C authenticated source review",...(previous?{previous_id:previous}:{})}});
 if(latest){const existing=(await(await page.request.get(`/api/brand-catalog/${latest}/pilot`)).json()).data; if(["DRAFT","TECHNICAL_REVIEW","GOLDEN_TEST","APPROVED"].includes(existing.catalog.release.state))expect((await governance(latest,"REJECT")).status()).toBe(200);}
 const imported=await governance(null,"IMPORT",latest||undefined);expect(imported.status(),await imported.text()).toBe(200);const catalogId=(await imported.json()).data.catalogId;
 for(const op of ["START_REVIEW","COMPLETE_REVIEW","VALIDATE_GOLDEN","APPROVE","PUBLISH"]){const r=await governance(catalogId,op);expect(r.status(),await r.text()).toBe(200);}
 const context=(await(await page.request.get("/api/session")).json()).context;
 const headers={origin:"http://127.0.0.1:4173","x-workspace-reference":`${context.membership_id}:${context.location_id}`};
 const created=await page.request.post("/api/clients",{headers,data:{operation:"create",payload:{full_name:"Sentetik kontrollü reçete",phone:"05329997744",request_id:randomUUID()}}});expect(created.ok(),await created.text()).toBeTruthy();
 const client=(await created.json()).data,base=`/api/clients/${client.id}`;
 const hp=await page.request.post(`${base}/hair-passport`,{headers,data:{request_id:randomUUID()}});expect(hp.ok(),await hp.text()).toBeTruthy();
 const snapshot=(await(await page.request.get(`${base}/hair-passport`)).json()).data;
 const technical={natural_level:{state:"KNOWN",value:8},perceived_level:{state:"KNOWN",value:8},grey_ratio:{state:"KNOWN",value:.9},porosity:{state:"KNOWN",value:"MEDIUM"},elasticity:{state:"KNOWN",value:"NORMAL"},thickness:{state:"KNOWN",value:"FINE"},density:{state:"KNOWN",value:"MEDIUM"},cosmetic_color_history:{state:"KNOWN",value:"Professionally reviewed"},bleach_history:{state:"KNOWN",value:"Professionally reviewed"},chemical_history:{state:"KNOWN",value:"Professionally reviewed"}};
 for(const region_id of [null,...snapshot.regions.map((r:{id:string})=>r.id)]){
  const current=(await(await page.request.get(`${base}/hair-passport`)).json()).data;
  const expected_version=region_id===null?current.passport.version:current.regions.find((r:{id:string})=>r.id===region_id).version;
  const observation=await page.request.post(`${base}/hair-passport/observations`,{headers,data:{request_id:randomUUID(),expected_version,region_id,technical,evidence:{source:"PROFESSIONAL_VERIFIED",attestation:"PERSONALLY_ASSESSED",confidence:{state:"KNOWN",value:1}}}});expect(observation.ok(),await observation.text()).toBeTruthy();
  const strand=await page.request.post(`${base}/hair-passport/tests`,{headers,data:{request_id:randomUUID(),region_id,type:"STRAND",result:{state:"KNOWN",value:"Professionally reviewed candidate"}}});expect(strand.ok(),await strand.text()).toBeTruthy();
 }
 await page.goto("/workspace/colorlab");await page.getByLabel("Renk planı müşterisi").selectOption(client.id);
 await page.getByLabel("Çalışma türü").selectOption("ROOT_REFRESH");await page.getByLabel("Genel amaç").selectOption("REFRESH");
 const regions=page.locator(".salon-region-editor");await expect(regions).toHaveCount(3);
 const root=regions.filter({has:page.locator("legend",{hasText:/^Dip/})});await expect(root).toHaveCount(1);
 await root.getByLabel("Hedef seviye",{exact:true}).fill("8");await root.getByLabel("Ton ailesi").selectOption("NEUTRAL");
 for(let index=0;index<3;index++)if(!await regions.nth(index).locator("legend").innerText().then(text=>text.startsWith("Dip")))await regions.nth(index).getByLabel("Mevcut rengi koru").check();
 const planResponse=page.waitForResponse(r=>r.url().endsWith("/color-plans")&&r.request().method()==="POST");
 await page.getByRole("button",{name:"Renk planı oluştur",exact:true}).click();const generated=await planResponse;expect(generated.ok(),await generated.text()).toBeTruthy();const plan=(await generated.json()).data;expect(plan.result.status).toBe("DRAFT");
 const panel=page.getByRole("region",{name:"Kontrollü marka reçetesi"});await expect(panel).toBeVisible();await expect(panel.getByLabel("Doğrulanmış katalog")).toHaveValue(catalogId);
 await panel.getByRole("button",{name:"Uyumlu tonları getir"}).click();await expect(panel.getByText(/Dip beyaz oranı: %90/)).toBeVisible();
 const opts=await page.request.post("/api/controlled-brand-recipes/options",{headers,data:{client_id:client.id,plan_id:plan.id,catalog_id:catalogId}});expect(opts.ok(),await opts.text()).toBeTruthy();const candidates=(await opts.json()).data.candidates;expect(candidates.every((c:{developerName:string})=>c.developerName.includes("9%"))).toBe(true);
 const candidate=candidates.find((c:{manufacturerCode:string})=>c.manufacturerCode==="8-01");expect(candidate).toBeTruthy();
 await panel.getByLabel("Uzman ton ve geliştirici seçimi").selectOption(`${candidate.productId}:${candidate.developerId}`);await panel.getByLabel("Boya miktarı (g)").fill("30.15");
 const savedResponse=page.waitForResponse(r=>r.url().endsWith("/api/controlled-brand-recipes")&&r.request().method()==="POST");await panel.getByRole("button",{name:"Kontrollü taslağı kaydet",exact:true}).click();const saved=await savedResponse;expect(saved.ok(),await saved.text()).toBeTruthy();const v1=(await saved.json()).data;
 expect(v1.result).toMatchObject({colorGrams:30.15,developerGrams:30.15,totalGrams:60.3,executable:false,professionalReviewRequired:true});expect(v1.result.selected.processingMinutes).toEqual({min:30,max:45});
 await expect(panel.getByText(/Toplam: 60.3 g/).first()).toBeVisible();
 const original=JSON.parse(saved.request().postData()!);expect((await(await page.request.post("/api/controlled-brand-recipes",{headers,data:original})).json()).data.id).toBe(v1.id);
 expect((await page.request.post("/api/controlled-brand-recipes",{headers,data:{...original,color_grams:31}})).status()).toBe(409);
 for(const field of ["white_ratio","developer_grams","processing_minutes","executable","organization_id"]){expect((await page.request.post("/api/controlled-brand-recipes",{headers,data:{...original,request_id:randomUUID(),[field]:true}})).status()).toBe(400);}
 await panel.getByLabel("Boya miktarı (g)").fill("45");const revisedResponse=page.waitForResponse(r=>r.url().endsWith("/api/controlled-brand-recipes")&&r.request().method()==="POST");await panel.getByRole("button",{name:"Yeni reçete sürümünü kaydet"}).click();const revised=await revisedResponse;expect(revised.ok(),await revised.text()).toBeTruthy();const v2=(await revised.json()).data;expect(v2.version).toBe(2);expect(v2.supersedesId).toBe(v1.id);expect(v2.seriesId).toBe(v1.seriesId);expect(v2.result.totalGrams).toBe(90);
 expect((await(await page.request.get(`/api/controlled-brand-recipes/${v1.id}?client_id=${client.id}`)).json()).data.result.colorGrams).toBe(30.15);
 expect((await page.request.post("/api/controlled-brand-recipes",{headers,data:{...original,request_id:randomUUID(),supersedes_id:v1.id}})).status()).toBe(409);
 await panel.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath("client-controlled-desktop.png")});await page.screenshot({path:info.outputPath("client-controlled-full.png"),fullPage:true});
 await page.setViewportSize({width:320,height:900});await panel.scrollIntoViewIfNeeded();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath("client-controlled-320.png")});await page.screenshot({path:info.outputPath("client-controlled-320-full.png"),fullPage:true});
 const foreign=await seedAccount(),foreignContext=await browser.newContext({baseURL:"http://127.0.0.1:4173"});
 try{const other=await foreignContext.newPage();await login(other,foreign);await expectReady(other);const denied=await other.request.get(`/api/controlled-brand-recipes/${v1.id}?client_id=${client.id}`);expect(denied.status()).toBe(404);expect(await denied.json()).not.toHaveProperty("data");}finally{await foreignContext.close();}
 const current=(await(await page.request.get(`${base}/hair-passport`)).json()).data;
 const currentRoot=current.regions.find((r:{type:string})=>r.type==="ROOT");
 const changed=await page.request.post(`${base}/hair-passport/observations`,{headers,data:{request_id:randomUUID(),expected_version:currentRoot.version,region_id:currentRoot.id,technical:{...technical,grey_ratio:{state:"KNOWN",value:.95}},evidence:{source:"PROFESSIONAL_VERIFIED",attestation:"PERSONALLY_ASSESSED",confidence:{state:"KNOWN",value:1}}}});expect(changed.ok(),await changed.text()).toBeTruthy();
 expect((await page.request.post("/api/controlled-brand-recipes",{headers,data:{...original,request_id:randomUUID()}})).status()).toBe(409);
 expect((await page.request.get(`/api/controlled-brand-recipes/${v1.id}?client_id=${client.id}`)).status()).toBe(200);
 await account.revoke();expect((await page.request.get(`/api/controlled-brand-recipes/${v1.id}?client_id=${client.id}`)).status()).toBe(403);
 await page.context().clearCookies();expect((await page.request.get(`/api/controlled-brand-recipes/${v1.id}?client_id=${client.id}`)).status()).toBe(401);
 // Append-only catalog/recipe attribution remains until this disposable DB is destroyed.
 }finally{await rmdir(lock);}
});
