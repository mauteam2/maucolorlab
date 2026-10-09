import "server-only";
import { createClient } from "@/lib/supabase/server";
import { verifiedClientContext } from "@/lib/clients/service";
import { workspaceReference } from "@/lib/tenant/context";
import { AccessError } from "@/lib/tenant/bootstrap";
import { stockCommand,stockReadRequest,stockResult,stockSnapshot,stockPermission } from "./model";
import { z } from "zod";
export function stockStatus(code:string){return ["UNAUTHENTICATED","SESSION_EXPIRED"].includes(code)?401:["FORBIDDEN","MEMBERSHIP_REQUIRED","MEMBERSHIP_REVOKED","TENANT_CONTEXT_INVALID"].includes(code)?403:code==="VALIDATION_FAILED"?400:code==="NETWORK_ERROR"?503:code==="STOCK_NOT_FOUND"?404:409;}
function unwrap(r:{data:unknown;error:unknown}) {if(r.error)throw new AccessError("NETWORK_ERROR",503);const p=z.object({code:z.string().optional(),data:z.unknown().optional()}).safeParse(r.data);if(!p.success)throw new AccessError("NETWORK_ERROR",503);if(p.data.code)throw new AccessError(p.data.code,stockStatus(p.data.code));return p.data.data;}
export async function readStock(raw:unknown,correlationId:string) {
 const q=stockReadRequest.safeParse(raw);if(!q.success)throw new AccessError("VALIDATION_FAILED",400);
 const context=await verifiedClientContext("stock.view"),client=await createClient();
 const parsed=stockSnapshot.safeParse(unwrap(await client.rpc("stock_snapshot",{p_membership_id:context.membership_id,p_location_id:context.location_id,p_request:q.data})));
 if(!parsed.success)throw new AccessError("NETWORK_ERROR",503);const data=parsed.data;
 const rows=[...data.actions,...data.items,...data.lots,...data.movements,...data.events,...data.counts,...data.counts.flatMap(c=>c.lines),...(data.settings?[data.settings]:[])];
 if(rows.some(r=>r.organization_id!==context.organization_id||r.location_id!==context.location_id)||q.data.item_id&&data.items.some(i=>i.id!==q.data.item_id))throw new AccessError("NETWORK_ERROR",503);
 const fresh=await verifiedClientContext("stock.view");if(workspaceReference(fresh)!==workspaceReference(context))throw new AccessError("TENANT_CONTEXT_INVALID",403);
 return {data,context,correlationId};
}
export async function mutateStock(raw:unknown,correlationId:string,reference:string|null){
 const p=stockCommand.safeParse(raw);if(!p.success)throw new AccessError("VALIDATION_FAILED",400);const command=p.data,permission=stockPermission(command.type),context=await verifiedClientContext(permission);
 if(reference!==workspaceReference(context))throw new AccessError("TENANT_CONTEXT_INVALID",403);
 const client=await createClient(),parsed=stockResult.safeParse(unwrap(await client.rpc("stock_operation",{p_membership_id:context.membership_id,p_location_id:context.location_id,p_command:command,p_correlation_id:correlationId})));
 if(!parsed.success)throw new AccessError("NETWORK_ERROR",503);
 if("id" in command&&parsed.data.id!==command.id||command.type==="PROCESS"&&parsed.data.id!==command.event_id)throw new AccessError("NETWORK_ERROR",503);
 const fresh=await verifiedClientContext(permission);if(workspaceReference(fresh)!==reference)throw new AccessError("TENANT_CONTEXT_INVALID",403);
 return {data:parsed.data,context,correlationId};
}
