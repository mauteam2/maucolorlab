import { tenantContextSchema, workspaceReference } from "@/lib/tenant/context";
import { hairMutationCommand, hairMutationResult, type HairMutationCommand } from "./mutations";

export class PassportMutationError extends Error { constructor(public code: string) { super(code); } }

export async function sendHairMutation(input: HairMutationCommand, expectedReference: string, signal: AbortSignal) {
 const command = hairMutationCommand.parse(input);
 let session: Response;
 try { session = await fetch("/api/session", { cache: "no-store", signal }); }
 catch { throw new PassportMutationError("NETWORK_ERROR"); }
 if (session.status === 401) throw new PassportMutationError("SESSION_EXPIRED");
 let context;
 try { context = tenantContextSchema.parse((await session.json()).context); }
 catch { throw new PassportMutationError("TENANT_CONTEXT_INVALID"); }
 if (workspaceReference(context) !== expectedReference) throw new PassportMutationError("TENANT_CONTEXT_INVALID");
 const permission = command.operation === "create_passport" ? "hair_passport.create" : "hair_passport.update";
 if (!context.permissions.includes(permission)) throw new PassportMutationError("FORBIDDEN");
 const path = `/api/clients/${command.client_id}/hair-passport`;
 const route = command.operation === "create_region" ? `${path}/regions` : command.operation === "update_region" ? `${path}/regions/${command.region_id}` : path;
 const method = command.operation.startsWith("create") ? "POST" : "PATCH";
 const { payload } = command;
 let response: Response;
 try {
  response = await fetch(route, { method, headers: { "Content-Type": "application/json", "X-Workspace-Reference": expectedReference }, body: JSON.stringify(payload), cache: "no-store", signal });
 } catch { throw new PassportMutationError("NETWORK_ERROR"); }
 if (response.status === 401) throw new PassportMutationError("SESSION_EXPIRED");
 let result;
 try { result = hairMutationResult.parse(await response.json()); }
 catch { throw new PassportMutationError("NETWORK_ERROR"); }
 if ("code" in result) throw new PassportMutationError(result.code);
 if (!response.ok || (command.operation.endsWith("passport") && result.data.kind !== "PASSPORT") || (command.operation.endsWith("region") && result.data.kind !== "REGION")) throw new PassportMutationError("NETWORK_ERROR");
 return result.data;
}
