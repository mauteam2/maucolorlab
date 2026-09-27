"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "./app-shell";
import { HairPassportOverview } from "./hair-passport-overview";
import { loadPassport, PassportLoadError } from "@/lib/hair-passport/load";
import { hairTr as t } from "@/lib/i18n/hair-tr";
export function HairPassportWorkspace({ clientId }: { clientId: string }) {
 const [data, setData] = useState<Awaited<ReturnType<typeof loadPassport>> | null>(null);
 const [error, setError] = useState<string | null>(null);
 const [page, setPage] = useState({ tests_offset: 0, history_offset: 0 });
 const controller = useRef<AbortController | null>(null);
 const generation = useRef(0);
 const verify = useCallback(async () => {
  const current = ++generation.current;
  controller.current?.abort(); setData(null); setError(null);
  if (document.hidden || !navigator.onLine) { if (!navigator.onLine) setError("NETWORK_ERROR"); return; }
  const request = new AbortController(); controller.current = request;
  const timeout = window.setTimeout(() => request.abort(), 15000);
  try {
   const loaded = await loadPassport(clientId, page, request.signal);
   if (current !== generation.current || document.hidden || !navigator.onLine) return;
   setData(loaded);
  } catch (cause) {
   if (current !== generation.current) return;
   const code = cause instanceof PassportLoadError ? cause.code : "NETWORK_ERROR";
   setData(null); setError(code);
   if (["SESSION_EXPIRED", "UNAUTHENTICATED"].includes(code)) window.location.replace("/sign-in?reason=SESSION_EXPIRED");
   if (["MEMBERSHIP_REVOKED", "MEMBERSHIP_REQUIRED", "TENANT_CONTEXT_INVALID"].includes(code)) window.location.replace("/auth/workspace-reset");
  } finally { clearTimeout(timeout); }
 }, [clientId, page]);
 useEffect(() => {
  const generationRef = generation;
  const controllerRef = controller;
  const refresh = () => { void verify(); };
  const hide = () => { ++generation.current; controller.current?.abort(); setData(null); };
  const visibility = () => { hide(); if (!document.hidden) refresh(); };
  const offline = () => { hide(); setError("NETWORK_ERROR"); };
  const timer = window.setInterval(refresh, 15000);
  queueMicrotask(refresh);
  window.addEventListener("focus", refresh); window.addEventListener("pageshow", refresh); window.addEventListener("pagehide", hide);
  window.addEventListener("online", refresh); window.addEventListener("offline", offline); document.addEventListener("visibilitychange", visibility);
  return () => { ++generationRef.current; controllerRef.current?.abort(); clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("pageshow", refresh); window.removeEventListener("pagehide", hide); window.removeEventListener("online", refresh); window.removeEventListener("offline", offline); document.removeEventListener("visibilitychange", visibility); };
 }, [verify]);
 return <AppShell><main id="main-content" className="hp-page">
 <Link prefetch={false} href="/workspace/clients">← {t.clients}</Link>
 {!data ? error ? <div role="alert" className="hp-empty"><h1>{t.unavailable}</h1><p>{t.errors[error as keyof typeof t.errors] ?? t.errors.NETWORK_ERROR}</p><button className="button button-secondary" onClick={() => void verify()}>{t.retry}</button></div> : <p role="status" className="hp-empty">{t.loading}</p> : <>
 <header className="hp-header"><p className="eyebrow">{t.readOnly}</p><h1>{data.client.full_name}</h1><p className="lead">{t.intro}</p></header>
 <nav className="hp-tabs" aria-label={t.navigation}><Link prefetch={false} href={`/workspace/clients/${clientId}`}>{t.overview}</Link><span aria-current="page">{t.title}</span></nav>
 {data.client.status === "ARCHIVED" && <p className="hp-archive" role="status">{t.archived}</p>}
 {data.snapshot ? <HairPassportOverview snapshot={data.snapshot} change={(kind, offset) => { setData(null); setPage(previous => ({ ...previous, [kind]: offset })); }} /> : <section className="hp-empty"><h2>{t.emptyTitle}</h2><p>{t.empty}</p></section>}
 </>}
 </main></AppShell>;
}
