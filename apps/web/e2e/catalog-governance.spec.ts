import { test,expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir,rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { login,expectReady,seedAccount } from "./local-auth";

test("normal salon owner cannot enter or forge global governance",async({page})=>{
 const account=await seedAccount();try{await login(page,account);await expectReady(page);await page.goto("/internal/catalogs");await expect(page.getByRole("alert").filter({hasText:"yetkili katalog"})).toBeVisible();const r=await page.request.post("/api/admin/catalogs/import",{headers:{origin:"http://127.0.0.1:4173"},data:{operation:"IMPORT",note:"Unauthorized test"}});expect(r.status()).toBe(403);}finally{await account.cleanup();}
});

test("official pilot completes real Auth/RLS governance and renders at 320 px",async({page},info)=>{
 test.setTimeout(180000); // Two browser projects share one versioned global pilot series.
 const lock=join(tmpdir(),"elifora-pilot-browser-governance-lock");let locked=false;
 const start=Date.now();while(!locked&&Date.now()-start<120000){try{await mkdir(lock);locked=true;}catch(e){if((e as NodeJS.ErrnoException).code!=="EEXIST")throw e;await new Promise(r=>setTimeout(r,200));}}
 if(!locked)throw new Error("Pilot governance test lock timed out");
 try{
  const account=await seedAccount();if(!/^[a-f0-9-]{36}$/.test(account.userId))throw new Error("Invalid disposable actor UUID");
  // Existing helper already refuses non-local Supabase. Private assignment is
  // test harness SQL only; no enrollment/backdoor exists in application code.
  execFileSync("docker",["exec","supabase_db_elifora","psql","-U","postgres","-v","ON_ERROR_STOP=1","-c",`insert into app_private.catalog_operators(user_id) values ('${account.userId}'::uuid);`],{stdio:"pipe"});
  await login(page,account);await expectReady(page);await page.goto("/internal/catalogs");
  const terminal=execFileSync("docker",["exec","supabase_db_elifora","psql","-U","postgres","-Atc","select id from public.brand_catalog_releases where pilot_key='schwarzkopf-igora-royal-absolutes' order by version desc limit 1"],{encoding:"utf8"}).trim();
  const api=(id:string|null,operation:string,previous?:string)=>page.request.post(id?`/api/admin/catalogs/${id}/governance`:"/api/admin/catalogs/import",{headers:{origin:"http://127.0.0.1:4173"},data:{operation,note:"Synthetic authenticated development review of official source extraction",...(previous?{previous_id:previous}:{})}});
  if(terminal){const existing=await page.request.get(`/api/brand-catalog/${terminal}/pilot`);expect(existing.status()).toBe(200);const state=(await existing.json()).data.catalog.release.state;if(["DRAFT","TECHNICAL_REVIEW","GOLDEN_TEST","APPROVED"].includes(state))expect((await api(terminal,"REJECT")).status()).toBe(200);}
  const imported=await api(null,"IMPORT",terminal||undefined);expect(imported.status()).toBe(200);const id=(await imported.json()).data.catalogId;
  await page.goto(`/internal/catalogs/${id}`);await expect(page.getByRole("heading",{name:"Resmi kaynaklar"})).toBeVisible();
  expect((await api(id,"PUBLISH")).status()).toBe(409);
  for(const op of ["START_REVIEW","COMPLETE_REVIEW","VALIDATE_GOLDEN","APPROVE","PUBLISH"]){const r=await api(id,op);expect(r.status(),op).toBe(200);}
  await page.reload();await expect(page.getByText(/Sürüm \d+ · PUBLISHED/)).toBeVisible();await expect(page.getByText("29 ton · 2 geliştirici · 58 bağlama bağlı kural")).toBeVisible();await expect(page.getByRole("button",{name:"Kataloğu emekliye ayır"})).toBeDisabled();
  await page.getByLabel("İnceleme / karar notu").fill("Test-only retirement after UI verification");await expect(page.getByRole("button",{name:"Kataloğu emekliye ayır"})).toBeEnabled();
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:info.outputPath("client-catalog-published.png"),fullPage:true});
  await page.screenshot({path:info.outputPath("client-catalog-desktop.png")});
  await page.setViewportSize({width:320,height:900});await expect(page.getByRole("heading",{name:"IGORA ROYAL ABSOLUTES",exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.locator(".salon-table-scroll").evaluate(e=>e.scrollWidth>e.clientWidth)).toBe(true);await page.screenshot({path:info.outputPath("client-catalog-320.png")});await page.screenshot({path:info.outputPath("client-catalog-320-full.png"),fullPage:true});
  const packet=await page.request.get(`/api/brand-catalog/${id}/pilot`);expect(packet.status()).toBe(200);const p=(await packet.json()).data;const source=await page.request.get(`/api/catalog-sources/${p.sources[0].id}`);expect(source.status()).toBe(200);expect((await source.json()).data.verification_status).toBe("ELIFORA_VERIFIED");
  await page.getByRole("button",{name:"Kataloğu emekliye ayır"}).click();await expect(page.getByText(/Sürüm \d+ · RETIRED/)).toBeVisible();
  // Append-only global history retains the synthetic actor until this disposable
  // database is destroyed; deleting it would violate historical attribution.
 }finally{await rmdir(lock);}
});
