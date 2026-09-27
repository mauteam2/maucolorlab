"use client";
import type { FormEvent } from "react";
import type { HairSnapshot } from "@/lib/hair-passport/contracts";
import { orderedRegions, regionName } from "@/lib/hair-passport/display";
import { technicalFields, type TechnicalState } from "@/lib/hair-passport/editor";
import type { ObservationDraft } from "@/lib/hair-passport/observation-editor";
import { hairTr as t, hairEditTr as e, hairObservationTr as o } from "@/lib/i18n/hair-tr";

const enumValues = {
 thickness: ["FINE", "MEDIUM", "COARSE"], density: ["LOW", "MEDIUM", "HIGH"],
 porosity: ["LOW", "MEDIUM", "HIGH"], elasticity: ["LOW", "NORMAL", "HIGH"],
} as const;

export function HairObservationForm({ snapshot, draft, change, save, cancel, saving, error, fieldError, reload }: {
 snapshot: HairSnapshot; draft: ObservationDraft; change: (draft: ObservationDraft) => void;
 save: (event: FormEvent<HTMLFormElement>) => void; cancel: () => void; saving: boolean;
 error: string | null; fieldError: string | null; reload: () => void;
}) {
 const kind = technicalFields.find(item => item.key === draft.field)!.kind;
 const choices = draft.field in enumValues ? enumValues[draft.field as keyof typeof enumValues] : null;
 const states: TechnicalState[] = kind === "level" ? ["KNOWN", "UNKNOWN", "NOT_ASSESSED"] : ["KNOWN", "UNKNOWN", "NOT_ASSESSED", "NOT_APPLICABLE"];
 return <div className="hp-editor hp-observation-editor"><h3 id="hp-observation-title" tabIndex={-1}>{o.title}</h3>
  <form onSubmit={save} noValidate aria-busy={saving}>
   <div className="hp-observation-fields">
    <div className="hp-form-field"><label htmlFor="hp-observation-field">{o.field}</label><select id="hp-observation-field" value={draft.field} onChange={event => change({ ...draft, field: event.target.value as ObservationDraft["field"], state: "KNOWN", value: "" })}>{technicalFields.map(item => <option key={item.key} value={item.key}>{t.fields[item.key]}</option>)}</select></div>
    <div className="hp-form-field"><label htmlFor="hp-observation-region">{o.region}</label><select id="hp-observation-region" value={draft.regionId} onChange={event => change({ ...draft, regionId: event.target.value })}><option value="">{o.whole}</option>{orderedRegions(snapshot).filter(region => region.status === "ACTIVE").map(region => <option key={region.id} value={region.id}>{regionName(snapshot, region.id)}</option>)}</select></div>
    <div className="hp-form-field"><label htmlFor="hp-observation-state">{o.state}</label><select id="hp-observation-state" value={draft.state} aria-describedby="hp-observation-state-help" onChange={event => change({ ...draft, state: event.target.value as TechnicalState })}>{states.map(state => <option key={state} value={state}>{t.states[state]}</option>)}</select><small id="hp-observation-state-help" className="hp-muted">{e.fieldHelp}</small></div>
    {draft.state === "KNOWN" && <div className="hp-form-field"><label htmlFor="hp-observation-value">{o.value}</label>{choices ? <select id="hp-observation-value" value={draft.value} aria-invalid={fieldError === "value"} onChange={event => change({ ...draft, value: event.target.value })}><option value="">{e.value}</option>{choices.map(value => <option key={value} value={value}>{t.values[value]}</option>)}</select> : kind === "longText" ? <textarea id="hp-observation-value" value={draft.value} maxLength={2000} aria-invalid={fieldError === "value"} onChange={event => change({ ...draft, value: event.target.value })} /> : <input id="hp-observation-value" value={draft.value} type={kind === "level" || kind === "percent" ? "number" : "text"} min={kind === "level" ? 1 : kind === "percent" ? 0 : undefined} max={kind === "level" ? 10 : kind === "percent" ? 100 : undefined} step="any" maxLength={kind === "text" ? 120 : undefined} aria-invalid={fieldError === "value"} onChange={event => change({ ...draft, value: event.target.value })} />}{kind === "level" || kind === "percent" ? <small className="hp-muted">{kind === "level" ? e.levelHelp : e.percentHelp}</small> : null}</div>}
    <div className="hp-form-field"><label htmlFor="hp-observation-confidence">{o.confidence}</label><input id="hp-observation-confidence" type="number" min={0} max={100} step="any" value={draft.confidence} aria-invalid={fieldError === "confidence"} aria-describedby="hp-observation-confidence-help" onChange={event => change({ ...draft, confidence: event.target.value })} /><small id="hp-observation-confidence-help" className="hp-muted">{o.confidenceHelp}</small></div>
   </div>
   <label className="hp-check"><input type="checkbox" checked={draft.verified} aria-invalid={fieldError === "verified"} onChange={event => change({ ...draft, verified: event.target.checked })} />{o.verify}</label>
   {fieldError && <p className="hp-field-error" role="alert">{o.validation[fieldError as keyof typeof o.validation] ?? o.validation.field}</p>}
   {error && <div className="hp-mutation-error" role="alert"><p>{o.errors[error as keyof typeof o.errors] ?? o.errors.NETWORK_ERROR}</p>{["CONFLICT", "HAIR_REGION_NOT_FOUND", "HAIR_PASSPORT_NOT_FOUND"].includes(error) && <button type="button" className="button button-secondary" onClick={reload}>{e.reload}</button>}</div>}
   <div className="hp-form-actions"><button className="button button-primary" disabled={saving}>{saving ? e.saving : e.save}</button><button type="button" className="button button-secondary" onClick={cancel} disabled={saving}>{e.cancel}</button></div>
  </form>
 </div>;
}
