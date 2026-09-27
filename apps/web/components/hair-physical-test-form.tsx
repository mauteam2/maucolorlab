"use client";
import type { FormEvent } from "react";
import type { HairSnapshot } from "@/lib/hair-passport/contracts";
import { orderedRegions, regionName } from "@/lib/hair-passport/display";
import type { PhysicalTestDraft } from "@/lib/hair-passport/physical-test-editor";
import { hairTr as t, hairEditTr as e, hairPhysicalTestTr as p } from "@/lib/i18n/hair-tr";

const types = ["POROSITY", "ELASTICITY", "STRAND"] as const;
const states = ["KNOWN", "UNKNOWN", "NOT_APPLICABLE"] as const;
const choices = { POROSITY: ["LOW", "MEDIUM", "HIGH"], ELASTICITY: ["LOW", "NORMAL", "HIGH"] } as const;

export function HairPhysicalTestForm({ snapshot, draft, change, save, cancel, saving, error, fieldError, reload }: {
 snapshot: HairSnapshot; draft: PhysicalTestDraft; change: (draft: PhysicalTestDraft) => void;
 save: (event: FormEvent<HTMLFormElement>) => void; cancel: () => void; saving: boolean;
 error: string | null; fieldError: string | null; reload: () => void;
}) {
 const presets: readonly string[] = draft.type === "STRAND" ? [] : choices[draft.type];
 const choice = draft.value === "" || presets.includes(draft.value) ? draft.value : "OTHER";
 return <div className="hp-editor hp-physical-test-editor"><h3 id="hp-physical-test-title" tabIndex={-1}>{p.title}</h3>
  <form onSubmit={save} noValidate aria-busy={saving}>
   <div className="hp-observation-fields">
    <div className="hp-form-field"><label htmlFor="hp-test-type">{p.type}</label><select id="hp-test-type" value={draft.type} onChange={event => change({ ...draft, type: event.target.value as PhysicalTestDraft["type"], value: "" })}>{types.map(type => <option key={type} value={type}>{t.testTypes[type]}</option>)}</select></div>
    <div className="hp-form-field"><label htmlFor="hp-test-region">{p.region}</label><select id="hp-test-region" value={draft.regionId} onChange={event => change({ ...draft, regionId: event.target.value })}><option value="">{t.whole}</option>{orderedRegions(snapshot).filter(region => region.status === "ACTIVE").map(region => <option key={region.id} value={region.id}>{regionName(snapshot, region.id)}</option>)}</select></div>
    <div className="hp-form-field"><label htmlFor="hp-test-state">{p.state}</label><select id="hp-test-state" value={draft.state} aria-describedby="hp-test-state-help" onChange={event => change({ ...draft, state: event.target.value as PhysicalTestDraft["state"], value: "" })}>{states.map(state => <option key={state} value={state}>{t.states[state]}</option>)}</select><small id="hp-test-state-help" className="hp-muted">{p.stateHelp}</small></div>
    {draft.state === "KNOWN" && (draft.type === "STRAND" ? <div className="hp-form-field"><label htmlFor="hp-test-value">{p.strandResult}</label><textarea id="hp-test-value" value={draft.value} maxLength={1000} aria-invalid={fieldError === "result"} onChange={event => change({ ...draft, value: event.target.value })} /></div> : <>
     <div className="hp-form-field"><label htmlFor="hp-test-choice">{draft.type === "POROSITY" ? p.porosityResult : p.elasticityResult}</label><select id="hp-test-choice" value={choice} aria-invalid={fieldError === "result"} onChange={event => change({ ...draft, value: event.target.value === "OTHER" ? " " : event.target.value })}><option value="">{p.selectResult}</option>{presets.map(value => <option key={value} value={value}>{t.values[value as keyof typeof t.values]}</option>)}<option value="OTHER">{p.otherResult}</option></select></div>
     {choice === "OTHER" && <div className="hp-form-field"><label htmlFor="hp-test-value">{p.measuredResult}</label><input id="hp-test-value" value={draft.value.trimStart()} maxLength={1000} aria-invalid={fieldError === "result"} onChange={event => change({ ...draft, value: event.target.value || " " })} /></div>}
    </>)}
    <div className="hp-form-field"><label htmlFor="hp-test-notes">{p.notes}</label><textarea id="hp-test-notes" value={draft.notes} maxLength={2000} aria-invalid={fieldError === "notes"} onChange={event => change({ ...draft, notes: event.target.value })} /></div>
   </div>
   {fieldError && <p className="hp-field-error" role="alert">{p.validation[fieldError as keyof typeof p.validation] ?? p.validation.result}</p>}
   {error && <div className="hp-mutation-error" role="alert"><p>{p.errors[error as keyof typeof p.errors] ?? p.errors.NETWORK_ERROR}</p>{["HAIR_PASSPORT_NOT_FOUND", "HAIR_REGION_NOT_FOUND", "LOCATION_NOT_FOUND", "CONFLICT"].includes(error) && <button type="button" className="button button-secondary" onClick={reload}>{e.reload}</button>}</div>}
   <div className="hp-form-actions"><button className="button button-primary" disabled={saving}>{saving ? e.saving : e.save}</button><button type="button" className="button button-secondary" onClick={cancel} disabled={saving}>{e.cancel}</button></div>
  </form>
 </div>;
}
