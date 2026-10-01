import { expect, it } from "vitest";
import { riskInput } from "@/test/risk-fixtures";
import { fixtureId } from "@/test/confidence-fixtures";
import { evaluateConfidence } from "@/lib/confidence/engine";
import { confidenceInput } from "@/lib/confidence/input";
import { evaluateRisk } from "./engine";
import { riskRules } from "./rules";
const evaluate = (input: ReturnType<typeof riskInput>) => evaluateRisk(input,evaluateConfidence(input));
it("confirming benign strong evidence never worsens risk or gate", () => {
 const input=riskInput(), before=evaluate(input), o=structuredClone(input.pages[0]!.observations.items[0]!);
 o.id=fixtureId(920); o.evidence.id=fixtureId(921); input.pages[0]!.observations.items.push(o);
 const after=evaluate(input); expect(after.overallBand).toBe(before.overallBand); expect(after.gate.outcome).toBe(before.gate.outcome);
});
it("serious regional integrity evidence never lowers overall risk", () => {
 expect(riskRules.bands.indexOf(evaluate(riskInput({regionalHigh:true})).overallBand)).toBeGreaterThan(riskRules.bands.indexOf(evaluate(riskInput()).overallBand));
});
it("removing necessary strand evidence cannot improve gate", () => {
 const input=riskInput({historyCount:1}); const before=evaluate(input);
 input.pages[0]!.physical_tests.items=[]; const after=evaluate(input);
 expect(riskRules.gatePrecedence.indexOf(after.gate.outcome)).toBeGreaterThan(riskRules.gatePrecedence.indexOf(before.gate.outcome));
});
it("NOT_APPLICABLE does not request unknown integrity tests", () => {
 const na=evaluate(riskInput({integrityNA:true})), unknown=evaluate(riskInput({porosityUnknown:true}));
 expect(na.requiredPhysicalTests).toEqual([]); expect(unknown.requiredPhysicalTests.some(t=>t.type === "POROSITY")).toBe(true);
});
it("localized evidence cannot affect another region or global integrity", () => {
 const input=riskInput({regionalHigh:true}); const result=evaluate(input); const end=input.pages[0]!.regions[2]!.id;
 expect(result.regions.find(r=>r.target === end)?.dimensions.find(d=>d.dimension === "HAIR_INTEGRITY")?.band).toBe("HIGH");
 expect(result.regions.filter(r=>r.target !== end).every(r=>r.dimensions.find(d=>d.dimension === "HAIR_INTEGRITY")?.band === "LOW")).toBe(true);
});
it("AI estimates cannot satisfy actual required physical tests", () => {
 const input=riskInput({highPorosity:true,fullTests:true,matchingAI:true});
 input.pages[0]!.physical_tests.items=input.pages[0]!.physical_tests.items.filter(t=>t.type !== "POROSITY");
 const result=evaluate(input); expect(result.requiredPhysicalTests.filter(t=>t.type === "POROSITY")).toHaveLength(4);
 expect(result.requiredPhysicalTests.filter(t=>t.type === "POROSITY").every(t=>t.status === "MISSING")).toBe(true);
 expect(result.gate.canProgress).toBe(false);
});
it("HIGH confidence cannot erase explicit combined integrity stop", () => {
 const input=riskInput({highPorosity:true,lowElasticity:true,fullTests:true}); const confidence=evaluateConfidence(input);
 expect(confidence.band).toBe("HIGH"); expect(evaluateRisk(input,confidence).gate.outcome).toBe("BLOCK_TECHNICAL_PLANNING");
});
it("LOW confidence never fabricates integrity damage", () => {
 const input=riskInput({lowConfidence:true}); const confidence=evaluateConfidence(input); expect(confidence.band).toBe("LOW");
 expect(evaluateRisk(input,confidence).dimensions.find(d=>d.dimension === "HAIR_INTEGRITY")?.band).toBe("LOW");
});
it("outside scope dominates all other stops without a diagnosis", () => {
 const input=riskInput({highPorosity:true,lowElasticity:true}); const confidence=evaluateConfidence(input);
 const result=evaluateRisk(input,confidence,{state:"DECLARED_OUTSIDE_COSMETIC_SCOPE",evidenceRefs:confidence.domains[0]!.fields[0]!.evidenceRefs});
 expect(result.gate.outcome).toBe("OUTSIDE_COSMETIC_SCOPE"); expect(result.gate.canProgress).toBe(false);
 expect(JSON.stringify(result)).not.toMatch(/diagnosis|allergy|formula|oxidant|processingTime/);
});
it("clock boundary reuses Phase 1D exact test freshness", () => {
 const input=riskInput({historyCount:1});
 for(const test of input.pages[0]!.physical_tests.items) { test.performed_at=new Date(Date.parse(input.evaluatedAt)-30*86400000).toISOString(); test.evidence.observed_at.value=test.performed_at; }
 expect(evaluate(input).requiredPhysicalTests.every(t=>t.status === "SATISFIED")).toBe(true);
 input.evaluatedAt=new Date(Date.parse(input.evaluatedAt)+1).toISOString();
 expect(evaluate(input).requiredPhysicalTests.every(t=>t.status === "STALE")).toBe(true);
});
it("record ordering never changes the result or fingerprint", () => {
 const input=riskInput({historyCount:2,fullTests:true}), before=evaluate(input);
 input.pages[0]!.observations.items.reverse(); input.pages[0]!.physical_tests.items.reverse(); input.pages[0]!.history.items.reverse(); input.pages[0]!.regions.reverse();
 expect(evaluate(input)).toEqual(before);
});
it("narrative text cannot fabricate chemistry or outside scope", () => {
 const input=riskInput(); for(const o of input.pages[0]!.observations.items) o.chemical_history.value="ALLERGY BLEACH SAFE 9% 60 MINUTES";
 for(const a of [input.pages[0]!.core,...input.pages[0]!.regions.map(r=>r.assessment)]) if(a.state === "ASSESSED") a.observation=structuredClone(input.pages[0]!.observations.items.find(o=>o.id === a.observation.id)!);
 const result=evaluate(input); expect(result.scopeAssessment).toBe("NOT_ASSESSED"); expect(result.overallBand).toBe("LOW");
 expect(JSON.stringify(result)).not.toContain("ALLERGY BLEACH SAFE");
});
it.each(["forged_band","foreign_ref","wrong_version","changed_clock","unknown_property"])("rejects forged Phase 1D %s", change => {
 const input=riskInput(), confidence=evaluateConfidence(input), altered=structuredClone(confidence);
 if(change === "forged_band") altered.band="LOW";
 if(change === "foreign_ref") altered.domains[0]!.fields[0]!.evidenceRefs[0]!.id=fixtureId(999);
 if(change === "wrong_version") altered.engineVersion="confidence-engine/999.0.0";
 if(change === "changed_clock") altered.evaluatedAt="2027-01-01T00:00:00Z";
 if(change === "unknown_property") Object.assign(altered,{ignoreRisk:true});
 expect(()=>evaluateRisk(input,altered)).toThrow("RISK_INPUT_INVALID");
});
it.each(["empty_pages","foreign_region","impossible_test","future_evidence","duplicate_id"])("malformed high-impact %s fails closed", change => {
 const input=riskInput(), confidence=evaluateConfidence(input), p=input.pages[0]!;
 if(change === "empty_pages") input.pages=[];
 if(change === "foreign_region") p.physical_tests.items[0]!.region_id=fixtureId(999);
 if(change === "impossible_test") {p.physical_tests.items[0]!.type="POROSITY"; p.physical_tests.items[0]!.result={state:"KNOWN",value:"SAFE"};}
 if(change === "future_evidence") p.physical_tests.items[0]!.performed_at="2035-01-01T00:00:00Z";
 if(change === "duplicate_id") p.observations.items.push(structuredClone(p.observations.items[0]!));
 expect(()=>evaluateRisk(input,confidence)).toThrow("RISK_INPUT_INVALID");
});
it("scope declaration cannot use a foreign or unknown evidence reference", () => {
 const input=riskInput(); expect(()=>evaluateRisk(input,evaluateConfidence(input),{state:"DECLARED_OUTSIDE_COSMETIC_SCOPE",evidenceRefs:[{kind:"OBSERVATION",id:fixtureId(999),evidenceId:null}]})).toThrow("RISK_INPUT_INVALID");
});
it("valid 100-region bound remains interactive in memory", () => {
 const input=riskInput(); const p=input.pages[0]!;
 for(let i=0;i<97;i++) p.regions.push({id:fixtureId(1000+i),type:"CUSTOM",label:`Synthetic ${i}`,status:"ACTIVE",version:1,updated_at:p.passport.updated_at,assessment:{state:"NOT_ASSESSED",observation:null}});
 const parsed=confidenceInput.parse(input), confidence=evaluateConfidence(parsed), start=performance.now();
 const result=evaluateRisk(parsed,confidence); expect(result.regions).toHaveLength(100);
 expect(result.gate.canProgress).toBe(false); expect(performance.now()-start).toBeLessThan(2000);
});
