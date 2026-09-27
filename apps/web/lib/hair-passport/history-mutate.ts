import { tenantContextSchema, workspaceReference } from "@/lib/tenant/context";
import { historyCommand, historyResult } from "./history";
import { PassportMutationError } from "./mutate";
import type { z } from "zod";

export async function sendHistory(input: z.input<typeof historyCommand>, expectedReference: string, signal: AbortSignal) {
 const command = historyCommand.parse(input);
 let session: Response;
 try { session = await fetch("/api/session", { cache: "no-store", signal }); }
 catch { throw new PassportMutationError("NETWORK_ERROR"); }
 if (session.status === 401) throw new PassportMutationError("SESSION_EXPIRED");
 let context;
 try { context = tenantContextSchema.parse((await session.json()).context); }
 catch { throw new PassportMutationError("TENANT_CONTEXT_INVALID"); }
 if (workspaceReference(context) !== expectedReference) throw new PassportMutationError("TENANT_CONTEXT_INVALID");
 if (!context.permissions.includes("hair_passport.add_history")) throw new PassportMutationError("FORBIDDEN");
 let response: Response;
 try {
  response = await fetch(`/api/clients/${command.client_id}/hair-passport/history`, {
   method: "POST", headers: { "Content-Type": "application/json", "X-Workspace-Reference": expectedReference },
   body: JSON.stringify(command.payload), cache: "no-store", signal,
  });
 } catch { throw new PassportMutationError("NETWORK_ERROR"); }
 if (response.status === 401) throw new PassportMutationError("SESSION_EXPIRED");
 let result;
 try { result = historyResult.parse(await response.json()); }
 catch { throw new PassportMutationError("NETWORK_ERROR"); }
 if ("code" in result) throw new PassportMutationError(result.code);
 const history = result.data.history, payload = command.payload;
 if (!response.ok || result.data.client_id !== command.client_id || history.category !== payload.category ||
  history.performed_on.state !== payload.performed_on.state || history.performed_on.value !== payload.performed_on.value ||
  history.product.state !== payload.product.state || history.product.value !== payload.product.value ||
  history.description !== payload.description || history.evidence.source !== payload.evidence.source ||
  JSON.stringify(history.region_ids) !== JSON.stringify([...new Set(payload.region_ids ?? [])].sort())) throw new PassportMutationError("NETWORK_ERROR");
 return result.data;
}
