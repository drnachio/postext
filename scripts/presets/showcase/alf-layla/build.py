#!/usr/bin/env python3
"""Build the `alf-layla` showcase bundle (ألف ليلة وليلة) into
`apps/web/public/presets/alf-layla/` and register it in the public
`index.json`.

    python3 fetch.py                 # sources (once)
    python3 text.py                  # source/text.json
    python3 plates.py                # work/plates
    python3 build.py [--out DIR] [--max-words N] [--keep-fonts]
                                     # --out: a draft elsewhere, not registered

The whole work in the Hindawi text of the Bulaq vulgate, Arabic only, set as
a classical Egyptian book: 17 × 24 cm, right-bound (the document's direction
binds it so), one column of Amiri, the Naskh of the Bulaq press, justified,
with the type area in a ruled double frame on every page as the Bulaq
prints have it; the running heads inside the frame's head (the book's title
on the right-hand page, the tale on the left), folios in Arabic-Indic digits
(abjad letters in the front matter).

- Six parts, the six volumes of the edition, each on a part page of its own
  with the nights it holds.
- A chapter per tale or tale cycle (markup.py), opened by a headpiece band
  (sarlawḥ, ornaments.py) over the title; tales told inside a tale are
  headings of their own, in red as rubrics.
- The nights are in-text headings in red between two ۞, their number in
  words, feminine as ليلة wants it: «الليلة الحادية بعد الألف» (the Hindawi
  wording «فلما كانت الليلة ١٢» is kept in the `hindawi` attribute).
- Verse in `:::verse` blocks, a bayt per line with its two hemistichs.
- Plates: Sani ol-Molk's watercolours and Harvey's wood engravings near the
  passage they show, unnumbered, with an Arabic caption.
- The contents (الفهرس) at the end, as classical Arabic books have it, then
  the printer's colophon (خاتمة الطبع) and the sources.
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
import _common  # noqa: E402
import markup  # noqa: E402
import ornaments  # noqa: E402
import plates as platekit  # noqa: E402
from _common import at, mm, pt  # noqa: E402

SOURCE = os.path.join(HERE, "source")
WORK = os.path.join(HERE, "work")
PRESET_ID = "alf-layla"
OUT = os.path.join(_common.PRESETS_ROOT, PRESET_ID)
LANG = "ar"
# `CONFIG_VERSION` in packages/postext/src/bundle/configVersion.ts.
CONFIG_VERSION = 8

TITLE = "ألف ليلة وليلة"

# --- palette ---------------------------------------------------------------------

PALETTE = {
    # The engine's accent (bullets, rules, caption labels it colours by
    # default): the ink, so nothing on the page is blue.
    "main-color": "#1f1a14",
    "ink": "#1f1a14",
    # The red of the rubrics: night headings, inner tale titles, ornaments.
    "rubric": "#9a2f1f",
    "paper": "#f6efdf",
    "tint": "#efe3c6",
    # The cover: oxblood leather tooled in gold.
    "leather": "#4a1d17",
    "gold": "#d2ad5c",
    "goldDark": "#a8823a",
    "muted": "#6b5f52",
}
PALETTE_NAMES = {
    "main-color": "اللون الرئيسي",
    "ink": "حبر",
    "rubric": "حمرة",
    "paper": "ورق",
    "tint": "صفرة",
    "leather": "جلد",
    "gold": "ذهب",
    "goldDark": "ذهب داكن",
    "muted": "رمادي",
}
col, PALETTE_CONFIG = _common.make_palette(PALETTE, PALETTE_NAMES)


def text(id_: str, content: str, **kw) -> dict:
    kw.setdefault("color", "ink")
    return _common.text_el(id_, content, col=col, **kw)


def rule(id_: str, **kw) -> dict:
    return _common.rule_el(id_, col=col, **kw)


def frame_box(id_: str, *, x: float, y: float, w: float, h: float, color: str, thickness: float, anchor: dict | None = None, **kw) -> dict:
    """An unfilled box: a ruled frame."""
    el = {
        "kind": "box",
        "id": id_,
        "placement": {"anchor": anchor or at("page", "top-left"), "offset": {"x": mm(x), "y": mm(y)}, "size": {"width": mm(w), "height": mm(h)}},
        "style": {"borderColor": col(color), "borderWidth": pt(thickness), "borderRadius": mm(0)},
    }
    el.update(kw)
    return el


def image(id_: str, resource: str, *, anchor: dict, offset=(0.0, 0.0), width=None, height=None, **kw) -> dict:
    el = {
        "kind": "image",
        "id": id_,
        "resourceId": resource,
        "placement": {
            "anchor": anchor,
            "offset": {"x": mm(offset[0]), "y": mm(offset[1])},
            "size": {"width": mm(width) if width is not None else "auto", "height": mm(height) if height is not None else "auto"},
        },
    }
    el.update(kw)
    return el


# --- geometry ----------------------------------------------------------------------


def pt_to_mm(v: float) -> float:
    return v * 25.4 / 72


class Geometry:
    """17 × 24 cm, a single column of `lines` lines on a `lead_pt` pitch.
    `inner` is the spine side. The book is bound on the right: an odd page
    (a recto) is the left-hand page, its inner margin on its right."""

    width, height = 170.0, 240.0
    body_pt, lead_pt = 13.0, 23.0
    lines = 23
    top, inner, text_w = 31.0, 21.0, 124.0
    # The frame: `side` beyond the type area left and right, `head` above it
    # (room for the running head), `foot` below; the inner rule `gap` inside.
    side, head, foot, gap = 4.5, 12.0, 5.0, 1.3

    def __init__(self) -> None:
        self.text_h = round(pt_to_mm(self.lines * self.lead_pt), 3)
        self.outer = round(self.width - self.inner - self.text_w, 3)
        self.bottom = round(self.height - self.top - self.text_h, 3)
        self.lead = pt_to_mm(self.lead_pt)

    def x(self, parity: str) -> float:
        """The type area's left edge on the sheet: the outer margin on the
        left of a recto (odd), the inner margin on the left of a verso."""
        return self.outer if parity == "odd" else self.inner

    def flow_x(self, parity: str) -> float:
        """The same edge in a design laid out in the page's flow (an opener,
        a part page): the flow of a right-to-left page is mirrored, so there
        a recto has its inner margin on the left, as in a left-bound book."""
        return self.inner if parity == "odd" else self.outer

    def page(self) -> dict:
        return {
            "sizePreset": "custom",
            "width": mm(self.width),
            "height": mm(self.height),
            "margins": {"top": mm(self.top), "bottom": mm(self.bottom), "left": mm(self.inner), "right": mm(self.outer), "mirror": True},
            # Abjad letters in the front matter (`:::numbering` in its first
            # file), Arabic-Indic digits from the first volume on.
            "pageNumbering": {"format": "decimal", "startAt": 1},
        }


G = Geometry()
BODY = "Amiri"
DISPLAY = "Aref Ruqaa"
HEADPIECE_H = G.text_w * ornaments.H / ornaments.W


# --- the frame and the running heads -----------------------------------------------


def frame_elements(parity: str, pages: str, *, band: bool = True, prefix: str = "", flow: bool = False) -> list[dict]:
    """The Bulaq frame round the type area: a thick rule outside, a thin one
    inside, and (with `band`) a thin rule closing off the head, where the
    running head and the folio stand. `flow`: for a design laid out in the
    page's (mirrored) flow rather than on the sheet."""
    g = G
    x0 = (g.flow_x(parity) if flow else g.x(parity)) - g.side
    y0 = g.top - g.head
    w = g.text_w + 2 * g.side
    h = g.text_h + g.head + g.foot
    p = f"{prefix}{parity}-{pages}"
    els = [
        frame_box(f"frame-{p}", x=x0, y=y0, w=w, h=h, color="ink", thickness=1.3, parity=parity, pages=pages),
        frame_box(f"frame-in-{p}", x=x0 + g.gap, y=y0 + g.gap, w=w - 2 * g.gap, h=h - 2 * g.gap, color="ink", thickness=0.45, parity=parity, pages=pages),
    ]
    if band:
        els.append(rule(f"band-{p}", anchor=at("page", "top-left"), offset=(x0 + g.gap, g.top - 4.0), width=w - 2 * g.gap, color="ink", thickness=0.45, parity=parity, pages=pages))
    return els


def band_text_y() -> float:
    """Top of a running-head text box set in the band between the inner
    frame rule and the band rule."""
    g = G
    band_top = g.top - g.head + g.gap
    band_h = (g.top - 4.0) - band_top
    return band_top + (band_h - pt_to_mm(11 * 1.2)) / 2


def header(running: dict[str, str]) -> dict:
    """The frame on body and opener pages; the running heads (`running`:
    content by parity) on body pages; the folio at the outer end of the
    band on both. Blank pages carry nothing."""
    g = G
    y = band_text_y()
    els: list[dict] = []
    for parity in ("odd", "even"):
        x = g.x(parity)
        for pages in ("body", "opener"):
            els += frame_elements(parity, pages)
            # The folio at the outer end of the band: the left of a recto,
            # the right of a verso.
            fx, align = (x, "left") if parity == "odd" else (x + g.text_w - 16, "right")
            els.append(text(f"folio-{parity}-{pages}", "{pageNumber}", anchor=at("page", "top-left"), offset=(fx, y), width=16, size_pt=11, family=BODY, align=align, overflow="clip", parity=parity, pages=pages))
        els.append(text(f"head-{parity}", running[parity], anchor=at("page", "top-left"), offset=(x + 18, y), width=g.text_w - 36, size_pt=11, family=BODY, align="center", overflow="ellipsis-end", parity=parity, pages="body"))
    return {"elements": els}


RUNNING = {"even": TITLE, "odd": "{chapterTitle}"}


# --- openers --------------------------------------------------------------------


def opener(lines: list[tuple[str, str, dict]], *, headpiece: bool = True) -> dict:
    """A chapter opener: the headpiece band at the head of the type area,
    then centred lines under it, each `(id, content, style)`; style keys:
    size, weight, family, color, gap (mm above), lh (line height)."""
    w = G.text_w
    els: list[dict] = []
    prev = None
    if headpiece:
        els.append(image("headpiece", "headpiece", anchor=at("container", "top-left"), width=w, height=HEADPIECE_H, decorative=True))
        prev = "headpiece"
    for id_, content, s in lines:
        anchor = at(f"#{prev}", "below") if prev else at("container", "top-left")
        els.append(
            text(
                id_,
                content,
                anchor=anchor,
                offset=(0, s.get("gap", 3)),
                width=w,
                size_pt=s.get("size", 13),
                family=s.get("family", BODY),
                weight=s.get("weight", 400),
                align="center",
                line_height=s.get("lh", 1.5),
                color=s.get("color", "ink"),
            )
        )
        prev = id_
    return {"enabled": True, "slot": {"elements": els}}


ORNAMENT = "۞"
TITLE_LINE = {"size": 19, "weight": 700, "gap": 4.5, "lh": 1.55}
MARK_LINE = {"size": 12, "color": "rubric", "gap": 0.5, "lh": 1.2}


def tale_opener() -> dict:
    return opener([("title", "{titleText}", TITLE_LINE), ("mark", ORNAMENT, MARK_LINE)])


def cycle_opener() -> dict:
    """A chapter of a long romance: the romance's title small above."""
    return opener([("cycle", "{attr.cycle}", {"size": 11.5, "color": "rubric", "gap": 4}), ("title", "{titleText}", {**TITLE_LINE, "gap": 1}), ("mark", ORNAMENT, MARK_LINE)])


def continued_opener() -> dict:
    """A volume that opens inside a tale (and a long tale cut in two): تتمة
    over the title, under the volume's headpiece."""
    return opener([("cont", "تتمة", {"size": 11.5, "color": "rubric", "gap": 4}), ("title", "{titleText}", {**TITLE_LINE, "gap": 1}), ("mark", ORNAMENT, MARK_LINE)])


def basmala_opener() -> dict:
    return opener([("basmala", "{titleText}", {"size": 20, "weight": 700, "gap": 5, "lh": 1.6})])


def front_opener() -> dict:
    """Front and back matter: the headpiece and the title."""
    return opener([("title", "{titleText}", TITLE_LINE)])


def night_design() -> dict:
    """«۞ الليلة الثانية عشرة ۞» in red, on a line of its own."""
    lh = G.lead_pt / 13.5
    return {
        "enabled": True,
        "minHeight": mm(G.lead),
        "slot": {"elements": [text("night", f"{ORNAMENT}  {{titleText}}  {ORNAMENT}", anchor=at("container", "top-left"), offset=(0, 0), width=G.text_w, size_pt=13.5, family=BODY, weight=700, align="center", line_height=lh, color="rubric", overflow="wrap")]},
    }


# --- the cover, the title page, the part pages ---------------------------------------------


COVER_PLATE = "sani-20c"
COVER_TRIM = 0.035
COVER_SIZE = [1359, 819]  # the cropped panel, px (set by resources())


def cover_design() -> dict:
    """Oxblood leather tooled in gold: a double gold frame, the headpiece in
    gold, the title in Ruqʿa, a panel of Sani ol-Molk's (Sharkan and Abriza
    by moonlight) in a gold rule, the volumes' count under it."""
    g = G
    W, H = g.width, g.height
    m = 11.0
    els = [
        _common.box_el("leather", col=col, anchor=at("bleed", "top-left"), fill="leather"),
        frame_box("c-frame", x=m, y=m, w=W - 2 * m, h=H - 2 * m, color="gold", thickness=2.2),
        frame_box("c-frame-in", x=m + 3, y=m + 3, w=W - 2 * m - 6, h=H - 2 * m - 6, color="gold", thickness=0.6),
        image("c-head", "headpiece-gold", anchor=at("page", "top"), offset=(0, m + 9), width=W - 2 * m - 26, decorative=True),
        text("c-title", TITLE, anchor=at("page", "top-left"), offset=(m, 62), width=W - 2 * m, size_pt=46, family=DISPLAY, weight=700, align="center", line_height=1.3, color="gold"),
        frame_box("c-panel-rule", x=(W - 116) / 2 - 2, y=104 - 2, w=116 + 4, h=116 * COVER_SIZE[1] / COVER_SIZE[0] + 4, color="gold", thickness=0.9),
        image("c-panel", "cover-panel", anchor=at("page", "top"), offset=(0, 104), width=116),
        text("c-sub", "في ستة أجزاء", anchor=at("page", "top-left"), offset=(m, 189), width=W - 2 * m, size_pt=17, family=BODY, weight=700, align="center", color="gold"),
        image("c-rosette", "rosette-gold", anchor=at("page", "top"), offset=(0, 204), width=13, decorative=True),
    ]
    return {"enabled": True, "minHeight": mm(g.text_h), "slot": {"elements": els}}


def title_page_design() -> dict:
    """The title page, a recto: in the frame, the headpiece, the title in
    Ruqʿa, the subtitle in rhymed prose as the old title pages have it, the
    edition, the pictures, a rosette, the imprint."""
    g = G
    w = g.text_w
    els = frame_elements("odd", "all", band=False, prefix="tp-", flow=True)
    lines = [
        ("tp-title", TITLE, {"family": DISPLAY, "size": 40, "weight": 700, "gap": 14, "lh": 1.3}),
        ("tp-sub", "وهي الحكايات العجيبة والأخبار الغريبة\\nالتي حدّثت بها شهرزاد الملك شهريار", {"size": 14, "gap": 6, "lh": 1.7}),
        ("tp-vol", "في ستة أجزاء", {"size": 15, "weight": 700, "gap": 7, "color": "rubric"}),
        ("tp-ed", "على نص طبعة بولاق، بضبط مؤسسة هنداوي", {"size": 12.5, "gap": 10, "lh": 1.6}),
        ("tp-pic", "مزيّنة بتصاوير صنيع الملك ورسوم وليم هارفي", {"size": 12.5, "gap": 1, "lh": 1.6}),
    ]
    els.append(image("tp-head", "headpiece", anchor=at("page", "top-left"), offset=(g.flow_x("odd"), g.top + 4), width=w, height=HEADPIECE_H, decorative=True))
    prev = "tp-head"
    for id_, content, s in lines:
        els.append(text(id_, content, anchor=at(f"#{prev}", "below"), offset=(0, s.get("gap", 3)), width=w, size_pt=s["size"], family=s.get("family", BODY), weight=s.get("weight", 400), align="center", line_height=s.get("lh", 1.5), color=s.get("color", "ink")))
        prev = id_
    els += [
        image("tp-rosette", "rosette", anchor=at("page", "top-left"), offset=(g.flow_x("odd") + (w - 14) / 2, g.top + g.text_h - 34), width=14, decorative=True),
        text("tp-imprint", "Postext · ١٤٤٨هـ / ٢٠٢٦م", anchor=at("page", "top-left"), offset=(g.flow_x("odd"), g.top + g.text_h - 12), width=w, size_pt=11, family=BODY, align="center", color="muted"),
    ]
    return {"enabled": True, "minHeight": mm(g.text_h), "slot": {"elements": els}}


PART_NIGHTS = {1: (1, 129), 2: (130, 309), 3: (310, 536), 4: (537, 722), 5: (723, 873), 6: (874, 1001)}


def part_design() -> dict:
    """The part page (a recto): the frame, the headpiece, the book's title,
    the volume in Ruqʿa, a rosette; the nights it holds are the fence's body
    (`parts.margins` lowers it under the design)."""
    g = G
    w = g.text_w
    x = g.flow_x("odd")
    els = frame_elements("odd", "all", band=False, prefix="part-", flow=True)
    els += [
        image("part-head", "headpiece", anchor=at("page", "top-left"), offset=(x, g.top + 4), width=w, height=HEADPIECE_H, decorative=True),
        text("part-book", TITLE, anchor=at("#part-head", "below"), offset=(0, 18), width=w, size_pt=18, family=DISPLAY, weight=700, align="center", color="ink"),
        text("part-title", "{titleText}", anchor=at("#part-book", "below"), offset=(0, 8), width=w, size_pt=34, family=DISPLAY, weight=700, align="center", color="rubric", line_height=1.4),
        image("part-rosette", "rosette", anchor=at("page", "top-left"), offset=(x + (w - 16) / 2, 128), width=16, decorative=True),
    ]
    return {"elements": els}


# --- heading styles, paragraph styles ------------------------------------------------


def heading_styles() -> list[dict]:
    empty = {"elements": []}
    front = {
        "numbered": False,
        "span": "page",
        "breakBefore": {"enabled": True, "parity": "odd"},
        "advancedDesign": front_opener(),
        "header": header({"even": TITLE, "odd": "{chapterTitle}"}),
        "marginBottom": pt(G.lead_pt),
    }
    return [
        {"id": "cover", "name": "الغلاف", "numbered": False, "toc": False, "span": "page", "breakBefore": {"enabled": True, "parity": "odd"}, "advancedDesign": cover_design(), "header": empty, "footer": empty},
        {
            "id": "titlepage",
            "name": "صفحة العنوان",
            "numbered": False,
            "toc": False,
            "span": "page",
            "breakBefore": {"enabled": True, "parity": "odd"},
            "advancedDesign": title_page_design(),
            "header": empty,
            "footer": empty,
            # The back of the title page: the imprint, low on the page.
            "margins": {"top": mm(G.height - 78)},
            "bodyStyle": {"fontFamily": BODY, "fontSize": pt(10.5), "lineHeight": pt(17), "textAlign": "center"},
        },
        {"id": "front", "name": "مقدمات", **front},
        {"id": "back", "name": "الفهرس", **front, "toc": False},
        {"id": "credits", "name": "المصادر", **front},
        {"id": "colophon", "name": "خاتمة الطبع", **front, "advancedDesign": opener([("title", "{titleText}", {**TITLE_LINE, "gap": 2})], headpiece=False)},
        # Openers of the tale chapters (level 1 has the plain one).
        {"id": "cycle", "name": "حكاية من سيرة", "numbered": False, "advancedDesign": cycle_opener()},
        {"id": "continued", "name": "تتمة حكاية", "numbered": False, "toc": False, "advancedDesign": continued_opener()},
        {"id": "basmala", "name": "البسملة", "numbered": False, "toc": False, "advancedDesign": basmala_opener()},
        # `###### الليلة الأولى {style="night" n=1}`.
        {
            "id": "night",
            "name": "ليلة",
            "numbered": False,
            "toc": False,
            "runningChapter": False,
            "fontFamily": BODY,
            "fontSize": pt(13.5),
            "fontWeight": 700,
            "lineHeight": pt(G.lead_pt),
            "color": col("rubric"),
            "marginTop": pt(G.lead_pt),
            "marginBottom": pt(0),
            "advancedDesign": night_design(),
        },
    ]


def paragraph_styles() -> list[dict]:
    lead = pt(G.lead_pt)
    zero = pt(0)
    return [
        # The printer's colophon: centred lines, each shorter than the last.
        {"id": "taper", "name": "خاتمة", "textAlign": "center", "firstLineIndent": zero, "spaceBetween": zero},
        {"id": "imprint", "name": "بيانات الطبع", "fontSize": pt(10.5), "lineHeight": pt(17), "textAlign": "center", "firstLineIndent": zero, "spaceBetween": pt(4)},
        {"id": "credits", "name": "المصادر", "fontSize": pt(11.5), "lineHeight": pt(19), "textAlign": "justify", "firstLineIndent": zero, "spaceBetween": pt(6)},
        {"id": "credits-en", "name": "Sources (English)", "fontSize": pt(10), "lineHeight": pt(14.5), "textAlign": "left", "firstLineIndent": zero, "spaceBetween": pt(4), "marginTop": lead},
        # The poems (`:::verse{style="verse"}`): the body's face and pitch,
        # half a line above; the text after a poem goes back to the grid,
        # which leaves half a line below it too.
        {"id": "verse", "name": "شعر", "marginTop": pt(G.lead_pt / 2)},
        {"id": "note", "name": "تنبيه", "textAlign": "justify", "firstLineIndent": {"value": 1, "unit": "em"}},
    ]


def resource_types() -> list[dict]:
    return [
        {
            "id": "plate",
            "name": "لوحة",
            "namePlural": "لوحات",
            "shortLabel": "لوحة",
            "captionPrefix": "",
            "numberingTemplate": "",
            "resetOn": "never",
            "counterFormat": "decimal",
            "defaultPlacement": {"position": "auto", "span": "page", "width": 1, "align": "center"},
        },
        {"id": "ornament", "name": "زخرفة", "namePlural": "زخارف", "shortLabel": "زخرفة", "captionPrefix": "", "numberingTemplate": "", "resetOn": "never", "counterFormat": "decimal"},
    ]


# --- Folio -------------------------------------------------------------------------

SPINE = "spine"
SPINE_PAGES = 2700
FOLIO = {
    "paper": {"type": "bible", "grammage": 40, "bulk": 1.3, "texture": "laid", "textureStrength": 0.5, "shade": {"hex": "#f3ead6", "model": "hex"}},
    "binding": {"type": "hardcover", "cover": "pages", "coverMaterial": "leather", "coverColor": col("leather"), "spineImage": SPINE},
    "surface": {"type": "walnut"},
    "lighting": {"environment": "lamp"},
}


def add_spine(out: str, shared: list[dict]) -> None:
    """The spine: the title in gold Ruqʿa between gold bands on the leather."""
    fonts = os.path.join(out, "fonts")
    spec, _ = _common.build_spines(
        out,
        SPINE,
        "ornament",
        LANG,
        {
            LANG: {
                "height_mm": G.height,
                "thickness_mm": _common.spine_thickness_mm(SPINE_PAGES, FOLIO["paper"]["grammage"], FOLIO["paper"]["bulk"], FOLIO["binding"]["type"]),
                "ground": PALETTE["leather"],
                "ink": PALETTE["gold"],
                "rules": PALETTE["gold"],
                "pieces": [
                    {"text": TITLE, "font": os.path.join(fonts, "ArefRuqaa-Bold.ttf"), "size": 0.3, "at": 0.4},
                    {"text": "في ستة أجزاء", "font": os.path.join(fonts, "Amiri-Bold.ttf"), "size": 0.2, "at": 0.8},
                ],
            }
        },
    )
    spec["caption"] = "كعب الكتاب"
    shared.append(spec)


# --- the config --------------------------------------------------------------------------


def config() -> dict:
    g = G
    lead = pt(g.lead_pt)
    return {
        "locale": LANG,
        "page": g.page(),
        "layout": {"layoutType": "single"},
        "bodyText": {
            "fontFamily": BODY,
            "fontSize": pt(g.body_pt),
            "lineHeight": lead,
            "textAlign": "justify",
            "firstLineIndent": {"value": 1, "unit": "em"},
            "indentAfterHeading": False,
            "paragraphSpacing": False,
            "color": col("ink"),
            "boldColor": col("ink"),
            "italicColor": col("ink"),
            # No italics in a classical Arabic book: *…* is set bold.
            "emphasis": "bold",
            "avoidWidows": True,
            "avoidOrphans": True,
        },
        "headings": {
            "fontFamily": BODY,
            "color": col("ink"),
            "textAlign": "center",
            "keepWithNext": True,
            "levels": [
                {
                    "level": 1,
                    "numberingTemplate": "",
                    "fontSize": pt(19),
                    "fontWeight": 700,
                    "lineHeight": pt(29),
                    "span": "page",
                    "breakBefore": {"enabled": True, "parity": "any"},
                    "marginBottom": lead,
                    "advancedDesign": tale_opener(),
                },
                {"level": 2, "numberingTemplate": "", "fontSize": pt(15), "fontWeight": 700, "lineHeight": lead, "color": col("rubric"), "marginTop": lead, "marginBottom": pt(g.lead_pt / 2)},
                {"level": 3, "numberingTemplate": "", "fontSize": pt(14), "fontWeight": 700, "lineHeight": lead, "marginTop": lead, "marginBottom": pt(g.lead_pt / 2)},
                {"level": 4, "numberingTemplate": "", "fontSize": pt(13.5), "fontWeight": 700, "lineHeight": lead, "marginTop": lead, "marginBottom": pt(g.lead_pt / 2)},
                {"level": 5, "numberingTemplate": "", "fontSize": pt(13.5), "fontWeight": 700, "lineHeight": lead, "marginTop": lead, "marginBottom": pt(0)},
                {"level": 6, "numberingTemplate": "", "fontSize": pt(13.5), "fontWeight": 700, "lineHeight": lead, "marginTop": lead, "marginBottom": pt(0)},
            ],
        },
        "headingStyles": heading_styles(),
        "paragraphStyles": paragraph_styles(),
        "parts": {
            "breakBefore": {"parity": "odd"},
            "breakAfter": {"enabled": True, "parity": "odd"},
            "margins": {"top": mm(150)},
            "design": part_design(),
            "bodyStyle": {"fontFamily": BODY, "fontSize": pt(14), "lineHeight": lead, "textAlign": "center"},
        },
        "toc": {
            "levels": [
                {"level": 1, "fontFamily": BODY, "fontSize": pt(12.5), "fontWeight": 700, "lineHeight": lead, "color": col("ink"), "numberWidth": mm(0), "numberGap": mm(0), "marginTop": pt(3)},
                {"level": 2, "fontFamily": BODY, "fontSize": pt(12), "lineHeight": lead, "color": col("ink"), "indent": {"value": 1.5, "unit": "em"}, "numberWidth": mm(0), "numberGap": mm(0)},
            ],
            "pageNumber": {"fontFamily": BODY, "fontSize": pt(12), "color": col("ink"), "width": mm(10)},
            "leader": {"enabled": True, "char": ".", "gap": mm(1.2)},
            "parts": {
                "enabled": True,
                "height": pt(g.lead_pt * 2),
                "marginTop": pt(g.lead_pt / 2),
                "design": {"elements": [text("toc-part", "{titleText}", anchor=at("container", "center"), offset=(0, 0), width=g.text_w, size_pt=16, family=DISPLAY, weight=700, align="center", color="rubric")]},
            },
        },
        "header": header(RUNNING),
        "footer": {"elements": []},
        # The caption centred under the plate, the artist under it smaller in
        # grey.
        "captionStyle": {"fontFamily": BODY, "fontSize": pt(11.5), "color": col("ink"), "align": "center", "labelBold": False, "note": {"fontSize": pt(9.5), "color": col("muted"), "align": "center", "gap": pt(1)}},
        "colorPalette": PALETTE_CONFIG,
        "resourceTypes": resource_types(),
        "pdfGeneration": {"outlines": True},
        "folio": FOLIO,
    }


# --- chapters ----------------------------------------------------------------------------

METADATA = {"title": TITLE, "language": "ar"}


def front_files() -> list[tuple[str, str, str]]:
    """(file stem, title, markdown) of the front matter."""
    meta = "".join(f"{k}: {json.dumps(v, ensure_ascii=False)}\n" for k, v in METADATA.items())
    imprint = [
        "ألف ليلة وليلة، الأجزاء الستة، على نص طبعة بولاق كما ضبطته مؤسسة هنداوي (٢٠٢٢).",
        "التصاوير: صنيع الملك (أبو الحسن غفاري، ١٢٦٥–١٢٧٢هـ)، ووليم هارفي (لندن، ١٨٣٩–١٨٤١م).",
        "صُفَّ بحرف «أميري» وطُبع بمحرك Postext، والنسخة كلها في المشاع: نص الكتاب في الملك العام، وضبط هنداوي بموجب رخصة المشاع الإبداعي (CC BY 4.0).",
    ]
    cover = (
        f"---\n{meta}---\n\n"
        ':::numbering{format="arabic-abjad" startAt=1}\n\n'
        f'# الغلاف {{style="cover"}}\n\n'
        f'# صفحة العنوان {{style="titlepage"}}\n\n'
        ":::pagebreak\n\n"
        ':::paragraphs{style="imprint"}\n' + "\n\n".join(imprint) + "\n:::\n"
    )
    note = "# كلمة في هذه الطبعة {style=\"front\"}\n\n" + "\n\n".join(EDITION_NOTE) + "\n"
    return [("000a-cover", "الغلاف", cover), ("000b-note", "كلمة في هذه الطبعة", note)]


EDITION_NOTE = [
    "هذه نسخة كاملة من «ألف ليلة وليلة» على نص طبعة بولاق، وهي الطبعة التي جمعها المصريون في القرن الثالث عشر للهجرة وطُبعت بالمطبعة الأميرية سنة ١٢٥١هـ، وعنها أُخذ أكثر ما في أيدي الناس من نسخ الكتاب. وقد اعتمدنا النص كما ضبطته مؤسسة هنداوي في أجزائها الستة، بالشكل الكامل في الشعر وبالشكل الخفيف في النثر، وأبقينا على تقسيمها الكتابَ إلى أجزاء.",
    "وجعلنا كل حكاية فصلًا، فإذا رُويت حكاية في أثناء أخرى جعلنا عنوانها بالحمرة في داخل الفصل، كما كان النُّسّاخ يكتبون رؤوس الكلام بالمداد الأحمر. وأما الليالي فقد كتبنا عددها بالحروف بين نجمتين، فقلنا: «الليلة الأولى» و«الليلة الحادية بعد الألف»، وكانت في نسخة هنداوي: «فلما كانت الليلة ١٢». وأضفنا عناوين لبعض الحكايات التي لم تُعنون في الأصل، ولمجموعات الحكايات القصار.",
    "والتصاوير من صنيع الملك أبي الحسن الغفاري، رسمها مع تلاميذه للترجمة الفارسية للكتاب بين سنتي ١٢٦٥ و١٢٧٢ للهجرة، وهي محفوظة في مكتبة قصر كلستان بطهران، ولا يبلغ مجلدها الأول إلا حكايات الجزء الأول من هذه الطبعة؛ ومن رسوم وليم هارفي المحفورة على الخشب لترجمة إدوارد لين الإنجليزية، وعنها أخذنا صور حكايات الأجزاء الباقية. والكلام تحت كل صورة من وضعنا. ووضعنا الفهرس في آخر الكتاب على عادة الكتب القديمة.",
]

COLOPHON = [
    # Each line shorter than the last: the tapering block of the old
    # printers' colophons.
    "تمَّ بحمد الله تعالى وعونه وحسن توفيقه صفُّ كتاب ألف ليلة وليلة",
    "في أجزائه الستة، من أول الليلة الأولى إلى آخر الليلة",
    "الحادية بعد الألف، وكان الفراغ منه في شهر",
    "ربيع الآخر سنة ثمانٍ وأربعين وأربعمائة",
    "وألف من هجرة سيد المرسلين",
    "والحمد لله أولًا وآخرًا",
]

CREDITS_AR = [
    "**النص:** ألف ليلة وليلة، طبعة مؤسسة هنداوي (٢٠٢٢) في ستة أجزاء، عن طبعة بولاق. نص الكتاب في الملك العام؛ أما الضبط بالشكل وعلامات الترقيم فمن عمل مؤسسة هنداوي، مرخَّص بموجب رخصة المشاع الإبداعي: نسب المصنَّف، الإصدار ٤٫٠ (CC BY 4.0). أُخذت النسخ الإلكترونية (EPUB) من أرشيف الإنترنت. التعديلات: توحيد الترميز، وحذف علامات الاتجاه الخفية، وتصحيح عنوان الليلة ١٣٦ («فقال» ← «فلما»)، وتقسيم أربع فقرات عند بداية حكايات لم تُعنون في الأصل، وعناوين لتلك الحكايات ولمجموعات الحكايات القصار، وكتابة عدد الليالي بالحروف، وحذف رسوم تلك الطبعة.",
    "**التصاوير:** صنيع الملك أبو الحسن غفاري (١٨١٤–١٨٦٦م) وتلاميذه، رسوم «هزار و یک شب»، الترجمة الفارسية لألف ليلة وليلة، المجلد الأول، ١٢٦٥–١٢٧٢هـ (١٨٤٩–١٨٥٦م)، مكتبة قصر كلستان، طهران (المخطوط ٢٢٤٠)؛ ووليم هارفي (١٧٩٦–١٨٦٦م)، رسوم محفورة على الخشب لترجمة إدوارد وليم لين (لندن، ١٨٣٩–١٨٤١م). عن ويكيميديا كومنز وأرشيف الإنترنت، وكلها في الملك العام. الكلام تحت الصور من وضعنا، مستخلص من العناوين الفارسية في المخطوط ومن عناوين لين لرسوم هارفي.",
    "**الحروف:** «أميري» (الإصدار ١٫٠٠٣) لخالد حسني، و«عارف رقعة» لعبد الله عارف وخالد حسني، برخصة SIL Open Font License 1.1. والزخارف (السرلوح والشمسة) مرسومة لهذه النسخة.",
    "**الإخراج:** صُفَّ الكتاب بمحرك Postext؛ ونصوص هذه النسخة التي كتبناها (الكلمة في الطبعة، والعناوين المضافة، والكلام تحت الصور، وهذه الصفحة) بموجب رخصة المشاع الإبداعي CC BY 4.0.",
]

CREDITS_EN = [
    "One Thousand and One Nights (Alf layla wa-layla), the Bulaq text in the Hindawi Foundation edition (2022), six volumes; text in the public domain, Hindawi’s vocalisation and punctuation CC BY 4.0. Pictures: Sani ol-Molk (Abu’l-Hasan Ghaffari) and workshop, Persian Nights, Golestan Palace Library MS 2240, 1849–56; William Harvey’s wood engravings for E. W. Lane’s translation, London 1839–41; Wikimedia Commons and the Internet Archive, public domain. Fonts: Amiri and Aref Ruqaa, SIL OFL 1.1. Set with Postext.",
]


def back_files() -> list[tuple[str, str, str]]:
    fihris = '# الفهرس {style="back"}\n\n:::toc\n'
    colophon = (
        '# خاتمة الطبع {style="colophon"}\n\n'
        ':::paragraphs{style="taper"}\n' + "\n\n".join(COLOPHON) + "\n:::\n\n"
        '::resource{id="rosette-colophon"}\n'
    )
    credits = (
        '# المصادر والحقوق {style="credits"}\n\n'
        ':::paragraphs{style="credits"}\n' + "\n\n".join(CREDITS_AR) + "\n:::\n\n"
        ':::paragraphs{style="credits-en" dir="ltr"}\n' + "\n\n".join(CREDITS_EN) + "\n:::\n"
    )
    return [("900-fihris", "الفهرس", fihris), ("901-colophon", "خاتمة الطبع", colophon), ("902-credits", "المصادر والحقوق", credits)]


def place_plates(data: dict, plates: list[dict]) -> None:
    """Mark where each plate goes: before the paragraph its `find` phrase
    is in (the picture floats to the first free slot from there, so it
    meets the passage it shows), else after the tale's first paragraph."""
    spans = platekit.tale_spans(data)
    for p in plates:
        tid = p.get("tale")
        if not tid or p.get("kind") == "ornament":
            continue
        paras = spans[tid]
        if p.get("find"):
            pat = re.compile(re.escape(platekit.bare(p["find"])).replace(r"\ ", r"\s+"))
            hit = next((b for b in paras if pat.search(platekit.bare("".join(r if isinstance(r, str) else "" for r in b["runs"])))), None)
            if hit is None:
                raise SystemExit(f"plate {p['id']}: «{p['find']}» not found in {tid}")
            hit.setdefault("platesBefore", []).append(p["id"])
        else:
            paras[0].setdefault("platesAfter", []).append(p["id"])


def with_plates(blocks: list[dict]) -> list[dict]:
    out = []
    for b in blocks:
        for pid in b.get("platesBefore", []):
            out.append({"type": "resource", "id": pid, "night": b.get("night")})
        out.append(b)
        for pid in b.get("platesAfter", []):
            out.append({"type": "resource", "id": pid, "night": b.get("night")})
    return out


# A level-1 heading line of markup.py: `# title {attrs}`.
H1 = re.compile(r"^# (.+) \{(.*)\}$", re.M)


def styled(md: str) -> str:
    """Give each chapter heading its opener: a continuation chapter, or a
    chapter of a long romance (`cycle=`)."""

    def sub(m: re.Match) -> str:
        title, attrs = m.group(1), m.group(2)
        if "style=" in attrs:
            return m.group(0)
        if 'continued="true"' in attrs:
            return f'# {title} {{style="continued" {attrs}}}'
        if "cycle=" in attrs:
            return f'# {title} {{style="cycle" {attrs}}}'
        return m.group(0)

    return H1.sub(sub, md)


def part_body(md: str) -> str:
    """The nights a volume holds, as the body of its part page."""

    def sub(m: re.Match) -> str:
        n = int(m.group(1).translate(str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")))
        a, b = PART_NIGHTS[n]
        body = f"من الليلة {markup.arabic_digits(a)} إلى الليلة {markup.arabic_digits(b)}"
        if n == 6:
            body += "\n\nوخاتمة الكتاب"
        return m.group(0)[: -len(":::")] + body + "\n:::"

    return re.sub(r':::part\{number="([٠-٩]+)"[^}]*\}\n:::', sub, md)


def write_chapters(out: str, data: dict, max_words: int | None) -> list[dict]:
    specs: list[dict] = []
    chapters_dir = os.path.join(out, "chapters", LANG)

    def emit(stem: str, title: str, md: str) -> None:
        rel = f"chapters/{LANG}/{stem}.md"
        with open(os.path.join(out, rel), "w", encoding="utf-8") as f:
            f.write(md.rstrip() + "\n")
        specs.append({"title": title, "file": rel})

    os.makedirs(chapters_dir, exist_ok=True)
    for stem, title, md in front_files():
        emit(stem, title, md)
    chs = markup.chapters(data, max_words=max_words)
    for i, ch in enumerate(chs):
        ch["blocks"] = with_plates(ch["blocks"])
        md = markup.chapter_markdown(ch, night_level=0, night_title="ordinal")
        md = part_body(styled(md)).replace("\n:::verse\n", '\n:::verse{style="verse"}\n')
        if i == 0:
            # The text's folios: Arabic-Indic digits from the first volume.
            md = ':::numbering{format="decimal" startAt=1}\n\n' + md
        stem = f"{100 + i}-{ch['slug']}"
        emit(stem, ch["title"] if not ch.get("front") else f"{ch['title']} ({markup.ordinal_ar(ch['volume'], feminine=False)})", md)
    for stem, title, md in back_files():
        emit(stem, title, md)
    return specs


# --- resources -----------------------------------------------------------------------

PLATE_WIDTH = 1300  # px: about 265 dpi across the 124 mm measure
PLATE_WIDTH_GRAY = 1100  # the wood engravings, at most 0.7 of it wide
PLATE_QUALITY = 78


def plate_note(p: dict) -> str:
    return "من تصاوير صنيع الملك" if p["source"] == "sani" else "من رسوم وليم هارفي"


def plate_alt(p: dict) -> str:
    if p["source"] == "sani":
        return f"لوحة مائية لصنيع الملك: {p['caption']}"
    return f"رسم محفور على الخشب لوليم هارفي: {p['caption']}"


def resources(out: str, plates: list[dict]) -> list[dict]:
    rdir = os.path.join(out, "resources")
    os.makedirs(rdir, exist_ok=True)
    specs: list[dict] = []
    for p in plates:
        if p.get("kind") == "ornament":
            continue  # the Harvey gateway and roundel: the drawn headpiece stands for them
        src = os.path.join(WORK, "plates", p["id"] + ".jpg")
        im = Image.open(src)
        im = im.convert("L" if im.mode == "L" else "RGB")
        limit = PLATE_WIDTH_GRAY if im.mode == "L" else PLATE_WIDTH
        if im.width > limit:
            im = im.resize((limit, round(im.height * limit / im.width)), Image.LANCZOS)
        rel = f"resources/{p['id']}.jpg"
        im.save(os.path.join(out, rel), quality=PLATE_QUALITY, optimize=True, progressive=True)
        aspect = im.height / im.width
        # A tall picture (Harvey's engravings, the narrow panels) is narrowed
        # so it stays under about 105 mm.
        width = 1.0 if aspect <= 0.7 else round(min(1.0, 0.7 / aspect), 3)
        specs.append(
            {
                "id": p["id"],
                "typeId": "plate",
                "kind": "bitmap",
                "file": rel,
                "width": im.width,
                "height": im.height,
                "placement": {"position": "auto", "span": "page", "width": width, "align": "center"},
                "caption": p["caption"],
                "note": plate_note(p),
                "altText": plate_alt(p),
            }
        )
    # The cover's panel: the plate less the strip of the manuscript's
    # cartouche frame along its top.
    im = Image.open(os.path.join(WORK, "plates", COVER_PLATE + ".jpg")).convert("RGB")
    im = im.crop((0, round(im.height * COVER_TRIM), im.width, im.height))
    im.save(os.path.join(rdir, "cover-panel.jpg"), quality=PLATE_QUALITY, optimize=True, progressive=True)
    COVER_SIZE[:] = [im.width, im.height]
    specs.append({"id": "cover-panel", "typeId": "ornament", "kind": "bitmap", "file": "resources/cover-panel.jpg", "width": im.width, "height": im.height, "caption": "شركان وإبريزة في ضوء القمر", "altText": "لوحة مائية لصنيع الملك: شركان وإبريزة في ضوء القمر"})
    made = ornaments.write_all(rdir, PALETTE["ink"], PALETTE["rubric"], PALETTE["tint"], PALETTE["paper"], PALETTE["gold"], PALETTE["goldDark"])
    names = {"headpiece": "سرلوح", "headpiece-gold": "سرلوح مذهَّب", "rosette": "شمسة", "rosette-gold": "شمسة مذهَّبة"}
    for rid, (f, w, h) in made.items():
        specs.append({"id": rid, "typeId": "ornament", "kind": "svg", "file": f"resources/{f}", "width": w, "height": h, "caption": names[rid]})
    # The colophon's rosette, set in the text.
    specs.append({"id": "rosette-colophon", "typeId": "ornament", "kind": "svg", "file": "resources/rosette.svg", "width": 200, "height": 200, "caption": "", "placement": {"position": "here", "span": "column", "width": 0.14, "align": "center"}})
    return specs


# --- fonts -----------------------------------------------------------------------------

FONT_FACES = [
    # (family, source, weight, file stem)
    (BODY, "amiri/Amiri-Regular.ttf", 400, "Amiri-Regular"),
    (BODY, "amiri/Amiri-Bold.ttf", 700, "Amiri-Bold"),
    (DISPLAY, "arefruqaa/ArefRuqaa-Bold.ttf", 700, "ArefRuqaa-Bold"),
]


def _ranges(*pairs: tuple[int, int]) -> set[int]:
    return {c for a, b in pairs for c in range(a, b + 1)}


# Kept whatever the text holds: the Arabic block (marks, digits, tatweel for
# kashida), Arabic punctuation, ﴾﴿, ASCII and Latin-1 for the credits and for
# text a reader types in the Sandbox.
RESERVE = _ranges((0x20, 0x7E), (0xA0, 0xFF), (0x600, 0x6FF), (0x2000, 0x206F), (0xFD3E, 0xFD3F), (0xFDF2, 0xFDF2), (0xFDFA, 0xFDFA), (0x25CC, 0x25CC))


def build_fonts(out: str, text_used: str) -> list[dict]:
    from fontTools import subset
    from fontTools.ttLib import TTFont

    fonts_dir = os.path.join(out, "fonts")
    os.makedirs(fonts_dir, exist_ok=True)
    families: dict[str, list[dict]] = {}
    unicodes = sorted(RESERVE | {ord(c) for c in text_used})
    for family, src, weight, stem in FONT_FACES:
        font = TTFont(os.path.join(SOURCE, "fonts", src))
        opts = subset.Options()
        opts.layout_features = ["*"]
        opts.name_IDs = ["*"]
        opts.name_languages = ["*"]
        opts.notdef_outline = True
        opts.glyph_names = False
        opts.hinting = False
        sub = subset.Subsetter(opts)
        sub.populate(unicodes=unicodes)
        sub.subset(font)
        # TTF, not WOFF2: the spine picture and the PDF read them directly.
        name = f"{stem}.ttf"
        font.save(os.path.join(fonts_dir, name))
        families.setdefault(family, []).append({"weight": weight, "style": "normal", "file": f"fonts/{name}"})
        print(f"  {name:24} {os.path.getsize(os.path.join(fonts_dir, name)) / 1e3:7.0f} kB")
    shutil.copyfile(os.path.join(SOURCE, "fonts", "amiri", "OFL.txt"), os.path.join(fonts_dir, "Amiri-OFL.txt"))
    shutil.copyfile(os.path.join(SOURCE, "fonts", "arefruqaa", "OFL.txt"), os.path.join(fonts_dir, "ArefRuqaa-OFL.txt"))
    return [{"name": n, "variants": v} for n, v in families.items()]


# --- manifest ---------------------------------------------------------------------------

META = {
    "id": PRESET_ID,
    "name": "ألف ليلة وليلة · One Thousand and One Nights",
    "description": "Las mil y una noches completas en árabe, en el texto de Bulaq: un libro clásico egipcio encuadernado a la derecha, con marco de doble filete, las noches en palabras y las acuarelas de Sani ol-Molk · The complete Thousand and One Nights in Arabic, the Bulaq text: a classical Egyptian book bound on the right, with a double-ruled frame, the nights in words and Sani ol-Molk’s watercolours",
    "locale": LANG,
    "locales": [LANG],
    "openLocale": LANG,
    "thumbnail": "thumbnail.jpg",
    "license": "Public domain · CC BY 4.0 · OFL fonts",
    "credits": "مؤسسة هنداوي · Bulaq 1835 · صنيع الملك · William Harvey · Wikimedia Commons",
    "tags": ["book", "arabic", "right-to-left", "right-bound", "verse", "plates", "parts"],
}


def write_manifest(out: str, chapters: list[dict], shared: list[dict], fonts: list[dict]) -> None:
    manifest = {
        "version": 2,
        "configVersion": CONFIG_VERSION,
        **META,
        "view": {"canvasScope": "chapter"},
        "chapters": {LANG: chapters},
        "config": config(),
        "localized": {LANG: {}},
        "resources": shared,
        "fonts": fonts,
    }
    with open(os.path.join(out, "preset.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=1, ensure_ascii=False)
        f.write("\n")


def write_credits_md(out: str, plates: list[dict]) -> None:
    rows = "\n".join(f"| `{p['id']}` | {p['caption']} | {p.get('taleTitle', '')} | [{'Commons' if 'wikimedia' in p['commonsPage'] else 'Internet Archive'}]({p['commonsPage']}) | {p['license']} |" for p in plates if p.get("kind") != "ornament")
    body = f"""# Credits — ألف ليلة وليلة · One Thousand and One Nights

Showcase preset for the Postext sandbox: the whole of *Alf layla wa-layla*
(nights 1–1001 and the conclusion) in Arabic, set as a classical Egyptian
book. The editorial matter written for the preset (the edition note, the
headings added for unheaded tales and for the groups of short anecdotes,
the captions, the colophon and credits pages, this file) is released under
CC BY 4.0.

## Text

The Bulaq text (first printed at Būlāq, 1251/1835) in the Hindawi Foundation
edition, *Alf layla wa-layla*, six volumes, 2022 (مؤسسة هنداوي,
https://www.hindawi.org). The original text is in the public domain; Hindawi's
vocalisation and punctuation are licensed CC BY 4.0. The EPUBs were taken
from the Internet Archive's Wayback Machine (captures listed in
`scripts/presets/showcase/alf-layla/fetch.py`).

Changes: Unicode NFC; invisible direction marks removed; the heading of
night 136 corrected («فقال» → «فلما»); four paragraphs split where an
unheaded tale begins; headings added for those tales and for runs of short
anecdotes («… وحكايات أخرى»); the night headings «فلما كانت الليلة ١٢»
rewritten as ordinal words («الليلة الثانية عشرة»), the original kept as a
heading attribute; the edition's own illustrations left out.

## Pictures

- Abu'l-Hasan Ghaffari, Sani ol-Molk (1814–1866), and workshop: paintings
  for the Persian *Hazar-o yek shab*, vol. 1, 1849–56, Golestan Palace
  Library, Tehran, MS 2240. Photographs on Wikimedia Commons, public
  domain. Panels cut from the manuscript pages; the Arabic captions are
  ours, after the Persian captions of the manuscript.
- William Harvey (1796–1866): wood engravings for E. W. Lane's translation,
  *The Thousand and One Nights*, London 1839–41, engraved by Landells,
  Whimper, Jackson, the Williamses, Harriet Clarke and others. Public domain.
  Six from Wikimedia Commons; nineteen cut from the Internet Archive scans of
  Lane's volume 2 (1840, `thousandandonen01lanegoog`) and volume 3 (1841,
  `thousandandonen01harvgoog`), chosen from Lane's lists of illustrations for
  the tales of the later Bulaq volumes, set in grey.
- The headpiece (سرلوح) and the rosettes are drawn for this bundle
  (`ornaments.py`), CC0.

| id | caption | tale | source | licence |
| --- | --- | --- | --- | --- |
{rows}

## Fonts

SIL Open Font License 1.1 (licence texts in `fonts/`): Amiri 1.003 (Khaled
Hosny), Aref Ruqaa (Abdullah Aref, Khaled Hosny). Subset to the Arabic block,
Latin-1 and the characters of the text.

## Build

`scripts/presets/showcase/alf-layla/` in the Postext repository: `fetch.py`
downloads the sources, `text.py`, `markup.py` and `plates.py` prepare the
text and the pictures, `ornaments.py` draws the ornaments, `build.py` writes
this bundle.
"""
    with open(os.path.join(out, "CREDITS.md"), "w", encoding="utf-8") as f:
        f.write(body)


def bundle_text(out: str) -> str:
    s = json.dumps(config(), ensure_ascii=False)
    for dp, _, fs in os.walk(os.path.join(out, "chapters")):
        for f in fs:
            s += open(os.path.join(dp, f), encoding="utf-8").read()
    return s


def main() -> None:
    args = sys.argv[1:]
    out = args[args.index("--out") + 1] if "--out" in args else OUT
    max_words = int(args[args.index("--max-words") + 1]) if "--max-words" in args else None
    data = json.load(open(os.path.join(SOURCE, "text.json"), encoding="utf-8"))
    plates = json.load(open(os.path.join(WORK, "plates", "plates.json"), encoding="utf-8"))
    keep_fonts = "--keep-fonts" in args and os.path.exists(os.path.join(out, "preset.json"))
    old_fonts = json.load(open(os.path.join(out, "preset.json"), encoding="utf-8"))["fonts"] if keep_fonts else None
    for sub in ("chapters", "resources") + (() if keep_fonts else ("fonts",)):
        shutil.rmtree(os.path.join(out, sub), ignore_errors=True)
    os.makedirs(out, exist_ok=True)
    place_plates(data, plates)
    chapters = write_chapters(out, data, max_words)
    shared = resources(out, plates)
    fonts = old_fonts if keep_fonts else build_fonts(out, bundle_text(out))
    add_spine(out, shared)
    write_manifest(out, chapters, shared, fonts)
    write_credits_md(out, plates)
    _common.copy_thumbnail(HERE, out)
    _common.write_fingerprint(out)
    if out == OUT:
        # A right-bound book: its shelf spine and cover open from the right.
        # The two right-bound books stand last on the shelf: this one, then
        # 紅樓夢 (`shelfOrder` 2).
        _common.register(PRESET_ID, {**{k: v for k, v in META.items() if k != "id"}, "binding": "right", "shelfOrder": 1})
    print(f"wrote {out} ({_common.bundle_size(out):.1f} MB, {len(chapters)} chapter files)")


if __name__ == "__main__":
    main()
