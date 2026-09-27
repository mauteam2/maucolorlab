"use client";
import type { FormEvent } from "react";
import type { HairSnapshot } from "@/lib/hair-passport/contracts";
import { orderedRegions, regionName } from "@/lib/hair-passport/display";
import type { HistoryDraft } from "@/lib/hair-passport/history-editor";
import { hairTr as t, hairEditTr as e, hairHistoryTr as h } from "@/lib/i18n/hair-tr";

const categories = ["COLOR", "BLEACH_LIGHTENING", "TONER_GLOSS", "PERM", "RELAXER_STRAIGHTENING", "KERATIN_SMOOTHING", "OTHER_CHEMICAL"] as const;
const dateStates = ["EXACT", "APPROXIMATE", "UNKNOWN"] as const;
const productStates = ["KNOWN", "UNKNOWN", "NOT_APPLICABLE"] as const;

export function HairHistoryForm({ snapshot, draft, change, save, cancel, saving, error, fieldError, reload }: {
 snapshot: HairSnapshot; draft: HistoryDraft; change: (draft: HistoryDraft) => void;
 save: (event: FormEvent<HTMLFormElement>) => void; cancel: () => void; saving: boolean;
 error: string | null; fieldError: string | null; reload: () => void;
}) {
 const activeRegions = orderedRegions(snapshot).filter(region => region.status === "ACTIVE");
 return <div className="hp-editor hp-history-editor"><h3 id="hp-history-title" tabIndex={-1}>{h.title}</h3>
  <form onSubmit={save} noValidate aria-busy={saving}>
   <div className="hp-observation-fields">
    <div className="hp-form-field"><label htmlFor="hp-history-category">{h.category}</label><select id="hp-history-category" value={draft.category} aria-invalid={fieldError === "category"} onChange={event => change({ ...draft, category: event.target.value as HistoryDraft["category"] })}>{categories.map(category => <option key={category} value={category}>{t.categories[category]}</option>)}</select></div>
    <div className="hp-form-field"><label htmlFor="hp-history-date-state">{h.dateState}</label><select id="hp-history-date-state" value={draft.dateState} onChange={event => change({ ...draft, dateState: event.target.value as HistoryDraft["dateState"], date: "" })}>{dateStates.map(state => <option key={state} value={state}>{h.dateStates[state]}</option>)}</select></div>
    {draft.dateState !== "UNKNOWN" && <div className="hp-form-field"><label htmlFor="hp-history-date">{draft.dateState === "EXACT" ? h.exactDate : h.approximateDate}</label><input id="hp-history-date" type="date" min="1900-01-01" max={new Date().toISOString().slice(0, 10)} value={draft.date} aria-invalid={fieldError === "date"} aria-describedby={draft.dateState === "APPROXIMATE" ? "hp-history-date-help" : undefined} onChange={event => change({ ...draft, date: event.target.value })} />{draft.dateState === "APPROXIMATE" && <small id="hp-history-date-help" className="hp-muted">{h.approximateHelp}</small>}</div>}
    <div className="hp-form-field"><label htmlFor="hp-history-product-state">{h.productState}</label><select id="hp-history-product-state" value={draft.productState} onChange={event => change({ ...draft, productState: event.target.value as HistoryDraft["productState"], product: "" })}>{productStates.map(state => <option key={state} value={state}>{h.productStates[state]}</option>)}</select></div>
    {draft.productState === "KNOWN" && <div className="hp-form-field"><label htmlFor="hp-history-product">{h.product}</label><input id="hp-history-product" value={draft.product} maxLength={500} aria-invalid={fieldError === "product"} onChange={event => change({ ...draft, product: event.target.value })} /></div>}
    <div className="hp-form-field"><label htmlFor="hp-history-description">{h.description}</label><textarea id="hp-history-description" value={draft.description} maxLength={2000} aria-invalid={fieldError === "description"} onChange={event => change({ ...draft, description: event.target.value })} /></div>
    <div className="hp-form-field"><label htmlFor="hp-history-source">{h.source}</label><select id="hp-history-source" value={draft.source} onChange={event => change({ ...draft, source: event.target.value as HistoryDraft["source"] })}><option value="HISTORICAL">{t.sources.HISTORICAL}</option><option value="IMPORTED_UNVERIFIED">{t.sources.IMPORTED_UNVERIFIED}</option></select><small className="hp-muted">{h.sourceHelp}</small></div>
    <div className="hp-form-field"><label htmlFor="hp-history-context">{h.context}</label><textarea id="hp-history-context" value={draft.context} maxLength={2000} aria-invalid={fieldError === "context"} onChange={event => change({ ...draft, context: event.target.value })} /></div>
   </div>
   <fieldset className="hp-history-regions" aria-invalid={fieldError === "region"}><legend>{h.regions}</legend><p className="hp-muted">{h.regionsHelp}</p><div className="hp-history-region-options">{activeRegions.map(region => <label className="hp-check" key={region.id}><input type="checkbox" checked={draft.regionIds.includes(region.id)} onChange={event => change({ ...draft, regionIds: event.target.checked ? [...draft.regionIds.filter(id => id !== region.id), region.id] : draft.regionIds.filter(id => id !== region.id) })} />{regionName(snapshot, region.id)}</label>)}</div></fieldset>
   {fieldError && <p className="hp-field-error" role="alert">{h.validation[fieldError as keyof typeof h.validation] ?? h.validation.description}</p>}
   {error && <div className="hp-mutation-error" role="alert"><p>{h.errors[error as keyof typeof h.errors] ?? h.errors.NETWORK_ERROR}</p>{["HAIR_PASSPORT_NOT_FOUND", "HAIR_REGION_NOT_FOUND", "LOCATION_NOT_FOUND", "CONFLICT"].includes(error) && <button type="button" className="button button-secondary" onClick={reload}>{e.reload}</button>}</div>}
   <div className="hp-form-actions"><button className="button button-primary" disabled={saving}>{saving ? e.saving : e.save}</button><button type="button" className="button button-secondary" onClick={cancel} disabled={saving}>{e.cancel}</button></div>
  </form>
 </div>;
}
