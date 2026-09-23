#!/usr/bin/env python3
"""Turn a laid-out PDF into DRAFT Postext chapters by *type role*.

A designed page sets every role (body, headings, captions, box text, notes,
running heads…) in its own font/size/colour. Step 1 tabulates those
combinations; you name them; step 2 rebuilds the reading order, paragraphs,
lists, headings, inline bold/italic/super/subscripts and de-hyphenates, then
writes Postext Markdown.

  1. pdf_extract.py roles book.pdf [--pages 5-40] > roles.json
     Prints a table of font/size/colour styles (most used first) with samples
     and writes a roles.json skeleton to stdout: edit each "role".
  2. pdf_extract.py markdown book.pdf --roles roles.json --out draft/ [--pages 5-40]
        [--lang es] [--columns 2] [--split-role h1] [--link-refs]

Roles (value of "role" in roles.json):
  body                    running text
  h1 … h6                 headings (h1 starts a new chapter file by default)
  skip                    running heads, folios, printer's marks, anything to drop
  caption                 figure/table captions -> resource stubs + ::resource
  footnote                footnote text -> chapter endnotes (:::paragraphs{style="notes"})
  paragraphs:<style>      paragraphs in a named paragraph style (quote, verse, author…)
  callout:<type>          text inside a box of that callout type
  callout-title:<type>    the box title (opens a new box)
  credit                  photo credits -> kept in the report, dropped from the flow

Rules are tried in order; the first whose conditions all hold wins:
  {"font": "Minion.*Italic", "size": 10, "color": "#1a1a1a", "bold": false,
   "top_mm": [0, 15], "role": "skip"}
  - font: regular expression on the PostScript name (subset prefix removed)
  - size: number (±0.25 pt) or [min, max]
  - color: "#rrggbb"; bold/italic: booleans (from flags or the font name)
  - top_mm / bottom_mm: [min, max] distance of the line from the top/bottom trim edge
  - x_mm: [min, max] distance of the line start from the left trim edge
  - text: regular expression on the line text
Lines matching no rule are `body` and counted in the report.

Pass --auto-furniture (default on) to drop lines repeated at the same height on
many pages (running heads) and bare numbers near the page edges (folios).

Requires PyMuPDF (python3 -m pip install pymupdf). The output is a draft:
compare it with the pages and fix it by hand.
"""
from __future__ import annotations

import argparse
import json
import re
import statistics
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from postext_md import (  # noqa: E402
    CAPTION_LABEL_RE,
    Run,
    Slugger,
    attr_value,
    caption_kind,
    clean_text,
    fence,
    guard_line_start,
    heading,
    join_blocks,
    link_mentions,
    render_runs,
    resource_embed,
    slugify,
)

try:
    import fitz  # PyMuPDF
except ImportError:  # pragma: no cover
    sys.exit("PyMuPDF is required: python3 -m pip install pymupdf")

PT_TO_MM = 25.4 / 72
BULLETS = "•·▪◦○‣–—-*■□►▸✓✔"
TERMINAL = re.compile(r"[.!?:;»”\")\]…]$")
BOLD_RE = re.compile(r"(bold|black|heavy|semibold|demi|extrabold|ultrabold)", re.I)
ITALIC_RE = re.compile(r"(italic|oblique|kursiv|cursiva)", re.I)


def parse_pages(spec: str | None, count: int) -> list[int]:
    if not spec:
        return list(range(count))
    pages: list[int] = []
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        a, _, b = part.partition("-")
        start = int(a) if a else 1
        end = int(b) if b else (count if _ else start)
        pages += [p - 1 for p in range(start, end + 1) if 1 <= p <= count]
    return sorted(set(pages))


def font_name(name: str) -> str:
    return re.sub(r"^[A-Z]{6}\+", "", name or "")


def hexcolor(c: int) -> str:
    return f"#{c:06x}"


@dataclass
class Span:
    text: str
    font: str
    size: float
    color: str
    bold: bool
    italic: bool
    origin_y: float
    x0: float
    x1: float


@dataclass
class Line:
    page: int
    spans: list[Span]
    x0: float
    y0: float
    x1: float
    y1: float
    baseline: float
    font: str = ""
    size: float = 0
    color: str = ""
    bold: bool = False
    italic: bool = False
    role: str = "body"
    column: int = 0
    wide: bool = False

    @property
    def text(self) -> str:
        return "".join(s.text for s in self.spans)


def read_lines(doc, pages: list[int]) -> tuple[list[Line], dict]:
    lines: list[Line] = []
    info = {"images": Counter(), "drawings": Counter(), "size": {}}
    for pno in pages:
        page = doc[pno]
        info["size"][pno] = (page.rect.width, page.rect.height)
        try:
            info["drawings"][pno] = len(page.get_drawings())
        except Exception:
            pass
        info["images"][pno] = len(page.get_images(full=True))
        d = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)
        for block in d["blocks"]:
            if block.get("type") != 0:
                continue
            for ln in block["lines"]:
                if abs(ln.get("dir", (1, 0))[1]) > 0.2:
                    continue  # rotated text (spines, vertical labels)
                spans = []
                for s in ln["spans"]:
                    if not s["text"]:
                        continue
                    fname = font_name(s["font"])
                    spans.append(
                        Span(
                            text=s["text"],
                            font=fname,
                            size=round(s["size"], 2),
                            color=hexcolor(s["color"]),
                            bold=bool(s["flags"] & 16) or bool(BOLD_RE.search(fname)),
                            italic=bool(s["flags"] & 2) or bool(ITALIC_RE.search(fname)),
                            origin_y=s["origin"][1],
                            x0=s["bbox"][0],
                            x1=s["bbox"][2],
                        )
                    )
                if not spans or not "".join(s.text for s in spans).strip():
                    continue
                main = max(spans, key=lambda s: len(s.text.strip()))
                x0, y0, x1, y1 = ln["bbox"]
                lines.append(
                    Line(pno, spans, x0, y0, x1, y1, main.origin_y, main.font, main.size, main.color, main.bold, main.italic)
                )
    return lines, info


def merge_split_lines(lines: list[Line]) -> list[Line]:
    """Extractors sometimes return one printed line in pieces (a run set word by
    word). Join pieces on the same baseline that touch horizontally."""
    out: list[Line] = []
    for ln in sorted(lines, key=lambda l: (l.page, round(l.baseline, 0), l.x0)):
        prev = out[-1] if out else None
        if (
            prev
            and prev.page == ln.page
            and abs(prev.baseline - ln.baseline) < 1.0
            and 0 <= ln.x0 - prev.x1 < max(prev.size, ln.size) * 1.2
        ):
            gap = ln.x0 - prev.x1
            if gap > prev.size * 0.15 and not prev.text.endswith(" ") and not ln.text.startswith(" "):
                prev.spans[-1].text += " "
            prev.spans += ln.spans
            prev.x1 = max(prev.x1, ln.x1)
            prev.y0 = min(prev.y0, ln.y0)
            prev.y1 = max(prev.y1, ln.y1)
            main = max(prev.spans, key=lambda s: len(s.text.strip()))
            prev.font, prev.size, prev.color, prev.bold, prev.italic = main.font, main.size, main.color, main.bold, main.italic
            continue
        out.append(ln)
    return out


# ---------------------------------------------------------------------------
# roles
# ---------------------------------------------------------------------------


def style_key(ln: Line) -> tuple:
    return (ln.font, round(ln.size * 2) / 2, ln.color)


def cmd_roles(args) -> None:
    doc = fitz.open(args.pdf)
    pages = parse_pages(args.pages, doc.page_count)
    lines, info = read_lines(doc, pages)
    lines = merge_split_lines(lines)
    stats: dict[tuple, dict] = {}
    for ln in lines:
        k = style_key(ln)
        s = stats.setdefault(k, {"chars": 0, "lines": 0, "pages": set(), "samples": [], "x0": [], "top": []})
        s["chars"] += len(ln.text.strip())
        s["lines"] += 1
        s["pages"].add(ln.page + 1)
        if len(s["samples"]) < 3 and len(ln.text.strip()) > 3:
            s["samples"].append(ln.text.strip()[:70])
        s["x0"].append(ln.x0)
        s["top"].append(ln.y0)
    ranked = sorted(stats.items(), key=lambda kv: -kv[1]["chars"])
    body_key = ranked[0][0] if ranked else None
    print(f"# {Path(args.pdf).name}: {len(pages)} pages, {len(lines)} lines, {len(ranked)} styles", file=sys.stderr)
    print(f"# {'chars':>7} {'lines':>6} {'pages':>5}  {'size':>5} {'color':8} font / samples", file=sys.stderr)
    rules = []
    for k, s in ranked[: args.top]:
        font, size, color = k
        guess = "body" if k == body_key else guess_role(k, body_key, s, info)
        print(
            f"  {s['chars']:7d} {s['lines']:6d} {len(s['pages']):5d}  {size:5.1f} {color:8} {font}  [{guess}]",
            file=sys.stderr,
        )
        for sample in s["samples"]:
            print(f"{'':38}| {sample}", file=sys.stderr)
        rules.append({"font": "^" + re.escape(font) + "$", "size": size, "color": color, "role": guess,
                      "_chars": s["chars"], "_sample": s["samples"][:1]})
    heavy = [p + 1 for p, n in info["drawings"].items() if n > 150]
    if heavy:
        print(f"# pages with many vector drawings (infographics/diagrams?): {heavy[:40]}", file=sys.stderr)
    out = {
        "pdf": str(Path(args.pdf).resolve()),
        "columns": "auto",
        "rules": rules,
        "_help": "Edit each rule's role (body, h1..h6, skip, caption, footnote, credit, paragraphs:<style>, callout:<type>, callout-title:<type>). Add conditions (top_mm, bottom_mm, x_mm, text, bold, italic) to split a style. Keys starting with _ are ignored.",
    }
    print(json.dumps(out, ensure_ascii=False, indent=2))


def guess_role(k, body_key, s, info) -> str:
    font, size, color = k
    bsize = body_key[1] if body_key else 10
    if size >= bsize * 1.6:
        return "h1"
    if size >= bsize * 1.25:
        return "h2"
    if size > bsize + 0.4 and BOLD_RE.search(font):
        return "h3"
    if size < bsize - 1.2:
        return "caption"
    if BOLD_RE.search(font) and s["chars"] / max(1, s["lines"]) < 60:
        return "h3"
    return "body"


def load_rules(path: str) -> dict:
    cfg = json.loads(Path(path).read_text(encoding="utf-8"))
    for r in cfg.get("rules", []):
        if "font" in r:
            r["_font_re"] = re.compile(r["font"])
        if "text" in r:
            r["_text_re"] = re.compile(r["text"])
    return cfg


def rule_matches(r: dict, ln: Line, page_h: float) -> bool:
    if "_font_re" in r and not r["_font_re"].search(ln.font):
        return False
    if "size" in r:
        sz = r["size"]
        if isinstance(sz, list):
            if not (sz[0] - 0.01 <= ln.size <= sz[1] + 0.01):
                return False
        elif abs(ln.size - float(sz)) > 0.26 and abs(round(ln.size * 2) / 2 - float(sz)) > 0.01:
            return False  # the roles table bins sizes to 0.5 pt
    if "color" in r and ln.color.lower() != r["color"].lower():
        return False
    if "bold" in r and bool(r["bold"]) != ln.bold:
        return False
    if "italic" in r and bool(r["italic"]) != ln.italic:
        return False
    if "top_mm" in r:
        top = ln.y0 * PT_TO_MM
        if not (r["top_mm"][0] <= top <= r["top_mm"][1]):
            return False
    if "bottom_mm" in r:
        bottom = (page_h - ln.y1) * PT_TO_MM
        if not (r["bottom_mm"][0] <= bottom <= r["bottom_mm"][1]):
            return False
    if "x_mm" in r:
        x = ln.x0 * PT_TO_MM
        if not (r["x_mm"][0] <= x <= r["x_mm"][1]):
            return False
    if "_text_re" in r and not r["_text_re"].search(clean_text(ln.text).strip()):
        return False
    return True


def detect_furniture(lines: list[Line], info: dict, npages: int) -> set[int]:
    """Indices of running heads (same text shape at the same height on many
    pages) and folios (bare numbers near the top/bottom edge)."""
    drop: set[int] = set()
    shapes: dict[tuple, set[int]] = defaultdict(set)
    for i, ln in enumerate(lines):
        norm = re.sub(r"\d+", "#", ln.text.strip().lower())[:40]
        shapes[(norm, round(ln.y0 / 4))].add(ln.page)
    frequent = {k for k, v in shapes.items() if len(v) >= max(3, npages * 0.2)}
    for i, ln in enumerate(lines):
        norm = re.sub(r"\d+", "#", ln.text.strip().lower())[:40]
        h = info["size"][ln.page][1]
        if (norm, round(ln.y0 / 4)) in frequent and (ln.y0 < h * 0.12 or ln.y1 > h * 0.88):
            drop.add(i)
        elif re.fullmatch(r"[\divxlcIVXLC]{1,5}", ln.text.strip()) and (ln.y0 < h * 0.1 or ln.y1 > h * 0.9):
            drop.add(i)
    return drop


# ---------------------------------------------------------------------------
# reading order
# ---------------------------------------------------------------------------


def column_starts(lines: list[Line], ncols: int | str, parity: int) -> list[float]:
    """x positions where body columns start on pages of one parity."""
    xs = [ln.x0 for ln in lines if ln.role == "body" and (ln.page % 2) == parity]
    if not xs:
        return [0.0]
    hist = Counter(round(x / 3) * 3 for x in xs)
    peaks = sorted(hist.items(), key=lambda kv: -kv[1])
    total = len(xs)
    starts: list[float] = []
    want = None if ncols == "auto" else int(ncols)
    for x, n in peaks:
        if want is None and n < total * 0.12:
            break
        if all(abs(x - s) > 40 for s in starts):
            starts.append(x)
        if want and len(starts) >= want:
            break
    return sorted(starts) or [min(xs)]


def order_page(lines: list[Line], starts: list[float], page_w: float) -> list[Line]:
    """Page-wide lines split the page into bands; inside a band, read column by
    column, top to bottom; the band comes in between."""
    if len(starts) <= 1:
        return sorted(lines, key=lambda l: (round(l.y0, 0), l.x0))
    right = starts[1:] + [page_w]
    col_w = min(right[i] - starts[i] for i in range(len(starts)))
    for ln in lines:
        ln.column = max(0, max((i for i, s in enumerate(starts) if ln.x0 >= s - 6), default=0))
        ln.wide = (ln.x1 - ln.x0) > col_w * 1.08 or (ln.x0 < starts[0] + 20 and ln.x1 > starts[-1] + 20 and len(starts) > 1)
    ordered: list[Line] = []
    lines = sorted(lines, key=lambda l: l.y0)
    segment: list[Line] = []

    def flush():
        segment.sort(key=lambda l: (l.column, l.y0, l.x0))
        ordered.extend(segment)
        segment.clear()

    i = 0
    while i < len(lines):
        ln = lines[i]
        if ln.wide:
            flush()
            band = [ln]
            j = i + 1
            while j < len(lines) and lines[j].wide and lines[j].y0 - band[-1].y1 < ln.size * 2:
                band.append(lines[j])
                j += 1
            ordered.extend(band)
            i = j
            continue
        segment.append(ln)
        i += 1
    flush()
    return ordered


# ---------------------------------------------------------------------------
# text
# ---------------------------------------------------------------------------


def line_runs(ln: Line, base_bold: bool, base_italic: bool) -> list[Run]:
    runs: list[Run] = []
    for s in ln.spans:
        small = s.size < ln.size * 0.82
        sup = small and s.origin_y < ln.baseline - ln.size * 0.12
        sub = small and s.origin_y > ln.baseline + ln.size * 0.08
        runs.append(Run(s.text, s.bold and not base_bold, s.italic and not base_italic, sup, sub))
    return runs


class Vocabulary:
    """Words of the whole document except the halves of words the document
    itself hyphenates at line ends (they would make any join look valid)."""

    def __init__(self, lines: list[Line]) -> None:
        self.words: Counter = Counter()
        prev_hyphen = False
        for ln in lines:
            text = clean_text(ln.text).rstrip()
            toks = re.findall(r"[^\W\d_]+(?:-[^\W\d_]+)*", text)
            ends_hyphen = text.endswith(("-", "\u00ad"))
            if ends_hyphen and toks:
                toks = toks[:-1]
            if prev_hyphen and toks:
                toks = toks[1:]
            prev_hyphen = ends_hyphen
            for w in toks:
                self.words[w.lower()] += 1

    def known(self, w: str) -> bool:
        return self.words.get(w.lower(), 0) > 0

    def join_hyphen(self, a: str, b: str) -> str:
        """`a` ends with '-', `b` is the next line's first word."""
        stem = a[:-1]
        wa = re.findall(r"[^\W\d_]+$", stem)
        wb = re.match(r"^[^\W\d_]+", b)
        if not wa or not wb:
            return a + b if re.search(r"\d-$", a) and re.match(r"\d", b) else a + b
        left, right = wa[0], wb.group(0)
        if right[:1].isupper():
            return a + b  # a name compound: keep the hyphen
        if self.known(left + right):
            return stem + b
        if self.known(left + "-" + right):
            return a + b
        if self.words.get(left.lower(), 0) >= 2 and self.words.get(right.lower(), 0) >= 2 and len(left) >= 4 and len(right) >= 4:
            return a + b
        return stem + b


@dataclass
class Para:
    role: str
    lines: list[Line] = field(default_factory=list)
    list_marker: str = ""
    depth: int = 0

    @property
    def page(self) -> int:
        return self.lines[0].page if self.lines else 0


def build_paragraphs(ordered: list[Line], starts_by_parity: dict[int, list[float]]) -> list[Para]:
    paras: list[Para] = []
    cur: Para | None = None
    pitch: dict[str, list[float]] = defaultdict(list)
    prev: Line | None = None
    for ln in ordered:
        if prev and prev.page == ln.page and prev.role == ln.role and prev.column == ln.column and 0 < ln.y0 - prev.y0 < ln.size * 3:
            pitch[ln.role].append(ln.y0 - prev.y0)
        prev = ln
    lead = {r: statistics.median(v) for r, v in pitch.items() if v}

    prev = None
    for ln in ordered:
        text = clean_text(ln.text).strip()
        starts = starts_by_parity.get(ln.page % 2, [0])
        col_left = starts[ln.column] if ln.column < len(starts) else starts[0]
        marker = re.match(rf"^([{re.escape(BULLETS)}]|\d{{1,3}}[.)])\s+", text)
        if marker and re.match(r"^\d{4}[.)]", text):
            marker = None  # a year, not an ordered item
        new = cur is None or cur.role != ln.role
        if not new and prev is not None:
            same_flow = prev.page == ln.page and prev.column == ln.column and not (prev.wide ^ ln.wide)
            gap = ln.y0 - prev.y1
            lp = lead.get(ln.role, ln.size * 1.2)
            prev_text = clean_text(prev.text).rstrip()
            if marker:
                new = True
            elif same_flow:
                if gap > lp * 0.9:
                    new = True
                elif ln.x0 > col_left + ln.size * 0.8 and prev.x0 <= col_left + ln.size * 0.4 and not cur.list_marker:
                    new = True  # first-line indent
                elif cur.list_marker and ln.x0 <= col_left + 1 and not cur.role.startswith("h"):
                    new = True  # un-indented line ends a hanging list item
                elif TERMINAL.search(prev_text) and prev.x1 < ln.x1 - ln.size * 2.5 and not ln.role.startswith("h"):
                    new = True  # short last line
            else:
                # column or page change: continue unless the sentence ended
                if TERMINAL.search(prev_text) and text[:1].isupper():
                    new = True
        if new:
            cur = Para(ln.role)
            if marker:
                cur.list_marker = marker.group(1)
                cur.depth = 1 if ln.x0 > col_left + ln.size * 1.5 else 0
            paras.append(cur)
        cur.lines.append(ln)
        prev = ln
    return paras


def para_text(p: Para, vocab: Vocabulary, base: dict[str, tuple[bool, bool]], plain: bool = False) -> str:
    runs: list[Run] = []
    bb, bi = base.get(p.role, (False, False))
    for n, ln in enumerate(p.lines):
        lr = line_runs(ln, bb, bi)
        if n == 0 and p.list_marker:
            # drop the marker itself
            first = clean_text(ln.text).lstrip()
            cut = len(re.match(rf"^([{re.escape(BULLETS)}]|\d{{1,3}}[.)])\s+", first).group(0)) if re.match(rf"^([{re.escape(BULLETS)}]|\d{{1,3}}[.)])\s+", first) else 0
            while cut > 0 and lr:
                t = lr[0].text.lstrip() if cut else lr[0].text
                if len(t) <= cut:
                    cut -= len(t)
                    lr.pop(0)
                else:
                    lr[0].text = t[cut:]
                    cut = 0
        if runs:
            prev_txt = runs[-1].text.rstrip()
            nxt = lr[0].text.lstrip() if lr else ""
            if prev_txt.endswith(("-", "­")) and nxt[:1].isalpha():
                prev_word = re.findall(r"\S+$", prev_txt)[0] if re.findall(r"\S+$", prev_txt) else prev_txt
                next_word = re.match(r"^\S+", nxt).group(0) if re.match(r"^\S+", nxt) else nxt
                joined = vocab.join_hyphen(prev_word.replace("­", "-"), next_word)
                runs[-1].text = prev_txt[: len(prev_txt) - len(prev_word)] + joined[: len(joined) - len(next_word)]
                lr[0].text = next_word + nxt[len(next_word):]
            elif prev_txt.endswith("/") or re.search(r"https?://\S+$", prev_txt):
                runs[-1].text = prev_txt  # URLs broken across lines: no space
            else:
                runs[-1].text = runs[-1].text.rstrip() + " "
                if lr:
                    lr[0].text = lr[0].text.lstrip()
        runs += lr
    if plain:
        return re.sub(r"\s+", " ", clean_text("".join(r.text for r in runs))).strip()
    return render_runs(runs)


def repair_ligature_gaps(text: str, vocab: Vocabulary) -> str:
    """'Clasifi cación' -> 'Clasificación' when the joined word is known."""

    def fix(m: re.Match) -> str:
        a, b = m.group(1), m.group(2)
        if vocab.known(a + b) and not (vocab.known(a) and vocab.known(b)):
            return a + b
        return m.group(0)

    return re.sub(r"(\w*(?:fi|fl|ff|ffi|ffl)) (\w+)", fix, text)


# ---------------------------------------------------------------------------
# markdown
# ---------------------------------------------------------------------------


def cmd_markdown(args) -> None:
    cfg = load_rules(args.roles)
    doc = fitz.open(args.pdf)
    pages = parse_pages(args.pages, doc.page_count)
    lines, info = read_lines(doc, pages)
    lines = merge_split_lines(lines)
    report: Counter = Counter()
    unmatched: Counter = Counter()
    for ln in lines:
        h = info["size"][ln.page][1]
        for r in cfg.get("rules", []):
            if rule_matches(r, ln, h):
                ln.role = r.get("role", "body")
                break
        else:
            unmatched[style_key(ln)] += 1
    if args.auto_furniture:
        for i in detect_furniture(lines, info, len(pages)):
            if lines[i].role in ("body",) or lines[i].role.startswith("h"):
                lines[i].role = "skip"
                report["furniture lines dropped (running heads/folios)"] += 1
    credits = [(ln.page + 1, clean_text(ln.text).strip()) for ln in lines if ln.role == "credit"]
    kept = [ln for ln in lines if ln.role not in ("skip", "credit")]

    ncols = cfg.get("columns", "auto") if args.columns is None else args.columns
    starts = {p: column_starts(kept, ncols, p) for p in (0, 1)}
    ordered: list[Line] = []
    by_page: dict[int, list[Line]] = defaultdict(list)
    for ln in kept:
        by_page[ln.page].append(ln)
    for pno in pages:
        ordered += order_page(by_page.get(pno, []), starts[pno % 2], info["size"][pno][0])

    vocab = Vocabulary(lines)
    base: dict[str, tuple[bool, bool]] = {}
    per_role: dict[str, Counter] = defaultdict(Counter)
    for ln in kept:
        per_role[ln.role][(ln.bold, ln.italic)] += len(ln.text)
    for role, cnt in per_role.items():
        base[role] = cnt.most_common(1)[0][0]

    paras = build_paragraphs(ordered, starts)
    out = Path(args.out)
    chap_dir = out / "chapters" / args.lang
    chap_dir.mkdir(parents=True, exist_ok=True)
    slug = Slugger()
    resources: list[dict] = []
    label_to_id: dict[tuple[str, str], str] = {}
    chapters: list[tuple[str, list[str], list[str]]] = []  # title, blocks, notes

    def new_chapter(title: str):
        chapters.append((title, [], []))

    split_role = args.split_role
    i = 0
    callout: tuple[str, str | None, list[str]] | None = None

    def close_callout():
        nonlocal callout
        if callout and chapters:
            ctype, title, body = callout
            chapters[-1][1].append(fence("callout", body, type=ctype, title=title))
        callout = None

    list_run: list[str] = []

    def flush_list(target: list[str]):
        if list_run:
            target.append("\n".join(list_run))
            list_run.clear()

    while i < len(paras):
        p = paras[i]
        role = p.role
        if not chapters or (role == split_role and chapters[-1][1]):
            close_callout()
            if chapters:
                flush_list(chapters[-1][1])
            new_chapter("")
        blocks = chapters[-1][1]
        # join wrapped headings
        if role.startswith("h") and role[1:].isdigit():
            j = i + 1
            while j < len(paras) and paras[j].role == role and paras[j].page == p.page and paras[j].lines[0].y0 - paras[j - 1].lines[-1].y1 < p.lines[0].size * 1.2:
                p.lines += paras[j].lines
                j += 1
            i = j
            close_callout()
            flush_list(blocks)
            text = repair_ligature_gaps(para_text(p, vocab, base, plain=True), vocab)
            level = int(role[1:])
            if not chapters[-1][0] and role == split_role:
                chapters[-1] = (text, blocks, chapters[-1][2])
            blocks.append(heading(level, text))
            continue
        i += 1
        text = repair_ligature_gaps(para_text(p, vocab, base), vocab)
        if not text:
            continue
        if role == "caption":
            close_callout()
            flush_list(blocks)
            plain = para_text(p, vocab, base, plain=True)
            m = CAPTION_LABEL_RE.match(plain)
            kind = caption_kind(m.group("label")) if m else "figure"
            rid = slug(CAPTION_LABEL_RE.sub("", plain) or f"p{p.page + 1}", "table" if kind == "table" else "fig")
            if m:
                label_to_id[(kind, m.group("num").replace("–", "-"))] = rid
                # the label may be wrapped in marks (**Figure 1.**): strip it with them
                label = re.escape(m.group(0).strip()).replace("\\ ", "\\s*")
                text = re.sub(rf"^(\*{{1,3}})?\s*{label}\s*(\*{{1,3}})?\s*", "", text, count=1)
                text = re.sub(r"^\*{1,3}\s+", "", text)
            bbox = [min(l.x0 for l in p.lines), min(l.y0 for l in p.lines), max(l.x1 for l in p.lines), max(l.y1 for l in p.lines)]
            resources.append({
                "id": rid,
                "typeId": kind,
                "kind": "table" if kind == "table" else "bitmap",
                "caption": text,
                "altText": attr_value(CAPTION_LABEL_RE.sub("", plain)),
                "placement": {"position": "auto", "span": "column"},
                "source": {"page": p.page + 1, "captionBox": [round(v, 1) for v in bbox], "label": m.group(0).strip() if m else ""},
            })
            blocks.append(resource_embed(rid))
            continue
        if role == "footnote":
            chapters[-1][2].append(guard_line_start(text))
            continue
        if role.startswith("callout-title:"):
            close_callout()
            flush_list(blocks)
            callout = (role.split(":", 1)[1], para_text(p, vocab, base, plain=True), [])
            continue
        if role.startswith("callout:"):
            ctype = role.split(":", 1)[1]
            if not callout or callout[0] != ctype:
                close_callout()
                flush_list(blocks)
                callout = (ctype, None, [])
            target = callout[2]
        else:
            if callout:
                close_callout()
            target = blocks
        if p.list_marker:
            ordered_m = re.match(r"(\d+)", p.list_marker)
            mark = f"{ordered_m.group(1)}." if ordered_m else "-"
            list_run.append("  " * p.depth + f"{mark} {text}")
            if i < len(paras) and paras[i].list_marker and paras[i].role == role:
                continue
            flush_list(target)
            continue
        flush_list(target)
        if role.startswith("paragraphs:"):
            style = role.split(":", 1)[1]
            if target and target[-1].startswith(f':::paragraphs{{style="{style}"}}'):
                target[-1] = target[-1][: -len("\n:::")] + "\n\n" + guard_line_start(text) + "\n:::"
            else:
                target.append(fence("paragraphs", [guard_line_start(text)], style=style))
            continue
        if not role.startswith(("body", "callout:")):
            report[f"role {role!r} set as body text"] += 1
        target.append(guard_line_start(text))
    close_callout()
    if chapters:
        flush_list(chapters[-1][1])

    manifest = []
    for n, (title, blocks, notes) in enumerate(chapters, 1):
        if notes:
            blocks.append(fence("paragraphs", notes, style="notes"))
        body = join_blocks(blocks)
        if args.link_refs:
            def float_it(rid: str) -> None:
                pass
            body = link_mentions(body, label_to_id, float_it)
        name = f"{n:02d}-{slugify(title or f'chapter {n}')}.md"
        (chap_dir / name).write_text(body, encoding="utf-8")
        manifest.append({"title": title or f"Chapter {n}", "file": f"chapters/{args.lang}/{name}"})

    (out / "resources.json").write_text(json.dumps(resources, ensure_ascii=False, indent=2), encoding="utf-8")
    (out / "chapters.json").write_text(json.dumps({args.lang: manifest}, ensure_ascii=False, indent=2), encoding="utf-8")
    heavy = sorted(p + 1 for p, n in info["drawings"].items() if n > 150)
    rep = [f"# PDF extraction report: {Path(args.pdf).name}", "",
           f"- pages: {len(pages)}; lines: {len(lines)}; chapters: {len(manifest)}; caption stubs: {len(resources)}",
           f"- column starts (pt) recto {starts[0]} / verso {starts[1]}", ""]
    if unmatched:
        rep += ["## Styles no rule matched (set as body)", ""]
        rep += [f"- {k[0]} {k[1]}pt {k[2]}: {n} lines" for k, n in unmatched.most_common(20)] + [""]
    if report:
        rep += ["## Decisions to review", ""] + [f"- {k}: {v}" for k, v in report.most_common()] + [""]
    if heavy:
        rep += ["## Pages with many vector drawings (infographics, diagrams: crop or transcribe)", "", f"- {heavy}", ""]
    if credits:
        rep += ["## Credits found (role credit)", ""] + [f"- p. {pg}: {txt}" for pg, txt in credits[:200]] + [""]
    rep += ["Resource stubs in resources.json carry `source.page` and `source.captionBox` (pt): cut the artwork with "
            "pdf_figures.py, then set `file`, `width`, `height` and drop `source`."]
    (out / "report.md").write_text("\n".join(rep) + "\n", encoding="utf-8")
    print("\n".join(rep))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("roles", help="tabulate font/size/colour styles and print a roles.json skeleton")
    r.add_argument("pdf")
    r.add_argument("--pages")
    r.add_argument("--top", type=int, default=40)
    m = sub.add_parser("markdown", help="write draft chapters using a roles.json")
    m.add_argument("pdf")
    m.add_argument("--roles", required=True)
    m.add_argument("--out", required=True)
    m.add_argument("--pages")
    m.add_argument("--lang", default="en")
    m.add_argument("--columns", help="number of body columns (default: roles.json 'columns' or auto)")
    m.add_argument("--split-role", default="h1", help="role that starts a new chapter file (default h1; 'none' = one file)")
    m.add_argument("--link-refs", action="store_true", help="turn 'Figure 1.2' mentions into :ref for captioned stubs")
    m.add_argument("--no-auto-furniture", dest="auto_furniture", action="store_false")
    args = ap.parse_args()
    if args.cmd == "roles":
        cmd_roles(args)
    else:
        cmd_markdown(args)


if __name__ == "__main__":
    main()
