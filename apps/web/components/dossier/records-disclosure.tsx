"use client";
import { useEffect,useState,type ReactNode } from "react";
export function RecordsDisclosure({label,children,preference,onPreferenceChange}:{label:string;children:ReactNode;preference?:boolean;onPreferenceChange?:(open:boolean)=>void}){
 const [open,setOpen]=useState(true);
 useEffect(()=>{if(typeof matchMedia!=="function")return;const query=matchMedia("(max-width:600px)"),update=()=>setOpen(!query.matches);queueMicrotask(update);query.addEventListener("change",update);return()=>query.removeEventListener("change",update);},[]);
 const expanded=preference??open;
 return <details className="dossier-record-disclosure" open={expanded} onToggle={event=>setOpen(event.currentTarget.open)}><summary onClick={event=>{event.preventDefault();setOpen(!expanded);onPreferenceChange?.(!expanded);}}>{label}</summary>{children}</details>;
}
