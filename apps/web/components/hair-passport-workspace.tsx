"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { AppShell } from "./app-shell";
import { HairPassportOverview } from "./hair-passport-overview";
import { HairTechnicalForm } from "./hair-technical-form";
import { loadPassport, PassportLoadError } from "@/lib/hair-passport/load";
import { sendHairMutation, PassportMutationError } from "@/lib/hair-passport/mutate";
import { DraftValidationError, initialTechnicalDraft, technicalChanges, type TechnicalDraft } from "@/lib/hair-passport/editor";
import type { HairSnapshot } from "@/lib/hair-passport/contracts";
import type { HairMutationCommand } from "@/lib/hair-passport/mutations";
import { hairTr as t, hairEditTr as e } from "@/lib/i18n/hair-tr";

type EditorKind = "create" | "core" | "new-region" | "region";
type Region = HairSnapshot["regions"][number];
type Editor = { kind: EditorKind; regionId?: string; expectedVersion?: number; base: TechnicalDraft; draft: TechnicalDraft; regionType: Region["type"]; label: string; initialLabel: string; requestId: string };
const regionChoices: Region["type"][] = ["FACE_FRAME", "CROWN", "NAPE", "BANDED_AREA", "BLEACHED_AREA", "HIGHLIGHTED_AREA", "CUSTOM"];
const recoverable = ["CONFLICT", "HAIR_PASSPORT_ALREADY_EXISTS", "HAIR_PASSPORT_NOT_FOUND", "HAIR_REGION_NOT_FOUND"];

export function HairPassportWorkspace({ clientId }: { clientId: string }) {
 const [data, setData] = useState<Awaited<ReturnType<typeof loadPassport>> | null>(null);
 const [error, setError] = useState<string | null>(null);
 const [page, setPage] = useState({ tests_offset: 0, history_offset: 0 });
 const [editor, setEditor] = useState<Editor | null>(null);
 const [saving, setSaving] = useState(false);
 const [mutationError, setMutationError] = useState<string | null>(null);
 const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
 const [saved, setSaved] = useState(false);
 const controller = useRef<AbortController | null>(null);
 const generation = useRef(0);
 const verify = useCallback(async () => {
  const current = ++generation.current;
  controller.current?.abort(); setData(null); setError(null);
  if (document.hidden || !navigator.onLine) { if (!navigator.onLine) setError("NETWORK_ERROR"); return false; }
  const request = new AbortController(); controller.current = request;
  const timeout = window.setTimeout(() => request.abort(), 15000);
  try {
   const loaded = await loadPassport(clientId, page, request.signal);
   if (current !== generation.current || document.hidden || !navigator.onLine) return false;
   setData(loaded);
   setEditor(currentEditor => loaded.client.status === "ARCHIVED" || currentEditor && !loaded.permissions.includes(currentEditor.kind === "create" ? "hair_passport.create" : "hair_passport.update") ? null : currentEditor);
   return true;
  } catch (cause) {
   if (current !== generation.current) return false;
   const code = cause instanceof PassportLoadError ? cause.code : "NETWORK_ERROR";
   setData(null); setError(code); setEditor(null); setSaved(false);
   if (["SESSION_EXPIRED", "UNAUTHENTICATED"].includes(code)) window.location.replace("/sign-in?reason=SESSION_EXPIRED");
   if (["MEMBERSHIP_REVOKED", "MEMBERSHIP_REQUIRED", "TENANT_CONTEXT_INVALID"].includes(code)) window.location.replace("/auth/workspace-reset");
   return false;
  } finally { clearTimeout(timeout); }
 }, [clientId, page]);
 useEffect(() => {
  const generationRef = generation, controllerRef = controller;
  const refresh = () => { void verify(); };
  const hide = () => { ++generationRef.current; controllerRef.current?.abort(); setData(null); setSaved(false); };
  const visibility = () => { hide(); if (!document.hidden) refresh(); };
  const offline = () => { hide(); setError("NETWORK_ERROR"); };
  const timer = window.setInterval(refresh, 15000);
  queueMicrotask(refresh);
  window.addEventListener("focus", refresh); window.addEventListener("pageshow", refresh); window.addEventListener("pagehide", hide);
  window.addEventListener("online", refresh); window.addEventListener("offline", offline); document.addEventListener("visibilitychange", visibility);
  return () => { ++generationRef.current; controllerRef.current?.abort(); clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("pageshow", refresh); window.removeEventListener("pagehide", hide); window.removeEventListener("online", refresh); window.removeEventListener("offline", offline); document.removeEventListener("visibilitychange", visibility); };
 }, [verify]);
 const editorKind = editor?.kind;
 useEffect(() => { if (editorKind && data) document.getElementById("hp-editor-title")?.focus(); }, [editorKind, data]);

 function begin(kind: EditorKind, region?: Region) {
  const base = initialTechnicalDraft(kind === "core" ? data?.snapshot?.core : region?.assessment);
  const nextType = regionChoices.find(type => type === "CUSTOM" || !data?.snapshot?.regions.some(item => item.type === type && item.status === "ACTIVE")) ?? "CUSTOM";
  setEditor({ kind, regionId: region?.id, expectedVersion: kind === "core" ? data?.snapshot?.passport.version : region?.version, base, draft: structuredClone(base), regionType: region?.type ?? nextType, label: region?.label ?? "", initialLabel: region?.label ?? "", requestId: crypto.randomUUID() });
  setMutationError(null); setFieldErrors({}); setSaved(false);
 }
 function changeEditor(next: Partial<Editor>) {
  setEditor(current => current ? { ...current, ...next, requestId: crypto.randomUUID() } : null);
  setMutationError(null); setFieldErrors({}); setSaved(false);
 }
 async function save(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  if (!data || !editor || saving || data.client.status !== "ACTIVE") return;
  setMutationError(null); setFieldErrors({}); setSaved(false);
  let command: HairMutationCommand;
  try {
   const patch = technicalChanges(editor.base, editor.draft);
   if (editor.kind === "create") command = { operation: "create_passport", client_id: clientId, payload: { request_id: editor.requestId, ...(Object.keys(patch).length ? { technical: patch } : {}) } } as HairMutationCommand;
   else if (editor.kind === "core") {
    if (!Object.keys(patch).length) throw new DraftValidationError("technical", "invalid");
    command = { operation: "update_passport", client_id: clientId, payload: { request_id: editor.requestId, expected_version: editor.expectedVersion, technical: patch } } as HairMutationCommand;
   } else if (editor.kind === "new-region") {
    if (editor.regionType === "CUSTOM" && (!editor.label.trim() || editor.label.trim().length > 120)) throw new DraftValidationError("regionLabel", "required");
    command = { operation: "create_region", client_id: clientId, payload: { request_id: editor.requestId, region_type: editor.regionType, ...(editor.regionType === "CUSTOM" ? { label: editor.label.trim() } : {}), ...(Object.keys(patch).length ? { technical: patch } : {}) } } as HairMutationCommand;
   } else {
    const labelChanged = editor.regionType === "CUSTOM" && editor.label !== editor.initialLabel;
    if (editor.regionType === "CUSTOM" && (!editor.label.trim() || editor.label.trim().length > 120)) throw new DraftValidationError("regionLabel", "required");
    if (!Object.keys(patch).length && !labelChanged) throw new DraftValidationError("technical", "invalid");
    command = { operation: "update_region", client_id: clientId, region_id: editor.regionId, payload: { request_id: editor.requestId, expected_version: editor.expectedVersion, ...(labelChanged ? { label: editor.label.trim() } : {}), ...(Object.keys(patch).length ? { technical: patch } : {}) } } as HairMutationCommand;
   }
  } catch (cause) {
   const field = cause instanceof DraftValidationError ? cause.field : "technical";
   const message = field === "regionLabel" ? e.validation.custom : cause instanceof DraftValidationError ? e.validation[cause.code] : e.validation.invalid;
   setFieldErrors({ [field]: message }); return;
  }
  setSaving(true);
  const request = new AbortController(); const timeout = window.setTimeout(() => request.abort(), 15000);
  try {
   await sendHairMutation(command, data.workspaceReference, request.signal);
   setEditor(null);
   const refreshed = await verify();
   if (refreshed) setSaved(true);
  } catch (cause) {
   const code = cause instanceof PassportMutationError ? cause.code : "NETWORK_ERROR";
   setMutationError(code);
   if (["FORBIDDEN", "MEMBERSHIP_REVOKED", "TENANT_CONTEXT_INVALID", "SESSION_EXPIRED", "UNAUTHENTICATED"].includes(code)) { setEditor(null); void verify(); }
  } finally { clearTimeout(timeout); setSaving(false); }
 }

 const active = data?.client.status === "ACTIVE";
 const canCreate = Boolean(active && data?.permissions.includes("hair_passport.create"));
 const canEdit = Boolean(active && data?.permissions.includes("hair_passport.update"));
 const dirty = Boolean(editor && (editor.kind === "create" || editor.kind === "new-region" || JSON.stringify(editor.base) !== JSON.stringify(editor.draft) || editor.label !== editor.initialLabel));
 const availableRegions = regionChoices.filter(type => type === "CUSTOM" || !data?.snapshot?.regions.some(region => region.type === type && region.status === "ACTIVE"));
 return <AppShell><main id="main-content" className="hp-page">
  <Link prefetch={false} href="/workspace/clients">← {t.clients}</Link>
  {!data ? error ? <div role="alert" className="hp-empty"><h1>{t.unavailable}</h1><p>{t.errors[error as keyof typeof t.errors] ?? t.errors.NETWORK_ERROR}</p><button className="button button-secondary" onClick={() => void verify()}>{t.retry}</button></div> : <p role="status" className="hp-empty">{t.loading}</p> : <>
   <header className="hp-header"><p className="eyebrow">{canCreate || canEdit ? e.editable : t.readOnly}</p><h1>{data.client.full_name}</h1><p className="lead">{t.intro}</p></header>
   <nav className="hp-tabs" aria-label={t.navigation}><Link prefetch={false} href={`/workspace/clients/${clientId}`}>{t.overview}</Link><span aria-current="page">{t.title}</span></nav>
   {data.client.status === "ARCHIVED" && <p className="hp-archive" role="status">{t.archived}</p>}
   {saved && <p className="hp-notice" role="status">{e.saved}</p>}
   {!data.snapshot && <section className="hp-empty"><h2>{t.emptyTitle}</h2><p>{t.empty}</p>{canCreate && !editor && <button className="button button-primary" onClick={() => begin("create")}>{e.create}</button>}</section>}
   {editor && <section className="hp-editor" aria-labelledby="hp-editor-title"><h2 id="hp-editor-title" tabIndex={-1}>{editor.kind === "create" ? e.createTitle : editor.kind === "core" ? e.coreTitle : editor.kind === "region" ? e.regionTitle : e.newRegionTitle}</h2>
    <form onSubmit={save} noValidate aria-busy={saving}>
     {editor.kind === "new-region" && <div className="hp-form-field"><label htmlFor="hp-region-type">{e.regionType}</label><select id="hp-region-type" value={editor.regionType} onChange={event => changeEditor({ regionType: event.target.value as Region["type"], label: "" })}>{availableRegions.map(type => <option key={type} value={type}>{t.regionTypes[type]}</option>)}</select></div>}
     {((editor.kind === "region" || editor.kind === "new-region") && editor.regionType === "CUSTOM") && <div className="hp-form-field"><label htmlFor="hp-region-label">{e.regionLabel}</label><input id="hp-region-label" value={editor.label} maxLength={120} aria-invalid={Boolean(fieldErrors.regionLabel)} onChange={event => changeEditor({ label: event.target.value })} /><small className="hp-muted">{e.customHelp}</small>{fieldErrors.regionLabel && <span role="alert" className="hp-field-error">{fieldErrors.regionLabel}</span>}</div>}
     {editor.kind === "create" || editor.kind === "new-region" ? <details className="hp-optional"><summary>{editor.kind === "create" ? e.optionalFields : e.optionalRegion}</summary><HairTechnicalForm prefix="hp-new" draft={editor.draft} change={draft => changeEditor({ draft })} errors={fieldErrors} /></details> : <HairTechnicalForm prefix="hp-edit" draft={editor.draft} change={draft => changeEditor({ draft })} errors={fieldErrors} />}
     {fieldErrors.technical && <p role="alert" className="hp-field-error">{fieldErrors.technical}</p>}
     {mutationError && <div role="alert" className="hp-mutation-error"><p>{e.errors[mutationError as keyof typeof e.errors] ?? e.errors.NETWORK_ERROR}</p>{recoverable.includes(mutationError) && <button type="button" className="button button-secondary" onClick={() => { setEditor(null); void verify(); }}>{e.reload}</button>}</div>}
     <p role="status" className="hp-muted">{saving ? e.saving : dirty ? e.dirty : e.unchanged}</p>
     <div className="hp-form-actions"><button className="button button-primary" disabled={saving || !dirty}>{saving ? e.saving : e.save}</button><button type="button" className="button button-secondary" disabled={saving} onClick={() => { setEditor(null); setMutationError(null); setFieldErrors({}); }}>{e.cancel}</button></div>
    </form>
   </section>}
   {data.snapshot && <HairPassportOverview snapshot={data.snapshot} change={(kind, offset) => { setData(null); setPage(previous => ({ ...previous, [kind]: offset })); }} canEdit={canEdit && !editor && !saving} onEditCore={() => begin("core")} onAddRegion={() => begin("new-region")} onEditRegion={id => begin("region", data.snapshot?.regions.find(region => region.id === id))} />}
  </>}
 </main></AppShell>;
}
