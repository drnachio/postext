#!/usr/bin/env python3
"""Find and cut figures out of a PDF: bitmaps, SVG previews and vector PDF
print masters.

  pdf_figures.py list book.pdf [--pages 12-14]
      Images (xref, position, pixel size, colour space) and clusters of vector
      drawings per page, in mm from the page's top-left corner.

  pdf_figures.py crop book.pdf --page 12 --box 20,40,120,110 [--unit mm] --out fig.svg
      [--dpi 300] [--redact-text] [--live-text]
      Cut one region. The extension picks the output:
        .png/.jpg  raster at --dpi
        .pdf       single-page vector PDF of the region (a print master: set it as
                   the resource's `pdfFile`, the PDF export embeds it verbatim)
        .svg       vector preview; glyphs are outlined unless --live-text (then the
                   SVG needs the fonts as @font-face in its <defs>, since an <img>
                   cannot see the page fonts)
      --redact-text removes the text inside the region first (labels you will
      re-set as live text, or a caption that sits inside the box).

  pdf_figures.py image book.pdf --xref 123 --out photo.jpg
      Extract an embedded image at its native size, converted to sRGB (CMYK and
      Adobe CMYK JPEGs render badly in browsers and in pdf-lib).

  pdf_figures.py stubs book.pdf resources.json --out-dir resources/ [--format svg|png|both]
      For the caption stubs written by pdf_extract.py (`source.page` +
      `source.captionBox`), find the artwork next to each caption (images and
      drawings above it, or below it for captions set on top), cut it, and fill
      `file`, `width`, `height`, `kind` (and `pdfFile` with --format both).
      Table stubs are left for extract_tables.py. Review every crop.

Requires PyMuPDF (python3 -m pip install pymupdf).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError:  # pragma: no cover
    sys.exit("PyMuPDF is required: python3 -m pip install pymupdf")

MM = 72 / 25.4


def mm(v: float) -> float:
    return round(v / MM, 1)


def parse_pages(spec: str | None, count: int) -> list[int]:
    if not spec:
        return list(range(count))
    out: list[int] = []
    for part in spec.split(","):
        a, _, b = part.strip().partition("-")
        s = int(a) if a else 1
        e = int(b) if b else (count if _ else s)
        out += [p - 1 for p in range(s, e + 1) if 1 <= p <= count]
    return sorted(set(out))


def clusters(rects: list[fitz.Rect], gap: float = 6) -> list[fitz.Rect]:
    groups: list[fitz.Rect] = []
    for r in sorted(rects, key=lambda r: (r.y0, r.x0)):
        grown = fitz.Rect(r.x0 - gap, r.y0 - gap, r.x1 + gap, r.y1 + gap)
        for g in groups:
            if g.intersects(grown):
                g |= r
                break
        else:
            groups.append(fitz.Rect(r))
    # merge until stable
    changed = True
    while changed:
        changed = False
        for i in range(len(groups)):
            for j in range(i + 1, len(groups)):
                gi = fitz.Rect(groups[i].x0 - gap, groups[i].y0 - gap, groups[i].x1 + gap, groups[i].y1 + gap)
                if gi.intersects(groups[j]):
                    groups[i] |= groups[j]
                    groups.pop(j)
                    changed = True
                    break
            if changed:
                break
    return groups


def page_objects(page) -> tuple[list[tuple[int, fitz.Rect]], list[fitz.Rect]]:
    area = page.rect.width * page.rect.height
    images = []
    for img in page.get_images(full=True):
        xref = img[0]
        for r in page.get_image_rects(xref):
            if r.width * r.height < area * 0.9:
                images.append((xref, r))
    draws = []
    for d in page.get_drawings():
        r = d.get("rect")
        if not r or r.is_empty:
            continue
        if r.width * r.height > area * 0.85:
            continue  # page backgrounds
        if (r.height < 1.5 and r.width > page.rect.width * 0.5) or (r.width < 1.5 and r.height > page.rect.height * 0.5):
            continue  # rules / column lines
        draws.append(r)
    return images, draws


def cmd_list(args) -> None:
    doc = fitz.open(args.pdf)
    for pno in parse_pages(args.pages, doc.page_count):
        page = doc[pno]
        images, draws = page_objects(page)
        cl = [c for c in clusters(draws) if c.width * c.height > page.rect.width * page.rect.height * 0.01]
        if not images and not cl:
            continue
        print(f"page {pno + 1}  ({mm(page.rect.width)} x {mm(page.rect.height)} mm)")
        for xref, r in images:
            info = doc.extract_image(xref) if xref else {}
            cs = info.get("cs-name") or info.get("colorspace")
            print(f"  image xref={xref:<5} box_mm={mm(r.x0)},{mm(r.y0)},{mm(r.x1)},{mm(r.y1)}  px={info.get('width')}x{info.get('height')}  {info.get('ext')} cs={cs}")
        for r in cl:
            n = sum(1 for d in draws if r.contains(d))
            print(f"  drawing cluster box_mm={mm(r.x0)},{mm(r.y0)},{mm(r.x1)},{mm(r.y1)}  paths={n}")


def region_doc(doc, pno: int, rect: fitz.Rect, redact: bool):
    """A one-page PDF holding just `rect` of page `pno` (vector, fonts embedded)."""
    src = doc
    if redact:
        src = fitz.open()
        src.insert_pdf(doc, from_page=pno, to_page=pno)
        p = src[0]
        for w in p.get_text("words"):
            wr = fitz.Rect(w[:4])
            if rect.contains(wr) or rect.intersects(wr) and (wr & rect).get_area() > wr.get_area() * 0.5:
                p.add_redact_annot(wr, fill=False)
        p.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE, graphics=getattr(fitz, "PDF_REDACT_LINE_ART_NONE", 0))
        pno = 0
    out = fitz.open()
    page = out.new_page(width=rect.width, height=rect.height)
    page.show_pdf_page(page.rect, src, pno, clip=rect)
    return out


def write_region(doc, pno: int, rect: fitz.Rect, out: Path, dpi: int, redact: bool, live_text: bool) -> dict:
    out.parent.mkdir(parents=True, exist_ok=True)
    ext = out.suffix.lower()
    one = region_doc(doc, pno, rect, redact)
    if ext == ".pdf":
        one.save(out, garbage=4, deflate=True)
        return {"width": round(rect.width, 2), "height": round(rect.height, 2)}
    if ext == ".svg":
        svg = one[0].get_svg_image(text_as_path=not live_text)
        out.write_text(svg, encoding="utf-8")
        return {"width": round(rect.width, 2), "height": round(rect.height, 2)}
    pix = one[0].get_pixmap(dpi=dpi, alpha=False)
    if ext in (".jpg", ".jpeg"):
        pix.save(out, jpg_quality=88)
    else:
        pix.save(out)
    return {"width": pix.width, "height": pix.height}


def cmd_crop(args) -> None:
    doc = fitz.open(args.pdf)
    vals = [float(v) for v in args.box.split(",")]
    if args.unit == "mm":
        vals = [v * MM for v in vals]
    rect = fitz.Rect(*vals)
    size = write_region(doc, args.page - 1, rect, Path(args.out), args.dpi, args.redact_text, args.live_text)
    print(json.dumps({"file": args.out, **size}))


def save_image(doc, xref: int, out: Path) -> dict:
    pix = fitz.Pixmap(doc, xref)
    if pix.alpha:
        pix = fitz.Pixmap(pix, 0)
    if pix.colorspace and pix.colorspace.n != 3:
        pix = fitz.Pixmap(fitz.csRGB, pix)
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.suffix.lower() in (".jpg", ".jpeg"):
        pix.save(out, jpg_quality=90)
    else:
        pix.save(out)
    return {"width": pix.width, "height": pix.height}


def cmd_image(args) -> None:
    doc = fitz.open(args.pdf)
    size = save_image(doc, args.xref, Path(args.out))
    print(json.dumps({"file": args.out, **size}))


def find_artwork(page, cap: fitz.Rect, above: bool) -> fitz.Rect | None:
    images, draws = page_objects(page)
    objs = [r for _, r in images] + draws
    h = page.rect.height
    band_x0, band_x1 = cap.x0 - 30, cap.x1 + 30
    picked: list[fitz.Rect] = []
    for r in objs:
        if r.x1 < band_x0 or r.x0 > band_x1:
            continue
        if above and cap.y0 - h * 0.6 <= r.y1 <= cap.y0 + 3 and r.y0 < cap.y0:
            picked.append(r)
        if not above and cap.y1 - 3 <= r.y0 <= cap.y1 + h * 0.6:
            picked.append(r)
    if not picked:
        return None
    # keep the cluster touching the caption side
    groups = clusters(picked, gap=10)
    groups.sort(key=lambda g: (cap.y0 - g.y1) if above else (g.y0 - cap.y1))
    region = fitz.Rect(groups[0])
    return region & page.rect


def cmd_stubs(args) -> None:
    doc = fitz.open(args.pdf)
    res_path = Path(args.resources)
    resources = json.loads(res_path.read_text(encoding="utf-8"))
    out_dir = Path(args.out_dir)
    rel = Path(args.rel_prefix)
    todo = []
    for r in resources:
        src = r.get("source")
        if not src or r.get("file"):
            continue
        if r.get("kind") == "table":
            todo.append(f"{r['id']}: table on p. {src['page']} -> extract_tables.py --pages {src['page']}")
            continue
        page = doc[src["page"] - 1]
        cap = fitz.Rect(src["captionBox"])
        region = find_artwork(page, cap, above=True) or find_artwork(page, cap, above=False)
        if not region:
            todo.append(f"{r['id']}: no artwork found near the caption on p. {src['page']} (crop by hand)")
            continue
        region = fitz.Rect(region.x0 - 1, region.y0 - 1, region.x1 + 1, region.y1 + 1)
        src["region_mm"] = [mm(region.x0), mm(region.y0), mm(region.x1), mm(region.y1)]
        images, draws = page_objects(page)
        # a photo: take the embedded image itself (full resolution, sRGB)
        photo = [(x, ir) for x, ir in images if ir.intersects(region) and (ir & region).get_area() >= region.get_area() * 0.8]
        if photo and args.format in ("auto", "png"):
            xref = photo[0][0]
            info = doc.extract_image(xref)
            ext = "jpg" if info.get("ext") in ("jpeg", "jpg", "jpx") else "png"
            size = save_image(doc, xref, out_dir / f"{r['id']}.{ext}")
            r.update({"kind": "bitmap", "file": str(rel / f"{r['id']}.{ext}"), **size})
            continue
        vector = sum(1 for d in draws if region.contains(d)) > 3
        fmt = args.format if args.format != "auto" else ("svg" if vector else "png")
        if fmt in ("svg", "both"):
            size = write_region(doc, page.number, region, out_dir / f"{r['id']}.svg", args.dpi, args.redact_text, False)
            r.update({"kind": "svg", "file": str(rel / f"{r['id']}.svg"), **size})
            if fmt == "both":
                write_region(doc, page.number, region, out_dir / f"{r['id']}.pdf", args.dpi, args.redact_text, False)
                r["pdfFile"] = str(rel / f"{r['id']}.pdf")
        else:
            size = write_region(doc, page.number, region, out_dir / f"{r['id']}.png", args.dpi, args.redact_text, False)
            r.update({"kind": "bitmap", "file": str(rel / f"{r['id']}.png"), **size})
    res_path.write_text(json.dumps(resources, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"updated {res_path}")
    for line in todo:
        print("TODO", line)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("list")
    p.add_argument("pdf")
    p.add_argument("--pages")
    p = sub.add_parser("crop")
    p.add_argument("pdf")
    p.add_argument("--page", type=int, required=True, help="1-based page number in the PDF")
    p.add_argument("--box", required=True, help="x0,y0,x1,y1 from the page's top-left corner")
    p.add_argument("--unit", choices=["pt", "mm"], default="mm")
    p.add_argument("--out", required=True)
    p.add_argument("--dpi", type=int, default=300)
    p.add_argument("--redact-text", action="store_true")
    p.add_argument("--live-text", action="store_true")
    p = sub.add_parser("image")
    p.add_argument("pdf")
    p.add_argument("--xref", type=int, required=True)
    p.add_argument("--out", required=True)
    p = sub.add_parser("stubs")
    p.add_argument("pdf")
    p.add_argument("resources")
    p.add_argument("--out-dir", required=True)
    p.add_argument("--rel-prefix", default="resources", help="path written into `file` (relative to preset.json)")
    p.add_argument("--format", choices=["auto", "svg", "png", "both"], default="auto")
    p.add_argument("--dpi", type=int, default=300)
    p.add_argument("--redact-text", action="store_true")
    args = ap.parse_args()
    {"list": cmd_list, "crop": cmd_crop, "image": cmd_image, "stubs": cmd_stubs}[args.cmd](args)


if __name__ == "__main__":
    main()
