import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { colorPilotFixture, generatePilotPlan } from "./color-pilot-flow";
const step=(page:Page,name:string)=>page.getByRole("navigation",{name:"ColorLab çalışma adımları"}).getByRole("button",{name,exact:true});
async function capture(page:Page,info:TestInfo,state:string,width:number) {
 await page.setViewportSize({width,height:1000});await expect(page.getByText(/Güvenli çalışma alanı yükleniyor/)).toHaveCount(0);
 await page.evaluate(async()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();window.scrollTo(0,0);await document.fonts.ready;await new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())));});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${state} ${width}px`).toBe(true);
 await expect(page.locator('.salon-sidebar [aria-current="page"]')).toHaveCount(1);
 await page.screenshot({path:info.outputPath(`ui-ux-pass2-${state}-${width}.png`),fullPage:true});
}
test("original visual chart stays canonical, keyboard operable and practical at 1440/390/320",async({page},info)=>{
 test.setTimeout(180000);const f=await colorPilotFixture(page);
 try {
  const picker=page.getByRole("region",{name:"Hızlı hedef oluşturucu"});
  await picker.getByRole("radio",{name:"7 · Orta sarı",exact:true}).focus();await page.keyboard.press("ArrowRight");await expect(picker.getByRole("radio",{name:"8 · Açık sarı",exact:true})).toBeChecked();
  await picker.getByRole("radio",{name:"Karamel",exact:true}).check();await picker.getByRole("button",{name:"Yapılandırılmış hedefi uygula",exact:true}).click();
  for(const width of [1440,390,320]) {await step(page,"Hedef").click();await capture(page,info,"target",width);await expect(picker.getByRole("radio",{name:"Karamel",exact:true})).toBeVisible();}
  await page.getByRole("button",{name:"Kanıtı incele →",exact:true}).click();await expect(page.locator(".cl-workstation")).toHaveAttribute("data-stage","2");await expect(picker).not.toBeVisible();
  const plan=await generatePilotPlan(page);expect(plan.result.targetInterpretation.regions.every((r:{level:number;tones:string[]})=>r.level===8&&r.tones.join() === "COPPER,GOLD_WARM")).toBe(true);
  expect(plan.result.recipeDraft.executionStatus).toBe("REQUIRES_BRAND_ADAPTER");
  for(const width of [1440,390,320]) {await step(page,"Değerlendirme").click();await capture(page,info,"evaluated",width);await expect(page.getByLabel("Risk değerlendirmesi")).toBeVisible();await expect(page.getByLabel("Kanıt güveni")).toBeVisible();await expect(page.getByLabel("Teknik uygulanabilirlik")).toBeVisible();}
  await step(page,"Reçete").click();await page.getByText("Listelenen serileri incele",{exact:true}).click();await page.getByLabel("Listelenen seri").selectOption({label:"Keune · Tinta Color · GB"});
  await expect(page.getByText("Bu seri ELIFORA kataloğunda yer alıyor ancak doğrulanmış teknik reçete desteği henüz yayınlanmadı.",{exact:true})).toBeVisible();
  const published=await page.request.get("/api/controlled-brand-recipes/catalogs");expect(published.ok()).toBe(true);
  if(!(await published.json()).data.length){await expect(page.getByText("Yayımlanmış doğrulanmış pilot katalog bulunamadı.")).toBeVisible();await expect(page.getByRole("button",{name:"Uyumlu tonları getir",exact:true})).toBeDisabled();}
 }finally{await f.account.cleanup();}
});
test("regional target directions keep independent canonical depths and explicit current evidence",async({page},info)=>{
 test.setTimeout(120000);const f=await colorPilotFixture(page,{variation:true});
 try{
  await page.getByRole("region",{name:"Hızlı hedef oluşturucu"}).getByRole("button",{name:"Bej sarı",exact:true}).click();
  await page.locator(".cl-expert>summary").click();const root=page.locator(".salon-region-editor").filter({has:page.locator("legend",{hasText:/^Dip/})});
  await root.getByLabel("Hedef seviye",{exact:true}).fill("7");await root.getByLabel("Ton ailesi",{exact:true}).selectOption("NEUTRAL");
  await expect(page.getByRole("region",{name:"Temsili hedef yönü"}).getByRole("heading",{name:"Bölgesel renk yönü"})).toBeVisible();
  await page.locator(".cl-expert>summary").click();await capture(page,info,"regional",1440);
  const p=await generatePilotPlan(page);expect(new Set(p.result.targetInterpretation.regions.map((r:{level:number})=>r.level))).toEqual(new Set([7,9]));
 }finally{await f.account.cleanup();}
});
test("UNKNOWN remains uncolored and evidence-blocked rather than a fake hair preview",async({page},info)=>{
 test.setTimeout(120000);const f=await colorPilotFixture(page);
 try{
  const created=await page.request.post("/api/clients",{headers:f.headers,data:{operation:"create",payload:{full_name:"Sentetik bilinmeyen saç kanıtı",phone:"05329995544",request_id:randomUUID()}}});expect(created.ok(),await created.text()).toBe(true);const client=(await created.json()).data;
  const hp=await page.request.post(`/api/clients/${client.id}/hair-passport`,{headers:f.headers,data:{request_id:randomUUID()}});expect(hp.ok(),await hp.text()).toBe(true);
  await page.goto(`/workspace/colorlab?client_id=${client.id}`);await page.getByRole("region",{name:"Hızlı hedef oluşturucu"}).getByRole("button",{name:"Karamel",exact:true}).click();
  const p=await generatePilotPlan(page);expect(p.result.status).toBe("REQUIRES_ASSESSMENT");expect(p.result.recipeDraft).toBeNull();expect(p.result.safetyGate.canProgress).toBe(false);
  await expect(page.getByRole("link",{name:/Eksik kanıtı ve fiziksel testleri/})).toBeVisible();await capture(page,info,"unknown-evidence-blocked",1440);
  await expect(page.locator(".cl-current-evidence")).toHaveText(["?","?","?"]);await expect(page.locator(".cl-current-evidence .cl-hair-swatch")).toHaveCount(0);
 }finally{await f.account.cleanup();}
});
