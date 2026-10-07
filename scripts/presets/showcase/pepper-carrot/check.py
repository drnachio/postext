#!/usr/bin/env python3
"""Contact sheets for checking the port by eye: `$PC_OUT/check/<page>.png`
shows the text-free art of every story page with

- the detected panel boxes (green) and the cells of the split expression
  (thin yellow: what the engine will lay out),
- the English balloon outlines (thin red) and tail tips (red dots),
- the speaker anchors (magenta discs, labelled),
- the safe areas from manifest.json, when it exists (blue).

`--panels` also writes `$PC_OUT/check/panels-<page>.png`: the cut panel
pictures with their anchors and safe areas, the frame the engine sees.

    python3 check.py [--panels]
"""
from __future__ import annotations

import argparse
import os

from PIL import Image, ImageDraw, ImageFont

from common import STORY_PAGES, gfx_page, load_json, out
from slots import page_slots

WIDTH = 1000


def font(size: int):
    for f in ("/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/System/Library/Fonts/Helvetica.ttc", "DejaVuSans-Bold.ttf"):
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            continue
    return ImageFont.load_default()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--panels", action="store_true")
    args = ap.parse_args()
    panels = load_json(out("panels.json"))
    anchors = load_json(out("anchors.json")) if os.path.exists(out("anchors.json")) else {}
    manifest = load_json(out("manifest.json")) if os.path.exists(out("manifest.json")) else None
    safe = {p["id"]: p.get("safeArea") for p in (manifest or {}).get("panels", [])}
    os.makedirs(out("check"), exist_ok=True)
    f = font(44)
    for page in STORY_PAGES:
        im = Image.open(gfx_page(page)).convert("RGB")
        d = ImageDraw.Draw(im)
        info = panels["pages"][page]
        for p in info["panels"]:
            d.rectangle(p["cell"], outline=(255, 220, 0), width=4)
            d.rectangle(p["box"], outline=(0, 200, 0), width=10)
            d.text((p["box"][0] + 20, p["box"][1] + 14), p["id"], fill=(0, 200, 0), font=f, stroke_width=3, stroke_fill=(0, 0, 0))
            sa = safe.get(p["id"])
            if sa:
                c = p["cut"]
                w, h = c[2] - c[0], c[3] - c[1]
                d.rectangle([c[0] + sa["x"] * w, c[1] + sa["y"] * h, c[0] + (sa["x"] + sa["width"]) * w, c[1] + (sa["y"] + sa["height"]) * h], outline=(40, 120, 255), width=8)
        for s in page_slots(page, panels):
            if s.body is not None:
                for poly in s.body.polys:
                    d.line(poly, fill=(255, 40, 40), width=4)
            for t in s.tails:
                x, y = t["tip"]
                d.ellipse([x - 12, y - 12, x + 12, y + 12], fill=(255, 40, 40))
                d.line([t["base"], t["tip"]], fill=(255, 40, 40), width=3)
            if s.body is None:
                x0, y0, x1, y1 = s.box
                d.rectangle([x0, y0, x1, y1], outline=(255, 140, 0), width=4)
                d.text((x0, y0 - 50), s.kind, fill=(255, 140, 0), font=f, stroke_width=3, stroke_fill=(0, 0, 0))
        for pid, entry in anchors.items():
            if not pid.startswith(f"e08{page.lower()}-"):
                continue
            for a in entry["anchors"]:
                x, y = a["page"]
                d.ellipse([x - 26, y - 26, x + 26, y + 26], fill=(255, 0, 255), outline=(0, 0, 0), width=4)
                d.text((x + 34, y - 24), a["id"], fill=(255, 0, 255), font=f, stroke_width=3, stroke_fill=(0, 0, 0))
        d.text((110, 3420), f'{page}  split="{info["split"]}"', fill=(0, 0, 0), font=f)
        im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
        im.save(out("check", f"{page}.png"))
        print(out("check", f"{page}.png"))

        if args.panels:
            tiles = []
            for p in info["panels"]:
                pim = Image.open(out(p["file"])).convert("RGB")
                pim.thumbnail((480, 480))
                pd = ImageDraw.Draw(pim)
                W, H = pim.size
                sa = safe.get(p["id"])
                if sa:
                    pd.rectangle([sa["x"] * W, sa["y"] * H, (sa["x"] + sa["width"]) * W, (sa["y"] + sa["height"]) * H], outline=(40, 120, 255), width=3)
                for a in anchors.get(p["id"], {}).get("anchors", []):
                    x, y = a["x"] * W, a["y"] * H
                    pd.ellipse([x - 7, y - 7, x + 7, y + 7], fill=(255, 0, 255), outline=(0, 0, 0))
                tiles.append(pim)
            sheet = Image.new("RGB", (sum(t.width for t in tiles) + 10 * len(tiles), max(t.height for t in tiles)), "white")
            x = 0
            for t in tiles:
                sheet.paste(t, (x, 0))
                x += t.width + 10
            sheet.save(out("check", f"panels-{page}.png"))


if __name__ == "__main__":
    main()
