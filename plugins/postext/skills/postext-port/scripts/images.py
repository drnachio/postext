#!/usr/bin/env python3
"""Prepare bitmaps for a Postext project (requires Pillow).

  images.py prep IN... --out resources/ [--max 2400] [--quality 84] [--gray]
        [--autocontrast] [--trim-white 225] [--crop 0,0,1,0.9] [--format jpg|png|keep]
      - converts CMYK / Adobe-CMYK JPEGs and palette/alpha images to sRGB (alpha
        flattened on white): CMYK renders wrongly in browsers and in the PDF
      - --autocontrast lifts scanned paper to white; --gray for engravings
      - --trim-white cuts the near-white margin around a plate/scan (pixels
        brighter than the threshold count as paper)
      - --crop keeps a fraction box (x0,y0,x1,y1 in 0..1), e.g. to drop a
        caption printed under a scanned plate
      - downscales to --max px on the long side (300 dpi at the printed size is
        plenty: a 90 mm wide figure needs ~1060 px)
      Prints `width`/`height` for the manifest (always declare them).

  images.py join A B [C…] --out resources/fig-3-2.jpg [--gap 0.02]
      Side-by-side composite of the parts of a multi-panel figure, scaled to
      the smallest height with white gaps.

  images.py size FILE...
      Pixel sizes (for bitmaps) and SVG sizes, as manifest fields.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:  # pragma: no cover
    sys.exit("Pillow is required: python3 -m pip install pillow")

Image.MAX_IMAGE_PIXELS = None


def to_rgb(im: Image.Image) -> Image.Image:
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[-1])
        return bg
    if im.mode == "CMYK":
        # Pillow already undoes the inverted Adobe (APP14) CMYK encoding; the
        # conversion is naive (no ICC), so compare the colours with the print.
        return im.convert("RGB")
    if im.mode not in ("RGB", "L"):
        return im.convert("RGB")
    return im


def trim_white(im: Image.Image, threshold: int, pad: int = 6) -> Image.Image:
    gray = im.convert("L")
    mask = gray.point(lambda v: 0 if v > threshold else 255)
    box = mask.getbbox()
    if not box:
        return im
    x0, y0, x1, y1 = box
    return im.crop((max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad)))


def cmd_prep(args) -> None:
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    report = []
    for f in args.inputs:
        src = Path(f)
        im = Image.open(src)
        im.load()
        icc = im.info.get("icc_profile")
        im = to_rgb(im)
        if args.crop:
            x0, y0, x1, y1 = (float(v) for v in args.crop.split(","))
            im = im.crop((round(x0 * im.width), round(y0 * im.height), round(x1 * im.width), round(y1 * im.height)))
        if args.gray:
            im = im.convert("L")
        if args.autocontrast:
            im = ImageOps.autocontrast(im, cutoff=(0.5, 0.2))
        if args.trim_white:
            im = trim_white(im, args.trim_white)
        if args.max and max(im.size) > args.max:
            im.thumbnail((args.max, args.max), Image.LANCZOS)
        fmt = args.format
        if fmt == "keep":
            fmt = "png" if src.suffix.lower() == ".png" else "jpg"
        dest = out / (re.sub(r"[^a-z0-9-]+", "-", src.stem.lower()).strip("-") + "." + fmt)
        if fmt == "jpg":
            im.convert("RGB" if im.mode != "L" else "L").save(dest, "JPEG", quality=args.quality, progressive=True, optimize=True)
        else:
            im.save(dest, "PNG", optimize=True)
        entry = {"file": str(dest), "width": im.width, "height": im.height}
        if icc and b"CMYK" in icc[:40]:
            entry["note"] = "converted from CMYK: check the colours against the print"
        report.append(entry)
    print(json.dumps(report, indent=2))


def cmd_join(args) -> None:
    ims = [to_rgb(Image.open(f)) for f in args.inputs]
    h = min(i.height for i in ims)
    ims = [i.resize((round(i.width * h / i.height), h), Image.LANCZOS) for i in ims]
    gap = round(h * args.gap)
    w = sum(i.width for i in ims) + gap * (len(ims) - 1)
    canvas = Image.new("RGB", (w, h), (255, 255, 255))
    x = 0
    for i in ims:
        canvas.paste(i.convert("RGB"), (x, 0))
        x += i.width + gap
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out, quality=88)
    print(json.dumps({"file": str(out), "width": w, "height": h}))


def cmd_size(args) -> None:
    for f in args.files:
        p = Path(f)
        if p.suffix.lower() == ".svg":
            head = p.read_text(encoding="utf-8", errors="ignore")[:4000]
            w = re.search(r'\swidth="([\d.]+)', head)
            h = re.search(r'\sheight="([\d.]+)', head)
            vb = re.search(r'viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)', head)
            size = (float(w.group(1)), float(h.group(1))) if w and h else ((float(vb.group(1)), float(vb.group(2))) if vb else None)
            print(json.dumps({"file": f, "width": size[0], "height": size[1]} if size else {"file": f, "error": "no size"}))
        else:
            with Image.open(p) as im:
                print(json.dumps({"file": f, "width": im.width, "height": im.height, "mode": im.mode}))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("prep")
    p.add_argument("inputs", nargs="+")
    p.add_argument("--out", required=True)
    p.add_argument("--max", type=int, default=2400)
    p.add_argument("--quality", type=int, default=84)
    p.add_argument("--gray", action="store_true")
    p.add_argument("--autocontrast", action="store_true")
    p.add_argument("--trim-white", type=int)
    p.add_argument("--crop")
    p.add_argument("--format", choices=["jpg", "png", "keep"], default="keep")
    p = sub.add_parser("join")
    p.add_argument("inputs", nargs="+")
    p.add_argument("--out", required=True)
    p.add_argument("--gap", type=float, default=0.02)
    p = sub.add_parser("size")
    p.add_argument("files", nargs="+")
    args = ap.parse_args()
    {"prep": cmd_prep, "join": cmd_join, "size": cmd_size}[args.cmd](args)


if __name__ == "__main__":
    main()
