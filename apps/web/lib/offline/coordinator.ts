import { payloadHash, sameScope, automaticSyncAllowed, type ConflictType, type OfflineDraft, type OfflineIdentity } from "./model";
export type DraftStore = { list: () => Promise<OfflineDraft[]>; put: (draft: OfflineDraft) => Promise<void> };
export type Dispatch = (draft: OfflineDraft, signal: AbortSignal) => Promise<{ correlationId?: string }>;
const authority = ["UNAUTHENTICATED", "SESSION_EXPIRED", "FORBIDDEN", "MEMBERSHIP_REVOKED", "MEMBERSHIP_REQUIRED", "AUTHORITY_EXPIRED", "CLIENT_ARCHIVED"];
export function syncFailure(code: string): { status: OfflineDraft["status"]; conflict: ConflictType | null } {
 if (authority.includes(code)) return { status: "REJECTED", conflict: "AUTHORITY_EXPIRED" };
 if (code === "TENANT_CONTEXT_INVALID" || code === "WORKSPACE_CHANGED") return { status: "REJECTED", conflict: "WORKSPACE_CHANGED" };
 if (["SUBSCRIPTION_RESTRICTED", "FEATURE_UNAVAILABLE", "QUOTA_EXCEEDED", "QUOTA_UNKNOWN", "SAAS_UNCONFIGURED"].includes(code)) return { status: "REVIEW_REQUIRED", conflict: "SUBSCRIPTION_CHANGED" };
 if (code === "LIVE_CONTROLLER_CONFLICT") return { status: "CONFLICT", conflict: "CONTROL_EPOCH_CHANGED" };
 if (code === "PAYLOAD_CHANGED") return { status: "REJECTED", conflict: "PAYLOAD_CHANGED" };
 if (/APPOINTMENT.*CONFLICT|AVAILABILITY|SCHEDULE/.test(code) || ["STAFF_DOUBLE_BOOKED", "STAFF_UNAVAILABLE", "STAFF_NOT_ELIGIBLE", "RESOURCE_UNAVAILABLE", "LOCATION_CLOSED", "OUTSIDE_WORKING_HOURS"].includes(code)) return { status: "CONFLICT", conflict: "AVAILABILITY_CHANGED" };
 if (/STOCK.*CONFLICT/.test(code) || code === "STOCK_COUNT_STALE") return { status: "CONFLICT", conflict: "STOCK_CHANGED" };
 if (/CASH.*CONFLICT/.test(code) || code === "CASH_CLOSE_STALE") return { status: "CONFLICT", conflict: "CASH_CHANGED" };
 if (code === "CONFLICT" || code.endsWith("CONFLICT") || code === "HAIR_PASSPORT_ALREADY_EXISTS") return { status: "CONFLICT", conflict: "VERSION_CHANGED" };
 if (["NETWORK_ERROR", "TIMEOUT", "AbortError"].includes(code)) return { status: "PENDING_SYNC", conflict: null };
 return { status: "REJECTED", conflict: "VALIDATION_FAILED" };
}
export class SyncCoordinator {
 private running = false;
 constructor(private store: DraftStore, private dispatch: Dispatch, private freshIdentity: () => Promise<OfflineIdentity>, private clock: () => number = Date.now) {}
 async batch(identity: OfflineIdentity, signal: AbortSignal, limit = 10) {
  if (this.running) throw new Error("SYNC_ALREADY_RUNNING");
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new Error("SYNC_BATCH_LIMIT");
  this.running = true; const results: OfflineDraft[] = [];
  try {
   const drafts = await this.store.list(), states = new Map(drafts.map(d => [d.draft_id, d.status]));
   // A process can end while SYNCING. Replaying the original identity is safe;
   // never allocate a replacement ID or rebase its expected version here.
   const candidates = drafts.filter(d => ["LOCAL", "PENDING_SYNC", "SYNCING", "DEPENDENCY_BLOCKED"].includes(d.status));
   for (const original of candidates) {
    if (results.length >= limit || signal.aborted) break;
    if (original.next_attempt_at && Date.parse(original.next_attempt_at) > this.clock()) continue;
    let draft = { ...original, updated_at: new Date(this.clock()).toISOString() };
    if (!sameScope(draft, identity)) continue;
    const dependencies = draft.dependencies.map(id => states.get(id));
    if (dependencies.some(status => status !== "SYNCED")) {
     draft = { ...draft, status: "DEPENDENCY_BLOCKED", conflict: "DEPENDENCY_FAILED" };
    } else if (!automaticSyncAllowed(draft.domain)) {
     draft = { ...draft, status: "REVIEW_REQUIRED", conflict: null };
    } else {
     try {
      if (!sameScope(identity, await this.freshIdentity())) throw new Error("WORKSPACE_CHANGED");
      if (draft.payload_hash !== await payloadHash(draft.payload)) throw new Error("PAYLOAD_CHANGED");
      draft = { ...draft, status: "SYNCING", attempt_count: draft.attempt_count + 1, conflict: null, next_attempt_at: null };
      await this.store.put(draft);
      const accepted = await this.dispatch(draft, signal);
      // A result arriving after logout/switch cannot be revealed in the new UI.
      if (!sameScope(identity, await this.freshIdentity())) throw new Error("WORKSPACE_CHANGED");
      draft = { ...draft, status: "SYNCED", correlation_id: accepted.correlationId ?? null };
     } catch (error) {
      const code = error instanceof Error ? error.message : "NETWORK_ERROR";
      draft = { ...draft, ...syncFailure(code) };
      if (draft.status === "PENDING_SYNC") draft.next_attempt_at = new Date(this.clock() + Math.min(300000, 1000 * 2 ** Math.min(draft.attempt_count, 8))).toISOString();
     }
    }
    await this.store.put(draft); states.set(draft.draft_id, draft.status); results.push(draft);
   }
   return results;
  } finally { this.running = false; }
 }
}
