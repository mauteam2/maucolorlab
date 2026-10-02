# Approved ELIFORA wordmark

The approved identity is a single lowercase wordmark with a copper brush integrated into the f crossbar. There is no independent e symbol and no font substitution.

## Authoritative files

- `source/elifora-approved-reference.png`: supplied original, unchanged.
- `prepare_logo.py`: reproducible native-resolution crop, chromatic background removal and source-derived layer preparation (Pillow + NumPy).
- `../../apps/web/public/brand/approved/elifora-wordmark.png`: canonical transparent final mark, 1370 × 467.
- `../../apps/web/public/brand/approved/elifora-letters.png`: matching lettering layer for the opening fade.
- `../../apps/web/public/brand/approved/elifora-brush.png`: tightly cropped 323 × 74 copper layer for the left-to-right reveal.
- `../../apps/web/public/brand/approved/metadata.json`: source SHA-256, crop and layer coordinates.

No approximately traced SVG is supplied. Letter outlines and bristles come from the approved raster. Alpha-edge RGB is decontaminated against the original warm matte to avoid pale halos. The f stem hidden behind the brush is interpolated only for the temporary letters-only layer, using the existing straight stem immediately above and below. The finished state always uses the canonical full wordmark.

`BrandLogo` is the single Web identity component, used by AppShell, sign-in and the development animation preview. All sizes preserve 1370:467. The copper layer is positioned in the same coordinate system. The previous approximate e/Georgia SVGs are retained under `archive/`, outside public application assets.

Quality previews under ignored `apps/web/captures/approved-brand/` show reference comparison, cream/white/plum backgrounds, enlarged bristles, desktop/mobile screens and the actual 1500ms timeline. These are development evidence, not application backgrounds.
