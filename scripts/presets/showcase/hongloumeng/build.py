#!/usr/bin/env python3
"""Build the `hongloumeng` showcase bundle into
`apps/web/public/presets/hongloumeng/` and register it in the public
`index.json`.

    python3 fetch.py                          # sources (once)
    <venv>/bin/python text.py --qa            # source/chapters.json (needs OpenCC)
    <venv>/bin/python text.py --front         # source/front.json: the prefaces
    python3 plates.py process                 # work/plates, work/portraits, work/pictures.json
    python3 build.py [--out DIR] [--keep-fonts]  # the bundle (--out: a draft elsewhere, not registered;
                                              # --keep-fonts: design changes only, fonts of the last build)

One bundle, three editions:

- `zh-Hant`, the edition the home shelf opens: 程乙本 (1792), 120 回. Its
  design here is a HORIZONTAL PLACEHOLDER (the zh-Hans design in Traditional
  faces, `zh_hant_placeholder_config`); the vertical right-bound design
  (#188, #189) replaces it.
- `zh-Hans`: the same text in Simplified characters, horizontal and
  left-bound, 140 × 203 mm, 28 characters by 28 lines, mainland punctuation.
- `en`: H. Bencraft Joly's translation, chapters 1–56 (all he published),
  140 × 216 mm in EB Garamond.

Each edition: a cover and title page, the edition note, the prefaces (程偉元's
序, 高鶚's 敘 and the 1792 引言 in Chinese; Joly's preface in English), a gallery
of Gai Qi's portraits, the contents, the chapters (a plate at the head of every
opener, the 回目 couplet on two lines, verse in Kai, the ch. 5 song titles, the
ch. 38 poem heads and the closing formula in styles of their own), an index
of the principal characters at their first mention, and the credits.

The chapter plate is drawn by the opener design (`resourceId: "{attr.plate}"`):
the couplet printed under it is the plate's own inscription, so it takes no
caption and no number. Its wording in every edition (the couplet half, Joly's
line) is the resource's caption in the Resources panel; its alt text names the
chapter and the line the plate illustrates, and the opener design hands it to
the HTML `alt` and to a tagged PDF's `Figure` (#213).
"""
from __future__ import annotations

import json
import math
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))
import _common  # noqa: E402
import editorial as ed  # noqa: E402
import fonts as fontkit  # noqa: E402
from _common import at, mm, pt  # noqa: E402

SOURCE = os.path.join(HERE, "source")
WORK = os.path.join(HERE, "work")
PRESET_ID = "hongloumeng"
OUT = os.path.join(_common.PRESETS_ROOT, PRESET_ID)
LANGS = ed.LANGS
# `CONFIG_VERSION` in packages/postext/src/bundle/configVersion.ts.
CONFIG_VERSION = 8

# --- palette ----------------------------------------------------------------------

PALETTE = {
    "ink": "#1f1b16",  # 墨
    "vermilion": "#b23a2e",  # 朱
    "paper": "#f5efe1",  # 紙
    "indigo": "#34405a",  # 黛: the cloth of a thread-bound cover
    "thread": "#e9e1cf",
    "muted": "#6b6259",
}
PALETTE_NAMES = {
    "zh-Hant": {"ink": "墨", "vermilion": "朱", "paper": "紙", "indigo": "黛", "thread": "線", "muted": "灰"},
    "zh-Hans": {"ink": "墨", "vermilion": "朱", "paper": "纸", "indigo": "黛", "thread": "线", "muted": "灰"},
    "en": {"ink": "Ink", "vermilion": "Vermilion", "paper": "Paper", "indigo": "Indigo cloth", "thread": "Thread", "muted": "Grey"},
}
col, _palette = _common.make_palette(PALETTE, {})


def palette(lang: str) -> list[dict]:
    return _common.make_palette(PALETTE, PALETTE_NAMES[lang])[1]


def text(id_: str, content: str, **kw) -> dict:
    kw.setdefault("color", "ink")
    return _common.text_el(id_, content, col=col, **kw)


def rule(id_: str, **kw) -> dict:
    return _common.rule_el(id_, col=col, **kw)


def box(id_: str, **kw) -> dict:
    return _common.box_el(id_, col=col, **kw)


# --- Chinese numerals ---------------------------------------------------------------

DIGITS = "〇一二三四五六七八九"


def cn(n: int) -> str:
    """Informal Chinese numerals, 1–999: 十, 十二, 一百零一, 一百一十."""
    if n < 10:
        return DIGITS[n]
    if n < 20:
        return "十" + (DIGITS[n % 10] if n % 10 else "")
    if n < 100:
        return DIGITS[n // 10] + "十" + (DIGITS[n % 10] if n % 10 else "")
    h, rest = divmod(n, 100)
    if rest == 0:
        return DIGITS[h] + "百"
    if rest < 10:
        return DIGITS[h] + "百零" + DIGITS[rest]
    return DIGITS[h] + "百" + (DIGITS[rest // 10] + "十" + (DIGITS[rest % 10] if rest % 10 else ""))


def roman(n: int) -> str:
    out = ""
    for value, numeral in ((50, "L"), (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")):
        while n >= value:
            out += numeral
            n -= value
    return out


# --- geometry -------------------------------------------------------------------------------


def pt_to_mm(v: float) -> float:
    return v * 25.4 / 72


class Geometry:
    """A single-column page whose type area is a whole number of lines (and,
    for Chinese, of characters: the measure is `chars` em of the body size,
    rounded up by a hair so the last character is never pushed out)."""

    def __init__(self, width: float, height: float, top: float, inner: float, body_pt: float, lead_pt: float, lines: int, *, chars: int | None = None, text_w: float | None = None):
        self.width, self.height = width, height
        self.body_pt, self.lead_pt = body_pt, lead_pt
        self.text_w = round(pt_to_mm(chars * body_pt) + 0.005, 2) if chars else float(text_w)
        self.text_h = round(pt_to_mm(lines * lead_pt) + 0.005, 2)
        self.top, self.inner = top, inner
        self.outer = round(width - inner - self.text_w, 3)
        self.bottom = round(height - top - self.text_h, 3)
        self.lines = lines
        self.chars = chars

    def left(self, parity: str) -> float:
        """x of the type area: odd pages keep the inner margin on the left."""
        return self.inner if parity == "odd" else self.outer

    def page(self) -> dict:
        return {
            "sizePreset": "custom",
            "width": mm(self.width),
            "height": mm(self.height),
            "margins": {"top": mm(self.top), "bottom": mm(self.bottom), "left": mm(self.inner), "right": mm(self.outer), "mirror": True},
            # Decimal: a chapter the Sandbox lays out before the background
            # pagination reaches it shows Arabic folios. The front matter
            # switches to lower-roman in its first file (`:::numbering`).
            "pageNumbering": {"format": "decimal", "startAt": 1},
        }


ZH = Geometry(140, 203, 20, 16, 10.5, 16, 28, chars=28)
EN = Geometry(140, 216, 18, 17, 10.5, 13.5, 37, text_w=103)

# --- the Chinese design (zh-Hans; zh-Hant uses it as its placeholder) ------------------------------


class ZhFaces:
    def __init__(self, lang: str):
        tc = lang == "zh-Hant"
        self.serif = "Noto Serif TC" if tc else "Noto Serif SC"
        self.kai = "LXGW WenKai TC" if tc else "LXGW WenKai"
        self.sans = "Noto Sans TC" if tc else "Noto Sans SC"


PLATE_H = 86.0  # the chapter plate at the head of an opener
# The contents print chapter numbers in the bold of their face (the engine's
# default, set explicitly so the English column can be measured for it).
TOC_NUMBER_WEIGHT = 700


def zh_running_heads(lang: str, f: ZhFaces, recto: str = "{chapterNumber}　{chapterTitle}") -> dict:
    """Verso: the book's title; recto: 第N回 and the couplet. A hairline under
    both. None on opener pages (clreq §7.2.3)."""
    g = ZH
    y = g.top - 10.5
    els = []
    for parity, content in (("even", ed.BOOK[lang]["title"]), ("odd", recto)):
        x = g.left(parity)
        els.append(text(f"head-{parity}", content, anchor=at("page", "top-left"), offset=(x, y), width=g.text_w, size_pt=8.5, family=f.kai, align="center", parity=parity, pages="body", overflow="ellipsis-end"))
        els.append(rule(f"head-rule-{parity}", anchor=at("page", "top-left"), offset=(x, g.top - 4.5), width=g.text_w, color="ink", thickness=0.35, parity=parity, pages="body"))
    return {"elements": els}


def zh_folios(f: ZhFaces) -> dict:
    """Arabic folios at the outer foot of body and opener pages; blank pages
    carry none."""
    g = ZH
    y = g.height - g.bottom + 8
    els = []
    for pages in ("body", "opener"):
        els.append(text(f"folio-even-{pages}", "{pageNumber}", anchor=at("page", "top-left"), offset=(g.left("even"), y), width=24, size_pt=8.5, family=f.serif, align="left", parity="even", pages=pages, overflow="clip"))
        els.append(text(f"folio-odd-{pages}", "{pageNumber}", anchor=at("page", "top-left"), offset=(g.left("odd") + g.text_w - 24, y), width=24, size_pt=8.5, family=f.serif, align="right", parity="odd", pages=pages, overflow="clip"))
    return {"elements": els}


def zh_opener(f: ZhFaces) -> dict:
    """The plate at the head of the page, 第N回 under it, then the couplet on
    two centred lines and a short vermilion rule. Every element is centred on
    the container (`top`), which the HTML view makes wider than the measure."""
    w = ZH.text_w
    y_number = PLATE_H + 6.5
    y_couplet = y_number + 8.5
    return {
        "enabled": True,
        "slot": {
            "elements": [
                {"kind": "image", "id": "plate", "resourceId": "{attr.plate}", "placement": {"anchor": at("container", "top"), "offset": {"x": mm(0), "y": mm(0)}, "size": {"width": "auto", "height": mm(PLATE_H)}}},
                text("hui", "{number}", anchor=at("container", "top"), offset=(0, y_number), width=w, size_pt=14, family=f.serif, weight=700, align="center", overflow="clip", letterSpacing=pt(1.5)),
                text("couplet", "{titleText}", anchor=at("container", "top"), offset=(0, y_couplet), width=w, size_pt=12.5, family=f.kai, align="center", line_height=1.6),
                rule("couplet-rule", anchor=at("#couplet", "below"), offset=((w - 12) / 2, 3.5), width=12, color="vermilion", thickness=0.6),
            ]
        },
    }


def zh_front_opener(f: ZhFaces) -> dict:
    """Unnumbered sections (edition note, prefaces, gallery, contents, index,
    credits): the title three lines down, a short rule under it."""
    w = ZH.text_w
    return {
        "enabled": True,
        "minHeight": mm(pt_to_mm(ZH.lead_pt * 4)),
        "slot": {
            "elements": [
                text("front-title", "{titleText}", anchor=at("container", "top"), offset=(0, pt_to_mm(ZH.lead_pt * 1)), width=w, size_pt=16, family=f.kai, align="center", overflow="wrap", letterSpacing=pt(2)),
                rule("front-rule", anchor=at("#front-title", "below"), offset=((w - 12) / 2, 4), width=12, color="vermilion", thickness=0.6),
            ]
        },
    }


def zh_cover(lang: str, f: ZhFaces, binding: str) -> dict:
    """A thread-bound cover: indigo cloth, four-hole stitching along the
    binding edge and a paper title slip with the title set vertically, one
    character under another, at the top of the free edge."""
    g = ZH
    stitch_x = 9.0  # the stitching line, from the binding edge
    holes = [g.height * r for r in (0.1, 0.36, 0.64, 0.9)]
    slip_w, slip_h, slip_top, slip_edge = 23.0, 92.0, 14.0, 11.0
    slip_x = slip_edge if binding == "right" else g.width - slip_edge - slip_w
    line_x = g.width - stitch_x if binding == "right" else stitch_x
    edge_x = g.width if binding == "right" else 0.0
    els = [
        box("cloth", anchor=at("bleed", "top-left"), fill="indigo"),
        # The thread: along the stitching line between the outer holes, and
        # from each hole round the spine edge.
        {"kind": "rule", "id": "stitch-line", "direction": "vertical", "placement": {"anchor": at("page", "top-left"), "offset": {"x": mm(line_x), "y": mm(holes[0])}, "size": {"height": mm(holes[-1] - holes[0])}}, "color": col("thread"), "thickness": pt(1.5)},
    ]
    for i, y in enumerate(holes):
        els.append(rule(f"stitch-{i}", anchor=at("page", "top-left"), offset=(min(line_x, edge_x), y), width=abs(edge_x - line_x) + 1, color="thread", thickness=1.5))
    els += [
        box("slip", anchor=at("page", "top-left"), offset=(slip_x, slip_top), width=slip_w, height=slip_h, fill="paper", style={"backgroundColor": col("paper"), "borderColor": col("ink"), "borderWidth": pt(0.6), "borderRadius": mm(0)}),
        box("slip-frame", anchor=at("#slip", "top-left"), offset=(1.4, 1.4), width=slip_w - 2.8, height=slip_h - 2.8, fill="paper", style={"borderColor": col("ink"), "borderWidth": pt(0.3), "borderRadius": mm(0)}),
        text("slip-title", ed.BOOK[lang]["title_vertical"], anchor=at("#slip", "top-left"), offset=(0, 9), width=slip_w, size_pt=30, family=f.kai, align="center", line_height=1.22, overflow="wrap"),
        text("slip-note", "\n".join(ed.BOOK[lang]["slip_note"]), anchor=at("#slip", "top-left"), offset=(slip_w / 2 - 3.2, slip_h - 30), width=6.4, size_pt=9, family=f.kai, align="center", line_height=1.25, overflow="wrap"),
    ]
    return {"enabled": True, "minHeight": mm(g.height), "slot": {"elements": els}}


def zh_title_page(lang: str, f: ZhFaces) -> dict:
    """The title page (扉页), a recto. Anchored to the page: the section's
    margins put the colophon low on the verso that follows."""
    g = ZH
    w = g.text_w
    x = g.left("odd")
    return {
        "enabled": True,
        "minHeight": mm(g.text_h),
        "slot": {
            "elements": [
                text("tp-title", ed.BOOK[lang]["title"], anchor=at("page", "top-left"), offset=(x, g.top + 34), width=w, size_pt=34, family=f.kai, align="center", letterSpacing=pt(8)),
                rule("tp-rule", anchor=at("#tp-title", "below"), offset=((w - 16) / 2, 8), width=16, color="vermilion", thickness=0.8),
                text("tp-author", ed.BOOK[lang]["author"], anchor=at("#tp-rule", "below"), offset=(-(w - 16) / 2, 9), width=w, size_pt=11.5, family=f.kai, align="center"),
                text("tp-editors", ed.BOOK[lang]["editors"], anchor=at("#tp-author", "below"), offset=(0, 3), width=w, size_pt=11.5, family=f.kai, align="center"),
                text("tp-imprint", "Postext", anchor=at("page", "top-left"), offset=(x, g.top + g.text_h - 8), width=w, size_pt=9, family=f.serif, align="center", color="muted", letterSpacing=pt(1)),
            ]
        },
    }


def zh_poem_head(f: ZhFaces) -> dict:
    """A poem's title and its author on one line (ch. 38: 憶菊 … 蘅蕪君):
    the title four ems in, the name set right. A heading, so it keeps with
    the poem under it; its text (title　name) is what the contents, the
    bookmarks and a reader of the tagged PDF get."""
    lead_mm = pt_to_mm(ZH.lead_pt)
    em_mm = pt_to_mm(ZH.body_pt)
    lh = ZH.lead_pt / ZH.body_pt
    return {
        "enabled": True,
        "minHeight": mm(lead_mm),
        "slot": {
            "elements": [
                text("poem-title", "{attr.title}", anchor=at("container", "top-left"), offset=(4 * em_mm, 0), width=ZH.text_w / 2, size_pt=ZH.body_pt, family=f.kai, align="left", line_height=lh, overflow="clip"),
                text("poem-author", "{attr.by}", anchor=at("container", "top-right"), offset=(0, 0), width=ZH.text_w / 3, size_pt=ZH.body_pt, family=f.kai, align="right", line_height=lh, overflow="clip"),
            ]
        },
    }


def zh_heading_styles(lang: str, f: ZhFaces) -> list[dict]:
    b = ed.BOOK[lang]
    empty = {"elements": []}
    front_head = zh_running_heads(lang, f, recto="{chapterTitle}")
    front = {
        "numbered": False,
        "span": "page",
        "breakBefore": {"enabled": True, "parity": "odd"},
        "advancedDesign": zh_front_opener(f),
        "header": front_head,
        "marginBottom": pt(0),
    }
    names = {
        "zh-Hant": ("封面", "扉頁", "卷首", "序文", "繡像", "目錄", "索引", "卷末"),
        "zh-Hans": ("封面", "扉页", "卷首", "序文", "绣像", "目录", "索引", "卷末"),
    }[lang]
    return [
        {"id": "cover", "name": names[0], "numbered": False, "toc": False, "span": "page", "breakBefore": {"enabled": True, "parity": "odd"}, "advancedDesign": zh_cover(lang, f, "right" if lang == "zh-Hant" else "left"), "header": empty, "footer": empty},
        {
            "id": "titlepage",
            "name": names[1],
            "numbered": False,
            "toc": False,
            "span": "page",
            "breakBefore": {"enabled": True, "parity": "odd"},
            "advancedDesign": zh_title_page(lang, f),
            "header": empty,
            "footer": empty,
            # The verso of the title page: the colophon, low on the page.
            "margins": {"top": mm(ZH.height - 72)},
            "bodyStyle": {"fontFamily": f.serif, "fontSize": pt(8.5), "lineHeight": pt(13), "textAlign": "left"},
        },
        {"id": "front", "name": names[2], **front},
        {"id": "preface", "name": names[3], **front, "bodyStyle": {"fontFamily": f.kai, "fontSize": pt(10.5), "lineHeight": pt(16), "textAlign": "justify"}},
        {"id": "gallery", "name": names[4], **front, "layout": {"layoutType": "double", "gutterWidth": mm(6)}},
        {"id": "contents", "name": names[5], **front, "toc": False},
        {"id": "back", "name": names[6], **front, "layout": {"layoutType": "double", "gutterWidth": mm(6)}},
        {"id": "credits", "name": names[7], **front},
        # `## 憶菊　蘅蕪君 {style="poem" title="憶菊" by="蘅蕪君"}`
        {"id": "poem", "name": "詩題" if lang == "zh-Hant" else "诗题", "numbered": False, "toc": False, "fontFamily": f.kai, "fontSize": pt(ZH.body_pt), "lineHeight": pt(ZH.lead_pt), "marginTop": pt(ZH.lead_pt), "marginBottom": pt(0), "advancedDesign": zh_poem_head(f)},
    ]


def zh_paragraph_styles(lang: str, f: ZhFaces) -> list[dict]:
    hant = lang == "zh-Hant"
    lead = pt(ZH.lead_pt)
    return [
        # Verse: 低二格, turnover lines two more; a poem in several stanzas is
        # one block (build.py merges consecutive verse paragraphs).
        {"id": "verse", "name": "詩詞" if hant else "诗词", "fontFamily": f.kai, "fontSize": pt(10.5), "lineHeight": lead, "textAlign": "left", "indent": {"value": 2, "unit": "em"}, "hangingIndent": {"value": 2, "unit": "em"}, "spaceBetween": pt(0)},
        # The song titles of chapter 5: 【紅樓夢引子】…
        {"id": "song", "name": "曲名", "fontFamily": f.sans, "fontSize": pt(9.5), "lineHeight": lead, "fontWeight": 500, "textAlign": "left", "indent": {"value": 1, "unit": "em"}, "firstLineIndent": pt(0), "marginTop": lead, "color": col("vermilion")},
        # The closing formula: 且聽下回分解.
        {"id": "closing", "name": "回末", "fontFamily": f.kai, "fontSize": pt(10.5), "lineHeight": lead, "textAlign": "left", "firstLineIndent": {"value": 2, "unit": "em"}, "marginTop": lead},
        {"id": "signature", "name": "署名", "fontFamily": f.kai, "fontSize": pt(10.5), "lineHeight": lead, "textAlign": "right", "firstLineIndent": pt(0), "indent": pt(0)},
        {"id": "note", "name": "說明" if hant else "说明", "fontFamily": f.kai, "fontSize": pt(10), "lineHeight": lead, "textAlign": "justify", "firstLineIndent": {"value": 2, "unit": "em"}, "color": col("muted"), "marginBottom": lead},
        {"id": "colophon", "name": "版權頁" if hant else "版权页", "fontFamily": f.serif, "fontSize": pt(8.5), "lineHeight": pt(13), "textAlign": "left", "firstLineIndent": pt(0), "spaceBetween": pt(2)},
        {"id": "credits", "name": "來源" if hant else "来源", "fontFamily": f.serif, "fontSize": pt(9), "lineHeight": pt(14), "textAlign": "left", "firstLineIndent": pt(0), "spaceBetween": pt(6)},
    ]


def zh_resource_types(lang: str, f: ZhFaces) -> list[dict]:
    b = ed.BOOK[lang]
    return [
        {"id": "figure", "name": b["figure_type"][0], "namePlural": b["figure_type"][0], "shortLabel": b["figure_type"][1], "captionPrefix": b["figure_type"][0], "numberingTemplate": "{h1}-{n}", "resetOn": "never", "counterFormat": "decimal"},
        {
            "id": "portrait",
            "name": b["portrait_type"][0],
            "namePlural": b["portrait_type"][0],
            "shortLabel": b["portrait_type"][1],
            "captionPrefix": "",
            "numberingTemplate": "",
            "resetOn": "never",
            "counterFormat": "decimal",
            "defaultPlacement": {"position": "here", "span": "column", "width": 0.84, "align": "center"},
            "captionStyle": {"fontFamily": f.kai, "fontSize": pt(10), "align": "center", "gap": mm(1.2)},
        },
        {"id": "plate", "name": b["plate_type"][0], "namePlural": b["plate_type"][0], "shortLabel": b["plate_type"][1], "captionPrefix": "", "numberingTemplate": "", "resetOn": "never", "counterFormat": "decimal", "defaultPlacement": {"position": "here", "span": "column", "width": 1, "align": "center"}},
    ]


def zh_config(lang: str) -> dict:
    """The horizontal Chinese book: 28 characters by 28 lines of 10.5 pt on a
    16 pt pitch, justified, two-em indents and no space between paragraphs;
    a new page for every 回 (另页起), on either side."""
    f = ZhFaces(lang)
    g = ZH
    lead = pt(g.lead_pt)
    return {
        "locale": lang,
        "page": g.page(),
        "layout": {"layoutType": "single"},
        "bodyText": {
            "fontFamily": f.serif,
            "fontSize": pt(g.body_pt),
            "lineHeight": lead,
            "textAlign": "justify",
            "firstLineIndent": {"value": 2, "unit": "em"},
            "indentAfterHeading": True,
            "paragraphSpacing": False,
            "color": col("ink"),
            "boldColor": col("ink"),
            "italicColor": col("ink"),
            "avoidWidows": True,
            "avoidOrphans": True,
        },
        "headings": {
            "fontFamily": f.kai,
            "color": col("ink"),
            "keepWithNext": True,
            "levels": [
                {
                    "level": 1,
                    "numberingTemplate": "第{1:一}回",
                    "numberSeparator": "　",
                    "fontSize": pt(12.5),
                    "lineHeight": pt(20),
                    "span": "page",
                    "breakBefore": {"enabled": True, "parity": "any"},
                    "marginBottom": pt(ZH.lead_pt / 2),
                    "advancedDesign": zh_opener(f),
                }
            ],
        },
        "headingStyles": zh_heading_styles(lang, f),
        "paragraphStyles": zh_paragraph_styles(lang, f),
        # 卷一 … 卷十二 group the contents and the chapter menu; no divider
        # page, so no design either.
        "parts": {"page": False, "design": {"elements": []}},
        "toc": {
            "levels": [
                {
                    "level": 1,
                    "fontFamily": f.serif,
                    "fontSize": pt(10),
                    "lineHeight": lead,
                    "color": col("ink"),
                    # 第一百一十一回 … 第一百一十九回 are seven characters.
                    "numberWidth": {"value": 7, "unit": "em"},
                    "numberGap": {"value": 1, "unit": "em"},
                    "numberFontFamily": f.serif,
                    "numberFontSize": pt(10),
                    "numberFontWeight": TOC_NUMBER_WEIGHT,
                    "numberColor": col("ink"),
                }
            ],
            "unnumbered": {"fontFamily": f.kai, "color": col("ink")},
            "pageNumber": {"fontFamily": f.serif, "fontSize": pt(10), "color": col("ink"), "width": mm(8)},
            "leader": {"enabled": True, "char": "·", "gap": mm(1.5)},
            "parts": {
                "enabled": True,
                "height": pt(g.lead_pt * 2),
                "marginTop": pt(0),
                "design": {
                    "elements": [
                        text("toc-part", "{number}　{titleText}", anchor=at("container", "left"), offset=(0, 0), width=g.text_w, size_pt=10, family=f.sans, weight=500, align="left", color="vermilion", letterSpacing=pt(1)),
                    ]
                },
            },
        },
        "index": {
            "fontFamily": f.serif,
            "fontSize": pt(10),
            "lineHeight": lead,
            "separator": "　",
            "locatorSeparator": "，",
            "groups": {"fontFamily": f.sans, "fontWeight": 500, "color": col("vermilion"), "marginTop": lead},
        },
        "header": zh_running_heads(lang, f),
        "footer": zh_folios(f),
        "captionStyle": {"fontFamily": f.kai, "fontSize": pt(9.5), "color": col("ink"), "align": "center", "labelBold": False, "labelNumberGap": "", "labelSeparator": "　"},
        "colorPalette": palette(lang),
        "resourceTypes": zh_resource_types(lang, f),
        "pdfGeneration": {"outlines": True},
    }


def zh_hant_placeholder_config() -> dict:
    """PLACEHOLDER for the zh-Hant edition: the horizontal zh-Hans design in
    the Traditional faces (Noto Serif TC, LXGW WenKai TC, Noto Sans TC),
    Taiwan conventions from the locale. The vertical, right-bound design
    (148 × 210 mm, 38 characters per column, #188 #189 #192) replaces it."""
    return zh_config("zh-Hant")


# --- the English design ------------------------------------------------------------------------

SERIF_EN = "EB Garamond"
KAI_TC = "LXGW WenKai TC"
EN_PLATE_H = 84.0
EN_TOC_PT = 9.5


def toc_number_width_mm() -> float:
    """The contents' number column in the English edition: the widest roman
    numeral of chapters I–LVI (XXXVIII) in EB Garamond Bold at the contents
    size, plus a hair, rounded up to half a millimetre."""
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer

    font = TTFont(os.path.join(fontkit.FONTS, "ebgaramond", "EBGaramond[wght].ttf"))
    font = instancer.instantiateVariableFont(font, {"wght": TOC_NUMBER_WEIGHT})
    cmap, hmtx, upm = font.getBestCmap(), font["hmtx"], font["head"].unitsPerEm
    widest = max(sum(hmtx[cmap[ord(ch)]][0] for ch in roman(n)) for n in range(1, 57))
    return math.ceil((pt_to_mm(widest / upm * EN_TOC_PT) + 0.3) * 2) / 2


def en_running_heads() -> dict:
    g = EN
    y = g.top - 9.5
    b = ed.BOOK["en"]
    els = []
    for parity, content in (("even", b["running_head"]), ("odd", b["chapter_label"] + " {chapterNumber}")):
        els.append(text(f"head-{parity}", content, anchor=at("page", "top-left"), offset=(g.left(parity), y), width=g.text_w, size_pt=7.5, family=SERIF_EN, align="center", parity=parity, pages="body", overflow="ellipsis-end", letterSpacing=pt(1.4)))
    return {"elements": els}


def en_front_heads() -> dict:
    g = EN
    y = g.top - 9.5
    els = []
    for parity, content in (("even", ed.BOOK["en"]["running_head"]), ("odd", "{chapterTitle}")):
        els.append(text(f"head-{parity}", content, anchor=at("page", "top-left"), offset=(g.left(parity), y), width=g.text_w, size_pt=7.5, family=SERIF_EN, align="center", parity=parity, pages="body", overflow="ellipsis-end", letterSpacing=pt(1.4), textTransform="uppercase"))
    return {"elements": els}


def en_folios() -> dict:
    g = EN
    y = g.height - g.bottom + 8
    els = []
    for parity in ("even", "odd"):
        for pages in ("body", "opener"):
            els.append(text(f"folio-{parity}-{pages}", "{pageNumber}", anchor=at("page", "top-left"), offset=(g.left(parity), y), width=g.text_w, size_pt=9, family=SERIF_EN, align="center", parity=parity, pages=pages, overflow="clip"))
    return {"elements": els}


def en_opener() -> dict:
    """The plate, CHAPTER N, the Chinese couplet of the 1792 text and Joly's
    two title lines in italics."""
    w = EN.text_w
    y_label = EN_PLATE_H + 6
    return {
        "enabled": True,
        "slot": {
            "elements": [
                {"kind": "image", "id": "plate", "resourceId": "{attr.plate}", "placement": {"anchor": at("container", "top"), "offset": {"x": mm(0), "y": mm(0)}, "size": {"width": "auto", "height": mm(EN_PLATE_H)}}},
                text("label", ed.BOOK["en"]["chapter_label"] + " {number}", anchor=at("container", "top"), offset=(0, y_label), width=w, size_pt=9, family=SERIF_EN, weight=600, align="center", color="vermilion", letterSpacing=pt(2), overflow="clip"),
                text("couplet-zh", "{attr.zh}", anchor=at("#label", "below"), offset=(0, 3), width=w, size_pt=10.5, family=KAI_TC, align="center", color="muted", overflow="clip"),
                text("title", "{titleText}", anchor=at("#couplet-zh", "below"), offset=(6, 3.5), width=w - 12, size_pt=11.5, family=SERIF_EN, italic=True, align="center", line_height=1.3),
            ]
        },
    }


def en_front_opener() -> dict:
    w = EN.text_w
    return {
        "enabled": True,
        "minHeight": mm(pt_to_mm(EN.lead_pt * 6)),
        "slot": {
            "elements": [
                text("front-title", "{titleText}", anchor=at("container", "top"), offset=(0, pt_to_mm(EN.lead_pt * 2)), width=w, size_pt=15, family=SERIF_EN, italic=True, align="center", overflow="wrap"),
                rule("front-rule", anchor=at("#front-title", "below"), offset=((w - 12) / 2, 4), width=12, color="vermilion", thickness=0.6),
            ]
        },
    }


def en_title_page() -> dict:
    """The title page, a recto, anchored to the page (the section's margins
    put the colophon low on its verso)."""
    g = EN
    w = g.text_w
    x = g.left("odd")
    b = ed.BOOK["en"]
    return {
        "enabled": True,
        "minHeight": mm(g.text_h),
        "slot": {
            "elements": [
                {"kind": "image", "id": "tp-plate", "resourceId": "portrait-stone-and-flower", "placement": {"anchor": at("page", "top"), "offset": {"x": mm((g.inner - g.outer) / 2), "y": mm(g.top + 4)}, "size": {"width": "auto", "height": mm(70)}}},
                text("tp-title", b["title"].upper(), anchor=at("page", "top-left"), offset=(x, g.top + 84), width=w, size_pt=22, family=SERIF_EN, align="center", letterSpacing=pt(3)),
                text("tp-subtitle", b["subtitle"], anchor=at("#tp-title", "below"), offset=(0, 3), width=w, size_pt=13, family=SERIF_EN, italic=True, align="center"),
                text("tp-zh", "紅樓夢", anchor=at("#tp-subtitle", "below"), offset=(0, 5), width=w, size_pt=14, family=KAI_TC, align="center", color="vermilion", letterSpacing=pt(4)),
                text("tp-author", b["author"], anchor=at("#tp-zh", "below"), offset=(0, 9), width=w, size_pt=12, family=SERIF_EN, align="center"),
                text("tp-translator", b["translator"], anchor=at("#tp-author", "below"), offset=(0, 3), width=w, size_pt=10.5, family=SERIF_EN, italic=True, align="center"),
                text("tp-extent", b["extent"], anchor=at("#tp-translator", "below"), offset=(0, 2), width=w, size_pt=9.5, family=SERIF_EN, align="center", color="muted", letterSpacing=pt(1)),
                text("tp-imprint", "POSTEXT", anchor=at("page", "top-left"), offset=(x, g.top + g.text_h - 6), width=w, size_pt=8.5, family=SERIF_EN, align="center", color="muted", letterSpacing=pt(2.5)),
            ]
        },
    }


def en_part_design() -> dict:
    g = EN
    return {
        "elements": [
            text("part-label", ed.BOOK["en"]["part_label"] + " {number}", anchor=at("page", "top-left"), offset=(g.inner, 72), width=g.text_w, size_pt=11, family=SERIF_EN, weight=600, align="center", color="vermilion", letterSpacing=pt(3)),
            text("part-title", "{titleText}", anchor=at("#part-label", "below"), offset=(0, 5), width=g.text_w, size_pt=16, family=SERIF_EN, italic=True, align="center"),
            rule("part-rule", anchor=at("#part-title", "below"), offset=((g.text_w - 12) / 2, 6), width=12, color="vermilion", thickness=0.6),
        ]
    }


def en_config() -> dict:
    g = EN
    lead = pt(g.lead_pt)
    empty = {"elements": []}
    front = {"numbered": False, "span": "page", "breakBefore": {"enabled": True, "parity": "odd"}, "advancedDesign": en_front_opener(), "header": en_front_heads(), "marginBottom": pt(0)}
    return {
        "locale": "en",
        "page": g.page(),
        "layout": {"layoutType": "single"},
        "bodyText": {
            "fontFamily": SERIF_EN,
            "fontSize": pt(g.body_pt),
            "lineHeight": lead,
            "textAlign": "justify",
            "firstLineIndent": {"value": 1.2, "unit": "em"},
            "indentAfterHeading": False,
            "paragraphSpacing": False,
            "color": col("ink"),
            "boldColor": col("ink"),
            "italicColor": col("ink"),
            "hyphenation": {"enabled": True, "locale": "en-us"},
            "avoidWidows": True,
            "avoidOrphans": True,
            "optimalLineBreaking": True,
        },
        "headings": {
            "fontFamily": SERIF_EN,
            "color": col("ink"),
            "keepWithNext": True,
            "levels": [
                {
                    "level": 1,
                    "numberingTemplate": "{1:I}",
                    "fontSize": pt(11.5),
                    "lineHeight": pt(15),
                    "italic": True,
                    "span": "page",
                    "breakBefore": {"enabled": True, "parity": "any"},
                    "marginBottom": lead,
                    "advancedDesign": en_opener(),
                }
            ],
        },
        "headingStyles": [
            {"id": "cover", "name": "Title page", "numbered": False, "toc": False, "span": "page", "breakBefore": {"enabled": True, "parity": "odd"}, "advancedDesign": en_title_page(), "header": empty, "footer": empty, "margins": {"top": mm(g.height - 70)}, "bodyStyle": {"fontFamily": SERIF_EN, "fontSize": pt(8.5), "lineHeight": pt(12), "textAlign": "left"}},
            {"id": "front", "name": "Front matter", **front},
            {"id": "gallery", "name": "Portraits", **front, "layout": {"layoutType": "double", "gutterWidth": mm(6)}},
            {"id": "contents", "name": "Contents", **front, "toc": False},
            {"id": "back", "name": "Index", **front, "layout": {"layoutType": "double", "gutterWidth": mm(6)}},
            {"id": "credits", "name": "Credits", **front},
        ],
        "paragraphStyles": [
            {"id": "verse", "name": "Verse", "fontSize": pt(10), "lineHeight": lead, "textAlign": "left", "hyphenation": False, "indent": {"value": 1.5, "unit": "em"}, "hangingIndent": {"value": 1.5, "unit": "em"}, "spaceBetween": pt(0), "marginTop": pt(4), "marginBottom": pt(4)},
            {"id": "closing", "name": "Closing formula", "italic": True, "textAlign": "left", "firstLineIndent": {"value": 1.2, "unit": "em"}, "marginTop": pt(6)},
            {"id": "signature", "name": "Signature", "textAlign": "right", "firstLineIndent": pt(0), "fontSize": pt(10)},
            {"id": "note", "name": "Introduction", "italic": True, "fontSize": pt(10), "textAlign": "left", "firstLineIndent": pt(0), "color": col("muted"), "marginBottom": lead},
            {"id": "colophon", "name": "Colophon", "fontSize": pt(8.5), "lineHeight": pt(12), "textAlign": "left", "firstLineIndent": pt(0), "spaceBetween": pt(4)},
            {"id": "credits", "name": "Credits", "fontSize": pt(9), "lineHeight": pt(12.5), "textAlign": "left", "firstLineIndent": pt(0), "spaceBetween": pt(5), "hyphenation": False},
        ],
        "parts": {
            "breakBefore": {"parity": "odd"},
            "breakAfter": {"enabled": True, "parity": "odd"},
            "margins": {"top": mm(120)},
            "design": en_part_design(),
        },
        "toc": {
            "levels": [
                {
                    "level": 1,
                    "fontFamily": SERIF_EN,
                    "fontSize": pt(EN_TOC_PT),
                    "lineHeight": pt(12.5),
                    "color": col("ink"),
                    "numberWidth": mm(toc_number_width_mm()),
                    "numberGap": mm(2.5),
                    "numberFontFamily": SERIF_EN,
                    "numberFontSize": pt(EN_TOC_PT),
                    "numberFontWeight": TOC_NUMBER_WEIGHT,
                    "numberColor": col("vermilion"),
                    "marginTop": pt(3),
                }
            ],
            "unnumbered": {"italic": True},
            "pageNumber": {"fontFamily": SERIF_EN, "fontSize": pt(9.5), "color": col("ink"), "width": mm(8)},
            "leader": {"enabled": True, "char": ".", "gap": mm(1.2)},
            "parts": {
                "enabled": True,
                "height": pt(g.lead_pt * 2),
                "marginTop": pt(6),
                "design": {"elements": [text("toc-part", ed.BOOK["en"]["part_label"] + " {number} · {titleText}", anchor=at("container", "left"), offset=(0, 0), width=g.text_w, size_pt=9, family=SERIF_EN, weight=600, align="left", color="vermilion", letterSpacing=pt(1.2))]},
            },
        },
        "index": {"fontFamily": SERIF_EN, "fontSize": pt(9.5), "lineHeight": pt(12.5), "groups": {"fontFamily": SERIF_EN, "fontWeight": 600, "color": col("vermilion")}},
        "header": en_running_heads(),
        "footer": en_folios(),
        "captionStyle": {"fontFamily": SERIF_EN, "fontSize": pt(9), "color": col("ink"), "align": "center", "labelBold": False, "descriptionItalic": True},
        "colorPalette": palette("en"),
        "resourceTypes": [
            {"id": "figure", "name": "Figure", "namePlural": "Figures", "shortLabel": "Fig.", "captionPrefix": "Figure", "numberingTemplate": "{n}", "resetOn": "never", "counterFormat": "decimal"},
            {"id": "portrait", "name": "Portrait", "namePlural": "Portraits", "shortLabel": "Portrait", "captionPrefix": "", "numberingTemplate": "", "resetOn": "never", "counterFormat": "decimal", "defaultPlacement": {"position": "here", "span": "column", "width": 0.84, "align": "center"}, "captionStyle": {"fontSize": pt(9), "align": "center", "gap": mm(1.2)}},
            {"id": "plate", "name": "Chapter plate", "namePlural": "Chapter plates", "shortLabel": "Plate", "captionPrefix": "", "numberingTemplate": "", "resetOn": "never", "counterFormat": "decimal", "defaultPlacement": {"position": "here", "span": "column", "width": 1, "align": "center"}},
        ],
        "pdfGeneration": {"outlines": True},
    }


# --- markdown --------------------------------------------------------------------------------------

MARK_OPEN, MARK_CLOSE = "", ""


def md_escape(s: str) -> str:
    """Markdown-significant ASCII in the source texts: only `*` (the English
    italics text.py writes) is meant as markup; brackets are Joly's."""
    return s.replace("[", "\\[").replace("]", "\\]")


def attr(s: str) -> str:
    return s.replace('"', "”")


def with_marks(s: str, marks: list[tuple[int, int, str]], out: dict[str, str]) -> str:
    """Wrap each marked name (start, end, term) in a sentinel pair that
    survives escaping; `render_marks` turns them into `:index[…]{term}`."""
    for start, end, term in sorted(marks, reverse=True):
        key = f"{len(out)}"
        out[key] = f':index[{s[start:end]}]{{term="{attr(term)}"}}'
        s = s[:start] + MARK_OPEN + key + MARK_CLOSE + s[end:]
    return s


def render_marks(s: str, table: dict[str, str]) -> str:
    return re.sub(f"{MARK_OPEN}(\\d+){MARK_CLOSE}", lambda m: table[m.group(1)], s)


def block(style: str, lines: list[str]) -> str:
    body = "\n\n".join(md_escape(l) for l in lines)
    return f':::paragraphs{{style="{style}"}}\n{body}\n:::\n'


# A poem's title and its author, which the transcription spaces apart with
# ideographic spaces on one line (ch. 38: 憶菊　　…　　蘅蕪君): a level-2
# heading in the `poem` style.
POEM_HEAD = re.compile("^([^\u3000\\s]{1,8})\u3000{2,}([^\u3000\\s]{2,8})$")


def chapter_body(lang: str, c: dict, marks: dict[int, list]) -> str:
    """The paragraphs of a 回: prose, verse (consecutive verse paragraphs as
    one block, their stanzas without a gap), the 曲 titles of chapter 5, a
    poem's title and author (a `poem` heading) and the closing formula."""
    table: dict[str, str] = {}
    out: list[str] = []
    verse: list[str] = []

    def flush() -> None:
        if verse:
            out.append(block("verse", verse))
            verse.clear()

    for i, p in enumerate(c["paragraphs"]):
        t = with_marks(p["text"], marks.get(i, []), table)
        if p["kind"] == "verse":
            verse.extend(l for l in t.split("\n") if l.strip())
            continue
        flush()
        head = POEM_HEAD.match(p["text"]) if p["kind"] == "prose" and i not in marks else None
        if p["kind"] == "song-title":
            out.append(block("song", [f"【{t}】"]))
        elif head:
            title, by = head.group(1), head.group(2)
            out.append(f'## {md_escape(title)}\u3000{md_escape(by)} {{style="poem" title="{attr(title)}" by="{attr(by)}"}}\n')
        else:
            out.append(md_escape(t) + "\n")
    flush()
    if c.get("closing_formula"):
        out.append(block("closing", [c["closing_formula"]]))
    return render_marks("\n".join(out), table)


# --- index marks: first appearances ------------------------------------------------------------------


def search_start(value) -> tuple[int, int]:
    """`from` / `en_from`: a chapter, or a (chapter, paragraph) pair."""
    return (value, 0) if isinstance(value, int) else (value[0], value[1])


def en_name_pattern(forms: list[str]) -> re.Pattern:
    """Joly's name forms, whole words, with a hyphen or a space between the
    syllables and either case of each syllable's first letter (Pao Ch’ai and
    Pao-ch’ai, goody Liu and Goody Liu); ’ and ' alike."""

    def syllable(s: str) -> str:
        head = f"[{s[0].upper()}{s[0].lower()}]" if s[0].isalpha() else re.escape(s[0])
        return head + re.escape(s[1:]).replace("’", "['’]")

    alternatives = ["[-\\s]".join(syllable(x) for x in re.split(r"[-\s]+", f)) for f in forms]
    return re.compile("(?<![\\w’'-])(" + "|".join(alternatives) + ")(?![\\w’'-])")


def first_appearances(data: dict) -> dict[str, dict[tuple[int, int], list]]:
    """For each edition, `{(chapter, paragraph): [(start, end, term)]}`: the
    first mention of any form of each character's name. The Simplified
    positions are the Traditional ones (the conversion keeps lengths; checked).
    The English mark must fall in the chapter of the Chinese one, save for
    the characters `EN_CHAPTER_DIFFERS` explains."""
    hant = data["editions"]["zh-Hant"]["chapters"]
    hans = data["editions"]["zh-Hans"]["chapters"]
    en = data["editions"]["en"]["chapters"]
    out: dict[str, dict] = {lang: {} for lang in LANGS}
    missing: list[str] = []
    elsewhere: list[str] = []
    for ch in ed.CHARACTERS:
        best = None
        start = search_start(ch["from"])
        for c in hant:
            if c["n"] < start[0]:
                continue
            for i, p in enumerate(c["paragraphs"]):
                if (c["n"], i) < start or (ch.get("prose") and p["kind"] != "prose"):
                    continue
                # The earliest form; at one place the longest (警幻仙子, not 警幻).
                hits = [(p["text"].find(f), -len(f), f) for f in ch["forms"] if f in p["text"]]
                if hits:
                    k, _, form = min(hits)
                    best = (c["n"], i, k, k + len(form))
                    break
            if best:
                break
        if not best:
            missing.append(f"zh {ch['hant']}")
            continue
        n, i, s, e = best
        out["zh-Hant"].setdefault((n, i), []).append((s, e, ch["hant"]))
        hp = hans[n - 1]["paragraphs"][i]["text"]
        if len(hp) != len(hant[n - 1]["paragraphs"][i]["text"]):
            raise SystemExit(f"index: zh-Hans paragraph {n}/{i} differs in length from zh-Hant")
        out["zh-Hans"].setdefault((n, i), []).append((s, e, ch["hans"]))
        if not ch["en"]:
            continue
        pattern = en_name_pattern(ch["en_forms"])
        # By default Joly's text is searched from the Chinese start chapter:
        # the same homographs occur in it (Pao Yü for the jade in chapter 1).
        en_start = search_start(ch.get("en_from", start[0]))
        found = None
        for c in en:
            for j, p in enumerate(c["paragraphs"]):
                if (c["n"], j) < en_start:
                    continue
                m = pattern.search(p["text"])
                if m:
                    found = (c["n"], j, m.start(), m.end())
                    break
            if found:
                break
        if not found:
            missing.append(f"en {ch['en']}")
            continue
        if found[0] != n and ch["hant"] not in ed.EN_CHAPTER_DIFFERS:
            elsewhere.append(f"{ch['hant']}: zh chapter {n}, en chapter {found[0]} ({ch['en']})")
        out["en"].setdefault(found[:2], []).append((found[2], found[3], ch["en"]))
    if missing:
        raise SystemExit("index: names not found:\n  " + "\n  ".join(missing))
    if elsewhere:
        raise SystemExit("index: English marks in another chapter than the Chinese ones:\n  " + "\n  ".join(elsewhere))
    # Two characters first named in one sentence must not overlap.
    for lang, by_para in out.items():
        for key, marks in by_para.items():
            spans = sorted(marks)
            for a, b in zip(spans, spans[1:]):
                if b[0] < a[1]:
                    raise SystemExit(f"index: overlapping marks in {lang} {key}: {a} {b}")
    return out


# --- chapter files ---------------------------------------------------------------------------------


def emit(out: str, lang: str, specs: list[dict], name: str, title: str, md: str) -> None:
    rel = f"chapters/{lang}/{name}.md"
    with open(os.path.join(out, rel), "w", encoding="utf-8") as f:
        f.write(md.rstrip() + "\n")
    specs.append({"title": title, "file": rel})


def front_matter(lang: str) -> str:
    """The head of an edition's first file: the book's metadata, then the
    front matter's lower-roman folios (the chapters switch to Arabic at 第一回
    / chapter I)."""
    meta = "".join(f"{k}: {json.dumps(v, ensure_ascii=False)}\n" for k, v in ed.BOOK[lang]["metadata"].items())
    return f"---\n{meta}---\n\n" + ':::numbering{format="lower-roman" startAt=1}\n\n'


def para_block(style: str, paragraphs: list[str]) -> str:
    return f':::paragraphs{{style="{style}"}}\n' + "\n\n".join(paragraphs) + "\n:::\n"


def write_zh(out: str, lang: str, data: dict, front: dict, pictures: dict, marks: dict) -> list[dict]:
    b = ed.BOOK[lang]
    specs: list[dict] = []
    chapters = data["editions"][lang]["chapters"]
    count = cn(len(ed.CHARACTERS))

    emit(out, lang, specs, "000a-cover", b["cover"], front_matter(lang) + f'# {b["title"]} {{style="cover"}}\n\n# {b["title"]} {{style="titlepage"}}\n\n:::pagebreak\n\n' + para_block("colophon", ed.COLOPHON[lang]))
    emit(out, lang, specs, "000b-edition", b["edition_title"], f'# {b["edition_title"]} {{style="front"}}\n\n' + "\n\n".join(ed.EDITION_NOTE[lang]) + "\n")
    for k, key in enumerate(("cheng", "gao", "yinyan")):
        e = next(x for x in front[lang] if x["key"] == key)
        title = b["prefaces"][key]
        md = f'# {title} {{style="preface"}}\n\n' + "\n\n".join(e["paragraphs"]) + "\n\n" + para_block("signature", e["signature"])
        emit(out, lang, specs, f"000{'cde'[k]}-{key}", title, md)
    gallery = [p for p in pictures["portraits"] if p["gallery"]]
    md = f'# {b["gallery_title"]} {{style="gallery"}}\n\n' + para_block("note", [ed.GALLERY_INTRO[lang]]) + "\n" + "\n".join(f'::resource{{id="{p["id"]}"}}\n' for p in gallery)
    emit(out, lang, specs, "000f-gallery", b["gallery_title"], md)
    emit(out, lang, specs, "000g-contents", b["contents"], f'# {b["contents"]} {{style="contents"}}\n\n:::toc\n')

    plates = {p["chapter"]: p for p in pictures["plates"]}
    for c in chapters:
        n = c["n"]
        head = ':::numbering{format="decimal" startAt=1}\n\n' if n == 1 else ""
        if n % 10 == 1:
            number, span = b["part"]
            head += f':::part{{number="{number.format(n=cn(n // 10 + 1))}" title="{span.format(a=cn(n), b=cn(n + 9))}"}}\n:::\n\n'
        first, second = c["title_couplet"][0], c["title_couplet"][1]
        heading = f'# {md_escape(first)} \\\\ {md_escape(second)} {{plate="{plates[n]["id"]}"}}\n'
        body = chapter_body(lang, c, {i: m for (cn_, i), m in marks.items() if cn_ == n})
        emit(out, lang, specs, f"{n:03d}-hui", f"第{cn(n)}回　{first}　{second}", head + heading + "\n" + body)

    md = f'# {b["index_title"]} {{style="back"}}\n\n' + para_block("note", [ed.INDEX_NOTE[lang].format(count=count)]) + "\n:::index\n"
    emit(out, lang, specs, "900-index", b["index_title"], md)
    emit(out, lang, specs, "901-credits", b["credits_title"], f'# {b["credits_title"]} {{style="credits"}}\n\n' + para_block("credits", ed.CREDITS[lang]))
    return specs


def write_en(out: str, data: dict, pictures: dict, marks: dict) -> list[dict]:
    lang = "en"
    b = ed.BOOK[lang]
    specs: list[dict] = []
    hant = {c["n"]: c for c in data["editions"]["zh-Hant"]["chapters"]}
    chapters = data["editions"]["en"]["chapters"]

    emit(out, lang, specs, "000a-title", b["cover"], front_matter(lang) + f'# {b["title"]} {{style="cover" toc="false"}}\n\n:::pagebreak\n\n' + para_block("colophon", ed.COLOPHON[lang]))
    emit(out, lang, specs, "000b-note", b["edition_title"], f'# {b["edition_title"]} {{style="front"}}\n\n' + "\n\n".join(ed.EDITION_NOTE[lang]) + "\n")
    preface = [md_escape(p) for p in data["editions"]["en"]["preface"]]
    sig = re.match(r"^H\. BENCRAFT JOLY, (H\.B\.M\. Vice-Consulate), (Macao), (.+?)\.?$", preface[-1])
    if not sig:
        raise SystemExit("en: the preface no longer ends with Joly's signature")
    signature = ["H. Bencraft Joly", f"{sig.group(1)}, {sig.group(2)}", sig.group(3)]
    emit(out, lang, specs, "000c-preface", b["preface_title"], f'# {b["preface_title"]} {{style="front"}}\n\n' + "\n\n".join(preface[:-1]) + "\n\n" + para_block("signature", signature))
    gallery = [p for p in pictures["portraits"] if p["gallery"]]
    md = f'# {b["gallery_title"]} {{style="gallery"}}\n\n' + para_block("note", [ed.GALLERY_INTRO[lang]]) + "\n" + "\n".join(f'::resource{{id="{p["id"]}"}}\n' for p in gallery)
    emit(out, lang, specs, "000d-portraits", b["gallery_title"], md)
    emit(out, lang, specs, "000e-contents", b["contents"], f'# {b["contents"]} {{style="contents"}}\n\n:::toc\n')

    plates = {p["chapter"]: p for p in pictures["plates"]}
    parts = {first: (number, title) for number, title, first, _ in b["parts"]}
    for c in chapters:
        n = c["n"]
        head = ':::numbering{format="decimal" startAt=1}\n\n' if n == 1 else ""
        if n in parts:
            number, title = parts[n]
            head += f':::part{{number="{number}" title="{title}"}}\n:::\n\n'
        first, second = c["title_couplet"]
        zh = "　".join(hant[n]["title_couplet"])
        heading = f'# {md_escape(first)} \\\\ {md_escape(second)} {{plate="{plates[n]["id"]}" zh="{attr(zh)}"}}\n'
        body = chapter_body(lang, c, {i: m for (cn_, i), m in marks.items() if cn_ == n})
        emit(out, lang, specs, f"{n:03d}-chapter", f"{roman(n)}. {first}", head + heading + "\n" + body)

    md = f'# {b["index_title"]} {{style="back"}}\n\n' + para_block("note", [ed.INDEX_NOTE[lang].format(count=sum(1 for ch in ed.CHARACTERS if ch["en"]))]) + "\n:::index\n"
    emit(out, lang, specs, "900-index", b["index_title"], md)
    emit(out, lang, specs, "901-credits", b["credits_title"], f'# {b["credits_title"]} {{style="credits"}}\n\n' + para_block("credits", ed.CREDITS[lang]))
    return specs


# --- resources ----------------------------------------------------------------------------------


def resources(out: str, pictures: dict) -> tuple[list[dict], dict[str, list[dict]]]:
    os.makedirs(os.path.join(out, "resources"), exist_ok=True)
    shared: list[dict] = []
    wording: dict[str, list[dict]] = {lang: [] for lang in LANGS}
    for kind in ("plates", "portraits"):
        for p in pictures[kind]:
            if kind == "portraits" and not p["gallery"]:
                continue
            rel = f"resources/{os.path.basename(p['file'])}"
            shutil.copyfile(os.path.join(WORK, p["file"]), os.path.join(out, rel))
            caption = p["caption"]
            if not caption.get("zh-Hant") or not caption.get("zh-Hans"):
                raise SystemExit(f"resource {p['id']}: no Chinese caption")
            alt = (lambda lang, cap: plate_alt(p["chapter"], lang, cap)) if kind == "plates" else (lambda lang, cap: cap)
            entry = {"id": p["id"], "typeId": "plate" if kind == "plates" else "portrait", "kind": "bitmap", "file": rel, "width": p["width"], "height": p["height"], "caption": caption["zh-Hant"], "altText": alt("zh-Hant", caption["zh-Hant"])}
            shared.append(entry)
            for lang in LANGS:
                cap = caption.get(lang)
                if lang == "en":
                    cap = ed.EN_PORTRAIT_NAMES.get(p["id"], cap)
                if not cap:
                    continue  # no English after chapter 56: the Chinese wording stands
                wording[lang].append({"id": p["id"], "caption": cap, "altText": alt(lang, cap)})
    return shared, wording


def plate_alt(chapter: int, lang: str, line: str) -> str:
    """The alt text of a chapter plate: the chapter and the line of its
    couplet the plate illustrates (written on the picture itself)."""
    if lang == "zh-Hant":
        return f"第{cn(chapter)}回回首插圖，畫「{line}」"
    if lang == "zh-Hans":
        return f"第{cn(chapter)}回回首插图，画“{line}”"
    return f"Plate of chapter {chapter}, lithographed in 1884: {line}"



# --- fonts ------------------------------------------------------------------------------------------

# Strings the engine prints in a Chinese book that no chapter file holds:
# index group heads and labels, continued captions.
ENGINE_STRINGS = {
    "zh-Hant": "一二三四五六七八九十畫符號數字見另見續接下頁",
    "zh-Hans": "一二三四五六七八九十画符号数字见另见续接下页",
    "en": "",
}


def edition_text(lang: str, out: str, config: dict) -> str:
    text = json.dumps(config, ensure_ascii=False) + ENGINE_STRINGS[lang]
    for dp, _, fs in os.walk(os.path.join(out, "chapters", lang)):
        for f in fs:
            text += open(os.path.join(dp, f), encoding="utf-8").read()
    return text


def is_cjk(ch: str) -> bool:
    return ord(ch) >= 0x2E80


def build_fonts(out: str, configs: dict[str, dict]) -> list[dict]:
    fonts_dir = os.path.join(out, "fonts")
    families: dict[str, list[dict]] = {}
    for lang in LANGS:
        # The English edition prints the 回目 couplets in LXGW WenKai TC,
        # which the zh-Hant text (holding every couplet) already covers.
        text = edition_text(lang, out, configs[lang])
        if lang == "zh-Hant":
            text += edition_text("en", out, configs["en"])
        for e in fontkit.build_faces(lang, text, fonts_dir):
            families.setdefault(e["family"], []).append({"weight": e["weight"], "style": e["style"], "file": f"fonts/{e['file']}"})
            # The English faces are Latin: the Chinese the English edition
            # prints is set in LXGW WenKai TC (built above from the same text).
            missing = "".join(ch for ch in e["missing"] if not (lang == "en" and is_cjk(ch)))
            if missing:
                raise SystemExit(f"font {e['file']} lacks {missing}")
            print(f"  {e['file']:30} {e['bytes'] / 1e6:5.2f} MB  {e['glyphs']} glyphs" + (f"  patched {''.join(e['patched'])}" if e["patched"] else ""))
    fontkit.copy_licences(fonts_dir, list(fontkit.LICENCES))
    return [{"name": n, "variants": v} for n, v in families.items()]


# --- manifest -------------------------------------------------------------------------------------


def localized_config(base: dict, config: dict) -> dict:
    """The top-level keys an edition changes (each replaces the base key
    wholesale when the edition is opened)."""
    return {k: v for k, v in config.items() if base.get(k) != v}


def write_manifest(out: str, chapters: dict, shared: list[dict], wording: dict, fonts: list[dict], configs: dict[str, dict]) -> dict:
    meta = {
        "id": PRESET_ID,
        "name": "紅樓夢 · Dream of the Red Chamber",
        "description": "Novela clásica china en 120 capítulos: el texto de 1792 en chino tradicional y simplificado, con las láminas de 1884, y la traducción inglesa de Joly de los 56 primeros capítulos · A classic Chinese novel in 120 chapters: the 1792 text in Traditional and Simplified Chinese with the 1884 plates, and Joly’s English translation of the first 56 chapters",
        "locale": "zh-Hant",
        "locales": list(LANGS),
        "thumbnail": "thumbnail.jpg",
        "license": "Public domain · CC BY-SA 4.0 (Wikisource text) · OFL fonts",
        "credits": "曹雪芹 · 程偉元 · 高鶚 · zh.wikisource · H. Bencraft Joly · Project Gutenberg · 同文書局 1884 · 改琦 · Wikimedia Commons",
        "tags": ["book", "chinese", "single-column", "plates", "front-matter", "index"],
        "openLocale": "zh-Hant",
    }
    base = configs["zh-Hant"]
    manifest = {
        "version": 2,
        # Written for today's rules (postext 1.5+): a manifest without it is
        # read as a postext 1.4 configuration (`migrateConfig`).
        "configVersion": CONFIG_VERSION,
        **meta,
        "chapters": chapters,
        "config": base,
        "localized": {lang: ({"config": localized_config(base, configs[lang])} if lang != "zh-Hant" else {}) | {"resources": wording[lang]} for lang in LANGS},
        "resources": shared,
        "fonts": fonts,
    }
    with open(os.path.join(out, "preset.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=1, ensure_ascii=False)
        f.write("\n")
    return meta


def write_credits_md(out: str, pictures: dict) -> None:
    plates = "\n".join(f"| `{p['id']}` | {p['chapter']} | [{p['credit']}]({p['source']}) | {p['licence']} |" for p in pictures["plates"])
    portraits = "\n".join(f"| `{p['id']}` | {p['caption']['zh-Hant']} | [Commons]({p['source']}) | {p['licence']} |" for p in pictures["portraits"] if p["gallery"])
    body = f"""# Credits — 紅樓夢 · Dream of the Red Chamber

Showcase preset for the Postext sandbox: *Hong lou meng* (紅樓夢), Cao Xueqin's
novel in the 1792 text edited by Cheng Weiyuan and Gao E, in three editions:
Traditional Chinese (`zh-Hant`), Simplified Chinese (`zh-Hans`) and the English
translation of H. Bencraft Joly (`en`, chapters 1–56). The editorial matter
written for the preset (edition notes, introductions, index, credits pages,
this file) is released under CC BY-SA 4.0.

## Text

- Chinese: 《紅樓夢（程乙本）》 on Chinese Wikisource,
  https://zh.wikisource.org/wiki/紅樓夢（程乙本） and its twelve volume pages
  (「第一回　至第十回」 … 「第一百十一回　至第一百二十回」). The 1792 text is in the
  public domain; the Wikisource transcription (typing, punctuation) is
  licensed CC BY-SA 4.0, and so is the text of this bundle. The prefaces
  (程偉元序, 高鶚敘, 引言) come from the same index page.
- Verse boundaries were taken from the main 《紅樓夢》 edition on Wikisource
  (https://zh.wikisource.org/wiki/紅樓夢); spellings were checked against
  《紅樓夢（程甲本）》 (https://zh.wikisource.org/wiki/紅樓夢（程甲本）), whose
  reading was taken in 200 places where the two transcriptions differ in one
  of the easily confused characters (系/係/繫, 干/乾/幹, 云/雲 …).
- Simplified: converted from the Traditional text with OpenCC (`tw2s`),
  「」 → “”, 『』 → ‘’.
- English: H. Bencraft Joly, *Hung Lou Meng, or, the Dream of the Red Chamber,
  a Chinese Novel*, Book I (1892) and Book II (1893), Project Gutenberg
  eBooks #9603 and #9604 (https://www.gutenberg.org/ebooks/9603,
  https://www.gutenberg.org/ebooks/9604). Public domain.

## Chapter plates

《增評補圖石頭記》, lithographed by 同文書局, Shanghai, 1884: the first of the
two pictures of each chapter, from the CADAL scans on Wikimedia Commons;
chapters 46 and 52 from the University of Tokyo copy of 《增評補圖大觀瑣錄》.
Public domain. Cropped and reduced to four grey levels.

| id | chapter | source | licence |
| --- | --- | --- | --- |
{plates}

## Portraits

Gai Qi (改琦), 《紅樓夢圖詠》, woodblock edition of 1879; Wikimedia Commons
category "Portraits of the Dream of the Red Chamber by Gai Qi".

| id | name | source | licence |
| --- | --- | --- | --- |
{portraits}

## Fonts

SIL Open Font License 1.1 unless stated (licence texts in `fonts/`):
Noto Serif TC/SC and Noto Sans TC/SC (Google, Adobe), LXGW WenKai TC and LXGW
WenKai (LXGW), EB Garamond (Georg Duffner, Octavio Pardo), with single
glyphs copied from Chiron Sung HK (OFL) and Jigmo (CC0 1.0, `Jigmo-CC0.txt`).
Each face is a static instance subset to the characters of its edition.

## Build

`scripts/presets/showcase/hongloumeng/` in the Postext repository: `fetch.py`
downloads the sources, `text.py` and `plates.py` prepare the text and the
pictures, `build.py` writes this bundle.
"""
    with open(os.path.join(out, "CREDITS.md"), "w", encoding="utf-8") as f:
        f.write(body)


def main() -> None:
    args = sys.argv[1:]
    out = args[args.index("--out") + 1] if "--out" in args else OUT
    data = json.load(open(os.path.join(SOURCE, "chapters.json"), encoding="utf-8"))
    front = json.load(open(os.path.join(SOURCE, "front.json"), encoding="utf-8"))
    pictures = json.load(open(os.path.join(WORK, "pictures.json"), encoding="utf-8"))
    if len(pictures["plates"]) != 120:
        raise SystemExit("run plates.py process first (work/pictures.json has no plates)")
    # --keep-fonts: a design-only rebuild reuses the fonts of the last build
    # (they are subset to the text, so any text change needs a full build).
    keep_fonts = "--keep-fonts" in args and os.path.exists(os.path.join(out, "preset.json"))
    old_fonts = json.load(open(os.path.join(out, "preset.json"), encoding="utf-8"))["fonts"] if keep_fonts else None
    for sub in ("chapters", "resources") + (() if keep_fonts else ("fonts",)):
        shutil.rmtree(os.path.join(out, sub), ignore_errors=True)
    for lang in LANGS:
        os.makedirs(os.path.join(out, "chapters", lang), exist_ok=True)
    configs = {"zh-Hant": zh_hant_placeholder_config(), "zh-Hans": zh_config("zh-Hans"), "en": en_config()}
    marks = first_appearances(data)
    chapters = {
        "zh-Hant": write_zh(out, "zh-Hant", data, front, pictures, marks["zh-Hant"]),
        "zh-Hans": write_zh(out, "zh-Hans", data, front, pictures, marks["zh-Hans"]),
        "en": write_en(out, data, pictures, marks["en"]),
    }
    shared, wording = resources(out, pictures)
    fonts = old_fonts if keep_fonts else build_fonts(out, configs)
    meta = write_manifest(out, chapters, shared, wording, fonts, configs)
    write_credits_md(out, pictures)
    _common.copy_thumbnail(HERE, out)
    _common.write_fingerprint(out)
    if out == OUT:
        # The shelf opens the zh-Hant edition, a right-bound book: its cover
        # carries the stitching on the right, and so does the shelf's spine.
        _common.register(PRESET_ID, {**meta, "binding": "right"})
    print(f"wrote {out} ({_common.bundle_size(out):.1f} MB)")


if __name__ == "__main__":
    main()
