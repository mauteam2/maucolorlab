import { cleanup,fireEvent,render,screen,waitFor,within } from "@testing-library/react";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { hairSnapshot } from "@/lib/hair-passport/contracts";
import { goldenInput } from "@/test/confidence-fixtures";
import { readFixtures } from "@/test/hair-passport-fixtures";
import { evaluateConfidence } from "@/lib/confidence/engine";
import { evaluateRisk } from "@/lib/risk/engine";
import { crmFixture } from "@/test/crm-fixtures";
import { workspaceReference } from "@/lib/tenant/context";
import { hairTr as t } from "@/lib/i18n/hair-tr";
const loader=vi.hoisted(()=>vi.fn());
vi.mock("@/lib/hair-passport/load",()=>({loadPassport:loader}));
import { CurrentHairFacts,RegionEvidenceMap } from "./hair-facts";
import { EvidenceAssessment } from "./assessment";
import { ClientTechnicalSummary } from "./client-technical-summary";
import { ClientColorJourney,visibleTechnicalEvents } from "./color-journey";
import { RecordsDisclosure } from "./records-disclosure";
import type { z } from "zod";
import type { clientTimelineEvent } from "@/lib/crm/model";
const snapshot=()=>hairSnapshot.parse(structuredClone(readFixtures.populated.data));
beforeEach(()=>{vi.spyOn(document,"hidden","get").mockReturnValue(false);loader.mockReset();});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
it("measured zero stays distinct from UNKNOWN, NOT_ASSESSED and NOT_APPLICABLE",()=>{
 const s=snapshot();if(s.core.state!=="ASSESSED")throw Error();Object.assign(s.core.observation,{grey_ratio:{state:"KNOWN",value:0},perceived_level:{state:"UNKNOWN",value:null},porosity:{state:"NOT_ASSESSED",value:null},tone:{state:"NOT_APPLICABLE",value:null}});
 render(<CurrentHairFacts assessment={s.core}/>);
 for(const [field,value] of [["grey_ratio","%0"],["perceived_level",t.states.UNKNOWN],["porosity",t.states.NOT_ASSESSED],["tone",t.states.NOT_APPLICABLE]] as const)expect(screen.getByText(t.fields[field]).nextElementSibling).toHaveTextContent(value);
});
it("unverified values remain explicit recorded facts, without invented provenance",()=>{
 const s=snapshot();if(s.core.state!=="ASSESSED")throw Error();render(<CurrentHairFacts assessment={{state:"UNVERIFIED",values:s.core.observation}}/>);expect(screen.getByText(t.fields.natural_level).nextElementSibling).toHaveTextContent("5");expect(screen.queryByText(t.sources.PROFESSIONAL_VERIFIED)).toBeNull();
});
it("regional current evidence is an anchor map, never a target swatch or guessed hair color",()=>{
 const s=snapshot();render(<RegionEvidenceMap snapshot={s}/>);const map=screen.getByLabelText("Bölgesel saç değerlendirmesi");expect(within(map).getAllByRole("link")).toHaveLength(s.regions.length);for(const r of s.regions)expect(map.querySelector(`[href="#region-${r.id}"]`)).not.toBeNull();expect(map.querySelectorAll("img,.cl-hair-swatch")).toHaveLength(0);expect(map).toHaveTextContent("fotoğraf veya renk simülasyonu değildir");
});
function assessmentFixture(change:Parameters<typeof goldenInput>[0]={}){
 const input=goldenInput(change),confidence=evaluateConfidence(input),risk=evaluateRisk(input,confidence),context=crmFixture().context;
 const fetcher=vi.fn(async(url:string)=>new Response(JSON.stringify(url==="/api/session"?{context}:{data:url.includes("/confidence")?confidence:risk})));
 vi.stubGlobal("fetch",fetcher);return {input,confidence,risk,context,fetcher,reference:workspaceReference(context)};
}
it("confidence and risk are separate authoritative bands with no success score",async()=>{
 const f=assessmentFixture();render(<EvidenceAssessment snapshot={f.input.pages[0]!} reference={f.reference}/>);await screen.findByText("Kanıt güveni");expect(screen.getByText("Teknik risk")).toBeVisible();expect(screen.getByText("Teknik planlamaya geçilebilir")).toBeVisible();expect(screen.queryByText(/başarı.*%/)).toBeNull();expect(f.fetcher).toHaveBeenCalledTimes(3);
});
it("authoritative conflicting and stale field evidence remains discoverable",async()=>{
 const f=assessmentFixture({testAgeDays:45,conflict:{field:"perceived_level",value:9}});expect(f.confidence.conflicts.length).toBeGreaterThan(0);expect(f.confidence.staleEvidence.length).toBeGreaterThan(0);
 render(<EvidenceAssessment snapshot={f.input.pages[0]!} reference={f.reference}/>);await screen.findByText(`${f.confidence.conflicts.length} çelişkili kanıt`);expect(screen.getByText(`${f.confidence.staleEvidence.length} güncelliğini yitirmiş kanıt`)).toBeVisible();fireEvent.click(screen.getByText("Çelişki ve güncellik ayrıntıları"));expect(screen.getAllByText(/Çelişkili kanıt ·/).length).toBeGreaterThan(0);
});
it("an insufficient dossier never borrows a low-risk label as permission to continue",async()=>{
 const f=assessmentFixture({minimal:true});render(<EvidenceAssessment snapshot={f.input.pages[0]!} reference={f.reference}/>);expect(await screen.findByText("Eksik bilgi nedeniyle planlama durduruldu")).toBeVisible();expect(screen.getByText("Yetersiz")).toBeVisible();
});
it.each(["version","workspace","permission"])("rejects an assessment after %s authority changes",async(change)=>{
 const f=assessmentFixture();if(change==="version")f.confidence.passportVersion++;if(change==="workspace")f.context.location_id=crypto.randomUUID();if(change==="permission")f.context.permissions=[];
 render(<EvidenceAssessment snapshot={f.input.pages[0]!} reference={f.reference}/>);await screen.findByText(/Kanıt değerlendirmesi doğrulanamadı/);expect(screen.queryByText("Teknik planlamaya geçilebilir")).toBeNull();
});
it("a delayed old assessment cannot fill a replacement dossier",async()=>{
 const f=assessmentFixture();let release=()=>{};const pending=new Promise<Response>(resolve=>release=()=>resolve(new Response(JSON.stringify({data:f.confidence}))));f.fetcher.mockImplementation(async(url:string)=>url.includes("confidence")?pending:new Response(JSON.stringify(url==="/api/session"?{context:f.context}:{data:f.risk})));
 const view=render(<EvidenceAssessment snapshot={f.input.pages[0]!} reference={f.reference}/>);await waitFor(()=>expect(f.fetcher).toHaveBeenCalledTimes(2));const replacement=structuredClone(f.input.pages[0]!);replacement.passport.id=crypto.randomUUID();view.rerender(<EvidenceAssessment snapshot={replacement} reference={f.reference}/>);release();await screen.findByText(/Kanıt değerlendirmesi doğrulanamadı/);expect(screen.queryByText("Teknik planlamaya geçilebilir")).toBeNull();
});
it("reception without technical permission makes no passport read or technical handoff",async()=>{
 render(<ClientTechnicalSummary clientId={snapshot().passport.client_id} reference="scope" permissions={["clients.read","crm.read"]}/>);await Promise.resolve();expect(loader).not.toHaveBeenCalled();expect(screen.queryByLabelText("Müşterinin teknik dosya özeti")).toBeNull();
});
it("the profile summary keeps ColorLab conditional and does not imply technical readiness",async()=>{
 const s=snapshot();loader.mockResolvedValue({snapshot:s,workspaceReference:"scope",client:{id:s.passport.client_id}});render(<ClientTechnicalSummary clientId={s.passport.client_id} reference="scope" permissions={["clients.read","hair_passport.read"]}/>);await screen.findByText("Mevcut saçın kayıtlı kanıtı");expect(screen.getByRole("link",{name:/Hair Passport/})).toHaveAttribute("href",`/workspace/clients/${s.passport.client_id}/hair-passport`);expect(screen.queryByRole("link",{name:/ColorLab/})).toBeNull();expect(screen.getByText(/Kayıt bulunması güvenlik/)).toBeVisible();
});
it("the profile immediately conceals an old technical snapshot when client identity changes",async()=>{
 const s=snapshot();loader.mockResolvedValueOnce({snapshot:s,workspaceReference:"scope",client:{id:s.passport.client_id}}).mockImplementation(()=>new Promise(()=>{}));const view=render(<ClientTechnicalSummary clientId={s.passport.client_id} reference="scope" permissions={["hair_passport.read"]}/>);await screen.findByText("Mevcut saçın kayıtlı kanıtı");view.rerender(<ClientTechnicalSummary clientId={crypto.randomUUID()} reference="scope" permissions={["hair_passport.read"]}/>);expect(screen.queryByText("Mevcut saçın kayıtlı kanıtı")).toBeNull();
});
const event=(domain:z.infer<typeof clientTimelineEvent>["source_domain"],visibility:z.infer<typeof clientTimelineEvent>["visibility"]="TECHNICAL"):z.infer<typeof clientTimelineEvent>=>({event_key:crypto.randomUUID(),event_type:"CREATED",timestamp:"2026-10-20T12:00:00Z",source_domain:domain,source_id:crypto.randomUUID(),source_client_id:snapshot().passport.client_id,actor_id:null,summary:`Synthetic ${domain}`,visibility});
it("technical journey filtering excludes notes, private management and unauthorized domains",()=>{
 const events=[event("hair_history"),event("color_plan"),event("live_session"),event("client_note","PRIVATE_MANAGEMENT"),event("color_plan","PRIVATE_MANAGEMENT")];expect(visibleTechnicalEvents(events,["hair_passport.read"])).toEqual([events[0]]);expect(visibleTechnicalEvents(events,["color_plan.read","live_session.view"])).toEqual([events[1],events[2]]);
});
it("the bounded dated journey links source records without claiming a successful outcome",async()=>{
 const events=[event("live_session"),event("color_plan"),event("client_note","PRIVATE_MANAGEMENT")],read=vi.fn().mockResolvedValue({items:events,has_more:true,offset:0});render(<ClientColorJourney clientId={snapshot().passport.client_id} permissions={["live_session.view","color_plan.read"]} read={read} onTimeline={vi.fn()}/>);await screen.findByText("Synthetic live_session");expect(screen.queryByText("Synthetic client_note")).toBeNull();expect(screen.getAllByRole("link",{name:/Kaynak kaydı aç/})).toHaveLength(2);expect(screen.getByText(/Tamamlanan hizmet, başarılı renk sonucu anlamına gelmez/)).toBeVisible();expect(read).toHaveBeenCalledWith({operation:"timeline",client_id:snapshot().passport.client_id,offset:0,limit:20});
});
it("mobile record disclosure has an intentional native keyboard-accessible control",async()=>{
 vi.stubGlobal("matchMedia",vi.fn(()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()})));render(<RecordsDisclosure label="3 fiziksel test"><p>Kaynak ayrıntısı</p></RecordsDisclosure>);const summary=screen.getByText("3 fiziksel test"),details=summary.closest("details")!;await waitFor(()=>expect(details.open).toBe(false));fireEvent.click(summary);await waitFor(()=>expect(details.open).toBe(true));expect(screen.getByText("Kaynak ayrıntısı")).toBeVisible();
});
