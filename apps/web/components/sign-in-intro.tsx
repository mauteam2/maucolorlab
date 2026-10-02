"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { BrandLogo } from "./brand-logo";
import styles from "./sign-in-intro.module.css";

export const INTRO_DURATION_MS = 1500;
export const INTRO_SESSION_KEY = "elifora.sign-in-intro.v1";
// Also covers browsers where sessionStorage is disabled. No auth/customer data is stored.
let playedInDocument = false;

export function SignInIntro({ children, preview }: { children: ReactNode; preview?: "idle" | "play" }) {
  const root = useRef<HTMLElement>(null);
  const playback = useRef<{ startedAt: number; done: boolean } | null>(null);

  useLayoutEffect(() => {
    const surface = root.current;
    if (!surface) return;
    if (preview === "idle") return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!playback.current) {
      if (!preview) {
        let seen = playedInDocument;
        try { seen ||= sessionStorage.getItem(INTRO_SESSION_KEY) === "played"; } catch { /* In-memory fallback. */ }
        playedInDocument = true;
        try { sessionStorage.setItem(INTRO_SESSION_KEY, "played"); } catch { /* Storage can be disabled. */ }
        if (seen || motion.matches) return;
      }
      if (typeof Element.prototype.animate !== "function") return;
      playback.current = { startedAt: performance.now(), done: false };
    }
    const current = playback.current;
    if (current.done) return;
    const elapsed = performance.now() - current.startedAt;
    const logo = surface.querySelector<HTMLElement>("[data-intro-logo]")!;
    const content = surface.querySelector<HTMLElement>("[data-intro-content]")!;
    const decoration = surface.querySelector<HTMLElement>("[data-intro-decoration]")!;
    const letters = surface.querySelector<HTMLImageElement>("[data-intro-letters]")!;
    const brush = surface.querySelector<HTMLImageElement>("[data-intro-brush]")!;
    const animations: Animation[] = [];
    const finish = () => {
      current.done = true;
      surface.dataset.intro = "complete";
      content.inert = false;
      animations.forEach(animation => animation.cancel());
    };
    if (elapsed >= INTRO_DURATION_MS || (!preview && motion.matches)) { finish(); return; }
    const rect = logo.getBoundingClientRect();
    const introWidth = Math.min(620, window.innerWidth - 48);
    const scale = introWidth / rect.width;
    const dx = window.innerWidth / 2 - (rect.left + rect.width / 2);
    const dy = window.innerHeight / 2 - (rect.top + rect.height / 2);
    const centered = `translate(${dx}px, ${dy}px) scale(${scale})`;
    surface.dataset.intro = "playing";
    content.inert = true;
    const animate = (element: Element, frames: Keyframe[]) => {
      const animation = element.animate(frames, { duration: INTRO_DURATION_MS, fill: "both", easing: "linear" });
      animation.currentTime = elapsed;
      animations.push(animation);
    };
    // One clock: letters 0–350, copper 350–850, hold 850–1150, settle 1150–1500.
    animate(logo, [
      { transform: centered, offset: 0 },
      { transform: centered, offset: 1150 / INTRO_DURATION_MS, easing: "cubic-bezier(.22,1,.36,1)" },
      { transform: "none", offset: 1 },
    ]);
    animate(letters, [
      { opacity: 0.015, offset: 0, easing: "ease-out" },
      { opacity: 1, offset: 350 / INTRO_DURATION_MS },
      { opacity: 1, offset: 1 },
    ]);
    animate(brush, [
      { clipPath: "inset(0 100% 0 0)", offset: 0 },
      { clipPath: "inset(0 100% 0 0)", offset: 350 / INTRO_DURATION_MS, easing: "ease-in-out" },
      { clipPath: "inset(0 0% 0 0)", offset: 850 / INTRO_DURATION_MS },
      { clipPath: "inset(0 0% 0 0)", offset: 1 },
    ]);
    for (const element of [content, decoration]) animate(element, [
      { opacity: 0, transform: "translateY(8px)", offset: 0 },
      { opacity: 0, transform: "translateY(8px)", offset: 1150 / INTRO_DURATION_MS, easing: "ease-out" },
      { opacity: 1, transform: "none", offset: 1 },
    ]);
    animations[0]!.onfinish = finish;
    const timer = window.setTimeout(finish, INTRO_DURATION_MS - elapsed);
    const skip = () => { if (!preview && motion.matches) finish(); };
    // Finish on viewport changes rather than jumping between obsolete measured positions.
    window.addEventListener("resize", finish, { once: true });
    motion.addEventListener("change", skip);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", finish);
      motion.removeEventListener("change", skip);
      animations.forEach(animation => animation.cancel());
      content.inert = false;
      surface.dataset.intro = "complete";
      // Retain the original clock during React Strict Mode effect setup/cleanup.
    };
  }, [preview]);

  return <main ref={root} id="main-content" className={styles.surface} data-intro="complete" data-preview={preview === "play" ? "true" : undefined}>
    <a className="skip-link" href="#sign-in-heading">İçeriğe geç</a>
    <div className={styles.layout}>
      <section className={styles.identity} aria-label="ELIFORA">
        <div data-intro-logo className={styles.logo}><BrandLogo /></div>
        <div data-intro-decoration className={styles.decoration}>
          <p className={styles.description}>Renk ve salon yönetimi</p>
          <div className={styles.artwork} aria-hidden="true">
            <div className={styles.swatches}><i /><i /><i /><i /><i /></div>
            <div className={styles.brushWash}>
              {/* Decorative source kept separate; this is never a screen-sized reference image. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/color-brush.svg" alt="" width="420" height="170" />
            </div>
          </div>
        </div>
      </section>
      <section data-intro-content className={styles.card} aria-labelledby="sign-in-heading">{children}</section>
    </div>
  </main>;
}
