import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth-frame";
import { MembershipInvitationCard } from "@/components/membership-invitation-card";
import { readMyInvitations } from "@/lib/membership-invitations/service";
import { AccessError, bootstrap } from "@/lib/tenant/bootstrap";
import { pageEntryError } from "@/lib/auth-entry/server";
export default async function InvitationPage({ params }: { params: Promise<{ membershipId: string }> }) {
  const { membershipId } = await params;
  let invitation;
  try { await bootstrap(); invitation = (await readMyInvitations(membershipId)).data[0]; }
  catch (error) {
    if (error instanceof AccessError && error.status === 401) redirect("/sign-in?reason=UNAUTHENTICATED&returnTo=%2Finvitations");
    if (!(error instanceof AccessError) || !["INVITATION_NOT_FOUND", "VALIDATION_FAILED"].includes(error.code)) return pageEntryError(error);
  }
  return <AuthFrame section="Salon daveti" privateContext>{invitation ? <><h1 id="entry-heading">Davetinizi inceleyin</h1><p className="entry-lead">Devam etmeden önce salon ve görev bilgilerinizi kontrol edin.</p><div className="entry-invitations"><MembershipInvitationCard invitation={invitation} key={JSON.stringify(invitation)} /></div></> : <><div className="entry-state-icon" aria-hidden="true">—</div><h1 id="entry-heading">Bu davet kullanılamıyor</h1><p className="entry-lead" role="status">Salon yöneticinizle erişiminizi kontrol edin. Çalışma alanınıza veya size açık diğer davetlere dönebilirsiniz.</p></>}
    <div className="entry-bottom-actions"><Link href="/entry">Çalışma alanına dön</Link><Link href="/invitations">Salon davetlerim</Link></div>
  </AuthFrame>;
}
