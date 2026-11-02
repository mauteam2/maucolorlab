import type { ReactNode } from "react";
import Link from "next/link";
import { BrandLogo } from "./brand-logo";
import { AuthPrivacyBoundary } from "./auth-privacy-boundary";

export function AuthFrame({ children, section, privateContext = false }: { children: ReactNode; section: string; privateContext?: boolean }) {
  const content = <div className="entry-layout">
    <aside className="entry-brand" aria-label="ELIFORA">
      <Link href="/entry" prefetch={false} className="entry-wordmark" aria-label="ELIFORA çalışma alanı"><BrandLogo /></Link>
      <p className="entry-brand-caption">Renk ve salon yönetimi</p>
      <div className="entry-brand-detail" aria-hidden="true"><span /><span /><span /><span /><span /></div>
      <p className="entry-controlled">ELIFORA erişimi yetkilendirilmiş salon hesabı üzerinden sağlanır.</p>
    </aside>
    <section className="entry-card" aria-labelledby="entry-heading"><p className="entry-kicker">{section}</p>{children}</section>
  </div>;
  return <main id="main-content" className="entry-surface"><a className="skip-link" href="#entry-heading">İçeriğe geç</a>
    {privateContext ? <AuthPrivacyBoundary verificationKey={crypto.randomUUID()}>{content}</AuthPrivacyBoundary> : content}
    <footer className="entry-footer"><span>ELIFORA</span><span>Profesyonel çalışma alanı</span></footer>
  </main>;
}
