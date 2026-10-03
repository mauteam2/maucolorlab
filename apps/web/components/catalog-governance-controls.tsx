"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
const labels:Record<string,string>={IMPORT:"Pilot taslağını oluştur",START_REVIEW:"Teknik incelemeyi başlat",COMPLETE_REVIEW:"Kaynak incelemesini tamamla",VALIDATE_GOLDEN:"Golden doğrulamayı çalıştır",APPROVE:"Kataloğu onayla",PUBLISH:"Kataloğu yayınla",RETIRE:"Kataloğu emekliye ayır",REJECT:"Kataloğu reddet"};
export function CatalogGovernanceControls({id,state,previousId}:{id?:string;state?:string;previousId?:string}){
 const [note,setNote]=useState(""),[pending,setPending]=useState(false),[message,setMessage]=useState("");const router=useRouter();
 const actions=!id?["IMPORT"]:state==="DRAFT"?["START_REVIEW","REJECT"]:state==="TECHNICAL_REVIEW"?["COMPLETE_REVIEW","REJECT"]:state==="GOLDEN_TEST"?["VALIDATE_GOLDEN","APPROVE","REJECT"]:state==="APPROVED"?["PUBLISH","REJECT"]:state==="PUBLISHED"?["RETIRE"]:[];
 async function command(operation:string){setPending(true);setMessage("");try{const r=await fetch(id?`/api/admin/catalogs/${id}/governance`:"/api/admin/catalogs/import",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({operation,note,...(previousId?{previous_id:previousId}:{})})});if(!r.ok){setMessage("İşlem tamamlanamadı. Yetkinizi ve inceleme sırasını kontrol edin.");return;}setMessage("Katalog işlemi kaydedildi.");router.refresh();}catch{setMessage("Bağlantı kurulamadı. Yeniden deneyin.");}finally{setPending(false);}}
 if(!actions.length)return null;
 return <section className="salon-card salon-stack"><label className="hp-form-field">İnceleme / karar notu<textarea value={note} maxLength={1000} onChange={e=>setNote(e.target.value)} disabled={pending}/></label><div className="salon-heading-actions">{actions.map(action=><button className={action==="REJECT"?"button button-secondary":"button button-primary"} disabled={pending||!note.trim()} onClick={()=>command(action)} key={action}>{labels[action]}</button>)}</div>{message&&<p role="status">{message}</p>}</section>;
}
