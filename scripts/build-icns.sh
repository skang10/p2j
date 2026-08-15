#!/usr/bin/env bash
#
# Rebuild every app icon from docs/icon.png.
#
# The .icns is assembled by hand rather than left to `cargo tauri icon`, because
# the 16pt and 32pt slices need simplified art: at those sizes the dotted trail
# and the field stars resolve to noise, so those slices carry an enlarged star
# on its own. `cargo tauri icon` runs first here and the hand-built .icns is
# written over its output afterwards -- keep that order, or the per-size art is
# silently lost.
#
# usage: scripts/build-icns.sh
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

SOURCE=docs/icon.png
MASTER=docs/icon-macos.png
SMALL=docs/icon-macos-small.png
ICONS=src-tauri/icons

for tool in python3 iconutil; do
  command -v "$tool" >/dev/null || { echo "error: $tool not found" >&2; exit 1; }
done
python3 -c 'import PIL' 2>/dev/null || { echo "error: Pillow not installed (pip install Pillow)" >&2; exit 1; }
command -v cargo-tauri >/dev/null || { echo "error: tauri CLI not found (cargo install tauri-cli --version '^2')" >&2; exit 1; }
[ -f "$SOURCE" ] || { echo "error: $SOURCE missing" >&2; exit 1; }

echo "==> masters"
# 1024 canvas, art at 824 with 100px margins, corners made transparent.
python3 scripts/make-icon-master.py "$SOURCE" "$MASTER"
# Same silhouette, simplified art for the small slices.
python3 scripts/make-small-variant.py "$SOURCE" "$MASTER" "$SMALL"

echo "==> platform sizes"
cargo tauri icon "$MASTER" -o "$ICONS" >/dev/null

echo "==> icns"
ICONSET="$(mktemp -d)/Daybook.iconset"
mkdir -p "$ICONSET"
python3 - "$MASTER" "$SMALL" "$ICONSET" <<'PY'
import sys
from PIL import Image
master, small, out = sys.argv[1], sys.argv[2], sys.argv[3]
full, simple = Image.open(master).convert("RGBA"), Image.open(small).convert("RGBA")
plan = [("icon_16x16.png", 16, simple),   ("icon_16x16@2x.png", 32, simple),
        ("icon_32x32.png", 32, simple),   ("icon_32x32@2x.png", 64, simple),
        ("icon_128x128.png", 128, full),  ("icon_128x128@2x.png", 256, full),
        ("icon_256x256.png", 256, full),  ("icon_256x256@2x.png", 512, full),
        ("icon_512x512.png", 512, full),  ("icon_512x512@2x.png", 1024, full)]
for name, size, src in plan:
    src.resize((size, size), Image.LANCZOS).save(f"{out}/{name}")
PY
iconutil -c icns "$ICONSET" -o "$ICONS/icon.icns"
rm -rf "$(dirname "$ICONSET")"

echo "==> in-app brandmark"
cp "$ICONS/64x64.png" src/daybook-icon.png

echo "done: $ICONS/icon.icns, $ICONS/*.png, src/daybook-icon.png"
