import {expect,test} from "./reliability-test";
import {randomUUID} from "node:crypto";
import {writeFile,readFile} from "node:fs/promises";
import {seedAccount,login,expectReady} from "./local-auth";
import {sql} from "./saas-test-control";
import {controlledRecipeJourney} from "./controlled-recipe-flow";
async function admittedAccount(){
 const account=await seedAccount(0),request=randomUUID();
 const body=JSON.stringify({name:"Studio E2E",location_name:"Bolu",timezone:"Europe/Istanbul",base_currency:"TRY"});
 const result=sql(`begin;set local app.settings.elifora_environment='staging';set local role elifora_pilot_operator;select app_private.pilot_provision('${request}','${account.userId}','${body}','E2E_OPERATOR','Approved isolated synthetic acceptance',gen_random_uuid());commit;`);
 const ids=JSON.parse(result.split('\n').find(line=>line.startsWith('{'))!);
 return {...account,membershipId:ids.membership_id,locations:[{id:ids.location_id,organization_id:ids.organization_id,name:"Bolu",timezone:"Europe/Istanbul"}],async revoke(){sql(`update public.salon_memberships set status='revoked',revoked_at=now() where id='${ids.membership_id}';`);}};
}
test("pilot admitted empty salon to verified recipe, Live, stock, finance, profitability, report and owner export",async({page,browser},info)=>{
 const measurements:{journey:string;elapsedMs:number;environment:string}[]=[];
 const measure=async<T,>(journey:string,operation:()=>Promise<T>)=>{const start=Date.now(),value=await operation();measurements.push({journey,elapsedMs:Date.now()-start,environment:"DISPOSABLE_CI_PRODUCTION_BUILD"});return value;};
 await controlledRecipeJourney(page,browser,info,admittedAccount,{
  onMeasurement(journey,elapsedMs){measurements.push({journey,elapsedMs,environment:"DISPOSABLE_CI_PRODUCTION_BUILD"});},
  async afterLogin(){
   const day=new Date().toISOString().slice(0,10),empty=await measure("empty-salon-read",()=>page.request.get(`/api/salon?from=${day}&to=${day}`));expect(empty.status(),await empty.text()).toBe(200);const d=(await empty.json()).data;expect(d.services).toHaveLength(0);expect(d.staff).toHaveLength(0);expect(d.appointments).toHaveLength(0);
   const options=await measure('target-options-load',()=>page.request.get('/api/color-target-options'));expect(options.status()).toBe(200);
   const status=await page.request.get('/api/pilot/status');expect(status.status(),await status.text()).toBe(200);expect((await status.json()).data.database.signingMatches).toBe(true);
   await page.goto('/workspace/settings/pilot');await expect(page.getByRole('heading',{name:'İlk gün kurulum sırası'})).toBeVisible();await expect(page.getByText(/29 ton · 2 geliştirici · 58 kural/)).toBeVisible();
   await page.setViewportSize({width:320,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('phase-10-setup-320.png'),fullPage:true});
  },
  async afterLive(clientId,headers){
   const r=await measure('finance-read',()=>page.request.get('/api/finance'));expect(r.status()).toBe(200);const finance=(await r.json()).data,charge=finance.documents.find((d:{type:string;client_id:string})=>d.type==='SERVICE_CHARGE'&&d.client_id===clientId);expect(charge).toBeTruthy();
   const payment={type:'PAYMENT',id:randomUUID(),mutation_id:randomUUID(),client_id:clientId,currency:'TRY',amount_minor:charge.amount_minor,method:'CARD',appointment_id:null,external_reference:null,occurred_at:new Date().toISOString(),allocations:[{charge_id:charge.id,amount_minor:charge.amount_minor}],confirm_credit:false,reason:'Synthetic completed pilot service collection'};
   const posted=await measure('payment-and-allocation',()=>page.request.post('/api/finance',{headers,data:payment}));expect(posted.status(),await posted.text()).toBe(200);const retry=await page.request.post('/api/finance',{headers,data:payment});expect(retry.status()).toBe(200);expect((await retry.json()).data).toEqual((await posted.json()).data);
   const exported=await measure('owner-client-export',()=>page.request.post('/api/reporting',{headers,data:{type:'EXPORT',request:{kind:'CLIENTS'}}}));expect(exported.status()).toBe(200);expect(exported.headers()['content-type']).toContain('text/csv');
   const stock=await measure('stock-read',()=>page.request.get('/api/stock'));expect(stock.status()).toBe(200);
   const summary=await measure('report-summary',()=>page.request.get('/api/reporting?kind=OVERVIEW'));expect(summary.status()).toBe(200);
   for(const [route,heading] of [[`/workspace/clients/${clientId}`,'Müşteri profili'],[`/workspace/clients/${clientId}/hair-passport`,'Sentetik kontrollü reçete'],['/workspace/appointments','Randevular']] as const){await measure(route.endsWith('hair-passport')?'hair-passport-open':route.endsWith('appointments')?'appointments-open':'client-profile-open',async()=>{await page.goto(route);await expect(page.getByRole('heading',{name:heading,exact:true}).first()).toBeVisible();});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  }
 });
 await writeFile(info.outputPath('phase-10-workflow-performance.json'),JSON.stringify({measurements,hostedMeasurements:false}));
});
test("pilot feedback is explicit private download with safe release context and owner-only diagnostics",async({page,browser},info)=>{
 const a=await admittedAccount();await login(page,a);await expectReady(page);await page.goto('/workspace/settings/pilot');await expect(page.getByRole('heading',{name:'Uzman değerlendirmesi ve geri bildirim'})).toBeVisible();
 await page.getByLabel('Hedef seçiminin açıklığı',{exact:true}).selectOption('4');await page.getByLabel('Yorum',{exact:true}).fill('Sentetik değerlendirme; müşteri içeriği yok.');const button=page.getByRole('button',{name:'Geri bildirim dosyasını indir'});await expect(button).toBeDisabled();await page.getByRole('checkbox').check();const download=page.waitForEvent('download');await button.click();const file=await download;expect(file.suggestedFilename()).toBe('elifora-pilot-feedback.json');
 const feedback=JSON.parse(await readFile((await file.path())!,'utf8'));expect(feedback.ratings[0]).toBe(4);expect(feedback.release.gitSha).toMatch(/^[a-f0-9]{40}$/);expect(feedback.release).toHaveProperty('publishedCatalogs');expect(Object.keys(feedback)).not.toContain('client');expect(JSON.stringify(feedback)).not.toContain(a.userId);
 for(const width of [1440,320]){await page.setViewportSize({width,height:900});await expect(page.getByRole('heading',{name:'İlk gün kurulum sırası'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath(`phase-10-feedback-${width}.png`),fullPage:true});}
 const other=await seedAccount(),reception=await other.addMember('reception'),bc=await browser.newContext();try{const p=await bc.newPage();await login(p,reception);await expectReady(p);expect((await p.request.get('/api/pilot/status')).status()).toBe(403);}finally{await bc.close();}
 await a.revoke();expect((await page.request.get('/api/pilot/status')).status()).toBe(403);
});
