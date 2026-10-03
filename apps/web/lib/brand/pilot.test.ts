import { expect,it } from "vitest";
import { pilotFixture,manifest } from "@/test/pilot-fixtures";
import { fixtureId } from "@/test/confidence-fixtures";
import { evaluatePilotCandidates } from "./pilot";
import { evaluateBrandAdapter } from "./engine";
import { governanceRequest,pilotPacket,pilotResult } from "./pilot-model";
import golden from "../../../../contracts/fixtures/verified-pilot-golden.json";
it("official chart has 29 traceable shades and two documented developers",()=>{expect(manifest.shades).toHaveLength(29);expect(manifest.developers.map(d=>d.strengthPercent)).toEqual([6,9]);expect(new Set(manifest.shades.map(s=>s.manufacturerCode)).size).toBe(29);expect(manifest.shades.every(s=>s.pigmentVector==="UNKNOWN"&&manifest.sources.some(d=>d.id===s.sourceId))).toBe(true);});
it.each(golden.cases.map(c=>c.change))("official pilot golden %s",scenario=>{
 const {plan,packet}=pilotFixture();let expected="NO_VERIFIED_MATCH";
 const goal=plan.recipeDraft!.target.definition.regions.find(r=>!r.preserve)!;
 if(["natural","new_version"].includes(scenario))expected="CANDIDATES_FOR_REVIEW";
 if(scenario==="copper"){goal.level=7;goal.toneFamily="COPPER";expected="CANDIDATES_FOR_REVIEW";}
 if(scenario==="unknown_tone"){goal.level=7;goal.toneFamily="ASH_COOL";}
 if(scenario==="unverified"||scenario==="deprecated")for(const p of packet.catalog.products)p.verificationStatus=scenario==="unverified"?"UNVERIFIED":"DEPRECATED";
 if(scenario==="draft"){packet.catalog.release.state="DRAFT";expected="CATALOG_UNAVAILABLE";}
 if(scenario==="unknown_compatibility")for(const r of packet.catalog.compatibility)r.outcome="UNKNOWN";
 if(scenario==="wrong_developer")for(const d of packet.catalog.products.filter(p=>p.productType==="DEVELOPER"))d.verificationStatus="UNVERIFIED";
 if(scenario==="cross_brand")for(const d of packet.catalog.products.filter(p=>p.productType==="DEVELOPER"))d.brandId=fixtureId(99999);
 if(scenario==="missing_source"){packet.sources[0]!.review_status="PENDING";packet.sources[0]!.verification_status="UNVERIFIED";expected="CATALOG_UNAVAILABLE";}
 if(scenario==="new_version"){packet.catalog.release.version=2;packet.catalog.products.forEach(p=>p.version=2);}
 if(scenario==="historical_version"){packet.catalog.release.state="RETIRED";expected="CATALOG_UNAVAILABLE";}
 if(scenario==="unsafe"){plan.status="REQUIRES_TEST";expected="BLOCKED_BY_SAFETY";}
 if(scenario==="ratio")packet.catalog.compatibility.forEach(r=>r.mixingRatio="1:2");
 if(scenario==="missing_review"){packet.governance.approvedBy=null;expected="CATALOG_UNAVAILABLE";}
 const before=JSON.stringify(packet),result=evaluatePilotCandidates(plan,packet);expect(result.status).toBe(expected);expect(result.executable).toBe(false);expect(result.candidates.every(c=>!c.executable&&c.compatibility==="VERIFIED_RESTRICTED")).toBe(true);expect(JSON.stringify(packet)).toBe(before);
 if(result.candidates.length){expect(result.candidates[0]!.processingMinutes).toEqual({min:30,max:45});expect(result.candidates[0]!.sourceIds.length).toBeGreaterThan(0);expect(result.candidates.some(c=>c.restrictions.whitePercentGreaterThan===90)).toBe(true);}
});
it("real pilot never turns undocumented pigments into a Phase 2A recipe",()=>{const {plan,packet}=pilotFixture();expect(evaluateBrandAdapter(plan,packet.catalog,fixtureId(8001)).recipe).toBeNull();expect(evaluatePilotCandidates(plan,packet).candidates.length).toBeGreaterThan(0);});
it("source provenance rejects cross-catalog evidence",()=>{const {packet}=pilotFixture();packet.evidence[0]!.catalog_id=fixtureId(9000);expect(pilotPacket.safeParse(packet).success).toBe(false);});
it.each(["verification_status","reviewed_by","approved_by","published_status","compatibility","organization_id"])("governance rejects forged %s",key=>{expect(governanceRequest.safeParse({operation:"PUBLISH",note:"Review",[key]:"forged"}).success).toBe(false);});
it("candidate output cannot be made executable",()=>{const {plan,packet}=pilotFixture();expect(pilotResult.safeParse({...evaluatePilotCandidates(plan,packet),executable:true}).success).toBe(false);});
