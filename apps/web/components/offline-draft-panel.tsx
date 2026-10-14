"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { SyncCoordinator } from "@/lib/offline/coordinator";
import { dispatchDraft } from "@/lib/offline/dispatch";
import { currentVault, lockDraftVault, unlockDraftVault, readOfflineDrafts, storeOfflineDraft, removeOfflineDraft, type DraftVault } from "@/lib/offline/vault";
import type { OfflineDraft } from "@/lib/offline/model";
const labels: Record<OfflineDraft["status"], string> = { LOCAL: "Yerel taslak", PENDING_SYNC: "Gönderilmeyi bekliyor", SYNCING: "Gönderiliyor", SYNCED: "Sunucu kabul etti", CONFLICT: "Çakışma · inceleyin", REJECTED: "Sunucu reddetti", REVIEW_REQUIRED: "Güncel kayıtla inceleme gerekli", DEPENDENCY_BLOCKED: "Önce bağlı taslağı tamamlayın" };
export function OfflineDraftPanel({ entityId, onSynced }: { entityId?: string; onSynced?: (drafts: OfflineDraft[]) => void }) {
 const [drafts, setDrafts] = useState<OfflineDraft[]>([]), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
 const vault = useRef<DraftVault | null>(null), request = useRef<AbortController | null>(null), epoch = useRef(0);
 const refresh = useCallback(async (authenticate = false) => {
  const g = ++epoch.current;
  try {
   const selected = authenticate ? await unlockDraftVault() : currentVault();
   if (!selected) return;
   const all = await readOfflineDrafts(selected);
   if (g !== epoch.current || document.hidden) return;
   vault.current = selected; setDrafts(all.filter(d => !entityId || d.entity_id === entityId)); setMessage("");
  } catch { if (g === epoch.current) { vault.current = null; setDrafts([]); } }
 }, [entityId]);
 useEffect(() => {
  const generationRef = epoch, requestRef = request;
  let channel: BroadcastChannel | null = null;
  const hide = () => { ++epoch.current; request.current?.abort(); lockDraftVault(); vault.current = null; setDrafts([]); };
  const visibility = () => { if (document.hidden) hide(); else if (navigator.onLine) void refresh(true); };
  const update = () => void refresh();
  const online = () => void refresh(true);
  const logout = () => { hide(); channel?.postMessage("LOCK"); };
  if (typeof BroadcastChannel !== "undefined") { channel = new BroadcastChannel("elifora-offline-privacy"); channel.onmessage = hide; }
  queueMicrotask(() => void refresh(true));
  window.addEventListener("elifora-drafts-changed", update); window.addEventListener("elifora-offline-lock", logout);
  window.addEventListener("online", online); document.addEventListener("visibilitychange", visibility);
  return () => { ++generationRef.current; requestRef.current?.abort(); channel?.close(); window.removeEventListener("elifora-drafts-changed", update); window.removeEventListener("elifora-offline-lock", logout); window.removeEventListener("online", online); document.removeEventListener("visibilitychange", visibility); };
 }, [refresh]);
 async function sync() {
  if (busy || !navigator.onLine) return;
  setBusy(true); const controller = new AbortController(); request.current = controller;
  try {
   const selected = await unlockDraftVault(controller.signal); vault.current = selected;
   const coordinator = new SyncCoordinator({ list: () => readOfflineDrafts(selected), put: d => storeOfflineDraft(selected, d) }, dispatchDraft, async () => (await unlockDraftVault(controller.signal)).identity);
   const run = () => coordinator.batch(selected.identity, controller.signal);
   const result = navigator.locks ? await navigator.locks.request("elifora-offline-sync", run) : await run();
   setMessage("Senkronizasyon denendi. Çakışan ve reddedilen taslaklar korunur.");
   await refresh(); const accepted = result.filter(d => d.status === "SYNCED"); if (accepted.length) onSynced?.(accepted);
  } catch { setMessage("Senkronizasyon tamamlanamadı. Taslaklar korunuyor; çevrimiçi ve yetkili oturumla yeniden deneyin."); }
  finally { setBusy(false); }
 }
 async function discard(id: string) {
  if (!vault.current || !window.confirm("Bu gönderilmemiş taslağı silmek geri alınamaz. Silinsin mi?")) return;
  await removeOfflineDraft(vault.current, id); await refresh();
 }
 const pending = drafts.filter(d => d.status !== "SYNCED");
 if (!pending.length && !message) return null;
 return <section className="salon-card" aria-label="Yerel taslaklar"><h2>Yerel taslaklar</h2>
  <p className="salon-muted">{pending.length} taslak. Henüz sunucu kaydı değildir. Çıkışta şifreli korunur; yalnızca aynı hesabın yetkili girişinde açılır.</p>
  {message && <p role="status">{message}</p>}
  <button type="button" className="button button-secondary" disabled={busy} onClick={() => void sync()}>{busy ? "Gönderiliyor…" : "Taslakları senkronize et"}</button>
  {pending.map(d => <article key={d.draft_id} className="salon-notice"><strong>{labels[d.status]}</strong><p>{d.domain} · {d.conflict ?? "Sunucunun güncel kontrolleri uygulanacak"}</p>
   <details><summary>Taslağı incele</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(d.payload, null, 2)}</pre></details>
   <button type="button" className="button button-secondary" disabled={busy} onClick={() => void discard(d.draft_id)}>Taslağı sil</button>
  </article>)}
 </section>;
}
