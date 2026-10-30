"use client";
import { useEffect,useState } from "react";
import Link from "next/link";
import { hairTr } from "@/lib/i18n/hair-tr";
import { clientTimelineEvent,page } from "@/lib/crm/model";
import { dateTime,timelineLabel } from "@/lib/crm/labels";
import type { z } from "zod";
type Event=z.infer<typeof clientTimelineEvent>;
export function visibleTechnicalEvents(events:Event[],permissions:string[]){return events.filter(e=>e.visibility!=="PRIVATE_MANAGEMENT"&&e.visibility!=="RECEPTION"&&(["hair_passport","hair_history"].includes(e.source_domain)?permissions.includes("hair_passport.read"):e.source_domain==="color_plan"||e.source_domain==="controlled_recipe"?permissions.includes("color_plan.read"):e.source_domain==="live_session"?permissions.includes("live_session.view"):false));}
export function ClientColorJourney({clientId,permissions,read,onTimeline}:{clientId:string;permissions:string[];read:(raw:object)=>Promise<unknown>;onTimeline:()=>void}){
 const [stored,setData]=useState<{items:Event[];has_more:boolean;clientId:string;reader:typeof read}|null>(null),[failed,setFailed]=useState(false);
 const allowed=permissions.some(p=>["hair_passport.read","color_plan.read","live_session.view"].includes(p));
 useEffect(()=>{let alive=true;queueMicrotask(()=>{if(!alive)return;setData(null);setFailed(false);if(!allowed)return;void read({operation:"timeline",client_id:clientId,offset:0,limit:20}).then(raw=>{const next=page(clientTimelineEvent).parse(raw);if(alive&&!document.hidden&&navigator.onLine)setData({...next,clientId,reader:read});}).catch(()=>{if(alive)setFailed(true);});});return()=>{alive=false;};},[clientId,allowed,read]);
 if(!allowed)return null;
 const data=stored?.clientId===clientId&&stored.reader===read?stored:null;
 const items=visibleTechnicalEvents(data?.items??[],permissions).slice(0,5);
 const destination=(event:Event)=>["hair_passport","hair_history"].includes(event.source_domain)?`/workspace/clients/${event.source_client_id}/hair-passport`:event.source_domain==="live_session"?`/workspace/live-sessions?client_id=${event.source_client_id}&session_id=${event.source_id}`:`/workspace/colorlab?client_id=${event.source_client_id}`;
 return <section className="dossier-color-journey" aria-label="Müşterinin renk yolculuğu"><div className="dossier-section-label"><h2>Renk ve teknik kayıt yolculuğu</h2><button type="button" className="hp-text-button" onClick={onTimeline}>Tüm zaman çizelgesi →</button></div>{!data?<p role="status">{failed?"Teknik geçmiş doğrulanamadı.":"Teknik geçmiş yükleniyor…"}</p>:items.length?<ol className="dossier-timeline">{items.map(event=><li key={event.event_key} data-source={event.source_domain}><time dateTime={event.timestamp}>{dateTime(event.timestamp)}</time><div><strong>{timelineLabel(event.event_type)}</strong><p>{event.source_domain==="hair_history"&&Object.hasOwn(hairTr.categories,event.summary)?hairTr.categories[event.summary as keyof typeof hairTr.categories]:event.summary}</p><Link prefetch={false} href={destination(event)}>Kaynak kaydı aç ↗</Link>{event.source_client_id!==clientId&&<small>Birleştirilmiş özgün müşteri kaydı</small>}</div></li>)}</ol>:<p>Görüntülenen geçmiş sayfasında yetkili teknik kayıt yok.</p>}<p className="dossier-caption">İlk 20 zaman çizelgesi kaydından en fazla 5 teknik kayıt gösterilir. Tamamlanan hizmet, başarılı renk sonucu anlamına gelmez; sonuç kaydı yoksa sonuç bilinmiyor.</p></section>;
}
