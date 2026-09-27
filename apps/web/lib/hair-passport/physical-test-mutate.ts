import { tenantContextSchema, workspaceReference } from "@/lib/tenant/context";
import { physicalTestCommand, physicalTestResult } from "./physical-tests";
import { PassportMutationError } from "./mutate";
import type { z } from "zod";

export async function sendPhysicalTest(input: z.input<typeof physicalTestCommand>, expectedReference: string, signal: AbortSignal) {
 const command = physicalTestCommand.parse(input);
 let session: Response;
 try { session = await fetch("/api/session", { cache: "no-store", signal }); }
 catch { throw new PassportMutationError("NETWORK_ERROR"); }
 if (session.status === 401) throw new PassportMutationError("SESSION_EXPIRED");
 let context;
 try { context = tenantContextSchema.parse((await session.json()).context); }
 catch { throw new PassportMutationError("TENANT_CONTEXT_INVALID"); }
 if (workspaceReference(context) !== expectedReference) throw new PassportMutationError("TENANT_CONTEXT_INVALID");
 if (!context.permissions.includes("hair_passport.add_test")) throw new PassportMutationError("FORBIDDEN");
 let response: Response;
 try {
  response = await fetch(`/api/clients/${command.client_id}/hair-passport/tests`, {
   method: "POST", headers: { "Content-Type": "application/json", "X-Workspace-Reference": expectedReference },
   body: JSON.stringify(command.payload), cache: "no-store", signal,
  });
 } catch { throw new PassportMutationError("NETWORK_ERROR"); }
 if (response.status === 401) throw new PassportMutationError("SESSION_EXPIRED");
 let result;
 try { result = physicalTestResult.parse(await response.json()); }
 catch { throw new PassportMutationError("NETWORK_ERROR"); }
 if ("code" in result) throw new PassportMutationError(result.code);
 if (!response.ok || result.data.client_id !== command.client_id || result.data.test.type !== command.payload.type ||
  result.data.test.region_id !== (command.payload.region_id ?? null) ||
  result.data.test.result.state !== command.payload.result.state ||
  result.data.test.result.value !== command.payload.result.value ||
  result.data.test.evidence.source !== "PHYSICAL_TEST") throw new PassportMutationError("NETWORK_ERROR");
 return result.data;
}
