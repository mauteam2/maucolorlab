import "server-only";
import { createClient } from "@/lib/supabase/server";
import { AccessError, bootstrap } from "@/lib/tenant/bootstrap";
import { acceptanceCommand, invitationAcceptanceResult, invitationErrorStatus, invitationId, invitationReadResult } from "./model";

// No active workspace prerequisite: the invitee has identity, not tenant access.
async function identityClient() {
  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    if (error && (error.status === 0 || (error.status ?? 0) >= 500)) throw new AccessError("NETWORK_ERROR", 503);
    throw new AccessError(error?.name === "AuthSessionMissingError" ? "UNAUTHENTICATED" : "SESSION_EXPIRED", 401);
  }
  if (["staging", "pilot", "production"].includes(process.env.ELIFORA_DEPLOYMENT_ENV ?? "")) {
    try { const { databaseReleaseStatus } = await import("@/lib/pilot/release"); await databaseReleaseStatus(); }
    catch { throw new AccessError("RELEASE_NOT_READY", 503); }
  }
  return client;
}
function checkReply(reply: { error: { code?: string } | null; status?: number; data: unknown }) {
  if (reply.status === 401 || reply.error?.code === "PT401") throw new AccessError("SESSION_EXPIRED", 401);
  if (reply.status === 403 || reply.error?.code === "42501") throw new AccessError("FORBIDDEN", 403);
  if (reply.error) throw new AccessError("NETWORK_ERROR", 503);
  if (reply.data && typeof reply.data === "object" && "code" in reply.data) {
    const code = String(reply.data.code);
    if (Object.hasOwn(invitationErrorStatus, code)) throw new AccessError(code, invitationErrorStatus[code] ?? 503);
    throw new AccessError("NETWORK_ERROR", 503);
  }
}
export async function readMyInvitations(id?: string) {
  if (id !== undefined && !invitationId.safeParse(id).success) throw new AccessError("VALIDATION_FAILED", 400);
  const client = await identityClient();
  const reply = await client.rpc("read_my_membership_invitations", { p_membership_id: id ?? null });
  checkReply(reply);
  const result = invitationReadResult.safeParse(reply.data);
  if (!result.success || (id !== undefined ? result.data.data.length !== 1 || result.data.data[0]?.membership_id !== id : result.data.data.some(v => v.status !== "invited"))) throw new AccessError("NETWORK_ERROR", 503);
  return result.data;
}
export async function acceptMyInvitation(raw: unknown, correlationId: string) {
  const command = acceptanceCommand.safeParse(raw);
  if (!command.success || !invitationId.safeParse(correlationId).success) throw new AccessError("VALIDATION_FAILED", 400);
  const client = await identityClient();
  const reply = await client.rpc("accept_my_membership_invitation", {
    p_membership_id: command.data.membership_id, p_request_id: command.data.request_id, p_correlation_id: correlationId,
  });
  checkReply(reply);
  const result = invitationAcceptanceResult.safeParse(reply.data);
  if (!result.success || result.data.correlationId !== correlationId || result.data.data.membership_id !== command.data.membership_id || result.data.data.state !== "ACTIVE") throw new AccessError("NETWORK_ERROR", 503);
  // Fresh normal DB-derived contexts; never fabricate permissions, select a
  // workspace locally or redirect using an invitation's client-supplied scope.
  const workspaces = await bootstrap();
  return { ...result.data, workspaces };
}
