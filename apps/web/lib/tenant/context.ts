import { z } from "zod";
export const tenantContextSchema = z.object({
  membership_id: z.uuid(), organization_id: z.uuid(), organization_name: z.string(),
  location_id: z.uuid(), location_name: z.string(),
  role: z.enum(["owner", "manager", "colorist", "assistant", "reception"]),
  membership_status: z.literal("active"), permissions: z.array(z.string()),
});
export type ActiveTenantContext = z.infer<typeof tenantContextSchema>;
export const workspaceReference = (context: ActiveTenantContext) => context.membership_id + ":" + context.location_id;
export function resolveSelection(contexts: ActiveTenantContext[], reference?: string) {
  if (reference) return contexts.find((context) => workspaceReference(context) === reference);
  return contexts.length === 1 ? contexts[0] : undefined;
}
export const selectionCookie = "elifora-workspace";
export function selectionError(contexts: ActiveTenantContext[], reference?: string) {
  if (!reference) return "MEMBERSHIP_REQUIRED";
  return contexts.length ? "TENANT_CONTEXT_INVALID" : "MEMBERSHIP_REVOKED";
}
