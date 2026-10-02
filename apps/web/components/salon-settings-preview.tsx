"use client";
import { useState } from "react";
import { SalonCard } from "./salon-frame";
import { SalonIcon } from "./salon-icon";
const sections=["Salon bilgileri","Çalışma saatleri","Bildirimler","Erişim ve roller","Görünüm"];
const days=["Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi","Pazar"];
export function SalonSettingsPreview({onSave}:{onSave:()=>void}) {
 const [tab,setTab]=useState(sections[0]);
 const [name,setName]=useState("Örnek çalışma alanı");
 const [branch,setBranch]=useState("Merkez");
 const [hours,setHours]=useState(days.map((_,index)=>({start:"09:00",end:"18:00",closed:index===6})));
 const [reminders,setReminders]=useState(true);
 const [notifications,setNotifications]=useState(true);
 return <><form id="salon-settings-form" onSubmit={event=>{event.preventDefault();onSave();}}><div className="salon-settings-grid">
 <SalonCard className="salon-settings-nav"><nav aria-label="Ayar bölümleri">{sections.map((label,index)=><button type="button" key={label} aria-pressed={tab===label} onClick={()=>setTab(label)}><SalonIcon name={(["home","clock","calendar","team","settings"] as const)[index]!}/>{label}</button>)}</nav></SalonCard>
 <SalonCard title={tab}>
 {tab==="Salon bilgileri"&&<><p className="salon-muted">Salonunuzun temel bilgilerini düzenleyin.</p><div className="salon-setting-mark"><span className="salon-icon-disc"><SalonIcon name="home"/></span><span className="salon-muted">Salon görünümü<br/>Örnek çalışma alanı</span></div><div className="salon-form-grid"><label>Salon adı<input required value={name} onChange={event=>setName(event.target.value)}/></label><label>Şube adı<input required value={branch} onChange={event=>setBranch(event.target.value)}/></label><label>Saat dilimi<select defaultValue="Europe/Istanbul"><option>Europe/Istanbul</option><option>Europe/London</option></select></label><label>Dil<select><option>Türkçe</option></select></label><label>Para birimi<select><option>TRY · Türk lirası</option></select></label><label className="wide">Adres<textarea rows={3} placeholder="Salon adresini girin"/></label></div></>}
 {tab==="Çalışma saatleri"&&<div className="salon-stack">{days.map((day,index)=><div key={day} className="salon-work-hour"><label><input type="checkbox" checked={!hours[index]!.closed} onChange={event=>setHours(hours.map((value,i)=>i===index?{...value,closed:!event.target.checked}:value))}/>{day}</label><input aria-label={`${day} açılış`} type="time" disabled={hours[index]!.closed} value={hours[index]!.start} onChange={event=>setHours(hours.map((value,i)=>i===index?{...value,start:event.target.value}:value))}/><input aria-label={`${day} kapanış`} type="time" disabled={hours[index]!.closed} value={hours[index]!.end} min={hours[index]!.start} onChange={event=>setHours(hours.map((value,i)=>i===index?{...value,end:event.target.value}:value))}/></div>)}</div>}
 {tab==="Bildirimler"&&<p className="salon-muted">Bildirim seçeneklerini sağdaki karttan düzenleyin.</p>}
 {tab==="Erişim ve roller"&&<div className="salon-stack">{["Salon sahibi","Salon yöneticisi","Renk uzmanı","Asistan","Resepsiyon"].map(role=><div className="salon-notice" key={role}>{role}</div>)}</div>}
 {tab==="Görünüm"&&<div className="salon-palette">{["#F7F1EB","#3B2432","#6E4B3A","#B98562","#E8D8CC"].map(color=><span key={color} title={color} style={{background:color}}/>)}</div>}
 </SalonCard>
 <div className="salon-stack salon-settings-side"><SalonCard title="Çalışma alanı"><p className="salon-muted">Bu çalışma alanı için temel bilgiler.</p><div className="salon-setting-mark"><span className="salon-icon-disc"><SalonIcon name="home"/></span><div><h3>{branch} şube</h3><p className="salon-muted">{name}</p></div></div></SalonCard><SalonCard title="Bildirim tercihleri"><p className="salon-muted">Önemli güncellemeleri nasıl alırsınız?</p><label className="salon-switch-row"><span>Randevu hatırlatmaları<small>Randevu öncesi hatırlatma alın.</small></span><input type="checkbox" role="switch" checked={reminders} onChange={event=>setReminders(event.target.checked)}/></label><label className="salon-switch-row"><span>Uygulama bildirimleri<small>Yeni randevu ve önemli gelişmeler.</small></span><input type="checkbox" role="switch" checked={notifications} onChange={event=>setNotifications(event.target.checked)}/></label></SalonCard></div>
 </div></form><div style={{marginTop:16}}><SalonCard title="Çalışma takvimi"><p className="salon-muted">Salonunuzun standart çalışma saatleri.</p><div className="salon-workdays">{days.map((day,index)=><div key={day}><strong>{day}</strong><p className="salon-muted">{hours[index]!.closed?"Kapalı":`${hours[index]!.start}–${hours[index]!.end}`}</p></div>)}</div><p className="salon-muted">İstisna günleri ayrıca yönetilir.</p></SalonCard></div></>;
}
