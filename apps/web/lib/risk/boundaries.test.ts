import { expect, it } from "vitest";
import { riskInput } from "@/test/risk-fixtures";
import { fixtureId } from "@/test/confidence-fixtures";
import { evaluateConfidence } from "@/lib/confidence/engine";
import { evaluateRisk } from "./engine";
import { riskResult } from "./contracts";
const evaluate=(input:ReturnType<typeof riskInput>)=>evaluateRisk(input,evaluateConfidence(input));
it("structured chemical events raise complexity without compatibility claims",()=>{
 const input=riskInput({historyCount:2}); for(const event of input.pages[0]!.history.items) event.category="PERM";
 const result=evaluate(input); expect(result.dimensions.find(d=>d.dimension === "CHEMICAL_HISTORY")?.band).toBe("HIGH");
 expect(result.requiredPhysicalTests).toEqual(expect.arrayContaining([expect.objectContaining({type:"STRAND",status:"SATISFIED",target:"GLOBAL"})]));
 expect(result.gate.outcome).toBe("CONTINUE_WITH_CHECKPOINTS");
 expect(JSON.stringify(result)).not.toMatch(/incompatible|oxidant|formula|processingTime/);
});
it("imported event requires verification even beside a stronger professional summary",()=>{
 const input=riskInput({historyCount:1}); input.pages[0]!.history.items[0]!.evidence.source="IMPORTED_UNVERIFIED";
 input.pages[0]!.history.items[0]!.evidence.verified_by=null; const result=evaluate(input);
 expect(result.requiredInformation).toEqual(expect.arrayContaining([expect.objectContaining({code:"VERIFY_IMPORTED_HISTORY",target:"GLOBAL"})]));
 expect(result.gate.canProgress).toBe(false);
});
it("superseded events never count as repeated processing",()=>{
 const input=riskInput({historyCount:2}); input.pages[0]!.history.items[1]!.supersedes_id=input.pages[0]!.history.items[0]!.id;
 expect(evaluate(input).dimensions.find(d=>d.dimension === "LIGHTENING_HISTORY")?.band).toBe("MODERATE");
});
it("a global strand test cannot satisfy a local concern",()=>{
 const input=riskInput({regionalHigh:true}); input.pages[0]!.physical_tests.items=input.pages[0]!.physical_tests.items.filter(t=>t.region_id === null);
 const result=evaluate(input); expect(result.requiredPhysicalTests.filter(t=>t.type === "STRAND" && t.target !== "GLOBAL").every(t=>t.status === "MISSING")).toBe(true);
});
it("old integrity facts are uncertainty rather than fresh damage evidence",()=>{
 const input=riskInput({highPorosity:true,lowElasticity:true});
 for(const o of input.pages[0]!.observations.items) o.evidence.observed_at.value="2026-01-01T00:00:00Z";
 for(const a of [input.pages[0]!.core,...input.pages[0]!.regions.map(r=>r.assessment)]) if(a.state === "ASSESSED") a.observation=structuredClone(input.pages[0]!.observations.items.find(o=>o.id === a.observation.id)!);
 const result=evaluate(input); expect(result.dimensions.find(d=>d.dimension === "HAIR_INTEGRITY")?.band).toBe("LOW");
 expect(result.gate.outcome).toBe("BLOCK_INSUFFICIENT_INFORMATION");
});
it("explicit test expiry dominates otherwise recent test evidence",()=>{
 const input=riskInput({historyCount:1}); for(const t of input.pages[0]!.physical_tests.items) t.evidence.relevant_until=t.performed_at;
 const result=evaluate(input); expect(result.requiredPhysicalTests.find(t=>t.target === "GLOBAL" && t.type === "STRAND")?.status).toBe("STALE");
 expect(result.gate.canProgress).toBe(false);
});
it("unknown test result never satisfies a required test",()=>{
 const input=riskInput({historyCount:1}); input.pages[0]!.physical_tests.items[0]!.result={state:"UNKNOWN",value:null};
 const result=evaluate(input); expect(result.requiredPhysicalTests.find(t=>t.target === "GLOBAL" && t.type === "STRAND")?.status).toBe("UNRELIABLE");
 expect(result.gate.canProgress).toBe(false);
});
it("schema rejects a progressing block even when scores otherwise look valid",()=>{
 const input=riskInput({minimal:true}); const data=evaluate(input); data.gate.canProgress=true;
 expect(riskResult.safeParse({data,correlationId:fixtureId(500)}).success).toBe(false);
});
