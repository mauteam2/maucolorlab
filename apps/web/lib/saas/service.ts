import "server-only";
import { createClient } from "@/lib/supabase/server";
import { verifiedClientContext } from "@/lib/clients/service";
import { workspaceReference } from "@/lib/tenant/context";
import { AccessError } from "@/lib/tenant/bootstrap";
import { entitlementSnapshot, saasCommand, saasOperationResult } from "./model";
import { throwSaasError } from "./errors";
export async function executeSaas(raw?: unknown, correlationId?: string, reference?: string | null) {
  const command = raw === undefined ? null : saasCommand.safeParse(raw);
  if (command && !command.success) throw new AccessError("VALIDATION_FAILED", 400);
  const permission = command ? "saas.subscription.manage" : "saas.entitlements.read";
  const ctx = await verifiedClientContext(permission);
  if (command && reference !== workspaceReference(ctx)) throw new AccessError("TENANT_CONTEXT_INVALID", 403);
  const client = await createClient();
  const reply = await client.rpc(command ? "saas_operation" : "saas_snapshot", { p_membership_id: ctx.membership_id, p_location_id: ctx.location_id, ...(command?.success ? { p_command: command.data, p_correlation_id: correlationId } : {}) });
  throwSaasError(reply.error);
  if (reply.error) throw new AccessError("NETWORK_ERROR", 503);
  if (reply.data?.code) throw new AccessError(reply.data.code, reply.data.code === "FORBIDDEN" ? 403 : 400);
  const parsed = command ? saasOperationResult.safeParse(reply.data) : entitlementSnapshot.safeParse(reply.data?.data);
  if (!parsed.success) throw new AccessError("NETWORK_ERROR", 503);
  const fresh = await verifiedClientContext(permission);
  if (workspaceReference(fresh) !== workspaceReference(ctx) || fresh.organization_id !== ctx.organization_id || fresh.role !== ctx.role || [...fresh.permissions].sort().join() !== [...ctx.permissions].sort().join()) throw new AccessError("TENANT_CONTEXT_INVALID", 403);
  if (!command) {
    const snapshot = entitlementSnapshot.parse(parsed.data);
    if (snapshot.organization_id !== ctx.organization_id || snapshot.location_id !== ctx.location_id || (snapshot.management_allowed && ctx.role !== "owner")) throw new AccessError("NETWORK_ERROR", 503);
    // Membership location scope is not present in the shared workspace context.
    // Re-read DB authority so a global owner narrowed to one location cannot
    // receive governance fields from an earlier in-flight snapshot.
    const probe = await client.rpc("saas_snapshot", { p_membership_id: fresh.membership_id, p_location_id: fresh.location_id });
    const current = entitlementSnapshot.safeParse(probe.data?.data);
    if (probe.error || !current.success || current.data.organization_id !== snapshot.organization_id || current.data.location_id !== snapshot.location_id || current.data.management_allowed !== snapshot.management_allowed) throw new AccessError("TENANT_CONTEXT_INVALID", 403);
    if (current.data.version !== snapshot.version || current.data.status !== snapshot.status) throw new AccessError("SAAS_VERSION_CONFLICT", 409);
  } else if (saasOperationResult.parse(parsed.data).correlationId !== correlationId) throw new AccessError("NETWORK_ERROR", 503);
  return { data: command ? saasOperationResult.parse(parsed.data).data : parsed.data, context: fresh, correlationId };
}
