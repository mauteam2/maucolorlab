import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/lib/hair-passport/load",()=>({loadPassport:vi.fn(),PassportLoadError:class extends Error { constructor(public code:string){super(code);} }}));
import { loadPassport } from "@/lib/hair-passport/load";
import { ColorWorkspace } from "./color-workspace";
import { readFixtures } from "@/test/hair-passport-fixtures";
import { hairReadResult } from "@/lib/hair-passport/contracts";
const uuid="00000000-0000-4000-8000-000000000001";
const context={membership_id:uuid,organization_id:uuid,organization_name:"Test salonu",location_id:uuid,location_name:"Merkez",role:"owner",membership_status:"active",permissions:["clients.read","hair_passport.read","color_plan.create"]};
const client={id:readFixtures.populated.data.passport.client_id,full_name:"Sentetik kişi",phone_masked:"05•• ••• •• 67",status:"ACTIVE" as const,updated_at:"2026-10-01T10:00:00Z"};
afterEach(()=>{cleanup();vi.resetAllMocks();vi.unstubAllGlobals();});
function setup(permissions=context.permissions) {
 vi.stubGlobal("fetch",vi.fn(async(url:string)=>({ok:true,status:200,json:async()=>url==="/api/session"?{context:{...context,permissions}}:{context:{...context,permissions},data:{items:[client],has_more:false,offset:0}}})));
 const read=hairReadResult.parse(readFixtures.populated);
 if (!("data" in read)) throw new Error("Invalid test fixture");
 vi.mocked(loadPassport).mockResolvedValue({client:{...client,organization_id:uuid,phone:"+905321234567",phone_normalized:"+905321234567",email:null,birth_date:null,version:1,created_at:client.updated_at,created_by:uuid,updated_by:uuid,creation_location_id:uuid},snapshot:read.data,permissions,workspaceReference:`${uuid}:${uuid}`});
}
it("conceals customer data until fresh verification completes",()=>{
 vi.stubGlobal("fetch",vi.fn(()=>new Promise(()=>{})));
 render(<ColorWorkspace/>);
 expect(screen.queryByText("Sentetik kişi")).toBeNull();expect(screen.getByRole("status")).toHaveTextContent("Güvenli çalışma alanı");
});
it("validates regional targets before sending a mutation and uses existing create permission",async()=>{
 setup();render(<ColorWorkspace/>);
 fireEvent.change(await screen.findByLabelText("Renk planı müşterisi"),{target:{value:client.id}});
 const save=await screen.findByRole("button",{name:"Hedefi kaydet"});expect(save).not.toBeDisabled();
 fireEvent.click(save);expect(await screen.findByRole("alert")).toHaveTextContent("Her aktif bölge");
 expect(vi.mocked(fetch).mock.calls.every(([url])=>url==="/api/session"||url==="/api/clients")).toBe(true);
});
it("keeps target and planning writes disabled for read-only users",async()=>{
 setup(["clients.read","hair_passport.read"]);render(<ColorWorkspace/>);
 fireEvent.change(await screen.findByLabelText("Renk planı müşterisi"),{target:{value:client.id}});
 expect(await screen.findByRole("button",{name:"Hedefi kaydet"})).toBeDisabled();
 expect(screen.getByRole("button",{name:"Renk planı oluştur"})).toBeDisabled();
});
it("orders technical regions by type instead of generated UUID order",async()=>{
 setup();const loaded=await vi.mocked(loadPassport).getMockImplementation()!(client.id,{},new AbortController().signal);
 loaded.snapshot!.regions.reverse();vi.mocked(loadPassport).mockResolvedValue(loaded);
 const view=render(<ColorWorkspace/>);fireEvent.change(await screen.findByLabelText("Renk planı müşterisi"),{target:{value:client.id}});
 await screen.findByRole("button",{name:"Hedefi kaydet"});
 const legends=[...view.container.querySelectorAll(".salon-region-editor legend")].map(e=>e.textContent);
 expect(legends[0]).toMatch(/^Dip/);
});
it("appointment link selects its actual customer after fresh reads without creating a plan",async()=>{
 setup();render(<ColorWorkspace initialClientId={client.id}/>);
 expect(await screen.findByLabelText("Renk planı müşterisi")).toHaveValue(client.id);
 expect(loadPassport).toHaveBeenCalledWith(client.id,{},expect.any(AbortSignal));
 expect(screen.getByRole("button",{name:"Hedefi kaydet"})).toBeVisible();
 expect(vi.mocked(fetch).mock.calls.every(([url])=>url==="/api/session"||url==="/api/clients")).toBe(true);
});
