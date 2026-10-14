import { z } from "zod";

export const syncStates = ["LOCAL", "PENDING_SYNC", "SYNCING", "SYNCED", "CONFLICT", "REJECTED", "REVIEW_REQUIRED", "DEPENDENCY_BLOCKED"] as const;
export const conflictTypes = ["VERSION_CHANGED", "CONTROL_EPOCH_CHANGED", "AUTHORITY_EXPIRED", "WORKSPACE_CHANGED", "PAYLOAD_CHANGED", "DEPENDENCY_FAILED", "AVAILABILITY_CHANGED", "SUBSCRIPTION_CHANGED", "STOCK_CHANGED", "CASH_CHANGED", "VALIDATION_FAILED"] as const;
export const draftDomains = ["HAIR_CORE", "HAIR_OBSERVATION", "HAIR_PHYSICAL_TEST", "HAIR_HISTORY", "LIVE", "CLIENT", "CRM", "APPOINTMENT", "COLOR_TARGET", "STOCK_COUNT", "STOCK_INTAKE", "STOCK_USAGE", "PAYMENT", "EXPENSE", "CASH_CLOSE"] as const;
const id = z.uuid(), timestamp = z.iso.datetime({ offset: true });
export const offlineDraftMetadata = z.strictObject({
 schema_version: z.literal(1), draft_id: id, mutation_id: id, domain: z.enum(draftDomains),
 organization_id: id, location_id: id, user_id: id, device_id: id, membership_id: id,
 workspace_reference: z.string().min(1).max(80), session_id: id.nullable(), entity_id: id.nullable(),
 base_version: z.int().positive().nullable(), control_epoch: z.int().positive().nullable(),
 created_at: timestamp, updated_at: timestamp, payload_hash: z.string().regex(/^[a-f0-9]{64}$/),
 status: z.enum(syncStates), dependencies: id.array().max(10), attempt_count: z.int().nonnegative(),
 next_attempt_at: timestamp.nullable(), conflict: z.enum(conflictTypes).nullable(), correlation_id: id.nullable(),
});
export const offlineDraft = offlineDraftMetadata.extend({ payload: z.unknown() });
export type OfflineDraft = z.infer<typeof offlineDraft>;
export type OfflineIdentity = Pick<OfflineDraft, "organization_id" | "location_id" | "user_id" | "device_id" | "membership_id" | "workspace_reference">;
export type SyncState = typeof syncStates[number];
export type ConflictType = typeof conflictTypes[number];
export const syncResult = z.strictObject({ draft_id: id, status: z.enum(syncStates), conflict: z.enum(conflictTypes).nullable(), correlation_id: id.nullable() });
export function sameScope(a: OfflineIdentity, b: OfflineIdentity) {
 return a.user_id === b.user_id && a.organization_id === b.organization_id && a.location_id === b.location_id && a.device_id === b.device_id && a.membership_id === b.membership_id && a.workspace_reference === b.workspace_reference;
}
export function canonical(value: unknown): string {
 if (value === null || typeof value !== "object") {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("VALIDATION_FAILED");
  return encoded;
 }
 if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
 return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(",")}}`;
}
export async function payloadHash(payload: unknown) {
 const bytes = new TextEncoder().encode(canonical(payload));
 if (bytes.length > 65536) throw new Error("DRAFT_TOO_LARGE");
 const digest = await crypto.subtle.digest("SHA-256", bytes);
 return [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, "0")).join("");
}
export async function makeDraft(identity: OfflineIdentity, domain: OfflineDraft["domain"], payload: unknown, mutationId: string,
 options: Partial<Pick<OfflineDraft, "entity_id" | "session_id" | "base_version" | "control_epoch" | "dependencies">> = {}): Promise<OfflineDraft> {
 const now = new Date().toISOString();
 return offlineDraft.parse({ ...identity, ...options, schema_version: 1, draft_id: mutationId, mutation_id: mutationId, domain,
  session_id: options.session_id ?? null, entity_id: options.entity_id ?? null, base_version: options.base_version ?? null, control_epoch: options.control_epoch ?? null,
  dependencies: options.dependencies ?? [], created_at: now, updated_at: now, payload, payload_hash: await payloadHash(payload),
  status: "LOCAL", attempt_count: 0, next_attempt_at: null, conflict: null, correlation_id: null });
}

// These categories describe intent; none authorizes an offline business commit.
export function classification(domain: OfflineDraft["domain"]) {
 if (["PAYMENT", "EXPENSE", "CASH_CLOSE"].includes(domain)) return "FINANCIAL_ONLINE";
 if (["STOCK_COUNT", "STOCK_INTAKE", "STOCK_USAGE"].includes(domain)) return "REQUIRES_ONLINE_COMMIT";
 return "SAFE_OFFLINE_DRAFT";
}
export function automaticSyncAllowed(domain: OfflineDraft["domain"]) {
 return ["HAIR_CORE", "HAIR_OBSERVATION", "HAIR_PHYSICAL_TEST", "HAIR_HISTORY", "LIVE", "CRM", "APPOINTMENT"].includes(domain);
}
