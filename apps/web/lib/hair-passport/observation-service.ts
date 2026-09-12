import "server-only";
import { AccessError } from "@/lib/tenant/bootstrap";
import { verifiedClientContext } from "@/lib/clients/service";
import { workspaceReference } from "@/lib/tenant/context";
import { createClient } from "@/lib/supabase/server";
import { observationCommand, observationResult, observationErrorStatus, observationValidationCode } from "./observations";

export async function addHairObservation(input: unknown, correlationId: string, expectedReference?: string | null) {
 const request = observationCommand.safeParse(input);
 if (!request.success) throw new AccessError(observationValidationCode(input), 400);
 const context = await verifiedClientContext("hair_passport.add_observation");
 if (expectedReference !== workspaceReference(context)) throw new AccessError("TENANT_CONTEXT_INVALID", 403);
 const client = await createClient();
 const { data: identity, error: authError } = await client.auth.getUser();
 if (authError || !identity.user) throw new AccessError(authError && (authError.status === 0 || (authError.status ?? 0) >= 500) ? "NETWORK_ERROR" : "SESSION_EXPIRED", authError && (authError.status === 0 || (authError.status ?? 0) >= 500) ? 503 : 401);
 const actor = identity.user.id;
 const { data, error, status } = await client.rpc("hair_observation_operation", {
  p_membership_id: context.membership_id, p_location_id: context.location_id, p_client_id: request.data.client_id,
  p_payload: request.data.payload, p_correlation_id: correlationId,
 });
 if (error) throw new AccessError(status === 401 ? "SESSION_EXPIRED" : status === 403 ? "FORBIDDEN" : "NETWORK_ERROR", status === 401 ? 401 : status === 403 ? 403 : 503);
 const parsed = observationResult.safeParse(data);
 if (!parsed.success || parsed.data.correlationId !== correlationId) throw new AccessError("NETWORK_ERROR", 503);
 if ("code" in parsed.data) throw new AccessError(parsed.data.code, observationErrorStatus(parsed.data.code));
 const result = parsed.data.data; const evidence = result.observation.evidence;
 if (result.client_id !== request.data.client_id || result.target_version !== request.data.payload.expected_version + 1 ||
  result.observation.region_id !== (request.data.payload.region_id ?? null) || evidence.source !== request.data.payload.evidence.source ||
  evidence.location_id !== context.location_id || evidence.recorded_by !== actor || result.observation.recorded_by !== actor ||
  (evidence.source === "PROFESSIONAL_VERIFIED" && (evidence.verified_by !== actor || evidence.observed_at.state !== "KNOWN" || evidence.observed_at.value !== evidence.recorded_at)))
  throw new AccessError("NETWORK_ERROR", 503);
 return parsed.data;
}
