import { expect,type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { seedAccount,login,expectReady } from "./local-auth";
export async function colorPilotFixture(page:Page,change:{current?:number;high?:boolean;strand?:boolean;variation?:boolean}={}){
 const account=await seedAccount();await login(page,account);await expectReady(page);
 const context=(await(await page.request.get("/api/session")).json()).context;
 const headers={origin:"http://127.0.0.1:4173","x-workspace-reference":`${context.membership_id}:${context.location_id}`};
 const created=await page.request.post("/api/clients",{headers,data:{operation:"create",payload:{full_name:"Sentetik pilot renk çalışması",phone:"05329994433",request_id:randomUUID()}}});expect(created.ok(),await created.text()).toBe(true);
 const client=(await created.json()).data,base=`/api/clients/${client.id}`;
 const hp=await page.request.post(`${base}/hair-passport`,{headers,data:{request_id:randomUUID()}});expect(hp.ok(),await hp.text()).toBe(true);
 const snapshot=(await(await page.request.get(`${base}/hair-passport`)).json()).data;
 for(const region_id of [null,...snapshot.regions.map((r:{id:string})=>r.id)]){
  const current=(await(await page.request.get(`${base}/hair-passport`)).json()).data;
  const technical={natural_level:{state:"KNOWN",value:change.current??7},perceived_level:{state:"KNOWN",value:change.variation&&region_id===snapshot.regions[0].id?4:change.current??7},grey_ratio:{state:"KNOWN",value:.9},porosity:{state:"KNOWN",value:change.high?"HIGH":"MEDIUM"},elasticity:{state:"KNOWN",value:change.high?"LOW":"NORMAL"},thickness:{state:"KNOWN",value:"FINE"},density:{state:"KNOWN",value:"MEDIUM"},cosmetic_color_history:{state:"KNOWN",value:"Professionally assessed synthetic history"},bleach_history:{state:"KNOWN",value:"Professionally assessed synthetic history"},chemical_history:{state:"KNOWN",value:"Professionally assessed synthetic history"}};
  const expected_version=region_id===null?current.passport.version:current.regions.find((r:{id:string})=>r.id===region_id).version;
  const observed=await page.request.post(`${base}/hair-passport/observations`,{headers,data:{request_id:randomUUID(),expected_version,region_id,technical,evidence:{source:"PROFESSIONAL_VERIFIED",attestation:"PERSONALLY_ASSESSED",confidence:{state:"KNOWN",value:1}}}});expect(observed.ok(),await observed.text()).toBe(true);
  for(const type of ["POROSITY","ELASTICITY",...(change.strand===false?[]:["STRAND"])]){
   const result=type==="POROSITY"?technical.porosity.value:type==="ELASTICITY"?technical.elasticity.value:"Professionally reviewed synthetic strand";
   const tested=await page.request.post(`${base}/hair-passport/tests`,{headers,data:{request_id:randomUUID(),region_id,type,result:{state:"KNOWN",value:result}}});expect(tested.ok(),await tested.text()).toBe(true);
  }
 }
 await page.goto(`/workspace/colorlab?client_id=${client.id}`);
 await expect(page.getByLabel("Renk planı müşterisi")).toHaveValue(client.id);await expect(page.getByRole("region",{name:"Hızlı hedef oluşturucu"})).toBeVisible();
 return {account,client,base,headers};
}
export async function generatePilotPlan(page:Page){
 const response=page.waitForResponse(r=>r.url().endsWith("/color-plans")&&r.request().method()==="POST");
 await page.getByRole("button",{name:"Renk planı oluştur",exact:true}).click();const r=await response;expect(r.ok(),await r.text()).toBe(true);
 const plan=(await r.json()).data;await expect(page.getByRole("region",{name:"Teknik plan sonucu"})).toBeVisible();return plan;
}
