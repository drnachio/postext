#!/usr/bin/env python3
"""Static checks for a Postext project (preset.json + chapters + files).

    lint_project.py <project> [--lang es] [--strict]

Catches what the Postext parser and loader silently get wrong: CommonMark
habits that print literally (pipe tables, code fences, footnotes, HTML,
`---` rules), blocks swallowed into the previous paragraph, line-start traps,
unknown style/resource ids, malformed `::resource`, unbalanced fences, config
keys that crash or silently reset (em units, H1 page breaks, `main-color`),
missing files and bitmap sizes. Pure Python, no dependencies.

Exit code 1 when there are errors (or warnings with --strict).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

KNOWN_CONTAINERS = {"callout", "paragraphs", "part", "columns"}
KNOWN_DIRECTIVES = {"pagebreak", "numbering", "columnbreak", "toc"}
FENCE_RE = re.compile(r"^:::\s*([a-z][a-z0-9-]*)\s*(?:\{([^}]*)\})?\s*$")
ATTR_RE = re.compile(r"([A-Za-z_][A-Za-z0-9_-]*)(?:\s*=\s*(?:\"([^\"]*)\"|'([^']*)'|([^\s]+)))?")
HEADING_RE = re.compile(r"^(#{1,6})\s+(.+)$")
HEADING_ATTRS_RE = re.compile(r"\s+\{([^{}]*)\}\s*$")
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
    for path, val in walk_values(cfg):
        if path.endswith(("offset.x.unit", "offset.y.unit")) and val in ("em", "rem"):
            rep.error(where, f"{path}: design offsets in em throw, use mm/pt")
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


def check_markdown(name: str, text: str, idx: int, ids: dict[str, set[str]], res_ids: set[str], rep: Report,
                   embedded: set[str], referenced: set[str]) -> None:
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
    for i in range(n, len(lines)):
        raw = lines[i]
        line = raw.strip()
        where = f"{name}:{i + 1}"
        if in_math:
            if line == "$$":
                in_math = False
                prev_nonblank, prev_kind = True, "math"
            continue
        if not line:
            prev_nonblank, prev_kind = False, ""
            continue
        # CommonMark habits
        if line.startswith("```") or line.startswith("~~~"):
            rep.error(where, "code fences are not supported (they print literally): use :::paragraphs{style=\"code\"}")
        if re.match(r"^\|.*\|$", line) and not (i > 0 and re.match(r"^\|.*\|$", lines[i - 1].strip())):
            rep.error(where, "pipe tables are not supported: tables are resources (kind \"table\") cited with :ref / ::resource")
        if re.fullmatch(r"(-{3,}|\*{3,}|_{3,})", line):
            rep.error(where, "horizontal rules are not supported: use a paragraph style (asterism) or an ornament resource")
        if re.search(r"\[\^[^\]]+\]", line):
            rep.error(where, "footnotes are not supported: use ^n^ markers + a notes paragraph style, or side callouts")
        if re.search(r"</?[a-zA-Z][a-zA-Z0-9]*(\s[^>]*)?>", line) or re.search(r"&[a-z]+;|&#\d+;", line):
            rep.warn(where, "HTML tags/entities print literally: write the Unicode characters")
        if re.search(r"!\[[^\]]*\]\([^)]*\)", line):
            rep.error(where, "inline images are removed: make the picture a resource and cite it")
        if "~~" in line:
            rep.warn(where, "~~strike~~ is not strikethrough in Postext (it becomes a subscript)")
        # math blocks
        if line == "$$":
            if prev_nonblank and prev_kind == "para":
                rep.error(where, "display math glued to the paragraph above is swallowed into it: add a blank line")
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
                stack.append((fname, i + 1))
            elif fname in KNOWN_DIRECTIVES:
                if any(s[0] == "callout" for s in stack):
                    rep.warn(where, f":::{fname} inside a callout is ignored")
                if fname == "pagebreak" and "parity" in attrs and attrs["parity"] not in ("odd", "even", "always-odd", "always-even"):
                    rep.warn(where, f"pagebreak parity {attrs['parity']!r} means no parity")
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
            title = hm.group(2)
            am = HEADING_ATTRS_RE.search(title)
            if am:
                attrs = parse_attrs(am.group(1))
                if attrs:
                    s = attrs.get("style")
                    if s and s not in ids["heading"]:
                        rep.error(where, f"heading style {s!r} is not in headingStyles {sorted(ids['heading'])}")
                    if "numbered" in attrs:
                        rep.warn(where, "{numbered=…} is not a heading attribute: use a headingStyles entry with numbered:false")
            elif re.search(r"\{[^{}]*\}\s*$", title):
                rep.warn(where, "trailing {…} that does not parse as attributes (a value holding } or a stray brace?)")
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
                if rid not in res_ids:
                    rep.error(where, f":ref to unknown resource {rid!r}")
            if a.get("style") and a["style"] not in ("default", "number", "full"):
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
        if " " in line:
            rep.info(where, "NBSP is an ordinary breakable space in Postext")
    for fname, ln in stack:
        rep.error(f"{name}:{ln}", f":::{fname} is never closed")


def check_snippet(where: str, text: str, res_ids: set[str], rep: Report) -> None:
    if re.search(r"(?<!\\)\$[^$]+\$", text or ""):
        rep.warn(where, "inline $math$ is not supported in captions, notes and table cells")
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

    for lang in langs:
        specs = chapters.get(lang) or []
        loc = (m.get("localized") or {}).get(lang, {})
        cfg = {**shared, **(loc.get("config") or {})}
        if loc.get("config"):
            check_config(loc["config"], f"localized.{lang}.config", fonts, rep, partial=True)
            for k, v in loc["config"].items():
                if isinstance(v, dict) and isinstance(shared.get(k), dict) and set(shared[k]) - set(v):
                    rep.warn(f"localized.{lang}.config.{k}", f"replaces the shared `{k}` wholesale; missing keys {sorted(set(shared[k]) - set(v))[:6]} fall back to defaults")
        ids = style_ids(cfg)
        for r in resources:
            if r.get("typeId") and r["typeId"] not in ids["types"]:
                rep.error(f"resource {r.get('id')}", f"typeId {r['typeId']!r} is not in resourceTypes {sorted(ids['types'])} ({lang})")
        embedded: set[str] = set()
        referenced: set[str] = set()
        if not specs:
            rep.error("preset.json", f"no chapters for {lang}")
        for i, c in enumerate(specs):
            p = root / c.get("file", "")
            if not p.exists():
                rep.error("preset.json", f"missing chapter file {c.get('file')}")
                continue
            check_markdown(c["file"], p.read_text(encoding="utf-8"), i, ids, res_ids, rep, embedded, referenced)
        # placement sanity
        types = {t.get("id"): t for t in cfg.get("resourceTypes", []) if isinstance(t, dict)} if isinstance(cfg.get("resourceTypes"), list) else {}
        design_refs = set(re.findall(r'"resourceId":\s*"([^"]+)"', json.dumps(cfg)))
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
