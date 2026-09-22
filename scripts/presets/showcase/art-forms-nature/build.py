#!/usr/bin/env python3
"""Build the `art-forms-nature` showcase preset bundle from `source/` (see
fetch.py) into `apps/web/public/presets/art-forms-nature/` and register it
in the public `index.json`.

    python3 scripts/presets/showcase/art-forms-nature/fetch.py   # once
    python3 scripts/presets/showcase/art-forms-nature/build.py

Twelve of Haeckel's plates, each with a Wikipedia essay (CC BY-SA 4.0), a
fact file in the outer column, a detail with its caption set beside it,
grouped in four parts with their own band colour. Bilingual: one design,
Spanish and English chapter lists, per-locale wording in `localized`.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))
import editorial as ed  # noqa: E402
import wiki  # noqa: E402
from _common import (  # noqa: E402
    PRESETS_ROOT, at, attr_value, box_el, bundle_size, copy_licences, copy_thumbnail, image_el, instance_font,
    make_palette, mm, pt, register, rule_el, text_el, write_fingerprint,
)

SOURCE = os.path.join(HERE, "source")
PRESET_ID = "art-forms-nature"
OUT = os.path.join(PRESETS_ROOT, PRESET_ID)
LANGS = ("es", "en")

# --- geometry & palette ------------------------------------------------------------

PAGE_W, PAGE_H = 210.0, 280.0
M_TOP, M_BOTTOM, M_INNER, M_OUTER = 20.0, 18.0, 20.0, 16.0
TEXT_W = PAGE_W - M_INNER - M_OUTER  # 174
GUTTER = 7.0
SIDE_PERCENT = 30.0
MAIN_W = round((TEXT_W - GUTTER) * (1 - SIDE_PERCENT / 100), 2)  # ≈ 116.9

COLOURS = {
    "ink": "#1f2a2e",
    "paper": "#f4efe3",
    "band": "#3b4a5a",
    "accent": "#8a5a2b",
    "rule": "#b3a898",
    "muted": "#5e6b70",
    "ficha-bg": "#efe9dc",
    "kingdom-protista": "#dfe6ea",
    "kingdom-animalia": "#f3dfd2",
    "kingdom-plantae": "#dfe9d2",
}
NAMES = {
    "ink": "Tinta", "paper": "Papel de portadillas", "band": "Color de parte", "accent": "Bronce de rúbricas",
    "rule": "Filetes", "muted": "Gris de notas", "ficha-bg": "Fondo de fichas",
    "kingdom-protista": "Reino: protistas", "kingdom-animalia": "Reino: animales", "kingdom-plantae": "Reino: plantas",
}
col, COLOR_PALETTE = make_palette(COLOURS, NAMES)

DISPLAY, TEXT, SANS = "Fraunces", "Newsreader", "Archivo"


def T(id_, content, **kw):
    kw.setdefault("family", TEXT)
    kw.setdefault("color", "ink")
    return text_el(id_, content, col=col, **kw)


def R(id_, **kw):
    kw.setdefault("color", "rule")
    return rule_el(id_, col=col, **kw)


def B(id_, **kw):
    kw.setdefault("fill", "paper")
    return box_el(id_, col=col, **kw)


# --- design ------------------------------------------------------------------------


def running_heads() -> dict:
    y = M_TOP - 9.5
    return {
        "elements": [
            T("folioEven", "{pageNumber}", anchor=at("page", "top-left"), offset=(M_OUTER, y), size_pt=8.5, family=SANS, parity="even", pages="body", overflow="ellipsis-end"),
            T("titleEven", "Ernst Haeckel · Kunstformen der Natur", anchor=at("page", "top"), offset=(0, y), width=110, size_pt=7.5, family=SANS, align="center", parity="even", pages="body", overflow="ellipsis-end", textTransform="uppercase", letterSpacing=pt(1.2), color="muted"),
            T("chapterOdd", "{chapterTitle}", anchor=at("page", "top"), offset=(0, y), width=110, size_pt=7.5, family=SANS, align="center", parity="odd", pages="body", overflow="ellipsis-end", textTransform="uppercase", letterSpacing=pt(1.2), color="muted"),
            T("folioOdd", "{pageNumber}", anchor=at("page", "top-right"), offset=(-M_OUTER, y), size_pt=8.5, family=SANS, align="right", parity="odd", pages="body", overflow="ellipsis-end"),
        ]
    }


def opener_footer() -> dict:
    return {
        "elements": [
            T("folioOpener", "{pageNumber}", anchor=at("page", "bottom"), offset=(0, -(M_BOTTOM - 8)), width=30, size_pt=8.5, family=SANS, align="center", pages="opener", overflow="ellipsis-end"),
        ]
    }


def lead_element(anchor: dict, offset: tuple[float, float]) -> dict:
    return T(
        "lead", "{attr.lead}", anchor=anchor, offset=offset, width=MAIN_W, size_pt=10.5, line_height=1.38, hyphenate=True,
        dropCap={"lines": 3, "fontFamily": DISPLAY, "fontWeight": 600, "color": col("band"), "gap": mm(1.6)},
    )


def chapter_opener(label: str) -> dict:
    """Plate chapters: band-coloured label, big Fraunces title, the Latin
    name of the plate in italics, a rule and the lead with a drop cap."""
    return {
        "enabled": True,
        "minHeight": mm(62),
        "slot": {
            "elements": [
                T("chapterLabel", label, anchor=at("container", "top-left"), offset=(0, 4), width=MAIN_W, size_pt=8.5, family=SANS, color="band", textTransform="uppercase", letterSpacing=pt(1.6)),
                T("chapterTitle", "{titleText}", anchor=at("#chapterLabel", "below"), offset=(0, 2), width=MAIN_W, size_pt=32, family=DISPLAY, weight=600, line_height=1.05, color="ink"),
                T("chapterLatin", "{attr.latin} · {attr.german}", anchor=at("#chapterTitle", "below"), offset=(0, 2.5), width=MAIN_W, size_pt=11, italic=True, color="muted"),
                R("chapterRule", anchor=at("#chapterLatin", "below"), offset=(0, 4), width=24, color="band", thickness=1.2),
                lead_element(at("#chapterRule", "below"), (0, 5)),
            ]
        },
    }


def front_opener(*, lead: bool) -> dict:
    elements = [
        T("frontTitle", "{titleText}", anchor=at("container", "top-left"), offset=(0, 6), width=MAIN_W, size_pt=26, family=DISPLAY, weight=600, line_height=1.08),
        R("frontRule", anchor=at("#frontTitle", "below"), offset=(0, 4), width=24, color="band", thickness=1.2),
    ]
    if lead:
        elements.append(lead_element(at("#frontRule", "below"), (0, 5)))
    return {"enabled": True, "minHeight": mm(60 if lead else 34), "slot": {"elements": elements}}


def cover_design() -> dict:
    img_h = 178.0
    img_w = round(img_h * (1938 / 2600), 1)  # Discomedusae plate aspect
    return {
        "enabled": True,
        "minHeight": mm(PAGE_H),
        "slot": {
            "elements": [
                B("coverBg", anchor=at("bleed", "top-left")),
                B("coverBand", anchor=at("bleed", "top-left"), height=14, fill="band"),
                image_el("coverPlate", "plate-08", anchor=at("page", "top"), offset=(0, 26), width=img_w, height=img_h),
                T("coverTitle", "{title}", anchor=at("page", "top-left"), offset=(M_INNER, 212), width=TEXT_W, size_pt=30, family=DISPLAY, weight=600, align="center", line_height=1.05),
                T("coverSubtitle", "{subtitle}", anchor=at("#coverTitle", "below"), offset=(0, 3), width=TEXT_W, size_pt=11, italic=True, align="center", color="muted"),
                T("coverAuthor", "{author} · {attr.edition}", anchor=at("#coverSubtitle", "below"), offset=(0, 6), width=TEXT_W, size_pt=8, family=SANS, align="center", textTransform="uppercase", letterSpacing=pt(1.4), color="band"),
            ]
        },
    }


def part_design(label: str) -> dict:
    return {
        "elements": [
            B("partBg", anchor=at("bleed", "top-left")),
            B("partBand", anchor=at("bleed", "top-left"), width=26, height="fill", fill="band"),
            T("partLabel", label, anchor=at("page", "top-left"), offset=(44, 70), width=140, size_pt=9, family=SANS, textTransform="uppercase", letterSpacing=pt(2), color="band"),
            T("partTitle", "{titleText}", anchor=at("#partLabel", "below"), offset=(0, 4), width=140, size_pt=40, family=DISPLAY, weight=600, line_height=1.02),
            R("partRule", anchor=at("#partTitle", "below"), offset=(0, 8), width=30, color="band", thickness=1.5),
        ]
    }


def callout_styles() -> list[dict]:
    return [
        {
            "id": "ficha",
            "name": "Ficha",
            "span": "side",
            "placement": "here",
            "backgroundEnabled": True,
            "background": col("ficha-bg"),
            "border": {"enabled": False},
            "borderRadius": mm(0),
            "padding": {"top": mm(3), "right": mm(3), "bottom": mm(2.5), "left": mm(3)},
            "stripe": {"enabled": True, "side": "top", "width": pt(2), "color": col("band")},
            "icon": {"kind": "none"},
            "titleStyle": {"fontFamily": SANS, "fontSize": pt(7.5), "fontWeight": 700, "color": col("band"), "textTransform": "uppercase", "letterSpacing": pt(1.4), "gap": mm(1.8)},
            "body": {"fontFamily": TEXT, "fontSize": pt(8.5), "lineHeight": pt(11.5), "color": col("ink"), "boldColor": col("accent"), "textAlign": "left", "hyphenation": False, "paragraphSpacing": True, "firstLineIndent": mm(0)},
            "marginTop": pt(0),
            "marginBottom": pt(10),
            "keepTogether": True,
        },
    ]


def resource_types(lang: str) -> list[dict]:
    fig, figs, figshort = ed.BOOK[lang]["figure"]
    tab, tabs, tabshort = ed.BOOK[lang]["table"]
    return [
        {"id": "plate", "name": "Lámina" if lang == "es" else "Plate", "namePlural": "Láminas" if lang == "es" else "Plates", "shortLabel": "lámina" if lang == "es" else "plate", "captionPrefix": "", "numberingTemplate": "{n}", "resetOn": "never", "counterFormat": "decimal", "defaultPlacement": {"position": "top", "span": "page", "width": 0.86, "align": "center"}},
        {"id": "figure", "name": fig, "namePlural": figs, "shortLabel": figshort, "captionPrefix": fig, "numberingTemplate": "{n}", "resetOn": "never", "counterFormat": "decimal", "defaultPlacement": {"position": "auto", "span": "column", "width": 1, "captionSide": True}},
        {"id": "table", "name": tab, "namePlural": tabs, "shortLabel": tabshort, "captionPrefix": tab, "numberingTemplate": "{n}", "resetOn": "never", "counterFormat": "decimal", "defaultPlacement": {"position": "auto", "span": "page"}, "captionStyle": {"position": "above"}},
    ]


def body_text(lang: str) -> dict:
    return {
        "fontFamily": TEXT,
        "fontSize": pt(10.5),
        "lineHeight": pt(14.5),
        "textAlign": "justify",
        "firstLineIndent": mm(5),
        "indentAfterHeading": False,
        "paragraphSpacing": False,
        "color": col("ink"),
        "boldColor": col("ink"),
        "italicColor": col("ink"),
        "referenceColor": col("accent"),
        "referenceBold": False,
        "referenceItalic": True,
        "hyphenation": {"enabled": True, "locale": "es" if lang == "es" else "en-us"},
        "avoidWidows": True,
        "avoidOrphans": True,
        "optimalLineBreaking": True,
    }


def headings(lang: str) -> dict:
    return {
        "fontFamily": DISPLAY,
        "color": col("ink"),
        "keepWithNext": True,
        "levels": [
            {"level": 1, "fontSize": pt(22), "lineHeight": pt(26), "span": "page", "breakBefore": {"enabled": True, "parity": "any"}, "advancedDesign": chapter_opener(ed.BOOK[lang]["chapter_label"])},
            {"level": 2, "fontSize": pt(13.5), "lineHeight": pt(17), "fontWeight": 600, "marginTop": pt(16), "marginBottom": pt(6)},
            {"level": 3, "fontFamily": TEXT, "fontSize": pt(11), "lineHeight": pt(14.5), "italic": True, "fontWeight": 500, "marginTop": pt(10), "marginBottom": pt(3)},
        ],
    }


def parts(lang: str) -> dict:
    return {
        "breakBefore": {"parity": "odd"},
        "breakAfter": {"enabled": True, "parity": "odd"},
        "margins": {"top": mm(150), "bottom": mm(24), "left": mm(44), "right": mm(30)},
        "design": part_design(ed.BOOK[lang]["part_label"]),
        "bodyStyle": {
            "fontFamily": TEXT,
            "fontSize": pt(10.5),
            "lineHeight": pt(15),
            "color": col("ink"),
            "textAlign": "left",
            "numberColor": col("band"),
            "orderedLists": {"numberFormat": "arabic", "separator": "", "gap": mm(3), "indent": mm(9), "fontFamily": SANS, "numberFontSize": pt(8.5), "itemSpacing": pt(2)},
        },
    }


def toc_config() -> dict:
    return {
        "levels": [
            {"level": 1, "fontFamily": TEXT, "fontSize": pt(11), "lineHeight": pt(16), "color": col("ink"), "numberWidth": mm(9), "numberGap": mm(2), "numberFontFamily": SANS, "numberFontSize": pt(8.5), "numberColor": col("band"), "marginTop": pt(3)},
        ],
        "unnumbered": {"italic": True, "color": col("ink")},
        "pageNumber": {"fontFamily": SANS, "fontSize": pt(9), "color": col("ink"), "width": mm(9)},
        "leader": {"enabled": True, "char": ".", "gap": mm(1.2)},
        "parts": {
            "enabled": True,
            "height": pt(18),
            "marginTop": pt(18),
            "marginBottom": pt(6),
            "design": {
                "elements": [
                    B("tocPartBand", anchor=at("container", "left"), offset=(0, 0), width=4, height=6, fill="band"),
                    T("tocPart", "{titleText}", anchor=at("#tocPartBand", "right-of"), offset=(3, 0), width=150, size_pt=9, family=SANS, textTransform="uppercase", letterSpacing=pt(1.4), color="band"),
                ]
            },
        },
    }


def heading_styles() -> list[dict]:
    empty = {"elements": []}
    return [
        {"id": "portada", "name": "Portada", "numbered": False, "toc": False, "span": "page", "breakBefore": {"enabled": True, "parity": "odd"}, "advancedDesign": cover_design(), "header": empty, "footer": empty, "layout": {"layoutType": "single"}},
        {"id": "preliminar", "name": "Preliminar", "numbered": False, "span": "page", "breakBefore": {"enabled": True, "parity": "odd"}, "advancedDesign": front_opener(lead=True)},
        {"id": "indice", "name": "Índice", "numbered": False, "toc": False, "span": "page", "breakBefore": {"enabled": True, "parity": "odd"}, "advancedDesign": front_opener(lead=False), "layout": {"layoutType": "single"}},
    ]


def paragraph_styles() -> list[dict]:
    return [
        {"id": "colofon", "name": "Colofón", "fontSize": pt(8.5), "lineHeight": pt(11.5), "textAlign": "left", "firstLineIndent": mm(0), "spaceBetween": pt(6), "color": col("muted")},
        {"id": "fuente", "name": "Fuente", "fontFamily": SANS, "fontSize": pt(7.5), "lineHeight": pt(10), "textAlign": "left", "firstLineIndent": mm(0), "spaceBetween": pt(4), "marginTop": pt(14), "color": col("muted")},
        {"id": "creditos", "name": "Créditos", "fontSize": pt(9.5), "lineHeight": pt(13), "textAlign": "left", "firstLineIndent": mm(0), "spaceBetween": pt(6)},
    ]


def shared_config() -> dict:
    return {
        "locale": "es",
        "page": {
            "sizePreset": "custom",
            "width": mm(PAGE_W),
            "height": mm(PAGE_H),
            "margins": {"top": mm(M_TOP), "bottom": mm(M_BOTTOM), "left": mm(M_INNER), "right": mm(M_OUTER), "mirror": True},
            "baselineGrid": {"enabled": False},
            "pageNumbering": {"format": "lower-roman", "startAt": 1},
        },
        "layout": {"layoutType": "oneAndHalf", "gutterWidth": mm(GUTTER), "sideColumnPercent": SIDE_PERCENT, "sideColumnRole": "floats", "sideColumnSide": "outer"},
        "bodyText": body_text("es"),
        "headings": headings("es"),
        "headingStyles": heading_styles(),
        "paragraphStyles": paragraph_styles(),
        "calloutStyles": callout_styles(),
        "parts": parts("es"),
        "toc": toc_config(),
        "header": running_heads(),
        "footer": opener_footer(),
        "captionStyle": {
            "fontFamily": TEXT,
            "fontSize": pt(8.5),
            "color": col("ink"),
            "align": "left",
            "gap": mm(1.8),
            "labelBold": True,
            "labelColor": col("band"),
            "descriptionItalic": False,
            "note": {"fontSize": pt(6.8), "color": col("muted"), "italic": False, "gap": mm(0.8)},
        },
        "tableStyle": {
            "bodyFontFamily": SANS,
            "bodyFontSize": pt(8.5),
            "bodyLineHeight": pt(11),
            "bodyColor": col("ink"),
            "headerFontFamily": SANS,
            "headerFontSize": pt(8),
            "headerBold": True,
            "headerBackgroundEnabled": True,
            "headerBackground": col("ficha-bg"),
            "borderColor": col("rule"),
            "borderWidth": pt(0.5),
            "cellPadding": mm(1.6),
            "rules": "horizontal",
        },
        "unorderedLists": {"bulletChar": "•", "color": col("band")},
        "orderedLists": {"color": col("band")},
        "colorPalette": COLOR_PALETTE,
        "resourceTypes": resource_types("es"),
        "pdfGeneration": {"outlines": True},
    }


def localized_config(lang: str) -> dict:
    return {"locale": "es" if lang == "es" else "en-us", "bodyText": body_text(lang), "headings": headings(lang), "parts": parts(lang), "resourceTypes": resource_types(lang)}


# --- plates ------------------------------------------------------------------------

PLATE_MAX = (2000, 2600)
DETAIL_MAX = 1500


def process_plates(selection: dict) -> dict[int, dict]:
    os.makedirs(os.path.join(OUT, "resources"), exist_ok=True)
    out: dict[int, dict] = {}
    for spec in ed.PLATES:
        n = spec["n"]
        meta = selection[str(n)]
        src = os.path.join(SOURCE, meta["file"] if "file" in meta else f"plates/tafel-{n:03d}.jpg")
        im = Image.open(src).convert("RGB")
        g = im.convert("L")
        small = g.resize((max(1, g.width // 8), max(1, g.height // 8)))
        bbox = small.point(lambda v: 255 if v > 110 else 0).getbbox()
        if bbox:
            l, t, r, b = [v * 8 for v in bbox]
            dx, dy = int(0.012 * (r - l)), int(0.012 * (b - t))
            im = im.crop((l + dx, t + dy, min(im.width, r - dx), min(im.height, b - dy)))
        im.thumbnail(PLATE_MAX, Image.LANCZOS)
        plate_rel = f"resources/plate-{n:02d}.jpg"
        im.save(os.path.join(OUT, plate_rel), quality=82, optimize=True, progressive=True)
        l, t, r, b = spec["detail"]
        det = im.crop((int(l * im.width), int(t * im.height), int(r * im.width), int(b * im.height)))
        if max(det.size) > DETAIL_MAX:
            det.thumbnail((DETAIL_MAX, DETAIL_MAX), Image.LANCZOS)
        detail_rel = f"resources/detail-{n:02d}.jpg"
        det.save(os.path.join(OUT, detail_rel), quality=84, optimize=True, progressive=True)
        out[n] = {**meta, "plate": {"file": plate_rel, "w": im.width, "h": im.height}, "detail": {"file": detail_rel, "w": det.width, "h": det.height}}
    return out


def plates_table(lang: str) -> dict:
    book = ed.BOOK[lang]
    head = [{"content": h, "isHeader": True} for h in book["table_head"]]
    rows = [head]
    for spec in ed.PLATES:
        k = spec["kingdom"]
        bg = {"hex": COLOURS[f"kingdom-{k}"], "model": "hex", "paletteId": f"kingdom-{k}"}
        rows.append([
            {"content": str(spec["n"]), "align": "right"},
            {"content": f"*{spec['latin']}*"},
            {"content": spec["title"][lang]},
            {"content": book["kingdoms"][k], "background": bg},
        ])
    return {"model": {"rows": rows, "headerRowCount": 1, "columnWidths": [0.8, 1.8, 2.2, 1.4]}}


def resource_specs(plates: dict[int, dict]) -> tuple[list[dict], dict[str, list[dict]]]:
    shared: list[dict] = []
    wording: dict[str, list[dict]] = {lang: [] for lang in LANGS}
    for spec in ed.PLATES:
        n = spec["n"]
        p = plates[n]
        pid, did = f"plate-{n:02d}", f"detail-{n:02d}"
        shared.append({"id": pid, "typeId": "plate", "kind": "bitmap", "file": p["plate"]["file"], "width": p["plate"]["w"], "height": p["plate"]["h"], "caption": spec["caption"]["es"], "note": ed.PLATE_NOTE["es"].format(n=n), "altText": spec["caption"]["es"]})
        shared.append({"id": did, "typeId": "figure", "kind": "bitmap", "file": p["detail"]["file"], "width": p["detail"]["w"], "height": p["detail"]["h"], "caption": spec["detail_caption"]["es"], "altText": spec["detail_caption"]["es"], "placement": {"position": "auto", "span": "column", "width": 1, "captionSide": True}})
        for lang in LANGS:
            wording[lang].append({"id": pid, "caption": spec["caption"][lang], "note": ed.PLATE_NOTE[lang].format(n=n), "altText": spec["caption"][lang]})
            wording[lang].append({"id": did, "caption": spec["detail_caption"][lang], "altText": spec["detail_caption"][lang]})
    shared.append({"id": "plates-table", "typeId": "table", "kind": "table", "caption": ed.BOOK["es"]["plates_table_caption"], "table": plates_table("es")})
    for lang in LANGS:
        wording[lang].append({"id": "plates-table", "caption": ed.BOOK[lang]["plates_table_caption"], "table": plates_table(lang)})
    return shared, wording


# --- fonts -------------------------------------------------------------------------


def build_fonts() -> list[dict]:
    fonts_dir = os.path.join(OUT, "fonts")
    os.makedirs(fonts_dir, exist_ok=True)
    fam: dict[str, list[dict]] = {DISPLAY: [], TEXT: [], SANS: []}
    src = lambda rel: os.path.join(SOURCE, "fonts", rel)  # noqa: E731
    fr = {"opsz": 72, "WONK": 1, "SOFT": 40}
    for w in (400, 600, 700):
        fam[DISPLAY].append({"weight": w, "style": "normal", "file": "fonts/" + instance_font(src("fraunces/Fraunces[SOFT,WONK,opsz,wght].ttf"), fonts_dir, "Fraunces", fr, w, False)})
    fam[DISPLAY].append({"weight": 400, "style": "italic", "file": "fonts/" + instance_font(src("fraunces/Fraunces-Italic[SOFT,WONK,opsz,wght].ttf"), fonts_dir, "Fraunces", fr, 400, True)})
    nr = {"opsz": 16}
    for w in (400, 500, 700):
        fam[TEXT].append({"weight": w, "style": "normal", "file": "fonts/" + instance_font(src("newsreader/Newsreader[opsz,wght].ttf"), fonts_dir, "Newsreader", nr, w, False)})
    for w in (400, 700):
        fam[TEXT].append({"weight": w, "style": "italic", "file": "fonts/" + instance_font(src("newsreader/Newsreader-Italic[opsz,wght].ttf"), fonts_dir, "Newsreader", nr, w, True)})
    ar = {"wdth": 90}
    for w in (400, 500, 700):
        fam[SANS].append({"weight": w, "style": "normal", "file": "fonts/" + instance_font(src("archivo/Archivo[wdth,wght].ttf"), fonts_dir, "Archivo", ar, w, False)})
    fam[SANS].append({"weight": 400, "style": "italic", "file": "fonts/" + instance_font(src("archivo/Archivo-Italic[wdth,wght].ttf"), fonts_dir, "Archivo", ar, 400, True)})
    copy_licences(os.path.join(SOURCE, "fonts"), fonts_dir, {"fraunces": "Fraunces-OFL.txt", "newsreader": "Newsreader-OFL.txt", "archivo": "Archivo-OFL.txt"})
    return [{"name": n, "variants": v} for n, v in fam.items()]


# --- chapters ------------------------------------------------------------------------

SENTENCE_END = re.compile(r"(?<=[.!?…»”)])\s+")


def split_lead(paragraph: str, target: int = 240) -> tuple[str, str]:
    sentences = SENTENCE_END.split(paragraph)
    lead: list[str] = []
    length = 0
    for s in sentences:
        if lead and length + len(s) > target:
            break
        lead.append(s)
        length += len(s) + 1
    return " ".join(lead).strip(), " ".join(sentences[len(lead):]).strip()


def source_line(lang: str, article: dict) -> str:
    date = article["timestamp"][:10]
    title = article["title"]
    oldid = f"{article['url']}?oldid={article['revid']}"
    line = ed.BOOK[lang]["source_line"].format(title=title, date=date)
    return f':::paragraphs{{style="fuente"}}\n{line} [{title}]({oldid})\n:::\n'


def essay(lang: str, article: dict, budget: int) -> tuple[str, list[str]]:
    """(lead, remaining markdown blocks) from a Wikipedia extract."""
    blocks, _ = wiki.to_markdown(article["extract"], budget)
    first = next((i for i, b in enumerate(blocks) if not b.startswith("#")), None)
    if first is None:
        return "", blocks
    lead, rest = split_lead(blocks[first])
    if rest:
        blocks[first] = rest
    else:
        blocks.pop(first)
    return lead, blocks


def ficha_block(lang: str, spec: dict) -> str:
    lines = "\n\n".join(f"**{k}** {v}" for k, v in spec["ficha"][lang])
    return f':::callout{{type="ficha" title="{ed.BOOK[lang]["ficha"]}"}}\n{lines}\n:::'


def write_chapters(extracts: dict) -> dict[str, list[dict]]:
    lists: dict[str, list[dict]] = {}
    for lang in LANGS:
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

        # Cover
        emit("portada", book["title"], (
            f'---\ntitle: "{book["title"]}"\nsubtitle: "{book["subtitle"]}"\nauthor: "{book["author"]}"\n---\n\n'
            f'# {book["title"]} {{style="portada" toc="false" edition="{attr_value(book["edition"])}"}}\n\n'
            f':::pagebreak\n\n:::paragraphs{{style="colofon"}}\n{ed.COVER_BLURB[lang]}\n:::\n'
        ))

        # Introduction: Haeckel, then the book, then the table of plates.
        haeckel = extracts[lang]["Ernst Haeckel"]
        kdn = extracts[lang]["Kunstformen der Natur"]
        lead, h_blocks = essay(lang, haeckel, ed.INTRO_BUDGET["haeckel"])
        _, k_blocks = essay(lang, kdn, ed.INTRO_BUDGET["book"])
        if h_blocks:
            h_blocks[0] += ' (:ref{id="plates-table" case="lower"})'
        intro = [f'# {book["intro"]} {{style="preliminar" lead="{attr_value(lead)}"}}', ""]
        intro += [b + "\n" for b in h_blocks]
        intro += [f"## Kunstformen der Natur\n"] + [b + "\n" for b in k_blocks]
        intro += [source_line(lang, haeckel), source_line(lang, kdn)]
        emit("introduccion" if lang == "es" else "introduction", book["intro"], "\n".join(intro))

        # Contents
        emit("indice" if lang == "es" else "contents", book["contents"], f'# {book["contents"]} {{style="indice" toc="false"}}\n\n:::toc\n')

        # Plates, grouped in parts
        first_plate = True
        for part in ed.PARTS:
            members = [s for s in ed.PLATES if s["part"] == part["id"]]
            for i, spec in enumerate(members):
                article = extracts[lang][spec["wiki"][lang]]
                lead, blocks = essay(lang, article, spec["budget"])
                head = ""
                if first_plate:
                    head += ':::numbering{format="decimal" startAt=1}\n\n'
                    first_plate = False
                if i == 0:
                    items = "\n".join(f"{j + 1}. {m['title'][lang]}" for j, m in enumerate(members))
                    head += f':::part{{number="{part["number"]}" title="{attr_value(part["title"][lang])}" palette="band={part["band"]}"}}\n{items}\n:::\n\n'
                title = spec["title"][lang]
                md = [head + f'# {title} {{plate="{spec["n"]}" latin="{spec["latin"]}" german="{attr_value(spec["german"])}" lead="{attr_value(lead)}"}}', ""]
                paras = [k for k, b in enumerate(blocks) if not b.startswith("#")]
                if paras:
                    blocks[paras[0]] += f' (:ref{{id="plate-{spec["n"]:02d}" case="lower"}})'
                if len(paras) > 1:
                    blocks[paras[1]] += f' (:ref{{id="detail-{spec["n"]:02d}" case="lower"}})'
                for k, b in enumerate(blocks):
                    md.append(b + "\n")
                    if paras and k == paras[0]:
                        md.append(ficha_block(lang, spec) + "\n")
                md.append(source_line(lang, article))
                emit(f"lamina-{spec['n']:02d}" if lang == "es" else f"plate-{spec['n']:02d}", title, "\n".join(md))

        # Credits
        paras = "\n\n".join(ed.CREDITS[lang])
        plate_lines = "\n\n".join(f"{'Lámina' if lang == 'es' else 'Plate'} {s['n']} · *{s['latin']}* — [{PLATES_META[str(s['n'])]['title'][5:].rsplit('.', 1)[0]}]({PLATES_META[str(s['n'])]['page']})" for s in ed.PLATES)
        wiki_lines = "\n\n".join(
            f"[{a['title']}]({a['url']}?oldid={a['revid']}) — {a['timestamp'][:10]}" for a in extracts[lang].values()
        )
        emit("creditos" if lang == "es" else "credits", book["credits"], (
            f'# {book["credits"]} {{style="preliminar"}}\n\n'
            f':::paragraphs{{style="creditos"}}\n{paras}\n\n{plate_lines}\n\n{wiki_lines}\n:::\n'
        ))
        lists[lang] = specs
    return lists


PLATES_META: dict[str, dict] = {}


# --- credits & manifest -----------------------------------------------------------


def write_credits_md(extracts: dict) -> None:
    rows = "\n".join(f"| {s['n']} | *{s['latin']}* | [{PLATES_META[str(s['n'])]['title']}]({PLATES_META[str(s['n'])]['page']}) | {PLATES_META[str(s['n'])]['license']} |" for s in ed.PLATES)
    wrows = "\n".join(
        f"| {lang} | [{a['title']}]({a['url']}?oldid={a['revid']}) | {a['timestamp'][:10]} |"
        for lang in LANGS for a in extracts[lang].values()
    )
    body = f"""# Credits — Art Forms in Nature

Showcase preset for the Postext sandbox. The plates are public domain; the
essays are adapted from Wikipedia and carry its CC BY-SA 4.0 licence, so the
bundle's text is CC BY-SA 4.0. The wording written for the preset (captions,
fact files, part titles, this file) is CC BY 4.0.

## Plates

Ernst Haeckel, *Kunstformen der Natur* (Leipzig & Vienna, Bibliographisches
Institut, 1899–1904), lithographs by Adolf Giltsch. Scans from the Library of
Congress, the Biodiversity Heritage Library and Wikimedia Commons, cropped to
the paper and downscaled; a detail is cut from each plate.

| plate | Haeckel's title | Commons file | tag |
| --- | --- | --- | --- |
{rows}

## Texts (Wikipedia, CC BY-SA 4.0)

| lang | article (revision) | date |
| --- | --- | --- |
{wrows}

## Fonts (SIL Open Font License 1.1)

- Fraunces — Undercase Type (`fonts/Fraunces-OFL.txt`)
- Newsreader — Production Type (`fonts/Newsreader-OFL.txt`)
- Archivo — Omnibus-Type (`fonts/Archivo-OFL.txt`)

Static instances of the variable fonts from https://github.com/google/fonts.

## Build

`scripts/presets/showcase/art-forms-nature/` in the Postext repository:
`fetch.py` downloads the sources, `build.py` writes this bundle.
"""
    with open(os.path.join(OUT, "CREDITS.md"), "w", encoding="utf-8") as f:
        f.write(body)


def write_manifest(chapters: dict, resources: list[dict], wording: dict, fonts: list[dict]) -> dict:
    meta = {
        "id": PRESET_ID,
        "name": "Formas artísticas de la naturaleza · Haeckel",
        "description": "Libro de láminas a columna y media con fichas y pies laterales · A column-and-a-half plate book with fact files and side captions",
        "locale": "es",
        "locales": ["es", "en"],
        "thumbnail": "thumbnail.jpg",
        "license": "Public domain · CC BY-SA 4.0",
        "credits": "Ernst Haeckel · Wikipedia · Library of Congress · Wikimedia Commons",
        "tags": ["plates", "one-and-a-half", "side-captions", "parts"],
    }
    manifest = {
        "version": 2,
        **meta,
        "chapters": chapters,
        "config": shared_config(),
        "localized": {lang: {"config": localized_config(lang), "resources": wording[lang]} for lang in LANGS},
        "resources": resources,
        "fonts": fonts,
    }
    with open(os.path.join(OUT, "preset.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=1, ensure_ascii=False)
        f.write("\n")
    return meta


def main() -> None:
    sel_path = os.path.join(SOURCE, "plates", "selection.json")
    if not os.path.exists(sel_path):
        raise SystemExit("run fetch.py first")
    for sub in ("chapters", "resources"):
        shutil.rmtree(os.path.join(OUT, sub), ignore_errors=True)
    os.makedirs(OUT, exist_ok=True)
    selection = json.load(open(sel_path, encoding="utf-8"))
    PLATES_META.update(selection)
    extracts = json.load(open(os.path.join(SOURCE, "wiki-extracts.json"), encoding="utf-8"))
    plates = process_plates(selection)
    resources, wording = resource_specs(plates)
    fonts = build_fonts()
    chapters = write_chapters(extracts)
    write_credits_md(extracts)
    meta = write_manifest(chapters, resources, wording, fonts)
    copy_thumbnail(HERE, OUT)
    write_fingerprint(OUT)
    register(PRESET_ID, meta)
    print(f"wrote {OUT}  ({bundle_size(OUT):.1f} MB, {len(resources)} resources, {sum(len(v) for v in chapters.values())} chapter files)")


if __name__ == "__main__":
    main()
