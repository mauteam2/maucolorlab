import "server-only";
import { verifiedClientContext } from "@/lib/clients/service";
import { AccessError } from "@/lib/tenant/bootstrap";
import { createClient } from "@/lib/supabase/server";
import { hairReadErrorStatus } from "@/lib/hair-passport/contracts";
import { confidenceRequest, confidenceReadResult } from "./contracts";
import { evaluateConfidence } from "./engine";
import { ConfidenceInputError } from "./model";

export async function readCaseConfidence(clientId: string, options: unknown, correlationId: string) {
 const request = confidenceRequest.safeParse({client_id: clientId, options});
 if (!request.success) throw new AccessError("VALIDATION_FAILED", 400);
 const context = await verifiedClientContext("hair_passport.read");
 if (!context.permissions.includes("clients.read")) throw new AccessError("FORBIDDEN", 403);
 const client = await createClient();
 const {data, error, status} = await client.rpc("hair_confidence_snapshot", {
  p_membership_id: context.membership_id, p_location_id: context.location_id, p_client_id: request.data.client_id,
  p_include_archived: request.data.options.include_archived, p_correlation_id: correlationId,
 });
 if (error) throw new AccessError(status === 401 ? "SESSION_EXPIRED" : status === 403 ? "FORBIDDEN" : "NETWORK_ERROR", status === 401 ? 401 : status === 403 ? 403 : 503);
 const parsed = confidenceReadResult.safeParse(data);
 if (!parsed.success || parsed.data.correlationId !== correlationId) throw new AccessError("CONFIDENCE_INPUT_INVALID", 503);
 if ("code" in parsed.data) throw new AccessError(parsed.data.code, hairReadErrorStatus(parsed.data.code));
 if (parsed.data.data.pages.some(p => p.passport.client_id !== request.data.client_id ||
  (!request.data.options.include_archived && (p.passport.client_status === "ARCHIVED" || p.passport.status === "ARCHIVED")))) throw new AccessError("CONFIDENCE_INPUT_INVALID", 503);
 let assessment;
 try { assessment = evaluateConfidence(parsed.data.data); }
 catch (failure) { if (failure instanceof ConfidenceInputError) throw new AccessError(failure.code, 503); throw failure; }
 // Do not return protected derived data if access/workspace changed during the read/evaluation.
 const current = await verifiedClientContext("hair_passport.read");
 if (!current.permissions.includes("clients.read")) throw new AccessError("FORBIDDEN", 403);
 if (current.membership_id !== context.membership_id || current.organization_id !== context.organization_id || current.location_id !== context.location_id)
  throw new AccessError("TENANT_CONTEXT_INVALID", 403);
 return {data: assessment, correlationId};
}
