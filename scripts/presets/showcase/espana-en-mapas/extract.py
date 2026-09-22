"""Extract the text, maps and photographs of an Atlas Nacional de España
chapter PDF (InDesign export) into a structure build.py can typeset.

Roles are told apart by typeface and size, exactly as the IGN set them:

- body           MyriadPro-Regular / -It, 9.5–10 pt, first-line indent ≈ 14 pt
- section title  MyriadPro-BoldCond 20 pt
- part title     MyriadPro-BoldCond 30 pt (part opener pages)
- running head   FranklinGothic-Heavy 16 pt, top right ("PREHISTORIA")
- photo caption  MyriadPro-CondIt 10 pt
- map title      FuturaBT-Heavy ≥ 7.5 pt (uppercase); map furniture FuturaBT / ESRI

Maps are vector art: each is located from its title and rendered as a
raster crop; photographs are pulled from the embedded images.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

import fitz  # PyMuPDF


@dataclass
class Block:
    kind: str  # "part" | "heading" | "paragraph" | "caption"
    text: str
    page: int
    y: float = 0.0


@dataclass
class Figure:
    kind: str  # "map" | "photo"
    page: int
    box: fitz.Rect
    title: str
    y: float


@dataclass
class Extraction:
    parts: list[str] = field(default_factory=list)
    blocks: list[Block] = field(default_factory=list)
    figures: list[Figure] = field(default_factory=list)


def _font_of(block) -> tuple[str, float]:
    spans = [s for l in block["lines"] for s in l["spans"] if s["text"].strip()]
    if not spans:
        return "", 0.0
    best = max(spans, key=lambda s: len(s["text"]))
    return best["font"], round(best["size"], 1)


def _line_text(line) -> str:
    out = []
    prev_x1 = None
    prev_size = 10.0
    for s in line["spans"]:
        t = s["text"]
        if not t:
            continue
        # A gap between spans with no space character is a space nonetheless.
        if prev_x1 is not None and s["bbox"][0] - prev_x1 > 0.18 * prev_size and not t.startswith(" ") and out and not out[-1].endswith(" "):
            out.append(" ")
        if "It" in s["font"] and "Myriad" in s["font"] and t.strip():
            t = re.sub(r"^(\s*)(.*?)(\s*)$", r"\1*\2*\3", t)
        out.append(t)
        prev_x1 = s["bbox"][2]
        prev_size = s["size"]
    text = "".join(out)
    text = re.sub(r"\*(\s*)\*", r"\1", text)  # adjacent italic runs
    return re.sub(r"[ \t]+", " ", text).strip()


def _join_lines(lines: list[str]) -> str:
    text = ""
    for ln in lines:
        if not text:
            text = ln
            continue
        stars = len(text) - len(text.rstrip("*"))
        core = text.rstrip("*")
        nxt = ln.lstrip("*")
        if core.endswith("-") and nxt[:1].islower():
            # hyphenated word split over the line break, possibly inside italics
            if stars and ln.startswith("*"):
                text = core[:-1] + nxt
            else:
                text = core[:-1] + "*" * stars + ln
        elif core.endswith("-") and nxt[:1].isupper():
            text = text + ln
        else:
            text = text + " " + ln
    text = re.sub(r"\*\s*\*", "", text)
    text = re.sub(r"\s+([,.;:])", r"\1", text)
    return text.strip()


def _continues(prev: str, text: str, indented: bool) -> bool:
    """Does `text` (the first paragraph of a block) continue `prev`? A
    first-line indent always starts a paragraph; otherwise a block continues
    the previous one when that one stopped mid-sentence or this one starts
    in lower case (a paragraph split across columns or pages)."""
    if indented:
        return False
    if prev.endswith("-"):
        return True
    first = text.lstrip("*«“\"(")[:1]
    if first.islower():
        return True
    return not prev.rstrip("*»”\")").endswith((".", "!", "?", ":", "…"))


def body_blocks(page) -> list[fitz.Rect]:
    out = []
    for b in page.get_text("dict")["blocks"]:
        if b["type"] != 0:
            continue
        f, _ = _font_of(b)
        if "Myriad" in f:
            out.append(fitz.Rect(b["bbox"]))
    return out


def map_regions(page) -> list[tuple[fitz.Rect, str]]:
    """Map regions anchored on their FuturaBT-Heavy titles."""
    W, H = page.rect.width, page.rect.height
    titles: list[tuple[fitz.Rect, str]] = []
    furniture: list[fitz.Rect] = []
    for b in page.get_text("dict")["blocks"]:
        if b["type"] != 0:
            continue
        f, size = _font_of(b)
        r = fitz.Rect(b["bbox"])
        txt = " ".join(s["text"] for l in b["lines"] for s in l["spans"]).strip()
        if "FuturaBT-Heavy" in f and size >= 7.5 and len(txt) > 6:
            titles.append((r, txt))
        elif "Futura" in f or "ESRI" in f:
            furniture.append(r)
    bodies = body_blocks(page) + [r for r, _ in photos(page)]
    draw: list[fitz.Rect] = []
    for d in page.get_drawings():
        r = fitz.Rect(d["rect"])
        if r.width >= W * 0.9 or r.height >= H * 0.9 or r.is_empty:
            continue
        if any(r.intersects(bb) and (r & bb).get_area() > 0.5 * r.get_area() for bb in bodies):
            continue
        draw.append(r)
    for img in page.get_image_info():
        r = fitz.Rect(img["bbox"])
        if not any(r.intersects(bb) and (r & bb).get_area() > 0.5 * r.get_area() for bb in bodies):
            draw.append(r)
    uniq: dict = {}
    for r, t in titles:
        uniq[(round(r.y0), round(r.x0))] = (r, t)
    titles = sorted(uniq.values(), key=lambda rt: (rt[0].y0, rt[0].x0))
    regions = []
    for i, (tr, txt) in enumerate(titles):
        below = [t for t, _ in titles[i + 1:] if abs(t.x0 - tr.x0) < 200]
        y0 = tr.y0 - 6
        y1 = (below[0].y0 - 6) if below else H - 30
        band_f = [r for r in furniture if r.y0 >= y0 - 2 and r.y1 <= y1 + 2] + [tr]
        band_f.sort(key=lambda r: r.x0)
        groups: list[list] = []
        for r in band_f:
            if groups and r.x0 - groups[-1][1] < 40:
                groups[-1][1] = max(groups[-1][1], r.x1)
                groups[-1][2].append(r)
            else:
                groups.append([r.x0, r.x1, [r]])
        grp = next((g for g in groups if g[0] <= tr.x1 and g[1] >= tr.x0), None)
        if grp is None:
            continue
        xr = (grp[0] - 12, grp[1] + 12)
        cand = [r for r in draw if r.y0 >= y0 - 2 and r.y1 <= y1 + 2 and xr[0] - 30 <= (r.x0 + r.x1) / 2 <= xr[1] + 30]
        box = fitz.Rect(tr)
        for r in grp[2] + cand:
            box.include_rect(r)
        for bb in bodies:
            if bb.y1 > box.y0 and bb.y0 < box.y1:
                if bb.x1 <= tr.x0:
                    box.x0 = max(box.x0, bb.x1 + 4)
                elif bb.x0 >= tr.x1:
                    box.x1 = min(box.x1, bb.x0 - 4)
        box = box & page.rect
        if box.width > 120 and box.height > 120:
            regions.append((box, txt))
    return regions


def photos(page, min_px: int = 300, maps: list[fitz.Rect] | None = None) -> list[tuple[fitz.Rect, str]]:
    """Embedded photographs: rasters with an italic caption under them. The
    relief tiles of the maps carry no caption and are left out."""
    caps = []
    for b in page.get_text("dict")["blocks"]:
        if b["type"] != 0:
            continue
        f, size = _font_of(b)
        if "MyriadPro-CondIt" in f:
            caps.append((fitz.Rect(b["bbox"]), _join_lines([_line_text(l) for l in b["lines"]]).replace("*", "")))
    out = []
    for info in page.get_image_info(xrefs=True):
        if info["width"] < min_px or info["height"] < min_px:
            continue
        r = fitz.Rect(info["bbox"])
        if r.width < 100 or r.height < 100:
            continue
        near = [c for c in caps if c[0].y0 >= r.y1 - 4 and c[0].y0 < r.y1 + 40 and c[0].x1 > r.x0 and c[0].x0 < r.x1]
        if not near:
            continue
        out.append((r, near[0][1]))
    return out


def extract(pdf_path: str, first_page: int, last_page: int, *, indents: bool = True) -> Extraction:
    """`indents`: paragraphs start with a first-line indent (the Spanish
    edition); the English edition sets one paragraph per text block."""
    doc = fitz.open(pdf_path)
    ex = Extraction()
    current_part = ""
    open_para: Block | None = None
    drop_cap = ""
    for pn in range(first_page - 1, last_page):
        page = doc[pn]
        blocks = [b for b in page.get_text("dict")["blocks"] if b["type"] == 0]
        # running head → part
        for b in blocks:
            f, size = _font_of(b)
            txt = " ".join(s["text"] for l in b["lines"] for s in l["spans"]).strip()
            if "FranklinGothic-Heavy" in f and size >= 15 and b["bbox"][1] < 60 and txt and txt.upper() == txt and len(txt) > 4:
                title = txt.title().replace(" De ", " de ").replace(" Y ", " y ")
                if title != current_part:
                    current_part = title
                    ex.parts.append(title)
                    ex.blocks.append(Block("part", title, pn + 1, 0))
                    open_para = None
        # text columns in reading order: cluster by x0, then y
        text_blocks = []
        for b in blocks:
            f, size = _font_of(b)
            if "Myriad" not in f:
                continue
            text_blocks.append((b, f, size))
        text_blocks.sort(key=lambda t: (round(t[0]["bbox"][0] / 100), t[0]["bbox"][1]))
        for b, f, size in text_blocks:
            x0 = min(l["bbox"][0] for l in b["lines"])
            if "BoldCond" in f and size >= 28:
                continue  # part opener title (already known from the running head)
            if "BoldCond" in f and size >= 18:
                ex.blocks.append(Block("heading", _join_lines([_line_text(l) for l in b["lines"]]).replace("*", ""), pn + 1, b["bbox"][1]))
                open_para = None
                continue
            if "CondIt" in f:
                continue  # photo caption, handled with the photo
            whole = "".join(s["text"] for l in b["lines"] for s in l["spans"]).strip()
            if size > 30 and len(whole) == 1:
                drop_cap = whole  # the opener's drop cap, glued to the next paragraph
                continue
            if size < 9:
                continue
            # body: split into paragraphs on first-line indent
            paras: list[list[str]] = []
            for l in b["lines"]:
                t = _line_text(l)
                if not t:
                    continue
                dx = l["bbox"][0] - x0
                indented = indents and 8 < dx < 25  # a first-line indent, not the drop cap's displacement
                if indented or not paras:
                    paras.append([t])
                else:
                    paras[-1].append(t)
            for k, lines in enumerate(paras):
                first_indented = (indents and 8 < b["lines"][0]["bbox"][0] - x0 < 25) if k == 0 else True
                text = _join_lines(lines)
                if k == 0 and open_para is not None and (_continues(open_para.text, text, first_indented) or len(text.split()) < 4):
                    open_para.text = _join_lines([open_para.text, text])
                    continue
                if k == 0 and open_para is None and text.lstrip("*«“\"(")[:1].islower():
                    # a column's tail printed after the next heading in reading order
                    last = next((x for x in reversed(ex.blocks) if x.kind == "paragraph"), None)
                    if last is not None:
                        last.text = _join_lines([last.text, text])
                        continue
                if drop_cap:
                    text = drop_cap + text
                    drop_cap = ""
                blk = Block("paragraph", text, pn + 1, b["bbox"][1])
                ex.blocks.append(blk)
                open_para = blk
        for box, title in map_regions(page):
            ex.figures.append(Figure("map", pn + 1, box, title, box.y0))
        for box, cap in photos(page):
            ex.figures.append(Figure("photo", pn + 1, box, cap, box.y0))
    return ex
