import { liveCommand, type LiveCommand } from "./model";
import { makeDraft } from "@/lib/offline/model";
import { currentVault, unlockDraftVault, readOfflineDrafts, storeOfflineDraft, removeOfflineDraft, readOfflineAttachment } from "@/lib/offline/vault";
import { recoverLegacyDrafts, removeSealedLegacy } from "@/lib/offline/legacy";
export type Draft = { key: string; scope: string; command: LiveCommand; createdAt: string; photo?: Blob };
export const draftable = (type: string) => ["NOTE", "USAGE", "MATERIAL_RECONCILE", "CHECKPOINT_RECORD", "PHOTO"].includes(type);
function sessionId(scope: string) { return scope.split(":").at(-1)!; }
async function selected() { return currentVault() ?? await unlockDraftVault(); }
export async function storeDraft(d: Draft, clientId?: string) {
 if (!draftable(d.command.type)) throw new Error("OFFLINE_CRITICAL_OPERATION");
 const command = liveCommand.parse(d.command), vault = await selected();
 if (d.scope.split(":")[0] !== vault.identity.membership_id || d.scope.split(":")[1] !== vault.identity.location_id) throw new Error("TENANT_CONTEXT_INVALID");
 const payload = { command, scope: d.scope };
 const draft = await makeDraft(vault.identity, "LIVE", payload, command.mutation_id, { session_id: sessionId(d.scope), entity_id: clientId ?? null, base_version: command.expected_version, control_epoch: command.control_epoch });
 const old = (await readOfflineDrafts(vault)).find(x => x.draft_id === draft.draft_id);
 await storeOfflineDraft(vault, { ...(old ?? draft), status: "PENDING_SYNC" }, d.photo);
}
export async function readDrafts(scope: string, clientId?: string) {
 const vault = await selected();
 if (clientId) for (const old of await recoverLegacyDrafts(scope)) {
  const command = liveCommand.safeParse(old.command);
  if (!command.success || !draftable(command.data.type)) throw new Error("LEGACY_DRAFT_REVIEW_REQUIRED");
  await storeDraft({ ...old, command: command.data }, clientId);
  await removeSealedLegacy(old.scope, old.key);
 }
 const all = await readOfflineDrafts(vault), result: Draft[] = [];
 for (const d of all) {
  if (d.domain !== "LIVE" || d.status === "SYNCED") continue;
  const payload = d.payload as { command: unknown; scope: string };
  // A tab can be lost. Keep the original command/device/epoch, while allowing
  // the same authenticated membership to inspect this session on its new tab.
  const parts = payload.scope.split(":"), selectedParts = scope.split(":");
  if (parts[0] !== selectedParts[0] || parts[1] !== selectedParts[1] || parts.at(-1) !== selectedParts.at(-1)) continue;
  result.push({ key: d.draft_id, scope, command: liveCommand.parse(payload.command), createdAt: d.created_at, photo: await readOfflineAttachment(vault, d.draft_id) });
 }
 return result;
}
export async function removeDraft(key: string) { await removeOfflineDraft(await selected(), key); }
export function reconcileDraft(d: Draft, version: number, epoch: number) {
 return d.command.expected_version !== version || d.command.control_epoch !== epoch ? "CONFLICT_REVIEW" as const : "READY_FOR_EXPLICIT_SYNC" as const;
}
