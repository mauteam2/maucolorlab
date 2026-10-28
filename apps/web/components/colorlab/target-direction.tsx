import type { TargetDefinition } from "@/lib/color/target";
import type { HairSnapshot } from "@/lib/hair-passport/contracts";
import { regionName } from "@/lib/hair-passport/display";
import { toneDescription } from "@/lib/color/taxonomy";
import { HairSwatch } from "./hair-swatch";
import { targetDisplaySwatch } from "./visual-direction";
const warmth = { COOL: "Soğuk yön", WARM: "Sıcak yön", NEUTRAL: "Nötr yön", PRESERVE: "Mevcut yönü koru" };
export function TargetDirection({ definition, snapshot }: { definition: TargetDefinition; snapshot: HairSnapshot }) {
 const first = definition.regions[0]!;
 if (!first) return <section className="cl-direction" aria-label="Temsili hedef yönü"><h2>Aktif bölge gerekli</h2><p>Hair Passport üzerinde aktif saç bölgelerini doğrulayın. Henüz renk yönü tanımlanmadı.</p></section>;
 const distinct = new Set(definition.regions.map(r => JSON.stringify([r.level, r.toneFamily, r.mixedFamilies, r.warmth, r.preserve]))).size > 1;
 return <section className="cl-direction" aria-label="Temsili hedef yönü">
  <div className="cl-direction-hero"><HairSwatch large direction={targetDisplaySwatch(first)} /><div><span className="ui-eyebrow">Temsili renk yönü</span>
   <h2>{distinct ? "Bölgesel renk yönü" : first.preserve ? "Mevcut rengi koru" : first.level === null || first.toneFamily === null ? "Hedefinizi seçin" : <><span className="cl-depth-number">{first.level}</span> {toneDescription(first)}</>}</h2>
   <p>{distinct ? "Her bölge kendi hedefiyle değerlendirilir." : first.level !== null && first.toneFamily !== null ? warmth[first.warmth] : "Derinlik ve ton yönünü birlikte tanımlayın."}{first.greyPriority !== "NONE" && ` · ${first.greyPriority === "COVER" ? "Beyaz kapama" : "Beyaz harmanlama"}`}</p>
   <small>Bu görsel nihai saç sonucu garantisi değildir.</small></div></div>
  <details className="cl-regional-comparison" open={distinct||snapshot.regions.some(r=>r.status==="ACTIVE"&&(r.assessment.state!=="ASSESSED"||r.assessment.observation.perceived_level.state!=="KNOWN"))}><summary>Mevcut ve hedef · bölgesel karşılaştırma</summary><div className="cl-region-strip" aria-label="Mevcut saç ve bölgesel hedefler">{definition.regions.map(r => {
   const region = snapshot.regions.find(s => s.id === r.regionId), assessment = region?.assessment;
   const current = assessment?.state === "ASSESSED" ? assessment.observation.perceived_level : null;
   const tone = assessment?.state === "ASSESSED" ? assessment.observation.tone : null;
   return <div className="cl-region-direction" key={r.regionId}><strong>{regionName(snapshot, r.regionId)}</strong><div className="cl-region-pair"><div><span className="ui-eyebrow">Mevcut</span><span className="cl-current-evidence">{current?.state === "KNOWN" ? current.value : "?"}</span><small>{current?.state === "KNOWN" ? `Seviye ${current.value} · ${tone?.state === "KNOWN" ? tone.value : "ton bilinmiyor"}` : "Bilinmiyor / değerlendirilmedi"}</small></div><span className="cl-direction-arrow" aria-hidden="true">→</span><div><span className="ui-eyebrow">Hedef</span><HairSwatch direction={targetDisplaySwatch(r)} /><small>{r.preserve ? "Mevcut rengi koru" : `${r.level ?? "Seçilmedi"} · ${toneDescription(r)}`}{r.greyPriority!=="NONE"&&` · ${r.greyPriority==="COVER"?"Beyaz kapama":"Beyaz harmanlama"}`}</small></div></div></div>;
  })}</div></details>
  <p className="cl-caption">Özgün ELIFORA çizimi · fiziksel renk ölçümü veya üretici kartelası değildir. Mevcut saç, kayıtlı kanıtla gösterilir; bilinmeyen ton renklendirilmez.</p>
 </section>;
}
