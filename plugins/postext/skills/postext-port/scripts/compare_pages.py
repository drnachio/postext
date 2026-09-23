#!/usr/bin/env python3
"""Side-by-side page comparison of the source PDF and the Postext render.

    compare_pages.py source.pdf render.pdf --source-pages 23-30 --render-pages 1-8
        --out compare/ [--dpi 45] [--sheet]

Writes compare/pair-NN.png (source left, render right) for each page pair and,
with --sheet, compare/sheet.png (all pairs in a grid) to eyeball a whole
chapter: page breaks, column balance, figure positions, box placement,
openers and running heads.

The page ranges are 1-based PDF page numbers (mind the offset between the
book's folios and the PDF pages). Requires PyMuPDF and Pillow.
"""
from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

try:
    import fitz  # PyMuPDF
    from PIL import Image, ImageDraw
except ImportError:  # pragma: no cover
    sys.exit("requires PyMuPDF and Pillow: python3 -m pip install pymupdf pillow")


def pages(spec: str, count: int) -> list[int]:
    a, _, b = spec.partition("-")
    s, e = int(a), int(b or a)
    return [p - 1 for p in range(s, e + 1) if 1 <= p <= count]


def render(doc, pno: int, dpi: int, height: int | None = None) -> Image.Image:
    page = doc[pno]
    rect = page.trimbox if page.trimbox and page.trimbox != page.mediabox else page.rect
    pix = page.get_pixmap(dpi=dpi, clip=rect, alpha=False)
    im = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
    if height and im.height != height:
        im = im.resize((round(im.width * height / im.height), height))
    return im


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source")
    ap.add_argument("render")
    ap.add_argument("--source-pages", required=True)
    ap.add_argument("--render-pages", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--dpi", type=int, default=45)
    ap.add_argument("--sheet", action="store_true")
    args = ap.parse_args()
    src, ren = fitz.open(args.source), fitz.open(args.render)
    sp, rp = pages(args.source_pages, src.page_count), pages(args.render_pages, ren.page_count)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    pairs = []
    for n in range(max(len(sp), len(rp))):
        a = render(src, sp[n], args.dpi) if n < len(sp) else None
        h = a.height if a else None
        b = render(ren, rp[n], args.dpi, h) if n < len(rp) else None
        h = h or b.height
        w = (a.width if a else b.width) + (b.width if b else a.width) + 12
        pair = Image.new("RGB", (w, h + 16), (235, 235, 235))
        d = ImageDraw.Draw(pair)
        x = 0
        for im, label in ((a, f"source p.{sp[n] + 1}" if a else ""), (b, f"postext p.{rp[n] + 1}" if b else "")):
            if im:
                pair.paste(im, (x, 16))
                d.text((x + 4, 2), label, fill=(60, 60, 60))
                x += im.width + 12
            else:
                x += (a or b).width + 12
        pair.save(out / f"pair-{n + 1:02d}.png")
        pairs.append(pair)
    print(f"wrote {len(pairs)} pairs to {out}/")
    if args.sheet and pairs:
        cols = 2
        pw = max(p.width for p in pairs)
        ph = max(p.height for p in pairs)
        rows = (len(pairs) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * pw + (cols - 1) * 16, rows * ph + (rows - 1) * 16), (255, 255, 255))
        for i, p in enumerate(pairs):
            sheet.paste(p, ((i % cols) * (pw + 16), (i // cols) * (ph + 16)))
        sheet.save(out / "sheet.png")
        print(f"wrote {out / 'sheet.png'}")


if __name__ == "__main__":
    main()
