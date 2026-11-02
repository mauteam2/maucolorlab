"use client";
import { useState } from "react";

export function PasswordField({ id, label, name, autoComplete, minLength, maxLength, invalid = false, describedBy }: {
  id: string; label: string; name: string; autoComplete: "current-password" | "new-password";
  minLength?: number; maxLength: number; invalid?: boolean; describedBy?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const objectLabel = name === "confirm" ? "Doğrulama parolasını" : autoComplete === "new-password" ? "Yeni parolayı" : "Parolayı";
  return <div className="entry-field"><label htmlFor={id}>{label}</label><div className="entry-password">
    <input id={id} name={name} type={revealed ? "text" : "password"} autoComplete={autoComplete} required minLength={minLength} maxLength={maxLength} aria-invalid={invalid || undefined} aria-describedby={describedBy} />
    <button className="auth-reveal" type="button" aria-label={`${objectLabel} ${revealed ? "gizle" : "göster"}`} aria-pressed={revealed} aria-controls={id} onClick={() => setRevealed(v => !v)}>
      <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.8"/>{revealed && <path d="m3 3 18 18"/>}</svg>
    </button>
  </div></div>;
}
