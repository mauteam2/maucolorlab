import Link from "next/link";
import { AppShell } from "@/components/app-shell";

export default function HomePage() {
  return (
    <AppShell>
      <main className="hero" id="main-content">
        <p className="eyebrow">Profesyonel renk zekâsı</p>
        <h1>Renk çalışmalarınız için sakin ve güvenilir bir temel.</h1>
        <p className="lead">
          ELIFORA, teknik renk kararları ile salon operasyonlarını aynı güvenli çalışma alanında buluşturur.
        </p>
        <div className="actions">
          <Link className="button button-primary" href="/workspace">
            Çalışma alanını aç
          </Link>
          <Link className="button button-secondary" href="/sign-in">
            Oturum aç
          </Link>
        </div>
        <section className="foundation-card" aria-labelledby="foundation-title">
          <span className="status-mark" aria-hidden="true">✓</span>
          <div>
            <h2 id="foundation-title">Temel hazırlanıyor</h2>
            <p>Güvenli üyelik, konum erişimi ve platform altyapısı kuruldu.</p>
          </div>
        </section>
      </main>
    </AppShell>
  );
}

