#!/usr/bin/env python3
"""Build the `deep-sky` showcase preset bundle from `source/` (see fetch.py)
into `apps/web/public/presets/deep-sky/` and register it in the public
`index.json`.

    python3 scripts/presets/showcase/deep-sky/fetch.py   # once
    python3 scripts/presets/showcase/deep-sky/build.py

A two-column astronomy magazine: eight ESO / NSF NOIRLab press releases
(CC BY 4.0, Spanish and English) gathered into four section chapters —
Solar System, Stars, Galaxies, Cosmos. Each feature is a second-level
heading opened by a section-coloured band and a page-wide hero image, with
a fact box, a pull quote, column and page-wide images, a coloured-cell
table and a self-numbering contents page.
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
import release as rel  # noqa: E402
from _common import (  # noqa: E402
    PRESETS_ROOT, at, attr_value, box_el, bundle_size, copy_licences, copy_thumbnail, image_el, instance_font,
    make_palette, mm, pt, register, rule_el, text_el, write_fingerprint,
)

SOURCE = os.path.join(HERE, "source")
PRESET_ID = "deep-sky"
OUT = os.path.join(PRESETS_ROOT, PRESET_ID)
LANGS = ("es", "en")

# --- geometry & palette ------------------------------------------------------------

PAGE_W, PAGE_H = 225.0, 297.0
M_TOP, M_BOTTOM, M_INNER, M_OUTER = 24.0, 20.0, 16.0, 14.0
TEXT_W = PAGE_W - M_INNER - M_OUTER  # 195
GUTTER = 6.0
COL_W = (TEXT_W - GUTTER) / 2
OPENER_H = 95.0

# Every type measure of the magazine — size, leading, letterspacing and the
# space set between blocks — is a third larger than the first draft's, so the
# two columns read comfortably on screen and in print.
TYPE_SCALE = 1.3


def ts(value: float) -> float:
    """A type measure in points, scaled."""
    return round(value * TYPE_SCALE, 2)


def tp(value: float) -> dict:
    """`ts` as a point dimension."""
    return pt(ts(value))

COLOURS = {
    "ink": "#14181d",
    "paper": "#ffffff",
    "white": "#ffffff",
    "band": "#2a7f97",
    "grey": "#f0efeb",
    "rule": "#c9c6bf",
    "muted": "#666b73",
    "solar": "#c9702a",
    "stars": "#b8413d",
    "galaxies": "#2a7f97",
    "cosmos": "#5b4a9c",
}
NAMES = {
    "ink": "Tinta y fondos oscuros", "paper": "Papel", "white": "Blanco", "band": "Color de sección", "grey": "Gris de recuadros",
    "rule": "Filetes", "muted": "Gris de notas", "solar": "Sistema solar", "stars": "Estrellas", "galaxies": "Galaxias", "cosmos": "Cosmos",
}
col, COLOR_PALETTE = make_palette(COLOURS, NAMES)
DISPLAY, TEXT, SANS = "Archivo", "Newsreader", "Chivo"


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


def running_heads(lang: str) -> dict:
    """Verso: the magazine; recto: the section the page belongs to. The
    articles are second-level headings now, so the running head names the
    section (the part the page sits in), not the feature."""
    y = M_TOP - 11.0
    title = ed.BOOK[lang]["title"]
    return {
        "elements": [
            B("headBandEven", anchor=at("page", "top-left"), offset=(M_OUTER, y - 1), width=3, height=3, fill="band", parity="even", pages="body"),
            T("folioEven", "{pageNumber}", anchor=at("page", "top-left"), offset=(M_OUTER + 5, y), size_pt=ts(8.5), family=SANS, weight=700, parity="even", pages="body", overflow="ellipsis-end"),
            T("titleEven", title, anchor=at("page", "top-right"), offset=(-M_INNER, y), width=120, size_pt=ts(7.5), family=SANS, align="right", parity="even", pages="body", overflow="ellipsis-end", textTransform="uppercase", letterSpacing=tp(1.2), color="muted"),
            T("chapterOdd", "{partNumber} · {partTitle}", anchor=at("page", "top-left"), offset=(M_INNER, y), width=140, size_pt=ts(7.5), family=SANS, parity="odd", pages="body", overflow="ellipsis-end", textTransform="uppercase", letterSpacing=tp(1.2), color="muted"),
            B("headBandOdd", anchor=at("page", "top-right"), offset=(-M_OUTER, y - 1), width=3, height=3, fill="band", parity="odd", pages="body"),
            T("folioOdd", "{pageNumber}", anchor=at("page", "top-right"), offset=(-(M_OUTER + 5), y), size_pt=ts(8.5), family=SANS, weight=700, align="right", parity="odd", pages="body", overflow="ellipsis-end"),
        ]
    }


def opener_footer() -> dict:
    return {
        "elements": [
            T("folioOpener", "{pageNumber}", anchor=at("page", "bottom"), offset=(0, -(M_BOTTOM - 8)), width=30, size_pt=ts(8.5), family=SANS, weight=700, align="center", pages="opener", overflow="ellipsis-end"),
        ]
    }


def feature_opener() -> dict:
    """The opening page of a feature (a second-level heading): a dark
    full-bleed band across the head of the page, with the section kicker in
    the section colour, the headline in white, the standfirst, then the
    source and date. The hero image floats in right below it."""
    return {
        "enabled": True,
        "minHeight": mm(OPENER_H),
        "slot": {
            "elements": [
                B("openerBg", anchor=at("bleed", "top-left"), height=M_TOP + OPENER_H + 3, fill="ink"),
                B("openerStripe", anchor=at("bleed", "top-left"), height=3, fill="band"),
                T("kicker", "{partTitle}", anchor=at("container", "top-left"), offset=(0, -3), width=TEXT_W, size_pt=ts(9), family=SANS, weight=700, color="band", textTransform="uppercase", letterSpacing=tp(2)),
                T("headline", "{titleText}", anchor=at("#kicker", "below"), offset=(0, 3), width=TEXT_W, size_pt=ts(27), family=DISPLAY, weight=700, line_height=1.06, color="white"),
                T("standfirst", "{attr.lead}", anchor=at("#headline", "below"), offset=(0, 4), width=TEXT_W - 30, size_pt=ts(11.5), italic=True, line_height=1.3, color="white", hyphenate=True),
                T("dateline", "{attr.source} · {attr.date}", anchor=at("#standfirst", "below"), offset=(0, 4), width=TEXT_W, size_pt=ts(7.5), family=SANS, color="band", textTransform="uppercase", letterSpacing=tp(1.4)),
            ]
        },
    }


def front_opener() -> dict:
    return {
        "enabled": True,
        "minHeight": mm(30),
        "slot": {
            "elements": [
                B("frontStripe", anchor=at("bleed", "top-left"), height=3, fill="band"),
                T("frontTitle", "{titleText}", anchor=at("container", "top-left"), offset=(0, 1), width=TEXT_W, size_pt=ts(27), family=DISPLAY, weight=700, line_height=1.06),
                R("frontRule", anchor=at("#frontTitle", "below"), offset=(0, 4), width=30, color="band", thickness=1.5),
            ]
        },
    }


def cover_design() -> dict:
    img_w = PAGE_W + 6
    img_h = round(img_w * (2536 / 4000), 1)  # Sombrero hero aspect
    return {
        "enabled": True,
        "minHeight": mm(PAGE_H),
        "slot": {
            "elements": [
                B("coverBg", anchor=at("bleed", "top-left"), fill="ink"),
                image_el("coverImage", "noirlab2612a", anchor=at("bleed", "top-left"), width=img_w, height=img_h),
                T("coverIssue", "{attr.issue}", anchor=at("page", "top-left"), offset=(M_INNER, img_h + 8), width=TEXT_W, size_pt=ts(8.5), family=SANS, weight=700, color="band", textTransform="uppercase", letterSpacing=tp(2)),
                T("coverTitle", "{title}", anchor=at("#coverIssue", "below"), offset=(0, 4), width=TEXT_W, size_pt=ts(64), family=DISPLAY, weight=700, line_height=0.98, color="white"),
                T("coverSubtitle", "{subtitle}", anchor=at("#coverTitle", "below"), offset=(0, 6), width=TEXT_W - 20, size_pt=ts(15), italic=True, line_height=1.25, color="white"),
                T("coverPublisher", "{attr.publisher}", anchor=at("page", "bottom-left"), offset=(M_INNER, -16), width=TEXT_W, size_pt=ts(8), family=SANS, color="muted", textTransform="uppercase", letterSpacing=tp(1.4)),
            ]
        },
    }


def part_design(label: str) -> dict:
    return {
        "elements": [
            B("partBg", anchor=at("bleed", "top-left"), fill="band"),
            T("partLabel", label, anchor=at("page", "top-left"), offset=(M_INNER, 56), width=TEXT_W, size_pt=ts(10), family=SANS, weight=700, color="white", textTransform="uppercase", letterSpacing=tp(2.5)),
            T("partNumber", "{numberDecimal}", anchor=at("#partLabel", "below"), offset=(0, 2), width=TEXT_W, size_pt=ts(120), family=DISPLAY, weight=700, line_height=1.0, color="white"),
            T("partTitle", "{titleText}", anchor=at("#partNumber", "below"), offset=(0, 4), width=TEXT_W, size_pt=ts(40), family=DISPLAY, weight=700, line_height=1.02, color="white"),
        ]
    }


def callout_styles() -> list[dict]:
    return [
        {
            "id": "ficha", "name": "De un vistazo", "span": "column", "placement": "here",
            "backgroundEnabled": True, "background": col("grey"), "border": {"enabled": False}, "borderRadius": mm(0),
            "padding": {"top": mm(3), "right": mm(3.5), "bottom": mm(2.5), "left": mm(3.5)},
            "stripe": {"enabled": True, "side": "top", "width": pt(2.5), "color": col("band")},
            "icon": {"kind": "none"},
            "titleStyle": {"fontFamily": SANS, "fontSize": tp(7.5), "fontWeight": 700, "color": col("band"), "textTransform": "uppercase", "letterSpacing": tp(1.6), "gap": mm(1.8)},
            "body": {"fontFamily": TEXT, "fontSize": tp(8.5), "lineHeight": tp(11.5), "color": col("ink"), "boldColor": col("ink"), "textAlign": "left", "hyphenation": False, "paragraphSpacing": True, "firstLineIndent": mm(0)},
            "marginTop": tp(4), "marginBottom": tp(10), "keepTogether": True,
        },
        {
            "id": "cita", "name": "Cita destacada", "span": "column", "placement": "here",
            "backgroundEnabled": False, "border": {"enabled": False}, "borderRadius": mm(0),
            "padding": {"top": mm(3), "right": mm(0), "bottom": mm(2), "left": mm(0)},
            "stripe": {"enabled": True, "side": "top", "width": pt(2.5), "color": col("band")},
            "icon": {"kind": "none"},
            "body": {"fontFamily": DISPLAY, "fontSize": tp(13), "lineHeight": tp(16), "color": col("band"), "boldColor": col("band"), "textAlign": "left", "hyphenation": False, "paragraphSpacing": False, "firstLineIndent": mm(0)},
            "marginTop": tp(6), "marginBottom": tp(10), "keepTogether": True,
        },
        {
            "id": "datos", "name": "Datos", "span": "page", "placement": "here",
            "backgroundEnabled": True, "background": col("ink"), "border": {"enabled": False}, "borderRadius": mm(0),
            "padding": {"top": mm(3.5), "right": mm(6), "bottom": mm(3), "left": mm(6)},
            "icon": {"kind": "none"}, "columnGap": mm(8),
            "titleStyle": {"fontFamily": SANS, "fontSize": tp(7.5), "fontWeight": 700, "color": col("band"), "textTransform": "uppercase", "letterSpacing": tp(1.6), "gap": mm(3)},
            "body": {"fontFamily": DISPLAY, "fontSize": tp(10), "lineHeight": tp(14), "color": col("white"), "boldColor": col("white"), "textAlign": "left", "hyphenation": False, "paragraphSpacing": True, "firstLineIndent": mm(0)},
            "marginTop": tp(2), "marginBottom": tp(4), "keepTogether": True,
        },
    ]


def resource_types(lang: str) -> list[dict]:
    fig, figs, figshort = ed.BOOK[lang]["figure"]
    tab, tabs, tabshort = ed.BOOK[lang]["table"]
    return [
        {"id": "figure", "name": fig, "namePlural": figs, "shortLabel": figshort, "captionPrefix": fig, "numberingTemplate": "{n}", "resetOn": "never", "counterFormat": "decimal", "defaultPlacement": {"position": "auto", "span": "column", "width": 1}},
        {"id": "table", "name": tab, "namePlural": tabs, "shortLabel": tabshort, "captionPrefix": tab, "numberingTemplate": "{n}", "resetOn": "never", "counterFormat": "decimal", "defaultPlacement": {"position": "auto", "span": "page"}, "captionStyle": {"position": "above"}},
    ]


def body_text(lang: str) -> dict:
    return {
        "fontFamily": TEXT, "fontSize": tp(9.5), "lineHeight": tp(13), "textAlign": "justify",
        "firstLineIndent": mm(4), "indentAfterHeading": False, "paragraphSpacing": False,
        "color": col("ink"), "boldColor": col("ink"), "italicColor": col("ink"),
        "referenceColor": col("band"), "referenceBold": False, "referenceItalic": True,
        "hyphenation": {"enabled": True, "locale": "es" if lang == "es" else "en-us"},
        "avoidWidows": True, "avoidOrphans": True, "optimalLineBreaking": True,
    }


def headings(lang: str) -> dict:
    """Level 1 is the front matter (cover, editorial, contents, credits,
    each through a heading style); the features are level 2, numbered
    straight through the issue and opened by the dark band; level 3 is a
    subhead inside a feature."""
    return {
        "fontFamily": DISPLAY, "color": col("ink"), "keepWithNext": True,
        "levels": [
            {"level": 1, "fontSize": tp(22), "lineHeight": tp(26), "span": "page", "breakBefore": {"enabled": True, "parity": "any"}},
            # A feature always opens on the left-hand page of a spread, so
            # the dark band and its hero image are seen as one opening; a
            # blank page is inserted when the next page would be a recto.
            {"level": 2, "fontSize": tp(22), "lineHeight": tp(26), "numberingTemplate": "{2}", "span": "page", "breakBefore": {"enabled": True, "parity": "even"}, "advancedDesign": feature_opener()},
            {"level": 3, "fontSize": tp(12), "lineHeight": tp(15), "fontWeight": 700, "marginTop": tp(12), "marginBottom": tp(4)},
        ],
    }


def parts(lang: str) -> dict:
    """A section divider always opens a right-hand page, and never faces the
    last page of the section before it: `always-odd` lays one blank leaf
    between them and pads a second when the parity asks for it."""
    return {
        "breakBefore": {"parity": "always-odd"},
        "breakAfter": {"enabled": True, "parity": "any"},
        "margins": {"top": mm(200), "bottom": mm(24), "left": mm(M_INNER), "right": mm(60)},
        "design": part_design(ed.BOOK[lang]["part_label"]),
        "bodyStyle": {
            "fontFamily": TEXT, "fontSize": tp(11), "lineHeight": tp(16), "color": col("white"), "textAlign": "left", "numberColor": col("white"),
            "orderedLists": {"numberFormat": "arabic", "separator": "", "gap": mm(3), "indent": mm(9), "fontFamily": SANS, "numberFontSize": tp(9), "itemSpacing": tp(2)},
        },
    }


def toc_config() -> dict:
    return {
        # Level 1 is the front matter (unnumbered); level 2 the features,
        # listed under the band of the section they belong to.
        "levels": [
            {"level": 1, "fontFamily": DISPLAY, "fontSize": tp(11), "lineHeight": tp(13.5), "fontWeight": 700, "color": col("ink"), "numberWidth": mm(10), "numberGap": mm(2), "numberFontFamily": SANS, "numberFontSize": tp(9), "numberColor": col("band"), "marginTop": tp(3)},
            {"level": 2, "fontFamily": DISPLAY, "fontSize": tp(11), "lineHeight": tp(13.5), "fontWeight": 700, "color": col("ink"), "numberWidth": mm(10), "numberGap": mm(2), "numberFontFamily": SANS, "numberFontSize": tp(9), "numberColor": col("band"), "marginTop": tp(3)},
        ],
        "unnumbered": {"fontFamily": TEXT, "fontWeight": 400, "italic": True, "color": col("ink")},
        "pageNumber": {"fontFamily": SANS, "fontSize": tp(9), "fontWeight": 700, "color": col("ink"), "width": mm(9)},
        "leader": {"enabled": False},
        "subtitle": {"enabled": True, "attr": "standfirst", "fontFamily": TEXT, "fontSize": tp(7.5), "italic": True, "color": col("muted"), "indent": mm(10)},
        "parts": {
            "enabled": True, "height": tp(15), "marginTop": tp(8), "marginBottom": tp(2),
            "design": {"elements": [
                B("tocPartBand", anchor=at("container", "left"), offset=(0, 0), width=6, height=6, fill="band"),
                T("tocPart", "{titleText}", anchor=at("#tocPartBand", "right-of"), offset=(3, 0), width=150, size_pt=ts(9), family=SANS, weight=700, textTransform="uppercase", letterSpacing=tp(2), color="band"),
            ]},
        },
    }


def heading_styles() -> list[dict]:
    empty = {"elements": []}
    return [
        {"id": "portada", "name": "Portada", "numbered": False, "toc": False, "span": "page", "breakBefore": {"enabled": True, "parity": "odd"}, "advancedDesign": cover_design(), "header": empty, "footer": empty, "layout": {"layoutType": "single"}, "margins": {"top": mm(PAGE_H - 80), "bottom": mm(M_BOTTOM), "left": mm(PAGE_W - M_OUTER - 85), "right": mm(M_OUTER)}},
        {"id": "preliminar", "name": "Preliminar", "numbered": False, "span": "page", "breakBefore": {"enabled": True, "parity": "odd"}, "advancedDesign": front_opener()},
        {"id": "sumario", "name": "Sumario", "numbered": False, "toc": False, "span": "page", "breakBefore": {"enabled": True, "parity": "any"}, "advancedDesign": front_opener(), "layout": {"layoutType": "single"}},
    ]


def paragraph_styles() -> list[dict]:
    return [
        {"id": "colofon", "name": "Colofón", "fontSize": tp(8.5), "lineHeight": tp(11.5), "textAlign": "left", "firstLineIndent": mm(0), "spaceBetween": tp(6), "color": col("muted")},
        {"id": "fuente", "name": "Fuente", "fontFamily": SANS, "fontSize": tp(7), "lineHeight": tp(9.5), "textAlign": "left", "firstLineIndent": mm(0), "spaceBetween": tp(4), "marginTop": tp(12), "color": col("muted")},
        {"id": "editorial", "name": "Editorial", "fontSize": tp(10.5), "lineHeight": tp(14.5), "textAlign": "justify", "firstLineIndent": mm(0), "spaceBetween": tp(3.5)},
        {"id": "creditos", "name": "Créditos", "fontSize": tp(9.5), "lineHeight": tp(13), "textAlign": "left", "firstLineIndent": mm(0), "spaceBetween": tp(6)},
    ]


def shared_config() -> dict:
    return {
        "locale": "es",
        "page": {
            "sizePreset": "custom", "width": mm(PAGE_W), "height": mm(PAGE_H),
            "margins": {"top": mm(M_TOP), "bottom": mm(M_BOTTOM), "left": mm(M_INNER), "right": mm(M_OUTER), "mirror": True},
            "baselineGrid": {"enabled": False}, "pageNumbering": {"format": "decimal", "startAt": 1},
        },
        "layout": {"layoutType": "double", "gutterWidth": mm(GUTTER)},
        "bodyText": body_text("es"),
        "headings": headings("es"),
        "headingStyles": heading_styles(),
        "paragraphStyles": paragraph_styles(),
        "calloutStyles": callout_styles(),
        "parts": parts("es"),
        "toc": toc_config(),
        "header": running_heads("es"),
        "footer": opener_footer(),
        "captionStyle": {
            "fontFamily": SANS, "fontSize": tp(7.5), "color": col("ink"), "align": "left", "gap": mm(1.6),
            "labelBold": True, "labelColor": col("band"), "descriptionItalic": False,
            "note": {"fontSize": tp(6.3), "color": col("muted"), "italic": False, "gap": mm(0.6)},
        },
        "tableStyle": {
            "bodyFontFamily": SANS, "bodyFontSize": tp(8.5), "bodyLineHeight": tp(11), "bodyColor": col("ink"),
            "headerFontFamily": SANS, "headerFontSize": tp(8), "headerBold": True, "headerBackgroundEnabled": True, "headerBackground": col("ink"),
            "borderColor": col("rule"), "borderWidth": pt(0.5), "cellPadding": mm(1.3), "rules": "horizontal",
        },
        "unorderedLists": {"bulletChar": "•", "color": col("band")},
        "orderedLists": {"color": col("band")},
        "colorPalette": COLOR_PALETTE,
        "resourceTypes": resource_types("es"),
        "pdfGeneration": {"outlines": True},
    }


def localized_config(lang: str) -> dict:
    return {"locale": "es" if lang == "es" else "en-us", "bodyText": body_text(lang), "headings": headings(lang), "parts": parts(lang), "resourceTypes": resource_types(lang), "header": running_heads(lang)}


# --- images -------------------------------------------------------------------------

ROLE_MAX = {"hero": 3200, "page": 3200, "column": 1800}
PLACEMENT = {
    "hero": {"position": "here", "span": "page", "width": 1},
    "page": {"position": "auto", "span": "page", "width": 1},
    "column": {"position": "auto", "span": "column", "width": 1},
}


def process_images(images_meta: dict) -> dict[str, dict]:
    os.makedirs(os.path.join(OUT, "resources"), exist_ok=True)
    out: dict[str, dict] = {}
    for spec in ed.RELEASES:
        for img, role in spec["roles"].items():
            im = Image.open(os.path.join(SOURCE, images_meta[img]["file"])).convert("RGB")
            limit = ROLE_MAX[role]
            if max(im.size) > limit:
                im.thumbnail((limit, limit), Image.LANCZOS)
            relp = f"resources/{img}.jpg"
            im.save(os.path.join(OUT, relp), quality=84, optimize=True, progressive=True)
            out[img] = {**images_meta[img], "rel": relp, "w": im.width, "h": im.height, "role": role}
    return out


def features_table(lang: str) -> dict:
    book = ed.BOOK[lang]
    rows = [[{"content": h, "isHeader": True} for h in book["table_head"]]]
    for spec in ed.RELEASES:
        name, obs, obj, dist = spec["row"][lang]
        bg = {"hex": COLOURS[spec["part"]], "model": "hex", "paletteId": spec["part"]}
        rows.append([{"content": f"**{name}**", "background": bg}, {"content": obs}, {"content": obj}, {"content": dist}])
    return {"model": {"rows": rows, "headerRowCount": 1, "columnWidths": [2.2, 2, 2, 2]}}


def resource_specs(images: dict[str, dict], parsed: dict) -> tuple[list[dict], dict[str, list[dict]]]:
    shared: list[dict] = []
    wording: dict[str, list[dict]] = {lang: [] for lang in LANGS}
    for spec in ed.RELEASES:
        for img, role in spec["roles"].items():
            p = images[img]
            caps = {lang: parsed[lang][spec["id"]].captions.get(img) or parsed[lang][spec["id"]].title for lang in LANGS}
            note = {lang: ("Crédito: " if lang == "es" else "Credit: ") + p["credit"] for lang in LANGS}
            shared.append({"id": img, "typeId": "figure", "kind": "bitmap", "file": p["rel"], "width": p["w"], "height": p["h"], "caption": caps["es"], "note": note["es"], "altText": caps["es"], "placement": PLACEMENT[role]})
            for lang in LANGS:
                wording[lang].append({"id": img, "caption": caps[lang], "note": note[lang], "altText": caps[lang]})
    shared.append({"id": "features-table", "typeId": "table", "kind": "table", "caption": ed.BOOK["es"]["table_caption"], "table": features_table("es")})
    for lang in LANGS:
        wording[lang].append({"id": "features-table", "caption": ed.BOOK[lang]["table_caption"], "table": features_table(lang)})
    return shared, wording


# --- fonts -------------------------------------------------------------------------


def build_fonts() -> list[dict]:
    fonts_dir = os.path.join(OUT, "fonts")
    os.makedirs(fonts_dir, exist_ok=True)
    fam: dict[str, list[dict]] = {DISPLAY: [], TEXT: [], SANS: []}
    src = lambda r: os.path.join(SOURCE, "fonts", r)  # noqa: E731
    ar = {"wdth": 100}
    for w in (400, 700, 900):
        fam[DISPLAY].append({"weight": w, "style": "normal", "file": "fonts/" + instance_font(src("archivo/Archivo[wdth,wght].ttf"), fonts_dir, "Archivo", ar, w, False)})
    fam[DISPLAY].append({"weight": 400, "style": "italic", "file": "fonts/" + instance_font(src("archivo/Archivo-Italic[wdth,wght].ttf"), fonts_dir, "Archivo", ar, 400, True)})
    nr = {"opsz": 16}
    for w in (400, 700):
        fam[TEXT].append({"weight": w, "style": "normal", "file": "fonts/" + instance_font(src("newsreader/Newsreader[opsz,wght].ttf"), fonts_dir, "Newsreader", nr, w, False)})
        fam[TEXT].append({"weight": w, "style": "italic", "file": "fonts/" + instance_font(src("newsreader/Newsreader-Italic[opsz,wght].ttf"), fonts_dir, "Newsreader", nr, w, True)})
    for w in (400, 700):
        fam[SANS].append({"weight": w, "style": "normal", "file": "fonts/" + instance_font(src("chivo/Chivo[wght].ttf"), fonts_dir, "Chivo", {}, w, False)})
    fam[SANS].append({"weight": 400, "style": "italic", "file": "fonts/" + instance_font(src("chivo/Chivo-Italic[wght].ttf"), fonts_dir, "Chivo", {}, 400, True)})
    copy_licences(os.path.join(SOURCE, "fonts"), fonts_dir, {"archivo": "Archivo-OFL.txt", "newsreader": "Newsreader-OFL.txt", "chivo": "Chivo-OFL.txt"})
    return [{"name": n, "variants": v} for n, v in fam.items()]


# --- chapters ------------------------------------------------------------------------

SENTENCE_END = re.compile(r"(?<=[.!?…»”)])\s+")
QUOTE = re.compile(r"[\"“«]\s*\*?([^\"”»]{90,300}?)\*?\s*[\"”»]")


def split_lead(paragraph: str, target: int = 230) -> tuple[str, str]:
    sentences = SENTENCE_END.split(paragraph)
    lead, length = [], 0
    for s in sentences:
        if lead and length + len(s) > target:
            break
        lead.append(s)
        length += len(s) + 1
    return " ".join(lead).strip(), " ".join(sentences[len(lead):]).strip()


def md(p: str) -> str:
    # The parser marked italics with *…*; escape stray underscores only.
    return p.replace("_", "\\_")


def ficha_block(lang: str, spec: dict) -> str:
    lines = "\n\n".join(f"**{k}** {v}" for k, v in spec["ficha"][lang])
    return f':::callout{{type="ficha" title="{ed.BOOK[lang]["ficha"]}"}}\n{lines}\n:::'


def pull_quote(paragraphs: list[str]) -> tuple[int, str] | None:
    for i, p in enumerate(paragraphs[1:], start=1):
        m = QUOTE.search(p)
        if m:
            q = m.group(1).strip().replace("*", "")
            return i, q
    return None


def feature_markdown(lang: str, spec: dict, r: rel.Release) -> tuple[str, str]:
    """One feature of the issue: a second-level heading carrying the
    standfirst and dateline its opener prints, the hero image, the fact box,
    a pull quote and the source line."""
    book = ed.BOOK[lang]
    paragraphs = [p for p in r.paragraphs if not p.startswith(ed.DROP_PARAGRAPH_PREFIXES)]
    standfirst = r.subtitle
    if standfirst:
        lead, rest = standfirst, paragraphs[0]
    else:
        lead, rest = split_lead(paragraphs[0])
    paragraphs[0] = rest
    if not rest:
        paragraphs.pop(0)
    attrs = f'lead="{attr_value(lead)}" source="{book["org"][spec["org"]]}" date="{attr_value(r.date)}" release="{spec["id"]}"'
    if standfirst:
        attrs += f' standfirst="{attr_value(standfirst)}"'
    out = [f"## {r.title} {{{attrs}}}", ""]
    images = list(spec["roles"].items())
    refs: dict[int, list[str]] = {}
    for k, (img, role) in enumerate(images):
        if role == "hero":
            out.append(f'::resource{{id="{img}"}}\n')
            continue
        refs.setdefault(min(k * 2 - 1, len(paragraphs) - 1), []).append(img)
    quote = pull_quote(paragraphs)
    for i, p in enumerate(paragraphs):
        para = md(p)
        for img in refs.get(i, []):
            para += f' (:ref{{id="{img}" case="lower"}})'
        out.append(para + "\n")
        if i == 0:
            out.append(ficha_block(lang, spec) + "\n")
        if quote and i == quote[0]:
            out.append(f':::callout{{type="cita"}}\n«{quote[1]}»\n:::\n' if lang == "es" else f':::callout{{type="cita"}}\n“{quote[1]}”\n:::\n')
    url = (f"https://www.eso.org/public/{'spain/' if lang == 'es' else ''}news/{spec['id']}/" if spec["org"] == "eso"
           else f"https://noirlab.edu/public/{'es/' if lang == 'es' else ''}news/{spec['id']}/")
    line = book["source_line"].format(id=spec["id"], org=book["org"][spec["org"]], date=r.date)
    out.append(f':::paragraphs{{style="fuente"}}\n{line} [{url}]({url})\n:::\n')
    return r.title, "\n".join(out)


PARSED: dict[str, dict[str, rel.Release]] = {}


def write_chapters(images: dict[str, dict]) -> dict[str, list[dict]]:
    lists: dict[str, list[dict]] = {}
    for lang in LANGS:
        book = ed.BOOK[lang]
        d = os.path.join(OUT, "chapters", lang)
        os.makedirs(d, exist_ok=True)
        specs: list[dict] = []
        n_file = 0

        def emit(slug: str, title: str, body: str) -> None:
            nonlocal n_file
            relp = f"chapters/{lang}/{n_file:02d}-{slug}.md"
            with open(os.path.join(OUT, relp), "w", encoding="utf-8") as f:
                f.write(body)
            specs.append({"title": title, "file": relp})
            n_file += 1

        emit("portada", book["title"], (
            f'---\ntitle: "{book["title"]}"\nsubtitle: "{book["subtitle"]}"\n---\n\n'
            f'# {book["title"]} {{style="portada" toc="false" issue="{attr_value(book["issue"])}" publisher="{attr_value(book["publisher"])}"}}\n\n'
            f':::pagebreak\n\n:::paragraphs{{style="colofon"}}\n{ed.COVER_BLURB[lang]}\n:::\n'
        ))
        # Editorial + table + a three-column data box
        stats = ("**8** reportajes\n\n**2** observatorios\n\n**18** imágenes" if lang == "es" else "**8** features\n\n**2** observatories\n\n**18** images")
        editorial = [f'# {book["editorial"]} {{style="preliminar"}}', ""]
        editorial.append(':::paragraphs{style="editorial"}\n' + "\n\n".join(book["editorial_text"][:1]) + ' (:ref{id="features-table" case="lower"})\n\n' + "\n\n".join(book["editorial_text"][1:]) + "\n:::\n")
        editorial.append(f':::callout{{type="datos" title="{"En cifras" if lang == "es" else "In numbers"}"}}\n:::columns{{count=3}}\n{stats}\n:::\n:::\n')
        emit("editorial", book["editorial"], "\n".join(editorial))
        emit("sumario" if lang == "es" else "contents", book["contents"], f'# {book["contents"]} {{style="sumario" toc="false"}}\n\n:::toc\n')

        # One chapter per section: the part divider, then its features as
        # second-level headings. The first one opens the body numbering.
        for n, part in enumerate(ed.PARTS):
            members = [s for s in ed.RELEASES if s["part"] == part["id"]]
            items = "\n".join(f"{j + 1}. {PARSED[lang][m['id']].title}" for j, m in enumerate(members))
            head = ':::numbering{format="decimal" startAt=1}\n\n' if n == 0 else ""
            head += (f':::part{{number="{part["number"]}" title="{attr_value(part["title"][lang])}"'
                     f' palette="band={part["band"]}"}}\n{items}\n:::\n')
            body = [head] + [feature_markdown(lang, spec, PARSED[lang][spec["id"]])[1] for spec in members]
            emit(part["id"], part["title"][lang], "\n".join(body))

        paras = "\n\n".join(ed.CREDITS[lang])
        img_lines = "\n\n".join(f"[{img}]({images[img]['page']}) — {images[img]['credit']}" for spec in ed.RELEASES for img in spec["roles"])
        emit("creditos" if lang == "es" else "credits", book["credits"], f'# {book["credits"]} {{style="preliminar"}}\n\n:::paragraphs{{style="creditos"}}\n{paras}\n\n{img_lines}\n:::\n')
        lists[lang] = specs
    return lists


# --- credits & manifest -----------------------------------------------------------


def write_credits_md(images: dict[str, dict]) -> None:
    rows = "\n".join(f"| {img} | {images[img]['release']} | [{img}]({images[img]['page']}) | {images[img]['credit']} |" for spec in ed.RELEASES for img in spec["roles"])
    rels = "\n".join(
        f"| {s['id']} | {ed.BOOK['en']['org'][s['org']]} | {PARSED['en'][s['id']].date} | {PARSED['en'][s['id']].title} |" for s in ed.RELEASES
    )
    body = f"""# Credits — Deep Sky

Showcase preset for the Postext sandbox. Texts and images are ESO and NSF
NOIRLab press-release material, licensed CC BY 4.0
(https://www.eso.org/public/outreach/copyright/ and
https://noirlab.edu/public/copyright/); the credit line printed on each image
page is reproduced under every image, as the licence requires. The magazine
wording written for the preset (editorial, fact boxes, section titles) is
CC BY 4.0.

## Releases

| id | organisation | date | title |
| --- | --- | --- | --- |
{rels}

Spanish versions: ESO releases are translated by the ESO Science Outreach
Network; NOIRLab releases by NOIRLab's communications office in Chile.
Contact and "More information" sections were left out; images were
downscaled for the bundle.

## Images

| id | release | page | credit |
| --- | --- | --- | --- |
{rows}

## Fonts (SIL Open Font License 1.1)

- Archivo, Chivo — Omnibus-Type (`fonts/Archivo-OFL.txt`, `fonts/Chivo-OFL.txt`)
- Newsreader — Production Type (`fonts/Newsreader-OFL.txt`)

## Build

`scripts/presets/showcase/deep-sky/` in the Postext repository: `fetch.py`
downloads the sources, `build.py` writes this bundle.
"""
    with open(os.path.join(OUT, "CREDITS.md"), "w", encoding="utf-8") as f:
        f.write(body)


def write_manifest(chapters, resources, wording, fonts) -> dict:
    meta = {
        "id": PRESET_ID,
        "name": "Cielo profundo · Deep Sky",
        "description": "Revista de astronomía a dos columnas con aperturas a sangre, recuadros y citas · A two-column astronomy magazine with full-bleed openers, boxes and pull quotes",
        "locale": "es",
        "locales": ["es", "en"],
        "thumbnail": "thumbnail.jpg",
        "license": "CC BY 4.0",
        "credits": "ESO · NSF NOIRLab",
        "tags": ["magazine", "two-column", "parts", "tables"],
    }
    manifest = {
        "version": 2, **meta,
        # The issue is read as one magazine: the sandbox opens it with the
        # canvas laying out the whole book.
        "view": {"canvasScope": "book"},
        "chapters": chapters, "config": shared_config(),
        "localized": {lang: {"config": localized_config(lang), "resources": wording[lang]} for lang in LANGS},
        "resources": resources, "fonts": fonts,
    }
    with open(os.path.join(OUT, "preset.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=1, ensure_ascii=False)
        f.write("\n")
    return meta


def main() -> None:
    images_path = os.path.join(SOURCE, "images.json")
    if not os.path.exists(images_path):
        raise SystemExit("run fetch.py first")
    for sub in ("chapters", "resources"):
        shutil.rmtree(os.path.join(OUT, sub), ignore_errors=True)
    os.makedirs(OUT, exist_ok=True)
    images_meta = json.load(open(images_path, encoding="utf-8"))
    for lang in LANGS:
        PARSED[lang] = {}
        for spec in ed.RELEASES:
            page = open(os.path.join(SOURCE, "pages", f"{spec['id']}-{lang}.html"), encoding="utf-8", errors="replace").read()
            PARSED[lang][spec["id"]] = rel.parse(page)
    images = process_images(images_meta)
    resources, wording = resource_specs(images, PARSED)
    fonts = build_fonts()
    chapters = write_chapters(images)
    write_credits_md(images)
    meta = write_manifest(chapters, resources, wording, fonts)
    copy_thumbnail(HERE, OUT)
    write_fingerprint(OUT)
    register(PRESET_ID, meta)
    print(f"wrote {OUT}  ({bundle_size(OUT):.1f} MB, {len(resources)} resources, {sum(len(v) for v in chapters.values())} chapter files)")


if __name__ == "__main__":
    main()
