"use client";

import { useState } from "react";
import { SignInIntro } from "./sign-in-intro";
import { SignInForm } from "./sign-in-form";
import { tr } from "@/lib/i18n/tr";
import styles from "./sign-in-animation-preview.module.css";

export function SignInAnimationPreview() {
  const [run, setRun] = useState(0);
  return <>
    <aside className={styles.controls} aria-label="Animasyon önizlemesi">
      <button type="button" onClick={() => setRun(value => value + 1)}>Animasyonu oynat</button>
      <span>1.500 ms · Geliştirme önizlemesi</span>
      <p>Düğme hareket azaltma tercihini yalnızca bu önizlemede aşar. Giriş işlemi yapmaz.</p>
    </aside>
    <SignInIntro key={run} preview={run ? "play" : "idle"}>
      <h1 id="sign-in-heading">{tr.welcome}</h1><p className="lead">{tr.intro}</p>
      <fieldset className={styles.form} disabled inert aria-label="Giriş formu önizlemesi"><SignInForm /></fieldset>
    </SignInIntro>
  </>;
}
