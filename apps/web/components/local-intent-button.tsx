"use client";
import { useState } from "react";
import { makeDraft, type OfflineDraft } from "@/lib/offline/model";
import { currentVault, unlockDraftVault, storeOfflineDraft } from "@/lib/offline/vault";
export function LocalIntentButton({ domain, entityId, baseVersion, prepare, syncable = false }: { domain: OfflineDraft["domain"]; entityId?: string | null; baseVersion?: number | null; prepare?: () => unknown; syncable?: boolean }) {
 const [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
 async function capture(button: HTMLButtonElement) {
  if (busy) return;
  setBusy(true); setMessage("");
  try {
   const vault = currentVault() ?? await unlockDraftVault();
   let payload = prepare?.();
   if (!prepare) {
    const form = button.closest("form"); if (!form) throw new Error("VALIDATION_FAILED");
    const fields: Record<string, string[]> = {};
    for (const [name, value] of new FormData(form).entries()) {
     if (typeof value !== "string" || /password|secret|token|authorization/i.test(name)) continue;
     fields[name] ??= []; fields[name].push(value);
    }
    payload = { kind: "FORM_PREPARATION", fields };
   }
   const mutationId = payload && typeof payload === "object" && "mutation_id" in payload ? String(payload.mutation_id) : crypto.randomUUID();
   const draft = await makeDraft(vault.identity, domain, payload, mutationId, { entity_id: entityId ?? null, base_version: baseVersion && baseVersion > 0 ? baseVersion : null });
   await storeOfflineDraft(vault, { ...draft, status: syncable ? "PENDING_SYNC" : "REVIEW_REQUIRED" });
   setMessage("Taslak cihazda şifreli korundu. Sunucu kaydı değildir. Güncel çalışma alanında yeniden inceleyip onaylayın.");
  } catch { setMessage("Yerel taslak kaydedilemedi. Formu kapatmadan bağlantıyı ve oturumunuzu doğrulayın."); }
  finally { setBusy(false); }
 }
 return <div className="salon-notice"><button type="button" className="button button-secondary" disabled={busy} onClick={event => void capture(event.currentTarget)}>Yerel taslak olarak koru</button>
  {message && <p role="status">{message}</p>}
  {["STOCK_COUNT", "CASH_CLOSE"].includes(domain) && <small>Sayımlar ve kapanışlar senkronizasyonla kesinleşmez; güncel hareketleri yeniden inceleyin ve gerekirse yeniden sayın.</small>}
 </div>;
}
