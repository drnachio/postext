#!/usr/bin/env python3
"""Build the `senales` showcase preset bundle from `source/` (see fetch.py)
into `apps/web/public/presets/senales/` and register it in the public
`index.json`.

    python3 scripts/presets/showcase/senales/fetch.py   # once
    python3 scripts/presets/showcase/senales/build.py

EEA Signals 2020 re-set as a 168 × 237 mm two-column magazine: every
article opens under a full-bleed photograph with a coloured rule, kicker,
headline and standfirst; grey boxes, pull quotes, a data table and a
three-column figures panel replace the original infographics; the
copyrighted pictures are swapped for CC0 photographs. Open Sans text,
Outfit display.
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
import extract  # noqa: E402
from _common import (  # noqa: E402
    PRESETS_ROOT, at, attr_value, box_el, bundle_size, copy_licences, copy_thumbnail, image_el, instance_font,
    make_palette, mm, pt, register, rule_el, text_el, write_fingerprint,
)
from fetch import PDFS, PHOTOS  # noqa: E402

SOURCE = os.path.join(HERE, "source")
PRESET_ID = "senales"
OUT = os.path.join(PRESETS_ROOT, PRESET_ID)
LANGS = ("es", "en")
ARTICLE_PAGES = (4, 63)
REFERENCES_FROM = 64
PHOTO_MAX_PX = 2400
PHOTO_QUALITY = 80

# --- geometry & palette ------------------------------------------------------------

PAGE_W, PAGE_H = 168.0, 237.0
M_TOP, M_BOTTOM, M_INNER, M_OUTER = 22.0, 20.0, 16.0, 14.0
TEXT_W = PAGE_W - M_INNER - M_OUTER  # 138
GUTTER = 6.0
OPENER_PHOTO_H = 118.0

COLOURS = {
    "ink": "#1c1f22",
    "paper": "#ffffff",
    "white": "#ffffff",
    "band": "#1f6f8b",
    "tint": "#e8f0f3",
    "grey": "#f2f1ed",
    "rule": "#cfd4d8",
    "muted": "#676c72",
}
NAMES = {"ink": "Tinta", "paper": "Papel", "white": "Blanco", "band": "Color de la revista", "tint": "Fondo de recuadros", "grey": "Fondo de datos", "rule": "Filetes", "muted": "Gris de notas"}
col, COLOR_PALETTE = make_palette(COLOURS, NAMES)
DISPLAY, TEXT = "Outfit", "Open Sans"


def lit(hex_: str) -> dict:
    return {"hex": hex_, "model": "hex"}


def T(id_, content, **kw):
    kw.setdefault("family", TEXT)
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
            T("folioEven", "{pageNumber}", anchor=at("page", "top-left"), offset=(M_OUTER, y), size_pt=8.5, family=DISPLAY, weight=700, parity="even", pages="body", overflow="ellipsis-end"),
            T("chapterEven", "{chapterTitle}", anchor=at("page", "top-left"), offset=(M_OUTER + 8, y), width=110, size_pt=7.5, family=DISPLAY, weight=500, color="muted", parity="even", pages="body", overflow="ellipsis-end", textTransform="uppercase", letterSpacing=pt(1.2)),
            T("titleOdd", f"{book['title']} · {book['subtitle']}", anchor=at("page", "top-right"), offset=(-(M_OUTER + 8), y), width=120, size_pt=7.5, family=DISPLAY, weight=500, color="muted", align="right", parity="odd", pages="body", overflow="ellipsis-end", textTransform="uppercase", letterSpacing=pt(1.2)),
            T("folioOdd", "{pageNumber}", anchor=at("page", "top-right"), offset=(-M_OUTER, y), size_pt=8.5, family=DISPLAY, weight=700, align="right", parity="odd", pages="body", overflow="ellipsis-end"),
        ]
    }


def opener_footer() -> dict:
    return {"elements": [T("folioOpener", "{pageNumber}", anchor=at("page", "bottom"), offset=(0, -(M_BOTTOM - 8)), width=30, size_pt=8.5, family=DISPLAY, weight=700, align="center", pages="opener", overflow="ellipsis-end")]}


def article_opener(photo: str, aspect: float, colour: str) -> dict:
    """Full-bleed photograph across the head of the page, the article's
    colour rule under it, then kicker, headline and standfirst."""
    img_w = PAGE_W + 6
    img_h = round(img_w / aspect, 1)
    if img_h > OPENER_PHOTO_H + 12:
        img_h = OPENER_PHOTO_H + 12
        img_w = round(img_h * aspect, 1)
    y = img_h - 3
    return {
        "enabled": True,
        "minHeight": mm(y - M_TOP + 64),
        "slot": {
            "elements": [
                image_el("openerPhoto", photo, anchor=at("bleed", "top-left"), width=img_w, height=img_h),
                B("openerRule", anchor=at("bleed", "top-left"), offset=(0, y), height=3, fill="band", style={"backgroundColor": lit(colour), "borderRadius": mm(0)}),
                T("kicker", "{attr.kicker}", anchor=at("page", "top-left"), offset=(M_INNER, y + 9), width=TEXT_W, size_pt=8, family=DISPLAY, weight=700, color="band", textTransform="uppercase", letterSpacing=pt(2.2)),
                T("headline", "{titleText}", anchor=at("#kicker", "below"), offset=(0, 2.5), width=TEXT_W, size_pt=23, family=DISPLAY, weight=800, line_height=1.06),
                T("standfirst", "{attr.standfirst}", anchor=at("#headline", "below"), offset=(0, 4), width=TEXT_W, size_pt=10, weight=600, line_height=1.4, hyphenate=True),
            ]
        },
    }


def front_opener() -> dict:
    return {
        "enabled": True,
        "minHeight": mm(34),
        "slot": {
            "elements": [
                B("frontStripe", anchor=at("bleed", "top-left"), height=3, fill="band"),
                T("frontTitle", "{titleText}", anchor=at("container", "top-left"), offset=(0, 4), width=TEXT_W, size_pt=24, family=DISPLAY, weight=800, line_height=1.06),
                R("frontRule", anchor=at("#frontTitle", "below"), offset=(0, 5), width=30, color="band", thickness=1.5),
            ]
        },
    }


def cover_design(photo: str, aspect: float) -> dict:
    img_h = 152.0
    img_w = round(img_h * aspect, 1)
    return {
        "enabled": True,
        "minHeight": mm(PAGE_H),
        "slot": {
            "elements": [
                B("coverBg", anchor=at("bleed", "top-left"), fill="ink"),
                image_el("coverPhoto", photo, anchor=at("bleed", "top-left"), width=max(img_w, PAGE_W + 6), height=img_h),
                B("coverRule", anchor=at("bleed", "top-left"), offset=(0, img_h - 3), height=3, fill="band"),
                T("coverSeries", "{attr.series}", anchor=at("page", "top-left"), offset=(M_INNER, img_h + 8), width=TEXT_W, size_pt=8, family=DISPLAY, weight=700, color="band", textTransform="uppercase", letterSpacing=pt(2.4)),
                T("coverTitle", "{title}", anchor=at("#coverSeries", "below"), offset=(0, 2), width=TEXT_W, size_pt=48, family=DISPLAY, weight=800, line_height=1.0, color="white"),
                T("coverSubtitle", "{subtitle}", anchor=at("#coverTitle", "below"), offset=(0, 4), width=TEXT_W - 20, size_pt=14, family=DISPLAY, weight=500, line_height=1.25, color="rule"),
                T("coverPublisher", "{attr.publisher}", anchor=at("page", "bottom-left"), offset=(M_INNER, -13), width=TEXT_W, size_pt=7, family=DISPLAY, color="muted", textTransform="uppercase", letterSpacing=pt(1.4)),
            ]
        },
    }


def callout_styles() -> list[dict]:
    return [
        {
            "id": "recuadro", "name": "Recuadro", "span": "page", "placement": "here",
            "backgroundEnabled": True, "background": col("tint"), "border": {"enabled": False}, "borderRadius": mm(0),
            "padding": {"top": mm(4), "right": mm(5), "bottom": mm(3.5), "left": mm(5)},
            "stripe": {"enabled": True, "side": "left", "width": pt(3), "color": col("band")},
            "icon": {"kind": "none"}, "columnGap": mm(6),
            "titleStyle": {"fontFamily": DISPLAY, "fontSize": pt(11), "fontWeight": 700, "color": col("band"), "gap": mm(2)},
            "body": {"fontFamily": TEXT, "fontSize": pt(9), "lineHeight": pt(12.5), "color": col("ink"), "boldColor": col("ink"), "textAlign": "left", "hyphenation": True, "paragraphSpacing": True, "firstLineIndent": mm(0)},
            "marginTop": pt(6), "marginBottom": pt(10), "keepTogether": False,
        },
        {
            "id": "cita", "name": "Cita destacada", "span": "column", "placement": "here",
            "backgroundEnabled": False, "border": {"enabled": False}, "borderRadius": mm(0),
            "padding": {"top": mm(3), "right": mm(0), "bottom": mm(2), "left": mm(0)},
            "stripe": {"enabled": True, "side": "top", "width": pt(2.5), "color": col("band")},
            "icon": {"kind": "none"},
            "body": {"fontFamily": DISPLAY, "fontSize": pt(13), "lineHeight": pt(16), "color": col("band"), "boldColor": col("band"), "textAlign": "left", "hyphenation": False, "paragraphSpacing": False, "firstLineIndent": mm(0)},
            "marginTop": pt(6), "marginBottom": pt(10), "keepTogether": True,
        },
        {
            "id": "datos", "name": "Datos", "span": "page", "placement": "here",
            "backgroundEnabled": True, "background": col("grey"), "border": {"enabled": False}, "borderRadius": mm(0),
            "padding": {"top": mm(4), "right": mm(5), "bottom": mm(3.5), "left": mm(5)},
            "icon": {"kind": "none"}, "columnGap": mm(6),
            "titleStyle": {"fontFamily": DISPLAY, "fontSize": pt(8), "fontWeight": 700, "color": col("band"), "textTransform": "uppercase", "letterSpacing": pt(1.8), "gap": mm(2.5)},
            "body": {"fontFamily": TEXT, "fontSize": pt(8.5), "lineHeight": pt(11.5), "color": col("ink"), "boldColor": col("band"), "textAlign": "left", "hyphenation": True, "paragraphSpacing": True, "firstLineIndent": mm(0)},
            "marginTop": pt(6), "marginBottom": pt(10), "keepTogether": False,
        },
        {
            "id": "cifras", "name": "Cifras", "span": "page", "placement": "here",
            "backgroundEnabled": True, "background": col("ink"), "border": {"enabled": False}, "borderRadius": mm(0),
            "padding": {"top": mm(5), "right": mm(6), "bottom": mm(4), "left": mm(6)},
            "icon": {"kind": "none"}, "columnGap": mm(8),
            "titleStyle": {"fontFamily": DISPLAY, "fontSize": pt(8), "fontWeight": 700, "color": col("band"), "textTransform": "uppercase", "letterSpacing": pt(1.8), "gap": mm(3)},
            "body": {"fontFamily": DISPLAY, "fontSize": pt(10), "lineHeight": pt(14), "color": col("white"), "boldColor": col("white"), "textAlign": "left", "hyphenation": False, "paragraphSpacing": True, "firstLineIndent": mm(0)},
            "marginTop": pt(8), "marginBottom": pt(12), "keepTogether": True,
        },
    ]


def resource_types(lang: str) -> list[dict]:
    fig, figs, fshort = ed.BOOK[lang]["figure"]
    tab, tabs, tshort = ed.BOOK[lang]["table"]
    return [
        {"id": "photo", "name": fig, "namePlural": figs, "shortLabel": fshort, "captionPrefix": "", "numberingTemplate": "", "resetOn": "never", "counterFormat": "decimal", "defaultPlacement": {"position": "auto", "span": "page", "width": 1}},
        {"id": "table", "name": tab, "namePlural": tabs, "shortLabel": tshort, "captionPrefix": tab, "numberingTemplate": "{n}", "resetOn": "never", "counterFormat": "decimal", "defaultPlacement": {"position": "here", "span": "page"}, "captionStyle": {"position": "above"}},
    ]


def body_text(lang: str) -> dict:
    return {
        "fontFamily": TEXT, "fontSize": pt(9.3), "lineHeight": pt(13.2), "textAlign": "left",
        "firstLineIndent": mm(0), "indentAfterHeading": False, "paragraphSpacing": True,
        "color": col("ink"), "boldColor": col("ink"), "italicColor": col("ink"),
        "referenceColor": col("band"), "referenceBold": False, "referenceItalic": True,
        "hyphenation": {"enabled": True, "locale": "es" if lang == "es" else "en-us"},
        "avoidWidows": True, "avoidOrphans": True, "optimalLineBreaking": True,
    }


def headings() -> dict:
    return {
        "fontFamily": DISPLAY, "color": col("ink"), "keepWithNext": True,
        "levels": [
            {"level": 1, "fontSize": pt(23), "lineHeight": pt(26), "span": "page", "breakBefore": {"enabled": True, "parity": "odd"}, "advancedDesign": front_opener()},
            {"level": 2, "fontSize": pt(11.5), "lineHeight": pt(14), "fontWeight": 700, "color": col("band"), "marginTop": pt(12), "marginBottom": pt(3)},
        ],
    }


def toc_config() -> dict:
    return {
        "levels": [
            {"level": 1, "fontFamily": DISPLAY, "fontSize": pt(11), "lineHeight": pt(16), "fontWeight": 700, "color": col("ink"), "numberWidth": mm(0), "numberGap": mm(0), "marginTop": pt(6)},
        ],
        "unnumbered": {"fontFamily": DISPLAY, "italic": False, "color": col("ink")},
        "pageNumber": {"fontFamily": DISPLAY, "fontSize": pt(10), "fontWeight": 700, "color": col("band"), "width": mm(10)},
        "leader": {"enabled": True, "char": ".", "gap": mm(1.2)},
    }


def heading_styles(photos: dict[str, dict]) -> list[dict]:
    empty = {"elements": []}
    styles = [
        {"id": "portada", "name": "Portada", "numbered": False, "toc": False, "span": "page", "breakBefore": {"enabled": True, "parity": "odd"}, "advancedDesign": cover_design("photo-cover", photos["cover"]["aspect"]), "header": empty, "footer": empty, "layout": {"layoutType": "single"},
         "margins": {"top": mm(PAGE_H - 78), "bottom": mm(M_BOTTOM), "left": mm(PAGE_W - M_OUTER - 80), "right": mm(M_OUTER)}},
        {"id": "sumario", "name": "Sumario", "numbered": False, "toc": False, "span": "page", "breakBefore": {"enabled": True, "parity": "odd"}, "advancedDesign": front_opener(), "layout": {"layoutType": "single"}},
        {"id": "preliminar", "name": "Página de texto", "numbered": False, "span": "page", "breakBefore": {"enabled": True, "parity": "any"}, "advancedDesign": front_opener()},
    ]
    for spec in ed.ARTICLES:
        pid = spec["photos"][0]
        styles.append({"id": f"art-{spec['slug']}", "name": spec["kicker"]["es"], "numbered": False, "span": "page", "breakBefore": {"enabled": True, "parity": "odd"}, "advancedDesign": article_opener(f"photo-{pid}", photos[pid]["aspect"], spec["colour"])})
    return styles


def paragraph_styles() -> list[dict]:
    return [
        {"id": "pregunta", "name": "Pregunta", "fontFamily": TEXT, "fontSize": pt(9.6), "lineHeight": pt(13.2), "fontWeight": 700, "textAlign": "left", "firstLineIndent": mm(0), "spaceBetween": pt(6), "marginTop": pt(6), "color": col("band")},
        {"id": "firma", "name": "Firma", "fontFamily": DISPLAY, "fontSize": pt(9), "lineHeight": pt(12.5), "fontWeight": 500, "textAlign": "left", "firstLineIndent": mm(0), "spaceBetween": pt(4), "marginTop": pt(8), "color": col("muted")},
        {"id": "fuentes", "name": "Fuentes", "fontFamily": TEXT, "fontSize": pt(7.2), "lineHeight": pt(9.8), "textAlign": "left", "firstLineIndent": mm(0), "spaceBetween": pt(3), "color": col("muted")},
        {"id": "colofon", "name": "Colofón", "fontFamily": TEXT, "fontSize": pt(8), "lineHeight": pt(11), "textAlign": "left", "firstLineIndent": mm(0), "spaceBetween": pt(6), "color": col("muted")},
        {"id": "creditos", "name": "Créditos", "fontFamily": TEXT, "fontSize": pt(9.3), "lineHeight": pt(13.2), "textAlign": "left", "firstLineIndent": mm(0), "spaceBetween": pt(6)},
        {"id": "referencia", "name": "Referencia", "fontFamily": TEXT, "fontSize": pt(8), "lineHeight": pt(11), "textAlign": "left", "firstLineIndent": mm(0), "spaceBetween": pt(3), "color": col("ink")},
    ]


def shared_config(photos: dict[str, dict]) -> dict:
    return {
        "locale": "es",
        "page": {"sizePreset": "custom", "width": mm(PAGE_W), "height": mm(PAGE_H), "margins": {"top": mm(M_TOP), "bottom": mm(M_BOTTOM), "left": mm(M_INNER), "right": mm(M_OUTER), "mirror": True}, "baselineGrid": {"enabled": False}, "pageNumbering": {"format": "decimal", "startAt": 1}},
        "layout": {"layoutType": "double", "gutterWidth": mm(GUTTER)},
        "bodyText": body_text("es"),
        "headings": headings(),
        "headingStyles": heading_styles(photos),
        "paragraphStyles": paragraph_styles(),
        "calloutStyles": callout_styles(),
        "toc": toc_config(),
        # No parts in the magazine: a plain design keeps the sandbox from
        # checking the engine default, which references front-matter fields.
        "parts": {"design": {"elements": [T("partTitle", "{titleText}", anchor=at("page", "top-left"), offset=(M_INNER, 60), width=TEXT_W, size_pt=30, family=DISPLAY, weight=800)]}},
        "header": running_heads("es"),
        "footer": opener_footer(),
        "captionStyle": {"fontFamily": DISPLAY, "fontSize": pt(7.5), "color": col("ink"), "align": "left", "gap": mm(1.6), "labelBold": True, "labelColor": col("band"), "descriptionItalic": False, "note": {"fontSize": pt(6.3), "color": col("muted"), "italic": False, "gap": mm(0.6)}},
        "tableStyle": {
            "bodyFontFamily": TEXT, "bodyFontSize": pt(8.5), "bodyLineHeight": pt(11.5), "bodyColor": col("ink"),
            "headerFontFamily": DISPLAY, "headerFontSize": pt(8.5), "headerBold": True, "headerBackgroundEnabled": True, "headerBackground": col("band"), "headerColor": col("white"),
            "borderColor": col("rule"), "borderWidth": pt(0.5), "cellPadding": mm(1.8), "rules": "horizontal",
        },
        "unorderedLists": {"bulletChar": "•", "color": col("band")},
        "orderedLists": {"color": col("band")},
        "colorPalette": COLOR_PALETTE,
        "resourceTypes": resource_types("es"),
        "pdfGeneration": {"outlines": True},
    }


def localized_config(lang: str) -> dict:
    return {"locale": "es" if lang == "es" else "en-us", "bodyText": body_text(lang), "header": running_heads(lang), "resourceTypes": resource_types(lang)}


# --- photographs ------------------------------------------------------------------------


def render_photos() -> dict[str, dict]:
    meta = json.load(open(os.path.join(SOURCE, "photos.json"), encoding="utf-8"))
    os.makedirs(os.path.join(OUT, "resources"), exist_ok=True)
    out: dict[str, dict] = {}
    for pid in PHOTOS:
        m = meta[pid]
        src = os.path.join(SOURCE, "photos", f"{pid}.jpg")
        rel = f"resources/{pid}.jpg"
        im = Image.open(src).convert("RGB")
        if max(im.size) > PHOTO_MAX_PX:
            im.thumbnail((PHOTO_MAX_PX, PHOTO_MAX_PX), Image.LANCZOS)
        im.save(os.path.join(OUT, rel), quality=PHOTO_QUALITY, optimize=True, progressive=True)
        out[pid] = {"rel": rel, "w": im.width, "h": im.height, "aspect": im.width / im.height, **m}
    return out


def author_name(p: dict) -> str:
    """Commons appends the Unsplash handle to the name ("Ana Pérez anaperez")."""
    words = (p["author"] or "").split()
    if len(words) >= 2 and words[-1].islower() and words[-1] == "".join(words[:-1]).lower().replace(" ", ""):
        words = words[:-1]
    return " ".join(words) or "Unsplash"


def photo_caption(p: dict, lang: str) -> str:
    author = author_name(p)
    return (f"Fotografía: {author} · Unsplash, {p['licence']}" if lang == "es" else f"Photograph: {author} · Unsplash, {p['licence']}")


def table_resource(page: int, lang: str) -> dict:
    panel = ed.PANELS[page]
    rows = [[{"content": h, "isHeader": True} for h in panel["header"][lang]]]
    for r in panel["rows"]:
        rows.append([{"content": f"**{r[0]}**"}, {"content": r[1]}, {"content": r[2]}])
    return {"model": {"rows": rows, "headerRowCount": 1, "columnWidths": [1.2, 2, 2]}}


def resource_specs(photos: dict[str, dict]) -> tuple[list[dict], dict[str, list[dict]]]:
    shared: list[dict] = []
    wording: dict[str, list[dict]] = {lang: [] for lang in LANGS}
    for pid, p in photos.items():
        shared.append({"id": f"photo-{pid}", "typeId": "photo", "kind": "bitmap", "file": p["rel"], "width": p["w"], "height": p["h"],
                       "caption": photo_caption(p, "es"), "note": ed.BOOK["es"]["photo_note"], "altText": p["title"].replace("File:", "").rsplit(".", 1)[0],
                       "placement": {"position": "auto", "span": "page", "width": 1}})
        for lang in LANGS:
            wording[lang].append({"id": f"photo-{pid}", "caption": photo_caption(p, lang), "note": ed.BOOK[lang]["photo_note"], "altText": p["title"].replace("File:", "").rsplit(".", 1)[0]})
    for page, panel in ed.PANELS.items():
        if panel["kind"] != "table":
            continue
        rid = f"tabla-{page}"
        shared.append({"id": rid, "typeId": "table", "kind": "table", "caption": panel["caption"]["es"], "note": ed.BOOK["es"]["sources_label"] + ": " + panel["sources"]["es"], "table": table_resource(page, "es")})
        for lang in LANGS:
            wording[lang].append({"id": rid, "caption": panel["caption"][lang], "note": ed.BOOK[lang]["sources_label"] + ": " + panel["sources"][lang], "table": table_resource(page, lang)})
    return shared, wording


# --- chapters ------------------------------------------------------------------------

SENTENCE_END = re.compile(r"(?<=[.!?])\s+")


def pull_quote(article: extract.Article) -> str:
    """A sentence with a figure in it (12–28 words, no URL), else the first
    sentence of the third paragraph."""
    paras = [b.text for b in article.blocks if b.kind == "paragraph" and not b.text.startswith(("•", "**"))]
    for text in paras:
        for s in SENTENCE_END.split(text):
            w = len(s.split())
            if re.search(r"\d", s) and 12 <= w <= 28 and "www." not in s and "http" not in s:
                return s.strip()
    if len(paras) >= 3:
        return SENTENCE_END.split(paras[2])[0]
    return ""


def bullets(text: str) -> list[str]:
    """Paragraphs that carry '•' items become a list."""
    if "•" not in text:
        return [text]
    parts = [p.strip() for p in text.split("•") if p.strip()]
    return ["- " + p for p in parts]


def panel_markdown(page: int, title: str, intro: str, lang: str) -> str:
    book = ed.BOOK[lang]
    panel = ed.PANELS.get(page)
    if panel is None:
        if not intro:
            return ""
        return f':::callout{{type="datos" title="{attr_value(title)}"}}\n{intro}\n:::\n'
    if panel["kind"] == "list":
        items = "\n".join("- " + it for it in panel["items"][lang])
        return f':::callout{{type="datos" title="{attr_value(title)}"}}\n{intro}\n\n{items}\n\n*{book["sources_label"]}: {panel["sources"][lang]}*\n:::\n'
    if panel["kind"] == "table":
        return f':::callout{{type="datos" title="{attr_value(title)}"}}\n{intro}\n:::\n\n::resource{{id="tabla-{page}"}}\n'
    if panel["kind"] == "stats":
        stats = "\n\n".join(f"**{n}** {label}" for n, label in panel["stats"][lang])
        return f':::callout{{type="cifras" title="{attr_value(title)}"}}\n{panel["lead"][lang]}\n\n:::columns{{count=3}}\n{stats}\n:::\n\n*{book["sources_label"]}: {panel["sources"][lang]}*\n:::\n'
    return ""


def article_markdown(article: extract.Article, spec: dict, lang: str) -> str:
    book = ed.BOOK[lang]
    kicker = spec["kicker"][lang]
    lines = [f'# {article.title} {{style="art-{spec["slug"]}" kicker="{attr_value(kicker)}" standfirst="{attr_value(article.standfirst)}"}}', ""]
    inline_photo = f'::resource{{id="photo-{spec["photos"][1]}"}}\n'
    quote = pull_quote(article)
    n_para = 0
    photo_done = False
    quote_done = False
    infographics = sorted(article.infographics, key=lambda t: t[0])
    ig_idx = 0
    for b in article.blocks:
        while ig_idx < len(infographics) and infographics[ig_idx][0] < b.page:
            pg, title, intro = infographics[ig_idx]
            md = panel_markdown(pg, title, intro, lang)
            if md:
                lines.append(md)
            ig_idx += 1
        if b.kind == "paragraph":
            for item in bullets(b.text):
                lines.append(item + "\n" if not item.startswith("- ") else item)
            if lines[-1].startswith("- "):
                lines.append("")
            n_para += 1
            if n_para == 3 and not photo_done:
                lines.append(inline_photo)
                photo_done = True
            if n_para == 6 and quote and not quote_done:
                q = f"«{quote}»" if lang == "es" else f"“{quote}”"
                lines.append(f':::callout{{type="cita"}}\n{q}\n:::\n')
                quote_done = True
        elif b.kind == "subhead":
            lines.append(f"## {b.text}\n")
        elif b.kind == "question":
            lines.append(f':::paragraphs{{style="pregunta"}}\n{b.text}\n:::\n')
        elif b.kind == "signature":
            lines.append(f':::paragraphs{{style="firma"}}\n{b.text}\n:::\n')
        elif b.kind == "box":
            body = "\n\n".join("\n".join(bullets(p)) for p in b.paras)
            lines.append(f':::callout{{type="recuadro" title="{attr_value(b.title)}"}}\n{body}\n:::\n')
        # pulled figures ("83 %") have no label of their own: dropped
    while ig_idx < len(infographics):
        pg, title, intro = infographics[ig_idx]
        md = panel_markdown(pg, title, intro, lang)
        if md:
            lines.append(md)
        ig_idx += 1
    if not photo_done:
        lines.append(inline_photo)
    return "\n".join(lines)


def write_chapters(lang: str, ex: extract.Extraction, photos: dict[str, dict]) -> list[dict]:
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
    emit("sumario" if lang == "es" else "contents", book["contents"], f'# {book["contents"]} {{style="sumario" toc="false"}}\n\n:::toc\n')
    if len(ex.articles) != len(ed.ARTICLES):
        raise SystemExit(f"{lang}: {len(ex.articles)} articles extracted, {len(ed.ARTICLES)} expected: " + " | ".join(a.title[:30] for a in ex.articles))
    for article, spec in zip(ex.articles, ed.ARTICLES):
        emit(spec["slug"], article.title, article_markdown(article, spec, lang))
    refs = "\n\n".join(f"{n}. {url}" for n, url in ex.references)
    emit("referencias" if lang == "es" else "references", book["references"], f'# {book["references"]} {{style="preliminar"}}\n\n:::paragraphs{{style="referencia"}}\n{refs}\n:::\n')
    photo_lines = []
    for pid, p in photos.items():
        photo_lines.append(f"**{pid}** — {p['title'].replace('File:', '')}: {author_name(p)}, {p['licence']} — [commons.wikimedia.org]({p['page']})")
    paras = "\n\n".join(ed.CREDITS[lang])
    emit("creditos" if lang == "es" else "credits", book["credits"], f'# {book["credits"]} {{style="preliminar"}}\n\n:::paragraphs{{style="creditos"}}\n{paras}\n:::\n\n:::paragraphs{{style="fuentes"}}\n' + "\n\n".join(photo_lines) + "\n:::\n")
    return specs


# --- fonts -------------------------------------------------------------------------


def build_fonts() -> list[dict]:
    fonts_dir = os.path.join(OUT, "fonts")
    os.makedirs(fonts_dir, exist_ok=True)
    fam: dict[str, list[dict]] = {TEXT: [], DISPLAY: []}
    src = lambda r: os.path.join(SOURCE, "fonts", r)  # noqa: E731
    os_axes = {"wdth": 100}
    for w in (400, 600, 700):
        fam[TEXT].append({"weight": w, "style": "normal", "file": "fonts/" + instance_font(src("opensans/OpenSans[wdth,wght].ttf"), fonts_dir, "OpenSans", os_axes, w, False)})
    for w in (400, 700):
        fam[TEXT].append({"weight": w, "style": "italic", "file": "fonts/" + instance_font(src("opensans/OpenSans-Italic[wdth,wght].ttf"), fonts_dir, "OpenSans", os_axes, w, True)})
    for w in (400, 500, 700, 800):
        fam[DISPLAY].append({"weight": w, "style": "normal", "file": "fonts/" + instance_font(src("outfit/Outfit[wght].ttf"), fonts_dir, "Outfit", {}, w, False)})
    copy_licences(os.path.join(SOURCE, "fonts"), fonts_dir, {"opensans": "OpenSans-OFL.txt", "outfit": "Outfit-OFL.txt"})
    return [{"name": n, "variants": v} for n, v in fam.items()]


# --- credits & manifest -----------------------------------------------------------


def write_credits_md(photos: dict[str, dict]) -> None:
    lines = ["# Credits — Señales 2020 / Signals 2020", "",
             "Showcase preset for the Postext sandbox, re-setting *EEA Signals 2020 — Towards",
             "zero pollution in Europe* (European Environment Agency, 2020) in Spanish and English.", "",
             "## Text", "",
             "© EEA, Copenhagen, 2020. \"Reproduction is authorised, provided the source is",
             "acknowledged, save where otherwise stated.\" Texts extracted from the official PDFs:", "",
             f"- English: {PDFS['en'][1]}",
             f"- Spanish: {PDFS['es'][1]}", "",
             "The original photographs (EEA REDISCOVER Nature competition entries and",
             "Unsplash pictures with rights reserved) are **not** included; the infographics",
             "are transcribed as text panels.", "",
             "## Photographs (CC0, Unsplash uploads archived on Wikimedia Commons)", ""]
    for pid, p in photos.items():
        lines.append(f"- `{pid}` — {p['title'].replace('File:', '')} — {author_name(p)} — {p['licence']} — {p['page']}")
    lines += ["", "## Fonts (SIL Open Font License 1.1)", "",
              "- Open Sans — Steve Matteson (`fonts/OpenSans-OFL.txt`)",
              "- Outfit — Rodrigo Fuenzalida (`fonts/Outfit-OFL.txt`)", "",
              "## Build", "",
              "`scripts/presets/showcase/senales/` in the Postext repository: `fetch.py` downloads the",
              "PDFs, photographs and fonts; `extract.py` reads the articles by type role; `build.py`",
              "writes this bundle.", ""]
    with open(os.path.join(OUT, "CREDITS.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def write_manifest(chapters, resources, wording, fonts, photos) -> dict:
    meta = {
        "id": PRESET_ID,
        "name": "Señales 2020 · Signals 2020",
        "description": "Revista de la Agencia Europea de Medio Ambiente a dos columnas con aperturas fotográficas, recuadros, citas y paneles de datos · A two-column EEA magazine with photo openers, boxes, pull quotes and data panels",
        "locale": "es",
        "locales": ["es", "en"],
        "thumbnail": "thumbnail.jpg",
        "license": "© EEA 2020, reproduction authorised · CC0 photos",
        "credits": "Agencia Europea de Medio Ambiente · Unsplash",
        "tags": ["magazine", "two-column", "callouts", "tables"],
    }
    manifest = {
        "version": 2, **meta, "chapters": chapters, "config": shared_config(photos),
        "localized": {lang: {"config": localized_config(lang), "resources": wording[lang]} for lang in LANGS},
        "resources": resources, "fonts": fonts,
    }
    with open(os.path.join(OUT, "preset.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=1, ensure_ascii=False)
        f.write("\n")
    return meta


def main() -> None:
    if not os.path.exists(os.path.join(SOURCE, "photos.json")):
        raise SystemExit("run fetch.py first")
    for sub in ("chapters", "resources"):
        shutil.rmtree(os.path.join(OUT, sub), ignore_errors=True)
    os.makedirs(OUT, exist_ok=True)
    photos = render_photos()
    resources, wording = resource_specs(photos)
    chapters = {}
    for lang in LANGS:
        ex = extract.extract(os.path.join(SOURCE, PDFS[lang][0]), ARTICLE_PAGES[0], ARTICLE_PAGES[1], REFERENCES_FROM)
        chapters[lang] = write_chapters(lang, ex, photos)
    fonts = build_fonts()
    write_credits_md(photos)
    meta = write_manifest(chapters, resources, wording, fonts, photos)
    copy_thumbnail(HERE, OUT)
    write_fingerprint(OUT)
    register(PRESET_ID, meta)
    print(f"wrote {OUT}  ({bundle_size(OUT):.1f} MB, {len(resources)} resources, {sum(len(v) for v in chapters.values())} chapter files)")


if __name__ == "__main__":
    main()
