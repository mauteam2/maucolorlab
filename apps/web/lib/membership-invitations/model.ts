import { z } from "zod";

export const invitationId = z.uuid();
export const acceptanceCommand = z.strictObject({ membership_id: invitationId, request_id: invitationId });
export const membershipInvitation = z.strictObject({
  membership_id: invitationId,
  organization_name: z.string().min(1).max(160),
  location_name: z.string().min(1).max(160).nullable(),
  role_code: z.enum(["owner", "manager", "colorist", "assistant", "reception"]),
  status: z.enum(["invited", "active", "revoked"]),
  invited_at: z.iso.datetime({ offset: true }),
  joined_at: z.iso.datetime({ offset: true }).nullable(),
  state: z.enum(["PENDING", "ACTIVE", "REVOKED", "ORGANIZATION_UNAVAILABLE", "LOCATION_UNAVAILABLE"]),
}).refine(v => v.status === "active" ? v.joined_at !== null : v.status !== "invited" || v.joined_at === null)
  .refine(v => v.state === "PENDING" ? v.status === "invited" : v.state === "ACTIVE" ? v.status === "active" : v.state === "REVOKED" ? v.status === "revoked" : v.status !== "revoked");
export const invitationReadResult = z.strictObject({ data: membershipInvitation.array() });
export const invitationAcceptanceResult = z.strictObject({ data: membershipInvitation, correlationId: invitationId });
export const invitationErrorStatus: Record<string, number> = {
  UNAUTHENTICATED: 401, SESSION_EXPIRED: 401, FORBIDDEN: 403, VALIDATION_FAILED: 400,
  INVITATION_NOT_FOUND: 404, INVITATION_REVOKED: 409, INVITATION_UNAVAILABLE: 409, INVITATION_REPLAY_CONFLICT: 409,
};
