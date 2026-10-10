"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {costingSnapshot,profitabilityBreakdown} from "@/lib/costing/model";
import {formatMoney} from "@/lib/finance/model";
import type {z} from "zod";
export function ProfitabilityDetailPanel({chargeId}:{chargeId:string}){
 const [data,setData]=useState<z.infer<typeof profitabilityBreakdown>|null>(null),[error,setError]=useState(false);
 useEffect(()=>{let generation=0;const controller=new AbortController();const load=async()=>{const n=++generation;try{const r=await fetch("/api/costing?charge_id="+chargeId,{cache:"no-store",signal:controller.signal});if(!r.ok)throw new Error();const snapshot=costingSnapshot.parse((await r.json()).data),p=profitabilityBreakdown.parse(snapshot.items[0]);if(n===generation&&!document.hidden&&p.charge_id===chargeId){setData(p);setError(false);}}catch{if(n===generation&&!controller.signal.aborted){setData(null);setError(true);}}};
  const conceal=()=>{generation++;setData(null);},focus=()=>{if(!document.hidden)void load();},visibility=()=>document.hidden?conceal():focus();void load();window.addEventListener("blur",conceal);window.addEventListener("focus",focus);document.addEventListener("visibilitychange",visibility);return()=>{generation++;controller.abort();window.removeEventListener("blur",conceal);window.removeEventListener("focus",focus);document.removeEventListener("visibilitychange",visibility);};},[chargeId]);
 const money=(n:string|null)=>n===null?"Bilinmiyor":formatMoney(n,data?.currency??"TRY",data?.currency==="JPY"?0:data?.currency==="KWD"?3:2);
 return <div className="costing-source"><h3>Doğrudan operasyonel katkı</h3>{data?<><p>Vergi hariç gelir: {money(data.net_revenue_minor)}</p><p>Ürün maliyeti: {money(data.direct_product_cost_minor)}</p><p>Komisyon tahakkuku: {data.commission_disclosed?money(data.commission_minor):"Yetki gerektirir"}</p><p>Komisyon sonrası katkı: {money(data.contribution_after_commission_minor)}</p>{data.cost_status!=="KNOWN"&&<p>Maliyet {data.cost_status==="PARTIAL"?"kısmen biliniyor":"bilinmiyor"}; katkı ve marj hesaplanamaz.</p>}</>:<p>{error?"Katkı bilgisi okunamadı.":"Katkı yükleniyor…"}</p>}<Link href={"/workspace/finance/profitability?charge_id="+chargeId}>Hesap yöntemini ve kaynakları aç</Link></div>;
}
