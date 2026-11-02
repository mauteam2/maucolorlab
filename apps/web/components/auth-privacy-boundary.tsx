"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BrandLogo } from "./brand-logo";

export function AuthPrivacyBoundary({ children, verificationKey }: { children: ReactNode; verificationKey: string }) {
  const [lockedKey, setLockedKey] = useState<string | null>(null);
  const locked = lockedKey === verificationKey;
  const router = useRouter();
  useEffect(() => {
    const lock = () => setLockedKey(verificationKey);
    const refresh = () => { lock(); router.refresh(); };
    const visibility = () => { if (document.hidden) lock(); else refresh(); };
    const pageShow = (event: PageTransitionEvent) => { if (event.persisted) refresh(); };
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("elifora-offline-privacy");
    if (channel) channel.onmessage = lock;
    window.addEventListener("elifora-offline-lock", lock); window.addEventListener("offline", lock);
    window.addEventListener("focus", refresh); window.addEventListener("pageshow", pageShow); window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", visibility);
    return () => { channel?.close(); window.removeEventListener("elifora-offline-lock", lock); window.removeEventListener("offline", lock);
      window.removeEventListener("focus", refresh); window.removeEventListener("pageshow", pageShow); window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", visibility); };
  }, [router, verificationKey]);
  if (locked) return <section className="entry-private-lock"><BrandLogo /><h1 id="entry-heading">Erişiminizi yeniden kontrol edelim</h1><p role="status">Oturum veya bağlantı değişti. Önceki salon bilgileri gizlendi.</p><button className="button button-primary" onClick={() => router.refresh()}>Erişimi yeniden kontrol et</button></section>;
  return children;
}
