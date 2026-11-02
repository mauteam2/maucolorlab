import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { AuthFrame } from "@/components/auth-frame";
import { bootstrap } from "@/lib/tenant/bootstrap";
import { readMyInvitations } from "@/lib/membership-invitations/service";
import { pageEntryError } from "@/lib/auth-entry/server";
import { resolveSelection, selectionCookie, workspaceReference } from "@/lib/tenant/context";
import { tr } from "@/lib/i18n/tr";
import { logout } from "@/app/sign-in/actions";
import { selectWorkspace } from "./actions";
import { PrivacyActionForm } from "@/components/privacy-action-form";
export default async function WorkspacesPage({ searchParams }: { searchParams: Promise<{ choose?: string; reason?: string }> }) {
  const query = await searchParams;
  let contexts;
  try { contexts = await bootstrap(); } catch (error) { return pageEntryError(error); }
  const reference = (await cookies()).get(selectionCookie)?.value;
  if (reference && !resolveSelection(contexts, reference)) redirect("/auth/workspace-reset");
  if (!query.choose && !query.reason && resolveSelection(contexts, reference)) redirect("/workspace");
  let pending = 0, invitationsUnavailable = false;
  try { pending = (await readMyInvitations()).data.length; } catch (error) { if (!contexts.length) return pageEntryError(error); invitationsUnavailable = true; }
  if (!contexts.length && pending && !query.reason) redirect("/invitations");
  return <AuthFrame section={contexts.length ? "Çalışma alanları" : "Kontrollü erişim"} privateContext>
    {!contexts.length && <div className="entry-state-icon" aria-hidden="true">—</div>}
    <h1 id="entry-heading">{contexts.length ? tr.select : tr.noMembership}</h1>
    <p className="entry-lead">{contexts.length ? "Yetkili olduğunuz salon ve konumu seçerek devam edin." : pending ? "Önceki çalışma alanınız açılamadı. Size açık salon davetlerini inceleyebilirsiniz." : "Bu hesap için kullanılabilir çalışma alanı veya bekleyen davet bulunamadı. Salon yöneticinizden üyeliğinizi kontrol etmesini isteyin."}</p>
    {query.reason && <p role="alert" className="entry-feedback">Önceki çalışma alanınız artık kullanılamıyor. Güncel erişiminizi yeniden kontrol edin.</p>}
    <div className="workspace-options entry-workspace-options">{contexts.map((context) => <PrivacyActionForm action={selectWorkspace} key={workspaceReference(context)}>
      <input type="hidden" name="reference" value={workspaceReference(context)} />
      <button className="workspace-option"><strong>{context.organization_name}</strong>
        <span>{context.location_name}</span><small>{tr.roles[context.role]}</small><span aria-hidden="true" className="entry-option-arrow">→</span></button>
    </PrivacyActionForm>)}</div>
    {pending > 0 && <Link className="entry-invite-link" href="/invitations">Salon davetlerinizi inceleyin <span>{pending}</span></Link>}
    {invitationsUnavailable && <p role="status" className="entry-muted">Davetler şu anda kontrol edilemiyor. Mevcut çalışma alanlarınızı kullanabilirsiniz.</p>}
    <div className="entry-bottom-actions"><Link href="/entry">{tr.retry}</Link><PrivacyActionForm action={logout}><button className="entry-text-button">{tr.logout}</button></PrivacyActionForm></div>
  </AuthFrame>;
}
