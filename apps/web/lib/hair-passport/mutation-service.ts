import "server-only";
import { AccessError } from "@/lib/tenant/bootstrap";
import { verifiedClientContext } from "@/lib/clients/service";
import { workspaceReference } from "@/lib/tenant/context";
import { createClient } from "@/lib/supabase/server";
import { hairMutationCommand, hairMutationResult, hairMutationErrorStatus, hairTechnicalPatch } from "./mutations";

export async function mutateHairPassport(input: unknown, correlationId: string, expectedReference?: string | null) {
 const parsed = hairMutationCommand.safeParse(input);
 if (!parsed.success) {
  const technical = typeof input === "object" && input !== null && "payload" in input &&
   typeof input.payload === "object" && input.payload !== null && "technical" in input.payload ? input.payload.technical : undefined;
  throw new AccessError(technical !== undefined && !hairTechnicalPatch.safeParse(technical).success ? "INVALID_TECHNICAL_STATE" : "VALIDATION_FAILED", 400);
 }
 const command = parsed.data;
 const context = await verifiedClientContext(command.operation === "create_passport" ? "hair_passport.create" : "hair_passport.update");
 if (expectedReference !== workspaceReference(context)) throw new AccessError("TENANT_CONTEXT_INVALID", 403);
 const client = await createClient();
 const { data, error, status } = await client.rpc("hair_core_operation", {
  p_membership_id: context.membership_id, p_location_id: context.location_id, p_client_id: command.client_id,
  p_operation: command.operation, p_payload: { ...command.payload, ...(command.operation === "update_region" ? { region_id: command.region_id } : {}) },
  p_correlation_id: correlationId,
 });
 if (error) throw new AccessError(status === 401 ? "SESSION_EXPIRED" : status === 403 ? "FORBIDDEN" : "NETWORK_ERROR", status === 401 ? 401 : status === 403 ? 403 : 503);
 const result = hairMutationResult.safeParse(data);
 if (!result.success || result.data.correlationId !== correlationId) throw new AccessError("NETWORK_ERROR", 503);
 if ("code" in result.data) throw new AccessError(result.data.code, hairMutationErrorStatus(result.data.code));
 const value = result.data.data;
 if (command.operation === "create_passport" || command.operation === "update_passport") {
  if (value.kind !== "PASSPORT" || value.passport.client_id !== command.client_id ||
   (command.operation === "create_passport" && (value.passport.version !== 1 || value.regions.length !== 3 ||
    new Set(value.regions.map(r => r.type)).size !== 3 || value.regions.some(r => !["ROOT", "MID_LENGTHS", "ENDS"].includes(r.type) || r.version !== 1 || r.status !== "ACTIVE"))) ||
   (command.operation === "update_passport" && (value.passport.version !== command.payload.expected_version + 1 || value.regions.length !== 0)))
   throw new AccessError("NETWORK_ERROR", 503);
 } else if (value.kind !== "REGION" || value.client_id !== command.client_id ||
  (command.operation === "update_region" && (value.region.id !== command.region_id || value.region.version !== command.payload.expected_version + 1)) ||
  (command.operation === "create_region" && (value.region.type !== command.payload.region_type || value.region.version !== 1))) {
  throw new AccessError("NETWORK_ERROR", 503);
 }
 return result.data;
}
