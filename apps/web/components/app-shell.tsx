import Link from "next/link";
import type { ReactNode } from "react";

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <a className="skip-link" href="#main-content">İçeriğe geç</a>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="ELIFORA ana sayfa">ELIFORA</Link>
        <span className="environment-label">Profesyonel çalışma alanı</span>
      </header>
      {children}
    </>
  );
}

