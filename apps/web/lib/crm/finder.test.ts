import { expect,it } from "vitest";
import { crmFixture } from "@/test/crm-fixtures";
import { interpretSearch } from "./finder";
it.each([
 ["60 gündür gelmeyen müşteriler",{last_visit_min_days:60}],
 ["2 aydır dip boya yaptırmayan müşteriler",{service_id:crmFixture().options.services[0]!.id,service_last_visit_min_days:60}],
 ["balayage yaptıran ve gelecek randevusu olmayan müşteriler",{service_id:crmFixture().options.services[1]!.id,upcoming:"NONE"}],
 ["Selin'i tercih eden müşteriler",{preferred_staff_id:crmFixture().options.staff[0]!.id}],
 ["Selin'e gelen müşteriler",{staff_history_id:crmFixture().options.staff[0]!.id}],
 ["recovery takibi gereken müşteriler",{technical_followup:true,technical_followup_kind:"RECOVERY_REASSESSMENT_DUE"}],
 ["son randevusuna gelmeyen müşteriler",{last_no_show:true}],
])("interprets %s as editable authorized filters",(text,filter)=>{const r=interpretSearch(text,crmFixture().options);expect(r.status).toBe("MAPPED");expect(r.filter).toEqual(filter);expect(r.explanations.length).toBeGreaterThan(0);});
it.each(["60 gündür gelmeyen veya VIP müşteriler","60 gündür gelmeyen ve 1000 lira harcayan","select * from clients","mesaj gönder","4000 gündür gelmeyen müşteriler","Deniz'i tercih eden müşteriler","60 gündür gelmeyen rastgele bir koşul"])("never drops unsupported intent: %s",text=>{expect(interpretSearch(text,crmFixture().options).status).toBe("NEEDS_CLARIFICATION");});
it("ambiguous staff cannot be invented or selected arbitrarily",()=>{const f=crmFixture();f.options.staff.push({...f.options.staff[0]!,id:f.options.services[0]!.id,name:"Selin Demir"});expect(interpretSearch("Selin'i tercih eden müşteriler",f.options).status).toBe("NEEDS_CLARIFICATION");});
it("monthly translation is explicit and service recency does not silently mean any-service visit",()=>{const r=interpretSearch("2 aydır dip boya yaptırmayan müşteriler",crmFixture().options);expect(r.explanations[0]).toContain("30 günlük");expect(r.explanations[0]).toContain("diğer hizmet");expect(r.filter.last_visit_min_days).toBeUndefined();});
