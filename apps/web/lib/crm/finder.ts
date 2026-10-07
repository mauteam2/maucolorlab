import { clientSearchFilter,searchInterpretation,type Options,type SearchFilter } from "./model";
export const normalize=(s:string)=>s.toLocaleLowerCase("tr-TR").replaceAll("ı","i").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
/** A closed grammar resolves names only against the authorized salon directory. No model or SQL generation. */
export function interpretSearch(text:string,data:Options){
 const n=normalize(text),filter:SearchFilter={},explanations:string[]=[],ambiguities:string[]=[];let remainder=n;
 const days=n.match(/(?:son )?(\d+) (gundur|gun|aydir|ay)/);
 if(days){remainder=remainder.replace(days[0],"");const value=Number(days[1])*(days[2]!.startsWith("ay")?30:1);if(value<1||value>3650)ambiguities.push("Süre 1–3650 gün aralığında olmalı.");else{filter.last_visit_min_days=value;explanations.push(`Son ziyaret en az ${value} gün önce${days[2]!.startsWith("ay")?" (ay ifadesi 30 günlük filtre birimine çevrildi)":""}.`);}}
 if(n.includes("gelecek randevusu olmayan")||n.includes("gelecek randevusu yok")){filter.upcoming="NONE";explanations.push("Gelecek randevusu yok.");}
 if(n.includes("son randevusuna gelmeyen")){filter.last_no_show=true;explanations.push("Son sonuçlanan randevu: gelmedi.");}
 if(n.includes("recovery")||n.includes("iyilestirme takibi")){filter.technical_followup_kind="RECOVERY_REASSESSMENT_DUE";filter.technical_followup=true;explanations.push("Mevcut teknik kaynakta iyileştirme yeniden değerlendirmesi gerekli.");}
 if(n.includes("teknik takip")){filter.technical_followup=true;explanations.push("Kayıtlı teknik takip gereksinimi var.");}
 const services=data.services.filter(s=>n.includes(normalize(s.name))||normalize(s.name).startsWith("dip boya")&&n.includes("dip boya"));
 if(services.length===1){filter.service_id=services[0]!.id;remainder=remainder.replace(normalize(services[0]!.name),"").replace("dip boya","");if(filter.last_visit_min_days){filter.service_last_visit_min_days=filter.last_visit_min_days;delete filter.last_visit_min_days;explanations[0]=`Son tamamlanmış ${services[0]!.name} hizmetinden en az ${filter.service_last_visit_min_days} gün geçti${days?.[2]?.startsWith("ay")?" (ay, 30 günlük filtre birimidir)":""}; diğer hizmet ziyaretleri bu süreyi sıfırlamaz.`;}explanations.push(`Tamamlanmış hizmet geçmişi: ${services[0]!.name}.`);}else if(services.length>1)ambiguities.push("Birden fazla hizmet eşleşti; hizmet filtresini seçin.");
 if(/tercih eden| gelen/.test(n)){
 const raw=text.match(/^\s*([\p{L} .-]+?)[’'](?:i|ı|u|ü|e|a)\b/u)?.[1]??text.split(/tercih eden|gelen/i)[0]?.trim()??"";
 const name=normalize(raw.replace(/[’'][a-zıüöçşğ]+$/i,"")),staff=data.staff.filter(s=>normalize(s.name)===name||normalize(s.name).startsWith(`${name} `));
 if(staff.length===1){remainder=remainder.replace(name,"").replace(/\b(i|u|e|a)\b/,"");if(n.includes("tercih eden"))filter.preferred_staff_id=staff[0]!.id;else filter.staff_history_id=staff[0]!.id;explanations.push(`${n.includes("tercih eden")?"Tercih edilen personel":"Tamamlanmış ziyaret personeli"}: ${staff[0]!.name}.`);}else ambiguities.push("Personel adı tek bir mevcut üyelikle eşleşmedi; personeli seçin.");
 }
 if(n.includes("balayage")&&!services.length)ambiguities.push("Bu salonda eşleşen balayage hizmeti bulunamadı.");
 if(!explanations.length)ambiguities.push("Bu ifade desteklenen filtrelere dönüştürülemedi. Ad, telefon veya e-posta aramasını ya da yapılandırılmış filtreleri kullanın.");
 if(/vip|ciro|harcama|puan|risk skoru|sql|select|delete|drop|mesaj gonder/.test(n))ambiguities.push("Bu istek izin verilen CRM filtreleri kapsamında değil.");
 remainder=remainder.replace(/gelecek randevusu (olmayan|yok)|son randevusuna gelmeyen|iyilestirme takibi|recovery|teknik takip|tercih eden|takibi (gereken|gerekli)|yaptirmayan|yaptiran|gelmeyen|gelen|musteriler(?:i)?|kisiler|olan|olmayan|gereken|gerekli|ve|son/gi," ").replace(/\s+/g," ").trim();
 if(remainder)ambiguities.push("İfadenin bir bölümü desteklenen dil kalıplarıyla eşleşmedi; yapılandırılmış filtreleri seçin.");
 return searchInterpretation.parse({status:ambiguities.length?"NEEDS_CLARIFICATION":"MAPPED",filter:clientSearchFilter.parse(filter),explanations,ambiguities});
}
