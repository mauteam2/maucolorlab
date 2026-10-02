# ELIFORA approved wordmark and sign-in intro

The approved identity is the lowercase **elifora** raster with the copper brush integrated into the f. `BrandLogo` is used by the Web AppShell, `/sign-in` and the development preview. No extra symbol or approximate font is used. Final and animated marks derive from the same supplied source and retain its aspect ratio, spacing and brush geometry.

## Assets

The unchanged reference and reproducible preparation script are in `assets/brand/`. Application files live in `apps/web/public/brand/approved/`: `elifora-wordmark.png` (1370×467), `elifora-letters.png` and `elifora-brush.png` (323×74). `metadata.json` records source SHA-256 and cropping coordinates. Matte removal preserves antialiasing while decontaminating edge RGB; quality previews compare the source on cream, white and plum backgrounds. No reconstructed SVG is claimed as the original identity. Previous e/Georgia assets are archived outside the public directory.

The temporary letters layer restores only the straight f stem occluded by copper, using pixels from immediately above and below the crossbar. Completion switches to the canonical full PNG, so the finished mark has the approved source geometry.

## 1500ms timeline

| Time | Behavior |
| --- | --- |
| 0–350ms | Plum lettering fades in; copper stays fully clipped. |
| 350–850ms | The actual copper pixels reveal from left to right, ending in the fine bristles. |
| 850–1150ms | Completed mark holds centered, with no geometric change. |
| 1150–1500ms | Uniformly scaled logo moves to its final measured position; form and caption appear. |

All five Web Animations API tracks use one 1500ms clock. The form is inert until the deadline, and effects are removed at completion without a closing delay. Playback is independent of network responses. Strict Mode resumes the same clock; resizing completes the intro rather than using obsolete coordinates.

`sessionStorage['elifora.sign-in-intro.v1']` remembers normal playback per tab. Re-render, validation errors, reload and navigation do not replay it. With storage disabled, an in-memory fallback covers the current document only. Reduced motion and unsupported animation APIs display the final screen directly. Without JavaScript the server-rendered form remains visible. Existing sign-in fields, validation, action, errors and authenticated-session redirect remain intact.

The cream/plum/copper presentation uses two desktop columns and one mobile column at ≤720px. The mobile logo is centered and constrained by available width, including 320px. Caption remains smaller sans-serif text. Form copy/labels/buttons use sans-serif; headings retain serif. Header logos have a cream backing for readability in either existing application theme.

## Development preview and verification

`/preview/sign-in-intro` starts idle. “Animasyonu oynat” explicitly replays the same component, allowing reduced motion only for that manual preview. It does not consume the real login's visit flag; its form is disabled and inert. The route returns 404 outside development.

Component tests cover deadlines, re-render/remount, Strict Mode, motion preference and storage fallback. Desktop/mobile browser tests cover timing, native email validation, editable final login, reload/navigation persistence and manual preview repeats. Existing real-auth tests cover authenticated redirect; they require disposable local Supabase. Asset quality and the 350/850/1150/1500ms computed styles are inspected separately. This slice has no Android, migration or tenancy-policy changes.
