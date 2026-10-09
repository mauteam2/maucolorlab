import "server-only";
import { createClient } from "@/lib/supabase/server";
import { verifiedClientContext } from "@/lib/clients/service";
import { workspaceReference } from "@/lib/tenant/context";
import { AccessError } from "@/lib/tenant/bootstrap";
import { financeCommand,financeReadRequest,financeResult,financeSnapshot,financePermission } from "./model";
import { z } from "zod";
export function financeStatus(code:string){return ["UNAUTHENTICATED","SESSION_EXPIRED"].includes(code)?401:["FORBIDDEN","MEMBERSHIP_REQUIRED","MEMBERSHIP_REVOKED","TENANT_CONTEXT_INVALID"].includes(code)?403:code==="VALIDATION_FAILED"?400:code==="NETWORK_ERROR"?503:code==="FINANCE_NOT_FOUND"?404:409;}
function unwrap(r:{data:unknown;error:unknown}) {if(r.error)throw new AccessError("NETWORK_ERROR",503);const p=z.object({code:z.string().optional(),data:z.unknown().optional()}).safeParse(r.data);if(!p.success)throw new AccessError("NETWORK_ERROR",503);if(p.data.code)throw new AccessError(p.data.code,financeStatus(p.data.code));return p.data.data;}
export async function readFinance(raw:unknown,correlationId:string) {
 const q=financeReadRequest.safeParse(raw);if(!q.success)throw new AccessError("VALIDATION_FAILED",400);
 const context=await verifiedClientContext("finance.view"),client=await createClient();
 const parsed=financeSnapshot.safeParse(unwrap(await client.rpc("finance_snapshot",{p_membership_id:context.membership_id,p_location_id:context.location_id,p_request:q.data})));
 if(!parsed.success)throw new AccessError("NETWORK_ERROR",503);const data=parsed.data;
 const rows=[...data.documents,...data.allocations,...data.ledger_entries,...data.cash_sessions];
 if(rows.some(r=>r.organization_id!==context.organization_id||r.location_id!==context.location_id)||data.organization_id!==context.organization_id||data.location_id!==context.location_id||q.data.document_id&&data.documents.some(d=>d.id!==q.data.document_id))throw new AccessError("NETWORK_ERROR",503);
 const fresh=await verifiedClientContext("finance.view");if(workspaceReference(fresh)!==workspaceReference(context))throw new AccessError("TENANT_CONTEXT_INVALID",403);
 return {data,context,correlationId};
}
export async function mutateFinance(raw:unknown,correlationId:string,reference:string|null){
 const p=financeCommand.safeParse(raw);if(!p.success)throw new AccessError("VALIDATION_FAILED",400);const command=p.data,permission=financePermission(command.type),context=await verifiedClientContext(permission);
 if(reference!==workspaceReference(context))throw new AccessError("TENANT_CONTEXT_INVALID",403);
 const client=await createClient(),parsed=financeResult.safeParse(unwrap(await client.rpc("finance_operation",{p_membership_id:context.membership_id,p_location_id:context.location_id,p_command:command,p_correlation_id:correlationId})));
 if(!parsed.success)throw new AccessError("NETWORK_ERROR",503);
 if("id" in command&&parsed.data.id!==command.id)throw new AccessError("NETWORK_ERROR",503);
 const fresh=await verifiedClientContext(permission);if(workspaceReference(fresh)!==reference)throw new AccessError("TENANT_CONTEXT_INVALID",403);
 return {data:parsed.data,context,correlationId};
}
