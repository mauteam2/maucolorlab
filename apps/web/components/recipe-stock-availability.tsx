"use client";
import {useEffect,useState} from "react";
import {stockSnapshot} from "@/lib/stock/model";
import {tenantContextSchema,workspaceReference} from "@/lib/tenant/context";
/** Read-only operational availability after verified compatibility. This never
 * selects an alternative, changes a recipe, or supplies technical safety. */
export function RecipeStockAvailability({productId,developerId,reference}:{productId:string;developerId:string;reference:string}){
 const [state,setState]=useState<{key:string;entries:{label:string;status:string;item:string|null}[]}|null>(null),key=productId+developerId+reference;
 useEffect(()=>{const controller=new AbortController();let alive=true;async function load(){const entries=await Promise.all(([{id:productId,label:"Boya"},{id:developerId,label:"Geliştirici"}]).map(async product=>{try{const r=await fetch(`/api/stock?catalog_product_id=${product.id}`,{cache:"no-store",signal:controller.signal}),body=await r.json();if(!r.ok||workspaceReference(tenantContextSchema.parse(body.context))!==reference)throw new Error("Stock unavailable");const d=stockSnapshot.parse(body.data),i=d.items.find(i=>i.active);return {label:product.label,status:!d.settings||!i?"UNKNOWN":i.stock_status,item:i?.id??null};}catch{return {label:product.label,status:"UNKNOWN",item:null};}}));if(alive&&!controller.signal.aborted&&!document.hidden)setState({key,entries});}void load();return()=>{alive=false;controller.abort();};},[productId,developerId,reference,key]);
 return <aside aria-label="Reçete stok durumu" className="salon-notice"><strong>Şube stok durumu</strong>{state?.key===key?state.entries.map(e=><p key={e.label}>{e.label}: {({OK:"Yeterli",LOW:"Azaldı",OUT:"OUT_OF_STOCK · Tükendi",UNKNOWN:"UNKNOWN · Bilinmiyor"})[e.status]}{e.item&&<> · <a href={`/workspace/stock?item_id=${e.item}`}>Stok kartı</a></>}</p>):<p>Stok doğrulanıyor…</p>}<p>Stok bilgisi teknik uygunluk sağlamaz. Ürün veya geliştirici otomatik değiştirilmez.</p></aside>;
}
