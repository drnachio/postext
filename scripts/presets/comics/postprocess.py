#!/usr/bin/env python3
"""Post-processing of the comics panel art (issue #573).

    python3 postprocess.py --art ART_DIR shrink SLUG [SLUG…]
        # ART_DIR/<slug>/raw/<id>.png → ART_DIR/<slug>/<id>.jpg: long side
        # 1000–1400 px, JPEG q≈80, each ≤ 160 KB (quality, then size, steps
        # down until it fits); a PNG with real transparency stays a PNG
        # (palette-quantised to fit the same budget)
    python3 postprocess.py --art ART_DIR reuse FROM TO
        # copy FROM's finished pictures + manifest into TO (recipes that
        # re-letter the same art: no new pictures)
    python3 postprocess.py --art ART_DIR grid SLUG
        # ART_DIR/<slug>/_grid/<id>.jpg: the picture under a labelled 10 %
        # grid (5 % ticks) to read speaker anchors off by eye
    python3 postprocess.py --art ART_DIR check SLUG
        # ART_DIR/<slug>/_check/<id>.jpg: manifest.json drawn over each
        # picture (safe area, anchors, head points, faces, avoid zones)
    python3 postprocess.py --art ART_DIR contact SLUG
        # ART_DIR/<slug>/contact.jpg: every picture of the recipe, labelled
    python3 postprocess.py --art ART_DIR budget SLUG [SLUG…]
        # per-file sizes and the recipe total (≤ 1.6 MB)
    python3 postprocess.py --art ART_DIR crops prompts/<cast>.json
        # the spec's `crops`: one character per reference image, cut from a
        # reference sheet (or a finished panel), for the edit endpoint
    python3 postprocess.py --art ART_DIR pops prompts/<cast>.json
        # the spec's `pops`: a transparent cut-out placed over a panel at
        # `box` [x, y, width] (fractions), saved as <panel>-pop.png at the
        # finished panel's size, so `pop=` shares the panel's crop
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import shutil

from PIL import Image, ImageDraw, ImageFont

MAX_BYTES = 160_000
RECIPE_BYTES = 1_600_000
LONG = 1400
MIN_LONG = 1000


def font(size: int):
    for f in ("/System/Library/Fonts/Helvetica.ttc", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def has_alpha(im: Image.Image) -> bool:
    return im.mode in ("RGBA", "LA") and im.getchannel("A").getextrema()[0] < 250


def _fit(im: Image.Image, long: int) -> Image.Image:
    s = long / max(im.size)
    return im if s >= 1 else im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)


def shrink_one(src: str, dst_dir: str) -> str:
    im = Image.open(src)
    stem = os.path.splitext(os.path.basename(src))[0]
    if has_alpha(im):
        im = im.convert("RGBA")
        dst = os.path.join(dst_dir, stem + ".png")
        for long in (LONG, 1200, MIN_LONG, 900):
            out = _fit(im, long)
            out.save(dst, "PNG", optimize=True)
            if os.path.getsize(dst) <= MAX_BYTES:
                return dst
            out.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG).save(dst, "PNG", optimize=True)
            if os.path.getsize(dst) <= MAX_BYTES:
                return dst
        return dst
    im = im.convert("RGB")
    dst = os.path.join(dst_dir, stem + ".jpg")
    # A bigger picture at a slightly lower quality beats a small sharp one.
    for long, qs in ((LONG, (80, 75, 70)), (1300, (76, 71, 67)), (1200, (74, 69, 65)), (1100, (70, 65, 61)), (MIN_LONG, (68, 63, 58, 54, 50))):
        out = _fit(im, long)
        for q in qs:
            out.save(dst, "JPEG", quality=q, optimize=True, progressive=True)
            if os.path.getsize(dst) <= MAX_BYTES:
                return dst
    return dst


def finished(art: str, slug: str) -> list[str]:
    d = os.path.join(art, slug)
    return sorted(f for f in glob.glob(os.path.join(d, "*.*")) if f.endswith((".jpg", ".png")) and not os.path.basename(f).startswith("contact"))


def cmd_shrink(art: str, slugs: list[str]) -> None:
    for slug in slugs:
        for src in sorted(glob.glob(os.path.join(art, slug, "raw", "*.png"))):
            dst = shrink_one(src, os.path.join(art, slug))
            w, h = Image.open(dst).size
            print(f"{os.path.basename(dst):28} {w}x{h} {os.path.getsize(dst) // 1000} KB")
    cmd_budget(art, slugs)


def cmd_budget(art: str, slugs: list[str]) -> None:
    for slug in slugs:
        files = finished(art, slug)
        total = sum(os.path.getsize(f) for f in files)
        big = [os.path.basename(f) for f in files if os.path.getsize(f) > MAX_BYTES]
        flag = "OK" if total <= RECIPE_BYTES and not big else "OVER"
        print(f"{slug}: {len(files)} files, {total // 1000} KB {flag} {big or ''}")


def cmd_reuse(art: str, src: str, dst: str) -> None:
    os.makedirs(os.path.join(art, dst), exist_ok=True)
    for f in finished(art, src):
        shutil.copy2(f, os.path.join(art, dst, os.path.basename(f)))
    m = os.path.join(art, src, "manifest.json")
    if os.path.exists(m):
        shutil.copy2(m, os.path.join(art, dst, "manifest.json"))
    print("copied", len(finished(art, src)), "pictures", src, "→", dst)


def _flat(im: Image.Image) -> Image.Image:
    if im.mode in ("P", "LA"):
        im = im.convert("RGBA")
    if im.mode == "RGBA":
        bg = Image.new("RGBA", im.size, (90, 130, 170, 255))
        bg.alpha_composite(im)
        return bg.convert("RGB")
    return im.convert("RGB")


def cmd_grid(art: str, slug: str) -> None:
    out_dir = os.path.join(art, slug, "_grid")
    os.makedirs(out_dir, exist_ok=True)
    for f in finished(art, slug):
        im = _flat(Image.open(f))
        im = _fit(im, 1000)
        w, h = im.size
        ov = Image.new("RGBA", im.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(ov)
        fn = font(18)
        for i in range(1, 20):
            x, y = w * i / 20, h * i / 20
            major = i % 2 == 0
            col = (255, 0, 255, 200) if major else (0, 255, 255, 120)
            d.line([(x, 0), (x, h)], fill=col, width=2 if major else 1)
            d.line([(0, y), (w, y)], fill=col, width=2 if major else 1)
            if major:
                lab = str(i * 5)
                for (tx, ty) in ((x + 3, 2), (x + 3, h - 22)):
                    d.rectangle((tx - 1, ty, tx + 24, ty + 20), fill=(0, 0, 0, 170))
                    d.text((tx, ty), lab, fill=(255, 255, 0, 255), font=fn)
                for (tx, ty) in ((2, y + 2), (w - 28, y + 2)):
                    d.rectangle((tx - 1, ty, tx + 25, ty + 20), fill=(0, 0, 0, 170))
                    d.text((tx, ty), lab, fill=(255, 255, 0, 255), font=fn)
        im = Image.alpha_composite(im.convert("RGBA"), ov).convert("RGB")
        im.save(os.path.join(out_dir, os.path.splitext(os.path.basename(f))[0] + ".jpg"), quality=85)
    print("grids in", out_dir)


def _rect(d, r, w, h, col, width=3):
    d.rectangle((r["x"] * w, r["y"] * h, (r["x"] + r["width"]) * w, (r["y"] + r["height"]) * h), outline=col, width=width)


def cmd_check(art: str, slug: str) -> None:
    man = json.load(open(os.path.join(art, slug, "manifest.json"), encoding="utf-8"))
    out_dir = os.path.join(art, slug, "_check")
    os.makedirs(out_dir, exist_ok=True)
    fn = font(22)
    for e in man:
        im = _fit(_flat(Image.open(os.path.join(art, slug, e["file"]))), 900)
        w, h = im.size
        d = ImageDraw.Draw(im)
        _rect(d, e["safeArea"], w, h, (0, 255, 0), 4)
        for r in e.get("avoid", []):
            _rect(d, r, w, h, (255, 140, 0), 3)
        for a in e.get("anchors", []):
            x, y = a["x"] * w, a["y"] * h
            d.ellipse((x - 9, y - 9, x + 9, y + 9), fill=(255, 0, 0), outline="white", width=2)
            d.text((x + 12, y - 12), a["id"], fill=(255, 255, 0), font=fn, stroke_width=3, stroke_fill="black")
            if "head" in a:
                hx, hy = a["head"]["x"] * w, a["head"]["y"] * h
                d.ellipse((hx - 7, hy - 7, hx + 7, hy + 7), fill=(0, 120, 255), outline="white", width=2)
            if "face" in a:
                _rect(d, a["face"], w, h, (255, 0, 0), 2)
        im.save(os.path.join(out_dir, os.path.splitext(e["file"])[0] + ".jpg"), quality=82)
    print("checks in", out_dir)


def cmd_contact(art: str, slug: str) -> None:
    files = finished(art, slug)
    H = 420
    tiles = []
    fn = font(24)
    for f in files:
        im = _flat(Image.open(f))
        im = im.resize((round(im.width * H / im.height), H), Image.LANCZOS)
        d = ImageDraw.Draw(im)
        lab = os.path.splitext(os.path.basename(f))[0]
        d.rectangle((0, 0, 14 * len(lab) + 16, 32), fill="black")
        d.text((6, 3), lab, fill="white", font=fn)
        tiles.append(im)
    rows, row, x = [], [], 0
    for t in tiles:
        if row and x + t.width > 2200:
            rows.append(row)
            row, x = [], 0
        row.append(t)
        x += t.width + 10
    rows.append(row)
    W = max(sum(t.width + 10 for t in r) for r in rows) + 10
    sheet = Image.new("RGB", (W, len(rows) * (H + 10) + 10), (235, 235, 235))
    for i, r in enumerate(rows):
        x = 10
        for t in r:
            sheet.paste(t, (x, 10 + i * (H + 10)))
            x += t.width + 10
    sheet = _fit(sheet, 2000)
    sheet.save(os.path.join(art, slug, "contact.jpg"), quality=80)
    print("contact sheet", os.path.join(art, slug, "contact.jpg"))


def cmd_crops(art: str, spec_path: str) -> None:
    spec = json.load(open(spec_path, encoding="utf-8"))
    for src, boxes in spec.get("crops", {}).items():
        im = Image.open(os.path.join(art, src)).convert("RGB")
        for dst, box in boxes.items():
            os.makedirs(os.path.dirname(os.path.join(art, dst)), exist_ok=True)
            im.crop(tuple(box)).save(os.path.join(art, dst))
            print("crop", dst)


def cmd_pops(art: str, spec_path: str) -> None:
    spec = json.load(open(spec_path, encoding="utf-8"))
    for p in spec.get("pops", []):
        d = os.path.join(art, p["slug"])
        panel = Image.open(os.path.join(d, p["panel"] + ".jpg"))
        cut = Image.open(os.path.join(d, "raw", p["cutout"] + ".png")).convert("RGBA")
        cut = cut.crop(cut.getchannel("A").getbbox())
        x, y, w = p["box"]
        W, H = panel.size
        cw = round(w * W)
        cut = cut.resize((cw, round(cut.height * cw / cut.width)), Image.LANCZOS)
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        layer.alpha_composite(cut, (round(x * W), round(y * H)))
        dst = os.path.join(d, p["panel"] + "-pop.png")
        layer.save(dst, optimize=True)
        print("pop", dst, os.path.getsize(dst) // 1000, "KB")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--art", required=True)
    ap.add_argument("cmd", choices=["shrink", "reuse", "grid", "check", "contact", "budget", "crops", "pops"])
    ap.add_argument("args", nargs="+")
    a = ap.parse_args()
    if a.cmd == "shrink":
        cmd_shrink(a.art, a.args)
    elif a.cmd == "budget":
        cmd_budget(a.art, a.args)
    elif a.cmd == "crops":
        cmd_crops(a.art, a.args[0])
    elif a.cmd == "pops":
        cmd_pops(a.art, a.args[0])
    elif a.cmd == "reuse":
        cmd_reuse(a.art, a.args[0], a.args[1])
    else:
        for slug in a.args:
            {"grid": cmd_grid, "check": cmd_check, "contact": cmd_contact}[a.cmd](a.art, slug)


if __name__ == "__main__":
    main()
