#!/usr/bin/env python3
"""Build the `don-quijote` showcase preset bundle from `source/` (see
fetch.py) into `apps/web/public/presets/don-quijote/` and register it in the
public `index.json`.

    python3 scripts/presets/showcase/don-quijote/fetch.py   # once
    python3 scripts/presets/showcase/don-quijote/build.py

The bundle is bilingual: one shared design and one shared set of plates, a
Spanish and an English chapter list, and per-locale wording (captions,
notes, caption prefixes, hyphenation) in the manifest's `localized` map.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import sys

from PIL import Image, ImageOps

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import editorial as ed  # noqa: E402
import gutenberg as g  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "source")
REPO = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
PRESETS_ROOT = os.path.join(REPO, "apps", "web", "public", "presets")
PRESET_ID = "don-quijote"
OUT = os.path.join(PRESETS_ROOT, PRESET_ID)

LANGS = ("es", "en")
# The prologue and the first two of the four parts of the 1605 book.
CHAPTERS = 14

# --- units & colours ----------------------------------------------------------


def mm(v: float) -> dict:
    return {"value": v, "unit": "mm"}


def pt(v: float) -> dict:
    return {"value": v, "unit": "pt"}


PALETTE = {
    "ink": "#1f1a17",
    "accent": "#7f2a26",
    "cream": "#f5f0e6",
    "rule": "#a59a8b",
    "muted": "#6b625a",
}


def col(pid: str) -> dict:
    return {"hex": PALETTE[pid], "model": "hex", "paletteId": pid}


def color_palette() -> list[dict]:
    names = {
        "ink": "Tinta",
        "accent": "Rojo de rúbricas",
        "cream": "Crema de portadillas",
        "rule": "Filetes",
        "muted": "Gris de notas",
    }
    return [{"id": k, "name": names[k], "value": {"hex": v, "model": "hex"}} for k, v in PALETTE.items()]


# --- page geometry ---------------------------------------------------------------

PAGE_W, PAGE_H = 155.0, 235.0
M_TOP, M_BOTTOM, M_INNER, M_OUTER = 22.0, 20.0, 18.0, 15.0
TEXT_W = PAGE_W - M_INNER - M_OUTER  # 122 mm
GUTTER = 6.0
SIDE_PERCENT = 26.0
MAIN_W = round((TEXT_W - GUTTER) * (1 - SIDE_PERCENT / 100), 2)  # ≈ 85.8 mm


# --- design helpers ----------------------------------------------------------


def text(
    id_: str,
    content: str,
    *,
    anchor: dict,
    offset: tuple[float, float] = (0, 0),
    width="auto",
    size: float = 10,
    family: str = "Alegreya",
    weight: int = 400,
    italic: bool = False,
    align: str = "left",
    line_height: float = 1.2,
    color: str = "ink",
    overflow: str = "wrap",
    **extra,
) -> dict:
    el = {
        "kind": "text",
        "id": id_,
        "placement": {
            "anchor": anchor,
            "offset": {"x": mm(offset[0]), "y": mm(offset[1])},
            "size": {"width": width if isinstance(width, str) else mm(width), "height": "auto"},
        },
        "content": content,
        "fontFamily": family,
        "fontSize": pt(size),
        "fontWeight": weight,
        "italic": italic,
        "align": align,
        "verticalAlign": "middle",
        "lineHeight": line_height,
        "overflow": overflow,
        "color": col(color),
    }
    el.update(extra)
    return el


def rule(id_: str, *, anchor: dict, offset: tuple[float, float], width: float, color: str = "rule", thickness: float = 0.5, **extra) -> dict:
    el = {
        "kind": "rule",
        "id": id_,
        "direction": "horizontal",
        "placement": {"anchor": anchor, "offset": {"x": mm(offset[0]), "y": mm(offset[1])}, "size": {"width": mm(width)}},
        "color": col(color),
        "thickness": pt(thickness),
    }
    el.update(extra)
    return el


def box(id_: str, *, anchor: dict, offset=(0, 0), width="fill", height="fill", fill: str = "cream", **extra) -> dict:
    el = {
        "kind": "box",
        "id": id_,
        "placement": {
            "anchor": anchor,
            "offset": {"x": mm(offset[0]), "y": mm(offset[1])},
            "size": {"width": width if isinstance(width, str) else mm(width), "height": height if isinstance(height, str) else mm(height)},
        },
        "style": {"backgroundColor": col(fill), "borderRadius": mm(0)},
    }
    el.update(extra)
    return el


def image(id_: str, resource: str, *, anchor: dict, offset=(0, 0), width="auto", height="auto", **extra) -> dict:
    el = {
        "kind": "image",
        "id": id_,
        "placement": {
            "anchor": anchor,
            "offset": {"x": mm(offset[0]), "y": mm(offset[1])},
            "size": {"width": width if isinstance(width, str) else mm(width), "height": height if isinstance(height, str) else mm(height)},
        },
        "resourceId": resource,
    }
    el.update(extra)
    return el


def at(to: str, edge: str) -> dict:
    return {"to": to, "edge": edge}


# --- the design -----------------------------------------------------------------


def running_heads() -> dict:
    """Verso: author; recto: chapter title. Body pages only — the folio sits
    centred at the foot of every page (see `folio_footer`)."""
    y = M_TOP - 10.0
    return {
        "elements": [
            text("authorEven", "Miguel de Cervantes", anchor=at("page", "top"), offset=(0, y), width=90, size=9, family="Alegreya SC", align="center", parity="even", pages="body", overflow="ellipsis-end"),
            text("titleOdd", "{chapterTitle}", anchor=at("page", "top"), offset=(0, y), width=90, size=9, italic=True, align="center", parity="odd", pages="body", overflow="ellipsis-end"),
        ]
    }


def folio_footer() -> dict:
    """Centred folio at the foot of body and opener pages, roman in the front
    matter and arabic in the body alike; part pages and blank versos carry
    none (the cover style blanks its footer)."""
    return {
        "elements": [
            text("folioBody", "{pageNumber}", anchor=at("page", "bottom"), offset=(0, -(M_BOTTOM - 9)), width=30, size=9, family="Alegreya SC", align="center", pages="body", overflow="ellipsis-end"),
            text("folioOpener", "{pageNumber}", anchor=at("page", "bottom"), offset=(0, -(M_BOTTOM - 9)), width=30, size=9, family="Alegreya SC", align="center", pages="opener", overflow="ellipsis-end"),
        ]
    }


def chapter_opener(label: str, *, lead: bool = True) -> dict:
    """Level-1 design: small-caps chapter label, italic title and a short
    rule centred over the whole text width (both columns), then the lead
    paragraph with a three-line drop cap in the main column (openers always
    fall on a recto, where the main column is inner). A chapter that opens
    with a poem (`lead=False`) sets no lead: the verse follows the rule."""
    elements = [
        text("chapterLabel", label, anchor=at("container", "top-left"), offset=(0, 2), width=TEXT_W, size=11, family="Alegreya SC", align="center", color="accent", letterSpacing=pt(1.2)),
        text("chapterTitle", "{titleText}", anchor=at("#chapterLabel", "below"), offset=(0, 3), width=TEXT_W, size=15, family="Playfair Display", italic=True, align="center", line_height=1.25),
        rule("chapterRule", anchor=at("#chapterTitle", "below"), offset=((TEXT_W - 18) / 2, 4), width=18, color="accent", thickness=0.6),
    ]
    if lead:
        elements.append(
            text(
                "lead",
                "{attr.lead}",
                anchor=at("#chapterRule", "below"),
                offset=(-(TEXT_W - 18) / 2, 5),
                width=MAIN_W,
                size=10.5,
                line_height=1.333,
                hyphenate=True,
                dropCap={"lines": 3, "fontFamily": "Playfair Display", "fontWeight": 400, "color": col("accent"), "gap": mm(1.5)},
            )
        )
    return {"enabled": True, "minHeight": mm(52 if lead else 34), "slot": {"elements": elements}}


def front_opener(*, italic_title: bool = True, size: float = 20, lead: bool = False) -> dict:
    """Unnumbered front-matter opener: the title alone, centred over the
    whole text width, above a short rule — and, for the prologue, the lead
    paragraph with its drop cap in the main column."""
    elements = [
        text("frontTitle", "{titleText}", anchor=at("container", "top"), offset=(0, 6), width=TEXT_W, size=size, family="Playfair Display", italic=italic_title, align="center", line_height=1.2),
        rule("frontRule", anchor=at("#frontTitle", "below"), offset=((TEXT_W - 18) / 2, 4), width=18, color="accent", thickness=0.6),
    ]
    if lead:
        elements.append(
            text(
                "lead",
                "{attr.lead}",
                anchor=at("container", "top-left"),
                offset=(0, 30),
                width=MAIN_W,
                size=10.5,
                line_height=1.333,
                hyphenate=True,
                dropCap={"lines": 3, "fontFamily": "Playfair Display", "fontWeight": 400, "color": col("accent"), "gap": mm(1.5)},
            )
        )
    return {"enabled": True, "minHeight": mm(52 if lead else 32), "slot": {"elements": elements}}


def cover_design() -> dict:
    img_w = TEXT_W
    img_h = round(img_w / (1950 / 2400), 1)  # x-enchantment aspect
    y0 = 16.0
    return {
        "enabled": True,
        "minHeight": mm(PAGE_H),
        "slot": {
            "elements": [
                box("coverBg", anchor=at("bleed", "top-left"), fill="cream"),
                image("coverPlate", "x-enchantment", anchor=at("page", "top-left"), offset=(M_INNER, y0), width=img_w, height=img_h),
                text("coverTitle", "{title}", anchor=at("page", "top-left"), offset=(M_INNER, y0 + img_h + 7), width=img_w, size=21, family="Playfair Display", align="center", line_height=1.12),
                text("coverAuthor", "{author}", anchor=at("#coverTitle", "below"), offset=(0, 4), width=img_w, size=12, family="Alegreya SC", align="center"),
                text("coverEdition", "{attr.edition}", anchor=at("#coverAuthor", "below"), offset=(0, 4), width=img_w, size=8.5, italic=True, align="center", color="muted"),
                text("coverIllustrator", "{attr.illustrator}", anchor=at("#coverEdition", "below"), offset=(0, 1), width=img_w, size=8.5, italic=True, align="center", color="muted"),
            ]
        },
    }


def part_design(label: str) -> dict:
    return {
        "elements": [
            box("partBg", anchor=at("bleed", "top-left"), fill="cream"),
            text("partLabel", label, anchor=at("page", "top"), offset=(0, 62), width=TEXT_W, size=11, family="Alegreya SC", align="center", color="accent", letterSpacing=pt(1.5)),
            text("partTitle", "{titleText}", anchor=at("#partLabel", "below"), offset=(0, 5), width=TEXT_W, size=30, family="Playfair Display", align="center", line_height=1.1),
            rule("partRule", anchor=at("#partTitle", "below"), offset=((TEXT_W - 18) / 2, 6), width=18, color="accent", thickness=0.6),
        ]
    }


def callout_styles() -> list[dict]:
    return [
        {
            "id": "nota",
            "name": "Glosa al margen",
            "span": "side",
            "placement": "here",
            "backgroundEnabled": False,
            "border": {"enabled": False},
            "borderRadius": mm(0),
            "padding": {"top": mm(1.2), "right": mm(0), "bottom": mm(0), "left": mm(0)},
            "stripe": {"enabled": True, "side": "top", "width": pt(0.5), "color": col("rule")},
            "icon": {"kind": "none"},
            "titleStyle": {"fontFamily": "Alegreya SC", "fontSize": pt(8), "fontWeight": 400, "color": col("accent"), "gap": mm(0.6), "letterSpacing": pt(0.3)},
            "body": {"fontFamily": "Alegreya", "fontSize": pt(7.8), "lineHeight": pt(10), "color": col("ink"), "textAlign": "left", "hyphenation": True, "paragraphSpacing": False, "firstLineIndent": mm(0)},
            "marginTop": pt(0),
            "marginBottom": pt(8),
            "keepTogether": True,
        },
    ]


def resource_types(lang: str) -> list[dict]:
    plate, plates, short = ed.BOOK[lang]["plate"]
    return [
        {
            "id": "figure",
            "name": plate,
            "namePlural": plates,
            "shortLabel": short,
            "captionPrefix": plate,
            "numberingTemplate": "{n}",
            "resetOn": "never",
            "counterFormat": "roman-upper",
            "defaultPlacement": {"position": "auto", "span": "page", "width": 1},
        },
        {
            "id": "ornament",
            "name": "Viñeta" if lang == "es" else "Vignette",
            "namePlural": "Viñetas" if lang == "es" else "Vignettes",
            "shortLabel": "",
            "captionPrefix": "",
            "numberingTemplate": "{n}",
            "resetOn": "never",
            "counterFormat": "decimal",
            "defaultPlacement": {"position": "here", "span": "column", "width": 0.8, "align": "center"},
        },
    ]


def body_text(lang: str) -> dict:
    return {
        "fontFamily": "Alegreya",
        "fontSize": pt(10.5),
        "lineHeight": pt(14),
        "textAlign": "justify",
        "firstLineIndent": mm(5),
        "indentAfterHeading": False,
        "paragraphSpacing": False,
        "color": col("ink"),
        "boldColor": col("ink"),
        "italicColor": col("ink"),
        "referenceColor": col("ink"),
        "referenceBold": False,
        "referenceItalic": True,
        "hyphenation": {"enabled": True, "locale": "es" if lang == "es" else "en-us"},
        "avoidWidows": True,
        "avoidOrphans": True,
        "optimalLineBreaking": True,
    }


def headings(lang: str) -> dict:
    return {
        "fontFamily": "Playfair Display",
        "color": col("ink"),
        "keepWithNext": True,
        "levels": [
            {
                "level": 1,
                "numberingTemplate": "{1:I}",
                "fontSize": pt(16),
                "lineHeight": pt(20),
                "span": "page",
                "breakBefore": {"enabled": True, "parity": "odd"},
                "advancedDesign": chapter_opener(ed.BOOK[lang]["chapter_label"]),
            },
            {"level": 2, "fontSize": pt(12), "lineHeight": pt(15), "italic": True, "marginTop": pt(14), "marginBottom": pt(6)},
        ],
    }


def parts(lang: str) -> dict:
    return {
        "breakBefore": {"parity": "odd"},
        "breakAfter": {"enabled": True, "parity": "odd"},
        "margins": {"top": mm(112), "bottom": mm(24), "left": mm(34), "right": mm(34)},
        "design": part_design(ed.BOOK[lang]["part_label"]),
        "bodyStyle": {
            "fontFamily": "Alegreya",
            "fontSize": pt(9.5),
            "lineHeight": pt(14),
            "color": col("ink"),
            "textAlign": "left",
            "numberColor": col("accent"),
            "orderedLists": {"numberFormat": "upper-roman", "separator": ".", "gap": mm(2.5), "indent": mm(9), "fontFamily": "Alegreya SC", "itemSpacing": pt(2)},
        },
    }


def toc_config() -> dict:
    return {
        "levels": [
            {
                "level": 1,
                "fontFamily": "Alegreya",
                "fontSize": pt(10.5),
                "lineHeight": pt(15),
                "color": col("ink"),
                "numberWidth": mm(11),
                "numberGap": mm(2),
                "numberFontFamily": "Alegreya SC",
                "numberFontSize": pt(10),
                "numberColor": col("accent"),
                "marginTop": pt(3),
            }
        ],
        "unnumbered": {"italic": True, "color": col("ink")},
        "pageNumber": {"fontFamily": "Alegreya SC", "fontSize": pt(10), "color": col("ink"), "width": mm(9)},
        "leader": {"enabled": True, "char": ".", "gap": mm(1.2)},
        "parts": {
            "enabled": True,
            # Each part's chapters on a page of the contents of their own.
            "breakBefore": True,
            "height": pt(16),
            "marginTop": pt(16),
            "marginBottom": pt(6),
            "design": {
                "elements": [
                    text("tocPart", "{titleText}", anchor=at("container", "left"), offset=(0, 0), width=TEXT_W, size=10, family="Alegreya SC", color="accent", letterSpacing=pt(1)),
                ]
            },
        },
    }


def heading_styles(lang: str) -> list[dict]:
    empty = {"elements": []}
    return [
        {
            # A chapter opening with a poem (XIV): the level-1 opener without
            # its lead paragraph.
            "id": "poema",
            "name": "Capítulo en verso" if lang == "es" else "Chapter opening in verse",
            "advancedDesign": chapter_opener(ed.BOOK[lang]["chapter_label"], lead=False),
        },
        {
            "id": "portada",
            "name": "Portada",
            "numbered": False,
            "toc": False,
            "span": "page",
            "breakBefore": {"enabled": True, "parity": "odd"},
            "advancedDesign": cover_design(),
            "header": empty,
            "footer": empty,
            "layout": {"layoutType": "single"},
            # The verso: the colophon sits low, on a narrow measure.
            "margins": {"top": mm(PAGE_H - 70), "bottom": mm(M_BOTTOM), "left": mm(PAGE_W - M_OUTER - 72), "right": mm(M_OUTER)},
        },
        {
            "id": "preliminar",
            "name": "Preliminar",
            "numbered": False,
            "span": "page",
            "breakBefore": {"enabled": True, "parity": "odd"},
            "advancedDesign": front_opener(lead=True),
        },
        {
            "id": "indice",
            "name": "Índice",
            "numbered": False,
            "toc": False,
            "span": "page",
            "breakBefore": {"enabled": True, "parity": "odd"},
            "advancedDesign": front_opener(italic_title=False),
            "layout": {"layoutType": "single"},
        },
    ]


def paragraph_styles() -> list[dict]:
    return [
        {"id": "colofon", "name": "Colofón", "fontSize": pt(8.5), "lineHeight": pt(11.5), "textAlign": "left", "firstLineIndent": mm(0), "spaceBetween": pt(6), "color": col("muted")},
        {"id": "creditos", "name": "Créditos", "fontSize": pt(8.5), "lineHeight": pt(11.5), "textAlign": "left", "firstLineIndent": mm(0), "spaceBetween": pt(5)},
        # Verse: one paragraph per line, ragged right, runover lines hung.
        {"id": "verso", "name": "Verso", "fontSize": pt(10), "lineHeight": pt(13.5), "textAlign": "left", "hyphenation": False, "firstLineIndent": mm(0), "hangingIndent": mm(4), "spaceBetween": pt(0), "marginTop": pt(6), "marginBottom": pt(6)},
        # The title over a poem (Antonio's ballad, Grisóstomo's song).
        {"id": "cancion", "name": "Título de canción", "fontFamily": "Alegreya SC", "fontSize": pt(9.5), "lineHeight": pt(13.5), "color": col("accent"), "textAlign": "left", "firstLineIndent": mm(0), "marginTop": pt(10), "marginBottom": pt(2)},
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
        "layout": {
            "layoutType": "oneAndHalf",
            "gutterWidth": mm(GUTTER),
            "sideColumnPercent": SIDE_PERCENT,
            "sideColumnRole": "floats",
            "sideColumnSide": "outer",
        },
        "bodyText": body_text("es"),
        "headings": headings("es"),
        "headingStyles": heading_styles("es"),
        "paragraphStyles": paragraph_styles(),
        "calloutStyles": callout_styles(),
        "parts": parts("es"),
        "toc": toc_config(),
        "header": running_heads(),
        "footer": folio_footer(),
        "captionStyle": {
            "fontFamily": "Alegreya",
            "fontSize": pt(8.5),
            "color": col("ink"),
            "align": "left",
            "gap": mm(1.6),
            "labelBold": False,
            "labelColor": col("accent"),
            "descriptionItalic": True,
            "note": {"fontSize": pt(6.8), "color": col("muted"), "italic": False, "gap": mm(0.8)},
        },
        "unorderedLists": {"bulletChar": "•", "color": col("accent")},
        "orderedLists": {"color": col("accent")},
        "colorPalette": color_palette(),
        "resourceTypes": resource_types("es"),
        "pdfGeneration": {"outlines": True},
    }


def localized_config(lang: str) -> dict:
    return {
        "locale": "es" if lang == "es" else "en-us",
        "bodyText": body_text(lang),
        "headings": headings(lang),
        "headingStyles": heading_styles(lang),
        "parts": parts(lang),
        "resourceTypes": resource_types(lang),
    }


# --- plates ------------------------------------------------------------------

FULL_PLATE_PX = 2400
SMALL_PLATE_PX = 1600
MANUAL_CROPS = {"c01-plate-library": (0.02, 0.0, 0.98, 0.955)}  # printed caption under the plate


def process_plates(meta: list[dict]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    os.makedirs(os.path.join(OUT, "resources"), exist_ok=True)
    for m in meta:
        slug = m["slug"]
        spec = ed.PLATES.get(slug)
        if spec is None:
            continue
        im = Image.open(os.path.join(SOURCE, m["file"])).convert("L")
        if slug in MANUAL_CROPS:
            l, t, r, b = MANUAL_CROPS[slug]
            W, H = im.size
            im = im.crop((int(l * W), int(t * H), int(r * W), int(b * H)))
        # Paper to white, ink to black; then trim the near-white border.
        im = ImageOps.autocontrast(im, cutoff=(0.5, 0.2))
        bbox = im.point(lambda v: 0 if v > 225 else 255).getbbox()
        if bbox:
            l, t, r, b = bbox
            pad = max(2, int(0.004 * max(im.size)))
            im = im.crop((max(0, l - pad), max(0, t - pad), min(im.width, r + pad), min(im.height, b + pad)))
        limit = FULL_PLATE_PX if spec["role"] in ("full", "cover") else SMALL_PLATE_PX
        if max(im.size) > limit:
            im.thumbnail((limit, limit), Image.LANCZOS)
        rel = f"resources/{slug}.jpg"
        im.save(os.path.join(OUT, rel), quality=84, optimize=True, progressive=True)
        out[slug] = {**m, "rel": rel, "pw": im.width, "ph": im.height}
    return out


SIDE_TAIL_LEAD = 1
# Plate roles that get a number and a caption (the others are ornaments).
NUMBERED_ROLES = ("full", "page", "side", "column")

PLACEMENTS = {
    "full": {"position": "top", "span": "page", "width": 1},
    "page": {"position": "top", "span": "page", "width": 1},
    "side": {"position": "auto", "span": "side", "width": 1},
    "head": {"position": "here", "span": "column", "width": 0.86, "align": "center"},
    "tail": {"position": "here", "span": "column", "width": 0.42, "align": "center"},
    # A captioned plate at the width of the main column, floated into the
    # first free band after its reference.
    "column": {"position": "auto", "span": "column", "width": 1},
    "sidetail": {"position": "auto", "span": "side", "width": 1},
    "cover": {"position": "here", "span": "column", "width": 1},
}


def resource_specs(plates: dict[str, dict]) -> tuple[list[dict], dict[str, list[dict]]]:
    shared: list[dict] = []
    wording: dict[str, list[dict]] = {lang: [] for lang in LANGS}
    for slug, spec in ed.PLATES.items():
        p = plates[slug]
        role = spec["role"]
        numbered = role in NUMBERED_ROLES
        entry = {
            "id": slug,
            "typeId": "figure" if numbered else "ornament",
            "kind": "bitmap",
            "file": p["rel"],
            "width": p["pw"],
            "height": p["ph"],
            "placement": PLACEMENTS[role],
        }
        if numbered:
            entry["caption"] = spec["caption"]["es"]
            entry["note"] = ed.PLATE_NOTE["es"]
            entry["altText"] = spec["caption"]["es"]
            for lang in LANGS:
                wording[lang].append({"id": slug, "caption": spec["caption"][lang], "note": ed.PLATE_NOTE[lang], "altText": spec["caption"][lang]})
        else:
            entry["caption"] = ""
            entry["altText"] = "Gustave Doré" if role != "cover" else "Don Quijote y Sancho Panza, por Gustave Doré"
        shared.append(entry)
    return shared, wording


# --- fonts -------------------------------------------------------------------

FONT_JOBS = [
    ("alegreya/Alegreya[wght].ttf", "Alegreya", "normal", [400, 500, 700, 800]),
    ("alegreya/Alegreya-Italic[wght].ttf", "Alegreya", "italic", [400, 700]),
    ("playfairdisplay/PlayfairDisplay[wght].ttf", "PlayfairDisplay", "normal", [400, 500, 700, 900]),
    ("playfairdisplay/PlayfairDisplay-Italic[wght].ttf", "PlayfairDisplay", "italic", [400, 700]),
]
WEIGHT_NAMES = {400: "Regular", 500: "Medium", 700: "Bold", 800: "ExtraBold", 900: "Black"}


def build_fonts() -> list[dict]:
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer

    fonts_dir = os.path.join(OUT, "fonts")
    os.makedirs(fonts_dir, exist_ok=True)
    families: dict[str, list[dict]] = {"Alegreya": [], "Alegreya SC": [], "Playfair Display": []}
    for rel, fam, style, weights in FONT_JOBS:
        src = os.path.join(SOURCE, "fonts", rel)
        for w in weights:
            suffix = WEIGHT_NAMES[w] + ("Italic" if style == "italic" else "")
            if w == 400 and style == "italic":
                suffix = "Italic"
            name = f"{fam}-{suffix}.ttf"
            path = os.path.join(fonts_dir, name)
            if not os.path.exists(path):
                inst = instancer.instantiateVariableFont(TTFont(src), {"wght": w}, inplace=False, updateFontNames=True)
                inst.save(path)
            families["Alegreya" if fam == "Alegreya" else "Playfair Display"].append({"weight": w, "style": style, "file": f"fonts/{name}"})
    for name, style in (("AlegreyaSC-Regular.ttf", "normal"), ("AlegreyaSC-Italic.ttf", "italic")):
        shutil.copyfile(os.path.join(SOURCE, "fonts", "alegreyasc", name), os.path.join(fonts_dir, name))
        families["Alegreya SC"].append({"weight": 400, "style": style, "file": f"fonts/{name}"})
    for folder, licence in (("alegreya", "Alegreya-OFL.txt"), ("alegreyasc", "AlegreyaSC-OFL.txt"), ("playfairdisplay", "PlayfairDisplay-OFL.txt")):
        shutil.copyfile(os.path.join(SOURCE, "fonts", folder, "OFL.txt"), os.path.join(fonts_dir, licence))
    return [{"name": n, "variants": v} for n, v in families.items()]


# --- chapters ------------------------------------------------------------------

SENTENCE_END = re.compile(r"(?<=[.!?…»”])\s+")


def split_lead(paragraph: str, target: int = 260) -> tuple[str, str]:
    """The lead is the first sentence(s) of the opening paragraph, up to
    about `target` characters, cut at a sentence boundary; the rest of the
    paragraph goes back into the flow."""
    sentences = SENTENCE_END.split(paragraph)
    lead: list[str] = []
    length = 0
    for s in sentences:
        if lead and length + len(s) > target:
            break
        lead.append(s)
        length += len(s) + 1
    rest = " ".join(sentences[len(lead) :]).strip()
    text = " ".join(lead).strip()
    # A chapter whose first sentence runs on from its heading ("…de nuestro
    # ingenioso hidalgo, el cual aún todavía dormía") opens in lower case in
    # the source; the lead is a sentence of its own.
    return text[:1].upper() + text[1:], rest


def attr_value(s: str) -> str:
    return s.replace('"', "”").replace("\\", "")


GUTENBERG_ITALIC = re.compile(r"_([^_]+?)_")


def md_paragraph(p: str) -> str:
    """Gutenberg marks italics as `_text_` (Ormsby's book titles and Latin
    tags): turn them into markdown emphasis and escape any stray marker."""
    p = p.replace("*", "\\*")
    p = GUTENBERG_ITALIC.sub(lambda m: "*" + m.group(1).strip() + "*", p)
    return p.replace("_", "\\_")


def gloss_block(lemma: str, body: str) -> str:
    return f':::callout{{type="nota" title="{attr_value(lemma)}"}}\n{body}\n:::'


def md_verse_line(line: str) -> str:
    """A verse line as one paragraph of a `verso` block. Gutenberg's italic
    markers may open on one line and close on another (the Latin distichs
    of the preface): a line carrying an odd marker is set in italics whole."""
    bare = line.strip("_")
    italic = line.startswith("_") or line.endswith("_")
    return f"*{md_paragraph(bare)}*" if italic else md_paragraph(bare)


def render_verse(verse: g.Verse) -> str:
    blocks: list[str] = []
    if verse.title:
        blocks.append(f':::paragraphs{{style="cancion"}}\n{md_paragraph(verse.title)}\n:::\n')
    for stanza in verse.stanzas:
        body = "\n\n".join(md_verse_line(line) for line in stanza)
        blocks.append(f':::paragraphs{{style="verso"}}\n{body}\n:::\n')
    return "\n".join(blocks)


def paragraph_text(p: g.Paragraph) -> str:
    return p if isinstance(p, str) else p.text


MISSING_ANCHORS: list[str] = []


def find_anchor(paragraphs: list[g.Paragraph], anchor: str, where: str) -> int:
    for i, p in enumerate(paragraphs):
        if anchor in paragraph_text(p):
            return i
    MISSING_ANCHORS.append(f"{where}: {anchor!r}")
    return 0


def compose_section(key: str, section: g.Section, lang: str) -> tuple[str, str]:
    """Returns (lead, markdown body) for a prologue or chapter. The lead is
    empty for a chapter that opens with a poem (its opener sets none)."""
    original = list(section.paragraphs)
    paragraphs = list(original)
    lead = ""
    shift = 0
    if isinstance(paragraphs[0], str):
        lead, rest = split_lead(paragraphs[0])
        paragraphs[0] = rest
        if not rest:
            paragraphs.pop(0)
            shift = 1

    # Anchors are searched in the untouched paragraphs (the lead may hold
    # them); a hit in a consumed first paragraph lands after the first one
    # left in the flow.
    def index_of(anchor: str, where: str) -> int:
        return max(0, find_anchor(original, anchor, where) - shift)

    inserts: dict[int, list[str]] = {}
    refs: dict[int, list[str]] = {}
    for slug, spec in ed.PLATES.items():
        if not slug.startswith(key):
            continue
        role = spec["role"]
        if role in NUMBERED_ROLES:
            refs.setdefault(index_of(spec["anchor"][lang], f"{lang}/{key}/{slug}"), []).append(slug)
    for anchor, lemma, body in ed.GLOSSES[key][lang]:
        inserts.setdefault(index_of(anchor, f"{lang}/{key}/{lemma}"), []).append(gloss_block(lemma, body))

    lines: list[str] = []
    head = [s for s, sp in ed.PLATES.items() if s.startswith(key) and sp["role"] == "head"]
    tail = [s for s, sp in ed.PLATES.items() if s.startswith(key) and sp["role"] == "tail"]
    # A closing vignette floated into the outer column: the directive goes a
    # few paragraphs before the end so it lands on the section's last page.
    side_tail = [s for s, sp in ed.PLATES.items() if s.startswith(key) and sp["role"] == "sidetail"]
    side_tail_at = max(0, len(paragraphs) - SIDE_TAIL_LEAD)
    for slug in head:
        lines.append(f'::resource{{id="{slug}"}}\n')
    for i, p in enumerate(paragraphs):
        if i == side_tail_at:
            for slug in side_tail:
                lines.append(f'::resource{{id="{slug}"}}\n')
        if isinstance(p, g.Verse):
            lines.append(render_verse(p))
            for slug in refs.get(i, []):
                lines.append(f'::resource{{id="{slug}"}}\n')
        else:
            para = md_paragraph(p)
            for slug in refs.get(i, []):
                para += f' (:ref{{id="{slug}" case="lower"}})'
            lines.append(para + "\n")
        for block in inserts.get(i, []):
            lines.append(block + "\n")
    for slug in tail:
        lines.append(f'::resource{{id="{slug}"}}\n')
    return lead, "\n".join(lines)


def roman(n: int) -> str:
    out = ""
    for value, numeral in ((50, "L"), (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")):
        while n >= value:
            out += numeral
            n -= value
    return out

ES_HEADING_PREFIX = re.compile(r"^Capítulo (?:primero|[IVX]+)\.\s*")


def chapter_title(section: g.Section, lang: str) -> str:
    if lang == "es":
        t = ES_HEADING_PREFIX.sub("", section.heading)
        return t[0].upper() + t[1:]
    return g.titlecase_en(section.heading)


def write_chapters(plates: dict[str, dict]) -> dict[str, list[dict]]:
    texts = {
        "es": g.spanish_sections(open(os.path.join(SOURCE, "quijote-es.txt"), encoding="utf-8").read(), CHAPTERS),
        "en": g.english_sections(open(os.path.join(SOURCE, "quixote-en.txt"), encoding="utf-8").read(), CHAPTERS),
    }
    lists: dict[str, list[dict]] = {}
    for lang in LANGS:
        book = ed.BOOK[lang]
        d = os.path.join(OUT, "chapters", lang)
        os.makedirs(d, exist_ok=True)
        specs: list[dict] = []

        def emit(n: int, slug: str, title: str, body: str) -> None:
            rel = f"chapters/{lang}/{n:02d}-{slug}.md"
            with open(os.path.join(OUT, rel), "w", encoding="utf-8") as f:
                f.write(body)
            specs.append({"title": title, "file": rel})

        # Cover + colophon
        cover = (
            f'---\ntitle: "{book["title"]}"\nauthor: "{book["author"]}"\n---\n\n'
            f'# {book["title"]} {{style="portada" toc="false" edition="{attr_value(book["edition"])}" illustrator="{attr_value(book["illustrator"])}"}}\n\n'
            f':::pagebreak\n\n:::paragraphs{{style="colofon"}}\n{ed.COVER_BLURB[lang]}\n:::\n'
        )
        emit(0, "portada", book["title"], cover)

        # Prologue
        sec = texts[lang][0]
        lead, body = compose_section("prologo", sec, lang)
        emit(1, "prologo", book["prologue"], f'# {book["prologue"]} {{style="preliminar" lead="{attr_value(lead)}"}}\n\n{body}')

        # Contents
        emit(2, "indice", book["contents"], f'# {book["contents"]} {{style="indice" toc="false"}}\n\n:::toc\n')

        # Chapters, grouped in the parts of the 1605 book: a part page
        # (listing its chapters) opens the chapter file of its first chapter.
        titles = [chapter_title(s, lang) for s in texts[lang][1:]]
        part_starts = {first: (number, title) for number, title, first in book["parts"]}
        part_ends = {first: next((f for _, _, f in book["parts"] if f > first), CHAPTERS + 1) for _, _, first in book["parts"]}
        for n in range(CHAPTERS):
            sec = texts[lang][n + 1]
            lead, body = compose_section(f"c{n + 1:02d}", sec, lang)
            head = ":::numbering{format=\"decimal\" startAt=1}\n\n" if n == 0 else ""
            if n + 1 in part_starts:
                number, title = part_starts[n + 1]
                items = "\n".join(f"{i + 1}. {titles[i]}" for i in range(n, part_ends[n + 1] - 1))
                head += f':::part{{number="{number}" title="{attr_value(title)}"}}\n{items}\n:::\n\n'
            attrs = f'lead="{attr_value(lead)}"' if lead else 'style="poema"'
            md = head + f'# {titles[n]} {{{attrs}}}\n\n{body}'
            emit(n + 3, f"capitulo-{n + 1:02d}" if lang == "es" else f"chapter-{n + 1:02d}", titles[n], md)

        # Credits
        paras = "\n\n".join(ed.CREDITS[lang])
        numbered = [s for s, sp in ed.PLATES.items() if sp["role"] in NUMBERED_ROLES]
        plate_lines = "\n\n".join(
            f"{book['plate'][0]} {roman(i + 1)}. [{plates[s]['title'].rsplit('.', 1)[0]}]({plates[s]['page']})"
            for i, s in enumerate(numbered)
        )
        # A blank page separates the story from the credits.
        credits = (
            ':::pagebreak{parity="always-odd"}\n\n'
            f'# {book["credits"]} {{style="preliminar"}}\n\n'
            f':::paragraphs{{style="creditos"}}\n{paras}\n\n{ed.PLATE_LIST_INTRO[lang]}\n\n{plate_lines}\n:::\n'
        )
        emit(CHAPTERS + 3, "creditos" if lang == "es" else "credits", book["credits"], credits)
        lists[lang] = specs
    return lists


# --- credits file & manifest ------------------------------------------------


def write_credits_md(plates: dict[str, dict]) -> None:
    rows = "\n".join(
        f"| `{s}` | [{plates[s]['title']}]({plates[s]['page']}) | {plates[s]['license']} |" for s in ed.PLATES
    )
    body = f"""# Credits — Don Quijote · Gustave Doré

Showcase preset for the Postext sandbox. Everything in this bundle is public
domain or openly licensed; the wording written for the preset (margin glosses,
captions, this file) is released under CC BY 4.0.

## Text

- Spanish: *El ingenioso hidalgo don Quijote de la Mancha* (1605), Miguel de
  Cervantes Saavedra — Project Gutenberg eBook #2000
  (https://www.gutenberg.org/ebooks/2000). Public domain.
- English: *Don Quixote*, translated by John Ormsby (1885) — Project Gutenberg
  eBook #996 (https://www.gutenberg.org/ebooks/996). Public domain.
- The prologue and chapters I–XIV — the first two of the four parts of the
  1605 book — are included.

## Plates

Gustave Doré's illustrations for *L'ingénieux hidalgo don Quichotte de la
Manche* (Paris, Hachette, 1863), engraved by Héliodore Pisan. Files from the
Wikimedia Commons category "Illustrations by Gustave Doré in L'ingénieux
hidalgo don Quichotte de la Manche (1863), Volume I"; the reproductions were
converted to greyscale, trimmed and downscaled for the bundle.

| id | Commons file | tag |
| --- | --- | --- |
{rows}

## Fonts (SIL Open Font License 1.1)

- Alegreya, Alegreya SC — Juan Pablo del Peral, Huerta Tipográfica
  (`fonts/Alegreya-OFL.txt`, `fonts/AlegreyaSC-OFL.txt`). Static instances of
  the variable fonts from https://github.com/google/fonts.
- Playfair Display — Claus Eggers Sørensen (`fonts/PlayfairDisplay-OFL.txt`).

## Build

`scripts/presets/showcase/don-quijote/` in the Postext repository: `fetch.py`
downloads the sources, `build.py` writes this bundle.
"""
    with open(os.path.join(OUT, "CREDITS.md"), "w", encoding="utf-8") as f:
        f.write(body)


def write_manifest(chapters: dict[str, list[dict]], resources: list[dict], wording: dict[str, list[dict]], fonts: list[dict]) -> dict:
    meta = {
        "id": PRESET_ID,
        "name": "Don Quijote · Gustave Doré",
        "description": "Edición literaria a columna y media con glosas al margen y láminas de Doré · A column-and-a-half literary edition with margin glosses and Doré's plates",
        "locale": "es",
        "locales": ["es", "en"],
        "thumbnail": "thumbnail.jpg",
        "license": "Public domain · CC BY 4.0",
        "credits": "Cervantes · Ormsby · Doré · Project Gutenberg · Wikimedia Commons",
        "tags": ["book", "one-and-a-half", "margin-notes", "front-matter"],
    }
    manifest = {
        "version": 2,
        **meta,
        # A short novel reads best as one continuous document: the sandbox
        # opens it with the canvas laying out the whole book.
        "view": {"canvasScope": "book"},
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


def write_fingerprint() -> None:
    """A static `fingerprint.json` (sha1 of every bundle file) so the sandbox
    can tell a rebuilt bundle from the one it loaded."""
    import hashlib

    h = hashlib.sha1()
    for dp, _, fs in sorted(os.walk(OUT)):
        for f in sorted(fs):
            if f == "fingerprint.json":
                continue
            rel = os.path.relpath(os.path.join(dp, f), OUT)
            h.update(rel.encode())
            with open(os.path.join(dp, f), "rb") as fh:
                h.update(fh.read())
    with open(os.path.join(OUT, "fingerprint.json"), "w", encoding="utf-8") as f:
        json.dump({"fingerprint": h.hexdigest()}, f)
        f.write("\n")


def register(meta: dict) -> None:
    index_path = os.path.join(PRESETS_ROOT, "index.json")
    index = json.load(open(index_path, encoding="utf-8")) if os.path.exists(index_path) else {"version": 1, "presets": []}
    entry = {"id": PRESET_ID, "dir": PRESET_ID, **{k: v for k, v in meta.items() if k != "id"}}
    index["presets"] = [e for e in index["presets"] if e.get("id") != PRESET_ID] + [entry]
    index["presets"].sort(key=lambda e: e["id"])
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2, ensure_ascii=False)
        f.write("\n")


def main() -> None:
    if not os.path.exists(os.path.join(SOURCE, "plates", "meta.json")):
        raise SystemExit("run fetch.py first")
    for sub in ("chapters", "resources"):
        shutil.rmtree(os.path.join(OUT, sub), ignore_errors=True)
    os.makedirs(OUT, exist_ok=True)
    meta = json.load(open(os.path.join(SOURCE, "plates", "meta.json"), encoding="utf-8"))
    plates = process_plates(meta)
    resources, wording = resource_specs(plates)
    fonts = build_fonts()
    chapters = write_chapters(plates)
    if MISSING_ANCHORS:
        raise SystemExit("anchors not found:\n  " + "\n  ".join(MISSING_ANCHORS))
    write_credits_md(plates)
    entry = write_manifest(chapters, resources, wording, fonts)
    thumb = os.path.join(HERE, "thumbnail.jpg")
    if os.path.exists(thumb):
        shutil.copyfile(thumb, os.path.join(OUT, "thumbnail.jpg"))
    else:
        print("note: no thumbnail.jpg next to build.py (render the cover page and drop it there)", file=sys.stderr)
    write_fingerprint()
    register(entry)
    size = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(OUT) for f in fs)
    print(f"wrote {OUT}  ({size / 1e6:.1f} MB, {len(resources)} resources, {sum(len(v) for v in chapters.values())} chapter files)")


if __name__ == "__main__":
    main()
