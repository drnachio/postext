#!/usr/bin/env python3
"""Build the `pintura-espanola` showcase preset bundle from `source/` (see
fetch.py) into `apps/web/public/presets/pintura-espanola/` and register it
in the public `index.json`.

    python3 scripts/presets/showcase/pintura-espanola/fetch.py   # once
    python3 scripts/presets/showcase/pintura-espanola/build.py

An exhibition catalogue: fourteen Spanish paintings from CC0 museum
collections, one artist per coloured section, each work on a spread — the
catalogue entry and commentary on the verso, the plate filling the recto.
Single column, Bodoni Moda display, EB Garamond text, IBM Plex Sans
Condensed for the furniture.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import sys
import unicodedata

from PIL import Image, ImageFile

# The NGA IIIF server serves a few JPEGs without their last bytes (the end
# marker): the picture itself is complete.
ImageFile.LOAD_TRUNCATED_IMAGES = True

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
PRESET_ID = "pintura-espanola"
OUT = os.path.join(PRESETS_ROOT, PRESET_ID)
LANGS = ("es", "en")

PLATE_MAX_PX = 2200
PLATE_QUALITY = 84
COVER_WORK = "greco-laocoonte"

# --- geometry & palette ------------------------------------------------------------

PAGE_W, PAGE_H = 210.0, 270.0
M_TOP, M_BOTTOM, M_INNER, M_OUTER = 24.0, 24.0, 22.0, 44.0
TEXT_W = PAGE_W - M_INNER - M_OUTER  # 144
TEXT_H = PAGE_H - M_TOP - M_BOTTOM  # 222
PLATE_MAX_H = TEXT_H - 18  # room for the caption under a full-height plate

COLOURS = {
    "ink": "#1c1a19",
    "paper": "#fbf9f4",
    "white": "#ffffff",
    "band": "#3d4a63",
    "rule": "#c8c2b6",
    "muted": "#6d675f",
}
NAMES = {"ink": "Tinta", "paper": "Papel", "white": "Blanco", "band": "Color de sección", "rule": "Filetes", "muted": "Gris de fichas"}
col, COLOR_PALETTE = make_palette(COLOURS, NAMES)
DISPLAY, TEXT, SANS = "Bodoni Moda", "EB Garamond", "IBM Plex Sans Condensed"


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


def running_heads() -> dict:
    y = M_TOP - 11.0
    return {
        "elements": [
            T("artistEven", "{partTitle}", anchor=at("page", "top-left"), offset=(M_OUTER, y), width=120, size_pt=7.5, family=SANS, weight=500, color="muted", textTransform="uppercase", letterSpacing=pt(1.6), parity="even", pages="body", overflow="ellipsis-end"),
            T("titleOdd", "{chapterTitle}", anchor=at("page", "top-right"), offset=(-M_OUTER, y), width=120, size_pt=8.5, italic=True, color="muted", align="right", parity="odd", pages="body", overflow="ellipsis-end"),
        ]
    }


def folio_footer() -> dict:
    y = -(M_BOTTOM - 10)
    return {
        "elements": [
            T("folioBody", "{pageNumber}", anchor=at("page", "bottom"), offset=(0, y), width=30, size_pt=8.5, family=SANS, weight=500, align="center", pages="body", overflow="ellipsis-end"),
            T("folioOpener", "{pageNumber}", anchor=at("page", "bottom"), offset=(0, y), width=30, size_pt=8.5, family=SANS, weight=500, align="center", pages="opener", overflow="ellipsis-end"),
        ]
    }


def lead_element(anchor: dict, offset: tuple[float, float], width: float) -> dict:
    return T("lead", "{attr.lead}", anchor=anchor, offset=offset, width=width, size_pt=11.5, line_height=1.45, hyphenate=True,
             dropCap={"lines": 3, "fontFamily": DISPLAY, "fontWeight": 400, "color": col("band"), "gap": mm(1.6)})


def work_opener() -> dict:
    """The verso of a work: catalogue number and artist in the section
    colour, the title in Bodoni italic, the tombstone line, a hairline and
    the lead with a drop cap. The plate floats onto the facing recto."""
    return {
        "enabled": True,
        "minHeight": mm(74),
        "slot": {
            "elements": [
                T("catNumber", "{attr.catlabel} {attr.cat}", anchor=at("container", "top-left"), offset=(0, 4), width=TEXT_W, size_pt=8.5, family=SANS, weight=600, color="band", textTransform="uppercase", letterSpacing=pt(2.2)),
                T("artist", "{partTitle}", anchor=at("#catNumber", "below"), offset=(0, 2.5), width=TEXT_W, size_pt=9.5, family=SANS, weight=500, color="muted", textTransform="uppercase", letterSpacing=pt(1.6)),
                T("workTitle", "{titleText}", anchor=at("#artist", "below"), offset=(0, 4), width=TEXT_W, size_pt=32, family=DISPLAY, italic=True, line_height=1.08),
                T("tombstone", "{attr.tombstone}", anchor=at("#workTitle", "below"), offset=(0, 5), width=TEXT_W, size_pt=8.5, family=SANS, color="muted", line_height=1.35),
                R("workRule", anchor=at("#tombstone", "below"), offset=(0, 5), width=TEXT_W, color="rule", thickness=0.5),
                lead_element(at("#workRule", "below"), (0, 6), TEXT_W),
            ]
        },
    }


def front_opener(*, lead: bool) -> dict:
    els = [
        T("frontTitle", "{titleText}", anchor=at("container", "top-left"), offset=(0, 6), width=TEXT_W, size_pt=30, family=DISPLAY, italic=True, line_height=1.1),
        R("frontRule", anchor=at("#frontTitle", "below"), offset=(0, 6), width=TEXT_W, color="rule", thickness=0.5),
    ]
    if lead:
        els.append(lead_element(at("#frontRule", "below"), (0, 6), TEXT_W))
    return {"enabled": True, "minHeight": mm(64 if lead else 36), "slot": {"elements": els}}


def cover_design(cover_resource: str, aspect: float) -> dict:
    img_w = PAGE_W + 6
    img_h = round(img_w / aspect, 1)
    return {
        "enabled": True,
        "minHeight": mm(PAGE_H),
        "slot": {
            "elements": [
                B("coverBg", anchor=at("bleed", "top-left"), fill="ink"),
                image_el("coverImage", cover_resource, anchor=at("bleed", "top-left"), width=img_w, height=img_h),
                T("coverSeries", "{attr.series}", anchor=at("page", "top-left"), offset=(M_INNER, img_h + 9), width=TEXT_W + 20, size_pt=8.5, family=SANS, weight=600, color="rule", textTransform="uppercase", letterSpacing=pt(2.4)),
                T("coverTitle", "{title}", anchor=at("#coverSeries", "below"), offset=(0, 3), width=TEXT_W + 20, size_pt=54, family=DISPLAY, weight=400, line_height=1.0, color="white"),
                T("coverSubtitle", "{subtitle}", anchor=at("#coverTitle", "below"), offset=(0, 5), width=TEXT_W + 10, size_pt=13, italic=True, line_height=1.3, color="rule"),
                T("coverPublisher", "{attr.publisher}", anchor=at("page", "bottom-left"), offset=(M_INNER, -14), width=TEXT_W + 20, size_pt=7.5, family=SANS, color="muted", textTransform="uppercase", letterSpacing=pt(1.8)),
            ]
        },
    }


def part_design(label: str) -> dict:
    return {
        "elements": [
            B("partBg", anchor=at("bleed", "top-left"), fill="band"),
            T("partLabel", label + " {number}", anchor=at("page", "top-left"), offset=(M_INNER, 64), width=TEXT_W, size_pt=9, family=SANS, weight=600, color="white", textTransform="uppercase", letterSpacing=pt(2.6)),
            R("partRule", anchor=at("#partLabel", "below"), offset=(0, 4), width=22, color="white", thickness=0.8),
            T("partTitle", "{titleText}", anchor=at("#partRule", "below"), offset=(0, 6), width=TEXT_W + 10, size_pt=52, family=DISPLAY, weight=400, line_height=1.02, color="white"),
        ]
    }


def resource_types(lang: str) -> list[dict]:
    cat, cats, short = ed.BOOK[lang]["cat"]
    return [
        {"id": "plate", "name": cat, "namePlural": cats, "shortLabel": short, "captionPrefix": cat, "numberingTemplate": "{n}", "resetOn": "never", "counterFormat": "decimal", "defaultPlacement": {"position": "top", "span": "page", "width": 1}},
    ]


def body_text(lang: str) -> dict:
    return {
        "fontFamily": TEXT, "fontSize": pt(11), "lineHeight": pt(15.5), "textAlign": "justify",
        "firstLineIndent": mm(5), "indentAfterHeading": False, "paragraphSpacing": False,
        "color": col("ink"), "boldColor": col("ink"), "italicColor": col("ink"),
        "referenceColor": col("band"), "referenceBold": False, "referenceItalic": True,
        "hyphenation": {"enabled": True, "locale": "es" if lang == "es" else "en-us"},
        "avoidWidows": True, "avoidOrphans": True, "optimalLineBreaking": True,
    }


def headings(lang: str) -> dict:
    return {
        "fontFamily": DISPLAY, "color": col("ink"), "keepWithNext": True,
        "levels": [
            {"level": 1, "fontSize": pt(24), "lineHeight": pt(28), "span": "page", "breakBefore": {"enabled": True, "parity": "even"}, "advancedDesign": work_opener()},
            {"level": 2, "fontSize": pt(14), "lineHeight": pt(18), "fontWeight": 400, "italic": True, "color": col("band"), "marginTop": pt(14), "marginBottom": pt(4)},
        ],
    }


def parts(lang: str) -> dict:
    return {
        "breakBefore": {"parity": "odd"},
        "breakAfter": {"enabled": True, "parity": "any"},
        "margins": {"top": mm(128), "bottom": mm(28), "left": mm(M_INNER), "right": mm(62)},
        "design": part_design(ed.BOOK[lang]["part_label"]),
        "bodyStyle": {
            "fontFamily": TEXT, "fontSize": pt(11), "lineHeight": pt(15.5), "color": col("white"), "textAlign": "left", "numberColor": col("white"),
            "orderedLists": {"numberFormat": "arabic", "separator": "", "gap": mm(3), "indent": mm(9), "fontFamily": SANS, "numberFontSize": pt(9), "itemSpacing": pt(2)},
        },
    }


def toc_config() -> dict:
    return {
        "levels": [
            {"level": 1, "fontFamily": TEXT, "fontSize": pt(11.5), "lineHeight": pt(15), "fontWeight": 400, "italic": True, "color": col("ink"), "numberWidth": mm(10), "numberGap": mm(2), "numberFontFamily": SANS, "numberFontSize": pt(8.5), "numberColor": col("band"), "marginTop": pt(2)},
        ],
        "unnumbered": {"fontFamily": TEXT, "italic": False, "color": col("ink")},
        "pageNumber": {"fontFamily": SANS, "fontSize": pt(9), "fontWeight": 500, "color": col("ink"), "width": mm(10)},
        "leader": {"enabled": True, "char": ".", "gap": mm(1.2)},
        "parts": {
            "enabled": True, "height": pt(18), "marginTop": pt(13), "marginBottom": pt(3),
            "design": {"elements": [
                B("tocPartBand", anchor=at("container", "left"), offset=(0, 0), width=5, height=5, fill="band"),
                T("tocPart", "{titleText}", anchor=at("#tocPartBand", "right-of"), offset=(3, 0), width=140, size_pt=9, family=SANS, weight=600, textTransform="uppercase", letterSpacing=pt(2), color="band"),
            ]},
        },
    }


def heading_styles(cover_resource: str, aspect: float) -> list[dict]:
    empty = {"elements": []}
    return [
        {"id": "portada", "name": "Portada", "numbered": False, "toc": False, "span": "page", "breakBefore": {"enabled": True, "parity": "odd"}, "advancedDesign": cover_design(cover_resource, aspect), "header": empty, "footer": empty,
         "margins": {"top": mm(PAGE_H - 80), "bottom": mm(M_BOTTOM), "left": mm(PAGE_W - M_OUTER - 85), "right": mm(M_OUTER)}},
        {"id": "preliminar", "name": "Preliminar", "numbered": False, "span": "page", "breakBefore": {"enabled": True, "parity": "odd"}, "advancedDesign": front_opener(lead=True)},
        {"id": "indice", "name": "Índice", "numbered": False, "toc": False, "span": "page", "breakBefore": {"enabled": True, "parity": "any"}, "advancedDesign": front_opener(lead=False)},
    ]


def paragraph_styles() -> list[dict]:
    return [
        {"id": "colofon", "name": "Colofón", "fontSize": pt(8.5), "lineHeight": pt(11.5), "textAlign": "left", "firstLineIndent": mm(0), "spaceBetween": pt(6), "color": col("muted")},
        {"id": "fuente", "name": "Fuente", "fontFamily": SANS, "fontSize": pt(7.5), "lineHeight": pt(10), "textAlign": "left", "firstLineIndent": mm(0), "spaceBetween": pt(4), "marginTop": pt(14), "color": col("muted")},
        {"id": "creditos", "name": "Créditos", "fontSize": pt(10.5), "lineHeight": pt(14), "textAlign": "left", "firstLineIndent": mm(0), "spaceBetween": pt(6)},
        {"id": "lista", "name": "Lista de obras", "fontFamily": SANS, "fontSize": pt(8.5), "lineHeight": pt(11.5), "textAlign": "left", "firstLineIndent": mm(0), "spaceBetween": pt(4)},
    ]


def shared_config(cover_resource: str, aspect: float) -> dict:
    return {
        "locale": "es",
        "page": {"sizePreset": "custom", "width": mm(PAGE_W), "height": mm(PAGE_H), "margins": {"top": mm(M_TOP), "bottom": mm(M_BOTTOM), "left": mm(M_INNER), "right": mm(M_OUTER), "mirror": True}, "baselineGrid": {"enabled": False}, "pageNumbering": {"format": "decimal", "startAt": 1}},
        "layout": {"layoutType": "single"},
        "bodyText": body_text("es"),
        "headings": headings("es"),
        "headingStyles": heading_styles(cover_resource, aspect),
        "paragraphStyles": paragraph_styles(),
        "parts": parts("es"),
        "toc": toc_config(),
        "header": running_heads(),
        "footer": folio_footer(),
        "captionStyle": {"fontFamily": SANS, "fontSize": pt(8), "color": col("ink"), "align": "left", "gap": mm(2.2), "labelBold": True, "labelColor": col("band"), "descriptionItalic": False, "note": {"fontSize": pt(6.5), "color": col("muted"), "italic": False, "gap": mm(0.6)}},
        "unorderedLists": {"bulletChar": "•", "color": col("band")},
        "orderedLists": {"color": col("band")},
        "colorPalette": COLOR_PALETTE,
        "resourceTypes": resource_types("es"),
        "pdfGeneration": {"outlines": True},
    }


def localized_config(lang: str) -> dict:
    return {"locale": "es" if lang == "es" else "en-us", "bodyText": body_text(lang), "headings": headings(lang), "parts": parts(lang), "resourceTypes": resource_types(lang)}


# --- text helpers --------------------------------------------------------------------

SENTENCE_END = re.compile(r"(?<=[.!?…»”)])\s+")
PRONUNCIATION = re.compile(r"\((?:[^()]|\([^()]*\))*?(?:\[|pronounced|Spanish:|Greek:|Valencian:|Catalan:|IPA)(?:[^()]|\([^()]*\))*\)")


def split_lead(paragraph: str, target: int = 340) -> tuple[str, str]:
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


def clean_wiki(text: str) -> str:
    """Wikipedia lead sentences carry pronunciation guides and IPA the fonts
    cannot set: drop them and the punctuation they leave behind."""
    text = PRONUNCIATION.sub("", text)
    text = re.sub(r",(?=[A-Za-zÁÉÍÓÚáéíóúñ])", ", ", text)  # a citation marker used to sit here
    text = re.sub(r"\(\s*[;,]\s*", "(", text)
    text = re.sub(r"\(\s*\)", "", text)
    text = re.sub(r"\s+([,.;:)])", r"\1", text)
    text = re.sub(r"\s{2,}", " ", text)
    return text.strip()


def wiki_paragraphs(extract: str) -> list[str]:
    """Body paragraphs of a Wikipedia plain-text extract in order, without
    headings and without the navigational sections (references, gallery…)."""
    out: list[str] = []
    skipping = False
    for raw in extract.split("\n"):
        line = raw.strip()
        if not line:
            continue
        m = wiki.HEADING.match(line)
        if m:
            if len(m.group(1)) <= 2:
                skipping = wiki.clean(m.group(2)).lower() in wiki.SKIP
            continue
        if skipping:
            continue
        text = clean_wiki(wiki.clean(line))
        text = re.sub(r"(\d{4})-(?=[A-ZÁÉÍÓÚ])", r"\1 – ", text)
        text = re.sub(r"\)(?=[a-záéíóúñ])", ") ", text)
        # Prose only: the data lists some articles close with ("Dimensiones:
        # 121 x 109 cm, según Wethey;") are short and end without a full stop.
        words = len(text.split())
        if words >= 6 and text[-1] in ".!?»”)" and (words >= 20 or ". " in text):
            out.append(text)
    return out


def take_words(paras: list[str], budget: int, minimum: int = 0) -> list[str]:
    """Leading paragraphs up to about `budget` words (a paragraph may
    overshoot it by 15 %, and by any amount while the text is still under
    `minimum`)."""
    out, n = [], 0
    for p in paras:
        k = len(p.split())
        if out and n + k > budget * 1.15 and n >= minimum:
            break
        out.append(p)
        n += k
        if n >= budget:
            break
    return out


def wiki_commentary(lang: str, title: str | None, extracts: dict) -> tuple[list[str], dict | None]:
    """Markdown paragraphs of a work's article within the budget, or an
    empty list when the article is missing or too short."""
    if not title or title not in extracts[lang]:
        return [], None
    art = extracts[lang][title]
    paras = take_words(wiki_paragraphs(art["extract"]), ed.WIKI_BUDGET, ed.WIKI_MIN_WORDS)
    if sum(len(p.split()) for p in paras) < ed.WIKI_MIN_WORDS:
        return [], None
    return paras, art


def bio(lang: str, title: str, extracts: dict) -> tuple[list[str], dict]:
    """The opening sentences of the artist's article, up to `BIO_WORDS`."""
    art = extracts[lang][title]
    lead = " ".join(wiki_paragraphs(art["extract"].split("\n==")[0]))
    out, n = [], 0
    for s in SENTENCE_END.split(lead):
        if out and n + len(s.split()) > ed.BIO_WORDS:
            break
        out.append(s)
        n += len(s.split())
    return [" ".join(out)], art


def slugify(s: str) -> str:
    s = unicodedata.normalize("NFKD", s.lower()).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


# --- plates ----------------------------------------------------------------------


def render_plates(works: list[dict]) -> dict[str, dict]:
    os.makedirs(os.path.join(OUT, "resources"), exist_ok=True)
    out: dict[str, dict] = {}
    for w in works:
        src = os.path.join(SOURCE, "images", f"{w['id']}.jpg")
        rel = f"resources/{w['id']}.jpg"
        dst = os.path.join(OUT, rel)
        im = Image.open(src).convert("RGB")
        if max(im.size) > PLATE_MAX_PX:
            im.thumbnail((PLATE_MAX_PX, PLATE_MAX_PX), Image.LANCZOS)
        im.save(dst, quality=PLATE_QUALITY, optimize=True, progressive=True)
        aspect = im.width / im.height
        # Width fraction of the text measure so the plate never runs past the
        # page: a tall canvas is narrowed, a wide one fills the measure.
        frac = min(1.0, round(aspect * PLATE_MAX_H / TEXT_W, 3))
        out[w["id"]] = {"rel": rel, "w": im.width, "h": im.height, "aspect": aspect, "frac": frac}
    return out


def tombstone(w: dict, lang: str) -> str:
    museum = ed.BOOK[lang]["museum"][w["museum"]]
    return " · ".join(x for x in [w["date"], w["medium"][lang], w["size"], museum, w["accession"]] if x)


def caption(w: dict, lang: str, artists: dict) -> str:
    return f"{artists[w['artist']][lang]}, *{w['title'][lang]}*, {w['date']}. {ed.BOOK[lang]['museum'][w['museum']]}."


def resource_specs(works: list[dict], plates: dict[str, dict], artists: dict) -> tuple[list[dict], dict[str, list[dict]]]:
    shared: list[dict] = []
    wording: dict[str, list[dict]] = {lang: [] for lang in LANGS}
    for w in works:
        p = plates[w["id"]]
        shared.append({
            "id": w["id"], "typeId": "plate", "kind": "bitmap", "file": p["rel"], "width": p["w"], "height": p["h"],
            "caption": caption(w, "es", artists), "note": ed.BOOK["es"]["plate_note"], "altText": f"{artists[w['artist']]['es']}: {w['title']['es']}",
            "placement": {"position": "top", "span": "page", "width": p["frac"], "align": "center"},
        })
        for lang in LANGS:
            wording[lang].append({"id": w["id"], "caption": caption(w, lang, artists), "note": ed.BOOK[lang]["plate_note"], "altText": f"{artists[w['artist']][lang]}: {w['title'][lang]}"})
    return shared, wording


# --- chapters ------------------------------------------------------------------------


def write_chapters(lang: str, works: list[dict], artists: dict, extracts: dict, used_articles: dict) -> list[dict]:
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
    lead, rest = split_lead(ed.INTRO[lang][0])
    intro = [f'# {book["intro"]} {{style="preliminar" lead="{attr_value(lead)}"}}', "", rest + "\n"] + [t + "\n" for t in ed.INTRO[lang][1:]]
    emit("introduccion" if lang == "es" else "introduction", book["intro"], "\n".join(intro))
    emit("indice" if lang == "es" else "contents", book["contents"], f'# {book["contents"]} {{style="indice" toc="false"}}\n\n:::toc\n')

    cat_label = book["cat"][0]
    n = 0
    first = True
    for part in ed.PARTS:
        artist = part["artist"]
        name = artists[artist][lang]
        mine = [w for w in works if w["artist"] == artist]
        head = ""
        if first:
            head += ':::numbering{format="decimal" startAt=1}\n\n'
            first = False
        bio_paras, art = bio(lang, name, extracts)
        used_articles.setdefault(lang, {})[name] = art
        body_lines = [part["dates"][lang], ""] + [p + "\n" for p in bio_paras]
        head += f':::part{{number="{part["number"]}" title="{attr_value(name)}" palette="band={part["band"]}"}}\n' + "\n".join(body_lines) + ":::\n\n"
        for k, w in enumerate(mine):
            n += 1
            title = w["title"][lang]
            wiki_title = (w.get("wiki") or {}).get(lang)
            paras, art = wiki_commentary(lang, wiki_title, extracts)
            if paras:
                used_articles[lang][art["title"]] = art
                source = book["source_wiki"].replace("__title__", art["title"]).replace("__revid__", str(art["revid"]))
            else:
                paras = list(ed.OWN[w["id"]][lang])
                source = book["source_own"]
            lead, rest = split_lead(paras[0])
            lines = [(head if k == 0 else "") + f'# {title} {{lead="{attr_value(lead)}" catlabel="{cat_label}" cat="{n}" tombstone="{attr_value(tombstone(w, lang))}"}}', ""]
            body = ([rest] if rest else []) + paras[1:]
            if not body:
                body = [""]
            body[0] = (body[0] + " " if body[0] else "") + f':ref{{id="{w["id"]}" case="lower"}}'
            lines += [p + "\n" for p in body]
            lines.append(f':::paragraphs{{style="fuente"}}\n{source}\n:::\n')
            emit(f"{n:02d}-{slugify(title)}", title, "\n".join(lines))

    # Credits: the works with their museum records, then the articles and fonts.
    works_lines = []
    for i, w in enumerate(works):
        record = ed.BOOK[lang]["museum"][w["museum"]] + (f", {w['accession']}" if w["accession"] else "")
        works_lines.append(f"{cat_label} {i + 1}. {artists[w['artist']][lang]}, *{w['title'][lang]}*, {w['date']}. {record}. {w['licence']} — [{w['page'].split('//')[1].split('/')[0]}]({w['page']})")
    arts = used_articles.get(lang, {})
    art_lines = [f"*{a['title']}* — [{a['url']}]({a['url']}) (revision {a['revid']}, {a['timestamp'][:10]})" for a in arts.values() if a]
    paras = "\n\n".join(ed.CREDITS[lang])
    credits = (
        f'# {book["credits"]} {{style="preliminar"}}\n\n'
        f':::paragraphs{{style="creditos"}}\n{paras}\n:::\n\n'
        f':::paragraphs{{style="lista"}}\n' + "\n\n".join(works_lines) + "\n:::\n\n"
        f':::paragraphs{{style="lista"}}\n' + "\n\n".join(art_lines) + "\n:::\n"
    )
    emit("creditos" if lang == "es" else "credits", book["credits"], credits)
    return specs


# --- fonts -------------------------------------------------------------------------


def build_fonts() -> list[dict]:
    fonts_dir = os.path.join(OUT, "fonts")
    os.makedirs(fonts_dir, exist_ok=True)
    fam: dict[str, list[dict]] = {DISPLAY: [], TEXT: [], SANS: []}
    src = lambda r: os.path.join(SOURCE, "fonts", r)  # noqa: E731
    bm = {"opsz": 72}
    for w in (400, 700):
        fam[DISPLAY].append({"weight": w, "style": "normal", "file": "fonts/" + instance_font(src("bodonimoda/BodoniModa[opsz,wght].ttf"), fonts_dir, "BodoniModa", bm, w, False)})
    fam[DISPLAY].append({"weight": 400, "style": "italic", "file": "fonts/" + instance_font(src("bodonimoda/BodoniModa-Italic[opsz,wght].ttf"), fonts_dir, "BodoniModa", bm, 400, True)})
    for w in (400, 500, 700):
        fam[TEXT].append({"weight": w, "style": "normal", "file": "fonts/" + instance_font(src("ebgaramond/EBGaramond[wght].ttf"), fonts_dir, "EBGaramond", {}, w, False)})
    for w in (400, 700):
        fam[TEXT].append({"weight": w, "style": "italic", "file": "fonts/" + instance_font(src("ebgaramond/EBGaramond-Italic[wght].ttf"), fonts_dir, "EBGaramond", {}, w, True)})
    for w, name in ((400, "Regular"), (500, "Medium"), (600, "SemiBold")):
        fam[SANS].append({"weight": w, "style": "normal", "file": "fonts/" + instance_font(src(f"ibmplexsanscondensed/IBMPlexSansCondensed-{name}.ttf"), fonts_dir, "IBMPlexSansCondensed", {}, w, False)})
    fam[SANS].append({"weight": 400, "style": "italic", "file": "fonts/" + instance_font(src("ibmplexsanscondensed/IBMPlexSansCondensed-Italic.ttf"), fonts_dir, "IBMPlexSansCondensed", {}, 400, True)})
    copy_licences(os.path.join(SOURCE, "fonts"), fonts_dir, {"bodonimoda": "BodoniModa-OFL.txt", "ebgaramond": "EBGaramond-OFL.txt", "ibmplexsanscondensed": "IBMPlexSansCondensed-OFL.txt"})
    return [{"name": n, "variants": v} for n, v in fam.items()]


# --- credits & manifest -----------------------------------------------------------


def write_credits_md(works: list[dict], artists: dict, used_articles: dict) -> None:
    lines = ["# Credits — Pintura española / Spanish Painting", "",
             "Showcase preset for the Postext sandbox. Fourteen paintings from museum",
             "open-access programmes (CC0 image files; the works are public domain by age).", "",
             "## Works", ""]
    for i, w in enumerate(works):
        record = ed.BOOK["en"]["museum"][w["museum"]] + (f", {w['accession']}" if w["accession"] else "")
        lines.append(f"{i + 1}. {artists[w['artist']]['en']}, *{w['title']['en']}*, {w['date']}. {record}. {w['licence']}. {w['page']}")
    lines += ["", "## Texts", "",
              "Commentaries adapted from Wikipedia are CC BY-SA 4.0 (article and revision below);",
              "the other commentaries, the introduction and the credits were written for this",
              "edition and are CC BY 4.0.", ""]
    for lang in LANGS:
        for a in used_articles.get(lang, {}).values():
            if a:
                lines.append(f"- [{lang}] {a['title']} — {a['url']} (revision {a['revid']}, {a['timestamp'][:10]})")
    lines += ["", "## Fonts (SIL Open Font License 1.1)", "",
              "- Bodoni Moda — Indestructible Type (`fonts/BodoniModa-OFL.txt`)",
              "- EB Garamond — Georg Duffner, Octavio Pardo (`fonts/EBGaramond-OFL.txt`)",
              "- IBM Plex Sans Condensed — Mike Abbink, Bold Monday (`fonts/IBMPlexSansCondensed-OFL.txt`)", "",
              "## Build", "",
              "`scripts/presets/showcase/pintura-espanola/` in the Postext repository: `fetch.py`",
              "downloads the images, the Wikipedia extracts and the fonts; `build.py` writes this bundle.", ""]
    with open(os.path.join(OUT, "CREDITS.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def write_manifest(chapters, resources, wording, fonts, cover_resource, aspect) -> dict:
    meta = {
        "id": PRESET_ID,
        "name": "Pintura española · Spanish Painting",
        "description": "Catálogo de exposición a una columna: ficha y comentario frente a la lámina a página · A single-column exhibition catalogue, entry and commentary facing the full-page plate",
        "locale": "es",
        "locales": ["es", "en"],
        "thumbnail": "thumbnail.jpg",
        "license": "CC0 · CC BY-SA 4.0",
        "credits": "The Met · National Gallery of Art · Cleveland Museum of Art · Museo Sorolla · Wikipedia",
        "tags": ["catalogue", "single-column", "plates", "parts"],
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
    works_path = os.path.join(SOURCE, "works.json")
    if not os.path.exists(works_path):
        raise SystemExit("run fetch.py first")
    data = json.load(open(works_path, encoding="utf-8"))
    artists = data["artists"]
    order = {p["artist"]: i for i, p in enumerate(ed.PARTS)}
    works = sorted(data["works"], key=lambda w: order[w["artist"]])
    extracts = json.load(open(os.path.join(SOURCE, "wiki-extracts.json"), encoding="utf-8"))
    for sub in ("chapters", "resources"):
        shutil.rmtree(os.path.join(OUT, sub), ignore_errors=True)
    os.makedirs(OUT, exist_ok=True)
    plates = render_plates(works)
    resources, wording = resource_specs(works, plates, artists)
    used_articles: dict[str, dict] = {}
    chapters = {lang: write_chapters(lang, works, artists, extracts, used_articles) for lang in LANGS}
    fonts = build_fonts()
    write_credits_md(works, artists, used_articles)
    cover = plates[COVER_WORK]
    meta = write_manifest(chapters, resources, wording, fonts, COVER_WORK, cover["aspect"])
    copy_thumbnail(HERE, OUT)
    write_fingerprint(OUT)
    register(PRESET_ID, meta)
    print(f"wrote {OUT}  ({bundle_size(OUT):.1f} MB, {len(resources)} plates, {sum(len(v) for v in chapters.values())} chapter files)")


if __name__ == "__main__":
    main()
