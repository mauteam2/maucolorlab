import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { displaySwatch, targetDisplaySwatch } from "./visual-direction";
import { TargetDirection } from "./target-direction";
import { ColorTargetPicker } from "../color-target-picker";
import { ColorPlanReview } from "../color-plan-review";
import { colorFixture } from "@/test/color-fixtures";
import { evaluateColorPlanning } from "@/lib/color/engine";
import { validateTarget } from "@/lib/color/target";
import { useState } from "react";
import controlled from "../../../../contracts/fixtures/controlled-recipe-contract.json";
afterEach(cleanup);
it("unknown, unselected, preserved and invalid directions never become a neutral brown",()=>{
 for(const value of [null,0,11,NaN])expect(displaySwatch(value)).toEqual({kind:"UNKNOWN"});
 expect(displaySwatch(7,[])).toEqual({kind:"UNKNOWN"});expect(displaySwatch(7,["not a canonical direction"])).toEqual({kind:"UNKNOWN"});
 const r=colorFixture().target.definition.regions[0]!;expect(targetDisplaySwatch({...r,preserve:true})).toEqual({kind:"UNKNOWN"});expect(targetDisplaySwatch({...r,toneFamily:null})).toEqual({kind:"UNKNOWN"});
});
it("ten illustrative depth directions are distinct and tones adapt to the selected depth",()=>{
 expect(new Set(Array.from({length:10},(_,i)=>JSON.stringify(displaySwatch(i+1)))).size).toBe(10);
 expect(displaySwatch(5,["COPPER"])).not.toEqual(displaySwatch(8,["COPPER"]));expect(displaySwatch(7,["NEUTRAL"])).not.toEqual(displaySwatch(7,["ASH_COOL"]));
});
it("a passport with no active regions has an explicit empty state and no invented target",()=>{
 const f=colorFixture();render(<TargetDirection definition={{...f.target.definition,regions:[]}} snapshot={f.snapshot.pages[0]!}/>);expect(screen.getByRole("heading",{name:"Aktif bölge gerekli"})).toBeVisible();
});
it("rendering every display direction leaves canonical engine target, metadata and recipe semantics identical",()=>{
 const f=colorFixture({fullTests:true}),before=JSON.stringify(f),recipe=JSON.stringify(controlled),plan=evaluateColorPlanning(f.snapshot,f.confidence,f.risk,f.target);
 for(let level=1;level<=10;level++)for(const tone of ["NEUTRAL","ASH_COOL","VIOLET","BLUE","GREEN","GOLD_WARM","COPPER","RED"])displaySwatch(level,[tone]);
 f.target.definition.regions.forEach(targetDisplaySwatch);
 render(<TargetDirection definition={f.target.definition} snapshot={f.snapshot.pages[0]!}/>);
 expect(JSON.stringify(f)).toBe(before);expect(evaluateColorPlanning(f.snapshot,f.confidence,f.risk,f.target)).toEqual(plan);expect(JSON.stringify(controlled)).toBe(recipe);
 expect(JSON.stringify(f.target)).not.toMatch(/strand|shadow|illustrativeColor|displaySwatch/);
});
it("native depth and tone radios apply the same canonical model as select alternatives",()=>{
 const f=colorFixture();function Editor(){const [definition,setDefinition]=useState(f.target.definition);return <><ColorTargetPicker definition={definition} snapshot={f.snapshot.pages[0]!} disabled={false} onChange={setDefinition}/><output>{JSON.stringify(definition)}</output></>;}
 const view=render(<Editor/>);fireEvent.click(screen.getByRole("radio",{name:"8 · Açık sarı"}));fireEvent.click(screen.getByRole("radio",{name:"Karamel"}));fireEvent.click(screen.getByRole("button",{name:"Yapılandırılmış hedefi uygula"}));
 const definition=JSON.parse(view.container.querySelector("output")!.textContent!);expect(definition.regions.every((r:{level:number;toneFamily:string;mixedFamilies:string[]})=>r.level===8&&r.toneFamily==="MIXED"&&r.mixedFamilies.join() === "COPPER,GOLD_WARM")).toBe(true);expect(validateTarget(definition,f.snapshot.pages[0]!).issues).toEqual([]);
});
it("advanced existing blue/green families are progressively available without new target taxonomy",()=>{
 const f=colorFixture();const change:unknown[]=[];render(<ColorTargetPicker definition={f.target.definition} snapshot={f.snapshot.pages[0]!} disabled={false} onChange={next=>change.push(next)}/>);
 expect(screen.queryByRole("radio",{name:"Mavi yansıma"})).toBeNull();fireEvent.click(screen.getByRole("button",{name:/Ek yansıma yönleri/}));fireEvent.click(screen.getByRole("radio",{name:"Mavi yansıma"}));fireEvent.click(screen.getByRole("button",{name:/Yapılandırılmış hedefi uygula/}));expect(validateTarget(change[0],f.snapshot.pages[0]!).issues).toEqual([]);
});
it("unknown current evidence is explicit and never colorized as a known target",()=>{
 const f=colorFixture({allUnknown:true});const {container}=render(<TargetDirection definition={f.target.definition} snapshot={f.snapshot.pages[0]!}/>);
 expect(screen.getAllByText("Bilinmiyor / değerlendirilmedi").length).toBeGreaterThan(0);expect(container.querySelectorAll(".cl-current-evidence .cl-hair-swatch")).toHaveLength(0);expect(screen.getByText("Bu görsel nihai saç sonucu garantisi değildir.")).toBeVisible();
});
it("risk, evidence confidence and feasibility remain separate authoritative concepts with an evidence action",()=>{
 const f=colorFixture({allUnknown:true}),plan=evaluateColorPlanning(f.snapshot,f.confidence,f.risk,f.target);render(<ColorPlanReview plan={plan} snapshot={f.snapshot.pages[0]!} clientId={f.target.clientId}/>);
 expect(screen.getByLabelText("Risk değerlendirmesi")).toBeVisible();expect(screen.getByLabelText("Kanıt güveni")).toBeVisible();expect(screen.getByLabelText("Teknik uygulanabilirlik")).toBeVisible();
 expect(within(screen.getByLabelText("Kanıt güveni")).getByText(/başarı olasılığı değildir/)).toBeVisible();expect(screen.getByRole("link",{name:/Eksik kanıtı ve fiziksel testleri/})).toHaveAttribute("href",`/workspace/clients/${f.target.clientId}/hair-passport`);
});
