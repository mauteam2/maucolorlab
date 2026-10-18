"use client";
import { useActionState,useEffect } from "react";
import { requestRecovery,updateRecoveredPassword } from "@/app/auth/recovery/actions";
import { lockDraftVault } from "@/lib/offline/vault";
export function AccountRecoveryForm({update=false}:{update?:boolean}){
 const [state,action,pending]=useActionState(update?updateRecoveredPassword:requestRecovery,{code:""});
 useEffect(()=>{lockDraftVault();window.dispatchEvent(new Event("elifora-offline-lock"));if(typeof BroadcastChannel!=="undefined"){const c=new BroadcastChannel("elifora-offline-privacy");c.postMessage("LOCK");c.close();}},[]);
 return <form action={action} className="auth-form">{update?<><label>Yeni parola<input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128}/></label><label>Parolayı doğrulayın<input name="confirm" type="password" autoComplete="new-password" required minLength={12} maxLength={128}/></label></>:<label>E-posta<input name="email" type="email" autoComplete="email" required maxLength={254}/></label>}{state.code&&<p role="status">{state.code==="RECOVERY_REQUESTED"?"Bu adres için kurtarma mümkünse e-posta gönderilecektir.":state.code==="RECOVERY_COMPLETE"?"Parolanız güncellendi. Yeniden oturum açın.":state.code==="RECOVERY_REVOKE_REQUIRED"?"Parolanız güncellendi; oturumları kapatma doğrulanamadı. Destek ile görüşün.":"İşlem tamamlanamadı. Bilgilerinizi veya kurtarma bağlantısını kontrol edin."}</p>}<button className="button button-primary" disabled={pending||state.code==="RECOVERY_COMPLETE"}>{pending?"İşleniyor…":update?"Parolayı güncelle":"Kurtarma bağlantısı gönder"}</button><a href="/sign-in">Oturum açmaya dön</a></form>;
}
