import { beforeEach,expect,it,vi } from "vitest";
import { fixtureId } from "@/test/confidence-fixtures";
import { brandFixture,orgId,actorId } from "@/test/brand-fixtures";
import { pilotFixture } from "@/test/pilot-fixtures";
import { workspaceReference } from "@/lib/tenant/context";
import { evaluateConfidence } from "@/lib/confidence/engine";
import { evaluateRisk } from "@/lib/risk/engine";
import { evaluateColorPlanning } from "@/lib/color/engine";
import { controlledRecipeOptions } from "./controlled-engine";
const mocks=vi.hoisted(()=>({context:vi.fn(),color:vi.fn(),rpc:vi.fn(),rows:vi.fn(),user:vi.fn(),list:vi.fn()}));
vi.mock("@/lib/clients/service",()=>({verifiedClientContext:mocks.context}));
vi.mock("@/lib/color/service",()=>({executeColorCommand:mocks.color}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({auth:{getUser:mocks.user},rpc:mocks.rpc,from:()=>({select:()=>{const b={eq:()=>b,order:()=>b,limit:mocks.list,maybeSingle:mocks.rows};return b;}})})}));
import { createControlledRecipe,controlledOptionsService,readControlledRecipes,readControlledCatalogs } from "./controlled-service";
const correlation=fixtureId(2),ctx={membership_id:fixtureId(5),location_id:fixtureId(2),organization_id:orgId,organization_name:"Synthetic",location_name:"Synthetic",role:"owner" as const,membership_status:"active" as const,permissions:["clients.read","hair_passport.read","color_plan.read","color_plan.create"]};
function setup(){
 const f=brandFixture(),{packet}=pilotFixture();f.input.target.definition.regions[0]!.level=8;
 for(const page of f.input.snapshot.pages){for(const a of [page.core,...page.regions.map(r=>r.assessment)])if(a.state==="ASSESSED")a.observation.grey_ratio={state:"KNOWN",value:.9};for(const o of page.observations.items)o.grey_ratio={state:"KNOWN",value:.9};}
 const c=evaluateConfidence(f.input.snapshot),plan=evaluateColorPlanning(f.input.snapshot,c,evaluateRisk(f.input.snapshot,c),f.input.target);
 const options=controlledRecipeOptions(plan,packet,f.input.snapshot),candidate=options.candidates[0]!;
 const q={client_id:f.input.target.clientId,plan_id:fixtureId(50),catalog_id:packet.catalog.release.id,request_id:fixtureId(51),product_id:candidate.productId,developer_id:candidate.developerId,color_grams:30.15,supersedes_id:null};
 mocks.context.mockResolvedValue(ctx);mocks.user.mockResolvedValue({data:{user:{id:actorId}},error:null});mocks.rows.mockResolvedValue({data:null,error:null});mocks.list.mockResolvedValue({data:[],error:null});
 mocks.color.mockResolvedValue({data:{id:q.plan_id,clientId:q.client_id,targetId:f.input.target.id,createdAt:plan.evaluatedAt,createdBy:actorId,result:plan}});
 mocks.rpc.mockImplementation(async(name,args)=>({error:null,data:name==="brand_adapter_snapshot"?{data:f.input.snapshot,sourceToken:"a".repeat(64),correlationId:correlation}:name==="catalog_pilot_packet"?packet:{id:fixtureId(52),seriesId:fixtureId(53),version:1,supersedesId:null,clientId:q.client_id,planId:q.plan_id,catalogId:q.catalog_id,createdAt:plan.evaluatedAt,createdBy:actorId,result:JSON.parse(args.p_envelope).result}}));
 return {q,f,packet,plan};
}
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("ELIFORA_COLOR_PLAN_SIGNING_KEY","a".repeat(64));});
it("server re-evaluates context, signs exact quantities and binds actor",async()=>{const {q}=setup();const result=await createControlledRecipe(q,correlation,workspaceReference(ctx));expect(result.data.result.totalGrams).toBe(60.3);expect(result.data.result.executable).toBe(false);const args=mocks.rpc.mock.calls.find(([name])=>name==="controlled_recipe_store")![1];expect(args.p_signature).toMatch(/^[a-f0-9]{64}$/);expect(JSON.parse(args.p_envelope)).toMatchObject({actorId,organizationId:orgId,input:q,result:{selectionOrigin:"PROFESSIONAL_INPUT"}});});
it("workspace mismatch fails before reading customer",async()=>{const {q}=setup();await expect(createControlledRecipe(q,correlation,"stale")).rejects.toMatchObject({code:"TENANT_CONTEXT_INVALID"});expect(mocks.color).not.toHaveBeenCalled();});
it("changed passport cannot reuse old plan",async()=>{const {q,f}=setup();f.input.snapshot.pages[0]!.passport.version++;await expect(controlledOptionsService({client_id:q.client_id,plan_id:q.plan_id,catalog_id:q.catalog_id},correlation,workspaceReference(ctx))).rejects.toMatchObject({code:"COLOR_PLAN_SOURCE_CONFLICT"});});
it("revoked permissions conceal result after storage",async()=>{const {q}=setup();mocks.context.mockResolvedValueOnce(ctx).mockResolvedValueOnce(ctx).mockResolvedValueOnce({...ctx,permissions:[]});await expect(createControlledRecipe(q,correlation,workspaceReference(ctx))).rejects.toMatchObject({code:"TENANT_CONTEXT_INVALID"});});
it("unsigned engine cannot persist",async()=>{const {q}=setup();vi.stubEnv("ELIFORA_COLOR_PLAN_SIGNING_KEY","");await expect(createControlledRecipe(q,correlation,workspaceReference(ctx))).rejects.toMatchObject({code:"COLOR_ENGINE_UNAVAILABLE"});expect(mocks.rpc.mock.calls.some(([name])=>name==="controlled_recipe_store")).toBe(false);});
it.each([["MEMBERSHIP_REVOKED",403],["COLOR_PLAN_NOT_FOUND",404],["TARGET_VERSION_CONFLICT",409]])("database %s retains its access/conflict status",async(code,status)=>{const {q}=setup();const original=mocks.rpc.getMockImplementation()!;mocks.rpc.mockImplementation(async(...args)=>args[0]==="controlled_recipe_store"?{data:{code},error:null}:original(...args));await expect(createControlledRecipe(q,correlation,workspaceReference(ctx))).rejects.toMatchObject({code,status});});
it("idempotency key cannot change quantity or selections",async()=>{const {q}=setup();mocks.rows.mockResolvedValue({data:{client_id:q.client_id,plan_id:q.plan_id,catalog_id:q.catalog_id,product_id:q.product_id,developer_id:q.developer_id,color_grams:31,supersedes_id:null}});await expect(createControlledRecipe(q,correlation,workspaceReference(ctx))).rejects.toMatchObject({code:"CONTROLLED_RECIPE_VERSION_CONFLICT"});expect(mocks.color).not.toHaveBeenCalled();});
it("swapped valid server output is concealed",async()=>{const {q}=setup();const original=mocks.rpc.getMockImplementation()!;mocks.rpc.mockImplementation(async(...args)=>{const r=await original(...args);if(args[0]==="controlled_recipe_store")r.data.result.context.whiteRatio=.91;return r;});await expect(createControlledRecipe(q,correlation,workspaceReference(ctx))).rejects.toMatchObject({code:"BRAND_RESULT_INVALID"});});
it("history read is bounded and missing/foreign record is concealed",async()=>{setup();expect((await readControlledRecipes(fixtureId(1),null,correlation)).data).toEqual([]);expect(mocks.list).toHaveBeenCalledWith(25);await expect(readControlledRecipes(fixtureId(1),fixtureId(2),correlation)).rejects.toMatchObject({code:"BRAND_RECIPE_NOT_FOUND",status:404});});
it("catalog discovery accepts only a validated published projection",async()=>{setup();mocks.list.mockResolvedValue({data:[{id:fixtureId(1),version:3}]});expect((await readControlledCatalogs(correlation)).data).toEqual([{id:fixtureId(1),version:3}]);});
it.each(["white_ratio","executable","developer_grams"])("service rejects forged %s before auth",async field=>{const {q}=setup();await expect(createControlledRecipe({...q,[field]:true},correlation,workspaceReference(ctx))).rejects.toMatchObject({code:"VALIDATION_FAILED"});expect(mocks.context).not.toHaveBeenCalled();});
