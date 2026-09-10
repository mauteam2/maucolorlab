import Link from "next/link";
import { AppShell } from "@/components/app-shell";

export default function SignInPage() {
  return (
    <AppShell>
      <main className="narrow-page" id="main-content">
        <p className="eyebrow">Güvenli erişim</p>
        <h1>Oturum açma akışı sonraki kimlik diliminde tamamlanacak.</h1>
        <p className="lead">
          Bu Phase 0 ekranı, korumalı çalışma alanının kimlik sınırını görünür kılar.
        </p>
        <Link className="text-link" href="/">Ana sayfaya dön</Link>
      </main>
    </AppShell>
  );
}

