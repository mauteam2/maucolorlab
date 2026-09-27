"use client";
import { hairTr as t, hairEditTr as e } from "@/lib/i18n/hair-tr";
import { technicalFields, type TechnicalDraft, type TechnicalKey, type TechnicalState } from "@/lib/hair-passport/editor";

const enumValues = {
 thickness: ["FINE", "MEDIUM", "COARSE"], density: ["LOW", "MEDIUM", "HIGH"],
 porosity: ["LOW", "MEDIUM", "HIGH"], elasticity: ["LOW", "NORMAL", "HIGH"],
} as const;

export function HairTechnicalForm({ draft, change, errors, prefix }: { draft: TechnicalDraft; change: (draft: TechnicalDraft) => void; errors: Record<string, string>; prefix: string }) {
 function update(key: TechnicalKey, next: Partial<TechnicalDraft["values"][TechnicalKey]>) {
  change({ ...draft, values: { ...draft.values, [key]: { ...draft.values[key], ...next } } });
 }
 return <><p id={`${prefix}-help`} className="hp-muted">{e.fieldHelp}</p><div className="hp-form-fields">
  {technicalFields.map(({ key, kind }) => {
   const id = `${prefix}-${key}`, field = draft.values[key];
   const states: TechnicalState[] = kind === "level" ? ["KNOWN", "UNKNOWN", "NOT_ASSESSED"] : ["KNOWN", "UNKNOWN", "NOT_ASSESSED", "NOT_APPLICABLE"];
   const choices = key in enumValues ? enumValues[key as keyof typeof enumValues] : null;
   return <div className="hp-form-field" key={key}>
    <label htmlFor={`${id}-state`}>{t.fields[key]}</label>
    <select id={`${id}-state`} aria-label={`${t.fields[key]} · ${e.state}`} aria-describedby={`${prefix}-help`} value={field.state} onChange={event => update(key, { state: event.target.value as TechnicalState })}>
     {states.map(state => <option key={state} value={state}>{t.states[state]}</option>)}
    </select>
    {field.state === "KNOWN" && <>
     {choices ? <select id={`${id}-value`} aria-label={`${t.fields[key]} · ${e.value}`} value={field.raw} onChange={event => update(key, { raw: event.target.value })} aria-invalid={Boolean(errors[key])}>
      <option value="">{e.value}</option>{choices.map(value => <option key={value} value={value}>{t.values[value]}</option>)}
     </select> : kind === "longText" ? <textarea id={`${id}-value`} aria-label={`${t.fields[key]} · ${e.value}`} value={field.raw} maxLength={2000} onChange={event => update(key, { raw: event.target.value })} aria-invalid={Boolean(errors[key])} /> : <input id={`${id}-value`} aria-label={`${t.fields[key]} · ${e.value}`} value={field.raw} onChange={event => update(key, { raw: event.target.value })} type={kind === "text" ? "text" : "number"} min={kind === "level" ? 1 : kind === "percent" ? 0 : undefined} max={kind === "level" ? 10 : kind === "percent" ? 100 : undefined} step={kind === "level" ? "any" : kind === "percent" ? "any" : undefined} maxLength={kind === "text" ? 120 : undefined} aria-invalid={Boolean(errors[key])} />}
     {(kind === "level" || kind === "percent") && <small className="hp-muted">{kind === "level" ? e.levelHelp : e.percentHelp}</small>}
    </>}
    {errors[key] && <span role="alert" className="hp-field-error">{errors[key]}</span>}
   </div>;
  })}
  {(["technical_notes", "integrity_notes"] as const).map(key => <div className="hp-form-field" key={key}>
   <label htmlFor={`${prefix}-${key}`}>{t.fields[key]}</label>
   <textarea id={`${prefix}-${key}`} value={draft[key]} maxLength={key === "technical_notes" ? 4000 : 2000} onChange={event => change({ ...draft, [key]: event.target.value })} aria-invalid={Boolean(errors[key])} />
   {errors[key] && <span role="alert" className="hp-field-error">{errors[key]}</span>}
  </div>)}
 </div></>;
}
