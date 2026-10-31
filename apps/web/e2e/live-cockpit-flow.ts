import { expect,type Page,type TestInfo } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";

/** Real authenticated disposable DB journey. No staging catalog publication or mocked responses. */
export async function verifyLiveCockpit(page:Page,info:TestInfo,clientId:string,recipeId:string,headers:Record<string,string>) {
 const device=await page.evaluate(()=>sessionStorage.getItem("elifora-live-device")??crypto.randomUUID());
 await page.evaluate(id=>sessionStorage.setItem("elifora-live-device",id),device);
 const create=await page.request.post("/api/live-sessions",{headers,data:{mutation_id:randomUUID(),device_id:device,client_id:clientId,recipe_id:recipeId,professional_review:true,review_note:"SYNTHETIC QA ONLY — disposable Live cockpit review, not pilot evidence"}});
 expect(create.status(),await create.text()).toBe(200);let s=(await create.json()).data;
 const base=`/api/live-sessions/${s.id}?client_id=${clientId}`;
 const mutation=async(patch:Record<string,unknown>)=>{const response=await page.request.post(base,{headers,data:{mutation_id:randomUUID(),device_id:device,expected_version:s.recordVersion,control_epoch:s.controlEpoch,...patch}});expect(response.status(),await response.text()).toBe(200);s=(await response.json()).data;};
 const captures:Record<string,unknown>[]=[],metrics:Record<string,unknown>={source:"REAL_AUTHENTICATED_DISPOSABLE_DATABASE",applicationSha:process.env.ELIFORA_RELEASE_SHA??null,notCanonicalStaging:true,unsupportedCrossRegionRecipeNotInvented:true};
 async function capture(state:string,width:number,anchor?:string) {
  await page.setViewportSize({width,height:width===390?844:width===320?900:1000});
  await page.evaluate(async()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();await document.fonts.ready;window.scrollTo(0,0);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
  if(anchor)await page.locator(anchor).scrollIntoViewIfNeeded();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const path=info.outputPath(`pass4-${state}-${width}.png`);await page.screenshot({path});await page.screenshot({path:info.outputPath(`pass4-${state}-${width}-full.png`),fullPage:true});
  if(["active","timer"].includes(state)) {
   const current=await page.locator(".live-current").boundingBox(),timer=await page.locator(".live-timer-watch").boundingBox(),action=await page.locator(".live-execution-bar .button").boundingBox();
   expect(current!.y).toBeLessThan(page.viewportSize()!.height);expect(timer!.y).toBeLessThan(page.viewportSize()!.height);
   expect(action!.height).toBeGreaterThanOrEqual(48);if(width<600){expect(action!.y+action!.height).toBeLessThanOrEqual(page.viewportSize()!.height);expect(action!.y).toBeGreaterThan(timer!.y+timer!.height);}
  }
  captures.push({state,width,path,sessionId:s.id,source:"REAL_AUTHENTICATED_DISPOSABLE_DATABASE"});
 }
 try {
  const first=s.steps[0],region=first.regionId,bowl=first.bowlId;
  await mutation({type:"SEQUENCE",reason:"SYNTHETIC expert-selected three-part ROOT sequence; no MID/ENDS formula invented",steps:[first.id,randomUUID(),randomUUID()].map((id,index)=>({id,region_id:region,bowl_id:bowl,instruction_type:"APPLICATION",instruction_text:["SYNTHETIC · Dip ön bölüm uygulaması","SYNTHETIC · Dip arka bölüm uygulaması","SYNTHETIC · Dip son bölüm uygulaması"][index]}))});
  await mutation({type:"READY"});await mutation({type:"START"});await mutation({type:"STEP_START",step_id:s.steps[0].id});
  await mutation({type:"CHECKPOINT_RECORD",checkpoint_id:s.checkpoints[0].id,result:"PASS",note:"SYNTHETIC QA ONLY, fixture check, not a real professional attestation"});
  await mutation({type:"STEP_COMPLETE",step_id:s.steps[0].id});await mutation({type:"STEP_START",step_id:s.steps[1].id});
  for(const [label,duration_seconds] of [["Dip işleme hatırlatıcısı",1800],["Profesyonel görsel kontrol",300]] as const)await mutation({type:"TIMER_ADD",label,step_id:s.steps[1].id,region_id:region,duration_seconds});
  await mutation({type:"NOTE",text:"SYNTHETIC QA ONLY · Ön bölüm kaydedildi; arka bölüm üzerinde çalışılıyor. Bu kayıt işlem veya pilot onayı değildir."});
  await page.goto(`/workspace/live-sessions?client_id=${clientId}&session_id=${s.id}`);
  await expect(page.getByRole("heading",{name:"SYNTHETIC · Dip arka bölüm uygulaması",exact:true})).toBeVisible();
  await expect(page.locator(".live-region-strip")).toContainText("DİP");
  await expect(page.locator(".live-region-strip")).toContainText("ORTA");
  await expect(page.locator(".live-region-strip")).toContainText("UÇLAR");
  await expect(page.getByLabel("Dip işleme hatırlatıcısı kalan süre")).toBeVisible();
  for(const width of [1440,390,320])await capture("active",width);
  const action=page.locator(".live-execution-bar button");await action.focus();await page.keyboard.press("Enter");await expect(page.getByRole("dialog")).toBeVisible();
  const beforeCancel=(await(await page.request.get(base)).json()).data.recordVersion;await page.getByRole("button",{name:"Vazgeç",exact:true}).click();await expect(action).toBeFocused();expect((await(await page.request.get(base)).json()).data.recordVersion).toBe(beforeCancel);
  for(const width of [1440,320])await capture("timer",width);
  await capture("regional",1440,".live-region-strip");
  await page.locator(".live-mix > details > summary").click();await capture("formulation",1440,".live-mix");
  await capture("multi-timer",1440,".live-timer-watch");
  const priorStep=s.steps[1].status;await mutation({type:"TIMER_ADD",label:"SYNTHETIC süre sonu kontrolü",step_id:s.steps[1].id,region_id:region,duration_seconds:1});
  await page.getByRole("button",{name:"Güncel kaydı yükle"}).click();await expect(page.getByText("Süre tamamlandı — profesyonel kontrol gerekli",{exact:true})).toBeVisible();
  const unchanged=(await(await page.request.get(base)).json()).data;expect(unchanged.recordVersion).toBe(s.recordVersion);expect(unchanged.steps[1].status).toBe(priorStep);expect(unchanged.timers.at(-1).status).toBe("RUNNING");await capture("timer-due",320);
  metrics.resources=await page.evaluate(()=>performance.getEntriesByType("resource").filter(x=>x instanceof PerformanceResourceTiming&&/\.(js|css)(\?|$)/.test(x.name)).map(x=>{const r=x as PerformanceResourceTiming;return {path:new URL(r.name).pathname,encoded:r.encodedBodySize,decoded:r.decodedBodySize,transfer:r.transferSize};}));
  await mutation({type:"RISK_EVENT",event_type:"UNEXPECTED_BAND",note:"SYNTHETIC QA ONLY · recorded unexpected band; mandatory real reassessment path"});
  await page.getByRole("button",{name:"Güncel kaydı yükle"}).click();await expect(page.locator(".live-cockpit")).toHaveAttribute("data-state","CHECKPOINT_REQUIRED");
  await expect(page.getByRole("link",{name:"Güvenlik kontrolünü aç",exact:true})).toBeVisible();
  for(const width of [1440,390,320])await capture("blocked",width);
  expect(await page.getByRole("button",{name:"Adımı başlat",exact:true}).count()).toBe(0);
 } finally {
  if(!["COMPLETED","CANCELLED","ABORTED"].includes(s.status))await mutation({type:"CANCEL",reason:"SYNTHETIC QA ONLY — cockpit fixture finished; immutable evidence retained in disposable DB"});
  await writeFile(info.outputPath("pass4-cockpit-provenance.json"),JSON.stringify({metrics,captures},null,2));
 }
}
