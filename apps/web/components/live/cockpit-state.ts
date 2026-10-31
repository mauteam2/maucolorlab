import type { LiveSession } from "@/lib/live/model";
import { terminal } from "@/lib/live/model";
import { timerElapsed } from "@/lib/live/engine";

/** Presentation of recorded facts only. Commands still go through the existing service. */
export function cockpitState(s: LiveSession, now: number) {
 const steps = [...s.steps].sort((a,b)=>a.sequenceIndex-b.sequenceIndex);
 const current = steps.find(st=>st.status==="IN_PROGRESS") ?? steps.find(st=>st.status==="PENDING");
 const bowl = s.bowls.find(b=>b.id===current?.bowlId);
 const recipe = s.recipes.find(r=>r.id===(bowl?.recipeId??s.currentRecipeId))!;
 const currentRecipe = s.recipes.find(r=>r.id===s.currentRecipeId)!;
 const unresolved = s.riskEvents.filter(e=>!e.resolvedAt);
 const checks = s.checkpoints.filter(cp=>cp.required&&cp.result!=="PASS"&&s.steps.find(st=>st.id===cp.stepId)?.status!=="SUPERSEDED");
 const currentChecks = checks.filter(cp=>cp.stepId===current?.id);
 const stalePending = current?.status==="PENDING" && bowl?.recipeId!==s.currentRecipeId;
 const timers = [...s.timers].sort((a,b)=>{
  const priority=(t:typeof a)=>t.status==="RUNNING"?(timerElapsed(t,now)>=t.plannedDuration?0:t.stepId===current?.id?1:2):t.status==="PAUSED"?3:4;
  return priority(a)-priority(b);
 });
 const closed=terminal(s.status);
 const action=closed?null:s.status==="PREPARING"?{label:"Hazırlığı onayla",command:{type:"READY"}}:
  s.status==="READY"?{label:"Seansı başlat",command:{type:"START"}}:
  ["PAUSED","CHECKPOINT_REQUIRED"].includes(s.status)?{label:"Güvenlik kontrolünü aç",href:"#live-safety"}:
  s.status==="COMPLETION_REVIEW"?{label:"Son kaydı onayla",href:"#live-completion"}:
  stalePending?{label:"Reçete revizyonunu incele",href:"#live-revisions"}:
  current?.status==="IN_PROGRESS"&&currentChecks.length?{label:"Kontrolü kaydet",href:"#live-checkpoints"}:
  current?{label:current.status==="PENDING"?"Adımı başlat":"Adımı tamamla",command:{type:current.status==="PENDING"?"STEP_START":"STEP_COMPLETE",step_id:current.id}}:
  {label:"Sonuç incelemesini aç",href:"#live-completion"};
 return {steps,current,bowl,recipe,currentRecipe,unresolved,checks,currentChecks,stalePending,timers,closed,action};
}
export function clockText(seconds:number) {
 const n=Math.max(0,Math.ceil(seconds));
 return `${Math.floor(n/60).toString().padStart(2,"0")}:${(n%60).toString().padStart(2,"0")}`;
}
