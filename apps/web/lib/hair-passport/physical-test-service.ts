import "server-only";
import { AccessError } from "@/lib/tenant/bootstrap";
import { verifiedClientContext } from "@/lib/clients/service";
import { workspaceReference } from "@/lib/tenant/context";
import { createClient } from "@/lib/supabase/server";
import { physicalTestCommand, physicalTestResult, physicalTestErrorStatus, physicalTestValidationCode } from "./physical-tests";

export async function addHairPhysicalTest(input: unknown, correlationId: string, expectedReference?: string | null) {
 const request = physicalTestCommand.safeParse(input);
 if (!request.success) throw new AccessError(physicalTestValidationCode(input), 400);
 const context = await verifiedClientContext("hair_passport.add_test");
 if (expectedReference !== workspaceReference(context)) throw new AccessError("TENANT_CONTEXT_INVALID", 403);
 const client = await createClient();
 const { data: identity, error: authError } = await client.auth.getUser();
 if (authError || !identity.user) {
  const network = authError && (authError.status === 0 || (authError.status ?? 0) >= 500);
  throw new AccessError(network ? "NETWORK_ERROR" : "SESSION_EXPIRED", network ? 503 : 401);
 }
 const actor = identity.user.id;
 const { data, error, status } = await client.rpc("hair_physical_test_operation", {
  p_membership_id: context.membership_id, p_location_id: context.location_id, p_client_id: request.data.client_id,
  p_payload: request.data.payload, p_correlation_id: correlationId,
 });
 if (error) throw new AccessError(status === 401 ? "SESSION_EXPIRED" : status === 403 ? "FORBIDDEN" : "NETWORK_ERROR", status === 401 ? 401 : status === 403 ? 403 : 503);
 const parsed = physicalTestResult.safeParse(data);
 if (!parsed.success || parsed.data.correlationId !== correlationId) throw new AccessError("NETWORK_ERROR", 503);
 if ("code" in parsed.data) throw new AccessError(parsed.data.code, physicalTestErrorStatus(parsed.data.code));
 const result = parsed.data.data; const test = result.test; const evidence = test.evidence; const payload = request.data.payload;
 if (result.client_id !== request.data.client_id || test.type !== payload.type || test.region_id !== (payload.region_id ?? null) ||
  test.result.state !== payload.result.state || test.result.value !== payload.result.value || test.notes !== (payload.notes ?? null) ||
  test.performed_by !== actor || test.recorded_by !== actor || evidence.recorded_by !== actor ||
  evidence.location_id !== (payload.location_id ?? context.location_id) || evidence.verified_by !== null ||
  evidence.observed_at.state !== "KNOWN" || evidence.observed_at.value !== test.performed_at ||
  test.performed_at !== test.recorded_at || evidence.recorded_at !== test.recorded_at ||
  evidence.confidence.state !== "UNKNOWN" || evidence.relevant_until !== null || evidence.context !== null ||
  test.supersedes_id !== null || evidence.supersedes_id !== null) throw new AccessError("NETWORK_ERROR", 503);
 return parsed.data;
}
