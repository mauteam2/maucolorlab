import { render,screen,fireEvent,cleanup } from "@testing-library/react";
import { afterEach,expect,it,vi } from "vitest";
import { useState } from "react";
import { colorFixture } from "@/test/color-fixtures";
import { ColorTargetPicker } from "./color-target-picker";
import { RegionalColorTargetEditor } from "./regional-color-target";
afterEach(()=>{cleanup();});
it("depth and family controls have precise accessible names and preserve the chosen intent",()=>{
 const i=colorFixture(),change=vi.fn();render(<ColorTargetPicker definition={i.target.definition} snapshot={i.snapshot.pages[0]!} disabled={false} onChange={change}/>);
 fireEvent.change(screen.getByRole("combobox",{name:"Hedef derinlik"}),{target:{value:"8"}});
 fireEvent.click(screen.getByRole("radio",{name:"Altın / sıcak"}));
 fireEvent.click(screen.getByRole("button",{name:"Yapılandırılmış hedefi uygula"}));
 expect(change.mock.calls[0]![0].regions.every((r:{level:number;toneFamily:string})=>r.level===8&&r.toneFamily==="GOLD_WARM")).toBe(true);
 expect(screen.getByRole("combobox",{name:"Uygulanacak bölge"})).toBeVisible();
});
it("white coverage and disclosed correction have stable accessible names",()=>{
 const i=colorFixture(),change=vi.fn();render(<RegionalColorTargetEditor region={i.target.definition.regions[0]!} name="Dip" disabled={false} onChange={change}/>);
 fireEvent.change(screen.getByRole("combobox",{name:"Beyaz önceliği"}),{target:{value:"COVER"}});
 expect(change).toHaveBeenLastCalledWith({greyPriority:"COVER"});
 fireEvent.click(screen.getByText("Ayrıntılı bölgesel ayarlar",{exact:true}));
 fireEvent.change(screen.getByRole("combobox",{name:"Düzeltme"}),{target:{value:"BAND"}});
 expect(change).toHaveBeenLastCalledWith({correction:"BAND"});
});
it("a named preset keeps depth, family radio and pressed state aligned with the actual target",()=>{
 const i=colorFixture();function Editor(){const [definition,setDefinition]=useState(i.target.definition);return <ColorTargetPicker definition={definition} snapshot={i.snapshot.pages[0]!} disabled={false} onChange={setDefinition}/>;}
 render(<Editor/>);fireEvent.click(screen.getByRole("button",{name:"Soğuk sarı"}));
 expect(screen.getByRole("combobox",{name:"Hedef derinlik"})).toHaveValue("9");
 expect(screen.getByRole("radio",{name:"Küllü / soğuk"})).toBeChecked();
 expect(screen.getByRole("button",{name:"Soğuk sarı"})).toHaveAttribute("aria-pressed","true");
 expect(screen.getByRole("button",{name:"Karamel"})).toHaveAttribute("aria-pressed","false");
});
