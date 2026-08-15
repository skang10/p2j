#!/usr/bin/env python3
"""Build the small-size icon variant: bigger, brighter star, no trail.

At 16-32px the dotted trail and field stars resolve to nothing but noise, so this
keeps only the gold star, enlarged. The star is separated by warmth (R > B) --
the trail dots and field stars are blue, so they fall out of the mask on their own.
The alpha is lifted from the full-size master so both variants share one silhouette.
"""
import sys
from PIL import Image, ImageFilter

RAW, MASTER, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
CANVAS, ART = 1024, 824
STAR_FRACTION = 0.66   # star's tall axis, as a share of the art box
GLOW_BOOST = 1.25      # lift the glow so it still reads once downscaled

raw = Image.open(RAW).convert("RGB")
w, h = raw.size
px = raw.load()

# --- separate the star from everything else by warmth -----------------------
warm = [(x, y) for x in range(0, w, 2) for y in range(0, h, 2) if px[x, y][0] > px[x, y][2] + 25]
xs, ys = [p[0] for p in warm], [p[1] for p in warm]
cx, cy = (min(xs) + max(xs)) // 2, (min(ys) + max(ys)) // 2
tall = max(xs) - min(xs), max(ys) - min(ys)

# Crop generously around the star so the full glow falloff comes along.
half = int(max(tall) * 0.95)
patch = raw.crop((cx - half, cy - half, cx + half, cy + half))

# Subtract the navy floor and weight by warmth: gold survives, blue does not.
pp = patch.load()
star = Image.new("RGB", patch.size, (0, 0, 0))
sp = star.load()
for y in range(patch.size[1]):
    for x in range(patch.size[0]):
        r, g, b = pp[x, y]
        weight = min(1.0, max(0.0, (r - b - 6) / 40.0))
        if weight <= 0:
            continue
        sp[x, y] = (min(255, int(max(0, r - 1) * weight * GLOW_BOOST)),
                    min(255, int(max(0, g - 13) * weight * GLOW_BOOST)),
                    min(255, int(max(0, b - 52) * weight * GLOW_BOOST)))

target = int(ART * STAR_FRACTION * (patch.size[0] / max(tall)))
star = star.resize((target, target), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.4))

# --- fresh radial-gradient backdrop ----------------------------------------
bg = Image.new("RGB", (ART, ART))
bp = bg.load()
mid = ART / 2
peak = (ART * 0.72) ** 2
for y in range(ART):
    for x in range(ART):
        t = min(1.0, ((x - mid) ** 2 + (y - mid) ** 2) / peak)
        bp[x, y] = (int(2 - 2 * t), int(17 - 9 * t), int(62 - 28 * t))

# Additive composite keeps the glow reading like light rather than paint.
off = (ART - star.size[0]) // 2
bl, sl = bg.load(), star.load()
for y in range(star.size[1]):
    for x in range(star.size[0]):
        ax, ay = x + off, y + off
        if not (0 <= ax < ART and 0 <= ay < ART):
            continue
        br, bg_, bb = bl[ax, ay]
        sr, sg, sb = sl[x, y]
        bl[ax, ay] = (min(255, br + sr), min(255, bg_ + sg), min(255, bb + sb))

# --- share the master's silhouette -----------------------------------------
alpha = Image.open(MASTER).convert("RGBA").split()[-1].crop((100, 100, 924, 924))
canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
canvas.paste(Image.merge("RGBA", (*bg.split(), alpha)), (100, 100))
canvas.save(OUT)
print(f"{OUT}  star {tall[0]}x{tall[1]} -> {target}px  bbox {canvas.split()[-1].getbbox()}")
