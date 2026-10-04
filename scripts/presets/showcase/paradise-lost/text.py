"""The poem as build.py sets it: twelve books, each with Milton's prose
Argument and its verse paragraphs.

Two transcriptions are combined. The words of the poem come from Project
Gutenberg #26 (the 1674 text in modern spelling, one line per verse line).
It marks only a few of Milton's verse paragraphs, so the paragraph breaks
and the Arguments come from Wikisource's validated transcription of an 1890
reprint (`Paradise lost by Milton, John.djvu`). That transcription carries
some slips of its own ("Province their guide"), so only its line structure
is trusted. The two are aligned line by line; the line numbers are the
standard ones that Verity's notes cite.
"""
from __future__ import annotations

import difflib
import json
import os
import re
from dataclasses import dataclass, field

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "source")

# The standard line count of each book of the 1674 text.
LINES = [798, 1055, 742, 1015, 907, 912, 640, 653, 1189, 1104, 901, 649]


@dataclass
class Book:
    number: int
    argument: str
    lines: list[str]
    # Line numbers (1-based) that open a verse paragraph; line 1 always does.
    paragraph_starts: set[int] = field(default_factory=set)

    def paragraphs(self) -> list[tuple[int, list[str]]]:
        """(first line number, lines) for each verse paragraph."""
        out: list[tuple[int, list[str]]] = []
        for i, line in enumerate(self.lines, start=1):
            if i == 1 or i in self.paragraph_starts:
                out.append((i, []))
            out[-1][1].append(line)
        return out


# --- Gutenberg #26 -------------------------------------------------------------


def gutenberg_books() -> list[list[str]]:
    raw = open(os.path.join(SOURCE, "paradise-lost.txt"), encoding="utf-8").read()
    body = raw.split("*** START OF")[1].split("*** END OF")[0]
    parts = re.split(r"\n\s*Book ([IVX]+)\s*\n", body)
    books = []
    for i in range(1, len(parts), 2):
        lines = [l.strip() for l in parts[i + 1].split("\n") if l.strip()]
        # The volunteer's note after the last line of Book XII.
        if "Transcriber’s Notes" in lines:
            lines = lines[: lines.index("Transcriber’s Notes")]
        books.append(lines)
    return books


# --- Wikisource, 1890 -------------------------------------------------------------

TEMPLATE = re.compile(r"\{\{(?:pline|anchor|nop|dhr|rh)[^{}]*\}\}")
SMALL_CAPS = re.compile(r"\{\{sc\|([^{}]*)\}\}")


def _clean(s: str) -> str:
    s = re.sub(r"<noinclude>.*?</noinclude>", "", s, flags=re.S)
    s = SMALL_CAPS.sub(lambda m: m.group(1), s)
    s = TEMPLATE.sub("", s)
    return s


def wikisource_books() -> list[tuple[str, list[tuple[str, bool]]]]:
    """(argument, [(line, opens a paragraph)]) per book."""
    data = json.load(open(os.path.join(SOURCE, "ws1890", "pages.json"), encoding="utf-8"))
    pages, ranges = data["pages"], data["books"]
    out = []
    for b in range(1, 13):
        first, last = ranges[str(b)]
        text = "".join(_clean(pages[str(n)] or "") for n in range(first, last + 1))
        head, _, rest = text.partition("<poem>")
        argument = head.split("THE ARGUMENT.", 1)[1]
        argument = re.sub(r"\{\{[^{}]*\}\}", "", argument).replace("}}", "")
        argument = " ".join(argument.replace(":", " ", 1).split()) if argument.strip().startswith(":") else " ".join(argument.split())
        lines: list[tuple[str, bool]] = []
        for chunk in re.findall(r"<poem>(.*?)</poem>", "<poem>" + rest, flags=re.S):
            for line in chunk.split("\n"):
                if not line.strip():
                    continue
                opens = line.startswith(":")
                lines.append((line.lstrip(":").strip(), opens))
        out.append((argument, lines))
    return out


# --- choosing between the transcriptions -----------------------------------------


def _norm(s: str) -> str:
    """A line reduced to its words, spelling variants of elision folded."""
    s = s.lower().replace("’", "'")
    s = re.sub(r"(\w)'d\b", r"\1ed", s)
    s = re.sub(r"(\w)'st\b", r"\1est", s)
    s = s.replace("th' ", "the ")
    for a, b in (("æ", "ae"), ("ä", "a"), ("ë", "e"), ("ï", "i"), ("ö", "o"), ("è", "e")):
        s = s.replace(a, b)
    return " ".join(re.findall(r"[a-z]+", s))


def _ratio(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, a, b).ratio()


def verity_lines() -> list[str]:
    """The poem as Verity printed it (OCR): every text line between the
    first Argument and the notes, line numbers and running heads dropped."""
    raw = open(os.path.join(SOURCE, "verity-1910.txt"), encoding="utf-8").read().split("\n")
    notes = next(i for i, l in enumerate(raw) if i > 1000 and l.strip() == "NOTES")
    lines = [re.sub(r"\s+\d+\s*$", "", l).strip() for l in raw[3200:notes]]
    return [l for l in lines if len(l) > 8 and not re.match(r"^(BOOK|\d+\s+PARADISE)", l)]


def choose(gut: list[str], ws: list[str], verity: list[str], start: int, end: int) -> tuple[list[str], int]:
    """Line by line: where Gutenberg and the 1890 text disagree in words, the
    reading closer to Verity's (searched near the line's expected place in
    his book) wins. Returns the lines and the number of disputes."""
    vn = [_norm(l) for l in verity[start:end]]
    n = len(ws)
    out: list[str] = []
    disputes = 0
    for i, (g, w) in enumerate(zip(gut, ws)):
        a, c = _norm(g), _norm(w)
        if a == c:
            out.append(w)
            continue
        disputes += 1
        expected = int(i * len(vn) / n)
        window = vn[max(0, expected - 60) : expected + 60]
        best = max(window, key=lambda v: max(_ratio(a, v), _ratio(c, v)))
        out.append(g if _ratio(a, best) >= _ratio(c, best) else w)
    return out, disputes


def book_starts(ws_books: list[list[str]], verity: list[str]) -> list[int]:
    vn = [_norm(l) for l in verity]
    starts: list[int] = []
    for lines in ws_books:
        first = _norm(lines[0])
        lo = starts[-1] + 1 if starts else 0
        starts.append(max(range(lo, len(vn)), key=lambda k: _ratio(first, vn[k])))
    return starts + [len(verity)]


def typographic(line: str) -> str:
    """Curly quotes and apostrophes throughout (the 1890 transcription uses
    straight ones, Gutenberg curly ones)."""
    line = re.sub(r'(^|[\s(—])"', r"\1“", line)
    line = line.replace('"', "”")
    line = re.sub(r"(^|[\s(—“])'(?=[A-Za-z])(?![a-z]+\b(?<=tis\b))", r"\1‘", line)
    return line.replace("'", "’")


# Gutenberg's Book III repeats line 145 after line 34 (index 34, 0-based).
GUTENBERG_SPURIOUS = {3: [34]}

WS_TEMPLATES = [
    # Wiki italics ('' … '') and bold: the poem is set in roman throughout.
    (re.compile(r"'{2,3}"), ""),
    (re.compile(r"\{\{SIC\|[^|{}]*\|([^{}]*)\}\}"), r"\1"),
    (re.compile(r"\{\{[^{}]*\}\}"), ""),
]


def _ws_line(s: str) -> str:
    for rx, rep in WS_TEMPLATES:
        s = rx.sub(rep, s)
    return " ".join(s.split())


# Slips of the 1890 transcription in the Arguments, read against Verity's.
ARGUMENT_FIXES = {
    1: [("what to determine on,", "what to determine thereon,")],
    3: [("orbof", "orb of")],
    4: [("appointstwo", "appoints two"), ("less the Evil Spirit", "lest the evil Spirit")],
    9: [("as a midst by night", "as a mist by night"), ("enters unto the Serpent", "enters into the Serpent"), ("urges her, going apart", "urges her going apart")],
    10: [("transgression know,", "transgression known,"), ("fortels", "foretells"), ("altera-tions", "alterations")],
    12: [("comes by decrees", "comes by degrees")],
}

# The text follows Verity's British spelling; lines taken from the 1890
# (American) reprint are brought into line.
AMERICAN = re.compile(
    r"\b(hon|lab|col|vap|fav|od|rig|val|splend|harb|endeav|vig|rum|sav|arm|clam|ard|hum|neighb|behavi|parl|enam|succ)or(s|ed|ing|able|ably|ite|ites|y|ies)?\b",
    re.I,
)


def british(s: str) -> str:
    return AMERICAN.sub(lambda m: m.group(1) + ("our" if m.group(1).islower() or m.group(1)[0].isupper() else "OUR") + (m.group(2) or ""), s)


_BOOKS: list[Book] = []


def books() -> list[Book]:
    if _BOOKS:
        return _BOOKS
    gut = gutenberg_books()
    for b, indexes in GUTENBERG_SPURIOUS.items():
        for i in sorted(indexes, reverse=True):
            assert "sovran command" in gut[b - 1][i], gut[b - 1][i]
            del gut[b - 1][i]
    ws = wikisource_books()
    verity = verity_lines()
    ws_lines = [[_ws_line(l) for l, _ in lines] for _, lines in ws]
    starts = book_starts(ws_lines, verity)
    out = []
    for n in range(12):
        if not (len(gut[n]) == len(ws_lines[n]) == LINES[n]):
            raise SystemExit(f"Book {n + 1}: {len(gut[n])} / {len(ws_lines[n])} lines, expected {LINES[n]}")
        lines, _ = choose(gut[n], ws_lines[n], verity, starts[n], starts[n + 1])
        paragraph_starts = {i + 1 for i, (_, opens) in enumerate(ws[n][1]) if opens}
        argument = ws[n][0]
        for a, b in ARGUMENT_FIXES.get(n + 1, []):
            if a not in argument:
                raise SystemExit(f"Book {n + 1} Argument: {a!r} not found")
            argument = argument.replace(a, b)
        out.append(Book(n + 1, typographic(british(argument)), [typographic(british(l)) for l in lines], paragraph_starts))
    _BOOKS.extend(out)
    return out


if __name__ == "__main__":
    for b in books():
        print(b.number, len(b.lines), LINES[b.number - 1], len(b.paragraphs()), b.argument[:60])
