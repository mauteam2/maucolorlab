import { z } from "zod";
import { tenantContextSchema, workspaceReference } from "@/lib/tenant/context";
import { offlineDraft, payloadHash, sameScope, type OfflineDraft, type OfflineIdentity } from "./model";

const identitySchema = z.strictObject({ user_id: z.uuid(), device_id: z.uuid(), key: z.string().regex(/^[a-f0-9]{64}$/), context: tenantContextSchema });
export type DraftVault = { identity: OfflineIdentity; key: CryptoKey; generation: number };
let generation = 0, active: DraftVault | null = null;
let unlocking: Promise<DraftVault> | null = null;
export function offlineDeviceId() {
 const existing = localStorage.getItem("elifora-offline-device");
 if (existing && z.uuid().safeParse(existing).success) return existing;
 const id = crypto.randomUUID(); localStorage.setItem("elifora-offline-device", id); return id;
}
// Decryption keys live in memory only. Account B cannot decrypt account A's
// ciphertext. Reload/sign-in requires fresh authenticated membership resolution.
export function lockDraftVault() { generation++; active = null; unlocking = null; }
export function currentVault() { return active; }
export function unlockDraftVault(signal?: AbortSignal): Promise<DraftVault> {
 if (unlocking) return unlocking;
 const pending = resolveDraftVault(signal);
 unlocking = pending;
 void pending.finally(() => { if (unlocking === pending) unlocking = null; }).catch(() => undefined);
 return pending;
}
async function resolveDraftVault(signal?: AbortSignal): Promise<DraftVault> {
 const epoch = generation;
 const r = await fetch(`/api/offline-context?device_id=${offlineDeviceId()}`, { cache: "no-store", signal });
 if (!r.ok) { active = null; throw new Error(r.status === 401 ? "SESSION_EXPIRED" : "AUTHORITY_EXPIRED"); }
 const result = identitySchema.parse(await r.json());
 const bytes = Uint8Array.from(result.key.match(/.{2}/g)!, v => parseInt(v, 16));
 const key = await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
 if (epoch !== generation || document.hidden) throw new Error("AUTHORITY_EXPIRED");
 const identity = { user_id: result.user_id, device_id: result.device_id, organization_id: result.context.organization_id,
  location_id: result.context.location_id, membership_id: result.context.membership_id, workspace_reference: workspaceReference(result.context) };
 if (active && sameScope(active.identity, identity)) return active;
 active = { key, generation: ++generation, identity };
 return active;
}
type Stored = { key: string; scope: string; payload_hash: string; iv: Uint8Array; ciphertext: ArrayBuffer; attachment?: { iv: Uint8Array; ciphertext: ArrayBuffer; type: string } };
function scope(identity: OfflineIdentity) { return [identity.user_id, identity.organization_id, identity.location_id, identity.device_id, identity.membership_id].join(":"); }
function requireVault(vault: DraftVault) {
 if (vault !== active || vault.generation !== generation) throw new Error("AUTHORITY_EXPIRED");
}
function database() { return new Promise<IDBDatabase>((resolve, reject) => {
 const r = indexedDB.open("elifora-offline-intents", 1);
 r.onupgradeneeded = () => { const store = r.result.createObjectStore("drafts", { keyPath: "key" }); store.createIndex("scope", "scope"); };
 r.onsuccess = () => resolve(r.result); r.onerror = () => reject(new Error("DRAFT_STORAGE_UNAVAILABLE"));
}); }
async function records(vault: DraftVault) {
 requireVault(vault); const db = await database();
 try { return await new Promise<Stored[]>((resolve, reject) => {
  const t = db.transaction("drafts"); const r = t.objectStore("drafts").index("scope").getAll(scope(vault.identity));
  r.onsuccess = () => resolve(r.result); r.onerror = () => reject(new Error("DRAFT_STORAGE_UNAVAILABLE"));
 }); } finally { db.close(); }
}
export async function readOfflineDrafts(vault: DraftVault) {
 const stored = await records(vault), drafts: OfflineDraft[] = [];
 for (const record of stored) {
  requireVault(vault);
  const bytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(record.iv), additionalData: new TextEncoder().encode(record.key) }, vault.key, record.ciphertext);
  const draft = offlineDraft.parse(JSON.parse(new TextDecoder().decode(bytes)));
  if (!sameScope(draft, vault.identity) || draft.payload_hash !== await payloadHash(draft.payload)) throw new Error("DRAFT_INTEGRITY_FAILED");
  drafts.push(draft);
 }
 requireVault(vault); return drafts.sort((a, b) => a.created_at.localeCompare(b.created_at));
}
export async function storeOfflineDraft(vault: DraftVault, input: OfflineDraft, photo?: Blob) {
 requireVault(vault); const draft = offlineDraft.parse(input);
 if (!sameScope(draft, vault.identity) || draft.payload_hash !== await payloadHash(draft.payload)) throw new Error("DRAFT_INTEGRITY_FAILED");
 const drafts = await readOfflineDrafts(vault), previous = drafts.find(d => d.draft_id === draft.draft_id);
 if (previous && (previous.payload_hash !== draft.payload_hash || previous.mutation_id !== draft.mutation_id || previous.domain !== draft.domain)) throw new Error("PAYLOAD_CHANGED");
 if (!previous && drafts.length >= 100) throw new Error("DRAFT_STORAGE_LIMIT");
 const iv = crypto.getRandomValues(new Uint8Array(12)), recordKey = `${scope(vault.identity)}:${draft.draft_id}`;
 const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(recordKey) }, vault.key, new TextEncoder().encode(JSON.stringify(draft)));
 let attachment: Stored["attachment"];
 if (photo) {
  if (photo.size > 10 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(photo.type)) throw new Error("DRAFT_TOO_LARGE");
  const photoIv = crypto.getRandomValues(new Uint8Array(12));
  attachment = { iv: photoIv, type: photo.type, ciphertext: await crypto.subtle.encrypt({ name: "AES-GCM", iv: photoIv, additionalData: new TextEncoder().encode(`${recordKey}:attachment`) }, vault.key, await photo.arrayBuffer()) };
 }
 requireVault(vault); const db = await database();
 try { await new Promise<void>((resolve, reject) => {
  requireVault(vault); const t = db.transaction("drafts", "readwrite");
  const store = t.objectStore("drafts"), existing = store.get(recordKey);
  existing.onsuccess = () => {
   const old = existing.result as Stored | undefined;
   if (old && old.payload_hash !== draft.payload_hash) { t.abort(); return; }
   store.put({ key: recordKey, scope: scope(vault.identity), payload_hash: draft.payload_hash, iv, ciphertext, ...(attachment ?? old?.attachment ? { attachment: attachment ?? old?.attachment } : {}) });
  };
  t.oncomplete = () => resolve(); t.onerror = () => reject(new Error("DRAFT_STORAGE_UNAVAILABLE")); t.onabort = t.onerror;
 }); } finally { db.close(); }
 requireVault(vault); window.dispatchEvent(new Event("elifora-drafts-changed"));
}
export async function readOfflineAttachment(vault: DraftVault, id: string) {
 const stored = (await records(vault)).find(record => record.key === `${scope(vault.identity)}:${id}`), attachment = stored?.attachment;
 if (!stored || !attachment) return undefined;
 const bytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(attachment.iv), additionalData: new TextEncoder().encode(`${stored.key}:attachment`) }, vault.key, attachment.ciphertext);
 requireVault(vault); return new Blob([bytes], { type: attachment.type });
}
export async function removeOfflineDraft(vault: DraftVault, id: string) {
 requireVault(vault); const db = await database();
 try { await new Promise<void>((resolve, reject) => {
  const t = db.transaction("drafts", "readwrite"); t.objectStore("drafts").delete(`${scope(vault.identity)}:${id}`);
  t.oncomplete = () => resolve(); t.onerror = () => reject(new Error("DRAFT_STORAGE_UNAVAILABLE"));
 }); } finally { db.close(); }
 window.dispatchEvent(new Event("elifora-drafts-changed"));
}
