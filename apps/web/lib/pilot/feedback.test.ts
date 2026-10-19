import {expect,it} from "vitest";
import {feedbackDocument,feedbackCategories,reviewDimensions} from "./feedback";
const input={category:feedbackCategories[0],severity:"P2",comment:"Hedef seçimi anlaşılır",ratings:Array(10).fill(4)};
const release={gitSha:"a".repeat(40),colorEngineVersion:"color-engine/1.1.0",catalogs:[{version:1}]};
it("carries ten review dimensions and thirteen categories with safe explicit version context",()=>{expect(reviewDimensions).toHaveLength(10);expect(feedbackCategories).toHaveLength(13);const doc=feedbackDocument(input,{...release,clientName:"PRIVATE",recipe:"PRIVATE"} as typeof release);expect(JSON.stringify(doc)).not.toContain("PRIVATE");expect(doc.release).toEqual(release);});
it.each([{...input,clientName:"private"},{...input,ratings:[6]},{...input,comment:"x".repeat(2001)},{...input,category:"forged"}])("rejects extras, forged categories and invalid reviews",value=>expect(()=>feedbackDocument(value,release)).toThrow());
