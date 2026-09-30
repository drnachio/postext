"""Helpers that write text in the Postext Markdown dialect.

Postext is not CommonMark. Its parser is line based and its inline passes are
regular expressions, so text copied from a source document must be made safe
before it lands in a chapter:

- inline marks do not nest the CommonMark way: `**a *b* c**` works, `*a **b** c*`
  does not; the emitter writes one flat run per style (`**a** ***b***`);
- `* _ ^ ~ $` and backticks are live everywhere, including inside words;
- a paragraph whose first characters look like a list marker, a heading, a quote
  or a fence (`1998. `, `- `, `# `, `> `, `:::`) is parsed as that construct;
- heading text is plain (marks are stripped), attributes are `{key="value"}` at
  the end of the line and values can hold neither `}` nor their own quote.

Import this module from the other scripts (they add this folder to sys.path).
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

WORD_JOINER = "⁠"

# Characters with an inline meaning in Postext text blocks.
_ESCAPE_RE = re.compile(r"([*_^~$`\\])")
# A backslash only escapes these; elsewhere it is literal and must stay single.
_ESCAPABLE = set("*_^~$`")

# Line starts the block parser reads as something other than a paragraph.
_TRAP_RE = re.compile(r"^(\d+[.)]\s|[-*+]\s|>|#{1,6}\s|:::|::resource)")

_LIGATURES = {
    "ﬀ": "ff",
    "ﬁ": "fi",
    "ﬂ": "fl",
    "ﬃ": "ffi",
    "ﬄ": "ffl",
    "ﬅ": "st",
    "ﬆ": "st",
}

# Odd spaces become plain spaces; the no-break ones (U+00A0, U+202F narrow,
# U+2007 figure) are kept: postext 1.5 glues the words on either side of them.
_SPACES_RE = re.compile(r"[ -  -  　\t]")
_ZERO_WIDTH_RE = re.compile(r"[​‌‍﻿\u0007]")


def clean_text(text: str) -> str:
    """Normalise characters that extraction leaves behind (ligatures, odd spaces,
    zero-width marks, line separators) without touching the words."""
    for lig, rep in _LIGATURES.items():
        text = text.replace(lig, rep)
    text = _ZERO_WIDTH_RE.sub("", text)
    text = _SPACES_RE.sub(" ", text)
    text = text.replace(" ", " ").replace(" ", " ")
    # Non-breaking hyphen: many faces lack the glyph, so it becomes a plain
    # hyphen (a break opportunity between letters). To keep a compound on one
    # line, join it with a word joiner (U+2060) instead.
    text = text.replace("‑", "-")
    return unicodedata.normalize("NFC", text)


# Runs of breaking whitespace; the no-break spaces are not collapsed, since
# they glue their neighbours (Python's `\s` matches them too).
_BREAKING_SPACE_RUN_RE = re.compile(r"[^\S\u00a0\u202f\u2007]+")


def collapse_spaces(text: str) -> str:
    """Collapse runs of breaking whitespace to one space and trim the ends,
    keeping the no-break spaces (U+00A0, U+202F, U+2007) in the text."""
    return _BREAKING_SPACE_RUN_RE.sub(" ", text).strip()


def escape(text: str) -> str:
    """Escape the characters with inline meaning so they print literally."""
    out = []
    for ch in text:
        if ch in _ESCAPABLE:
            out.append("\\" + ch)
        else:
            out.append(ch)
    return "".join(out)


def guard_line_start(line: str) -> str:
    """Prefix a WORD JOINER when a paragraph would otherwise start a list, a
    heading, a quote or a fence. The joiner is invisible and unbreakable."""
    if _TRAP_RE.match(line):
        return WORD_JOINER + line
    return line


def slugify(text: str, max_words: int = 4, max_len: int = 48) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    # Letters and digits of every script: a Chinese title gives a Chinese
    # slug (第一回-甄士隐梦幻识通灵), as the engine's slugify does.
    words = re.findall(r"[^\W_]+", text.lower())
    words = [w for w in words if w not in _STOPWORDS] or words
    slug = "-".join(words[:max_words])[:max_len].strip("-")
    return slug or "item"


_STOPWORDS = {
    # en
    "a", "an", "the", "of", "and", "or", "in", "on", "to", "for", "with", "by", "from",
    "at", "as", "is", "are", "its", "this", "that",
    # es
    "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "y", "o", "en",
    "con", "por", "para", "al", "se", "su", "sus", "que",
    # fr / it / pt / de / ca (most frequent)
    "le", "les", "des", "du", "et", "il", "lo", "gli", "e", "da", "do", "das", "dos",
    "der", "die", "das", "und", "im", "els", "i",
}


class Slugger:
    """Unique slugs within one project."""

    def __init__(self) -> None:
        self.used: set[str] = set()

    def __call__(self, text: str, prefix: str = "") -> str:
        base = (prefix + "-" if prefix else "") + slugify(text)
        slug = base
        n = 2
        while slug in self.used:
            slug = f"{base}-{n}"
            n += 1
        self.used.add(slug)
        return slug


def attr_value(value: str) -> str:
    """A value safe inside `key="…"`: no double quote, no braces, one line.
    Double quotes become typographic ones; braces become parentheses."""
    value = clean_text(value)
    value = value.replace('"', "”").replace("{", "(").replace("}", ")")
    value = collapse_spaces(value)
    return value


def attrs(**pairs: str | int | None) -> str:
    """`{a="x" b="y"}` from keyword arguments; None values are dropped."""
    items = [f'{k}="{attr_value(str(v))}"' for k, v in pairs.items() if v is not None and v != ""]
    return "{" + " ".join(items) + "}" if items else ""


def heading(level: int, text: str, **attributes: str | None) -> str:
    """One heading line. Heading text is plain in Postext: marks are stripped by
    the parser, so the caller passes plain text (math `$…$` survives).
    A title ending in braces would be read as attributes: a trailing word joiner
    keeps them literal."""
    level = max(1, min(6, level))
    text = collapse_spaces(clean_text(text))
    text = text.replace("\\\\", "\\")
    a = attrs(**attributes)
    if not a and text.endswith("}"):
        text += WORD_JOINER
    line = "#" * level + " " + text
    return line + (" " + a if a else "")


# ---------------------------------------------------------------------------
# Inline runs → Postext inline markup
# ---------------------------------------------------------------------------


@dataclass
class Run:
    """A piece of inline text with its style. `raw` runs are already Postext
    markup (math, refs, chips) and are emitted verbatim."""

    text: str
    bold: bool = False
    italic: bool = False
    sup: bool = False
    sub: bool = False
    raw: bool = False

    def style(self) -> tuple[bool, bool, bool, bool]:
        return (self.bold, self.italic, self.sup, self.sub)


def _merge(runs: list[Run]) -> list[Run]:
    out: list[Run] = []
    for r in runs:
        if not r.text:
            continue
        if out and not r.raw and not out[-1].raw and out[-1].style() == r.style():
            out[-1].text += r.text
        else:
            out.append(Run(r.text, r.bold, r.italic, r.sup, r.sub, r.raw))
    return out


# Letters of a word for the rule below. Chinese and Japanese are written
# without spaces, so a style boundary between two Han or kana characters is
# no slip inside a word: they are left out.
_WORD = "(?:(?![\u3040-\u30ff\u3100-\u312f\u31a0-\u31ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\U00020000-\U0003134f])\\w)+"
_WORD_TAIL_RE = re.compile(f"({_WORD})$")
_WORD_HEAD_RE = re.compile(f"^({_WORD})")


def normalise_runs(runs: list[Run]) -> list[Run]:
    """Make style boundaries fall on word boundaries.

    - whitespace/punctuation-only runs take the style of the text around them,
      so they do not split one bold phrase into two;
    - a boundary inside a word is a typesetting slip: the part of the word with
      more letters wins.
    """
    runs = _merge([Run(clean_text(r.text), r.bold, r.italic, r.sup, r.sub, r.raw) if not r.raw else r for r in runs])
    # 1. neutral runs inherit
    for i, r in enumerate(runs):
        if r.raw or r.sup or r.sub:
            continue
        if re.fullmatch(r"[\s.,;:!?()\[\]«»“”‘’'\"–—-]*", r.text):
            prev = runs[i - 1] if i > 0 else None
            nxt = runs[i + 1] if i + 1 < len(runs) else None
            if prev and nxt and not prev.raw and not nxt.raw and prev.style() == nxt.style():
                r.bold, r.italic = prev.bold, prev.italic
            elif r.text.strip() == "":
                r.bold = r.italic = False
    runs = _merge(runs)
    # 2. boundaries inside words: move the shorter side across
    changed = True
    guard = 0
    while changed and guard < 4 * max(1, len(runs)):
        changed = False
        guard += 1
        for i in range(len(runs) - 1):
            a, b = runs[i], runs[i + 1]
            if a.raw or b.raw or a.sup or a.sub or b.sup or b.sub:
                continue
            if a.style() == b.style():
                continue
            ma = _WORD_TAIL_RE.search(a.text)
            mb = _WORD_HEAD_RE.match(b.text)
            if not ma or not mb:
                continue
            left, right = ma.group(1), mb.group(1)
            if len(left) >= len(right):
                a.text += right
                b.text = b.text[len(right):]
            else:
                b.text = left + b.text
                a.text = a.text[: -len(left)]
            changed = True
        runs = _merge(runs)
    return runs


def render_runs(runs: list[Run]) -> str:
    """Postext inline markup for a list of runs (flat, never nested)."""
    parts: list[str] = []
    for r in normalise_runs(runs):
        if r.raw:
            parts.append(r.text)
            continue
        text = r.text
        if r.sup or r.sub:
            inner = text.strip()
            if not inner:
                parts.append(escape(text))
                continue
            mark = "^" if r.sup else "~"
            lead = text[: len(text) - len(text.lstrip())]
            trail = text[len(text.rstrip()):]
            parts.append(lead + mark + escape(inner) + mark + trail)
            continue
        if not (r.bold or r.italic) or not text.strip():
            parts.append(escape(text))
            continue
        mark = "***" if (r.bold and r.italic) else ("**" if r.bold else "*")
        lead = text[: len(text) - len(text.lstrip())]
        trail = text[len(text.rstrip()):]
        parts.append(lead + mark + escape(text.strip()) + mark + trail)
    out = "".join(parts)
    return re.sub(r"[ ]{2,}", " ", out).strip()


def paragraph(runs_or_text: list[Run] | str) -> str:
    text = runs_or_text if isinstance(runs_or_text, str) else render_runs(runs_or_text)
    text = re.sub(r"\s*\n\s*", " ", text).strip()
    return guard_line_start(text)


def fence(name: str, body: list[str], **attributes: str | int | None) -> str:
    a = attrs(**attributes)
    inner = "\n\n".join(b for b in body if b.strip())
    return f":::{name}{a}\n{inner}\n:::"


def resource_embed(rid: str) -> str:
    """`::resource{id="…"}` must be exactly this, alone on its line, with blank
    lines around it."""
    return f'::resource{{id="{rid}"}}'


def ref(rid: str, style: str | None = None, case: str | None = None) -> str:
    extra = ""
    if style:
        extra += f' style="{style}"'
    if case:
        extra += f' case="{case}"'
    return f':ref{{id="{rid}"{extra}}}'


def index_mark(path: list[str], *, sort: str | None = None, main: bool = False, see: list[str] | None = None,
               seealso: list[str] | None = None, range_: str | None = None, index: str | None = None) -> str:
    """`:index{term="A!b" …}`: a back-of-book index mark that prints nothing
    (postext >= 1.7). `path` holds the entry's levels; `!` inside a level
    would start a new one, so it becomes `ǃ` (U+01C3). `see`/`seealso` are
    target paths; `range_` is "start" or "end". Empty string when `path` has
    no text."""
    def levels(p: list[str]) -> str:
        return "!".join(attr_value(x).replace("!", "ǃ").strip() for x in p if x and x.strip())
    term = levels(path)
    if not term:
        return ""
    out = f'term="{term}"'
    if sort:
        out += f' sort="{attr_value(sort)}"'
    if see:
        out += f' see="{levels(see)}"'
    if seealso:
        out += f' seealso="{levels(seealso)}"'
    if range_ in ("start", "end"):
        out += f' range="{range_}"'
    if index:
        out += f' index="{attr_value(index)}"'
    if main:
        out += " main"
    return f":index{{{out}}}"


_MARKS_AFTER_COLON_RE = re.compile(r"(?<=[^\s:]):((?::index\{[^}\n]*\})+)")


def fix_index_marks(text: str) -> str:
    """Move `:index{…}` marks written right after a colon (`word::index{…}`,
    which the parser does not read as a mark) in front of it."""
    return _MARKS_AFTER_COLON_RE.sub(r"\1:", text)


_LINK_SCHEMES = ("http:", "https:", "mailto:", "tel:", "ftp:")


def link_destination(url: str) -> str | None:
    """The destination to write in `[text](…)` for `url`, or None when Postext
    would not link it: only http(s), mailto, tel and ftp URLs are live links
    (a relative path means nothing outside the source document). Characters
    the Postext parser would misread are percent-encoded: spaces, `$` (inline
    math), backslashes, angle brackets, and parentheses that do not balance
    (balanced ones are read as part of the URL)."""
    url = url.strip()
    if not url.lower().startswith(_LINK_SCHEMES):
        return None
    depth = 0
    balanced = True
    for ch in url:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth < 0:
                balanced = False
    balanced = balanced and depth == 0
    out = []
    for ch in url:
        if ch.isspace():
            out.append("%20")
        elif ch in "$\\<>" or (ch in "()" and not balanced):
            out.append("%{:02X}".format(ord(ch)))
        else:
            out.append(ch)
    return "".join(out)


def join_blocks(blocks: list[str]) -> str:
    """Blocks separated by one blank line, file ending in a newline."""
    text = "\n\n".join(b.strip("\n") for b in blocks if b and b.strip())
    return text + "\n"


# ---------------------------------------------------------------------------
# Captions and cross-references
# ---------------------------------------------------------------------------

CAPTION_LABEL_RE = re.compile(
    r"^\s*(?P<label>fig(?:ure|ura|\.)?|figs?\.|table|tabla|tab\.|tableau|tabelle|tabella|plate|lámina|chart|gráfico|map|mapa|image|imagen|ilustración|illustration|esquema|diagram|diagrama|box|recuadro|cuadro)"
    r"\s*(?P<num>[0-9IVXLC]+(?:[.\-–][0-9]+)*)\s*[.:\-–—]?\s*",
    re.IGNORECASE,
)
MENTION_RE = re.compile(
    r"\b(?P<label>Fig(?:ure|ura|s)?\.?|Figuras?|Figures|Tab(?:le|la|las|les)?\.?|Plates?|Láminas?)\s+(?P<num>[0-9]+(?:[.\-–][0-9]+)*)",
    re.IGNORECASE,
)


def caption_kind(label: str) -> str:
    return "table" if label.lower().startswith(("tab", "cuadro")) else "figure"


def link_mentions(text: str, label_to_id: dict[tuple[str, str], str], on_link=None) -> str:
    """Turn 'Figure 1.2' / 'tabla 3-1' in body lines into :ref. `label_to_id`
    maps (kind, number) to a resource id; `on_link(rid)` is called for every
    link (e.g. to float the resource). Headings, fences and embeds are left
    alone."""
    if not label_to_id:
        return text

    def sub(m: re.Match) -> str:
        label = m.group("label")
        rid = label_to_id.get((caption_kind(label), m.group("num").replace("–", "-")))
        if not rid:
            return m.group(0)
        if on_link:
            on_link(rid)
        style = "full" if len(label.rstrip(".")) > 4 else None
        case = "lower" if label[:1].islower() else None
        return ref(rid, style=style, case=case)

    lines = text.split("\n")
    for n, line in enumerate(lines):
        if line.startswith(("#", ":::", "::resource", "---", "title:", "author:", "subtitle:")):
            continue
        lines[n] = MENTION_RE.sub(sub, line)
    return "\n".join(lines)
