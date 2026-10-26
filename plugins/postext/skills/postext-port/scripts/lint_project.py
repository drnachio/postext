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
hyphenation and italic emphasis; tab stops (`tabStops`, `:tab{…}`, `:tab`
in vertical text, tab characters no style turns into tabs); drop caps
(`dropCap` settings, `{dropcap}` attributes, a chapter's opening words drawn
as a heading attribute by a design's drop cap); for comics
(`:::page`, `:::strip`), the split expressions, panels, script lines,
balloon and panel styles, the `comics` config, speaker anchors and safe
areas, the lettering faces, and whether every edition sets the same pages;
for composed pages (`::::page{template}`, `:::frame{slot}`, `:::figure` +
`::label`, `slot=`; postext >= 1.34), the template, slot, spread, anchor and
label-style ids against the page templates and resources;
and the book's text typed into design text elements of the config
(contentInConfig, the rule of `preset_kit.py lint`) and a config past 3 MB;
and the faults an agent leaves in a port (#1112): inline marks typed in a
design text element, or brought into it by `{attr.key}`, while the element
has no `inlineMarks: true` (designMarksLiteral); a plain space typed beside
a fixed or no-break space (fixedSpacePlusSpace); `:chip` in a heading when
the book is pinned to a postext older than 1.52.0, which reads heading
chips (headingChip; the pin is --engine, else the project's package.json or
recipe.json, else none: the Sandbox's latest release); and capitals typed
in a bare chip at small-capital size instead of `:smallcaps[…]`
(smallCapsByHand).
Pure Python otherwise.

Exit code 1 when there are errors (or warnings with --strict).
"""
from __future__ import annotations

import argparse
import difflib
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
# `::resource{id="x" slot="y"}` on a composed page (postext >= 1.34): the two
# keys in either order, nothing else.
RESOURCE_SLOT_RE = re.compile(r'^::resource\s*\{(?:id="([^"]+)"\s+slot="([^"]+)"|slot="([^"]+)"\s+id="([^"]+)")\}\s*$')
# Composed pages (postext >= 1.34; laid out from 1.34.1): a page fence of four
# or more colons, closed by a bare line of as many; `:::frame` and
# `:::figure` with `::label` lines inside it.
PAGE_FENCE_RE = re.compile(r"^(:{4,})page\b\s*(?:\{([^}]*)\})?\s*$")
LABEL_RE = re.compile(r"^::label\[(.*)\](?:\{([^{}]*)\})?\s*$")
# A figure's own words (postext >= 1.39): `::alt[…]`, `::caption[…]`, `::note[…]` lines among the labels
FIGURE_WORD_KEYS = ("alt", "caption", "note")


def figure_word(line: str) -> tuple[str, str] | None:
    """(key, text) of a `::alt[…]` / `::caption[…]` / `::note[…]` line, else None."""
    s = line.rstrip()
    for key in FIGURE_WORD_KEYS:
        head = f"::{key}["
        if s.startswith(head) and s.endswith("]"):
            return key, s[len(head):-1]
    return None


PERCENT_AT_RE = re.compile(r"^\s*-?\d+(?:\.\d+)?%\s+-?\d+(?:\.\d+)?%\s*$")
COMPOSED_CONTAINERS = {"frame", "figure"}
# A module's instance name the engine refuses (postext 1.48): a space, ".", "#", "[" or "]".
MODULE_NAME_BAD_RE = re.compile(r"[\s.#\[\]]")
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



# A code fence (postext >= 1.23): 3+ backticks or tildes, up to 3 spaces in.
CODE_FENCE_OPEN_RE = re.compile(r"^( {0,3})(`{3,}|~{3,})(.*)$")
CODE_FENCE_CLOSE_RE = re.compile(r"^ {0,3}(`{3,}|~{3,})\s*$")

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


# PostextConfig's top-level keys, generated from the engine's types/config.ts by
# `config_keys.py --write` (config_keys.json; tests/test_config_keys.py fails
# while the engine has a key the list lacks). The engine drops an unknown one
# in silence, so a typo (`bodyTex`, `pageTemplate`) changes nothing on the page.
CONFIG_TOP_KEYS = set(json.loads((Path(__file__).resolve().parent / "config_keys.json").read_text(encoding="utf-8"))["keys"])


def check_config(cfg: dict, where: str, fonts: set[str], rep: Report, partial: bool = False) -> None:
    if not isinstance(cfg, dict):
        rep.error(where, "config must be an object")
        return
    for key in cfg:
        if key not in CONFIG_TOP_KEYS:
            near = difflib.get_close_matches(key, sorted(CONFIG_TOP_KEYS), n=1)
            hint = f" (did you mean `{near[0]}`?)" if near else ""
            rep.warn(where, f"config.{key} is not a Postext setting and is ignored{hint}")
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


LINE_NUMBERS_ENUMS = {
    "count": {"verse", "all"},
    "restart": {"document", "chapter", "section", "page", "poem"},
    "position": {"outer", "inner", "left", "right", "start", "end", "side"},
    "multiColumn": {"each", "gutter", "outer-edges"},
    "align": {"auto", "left", "right"},
}
LINE_NUMBERS_KEYS = set(LINE_NUMBERS_ENUMS) | {"enabled", "interval", "numberFirst", "startAt", "gap", "fontFamily",
                                               "fontSize", "fontWeight", "italic", "color", "format"}


def _whole(v, lo: int) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and v == int(v) and v >= lo


def check_line_numbers(cfg: dict, where: str, rep: Report) -> None:
    """`lineNumbers` (postext >= 1.23): keys, values the resolver drops, and
    settings that print no numbers."""
    for i, ps in enumerate(cfg.get("paragraphStyles") or []):
        if isinstance(ps, dict) and "lineNumbers" in ps and not isinstance(ps["lineNumbers"], bool):
            rep.warn(where, f"paragraphStyles[{i}].lineNumbers must be true or false (ignored)")
    ln = cfg.get("lineNumbers")
    if ln is None:
        return
    if not isinstance(ln, dict):
        rep.error(where, "lineNumbers must be an object")
        return
    for k, v in ln.items():
        if k not in LINE_NUMBERS_KEYS:
            rep.warn(where, f"lineNumbers.{k} is not a lineNumbers key (ignored)")
        elif k in LINE_NUMBERS_ENUMS and v not in LINE_NUMBERS_ENUMS[k]:
            rep.warn(where, f"lineNumbers.{k} {v!r} is not one of {sorted(LINE_NUMBERS_ENUMS[k])}: the default is used")
    for k, lo in (("interval", 1), ("startAt", 0)):
        if k in ln and not _whole(ln[k], lo):
            rep.warn(where, f"lineNumbers.{k} {ln[k]!r} is not a whole number >= {lo}: the default is used")
    if not ln.get("enabled"):
        if len(ln) > 1:
            rep.info(where, "lineNumbers is set but not enabled: no numbers are printed")
        return
    if (cfg.get("layout") or {}).get("writingMode") == "vertical-rl":
        rep.warn(where, "lineNumbers.enabled: vertical documents get no line numbers (lineNumbersUnsupported)")
    lay = cfg.get("layout") or {}
    if ln.get("position") == "side" and not (lay.get("layoutType") == "oneAndHalf" and lay.get("sideColumnRole") == "floats"):
        rep.info(where, "lineNumbers.position 'side' needs layout oneAndHalf with sideColumnRole 'floats'; "
                        "pages without that side column set the numbers 'outer'")


CODE_STYLE_ENUMS = {
    "overflow": {"wrap", "shrink", "clip"},
    "highlight": {"builtin", "none"},
    "span": {"column", "page"},
}
CODE_STYLE_KEYS = set(CODE_STYLE_ENUMS) | {
    "blocks", "indentedCode", "fontFamily", "fontSize", "fontWeight", "boldFontWeight", "lineHeight", "snapToGrid",
    "color", "backgroundEnabled", "background", "padding", "border", "borderRadius", "marginTop", "marginBottom",
    "tabSize", "wrapIndent", "wrapMarker", "minFontScale", "lineNumbers", "lineNumberColor", "lineNumberGap",
    "highlightBackground", "keepTogether", "splitMinLines", "repeatTitle", "continuesMarkerEnabled",
    "continuesMarker", "titleStyle", "label", "tokens", "inline"}
CODE_TOKEN_KINDS = {"keyword", "string", "number", "comment", "function", "type", "operator", "punctuation",
                    "variable", "meta", "prompt", "output"}
INLINE_CODE_KEYS = {"fontFamily", "fontSize", "color", "bold", "italic", "background", "borderColor", "borderWidth",
                    "borderRadius", "paddingX", "paddingY", "otherScripts"}


def check_callout_extends(cfg: dict, where: str, rep: Report) -> None:
    """`calloutStyles[].extends` (postext >= 1.39): the parent must exist and the chain must not loop
    (calloutStyleExtendsUnknown, calloutStyleExtendsCycle: the style then stands alone)."""
    styles = [c for c in cfg.get("calloutStyles") or [] if isinstance(c, dict)]
    parent = {c.get("id"): c.get("extends") for c in styles if c.get("id")}
    reported: set[str] = set()
    for c in styles:
        sid, up = c.get("id"), c.get("extends")
        if up is None:
            continue
        if not isinstance(up, str) or up not in parent:
            rep.error(where, f"calloutStyleExtendsUnknown: calloutStyles {sid!r} extends {up!r}, which is not a "
                             f"calloutStyles id ({sorted(x for x in parent if x)[:8]}); the style stands alone")
            continue
        seen, cur = [sid], up
        while isinstance(cur, str) and cur not in seen and parent.get(cur) is not None:
            seen.append(cur)
            cur = parent[cur]
        if cur in seen:
            key = min(seen[seen.index(cur):])
            if key not in reported:
                reported.add(key)
                rep.error(where, "calloutStyleExtendsCycle: " + " -> ".join([*seen[seen.index(cur):], cur])
                          + "; those styles stand alone")


def check_code_style(cfg: dict, where: str, rep: Report) -> None:
    """`codeStyle` (postext >= 1.23): keys, values the resolver drops, token
    kinds and inline code."""
    cs = cfg.get("codeStyle")
    if cs is None:
        return
    if not isinstance(cs, dict):
        rep.error(where, "codeStyle must be an object")
        return
    for k, v in cs.items():
        if k not in CODE_STYLE_KEYS:
            rep.warn(where, f"codeStyle.{k} is not a codeStyle key (ignored)")
        elif k in CODE_STYLE_ENUMS and v not in CODE_STYLE_ENUMS[k]:
            rep.warn(where, f"codeStyle.{k} {v!r} is not one of {sorted(CODE_STYLE_ENUMS[k])}: the default is used")
    for k, lo in (("tabSize", 1), ("wrapIndent", 0), ("splitMinLines", 1)):
        if k in cs and not _whole(cs[k], lo):
            rep.warn(where, f"codeStyle.{k} {cs[k]!r} is not a whole number >= {lo}: the default is used")
    tokens = cs.get("tokens")
    if isinstance(tokens, dict):
        for kind, look in tokens.items():
            if kind not in CODE_TOKEN_KINDS:
                rep.warn(where, f"codeStyle.tokens.{kind} is not a token kind (ignored): {sorted(CODE_TOKEN_KINDS)}")
            elif isinstance(look, dict):
                for k in look:
                    if k not in ("color", "bold", "italic"):
                        rep.warn(where, f"codeStyle.tokens.{kind}.{k} is not a token style key (ignored)")
    inline = cs.get("inline")
    if isinstance(inline, dict):
        for k in inline:
            if k not in INLINE_CODE_KEYS:
                rep.warn(where, f"codeStyle.inline.{k} is not an inline code key (ignored)")
    if cs.get("blocks") is False:
        rep.info(where, "codeStyle.blocks false: ``` fences are read as Markdown, as up to postext 1.22")


TAB_STOP_KEYS = {"position", "align", "leader", "leaderGap", "decimalChar"}
TAB_STOP_ALIGNS = {"start", "end", "center", "decimal"}
TAB_ATTR_KEYS = {"at", "align", "leader", "gap", "decimal"}
_LENGTH_UNITS = {"cm", "mm", "in", "pt", "px", "em", "rem"}
_LENGTH_TEXT_RE = re.compile(r"^\s*(-?\d+(?:\.\d+)?|-?\.\d+)\s*(cm|mm|in|pt|px|em|rem)?\s*$", re.I)
# `:tab` or `:tab{…}`; a bare `:tab` followed by a letter is text (`3:table`).
TAB_DIRECTIVE_RE = re.compile(r":tab(?:\{([^}\n]*)\}|(?![^\W\d_]))")
_CODE_SPAN_RE = re.compile(r"`[^`\n]*`")


def _is_dimension(v) -> bool:
    return (isinstance(v, dict) and isinstance(v.get("value"), (int, float)) and not isinstance(v.get("value"), bool)
            and v.get("unit") in _LENGTH_UNITS)


def _tab_position_ok(v) -> bool:
    """A stop position the engine reads (defaults/tabStops.ts): a Dimension,
    'end', a percentage or a length written as text."""
    if isinstance(v, dict):
        return _is_dimension(v)
    if not isinstance(v, str):
        return False
    t = v.strip().lower()
    return t == "end" or bool(re.fullmatch(r"(\d+(?:\.\d+)?|\.\d+)\s*%", t)) or bool(_LENGTH_TEXT_RE.match(t))


def _tab_settings(cfg: dict) -> list[tuple[str, dict]]:
    """Every place that sets tab stops: body text, paragraph styles, callout bodies."""
    out: list[tuple[str, dict]] = []
    if isinstance(cfg.get("bodyText"), dict):
        out.append(("bodyText", cfg["bodyText"]))
    for i, ps in enumerate(cfg.get("paragraphStyles") or []):
        if isinstance(ps, dict):
            out.append((f"paragraphStyles[{i}]", ps))
    for i, cs in enumerate(cfg.get("calloutStyles") or []):
        if isinstance(cs, dict) and isinstance(cs.get("body"), dict):
            out.append((f"calloutStyles[{i}].body", cs["body"]))
    return out


def check_tab_stops(cfg: dict, where: str, texts: list[tuple[str, str]], rep: Report) -> None:
    """Tab stops (postext >= 1.23): `tabStops` / `tabInterval` on the body,
    paragraph styles and callout bodies, `:tab{…}` attributes, `:tab` in
    vertical text, and tab characters no style turns into tabs."""
    any_stops = False
    for path, node in _tab_settings(cfg):
        if "tabInterval" in node:
            any_stops = True
            if not _is_dimension(node["tabInterval"]) or node["tabInterval"]["value"] <= 0:
                rep.warn(where, f"{path}.tabInterval must be a length above 0 ({{value, unit}}): ignored")
        if "tabStops" not in node:
            continue
        stops = node["tabStops"]
        if not isinstance(stops, list):
            rep.warn(where, f"{path}.tabStops must be a list of stops: ignored")
            continue
        any_stops = any_stops or bool(stops)
        for j, stop in enumerate(stops):
            p = f"{path}.tabStops[{j}]"
            if not isinstance(stop, dict):
                rep.warn(where, f"{p} must be an object {{position, align?, leader?, leaderGap?, decimalChar?}}")
                continue
            for k in stop:
                if k not in TAB_STOP_KEYS:
                    near = difflib.get_close_matches(k, sorted(TAB_STOP_KEYS), n=1)
                    rep.warn(where, f"{p}.{k} is not a tab stop key{f' ({near[0]}?)' if near else ''} (ignored)")
            if not _tab_position_ok(stop.get("position")):
                rep.warn(where, f"{p}.position {stop.get('position')!r} is no length, 'end' or percentage: "
                                "the stop is left out")
            if "align" in stop and stop["align"] not in TAB_STOP_ALIGNS:
                rep.warn(where, f"{p}.align {stop['align']!r} is not one of {sorted(TAB_STOP_ALIGNS)}: read as 'start'")
            if "leader" in stop and not (isinstance(stop["leader"], str) and stop["leader"]):
                rep.warn(where, f"{p}.leader must be a non-empty string ('.', '. ', '·', '_', '-', 'rule'): no leader")
            if "leaderGap" in stop and not _is_dimension(stop["leaderGap"]):
                rep.warn(where, f"{p}.leaderGap must be a length ({{value, unit}}): the default 0.5em is used")
            if stop.get("decimalChar") is not None and stop.get("align") != "decimal":
                rep.info(where, f"{p}.decimalChar only counts on an align 'decimal' stop")
    vertical = (cfg.get("layout") or {}).get("writingMode") == "vertical-rl"
    for name, text in texts:
        literal_tab_at = None
        for i, raw in enumerate(text.split("\n")):
            line = _CODE_SPAN_RE.sub("", raw.strip())
            if line.startswith("#"):
                continue  # headings keep their own meaning of a tab
            for m in TAB_DIRECTIVE_RE.finditer(line):
                at = f"{name}:{i + 1}"
                if vertical:
                    rep.warn(at, ":tab in vertical text is set as a word space (tabInVerticalText): "
                                 "tab stops are set in horizontal text only")
                    continue
                if m.group(1) is None:
                    continue
                attrs = parse_attrs(m.group(1))
                for k in attrs:
                    if k not in TAB_ATTR_KEYS:
                        rep.warn(at, f":tab{{{k}=…}} is not read (keys: at, align, leader, gap, decimal)")
                if not _tab_position_ok(attrs.get("at")):
                    rep.warn(at, f":tab{{at={attrs.get('at', '')}}} is no length, 'end' or percentage: the tab takes "
                                 "the paragraph's stops instead")
                if "align" in attrs and attrs["align"].strip().lower() not in TAB_STOP_ALIGNS:
                    rep.warn(at, f":tab{{align={attrs['align']}}} is not one of {sorted(TAB_STOP_ALIGNS)}: read as 'start'")
                if "gap" in attrs and not _LENGTH_TEXT_RE.match(attrs["gap"]):
                    rep.warn(at, f":tab{{gap={attrs['gap']}}} is no length: the default 0.5em is used")
            if literal_tab_at is None and re.search(r"\S\t", re.sub(r"^(?:[-*+]|\d+[.)])\s+", "", line)):
                literal_tab_at = i + 1
        if literal_tab_at is not None and not any_stops and not vertical:
            rep.warn(f"{name}:{literal_tab_at}", "a tab character inside a line is a word space unless the paragraph's "
                                                 "style sets tabStops or tabInterval; give the style stops, or write :tab")


DROP_CAP_KEYS = {"lines", "sink", "characters", "fontFamily", "fontWeight", "italic", "fontSize", "color",
                 "gap", "punctuation", "leadIn", "shortParagraph", "each"}
DROP_CAP_ENUMS = {"punctuation": {"with-cap", "hang", "text"}, "shortParagraph": {"reserve", "shrink", "skip"}}
LEAD_IN_KEYS = {"words", "smallCaps", "uppercase"}
DROPCAP_ATTR_RE = re.compile(r"\{[^{}\n]*\bdrop[cC]ap(?:=(\"[^\"]*\"|'[^']*'|[^\s}]*))?[^{}\n]*\}")


def _drop_cap_settings(cfg: dict):
    """Every drop cap setting of a config: paragraph styles, heading levels
    and heading styles (a level's or style's `false` is a valid "none")."""
    for i, ps in enumerate(cfg.get("paragraphStyles") or []):
        if isinstance(ps, dict) and "dropCap" in ps:
            yield f"paragraphStyles[{i}].dropCap", ps["dropCap"], False
    for i, lvl in enumerate((cfg.get("headings") or {}).get("levels") or []):
        if isinstance(lvl, dict) and "dropCap" in lvl:
            yield f"headings.levels[{i}].dropCap", lvl["dropCap"], True
    for i, hs in enumerate(cfg.get("headingStyles") or []):
        if isinstance(hs, dict) and "dropCap" in hs:
            yield f"headingStyles[{i}].dropCap", hs["dropCap"], True


def _design_lead_caps(cfg: dict) -> bool:
    """Whether a heading design draws a heading attribute with a design
    text `dropCap` (the chapter's opening words set apart from the text)."""
    slots = []
    for lvl in (cfg.get("headings") or {}).get("levels") or []:
        if isinstance(lvl, dict):
            slots.append(((lvl.get("advancedDesign") or {}).get("slot") or {}))
    for hs in cfg.get("headingStyles") or []:
        if isinstance(hs, dict):
            slots.append(((hs.get("advancedDesign") or {}).get("slot") or {}))
    for slot in slots:
        for el in slot.get("elements") or []:
            if isinstance(el, dict) and el.get("kind") == "text" and el.get("dropCap") and "{attr." in str(el.get("content", "")):
                return True
    return False


def check_drop_caps(cfg: dict, where: str, texts: list[tuple[str, str]], rep: Report) -> None:
    """Drop caps in body paragraphs (postext >= 1.23): the `dropCap`
    settings of paragraph styles, heading levels and heading styles, the
    `{dropcap}` attribute, and the chapter openings still drawn as a heading
    attribute by a design text's `dropCap`."""
    any_cap = False
    for path, cap, may_be_false in _drop_cap_settings(cfg):
        if cap is False and may_be_false:
            continue
        if not isinstance(cap, dict):
            rep.warn(where, f"{path} must be an object (or false on a heading level or style): ignored")
            continue
        any_cap = True
        for k in cap:
            if k not in DROP_CAP_KEYS:
                near = difflib.get_close_matches(k, sorted(DROP_CAP_KEYS), n=1)
                rep.warn(where, f"{path}.{k} is not a drop cap key{f' ({near[0]}?)' if near else ''} (ignored)")
        for k, words in DROP_CAP_ENUMS.items():
            if k in cap and cap[k] not in words:
                rep.warn(where, f"{path}.{k} {cap[k]!r} is not one of {sorted(words)}: the default is used")
        for k in ("lines", "sink", "characters"):
            v = cap.get(k)
            if v is not None and not (isinstance(v, (int, float)) and not isinstance(v, bool) and v >= 1):
                rep.warn(where, f"{path}.{k} {v!r} is not a whole number >= 1: the default is used")
        if isinstance(cap.get("sink"), (int, float)) and isinstance(cap.get("lines"), (int, float)) and cap["sink"] > cap["lines"]:
            rep.info(where, f"{path}.sink is more than lines: it sinks no further than its lines")
        if "each" in cap and path.startswith(("headings", "headingStyles")):
            rep.info(where, f"{path}.each only counts in a paragraph style")
        lead = cap.get("leadIn")
        if lead is not None:
            if not isinstance(lead, dict):
                rep.warn(where, f"{path}.leadIn must be an object {{words, smallCaps?, uppercase?}}: ignored")
            else:
                for k in lead:
                    if k not in LEAD_IN_KEYS:
                        near = difflib.get_close_matches(k, sorted(LEAD_IN_KEYS), n=1)
                        rep.warn(where, f"{path}.leadIn.{k} is not a lead-in key{f' ({near[0]}?)' if near else ''} (ignored)")
                w = lead.get("words")
                if w is not None and w != "line" and not (isinstance(w, int) and not isinstance(w, bool) and w >= 1):
                    rep.warn(where, f"{path}.leadIn.words {w!r} must be a whole number >= 1 or 'line': no lead-in")
    vertical = (cfg.get("layout") or {}).get("writingMode") == "vertical-rl"
    used_attr = False
    lead_attrs = False
    for name, text in texts:
        for i, raw in enumerate(text.split("\n")):
            line = raw.strip()
            if not (line.startswith("#") or line.startswith(":::paragraphs")):
                continue
            for m in DROPCAP_ATTR_RE.finditer(line):
                used_attr = True
                v = (m.group(1) or "").strip("\"'").strip().lower()
                if v and v not in ("true", "yes", "on", "false", "no", "off", "0", "none") and not (v.isdigit() and int(v) >= 1):
                    rep.warn(f"{name}:{i + 1}", f"{{dropcap={v}}} reads as nothing: write dropcap, dropcap=false or dropcap=N (lines)")
            if line.startswith("#") and re.search(r"\blead=", line):
                lead_attrs = True
    if vertical and (any_cap or used_attr):
        rep.warn(where, "drop caps are set in horizontal text only: a vertical book sets none (dropCap content warning)")
    if lead_attrs and _design_lead_caps(cfg):
        rep.warn(where, "a heading design draws a `lead` attribute with a design text dropCap: keep the chapter's opening "
                        "words in its first paragraph and give the heading level a dropCap (postext >= 1.23, "
                        "configuration.md §4b)")


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


def check_font_fallback(f: dict, rep: Report, licensed: set[str] | None = None) -> None:
    """`fonts[].fallback` (postext >= 1.42): the open family a licensed family
    the pack left out is set in. A name, not the family's own; a family with
    no file and no fallback is set in the generic face, wider than the real
    one (frameOverflow and missingFont on the plain bundle)."""
    name = f.get("name")
    where = f"preset.json font {name!r}"
    fb = f.get("fallback")
    if fb is not None and (not isinstance(fb, str) or not fb.strip()):
        rep.error(where, "fallback must be the name of a font family (a string)")
        return
    if isinstance(fb, str) and fb.strip() == name:
        rep.error(where, "fallback names the family itself: name the open family that stands in for it (EB Garamond)")
    elif isinstance(fb, str) and fb.strip() in (licensed or set()):
        rep.error(where, f"fallback {fb.strip()!r} is a family of this book marked redistributable: false: from postext 1.43 "
                         "the fallback's faces travel in the EPUB, the HTML and the SVG pictures of an export, so it must be an open "
                         "family (OFL, Apache or similar)")
    elif isinstance(fb, str) and f.get("variants"):
        rep.info(where, f"fallback {fb!r}: the family's own files are used; only a slant it lacks is taken from the fallback")
    elif not f.get("variants") and not fb:
        rep.warn(where, "no font file and no fallback: the plain bundle sets this family in the generic face, wider than "
                        "the real one, so frames overflow and missingFont fills the report; add \"fallback\": \"<open family>\" "
                        "(fonts.py width picks it by measurement; preset_kit.py pack --fallback writes it)")


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
COMIC_STRIP_ATTRS = {"split", "gutter", "style", "bleed", "direction", "dir", "span", "placement", "height", "aspect", "id",
                     "width", "align", "caption", "type"}
COMIC_PANEL_ATTRS = {"art", "fit", "focus", "style", "border", "bg", "bleed", "mirror", "pop", "inset", "pad", "alt", "id",
                     "text", "box", "valign", "shrink"}
# Keys a script line reads (comics/script.ts SCRIPT_KEYS); any other bare
# flag names a balloon style.
COMIC_SCRIPT_KEYS = {"at", "to", "tail", "join", "break", "rotate", "size", "color", "font", "style", "id",
                     "vertical", "horizontal", "mode"}
COMIC_RESERVED_KEYS = {"caption", "sfx", "note"}
COMIC_BALLOON_STYLES = {"speech", "thought", "whisper", "shout", "radio", "caption", "inner", "note", "sfx"}
COMIC_POSITIONS = {"top-start", "top-end", "bottom-start", "bottom-end", "top", "bottom"}
COMIC_TAILS = {"none", "auto", "top", "bottom", "start", "end", "left", "right"}
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
                         "textTransform", "dropFinalStop", "doubleDash", "inset", "joinSameSpeaker", "maxColumnChars",
                         "strictPlacement"}
COMICS_BALLOON_KEYS = {"id", "name", "shape", "fill", "stroke", "strokeWidth", "dash", "double", "wobble", "roundness",
                       "burstPoints", "burstDepth", "padding", "aspect", "tail", "tailWidth", "tailReach", "target",
                       "position", "butt", "fontFamily", "fontScale", "bold", "italic", "color", "textTransform",
                       "letterSpacing", "align", "halo", "haloColor", "rotate", "skew"}
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
    """A picture's safe area, speaker anchors, avoid zones and bystander
    faces (comics.md §9)."""
    sa = r.get("safeArea")
    if sa is not None:
        p = _rect_problem(sa)
        if p:
            rep.error(where, f"safeArea {p}")
            sa = None
    anchors, avoid, faces = r.get("anchors"), r.get("avoid"), r.get("faces")
    if (anchors or avoid or faces) and r.get("kind") == "table":
        rep.warn(where, "anchors/avoid/faces are read only on bitmap and SVG pictures placed in comic panels")
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
    # The faces of people who do not speak (postext >= 1.28): rectangles
    # like the avoid zones, never covered.
    if faces is not None:
        if not isinstance(faces, list):
            rep.error(where, "faces must be a list of {x, y, width, height} (the faces of people who do not speak)")
        else:
            for k, z in enumerate(faces):
                p = _rect_problem(z)
                if p:
                    rep.error(f"{where} faces[{k}]", p)


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
            # The engine reads the default and reports unknownConfigValue
            # with the closest word (configWarnings.ts, #590).
            close = difflib.get_close_matches(str(node[key]).lower(), sorted(COMICS_ENUMS[key]), n=1, cutoff=0.6)
            hint = f" (did you mean {close[0]!r}?)" if close else ""
            rep.error(f"{path}.{key}", f"{node[key]!r} is not one of {sorted(COMICS_ENUMS[key])}{hint}: the default is used "
                                       "(unknownConfigValue)")

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


COMIC_WIDTH_RE = re.compile(r"^\s*(?:[0-9]*\.?[0-9]+\s*%|[0-9]*\.?[0-9]+\s*(mm|cm|in|pt|px)?)\s*$")


def _check_comic_fence_attrs(kind: str, attrs: dict[str, str], where: str, panel_styles: set[str], rep: Report,
                             types: set[str] | None = None) -> None:
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
        # Width, alignment and caption (#590).
        if "width" in attrs and not COMIC_WIDTH_RE.match(attrs["width"]):
            rep.warn(where, f"width={attrs['width']!r} is not a share of the measure (60%) or a length (bare numbers are mm): "
                            "the strip takes the whole measure")
        if "align" in attrs and attrs["align"].strip().lower() not in ("start", "center", "end"):
            rep.warn(where, f"align={attrs['align']!r} is read as center (start | center | end; start and end follow the "
                            "text direction)")
        if "align" in attrs and "width" not in attrs:
            rep.info(where, "align without width: the strip takes the whole measure, there is nothing to align")
        caption = attrs.get("caption", "").strip()
        if "caption" in attrs and not caption:
            rep.warn(where, "caption is empty: no caption is set")
        if attrs.get("type"):
            if types is not None and attrs["type"] not in types:
                rep.warn(where, f"type={attrs['type']!r} is not in resourceTypes {sorted(types)}: the caption is plain and "
                                "the strip is not counted")
            elif not caption:
                rep.warn(where, "type without caption: the strip is not counted (a numbered strip needs a caption)")
        if attrs.get("id") and not (caption and attrs.get("type")):
            rep.info(where, f"id={attrs['id']!r}: a :ref names a strip only when it is numbered (caption and type=…); "
                            "otherwise it prints ?")


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
    # postext >= 1.38: `text` (Markdown body), `box` (a calloutStyles id), `valign` for a text panel
    if attrs.get("box") and ctx.get("callout_styles") is not None and attrs["box"] not in ctx["callout_styles"]:
        rep.warn(where, f"box={attrs['box']!r} is not in calloutStyles {sorted(ctx['callout_styles'])}: the panel keeps "
                        "its panel style (comicPanelFrame, unknownBox)")
    if "valign" in attrs:
        if "text" not in attrs:
            rep.info(where, "valign places the text of a text panel: it does nothing without the text flag")
        elif attrs["valign"].strip().lower() not in ("top", "middle", "bottom"):
            rep.warn(where, f"valign={attrs['valign']!r} is ignored (top | middle | bottom)")
    if "shrink" in attrs:  # postext >= 1.39: a text panel's text may be set smaller until it fits
        sv = attrs["shrink"].strip()
        num = sv[:-1] if sv.endswith("%") else sv
        try:
            ok = sv in ("", "true") or float(num) > 0
        except ValueError:
            ok = False
        if not ok:
            rep.warn(where, f"shrink={attrs['shrink']!r} is not a number or a percent (shrink, shrink=0.7, shrink=70%)")
        elif "text" not in attrs:
            rep.info(where, "shrink sets a text panel's text smaller until it fits: it does nothing without the text flag")
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
        if "mode" in attrs and attrs["mode"].strip().lower() not in ("vertical", "horizontal"):
            rep.warn(where, f"mode={attrs['mode']!r} is ignored (vertical, horizontal)")
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
    _check_comic_fence_attrs(kind, attrs, where, ctx["panel_styles"], rep, ctx.get("types"))
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
    text_panel = False  # inside a `::panel{text}` body: Markdown, not script lines
    arts: list[str] = []
    open_item = False
    for ln, raw in body:
        line = raw.strip()
        w = f"{name}:{ln}"
        if not line or (line.startswith("<!--") and line.endswith("-->")):
            continue
        if line.startswith("::label"):
            # a comic block holds no :::figure, so a label line there is never one's
            rep.warn(w, "::label outside a :::figure prints as text")
            continue
        if line.startswith("::panel"):
            m = COMIC_PANEL_RE.match(line)
            if not m:
                rep.error(w, "malformed ::panel line: ::panel{attrs} alone on its line")
                continue
            pattrs = parse_attrs(m.group(1))
            _check_panel_attrs(pattrs, w, ctx, rep)
            text_panel = "text" in pattrs
            if text_panel and (kind == "strip" or "spread" in attrs):
                rep.info(w, f"text panel on a {'strip' if kind == 'strip' else 'spread'}: set in its frame from postext 1.40; "
                            "an older engine sets the words in the flow after the comic (comicPanelFrame): letter them "
                            "as captions for those")
            panels += 1
            if not pattrs.get("inset"):
                flow_panels += 1
            elif panels == 1:
                rep.warn(w, "an inset panel is laid over the previous panel: the first panel cannot be one")
            arts.append(pattrs.get("art", ""))
            seen_panel = True
            open_item = False
            continue
        if text_panel:
            if line.startswith(":::"):
                rep.warn(w, f"{line} inside a text panel is left out: the body is paragraphs, lists and emphasis "
                            "(it runs to the next ::panel line)")
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
    """What the comic and composed-page checks of one edition share and
    collect."""
    balloons, panels = comic_style_ids(cfg)
    templates = cfg.get("pageTemplates") if isinstance(cfg.get("pageTemplates"), list) else []
    label_styles = {x.get("id") for x in cfg.get("labelStyles") or [] if isinstance(x, dict)} \
        if isinstance(cfg.get("labelStyles"), list) else set()
    return {"res_kinds": {r.get("id"): resource_kind(r) for r in resources}, "balloon_styles": balloons,
            "panel_styles": panels, "palette": ids.get("palette", set()), "types": ids.get("types", {"figure", "table"}),
            "speakers": {}, "arts": set(),
            "faces": set(), "blocks": [],
            "templates": templates, "label_styles": label_styles,
            "callout_styles": ids.get("callout"),
            "anchors": {r.get("id"): {a.get("id") for a in r.get("anchors") or [] if isinstance(a, dict)}
                        for r in resources if isinstance(r, dict)}}


def flow_columns_on(cfg: dict, config_version: object) -> bool:
    """Whether a `:::columns` group in the running text is set (postext 1.25,
    `layout.flowColumns`, default on): a config stored before configVersion
    11 is read with it off unless it says so."""
    v = (cfg.get("layout") or {}).get("flowColumns") if isinstance(cfg.get("layout"), dict) else None
    if isinstance(v, bool):
        return v
    return isinstance(config_version, (int, float)) and not isinstance(config_version, bool) and config_version >= 11


def _composed_frames(ctx: dict, template: str | None) -> tuple[list[str] | None, bool | None]:
    """(frame names, spread) of a page template with its extends chain, or
    (None, None) when the edition has no template of that id."""
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import composed_check  # noqa: PLC0415
    except ImportError:
        return None, None
    tpl = ctx.get("templates") or []
    frames = composed_check.resolve_frames(tpl, template or "") if template else None
    if frames is None:
        return None, None
    return [f["name"] for f in frames], composed_check.template_spread(tpl, template)


def _is_module(ctx: dict, template: str) -> bool:
    """Whether `template` is a module (`role: "module"`, postext 1.48)."""
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import composed_check  # noqa: PLC0415
    except ImportError:
        return False
    return composed_check.is_module(ctx.get("templates") or [], template)


def _has_modules_group(ctx: dict, template: str) -> bool:
    """Whether page template `template` has a group with `modules: true`."""
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import composed_check  # noqa: PLC0415
    except ImportError:
        return True
    return any(g.get("modules") is True for g in composed_check.template_groups(ctx.get("templates") or [], template))


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
        "smallChip": small_cap_chip_styles(cfg),
    }


# Directives that are one line, with no body and no closing fence (parse/blockParser.ts ONE_LINE_DIRECTIVES).
ONE_LINE_DIRECTIVES = {"pagebreak", "numbering", "columnbreak", "space", "toc", "index", "bibliography"}


def one_line_directive_before(lines: list[str], i: int) -> str | None:
    """The one-line directive on the last non-blank line before line i."""
    j = i - 1
    while j >= 0 and not lines[j].strip():
        j -= 1
    m = FENCE_RE.match(lines[j].strip()) if j >= 0 else None
    return m.group(1) if m and m.group(1) in ONE_LINE_DIRECTIVES else None


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
                   anchors: set[str] | None = None, comic_ctx: dict | None = None,
                   engine: tuple[int, int, int] | None = None) -> None:
    """`engine`: the postext version the book is pinned to (None: unpinned,
    the Sandbox's latest release)."""
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
    code_fence: str | None = None  # the marker of an open ``` / ~~~ code listing (postext >= 1.23): read as written
    fn_cited: dict[str, str] = {}
    fn_defined: dict[str, str] = {}
    comic: dict | None = None  # an open :::page / :::strip block, read raw to its closing :::
    page: dict | None = None  # an open ::::page composed page: colons, line, template, frames, depth
    figure: dict | None = None  # an open :::figure: its ::label lines up to :::
    figure_words: dict[str, tuple[int, dict[str, str]]] = {}  # resource id -> (line, words) of the first figure of this file that carries words

    def check_slot(slot: str | None, where: str, what: str) -> None:
        if slot is None:
            return
        mod = page.get("module") if page is not None else None
        if page is None:
            rep.info(where, f"slot={slot!r} on {what} outside a ::::page changes nothing")
        elif mod is not None:
            # postext 1.48: inside a :::module the slots are the module template's frames
            if mod["frames"] is not None and slot not in mod["frames"]:
                rep.error(where, f"slotUnknown: module {mod['template']!r} has no frame {slot!r} (frames: "
                                 f"{sorted(mod['frames'])}); the content goes to the flow frame")
        elif page["frames"] is not None and slot not in page["frames"]:
            rep.error(where, f"slotUnknown: template {page['template']!r} has no frame {slot!r} (frames: "
                             f"{sorted(page['frames'])}); the content goes to the flow frame")

    def check_label_attrs(la: dict, rid: str | None, where: str, has_text: bool) -> None:
        """A ::label line's or a :::label container's attributes."""
        at = la.get("at")
        if not has_text:
            rep.warn(where, "::label with no text draws nothing")
        if not at:
            rep.error(where, "::label needs at=\"anchor\" (an anchor of the resource) or at=\"x% y%\"")
        elif not PERCENT_AT_RE.match(at) and rid in comic_ctx.get("anchors", {}) and \
                at not in comic_ctx["anchors"][rid]:
            rep.error(where, f"labelAnchorUnknown: resource {rid!r} has no anchor {at!r} (anchors: "
                             f"{sorted(x for x in comic_ctx['anchors'][rid] if x)}); the label is not drawn")
        st = la.get("style")
        if st and st not in comic_ctx.get("label_styles", set()):
            rep.error(where, f"label style {st!r} is not in labelStyles {sorted(comic_ctx.get('label_styles', set()))}")

    def open_module(attrs: dict, where: str) -> None:
        """A :::module{template name} block (postext 1.48): the template must be
        a module and the page's template must have a modules group."""
        if page is None:
            rep.info(where, ":::module outside a ::::page is a plain box of its content")
            return
        if page.get("module") is not None:
            rep.error(where, "moduleNested: a :::module inside a :::module is not laid as a module; its blocks "
                             "are the outer module's")
            return
        t = attrs.get("template")
        frames = None
        if not t:
            rep.error(where, ':::module needs template="…" (a pageTemplates id with role "module")')
        else:
            frames, _ = _composed_frames(comic_ctx, t)
            if frames is None:
                rep.error(where, f"moduleUnknown: no pageTemplates entry {t!r}; its content goes to the flow frame")
            elif not _is_module(comic_ctx, t):
                rep.error(where, f"moduleUnknown: template {t!r} is not a module (role: \"module\"); its content "
                                 "goes to the flow frame")
                frames = None
            elif page["frames"] is not None and not page.get("modulesGroup"):
                rep.error(where, f"moduleUnknown: template {page['template']!r} has no modules group "
                                 "(groups: [{ modules: true }]); the module's content goes to the flow frame")
        n = attrs.get("name")
        if n is not None:
            if not n or MODULE_NAME_BAD_RE.search(n):
                rep.warn(where, f"moduleNameRejected: {n!r} has a space, '.', '#', '[' or ']': the module is named "
                                "<template>[n] instead")
            elif n in page.setdefault("moduleNames", set()):
                rep.warn(where, f"moduleNameRejected: another module of this page is named {n!r}: this one is "
                                "named <template>[n] instead")
            page.setdefault("moduleNames", set()).add(n)
        page["module"] = {"template": t, "frames": frames, "depth": len(stack)}

    def close_page(where_line: int, closed: bool) -> None:
        nonlocal page, stack
        if page is None:
            return
        for fname, ln in stack[page["depth"]:]:
            rep.error(f"{name}:{ln}", f":::{fname} is never closed inside the ::::page of line {page['line']}")
        stack = stack[:page["depth"]]
        if not closed:
            rep.error(f"{name}:{page['line']}", "a ::::page is never closed by a fence of as many colons "
                                                f"({page['colons']}){'' if where_line < 0 else ': the next one closes it'}")
        page = None
    for i in range(n, len(lines)):
        raw = lines[i]
        line = raw.strip()
        where = f"{name}:{i + 1}"
        if code_fence is not None:
            m = CODE_FENCE_CLOSE_RE.match(raw)
            if m and m.group(1)[0] == code_fence[0] and len(m.group(1)) >= len(code_fence):
                code_fence = None
                prev_nonblank, prev_kind = True, "fence"
            continue
        if comic is None and not in_math and not in_refs:
            m = CODE_FENCE_OPEN_RE.match(raw)
            if m and not (m.group(2)[0] == "`" and "`" in m.group(3)):
                code_fence = m.group(2)
                prev_nonblank, prev_kind = True, "fence"
                continue
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
        if raw.startswith("\u2060\u00a0") or (raw.startswith("\u2060") and "\u00a0\u00a0" in raw):
            rep.warn(where, "a code line kept with a word joiner and no-break spaces: write the listing as a ``` fence (postext >= 1.23), as written")
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
            ms = RESOURCE_SLOT_RE.match(line) if not m else None
            rid = m.group(1) if m else (ms.group(1) or ms.group(4)) if ms else None
            if rid is None:
                rep.error(where, '::resource must be exactly ::resource{id="…"} (double quotes, no other attribute; '
                                 'on a composed page also slot="…")')
            else:
                if ms:
                    check_slot(ms.group(2) or ms.group(3), where, "a ::resource")
                embedded.add(rid)
                if rid not in res_ids:
                    rep.error(where, f"unknown resource id {rid!r}")
                if prev_nonblank and prev_kind in ("para", "list"):
                    rep.error(where, "::resource glued to the text above is swallowed into it: add a blank line")
            prev_nonblank, prev_kind = True, "resource"
            continue
        # a :::figure's ::label lines, up to its :::
        if figure is not None:
            if figure.get("label") is not None:
                # postext 1.48: every line of a :::label container is a line of the label, up to its :::
                if line == ":::":
                    figure["label"] = None
                continue
            lc = FENCE_RE.match(line)
            if lc and lc.group(1) == "label":
                check_label_attrs(parse_attrs(lc.group(2)), figure["resource"], where, has_text=True)
                figure["label"] = i + 1
                continue
            if line == ":::":
                if figure["words"]:
                    words = {k: v for k, (_, v) in figure["words"].items()}
                    first_line, first_words = figure_words.setdefault(figure["resource"], (figure["line"], words))
                    if first_line != figure["line"]:
                        # postext >= 1.42: only words that differ from the first figure's (or that it left
                        # unsaid) are lost, and the engine says so (figureWordsShared)
                        lost = [k for k in FIGURE_WORD_KEYS if k in words and first_words.get(k) != words[k]]
                        if lost:
                            rep.warn(f"{name}:{figure['line']}",
                                     f"figureWordsShared (postext 1.42): resource {figure['resource']!r} already has its "
                                     f"words from the figure at line {first_line}, so this figure's {'/'.join(lost)} are "
                                     "not shown: declare a second resource that points at the same fileId (its own "
                                     "id and anchors) and give this figure that one")
                figure = None
                stack.pop()
                prev_nonblank, prev_kind = True, "fence"
                continue
            fw = figure_word(line)
            if fw:
                # postext >= 1.39: the edition's own words for the picture (a line wins over the attribute)
                if fw[0] in figure["words"] and figure["words"][fw[0]][0] == "line":
                    rep.warn(where, f"::{fw[0]} given twice in one :::figure: the last one counts")
                figure["words"][fw[0]] = ("line", fw[1])
                if fw[0] == "alt" and not fw[1].strip():
                    rep.info(where, "::alt[] marks the picture decorative (no alt text)")
                continue
            lm = LABEL_RE.match(line)
            if lm:
                check_label_attrs(parse_attrs(lm.group(2)), figure["resource"], where, has_text=bool(lm.group(1).strip()))
                continue
            rep.error(f"{name}:{figure['line']}", "a :::figure ends at its first line that is neither a ::label, "
                                                  "::alt / ::caption / ::note nor blank: close it with ::: before line "
                                                  + str(i + 1))
            figure = None
            stack.pop()
        # composed pages: four or more colons, closed by as many
        pm = PAGE_FENCE_RE.match(line)
        if pm:
            if page is not None:
                close_page(i + 1, False)
            elif stack:
                rep.warn(where, f"::::page inside :::{stack[-1][0]}: a composed page sits at the top level of a chapter")
            pa = parse_attrs(pm.group(2))
            t = pa.get("template")
            for pid in re.findall(r"([A-Za-z0-9_-]+)\s*[=:]\s*#?[0-9a-fA-F]{3,8}", pa.get("palette", "")):
                if pid not in comic_ctx.get("palette", {"main-color"}):
                    rep.warn(where, f"page palette id {pid!r} is not in colorPalette (nothing on this page will be "
                                    "recoloured); postext >= 1.42 applies a page fence's palette")
            frames, spread = _composed_frames(comic_ctx, t)
            if not t:
                rep.error(where, "templateUnknown: a ::::page needs template=\"…\" (a pageTemplates id)")
            elif frames is None:
                known = sorted(x.get("id") for x in comic_ctx.get("templates") or [] if isinstance(x, dict))
                rep.error(where, f"templateUnknown: no pageTemplates entry {t!r} (templates: {known}); the page is "
                                 "set in the running text")
            elif spread is not None and spread != ("spread" in pa):
                rep.warn(where, f"spreadMismatch: template {t!r} is {'a spread' if spread else 'a single page'}; "
                                f"{'add' if spread else 'remove'} the spread flag on the fence")
            if t and frames is not None and _is_module(comic_ctx, t):
                rep.error(where, f"moduleAsPage: template {t!r} is a module (role: \"module\"): a page fence names a "
                                 "page template, and the page is set in the running text")
            page = {"colons": len(pm.group(1)), "line": i + 1, "template": t, "frames": frames, "depth": len(stack),
                    "module": None, "modulesGroup": _has_modules_group(comic_ctx, t) if t else False}
            prev_nonblank, prev_kind = True, "fence"
            continue
        if re.fullmatch(r":{4,}", line):
            if page is not None and len(line) == page["colons"]:
                close_page(i + 1, True)
            elif page is not None:
                rep.warn(where, f"a fence of {len(line)} colons does not close the ::::page of line {page['line']} "
                                f"({page['colons']} colons): it prints as text")
            else:
                rep.warn(where, f"stray {line} with no open ::::page prints literally")
            prev_nonblank, prev_kind = True, "fence"
            continue
        # comic blocks: raw bodies up to the closing :::
        cm = COMIC_FENCE_RE.match(line)
        if cm and cm.group(1) == "page" and "template" in parse_attrs(cm.group(2)):
            rep.warn(where, "pageFenceLength: a composed page needs four colons (::::page{template=…} … ::::); "
                            "with three it is read as a comic page")
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
                # A bare ::: never closes a ::::page nor a container opened before it.
                if not stack or (page is not None and len(stack) <= page["depth"]):
                    directive = one_line_directive_before(lines, i)
                    if directive:
                        rep.warn(where, f"strayFence: :::{directive} is one line and takes no closing fence: delete "
                                        "this ::: (postext drops it and reports strayFence)")
                    else:
                        rep.warn(where, "stray ::: with no open container prints literally")
                else:
                    stack.pop()
                    if page is not None and page.get("module") is not None and len(stack) <= page["module"]["depth"]:
                        page["module"] = None
                prev_nonblank, prev_kind = True, "fence"
                continue
            m = FENCE_RE.match(line)
            if not m:
                rep.error(where, "malformed fence (lowercase name, optional {attrs}, nothing after it on the line)")
                continue
            fname, attrs = m.group(1), parse_attrs(m.group(2))
            if fname == "module":
                open_module(attrs, where)
                stack.append((fname, i + 1))
                prev_nonblank, prev_kind = True, "fence"
                continue
            if fname in COMPOSED_CONTAINERS:
                if fname == "frame":
                    if "slot" not in attrs:
                        rep.error(where, ':::frame needs slot="…" (the name of a frame of the page template)')
                    elif page is None:
                        rep.warn(where, ":::frame outside a ::::page: its slot changes nothing")
                    else:
                        check_slot(attrs["slot"], where, "a :::frame")
                    if "title" in attrs and re.search(r"\*\*|\*[^*]+\*", attrs["title"]):
                        rep.warn(where, "frame titles are plain text: ** / * print literally")
                    stack.append((fname, i + 1))
                else:
                    rid = attrs.get("resource")
                    if not rid:
                        rep.error(where, ':::figure needs resource="…"')
                    else:
                        embedded.add(rid)
                        if rid not in res_ids:
                            rep.error(where, f"unknown resource id {rid!r}")
                    check_slot(attrs.get("slot"), where, "a :::figure")
                    figure = {"resource": rid, "line": i + 1,
                              "words": {k: ("attr", attrs[k]) for k in FIGURE_WORD_KEYS if k in attrs}}
                    stack.append((fname, i + 1))
                prev_nonblank, prev_kind = True, "fence"
                continue
            if fname in KNOWN_CONTAINERS:
                if "slot" in attrs:
                    check_slot(attrs["slot"], where, f"a :::{fname}")
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
                    if "wrap" in attrs:
                        # postext >= 1.24: text wrap round a box.
                        if attrs["wrap"] not in ("none", "left", "right", "start", "end"):
                            rep.error(where, f"callout wrap={attrs['wrap']!r} is ignored (none | left | right | start | end)")
                        elif attrs.get("span") in ("page", "side") or attrs.get("placement") == "fixed":
                            rep.warn(where, "callout wrap only applies to a span='column' box set here or floated (auto/top/bottom)")
                        w = attrs.get("width")
                        if w is not None and not re.fullmatch(r"0?\.\d+", w):
                            rep.warn(where, f"callout width={w!r} is no share of the column between 0 and 1 (layout.wrap.defaultWidth is used)")
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
                    # A box sets its groups; so does a composed page (a :::frame, a :::module or a piece slotted
                    # to a frame: the frame lays them as a box does). In the running text a group is set from
                    # postext 1.25 (layout.flowColumns, configVersion 11); a config stored before reads it off.
                    if not any(s[0] == "callout" for s in stack) and page is None \
                            and (not comic_ctx.get("flow_columns", True) or (engine is not None and engine < (1, 25, 0))):
                        rep.warn(where, ":::columns in the running text is ignored with layout.flowColumns off "
                                        "(configVersion below 11 reads it so): set configVersion 21, or put the "
                                        "group in a :::callout")
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
                if fname == "numbering" and "lines" in attrs and not re.fullmatch(r"\s*\d+\s*", attrs["lines"]):
                    rep.warn(where, f"numbering lines {attrs['lines']!r} is not a whole number >= 0 (ignored)")
                if fname == "verse":
                    for k, lo in (("lineStart", 0), ("interval", 1)):
                        if k in attrs and not (re.fullmatch(r"\s*\d+\s*", attrs[k]) and int(attrs[k]) >= lo):
                            rep.warn(where, f"verse {k} {attrs[k]!r} is not a whole number >= {lo} (ignored)")
            else:
                rep.error(where, f":::{fname} is not a Postext container or directive (prints literally). "
                                 f"Containers: {sorted(KNOWN_CONTAINERS)}; directives: {sorted(KNOWN_DIRECTIVES - COMIC_BLOCKS)}; "
                                 f"comic blocks: {sorted(COMIC_BLOCKS)}; composed pages (postext >= 1.34): "
                                 f"::::page, {sorted(COMPOSED_CONTAINERS)}")
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
                if "slot" in attrs:
                    check_slot(attrs["slot"], where, "a heading")
            elif re.search(r"\{[^{}]*\}\s*$", title):
                rep.warn(where, "trailing {…} that does not parse as attributes, so it prints in the title (commas, "
                                "a value holding }, a flag glued to the title?)")
            if FOOTNOTE_MARK_RE.search(title):
                rep.warn(where, "[^id] in a heading prints as written: cite the note from the text")
            if ":chip[" in title:
                if engine is not None and engine < HEADING_CHIPS_SINCE:
                    rep.warn(where, f"headingChip: :chip in a heading prints literally on postext {fmt_version(engine)} "
                                    f"(headings read chips from {fmt_version(HEADING_CHIPS_SINCE)}): update the pin, "
                                    "or set the chip's words in the heading style's design")
                else:
                    if engine is None and "heading chip" not in rep.once:
                        rep.once.add("heading chip")
                        rep.info(where, f"headingChip: headings read :chip from postext "
                                        f"{fmt_version(HEADING_CHIPS_SINCE)}; an older engine prints it literally "
                                        "(pass --engine <version> when a program pins one)")
                    for cm in CHIP_RE.finditer(title):
                        st = parse_attrs((cm.group(2) or "{}")[1:-1]).get("style")
                        if st and st not in ids["chip"]:
                            rep.error(where, f"chip style {st!r} is not in chipStyles {sorted(ids['chip'])}")
                    check_small_cap_chips(where, title, ids, rep)
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
        check_small_cap_chips(where, line, ids, rep)
        for m in re.finditer(r":swatch\{([^}]*)\}", line):
            col = parse_attrs(m.group(1)).get("color", "")
            if not col:
                rep.error(where, ":swatch needs color=")
            elif not re.fullmatch(r"#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}", col) and col not in ids["palette"]:
                rep.warn(where, f"swatch colour {col!r} is neither #hex nor a palette id (draws an empty outline)")
    if figure is not None:
        rep.error(f"{name}:{figure['line']}", ":::figure is never closed")
    if page is not None:
        close_page(-1, False)
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
    check_fixed_spaces(where, text or "", rep, per_line=False)


# --- agent faults before delivery (#1112) ------------------------------------

# Fixed-width and no-break spaces: each sets its own width (or glues two
# words), so a plain space typed beside one adds a word space to the gap.
FIXED_SPACES = {
    " ": "no-break space", " ": "en space", " ": "em space", " ": "three-per-em space",
    " ": "four-per-em space", " ": "six-per-em space", " ": "figure space",
    " ": "punctuation space", " ": "thin space", " ": "hair space",
    " ": "narrow no-break space", " ": "medium mathematical space",
}
_FIXED_CLASS = "[" + "".join(FIXED_SPACES) + "]"
FIXED_PLUS_SPACE_RE = re.compile(_FIXED_CLASS + r" +(?=\S)|(?<=\S) +" + _FIXED_CLASS)
SWATCH_END_RE = re.compile(r":swatch\{[^}\n]*\}$")

# Inline marks a design text element reads only with `inlineMarks: true`
# (and that print as written without it). Placeholders are taken out first.
DESIGN_MARK_RES = [
    (re.compile(r"(?<![\\*])\*\*(?=\S)[^*\n]*?[^\s\\]\*\*"), "**bold**"),
    (re.compile(r"(?<![\\*\w])\*(?=[^\s*])[^*\n]*?[^\s*\\]\*(?![*\w])"), "*italic*"),
    (re.compile(r"(?<![\\\w])__?(?=[^\s_])[^_\n]*?[^\s_\\]__?(?!\w)"), "_italic_"),
    (re.compile(r"(?<![\\^\w])\^[^\s^]{1,24}\^"), "^sup^"),
    (re.compile(r"(?<![\\~])~[^\s~]{1,24}~(?!~)"), "~sub~"),
]
DESIGN_DIRECTIVE_RE = re.compile(r":(mark|smallcaps|chip)\[")
CHIP_RE = re.compile(r":chip\[((?:\\.|[^\]\\\n])+)\](\{[^}\n]*\})?")
PLACEHOLDER_RE = re.compile(r"\{[^{}\n]*\}")
ATTR_PLACEHOLDER_RE = re.compile(r"\{attr\.([A-Za-z0-9_-]+)\}")
# Chips are read in headings from postext 1.52.0 (#1100).
HEADING_CHIPS_SINCE = (1, 52, 0)


def parse_version(s) -> tuple[int, int, int] | None:
    """(major, minor, patch) of a version or a range's floor (`^1.46.2`,
    `>=1.50`), None for `latest`, `*` or nothing."""
    m = re.search(r"(\d+)\.(\d+)(?:\.(\d+))?", s or "") if isinstance(s, str) else None
    return (int(m.group(1)), int(m.group(2)), int(m.group(3) or 0)) if m else None


def pinned_engine(root: Path, cli: str | None = None) -> tuple[tuple[int, int, int] | None, str]:
    """The postext version the book will open in, and where it was read:
    --engine, else the project's package.json (a program that pins
    `postext`), else a Cookbook recipe.json (`engine.postext`). None when
    nothing pins it (the Sandbox runs the latest release)."""
    if cli:
        return parse_version(cli), "--engine"
    pkg = root / "package.json"
    if pkg.is_file():
        try:
            data = json.loads(pkg.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            data = {}
        for k in ("dependencies", "devDependencies", "peerDependencies"):
            v = (data.get(k) or {}).get("postext") if isinstance(data.get(k), dict) else None
            if v and parse_version(v):
                return parse_version(v), f"package.json {k}"
    rec = root / "recipe.json"
    if rec.is_file():
        try:
            v = ((json.loads(rec.read_text(encoding="utf-8")).get("engine") or {}).get("postext"))
        except (ValueError, OSError, AttributeError):
            v = None
        if parse_version(v):
            return parse_version(v), "recipe.json engine.postext"
    return None, ""


def fmt_version(v: tuple[int, int, int]) -> str:
    return ".".join(str(x) for x in v)


def _dim_ratio(d, body_pt: float | None) -> float | None:
    """A font size as a share of the surrounding text: em directly, pt (or
    px) against the body size."""
    if not isinstance(d, dict) or not isinstance(d.get("value"), (int, float)):
        return None
    unit, v = d.get("unit"), float(d["value"])
    if unit == "em":
        return v
    if unit in ("pt", "px") and body_pt:
        return (v * 0.75 if unit == "px" else v) / body_pt
    return None


def small_cap_chip_styles(cfg: dict) -> set[str]:
    """Chip styles that only shrink the text: no fill, no outline and a size
    between 55 and 85 % of the text round them, the size small capitals
    are set at. Capitals typed in such a chip imitate small capitals."""
    body = (cfg.get("bodyText") or {}).get("fontSize") if isinstance(cfg.get("bodyText"), dict) else None
    body_pt = float(body["value"]) if isinstance(body, dict) and body.get("unit") == "pt" and \
        isinstance(body.get("value"), (int, float)) else None
    out: set[str] = set()
    for s in cfg.get("chipStyles") or []:
        if not isinstance(s, dict) or not s.get("id"):
            continue
        r = _dim_ratio(s.get("fontSize"), body_pt)
        bw = s.get("borderWidth")
        no_outline = isinstance(bw, dict) and bw.get("value") == 0
        if r is not None and 0.55 <= r <= 0.85 and s.get("backgroundEnabled") is False and no_outline \
                and not s.get("dotted"):
            out.add(s["id"])
    return out


def capitals_run(text: str) -> bool:
    """Two or more letters, every cased one a capital."""
    letters = [c for c in text if c.isalpha()]
    cased = [c for c in letters if c.upper() != c.lower()]
    return len(cased) >= 2 and all(c.isupper() for c in cased)


def check_small_cap_chips(where: str, line: str, ids: dict, rep: Report) -> None:
    small = ids.get("smallChip") or set()
    if not small:
        return
    for m in CHIP_RE.finditer(line):
        st = parse_attrs((m.group(2) or "{}")[1:-1]).get("style")
        if st in small and capitals_run(m.group(1)):
            rep.warn(where, f"smallCapsByHand: :chip[{m.group(1)}] sets capitals at small-capital size "
                            f"(chip style {st!r}): type the word in lowercase in :smallcaps[…] (capitals keep "
                            "the full size, as in the source) or give the style smallCaps")


def fixed_space_hits(text: str) -> list[tuple[int, str, str]]:
    """(1-based line, space name, excerpt) of each plain space typed beside
    a fixed or no-break space, code listings left out."""
    out: list[tuple[int, str, str]] = []
    fence: str | None = None
    for i, line in enumerate((text or "").split("\n"), 1):
        cm = CODE_FENCE_OPEN_RE.match(line)
        if fence is None and cm:
            fence = cm.group(2)[0]
            continue
        if fence is not None:
            if CODE_FENCE_CLOSE_RE.match(line) and line.strip()[0] == fence:
                fence = None
            continue
        for m in FIXED_PLUS_SPACE_RE.finditer(line):
            if SWATCH_END_RE.search(line[:m.start()]):
                continue  # room after a swatch, which has no gap of its own to set
            ch = next(c for c in m.group(0) if c in FIXED_SPACES)
            a, b = max(0, m.start() - 12), min(len(line), m.end() + 12)
            excerpt = line[a:b].translate({ord(c): "␣" for c in FIXED_SPACES})
            out.append((i, f"U+{ord(ch):04X} {FIXED_SPACES[ch]}", excerpt))
    return out


def check_fixed_spaces(where: str, text: str, rep: Report, per_line: bool = True) -> None:
    """One warning per text: how many places, the first with its excerpt."""
    hits = fixed_space_hits(text)
    if not hits:
        return
    ln, name, excerpt = hits[0]
    lines = sorted({h[0] for h in hits})
    at = f"{where}:{ln}" if per_line else where
    more = f" (lines {', '.join(map(str, lines[:8]))}{'…' if len(lines) > 8 else ''})" if per_line and len(lines) > 1 else ""
    rep.warn(at, f"fixedSpacePlusSpace: {len(hits)} plain space(s) typed beside a fixed space ({name}: "
                 f"\"{excerpt}\", ␣ = the fixed space){more}: the line sets both, a gap wider than the "
                 "source's. Keep the fixed space alone")


def marked_attr_values(texts: list[tuple[str, str]]) -> dict[str, tuple[str, str]]:
    """Attribute values in the Markdown that carry inline marks, by key
    (heading blocks, container and page fences): {key: (where, value)}."""
    out: dict[str, tuple[str, str]] = {}
    for name, text in texts:
        for i, line in enumerate(text.split("\n"), 1):
            attrs: dict[str, str] | None = None
            hm = HEADING_RE.match(line)
            if hm:
                attrs = split_heading_attrs(hm.group(2))[1]
            else:
                fm = FENCE_RE.match(line) or PAGE_FENCE_RE.match(line)
                if fm and fm.group(2):
                    attrs = parse_attrs(fm.group(2))
            for k, v in (attrs or {}).items():
                if k not in out and design_marks(v):
                    out[k] = (f"{name}:{i}", v)
    return out


def design_marks(text: str) -> list[str]:
    """The inline marks a text holds, placeholders and escapes left out."""
    s = PLACEHOLDER_RE.sub(" ", text or "")
    found = [label for rx, label in DESIGN_MARK_RES if rx.search(s)]
    found += [f":{m.group(1)}[…]" for m in DESIGN_DIRECTIVE_RE.finditer(s)]
    return found


def check_design_text(cfg: dict, where: str, marked_attrs: dict[str, tuple[str, str]], rep: Report) -> None:
    """Design text elements: marks typed (or brought in by `{attr.key}`)
    without `inlineMarks`, and fixed spaces with a plain space beside them."""
    for path, el in design_elements(cfg):
        content = el.get("content")
        if el.get("kind") != "text" or not isinstance(content, str):
            continue
        at = f"{where} {path}" + (f" ({el['id']})" if el.get("id") else "")

        def once(key: str) -> bool:
            k = f"design {path} {key}"
            if k in rep.once:
                return False
            rep.once.add(k)
            return True

        if FIXED_PLUS_SPACE_RE.search(content) and once("space"):
            check_fixed_spaces(at, content, rep, per_line=False)
        marks = design_marks(content)
        if el.get("inlineMarks") is True:
            directives = [x for x in marks if x.startswith(":")]
            if directives and once("directive"):
                rep.info(at, f"design text reads bold, italic and scripts only: {', '.join(directives)} sets its "
                             "words plain (the markup is dropped)")
            continue
        if marks and once("marks"):
            rep.warn(at, f"designMarksLiteral: the text holds {', '.join(marks)} but the element has no "
                         "inlineMarks: true, so the markers print as written. Set inlineMarks: true (or take "
                         "the marks out)")
        for m in ATTR_PLACEHOLDER_RE.finditer(content):
            hit = marked_attrs.get(m.group(1))
            if hit and once(f"attr {m.group(1)}"):
                rep.warn(at, f"designMarksLiteral: {{attr.{m.group(1)}}} brings \"{hit[1][:40]}\" ({hit[0]}) with "
                             f"{', '.join(design_marks(hit[1]))}, and the element has no inlineMarks: true, so the "
                             "markers print as written. Set inlineMarks: true on the element")


def layered_locales(cv: Any) -> bool:
    """Whether a localized config is merged field by field (configVersion
    21 and later) rather than replacing top-level keys whole."""
    return isinstance(cv, (int, float)) and not isinstance(cv, bool) and cv >= 21


def edition_config(shared: dict, own: Any, cv: Any) -> dict:
    """An edition's config as the engine reads it (preset_kit.edition_config)."""
    if not isinstance(own, dict):
        return shared
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import preset_kit  # noqa: PLC0415
        return preset_kit.edition_config(shared, own, cv)
    except ImportError:
        return {**shared, **own}


def check_content_in_config(m: dict, root: Path, rep: Report) -> None:
    """Text of the book typed into design text elements (preset_kit.py lint):
    one error per owner that holds some (counted as the engine's
    contentInConfig warning), and the size of the config."""
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import preset_kit  # noqa: PLC0415
    except ImportError:
        return

    def read(rel: str) -> str | None:
        f = root / rel
        return f.read_text(encoding="utf-8", errors="replace") if f.is_file() else None

    res = preset_kit.lint_manifest(m, read=read)
    groups: dict[str, list[dict]] = {}
    for f in res["findings"]:
        groups.setdefault(f["owner"], []).append(f)
    for owner, fs in groups.items():
        first = fs[0]
        sample = first["text"] if len(first["text"]) <= 50 else first["text"][:47] + "..."
        oid = f" ({first['ownerId']})" if first.get("ownerId") else ""
        eds = sorted({e for f in fs for e in f["editions"] if e})
        rep.error(f"{owner}{oid}",
                  f"contentInConfig: {len(fs)} design text(s) hold {sum(f['chars'] for f in fs)} letters and digits "
                  f"of the book's text ({first['path']}: \"{sample}\"){' in ' + ', '.join(eds) if len(eds) > 1 else ''}. "
                  "Content goes in the Markdown (headings, callouts, :::paragraphs, {attr.key} attributes); allow a "
                  "publisher's name or running-head literal with config.checks.contentInConfig.allow. "
                  "`preset_kit.py lint` lists them all")
    size = res["configBytes"]
    if size >= preset_kit.SIZE_WARN_BYTES:
        rep.warn("preset.json config", f"the config is {size / 1048576:.1f} MB: the Sandbox keeps a book in about "
                 "5 MB of browser storage; aim under 1 MB (one style per kind of page, not per page)")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("project")
    ap.add_argument("--lang", help="check only this locale (default: every locale in chapters)")
    ap.add_argument("--strict", action="store_true", help="exit 1 on warnings too")
    ap.add_argument("--quiet", action="store_true", help="hide INFO lines")
    ap.add_argument("--engine", help="the postext version the book will open in (default: the project's "
                                     "package.json or recipe.json pin; unpinned = the Sandbox's latest release)")
    args = ap.parse_args()
    root = Path(args.project)
    rep = Report()
    engine, _ = pinned_engine(root, args.engine)
    mf = root / "preset.json"
    if not mf.exists():
        sys.exit(f"{mf} not found")
    m = json.loads(mf.read_text(encoding="utf-8"))
    if m.get("version") not in (1, 2):
        rep.error("preset.json", "version must be 1 or 2")
    cv = m.get("configVersion")
    if isinstance(cv, bool) or not isinstance(cv, (int, float)) or cv < 14:
        rep.warn("preset.json", "configVersion is missing or below 14: the bundle reads with older rules "
                 "(up to 1.4: H1 breaks pinned, maths x 1.1312, inline gap 'above'; below 6: heading marks plain, "
                 "drop caps at the 1.4 size, one line of room under a colon line before its list, no gap around "
                 "inline figures in boxes, box cuts that may leave one line of a paragraph; below 7: no line "
                 "break after a closed dash, ragged text set line by line; below 8: no Knuth-Plass break "
                 "after a compound's hyphen in a justified paragraph without formatting, a paragraph under a "
                 "heading at a column foot split 1.4's way, as many lines as fit however few go on, and the "
                 "space under a :::paragraphs container added to the next block's instead of merged with it; "
                 "below 9: a :::verse poem with no || set as centred hemistichs, a paragraph style's "
                 "firstLineIndent dropped when it also hangs, a backslash ending a line printed instead of "
                 "breaking it, a ``` fence's lines read as Markdown; below 10: a line of verse a little too wide "
                 "turned over instead of tightening its word spaces; below 11: a horizontal page on a character "
                 "grid balanced unless the config says otherwise; below 12: the widow rule on a character grid, and "
                 "the orphan rule too in the Japan region, on unless the config says otherwise, and a :warichu note "
                 "broken where one of its characters is left alone on a line, and in Japanese text no quarter em next to "
                 "the brackets and signs of a Western word; below 13: the box of a task item set as a character "
                 "of the list's face instead of drawn; below 14: the text measured in the language of the "
                 "page that hosts the layout, and in none in a worker, instead of the document's own, unless "
                 "the config names bodyText.shapingLanguage; below 17: a paragraph style's unset face, size, "
                 "leading, weights and colour inside a box taken from the document's body text instead of the box's; "
                 "below 18: a mark style that names no borderRadius rounded at 0.2em when the text has a :mark; "
                 "below 19: formatted text, captions, cells and notes broken after a slash only inside a web "
                 "address, never between two words such as ACC/AHA; below 20: a ```abc fence read as code, not a "
                 "score; below 21: each top-level key of a localized config replacing the shared one whole); "
                 "set \"configVersion\": 21 for today's rules")
    for k in ("id", "name"):
        if not m.get(k):
            rep.error("preset.json", f"{k} is required")
    fonts = {f.get("name") for f in m.get("fonts", [])}
    licensed = {f.get("name") for f in m.get("fonts", []) if f.get("redistributable") is False}
    for f in m.get("fonts", []):
        check_font_fallback(f, rep, licensed)
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
    check_content_in_config(m, root, rep)

    comic_editions: dict[str, list] = {}
    coverage = ...  # loaded on the first locale with CJK text
    font_files_checked = False
    arabic_files_checked = False
    for lang in langs:
        specs = chapters.get(lang) or []
        loc = (m.get("localized") or {}).get(lang, {})
        cfg = edition_config(shared, loc.get("config"), cv)
        if loc.get("config"):
            check_config(loc["config"], f"localized.{lang}.config", fonts, rep, partial=True)
            check_folio(loc["config"], f"localized.{lang}.config", resources, rep)
            check_comics_config(loc["config"], f"localized.{lang}.config", rep)
            # Before configVersion 21 a localized key replaced the shared one
            # whole; from 21 it is merged field by field.
            if not layered_locales(cv):
                for k, v in loc["config"].items():
                    if isinstance(v, dict) and isinstance(shared.get(k), dict) and set(shared[k]) - set(v):
                        rep.warn(f"localized.{lang}.config.{k}", f"replaces the shared `{k}` wholesale (configVersion below 21); missing keys {sorted(set(shared[k]) - set(v))[:6]} fall back to defaults. Set \"configVersion\": 21 to merge it field by field")
        check_line_numbers(cfg, f"config ({lang})", rep)
        check_code_style(cfg, f"config ({lang})", rep)
        check_callout_extends(cfg, f"config ({lang})", rep)
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
        comic_ctx["flow_columns"] = flow_columns_on(cfg, cv)
        for i, c in enumerate(specs):
            p = root / c.get("file", "")
            if not p.exists():
                rep.error("preset.json", f"missing chapter file {c.get('file')}")
                continue
            chapter = p.read_text(encoding="utf-8")
            texts.append((c["file"], chapter))
            check_markdown(c["file"], chapter, i, ids, res_ids, rep, embedded, referenced, index, book_anchors, comic_ctx,
                           engine=engine)
            check_fixed_spaces(c["file"], chapter, rep)
            if CJK_RE.search(chapter):
                check_cjk_lines(c["file"], chapter, rep, japanese_book or is_japanese_text(
                    len(KANA_RE.findall(chapter)), len(HAN_RE.findall(chapter))))
        check_index(index, rep, lang, japanese_book)
        check_design_text(cfg, f"config ({lang})", marked_attr_values(texts), rep)
        check_tab_stops(cfg, f"config ({lang})", texts, rep)
        check_drop_caps(cfg, f"config ({lang})", texts, rep)
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
            pl = {**((types.get(r.get("typeId")) or {}).get("defaultPlacement") or {}), **(r.get("placement") or {})}
            wrap = pl.get("wrap")
            if wrap not in (None, "none"):
                # postext >= 1.24: text wrap round a picture.
                if wrap not in ("left", "right", "start", "end"):
                    rep.warn(f"resource {rid}", f"placement.wrap {wrap!r} is no side (left | right | start | end): it keeps its band")
                elif pl.get("rotate") or pl.get("span") in ("page", "side") or (pl.get("columns") or 1) > 1 or pl.get("captionSide"):
                    rep.warn(f"resource {rid}", "placement.wrap applies to an inline embed or a one-column float: this one keeps its band")
                elif ((cfg.get("layout") or {}).get("writingMode")) == "vertical-rl":
                    rep.warn(f"resource {rid}", "placement.wrap is ignored in vertical text (textWrap verticalText)")
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
