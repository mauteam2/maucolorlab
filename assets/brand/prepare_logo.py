"""Extract the approved raster without substituting type or tracing new shapes.

Requires Pillow and NumPy. Crop and matte values are tied to the supplied source.
The only reconstructed pixels are the f stem hidden beneath the copper crossbar.
"""
from pathlib import Path
import hashlib
import json
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets/brand/source/elifora-approved-reference.png"
OUTPUT = ROOT / "apps/web/public/brand/approved"
QA = ROOT / "apps/web/captures/approved-brand"
OUTPUT.mkdir(parents=True, exist_ok=True)
QA.mkdir(parents=True, exist_ok=True)

# Native resolution with 14px safety padding around the visible approved mark.
CROP = (194, 224, 1564, 691)
image = np.asarray(Image.open(SOURCE).convert("RGB"), dtype=float)
pixels = image[CROP[1]:CROP[3], CROP[0]:CROP[2]]
background = np.array([251., 247., 243.])
plum = np.array([70., 27., 49.])
copper = np.array([169., 109., 81.])
delta = background - pixels
directions = np.stack([background - plum, background - copper])
coverage = np.clip(np.einsum("hwc,kc->hwk", delta, directions) / (directions * directions).sum(axis=1), 0, 1)
residual = np.linalg.norm(delta[:, :, None, :] - coverage[:, :, :, None] * directions, axis=3)
yy, xx = np.indices(pixels.shape[:2])
brush_region = (xx + CROP[0] >= 697) & (xx + CROP[0] <= 1020) & (yy + CROP[1] >= 341) & (yy + CROP[1] <= 415)
is_copper = brush_region & (residual[:, :, 1] < residual[:, :, 0]) & (pixels[:, :, 1] > pixels[:, :, 2] + 5)
alpha = np.where(is_copper, coverage[:, :, 1], coverage[:, :, 0])
# Remove background texture without thresholding away the fine bristle tips.
alpha[alpha < .025] = 0
alpha[alpha > .85] = 1
rgb = np.clip((pixels - (1 - alpha[:, :, None]) * background) / np.maximum(alpha[:, :, None], .001), 0, 255)
rgb[alpha == 0] = 0
rgba = np.dstack([rgb, alpha * 255]).round().astype(np.uint8)

letters = rgba.copy()
letters[is_copper] = 0
# Copper overlays a straight portion of the f stem. Continue the existing stem
# using its own pixels immediately above and below; do not invent a typeface.
for source_x in range(751, 813):
    x = source_x - CROP[0]
    for source_y in range(378, 410):
        y = source_y - CROP[1]
        if is_copper[y, x]:
            upper = rgba[377 - CROP[1], x].astype(float)
            lower = rgba[411 - CROP[1], x].astype(float)
            if upper[3] > 200 and lower[3] > 200:
                t = (source_y - 377) / 34
                letters[y, x] = np.round(upper * (1 - t) + lower * t)

brush = rgba.copy()
brush[~is_copper] = 0
# The crossbar's antialiasing over the f is already composited in the supplied
# raster. Keep those source pixels opaque so layered compositing reproduces it.
Image.fromarray(rgba).save(OUTPUT / "elifora-wordmark.png")
Image.fromarray(letters).save(OUTPUT / "elifora-letters.png")
Image.fromarray(brush).crop((503, 117, 826, 191)).save(OUTPUT / "elifora-brush.png")

metadata = {
    "source": "assets/brand/source/elifora-approved-reference.png",
    "sourceSha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
    "crop": list(CROP), "width": rgba.shape[1], "height": rgba.shape[0],
    "brushBounds": [697-CROP[0], 341-CROP[1], 1020-CROP[0], 415-CROP[1]],
    "method": "native-resolution raster crop, chromatic matte removal, source-derived layers; no font substitution",
}
(OUTPUT / "metadata.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
mark = Image.fromarray(rgba)
panel = Image.new("RGB", (mark.width, mark.height * 3 + 72), "#F7F1EB")
draw = ImageDraw.Draw(panel)
for i, color in enumerate(["#F7F1EB", "#FFFFFF", "#3B2432"]):
    base = Image.new("RGBA", mark.size, color)
    base.alpha_composite(mark)
    panel.paste(base.convert("RGB"), (0, i * (mark.height + 24)))
panel.save(QA / "transparency-check.png")
reference = Image.fromarray(pixels.astype(np.uint8))
reference.save(QA / "reference-crop.png")
recomposed = Image.new("RGBA", mark.size, tuple(background.astype(int)) + (255,))
recomposed.alpha_composite(mark)
comparison = Image.new("RGB", (mark.width, mark.height * 2 + 24), "#F7F1EB")
comparison.paste(reference, (0, 0))
comparison.paste(recomposed.convert("RGB"), (0, mark.height + 24))
comparison.save(QA / "reference-comparison.png")
tip = mark.crop((720, 112, 829, 196))
tip_base = Image.new("RGBA", tip.size, "#F7F1EB")
tip_base.alpha_composite(tip)
tip_base.resize((654, 504), Image.Resampling.NEAREST).save(QA / "bristles-closeup.png")
print(json.dumps(metadata))
