import { test,expect } from "./reliability-test";
import { colorPilotFixture,generatePilotPlan } from "./color-pilot-flow";

test("simple targets cover brunette, caramel, copper and blonde through one canonical model",async({page},info)=>{
 test.setTimeout(180000);await colorPilotFixture(page);
 const start=Date.now(),options=await page.request.get("/api/color-target-options");expect(options.status()).toBe(200);const optionsMs=Date.now()-start;
 expect((await options.json()).data.levels).toHaveLength(10);
 const picker=page.getByRole("region",{name:"Hızlı hedef oluşturucu"}),flow=Date.now();
 for(const [label,level] of [["Soğuk kahve",5],["Sıcak kahve",5],["Karamel",7],["Bakır",7],["Bej sarı",9],["Soğuk sarı",9]] as const){
  await page.getByRole("navigation",{name:"ColorLab çalışma adımları"}).getByRole("button",{name:"Hedef",exact:true}).click();
  await picker.getByRole("button",{name:label,exact:true}).click();const plan=await generatePilotPlan(page);
  expect(plan.result.engineVersion).toBe("color-engine/1.1.0");expect(plan.result.status).toBe("DRAFT");expect(plan.result.targetInterpretation.regions.every((r:{level:number})=>r.level===level)).toBe(true);expect(plan.result.recipeDraft.executionStatus).toBe("REQUIRES_BRAND_ADAPTER");
 }
 await info.attach("color-pilot-browser-performance",{body:JSON.stringify({target_options_load_ms:optionsMs,six_target_interactive_flow_ms:Date.now()-flow}),contentType:"application/json"});
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:info.outputPath("color-pilot-desktop.png"),fullPage:true});
 await page.setViewportSize({width:320,height:840});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath("color-pilot-320.png"),fullPage:true});
});
test("expert secondary direction, grey coverage and regional correction retain distinct evidence",async({page})=>{
 test.setTimeout(120000);await colorPilotFixture(page,{variation:true});
 const picker=page.getByRole("region",{name:"Hızlı hedef oluşturucu"});await picker.getByRole("button",{name:"Bakır",exact:true}).click();
 await page.getByLabel("Çalışma türü").selectOption("COLOR_CORRECTION");await page.getByLabel("Genel amaç").selectOption("CORRECT");
 const regions=page.locator(".salon-region-editor"),root=regions.filter({has:page.locator("legend",{hasText:/^Dip/})});
 await root.getByLabel("İkincil ton yönü",{exact:true}).selectOption("GOLD_WARM");await root.getByLabel("Beyaz önceliği",{exact:true}).selectOption("COVER");
 await root.getByText("Ayrıntılı bölgesel ayarlar",{exact:true}).click();
 await root.getByLabel("Düzeltme",{exact:true}).selectOption("BAND");await root.getByLabel("Ara hedef seviye",{exact:true}).fill("6");
 const p=await generatePilotPlan(page);expect(p.result.status).toBe("DRAFT");expect(new Set(p.result.regions.map((r:{currentLevel:number})=>r.currentLevel)).size).toBe(2);expect(p.result.regions.some((r:{separateHandling:boolean})=>r.separateHandling)).toBe(true);
 expect(p.result.targetInterpretation.regions.some((r:{tones:string[];greyIntent:string})=>r.tones.includes("COPPER")&&r.tones.includes("GOLD_WARM")&&r.greyIntent==="COVER")).toBe(true);
});
test("high risk remains a useful recovery result without a normal executable recipe",async({page})=>{
 test.setTimeout(120000);await colorPilotFixture(page,{high:true});await page.getByRole("region",{name:"Hızlı hedef oluşturucu"}).getByRole("button",{name:"Soğuk sarı",exact:true}).click();
 const p=await generatePilotPlan(page);expect(p.result.status).not.toBe("DRAFT");expect(p.result.safetyGate.canProgress).toBe(false);expect(p.result.recipeDraft).toBeNull();await expect(page.getByText("Ön koşullar tamamlanmadan normal uygulama planı ve reçete oluşturulmaz.")).toBeVisible();
});
test("lighter target requires a qualified strand test even with other physical evidence",async({page})=>{
 test.setTimeout(120000);await colorPilotFixture(page,{strand:false});const picker=page.getByRole("region",{name:"Hızlı hedef oluşturucu"});await picker.getByLabel("Hedef derinlik",{exact:true}).selectOption("8");await picker.getByRole("radio",{name:"Altın / sıcak",exact:true}).check();await picker.getByRole("button",{name:"Yapılandırılmış hedefi uygula"}).click();
 const p=await generatePilotPlan(page);expect(p.result.status).toBe("REQUIRES_TEST");expect(p.result.recipeDraft).toBeNull();expect(p.result.requiredPhysicalTests.some((t:{type:string;status:string})=>t.type==="STRAND"&&t.status!=="SATISFIED")).toBe(true);
});
test("multi-session retains the desired target and makes reassessment an explicit next step",async({page})=>{
 test.setTimeout(120000);await colorPilotFixture(page,{current:4});await page.getByRole("region",{name:"Hızlı hedef oluşturucu"}).getByRole("button",{name:"Bej sarı",exact:true}).click();
 const p=await generatePilotPlan(page);expect(p.result.feasibility).toBe("MULTI_SESSION");expect(p.result.targetInterpretation.regions.every((r:{level:number})=>r.level===9)).toBe(true);await page.getByRole("navigation",{name:"ColorLab çalışma adımları"}).getByRole("button",{name:"Strateji",exact:true}).click();await expect(page.getByText("Seanslar arasında yeniden değerlendirme",{exact:true})).toBeVisible();await expect(page.getByText(/Ulaşılabilir ara hedefi tutam testi/)).toBeVisible();
});
