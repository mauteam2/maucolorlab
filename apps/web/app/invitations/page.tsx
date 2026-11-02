import Link from "next/link";
import { AuthFrame } from "@/components/auth-frame";
import { MembershipInvitationCard } from "@/components/membership-invitation-card";
import { readMyInvitations } from "@/lib/membership-invitations/service";
import { bootstrap } from "@/lib/tenant/bootstrap";
import { pageEntryError } from "@/lib/auth-entry/server";
import { PrivacyActionForm } from "@/components/privacy-action-form";
import { logout } from "@/app/sign-in/actions";
export default async function InvitationsPage() {
  let invitations, contexts;
  try { [invitations, contexts] = await Promise.all([readMyInvitations(), bootstrap()]); } catch (error) { return pageEntryError(error); }
  return <AuthFrame section="Salon daveti" privateContext><h1 id="entry-heading">{invitations.data.length ? "Davetinizi inceleyin" : "Bekleyen davetiniz yok"}</h1>
    <p className="entry-lead">{invitations.data.length ? "Salonunuzu, konumunuzu ve görevinizi kontrol ederek devam edin." : "Davetler yalnızca yetkilendirilmiş hesabınızda görünür. Erişiminizi salon yöneticinizle kontrol edebilirsiniz."}</p>
    <div className="entry-invitations">{invitations.data.map(item => <MembershipInvitationCard invitation={item} key={JSON.stringify(item)} />)}</div>
    <div className="entry-bottom-actions">{contexts.length > 0 && <Link className="entry-text-button" href="/entry">Mevcut çalışma alanına dön</Link>}<PrivacyActionForm action={logout}><button className="entry-text-button">Oturumu kapat</button></PrivacyActionForm></div>
  </AuthFrame>;
}
