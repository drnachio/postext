#!/usr/bin/env python3
"""Build the `openstax-fisica` showcase preset bundle from `source/` (see
fetch.py) into `apps/web/public/presets/openstax-fisica/` and register it
in the public `index.json`.

    python3 scripts/presets/showcase/openstax-fisica/fetch.py   # once
    python3 scripts/presets/showcase/openstax-fisica/build.py

A physics textbook in a column-and-a-half layout: the outer column takes
the smaller figures, the main column the text, worked examples, "check
your understanding" boxes, learning objectives, tables and display
formulas (MathML converted to LaTeX). Spanish: *Física universitaria,
volumen 1*; English: *Physics* (both OpenStax, CC BY 4.0).
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
import cnxml  # noqa: E402
import editorial as ed  # noqa: E402
from _common import (  # noqa: E402
    PRESETS_ROOT, at, attr_value, box_el, bundle_size, copy_licences, copy_thumbnail, image_el, instance_font,
    make_palette, mm, pt, register, rule_el, text_el, write_fingerprint,
)
from fetch import BOOKS, chapters_of  # noqa: E402

SOURCE = os.path.join(HERE, "source")
PRESET_ID = "openstax-fisica"
OUT = os.path.join(PRESETS_ROOT, PRESET_ID)
LANGS = ("es", "en")
IMAGE_MAX_PX = 1800
IMAGE_QUALITY = 84
COVER_SPLASH = ("es", 0)  # language and chapter whose splash picture is the cover

# --- geometry & palette ------------------------------------------------------------

PAGE_W, PAGE_H = 210.0, 275.0
M_TOP, M_BOTTOM, M_INNER, M_OUTER = 24.0, 22.0, 20.0, 16.0
TEXT_W = PAGE_W - M_INNER - M_OUTER  # 174
GUTTER = 7.0
SIDE_PERCENT = 30.0
MAIN_W = round((TEXT_W - GUTTER) * (1 - SIDE_PERCENT / 100), 1)  # ≈ 117
SPLASH_H = 118.0

COLOURS = {
    "ink": "#1f2328",
    "paper": "#ffffff",
    "white": "#ffffff",
    "band": "#005a8c",
    "accent": "#d9822b",
    "tint": "#e8f1f7",
    "grey": "#f3f4f6",
    "rule": "#c9ced3",
    "muted": "#5f6b74",
}
NAMES = {"ink": "Tinta", "paper": "Papel", "white": "Blanco", "band": "Azul del libro", "accent": "Naranja de ejemplos", "tint": "Fondo de recuadros", "grey": "Fondo de comprobaciones", "rule": "Filetes", "muted": "Gris de notas"}
col, COLOR_PALETTE = make_palette(COLOURS, NAMES)
TEXT, SANS = "Source Serif 4", "Source Sans 3"


def T(id_, content, **kw):
    kw.setdefault("family", SANS)
    kw.setdefault("color", "ink")
    return text_el(id_, content, col=col, **kw)


def R(id_, **kw):
    kw.setdefault("color", "rule")
    return rule_el(id_, col=col, **kw)


def B(id_, **kw):
    kw.setdefault("fill", "band")
    return box_el(id_, col=col, **kw)


# --- design ------------------------------------------------------------------------


def running_heads(lang: str) -> dict:
    y = M_TOP - 10.0
    book = ed.BOOK[lang]
    return {
        "elements": [
            T("folioEven", "{pageNumber}", anchor=at("page", "top-left"), offset=(M_OUTER, y), size_pt=9, weight=700, parity="even", pages="body", overflow="ellipsis-end"),
            T("chapterEven", "{chapterTitle}", anchor=at("page", "top-left"), offset=(M_OUTER + 9, y), width=130, size_pt=8, weight=400, color="muted", parity="even", pages="body", overflow="ellipsis-end"),
            T("bookOdd", f"{book['title']} · {book['subtitle'].split(' · ')[0]}", anchor=at("page", "top-right"), offset=(-(M_OUTER + 9), y), width=130, size_pt=8, weight=400, color="muted", align="right", parity="odd", pages="body", overflow="ellipsis-end"),
            T("folioOdd", "{pageNumber}", anchor=at("page", "top-right"), offset=(-M_OUTER, y), size_pt=9, weight=700, align="right", parity="odd", pages="body", overflow="ellipsis-end"),
        ]
    }


def opener_footer() -> dict:
    return {"elements": [T("folioOpener", "{pageNumber}", anchor=at("page", "bottom"), offset=(0, -(M_BOTTOM - 9)), width=30, size_pt=9, weight=700, align="center", pages="opener", overflow="ellipsis-end")]}


def chapter_opener(photo: str, aspect: float, label: str) -> dict:
    img_w = PAGE_W + 6
    img_h = round(img_w / aspect, 1)
    if img_h > SPLASH_H + 20:
        img_h = SPLASH_H + 20
        img_w = round(img_h * aspect, 1)
    y = img_h - 3
    return {
        "enabled": True,
        "minHeight": mm(y - M_TOP + 58),
        "slot": {
            "elements": [
                image_el("splash", photo, anchor=at("bleed", "top-left"), width=img_w, height=img_h),
                B("chapterRule", anchor=at("bleed", "top-left"), offset=(0, y), height=3, fill="band"),
                T("chapterLabel", label + " {number}", anchor=at("page", "top-left"), offset=(M_INNER, y + 9), width=TEXT_W, size_pt=10, weight=700, color="band", textTransform="uppercase", letterSpacing=pt(2.4)),
                T("chapterTitle", "{titleText}", anchor=at("#chapterLabel", "below"), offset=(0, 2), width=TEXT_W, size_pt=30, weight=700, line_height=1.08),
                T("splashCaption", "{attr.splash}", anchor=at("#chapterTitle", "below"), offset=(0, 4), width=TEXT_W, size_pt=8.5, family=TEXT, italic=True, line_height=1.35, color="muted", hyphenate=True),
            ]
        },
    }


def front_opener() -> dict:
    return {
        "enabled": True,
        "minHeight": mm(32),
        "slot": {
            "elements": [
                B("frontStripe", anchor=at("bleed", "top-left"), height=3, fill="band"),
                T("frontTitle", "{titleText}", anchor=at("container", "top-left"), offset=(0, 4), width=TEXT_W, size_pt=26, weight=700, line_height=1.08),
                R("frontRule", anchor=at("#frontTitle", "below"), offset=(0, 5), width=30, color="band", thickness=1.5),
            ]
        },
    }


def cover_design(photo: str, aspect: float) -> dict:
    img_h = 160.0
    img_w = round(img_h * aspect, 1)
    return {
        "enabled": True,
        "minHeight": mm(PAGE_H),
        "slot": {
            "elements": [
                B("coverBg", anchor=at("bleed", "top-left"), fill="band"),
                image_el("coverPhoto", photo, anchor=at("bleed", "top-left"), width=max(img_w, PAGE_W + 6), height=img_h),
                T("coverSeries", "{attr.series}", anchor=at("page", "top-left"), offset=(M_INNER, img_h + 10), width=TEXT_W, size_pt=9, weight=700, color="white", textTransform="uppercase", letterSpacing=pt(2.4)),
                T("coverTitle", "{title}", anchor=at("#coverSeries", "below"), offset=(0, 3), width=TEXT_W, size_pt=46, weight=700, line_height=1.0, color="white"),
                T("coverSubtitle", "{subtitle}", anchor=at("#coverTitle", "below"), offset=(0, 5), width=TEXT_W - 10, size_pt=13, family=TEXT, italic=True, line_height=1.3, color="tint"),
                T("coverPublisher", "{attr.publisher}", anchor=at("page", "bottom-left"), offset=(M_INNER, -14), width=TEXT_W, size_pt=7.5, color="tint", textTransform="uppercase", letterSpacing=pt(1.4)),
            ]
        },
    }


def callout_styles() -> list[dict]:
    body = {"fontFamily": TEXT, "fontSize": pt(9.6), "lineHeight": pt(13.4), "color": col("ink"), "boldColor": col("ink"), "textAlign": "left", "hyphenation": True, "paragraphSpacing": True, "firstLineIndent": mm(0)}
    return [
        {
            "id": "objetivos", "name": "Objetivos", "span": "column", "placement": "here",
            "backgroundEnabled": True, "background": col("tint"), "border": {"enabled": False}, "borderRadius": mm(0),
            "padding": {"top": mm(3.5), "right": mm(4.5), "bottom": mm(3), "left": mm(4.5)},
            "icon": {"kind": "none"},
            "titleStyle": {"fontFamily": SANS, "fontSize": pt(8.5), "fontWeight": 700, "color": col("band"), "textTransform": "uppercase", "letterSpacing": pt(1.6), "gap": mm(2)},
            "body": {**body, "fontSize": pt(9.2), "lineHeight": pt(12.6)},
            "marginTop": pt(4), "marginBottom": pt(10), "keepTogether": True,
        },
        {
            "id": "esquema", "name": "Esquema", "span": "column", "placement": "here",
            "backgroundEnabled": False, "border": {"enabled": False}, "borderRadius": mm(0),
            "padding": {"top": mm(2.5), "right": mm(0), "bottom": mm(2), "left": mm(4)},
            "stripe": {"enabled": True, "side": "left", "width": pt(3), "color": col("band")},
            "icon": {"kind": "none"},
            "titleStyle": {"fontFamily": SANS, "fontSize": pt(8.5), "fontWeight": 700, "color": col("band"), "textTransform": "uppercase", "letterSpacing": pt(1.6), "gap": mm(2)},
            "body": {**body, "fontFamily": SANS, "fontSize": pt(9.5), "lineHeight": pt(13)},
            "marginTop": pt(4), "marginBottom": pt(10), "keepTogether": True,
        },
        {
            "id": "ejemplo", "name": "Ejemplo", "span": "column", "placement": "here",
            "backgroundEnabled": False, "border": {"enabled": True, "color": col("rule"), "width": pt(0.6)}, "borderRadius": mm(0),
            "padding": {"top": mm(3.5), "right": mm(4.5), "bottom": mm(3), "left": mm(4.5)},
            "stripe": {"enabled": True, "side": "left", "width": pt(3), "color": col("accent")},
            "icon": {"kind": "none"},
            "titleStyle": {"fontFamily": SANS, "fontSize": pt(11), "fontWeight": 700, "color": col("accent"), "gap": mm(2)},
            "body": body,
            "marginTop": pt(6), "marginBottom": pt(10), "keepTogether": False, "splitMinLines": 3,
        },
        {
            "id": "comprobacion", "name": "Comprobación", "span": "column", "placement": "here",
            "backgroundEnabled": True, "background": col("grey"), "border": {"enabled": False}, "borderRadius": mm(0),
            "padding": {"top": mm(3), "right": mm(4.5), "bottom": mm(2.5), "left": mm(4.5)},
            "stripe": {"enabled": True, "side": "left", "width": pt(3), "color": col("band")},
            "icon": {"kind": "none"},
            "titleStyle": {"fontFamily": SANS, "fontSize": pt(9), "fontWeight": 700, "color": col("band"), "gap": mm(1.8)},
            "body": {**body, "fontSize": pt(9.2), "lineHeight": pt(12.6)},
            "marginTop": pt(5), "marginBottom": pt(9), "keepTogether": False, "splitMinLines": 2,
        },
        {
            "id": "nota", "name": "Nota", "span": "column", "placement": "here",
            "backgroundEnabled": True, "background": col("tint"), "border": {"enabled": False}, "borderRadius": mm(0),
            "padding": {"top": mm(3), "right": mm(4.5), "bottom": mm(2.5), "left": mm(4.5)},
            "icon": {"kind": "none"},
            "titleStyle": {"fontFamily": SANS, "fontSize": pt(8.5), "fontWeight": 700, "color": col("band"), "textTransform": "uppercase", "letterSpacing": pt(1.4), "gap": mm(1.8)},
            "body": {**body, "fontFamily": SANS, "fontSize": pt(9), "lineHeight": pt(12.4)},
            "marginTop": pt(5), "marginBottom": pt(9), "keepTogether": False, "splitMinLines": 2,
        },
    ]


def resource_types(lang: str) -> list[dict]:
    fig, figs, fshort = ed.BOOK[lang]["figure"]
    tab, tabs, tshort = ed.BOOK[lang]["table"]
    return [
        {"id": "figure", "name": fig, "namePlural": figs, "shortLabel": fshort, "captionPrefix": fig, "numberingTemplate": "{h1}.{n}", "resetOn": "h1", "counterFormat": "decimal", "defaultPlacement": {"position": "auto", "span": "column", "width": 1}},
        {"id": "table", "name": tab, "namePlural": tabs, "shortLabel": tshort, "captionPrefix": tab, "numberingTemplate": "{h1}.{n}", "resetOn": "h1", "counterFormat": "decimal", "defaultPlacement": {"position": "auto", "span": "column"}, "captionStyle": {"position": "above"}},
    ]


def body_text(lang: str) -> dict:
    return {
        "fontFamily": TEXT, "fontSize": pt(10.2), "lineHeight": pt(14.2), "textAlign": "justify",
        "firstLineIndent": mm(0), "indentAfterHeading": False, "paragraphSpacing": True,
        "color": col("ink"), "boldColor": col("ink"), "italicColor": col("ink"),
        "referenceColor": col("band"), "referenceBold": False, "referenceItalic": False,
        "hyphenation": {"enabled": True, "locale": "es" if lang == "es" else "en-us"},
        "avoidWidows": True, "avoidOrphans": True, "optimalLineBreaking": True,
    }


def headings() -> dict:
    return {
        "fontFamily": SANS, "color": col("ink"), "keepWithNext": True,
        "levels": [
            {"level": 1, "fontSize": pt(30), "lineHeight": pt(34), "fontWeight": 700, "span": "page", "breakBefore": {"enabled": True, "parity": "odd"}, "numberingTemplate": "{1}", "advancedDesign": front_opener()},
            {"level": 2, "fontSize": pt(17), "lineHeight": pt(21), "fontWeight": 700, "color": col("band"), "numberingTemplate": "{1}.{2}", "marginTop": pt(22), "marginBottom": pt(6), "breakBefore": {"enabled": True, "parity": "any"}, "span": "page"},
            {"level": 3, "fontSize": pt(12.5), "lineHeight": pt(16), "fontWeight": 700, "numberingTemplate": "", "marginTop": pt(14), "marginBottom": pt(3)},
            {"level": 4, "fontSize": pt(10.8), "lineHeight": pt(14), "fontWeight": 600, "italic": True, "numberingTemplate": "", "marginTop": pt(10), "marginBottom": pt(2)},
        ],
    }


def toc_config() -> dict:
    return {
        "levels": [
            {"level": 1, "fontFamily": SANS, "fontSize": pt(12), "lineHeight": pt(17), "fontWeight": 700, "color": col("ink"), "numberWidth": mm(10), "numberGap": mm(2), "numberFontFamily": SANS, "numberColor": col("band"), "marginTop": pt(8)},
            {"level": 2, "fontFamily": TEXT, "fontSize": pt(10.5), "lineHeight": pt(15), "color": col("ink"), "indent": mm(10), "numberWidth": mm(12), "numberGap": mm(2), "numberFontFamily": SANS, "numberColor": col("band"), "marginTop": pt(1)},
        ],
        "unnumbered": {"fontFamily": SANS, "italic": False, "color": col("ink")},
        "pageNumber": {"fontFamily": SANS, "fontSize": pt(10), "fontWeight": 700, "color": col("ink"), "width": mm(10)},
        "leader": {"enabled": True, "char": ".", "gap": mm(1.2)},
    }


def heading_styles(chapters: dict[str, list[dict]], images: dict[str, dict]) -> list[dict]:
    empty = {"elements": []}
    cover_lang, cover_idx = COVER_SPLASH
    cover_rid = chapters[cover_lang][cover_idx]["splash"]
    styles = [
        {"id": "portada", "name": "Portada", "numbered": False, "toc": False, "span": "page", "breakBefore": {"enabled": True, "parity": "odd"}, "advancedDesign": cover_design(cover_rid, images[cover_rid]["aspect"]), "header": empty, "footer": empty, "layout": {"layoutType": "single"},
         "margins": {"top": mm(PAGE_H - 80), "bottom": mm(M_BOTTOM), "left": mm(PAGE_W - M_OUTER - 85), "right": mm(M_OUTER)}},
        {"id": "indice", "name": "Índice", "numbered": False, "toc": False, "span": "page", "breakBefore": {"enabled": True, "parity": "odd"}, "advancedDesign": front_opener(), "layout": {"layoutType": "single"}},
        {"id": "preliminar", "name": "Página de texto", "numbered": False, "span": "page", "breakBefore": {"enabled": True, "parity": "any"}, "advancedDesign": front_opener(), "layout": {"layoutType": "single"}},
    ]
    for lang in LANGS:
        for i, ch in enumerate(chapters[lang]):
            styles.append({"id": f"cap-{lang}-{i + 1}", "name": f"Capítulo ({lang}) {i + 1}", "span": "page", "breakBefore": {"enabled": True, "parity": "odd"}, "advancedDesign": chapter_opener(ch["splash"], images[ch["splash"]]["aspect"], ed.BOOK[lang]["chapter_label"])})
    return styles


def paragraph_styles() -> list[dict]:
    return [
        {"id": "colofon", "name": "Colofón", "fontSize": pt(8.5), "lineHeight": pt(11.5), "textAlign": "left", "firstLineIndent": mm(0), "spaceBetween": pt(6), "color": col("muted")},
        {"id": "creditos", "name": "Créditos", "fontSize": pt(10.2), "lineHeight": pt(14.2), "textAlign": "left", "firstLineIndent": mm(0), "spaceBetween": pt(6)},
        {"id": "termino", "name": "Término", "fontSize": pt(9.6), "lineHeight": pt(13), "textAlign": "left", "firstLineIndent": mm(0), "spaceBetween": pt(3)},
        {"id": "fuente", "name": "Fuente", "fontFamily": SANS, "fontSize": pt(7.8), "lineHeight": pt(10.5), "textAlign": "left", "firstLineIndent": mm(0), "spaceBetween": pt(4), "marginTop": pt(14), "color": col("muted")},
    ]


def shared_config(chapters: dict[str, list[dict]], images: dict[str, dict]) -> dict:
    return {
        "locale": "es",
        "page": {"sizePreset": "custom", "width": mm(PAGE_W), "height": mm(PAGE_H), "margins": {"top": mm(M_TOP), "bottom": mm(M_BOTTOM), "left": mm(M_INNER), "right": mm(M_OUTER), "mirror": True}, "baselineGrid": {"enabled": False}, "pageNumbering": {"format": "decimal", "startAt": 1}},
        "layout": {"layoutType": "oneAndHalf", "gutterWidth": mm(GUTTER), "sideColumnPercent": SIDE_PERCENT, "sideColumnRole": "floats", "sideColumnSide": "outer"},
        "bodyText": body_text("es"),
        "headings": headings(),
        "headingStyles": heading_styles(chapters, images),
        "paragraphStyles": paragraph_styles(),
        "calloutStyles": callout_styles(),
        "toc": toc_config(),
        "parts": {"design": {"elements": [T("partTitle", "{titleText}", anchor=at("page", "top-left"), offset=(M_INNER, 60), width=TEXT_W, size_pt=30, weight=700)]}},
        "header": running_heads("es"),
        "footer": opener_footer(),
        "math": {"enabled": True, "fontSizeScale": 1.0, "marginTop": pt(6), "marginBottom": pt(6)},
        "captionStyle": {"fontFamily": SANS, "fontSize": pt(8.3), "color": col("ink"), "align": "left", "gap": mm(1.8), "labelBold": True, "labelColor": col("band"), "descriptionItalic": False, "note": {"fontSize": pt(6.8), "color": col("muted"), "italic": False, "gap": mm(0.6)}},
        "tableStyle": {
            "bodyFontFamily": SANS, "bodyFontSize": pt(8.8), "bodyLineHeight": pt(11.8), "bodyColor": col("ink"),
            "headerFontFamily": SANS, "headerFontSize": pt(8.8), "headerBold": True, "headerBackgroundEnabled": True, "headerBackground": col("band"), "headerColor": col("white"),
            "borderColor": col("rule"), "borderWidth": pt(0.5), "cellPadding": mm(1.6), "rules": "horizontal",
        },
        "unorderedLists": {"bulletChar": "•", "color": col("band")},
        "orderedLists": {"color": col("band")},
        "colorPalette": COLOR_PALETTE,
        "resourceTypes": resource_types("es"),
        "pdfGeneration": {"outlines": True},
    }


def localized_config(lang: str) -> dict:
    return {"locale": "es" if lang == "es" else "en-us", "bodyText": body_text(lang), "header": running_heads(lang), "resourceTypes": resource_types(lang)}


# --- content ------------------------------------------------------------------------


def image_spec(lang: str, res: cnxml.Resource, images: dict[str, dict]) -> dict | None:
    src = os.path.join(SOURCE, lang, "media", res.file)
    if not os.path.exists(src):
        print("missing media", res.file, file=sys.stderr)
        return None
    rel = f"resources/{res.id}.jpg"
    if res.id not in images:
        im = Image.open(src)
        if im.mode in ("RGBA", "LA", "P"):
            bg = Image.new("RGB", im.size, (255, 255, 255))
            bg.paste(im.convert("RGBA"), mask=im.convert("RGBA").split()[-1])
            im = bg
        else:
            im = im.convert("RGB")
        if max(im.size) > IMAGE_MAX_PX:
            im.thumbnail((IMAGE_MAX_PX, IMAGE_MAX_PX), Image.LANCZOS)
        im.save(os.path.join(OUT, rel), quality=IMAGE_QUALITY, optimize=True, progressive=True)
        images[res.id] = {"rel": rel, "w": im.width, "h": im.height, "aspect": im.width / im.height}
    p = images[res.id]
    aspect = p["aspect"]
    if aspect < 1.05 or p["w"] < 700:
        placement = {"position": "auto", "span": "side", "width": 1}
    elif aspect > 2.2:
        placement = {"position": "auto", "span": "page", "width": 1}
    else:
        placement = {"position": "auto", "span": "column", "width": 1 if aspect < 1.6 else 0.9, "align": "center"}
    return {"id": res.id, "typeId": "figure", "kind": "bitmap", "file": rel, "width": p["w"], "height": p["h"], "caption": res.caption, "altText": res.alt or res.caption[:120], "placement": placement}


def table_spec(res: cnxml.Resource) -> dict:
    return {"id": res.id, "typeId": "table", "kind": "table", "caption": res.caption, "table": res.table, "placement": {"position": "auto", "span": "page" if res.wide else "column"}}


def build_language(lang: str, images: dict[str, dict]) -> tuple[list[dict], list[dict], list[dict]]:
    """Chapter markdown files, resources and resource wording of one edition."""
    book = ed.BOOK[lang]
    root = os.path.join(SOURCE, lang)
    xml = open(os.path.join(root, "collection.xml"), encoding="utf-8").read()
    all_chapters = chapters_of(xml)
    wanted = [all_chapters[i] for i in BOOKS[lang]["chapters"]]
    conv = cnxml.Converter(lang, book["words"], set(book["skip_sections"]), ed.SKIP_NOTES)
    d = os.path.join(OUT, "chapters", lang)
    os.makedirs(d, exist_ok=True)
    specs: list[dict] = []
    resources: list[dict] = []
    chapters_meta: list[dict] = []
    n_file = 0

    def emit(slug: str, title: str, body: str) -> None:
        nonlocal n_file
        rel = f"chapters/{lang}/{n_file:02d}-{slug}.md"
        with open(os.path.join(OUT, rel), "w", encoding="utf-8") as f:
            f.write(body)
        specs.append({"title": title, "file": rel})
        n_file += 1

    # Convert every module first: the cover needs the splash resource ids.
    converted: list[tuple[str, list[cnxml.Module]]] = []
    for ci, (ctitle, mods) in enumerate(wanted):
        modules = [conv.module(os.path.join(root, "modules", f"{mid}.cnxml"), mid, f"{lang}-{ci + 1}") for mid in mods]
        converted.append((ctitle, modules))
        intro = modules[0]
        if intro.splash is None:
            raise SystemExit(f"{lang} chapter {ci + 1}: no splash figure in {intro.id}")
        spec = image_spec(lang, intro.splash, images)
        spec["placement"] = {"position": "here", "span": "column", "width": 1}
        spec["typeId"] = "figure"
        resources.append(spec)
        chapters_meta.append({"title": ctitle, "splash": intro.splash.id, "splash_caption": intro.splash.caption})

    emit("portada", book["title"], (
        f'---\ntitle: "{book["title"]}"\nsubtitle: "{book["subtitle"]}"\n---\n\n'
        f'# {book["title"]} {{style="portada" toc="false" series="{attr_value(book["series"])}" publisher="{attr_value(book["publisher"])}"}}\n\n'
        f':::pagebreak\n\n:::paragraphs{{style="colofon"}}\n{ed.COVER_BLURB[lang]}\n:::\n'
    ))
    emit("indice" if lang == "es" else "contents", book["contents"], f'# {book["contents"]} {{style="indice" toc="false"}}\n\n:::toc\n')

    for ci, (ctitle, modules) in enumerate(converted):
        intro, sections = modules[0], modules[1:]
        lines = []
        if ci == 0:
            lines.append(':::numbering{format="decimal" startAt=1}\n')
        # The caption goes into a heading attribute: no formulas, braces or
        # markdown there (they would end the attribute block).
        splash_cap = re.sub(r"\$[^$]*\$", "", intro.splash.caption)
        splash_cap = re.sub(r"[{}\[\]*_\\]", "", splash_cap)
        splash_cap = re.sub(r"\s+", " ", splash_cap).replace("( ", "(").replace(" )", ")").strip()
        lines.append(f'# {ctitle} {{style="cap-{lang}-{ci + 1}" splash="{attr_value(splash_cap)}"}}\n')
        outline = "\n".join(f"{ci + 1}.{i + 1} {m.title}" for i, m in enumerate(sections))
        lines.append(f':::callout{{type="esquema" title="{attr_value(book["outline"])}"}}\n{outline}\n:::\n')
        lines += [b + "\n" for b in intro.blocks]
        for r in intro.resources:
            spec = image_spec(lang, r, images) if r.kind == "bitmap" else table_spec(r)
            if spec:
                resources.append(spec)
        for m in sections:
            lines.append(f"## {m.title}\n")
            if m.objectives:
                lines.append(f':::callout{{type="objetivos" title="{attr_value(book["objectives"])}"}}\n' + "\n".join("- " + o for o in m.objectives) + "\n:::\n")
            lines += [b + "\n" for b in m.blocks]
            if m.glossary:
                lines.append(f"### {book['key_terms']}\n")
                lines.append(':::paragraphs{style="termino"}\n' + "\n\n".join(f"**{t}** {mean}" for t, mean in m.glossary) + "\n:::\n")
            for r in m.resources:
                spec = image_spec(lang, r, images) if r.kind == "bitmap" else table_spec(r)
                if spec:
                    resources.append(spec)
        lines.append(f':::paragraphs{{style="fuente"}}\n{book["source_line"]}\n:::\n')
        slug = re.sub(r"[^a-z0-9]+", "-", ctitle.lower().encode("ascii", "ignore").decode()).strip("-") or f"capitulo-{ci + 1}"
        emit(f"{ci + 1:02d}-{slug}", ctitle, "\n".join(lines))

    paras = "\n\n".join(ed.CREDITS[lang])
    emit("creditos" if lang == "es" else "credits", book["credits"], f'# {book["credits"]} {{style="preliminar"}}\n\n:::paragraphs{{style="creditos"}}\n{paras}\n:::\n')
    return specs, resources, chapters_meta


# --- fonts -------------------------------------------------------------------------


def build_fonts() -> list[dict]:
    fonts_dir = os.path.join(OUT, "fonts")
    os.makedirs(fonts_dir, exist_ok=True)
    fam: dict[str, list[dict]] = {TEXT: [], SANS: []}
    src = lambda r: os.path.join(SOURCE, "fonts", r)  # noqa: E731
    ss = {"opsz": 12}
    for w in (400, 600, 700):
        fam[TEXT].append({"weight": w, "style": "normal", "file": "fonts/" + instance_font(src("sourceserif4/SourceSerif4[opsz,wght].ttf"), fonts_dir, "SourceSerif4", ss, w, False)})
    for w in (400, 700):
        fam[TEXT].append({"weight": w, "style": "italic", "file": "fonts/" + instance_font(src("sourceserif4/SourceSerif4-Italic[opsz,wght].ttf"), fonts_dir, "SourceSerif4", ss, w, True)})
    for w in (400, 600, 700):
        fam[SANS].append({"weight": w, "style": "normal", "file": "fonts/" + instance_font(src("sourcesans3/SourceSans3[wght].ttf"), fonts_dir, "SourceSans3", {}, w, False)})
    for w in (400, 600):
        fam[SANS].append({"weight": w, "style": "italic", "file": "fonts/" + instance_font(src("sourcesans3/SourceSans3-Italic[wght].ttf"), fonts_dir, "SourceSans3", {}, w, True)})
    copy_licences(os.path.join(SOURCE, "fonts"), fonts_dir, {"sourceserif4": "SourceSerif4-OFL.txt", "sourcesans3": "SourceSans3-OFL.txt"})
    return [{"name": n, "variants": v} for n, v in fam.items()]


# --- credits & manifest -----------------------------------------------------------


def write_credits_md(chapters: dict[str, list[dict]]) -> None:
    lines = ["# Credits — Física universitaria / Physics (OpenStax)", "",
             "Showcase preset for the Postext sandbox: the first two chapters of two OpenStax",
             "textbooks published under the Creative Commons Attribution 4.0 licence.", ""]
    for lang in LANGS:
        b = ed.BOOK[lang]
        lines += [f"## {b['title']} ({lang})", "", f"- {b['attribution']}", f"- Book page: {b['book_url']}", f"- Source repository: https://github.com/{BOOKS[lang]['repo']}", "- Chapters: " + "; ".join(c["title"] for c in chapters[lang]), ""]
    lines += ["Figure credits are kept in the captions as OpenStax publishes them. Teacher notes,",
              "interactive iframes and the problem sets are omitted; formulas are converted from",
              "MathML to LaTeX by `cnxml.py`.", "",
              "## Fonts (SIL Open Font License 1.1)", "",
              "- Source Serif 4 — Frank Grießhammer, Adobe (`fonts/SourceSerif4-OFL.txt`)",
              "- Source Sans 3 — Paul D. Hunt, Adobe (`fonts/SourceSans3-OFL.txt`)", "",
              "## Build", "",
              "`scripts/presets/showcase/openstax-fisica/` in the Postext repository: `fetch.py`",
              "downloads the CNXML modules, media and fonts; `build.py` writes this bundle.", ""]
    with open(os.path.join(OUT, "CREDITS.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def write_manifest(chapter_specs, resources, wording, fonts, chapters, images) -> dict:
    meta = {
        "id": PRESET_ID,
        "name": "Física universitaria · Physics (OpenStax)",
        "description": "Libro de texto a columna y media con ejemplos resueltos, comprobaciones, tablas y fórmulas · A column-and-a-half textbook with worked examples, checks, tables and formulas",
        "locale": "es",
        "locales": ["es", "en"],
        "thumbnail": "thumbnail.jpg",
        "license": "CC BY 4.0",
        "credits": "OpenStax, Rice University",
        "tags": ["textbook", "one-and-a-half", "math", "callouts", "tables"],
    }
    manifest = {
        "version": 2, **meta, "chapters": chapter_specs, "config": shared_config(chapters, images),
        "localized": {lang: {"config": localized_config(lang), "resources": wording[lang]} for lang in LANGS},
        "resources": resources, "fonts": fonts,
    }
    with open(os.path.join(OUT, "preset.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=1, ensure_ascii=False)
        f.write("\n")
    return meta


def main() -> None:
    if not os.path.exists(os.path.join(SOURCE, "es", "collection.xml")):
        raise SystemExit("run fetch.py first")
    for sub in ("chapters", "resources"):
        shutil.rmtree(os.path.join(OUT, sub), ignore_errors=True)
    os.makedirs(os.path.join(OUT, "resources"), exist_ok=True)
    images: dict[str, dict] = {}
    chapter_specs: dict[str, list[dict]] = {}
    resources: list[dict] = []
    wording: dict[str, list[dict]] = {lang: [] for lang in LANGS}
    chapters: dict[str, list[dict]] = {}
    for lang in LANGS:
        specs, res, meta = build_language(lang, images)
        chapter_specs[lang] = specs
        chapters[lang] = meta
        # Resources are per edition (different books): the shared list holds
        # every resource; the wording map carries nothing extra.
        resources += res
    fonts = build_fonts()
    write_credits_md(chapters)
    meta = write_manifest(chapter_specs, resources, wording, fonts, chapters, images)
    copy_thumbnail(HERE, OUT)
    write_fingerprint(OUT)
    register(PRESET_ID, meta)
    print(f"wrote {OUT}  ({bundle_size(OUT):.1f} MB, {len(resources)} resources, {sum(len(v) for v in chapter_specs.values())} chapter files)")


if __name__ == "__main__":
    main()
