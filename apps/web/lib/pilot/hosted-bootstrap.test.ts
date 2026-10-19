import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({user:vi.fn(),rpc:vi.fn(),status:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({auth:{getUser:m.user},rpc:m.rpc})}));
vi.mock("@/lib/pilot/release",()=>({databaseReleaseStatus:m.status}));
import {bootstrap} from "@/lib/tenant/bootstrap";
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('ELIFORA_DEPLOYMENT_ENV','pilot');m.user.mockResolvedValue({data:{user:{id:'verified'}}});m.rpc.mockResolvedValue({data:[]});m.status.mockResolvedValue({migrationHead:'20261019121555'});});
it('checks hosted release before granting workspace access',async()=>{expect(await bootstrap()).toEqual([]);expect(m.status).toHaveBeenCalledOnce();expect(m.rpc).toHaveBeenCalledWith('list_workspace_contexts');});
it('stops business context resolution for incomplete migrations or signing/storage mismatch',async()=>{m.status.mockRejectedValue(new Error('private'));await expect(bootstrap()).rejects.toMatchObject({code:'RELEASE_NOT_READY',status:503});expect(m.rpc).not.toHaveBeenCalled();});
it('does not expose configuration without authoritative authentication',async()=>{m.user.mockResolvedValue({data:{user:null},error:{status:401}});await expect(bootstrap()).rejects.toMatchObject({status:401});expect(m.status).not.toHaveBeenCalled();});
