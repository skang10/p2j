#!/usr/bin/env python3
"""Turn the raw generator PNG into the 1024 macOS master.

The source paints its rounded corners opaque black, so the alpha is recovered by
flood-filling inward from the four corners: the black is (0,0,0) while the darkest
artwork pixel is (1,14,53), a wide enough gap that the fill cannot leak into the art.
Art is then laid at 824x824 inside a 1024 canvas, matching docs/icon-macos.png.
"""
import sys
from PIL import Image, ImageDraw, ImageFilter

src, out = sys.argv[1], sys.argv[2]
CANVAS, ART = 1024, 824
NAVY = (1, 14, 53)  # darkest artwork tone; kept under the mask so resampling can't bleed black

im = Image.open(src).convert("RGB")
w, h = im.size

# Flood the corner black with a sentinel no artwork pixel can collide with.
SENTINEL = (255, 0, 255)
probe = im.copy()
for xy in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
    ImageDraw.floodfill(probe, xy, SENTINEL, thresh=20)

keep = Image.new("L", (w, h), 0)
keep.putdata([0 if px == SENTINEL else 255 for px in probe.getdata()])

# Erode 2px to swallow the anti-aliased dark rim the flood fill stopped against,
# then soften for a clean edge.
keep = keep.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(1.2))

# Repaint the masked-out region navy so LANCZOS cannot pull black into the edge.
flat = Image.composite(im, Image.new("RGB", (w, h), NAVY), keep.point(lambda v: 255 if v > 8 else 0))

art = Image.merge("RGBA", (*flat.split(), keep)).resize((ART, ART), Image.LANCZOS)
canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
canvas.paste(art, ((CANVAS - ART) // 2, (CANVAS - ART) // 2), art)
canvas.save(out)

a = canvas.split()[-1]
print(f"{out}  {canvas.size}  opaque bbox {a.getbbox()}  corner alpha {a.getpixel((0, 0))}")
