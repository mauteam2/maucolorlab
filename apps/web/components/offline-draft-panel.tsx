"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { SyncCoordinator } from "@/lib/offline/coordinator";
import { dispatchDraft } from "@/lib/offline/dispatch";
import { currentVault, lockDraftVault, unlockDraftVault, readOfflineDrafts, storeOfflineDraft, preserveOfflineRejection, removeOfflineDraft, type DraftVault } from "@/lib/offline/vault";
import type { ConflictType, OfflineDraft } from "@/lib/offline/model";
const domainLabels: Record<OfflineDraft["domain"], string> = {
 HAIR_CORE: "Saç profili", HAIR_OBSERVATION: "Teknik gözlem", HAIR_PHYSICAL_TEST: "Fiziksel test", HAIR_HISTORY: "Teknik geçmiş",
 LIVE: "Canlı uygulama", CLIENT: "Müşteri", CRM: "Müşteri ilişkileri", APPOINTMENT: "Randevu", COLOR_TARGET: "Hedef renk",
 STOCK_COUNT: "Stok sayımı", STOCK_INTAKE: "Stok girişi", STOCK_USAGE: "Ürün kullanımı", PAYMENT: "Ödeme", EXPENSE: "Gider", CASH_CLOSE: "Kasa kapanışı",
};
const conflictLabels: Record<ConflictType, string> = {
 VERSION_CHANGED: "Kayıt değişti; güncel sürümü inceleyin", CONTROL_EPOCH_CHANGED: "Uygulama kontrolü değişti",
 AUTHORITY_EXPIRED: "Yetki yeniden doğrulanmalı", WORKSPACE_CHANGED: "Çalışma alanı değişti", PAYLOAD_CHANGED: "Taslak içeriği değişti",
 DEPENDENCY_FAILED: "Bağlı taslak tamamlanamadı", AVAILABILITY_CHANGED: "Randevu uygunluğu değişti", SUBSCRIPTION_CHANGED: "Abonelik koşulları değişti",
 STOCK_CHANGED: "Stok durumu değişti", CASH_CHANGED: "Kasa durumu değişti", VALIDATION_FAILED: "Taslak bilgilerini kontrol edin",
};
const labels: Record<OfflineDraft["status"], string> = { LOCAL: "Yerel taslak", PENDING_SYNC: "Gönderilmeyi bekliyor", SYNCING: "Gönderiliyor", SYNCED: "Sunucu kabul etti", CONFLICT: "Çakışma · inceleyin", REJECTED: "Sunucu reddetti", REVIEW_REQUIRED: "Güncel kayıtla inceleme gerekli", DEPENDENCY_BLOCKED: "Önce bağlı taslağı tamamlayın" };
export function OfflineDraftPanel({ entityId, onSynced, silent = false }: { entityId?: string; onSynced?: (drafts: OfflineDraft[]) => void; silent?: boolean }) {
 const [drafts, setDrafts] = useState<OfflineDraft[]>([]), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
 const [observedAt, setObservedAt] = useState(0);
 const vault = useRef<DraftVault | null>(null), request = useRef<AbortController | null>(null), epoch = useRef(0);
 const refresh = useCallback(async (authenticate = false) => {
  const g = ++epoch.current;
  try {
   const selected = authenticate ? await unlockDraftVault() : currentVault();
   if (!selected) return;
   const all = await readOfflineDrafts(selected);
   if (g !== epoch.current || document.hidden) return;
   vault.current = selected; setDrafts(all.filter(d => !entityId || d.entity_id === entityId)); setObservedAt(Date.now()); setMessage("");
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
  const timer = window.setInterval(() => { if (navigator.onLine && !document.hidden) void refresh(true); }, 15000);
  return () => { ++generationRef.current; requestRef.current?.abort(); channel?.close(); clearInterval(timer); window.removeEventListener("elifora-drafts-changed", update); window.removeEventListener("elifora-offline-lock", logout); window.removeEventListener("online", online); document.removeEventListener("visibilitychange", visibility); };
 }, [refresh]);
 async function sync() {
  if (busy || !navigator.onLine) return;
  setBusy(true); const controller = new AbortController(); request.current = controller;
  try {
   const selected = await unlockDraftVault(controller.signal); vault.current = selected;
   const coordinator = new SyncCoordinator({ list: () => readOfflineDrafts(selected), put: d => currentVault() === selected ? storeOfflineDraft(selected, d) : preserveOfflineRejection(selected, d) }, dispatchDraft, async () => (await unlockDraftVault(controller.signal)).identity);
   const run = () => coordinator.batch(selected.identity, controller.signal);
   const result = navigator.locks ? await navigator.locks.request("elifora-offline-sync", run) : await run();
   if (currentVault() !== selected || document.hidden) return;
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
 const conflicts = pending.filter(d => d.status === "CONFLICT").length, failures = pending.filter(d => ["REJECTED", "CONFLICT", "REVIEW_REQUIRED"].includes(d.status)).length;
 const oldest = pending.length ? Math.max(0, Math.floor((observedAt - Math.min(...pending.map(d => Date.parse(d.created_at)))) / 60000)) : 0;
 if (silent) return null;
 if (!pending.length && !message) return null;
 return <section className="salon-card" aria-label="Yerel taslaklar" aria-busy={busy}><h2>Yerel taslaklar</h2>
  <p className="salon-muted">{pending.length} taslak. Henüz sunucu kaydı değildir. Çıkışta şifreli korunur; yalnızca aynı hesabın yetkili girişinde açılır.</p>
  <p className="salon-muted">{conflicts} çakışma · {failures} inceleme/ret · en eski bekleyen {oldest} dk</p>
  {message && <p role="status">{message}</p>}
  <button type="button" className="button button-secondary" disabled={busy} onClick={() => void sync()}>{busy ? "Gönderiliyor…" : "Taslakları senkronize et"}</button>
  {pending.map(d => <article key={d.draft_id} className="salon-notice"><strong>{labels[d.status]}</strong><p>{domainLabels[d.domain]} · {d.conflict ? conflictLabels[d.conflict] : "Sunucunun güncel kontrolleri uygulanacak"}</p>
   <details><summary>Taslağı incele</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(d.payload, null, 2)}</pre></details>
   <button type="button" className="button button-secondary" disabled={busy} onClick={() => void discard(d.draft_id)}>Taslağı sil</button>
  </article>)}
 </section>;
}
