#!/usr/bin/env python3
"""Build the `espana-en-mapas` showcase preset bundle from the Atlas Nacional
de España history chapter (IGN, CC BY 4.0 ign.es), Spanish and English
editions, into `apps/web/public/presets/espana-en-mapas/`.

    python3 scripts/presets/showcase/espana-en-mapas/fetch.py   # once
    python3 scripts/presets/showcase/espana-en-mapas/build.py

The text is extracted from the InDesign PDFs by role (extract.py); every
map is located from its title and rasterised as a crop of the original
page; photographs are pulled from the embedded images. Five eras become
five sections with their own band colour.
"""
from __future__ import annotations

import io
import json
import os
import re
import shutil
import sys
import unicodedata

import fitz
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))
import editorial as ed  # noqa: E402
import extract  # noqa: E402
from _common import (  # noqa: E402
    PRESETS_ROOT, at, attr_value, box_el, bundle_size, copy_licences, copy_thumbnail, image_el, instance_font,
    make_palette, mm, pt, register, rule_el, text_el, write_fingerprint,
)

SOURCE = os.path.join(HERE, "source")
PRESET_ID = "espana-en-mapas"
OUT = os.path.join(PRESETS_ROOT, PRESET_ID)
LANGS = ("es", "en")
PDFS = {"es": "06_Referenciashistoricas_2023.pdf", "en": "06_Historicaloverview_2024.pdf"}
MAP_DPI = 165
MAP_MAX_PX = 1400
MAP_QUALITY = 76
# Bitmaps lay out at their pixel size over `page.dpi`: 120 dpi lets a 1010 px
# map fill the 216 mm text width without shipping 2500 px crops.
PAGE_DPI = 120

# --- geometry & palette ------------------------------------------------------------

PAGE_W, PAGE_H = 260.0, 365.0
M_TOP, M_BOTTOM, M_INNER, M_OUTER = 28.0, 24.0, 24.0, 20.0
TEXT_W = PAGE_W - M_INNER - M_OUTER  # 216
GUTTER = 9.0

COLOURS = {
    "ink": "#1c1c1c",
    "paper": "#ffffff",
    "white": "#ffffff",
    "band": "#3f6f9f",
    "grey": "#eef0f2",
    "rule": "#c4c8cc",
    "muted": "#5d646b",
}
NAMES = {"ink": "Tinta", "paper": "Papel", "white": "Blanco", "band": "Color de sección", "grey": "Gris de fondos", "rule": "Filetes", "muted": "Gris de notas"}
col, COLOR_PALETTE = make_palette(COLOURS, NAMES)
DISPLAY, TEXT = "Archivo", "Source Sans 3"


def T(id_, content, **kw):
    kw.setdefault("family", TEXT)
    kw.setdefault("color", "ink")
    return text_el(id_, content, col=col, **kw)


def R(id_, **kw):
    kw.setdefault("color", "rule")
    return rule_el(id_, col=col, **kw)


def B(id_, **kw):
    kw.setdefault("fill", "grey")
    return box_el(id_, col=col, **kw)


# --- design ------------------------------------------------------------------------


def running_heads() -> dict:
    """The atlas's coloured head band: section name and folio in white."""
    h = 13.0
    return {
        "elements": [
            B("headBand", anchor=at("bleed", "top-left"), height=h + 3, fill="band", pages="body"),
            T("partEven", "{partTitle}", anchor=at("page", "top-left"), offset=(M_OUTER, 4.5), width=150, size_pt=9, family=DISPLAY, weight=700, color="white", textTransform="uppercase", letterSpacing=pt(1.6), parity="even", pages="body", overflow="ellipsis-end"),
            T("folioEven", "{pageNumber}", anchor=at("page", "top-right"), offset=(-M_INNER, 4.5), size_pt=9, family=DISPLAY, weight=700, color="white", align="right", parity="even", pages="body", overflow="ellipsis-end"),
            T("folioOdd", "{pageNumber}", anchor=at("page", "top-left"), offset=(M_INNER, 4.5), size_pt=9, family=DISPLAY, weight=700, color="white", parity="odd", pages="body", overflow="ellipsis-end"),
            T("partOdd", "{partTitle}", anchor=at("page", "top-right"), offset=(-M_OUTER, 4.5), width=150, size_pt=9, family=DISPLAY, weight=700, color="white", align="right", textTransform="uppercase", letterSpacing=pt(1.6), parity="odd", pages="body", overflow="ellipsis-end"),
            T("bookEven", "{title}", anchor=at("page", "top-left"), offset=(M_OUTER, M_TOP - 9), width=120, size_pt=7.5, family=DISPLAY, color="muted", textTransform="uppercase", letterSpacing=pt(1.4), parity="even", pages="body", overflow="ellipsis-end"),
            T("chapterOdd", "{chapterTitle}", anchor=at("page", "top-right"), offset=(-M_OUTER, M_TOP - 9), width=160, size_pt=7.5, family=DISPLAY, color="muted", align="right", textTransform="uppercase", letterSpacing=pt(1.4), parity="odd", pages="body", overflow="ellipsis-end"),
        ]
    }


def opener_footer() -> dict:
    return {"elements": [T("folioOpener", "{pageNumber}", anchor=at("page", "bottom"), offset=(0, -(M_BOTTOM - 9)), width=30, size_pt=9, family=DISPLAY, weight=700, align="center", pages="opener", overflow="ellipsis-end")]}


def lead_element(anchor: dict, offset: tuple[float, float], width: float) -> dict:
    return T("lead", "{attr.lead}", anchor=anchor, offset=offset, width=width, size_pt=11, line_height=1.4, hyphenate=True,
             dropCap={"lines": 3, "fontFamily": DISPLAY, "fontWeight": 900, "color": col("band"), "gap": mm(1.5)})


def chapter_opener() -> dict:
    w = (TEXT_W - GUTTER) / 2 * 1.35
    return {
        "enabled": True,
        "minHeight": mm(78),
        "slot": {
            "elements": [
                B("openerBand", anchor=at("bleed", "top-left"), height=16, fill="band"),
                T("kicker", "{partTitle}", anchor=at("container", "top-left"), offset=(0, 4), width=TEXT_W, size_pt=9, family=DISPLAY, weight=700, color="band", textTransform="uppercase", letterSpacing=pt(2)),
                T("chapterTitle", "{titleText}", anchor=at("#kicker", "below"), offset=(0, 3), width=w, size_pt=44, family=DISPLAY, weight=900, line_height=1.0),
                R("chapterRule", anchor=at("#chapterTitle", "below"), offset=(0, 6), width=40, color="band", thickness=2),
                lead_element(at("#chapterRule", "below"), (0, 6), w),
            ]
        },
    }


def front_opener(*, lead: bool) -> dict:
    els = [
        T("frontTitle", "{titleText}", anchor=at("container", "top-left"), offset=(0, 6), width=TEXT_W, size_pt=32, family=DISPLAY, weight=900, line_height=1.05),
        R("frontRule", anchor=at("#frontTitle", "below"), offset=(0, 6), width=40, color="band", thickness=2),
    ]
    if lead:
        els.append(lead_element(at("#frontRule", "below"), (0, 6), (TEXT_W - GUTTER) / 2 * 1.35))
    return {"enabled": True, "minHeight": mm(64 if lead else 40), "slot": {"elements": els}}


def cover_design(cover_resource: str, aspect: float) -> dict:
    img_w = TEXT_W
    img_h = round(img_w / aspect, 1)
    return {
        "enabled": True,
        "minHeight": mm(PAGE_H),
        "slot": {
            "elements": [
                B("coverBg", anchor=at("bleed", "top-left"), fill="paper"),
                B("coverBand", anchor=at("bleed", "top-left"), height=22, fill="band"),
                T("coverSeries", "{attr.series}", anchor=at("page", "top-left"), offset=(M_INNER, 7), width=TEXT_W, size_pt=9, family=DISPLAY, weight=700, color="white", textTransform="uppercase", letterSpacing=pt(2)),
                T("coverTitle", "{title}", anchor=at("page", "top-left"), offset=(M_INNER, 44), width=TEXT_W, size_pt=66, family=DISPLAY, weight=900, line_height=0.98),
                T("coverSubtitle", "{subtitle}", anchor=at("#coverTitle", "below"), offset=(0, 5), width=TEXT_W, size_pt=22, family=DISPLAY, weight=500, color="band"),
                image_el("coverMap", cover_resource, anchor=at("page", "top-left"), offset=(M_INNER, 118), width=img_w, height=min(img_h, 210)),
                T("coverPublisher", "{attr.publisher}", anchor=at("page", "bottom-left"), offset=(M_INNER, -16), width=TEXT_W, size_pt=8.5, family=DISPLAY, color="muted", textTransform="uppercase", letterSpacing=pt(1.4)),
            ]
        },
    }


def part_design(label: str) -> dict:
    return {
        "elements": [
            B("partBg", anchor=at("bleed", "top-left"), fill="band"),
            T("partLabel", label, anchor=at("page", "top-left"), offset=(M_INNER, 70), width=TEXT_W, size_pt=11, family=DISPLAY, weight=700, color="white", textTransform="uppercase", letterSpacing=pt(2.5)),
            T("partNumber", "{number}", anchor=at("#partLabel", "below"), offset=(0, 4), width=TEXT_W, size_pt=110, family=DISPLAY, weight=900, line_height=1.0, color="white"),
            T("partTitle", "{titleText}", anchor=at("#partNumber", "below"), offset=(0, 6), width=TEXT_W, size_pt=48, family=DISPLAY, weight=900, line_height=1.02, color="white"),
        ]
    }


def resource_types(lang: str) -> list[dict]:
    mp, mps, mshort = ed.BOOK[lang]["map"]
    fg, fgs, fshort = ed.BOOK[lang]["figure"]
    return [
        {"id": "map", "name": mp, "namePlural": mps, "shortLabel": mshort, "captionPrefix": mp, "numberingTemplate": "{n}", "resetOn": "never", "counterFormat": "decimal", "defaultPlacement": {"position": "auto", "span": "page", "width": 1}},
        {"id": "figure", "name": fg, "namePlural": fgs, "shortLabel": fshort, "captionPrefix": fg, "numberingTemplate": "{n}", "resetOn": "never", "counterFormat": "decimal", "defaultPlacement": {"position": "auto", "span": "column", "width": 1}},
    ]


def body_text(lang: str) -> dict:
    return {
        "fontFamily": TEXT, "fontSize": pt(10), "lineHeight": pt(13.5), "textAlign": "justify",
        "firstLineIndent": mm(4.5), "indentAfterHeading": False, "paragraphSpacing": False,
        "color": col("ink"), "boldColor": col("ink"), "italicColor": col("ink"),
        "referenceColor": col("band"), "referenceBold": False, "referenceItalic": True,
        "hyphenation": {"enabled": True, "locale": "es" if lang == "es" else "en-us"},
        "avoidWidows": True, "avoidOrphans": True, "optimalLineBreaking": True,
    }


def headings(lang: str) -> dict:
    return {
        "fontFamily": DISPLAY, "color": col("ink"), "keepWithNext": True,
        "levels": [
            {"level": 1, "fontSize": pt(24), "lineHeight": pt(28), "span": "page", "breakBefore": {"enabled": True, "parity": "any"}, "advancedDesign": chapter_opener()},
            {"level": 2, "fontSize": pt(15), "lineHeight": pt(18), "fontWeight": 700, "color": col("band"), "marginTop": pt(16), "marginBottom": pt(5)},
        ],
    }


def parts(lang: str) -> dict:
    return {
        "breakBefore": {"parity": "odd"},
        "breakAfter": {"enabled": True, "parity": "any"},
        "margins": {"top": mm(230), "bottom": mm(30), "left": mm(M_INNER), "right": mm(80)},
        "design": part_design(ed.BOOK[lang]["part_label"]),
        "bodyStyle": {
            "fontFamily": TEXT, "fontSize": pt(11.5), "lineHeight": pt(16), "color": col("white"), "textAlign": "left", "numberColor": col("white"),
            "orderedLists": {"numberFormat": "arabic", "separator": "", "gap": mm(3), "indent": mm(9), "fontFamily": DISPLAY, "numberFontSize": pt(9), "itemSpacing": pt(2)},
        },
    }


def toc_config() -> dict:
    return {
        "levels": [
            {"level": 1, "fontFamily": DISPLAY, "fontSize": pt(12), "lineHeight": pt(17), "fontWeight": 700, "color": col("ink"), "numberWidth": mm(10), "numberGap": mm(2), "numberFontFamily": DISPLAY, "numberFontSize": pt(10), "numberColor": col("band"), "marginTop": pt(6)},
            {"level": 2, "fontFamily": TEXT, "fontSize": pt(10.5), "lineHeight": pt(15), "color": col("ink"), "indent": mm(12), "numberWidth": mm(0), "numberGap": mm(0), "marginTop": pt(1)},
        ],
        "unnumbered": {"fontFamily": TEXT, "italic": True, "color": col("ink")},
        "pageNumber": {"fontFamily": DISPLAY, "fontSize": pt(9.5), "fontWeight": 700, "color": col("ink"), "width": mm(10)},
        "leader": {"enabled": True, "char": ".", "gap": mm(1.2)},
        "parts": {
            "enabled": True, "height": pt(20), "marginTop": pt(18), "marginBottom": pt(4),
            "design": {"elements": [
                B("tocPartBand", anchor=at("container", "left"), offset=(0, 0), width=6, height=6, fill="band"),
                T("tocPart", "{titleText}", anchor=at("#tocPartBand", "right-of"), offset=(3, 0), width=160, size_pt=9.5, family=DISPLAY, weight=700, textTransform="uppercase", letterSpacing=pt(2), color="band"),
            ]},
        },
    }


def heading_styles(cover_resource: str, aspect: float) -> list[dict]:
    empty = {"elements": []}
    return [
        {"id": "portada", "name": "Portada", "numbered": False, "toc": False, "span": "page", "breakBefore": {"enabled": True, "parity": "odd"}, "advancedDesign": cover_design(cover_resource, aspect), "header": empty, "footer": empty, "layout": {"layoutType": "single"}, "margins": {"top": mm(PAGE_H - 95), "bottom": mm(M_BOTTOM), "left": mm(PAGE_W - M_OUTER - 95), "right": mm(M_OUTER)}},
        {"id": "preliminar", "name": "Preliminar", "numbered": False, "span": "page", "breakBefore": {"enabled": True, "parity": "odd"}, "advancedDesign": front_opener(lead=True)},
        {"id": "indice", "name": "Índice", "numbered": False, "toc": False, "span": "page", "breakBefore": {"enabled": True, "parity": "any"}, "advancedDesign": front_opener(lead=False), "layout": {"layoutType": "single"}},
    ]


def paragraph_styles() -> list[dict]:
    return [
        {"id": "colofon", "name": "Colofón", "fontSize": pt(8.5), "lineHeight": pt(11.5), "textAlign": "left", "firstLineIndent": mm(0), "spaceBetween": pt(6), "color": col("muted")},
        {"id": "fuente", "name": "Fuente", "fontFamily": DISPLAY, "fontSize": pt(7.5), "lineHeight": pt(10), "textAlign": "left", "firstLineIndent": mm(0), "spaceBetween": pt(4), "marginTop": pt(14), "color": col("muted")},
        {"id": "creditos", "name": "Créditos", "fontSize": pt(10), "lineHeight": pt(13.5), "textAlign": "left", "firstLineIndent": mm(0), "spaceBetween": pt(6)},
    ]


def shared_config(cover_resource: str, aspect: float) -> dict:
    return {
        "locale": "es",
        "page": {"sizePreset": "custom", "width": mm(PAGE_W), "height": mm(PAGE_H), "dpi": PAGE_DPI, "margins": {"top": mm(M_TOP), "bottom": mm(M_BOTTOM), "left": mm(M_INNER), "right": mm(M_OUTER), "mirror": True}, "baselineGrid": {"enabled": False}, "pageNumbering": {"format": "decimal", "startAt": 1}},
        "layout": {"layoutType": "double", "gutterWidth": mm(GUTTER)},
        "bodyText": body_text("es"),
        "headings": headings("es"),
        "headingStyles": heading_styles(cover_resource, aspect),
        "paragraphStyles": paragraph_styles(),
        "parts": parts("es"),
        "toc": toc_config(),
        "header": running_heads(),
        "footer": opener_footer(),
        "captionStyle": {"fontFamily": DISPLAY, "fontSize": pt(8), "color": col("ink"), "align": "left", "gap": mm(1.8), "labelBold": True, "labelColor": col("band"), "descriptionItalic": False, "note": {"fontSize": pt(6.5), "color": col("muted"), "italic": False, "gap": mm(0.6)}},
        "unorderedLists": {"bulletChar": "•", "color": col("band")},
        "orderedLists": {"color": col("band")},
        "colorPalette": COLOR_PALETTE,
        "resourceTypes": resource_types("es"),
        "pdfGeneration": {"outlines": True},
    }


def localized_config(lang: str) -> dict:
    return {"locale": "es" if lang == "es" else "en-us", "bodyText": body_text(lang), "headings": headings(lang), "parts": parts(lang), "resourceTypes": resource_types(lang)}


# --- text helpers --------------------------------------------------------------------


def title_case(title: str, lang: str) -> str:
    words = title.replace("  ", " ").split(" ")
    out = []
    for i, w in enumerate(words):
        core = w.strip("().,;:")
        if core in ed.KEEP_UPPER or (core.isupper() and len(core) <= 3 and core.isalpha() and i > 0 and core in ed.KEEP_UPPER):
            out.append(w)
            continue
        lw = w.lower()
        if i > 0 and lw.strip("().,;:") in ed.SMALL_WORDS[lang] and not words[i - 1].endswith((".", ":")):
            out.append(lw)
        else:
            out.append(lw[:1].upper() + lw[1:])
    s = " ".join(out)
    s = re.sub(r"\(([a-z])", lambda m: "(" + m.group(1).upper(), s)
    return s


SENTENCE_END = re.compile(r"(?<=[.!?…»”)])\s+")


def split_lead(paragraph: str, target: int = 260) -> tuple[str, str]:
    """First sentence(s) of a paragraph, up to about `target` characters. A
    period inside an italic run (a book title such as *Spain in maps. A
    geographical synthesis*) is not a sentence end."""
    sentences: list[str] = []
    for s in SENTENCE_END.split(paragraph):
        if sentences and sentences[-1].count("*") % 2:
            sentences[-1] += " " + s
        else:
            sentences.append(s)
    lead, length = [], 0
    for s in sentences:
        if lead and length + len(s) > target:
            break
        lead.append(s)
        length += len(s) + 1
    return " ".join(lead).strip(), " ".join(sentences[len(lead):]).strip()


def md(p: str) -> str:
    return p.replace("_", "\\_")


# --- figures ------------------------------------------------------------------------


def render_figures(lang: str, ex: extract.Extraction, doc) -> tuple[list[dict], dict[str, list[dict]]]:
    """Rasterise the maps and pull the photographs of one edition; returns
    the resource specs and, per page, the ids in page order."""
    os.makedirs(os.path.join(OUT, "resources"), exist_ok=True)
    specs: list[dict] = []
    by_page: dict[int, list[dict]] = {}
    counters: dict[int, int] = {}
    for f in sorted(ex.figures, key=lambda f: (f.page, f.box.x0 > doc[f.page - 1].rect.width / 2, f.y)):
        k = counters.get(f.page, 0)
        counters[f.page] = k + 1
        page = doc[f.page - 1]
        if f.kind == "map":
            rid = f"map-{lang}-{f.page:02d}-{k}"
            pix = page.get_pixmap(clip=f.box, dpi=MAP_DPI)
            im = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
            if max(im.size) > MAP_MAX_PX:
                im.thumbnail((MAP_MAX_PX, MAP_MAX_PX), Image.LANCZOS)
            rel = f"resources/{rid}.jpg"
            im.save(os.path.join(OUT, rel), quality=MAP_QUALITY, optimize=True, progressive=True)
            landscape = f.box.width / f.box.height > 1.15
            spec = {"id": rid, "typeId": "map", "kind": "bitmap", "file": rel, "width": im.width, "height": im.height,
                    "caption": title_case(f.title, lang), "note": ed.BOOK[lang]["map_note"], "altText": title_case(f.title, lang),
                    "placement": {"position": "auto", "span": "page" if landscape else "column", "width": 1 if landscape else 1}}
        else:
            rid = f"photo-{f.page:02d}-{k}"  # photographs are the same in both editions
            rel = f"resources/{rid}.jpg"
            if not os.path.exists(os.path.join(OUT, rel)):
                pix = page.get_pixmap(clip=f.box, dpi=220)
                im = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
                if max(im.size) > 2000:
                    im.thumbnail((2000, 2000), Image.LANCZOS)
                im.save(os.path.join(OUT, rel), quality=82, optimize=True, progressive=True)
            im = Image.open(os.path.join(OUT, rel))
            spec = {"id": rid, "typeId": "figure", "kind": "bitmap", "file": rel, "width": im.width, "height": im.height,
                    "caption": f.title, "note": ed.BOOK[lang]["photo_note"], "altText": f.title,
                    "placement": {"position": "auto", "span": "column", "width": 0.9 if f.box.width < f.box.height else 1, "align": "center"}}
        specs.append(spec)
        by_page.setdefault(f.page, []).append(spec)
    return specs, by_page


# --- chapters ------------------------------------------------------------------------


def era_index(part_name: str) -> int:
    for i, p in enumerate(ed.PARTS):
        if part_name in (p["es"], p["en"]):
            return i
    raise KeyError(part_name)


def write_chapters(lang: str, ex: extract.Extraction, by_page: dict[int, list[dict]]) -> list[dict]:
    book = ed.BOOK[lang]
    d = os.path.join(OUT, "chapters", lang)
    os.makedirs(d, exist_ok=True)
    specs: list[dict] = []
    n_file = 0

    def emit(slug: str, title: str, body: str) -> None:
        nonlocal n_file
        rel = f"chapters/{lang}/{n_file:02d}-{slug}.md"
        with open(os.path.join(OUT, rel), "w", encoding="utf-8") as f:
            f.write(body)
        specs.append({"title": title, "file": rel})
        n_file += 1

    emit("portada", book["title"], (
        f'---\ntitle: "{book["title"]}"\nsubtitle: "{book["subtitle"]}"\n---\n\n'
        f'# {book["title"]} {{style="portada" toc="false" series="{attr_value(book["series"])}" publisher="{attr_value(book["publisher"])}"}}\n\n'
        f':::pagebreak\n\n:::paragraphs{{style="colofon"}}\n{ed.COVER_BLURB[lang]}\n:::\n'
    ))
    lead, rest = split_lead(book["intro_text"][0])
    intro = [f'# {book["intro"]} {{style="preliminar" lead="{attr_value(lead)}"}}', "", rest + "\n"] + [t + "\n" for t in book["intro_text"][1:]]
    emit("introduccion" if lang == "es" else "introduction", book["intro"], "\n".join(intro))
    emit("indice" if lang == "es" else "contents", book["contents"], f'# {book["contents"]} {{style="indice" toc="false"}}\n\n:::toc\n')

    # Split the extraction into eras.
    eras: list[tuple[str, list[extract.Block]]] = []
    for b in ex.blocks:
        if b.kind == "part":
            if not eras or eras[-1][0] != b.text:
                if eras and eras[-1][0] == ed.PARTS[0][lang] and b.text == ed.PARTS[0][lang]:
                    continue
                eras.append((b.text, []))
        elif eras:
            eras[-1][1].append(b)
        else:
            eras.append((ed.PARTS[0][lang], [b]))
    merged: list[tuple[str, list[extract.Block]]] = []
    for name, blocks in eras:
        if merged and merged[-1][0] == name:
            merged[-1][1].extend(blocks)
        else:
            merged.append((name, list(blocks)))
    eras = merged
    # Figures are attached to the first paragraph of their page.
    used_pages: set[int] = set()
    first = True
    for name, blocks in eras:
        i = era_index(name)
        part = ed.PARTS[i]
        heads = [b.text for b in blocks if b.kind == "heading"]
        head = ""
        if first:
            head += ':::numbering{format="decimal" startAt=1}\n\n'
            first = False
        items = "\n".join(f"{j + 1}. {h}" for j, h in enumerate(heads))
        head += f':::part{{number="{part["number"]}" title="{attr_value(part[lang])}" palette="band={part["band"]}"}}\n{items}\n:::\n\n'
        paras = [b for b in blocks if b.kind == "paragraph"]
        lead, rest = split_lead(paras[0].text) if paras else ("", "")
        out = [head + f'# {part[lang]} {{lead="{attr_value(lead)}"}}', ""]
        first_para = True
        for b in blocks:
            if b.kind == "heading":
                out.append(f"## {b.text}\n")
                continue
            if b.kind != "paragraph":
                continue
            text = rest if first_para else b.text
            first_para = False
            if not text:
                continue
            refs = []
            for pg in range(b.page, b.page + 1):
                if pg not in used_pages and pg in by_page:
                    used_pages.add(pg)
                    refs += [s["id"] for s in by_page[pg]]
            para = md(text) + "".join(f' (:ref{{id="{r}" case="lower"}})' for r in refs)
            out.append(para + "\n")
        # figures on pages with no paragraph of their own
        leftovers = [s["id"] for pg, ss in sorted(by_page.items()) if pg not in used_pages and any(bb.page == pg for bb in blocks) for s in ss]
        for pg in list(by_page):
            if any(bb.page == pg for bb in blocks):
                used_pages.add(pg)
        if leftovers:
            out.append(" ".join(f':ref{{id="{r}" case="lower"}}' for r in leftovers) + "\n")
        out.append(f':::paragraphs{{style="fuente"}}\n{book["source_line"]}\n:::\n')
        slug = unicodedata.normalize("NFKD", part[lang].lower()).encode("ascii", "ignore").decode()
        emit(f"{i + 1:02d}-" + re.sub(r"[^a-z0-9]+", "-", slug).strip("-"), part[lang], "\n".join(out))

    paras = "\n\n".join(ed.CREDITS[lang])
    emit("creditos" if lang == "es" else "credits", book["credits"], f'# {book["credits"]} {{style="preliminar"}}\n\n:::paragraphs{{style="creditos"}}\n{paras}\n:::\n')
    return specs


# --- fonts -------------------------------------------------------------------------


def build_fonts() -> list[dict]:
    fonts_dir = os.path.join(OUT, "fonts")
    os.makedirs(fonts_dir, exist_ok=True)
    fam: dict[str, list[dict]] = {TEXT: [], DISPLAY: []}
    src = lambda r: os.path.join(SOURCE, "fonts", r)  # noqa: E731
    for w in (400, 600, 700):
        fam[TEXT].append({"weight": w, "style": "normal", "file": "fonts/" + instance_font(src("sourcesans3/SourceSans3[wght].ttf"), fonts_dir, "SourceSans3", {}, w, False)})
    for w in (400, 700):
        fam[TEXT].append({"weight": w, "style": "italic", "file": "fonts/" + instance_font(src("sourcesans3/SourceSans3-Italic[wght].ttf"), fonts_dir, "SourceSans3", {}, w, True)})
    ar = {"wdth": 88}
    for w in (500, 700, 900):
        fam[DISPLAY].append({"weight": w, "style": "normal", "file": "fonts/" + instance_font(src("archivo/Archivo[wdth,wght].ttf"), fonts_dir, "Archivo", ar, w, False)})
    copy_licences(os.path.join(SOURCE, "fonts"), fonts_dir, {"sourcesans3": "SourceSans3-OFL.txt", "archivo": "Archivo-OFL.txt"})
    return [{"name": n, "variants": v} for n, v in fam.items()]


# --- credits & manifest -----------------------------------------------------------


def write_credits_md(counts: dict) -> None:
    body = f"""# Credits — España en mapas

Showcase preset for the Postext sandbox, built from the Atlas Nacional de
España (IGN / CNIG), chapter *Referencias históricas* (2023) and its English
edition *Historical overview* (2024):

- https://www.ign.es/web/resources/docs/IGNCnig/ANE/Capitulos/06_Referenciashistoricas_2023.pdf
- https://www.ign.es/web/resources/docs/IGNCnig/ANE/Capitulos/06_Historicaloverview_2024.pdf

Licence printed on the atlas's credits page: **CC BY 4.0 ign.es** (Creative
Commons Attribution 4.0 International; Orden FOM/2807/2015). Required
attribution: "Atlas Nacional de España (ANE) CC BY 4.0 ign.es".

## What the bundle contains

- Body text, section headings and photo captions extracted by role from the
  InDesign PDFs (`extract.py`); indices, bibliography and participants left out.
- Maps: {counts['maps_es']} (Spanish) and {counts['maps_en']} (English) vector maps rasterised
  as crops of the original pages at {MAP_DPI} dpi, each keeping its scientific
  compilation and source line. {counts['photos']} photographs pulled from the pages.
- Wording written for the preset (introduction, credits, part numbers) is CC BY 4.0.

## Fonts (SIL Open Font License 1.1)

- Source Sans 3 — Paul D. Hunt, Adobe (`fonts/SourceSans3-OFL.txt`)
- Archivo — Omnibus-Type (`fonts/Archivo-OFL.txt`)

## Build

`scripts/presets/showcase/espana-en-mapas/` in the Postext repository:
`fetch.py` downloads the two PDFs and the fonts, `build.py` writes this bundle.
"""
    with open(os.path.join(OUT, "CREDITS.md"), "w", encoding="utf-8") as f:
        f.write(body)


def write_manifest(chapters, resources, wording, fonts, cover_resource, aspect) -> dict:
    meta = {
        "id": PRESET_ID,
        "name": "España en mapas · Atlas Nacional",
        "description": "Capítulo de historia del Atlas Nacional de España a dos columnas con mapas a página · The National Atlas of Spain history chapter, two columns with page-wide maps",
        "locale": "es",
        "locales": ["es", "en"],
        "thumbnail": "thumbnail.jpg",
        "license": "CC BY 4.0 ign.es",
        "credits": "Instituto Geográfico Nacional · Atlas Nacional de España",
        "tags": ["atlas", "two-column", "maps", "parts"],
    }
    manifest = {
        "version": 2, **meta, "chapters": chapters, "config": shared_config(cover_resource, aspect),
        "localized": {lang: {"config": localized_config(lang), "resources": wording[lang]} for lang in LANGS},
        "resources": resources, "fonts": fonts,
    }
    with open(os.path.join(OUT, "preset.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=1, ensure_ascii=False)
        f.write("\n")
    return meta


def main() -> None:
    for lang, name in PDFS.items():
        if not os.path.exists(os.path.join(SOURCE, name)):
            raise SystemExit("run fetch.py first")
    for sub in ("chapters", "resources"):
        shutil.rmtree(os.path.join(OUT, sub), ignore_errors=True)
    os.makedirs(OUT, exist_ok=True)
    resources: list[dict] = []
    wording: dict[str, list[dict]] = {lang: [] for lang in LANGS}
    chapters: dict[str, list[dict]] = {}
    counts = {"photos": 0}
    photo_specs: dict[str, dict] = {}
    for lang in LANGS:
        doc = fitz.open(os.path.join(SOURCE, PDFS[lang]))
        first, last = ed.PAGES[lang]
        ex = extract.extract(os.path.join(SOURCE, PDFS[lang]), first, last, indents=ed.INDENTS[lang])
        specs, by_page = render_figures(lang, ex, doc)
        for s in specs:
            if s["typeId"] == "map":
                resources.append(s)
            else:
                # one shared photograph, captions per locale
                if s["id"] not in photo_specs:
                    photo_specs[s["id"]] = s
                    resources.append(s)
                wording[lang].append({"id": s["id"], "caption": s["caption"], "note": s["note"], "altText": s["altText"]})
        counts[f"maps_{lang}"] = sum(1 for s in specs if s["typeId"] == "map")
        chapters[lang] = write_chapters(lang, ex, by_page)
    counts["photos"] = len(photo_specs)
    # Cover: the largest Spanish map.
    maps_es = [r for r in resources if r["id"].startswith("map-es-")]
    cover = next((r for r in maps_es if "COLÓN" in r["altText"].upper()), None) \
        or max(maps_es, key=lambda r: r["width"] * r["height"] if r["width"] > r["height"] else 0)
    fonts = build_fonts()
    write_credits_md(counts)
    meta = write_manifest(chapters, resources, wording, fonts, cover["id"], cover["width"] / cover["height"])
    copy_thumbnail(HERE, OUT)
    write_fingerprint(OUT)
    register(PRESET_ID, meta)
    print(f"wrote {OUT}  ({bundle_size(OUT):.1f} MB, {len(resources)} resources, {sum(len(v) for v in chapters.values())} chapter files; maps es/en {counts['maps_es']}/{counts['maps_en']}, photos {counts['photos']})")


if __name__ == "__main__":
    main()
