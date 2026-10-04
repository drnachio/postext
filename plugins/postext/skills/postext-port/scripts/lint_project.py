#!/usr/bin/env python3
"""Static checks for a Postext project (preset.json + chapters + files).

    lint_project.py <project> [--lang es] [--strict]

Catches what the Postext parser and loader silently get wrong: CommonMark
habits that print literally (pipe tables, code fences, HTML,
`---` rules), blocks swallowed into the previous paragraph, line-start traps,
unknown style/resource ids, malformed `::resource`, unbalanced fences, config
keys that crash or silently reset (em units, H1 page breaks, `main-color`),
missing files and bitmap sizes; for Chinese, Japanese and Korean text, the
document language, markup typed with an input method, and whether the bundled
fonts have a glyph for every character the chapters set (with fontTools
installed; without it that check is skipped). Pure Python otherwise.

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
KNOWN_DIRECTIVES = {"pagebreak", "numbering", "columnbreak", "space", "toc", "index", "bibliography", "references"}
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
    "binding.type": {"hardcover", "paperback", "sewn", "layflat", "saddleStitch"},
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
FULLWIDTH_MARKUP = [
    (re.compile(r"^\s*：：："), "：：：", ":::"),
    (re.compile(r"^\s*＃{1,6}[ 　]"), "＃", "#"),
    (re.compile(r"［＾[^］]*］"), "［＾…］", "[^…]"),
    (re.compile(r"＊＊[^＊]+＊＊"), "＊＊…＊＊", "**…**"),
]
LATIN_ONLY_FAMILIES = {"EB Garamond", "Open Sans", "Lora", "Geist", "Fraunces", "Newsreader", "Source Serif 4",
                       "Alegreya", "Playfair Display", "Merriweather", "Inter", "Roboto"}


def check_cjk_lines(name: str, text: str, rep: Report) -> None:
    """Markup typed with a Chinese or Japanese input method, and ideographic
    spaces typed as a paragraph indent."""
    prev_blank = True
    for i, raw in enumerate(text.split("\n")):
        where = f"{name}:{i + 1}"
        for rx, typed, ascii_ in FULLWIDTH_MARKUP:
            if rx.search(raw):
                rep.warn(where, f"{typed} typed with an input method prints as text (fullwidthMarkup): type {ascii_}")
        if prev_blank and raw.startswith("　"):
            rep.info(where, "paragraph starts with ideographic spaces (U+3000), which the parser drops: "
                            "indent with bodyText.firstLineIndent {value: 2, unit: 'em'}")
        prev_blank = not raw.strip()


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
                    rep.warn(where, "the book is vertical but this Chinese face has no `vert` feature: brackets and "
                                    "punctuation are turned instead of taking their vertical forms (keep layout "
                                    "features when subsetting: fonts.py subset keeps them)")


def has_han(font) -> bool:
    cmap = font.getBestCmap() or {}
    return any(0x4E00 <= cp <= 0x9FFF for cp in cmap)


def check_cjk_coverage(where: str, chars: dict[str, set[str]], cfg: dict, coverage: dict | None,
                       fonts: set[str], rep: Report, roles: dict[str, set[str]] | None = None) -> None:
    """Every CJK character a family sets must be in each of its bundled files:
    Postext sets one family per style and takes nothing from another family."""
    for family, used in chars.items():
        if not used:
            continue
        sample = "".join(sorted(used)[:12])
        if family in LATIN_ONLY_FAMILIES:
            by = ", ".join(sorted((roles or {}).get(family, ()))) or "bodyText/headings fontFamily"
            rep.error(where, f"{len(used)} CJK characters ({sample}…) are set in {family}, which has none: "
                             f"set {by} to a Chinese face (Noto Serif SC/TC, Noto Sans SC/TC), or give that text a "
                             "paragraph or heading style that has one")
            continue
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
                rep.error(where, f"{family} {label} has no glyph for {len(missing)} of the {len(used)} CJK characters it sets: "
                                 f"{''.join(missing[:20])}{'…' if len(missing) > 20 else ''} (they print as empty boxes; "
                                 "subset from a face that has them: fonts.py subset FONT --out fonts/ --text-from chapters/)")


def _styles_by_id(cfg: dict, key: str) -> dict[str, dict]:
    v = cfg.get(key)
    return {s.get("id"): s for s in v if isinstance(s, dict)} if isinstance(v, list) else {}


def cjk_chars_by_family(texts: list[tuple[str, str]], cfg: dict) -> tuple[dict[str, set[str]], dict[str, set[str]]]:
    """The CJK characters each family sets, and the settings that set them
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

    def add(fam: str, role: str, text: str) -> None:
        chars = {c for c in CJK_RE.findall(text) if c != "　"}
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
        for line in (l.strip() for l in lines[start:]):
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


def check_cjk_locale(where: str, texts: list[tuple[str, str]], cfg: dict, rep: Report) -> None:
    han = sum(len(HAN_RE.findall(t)) for _, t in texts)
    if not han:
        return
    loc = cfg.get("locale") or ((cfg.get("bodyText") or {}).get("hyphenation") or {}).get("locale")
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


def check_index(index: dict, rep: Report, lang: str) -> None:
    """Book-level checks of the index marks and :::index directives."""
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
                   anchors: set[str] | None = None) -> None:
    anchors = anchors or set()
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
    in_refs = False  # inside a :::references block: its body is raw data
    fn_cited: dict[str, str] = {}
    fn_defined: dict[str, str] = {}
    for i in range(n, len(lines)):
        raw = lines[i]
        line = raw.strip()
        where = f"{name}:{i + 1}"
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
                    if "title" in attrs and re.search(r"\*\*|\*[^*]+\*", attrs["title"]):
                        rep.warn(where, "callout titles are plain text: ** / * print literally")
                elif fname == "paragraphs":
                    s = attrs.get("style")
                    if not s:
                        rep.error(where, ":::paragraphs needs style=\"…\"")
                    elif s not in ids["paragraphs"]:
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
                if fname == "numbering" and "format" in attrs and attrs["format"] not in ("decimal", "lower-roman", "upper-roman", "lower-alpha", "upper-alpha"):
                    rep.error(where, f"numbering format {attrs['format']!r} is invalid")
            else:
                rep.error(where, f":::{fname} is not a Postext container or directive (prints literally). "
                                 f"Containers: {sorted(KNOWN_CONTAINERS)}; directives: {sorted(KNOWN_DIRECTIVES)}")
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
        check_snippet(where + " caption", r.get("caption", ""), res_ids | {x.get('id') for x in resources}, rep)
        check_snippet(where + " note", r.get("note", ""), res_ids | {x.get('id') for x in resources}, rep)
        if "source" in r:
            rep.info(where, "`source` is extraction metadata: drop it from the final manifest")
    check_folio(shared, "preset.json config", resources, rep)

    coverage = ...  # loaded on the first locale with CJK text
    font_files_checked = False
    for lang in langs:
        specs = chapters.get(lang) or []
        loc = (m.get("localized") or {}).get(lang, {})
        cfg = {**shared, **(loc.get("config") or {})}
        if loc.get("config"):
            check_config(loc["config"], f"localized.{lang}.config", fonts, rep, partial=True)
            check_folio(loc["config"], f"localized.{lang}.config", resources, rep)
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
        # Headings with an id and anchors of the whole book: a :ref may name
        # one set in another chapter.
        book_anchors = anchor_ids([(root / c.get("file", "")).read_text(encoding="utf-8")
                                   for c in specs if (root / c.get("file", "")).exists()])
        for i, c in enumerate(specs):
            p = root / c.get("file", "")
            if not p.exists():
                rep.error("preset.json", f"missing chapter file {c.get('file')}")
                continue
            chapter = p.read_text(encoding="utf-8")
            texts.append((c["file"], chapter))
            check_markdown(c["file"], chapter, i, ids, res_ids, rep, embedded, referenced, index, book_anchors)
            if CJK_RE.search(chapter):
                check_cjk_lines(c["file"], chapter, rep)
        check_index(index, rep, lang)
        if any(CJK_RE.search(t) for _, t in texts):
            check_cjk_locale(f"config ({lang})", texts, cfg, rep)
            if coverage is ...:
                coverage = font_coverage(root, m.get("fonts", []))
            chars, roles = cjk_chars_by_family(texts, cfg)
            check_cjk_coverage(f"fonts ({lang})", chars, cfg, coverage, fonts, rep, roles)
            if not font_files_checked:
                vertical = any(((cf.get("layout") or {}).get("writingMode") == "vertical-rl")
                               for cf in [shared] + [(x.get("config") or {}) for x in (m.get("localized") or {}).values()])
                check_font_files(root, m.get("fonts", []), vertical, rep)
                font_files_checked = True
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
