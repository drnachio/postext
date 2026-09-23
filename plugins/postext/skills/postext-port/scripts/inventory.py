#!/usr/bin/env python3
"""First look at a source document before porting it to Postext.

    inventory.py SOURCE [--pages 1-30] [--json]

Prints what the design analysis needs, per format:
  PDF   page count, trim/media boxes (mm), fonts (embedded/subset), the most used
        font/size/colour styles with samples, images and vector-heavy pages,
        text-less pages (scans -> OCR), outline (bookmarks)
  DOCX  page size, margins, columns (per section), paragraph/character styles in
        use with counts, fonts, tables, images, footnotes, equations, headers
  PPTX  slide size, slide count, layouts, fonts, pictures, tables, notes
  ODT   styles in use, fonts, images
  EPUB  spine (reading order), nav, CSS fonts and @font-face, images
  IDML  pages, page size, margins and columns from master spreads, paragraph and
        character styles in use (counts), fonts, stories, tables, links
  HTML / Markdown / LaTeX   headings outline, images, tables, math

Standard library only, except PDF (PyMuPDF: python3 -m pip install pymupdf).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree as ET

PT_MM = 25.4 / 72
TWIP_MM = 25.4 / 1440
EMU_MM = 1 / 36000


def mm(v: float) -> float:
    return round(v, 1)


def local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def attr(el, name: str, default=None):
    for k, v in el.attrib.items():
        if local(k) == name:
            return v
    return default


# ---------------------------------------------------------------------------


def inv_pdf(path: Path, pages_spec: str | None) -> dict:
    try:
        import fitz  # type: ignore
    except ImportError:
        sys.exit("PyMuPDF is required for PDFs: python3 -m pip install pymupdf")
    doc = fitz.open(path)
    n = doc.page_count
    pages = range(n)
    if pages_spec:
        a, _, b = pages_spec.partition("-")
        pages = range(int(a) - 1, min(n, int(b or a)))
    p0 = doc[0]
    out: dict = {"format": "pdf", "pages": n, "metadata": {k: v for k, v in (doc.metadata or {}).items() if v}}
    out["page_size_mm"] = [mm(p0.rect.width * PT_MM), mm(p0.rect.height * PT_MM)]
    tb = p0.trimbox
    if tb != p0.mediabox:
        out["trimbox_mm"] = [mm(tb.x0 * PT_MM), mm(tb.y0 * PT_MM), mm(tb.x1 * PT_MM), mm(tb.y1 * PT_MM)]
        out["note_trim"] = "media box larger than trim box: measure everything from the trim (subtract the bleed/slug)"
    sizes = Counter((round(doc[i].rect.width), round(doc[i].rect.height)) for i in range(n))
    if len(sizes) > 1:
        out["page_sizes_pt"] = {f"{w}x{h}": c for (w, h), c in sizes.most_common()}
    fonts: Counter = Counter()
    styles: Counter = Counter()
    samples: dict = {}
    textless, heavy, image_pages = [], [], Counter()
    for i in pages:
        page = doc[i]
        for f in page.get_fonts(full=True):
            fonts[(re.sub(r"^[A-Z]{6}\+", "", f[3]), f[1], "subset" if re.match(r"^[A-Z]{6}\+", f[3]) else "full")] += 1
        d = page.get_text("dict")
        chars = 0
        for b in d["blocks"]:
            if b.get("type") != 0:
                continue
            for ln in b["lines"]:
                for s in ln["spans"]:
                    t = s["text"].strip()
                    if not t:
                        continue
                    chars += len(t)
                    k = (re.sub(r"^[A-Z]{6}\+", "", s["font"]), round(s["size"] * 2) / 2, f"#{s['color']:06x}")
                    styles[k] += len(t)
                    samples.setdefault(k, t[:60])
        if chars < 20:
            textless.append(i + 1)
        imgs = page.get_images()
        if imgs:
            image_pages[i + 1] = len(imgs)
        try:
            if len(page.get_drawings()) > 150:
                heavy.append(i + 1)
        except Exception:
            pass
    out["fonts"] = [{"name": k[0], "type": k[1], "embedding": k[2], "pages": v} for k, v in fonts.most_common(40)]
    out["styles_by_chars"] = [{"font": k[0], "size": k[1], "color": k[2], "chars": v, "sample": samples[k]} for k, v in styles.most_common(25)]
    out["pages_with_images"] = dict(list(image_pages.items())[:80])
    out["vector_heavy_pages"] = heavy[:80]
    if textless:
        out["pages_without_text"] = textless[:80]
        if len(textless) > len(list(pages)) * 0.5:
            out["note_scan"] = "most pages have no text layer: OCR first (ocrmypdf --language spa+eng in.pdf out.pdf)"
    toc = doc.get_toc()
    if toc:
        out["outline"] = [{"level": l, "title": t, "page": p} for l, t, p in toc[:120]]
    return out


# ---------------------------------------------------------------------------


W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def inv_docx(path: Path) -> dict:
    z = zipfile.ZipFile(path)
    doc = ET.fromstring(z.read("word/document.xml"))
    styles_xml = ET.fromstring(z.read("word/styles.xml")) if "word/styles.xml" in z.namelist() else None
    names = {}
    fonts: Counter = Counter()
    if styles_xml is not None:
        for s in styles_xml.iter(W + "style"):
            sid = s.get(W + "styleId")
            nm = s.find(W + "name")
            names[sid] = nm.get(W + "val") if nm is not None else sid
            rf = s.find(f".//{W}rFonts")
            if rf is not None and rf.get(W + "ascii"):
                fonts[rf.get(W + "ascii")] += 1
    pstyles: Counter = Counter()
    cstyles: Counter = Counter()
    samples: dict = {}
    for p in doc.iter(W + "p"):
        ps = p.find(f"{W}pPr/{W}pStyle")
        name = names.get(ps.get(W + "val"), ps.get(W + "val")) if ps is not None else "Normal"
        pstyles[name] += 1
        if name not in samples:
            txt = "".join(t.text or "" for t in p.iter(W + "t")).strip()
            if txt:
                samples[name] = txt[:60]
    for r in doc.iter(W + "rStyle"):
        cstyles[names.get(r.get(W + "val"), r.get(W + "val"))] += 1
    for rf in doc.iter(W + "rFonts"):
        if rf.get(W + "ascii"):
            fonts[rf.get(W + "ascii")] += 1
    sections = []
    for sp in doc.iter(W + "sectPr"):
        pg = sp.find(W + "pgSz")
        mar = sp.find(W + "pgMar")
        cols = sp.find(W + "cols")
        sec: dict = {}
        if pg is not None:
            sec["page_mm"] = [mm(int(pg.get(W + "w")) * TWIP_MM), mm(int(pg.get(W + "h")) * TWIP_MM)]
        if mar is not None:
            sec["margins_mm"] = {k: mm(int(mar.get(W + k, 0)) * TWIP_MM) for k in ("top", "bottom", "left", "right", "gutter")}
            sec["mirror"] = False
        if cols is not None:
            sec["columns"] = int(cols.get(W + "num", "1"))
            if cols.get(W + "space"):
                sec["gutter_mm"] = mm(int(cols.get(W + "space")) * TWIP_MM)
        sections.append(sec)
    settings = z.read("word/settings.xml").decode("utf8", "ignore") if "word/settings.xml" in z.namelist() else ""
    if "mirrorMargins" in settings:
        for s in sections:
            s["mirror"] = True
    names_list = z.namelist()
    return {
        "format": "docx",
        "sections": sections,
        "paragraph_styles": [{"style": k, "count": v, "sample": samples.get(k, "")} for k, v in pstyles.most_common()],
        "character_styles": [{"style": k, "count": v} for k, v in cstyles.most_common()],
        "fonts": [k for k, _ in fonts.most_common(20)],
        "tables": sum(1 for _ in doc.iter(W + "tbl")),
        "images": len([n for n in names_list if n.startswith("word/media/")]),
        "media_types": dict(Counter(Path(n).suffix.lower() for n in names_list if n.startswith("word/media/"))),
        "footnotes": max(0, len(re.findall(r"<w:footnote ", z.read("word/footnotes.xml").decode("utf8", "ignore"))) - 2) if "word/footnotes.xml" in names_list else 0,
        "equations": sum(1 for el in doc.iter() if local(el.tag) == "oMath"),
        "headers_footers": [n for n in names_list if re.match(r"word/(header|footer)\d+\.xml", n)],
        "next": "pandoc_to_postext.py SOURCE --dump-styles, then a --style-map for the styles above",
    }


# ---------------------------------------------------------------------------


def inv_pptx(path: Path) -> dict:
    z = zipfile.ZipFile(path)
    pres = ET.fromstring(z.read("ppt/presentation.xml"))
    size = next((el for el in pres.iter() if local(el.tag) == "sldSz"), None)
    slides = sorted([n for n in z.namelist() if re.match(r"ppt/slides/slide\d+\.xml$", n)], key=lambda n: int(re.findall(r"\d+", n)[-1]))
    fonts: Counter = Counter()
    pics = tables = 0
    titles = []
    for s in slides:
        root = ET.fromstring(z.read(s))
        for el in root.iter():
            ln = local(el.tag)
            if ln == "latin" and attr(el, "typeface"):
                fonts[attr(el, "typeface")] += 1
            elif ln == "pic":
                pics += 1
            elif ln == "tbl":
                tables += 1
        title = ""
        for sp in root.iter():
            if local(sp.tag) == "sp":
                ph = next((e for e in sp.iter() if local(e.tag) == "ph"), None)
                if ph is not None and attr(ph, "type") in ("title", "ctrTitle"):
                    title = "".join(t.text or "" for t in sp.iter() if local(t.tag) == "t")
                    break
        titles.append(title[:70])
    return {
        "format": "pptx",
        "slide_size_mm": [mm(int(attr(size, "cx")) * EMU_MM), mm(int(attr(size, "cy")) * EMU_MM)] if size is not None else None,
        "slides": len(slides),
        "slide_titles": titles[:120],
        "fonts": [k for k, _ in fonts.most_common(15)],
        "pictures": pics,
        "tables": tables,
        "notes_slides": len([n for n in z.namelist() if n.startswith("ppt/notesSlides/")]),
        "layouts": len([n for n in z.namelist() if re.match(r"ppt/slideLayouts/slideLayout\d+\.xml$", n)]),
        "next": "pandoc_to_postext.py SOURCE --split-level 2 (pandoc sets each slide title as a level-2 heading)",
    }


# ---------------------------------------------------------------------------


def inv_odt(path: Path) -> dict:
    z = zipfile.ZipFile(path)
    content = ET.fromstring(z.read("content.xml"))
    styles: Counter = Counter()
    for el in content.iter():
        if local(el.tag) in ("p", "h"):
            styles[attr(el, "style-name", "?")] += 1
    fonts = [attr(el, "name") for el in content.iter() if local(el.tag) == "font-face"]
    return {"format": "odt", "paragraph_styles": dict(styles.most_common(40)), "fonts": fonts,
            "images": len([n for n in z.namelist() if n.startswith("Pictures/")]),
            "next": "pandoc_to_postext.py SOURCE (or convert to DOCX to keep custom style names)"}


def inv_epub(path: Path) -> dict:
    z = zipfile.ZipFile(path)
    container = ET.fromstring(z.read("META-INF/container.xml"))
    opf_path = next(attr(el, "full-path") for el in container.iter() if local(el.tag) == "rootfile")
    opf = ET.fromstring(z.read(opf_path))
    manifest = {attr(i, "id"): attr(i, "href") for i in opf.iter() if local(i.tag) == "item"}
    spine = [manifest.get(attr(i, "idref")) for i in opf.iter() if local(i.tag) == "itemref"]
    base = str(Path(opf_path).parent)
    css_fonts = set()
    for n in z.namelist():
        if n.endswith(".css"):
            css = z.read(n).decode("utf8", "ignore")
            css_fonts |= set(f.strip("'\" ") for f in re.findall(r"font-family\s*:\s*([^;,}]+)", css))
    meta = {local(el.tag): (el.text or "").strip() for el in opf.iter() if local(el.tag) in ("title", "creator", "language", "publisher", "date")}
    return {"format": "epub", "metadata": meta, "spine": spine[:200], "base": base,
            "css_font_families": sorted(css_fonts)[:40],
            "embedded_fonts": [n for n in z.namelist() if n.lower().endswith((".ttf", ".otf", ".woff", ".woff2"))],
            "images": len([n for n in z.namelist() if re.search(r"\.(jpe?g|png|gif|svg|webp)$", n, re.I)]),
            "next": "pandoc_to_postext.py SOURCE (chapters split at H1; check the spine order)"}


def inv_idml(path: Path) -> dict:
    z = zipfile.ZipFile(path)
    dm = ET.fromstring(z.read("designmap.xml"))
    spreads = [attr(el, "src") for el in dm.iter() if local(el.tag) == "Spread"]
    masters = [attr(el, "src") for el in dm.iter() if local(el.tag) == "MasterSpread"]
    stories = [attr(el, "src") for el in dm.iter() if local(el.tag) == "Story"]
    out: dict = {"format": "idml", "spreads": len(spreads), "stories": len(stories)}
    pages = 0
    sizes = Counter()
    for s in spreads:
        root = ET.fromstring(z.read(s))
        for p in root.iter():
            if local(p.tag) == "Page":
                pages += 1
                gb = [float(v) for v in attr(p, "GeometricBounds", "0 0 0 0").split()]
                sizes[(mm((gb[3] - gb[1]) * PT_MM), mm((gb[2] - gb[0]) * PT_MM))] += 1
    out["pages"] = pages
    out["page_sizes_mm"] = [list(k) + [v] for k, v in sizes.most_common()]
    mas = []
    for s in masters:
        root = ET.fromstring(z.read(s))
        for p in root.iter():
            if local(p.tag) == "Page":
                mp = next((e for e in p if local(e.tag) == "MarginPreference"), None)
                if mp is not None:
                    mas.append({"master": attr(root.find("./*"), "Name") or s,
                                "margins_mm": {k: mm(float(attr(mp, k.capitalize(), 0)) * PT_MM) for k in ("top", "bottom", "left", "right")},
                                "columns": int(attr(mp, "ColumnCount", 1)),
                                "gutter_mm": mm(float(attr(mp, "ColumnGutter", 0)) * PT_MM)})
    out["masters"] = mas[:12]
    pstyles: Counter = Counter()
    cstyles: Counter = Counter()
    fonts: Counter = Counter()
    chars: Counter = Counter()
    tables = 0
    for s in stories:
        root = ET.fromstring(z.read(s))
        story_chars = 0
        for el in root.iter():
            ln = local(el.tag)
            if ln == "ParagraphStyleRange":
                pstyles[attr(el, "AppliedParagraphStyle", "").replace("ParagraphStyle/", "")] += 1
            elif ln == "CharacterStyleRange":
                cs = attr(el, "AppliedCharacterStyle", "").replace("CharacterStyle/", "")
                if cs and "[No character style]" not in cs:
                    cstyles[cs] += 1
            elif ln == "AppliedFont" and el.text:
                fonts[el.text] += 1
            elif ln == "Table":
                tables += 1
            elif ln == "Content" and el.text:
                story_chars += len(el.text)
        chars[s] = story_chars
    if "Resources/Fonts.xml" in z.namelist():
        root = ET.fromstring(z.read("Resources/Fonts.xml"))
        for f in root.iter():
            if local(f.tag) == "Font" and attr(f, "PostScriptName"):
                fonts[attr(f, "PostScriptName")] += 0
    out["paragraph_styles"] = dict(pstyles.most_common(60))
    out["character_styles"] = dict(cstyles.most_common(40))
    out["fonts"] = [k for k, _ in fonts.most_common(40)]
    out["tables"] = tables
    out["largest_stories"] = [{"story": k, "chars": v} for k, v in chars.most_common(8)]
    out["links"] = len([el for s in spreads for el in ET.fromstring(z.read(s)).iter() if local(el.tag) == "Link"])
    out["next"] = "idml_extract.py roles SOURCE, then idml_extract.py markdown SOURCE --map map.json; positions come from the printed PDF"
    return out


def inv_text(path: Path) -> dict:
    text = path.read_text(encoding="utf-8", errors="ignore")
    suffix = path.suffix.lower()
    out: dict = {"format": suffix.lstrip("."), "chars": len(text)}
    if suffix in (".html", ".htm", ".xhtml"):
        heads = re.findall(r"<h([1-6])[^>]*>(.*?)</h\1>", text, re.S | re.I)
        out["outline"] = [{"level": int(l), "title": re.sub(r"<[^>]+>", "", t).strip()[:70]} for l, t in heads][:150]
        out["images"] = len(re.findall(r"<img\b", text, re.I))
        out["tables"] = len(re.findall(r"<table\b", text, re.I))
        out["math"] = len(re.findall(r'class="math|<math\b|\\\(|\\\[', text))
    elif suffix == ".tex":
        out["outline"] = [{"cmd": c, "title": t[:70]} for c, t in re.findall(r"\\(chapter|section|subsection)\*?\{([^}]*)\}", text)][:150]
        out["figures"] = text.count("\\begin{figure")
        out["tables"] = text.count("\\begin{table")
        out["equations"] = len(re.findall(r"\\begin\{(equation|align|gather)", text))
    else:
        heads = re.findall(r"^(#{1,6})\s+(.+)$", text, re.M)
        out["outline"] = [{"level": len(h), "title": t[:70]} for h, t in heads][:150]
        out["images"] = len(re.findall(r"!\[", text))
        out["pipe_tables"] = len(re.findall(r"^\|.*\|\s*$\n^\|[\s:|-]+\|\s*$", text, re.M))
        out["footnotes"] = len(re.findall(r"^\[\^[^\]]+\]:", text, re.M))
        out["code_fences"] = len(re.findall(r"^```", text, re.M)) // 2
        out["math"] = len(re.findall(r"\$\$|\$[^$\n]+\$", text))
    out["next"] = "pandoc_to_postext.py SOURCE"
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source")
    ap.add_argument("--pages", help="PDF page range to sample, e.g. 1-40")
    ap.add_argument("--json", action="store_true", help="print JSON only")
    args = ap.parse_args()
    path = Path(args.source)
    ext = path.suffix.lower()
    if ext == ".pdf":
        info = inv_pdf(path, args.pages)
    elif ext in (".docx", ".dotx", ".docm"):
        info = inv_docx(path)
    elif ext in (".pptx", ".potx"):
        info = inv_pptx(path)
    elif ext == ".odt":
        info = inv_odt(path)
    elif ext == ".epub":
        info = inv_epub(path)
    elif ext == ".idml":
        info = inv_idml(path)
    elif ext in (".html", ".htm", ".xhtml", ".md", ".markdown", ".tex", ".txt", ".rst"):
        info = inv_text(path)
    elif ext in (".doc", ".ppt", ".rtf", ".pages", ".key", ".indd"):
        sys.exit(f"{ext}: export it first (Word/PowerPoint/Pages/Keynote: save as .docx/.pptx; InDesign: File > Export > IDML and a print PDF; "
                 "LibreOffice: soffice --headless --convert-to docx)")
    else:
        sys.exit(f"unknown format {ext}")
    print(json.dumps(info, ensure_ascii=False, indent=None if args.json else 2))


if __name__ == "__main__":
    main()
