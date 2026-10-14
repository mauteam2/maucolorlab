type Legacy = { key: string; scope: string; command: unknown; createdAt: string; photo?: Blob };
type Sealed = { key: string; scope: string; original_key: string; ephemeral_public_key: string; wrap_iv: string; wrapped_key: string; data_iv: Uint8Array; data: ArrayBuffer; photo?: { iv: Uint8Array; data: ArrayBuffer; type: string } };
const hex = (bytes: ArrayBuffer | Uint8Array) => [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, "0")).join("");
const unhex = (value: string) => Uint8Array.from(value.match(/.{2}/g)!, v => parseInt(v, 16));
function legacyDatabase() { return new Promise<IDBDatabase>((resolve, reject) => {
 const request = indexedDB.open("elifora-live-drafts", 2);
 request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains("drafts")) request.result.createObjectStore("drafts", { keyPath: "key" }); if (!request.result.objectStoreNames.contains("sealed")) request.result.createObjectStore("sealed", { keyPath: "key" }); };
 request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); }; request.onerror = () => reject(new Error("LEGACY_DRAFT_STORAGE_UNAVAILABLE"));
 request.onblocked = () => reject(new Error("LEGACY_DRAFT_STORAGE_BLOCKED"));
}); }
export async function sealLegacyDrafts(publicKey: string) {
 if (indexedDB.databases && !(await indexedDB.databases()).some(d => d.name === "elifora-live-drafts")) return;
 const run = async () => {
  const db = await legacyDatabase();
  try {
   const old = await new Promise<Legacy[]>((resolve, reject) => { const request = db.transaction("drafts").objectStore("drafts").getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
   for (const draft of old) {
    const key = crypto.getRandomValues(new Uint8Array(32)), contentKey = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt"]);
    const ephemeral = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const recipient = await crypto.subtle.importKey("raw", unhex(publicKey), { name: "ECDH", namedCurve: "P-256" }, false, []);
    const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: recipient }, ephemeral.privateKey, 256));
    const suffix = new TextEncoder().encode("elifora/legacy-offline-keywrap/v1"), material = new Uint8Array(shared.length + suffix.length); material.set(shared); material.set(suffix, shared.length);
    const wrapKey = await crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", material), "AES-GCM", false, ["encrypt"]);
    const wrapIv = crypto.getRandomValues(new Uint8Array(12)), dataIv = crypto.getRandomValues(new Uint8Array(12)), id = `${draft.scope}:${draft.key}`;
    const record: Sealed = { key: id, scope: draft.scope, original_key: draft.key, ephemeral_public_key: hex(await crypto.subtle.exportKey("raw", ephemeral.publicKey)), wrap_iv: hex(wrapIv),
     wrapped_key: hex(await crypto.subtle.encrypt({ name: "AES-GCM", iv: wrapIv, additionalData: new TextEncoder().encode(draft.scope) }, wrapKey, key)), data_iv: dataIv,
     data: await crypto.subtle.encrypt({ name: "AES-GCM", iv: dataIv, additionalData: new TextEncoder().encode(id) }, contentKey, new TextEncoder().encode(JSON.stringify({ key: draft.key, scope: draft.scope, command: draft.command, createdAt: draft.createdAt }))) };
    if (draft.photo) {
     const iv = crypto.getRandomValues(new Uint8Array(12)); record.photo = { iv, type: draft.photo.type, data: await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(`${id}:photo`) }, contentKey, await draft.photo.arrayBuffer()) };
    }
    // Same local transaction: retain complete sealed content before deleting its
    // plaintext representation. Nothing is discarded or auto-synced.
    await new Promise<void>((resolve, reject) => { const t = db.transaction(["drafts", "sealed"], "readwrite"); t.objectStore("sealed").put(record); t.objectStore("drafts").delete(draft.key); t.oncomplete = () => resolve(); t.onerror = () => reject(t.error); });
   }
  } finally { db.close(); }
 };
 if (navigator.locks) await navigator.locks.request("elifora-legacy-draft-seal", run); else await run();
}
export async function recoverLegacyDrafts(scope: string): Promise<Legacy[]> {
 if (indexedDB.databases && !(await indexedDB.databases()).some(d => d.name === "elifora-live-drafts")) return [];
 const db = await legacyDatabase();
 try {
  const all = await new Promise<Sealed[]>((resolve, reject) => { const r = db.transaction("sealed").objectStore("sealed").getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  const selected = all.filter(r => r.scope.split(":").slice(0, 2).join(":") === scope.split(":").slice(0, 2).join(":") && r.scope.split(":").at(-1) === scope.split(":").at(-1)), drafts: Legacy[] = [];
  for (const r of selected) {
   const response = await fetch("/api/offline-context", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: r.scope, ephemeral_public_key: r.ephemeral_public_key, iv: r.wrap_iv, wrapped_key: r.wrapped_key }), cache: "no-store" });
   if (!response.ok) throw new Error("AUTHORITY_EXPIRED"); const body = await response.json();
   const key = await crypto.subtle.importKey("raw", unhex(body.key), "AES-GCM", false, ["decrypt"]);
   const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(r.data_iv), additionalData: new TextEncoder().encode(r.key) }, key, r.data);
   const draft = JSON.parse(new TextDecoder().decode(plaintext)) as Legacy;
   if (draft.scope !== r.scope || draft.key !== r.original_key) throw new Error("DRAFT_INTEGRITY_FAILED");
   if (r.photo) draft.photo = new Blob([await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(r.photo.iv), additionalData: new TextEncoder().encode(`${r.key}:photo`) }, key, r.photo.data)], { type: r.photo.type });
   drafts.push(draft);
  }
  return drafts;
 } finally { db.close(); }
}
export async function removeSealedLegacy(scope: string, key: string) {
 const db = await legacyDatabase();
 try { await new Promise<void>((resolve, reject) => { const t = db.transaction("sealed", "readwrite"); t.objectStore("sealed").delete(`${scope}:${key}`); t.oncomplete = () => resolve(); t.onerror = () => reject(t.error); }); } finally { db.close(); }
}
