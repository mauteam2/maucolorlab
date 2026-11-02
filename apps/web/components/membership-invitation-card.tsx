"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { membershipInvitation, invitationAcceptanceResult } from "@/lib/membership-invitations/model";
import { tenantContextSchema } from "@/lib/tenant/context";
import { invitationMessages } from "@/lib/auth-entry/presentation";
import { tr } from "@/lib/i18n/tr";
const acceptedResponse = invitationAcceptanceResult.extend({ workspaces: tenantContextSchema.array() });
type Invitation = z.infer<typeof membershipInvitation>;
const states = { PENDING: "Davet bekliyor", ACTIVE: "Üyelik etkin", REVOKED: "Artık aktif değil", ORGANIZATION_UNAVAILABLE: "Salon kullanılamıyor", LOCATION_UNAVAILABLE: "Konum kullanılamıyor" };
export function MembershipInvitationCard({ invitation }: { invitation: Invitation }) {
  const router = useRouter(), requestId = useRef<string | null>(null), inFlight = useRef(false);
  const [pending, setPending] = useState(false), [error, setError] = useState(""), [destination, setDestination] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false), [unavailable, setUnavailable] = useState(false), [terminal, setTerminal] = useState(false);
  const [canonical, setCanonical] = useState<Invitation | null>(null);
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => { if (error || confirmed || unavailable) feedback.current?.focus(); }, [error, confirmed, unavailable]);
  const actionable = invitation.state === "PENDING" && !confirmed && !unavailable && !terminal;
  async function accept() {
    if (inFlight.current || !actionable) return;
    inFlight.current = true; setPending(true); setError(""); requestId.current ??= crypto.randomUUID();
    try {
      const response = await fetch(`/api/membership-invitations/${invitation.membership_id}`, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request_id: requestId.current }) });
      const body: unknown = await response.json();
      if (response.status === 401) { router.replace("/sign-in?reason=SESSION_EXPIRED&returnTo=%2Finvitations"); return; }
      if (response.status === 403) { router.replace("/auth/access?reason=FORBIDDEN"); return; }
      if (!response.ok) {
        const code = z.object({ code: z.string() }).safeParse(body);
        if (code.success && ["INVITATION_NOT_FOUND", "INVITATION_REVOKED", "INVITATION_UNAVAILABLE", "INVITATION_REPLAY_CONFLICT"].includes(code.data.code)) setTerminal(true);
        setError(code.success && Object.hasOwn(invitationMessages, code.data.code) ? invitationMessages[code.data.code as keyof typeof invitationMessages] : invitationMessages.NETWORK_ERROR); return;
      }
      const reply = acceptedResponse.safeParse(body);
      if (!reply.success || reply.data.data.membership_id !== invitation.membership_id || reply.data.data.state !== "ACTIVE") throw new Error("Unconfirmed response");
      if (!reply.data.workspaces.some(context => context.membership_id === invitation.membership_id)) { setUnavailable(true); return; }
      setCanonical(reply.data.data);
      setDestination(reply.data.workspaces.length === 1 ? "/workspace" : "/workspaces?choose=1"); setConfirmed(true);
    } catch { setError(invitationMessages.NETWORK_ERROR); }
    finally { inFlight.current = false; setPending(false); }
  }
  return <article className="entry-invitation" aria-busy={pending}>
    <div className="entry-invitation-top"><span className="entry-salon-symbol" aria-hidden="true">{invitation.organization_name.slice(0, 1)}</span><span className={`entry-badge${invitation.state === "REVOKED" ? " entry-badge-muted" : ""}`}>{confirmed ? "Davet kabul edildi" : states[invitation.state]}</span></div>
    <h2>{(canonical ?? invitation).organization_name}</h2>
    <dl className="entry-context"><div><dt>Konum</dt><dd>{(canonical ?? invitation).location_name ?? "Salonun yetkili konumları"}</dd></div><div><dt>Göreviniz</dt><dd>{tr.roles[(canonical ?? invitation).role_code]}</dd></div><div><dt>Davet tarihi</dt><dd>{new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(invitation.invited_at))}</dd></div></dl>
    {confirmed ? <div ref={feedback} tabIndex={-1} className="entry-confirmation" role="status"><h3>Davet kabul edildi</h3><p>Erişiminiz kontrol edildi. Şimdi çalışma alanınıza devam edebilirsiniz.</p><button className="button button-primary" onClick={() => router.replace(destination!)}>Çalışma alanına devam et</button></div>
      : unavailable ? <div ref={feedback} tabIndex={-1} role="status" className="entry-feedback"><h3>Çalışma alanı şu anda açılamıyor</h3><p>Üyeliğiniz kontrol edildi, ancak kullanılabilir bir çalışma alanı bulunamadı. Salon yöneticinizle görüşün.</p><Link href="/entry">Erişimi yeniden kontrol et</Link></div>
      : invitation.state === "ACTIVE" ? <div className="entry-confirmation"><p>Bu üyelik zaten etkin. Güncel çalışma alanlarınızla devam edin.</p><Link className="button button-primary" href="/entry" replace>Çalışma alanına devam et</Link></div>
      : invitation.state === "REVOKED" ? <p className="entry-feedback" role="status">Bu davet artık aktif değil. Erişiminizi salon yöneticinizle kontrol edin.</p>
      : invitation.state !== "PENDING" ? <p className="entry-feedback" role="status">Bu salon veya konum için erişim şu anda tamamlanamıyor. Başka bir konuma aktarım yapılmaz.</p> : null}
    {error && <div ref={feedback} tabIndex={-1} role="alert" className="entry-feedback"><p>{error}</p><button className="entry-text-button" onClick={() => router.refresh()}>Daveti güncelle</button></div>}
    {actionable && <><p className="entry-invite-note">Davet, yukarıdaki salon ve görev için geçerlidir. Kabul ettikten sonra çalışma alanınıza devam edebilirsiniz.</p><button className="button button-primary entry-accept" disabled={pending} onClick={accept}>{pending ? "Davet kabul ediliyor…" : "Daveti kabul et"}</button></>}
  </article>;
}
