#!/usr/bin/env python3
"""Rebuild a book's back-of-book index as Postext `:index` marks from the
printed index of its PDF (postext >= 1.7).

A printed index lists terms with page numbers; Postext needs a mark in the
text where each term is discussed, and prints the page numbers itself. This
tool reads the index pages, then finds each term on each listed page of the
PDF and puts the mark after the same words in the chapter files.

  1. index_marks.py parse book.pdf --pages 467-476 > index.json
     Entries with their levels, pages (bold = main, 34–37 = range) and
     See / See also targets. Check it: a printed index is not always regular.
  2. index_marks.py place index.json book.pdf chapters/*.md
        [--offset N] [--out DIR | --in-place] [--page-fallback]
        [--crossrefs index-crossrefs.md] [--report index-report.md]
     Page numbers resolve through the PDF's page labels, or as
     page + offset (`--offset`: PDF page index of printed page 0). Marks go
     after the matching word; `range` pairs for 34–37; See / See also marks
     are written to --crossrefs (paste them above `:::index`: a line of
     marks prints nothing). Unplaced entries are listed in the report.

Matching: the term (the sub-entry with and without its parent, an inverted
"Acid, fatty" as "fatty acid", a parenthesised acronym) is looked for on the
page with loose word endings (plurals, gender); a few words around it locate
the same spot in the Markdown. A term the page does not contain is reported,
or, with --page-fallback, marked at the first words of that page's text.

Requires PyMuPDF (python3 -m pip install pymupdf). The result is a draft:
read the report and spot-check the marks against the printed index.
"""
from __future__ import annotations

import argparse
import bisect
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from postext_md import fix_index_marks, index_mark  # noqa: E402

try:
    import fitz  # PyMuPDF
except ImportError:  # pragma: no cover
    fitz = None

DASHES = "–—−-"
SEE_RE = re.compile(
    r"(?:[.,;]\s*|\s+|^)\(?\b(see also|see|véase también|véase|vease tambien|vease|ver también|ver|voir aussi|voir|"
    r"siehe auch|siehe|vedi anche|vedi|veja também|veja)\b\.?:?\s+(.+?)\)?\s*$",
    re.I,
)
_ROMAN = r"(?:(?=[ivxlcdm])m{0,3}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})|(?=[IVXLCDM])M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3}))"
_NUM = rf"(?:\d+[a-z]{{0,2}}|{_ROMAN})"
LOC = rf"(?:\*\*)?{_NUM}(?:\*\*)?(?:\s*[–—-]\s*(?:\*\*)?{_NUM}(?:\*\*)?)?"
LOCS_TAIL_RE = re.compile(rf"(?:,|\.(?=\s*\d))\s*({LOC}(?:\s*,\s*{LOC})*)\s*[.,;]?\s*$")
# a missing comma before the pages ("Simporte 74"): arabic numbers only
_ARABIC = r"(?:\*\*)?\d+[a-z]{0,2}(?:\*\*)?(?:\s*[–—-]\s*(?:\*\*)?\d+[a-z]{0,2}(?:\*\*)?)?"
LOCS_TAIL_LOOSE_RE = re.compile(rf"(?<=[^\W\d_)])\s+({_ARABIC}(?:\s*,\s*{_ARABIC})*)\s*[.,;]?\s*$")
LOCS_ONLY_RE = re.compile(rf"^\s*({LOC}(?:\s*,\s*{LOC})*)\s*[.,;]?\s*$")
ONE_LOC_RE = re.compile(rf"(\*\*)?(\d+|{_ROMAN})([a-z]{{0,2}})(\*\*)?(?:\s*[–—-]\s*(\*\*)?(\d+|{_ROMAN})[a-z]{{0,2}}(\*\*)?)?")
CONT_RE = re.compile(r"\s*\((?:cont\.?|continued|continuación|continúa|suite|fortsetzung)\)\s*$", re.I)


def need_fitz() -> None:
    if fitz is None:
        sys.exit("PyMuPDF is required: python3 -m pip install pymupdf")


def parse_pages(spec: str | None, count: int) -> list[int]:
    if not spec:
        return list(range(count))
    out: list[int] = []
    for part in spec.split(","):
        a, _, b = part.partition("-")
        lo, hi = int(a), int(b or a)
        out += [i - 1 for i in range(lo, hi + 1) if 0 < i <= count]
    return out


def norm(word: str) -> str:
    """A word for matching: no accents, no case, letters and digits only."""
    w = unicodedata.normalize("NFKD", word)
    w = "".join(ch for ch in w if not unicodedata.combining(ch))
    return re.sub(r"[\W_]+", "", w.casefold())


def stem(w: str) -> str:
    return w[: max(4, len(w) - 3)] if len(w) > 5 else w


def word_match(page_word: str, term_word: str) -> bool:
    if page_word == term_word:
        return True
    s = stem(term_word)
    return len(s) >= 4 and page_word.startswith(s) and abs(len(page_word) - len(term_word)) <= 4


# ---------------------------------------------------------------------------
# parse: printed index -> entries
# ---------------------------------------------------------------------------


def index_lines(doc, pages: list[int]) -> list[tuple[float, float, str]]:
    """(x0 relative to its column, font size, text) per line, bold spans
    wrapped in `**` so bold page numbers survive, in reading order. Folios
    and lines repeated on several pages (running heads) are left out."""
    per_page = []
    for pi in pages:
        page = doc[pi]
        label = (page.get_label() or str(pi + 1)).lower()
        lines = []
        for b in page.get_text("dict")["blocks"]:
            for ln in b.get("lines", []):
                spans = [s for s in ln["spans"] if s["text"].strip()]
                # a "line" can join two columns: split it at a wide gap
                groups: list[list[dict]] = []
                for s in spans:
                    if groups and s["bbox"][0] - groups[-1][-1]["bbox"][2] < page.rect.width * 0.05:
                        groups[-1].append(s)
                    else:
                        groups.append([s])
                for g in groups:
                    txt = ""
                    for s in g:
                        t = s["text"]
                        bold = bool(s["flags"] & 16) or re.search(r"bold|black|heavy|semibold", s["font"], re.I)
                        if bold and re.fullmatch(r"\s*[\divxlcdm]+[a-z]{0,2}[,.;]?\s*", t, re.I):
                            core = t.strip().rstrip(",.;")
                            t = t.replace(core, f"**{core}**", 1)
                        txt += t
                    txt = re.sub(r"[\x00-\x08\x0b-\x1f\u2003\t]", " ", txt).strip()
                    if txt.strip("*").lower() == label:
                        continue  # folio
                    lines.append((g[0]["bbox"][0], g[0]["bbox"][1], max(s["size"] for s in g), txt))
        per_page.append((page, lines))
    def key(t: str) -> str:
        return re.sub(r"[\d*\s]+", " ", t).strip()

    def edge(page, y: float) -> bool:
        return y < page.rect.height * 0.1 or y > page.rect.height * 0.9

    # running heads: edge lines repeated on two pages or more (digits ignored)
    repeated = Counter(k for page, lines in per_page for k in {key(l[3]) for l in lines if edge(page, l[1])})
    heads = {k for k, n in repeated.items() if n >= 2 and len(k) >= 4}
    out = []
    for page, lines in per_page:
        kept = []
        for x, y, size, txt in lines:
            if edge(page, y) and key(txt) in heads:
                continue
            for h in heads:  # a running head joined to an entry line
                if txt.endswith(h) and len(txt) > len(h):
                    txt = txt[: -len(h)].rstrip()
            kept.append((x, y, size, txt))
        lines = kept
        if not lines:
            continue
        xs = sorted(x for x, *_ in lines)
        cols: list[float] = []
        for x in xs:
            if not cols or x - cols[-1] > page.rect.width * 0.2:
                cols.append(x)
        body = Counter(round(s, 1) for *_, s, _ in lines).most_common(1)[0][0]
        for x, y, size, txt in sorted(lines, key=lambda l: (max(i for i, c in enumerate(cols) if l[0] >= c - 2), l[1])):
            col = max(c for c in cols if x >= c - 2)
            out.append((x - col, size / body, txt))
    return out


def split_locators(text: str):
    """(term, [locators], see, seealso) from one entry's text."""
    see = seealso = None
    m = SEE_RE.search(text)
    if m:
        target = m.group(2).strip().rstrip(".")
        if len(m.group(1).split()) > 1:
            seealso = target
        else:
            see = target
        text = text[: m.start()].rstrip(" ,.;")
    locs = []
    m = LOCS_TAIL_RE.search(text) or LOCS_TAIL_LOOSE_RE.search(text)
    if m:
        locs = [x.strip() for x in re.split(r"\s*,\s*", m.group(1)) if x.strip()]
        text = text[: m.start()].rstrip()
        m = LOCS_TAIL_LOOSE_RE.search(text)  # "PKA 190, 195"
        if m:
            locs = [x.strip() for x in re.split(r"\s*,\s*", m.group(1)) if x.strip()] + locs
            text = text[: m.start()].rstrip()
    else:
        m = LOCS_ONLY_RE.match(text)
        if m:
            return "", [x.strip() for x in re.split(r"\s*,\s*", m.group(1))], see, seealso
    return text.strip().rstrip(","), locs, see, seealso


def locator(loc: str) -> dict | None:
    m = ONE_LOC_RE.fullmatch(loc.strip())
    if not m:
        return None
    out = {"page": m.group(2)}
    if m.group(1) or m.group(4):
        out["main"] = True
    if m.group(3):
        out["suffix"] = m.group(3)
    if m.group(6):
        end = m.group(6)
        a, b = m.group(2), end
        if a.isdigit() and b.isdigit() and len(b) < len(a):  # Chicago 234–37
            b = a[: len(a) - len(b)] + b
        out["to"] = b
    return out


def cmd_parse(args) -> None:
    need_fitz()
    doc = fitz.open(args.pdf)
    lines = index_lines(doc, parse_pages(args.pages, doc.page_count))
    skip = re.compile(args.skip, re.I) if args.skip else None
    # Levels are shown by leading dashes ("– valves") or by indents; a
    # wrapped line hangs deeper. In a dashed index every undashed indented
    # line is a turnover; otherwise the smallest indent is one level.
    dashed = sum(1 for x, _, t in lines if t[:1] in DASHES) > len(lines) * 0.05
    # one level = the shortest dash run ("– x" or "--x")
    runs = [len(re.sub(r"\s", "", m.group(1))) for _, _, t in lines
            if (m := re.match(rf"^((?:[{DASHES}]\s*)+)", t)) and not re.match(r"^-?\d", t)]
    unit = min(runs) if runs else 1
    indents = sorted({round(x, 1) for x, _, t in lines if x > 1.5 and t[:1] not in DASHES})
    step = indents[0] if indents else 10.0
    see_start = re.compile(r"^\(?(see|véase|vease|ver|voir|siehe|vedi|veja)\b", re.I)
    entries: list[dict] = []
    stack: list[str] = []
    last: dict | None = None
    for x, rel, text in lines:
        if skip and skip.search(text):
            continue
        bare = text.replace("**", "").strip()
        if rel > 1.3 or (re.fullmatch(r"\d+", bare) and not (last and last.get("_open"))):
            continue  # title, folio
        if len(bare) <= 3 and re.fullmatch(r"[^\W\d_]{1,2}|\d\s*[–-]\s*\d", bare):
            continue  # letter head
        dm = re.match(rf"^((?:[{DASHES}]\s*)+)", text)
        turnover = last is not None and (
            LOCS_ONLY_RE.match(text) or see_start.match(bare)
            or (last.get("_open") and (x > 1.5 or not bare[:1].isupper()))
            or (dashed and x > 1.5))
        if dm and not re.match(r"^-?\d", text):
            level = max(1, round(sum(dm.group(1).count(d) for d in DASHES) / unit))
            text = text[dm.end():].strip()
        elif turnover:
            last["_raw"] += " " + text
            last["_open"] = last["_raw"].rstrip().endswith(",")
            continue
        else:
            level = int(round(x / step)) if x > 1.5 else 0
        text = CONT_RE.sub("", text)
        rec = {"_level": level, "_raw": text}
        rec["_open"] = text.rstrip().endswith(",")
        entries.append(rec)
        last = rec
    out: list[dict] = []
    seen: dict[tuple, dict] = {}
    for rec in entries:
        term, locs, see, seealso = split_locators(rec["_raw"])
        level = rec["_level"]
        if not term:
            continue
        stack = stack[:level] + [term]
        if len(stack) < level + 1:  # a sub-entry with no parent line
            stack = [term]
        path = list(stack)
        e = seen.get(tuple(path))
        if e is None:
            e = {"path": path, "locators": []}
            seen[tuple(path)] = e
            out.append(e)
        for loc in locs:
            L = locator(loc)
            if L:
                e["locators"].append(L)
        if see:
            e["see"] = [s.strip() for s in re.split(r":\s*|\s*!\s*", see) if s.strip()]
        if seealso:
            e["seealso"] = [s.strip() for s in re.split(r":\s*|\s*!\s*", seealso) if s.strip()]
    json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
    print()
    n = sum(len(e["locators"]) for e in out)
    print(f"{len(out)} entries, {n} page references, "
          f"{sum(1 for e in out if 'see' in e or 'seealso' in e)} cross-references", file=sys.stderr)


# ---------------------------------------------------------------------------
# place: entries -> marks in the chapters
# ---------------------------------------------------------------------------

# Markdown that is not running text: blanked (same length) before tokenising.
_BLANK_LINE_RE = re.compile(r"^\s*(?::::|::resource).*$", re.M)
_BLANK_RES = [
    re.compile(r"(?<![:\\]):index(?:\[(?:\\.|[^\]\\\n])*\])?(?:\{[^}\n]*\})?"),
    re.compile(r":ref\{[^}\n]*\}"),
    re.compile(r":swatch\{[^}\n]*\}"),
    re.compile(r"\[\^[^\]\s]+\]:?"),
    re.compile(r"(?<!\\)\$[^$\n]+(?<!\\)\$"),
    re.compile(r"\]\([^)\s]*\)"),
    re.compile(r"\]\{[^}\n]*\}"),
    re.compile(r":(?:chip|smallcaps)\["),
    re.compile(r"^#{1,6}\s", re.M),
    re.compile(r"\s\{[^{}\n]*\}\s*$", re.M),
]


def md_tokens(text: str) -> list[tuple[str, int]]:
    """(normalised word, end offset in `text`) for every word of running text."""
    blank = text
    fm = re.match(r"^---\n.*?\n---\n", blank, re.S)
    if fm:
        blank = " " * fm.end() + blank[fm.end():]
    for rx in [_BLANK_LINE_RE, *_BLANK_RES]:
        blank = rx.sub(lambda m: re.sub(r"[^\n]", " ", m.group(0)), blank)
    out = []
    for m in re.finditer(r"\S+", blank):
        w = norm(re.sub(r"\\(.)|[*_^~\[\]]", r"\1", m.group(0)))
        if w:
            # the mark goes after the word and its closing marks/punctuation
            out.append((w, m.end()))
    return out


def _line_key(page, ws) -> tuple[int, str] | None:
    """(height bucket, text without digits) of a line near the top or bottom
    edge, None elsewhere."""
    h = page.rect.height
    y0, y1 = min(w[1] for w in ws), max(w[3] for w in ws)
    if y1 > h * 0.15 and y0 < h * 0.85:
        return None
    return (round(y0 / 6), norm(re.sub(r"\d+", "", " ".join(w[4] for w in ws))))


def _lines(page) -> dict[tuple, list]:
    lines: dict[tuple, list] = defaultdict(list)
    for w in page.get_text("words"):
        lines[(w[5], w[6])].append(w)
    return lines


def furniture_keys(doc) -> set[tuple[int, str]]:
    """Running heads and folios: edge lines repeated at the same height on
    three pages or more (their digits ignored)."""
    seen: Counter = Counter()
    for page in doc:
        seen.update({k for ws in _lines(page).values() if (k := _line_key(page, ws))})
    return {k for k, n in seen.items() if n >= 3}


def page_words(page, furniture: set) -> list[str]:
    """The page's words in content order, hyphenated line ends joined,
    running heads and folios left out (they would match chapter titles)."""
    words = [w for ws in _lines(page).values() if _line_key(page, ws) not in furniture for w in ws]
    words.sort(key=lambda w: (w[5], w[6], w[7]))
    out: list[str] = []
    prev_line = None
    for w in words:
        text = w[4]
        line = (w[5], w[6])
        if out and out[-1].endswith(("-", "\u00ad")) and prev_line != line and text[:1].islower():
            out[-1] = out[-1][:-1] + text
        else:
            out.append(text)
        prev_line = line
    return [n for n in (norm(x) for x in out) if n]


def term_variants(path: list[str]) -> list[list[str]]:
    """Word sequences to look for, most specific first."""
    def clean(t: str) -> list[str]:
        t = re.sub(r"[*_]", "", t)
        return [w for w in (norm(x) for x in re.split(r"[\s/]+", t)) if w]

    out: list[list[str]] = []

    def add(t: str):
        w = clean(t)
        if w and w not in out:
            out.append(w)

    last = path[-1]
    bare = re.sub(r"\s*\([^)]*\)", "", last).strip()
    acr = re.findall(r"\(([^)]+)\)", last)
    head, _, rest = bare.partition(",")
    for t in ([f"{path[-2]} {bare}", f"{bare} {path[-2]}"] if len(path) > 1 else []):
        add(t)
    add(bare)
    if rest.strip():
        add(f"{rest.strip()} {head.strip()}")
        add(head)
    for a in acr:
        add(a)
    if len(path) > 1:
        for t in [path[-2]]:
            add(re.sub(r"\s*\([^)]*\)", "", t))
    return out


class Book:
    def __init__(self, files: list[Path]):
        self.files = files
        self.texts = [f.read_text(encoding="utf-8") for f in files]
        self.words: list[str] = []
        self.where: list[tuple[int, int]] = []  # (file, end offset)
        for fi, t in enumerate(self.texts):
            for w, end in md_tokens(t):
                self.words.append(w)
                self.where.append((fi, end))
        self.pos: dict[str, list[int]] = defaultdict(list)
        for i, w in enumerate(self.words):
            self.pos[w].append(i)

    def find(self, seq: list[str]) -> list[int]:
        if not seq:
            return []
        return [i for i in self.pos.get(seq[0], []) if self.words[i:i + len(seq)] == seq]


CONTEXT = ((4, 4), (3, 3), (5, 2), (2, 5), (6, 1), (1, 6), (4, 2), (2, 4), (6, 0), (0, 6), (5, 1), (1, 5))


def locate(book: Book, words: list[str], at: int, n: int, estimate: float | None, min_words: int = 6) -> int | None:
    """Position in the book of the page words [at, at+n), found by the words
    around them: a window of at least `min_words` that occurs once in the
    chapters (or, when it occurs more often, the occurrence nearest to
    where the page's neighbours landed)."""
    for before, after in CONTEXT:
        lo = at - before
        if lo < 0 or at + n + after > len(words) or before + n + after < min_words:
            continue
        seq = words[lo:at + n + after]
        hits = book.find(seq)
        if len(hits) == 1:
            return hits[0] + before + n - 1
        if len(hits) > 1 and estimate is not None:
            best = min(hits, key=lambda h: abs(h - estimate))
            return best + before + n - 1
    return None


def cmd_place(args) -> None:
    need_fitz()
    entries = json.loads(Path(args.entries).read_text(encoding="utf-8"))
    doc = fitz.open(args.pdf)
    files = [Path(f) for f in args.chapters]
    book = Book(files)

    by_label: dict[str, int] = {}
    if args.offset is None:
        for i in range(doc.page_count):
            lab = doc[i].get_label()
            if lab:
                by_label.setdefault(lab.lower(), i)
        if not by_label:
            sys.exit("the PDF has no page labels: pass --offset (PDF page index of printed page 0)")

    def page_index(label: str) -> int | None:
        if args.offset is not None:
            return int(label) + args.offset if label.isdigit() else None
        return by_label.get(label.lower())

    cache: dict[int, list[str]] = {}
    furniture = furniture_keys(doc)

    def words_of(pi: int) -> list[str]:
        if pi not in cache:
            cache[pi] = page_words(doc[pi], furniture)
        return cache[pi]

    inserts: dict[int, list[str]] = defaultdict(list)  # book word index -> marks
    anchors: list[tuple[int, int]] = []  # (pdf page, book word index) of placed marks
    report = Counter()
    unplaced: list[str] = []
    crossrefs: list[str] = []

    def estimate(pi: int) -> float | None:
        if len(anchors) < 3:
            return None
        anchors.sort()
        ps = [p for p, _ in anchors]
        k = bisect.bisect_left(ps, pi)
        near = [w for p, w in anchors[max(0, k - 3):k + 3]]
        return sorted(near)[len(near) // 2]

    def place_on(pi: int, path: list[str], where: str) -> int | None:
        words = words_of(pi)
        for var in term_variants(path):
            n = len(var)
            for at in range(len(words) - n + 1):
                if all(word_match(words[at + k], var[k]) for k in range(n)):
                    hit = locate(book, words, at, n, estimate(pi))
                    if hit is not None:
                        return hit
        if where != "term":
            # the page's first / last words that can be found in the text: a
            # long window, near where the neighbouring pages landed
            est = estimate(pi)
            far = max(2000, len(book.words) // 20)
            rng = range(0, len(words) - 9) if where == "first" else range(len(words) - 10, -1, -1)
            for at in rng:
                hits = book.find(words[at:at + 10])
                if len(hits) == 1 and (est is None or abs(hits[0] - est) <= far):
                    return hits[0] + (0 if where == "first" else 9)
        return None

    # two passes: exact spots first, so later ones can use the page anchors
    jobs = []
    for e in entries:
        path = e["path"]
        if e.get("see"):
            crossrefs.append(index_mark(path, see=e["see"]))
        if e.get("seealso"):
            crossrefs.append(index_mark(path, seealso=e["seealso"]))
        for L in e.get("locators", []):
            jobs.append((path, L))
    pending = []
    for path, L in jobs:
        pi = page_index(L["page"])
        if pi is None:
            unplaced.append(f"{' › '.join(path)}, {L['page']}: page not in the PDF")
            report["page numbers not found in the PDF"] += 1
            continue
        hit = place_on(pi, path, "term")
        pending.append((path, L, pi, hit))
        if hit is not None:
            anchors.append((pi, hit))
    for path, L, pi, hit in pending:
        main = bool(L.get("main"))
        if hit is None:
            hit = place_on(pi, path, "term")
        if L.get("to"):
            pe = page_index(L["to"])
            if hit is None:
                hit = place_on(pi, path, "first")
            end = place_on(pe, path, "last") if pe is not None else None
            if hit is None or end is None or end < hit:
                unplaced.append(f"{' › '.join(path)}, {L['page']}–{L['to']}: range not found")
                report["ranges not placed"] += 1
                continue
            inserts[hit].append(index_mark(path, main=main, range_="start"))
            inserts[end].append(index_mark(path, range_="end"))
            report["ranges placed"] += 1
            continue
        if hit is None and args.page_fallback:
            hit = place_on(pi, path, "first")
            if hit is not None:
                report["pages marked at the page's first words (term not found)"] += 1
        if hit is None:
            unplaced.append(f"{' › '.join(path)}, {L['page']}{L.get('suffix', '')}: term not found on the page")
            report["page references not placed"] += 1
            continue
        mark = index_mark(path, main=main)
        if mark not in inserts[hit]:
            inserts[hit].append(mark)
        report["page references placed"] += 1

    # write
    per_file: dict[int, list[tuple[int, str]]] = defaultdict(list)
    for wi, marks in inserts.items():
        fi, end = book.where[wi]
        per_file[fi].append((end, "".join(marks)))
    out_dir = Path(args.out) if args.out else None
    if not args.in_place and out_dir is None:
        sys.exit("pass --out DIR or --in-place")
    for fi, f in enumerate(files):
        text = book.texts[fi]
        for end, marks in sorted(per_file.get(fi, []), reverse=True):
            text = text[:end] + marks + text[end:]
        text = fix_index_marks(text)
        dest = f if args.in_place else out_dir / f.name
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(text, encoding="utf-8")
    if args.crossrefs and crossrefs:
        Path(args.crossrefs).write_text("\n".join(crossrefs) + "\n", encoding="utf-8")
        report["See / See also marks written to " + args.crossrefs] += len(crossrefs)
    lines = [f"# Index marks from {Path(args.pdf).name}", ""]
    lines += [f"- {k}: {v}" for k, v in report.most_common()]
    if unplaced:
        lines += ["", "## Not placed (mark these by hand, or drop them)", ""] + [f"- {u}" for u in unplaced]
    rep = "\n".join(lines) + "\n"
    if args.report:
        Path(args.report).write_text(rep, encoding="utf-8")
    print("\n".join(lines[:2 + len(report)]), file=sys.stderr)
    if unplaced:
        print(f"{len(unplaced)} not placed" + (f" (see {args.report})" if args.report else ""), file=sys.stderr)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("parse", help="printed index pages -> entries JSON (stdout)")
    p.add_argument("pdf")
    p.add_argument("--pages", required=True, help="PDF pages of the index, 1-based: 467-476")
    p.add_argument("--skip", help="regular expression for lines to ignore (running heads)")
    p.set_defaults(fn=cmd_parse)
    q = sub.add_parser("place", help="entries JSON -> :index marks in the chapter files")
    q.add_argument("entries")
    q.add_argument("pdf")
    q.add_argument("chapters", nargs="+")
    q.add_argument("--offset", type=int, help="PDF page index (0-based) of printed page 0; default: PDF page labels")
    q.add_argument("--out", help="write the marked chapters here")
    q.add_argument("--in-place", action="store_true", help="rewrite the chapter files")
    q.add_argument("--page-fallback", action="store_true", help="mark a page whose text lacks the term at its first words")
    q.add_argument("--crossrefs", help="file for the See / See also marks")
    q.add_argument("--report", help="Markdown report of placed and unplaced references")
    q.set_defaults(fn=cmd_place)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
