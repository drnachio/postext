#!/usr/bin/env python3
"""Static checks for a Postext project (preset.json + chapters + files).

    lint_project.py <project> [--lang es] [--strict]

Catches what the Postext parser and loader silently get wrong: CommonMark
habits that print literally (pipe tables, code fences, HTML,
`---` rules), blocks swallowed into the previous paragraph, line-start traps,
unknown style/resource ids, malformed `::resource`, unbalanced fences, config
keys that crash or silently reset (em units, H1 page breaks, `main-color`),
missing files and bitmap sizes; for Chinese, Japanese and Korean text, the
document language (kana make a text Japanese: locale 'ja', never 'zh-*'),
markup typed with an input method, Aozora Bunko notation left in the
chapters, Chinese settings or faces on a Japanese book, index entries without
a reading, and whether the bundled fonts have a glyph for every character the
chapters set (with fontTools installed; without it that check is skipped);
for Arabic text, the document language and direction, the fonts that set it
(and their glyphs and shaping tables), letter-spacing on its styles, forced
hyphenation and italic emphasis; for comics (`:::page`, `:::strip`), the
split expressions, panels, script lines, balloon and panel styles, the
`comics` config, speaker anchors and safe areas, the lettering faces, and
whether every edition sets the same pages. Pure Python otherwise.

Exit code 1 when there are errors (or warnings with --strict).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

KNOWN_CONTAINERS = {"callout", "paragraphs", "part", "columns", "paper"}
# The page numbering styles `:::numbering{format=…}` takes (packages/postext
# src/numbering.ts NumeralStyle): Latin, East Asian (Chinese, Japanese) and
# Arabic-script.
NUMBERING_FORMATS = {
    "decimal", "decimal-02", "lower-roman", "upper-roman", "lower-alpha", "upper-alpha",
    "simp-chinese-informal", "trad-chinese-informal", "simp-chinese-formal", "trad-chinese-formal",
    "japanese-informal", "japanese-formal", "hiragana", "katakana", "hiragana-iroha", "katakana-iroha",
    "cjk-decimal", "cjk-heavenly-stem", "cjk-earthly-branch", "circled-decimal", "fullwidth-decimal",
    "arabic-indic", "persian", "abjad", "hijai", "arabic-abjad", "arabic-abjad-maghrebi",
}
# The one-character tokens the same field takes (numbering.ts
# NUMBER_FORMAT_TOKENS): 一 and 壹 follow the document language and script,
# 壱 あ ア い イ are the Japanese daiji, gojūon and iroha series.
NUMBERING_TOKENS = {
    "1", "i", "I", "a", "A", "〇", "①", "甲", "子", "１", "一", "壹",
    "壱", "あ", "ア", "い", "イ", "١", "۱", "أبجد", "أبتث",
}
# `page` and `strip` are the raw-body comic blocks (checked by check_comic_block).
KNOWN_DIRECTIVES = {"pagebreak", "numbering", "columnbreak", "space", "toc", "index", "bibliography", "references", "verse",
                    "page", "strip"}
FENCE_RE = re.compile(r"^:::\s*([a-z][a-z0-9-]*)\s*(?:\{([^}]*)\})?\s*$")
ATTR_RE = re.compile(r"([A-Za-z_][A-Za-z0-9_-]*)(?:\s*=\s*(?:\"([^\"]*)\"|'([^']*)'|([^\s]+)))?")
HEADING_RE = re.compile(r"^(#{1,6})\s+(.+)$")
INDEX_MARK_RE = re.compile(r"(?<![:\\]):index(?:\[((?:\\.|[^\]\\\n])*)\])?(?:\{([^}\n]*)\})?")
INDEX_AFTER_COLON_RE = re.compile(r"(?<=[^\s:])::index[\[{]")
FOOTNOTE_MARK_RE = re.compile(r"\[\^([\w.:-]+)\]")
FOOTNOTE_DEF_RE = re.compile(r"^\[\^([\w.:-]+)\]:")
RESOURCE_RE = re.compile(r'^::resource\s*\{id="([^"]+)"\}\s*$')
ORDERED_RE = re.compile(r"^\s*\d+[.)]\s+")
UNORDERED_RE = re.compile(r"^\s*[-*+]\s+")

# config fields where em/rem throws (no font context)
ABS_ONLY = [
    ("page", "width"), ("page", "height"), ("layout", "gutterWidth"), ("bodyText", "fontSize"),
]


class Report:
    def __init__(self) -> None:
        self.items: list[tuple[str, str, str]] = []
        self.once: set[str] = set()  # messages reported once for the whole book

    def error(self, where: str, msg: str) -> None:
        self.items.append(("ERROR", where, msg))

    def warn(self, where: str, msg: str) -> None:
        self.items.append(("WARN", where, msg))

    def info(self, where: str, msg: str) -> None:
        self.items.append(("INFO", where, msg))


def parse_attrs(blob: str | None) -> dict[str, str]:
    out: dict[str, str] = {}
    for m in ATTR_RE.finditer(blob or ""):
        out[m.group(1)] = next((g for g in m.groups()[1:] if g is not None), "")
    return out


# The engine's strict attribute grammar (parse/attrs.ts): ASCII keys, `=` or
# the fullwidth `＝`, values in "…", '…', “…”, 「…」 or bare; a key in another
# script is read (so the block still parses) and dropped.
_ATTR_VALUE = "\"([^\"]*)\"|'([^']*)'|\u201c([^\u201d]*)\u201d|\u300c([^\u300d]*)\u300d|(\\S+)"
_ATTR_TOKEN_RE = re.compile(r"([A-Za-z_][A-Za-z0-9_-]*)(?:\s*[=\uff1d]\s*(?:" + _ATTR_VALUE + "))?")
_ATTR_FOREIGN_RE = re.compile(r"([^\W\d][\w-]*)\s*[=\uff1d]\s*(?:" + _ATTR_VALUE + ")")
# A heading's trailing block: after a space, or glued to a Chinese or
# Japanese character (parse/blockParser.ts HEADING_ATTRS_RE).
_HEADING_BLOCK_RE = re.compile(
    "(?:\\s+|(?<=[\u3000-\u303f\u3040-\u30ff\u31f0-\u31ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef"
    "\U00020000-\U0003134f]))\\{([^{}]*)\\}\\s*$"
)


def parse_attrs_strict(blob: str) -> list[tuple[str, str, bool, bool]] | None:
    """(key, value, flag, foreign key) for each token of a blob the grammar
    reads whole, else None (`{x, y}`, `{紅樓|hóng lóu}`)."""
    out: list[tuple[str, str, bool, bool]] = []
    at = len(blob) - len(blob.lstrip())
    while at < len(blob):
        f = _ATTR_FOREIGN_RE.match(blob, at)
        foreign = bool(f and re.search(r"[^\x00-\x7f]", f.group(1)))
        m = f if foreign else _ATTR_TOKEN_RE.match(blob, at)
        if not m:
            return None
        groups = m.groups()[1:]
        which = next((i for i, g in enumerate(groups) if g is not None), -1)
        at = m.end()
        before = at
        while at < len(blob) and blob[at].isspace():
            at += 1
        # Two tokens need a space between them unless a quote closes the first.
        if at < len(blob) and at == before and not 0 <= which < 4:
            return None
        out.append((m.group(1), groups[which] if which >= 0 else "", which < 0, foreign))
    return out


def split_heading_attrs(title: str) -> tuple[str, dict[str, str] | None]:
    """A heading's text without its trailing attribute block, and the block's
    attributes (keys outside ASCII dropped); None when the braces stay in the
    title, as the engine reads them: the grammar must read the whole block,
    and flags alone count only after a space (`# 第一回{draft}` keeps them)."""
    m = _HEADING_BLOCK_RE.search(title)
    if not m:
        return title, None
    tokens = parse_attrs_strict(m.group(1))
    if not tokens:
        return title, None
    spaced = m.group(0)[0] != "{"
    if not spaced and all(flag for _, _, flag, _ in tokens):
        return title, None
    return title[:m.start()], {k: v for k, v, _, foreign in tokens if not foreign}


def walk_values(node, path=""):
    if isinstance(node, dict):
        for k, v in node.items():
            yield from walk_values(v, f"{path}.{k}" if path else k)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from walk_values(v, f"{path}[{i}]")
    else:
        yield path, node


def check_config(cfg: dict, where: str, fonts: set[str], rep: Report, partial: bool = False) -> None:
    if not isinstance(cfg, dict):
        rep.error(where, "config must be an object")
        return
    if "customFonts" in cfg:
        rep.error(where, "config.customFonts must not be written: fonts come from the manifest `fonts` array")
    for sect, key in ABS_ONLY:
        v = (cfg.get(sect) or {}).get(key)
        if isinstance(v, dict) and v.get("unit") in ("em", "rem"):
            rep.error(where, f"{sect}.{key} in {v['unit']} throws: use mm/pt")
    for m in ("top", "bottom", "left", "right"):
        v = ((cfg.get("page") or {}).get("margins") or {}).get(m)
        if isinstance(v, dict) and v.get("unit") in ("em", "rem"):
            rep.error(where, f"page.margins.{m} in em throws: use mm")
    headings = cfg.get("headings")
    if isinstance(headings, dict):
        levels = {l.get("level"): l for l in headings.get("levels", []) if isinstance(l, dict)}
        for lv, l in levels.items():
            fs = l.get("fontSize")
            if isinstance(fs, dict) and fs.get("unit") in ("em", "rem"):
                rep.error(where, f"headings.levels[{lv}].fontSize in em throws: use pt")
        if (1 not in levels or "breakBefore" not in levels.get(1, {})) and not (partial and 1 not in levels):
            rep.warn(where, "headings is set but level 1 has no breakBefore: chapters will NOT start on a new page "
                            "(the default recto break only applies when `headings` is absent)")
    for path, el in design_elements(cfg):
        if el.get("kind") == "text":
            continue  # a text element's offset may be in em of its own size (postext >= 1.9)
        for axis in ("x", "y"):
            unit = (((el.get("placement") or {}).get("offset") or {}).get(axis) or {}).get("unit")
            if unit in ("em", "rem"):
                rep.error(where, f"{path}.placement.offset.{axis}: a {el.get('kind')} element's offset in em throws, use mm/pt")
    for path, val in walk_values(cfg):
        if re.search(r"elements\[\d+\]\.fontSize\.unit$", path) and val in ("em", "rem"):
            rep.error(where, f"{path}: design text sizes in em throw, use pt")
    pal = cfg.get("colorPalette")
    if isinstance(pal, list) and not any(p.get("id") == "main-color" for p in pal):
        rep.info(where, "colorPalette has no `main-color` entry: headings, bold, bullets, callouts and caption "
                        "accents keep the default blue #295AA3 unless every one is set explicitly")
    if partial:
        pass
    elif "header" not in cfg:
        rep.warn(where, "no `header`: the built-in running head (Open Sans, blue) is used; set "
                        '{"elements": []} or design one')
    if partial:
        pass
    elif "layout" not in cfg or "layoutType" not in (cfg.get("layout") or {}):
        rep.info(where, "layout.layoutType not set: the default is 'double' (two columns)")
    # `multiple` (postext >= 1.18): columnCount equal columns, a whole number 3-8.
    layouts = [("layout", cfg.get("layout"))] + [
        (f"headingStyles[{i}].layout", hs.get("layout")) for i, hs in enumerate(cfg.get("headingStyles") or [])
        if isinstance(hs, dict)]
    for lpath, lay in layouts:
        if not isinstance(lay, dict) or "columnCount" not in lay:
            continue
        n = lay["columnCount"]
        if lay.get("layoutType") != "multiple":
            rep.info(where, f"{lpath}.columnCount is read only by layoutType 'multiple' (ignored here)")
        elif not isinstance(n, (int, float)) or isinstance(n, bool) or n != int(n) or not 3 <= n <= 8:
            rep.warn(where, f"{lpath}.columnCount {n!r} is clamped to a whole number from 3 to 8 (columnCountClamped)")
    if "locale" not in cfg and not partial:
        rep.info(where, "config.locale not set: hyphenation and table continuation strings default to en-us")
    body = cfg.get("bodyText") or {}
    if body and "boldColor" not in body:
        rep.info(where, "bodyText.boldColor defaults to main-color (accent-coloured bold); set it to the body colour for black bold")
    for path, val in walk_values(cfg):
        if path.endswith("fontFamily") and isinstance(val, str) and fonts and val not in fonts:
            rep.warn(where, f"{path} = {val!r} is not a bundled family (only the browser can fetch Google Fonts; "
                            "the PDF and headless renders need the files)")


FOLIO_ENUMS = {
    "paper.type": {"uncoated", "bookWove", "coatedMatte", "coatedSilk", "coatedGloss", "bible", "newsprint", "cardStock", "board"},
    "paper.finish": {"auto", "uncoated", "matte", "silk", "gloss"},
    "paper.texture": {"auto", "smooth", "vellum", "wove", "laid", "linen", "felt"},
    "binding.type": {"hardcover", "paperback", "sewn", "layflat", "saddleStitch", "folded"},
    "binding.cover": {"case", "pages"},
    "binding.coverMaterial": {"auto", "cloth", "paper", "leather"},
    "surface.type": {"oak", "walnut", "linen", "felt", "leather", "marble", "plain", "none"},
    "lighting.environment": {"studio", "daylight", "lamp", "overcast", "night"},
}
# (lo, hi) the resolver clamps to; a value outside is silently clamped.
FOLIO_RANGES = {"tilt": (0, 70), "paper.grammage": (20, 2500), "paper.bulk": (0.5, 3),
                "paper.textureStrength": (0, 2), "lighting.intensity": (0.25, 2)}
FOLIO_KEYS = {
    "": {"tilt", "yaw", "paper", "binding", "surface", "lighting"},
    "paper": {"type", "grammage", "bulk", "finish", "texture", "textureStrength", "shade", "showThrough"},
    "binding": {"type", "cover", "coverMaterial", "coverColor", "spineImage"},
    "surface": {"type", "color"},
    "lighting": {"environment", "intensity", "shadows"},
}
FOLIO_COLORS = {"paper.shade", "binding.coverColor", "surface.color"}


def check_folio(cfg: dict, where: str, resources: list[dict], rep: Report) -> None:
    """`config.folio`: the Folio 3D viewer's settings (layout ignores them,
    so a mistake never shows on the canvas or in the PDF)."""
    folio = cfg.get("folio")
    if folio is None:
        return
    w = f"{where}.folio"
    if not isinstance(folio, dict):
        rep.error(w, "must be an object")
        return
    for group, keys in FOLIO_KEYS.items():
        node = folio if not group else folio.get(group)
        if node is None:
            continue
        if not isinstance(node, dict):
            rep.error(f"{w}.{group}", "must be an object")
            continue
        for k, v in node.items():
            path = f"{group}.{k}" if group else k
            if k not in keys:
                rep.warn(f"{w}.{path}", f"unknown key (ignored); {group or 'folio'} takes {sorted(keys)}")
            elif path in FOLIO_ENUMS and v not in FOLIO_ENUMS[path]:
                rep.error(f"{w}.{path}", f"{v!r} is not one of {sorted(FOLIO_ENUMS[path])}")
            elif path in FOLIO_RANGES:
                lo, hi = FOLIO_RANGES[path]
                if not isinstance(v, (int, float)) or isinstance(v, bool):
                    rep.error(f"{w}.{path}", "must be a number")
                elif not lo <= v <= hi:
                    rep.warn(f"{w}.{path}", f"{v} is clamped to {lo}–{hi}")
            elif path in FOLIO_COLORS and not (isinstance(v, dict) and isinstance(v.get("hex"), str)):
                rep.error(f"{w}.{path}", 'a colour is {"hex": "#rrggbb", "model": "hex"} (or with "paletteId")')
            elif k in ("showThrough", "shadows") and not isinstance(v, bool):
                rep.error(f"{w}.{path}", "must be true or false")
    binding = folio.get("binding") if isinstance(folio.get("binding"), dict) else {}
    spine = binding.get("spineImage")
    if spine is not None:
        kinds = {r.get("id"): r.get("kind") for r in resources}
        if binding.get("type") == "saddleStitch":
            rep.warn(f"{w}.binding.spineImage", "ignored: a saddle-stitched book has no flat spine")
        elif binding.get("type") == "folded":
            rep.warn(f"{w}.binding.spineImage", "ignored: a folded newspaper has no spine")
        elif spine not in kinds:
            rep.error(f"{w}.binding.spineImage", f"{spine!r} is not a resource id")
        elif kinds[spine] not in ("bitmap", "svg", None):
            rep.error(f"{w}.binding.spineImage", f"{spine!r} is a {kinds[spine]}: the spine takes a bitmap or SVG")
    paper = folio.get("paper") if isinstance(folio.get("paper"), dict) else {}
    if paper.get("type") == "board" and binding.get("type") not in (None, "hardcover"):
        rep.info(f"{w}.paper.type", "board leaves turn as rigid plates: a board book is usually bound as a hardcover")


def design_elements(node, path=""):
    """Every design element (a dict with a `kind`) inside an `elements` list."""
    if isinstance(node, dict):
        for k, v in node.items():
            sub = f"{path}.{k}" if path else k
            if k == "elements" and isinstance(v, list):
                for i, el in enumerate(v):
                    if isinstance(el, dict) and "kind" in el:
                        yield f"{sub}[{i}]", el
            yield from design_elements(v, sub)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from design_elements(v, f"{path}[{i}]")


# Characters the CJK checks look at: Han (with extensions and compatibility
# ideographs), kana, bopomofo, hangul, CJK punctuation, fullwidth forms and
# the vertical and small presentation forms.
CJK_RE = re.compile(
    "[\u2e80-\u2fdf\u3000-\u303f\u3040-\u30ff\u3100-\u312f\u3190-\u31ef\u3400-\u4dbf"
    "\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff\ufe10-\ufe1f\ufe30-\ufe4f\uff00-\uffef"
    "\U00020000-\U0003134f]"
)
HAN_RE = re.compile("[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\U00020000-\U0003134f]")
# Hiragana and katakana letters, with the kana iteration marks, the katakana
# phonetic extensions (Ainu small kana), half-width katakana and the Small Kana
# Extension. Kana are what tell Japanese text from Chinese, so the marks a
# Chinese text may type too are left out: the prolonged sound mark \u30fc, the
# middle dot \u30fb and \u30a0 (and the half-width \uff70).
KANA_RE = re.compile(
    "[\u3041-\u3096\u309d-\u309f\u30a1-\u30fa\u30fd-\u30ff\u31f0-\u31ff\uff66-\uff6f\uff71-\uff9d"
    "\U0001b130-\U0001b16f]"
)
# Chinese builds of the pan-CJK faces (Noto Serif SC, Source Han Sans TC,
# LXGW WenKai TC\u2026): they draw kanji in their Chinese forms (\u76f4, \u9aa8, \u89d2, \u5199).
CHINESE_FACE_RE = re.compile(r"\b(SC|TC|HK|CN|TW|SimSun|SimHei|KaiTi|FangSong)\b|Simplified|Traditional")
# Aozora Bunko notation left in a Postext chapter (aozora.py converts it): a
# reading in \u300a\u300b after its base, \uff5c where the base starts, \uff3b\uff03\u2026\uff3d notes and
# the \u304f\u306e\u5b57\u70b9 typed as \uff0f\uff3c.
AOZORA_RUBY_RE = re.compile("(\uff5c[^\uff5c\u300a\u300b\n]{1,40})?(?<=[^\\s\u300a])\u300a[\u3041-\u309f\u30a0-\u30ff\u3014\u3015]+\u300b")
AOZORA_NOTE_RE = re.compile("\u203b?\uff3b\uff03[^\uff3d\n]*\uff3d")
AOZORA_KUNOJI_RE = re.compile("(?<=[\u3041-\u30ff])\uff0f\u2033?\uff3c")
FULLWIDTH_MARKUP = [
    (re.compile(r"^\s*：：："), "：：：", ":::"),
    (re.compile(r"^\s*＃{1,6}[ 　]"), "＃", "#"),
    (re.compile(r"［＾[^］]*］"), "［＾…］", "[^…]"),
    (re.compile(r"＊＊[^＊]+＊＊"), "＊＊…＊＊", "**…**"),
]
# Arabic-script letters, marks and presentation forms (Arabic, Supplement,
# Extended-A/B, presentation forms A and B). Digits and punctuation of the
# block count too: a Latin face has none of them.
ARABIC_RE = re.compile("[\u0600-\u06ff\u0750-\u077f\u0870-\u08ff\ufb50-\ufdff\ufe70-\ufeff]")
ARABIC_LETTER_RE = re.compile("[\u0620-\u064a\u066e-\u06d3\u06d5\u06fa-\u06fc\u06ff\u0750-\u077f\u08a0-\u08c9]")
RTL_LANGS = {"ar", "fa", "ur", "ps", "sd", "ckb", "ug", "he", "yi", "dv", "syr"}
LATIN_ONLY_FAMILIES = {"EB Garamond", "Open Sans", "Lora", "Geist", "Fraunces", "Newsreader", "Source Serif 4",
                       "Alegreya", "Playfair Display", "Merriweather", "Inter", "Roboto", "Comic Neue", "Bangers"}


def check_cjk_lines(name: str, text: str, rep: Report, japanese: bool = False) -> None:
    """Markup typed with a Chinese or Japanese input method, ideographic
    spaces typed as a paragraph indent, and Aozora Bunko notation that was
    never converted."""
    prev_blank = True
    for i, raw in enumerate(text.split("\n")):
        where = f"{name}:{i + 1}"
        for rx, typed, ascii_ in FULLWIDTH_MARKUP:
            if rx.search(raw):
                rep.warn(where, f"{typed} typed with an input method prints as text (fullwidthMarkup): type {ascii_}")
        if prev_blank and raw.startswith("　"):
            if japanese:
                # JLReq §3.5: one em; Aozora types it as one U+3000.
                rep.info(where, "paragraph starts with an ideographic space (U+3000), which the parser drops: the "
                                "1 em indent is bodyText.firstLineIndent {value: 1, unit: 'em'}; a paragraph that must "
                                "stay flush goes in a :::paragraphs style with firstLineIndent 0 (aozora.py writes them)")
            else:
                rep.info(where, "paragraph starts with ideographic spaces (U+3000), which the parser drops: "
                                "indent with bodyText.firstLineIndent {value: 2, unit: 'em'}")
        prev_blank = not raw.strip()
        for m in AOZORA_NOTE_RE.finditer(raw):
            rep.error(where, f"Aozora note {m.group(0)[:24]} prints as text: convert the file with aozora.py, or "
                             "write the Postext markup it stands for")
        for m in AOZORA_RUBY_RE.finditer(raw):
            rep.error(where, f"Aozora reading {m.group(0)[:24]} prints as text: write it as {{base|reading}} "
                             "(aozora.py converts 《》 and ｜)")
        if AOZORA_KUNOJI_RE.search(raw):
            rep.warn(where, "／＼ after kana is Aozora's くの字点: write 〳〵 (〴〵 voiced), a vertical-only mark; "
                            "in horizontal text write the repeated kana out")


def font_coverage(root: Path, fonts: list[dict]) -> dict[str, list[tuple[str, set[int]]]] | None:
    """family -> [(variant label, code points the file maps)], or None when
    fontTools cannot be imported (the coverage check is then skipped)."""
    try:
        from fontTools.ttLib import TTFont
    except ImportError:
        return None
    out: dict[str, list[tuple[str, set[int]]]] = {}
    for f in fonts:
        for v in f.get("variants", []):
            path = root / v.get("file", "")
            if not path.exists():
                continue
            try:
                font = TTFont(str(path), lazy=True, fontNumber=0)
                cmap = set((font.getBestCmap() or {}).keys())
            except Exception:  # noqa: BLE001 (a broken file is reported elsewhere)
                continue
            label = f"{v.get('weight', 400)}{' italic' if v.get('style') == 'italic' else ''} ({v.get('file')})"
            out.setdefault(f.get("name", ""), []).append((label, cmap))
    return out


def check_font_files(root: Path, fonts: list[dict], vertical: bool, rep: Report) -> None:
    """CFF files that postext-pdf embeds whole, variable fonts that print
    their default instance, and vertical forms for a vertical book."""
    try:
        from fontTools.ttLib import TTFont
    except ImportError:
        return
    for f in fonts:
        for v in f.get("variants", []):
            path = root / v.get("file", "")
            if not path.exists():
                continue
            try:
                font = TTFont(str(path), lazy=True, fontNumber=0)
            except Exception:  # noqa: BLE001
                continue
            where = f"font {v.get('file')}"
            if "CFF " in font and path.stat().st_size > 2 * 1024 * 1024:
                rep.warn(where, f"CFF outlines, {path.stat().st_size // (1024 * 1024)} MB: postext-pdf embeds CFF fonts whole "
                                "(cffEmbeddedWhole); subset it or use a TrueType build")
            if "fvar" in font:
                rep.warn(where, "a variable font: pdf-lib embeds its default instance, so other weights print at it "
                                "(variableFontDefaultInstance); cut a static instance per weight (fonts.py instance)")
            if vertical and has_han(font):
                feats = set()
                if "GSUB" in font and font["GSUB"].table.FeatureList:
                    feats = {r.FeatureTag for r in font["GSUB"].table.FeatureList.FeatureRecord}
                if not feats & {"vert", "vrt2"}:
                    rep.warn(where, "the book is vertical but this CJK face has no `vert` feature: brackets, "
                                    "punctuation and small kana are turned or moved instead of taking their vertical "
                                    "forms (keep layout features when subsetting: fonts.py subset keeps them)")


def has_han(font) -> bool:
    cmap = font.getBestCmap() or {}
    return any(0x4E00 <= cp <= 0x9FFF for cp in cmap)


def check_cjk_coverage(where: str, chars: dict[str, set[str]], cfg: dict, coverage: dict | None,
                       fonts: set[str], rep: Report, roles: dict[str, set[str]] | None = None,
                       japanese: bool = False) -> None:
    """Every CJK character a family sets must be in each of its bundled files:
    Postext sets one family per style and takes nothing from another family.
    In a Japanese book (`japanese`), the families that set kana must be
    Japanese faces."""
    for family, used in chars.items():
        if not used:
            continue
        sample = "".join(sorted(used)[:12])
        kana = japanese and any(KANA_RE.match(c) for c in used)
        if family in LATIN_ONLY_FAMILIES:
            by = ", ".join(sorted((roles or {}).get(family, ()))) or "bodyText/headings fontFamily"
            faces = ("a Japanese face (Noto Serif JP, Noto Sans JP, Shippori Mincho, BIZ UDMincho)" if kana
                     else "a Chinese face (Noto Serif SC/TC, Noto Sans SC/TC)")
            rep.error(where, f"{len(used)} CJK characters ({sample}…) are set in {family}, which has none: "
                             f"set {by} to {faces}, or give that text a paragraph or heading style that has one")
            continue
        if kana and CHINESE_FACE_RE.search(family):
            rep.warn(where, f"{family} sets kana (Japanese text): a Chinese build draws its kanji in Chinese forms "
                            "(直 骨 角 写) and may lack kana; use the JP build (Noto Serif JP, Noto Sans JP) or another "
                            "Japanese face")
        if family not in fonts:
            rep.warn(where, f"{family} sets {len(used)} CJK characters but is not bundled: its coverage cannot be checked, "
                            "and the PDF and headless renders need the files")
            continue
        if coverage is None:
            rep.info(where, "install fontTools to check that the bundled fonts cover the CJK text")
            return
        for label, cmap in coverage.get(family, []):
            if "italic" in label:
                continue
            missing = sorted(c for c in used if ord(c) not in cmap)
            if missing:
                ranges = " --ranges latin,latin-ext,punct,cjk-punct,kana" if any(KANA_RE.match(c) for c in missing) else ""
                rep.error(where, f"{family} {label} has no glyph for {len(missing)} of the {len(used)} CJK characters it sets: "
                                 f"{''.join(missing[:20])}{'…' if len(missing) > 20 else ''} (they print as empty boxes; "
                                 f"subset from a face that has them: fonts.py subset FONT --out fonts/ --text-from chapters/{ranges})")


def _styles_by_id(cfg: dict, key: str) -> dict[str, dict]:
    v = cfg.get(key)
    return {s.get("id"): s for s in v if isinstance(s, dict)} if isinstance(v, list) else {}


def cjk_chars_by_family(texts: list[tuple[str, str]], cfg: dict) -> tuple[dict[str, set[str]], dict[str, set[str]]]:
    """The CJK characters each family sets (see `script_chars_by_family`)."""
    return script_chars_by_family(texts, cfg, CJK_RE, ignore="　")


def script_chars_by_family(texts: list[tuple[str, str]], cfg: dict, rx: re.Pattern,
                           ignore: str = "") -> tuple[dict[str, set[str]], dict[str, set[str]]]:
    """The characters of a script (`rx`) each family sets, and the settings that set them
    there: a heading in its heading style's family, else its level's, else
    the headings family; a `:::paragraphs{style}` run in its paragraph
    style's family; a callout's body in its style's `body.fontFamily` and
    its `title` in `titleStyle.fontFamily`; everything else in the body
    family. A heading's trailing attribute block is not printed in the
    heading (a design prints `{attr.<key>}` in its own face) and front
    matter and display maths are not text, so none of them is counted."""
    body = (cfg.get("bodyText") or {}).get("fontFamily") or "EB Garamond"
    headings = cfg.get("headings") or {}
    head_default = headings.get("fontFamily") or "Open Sans"
    level_family = {l.get("level"): l.get("fontFamily") for l in headings.get("levels", [])
                    if isinstance(l, dict) and l.get("fontFamily")}
    para_styles = _styles_by_id(cfg, "paragraphStyles")
    head_styles = _styles_by_id(cfg, "headingStyles")
    callouts = [s for s in cfg.get("calloutStyles") or [] if isinstance(s, dict)] \
        if isinstance(cfg.get("calloutStyles"), list) else []
    out: dict[str, set[str]] = defaultdict(set)
    roles: dict[str, set[str]] = defaultdict(set)
    lettering, sfx = comic_faces(cfg)

    def add(fam: str, role: str, text: str) -> None:
        chars = {c for c in rx.findall(text) if c not in ignore}
        if chars:
            out[fam].update(chars)
            roles[fam].add(role)

    for _, text in texts:
        lines = text.split("\n")
        start = 0
        if lines and lines[0].strip() == "---":
            end = next((i for i in range(1, len(lines)) if lines[i].strip() == "---"), None)
            start = end + 1 if end is not None else 0
        # Innermost open container: (family, role) of the text it holds.
        stack: list[tuple[str, str]] = []
        in_math = False
        in_comic = False  # a :::page / :::strip body is set in the lettering faces
        for line in (l.strip() for l in lines[start:]):
            if in_comic:
                if line == ":::":
                    in_comic = False
                elif line and not line.startswith("::panel"):
                    hm = COMIC_SCRIPT_RE.match(line)
                    if hm and hm.group(1) == "sfx":
                        add(sfx, "the sfx balloon style's fontFamily (comics.balloonStyles)", line[hm.end():])
                    else:
                        add(lettering, "comics.lettering.fontFamily", line[hm.end():] if hm else line)
                continue
            if COMIC_FENCE_RE.match(line):
                in_comic = True
                continue
            if in_math or line == "$$":
                in_math = (line != "$$") if in_math else True
                continue
            here = stack[-1] if stack else (body, "bodyText.fontFamily")
            if line.startswith(":::"):
                if line == ":::":
                    if stack:
                        stack.pop()
                    continue
                fm = FENCE_RE.match(line)
                if not fm or fm.group(1) not in KNOWN_CONTAINERS:
                    continue
                name, attrs = fm.group(1), parse_attrs(fm.group(2))
                if name == "paragraphs":
                    sid = attrs.get("style", "")
                    fam = (para_styles.get(sid) or {}).get("fontFamily")
                    stack.append((fam, f"paragraphStyles[{sid}].fontFamily") if fam else (body, "bodyText.fontFamily"))
                elif name == "callout":
                    t = attrs.get("type")
                    st = next((s for s in callouts if t and s.get("id") == t), callouts[0] if callouts else {})
                    sid = st.get("id", "note")
                    if attrs.get("title"):
                        tfam = (st.get("titleStyle") or {}).get("fontFamily")
                        add(tfam or head_default,
                            f"calloutStyles[{sid}].titleStyle.fontFamily" if tfam else "headings.fontFamily",
                            attrs["title"])
                    bfam = (st.get("body") or {}).get("fontFamily")
                    stack.append((bfam, f"calloutStyles[{sid}].body.fontFamily") if bfam else (body, "bodyText.fontFamily"))
                else:
                    stack.append(here)
                continue
            m = HEADING_RE.match(line)
            if m:
                title, attrs = split_heading_attrs(INDEX_MARK_RE.sub("", m.group(2)))
                level = len(m.group(1))
                sid = (attrs or {}).get("style", "")
                sfam = (head_styles.get(sid) or {}).get("fontFamily") if sid else None
                if sfam:
                    add(sfam, f"headingStyles[{sid}].fontFamily", title)
                elif level in level_family:
                    add(level_family[level], f"headings.levels[{level}].fontFamily", title)
                else:
                    add(head_default, "headings.fontFamily", title)
                continue
            add(here[0], here[1], line)
    return out, roles


def is_japanese_text(kana: int, han: int) -> bool:
    """Kana make a text Japanese: Japanese prose writes a third or more of it
    in kana, even beside dense kanji; a Chinese text quoting a Japanese name
    or title holds a handful. At least 10 kana and 5 % of the kana and Han."""
    return kana >= 10 and kana * 20 >= kana + han


def document_locale(cfg: dict) -> str | None:
    return cfg.get("locale") or ((cfg.get("bodyText") or {}).get("hyphenation") or {}).get("locale")


def check_cjk_locale(where: str, texts: list[tuple[str, str]], cfg: dict, rep: Report) -> None:
    han = sum(len(HAN_RE.findall(t)) for _, t in texts)
    kana = sum(len(KANA_RE.findall(t)) for _, t in texts)
    if not han and not kana:
        return
    loc = document_locale(cfg)
    lang = re.split(r"[-_]", loc)[0].lower() if loc else ""
    if lang == "jp":
        rep.error(where, f"config.locale {loc!r}: 'jp' is Japan's country code, not a language; Japanese is 'ja' "
                         "(or 'ja-JP')")
        return
    if is_japanese_text(kana, han):
        rules = ("the Japanese rules (JLReq kinsoku and spacing, sesame bōten, 『』 titles, jukugo furigana, 図/表, "
                 "第一章 numbering, gojūon index) follow 'ja'")
        if not loc:
            rep.warn(where, f"the chapters hold {kana} kana, so they are Japanese, but config.locale is not set: set "
                            f"'ja'; {rules}")
        elif lang == "zh":
            rep.error(where, f"the chapters hold {kana} kana, so they are Japanese, but config.locale is {loc!r}: "
                             "they are set with the Chinese rules (line breaking, punctuation, emphasis dots, 《》, "
                             f"图/圖, 一百零一); set 'ja'; {rules}")
        elif lang != "ja":
            latin = sum(len(re.findall(r"[A-Za-z]+", t)) for _, t in texts)
            if han + kana > 4 * latin:
                rep.warn(where, f"the chapters are mostly Japanese ({kana} kana, {han} kanji) but config.locale is "
                                f"{loc!r}: set 'ja'; {rules}")
        return
    if not han:
        return
    if not loc:
        rep.warn(where, f"the chapters hold {han} Chinese characters but config.locale is not set: set 'zh-Hans' or "
                        "'zh-Hant' with the region ('zh-Hans-CN', 'zh-Hant-TW', 'zh-Hant-HK'); the region picks line "
                        "breaking and punctuation widths, the script the built-in 图/圖 strings")
        return
    lang = re.split(r"[-_]", loc)[0].lower()
    if lang == "zh" and not re.search(r"(?i)[-_](hans|hant|cn|sg|my|tw|hk|mo)\b", loc):
        rep.warn(where, f"config.locale {loc!r} names no script: it reads as Simplified, mainland; write 'zh-Hans' or "
                        "'zh-Hant' (with the region)")
    elif lang not in ("zh", "ja", "ko"):
        latin = sum(len(re.findall(r"[A-Za-z]+", t)) for _, t in texts)
        if han > 4 * latin:
            rep.warn(where, f"the chapters are mostly Chinese ({han} characters) but config.locale is {loc!r}: the "
                            "Chinese defaults (region, emphasis dots, strings, index groups) follow a zh locale")


def is_japanese_locale(tag: str | None) -> bool:
    return bool(tag) and re.split(r"[-_]", tag)[0].lower() == "ja"


def check_japanese_config(where: str, cfg: dict, rep: Report) -> None:
    """Settings that put Chinese rules or habits on a Japanese book (locale
    'ja'): the engine's Japanese defaults follow the `japan` region, so most of
    them only need to be left unset."""
    cjk = cfg.get("cjk") or {}
    region = cjk.get("region")
    if region not in (None, "auto", "japan"):
        rep.warn(where, f"cjk.region {region!r} sets this Japanese book with that Chinese region's rules: remove it "
                        "(auto is 'japan' for locale 'ja')")
    lb = cjk.get("lineBreak")
    if lb in ("basic", "gb", "strict"):
        rep.warn(where, f"cjk.lineBreak {lb!r} is a Chinese level: leave it 'auto' (ja-very-strict, JIS X 4051) or "
                        "pick 'ja-strict' (small kana and ー may open a line) or 'ja-loose' as the source shows")
    if cjk.get("emphasis") == "italic":
        rep.warn(where, "cjk.emphasis 'italic' slants kana and kanji, which Japanese never does: leave it 'auto' "
                        "(sesame bōten)")
    fli = (cfg.get("bodyText") or {}).get("firstLineIndent")
    if isinstance(fli, dict) and fli.get("unit") == "em" and fli.get("value") == 2:
        rep.info(where, "bodyText.firstLineIndent is 2 em, the Chinese habit: Japanese books indent 1 em (JLReq §3.5)")
    vertical = (cfg.get("layout") or {}).get("writingMode") == "vertical-rl"
    if vertical and (cfg.get("page") or {}).get("binding") == "left":
        rep.warn(where, "page.binding 'left' in a vertical Japanese book: vertical books are bound on the right "
                        "(leave 'auto'); page 1 is then the left page of its spread")


def is_rtl_locale(tag: str | None) -> bool:
    return bool(tag) and re.split(r"[-_]", tag)[0].lower() in RTL_LANGS


def check_arabic_config(where: str, texts: list[tuple[str, str]], cfg: dict, rep: Report) -> None:
    """The document language and direction of a book with Arabic text, and the
    settings Arabic text ignores or that hide its emphasis."""
    arabic = sum(len(ARABIC_LETTER_RE.findall(t)) for _, t in texts)
    if not arabic:
        return
    latin = sum(len(re.findall(r"[A-Za-z]", t)) for _, t in texts)
    body = cfg.get("bodyText") or {}
    hyph = body.get("hyphenation") or {}
    loc = cfg.get("locale") or hyph.get("locale")
    mostly = arabic > latin
    direction = cfg.get("direction")
    if mostly and not is_rtl_locale(loc):
        rep.error(where, f"the chapters are mostly Arabic ({arabic} letters) but config.locale is "
                         f"{repr(loc) if loc else 'not set'}: set 'ar' (or 'ar-EG', 'ar-MA'…). Without it the book is laid "
                         "out left to right, bound on the left, with European digits and italic emphasis")
    if is_rtl_locale(loc) and direction == "ltr":
        rep.warn(where, "config.direction 'ltr' in an Arabic-script book: lines, columns and the binding run left to "
                        "right; remove it (auto reads the locale)")
    if not mostly and direction == "rtl" and not is_rtl_locale(loc):
        rep.warn(where, f"config.direction 'rtl' with locale {loc!r}: mark the Arabic passages with "
                        ":::paragraphs{dir=rtl} or :rtl[…] instead of turning the whole book")
    if hyph.get("enabled") is True and (not hyph.get("locale") or is_rtl_locale(hyph.get("locale"))):
        rep.warn(where, "bodyText.hyphenation.enabled is on in an Arabic book: Arabic is never hyphenated, so it "
                        "does nothing; remove it (name a Latin pattern locale only to hyphenate the Latin words)")
    if body.get("emphasis") == "italic" and (mostly or is_rtl_locale(loc)):
        rep.warn(where, "bodyText.emphasis 'italic': Arabic letters are never slanted, so *…* on Arabic words shows "
                        "nothing; leave it 'auto' (bold) or use 'color' / 'overline'")
    spaced = []
    def tracked(node, path):
        if isinstance(node, dict):
            for k, v in node.items():
                if k == "letterSpacing" and isinstance(v, dict) and v.get("value"):
                    spaced.append(path)
                else:
                    tracked(v, f"{path}.{k}" if path else k)
        elif isinstance(node, list):
            for i, v in enumerate(node):
                tracked(v, f"{path}[{(v.get('id') or v.get('level') or i) if isinstance(v, dict) else i}]")
    for key in ("bodyText", "headings", "headingStyles", "paragraphStyles", "calloutStyles"):
        tracked(cfg.get(key), key)
    if spaced:
        rep.warn(where, f"letterSpacing on {', '.join(spaced[:6])}: Arabic words are never letter-spaced (the build "
                        "reports joiningScriptLetterSpacing); drop it for the styles that set Arabic")


def check_arabic_coverage(where: str, chars: dict[str, set[str]], coverage: dict | None, fonts: set[str],
                          rep: Report, roles: dict[str, set[str]] | None = None) -> None:
    """Every Arabic character a family sets must be in its bundled files."""
    for family, used in chars.items():
        if not used:
            continue
        sample = "".join(sorted(used)[:12])
        if family in LATIN_ONLY_FAMILIES:
            by = ", ".join(sorted((roles or {}).get(family, ()))) or "bodyText/headings fontFamily"
            rep.error(where, f"{len(used)} Arabic characters ({sample}…) are set in {family}, which has none: "
                             f"set {by} to an Arabic face (Amiri, Noto Naskh Arabic, Scheherazade New; Noto Kufi Arabic "
                             "for headings)")
            continue
        if family not in fonts:
            rep.warn(where, f"{family} sets {len(used)} Arabic characters but is not bundled: its coverage cannot be "
                            "checked, and the PDF and headless renders need its arabic subset file")
            continue
        if coverage is None:
            rep.info(where, "install fontTools to check that the bundled fonts cover the Arabic text")
            return
        for label, cmap in coverage.get(family, []):
            if "italic" in label:
                continue
            missing = sorted(c for c in used if ord(c) not in cmap)
            if missing:
                rep.error(where, f"{family} {label} has no glyph for {len(missing)} of the {len(used)} Arabic characters "
                                 f"it sets: {''.join(missing[:20])}{'…' if len(missing) > 20 else ''} (they print as empty "
                                 "boxes; subset from the full face: fonts.py subset FONT --ranges latin,punct,arabic)")


def check_arabic_font_files(root: Path, fonts: list[dict], families: set[str], rep: Report) -> None:
    """An Arabic face without joining tables prints isolated letters."""
    try:
        from fontTools.ttLib import TTFont
    except ImportError:
        return
    for f in fonts:
        if f.get("name") not in families:
            continue
        for v in f.get("variants", []):
            path = root / v.get("file", "")
            if not path.exists():
                continue
            try:
                font = TTFont(str(path), lazy=True, fontNumber=0)
            except Exception:  # noqa: BLE001
                continue
            feats = set()
            if "GSUB" in font and font["GSUB"].table.FeatureList:
                feats = {r.FeatureTag for r in font["GSUB"].table.FeatureList.FeatureRecord}
            if not feats & {"init", "medi", "fina"}:
                rep.error(f"font {v.get('file')}", "an Arabic face with no joining features (init/medi/fina): its "
                                                   "letters print isolated; subset with layout features kept "
                                                   "(fonts.py subset keeps them)")
            elif 0x0640 not in (font.getBestCmap() or {}):
                rep.warn(f"font {v.get('file')}", "no tatweel (U+0640): kashida justification cannot elongate in "
                                                  "this face; keep the whole Arabic block when subsetting")


# ---------------------------------------------------------------------------
# Comics (`:::page`, `:::strip`, `::panel`, script lines; postext >= 1.20)
# ---------------------------------------------------------------------------

# Raw-body comic blocks (parse/blockParser.ts reads them whole up to `:::`).
COMIC_BLOCKS = {"page", "strip"}
COMIC_PAGE_ATTRS = {"split", "gutter", "style", "bleed", "direction", "dir", "spread", "id"}
COMIC_STRIP_ATTRS = {"split", "gutter", "style", "bleed", "direction", "dir", "span", "placement", "height", "aspect", "id"}
COMIC_PANEL_ATTRS = {"art", "fit", "focus", "style", "border", "bg", "bleed", "mirror", "pop", "inset", "pad", "alt", "id"}
# Keys a script line reads (comics/script.ts SCRIPT_KEYS); any other bare
# flag names a balloon style.
COMIC_SCRIPT_KEYS = {"at", "to", "tail", "join", "break", "rotate", "size", "color", "font", "style", "id",
                     "vertical", "horizontal", "mode"}
COMIC_RESERVED_KEYS = {"caption", "sfx", "note"}
COMIC_BALLOON_STYLES = {"speech", "thought", "whisper", "shout", "radio", "caption", "inner", "note", "sfx"}
COMIC_POSITIONS = {"top-start", "top-end", "bottom-start", "bottom-end", "top", "bottom"}
COMIC_TAILS = {"none", "auto", "top", "bottom", "start", "end"}
COMIC_SIDES = {"top", "bottom", "start", "end", "left", "right"}
COMIC_FENCE_RE = re.compile(r"^:::\s*(page|strip)\s*(?:\{([^}]*)\})?\s*$")
COMIC_PANEL_RE = re.compile(r"^::panel\s*(?:\{([^}]*)\})?\s*$")
COMIC_SCRIPT_RE = re.compile(r"^([\w.-]+)[ \t]*(?:\{([^}\n]*)\})?[ \t]*[:：]")
COMIC_POINT_RE = re.compile(r"^\s*(-?[0-9.]+)\s*(%?)\s*[ ,]\s*(-?[0-9.]+)\s*(%?)\s*$")
COMIC_DIM_RE = re.compile(r"^\s*[0-9]*\.?[0-9]+\s*(mm|cm|in|pt|px)?\s*$")
HEX_RE = re.compile(r"^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?:[0-9a-fA-F]{2})?$")
ARABIC_SCRIPT_LANGS = {"ar", "fa", "ur", "ps", "sd", "ckb", "ug"}

# The `comics` config tables (packages/postext src/configWarnings.ts).
COMICS_KEYS = {"readingDirection", "artDirection", "mirrorArt", "frame", "gutter", "panel", "panelStyles",
               "lettering", "balloonStyles", "cast", "runningHeads"}
COMICS_PANEL_KEYS = {"borderWidth", "borderColor", "borderRadius", "borderStyle", "background", "fit", "bleed"}
COMICS_LETTERING_KEYS = {"fontFamily", "fontSize", "lineHeight", "color", "bold", "italic", "letterSpacing", "writingMode",
                         "textTransform", "dropFinalStop", "doubleDash", "inset", "joinSameSpeaker", "maxColumnChars"}
COMICS_BALLOON_KEYS = {"id", "name", "shape", "fill", "stroke", "strokeWidth", "dash", "double", "wobble", "roundness",
                       "burstPoints", "burstDepth", "padding", "aspect", "tail", "tailWidth", "tailReach", "target",
                       "position", "butt", "fontFamily", "fontScale", "bold", "italic", "color", "textTransform",
                       "letterSpacing", "align", "halo", "haloColor", "rotate"}
COMICS_CAST_KEYS = {"id", "name", "balloonStyle", "color", "fill", "fontFamily"}
COMICS_ENUMS = {
    "readingDirection": {"auto", "ltr", "rtl"}, "artDirection": {"ltr", "rtl"},
    "borderStyle": {"solid", "none", "rough"}, "fit": {"cover", "contain"},
    "writingMode": {"auto", "horizontal", "vertical"}, "textTransform": {"none", "uppercase"},
    "joinSameSpeaker": {"butt", "connector", "none"},
    "shape": {"oval", "rounded", "rectangle", "cloud", "burst", "wavy", "electric", "none"},
    "tail": {"curved", "wedge", "bubbles", "zigzag", "none"}, "target": {"mouth", "head"},
    "position": {"auto"} | COMIC_POSITIONS, "align": {"center", "start"},
}


def comic_script_of(locale: str | None) -> str:
    """'ja', 'zh-Hans', 'zh-Hant', 'arab' or 'latin' (defaults/comics.ts comicScript)."""
    tag = (locale or "").strip()
    lang = re.split(r"[-_]", tag)[0].lower() if tag else ""
    if lang == "ja":
        return "ja"
    if lang == "zh":
        return "zh-Hant" if re.search(r"(?i)[-_](hant|tw|hk|mo)\b", tag) else "zh-Hans"
    if lang in ARABIC_SCRIPT_LANGS:
        return "arab"
    return "latin"


def comic_faces(cfg: dict) -> tuple[str, str]:
    """The lettering face and the sound-effect face a book's comics use: the
    config's, else the defaults of its language (defaultComicFont,
    defaultComicSfxFont)."""
    script = comic_script_of(document_locale(cfg))
    comics = cfg.get("comics") if isinstance(cfg.get("comics"), dict) else {}
    lettering = (comics.get("lettering") or {}).get("fontFamily") if isinstance(comics.get("lettering"), dict) else None
    sfx = next((s.get("fontFamily") for s in comics.get("balloonStyles") or []
                if isinstance(s, dict) and s.get("id") == "sfx" and s.get("fontFamily")), None)
    default = {"ja": "Zen Antique", "zh-Hans": "Noto Sans SC", "zh-Hant": "LXGW WenKai TC",
               "arab": "Playpen Sans Arabic"}.get(script, "Comic Neue")
    default_sfx = {"ja": "Dela Gothic One", "zh-Hans": "ZCOOL KuaiLe", "zh-Hant": "LXGW WenKai TC",
                   "arab": "Lalezar"}.get(script, "Bangers")
    return (lettering or "").strip() or default, (sfx or "").strip() or default_sfx


def comic_style_ids(cfg: dict) -> tuple[set[str], set[str]]:
    """(balloon style ids, panel style ids) a book's comics know."""
    comics = cfg.get("comics") if isinstance(cfg.get("comics"), dict) else {}
    balloons = set(COMIC_BALLOON_STYLES) | {s.get("id") for s in comics.get("balloonStyles") or []
                                           if isinstance(s, dict) and s.get("id")}
    panels = {s.get("id") for s in comics.get("panelStyles") or [] if isinstance(s, dict) and s.get("id")}
    return balloons, panels


def parse_comic_split(src: str) -> tuple[dict, list[tuple[str, str]]]:
    """The split grammar (comics/split.ts): the tree and its issues,
    ('syntax' | 'overflow', message)."""
    issues: list[tuple[str, str]] = []
    n = len(src)
    at = 0
    num_re = re.compile(r"[0-9]+(?:\.[0-9]*)?|\.[0-9]+")

    def skip() -> None:
        nonlocal at
        while at < n and src[at].isspace():
            at += 1

    def number() -> float | None:
        nonlocal at
        m = num_re.match(src, at)
        if not m:
            return None
        at = m.end()
        return float(m.group(0))

    def size() -> dict:
        nonlocal at
        skip()
        if at < n and src[at] == "*":
            at += 1
            return {"star": True}
        a = number()
        if a is None:
            return {"star": True, "implicit": True}
        out = {"star": False, "start": a}
        if at < n and src[at] == "%":
            at += 1
        if at < n and src[at] == "~":
            at += 1
            b = number()
            if b is None:
                issues.append(("syntax", 'a slant needs a number after "~"'))
            else:
                out["end"] = b
                if at < n and src[at] == "%":
                    at += 1
        return out

    def parse_list(closer: str | None) -> dict:
        nonlocal at
        items: list[dict] = []
        sep = None
        while True:
            skip()
            item = {"size": size()}
            skip()
            if at < n and src[at] == "[":
                at += 1
                item["children"] = parse_list("]")
                skip()
                if at < n and src[at] == "]":
                    at += 1
                else:
                    issues.append(("syntax", '"[" is never closed'))
            items.append(item)
            more = False
            while True:
                skip()
                c = src[at] if at < n else None
                if c in ("/", "|"):
                    if sep is None:
                        sep = c
                    elif sep != c:
                        issues.append(("syntax", 'a list mixes "/" and "|": put one of them inside brackets'))
                    at += 1
                    more = True
                    break
                if c is None or c == closer:
                    break
                bad = at
                at += 1
                while at < n and src[at] not in "/|" and src[at] != closer:
                    at += 1
                issues.append(("syntax", f'"{src[bad:at].strip()}" is not a size'))
            if not more:
                break
        axis = ("rows" if sep == "/" else "columns") if sep and len(items) > 1 else None
        return {"axis": axis, "items": items}

    tree = parse_list(None)
    skip()
    if at < n:
        issues.append(("syntax", f'"{src[at:]}" is left over'))

    def axes(lst: dict, parent: str | None) -> None:
        if parent and lst["axis"] == parent:
            issues.append(("syntax", "a bracketed list splits its cell on the other axis: use "
                                     f'"{"|" if parent == "rows" else "/"}" inside it'))
        for it in lst["items"]:
            if "children" in it:
                axes(it["children"], lst["axis"] or parent)

    def overflow(lst: dict) -> None:
        if len(lst["items"]) > 1:
            for end in ("start", "end"):
                total = sum(max(0.0, (it["size"].get(end, it["size"].get("start")) or 0.0))
                            for it in lst["items"] if not it["size"]["star"])
                if total > 100 + 1e-6:
                    issues.append(("overflow", f"the sizes add up to {round(total, 1):g} %"))
                    break
        for it in lst["items"]:
            if "children" in it:
                overflow(it["children"])

    axes(tree, None)
    overflow(tree)
    return tree, issues


def comic_split_leaves(lst: dict) -> int:
    return sum(comic_split_leaves(it["children"]) if it.get("children") and it["children"]["items"] else 1
               for it in lst["items"])


def _flag_off(v: str) -> bool:
    return v.strip().lower() in ("false", "no", "0", "none")


def _rect_problem(r) -> str | None:
    if not isinstance(r, dict) or not all(isinstance(r.get(k), (int, float)) and not isinstance(r.get(k), bool)
                                          for k in ("x", "y", "width", "height")):
        return "needs numeric x, y, width, height (fractions of the picture)"
    if r["width"] <= 0 or r["height"] <= 0:
        return "has no area"
    if r["x"] < -0.001 or r["y"] < -0.001 or r["x"] + r["width"] > 1.001 or r["y"] + r["height"] > 1.001:
        return "runs outside the picture (fractions 0-1)"
    return None


def check_picture_marks(r: dict, where: str, rep: Report) -> None:
    """A picture's safe area, speaker anchors and avoid zones (comics.md §9)."""
    sa = r.get("safeArea")
    if sa is not None:
        p = _rect_problem(sa)
        if p:
            rep.error(where, f"safeArea {p}")
            sa = None
    anchors, avoid = r.get("anchors"), r.get("avoid")
    if (anchors or avoid) and r.get("kind") == "table":
        rep.warn(where, "anchors/avoid are read only on bitmap and SVG pictures placed in comic panels")
    if anchors is not None:
        if not isinstance(anchors, list):
            rep.error(where, "anchors must be a list of {id, x, y, head?, face?}")
            anchors = []
        seen: set[str] = set()
        for k, a in enumerate(anchors):
            w = f"{where} anchors[{k}]"
            if not isinstance(a, dict):
                rep.error(w, "must be an object {id, x, y}")
                continue
            aid = a.get("id")
            if not isinstance(aid, str) or not re.fullmatch(r"[\w.-]+", aid):
                rep.error(w, f"id {aid!r}: a speaker id is letters, digits, _ . - (the key script lines use)")
            elif aid in ("caption", "note"):
                rep.warn(w, f"id {aid!r} is a reserved script key, never a speaker (only 'sfx' places sound effects)")
            elif aid in seen:
                rep.warn(w, f"anchor {aid!r} is marked twice in this picture (one mouth per speaker)")
            seen.add(aid if isinstance(aid, str) else "")
            if not all(isinstance(a.get(c), (int, float)) and not isinstance(a.get(c), bool) for c in ("x", "y")):
                rep.error(w, "needs numeric x and y (the mouth, fractions of the picture)")
                continue
            h = a.get("head")
            if h is not None and not (isinstance(h, dict) and all(isinstance(h.get(c), (int, float)) for c in ("x", "y"))):
                rep.error(w, "head must be {x, y}")
            if a.get("face") is not None:
                p = _rect_problem(a["face"])
                if p:
                    rep.error(w, f"face {p}")
            if sa and not (sa["x"] <= a["x"] <= sa["x"] + sa["width"] and sa["y"] <= a["y"] <= sa["y"] + sa["height"]):
                rep.warn(w, f"the mouth of {aid!r} lies outside the safe area: a crop may cut the speaker off "
                            "(comicAnchorOutsideSafeArea); grow the safe area over it")
    if avoid is not None:
        if not isinstance(avoid, list):
            rep.error(where, "avoid must be a list of {x, y, width, height}")
        else:
            for k, z in enumerate(avoid):
                p = _rect_problem(z)
                if p:
                    rep.error(f"{where} avoid[{k}]", p)


def check_comics_config(cfg: dict, where: str, rep: Report) -> None:
    """`config.comics`: keys, values, units and the ids its parts name."""
    comics = cfg.get("comics")
    if comics is None:
        return
    w = f"{where}.comics"
    if not isinstance(comics, dict):
        rep.error(w, "must be an object")
        return

    def unknown(node, keys: set[str], path: str) -> None:
        if isinstance(node, dict):
            for k in node:
                if k not in keys:
                    rep.warn(f"{path}.{k}", f"unknown key (ignored); takes {sorted(keys)}")

    def enum(node, key: str, path: str) -> None:
        if isinstance(node, dict) and key in node and node[key] not in COMICS_ENUMS[key]:
            rep.error(f"{path}.{key}", f"{node[key]!r} is not one of {sorted(COMICS_ENUMS[key])}")

    def absolute(node, key: str, path: str) -> None:
        v = node.get(key) if isinstance(node, dict) else None
        if isinstance(v, dict) and v.get("unit") in ("em", "rem"):
            rep.error(f"{path}.{key}", f"in {v['unit']} throws (no font size there): use mm or pt")

    unknown(comics, COMICS_KEYS, w)
    enum(comics, "readingDirection", w)
    enum(comics, "artDirection", w)
    gutter = comics.get("gutter")
    unknown(gutter, {"horizontal", "vertical"}, f"{w}.gutter")
    for k in ("horizontal", "vertical"):
        absolute(gutter, k, f"{w}.gutter")
    frame = comics.get("frame")
    unknown(frame, {"margins"}, f"{w}.frame")
    margins = frame.get("margins") if isinstance(frame, dict) else None
    for k in ("top", "bottom", "left", "right"):
        absolute(margins, k, f"{w}.frame.margins")
    panel_styles = [("panel", comics.get("panel"))] + [
        (f"panelStyles[{i}]", s) for i, s in enumerate(comics.get("panelStyles") or [])]
    for path, st in panel_styles:
        p = f"{w}.{path}"
        if st is None:
            continue
        if not isinstance(st, dict):
            rep.error(p, "must be an object")
            continue
        named = path != "panel"
        unknown(st, COMICS_PANEL_KEYS | ({"id", "name"} if named else set()), p)
        if named and not st.get("id"):
            rep.error(p, "a panel style without an id is dropped")
        enum(st, "borderStyle", p)
        enum(st, "fit", p)
        for k in ("borderWidth", "borderRadius"):
            absolute(st, k, p)
    lettering = comics.get("lettering")
    if lettering is not None:
        p = f"{w}.lettering"
        unknown(lettering, COMICS_LETTERING_KEYS, p)
        for k in ("writingMode", "textTransform", "joinSameSpeaker"):
            enum(lettering, k, p)
        for k in ("fontSize", "inset"):
            absolute(lettering, k, p)
        if isinstance(lettering, dict) and "dropFinalStop" in lettering and lettering["dropFinalStop"] not in ("auto", True, False):
            rep.error(f"{p}.dropFinalStop", "is 'auto', true or false")
    balloon_ids: list[str] = []
    for i, st in enumerate(comics.get("balloonStyles") or []):
        p = f"{w}.balloonStyles[{i}]"
        if not isinstance(st, dict) or not st.get("id"):
            rep.error(p, "a balloon style without an id is dropped")
            continue
        if st["id"] in balloon_ids:
            rep.warn(p, f"balloon style {st['id']!r} is declared twice (the first one wins)")
        balloon_ids.append(st["id"])
        unknown(st, COMICS_BALLOON_KEYS, p)
        for k in ("shape", "tail", "target", "position", "align", "textTransform"):
            enum(st, k, p)
    known_styles = COMIC_BALLOON_STYLES | set(balloon_ids)
    cast_ids: set[str] = set()
    for i, c in enumerate(comics.get("cast") or []):
        p = f"{w}.cast[{i}]"
        if not isinstance(c, dict) or not c.get("id"):
            rep.error(p, "a cast entry without an id is dropped")
            continue
        if c["id"] in cast_ids:
            rep.warn(p, f"cast id {c['id']!r} is listed twice")
        cast_ids.add(c["id"])
        unknown(c, COMICS_CAST_KEYS, p)
        if c.get("balloonStyle") and c["balloonStyle"] not in known_styles:
            rep.warn(f"{p}.balloonStyle", f"{c['balloonStyle']!r} is not a balloon style (the speech style is used)")


def _comic_point_ok(v: str) -> bool:
    return bool(COMIC_POINT_RE.match(v))


def _check_comic_fence_attrs(kind: str, attrs: dict[str, str], where: str, panel_styles: set[str], rep: Report) -> None:
    allowed = COMIC_PAGE_ATTRS if kind == "page" else COMIC_STRIP_ATTRS
    for k, v in attrs.items():
        if k not in allowed:
            hint = " (spreads are pages: :::page{spread})" if k == "spread" else ""
            rep.warn(where, f":::{kind} attribute {k!r} is ignored{hint}; it takes {sorted(allowed)}")
    if "gutter" in attrs:
        parts = attrs["gutter"].split()
        if not 1 <= len(parts) <= 2 or not all(COMIC_DIM_RE.match(x) for x in parts):
            rep.warn(where, f"gutter={attrs['gutter']!r} is not one or two lengths (4mm, \"5mm 2mm\"; bare numbers are mm): "
                            "comics.gutter is used")
    for k in ("direction", "dir"):
        if k in attrs and attrs[k].strip().lower() not in ("ltr", "rtl", "auto"):
            rep.warn(where, f"{k}={attrs[k]!r} is not ltr or rtl (ignored)")
    if attrs.get("style") and attrs["style"] not in panel_styles:
        rep.warn(where, f"panel style {attrs['style']!r} is not in comics.panelStyles {sorted(panel_styles)} (the default panel is used)")
    if kind == "strip":
        if "span" in attrs and attrs["span"] not in ("column", "page"):
            rep.warn(where, f"span={attrs['span']!r} is read as column (column | page)")
        if "placement" in attrs and attrs["placement"] not in ("here", "top", "bottom", "auto"):
            rep.warn(where, f"placement={attrs['placement']!r} is read as here (here | top | bottom | auto)")
        if "height" in attrs and not COMIC_DIM_RE.match(attrs["height"]):
            rep.warn(where, f"height={attrs['height']!r} is not a length (bare numbers are mm): ignored")
        if "aspect" in attrs and not re.fullmatch(r"\s*[0-9]*\.?[0-9]+\s*(?:[/:]\s*[0-9]*\.?[0-9]+)?\s*", attrs["aspect"]):
            rep.warn(where, f"aspect={attrs['aspect']!r} is not a ratio (3, 4/1, 4:1): ignored")


def _check_panel_attrs(attrs: dict[str, str], where: str, ctx: dict, rep: Report) -> None:
    for k, v in attrs.items():
        if k not in COMIC_PANEL_ATTRS:
            rep.warn(where, f"::panel attribute {k!r} is ignored; it takes {sorted(COMIC_PANEL_ATTRS)}")
    for key in ("art", "pop"):
        rid = attrs.get(key, "").strip()
        if not rid:
            continue
        ctx["arts"].add(rid)
        kind = ctx["res_kinds"].get(rid, "missing")
        if kind == "missing":
            rep.error(where, f"{key}={rid!r} is not a resource: the panel is set empty (comicUnknownArt)")
        elif kind not in ("bitmap", "svg"):
            rep.error(where, f"{key}={rid!r} is a {kind}: panels show bitmap or SVG pictures (comicUnknownArt)")
    if "fit" in attrs and attrs["fit"] not in ("cover", "contain"):
        rep.warn(where, f"fit={attrs['fit']!r} is ignored (cover | contain)")
    if "focus" in attrs and not _comic_point_ok(attrs["focus"]):
        rep.warn(where, f'focus={attrs["focus"]!r} is not a point ("x% y%"): ignored')
    if attrs.get("style") and attrs["style"] not in ctx["panel_styles"]:
        rep.warn(where, f"panel style {attrs['style']!r} is not in comics.panelStyles {sorted(ctx['panel_styles'])} "
                        "(the page's style is used)")
    if "border" in attrs and attrs["border"].strip() != "none" and not COMIC_DIM_RE.match(attrs["border"]):
        rep.warn(where, f"border={attrs['border']!r} is not none or a length (0.5mm, 1pt)")
    if "bg" in attrs:
        bg = attrs["bg"].strip()
        if not (HEX_RE.match(bg) or bg in ("none", "transparent") or bg in ctx["palette"]):
            rep.warn(where, f"bg={bg!r} is neither #hex, none nor a colorPalette id (the style's background is used)")
    if "inset" in attrs:
        parts = attrs["inset"].replace(",", " ").split()
        try:
            ok = len(parts) == 4 and all(float(x.rstrip("%")) >= 0 for x in parts) and float(parts[2].rstrip("%")) > 0 \
                and float(parts[3].rstrip("%")) > 0
        except ValueError:
            ok = False
        if not ok:
            rep.warn(where, f'inset={attrs["inset"]!r} is not "x y w h" in percent of the previous panel: the panel is not set')
    if "pad" in attrs:
        parts = attrs["pad"].replace(",", " ").split()
        if not 1 <= len(parts) <= 4 or not all(re.fullmatch(r"-?[0-9]*\.?[0-9]+\s*%", x) or COMIC_DIM_RE.match(x) for x in parts):
            rep.warn(where, f'pad={attrs["pad"]!r} is not 1-4 lengths or percentages (top end bottom start): ignored')
    if "bleed" in attrs:
        v = attrs["bleed"].strip().lower()
        if v not in ("", "true", "all", "false", "none", "no") and not set(re.split(r"[\s,]+", v)) <= COMIC_SIDES:
            rep.warn(where, f'bleed={attrs["bleed"]!r}: sides are {sorted(COMIC_SIDES)}')


def _check_script_line(head: re.Match, text: str, where: str, ctx: dict, rep: Report) -> None:
    key, blob = head.group(1), head.group(2)
    if blob is not None:
        tokens = parse_attrs_strict(blob) if blob.strip() else []
        if tokens is None:
            rep.warn(where, f"{{{blob}}} does not read as attributes (key=value or flags, spaces between)")
            tokens = []
        attrs = {}
        for k, v, flag, _ in tokens:
            if flag and k not in COMIC_SCRIPT_KEYS:
                if k not in ctx["balloon_styles"]:
                    rep.warn(where, f"{{{k}}} names no balloon style (comicUnknownBalloonStyle): the default style of "
                                    f"{key!r} is used; styles: {sorted(ctx['balloon_styles'])}")
                continue
            attrs[k] = v
        st = attrs.get("style", "").strip()
        if st and st not in ctx["balloon_styles"]:
            rep.warn(where, f"style={st!r} names no balloon style (comicUnknownBalloonStyle)")
        at = attrs.get("at", "").strip()
        if "at" in attrs and at not in COMIC_POSITIONS and not _comic_point_ok(at):
            rep.warn(where, f'at={at!r} is neither "x% y%" nor {sorted(COMIC_POSITIONS)}: ignored')
        if "to" in attrs and not _comic_point_ok(attrs["to"]):
            rep.warn(where, f'to={attrs["to"]!r} is not a point ("x% y%"): ignored')
        if "tail" in attrs and attrs["tail"].strip() not in COMIC_TAILS:
            rep.warn(where, f"tail={attrs['tail']!r} is ignored ({sorted(COMIC_TAILS)})")
        for k in ("rotate", "size"):
            if k in attrs:
                try:
                    float(re.sub(r"(?i)(deg|°|x|×)$", "", attrs[k].strip()))
                except ValueError:
                    rep.warn(where, f"{k}={attrs[k]!r} is not a number: ignored")
        if "color" in attrs:
            c = attrs["color"].strip()
            if not (HEX_RE.match(c) or c in ctx["palette"]):
                rep.warn(where, f"color={c!r} is neither #hex nor a colorPalette id: ignored")
        if attrs.get("font"):
            ctx["faces"].add(attrs["font"].strip())
    if key not in COMIC_RESERVED_KEYS:
        ctx["speakers"].setdefault(key, where)
    if re.search(r"\[\^[\w.:-]+\]", text):
        rep.warn(where, "footnote markers in a balloon print as written: balloons read no notes")
    if ":ref{" in text:
        rep.warn(where, ":ref in a balloon is not read (prints as written)")
    if re.search(r"(?<!\\)\$[^$]+\$", text):
        rep.warn(where, "$math$ in a balloon is not typeset")


def check_comic_block(name: str, kind: str, attrs: dict[str, str], body: list[tuple[int, str]], fence_line: int,
                      ctx: dict, rep: Report) -> None:
    """One `:::page` / `:::strip` block: its attributes, split, panels and
    script lines (comics.md §3-§7)."""
    where = f"{name}:{fence_line}"
    _check_comic_fence_attrs(kind, attrs, where, ctx["panel_styles"], rep)
    split = attrs.get("split")
    cells = None
    if split is not None:
        tree, issues = parse_comic_split(split)
        for k, msg in issues:
            if k == "overflow":
                rep.warn(where, f'split="{split}": {msg}, scaled down to fit (comicSplitOverflow)')
            else:
                rep.error(where, f'split="{split}" cannot be read as written: {msg} (comicSplitSyntax)')
        cells = comic_split_leaves(tree)
    panels = 0
    flow_panels = 0
    seen_panel = False
    arts: list[str] = []
    open_item = False
    for ln, raw in body:
        line = raw.strip()
        w = f"{name}:{ln}"
        if not line or (line.startswith("<!--") and line.endswith("-->")):
            continue
        if line.startswith("::panel"):
            m = COMIC_PANEL_RE.match(line)
            if not m:
                rep.error(w, "malformed ::panel line: ::panel{attrs} alone on its line")
                continue
            pattrs = parse_attrs(m.group(1))
            _check_panel_attrs(pattrs, w, ctx, rep)
            panels += 1
            if not pattrs.get("inset"):
                flow_panels += 1
            elif panels == 1:
                rep.warn(w, "an inset panel is laid over the previous panel: the first panel cannot be one")
            arts.append(pattrs.get("art", ""))
            seen_panel = True
            open_item = False
            continue
        if line.startswith(":::"):
            rep.error(w, f"{line} inside a :::{kind} block: comic blocks hold only ::panel lines and script lines "
                         "(close the block first)")
            continue
        if open_item and re.match(r"^(?: {2,}|\t)", raw):
            continue  # continuation of the balloon above
        head = COMIC_SCRIPT_RE.match(line)
        if not seen_panel:
            rep.warn(w, "text before the first ::panel is lettered as a caption of panel 1 (comicStrayText)")
        if not head:
            rep.warn(w, "not a script line (key: text) and no continuation (indent it by two spaces): lettered as "
                        "a caption (comicStrayText)")
            open_item = True
            continue
        _check_script_line(head, line[head.end():], w, ctx, rep)
        open_item = True
    if panels == 0:
        rep.warn(where, f":::{kind} has no ::panel line: its text is lettered as one caption")
    elif cells is not None and flow_panels != cells:
        more = "are not set" if flow_panels > cells else "stay empty"
        rep.warn(where, f"{flow_panels} panels for {cells} cells of the split: the last "
                        f"{abs(flow_panels - cells)} {'panels' if flow_panels > cells else 'cells'} {more} (comicPanelCount)")
    ctx["blocks"].append((where, kind, split or "", tuple(arts)))


def check_comic_edition(lang: str, cfg: dict, ctx: dict, resources: list[dict], fonts: list[dict], rep: Report) -> None:
    """Book-level comic checks of one edition: faces, lettering size and
    speakers without anchors."""
    where = f"comics ({lang})"
    if not ctx["blocks"]:
        if "comics" in cfg:
            rep.info(where, "config.comics is set but no chapter has a :::page or :::strip")
        return
    lettering, sfx = comic_faces(cfg)
    variants = {f.get("name"): f.get("variants", []) for f in fonts}
    for fam, role in ((lettering, "the lettering face (comics.lettering.fontFamily)"),
                      (sfx, "the sound-effect face (the sfx balloon style)")):
        if fam not in variants:
            rep.warn(where, f"{fam!r}, {role}, is not bundled: the PDF and headless renders need its files in "
                            "`fonts` (the browser alone fetches Google Fonts)")
        elif not any((v.get("weight") or 400) >= 600 for v in variants[fam]) and f"bold {fam}" not in rep.once:
            rep.once.add(f"bold {fam}")
            rep.info(where, f"{fam!r} has no bold file: the shout and sfx styles ask for bold; list its file again "
                            "with weight 700 so no renderer fakes one")
    for fam in sorted(ctx["faces"] - set(variants)):
        rep.warn(where, f"font={fam!r} in a script line is not bundled")
    lt = (cfg.get("comics") or {}).get("lettering") if isinstance(cfg.get("comics"), dict) else None
    if not (isinstance(lt, dict) and lt.get("fontSize")) and "comic size" not in rep.once:
        rep.once.add("comic size")
        rep.info(where, "comics.lettering.fontSize is the default 7.5 pt (a comic-book size): A4 albums usually letter "
                        "at 9-10 pt; measure the source's lettering")
    marked = {a.get("id") for r in resources for a in (r.get("anchors") or []) if isinstance(a, dict)}
    cast = {c.get("id") for c in ((cfg.get("comics") or {}).get("cast") or []) if isinstance(c, dict)} \
        if isinstance(cfg.get("comics"), dict) else set()
    if not marked:
        rep.info(where, "no picture marks speaker anchors: every tail points to the nearest panel border; mark the "
                        "mouths (resource anchors, comics.md §9)")
        return
    for speaker, w in ctx["speakers"].items():
        if speaker not in marked and speaker not in cast:
            rep.info(w, f"speaker {speaker!r} has no anchor in any picture and no cast entry: its tails point off the "
                        "panel (comicUnknownSpeaker); a renamed key? Speaker ids are the same in every language")


def compare_comic_editions(editions: dict[str, list], rep: Report) -> None:
    """Every edition sets the same comic geometry: the same blocks, splits
    and panel pictures, in the same order (only the words change)."""
    if len(editions) < 2:
        return
    base_lang, base = next(iter(editions.items()))
    for lang, blocks in editions.items():
        if lang == base_lang:
            continue
        if len(blocks) != len(base):
            rep.warn(f"comics ({lang})", f"{len(blocks)} comic blocks, {base_lang} has {len(base)}: every edition sets "
                                         "the same pages; only the words change")
        for (w, kind, split, arts), (bw, bkind, bsplit, barts) in zip(blocks, base):
            if kind != bkind or split.replace(" ", "") != bsplit.replace(" ", ""):
                rep.warn(w, f":::{kind}{{split=\"{split}\"}} differs from {base_lang} ({bw}: :::{bkind}{{split=\"{bsplit}\"}}): "
                            "the geometry is the same in every language")
            elif arts != barts:
                rep.warn(w, f"the panels' pictures differ from {base_lang} ({bw}): {list(arts)} vs {list(barts)}")


def resource_kind(r: dict) -> str | None:
    """A manifest resource's kind, as the loader infers it from its file."""
    if r.get("kind"):
        return r["kind"]
    f = r.get("file") or ""
    return "svg" if f.lower().endswith(".svg") else "bitmap" if f else None


def new_comic_ctx(cfg: dict, resources: list[dict], ids: dict[str, set[str]]) -> dict:
    """What the comic checks of one edition share and collect."""
    balloons, panels = comic_style_ids(cfg)
    return {"res_kinds": {r.get("id"): resource_kind(r) for r in resources}, "balloon_styles": balloons,
            "panel_styles": panels, "palette": ids.get("palette", set()), "speakers": {}, "arts": set(),
            "faces": set(), "blocks": []}


def style_ids(cfg: dict) -> dict[str, set[str]]:
    def ids(key: str, default: set[str]) -> set[str]:
        v = cfg.get(key)
        return {x.get("id") for x in v if isinstance(x, dict)} if isinstance(v, list) else default

    return {
        "callout": ids("calloutStyles", {"note"}),
        "paragraphs": ids("paragraphStyles", set()),
        "heading": ids("headingStyles", set()),
        "chip": ids("chipStyles", {"chip"}),
        "palette": ids("colorPalette", {"main-color"}),
        "types": ids("resourceTypes", {"figure", "table"}),
        "tables": ids("tableStyles", set()),
    }


def _fence_closes(lines: list[str], i: int) -> bool:
    """Whether the `$$` fence on line i closes before the next blank line."""
    for line in lines[i + 1:]:
        if not line.strip():
            return False
        if line.strip() == "$$":
            return True
    return False


def index_levels(value: str | None) -> list[str]:
    return [x.strip() for x in (value or "").split("!") if x.strip()]


def index_key(levels: list[str]) -> tuple[str, ...]:
    """Levels compared the way readers see them: no marks, no case."""
    return tuple(re.sub(r"[*_^~\\]", "", x).casefold() for x in levels)


def collect_index_marks(line: str, where: str, rep: Report, index: dict) -> None:
    """Record the :index marks of one text line in `index` (book-level)."""
    if INDEX_AFTER_COLON_RE.search(line):
        rep.error(where, "a mark right after a colon (word::index{…}) is not read: put it before the colon")
    for m in INDEX_MARK_RE.finditer(line):
        if m.group(1) is None and m.group(2) is None:
            continue  # a bare ":index" word
        a = parse_attrs(m.group(2))
        path = index_levels(a.get("term"))
        if not path and m.group(1):
            plain = re.sub(r"[*_^~]|\\(.)", r"\1", m.group(1)).strip()
            path = [plain] if plain else []
        path += index_levels(a.get("sub"))
        name = a.get("index", "").strip()
        if not path:
            rep.warn(where, ":index mark with no term indexes nothing (indexMarkInvalid)")
            continue
        index["marks"].append((name, path, a, where))
        # The key a Japanese index files the last level by (indexDirective.ts):
        # yomi, else the kana readings of a visible mark's ruby, else sort.
        own_text = m.group(1) is not None and "term" not in a and "sub" not in a
        reading = a.get("yomi") or a.get("reading") or (ruby_reading(m.group(1)) if own_text else None) or a.get("sort")
        index.setdefault("readings", {}).setdefault((name, index_key(path)), []).append((reading, where))


COMPACT_RUBY_RE = re.compile(r"\{([^{}|\n]+)\|([^{}\n]+)\}")


def ruby_reading(text: str) -> str | None:
    """A mark's text with each compact ruby base replaced by its kana
    reading (`{東京|とう|きょう}` → とうきょう); None when a reading is not
    kana, or a kanji is left unread."""
    ok = True

    def read(m: re.Match) -> str:
        nonlocal ok
        r = m.group(2).replace("|", "")
        if not re.fullmatch("[ぁ-ゟ゠-ヿ]+", r):
            ok = False
        return r

    out = COMPACT_RUBY_RE.sub(read, text)
    return out if ok and out != text and not HAN_RE.search(out) else None


def check_index_readings(index: dict, rep: Report) -> None:
    """A Japanese index files by reading (gojūon, JIS X 4061), and no program
    can read kanji reliably: an entry whose key still holds a kanji files
    after the kana with no head (indexReadingMissing). One warning per index,
    with the first few terms."""
    readings = index.get("readings", {})
    seen: dict[tuple, str] = {}
    for name, path, _, where in index["marks"]:
        k = index_key(path)
        for n in range(1, len(k) + 1):
            seen.setdefault((name, k[:n]), where)
    unread: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for (name, k), where in seen.items():
        if any(r for r, _ in readings.get((name, k), [])):
            continue
        term = COMPACT_RUBY_RE.sub(r"\1", k[-1])
        if HAN_RE.search(term):
            unread[name].append(("!".join(COMPACT_RUBY_RE.sub(r"\1", x) for x in k), where))
    for name, items in unread.items():
        sample = "、".join(t for t, _ in items[:6]) + ("…" if len(items) > 6 else "")
        one = len(items) == 1
        rep.warn(items[0][1], f"{len(items)} {'entry' if one else 'entries'} of the {name or 'main'} index "
                              f"{'holds' if one else 'hold'} kanji and {'has' if one else 'have'} no reading ({sample}): "
                              f"{'it files' if one else 'they file'} after the kana with no head (indexReadingMissing); "
                              "give each mark yomi=\"…\" in kana, or kana ruby on its own text ({東京|とう|きょう})")


def check_index(index: dict, rep: Report, lang: str, japanese: bool = False) -> None:
    """Book-level checks of the index marks and :::index directives."""
    if japanese:
        check_index_readings(index, rep)
    entries: dict[str, set[tuple]] = defaultdict(set)
    ranges: Counter = Counter()
    first: dict[tuple, str] = {}
    for name, path, a, where in index["marks"]:
        k = index_key(path)
        for n in range(1, len(k) + 1):
            entries[name].add(k[:n])
        r = a.get("range")
        if r in ("start", "end"):
            ranges[(name, k)] += 1 if r == "start" else -1
            first.setdefault((name, k), where)
        elif r is not None:
            rep.warn(where, f'range={r!r}: use range="start" / range="end"')
    for (name, k), n in ranges.items():
        if n:
            rep.warn(first[(name, k)], f"index range for {'!'.join(k)!r} has {abs(n)} unmatched {'start' if n > 0 else 'end'} mark(s) (indexRangeUnclosed)")
    for name, path, a, where in index["marks"]:
        for kind in ("see", "seealso"):
            if a.get(kind) and index_key(index_levels(a[kind])) not in entries[name]:
                rep.warn(where, f"{kind}={a[kind]!r} is not an entry of the index (indexSeeUnknown)")
    names = {n for n, *_ in index["marks"]}
    for n in sorted(names - index["printed"]):
        rep.warn(f"index {n or 'main'}", f"{sum(1 for x in index['marks'] if x[0] == n)} marks but no :::index"
                 + (f'{{index="{n}"}}' if n else "") + f" prints them ({lang})")
    for n in sorted(index["printed"] - names):
        rep.warn(f"index {n or 'main'}", f":::index prints an index with no marks ({lang})")


def check_markdown(name: str, text: str, idx: int, ids: dict[str, set[str]], res_ids: set[str], rep: Report,
                   embedded: set[str], referenced: set[str], index: dict | None = None,
                   anchors: set[str] | None = None, comic_ctx: dict | None = None) -> None:
    anchors = anchors or set()
    if comic_ctx is None:
        comic_ctx = new_comic_ctx({}, [], ids)
    if index is None:
        index = {"marks": [], "printed": set()}
    lines = text.split("\n")
    n = 0
    if lines and lines[0].strip() == "---":
        end = next((i for i in range(1, len(lines)) if lines[i].strip() == "---"), None)
        if end is not None:
            if idx > 0:
                rep.warn(f"{name}:1", "front matter only counts in the first chapter; this one is ignored")
            n = end + 1
    stack: list[tuple[str, int]] = []
    prev_nonblank = False
    prev_kind = ""
    in_math = False
    in_refs = False  # inside a :::references or :::verse block: its body is not paragraphs
    fn_cited: dict[str, str] = {}
    fn_defined: dict[str, str] = {}
    comic: dict | None = None  # an open :::page / :::strip block, read raw to its closing :::
    for i in range(n, len(lines)):
        raw = lines[i]
        line = raw.strip()
        where = f"{name}:{i + 1}"
        if comic is not None:
            if line == ":::":
                check_comic_block(name, comic["kind"], comic["attrs"], comic["body"], comic["line"], comic_ctx, rep)
                comic = None
                prev_nonblank, prev_kind = True, "fence"
            else:
                comic["body"].append((i + 1, raw))
            continue
        if in_math:
            if line == "$$":
                in_math = False
                prev_nonblank, prev_kind = True, "math"
            continue
        if in_refs:
            if line == ":::":
                in_refs = False
                prev_nonblank, prev_kind = True, "fence"
            continue
        if not line:
            prev_nonblank, prev_kind = False, ""
            continue
        if not line.startswith((":::", "::resource")) and ":index" in line:
            collect_index_marks(re.sub(r"`[^`\n]+`", "", line), where, rep, index)
        # CommonMark habits
        if line.startswith("```") or line.startswith("~~~"):
            rep.error(where, "code fences are not supported (they print literally): use :::paragraphs{style=\"code\"}")
        if re.match(r"^\|.*\|$", line) and not (i > 0 and re.match(r"^\|.*\|$", lines[i - 1].strip())):
            rep.error(where, "pipe tables are not supported: tables are resources (kind \"table\") cited with :ref / ::resource")
        if re.fullmatch(r"(-{3,}|\*{3,}|_{3,})", line):
            rep.error(where, "horizontal rules are not supported: use a paragraph style (asterism) or an ornament resource")
        if re.search(r"</?[a-zA-Z][a-zA-Z0-9]*(\s[^>]*)?>", line) or re.search(r"&[a-z]+;|&#\d+;", line):
            rep.warn(where, "HTML tags/entities print literally: write the Unicode characters")
        if re.search(r"!\[[^\]]*\]\([^)]*\)", line):
            rep.error(where, "inline images are removed: make the picture a resource and cite it")
        if "~~" in line:
            rep.warn(where, "~~strike~~ is not strikethrough in Postext (it becomes a subscript)")
        # math blocks
        if line == "$$":
            # A fence closed before the next blank line interrupts the
            # paragraph above it (postext >= 1.5); an open one is swallowed.
            if prev_nonblank and prev_kind == "para" and not _fence_closes(lines, i):
                rep.error(where, "display math glued to the paragraph above, with no closing $$ before the next blank line, is swallowed into it: add a blank line above it")
            in_math = True
            continue
        # resource embeds
        if line.startswith("::resource"):
            m = RESOURCE_RE.match(line)
            if not m:
                rep.error(where, '::resource must be exactly ::resource{id="…"} (double quotes, no other attribute)')
            else:
                embedded.add(m.group(1))
                if m.group(1) not in res_ids:
                    rep.error(where, f"unknown resource id {m.group(1)!r}")
                if prev_nonblank and prev_kind in ("para", "list"):
                    rep.error(where, "::resource glued to the text above is swallowed into it: add a blank line")
            prev_nonblank, prev_kind = True, "resource"
            continue
        # comic blocks: raw bodies up to the closing :::
        cm = COMIC_FENCE_RE.match(line)
        if cm:
            if stack:
                rep.warn(where, f":::{cm.group(1)} inside :::{stack[-1][0]} is not read as a comic: comic pages and "
                                "strips sit at the top level of a chapter")
            comic = {"kind": cm.group(1), "attrs": parse_attrs(cm.group(2)), "body": [], "line": i + 1}
            continue
        if line.startswith("::panel"):
            rep.warn(where, "::panel outside a :::page or :::strip block prints as text")
        # fences
        if line.startswith(":::"):
            if line == ":::":
                if not stack:
                    rep.warn(where, "stray ::: with no open container prints literally")
                else:
                    stack.pop()
                prev_nonblank, prev_kind = True, "fence"
                continue
            m = FENCE_RE.match(line)
            if not m:
                rep.error(where, "malformed fence (lowercase name, optional {attrs}, nothing after it on the line)")
                continue
            fname, attrs = m.group(1), parse_attrs(m.group(2))
            if fname in KNOWN_CONTAINERS:
                if fname == "callout":
                    t = attrs.get("type")
                    if t is not None and t not in ids["callout"]:
                        rep.error(where, f"callout type {t!r} is not in calloutStyles {sorted(ids['callout'])}")
                    for k, allowed in (("span", {"column", "page", "side"}), ("placement", {"here", "auto", "top", "bottom", "fixed"})):
                        if k in attrs and attrs[k] not in allowed:
                            rep.error(where, f"callout {k}={attrs[k]!r} is ignored (allowed: {sorted(allowed)})")
                    if "columns" in attrs:
                        # postext >= 1.18: a floated box across several columns.
                        if not re.fullmatch(r"[1-9]\d*", attrs["columns"]):
                            rep.error(where, f"callout columns={attrs['columns']!r} is not a whole number from 1 (read as 1)")
                        elif attrs.get("placement") in ("here", "fixed") or attrs.get("span") in ("page", "side"):
                            rep.warn(where, "callout columns only applies to a floated span='column' box (placement auto/top/bottom)")
                    if "title" in attrs and re.search(r"\*\*|\*[^*]+\*", attrs["title"]):
                        rep.warn(where, "callout titles are plain text: ** / * print literally")
                elif fname == "paragraphs":
                    s = attrs.get("style")
                    # align / indent / endIndent alone set the text around it
                    # (地付き is {align=end}, 地から1字上げ {align=end endIndent=1}).
                    if not s and not any(k in attrs for k in ("align", "indent", "endIndent")):
                        rep.error(where, ":::paragraphs needs style=\"…\" (or align / indent / endIndent)")
                    elif s and s not in ids["paragraphs"]:
                        rep.error(where, f"paragraph style {s!r} is not in paragraphStyles {sorted(ids['paragraphs'])}")
                elif fname == "part":
                    for pid in re.findall(r"([A-Za-z0-9_-]+)\s*[=:]\s*#?[0-9a-fA-F]{3,8}", attrs.get("palette", "")):
                        if pid not in ids["palette"]:
                            rep.warn(where, f"part palette id {pid!r} is not in colorPalette (nothing will be recoloured)")
                elif fname == "columns":
                    if not any(s[0] == "callout" for s in stack):
                        rep.warn(where, ":::columns only works inside a :::callout (ignored here)")
                elif fname == "paper":
                    if any(s[0] == "callout" for s in stack):
                        rep.warn(where, ":::paper inside a callout is ignored (a stock covers whole pages)")
                    paper_enums = {
                        "type": {"uncoated", "bookWove", "coatedMatte", "coatedSilk", "coatedGloss", "bible", "newsprint", "cardStock", "board"},
                        "finish": {"auto", "uncoated", "matte", "silk", "gloss"},
                        "texture": {"auto", "smooth", "vellum", "wove", "laid", "linen", "felt"},
                        "showThrough": {"true", "false", ""},
                    }
                    for k, v in attrs.items():
                        if k in paper_enums:
                            if v not in paper_enums[k]:
                                rep.warn(where, f"paper {k}={v!r} is dropped (allowed: {sorted(paper_enums[k] - {''})})")
                        elif k in ("grammage", "bulk", "textureStrength"):
                            try:
                                n = float(v)
                                ok = 0 <= n <= 2 if k == "textureStrength" else n > 0
                            except ValueError:
                                ok = False
                            if not ok:
                                rep.warn(where, f"paper {k}={v!r} is dropped (a positive number{', 0 to 2' if k == 'textureStrength' else ''})")
                        elif k == "shade":
                            if not re.fullmatch(r"#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})", v) and v not in ids["palette"]:
                                rep.warn(where, f"paper shade {v!r} is neither a #rrggbb colour nor a colorPalette id (dropped)")
                        elif k != "id":
                            rep.warn(where, f"paper attribute {k!r} is unknown (dropped)")
                stack.append((fname, i + 1))
            elif fname in KNOWN_DIRECTIVES:
                if fname != "space" and any(s[0] == "callout" for s in stack):
                    rep.warn(where, f":::{fname} inside a callout is ignored")
                if fname == "space" and "lines" in attrs:
                    try:
                        ok = 0 < float(attrs["lines"]) <= 20
                    except ValueError:
                        ok = False
                    if not ok:
                        rep.warn(where, f"space lines {attrs['lines']!r} is not a number in (0, 20]; one line is used")
                if fname == "pagebreak" and "parity" in attrs and attrs["parity"] not in ("odd", "even", "always-odd", "always-even"):
                    rep.warn(where, f"pagebreak parity {attrs['parity']!r} means no parity")
                if fname == "index":
                    index["printed"].add(attrs.get("index", "").strip())
                if fname == "references":
                    # BibTeX / CSL-JSON / CSL-YAML up to the closing ::: (postext >= 1.12).
                    if attrs.get("format") and attrs["format"] not in ("bibtex", "biblatex", "bib", "csl-json", "json", "csl-yaml"):
                        rep.warn(where, f"references format {attrs['format']!r} is read as CSL-YAML")
                    in_refs = True
                if fname == "verse":
                    # A poem: one bayt a line up to the closing ::: (postext >= 1.15).
                    in_refs = True
                if fname == "numbering" and "format" in attrs and attrs["format"] not in NUMBERING_FORMATS | NUMBERING_TOKENS:
                    rep.error(where, f"numbering format {attrs['format']!r} is invalid")
            else:
                rep.error(where, f":::{fname} is not a Postext container or directive (prints literally). "
                                 f"Containers: {sorted(KNOWN_CONTAINERS)}; directives: {sorted(KNOWN_DIRECTIVES - COMIC_BLOCKS)}; "
                                 f"comic blocks: {sorted(COMIC_BLOCKS)}")
            prev_nonblank, prev_kind = True, "fence"
            continue
        # headings
        hm = HEADING_RE.match(line)
        if hm:
            title = INDEX_MARK_RE.sub("", hm.group(2))
            _, attrs = split_heading_attrs(title)
            if attrs is not None:
                s = attrs.get("style")
                if s and s not in ids["heading"]:
                    rep.error(where, f"heading style {s!r} is not in headingStyles {sorted(ids['heading'])}")
                if "numbered" in attrs:
                    rep.warn(where, "{numbered=…} is not a heading attribute: use a headingStyles entry with numbered:false")
            elif re.search(r"\{[^{}]*\}\s*$", title):
                rep.warn(where, "trailing {…} that does not parse as attributes, so it prints in the title (commas, "
                                "a value holding }, a flag glued to the title?)")
            if FOOTNOTE_MARK_RE.search(title):
                rep.warn(where, "[^id] in a heading prints as written: cite the note from the text")
            if ":chip[" in title:
                rep.warn(where, ":chip is not processed in headings (prints literally)")
            if re.search(r"\*\*|(?<!\\)\*\w|(?<!\\)_\w", re.sub(r"\{[^{}]*\}\s*$", "", title)):
                rep.info(where, "inline marks in headings are stripped (headings are plain text)")
            prev_nonblank, prev_kind = True, "heading"
            continue
        # lists
        if ORDERED_RE.match(raw) or UNORDERED_RE.match(raw):
            if ORDERED_RE.match(raw) and prev_nonblank and prev_kind == "para":
                rep.error(where, "an ordered list glued to a paragraph is swallowed into it: add a blank line")
            if re.match(r"^\s*\d{4}[.)]\s", raw) and prev_kind != "list":
                rep.warn(where, "a paragraph starting with a year + '.' becomes a list item: prefix U+2060 (word joiner)")
            if UNORDERED_RE.match(raw) and re.match(r"^\s*-\s+[A-ZÁÉÍÓÚÑ¿¡«“]", raw) and prev_kind != "list" and not prev_nonblank:
                rep.info(where, "a line starting with '- ' is a bullet; for a dialogue dash use '—'")
            prev_nonblank, prev_kind = True, "list"
        elif prev_kind == "list" and prev_nonblank and raw.startswith(" "):
            rep.warn(where, "list items are one line: this indented continuation becomes a separate paragraph")
            prev_nonblank, prev_kind = True, "para"
        elif line.startswith(">"):
            prev_nonblank, prev_kind = True, "quote"
        else:
            prev_nonblank, prev_kind = True, "para" if prev_kind != "list" else "para"
        # inline checks (lists, quotes, paragraphs)
        body = re.sub(r"\\.", "", line)
        dm = FOOTNOTE_DEF_RE.match(body) if prev_kind == "para" else None
        if dm:
            if dm.group(1) in fn_defined:
                rep.warn(where, f"footnote {dm.group(1)!r} is defined twice (the first definition wins)")
            fn_defined.setdefault(dm.group(1), where)
        for m in FOOTNOTE_MARK_RE.finditer(body[dm.end():] if dm else body):
            fn_cited.setdefault(m.group(1), where)
        body_nomath = re.sub(r"\$[^$]*\$", "", body)
        if body.count("$") % 2 == 1:
            rep.warn(where, "odd number of unescaped $: a lone $ opens math (write \\$ for currency)")
        if re.search(r"[A-Za-z0-9]_[A-Za-z0-9]", body_nomath):
            rep.info(where, "intraword underscore italicises (snake_case, URLs): escape as \\_")
        for m in re.finditer(r":ref\{([^}]*)\}", line):
            a = parse_attrs(m.group(1))
            rid = a.get("id")
            if not rid:
                rep.error(where, ":ref without id prints literally")
            else:
                referenced.add(rid)
                if not ref_target_known(rid, res_ids, anchors):
                    rep.error(where, f":ref to unknown resource, heading id or anchor {rid!r}")
            if a.get("style") and a["style"] not in ("default", "number", "full", "title", "page", "pageNumber"):
                rep.warn(where, f":ref style {a['style']!r} is ignored")
        for m in re.finditer(r":chip\[(?:\\.|[^\]\\\n])+\](\{[^}\n]*\})?", line):
            st = parse_attrs((m.group(1) or "{}")[1:-1]).get("style")
            if st and st not in ids["chip"]:
                rep.error(where, f"chip style {st!r} is not in chipStyles {sorted(ids['chip'])}")
        for m in re.finditer(r":swatch\{([^}]*)\}", line):
            col = parse_attrs(m.group(1)).get("color", "")
            if not col:
                rep.error(where, ":swatch needs color=")
            elif not re.fullmatch(r"#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}", col) and col not in ids["palette"]:
                rep.warn(where, f"swatch colour {col!r} is neither #hex nor a palette id (draws an empty outline)")
    for fname, ln in stack:
        rep.error(f"{name}:{ln}", f":::{fname} is never closed")
    if comic is not None:
        rep.error(f"{name}:{comic['line']}", f":::{comic['kind']} is never closed: the rest of the chapter is read as its body")
        check_comic_block(name, comic["kind"], comic["attrs"], comic["body"], comic["line"], comic_ctx, rep)
    for fid, w in fn_cited.items():
        if fid not in fn_defined:
            rep.warn(w, f"footnote [^{fid}] has no [^{fid}]: definition in this chapter (prints over an empty note)")
    for fid, w in fn_defined.items():
        if fid not in fn_cited:
            rep.warn(w, f"footnote [^{fid}]: is never cited (not set)")


# Anchors a :ref may name besides resources (postext 1.12, #261): heading
# identifiers ({#id} / id="…" in a heading's attribute block), containers
# opened with one (:::callout{#id}), :anchor{#id} and [text]{#id}.
ANCHOR_RES = [
    re.compile(r"^#{1,6}\s.*\{[^{}]*(?:#|\bid=[\"']?)([\w.:-]+)[^{}]*\}\s*$", re.M),
    re.compile(r"^:::\s*[a-z][a-z0-9-]*\s*\{[^}]*(?:(?<=[{\s])#|\bid=[\"']?)([\w.:-]+)", re.M),
    re.compile(r":anchor\{[^}]*?(?:#|\bid=[\"']?)([\w.:-]+)"),
    re.compile(r"(?<![\]\\!])\[[^\]\n]+\]\{#([\w.:-]+)\}"),
]
CROSSREF_PREFIXES = ("sec", "fig", "tbl", "eq", "lst")


def anchor_ids(texts: list[str]) -> set[str]:
    out: set[str] = set()
    for t in texts:
        for rx in ANCHOR_RES:
            out.update(m.group(1) for m in rx.finditer(t))
    return out


def ref_target_known(rid: str, res_ids: set[str], anchors: set[str]) -> bool:
    if rid in res_ids or rid in anchors:
        return True
    prefix, _, bare = rid.partition(":")
    return prefix in CROSSREF_PREFIXES and (bare in res_ids or bare in anchors)


def check_snippet(where: str, text: str, res_ids: set[str], rep: Report) -> None:
    if re.search(r"(?<!\\)\$[^$]+\$", text or ""):
        rep.warn(where, "inline $math$ is not supported in captions, notes and table cells")
    if INDEX_MARK_RE.search(text or ""):
        rep.warn(where, ":index marks in captions and table cells print as written: mark the text that cites them")
    if re.search(r"\[\^[\w.:-]+\]", text or ""):
        rep.warn(where, "[^id] in captions and table cells prints as written: cite the note from the text")
    for m in re.finditer(r":ref\{[^}]*id=\"([^\"]+)\"", text or ""):
        if m.group(1) not in res_ids:
            rep.error(where, f":ref to unknown resource {m.group(1)!r}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("project")
    ap.add_argument("--lang", help="check only this locale (default: every locale in chapters)")
    ap.add_argument("--strict", action="store_true", help="exit 1 on warnings too")
    ap.add_argument("--quiet", action="store_true", help="hide INFO lines")
    args = ap.parse_args()
    root = Path(args.project)
    rep = Report()
    mf = root / "preset.json"
    if not mf.exists():
        sys.exit(f"{mf} not found")
    m = json.loads(mf.read_text(encoding="utf-8"))
    if m.get("version") not in (1, 2):
        rep.error("preset.json", "version must be 1 or 2")
    cv = m.get("configVersion")
    if isinstance(cv, bool) or not isinstance(cv, (int, float)) or cv < 8:
        rep.warn("preset.json", "configVersion is missing or below 8: the bundle reads with older rules "
                 "(up to 1.4: H1 breaks pinned, maths x 1.1312, inline gap 'above'; below 6: heading marks plain, "
                 "drop caps at the 1.4 size, one line of room under a colon line before its list, no gap around "
                 "inline figures in boxes, box cuts that may leave one line of a paragraph; below 7: no line "
                 "break after a closed dash, ragged text set line by line; below 8: no Knuth-Plass break "
                 "after a compound's hyphen in a justified paragraph without formatting, a paragraph under a "
                 "heading at a column foot split 1.4's way, as many lines as fit however few go on, and the "
                 "space under a :::paragraphs container added to the next block's instead of merged with it); "
                 "set \"configVersion\": 8 for today's rules")
    for k in ("id", "name"):
        if not m.get(k):
            rep.error("preset.json", f"{k} is required")
    fonts = {f.get("name") for f in m.get("fonts", [])}
    for f in m.get("fonts", []):
        for v in f.get("variants", []):
            p = root / v.get("file", "")
            if not p.exists():
                rep.error("preset.json", f"missing font file {v.get('file')}")
            if p.suffix.lower() not in (".ttf", ".otf", ".woff2"):
                rep.error("preset.json", f"font {v.get('file')}: only ttf, otf and woff2 load")
            if not isinstance(v.get("weight"), (int, float)):
                rep.error("preset.json", f"font {v.get('file')}: weight must be a number")

    shared = m.get("config", {})
    check_config(shared, "preset.json config", fonts, rep)
    chapters = m.get("chapters") or {}
    if m.get("version") == 1:
        md = m.get("markdown")
        chapters = {k: [{"title": "", "file": v}] for k, v in (md.items() if isinstance(md, dict) else [(m.get("locale", "en"), md)])}
    if isinstance(chapters, list):
        chapters = {m.get("locale", "en"): chapters}
    langs = [args.lang] if args.lang else list(chapters)

    resources = m.get("resources", [])
    res_ids = set()
    for r in resources:
        rid = r.get("id")
        where = f"resource {rid}"
        if not rid or not r.get("typeId"):
            rep.error("preset.json", f"resource without id/typeId: {json.dumps(r)[:80]}")
            continue
        if rid in res_ids:
            rep.error(where, "duplicate id")
        res_ids.add(rid)
        kind = r.get("kind")
        for k in ("file", "pdfFile"):
            if r.get(k) and not (root / r[k]).exists():
                rep.error(where, f"missing {k} {r[k]}")
        if r.get("file"):
            ext = Path(r["file"]).suffix.lower()
            if ext not in (".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif"):
                rep.error(where, f"{ext} files do not load: convert to svg/png/jpg/webp")
            if ext != ".svg" and not (r.get("width") and r.get("height")):
                rep.warn(where, "bitmap without width/height (browsers decode it, Node renderers see 0x0)")
        if kind == "table":
            model = (r.get("table") or {}).get("model") or {}
            rows = model.get("rows")
            if not isinstance(rows, list) or not rows:
                rep.error(where, "table.model.rows missing")
            else:
                widths = {len(row) for row in rows}
                if len(widths) > 1:
                    rep.error(where, f"rows have different cell counts {sorted(widths)}: every row needs one entry per grid column (hiddenBy slots under merges)")
                for ri, row in enumerate(rows):
                    for ci, cell in enumerate(row):
                        if not isinstance(cell, dict) or "content" not in cell:
                            rep.error(where, f"cell [{ri}][{ci}] needs a content string")
                            continue
                        check_snippet(f"{where} cell [{ri}][{ci}]", cell.get("content", ""), res_ids | {x.get('id') for x in resources}, rep)
                        img = cell.get("image")
                        if img and img.get("resourceId") not in {x.get("id") for x in resources}:
                            rep.error(where, f"cell [{ri}][{ci}] image {img.get('resourceId')!r} is not a resource")
                cw = model.get("columnWidths")
                if cw and widths and len(cw) != max(widths):
                    rep.warn(where, f"columnWidths has {len(cw)} entries for {max(widths)} columns")
                sid = (r.get("table") or {}).get("styleId")
                if sid and sid not in style_ids(shared)["tables"]:
                    rep.error(where, f"table styleId {sid!r} is not in tableStyles")
        elif kind not in ("bitmap", "svg", None):
            rep.error(where, f"kind {kind!r}: use bitmap, svg or table")
        check_picture_marks(r, where, rep)
        check_snippet(where + " caption", r.get("caption", ""), res_ids | {x.get('id') for x in resources}, rep)
        check_snippet(where + " note", r.get("note", ""), res_ids | {x.get('id') for x in resources}, rep)
        if "source" in r:
            rep.info(where, "`source` is extraction metadata: drop it from the final manifest")
    check_folio(shared, "preset.json config", resources, rep)
    check_comics_config(shared, "preset.json config", rep)

    comic_editions: dict[str, list] = {}
    coverage = ...  # loaded on the first locale with CJK text
    font_files_checked = False
    arabic_files_checked = False
    for lang in langs:
        specs = chapters.get(lang) or []
        loc = (m.get("localized") or {}).get(lang, {})
        cfg = {**shared, **(loc.get("config") or {})}
        if loc.get("config"):
            check_config(loc["config"], f"localized.{lang}.config", fonts, rep, partial=True)
            check_folio(loc["config"], f"localized.{lang}.config", resources, rep)
            check_comics_config(loc["config"], f"localized.{lang}.config", rep)
            for k, v in loc["config"].items():
                if isinstance(v, dict) and isinstance(shared.get(k), dict) and set(shared[k]) - set(v):
                    rep.warn(f"localized.{lang}.config.{k}", f"replaces the shared `{k}` wholesale; missing keys {sorted(set(shared[k]) - set(v))[:6]} fall back to defaults")
        ids = style_ids(cfg)
        for r in resources:
            if r.get("typeId") and r["typeId"] not in ids["types"]:
                rep.error(f"resource {r.get('id')}", f"typeId {r['typeId']!r} is not in resourceTypes {sorted(ids['types'])} ({lang})")
        embedded: set[str] = set()
        referenced: set[str] = set()
        index: dict = {"marks": [], "printed": set()}
        if not specs:
            rep.error("preset.json", f"no chapters for {lang}")
        texts: list[tuple[str, str]] = []
        japanese_book = is_japanese_locale(document_locale(cfg)) or \
            (cfg.get("index") or {}).get("groupBy") in ("gojuon", "kana")
        # Headings with an id and anchors of the whole book: a :ref may name
        # one set in another chapter.
        book_anchors = anchor_ids([(root / c.get("file", "")).read_text(encoding="utf-8")
                                   for c in specs if (root / c.get("file", "")).exists()])
        comic_ctx = new_comic_ctx(cfg, resources, ids)
        for i, c in enumerate(specs):
            p = root / c.get("file", "")
            if not p.exists():
                rep.error("preset.json", f"missing chapter file {c.get('file')}")
                continue
            chapter = p.read_text(encoding="utf-8")
            texts.append((c["file"], chapter))
            check_markdown(c["file"], chapter, i, ids, res_ids, rep, embedded, referenced, index, book_anchors, comic_ctx)
            if CJK_RE.search(chapter):
                check_cjk_lines(c["file"], chapter, rep, japanese_book or is_japanese_text(
                    len(KANA_RE.findall(chapter)), len(HAN_RE.findall(chapter))))
        check_index(index, rep, lang, japanese_book)
        embedded |= comic_ctx["arts"]  # panel pictures are placed by art=, not cited
        check_comic_edition(lang, cfg, comic_ctx, resources, m.get("fonts", []), rep)
        if comic_ctx["blocks"]:
            comic_editions[lang] = comic_ctx["blocks"]
        if any(CJK_RE.search(t) for _, t in texts):
            check_cjk_locale(f"config ({lang})", texts, cfg, rep)
            if is_japanese_locale(document_locale(cfg)):
                check_japanese_config(f"config ({lang})", cfg, rep)
            if coverage is ...:
                coverage = font_coverage(root, m.get("fonts", []))
            chars, roles = cjk_chars_by_family(texts, cfg)
            japanese_text = japanese_book or is_japanese_text(sum(len(KANA_RE.findall(t)) for _, t in texts),
                                                              sum(len(HAN_RE.findall(t)) for _, t in texts))
            check_cjk_coverage(f"fonts ({lang})", chars, cfg, coverage, fonts, rep, roles, japanese_text)
            if not font_files_checked:
                vertical = any(((cf.get("layout") or {}).get("writingMode") == "vertical-rl")
                               for cf in [shared] + [(x.get("config") or {}) for x in (m.get("localized") or {}).values()])
                check_font_files(root, m.get("fonts", []), vertical, rep)
                font_files_checked = True
        if any(ARABIC_LETTER_RE.search(t) for _, t in texts):
            check_arabic_config(f"config ({lang})", texts, cfg, rep)
            if coverage is ...:
                coverage = font_coverage(root, m.get("fonts", []))
            achars, aroles = script_chars_by_family(texts, cfg, ARABIC_RE)
            check_arabic_coverage(f"fonts ({lang})", achars, coverage, fonts, rep, aroles)
            if not arabic_files_checked:
                check_arabic_font_files(root, m.get("fonts", []), {f for f, u in achars.items() if u}, rep)
                arabic_files_checked = True
        # placement sanity
        types = {t.get("id"): t for t in cfg.get("resourceTypes", []) if isinstance(t, dict)} if isinstance(cfg.get("resourceTypes"), list) else {}
        design_refs = set(re.findall(r'"resourceId":\s*"([^"]+)"', json.dumps(cfg)))
        spine = ((cfg.get("folio") or {}).get("binding") or {}).get("spineImage") if isinstance(cfg.get("folio"), dict) else None
        if isinstance(spine, str):
            design_refs.add(spine)  # printed on the Folio viewer's spine
        for r in resources:
            rid = r.get("id")
            pos = (r.get("placement") or {}).get("position") or ((types.get(r.get("typeId")) or {}).get("defaultPlacement") or {}).get("position") or "auto"
            if pos == "here" and rid in referenced and rid not in embedded:
                rep.warn(f"resource {rid}", f"placement 'here' but only :ref'd, never ::resource'd: it is numbered but never placed ({lang})")
            if rid not in referenced and rid not in embedded and rid not in design_refs:
                cell_refs = json.dumps(resources)
                if f'"resourceId": "{rid}"' not in cell_refs:
                    rep.info(f"resource {rid}", f"never cited in the {lang} chapters (unused)")

    compare_comic_editions(comic_editions, rep)

    order = {"ERROR": 0, "WARN": 1, "INFO": 2}
    items = sorted(rep.items, key=lambda x: order[x[0]])
    for lvl, where, msg in items:
        if args.quiet and lvl == "INFO":
            continue
        print(f"{lvl:5} {where}: {msg}")
    errors = sum(1 for x in items if x[0] == "ERROR")
    warns = sum(1 for x in items if x[0] == "WARN")
    print(f"\n{errors} error(s), {warns} warning(s)")
    sys.exit(1 if errors or (args.strict and warns) else 0)


if __name__ == "__main__":
    main()
