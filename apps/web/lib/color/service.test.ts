import { beforeEach,expect,it,vi } from "vitest";
import { randomBytes,createHmac } from "node:crypto";
import { colorFixture } from "@/test/color-fixtures";
import { fixtureId } from "@/test/confidence-fixtures";
import { workspaceReference } from "@/lib/tenant/context";
import { evaluateColorPlanning } from "./engine";
import { AccessError } from "@/lib/tenant/bootstrap";
const mocks=vi.hoisted(()=>({context:vi.fn(),rpc:vi.fn(),user:vi.fn()}));
vi.mock("@/lib/clients/service",()=>({verifiedClientContext:mocks.context}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({rpc:mocks.rpc,auth:{getUser:mocks.user}})}));
import { executeColorCommand } from "./service";
const context={membership_id:fixtureId(5),location_id:fixtureId(2),organization_id:fixtureId(6),organization_name:"Synthetic",location_name:"Synthetic",role:"owner" as const,membership_status:"active" as const,
 permissions:["clients.read","hair_passport.read","color_plan.read","color_plan.create"]};
const correlation=fixtureId(500),input=colorFixture(),client=input.target.clientId;
const command={operation:"generate_plan",client_id:client,payload:{request_id:fixtureId(501),target_id:input.target.id}};
const stored={id:fixtureId(502),clientId:client,targetId:input.target.id,createdAt:input.snapshot.evaluatedAt,createdBy:fixtureId(7),result:evaluateColorPlanning(input.snapshot,input.confidence,input.risk,input.target)};
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("ELIFORA_COLOR_PLAN_SIGNING_KEY",randomBytes(32).toString("hex"));mocks.context.mockResolvedValue(context);
 mocks.user.mockResolvedValue({data:{user:{id:fixtureId(7)}},error:null});
 mocks.rpc.mockImplementation(async(_rpc,args)=>({data:{data:args.p_operation==="prepare"?{existing:null,target:input.target,snapshot:input.snapshot,sourceToken:"a".repeat(64)}:stored,correlationId:correlation},error:null,status:200}));});
it("server derives assessments and signs result while keeping caller JWT RPC",async()=>{
 const result=await executeColorCommand(command,correlation,workspaceReference(context));expect(result.data).toEqual(stored);
 expect(mocks.rpc).toHaveBeenCalledTimes(2);const store=mocks.rpc.mock.calls[1]![1];const packet=JSON.parse(store.p_payload.envelope);
 expect(packet).toMatchObject({organizationId:context.organization_id,actorId:fixtureId(7),clientId:client,targetId:input.target.id,result:stored.result});
 expect(store.p_payload.signature).toBe(createHmac("sha256",Buffer.from(process.env.ELIFORA_COLOR_PLAN_SIGNING_KEY!,"hex")).update(store.p_payload.envelope).digest("hex"));
 expect(JSON.stringify(result)).not.toContain(process.env.ELIFORA_COLOR_PLAN_SIGNING_KEY!);expect(mocks.context).toHaveBeenCalledTimes(2);
});
it.each(["risk","confidence","ignoreRisk","evidence","organization_id","actorId","recipeDraft"])("rejects client supplied %s before reading",async field=>{
 await expect(executeColorCommand({...command,payload:{...command.payload,[field]:{}}},correlation,workspaceReference(context))).rejects.toMatchObject({code:"VALIDATION_FAILED"});expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each(["FORBIDDEN","MEMBERSHIP_REVOKED","UNAUTHENTICATED"])("fresh %s denies generation",async code=>{mocks.context.mockRejectedValue(new AccessError(code,403));await expect(executeColorCommand(command,correlation,workspaceReference(context))).rejects.toMatchObject({code});expect(mocks.rpc).not.toHaveBeenCalled();});
it("stale workspace denies write",async()=>{await expect(executeColorCommand(command,correlation,"stale")).rejects.toMatchObject({code:"TENANT_CONTEXT_INVALID"});expect(mocks.rpc).not.toHaveBeenCalled();});
it("missing private signer fails closed before store",async()=>{vi.stubEnv("ELIFORA_COLOR_PLAN_SIGNING_KEY","");await expect(executeColorCommand(command,correlation,workspaceReference(context))).rejects.toMatchObject({code:"COLOR_ENGINE_UNAVAILABLE"});expect(mocks.rpc).toHaveBeenCalledTimes(1);});
it("idempotent generation returns immutable stored snapshot without recomputing",async()=>{mocks.rpc.mockResolvedValue({data:{data:{existing:stored},correlationId:correlation}});expect((await executeColorCommand(command,correlation,workspaceReference(context))).data).toEqual(stored);expect(mocks.rpc).toHaveBeenCalledTimes(1);});
it("revoked access after generation cannot return plan",async()=>{mocks.context.mockResolvedValueOnce(context).mockRejectedValueOnce(new AccessError("MEMBERSHIP_REVOKED",403));await expect(executeColorCommand(command,correlation,workspaceReference(context))).rejects.toMatchObject({code:"MEMBERSHIP_REVOKED"});});
it("workspace switch after compute cannot return previous tenant",async()=>{mocks.context.mockResolvedValueOnce(context).mockResolvedValueOnce({...context,organization_id:fixtureId(999)});await expect(executeColorCommand(command,correlation,workspaceReference(context))).rejects.toMatchObject({code:"TENANT_CONTEXT_INVALID"});});
it.each(["COLOR_PLAN_SOURCE_CONFLICT","TARGET_VERSION_CONFLICT","CLIENT_NOT_FOUND"])("database %s propagates controlled error",async code=>{mocks.rpc.mockResolvedValue({data:{code,message:code,correlationId:correlation}});await expect(executeColorCommand(command,correlation,workspaceReference(context))).rejects.toMatchObject({code});});
it("foreign source is rejected before evaluation or signing",async()=>{mocks.rpc.mockResolvedValue({data:{data:{existing:null,target:{...input.target,clientId:fixtureId(999)},snapshot:input.snapshot,sourceToken:"a".repeat(64)},correlationId:correlation}});await expect(executeColorCommand(command,correlation,workspaceReference(context))).rejects.toMatchObject({code:"COLOR_INPUT_INVALID"});expect(mocks.rpc).toHaveBeenCalledTimes(1);});
