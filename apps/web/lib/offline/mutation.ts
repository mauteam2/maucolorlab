import { makeDraft, sameScope, type OfflineDraft } from "./model";
import { currentVault, unlockDraftVault, readOfflineDrafts, storeOfflineDraft } from "./vault";
import { syncFailure } from "./coordinator";

export async function performDraftedMutation<T>(domain: OfflineDraft["domain"], command: { client_id: string; payload: { request_id: string; expected_version?: number } }, reference: string,
 signal: AbortSignal, send: () => Promise<T>): Promise<{ committed: boolean; result?: T }> {
 const vault = currentVault() ?? await unlockDraftVault(signal);
 if (vault.identity.workspace_reference !== reference) throw new Error("TENANT_CONTEXT_INVALID");
 const draft = await makeDraft(vault.identity, domain, command, command.payload.request_id, { entity_id: command.client_id, base_version: command.payload.expected_version ?? null });
 const prior = (await readOfflineDrafts(vault)).find(d => d.draft_id === draft.draft_id);
 if (prior && (!sameScope(prior, draft) || prior.payload_hash !== draft.payload_hash)) throw new Error("PAYLOAD_CHANGED");
 const pending = { ...(prior ?? draft), status: "PENDING_SYNC" as const, updated_at: new Date().toISOString() };
 await storeOfflineDraft(vault, pending);
 if (!navigator.onLine) return { committed: false };
 try {
  const result = await send();
  await storeOfflineDraft(vault, { ...pending, status: "SYNCED", updated_at: new Date().toISOString() });
  return { committed: true, result };
 } catch (error) {
  const code = error instanceof Error ? error.message : "NETWORK_ERROR";
  await storeOfflineDraft(vault, { ...pending, ...syncFailure(code), updated_at: new Date().toISOString() });
  if (code === "NETWORK_ERROR" || code === "AbortError") return { committed: false };
  throw error;
 }
}
