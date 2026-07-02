#!/usr/bin/env python3
"""
generate_cpn_icon.py

Recolors CTDicon_transparent.png (pink/magenta) to purple for the new Cpn
strain icon, via HSV hue rotation. Preserves saturation/value (so shading
and linework are unchanged) and the alpha channel (transparent background).

Usage:
  python3 design/generate_cpn_icon.py                  # default target hue 275°
  python3 design/generate_cpn_icon.py --hue 260         # try a different hue
"""

import argparse
import colorsys
from pathlib import Path
from PIL import Image

SRC = Path(__file__).parent / "icons_transparent" / "CTDicon_transparent.png"
DST = Path(__file__).parent / "icons_transparent" / "Cpnicon_transparent.png"


def recolor(src_path: Path, dst_path: Path, target_hue_deg: float):
    im = Image.open(src_path).convert("RGBA")
    pixels = im.getdata()
    target_h = target_hue_deg / 360.0

    out = []
    for r, g, b, a in pixels:
        if a == 0:
            out.append((r, g, b, a))
            continue
        h, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
        nr, ng, nb = colorsys.hsv_to_rgb(target_h, s, v)
        out.append((round(nr * 255), round(ng * 255), round(nb * 255), a))

    im.putdata(out)
    dst_path.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst_path, format="PNG")
    print(f"Wrote {dst_path} ({im.size[0]}x{im.size[1]}, hue={target_hue_deg}°)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--hue", type=float, default=275.0, help="Target hue in degrees (0-360). Default 275 = violet-purple.")
    args = ap.parse_args()
    recolor(SRC, DST, args.hue)
