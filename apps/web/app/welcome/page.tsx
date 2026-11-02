import Link from "next/link";
import { AuthFrame } from "@/components/auth-frame";
import { verifiedPageContext, pageEntryError } from "@/lib/auth-entry/server";
import { AccessError } from "@/lib/tenant/bootstrap";
import { readSalon } from "@/lib/salon/service";
export default async function WelcomePage() {
  const context = await verifiedPageContext("salon.read");
  if (context.role !== "owner") return pageEntryError(new AccessError("FORBIDDEN", 403));
  let salon;
  try { const today = new Date().toISOString().slice(0, 10); salon = await readSalon(today, today, crypto.randomUUID()); }
  catch (error) { return pageEntryError(error); }
  if (salon.context.role !== "owner") return pageEntryError(new AccessError("FORBIDDEN", 403));
  return <AuthFrame section="Salon başlangıç rehberi" privateContext><h1 id="entry-heading">Çalışma alanınız hazır</h1><p className="entry-lead">Salonunuza ait mevcut ayarları inceleyin. İsterseniz doğrudan bugünkü çalışma alanınıza geçebilirsiniz.</p>
    <div className="entry-owner-summary"><h2>{salon.context.organization_name}</h2><dl className="entry-context"><div><dt>Konum</dt><dd>{salon.data.location.name}</dd></div><div><dt>Saat dilimi</dt><dd>{salon.data.location.timezone}</dd></div><div><dt>Para birimi</dt><dd>{salon.data.location.currency}</dd></div></dl></div>
    <div className="entry-owner-links"><Link href="/workspace/settings"><strong>Salon ve çalışma saatleri →</strong><span>{salon.data.hours.version ? "Kayıtlı çalışma saatlerinizi inceleyin." : "Henüz çalışma saatleri kaydedilmemiş. Mevcut ayarlardan düzenleyin."}</span></Link><Link href="/workspace/settings"><strong>Hizmetlerinizi düzenleyin →</strong><span>{salon.data.services.filter(s => s.active).length} aktif hizmet. Süre, ekip ve kaynak ayarlarını gerçek hizmet kayıtlarından yönetin.</span></Link><Link href="/workspace/team"><strong>Ekibinizi inceleyin →</strong><span>Görevler ve çalışma planı mevcut ekip ekranında yönetilir.</span></Link>{salon.context.permissions.includes("stock.view") && <Link href="/workspace/stock"><strong>Stok temelini inceleyin →</strong><span>Ürün ve stok kayıtlarınızı mevcut stok alanından kontrol edin.</span></Link>}</div>
    <p className="entry-muted">Düzenlemeler ilgili ayar ekranlarında kaydedilir. Hazır olduğunuzda bugünkü planınıza devam edin.</p><div className="entry-actions"><Link className="button button-primary" href="/workspace">Bugünkü çalışma alanına geç</Link></div>
  </AuthFrame>;
}
