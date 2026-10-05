#!/usr/bin/env python3
"""Build the `kokoro` showcase bundle into `apps/web/public/presets/kokoro/`
and register it in the public `index.json`.

    python3 fetch.py               # sources (once)
    python3 text.py                # work/draft/ja/*.md, work/text.json, work/charset.txt
    python3 plates.py process      # work/plates/*.jpg, work/pictures.json
    python3 build.py [--out DIR] [--keep-fonts] [--split-shimo N]
                                   # --out: a draft elsewhere, not registered;
                                   # --keep-fonts: design changes only, fonts of the last build

One edition, Japanese (`ja`): Natsume Sōseki's こころ (1914) after Aozora
Bunko, set as a Taishō literary book in the manner of the Iwanami first
edition, whose box, cover, endpapers, title page and colophon Sōseki
designed himself.

- 四六判 127 × 188 mm, vertical and bound on the right; 41 characters down
  each of 16 columns on the character grid, Shippori Mincho B1 at 9.5 pt on
  a 17 pt pitch (a gap of 0.79 em: room for the half-size readings, JLReq
  §2.4.2). Everything Japanese comes from `locale: 'ja'`: very strict
  kinsoku, JLReq yakumono spacing with burasagari, the ③ bracket at a
  paragraph start, sesame emphasis, JIS ruby.
- Running heads (柱) down the fore-edge in Shippori Antique B1, four
  characters below the head of the type area (JLReq §2.6.1 d): the book's
  title on versos, the part on rectos; the folio (ノンブル) in kanji at the
  foot of the same margin. Pages are numbered from the first part page
  (一); the front matter carries no folios.
- The 110 newspaper instalments (一 … 五十六) are 中見出し: run on, 3行取り
  and 5字下げ as Aozora records them (JLReq §4.1.3, §4.1.6).
- The three parts open on a recto (the left page) with the part's title
  centred across the page (大見出し, 左右中央), facing one of Sōseki's
  paintings on the verso: 山上有山図 (上), 萩の粥図 (中), 孤客入石門図 (下).
- Front matter: the cover (the 1914 題簽 on vermilion), the endpapers, the
  seal and the woodblock title page of 1914, the preface (序) and the
  contents. Back matter: the 1914 newspaper notice and advertisement, an
  edition note, the credit blocks Aozora asks every reuse to keep (in two
  tiers), the colophon (奥付) in the leaf frame of the 1917 printing, and
  the back cover.
- Eleven scene plates float to a page of their own after the passage they
  illustrate (`plates.json` anchors), captioned in a few words.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))
import _common  # noqa: E402
import fonts as fontkit  # noqa: E402
from _common import at, mm, pt  # noqa: E402

WORK = os.path.join(HERE, "work")
DRAFT = os.path.join(WORK, "draft", "ja")
PRESET_ID = "kokoro"
LANG = "ja"
OUT = os.path.join(_common.PRESETS_ROOT, PRESET_ID)
# `CONFIG_VERSION` in packages/postext/src/bundle/configVersion.ts.
CONFIG_VERSION = 8

MINCHO = "Shippori Mincho B1"
ANTIQUE = "Shippori Antique B1"

# --- palette ----------------------------------------------------------------------------

PALETTE = {
    # 墨, the ink: the palette's main colour, so the Sandbox's main-colour
    # control recolours the text, the headings and every accent left at it.
    "main-color": "#1d1916",
    "shu": "#b8472d",  # 朱: the box and cover of 1914
    "paper": "#f4ebd8",  # 生成り: every plate is toned to it
    "muted": "#6f655a",  # 鼠
}
PALETTE_NAMES = {"main-color": "墨", "shu": "朱", "paper": "紙", "muted": "鼠"}
col, PALETTE_CONFIG = _common.make_palette(PALETTE, PALETTE_NAMES)


def text(id_: str, content: str, **kw) -> dict:
    kw.setdefault("color", "main-color")
    return _common.text_el(id_, content, col=col, **kw)


def rule(id_: str, **kw) -> dict:
    return _common.rule_el(id_, col=col, **kw)


def box(id_: str, **kw) -> dict:
    return _common.box_el(id_, col=col, **kw)


def em(n: float) -> dict:
    return {"value": n, "unit": "em"}


# --- numerals -----------------------------------------------------------------------------

DIGITS = "〇一二三四五六七八九"


def kanji_positional(n: int) -> str:
    """二〇二六: digit by digit, as years are set in vertical text."""
    return "".join(DIGITS[int(d)] for d in str(n))


# --- geometry ------------------------------------------------------------------------------


def pt_to_mm(v: float) -> float:
    return v * 25.4 / 72


class VGeometry:
    """A vertical page on the character grid: `chars` characters of the body
    size down each column, `cols` columns across on a pitch of `pitch_pt`.
    The margins are the sheet's: `top` the head (天), `inner` the spine side
    (ノド); the foot (地) and the fore-edge (小口) take what the type area
    leaves."""

    def __init__(self, width: float, height: float, body_pt: float, pitch_pt: float, chars: int, cols: int, top: float, inner: float):
        self.width, self.height = width, height
        self.body_pt, self.pitch_pt = body_pt, pitch_pt
        self.chars, self.cols = chars, cols
        self.col_len = pt_to_mm(chars * body_pt)
        self.type_w = pt_to_mm(cols * pitch_pt)
        self.pitch = pt_to_mm(pitch_pt)
        self.em = pt_to_mm(body_pt)
        self.top, self.inner = top, inner
        self.bottom = height - top - self.col_len
        self.outer = width - inner - self.type_w

    def page(self) -> dict:
        # The grid takes the margins as minimums and centres the type area in
        # the room they leave: a hair under each keeps them as designed.
        m = lambda v: mm(v - 0.05)  # noqa: E731
        return {
            "sizePreset": "custom",
            "width": mm(self.width),
            "height": mm(self.height),
            "margins": {"top": m(self.top), "bottom": m(self.bottom), "left": m(self.inner), "right": m(self.outer), "mirror": True},
            # The paper every plate is toned to.
            "backgroundColor": col("paper"),
            "pageNumbering": {"format": "japanese-informal", "startAt": 1},
        }

    def grid(self) -> dict:
        return {"enabled": True, "charsPerLine": self.chars, "linesPerPage": self.cols}


# 四六判: 41 characters × 16 columns of 9.5 pt on a 17 pt pitch: a type area
# of 137.4 × 96 mm, the head a little deeper than the foot.
G = VGeometry(127, 188, 9.5, 17, 41, 16, top=26.5, inner=17)
FORE_PT = 7.5  # running heads and folios: about 80 % of the body (JLReq §2.6)
SECTION_PT = 12.0  # 中見出し: the middle size of JIS Z 8305's series for a 9.5 pt text


# --- design helpers (flow frame of a vertical page) ------------------------------------------
#
# The design slots of a vertical page are laid out in the page's flow frame:
# x runs down the page from its head, y across it leftward from its right
# edge; a `size.width` is a length down the page, `size.height` one across.
# A text element there is set vertically. Headers and footers are on the
# sheet.


def ftext(id_: str, content: str, *, x: float, y: float, length: float, across: float, size_pt: float, family: str = MINCHO, anchor: dict | None = None, **kw) -> dict:
    kw.setdefault("overflow", "clip")
    el = text(id_, content, anchor=anchor or at("page", "top-left"), offset=(x, y), width=length, size_pt=size_pt, family=family, **kw)
    el["placement"]["size"]["height"] = mm(across)
    return el


def fimage(id_: str, resource: str, *, x: float, y: float, down: float, anchor: dict | None = None, **kw) -> dict:
    """A picture `down` mm tall on the sheet, its top `x` mm below the
    page's head and its right edge `y` mm from the page's right edge."""
    el = {"kind": "image", "id": id_, "resourceId": resource, "placement": {"anchor": anchor or at("page", "top-left"), "offset": {"x": mm(x), "y": mm(y)}, "size": {"width": mm(down), "height": "auto"}}}
    el.update(kw)
    return el


def frame(id_: str, *, x: float, y: float, length: float, across: float, color: str = "main-color", thickness: float = 0.5, anchor: dict | None = None) -> dict:
    return {
        "kind": "box",
        "id": id_,
        "placement": {"anchor": anchor or at("page", "top-left"), "offset": {"x": mm(x), "y": mm(y)}, "size": {"width": mm(length), "height": mm(across)}},
        "style": {"borderColor": col(color), "borderWidth": pt(thickness), "borderRadius": mm(0)},
    }


def sheet_to_flow(left: float, width: float) -> float:
    """The flow frame's y of an element whose left edge is `left` mm from
    the sheet's left and which is `width` mm wide."""
    return G.width - left - width


# --- pictures ---------------------------------------------------------------------------------


def load_pictures() -> dict[str, dict]:
    pics = json.load(open(os.path.join(WORK, "pictures.json"), encoding="utf-8"))["pictures"]
    return {p["id"]: p for p in pics}


PICTURES: dict[str, dict] = {}


def aspect(pid: str) -> float:
    """Width over height of a picture as shipped."""
    p = PICTURES[pid]
    return p["width"] / p["height"]


# The part frontispieces: Sōseki's paintings, one per part.
FRONTIS = {"上": "soseki-sanjo-yusan", "中": "soseki-hagi-no-kayu", "下": "soseki-kokaku-sekimon"}
PART_KEYS = {"上": "kami", "中": "naka", "下": "shimo"}
ENDPAPER = "endpaper"  # the 1917 roundels, cut to the page's shape by build.py
COVER_LABEL = "kokoro-1914-cover-label"
TITLE_BLOCK = "kokoro-1914-title"
SEAL = "kokoro-1914-seal"
COLOPHON_FRAME = "kokoro-1917-colophon-frame"
# The panel the 1917 colophon frame leaves clear (fractions of the picture:
# left, top, right, bottom), measured on work/plates/kokoro-1917-colophon-frame.jpg.
COLOPHON_PANEL = (0.21, 0.152, 0.814, 0.786)


# --- running heads and folios -------------------------------------------------------------------


def fore_edge() -> dict:
    """柱 down the fore-edge (JLReq §2.6.1 d): the part on rectos (the left
    pages of a right-bound book), the book's title on versos, set
    vertically four body characters below the head of the type area,
    `gap` mm from it; the folio in kanji at the foot of the same margin,
    ending level with the type area. Openers, part pages and the design
    pages carry no running head, blank pages no folio either (JLReq
    §2.6.3). A page a scene plate fills keeps both: the engine has no page
    role for it."""
    gap = 4.5
    fore = pt_to_mm(FORE_PT)
    els = []
    for parity, content in (("odd", "{partNumber}　{partTitle}"), ("even", "こころ")):
        # The fore-edge is left of a recto, right of a verso.
        edge, dx = ("top-right", -gap) if parity == "odd" else ("top-left", gap)
        foot = "bottom-right" if parity == "odd" else "bottom-left"
        head = text(f"head-{parity}", content, anchor=at("outer", edge), offset=(dx, 0), width="auto", size_pt=FORE_PT, family=ANTIQUE, parity=parity, pages="body", overflow="ellipsis-end", writingMode="vertical-rl", letterSpacing=pt(1.2), color="muted")
        head["placement"]["offset"]["y"] = em(4)
        head["placement"]["size"]["height"] = mm(G.col_len - 12 * fore)
        els.append(head)
        for pages in ("body", "opener"):
            folio = text(f"folio-{parity}-{pages}", "{pageNumber}", anchor=at("outer", foot), offset=(dx, 0), width="auto", size_pt=FORE_PT, family=ANTIQUE, align="right", parity=parity, pages=pages, overflow="clip", writingMode="vertical-rl")
            folio["placement"]["size"]["height"] = mm(5 * fore)
            els.append(folio)
    return {"elements": els}


EMPTY = {"elements": []}


# --- openers ------------------------------------------------------------------------------------


def part_design() -> dict:
    """大見出し on its own recto (中扉): the part's number and title down one
    column centred across the page (左右中央), the number in vermilion
    bold, the title three characters below it, a short vermilion rule
    under both; Sōseki's painting faces it on the verso."""
    num_pt, title_pt = 26, 17
    across = pt_to_mm(num_pt) * 1.6
    y = (G.width - across) / 2
    x0 = G.top + 3 * G.em
    title_x = x0 + pt_to_mm(num_pt) + 3 * G.em
    title_len = 4 * pt_to_mm(title_pt) + 3 * pt_to_mm(9)
    return {
        "elements": [
            ftext("part-number", "{number}", x=x0, y=y, length=pt_to_mm(num_pt) * 1.4, across=across, size_pt=num_pt, weight=700, color="shu", align="left"),
            ftext("part-title", "{titleText}", x=title_x, y=y, length=G.col_len, across=across, size_pt=title_pt, weight=700, align="left", letterSpacing=pt(9)),
            rule("part-rule", anchor=at("page", "top-left"), offset=(title_x + title_len + 7, G.width / 2), width=12, color="shu", thickness=0.8),
        ]
    }


def front_opener() -> dict:
    """The title of a front- or back-matter section (序, 目次, 本書について…):
    one column at the right of the type area, lowered three characters and
    spaced, then a blank column."""
    p, L, e = G.pitch, G.col_len, G.em
    return {
        "enabled": True,
        "minHeight": mm(3 * p),
        "slot": {
            "elements": [
                ftext("front-title", "{titleText}", anchor=at("container", "top-left"), x=3 * e, y=0, length=L - 3 * e, across=2 * p, size_pt=14, weight=700, align="left", letterSpacing=pt(7)),
            ]
        },
    }


def frontis_design(pid: str) -> dict:
    """Sōseki's painting alone on the verso facing a part page, as large as
    the type area allows, its title small at its lower left."""
    max_h, max_w = G.col_len + 8, G.type_w + 6
    a = aspect(pid)
    h = min(max_h, max_w / a)
    w = h * a
    left = (G.width - w) / 2
    top = G.top - 4 + (max_h - h) / 2
    cap = PICTURES[pid]["caption"]
    cap_pt = 8
    cap_len = len(cap) * pt_to_mm(cap_pt) + 2
    return {
        "enabled": True,
        "minHeight": mm(G.type_w),
        "slot": {
            "elements": [
                fimage("frontis", pid, x=top, y=sheet_to_flow(left, w), down=h),
                ftext("frontis-caption", cap, x=top + h - cap_len, y=sheet_to_flow(left, w) + w + 2.5, length=cap_len, across=pt_to_mm(cap_pt) * 1.5, size_pt=cap_pt, align="left", color="muted"),
            ]
        },
    }


COVER_ART = "cover-art"


def cover_art_specs(rdir: str) -> list[dict]:
    """The cover's painting (covers.py), copied from art/ into the bundle's
    resources."""
    from PIL import Image

    src = os.path.join(HERE, "art", "cover.jpg")
    shutil.copyfile(src, os.path.join(rdir, f"{COVER_ART}.jpg"))
    w, h = Image.open(src).size
    return [{"id": COVER_ART, "typeId": "design", "kind": "bitmap", "file": f"resources/{COVER_ART}.jpg", "width": w, "height": h, "caption": "表紙", "altText": "表紙の絵。晩夏の鎌倉の浜。右手の砂丘に傾く松、霞む海と岬、波打ち際に着物の人がひとり立って沖を見ている。"}]


def cover_design() -> dict:
    """The cover: a painting of the beach at Kamakura where the story opens
    (covers.py), full bleed, and in its empty sky a vermilion title slip,
    the 朱 of the 1914 boards, with こころ and 夏目漱石 down it in the
    paper's colour inside a hairline frame."""
    sw, sl, top, left = 19.0, 86.0, 15.0, 13.0  # the slip: across, down, from the head, from the sheet's left
    y = sheet_to_flow(left, sw)
    title_pt, author_pt = 30, 12
    t_space, a_space = 10, 4
    t_len = 3 * pt_to_mm(title_pt) + 2 * pt_to_mm(t_space) + 1
    a_len = 4 * pt_to_mm(author_pt) + 3 * pt_to_mm(a_space) + 1
    t_across, a_across = pt_to_mm(title_pt) * 1.4, pt_to_mm(author_pt) * 1.5
    return {"enabled": True, "minHeight": mm(G.width), "slot": {"elements": [
        fimage("art", COVER_ART, x=0, y=0, down=G.height, anchor=at("bleed", "top-left")),
        box("slip", anchor=at("page", "top-left"), offset=(top, y), width=sl, height=sw, fill="shu"),
        frame("slip-frame", x=top + 1.3, y=y + 1.3, length=sl - 2.6, across=sw - 2.6, color="paper", thickness=0.5),
        ftext("cover-title", "こころ", x=top + 9, y=y + (sw - t_across) / 2, length=t_len, across=t_across, size_pt=title_pt, weight=700, color="paper", letterSpacing=pt(t_space)),
        ftext("cover-author", "夏目漱石", x=top + sl - 7 - a_len, y=y + (sw - a_across) / 2, length=a_len, across=a_across, size_pt=author_pt, weight=700, color="paper", letterSpacing=pt(a_space)),
    ]}}


def back_cover_design() -> dict:
    """The back board: vermilion, the 1914 seal small near the foot."""
    sw = 20.0
    sh = sw / aspect(SEAL)
    left, top = (G.width - sw) / 2, G.height - 40 - sh
    pad = 2.0
    return {
        "enabled": True,
        "minHeight": mm(G.width),
        "slot": {
            "elements": [
                box("cloth", anchor=at("bleed", "top-left"), fill="shu"),
                box("seal-ground", anchor=at("page", "top-left"), offset=(top - pad, sheet_to_flow(left - pad, sw + 2 * pad)), width=sh + 2 * pad, height=sw + 2 * pad, fill="paper"),
                fimage("seal", SEAL, x=top, y=sheet_to_flow(left, sw), down=sh, decorative=True),
            ]
        },
    }


def endpaper_design() -> dict:
    """見返し: the 1917 roundels over the whole page."""
    return {"enabled": True, "minHeight": mm(G.width), "slot": {"elements": [fimage("endpaper", ENDPAPER, x=0, y=0, down=G.height, anchor=at("bleed", "top-left"), decorative=True)]}}


def seal_design() -> dict:
    """The seal Sōseki set facing his title page: “ars longa, vita brevis”."""
    sw = 30.0
    sh = sw / aspect(SEAL)
    left, top = (G.width - sw) / 2, 52.0
    return {"enabled": True, "minHeight": mm(G.width), "slot": {"elements": [fimage("seal", SEAL, x=top, y=sheet_to_flow(left, sw), down=sh)]}}


def title_page_design() -> dict:
    """扉: the 1914 woodblock (the reclining man and the seal-script 心, cut
    by 伊上凡骨 to Sōseki's drawing), the title on the column to its right,
    read first, the author's name on the column to its left."""
    h = 112.0
    w = h * aspect(TITLE_BLOCK)
    left = (G.width - w) / 2 - 3
    top = 40.0
    title_pt, author_pt = 22, 11
    t_across = pt_to_mm(title_pt) * 1.5
    a_across = pt_to_mm(author_pt) * 1.5
    t_left = left + w + 4
    a_left = left - 4 - a_across
    return {
        "enabled": True,
        "minHeight": mm(G.width),
        "slot": {
            "elements": [
                fimage("woodblock", TITLE_BLOCK, x=top, y=sheet_to_flow(left, w), down=h),
                ftext("tp-title", "こころ", x=top, y=sheet_to_flow(t_left, t_across), length=3 * pt_to_mm(title_pt) + 2 * pt_to_mm(10) + 1, across=t_across, size_pt=title_pt, weight=700, letterSpacing=pt(10)),
                ftext("tp-author", "夏目漱石", x=top + h - 4 * pt_to_mm(author_pt) - 3 * pt_to_mm(3) - 1, y=sheet_to_flow(a_left, a_across), length=4 * pt_to_mm(author_pt) + 3 * pt_to_mm(3) + 1, across=a_across, size_pt=author_pt, weight=700, letterSpacing=pt(3)),
                ftext("tp-imprint", "Postext", x=top + h + 14, y=(G.width - 4) / 2, length=20, across=4, size_pt=7.5, family=ANTIQUE, color="muted", align="center"),
            ]
        },
    }


COLOPHON_PT = 7.5
COLOPHON_PITCH = 1.75  # times the size
COLOPHON_TITLE_PT = 13


def colophon_design(imprint: list[str], credits: list[str]) -> dict:
    """奥付 in the leaf frame Sōseki drew for the 1914 colophon (the 1917
    printing's block, its panel cleared): the title, this edition's imprint
    and its credits set vertically inside the panel, the three groups
    centred across it and lowered a little from its head, as the 1914
    imprint sits in its panel."""
    h = 174.0
    w = h * aspect(COLOPHON_FRAME)
    left, top = (G.width - w) / 2, (G.height - h) / 2
    pl, pt_, pr, pb = COLOPHON_PANEL
    px, py = left + pl * w, top + pt_ * h
    pw, ph = (pr - pl) * w, (pb - pt_) * h
    pitch = pt_to_mm(COLOPHON_PT) * COLOPHON_PITCH
    title_w = pt_to_mm(COLOPHON_TITLE_PT) * 1.4
    gap = 3.0
    group = title_w + gap + len(imprint) * pitch + gap + len(credits) * pitch
    y0 = sheet_to_flow(px, pw) + (pw - group) / 2
    x0 = py + 16
    length = ph - 16
    small = dict(length=length, size_pt=COLOPHON_PT, align="left", line_height=COLOPHON_PITCH, overflow="wrap")
    return {
        "enabled": True,
        "minHeight": mm(G.width),
        "slot": {
            "elements": [
                fimage("colophon-frame", COLOPHON_FRAME, x=top, y=sheet_to_flow(left, w), down=h, decorative=True),
                ftext("colophon-title", "こころ", x=x0, y=y0, length=length, across=title_w, size_pt=COLOPHON_TITLE_PT, weight=700, align="left", letterSpacing=pt(6)),
                ftext("colophon-imprint", "\n".join(imprint), x=x0 + 6, y=y0 + title_w + gap, across=len(imprint) * pitch, **small),
                ftext("colophon-credits", "\n".join(credits), x=x0 + 6, y=y0 + title_w + gap + len(imprint) * pitch + gap, across=len(credits) * pitch, color="muted", **small),
            ]
        },
    }


# --- config ---------------------------------------------------------------------------------------


def heading_styles() -> list[dict]:
    front = {
        "numbered": False,
        "span": "page",
        "breakBefore": {"enabled": True, "parity": "odd"},
        "advancedDesign": front_opener(),
        "header": EMPTY,
        "footer": EMPTY,
        "marginBottom": pt(0),
    }
    design_page = lambda parity: {"numbered": False, "toc": False, "span": "page", "runningChapter": False, "breakBefore": {"enabled": True, "parity": parity}, "header": EMPTY, "footer": EMPTY, "marginBottom": pt(0)}  # noqa: E731
    styles = [
        {"id": "cover", "name": "表紙", **design_page("odd"), "advancedDesign": cover_design()},
        {"id": "endpaper", "name": "見返し", **design_page("any"), "advancedDesign": endpaper_design()},
        {"id": "seal", "name": "扉裏の印", **design_page("even"), "advancedDesign": seal_design()},
        {"id": "titlepage", "name": "扉", **design_page("odd"), "advancedDesign": title_page_design()},
        {"id": "preface", "name": "序", **front, "toc": False},
        {"id": "contents", "name": "目次", **front, "toc": False},
        # Back matter runs on from page to page, whatever its side.
        {"id": "back", "name": "後付", **front, "breakBefore": {"enabled": True, "parity": "any"}},
        {"id": "credits", "name": "底本と図版", **front, "breakBefore": {"enabled": True, "parity": "any"}, "layout": {"layoutType": "double", "gutterWidth": mm(2 * G.em)}},
        {"id": "colophon", "name": "奥付", **design_page("odd")},
        {"id": "back-cover", "name": "裏表紙", **design_page("even"), "advancedDesign": back_cover_design()},
    ]
    for number, pid in FRONTIS.items():
        styles.append({"id": f"frontis-{PART_KEYS[number]}", "name": f"口絵（{number}）", **design_page("even"), "advancedDesign": frontis_design(pid)})
    return styles


def paragraph_styles(aozora_styles: list[dict]) -> list[dict]:
    lead = pt(G.pitch_pt)
    return [
        *aozora_styles,
        # The 1914 notice and advertisement: the text two characters down,
        # its source at the foot of the last column.
        {"id": "notice", "name": "予告・広告文", "fontFamily": MINCHO, "fontSize": pt(G.body_pt), "lineHeight": lead, "indent": em(2), "firstLineIndent": em(1), "spaceBetween": pt(0)},
        {"id": "source", "name": "出典", "fontFamily": MINCHO, "fontSize": pt(8), "lineHeight": lead, "textAlign": "end", "firstLineIndent": em(0), "color": col("muted"), "marginBottom": lead},
        # The credit blocks Aozora asks to keep, line for line, small.
        {"id": "credits", "name": "底本", "fontFamily": MINCHO, "fontSize": pt(8), "lineHeight": pt(13), "textAlign": "left", "indent": em(1), "hangingIndent": em(3), "firstLineIndent": em(0), "spaceBetween": pt(0), "marginBottom": pt(13)},
    ]


def resource_types() -> list[dict]:
    return [
        # The scene plates: a page of their own after their passage,
        # captioned with a few words and no number.
        {"id": "scene", "name": "挿絵", "namePlural": "挿絵", "shortLabel": "挿絵", "captionPrefix": "", "numberingTemplate": "", "resetOn": "never", "counterFormat": "decimal", "defaultPlacement": {"position": "auto", "span": "page", "width": 1, "align": "center"}},
        # Sōseki's paintings facing the part pages, drawn by the designs.
        {"id": "plate", "name": "口絵", "namePlural": "口絵", "shortLabel": "口絵", "captionPrefix": "", "numberingTemplate": "", "resetOn": "never", "counterFormat": "decimal"},
        # His designs for the 1914 book: cover label, endpapers, title page,
        # seal, colophon frame.
        {"id": "design", "name": "装幀", "namePlural": "装幀", "shortLabel": "装幀", "captionPrefix": "", "numberingTemplate": "", "resetOn": "never", "counterFormat": "decimal"},
        {"id": "figure", "name": "図", "namePlural": "図", "shortLabel": "図", "captionPrefix": "図", "numberingTemplate": "{n}", "resetOn": "never", "counterFormat": "japanese-informal"},
    ]


def toc_config() -> dict:
    """目次 as in 1914: the three parts with their pages, and the back
    matter; the instalments are not listed. Page numbers in kanji at the
    foot of each column, a dotted leader down to them."""
    lead = pt(G.pitch_pt * 2)
    return {
        "levels": [
            {
                "level": 1,
                "fontFamily": MINCHO,
                "fontSize": pt(10.5),
                "lineHeight": lead,
                "color": col("main-color"),
                "indent": em(4),
                "numberWidth": em(0),
                "numberGap": em(0),
            }
        ],
        "unnumbered": {"fontFamily": MINCHO, "color": col("main-color")},
        "pageNumber": {"fontFamily": MINCHO, "fontSize": pt(10.5), "color": col("main-color"), "width": em(3.5)},
        "leader": {"enabled": True, "char": "…", "gap": em(1)},
        "parts": {
            "enabled": True,
            "height": pt(G.pitch_pt * 2),
            "marginTop": pt(0),
            "design": {
                "elements": [
                    ftext("toc-part", "{number}　{titleText}", anchor=at("container", "top-left"), x=2 * G.em, y=0, length=G.col_len * 0.6, across=2 * G.pitch, size_pt=10.5, weight=700, letterSpacing=pt(2)),
                    ftext("toc-part-page", "{pageNumber}", anchor=at("container", "top-left"), x=G.col_len - 4 * G.em, y=0, length=4 * G.em, across=2 * G.pitch, size_pt=10.5, align="right"),
                    ftext("toc-part-leader", "…" * 30, anchor=at("container", "top-left"), x=2 * G.em + 6 * pt_to_mm(10.5) + 4, y=0, length=G.col_len - 12 * G.em - 6 * pt_to_mm(10.5) - 2, across=2 * G.pitch, size_pt=10.5, align="right"),
                ]
            },
        },
    }


def folio_config() -> dict:
    """How Folio shows the book: a Taishō hardcover on warm wove paper, its
    first page the cover, turned as the board."""
    return {
        "paper": {"type": "uncoated", "grammage": 70, "bulk": 1.3, "texture": "wove", "shade": {"hex": PALETTE["paper"], "model": "hex"}},
        "binding": {"type": "hardcover", "cover": "pages", "spineImage": SPINE},
        "surface": {"type": "walnut"},
        "lighting": {"environment": "daylight"},
    }


def config(aozora_styles: list[dict]) -> dict:
    lead = pt(G.pitch_pt)
    return {
        "locale": LANG,
        "page": G.page(),
        "layout": {"layoutType": "single", "writingMode": "vertical-rl"},
        # The grid; every other Japanese rule is the locale's default.
        "cjk": {"grid": G.grid()},
        "bodyText": {
            "fontFamily": MINCHO,
            "fontSize": pt(G.body_pt),
            "lineHeight": lead,
            "textAlign": "justify",
            "firstLineIndent": em(1),
            "indentAfterHeading": True,
            "paragraphSpacing": False,
            "color": col("main-color"),
            "boldColor": col("main-color"),
            "italicColor": col("main-color"),
        },
        "headings": {
            "fontFamily": MINCHO,
            "color": col("main-color"),
            "keepWithNext": True,
            # A 中見出し may close the last column of an even page: its text
            # opens the facing odd page (JLReq §4.1.7 b).
            "keepWithNextSpread": True,
            "levels": [
                {"level": 1, "numberingTemplate": "", "fontSize": pt(14), "lineHeight": lead, "fontWeight": 700, "span": "page", "breakBefore": {"enabled": True, "parity": "odd"}, "marginBottom": pt(0), "advancedDesign": front_opener()},
                # 中見出し: the instalment's numeral, 3行取り, 5字下げ.
                {"level": 2, "numberingTemplate": "", "fontSize": pt(SECTION_PT), "lineHeight": lead, "fontWeight": 700, "lineSpan": 3, "indent": em(5), "marginTop": pt(0), "marginBottom": pt(0), "letterSpacing": pt(2)},
            ],
        },
        "headingStyles": heading_styles(),
        "paragraphStyles": paragraph_styles(aozora_styles),
        "parts": {
            "page": True,
            "breakBefore": {"parity": "odd"},
            "breakAfter": {"enabled": True, "parity": "any"},
            "design": part_design(),
        },
        "toc": toc_config(),
        "header": fore_edge(),
        "footer": EMPTY,
        "captionStyle": {"fontFamily": MINCHO, "fontSize": pt(8), "color": col("muted"), "align": "center", "labelBold": False, "labelNumberGap": "", "labelSeparator": "　"},
        "colorPalette": PALETTE_CONFIG,
        "resourceTypes": resource_types(),
        "pdfGeneration": {"outlines": True},
        "folio": folio_config(),
    }


# --- chapters --------------------------------------------------------------------------------------


def emit(out: str, specs: list[dict], name: str, title: str, md: str) -> None:
    rel = f"chapters/{LANG}/{name}.md"
    with open(os.path.join(out, rel), "w", encoding="utf-8") as f:
        f.write(md.rstrip() + "\n")
    specs.append({"title": title, "file": rel})


def para_block(style: str, paragraphs: list[str]) -> str:
    return f':::paragraphs{{style="{style}"}}\n' + "\n\n".join(paragraphs) + "\n:::\n"


def draft(name: str) -> str:
    return open(os.path.join(DRAFT, name), encoding="utf-8").read()


SECTION = re.compile(r'^## .*\{.*id="([a-z]+-\d+)".*\}$', re.M)


def place_scenes(md: str, scenes: list[dict]) -> str:
    """Each scene's `::resource` before the paragraph of its section that
    holds its anchor phrase (the float then takes the first page after)."""
    for sc in scenes:
        heads = list(SECTION.finditer(md))
        idx = next((i for i, m in enumerate(heads) if m.group(1) == sc["section"]), None)
        if idx is None:
            continue
        start = heads[idx].end()
        end = heads[idx + 1].start() if idx + 1 < len(heads) else len(md)
        body = md[start:end]
        paras = body.split("\n\n")
        # Readings break the plain text: look for the anchor with them out.
        plain = [re.sub(r"\{([^|{}]+)\|[^{}]*\}", r"\1", p) for p in paras]
        k = next((i for i, p in enumerate(plain) if sc["anchor"] in p), None)
        if k is None:
            raise SystemExit(f"scene {sc['id']}: anchor not found in {sc['section']}")
        paras.insert(k, f'::resource{{id="{sc["id"]}"}}')
        md = md[:start] + "\n\n".join(paras) + md[end:]
    return md


def part_file(name: str, scenes: list[dict]) -> tuple[str, str]:
    """A part (or a piece of 下): the painting on the verso, the folios
    starting at 一 with the first part page, the part page, the text."""
    md = draft(name)
    m = re.match(r':::part\{number="(.)" title="([^"]+)"\}\n:::\n', md)
    head = ""
    if m:
        number = m.group(1)
        pid = FRONTIS[number]
        head = f'# {PICTURES[pid]["caption"].replace("夏目漱石", "").strip("「」")} {{style="frontis-{PART_KEYS[number]}"}}\n\n:::pagebreak\n\n'
        if number == "上":
            head += ':::numbering{format="japanese-informal" startAt=1}\n\n'
    return head + place_scenes(md, scenes), (m.group(1) if m else "")


def write_chapters(out: str, data: dict, scenes: list[dict]) -> list[dict]:
    specs: list[dict] = []
    os.makedirs(os.path.join(out, "chapters", LANG), exist_ok=True)

    front = '---\ntitle: "こころ"\nauthor: "夏目漱石"\n---\n\n'
    emit(out, specs, "000a-cover", "表紙", front + (
        '# 表紙 {style="cover"}\n\n'
        '# 見返し {style="endpaper"}\n\n'
        '# 見返し {style="endpaper"}\n\n'
        '# 扉裏の印 {style="seal"}\n\n'
        '# 扉 {style="titlepage"}\n'
    ))
    jijo = draft("00-jijo.md").replace('# 序 {id="jijo"}', '# 序 {style="preface" id="jijo"}')
    emit(out, specs, "000b-jijo", "序", jijo)
    emit(out, specs, "000c-contents", "目次", '# 目次 {style="contents"}\n\n:::toc\n')

    for f in data["files"]:
        if f["part"] is None:
            continue
        name = f["file"]
        mine = [s for s in scenes if s["section"] in f["sections"]]
        md, number = part_file(name, mine)
        title = next(f"{p['number']}　{p['title']}" for p in data["parts"] if p["number"] == f["part"])
        if not number:
            first = f["sections"][0]
            title += f"（{next(s['title'] for p in data['parts'] for s in p['sections'] if s['id'] == first)}から）"
        emit(out, specs, name.removesuffix(".md"), title, md)

    emit(out, specs, "900-yokoku", "予告と広告文", notices_markdown())
    emit(out, specs, "901-edition", "本書について", edition_markdown(data))
    emit(out, specs, "902-credits", "底本と図版", credits_markdown(data))
    emit(out, specs, "903-colophon", "奥付", '# 奥付 {style="colophon"}\n')
    emit(out, specs, "904-back-cover", "裏表紙", '# 裏表紙 {style="back-cover"}\n')
    return specs


def notices_markdown() -> str:
    """The notice Sōseki sent the Asahi before the serial (1914-04) and the
    advertisement for the book (1914-09), as printed with it in the
    collected works."""
    yokoku = draft("yokoku.md").strip()
    kokoku = draft("kokoku.md").strip()
    return (
        '# 予告と広告文 {style="back"}\n\n'
        + para_block("notice", [yokoku])
        + "\n"
        + para_block("source", ["「東京朝日新聞」大正三年四月十六日"])
        + "\n"
        + para_block("notice", [kokoku])
        + "\n"
        + para_block("source", ["「時事新報」大正三年九月二十六日"])
    )


def aozora_block(raw: str) -> list[str]:
    """An Aozora credit block, line for line, with the JIS wave dash; the
    continuation lines of a field keep their indent as the style's hang."""
    lines = []
    for line in raw.replace("～", "〜").split("\n"):
        line = line.strip("　 ")
        if not line:
            continue
        if lines and not re.match(r"^(底本|底本の親本|初出|入力|校正|※|（例）|青空文庫作成ファイル|このファイル|\d{4}年)", line):
            lines[-1] += "　" + line
        else:
            lines.append(line)
    return [md_escape(l) for l in lines]


def md_escape(s: str) -> str:
    return s.replace("*", "\\*").replace("[", "\\[").replace("]", "\\]")


def edition_markdown(data: dict) -> str:
    """本書について: what this edition is made of and what it changed (text.py
    writes the note)."""
    return draft("edition-note.md").replace('# 本書について {id="edition-note"}', '# 本書について {style="back" id="edition-note"}').rstrip() + "\n"


def credits_markdown(data: dict) -> str:
    """底本と図版: the credit blocks of the four Aozora files, line for line
    (Aozora asks every reuse to keep them), the sources of the pictures and
    the fonts; small, in two tiers."""
    cr = data["credits"]
    parts = ['# 底本と図版 {style="credits"}\n']
    for key, label in (("kokoro", "「こころ」"), ("jijo", "序"), ("yokoku", "予告"), ("kokoku", "広告文")):
        parts.append(para_block("credits", [f"〔{label}〕"] + aozora_block(cr[key]["raw"])))
    parts.append(para_block("credits", [
        "〔図版〕",
        "扉、扉裏の印は夏目漱石装幀『こゝろ』（岩波書店、大正三年）より。見返しと奥付の枠は同書大正六年刷より。国立国会図書館デジタルコレクション（info:ndljp/pid/945471、906330）、保護期間満了。",
        "口絵は夏目漱石画「山上有山図」「萩の粥図」「孤客入石門図」。『漱石遺墨集』（岩波書店、昭和十年）より。国立国会図書館デジタルコレクション（info:ndljp/pid/1192970）、保護期間満了。",
        "表紙と挿絵：Generated With Diffusion Models",
        "図版は本書の紙の色に合わせて調子を整え、扉の蔵書印を除き、奥付の枠は中の記載を消して用いた。",
    ]))
    parts.append(para_block("credits", [
        "〔書体〕",
        "しっぽり明朝 B1、しっぽりアンチック B1（SIL Open Font License 1.1）。本書に用いる文字に絞って収める。",
    ]))
    return "\n".join(p for p in parts if p)


# What the credits page (902-credits.md) changed when the painted cover
# replaced the 1914 label (patch_covers.py applies it to a built bundle).
CREDITS_CHANGES = [
    ("表紙の題簽、扉、扉裏の印は夏目漱石装幀", "扉、扉裏の印は夏目漱石装幀"),
    ("挿絵：Generated With Diffusion Models", "表紙と挿絵：Generated With Diffusion Models"),
]


def colophon_lines() -> tuple[list[str], list[str]]:
    """The imprint (author, the first edition, this one) and the credits."""
    imprint = [
        "著者　夏目漱石",
        "初版　大正三年九月二十日　岩波書店",
        f"本版　{kanji_positional(2026)}年十月　Postext",
    ]
    credits = [
        "本文　青空文庫（底本　集英社文庫、一九九一年）",
        "入力　j.utiyama　校正　伊藤時也",
        "序・予告・広告文　入力　砂場清隆　校正　小林繁雄",
        "扉・見返し・口絵　夏目漱石（国立国会図書館所蔵本より）",
        "表紙・挿絵　Generated With Diffusion Models",
        "書体　しっぽり明朝 B1・しっぽりアンチック B1",
    ]
    return imprint, credits


# --- resources ----------------------------------------------------------------------------------------


def resources(out: str, scenes: list[dict]) -> list[dict]:
    from PIL import Image

    rdir = os.path.join(out, "resources")
    os.makedirs(rdir, exist_ok=True)
    specs: list[dict] = []
    scene_ids = {s["id"] for s in scenes}
    used = set(FRONTIS.values()) | {TITLE_BLOCK, SEAL, COLOPHON_FRAME} | scene_ids
    for pid, p in PICTURES.items():
        if pid not in used:
            continue
        rel = f"resources/{pid}.jpg"
        shutil.copyfile(os.path.join(WORK, p["file"]), os.path.join(out, rel))
        type_id = "scene" if pid in scene_ids else "plate" if pid in FRONTIS.values() else "design"
        spec = {"id": pid, "typeId": type_id, "kind": "bitmap", "file": rel, "width": p["width"], "height": p["height"], "caption": p["caption"], "altText": p["alt"]["ja"]}
        specs.append(spec)
    # The endpaper cut to the page's proportions (a design image has no
    # crop of its own): the middle of the roundel pattern.
    im = Image.open(os.path.join(WORK, PICTURES["kokoro-1917-endpaper"]["file"])).convert("RGB")
    want_h = round(im.width * G.height / G.width)
    if want_h <= im.height:
        y0 = (im.height - want_h) // 2
        im = im.crop((0, y0, im.width, y0 + want_h))
    rel = f"resources/{ENDPAPER}.jpg"
    im.save(os.path.join(out, rel), quality=80, optimize=True, progressive=True)
    specs.append({"id": ENDPAPER, "typeId": "design", "kind": "bitmap", "file": rel, "width": im.width, "height": im.height, "caption": "見返し", "altText": PICTURES["kokoro-1917-endpaper"]["alt"]["ja"]})
    return specs + cover_art_specs(rdir)


# --- spine -------------------------------------------------------------------------------------------

SPINE = "spine"
SPINE_PAGES = 360


def add_spine(out: str, shared: list[dict]) -> None:
    """The spine: こころ and 夏目漱石 upright in the paper's colour on
    vermilion cloth."""
    fonts = os.path.join(out, "fonts")
    paper = folio_config()["paper"]
    font = os.path.join(fonts, "ShipporiMinchoB1-Bold.woff2")
    per = {LANG: {
        "height_mm": G.height,
        "thickness_mm": _common.spine_thickness_mm(SPINE_PAGES, paper["grammage"], paper["bulk"], "hardcover"),
        "ground": PALETTE["shu"], "ink": PALETTE["paper"], "vertical": True,
        # Vermilion book cloth (covers.py), its weave cropped to the spine.
        "background": {"file": os.path.join(HERE, "art", "spine.jpg"), "fit": "cover", "shade": 0.35},
        "pieces": [
            {"text": "こころ", "font": font, "size": 0.42, "at": 0.24},
            {"text": "夏目漱石", "font": os.path.join(fonts, "ShipporiMinchoB1-Bold.woff2"), "size": 0.26, "at": 0.72},
        ],
    }}
    spec, _ = _common.build_spines(out, SPINE, "design", LANG, per)
    shared.append(spec)


# --- fonts -------------------------------------------------------------------------------------------

# Strings the engine prints in a Japanese book that no chapter holds:
# continued captions and tables, the folio digits.
ENGINE_STRINGS = "（続き）次ページへ続く〇一二三四五六七八九十百千"


def book_text(out: str, cfg: dict) -> str:
    s = json.dumps(cfg, ensure_ascii=False) + ENGINE_STRINGS
    for dp, _, fs in os.walk(os.path.join(out, "chapters")):
        for f in fs:
            s += open(os.path.join(dp, f), encoding="utf-8").read()
    return s


def build_fonts(out: str, cfg: dict) -> list[dict]:
    fonts_dir = os.path.join(out, "fonts")
    os.makedirs(fonts_dir, exist_ok=True)
    plates = fontkit.plate_text()
    body = book_text(out, cfg) + plates
    display = open(os.path.join(WORK, "display.txt"), encoding="utf-8").read() + json.dumps(cfg, ensure_ascii=False) + plates + ENGINE_STRINGS
    families: dict[str, list[dict]] = {}
    for e in fontkit.build_faces(body, display, fonts_dir):
        families.setdefault(e["family"], []).append({"weight": e["weight"], "style": e["style"], "file": f"fonts/{e['file']}"})
        missing = "".join(ch for ch in e["missing"] if ord(ch) >= 0x2E80 and e["weight"] == 400 and e["family"] == MINCHO)
        if missing:
            raise SystemExit(f"font {e['file']} lacks {missing}")
        print(f"  {e['file']:34} {e['bytes'] / 1e6:5.2f} MB  {e['glyphs']} glyphs" + (f"  patched {e['patched']}" if e["patched"] else ""))
    fontkit.copy_licences(fonts_dir)
    return [{"name": n, "variants": v} for n, v in families.items()]


# --- manifest ----------------------------------------------------------------------------------------

META = {
    "id": PRESET_ID,
    "name": "こころ · Kokoro",
    "description": "La novela de Natsume Sōseki (1914) en japonés, compuesta en vertical y encuadernada a la derecha como la primera edición de Iwanami, con la cubierta, las guardas y la portada que diseñó Sōseki, tres de sus pinturas y furigana sobre las palabras difíciles · Natsume Sōseki’s 1914 novel in Japanese, set vertically and bound on the right after the Iwanami first edition, with the cover, endpapers and title page Sōseki designed, three of his paintings and furigana over the harder words",
    "locale": LANG,
    "locales": [LANG],
    "openLocale": LANG,
    "thumbnail": "thumbnail.jpg",
    "license": "Public domain · OFL fonts",
    "credits": "夏目漱石 · 青空文庫 · 国立国会図書館 · 岩波書店 1914",
    "tags": ["book", "japanese", "vertical", "right-bound", "ruby", "plates", "parts", "front-matter"],
}


def write_manifest(out: str, chapters: list[dict], shared: list[dict], fonts: list[dict], cfg: dict) -> dict:
    manifest = {
        "version": 2,
        "configVersion": CONFIG_VERSION,
        **META,
        # One novel read through: the canvas opens on the whole book.
        "view": {"canvasScope": "book"},
        "chapters": {LANG: chapters},
        "config": cfg,
        "localized": {LANG: {}},
        "resources": shared,
        "fonts": fonts,
    }
    with open(os.path.join(out, "preset.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=1, ensure_ascii=False)
        f.write("\n")
    return dict(META)


def write_credits_md(out: str, data: dict) -> None:
    draft_md = open(os.path.join(HERE, "CREDITS.draft.md"), encoding="utf-8").read()
    # The draft's head says it is a draft; the bundle's file starts at its title.
    body = draft_md.split("\n## ", 1)[1]
    shipped = {r["id"] for r in json.load(open(os.path.join(out, "preset.json"), encoding="utf-8"))["resources"]}
    pictures = "\n".join(f"| `{p['id']}` | {p['caption'] or '—'} | {p.get('source') or '—'} | {p['credit']} |" for p in PICTURES.values() if p["id"] in shipped)
    text_ = (
        "# Credits — こころ · Kokoro\n\n"
        "Showcase preset for the Postext sandbox: Natsume Sōseki's *Kokoro* (1914) in Japanese,\n"
        "set vertically and bound on the right. The editorial matter written for the preset\n"
        "(the edition note, the colophon, this file) is dedicated to the public domain (CC0 1.0).\n\n"
        "## " + body.rstrip() + "\n\n"
        "## Picture list\n\n| id | caption | source | credit |\n| --- | --- | --- | --- |\n" + pictures + "\n\n"
        "## Build\n\n"
        "`scripts/presets/showcase/kokoro/` in the Postext repository: `fetch.py` downloads the\n"
        "sources, `text.py` converts the Aozora files with the postext-port skill's `aozora.py`,\n"
        "`plates.py` prepares the pictures, `build.py` writes this bundle.\n"
    )
    with open(os.path.join(out, "CREDITS.md"), "w", encoding="utf-8") as f:
        f.write(text_)


def main() -> None:
    args = sys.argv[1:]
    out = args[args.index("--out") + 1] if "--out" in args else OUT
    data = json.load(open(os.path.join(WORK, "text.json"), encoding="utf-8"))
    PICTURES.update(load_pictures())
    scenes = [p for p in PICTURES.values() if p["kind"] == "scene"]
    if len(scenes) != 11:
        raise SystemExit("run plates.py process first (work/pictures.json has no scenes)")
    keep_fonts = "--keep-fonts" in args and os.path.exists(os.path.join(out, "preset.json"))
    old_fonts = json.load(open(os.path.join(out, "preset.json"), encoding="utf-8"))["fonts"] if keep_fonts else None
    for sub in ("chapters", "resources") + (() if keep_fonts else ("fonts",)):
        shutil.rmtree(os.path.join(out, sub), ignore_errors=True)
    os.makedirs(out, exist_ok=True)
    cfg = config(data["paragraphStyles"])
    for s in cfg["headingStyles"]:
        if s["id"] == "colophon":
            s["advancedDesign"] = colophon_design(*colophon_lines())
    chapters = write_chapters(out, data, scenes)
    shared = resources(out, scenes)
    fonts = old_fonts if keep_fonts else build_fonts(out, cfg)
    add_spine(out, shared)
    meta = write_manifest(out, chapters, shared, fonts, cfg)
    write_credits_md(out, data)
    _common.copy_thumbnail(HERE, out)
    _common.write_fingerprint(out)
    if out == OUT:
        # A right-bound book: after ألف ليلة وليلة and 紅樓夢 on the shelf.
        _common.register(PRESET_ID, {**meta, "binding": "right", "shelfOrder": 3})
    print(f"wrote {out} ({_common.bundle_size(out):.1f} MB)")


if __name__ == "__main__":
    main()
