import "server-only";
import { AccessError } from "@/lib/tenant/bootstrap";
import { verifiedClientContext } from "@/lib/clients/service";
import { workspaceReference } from "@/lib/tenant/context";
import { createClient } from "@/lib/supabase/server";
import { historyCommand, historyResult, historyErrorStatus, historyValidationCode } from "./history";

export async function addHairHistory(input: unknown, correlationId: string, expectedReference?: string | null) {
 const request = historyCommand.safeParse(input);
 if (!request.success) throw new AccessError(historyValidationCode(input), 400);
 const context = await verifiedClientContext("hair_passport.add_history");
 if (expectedReference !== workspaceReference(context)) throw new AccessError("TENANT_CONTEXT_INVALID", 403);
 const client = await createClient();
 const { data: identity, error: authError } = await client.auth.getUser();
 if (authError || !identity.user) {
  const network = authError && (authError.status === 0 || (authError.status ?? 0) >= 500);
  throw new AccessError(network ? "NETWORK_ERROR" : "SESSION_EXPIRED", network ? 503 : 401);
 }
 const actor = identity.user.id;
 const { data, error, status } = await client.rpc("hair_history_operation", {
  p_membership_id: context.membership_id, p_location_id: context.location_id, p_client_id: request.data.client_id,
  p_payload: request.data.payload, p_correlation_id: correlationId,
 });
 if (error) throw new AccessError(status === 401 ? "SESSION_EXPIRED" : status === 403 ? "FORBIDDEN" : "NETWORK_ERROR", status === 401 ? 401 : status === 403 ? 403 : 503);
 const parsed = historyResult.safeParse(data);
 if (!parsed.success || parsed.data.correlationId !== correlationId) throw new AccessError("NETWORK_ERROR", 503);
 if ("code" in parsed.data) throw new AccessError(parsed.data.code, historyErrorStatus(parsed.data.code));
 const result = parsed.data.data; const history = result.history; const evidence = history.evidence; const payload = request.data.payload;
 const expectedRegions = [...new Set(payload.region_ids ?? [])].sort();
 if (result.client_id !== request.data.client_id || history.category !== payload.category ||
  history.performed_on.state !== payload.performed_on.state || history.performed_on.value !== payload.performed_on.value ||
  history.product.state !== payload.product.state || history.product.value !== payload.product.value ||
  history.description !== payload.description || history.attributed_salon !== (payload.attributed_salon ?? null) ||
  history.attributed_professional !== (payload.attributed_professional ?? null) || history.location_id !== (payload.location_id ?? null) ||
  JSON.stringify(history.region_ids) !== JSON.stringify(expectedRegions) || history.recorded_by !== actor || history.supersedes_id !== null ||
  evidence.source !== payload.evidence.source || evidence.location_id !== (payload.location_id ?? null) || evidence.recorded_by !== actor ||
  evidence.verified_by !== null || evidence.observed_at.state !== "UNKNOWN" || evidence.observed_at.value !== null ||
  evidence.confidence.state !== (payload.evidence.confidence?.state ?? "UNKNOWN") ||
  evidence.confidence.value !== (payload.evidence.confidence?.value ?? null) || evidence.context !== (payload.evidence.context ?? null) ||
  evidence.relevant_until !== null || evidence.supersedes_id !== null) throw new AccessError("NETWORK_ERROR", 503);
 return parsed.data;
}
