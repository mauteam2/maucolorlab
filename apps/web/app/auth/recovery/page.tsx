import { AccountRecoveryForm } from "@/components/account-recovery-form";
import { AuthFrame } from "@/components/auth-frame";
export default function RecoveryPage(){return <AuthFrame section="Hesap kurtarma"><h1 id="entry-heading">Parolanızı yenileyin</h1><p className="entry-lead">Yetkilendirilmiş hesabınıza ait e-posta adresini girin. Kurtarma isteğinizi bu adresle kontrol edelim.</p><AccountRecoveryForm/></AuthFrame>;}
