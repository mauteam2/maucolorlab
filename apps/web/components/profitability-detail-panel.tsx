"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {costingSnapshot,profitabilityBreakdown} from "@/lib/costing/model";
import {formatMoney} from "@/lib/finance/model";
import type {z} from "zod";
export function ProfitabilityDetailPanel({chargeId}:{chargeId:string}){
 const [data,setData]=useState<z.infer<typeof profitabilityBreakdown>|null>(null),[error,setError]=useState(false);
 useEffect(()=>{let generation=0;const controller=new AbortController();const load=async()=>{const n=++generation;try{const r=await fetch("/api/costing?charge_id="+chargeId,{cache:"no-store",signal:controller.signal});if(!r.ok)throw new Error();const snapshot=costingSnapshot.parse((await r.json()).data),p=profitabilityBreakdown.parse(snapshot.items[0]);if(n===generation&&!document.hidden&&p.charge_id===chargeId){setData(p);setError(false);}}catch{if(n===generation&&!controller.signal.aborted){setData(null);setError(true);}}};
  const conceal=()=>{generation++;setData(null);},focus=()=>{if(!document.hidden)void load();},visibility=()=>document.hidden?conceal():focus();void load();window.addEventListener("blur",conceal);window.addEventListener("focus",focus);document.addEventListener("visibilitychange",visibility);const timer=setInterval(focus,15000);return()=>{generation++;clearInterval(timer);controller.abort();window.removeEventListener("blur",conceal);window.removeEventListener("focus",focus);document.removeEventListener("visibilitychange",visibility);};},[chargeId]);
 const money=(n:string|null)=>n===null?"Bilinmiyor":formatMoney(n,data?.currency??"TRY",data?.currency==="JPY"?0:data?.currency==="KWD"?3:2);
 const current=data?.charge_id===chargeId?data:null;
 return <div className="costing-source"><h3>Doğrudan operasyonel katkı</h3>{current?<><p>Vergi hariç gelir: {money(current.net_revenue_minor)}</p><p>Ürün maliyeti: {money(current.direct_product_cost_minor)}</p><p>Komisyon tahakkuku: {current.commission_disclosed?money(current.commission_minor):"Yetki gerektirir"}</p><p>Komisyon sonrası katkı: {money(current.contribution_after_commission_minor)}</p>{current.cost_status!=="KNOWN"&&<p>Maliyet {current.cost_status==="PARTIAL"?"kısmen biliniyor":"bilinmiyor"}; katkı ve marj hesaplanamaz.</p>}</>:<p>{error?"Katkı bilgisi okunamadı.":"Katkı yükleniyor…"}</p>}<Link href={"/workspace/finance/profitability?charge_id="+chargeId}>Hesap yöntemini ve kaynakları aç</Link></div>;
}
