import type { HairSnapshot } from "@/lib/hair-passport/contracts";
import { displayValue, orderedRegions, regionName, type Assessment } from "@/lib/hair-passport/display";
import { hairTr as t } from "@/lib/i18n/hair-tr";

export function recordedValues(assessment: Assessment) {
 return assessment.state === "ASSESSED" ? assessment.observation : assessment.state === "UNVERIFIED" ? assessment.values : null;
}
const currentFields = ["natural_level", "perceived_level", "grey_ratio", "tone", "thickness", "density", "porosity", "elasticity"] as const;
const historyFields = ["cosmetic_color_history", "bleach_history", "chemical_history"] as const;
export function CurrentHairFacts({ assessment, history = false }: { assessment: Assessment; history?: boolean }) {
 const values = recordedValues(assessment);
 return <dl className="dossier-facts">{(history ? historyFields : currentFields).map(key => <div key={key}><dt>{t.fields[key]}</dt><dd data-state={values?.[key].state ?? "NOT_ASSESSED"}>{values ? displayValue(key, values[key]) : t.states.NOT_ASSESSED}</dd></div>)}</dl>;
}
export function PassportOrientation({ snapshot: s }: { snapshot: HairSnapshot }) {
 const regions = orderedRegions(s).filter(r => r.status === "ACTIVE");
 const assessed = regions.filter(r => r.assessment.state === "ASSESSED").length;
 const concerns = regions.flatMap(r => {
  const v = recordedValues(r.assessment), label = regionName(s,r.id);
  return [r.type === "BANDED_AREA" ? `${label} · bantlı bölge kaydı` : null,
   v?.porosity.state === "KNOWN" && v.porosity.value === "HIGH" ? `${label} · gözeneklilik yüksek` : null,
   v?.elasticity.state === "KNOWN" && v.elasticity.value === "LOW" ? `${label} · esneklik düşük` : null,
   !v || v.chemical_history.state !== "KNOWN" ? `${label} · kimyasal geçmiş ${v?.chemical_history.state === "UNKNOWN" ? "bilinmiyor" : "değerlendirilmedi"}` : null].filter((x): x is string => Boolean(x));
 });
 return <section className="dossier-orientation" aria-label="Mevcut saçın teknik özeti"><div><span className="ui-eyebrow">Mevcut kanıt · hedef renk değildir</span><h2>Saçın bugünkü kaydı</h2><p>{regions.length} aktif bölge · {assessed} bölgede gözlem kayıtlı</p><p className="dossier-caption">Gözlem kaydı işlem izni değildir. Kaynak, güncellik ve güvenlik ayrıca değerlendirilir.</p></div><div className="dossier-attention"><p className="dossier-attention-label"><strong>İncelenecek mevcut bilgiler</strong></p>{concerns.length ? <><ul>{concerns.slice(0,3).map(x=><li key={x}>{x}</li>)}</ul>{concerns.length>3&&<a href="#hp-regions">Diğer {concerns.length-3} bölgesel kaydı incele ↓</a>}</> : <p>Bu özette ek bir kayıt işareti yok; bu, işlem için uygunluk değerlendirmesi değildir.</p>}</div></section>;
}
export function RegionEvidenceMap({ snapshot: s }: { snapshot: HairSnapshot }) {
 return <div className="dossier-region-map" aria-label="Bölgesel saç değerlendirmesi"><div className="dossier-section-label"><span className="ui-eyebrow">Dip / Orta / Uçlar</span><p>Şema yalnızca kayıtlı bölge bilgisidir; fotoğraf veya renk simülasyonu değildir.</p></div><div className="dossier-region-strip">{orderedRegions(s).map(r=>{const v=recordedValues(r.assessment);return <a key={r.id} href={`#region-${r.id}`} data-region={r.type}><span className="dossier-region-line" aria-hidden="true"/><strong>{regionName(s,r.id)}</strong><span>{r.status==="ARCHIVED"?t.states.ARCHIVED:t.states[r.assessment.state]}</span><dl><div><dt>Güncel seviye</dt><dd>{v?displayValue("perceived_level",v.perceived_level):t.states.NOT_ASSESSED}</dd></div><div><dt>Gözeneklilik</dt><dd>{v?displayValue("porosity",v.porosity):t.states.NOT_ASSESSED}</dd></div><div><dt>Esneklik</dt><dd>{v?displayValue("elasticity",v.elasticity):t.states.NOT_ASSESSED}</dd></div></dl></a>;})}</div></div>;
}
