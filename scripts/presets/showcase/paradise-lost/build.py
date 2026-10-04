#!/usr/bin/env python3
"""Build the `paradise-lost` showcase preset bundle from `source/` (see
fetch.py) into `apps/web/public/presets/paradise-lost/` and register it in
the public `index.json`.

    python3 scripts/presets/showcase/paradise-lost/fetch.py   # once
    python3 scripts/presets/showcase/paradise-lost/build.py

An English-only book: John Milton's poem in twelve books (the 1674 text,
see text.py), each with its prose Argument; a selection of A. W. Verity's
notes (Cambridge, 1910) as footnotes keyed to the lines, from
`notes/book-NN.json`; and Gustave Doré's fifty plates (1866), each at the
head of the page after the line it illustrates.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import sys

from PIL import Image, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))
import _common  # noqa: E402
import text as poem  # noqa: E402
from _common import at, mm, pt  # noqa: E402
from plates import PLATES  # noqa: E402

SOURCE = os.path.join(HERE, "source")
PRESET_ID = "paradise-lost"
OUT = os.path.join(_common.PRESETS_ROOT, PRESET_ID)

# --- palette ---------------------------------------------------------------------

PALETTE = {
    "ink": "#1d1a17",
    "accent": "#8a2222",
    "night": "#17151a",
    "cream": "#efe6d2",
    "gold": "#c9a96a",
    "rule": "#9c8f7d",
    "muted": "#6b6259",
}
col, COLOR_PALETTE = _common.make_palette(
    PALETTE,
    {
        "ink": "Ink",
        "accent": "Rubric red",
        "night": "Night of the boards",
        "cream": "Cream lettering",
        "gold": "Gold tooling",
        "rule": "Rules",
        "muted": "Notes grey",
    },
)

BODY = "EB Garamond"
DISPLAY = "IM Fell English"
CAPS = "IM Fell English SC"


def text(id_: str, content: str, **kw) -> dict:
    kw.setdefault("family", BODY)
    kw.setdefault("color", "ink")
    return _common.text_el(id_, content, col=col, **kw)


def rule(id_: str, **kw) -> dict:
    kw.setdefault("color", "rule")
    return _common.rule_el(id_, col=col, **kw)


def box(id_: str, **kw) -> dict:
    return _common.box_el(id_, col=col, **kw)


# --- page geometry -------------------------------------------------------------------

# Royal octavo, one column; the measure is set for Milton's ten-syllable line.
PAGE_W, PAGE_H = 156.0, 234.0
M_TOP, M_BOTTOM, M_INNER, M_OUTER = 22.0, 25.0, 21.0, 25.0
TEXT_W = PAGE_W - M_INNER - M_OUTER  # 110 mm
TEXT_H = PAGE_H - M_TOP - M_BOTTOM  # 187 mm
BODY_PT, LEAD_PT = 11.0, 14.0

# A plate stands at the head of its page at this height, so a few lines of
# verse and the page's notes still fit under it.
PLATE_H = 118.0


# --- the design ---------------------------------------------------------------------


def running_heads() -> dict:
    """Verso: the poem's title; recto: the book. Body pages only; the folio
    sits at the foot (see `folio_footer`)."""
    y = M_TOP - 10.0
    return {
        "elements": [
            text("titleEven", "Paradise Lost", anchor=at("page", "top"), offset=(0, y), width=90, size_pt=9.5, family=CAPS, align="center", parity="even", pages="body", overflow="ellipsis-end", letterSpacing=pt(0.8)),
            text("bookOdd", "{chapterTitle}", anchor=at("page", "top"), offset=(0, y), width=90, size_pt=9.5, family=CAPS, align="center", parity="odd", pages="body", overflow="ellipsis-end", letterSpacing=pt(0.8)),
        ]
    }


def folio_footer() -> dict:
    return {
        "elements": [
            text(f"folio{role.title()}", "{pageNumber}", anchor=at("page", "bottom"), offset=(0, -(M_BOTTOM - 11)), width=30, size_pt=9.5, family=CAPS, align="center", pages=role, overflow="ellipsis-end")
            for role in ("body", "opener")
        ]
    }


def book_opener() -> dict:
    """Level-1 design: the book's title in Fell's roman between two short
    red rules, and the small-caps label of the Argument that follows in the
    flow."""
    mid = (TEXT_W - 22) / 2
    return {
        "enabled": True,
        "minHeight": mm(47),
        "slot": {
            "elements": [
                rule("bookRuleTop", anchor=at("container", "top-left"), offset=(mid, 8), width=22, color="accent", thickness=0.6),
                text("bookTitle", "{titleText}", anchor=at("#bookRuleTop", "below"), offset=(-mid, 6), width=TEXT_W, size_pt=27, family=DISPLAY, align="center", line_height=1.1, letterSpacing=pt(1.5)),
                rule("bookRuleBottom", anchor=at("#bookTitle", "below"), offset=(mid, 7), width=22, color="accent", thickness=0.6),
                text("argumentLabel", "The Argument", anchor=at("#bookRuleBottom", "below"), offset=(-mid, 10), width=TEXT_W, size_pt=10, family=CAPS, align="center", color="accent", letterSpacing=pt(1.4)),
            ]
        },
    }


def front_opener(*, size: float = 22) -> dict:
    mid = (TEXT_W - 22) / 2
    return {
        "enabled": True,
        "minHeight": mm(40),
        "slot": {
            "elements": [
                text("frontTitle", "{titleText}", anchor=at("container", "top"), offset=(0, 8), width=TEXT_W, size_pt=size, family=DISPLAY, align="center", line_height=1.15, letterSpacing=pt(1)),
                rule("frontRule", anchor=at("#frontTitle", "below"), offset=(mid, 6), width=22, color="accent", thickness=0.6),
            ]
        },
    }


COVER_PLATE = "plate-01"
BACK_PLATE = "plate-50"


def plate_box(slug: str, plates: dict[str, dict], width: float) -> tuple[float, float]:
    p = plates[slug]
    return width, round(width * p["ph"] / p["pw"], 1)


def cover_design(plates: dict[str, dict]) -> dict:
    """The front board, dark as the poem's opening: Doré's fall of the rebel
    angels framed in a gold rule, the title in Fell's roman."""
    img_w, img_h = plate_box(COVER_PLATE, plates, 96.0)
    x = (PAGE_W - img_w) / 2
    y0 = 24.0
    return {
        "enabled": True,
        "minHeight": mm(PAGE_H),
        "slot": {
            "elements": [
                box("coverBg", anchor=at("bleed", "top-left"), fill="night"),
                box("coverFrame", anchor=at("page", "top-left"), offset=(x - 2.2, y0 - 2.2), width=img_w + 4.4, height=img_h + 4.4, fill="gold"),
                _common.image_el("coverPlate", f"{COVER_PLATE}-cover", anchor=at("page", "top-left"), offset=(x, y0), width=img_w, height=img_h),
                text("coverTitle", "{title}", anchor=at("page", "top-left"), offset=(M_INNER, y0 + img_h + 12), width=TEXT_W, size_pt=30, family=DISPLAY, align="center", line_height=1.05, color="cream", letterSpacing=pt(1.5)),
                text("coverAuthor", "{author}", anchor=at("#coverTitle", "below"), offset=(0, 5), width=TEXT_W, size_pt=12.5, family=CAPS, align="center", color="gold", letterSpacing=pt(2)),
                text("coverEdition", "{attr.edition}", anchor=at("#coverAuthor", "below"), offset=(0, 6), width=TEXT_W, size_pt=9, italic=True, align="center", color="cream", line_height=1.35),
            ]
        },
    }


def back_cover_design(plates: dict[str, dict]) -> dict:
    """The back board: Adam and Eve leaving Eden, the closing lines of the
    poem and a short blurb."""
    img_w, img_h = plate_box(BACK_PLATE, plates, 64.0)
    measure = 104.0
    return {
        "enabled": True,
        "minHeight": mm(PAGE_H),
        "slot": {
            "elements": [
                box("backBg", anchor=at("bleed", "top-left"), fill="night"),
                box("backFrame", anchor=at("page", "top"), offset=(0, 30 - 1.6), width=img_w + 3.2, height=img_h + 3.2, fill="gold"),
                _common.image_el("backPlate", f"{BACK_PLATE}-cover", anchor=at("page", "top"), offset=(0, 30), width=img_w, height=img_h),
                text("backQuote", "{attr.quote}", anchor=at("page", "top"), offset=(0, 30 + img_h + 13), width=measure, size_pt=11.5, family=DISPLAY, italic=True, align="center", line_height=1.4, color="cream"),
                rule("backRule", anchor=at("#backQuote", "below"), offset=((measure - 22) / 2, 7), width=22, color="gold", thickness=0.6),
                text("backBlurb", "{attr.blurb}", anchor=at("#backRule", "below"), offset=(-(measure - 22) / 2, 7), width=measure, size_pt=9.2, align="center", line_height=1.45, color="cream"),
                text("backImprint", "Postext · postext.dev", anchor=at("page", "bottom"), offset=(0, -(M_BOTTOM + 2)), width=measure, size_pt=9, family=CAPS, align="center", color="gold", letterSpacing=pt(1.2)),
            ]
        },
    }


def headings() -> dict:
    return {
        "fontFamily": DISPLAY,
        "color": col("ink"),
        "keepWithNext": True,
        "levels": [
            {
                # The books: unnumbered (the title says "Book I"), each on a
                # recto with its opener.
                "level": 1,
                "numberingTemplate": "",
                "fontSize": pt(24),
                "lineHeight": pt(28),
                "span": "page",
                "breakBefore": {"enabled": True, "parity": "odd"},
                "advancedDesign": book_opener(),
            },
        ],
    }


def heading_styles(plates: dict[str, dict]) -> list[dict]:
    empty = {"elements": []}
    return [
        {
            "id": "cover",
            "name": "Cover",
            "numbered": False,
            "toc": False,
            "span": "page",
            "breakBefore": {"enabled": True, "parity": "odd"},
            "advancedDesign": cover_design(plates),
            "header": empty,
            "footer": empty,
            # The verso behind the cover: the colophon, low on a narrow measure.
            "margins": {"top": mm(PAGE_H - 78), "bottom": mm(M_BOTTOM), "left": mm(PAGE_W - M_OUTER - 80), "right": mm(M_OUTER)},
        },
        {
            # The last page, always a verso: Folio turns it as the back board.
            "id": "back-cover",
            "name": "Back cover",
            "numbered": False,
            "toc": False,
            "span": "page",
            "breakBefore": {"enabled": True, "parity": "even"},
            "advancedDesign": back_cover_design(plates),
            "header": empty,
            "footer": empty,
        },
        {
            # The books carry no number of their own ("Book I" is the
            # title): the contents set them flush, with the front matter.
            "id": "book",
            "name": "Book",
            "numbered": False,
        },
        {
            "id": "front",
            "name": "Front matter",
            "numbered": False,
            "span": "page",
            "breakBefore": {"enabled": True, "parity": "odd"},
            "advancedDesign": front_opener(),
        },
        {
            "id": "contents",
            "name": "Contents",
            "numbered": False,
            "toc": False,
            "span": "page",
            "breakBefore": {"enabled": True, "parity": "odd"},
            "advancedDesign": front_opener(),
        },
    ]


def body_text() -> dict:
    return {
        "fontFamily": BODY,
        "fontSize": pt(BODY_PT),
        "lineHeight": pt(LEAD_PT),
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
        "hyphenation": {"enabled": True, "locale": "en-gb"},
        "avoidWidows": True,
        "avoidOrphans": True,
        "optimalLineBreaking": True,
    }


VERSE_INDENT = 7.0


def paragraph_styles() -> list[dict]:
    verse = {"fontSize": pt(BODY_PT), "lineHeight": pt(LEAD_PT), "textAlign": "left", "hyphenation": False, "hangingIndent": mm(VERSE_INDENT), "spaceBetween": pt(0), "marginTop": pt(0), "marginBottom": pt(0)}
    return [
        # One paragraph per verse line, ragged right, a runover line hung.
        {"id": "verse", "name": "Verse", **verse, "firstLineIndent": mm(0)},
        # The first line of a verse paragraph, indented as in 1674.
        {"id": "verse-open", "name": "Verse paragraph opening", **verse, "firstLineIndent": mm(VERSE_INDENT)},
        # The Argument: Milton's prose summary under the book's opener.
        {"id": "argument", "name": "Argument", "fontSize": pt(9.8), "lineHeight": pt(13), "italic": True, "textAlign": "justify", "firstLineIndent": mm(0), "marginTop": pt(0), "marginBottom": pt(16), "hyphenation": True},
        {"id": "prose", "name": "Prose note", "fontSize": pt(10.5), "lineHeight": pt(14), "textAlign": "justify", "firstLineIndent": mm(0), "spaceBetween": pt(0)},
        {"id": "colophon", "name": "Colophon", "fontSize": pt(8.5), "lineHeight": pt(11.5), "textAlign": "left", "firstLineIndent": mm(0), "spaceBetween": pt(6), "color": col("muted")},
        {"id": "credits", "name": "Credits", "fontSize": pt(8.6), "lineHeight": pt(11.6), "textAlign": "left", "firstLineIndent": mm(0), "spaceBetween": pt(5)},
    ]


def footnotes() -> dict:
    """Verity's notes at the foot of the page, lettered afresh on each page
    (a, b, c) as annotated verse is; each note opens with its line number."""
    return {
        "placement": "column",
        "numbering": "page",
        "numberFormat": "lower-alpha",
        "markerPosition": "superscript",
        "fontSize": pt(8.3),
        "lineHeight": pt(10.4),
        "color": col("ink"),
        "textAlign": "justify",
        "hangingIndent": mm(0),
        "spaceBetween": pt(1.2),
        "spaceAbove": pt(9),
        "spaceBelowRule": pt(5),
        "separator": {"enabled": True, "width": 0.22, "lineWidth": pt(0.5), "color": col("rule")},
    }


def toc_config() -> dict:
    return {
        "levels": [
            {
                "level": 1,
                "fontFamily": BODY,
                "fontSize": pt(11),
                "lineHeight": pt(17),
                "color": col("ink"),
                "marginTop": pt(2),
            }
        ],
        "unnumbered": {"italic": False, "color": col("ink")},
        "pageNumber": {"fontFamily": BODY, "fontSize": pt(11), "color": col("ink"), "width": mm(10)},
        "leader": {"enabled": True, "char": ".", "gap": mm(1.2)},
    }


def resource_types() -> list[dict]:
    return [
        {
            # Doré's plates: captioned with the lines they illustrate, no number.
            "id": "plate",
            "name": "Plate",
            "namePlural": "Plates",
            "shortLabel": "Plate",
            "captionPrefix": "",
            "numberingTemplate": "",
            "resetOn": "never",
            "counterFormat": "decimal",
            "defaultPlacement": {"position": "top", "span": "page", "width": 1, "align": "center"},
        },
        {
            "id": "ornament",
            "name": "Ornament",
            "namePlural": "Ornaments",
            "shortLabel": "",
            "captionPrefix": "",
            "numberingTemplate": "",
            "resetOn": "never",
            "counterFormat": "decimal",
            "defaultPlacement": {"position": "here", "span": "column", "width": 0.5, "align": "center"},
        },
    ]


# --- Folio -----------------------------------------------------------------------

SPINE = "spine"
# About the book's page count, for the thickness of the spine picture.
SPINE_PAGES = 402

FOLIO_PAPER = {
    "type": "bookWove",
    "grammage": 80,
    "bulk": 1.5,
    "texture": "laid",
    "textureStrength": 0.5,
    "shade": {"hex": "#f5eedc", "model": "hex"},
}
FOLIO_BINDING_TYPE = "hardcover"


def folio_config() -> dict:
    """How Folio shows the book: a hardcover on a cream laid book paper,
    its first and last pages turned as the boards (the dark cover designs),
    the spine lettered in gold; on a walnut desk in the even light of an
    overcast day, which keeps the cream of the paper and the gold true."""
    return {
        "tilt": 20,
        "paper": FOLIO_PAPER,
        "binding": {"type": FOLIO_BINDING_TYPE, "cover": "pages", "coverMaterial": "cloth", "coverColor": col("night"), "spineImage": SPINE},
        "surface": {"type": "walnut"},
        "lighting": {"environment": "overcast", "intensity": 1.0, "shadows": True},
    }


def build_spine() -> dict:
    fonts = os.path.join(OUT, "fonts")
    spec, _ = _common.build_spines(OUT, SPINE, "ornament", "en", {
        "en": {
            "height_mm": PAGE_H,
            "thickness_mm": _common.spine_thickness_mm(SPINE_PAGES, FOLIO_PAPER["grammage"], FOLIO_PAPER["bulk"], FOLIO_BINDING_TYPE),
            "ground": PALETTE["night"], "ink": PALETTE["gold"], "rules": PALETTE["gold"],
            "pieces": [
                {"text": "Milton", "font": os.path.join(fonts, "IMFellEnglishSC-Regular.ttf"), "size": 0.3, "at": 0.15},
                {"text": "Paradise Lost", "font": os.path.join(fonts, "IMFellEnglish-Regular.ttf"), "size": 0.42, "at": 0.5, "color": PALETTE["cream"]},
                {"text": "Doré · Verity", "font": os.path.join(fonts, "IMFellEnglishSC-Regular.ttf"), "size": 0.24, "at": 0.86},
            ],
        }
    })
    return spec


# --- config ----------------------------------------------------------------------


def config(plates: dict[str, dict]) -> dict:
    return {
        "locale": "en-gb",
        "page": {
            "sizePreset": "custom",
            "width": mm(PAGE_W),
            "height": mm(PAGE_H),
            "margins": {"top": mm(M_TOP), "bottom": mm(M_BOTTOM), "left": mm(M_INNER), "right": mm(M_OUTER), "mirror": True},
            "baselineGrid": {"enabled": False},
            "pageNumbering": {"format": "decimal", "startAt": 1},
        },
        "layout": {"layoutType": "single"},
        "bodyText": body_text(),
        "headings": headings(),
        "headingStyles": heading_styles(plates),
        "paragraphStyles": paragraph_styles(),
        "footnotes": footnotes(),
        "toc": toc_config(),
        "header": running_heads(),
        "footer": folio_footer(),
        "captionStyle": {
            "fontFamily": BODY,
            "fontSize": pt(9),
            "color": col("ink"),
            "align": "center",
            "gap": mm(2.2),
            "labelBold": False,
            "labelColor": col("accent"),
            "descriptionItalic": True,
            "note": {"fontSize": pt(7.8), "color": col("muted"), "italic": False, "gap": mm(0.6), "align": "center"},
        },
        "colorPalette": COLOR_PALETTE,
        "resourceTypes": resource_types(),
        "pdfGeneration": {"outlines": True},
        "folio": folio_config(),
    }


# --- plates ------------------------------------------------------------------------

PLATE_PX = 1500


def process_plates(meta: list[dict]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    os.makedirs(os.path.join(OUT, "resources"), exist_ok=True)
    cream = tuple(int(PALETTE["cream"][i : i + 2], 16) for i in (1, 3, 5))
    for m in meta:
        slug = m["slug"]
        im = Image.open(os.path.join(SOURCE, m["file"])).convert("L")
        # Paper to white, ink to black (the later scans are grey and flat),
        # then trim the margin round the engraving.
        im = ImageOps.autocontrast(im, cutoff=(0.6, 0.3))
        bbox = im.point(lambda v: 0 if v > 228 else 255).getbbox()
        if bbox:
            l, t, r, b = bbox
            pad = max(2, int(0.004 * max(im.size)))
            im = im.crop((max(0, l - pad), max(0, t - pad), min(im.width, r + pad), min(im.height, b + pad)))
        if max(im.size) > PLATE_PX:
            im.thumbnail((PLATE_PX, PLATE_PX), Image.LANCZOS)
        rel = f"resources/{slug}.jpg"
        im.save(os.path.join(OUT, rel), quality=80, optimize=True, progressive=True)
        out[slug] = {**m, "rel": rel, "pw": im.width, "ph": im.height}
        if slug in (COVER_PLATE, BACK_PLATE):
            # The boards' plates, the white of the paper toned to cream.
            toned = Image.merge("RGB", [im.point(lambda v, c=c: v * c // 255) for c in cream])
            cover_rel = f"resources/{slug}-cover.jpg"
            toned.save(os.path.join(OUT, cover_rel), quality=82, optimize=True, progressive=True)
            out[f"{slug}-cover"] = {**m, "rel": cover_rel, "pw": im.width, "ph": im.height}
    return out


def line_ref(book: int, first: int, last: int) -> str:
    lines = f"line {first}" if first == last else f"lines {first}–{last}"
    return f"Book {roman(book)}, {lines}"


def resource_specs(plates: dict[str, dict]) -> list[dict]:
    specs = []
    for p in PLATES:
        info = plates[p["slug"]]
        aspect = info["pw"] / info["ph"]
        specs.append({
            "id": p["slug"],
            "typeId": "plate",
            "kind": "bitmap",
            "file": info["rel"],
            "width": info["pw"],
            "height": info["ph"],
            "placement": {"position": "top", "span": "page", "width": round(min(1.0, PLATE_H * aspect / TEXT_W), 3), "align": "center"},
            "caption": p["quote"].replace(" / ", " / "),
            "note": line_ref(p["book"], p["first"], p["last"]),
            "altText": f"{p['title']}, by Gustave Doré",
        })
    for slug in (COVER_PLATE, BACK_PLATE):
        info = plates[f"{slug}-cover"]
        specs.append({
            "id": f"{slug}-cover", "typeId": "ornament", "kind": "bitmap", "file": info["rel"], "width": info["pw"], "height": info["ph"],
            "placement": {"position": "here", "span": "column", "width": 0.5, "align": "center"}, "caption": "",
            "altText": next(f"{p['title']}, by Gustave Doré" for p in PLATES if p["slug"] == slug),
        })
    return specs


# --- fonts -------------------------------------------------------------------------


def build_fonts() -> list[dict]:
    fonts_dir = os.path.join(OUT, "fonts")
    os.makedirs(fonts_dir, exist_ok=True)
    src = os.path.join(SOURCE, "fonts")
    garamond = []
    for weight in (400, 500, 700):
        name = _common.instance_font(os.path.join(src, "ebgaramond", "EBGaramond[wght].ttf"), fonts_dir, "EBGaramond", {}, weight, False)
        garamond.append({"weight": weight, "style": "normal", "file": f"fonts/{name}"})
    for weight in (400, 700):
        name = _common.instance_font(os.path.join(src, "ebgaramond", "EBGaramond-Italic[wght].ttf"), fonts_dir, "EBGaramond", {}, weight, True)
        garamond.append({"weight": weight, "style": "italic", "file": f"fonts/{name}"})
    fell = []
    for rel, name, style in (("imfellenglish/IMFeENrm28P.ttf", "IMFellEnglish-Regular.ttf", "normal"), ("imfellenglish/IMFeENit28P.ttf", "IMFellEnglish-Italic.ttf", "italic")):
        shutil.copyfile(os.path.join(src, rel), os.path.join(fonts_dir, name))
        fell.append({"weight": 400, "style": style, "file": f"fonts/{name}"})
    shutil.copyfile(os.path.join(src, "imfellenglishsc", "IMFeENsc28P.ttf"), os.path.join(fonts_dir, "IMFellEnglishSC-Regular.ttf"))
    _common.copy_licences(src, fonts_dir, {"ebgaramond": "EBGaramond-OFL.txt", "imfellenglish": "IMFellEnglish-OFL.txt", "imfellenglishsc": "IMFellEnglishSC-OFL.txt"})
    return [
        {"name": BODY, "variants": garamond},
        {"name": DISPLAY, "variants": fell},
        {"name": CAPS, "variants": [{"weight": 400, "style": "normal", "file": "fonts/IMFellEnglishSC-Regular.ttf"}]},
    ]


# --- notes ---------------------------------------------------------------------------

FORBIDDEN = re.compile(r"[\[\]{}^$#\\|]")


def load_notes(book: poem.Book) -> list[dict]:
    path = os.path.join(HERE, "notes", f"book-{book.number:02d}.json")
    if not os.path.exists(path):
        print(f"note: no notes for Book {book.number}", file=sys.stderr)
        return []
    notes = json.load(open(path, encoding="utf-8"))
    problems = []
    seen = set()
    for n in notes:
        # Some lemmas were copied before the text took Verity's spelling.
        n["lemma"] = poem.typographic(poem.british(n["lemma"]))
        where = f"Book {book.number}, line {n['first']}"
        if not (1 <= n["first"] <= n["last"] <= len(book.lines)):
            problems.append(f"{where}: lines out of range")
            continue
        if n["first"] in seen:
            problems.append(f"{where}: two notes on one line")
        seen.add(n["first"])
        lemma = n["lemma"]
        span = " ".join(book.lines[n["first"] - 1 : n["last"]])
        for part in (p for p in lemma.split(" … ") if p):
            if part not in span:
                problems.append(f"{where}: lemma {part!r} not in the text")
        if FORBIDDEN.search(n["gloss"] + lemma):
            problems.append(f"{where}: forbidden character")
    if problems:
        raise SystemExit("notes:\n  " + "\n  ".join(problems))
    return notes


def note_definition(book: int, n: dict) -> str:
    lines = f"{n['first']}" if n["first"] == n["last"] else f"{n['first']}–{n['last']}"
    lemma, gloss = n["lemma"].strip(), n["gloss"].strip()
    # Verity's comma after the lemma; a full stop when the gloss opens a
    # sentence of its own.
    sep = ". " if gloss[:1].isupper() or gloss[:1] in "“‘*" else ", "
    body = f"*{lemma}*{sep}{gloss}" if lemma else gloss
    return f"[^{note_id(book, n['first'])}]: **{lines}.** {body}"


def note_id(book: int, line: int) -> str:
    return f"b{book}l{line}"


# --- chapters ------------------------------------------------------------------------


def roman(n: int) -> str:
    out = ""
    for value, numeral in ((10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")):
        while n >= value:
            out += numeral
            n -= value
    return out


def md_line(line: str) -> str:
    """A verse line as markdown: emphasis markers and the like escaped."""
    line = line.replace("\\", "").replace("*", "\\*").replace("_", "\\_")
    return line


def compose_book(book: poem.Book) -> str:
    notes = load_notes(book)
    cited = {n["first"] for n in notes}
    plate_after = {p["first"]: p["slug"] for p in PLATES if p["book"] == book.number}
    blocks: list[str] = [f'# Book {roman(book.number)} {{style="book"}}\n', f':::paragraphs{{style="argument"}}\n{book.argument}\n:::\n']
    for first, lines in book.paragraphs():
        # The opening line in a container of its own (indented), the rest in
        # another; a plate's directive splits the run after its line.
        run: list[str] = []
        style = "verse-open"

        def flush() -> None:
            nonlocal run, style
            if run:
                blocks.append(f':::paragraphs{{style="{style}"}}\n' + "\n\n".join(run) + "\n:::\n")
            run = []
            style = "verse"

        for k, line in enumerate(lines):
            number = first + k
            md = md_line(line)
            if number in cited:
                md += f"[^{note_id(book.number, number)}]"
            run.append(md)
            if k == 0:
                flush()
            if number in plate_after:
                flush()
                blocks.append(f'::resource{{id="{plate_after[number]}"}}\n')
        flush()
    if notes:
        blocks.append("\n".join(note_definition(book.number, n) + "\n" for n in notes))
    return "\n".join(blocks)


BOOK = {
    "title": "Paradise Lost",
    "author": "John Milton",
    "edition": "The text of 1674, with notes by A. W. Verity and the fifty plates of Gustave Doré",
}

COLOPHON = [
    "*Paradise Lost* was first printed in ten books in 1667 and in twelve, as here, in 1674, the year of Milton’s death. The text is the 1674 poem in modern spelling, set line for line with the standard numbering.",
    "The notes are a selection from A. W. Verity’s edition (Cambridge University Press, 1910), keyed to the lines and shortened. The plates are Gustave Doré’s wood engravings for the Cassell edition of 1866.",
    "Set with Postext in EB Garamond and the Fell types digitised by Igino Marini.",
]

BACK = {
    "quote": "The world was all before them, where to choose / Their place of rest, and Providence their guide; / They, hand in hand, with wandering steps and slow, / Through Eden took their solitary way.",
    "blurb": "Milton’s epic of the war in Heaven, the fall of the rebel angels and the loss of Eden, in the twelve books of 1674, each with his own Argument. Verity’s notes stand at the foot of the page, and Doré’s fifty engravings at the passages they illustrate.",
}


def the_verse() -> str:
    raw = open(os.path.join(SOURCE, "the-verse.wiki"), encoding="utf-8").read()
    body = raw.split('<div class="prose">', 1)[1].split("</div>", 1)[0]
    body = " ".join(body.split())
    # The opening word set in capitals in 1668, as the rest of the paragraph.
    return body.replace("THE measure", "The measure").replace("'", "’")


def write_chapters(plates: dict[str, dict]) -> list[dict]:
    d = os.path.join(OUT, "chapters")
    os.makedirs(d, exist_ok=True)
    specs: list[dict] = []

    def emit(n: int, slug: str, title: str, body: str) -> None:
        rel = f"chapters/{n:02d}-{slug}.md"
        with open(os.path.join(OUT, rel), "w", encoding="utf-8") as f:
            f.write(body)
        specs.append({"title": title, "file": rel})

    attr = _common.attr_value
    colophon = "\n\n".join(COLOPHON)
    emit(0, "cover", BOOK["title"], (
        f'---\ntitle: "{BOOK["title"]}"\nauthor: "{BOOK["author"]}"\n---\n\n'
        f'# {BOOK["title"]} {{style="cover" toc="false" edition="{attr(BOOK["edition"])}"}}\n\n'
        f':::pagebreak\n\n:::paragraphs{{style="colophon"}}\n{colophon}\n:::\n'
    ))
    emit(1, "contents", "Contents", '# Contents {style="contents" toc="false"}\n\n:::toc\n')
    emit(2, "the-verse", "The Verse", f'# The Verse {{style="front"}}\n\n:::paragraphs{{style="prose"}}\n{the_verse()}\n:::\n')

    books = poem.books()
    for book in books:
        emit(2 + book.number, f"book-{book.number:02d}", f"Book {roman(book.number)}", compose_book(book))

    plate_lines = "\n\n".join(
        f"{line_ref(p['book'], p['first'], p['last'])}: *{p['title']}*. [{plates[p['slug']]['title'].rsplit('.', 1)[0]}]({plates[p['slug']]['page']})"
        for p in PLATES
    )
    credits = "\n\n".join([
        "**Text.** John Milton, *Paradise Lost* (second edition, 1674). The words follow Project Gutenberg eBook #26; the verse paragraphs and the Arguments follow the validated Wikisource transcription of an 1890 reprint (*Paradise lost by Milton, John.djvu*). Where the two disagree, the reading of Verity’s text was taken. Public domain.",
        "**Notes.** A selection from the notes of *Paradise Lost*, edited by A. W. Verity (Cambridge: at the University Press, 1910), from the scan of the University of Toronto copy on the Internet Archive (*paradiselostmilt00miltuoft*). The notes were chosen, shortened and corrected from the scan for this edition; the wording is Verity’s. Public domain.",
        "**Plates.** Gustave Doré’s illustrations for *Milton’s Paradise Lost* (London: Cassell, Petter, and Galpin, 1866), from the Wikimedia Commons category *Illustrations of Paradise Lost by Gustave Doré*; converted to greyscale, trimmed and downscaled. Public domain.",
        "**Fonts.** EB Garamond, by Georg Duffner and Octavio Pardo; IM Fell English and IM Fell English SC, the Fell types digitised by Igino Marini. SIL Open Font License 1.1.",
        "**The plates and their pages on Wikimedia Commons:**",
        plate_lines,
    ])
    emit(15, "credits", "Credits", (
        ':::pagebreak{parity="always-odd"}\n\n'
        f'# Credits {{style="front"}}\n\n:::paragraphs{{style="credits"}}\n{credits}\n:::\n'
    ))
    emit(16, "back-cover", "Back cover", f'# Back cover {{style="back-cover" toc="false" quote="{attr(BACK["quote"])}" blurb="{attr(BACK["blurb"])}"}}\n')
    return specs


# --- credits file & manifest ---------------------------------------------------------


def write_credits_md(plates: dict[str, dict]) -> None:
    rows = "\n".join(f"| `{p['slug']}` | {line_ref(p['book'], p['first'], p['last'])} | [{plates[p['slug']]['title']}]({plates[p['slug']]['page']}) | {plates[p['slug']]['license']} |" for p in PLATES)
    body = f"""# Credits — Paradise Lost

Showcase preset for the Postext sandbox. Everything in this bundle is public
domain or openly licensed; the wording written for the preset (the colophon,
the back cover, this file) is released under CC BY 4.0.

## Text

- John Milton, *Paradise Lost*, second edition (1674), in modern spelling.
  The words follow Project Gutenberg eBook #26
  (https://www.gutenberg.org/ebooks/26); the verse paragraphs and the
  Arguments follow the validated Wikisource transcription of an 1890 reprint
  (https://en.wikisource.org/wiki/Paradise_Lost_(1890)); where the two
  disagree the reading of Verity's text was taken. Milton's note on the
  verse follows https://en.wikisource.org/wiki/Paradise_Lost_(1674)/The_Verse.
  Public domain.

## Notes

A selection from the notes of *Paradise Lost*, edited by A. W. Verity
(Cambridge University Press, 1910; Verity died in 1937), from the Internet
Archive scan of the University of Toronto copy
(https://archive.org/details/paradiselostmilt00miltuoft). Chosen, shortened and
corrected from the OCR for this edition, in Verity's wording. Public domain.

## Plates

Gustave Doré's fifty wood engravings for *Milton's Paradise Lost* (London,
Cassell, Petter, and Galpin, 1866), from the Wikimedia Commons category
"Illustrations of Paradise Lost by Gustave Doré"; converted to greyscale,
trimmed and downscaled for the bundle.

| id | lines | Commons file | tag |
| --- | --- | --- | --- |
{rows}

## Fonts (SIL Open Font License 1.1)

- EB Garamond — Georg Duffner, Octavio Pardo (`fonts/EBGaramond-OFL.txt`).
  Static instances of the variable fonts from https://github.com/google/fonts.
- IM Fell English, IM Fell English SC — Igino Marini
  (`fonts/IMFellEnglish-OFL.txt`, `fonts/IMFellEnglishSC-OFL.txt`).

## Build

`scripts/presets/showcase/paradise-lost/` in the Postext repository: `fetch.py`
downloads the sources, `build.py` writes this bundle; the selected notes live
in `notes/book-NN.json`.
"""
    with open(os.path.join(OUT, "CREDITS.md"), "w", encoding="utf-8") as f:
        f.write(body)


META = {
    "id": PRESET_ID,
    "name": "Paradise Lost · Gustave Doré",
    "description": "Edición anotada en verso: las notas de Verity al pie de página y las cincuenta láminas de Doré · An annotated verse edition: Verity's notes at the foot of the page and Doré's fifty plates",
    "locale": "en",
    "locales": ["en"],
    "openLocale": "en",
    "thumbnail": "thumbnail.jpg",
    "license": "Public domain · OFL fonts",
    "credits": "Milton · Verity · Doré · Project Gutenberg · Wikisource · Wikimedia Commons",
    "tags": ["book", "poetry", "footnotes", "plates", "front-matter"],
}


def write_manifest(chapters: list[dict], resources: list[dict], fonts: list[dict], plates: dict[str, dict]) -> None:
    manifest = {
        "version": 2,
        # Written for the engine's current rules (see configVersion.ts).
        "configVersion": 8,
        **META,
        # A poem reads as one document: the sandbox opens the whole book.
        "view": {"canvasScope": "book"},
        "chapters": chapters,
        "config": config(plates),
        "resources": resources,
        "fonts": fonts,
    }
    with open(os.path.join(OUT, "preset.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=1, ensure_ascii=False)
        f.write("\n")


def main() -> None:
    if not os.path.exists(os.path.join(SOURCE, "plates", "meta.json")):
        raise SystemExit("run fetch.py first")
    for sub in ("chapters", "resources"):
        shutil.rmtree(os.path.join(OUT, sub), ignore_errors=True)
    os.makedirs(OUT, exist_ok=True)
    meta = json.load(open(os.path.join(SOURCE, "plates", "meta.json"), encoding="utf-8"))
    plates = process_plates(meta)
    check_quotes()
    resources = resource_specs(plates)
    fonts = build_fonts()
    resources.append(build_spine())
    chapters = write_chapters(plates)
    write_credits_md(plates)
    write_manifest(chapters, resources, fonts, plates)
    _common.copy_thumbnail(HERE, OUT)
    _common.write_fingerprint(OUT)
    _common.register(PRESET_ID, {k: v for k, v in META.items() if k != "id"})
    print(f"wrote {OUT}  ({_common.bundle_size(OUT):.1f} MB, {len(resources)} resources, {len(chapters)} chapter files)")


def check_quotes() -> None:
    """Every plate's quotation must be the text of its lines."""
    books = {b.number: b for b in poem.books()}
    norm = lambda s: re.sub(r"[^a-z]", "", s.lower())  # noqa: E731
    bad = [
        f"{p['slug']}: {p['quote']!r}"
        for p in PLATES
        if norm(p["quote"]) not in norm(" ".join(books[p["book"]].lines[p["first"] - 1 : p["last"]]))
    ]
    if bad:
        raise SystemExit("plate quotations not in the text:\n  " + "\n  ".join(bad))


if __name__ == "__main__":
    main()
