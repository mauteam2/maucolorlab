"use client";
import { useActionState,useEffect,useRef,useState } from "react";
import { requestRecovery,updateRecoveredPassword } from "@/app/auth/recovery/actions";
import { lockDraftVault } from "@/lib/offline/vault";
import { PasswordField } from "./password-field";
export function AccountRecoveryForm({update=false}:{update?:boolean}){
 const [state,action,pending]=useActionState(update?updateRecoveredPassword:requestRecovery,{code:""});
 const [mismatch,setMismatch]=useState(false),feedback=useRef<HTMLParagraphElement>(null);
 useEffect(()=>{if(state.code||mismatch)feedback.current?.focus();},[state,mismatch]);
 useEffect(()=>{lockDraftVault();window.dispatchEvent(new Event("elifora-offline-lock"));if(typeof BroadcastChannel!=="undefined"){const c=new BroadcastChannel("elifora-offline-privacy");c.postMessage("LOCK");c.close();}},[state.code]);
 const code=mismatch?"MISMATCH":state.code;
 const failed=["MISMATCH","INVALID_PASSWORD","RECOVERY_INVALID","RECOVERY_REVOKE_REQUIRED"].includes(code);
 return <form action={action} className="auth-form" aria-busy={pending} onSubmit={event=>{if(update){const data=new FormData(event.currentTarget);if(data.get("password")!==data.get("confirm")){event.preventDefault();setMismatch(true);return;}}setMismatch(false);}}>
  {update?<><PasswordField id="new-password" name="password" label="Yeni parola" autoComplete="new-password" minLength={12} maxLength={128} invalid={failed} describedBy="recovery-password-help"/><p id="recovery-password-help" className="entry-form-help">12–128 karakter kullanın.</p><PasswordField id="confirm-password" name="confirm" label="Parolayı doğrulayın" autoComplete="new-password" minLength={12} maxLength={128} invalid={mismatch} describedBy={code?"recovery-feedback":undefined}/></>:<div className="entry-field"><label htmlFor="recovery-email">E-posta</label><input id="recovery-email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254}/></div>}
  {code&&<p ref={feedback} id="recovery-feedback" tabIndex={-1} role={failed?"alert":"status"} className="entry-feedback">{code==="RECOVERY_REQUESTED"?"İsteğiniz alındı. Bu adres için kurtarma açıksa, sonraki adımları e-postanızdan takip edebilirsiniz.":code==="RECOVERY_COMPLETE"?"Parolanız güncellendi. Yeniden oturum açın.":code==="RECOVERY_REVOKE_REQUIRED"?"Parolanız güncellendi; önceki oturumların kapatıldığı doğrulanamadı. Salon yöneticinizle görüşün.":code==="MISMATCH"?"Parolalar eşleşmiyor. Doğrulama alanını kontrol edin.":code==="INVALID_PASSWORD"?"12–128 karakterlik bir parola girin ve iki alanın eşleştiğini kontrol edin.":"Kurtarma oturumu kullanılamıyor. Yeni bir kurtarma isteği oluşturun."}</p>}
  <button className="button button-primary" disabled={pending||state.code==="RECOVERY_COMPLETE"||state.code==="RECOVERY_REVOKE_REQUIRED"}>{pending?"İşleniyor…":update?"Parolayı güncelle":"Kurtarma bağlantısı iste"}</button><a href="/sign-in" className="entry-text-button">Oturum açmaya dön</a>
 </form>;
}
