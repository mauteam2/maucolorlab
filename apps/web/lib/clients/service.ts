import "server-only";
import { cookies } from "next/headers";
import { AccessError, bootstrap } from "@/lib/tenant/bootstrap";
import { resolveSelection, selectionCookie, selectionError } from "@/lib/tenant/context";
import { createClient } from "@/lib/supabase/server";
import { type Command, permissionFor } from "./contracts";

export async function verifiedClientContext(permission = "clients.read") {
  const contexts = await bootstrap();
  const reference = (await cookies()).get(selectionCookie)?.value;
  const context = resolveSelection(contexts, reference);
  if (!context) throw new AccessError(selectionError(contexts, reference), 403);
  if (!context.permissions.includes(permission)) throw new AccessError("FORBIDDEN", 403);
  return context;
}
export async function executeClientCommand(command: Command, correlationId: string) {
  const context = await verifiedClientContext(permissionFor(command.operation));
  const client = await createClient();
  const { data, error, status } = await client.rpc("client_operation", {
    p_membership_id: context.membership_id, p_location_id: context.location_id,
    p_operation: command.operation, p_payload: command.payload, p_correlation_id: correlationId,
  });
  if (error) throw new AccessError(status === 401 ? "SESSION_EXPIRED" : status === 403 ? "FORBIDDEN" : "NETWORK_ERROR", status === 401 ? 401 : status === 403 ? 403 : 503);
  return { ...data, correlationId, ...(data.code ? {} : { context }) };
}
