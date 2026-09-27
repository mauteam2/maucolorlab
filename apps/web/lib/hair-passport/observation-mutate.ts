import { tenantContextSchema, workspaceReference } from "@/lib/tenant/context";
import { observationCommand, observationResult } from "./observations";
import { PassportMutationError } from "./mutate";
import type { z } from "zod";

export async function sendObservation(input: z.input<typeof observationCommand>, expectedReference: string, signal: AbortSignal) {
 const command = observationCommand.parse(input);
 let session: Response;
 try { session = await fetch("/api/session", { cache: "no-store", signal }); }
 catch { throw new PassportMutationError("NETWORK_ERROR"); }
 if (session.status === 401) throw new PassportMutationError("SESSION_EXPIRED");
 let context;
 try { context = tenantContextSchema.parse((await session.json()).context); }
 catch { throw new PassportMutationError("TENANT_CONTEXT_INVALID"); }
 if (workspaceReference(context) !== expectedReference) throw new PassportMutationError("TENANT_CONTEXT_INVALID");
 if (!context.permissions.includes("hair_passport.add_observation")) throw new PassportMutationError("FORBIDDEN");
 let response: Response;
 try {
  response = await fetch(`/api/clients/${command.client_id}/hair-passport/observations`, {
   method: "POST", headers: { "Content-Type": "application/json", "X-Workspace-Reference": expectedReference },
   body: JSON.stringify(command.payload), cache: "no-store", signal,
  });
 } catch { throw new PassportMutationError("NETWORK_ERROR"); }
 if (response.status === 401) throw new PassportMutationError("SESSION_EXPIRED");
 let result;
 try { result = observationResult.parse(await response.json()); }
 catch { throw new PassportMutationError("NETWORK_ERROR"); }
 if ("code" in result) throw new PassportMutationError(result.code);
 if (!response.ok || result.data.client_id !== command.client_id || result.data.observation.region_id !== (command.payload.region_id ?? null) ||
  result.data.observation.evidence.source !== "PROFESSIONAL_VERIFIED" || result.data.target_version !== command.payload.expected_version + 1)
  throw new PassportMutationError("NETWORK_ERROR");
 return result.data;
}
