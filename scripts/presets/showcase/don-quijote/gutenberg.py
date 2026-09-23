"""Slice the Project Gutenberg texts of Don Quijote (#2000, Spanish) and
Don Quixote (#996, John Ormsby's translation) into clean paragraphs.

Both files wrap lines at ~70 columns and separate paragraphs with blank
lines; the English one also carries `pNNN.jpg (150K)` / `Full Size` lines
left over from the illustrated HTML edition. Verse (Antonio's ballad,
Grisóstomo's song, the epitaph, the ballad lines don Quijote quotes) is kept
line by line as `Verse` blocks — a block of short lines is a stanza, and
consecutive stanzas form one poem, headed by the title line the text sets
over it. Nothing here knows about the preset: it only returns lists of
paragraphs per section.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Union

IMG_LINE = re.compile(r"^(?:[a-z0-9_-]+\.jpg(?: \(\d+K\))?|Full Size)$")


@dataclass
class Verse:
    """A poem: its stanzas (lists of lines) and the title line over it."""

    stanzas: list[list[str]] = field(default_factory=list)
    title: str | None = None

    @property
    def text(self) -> str:
        return " ".join(line for stanza in self.stanzas for line in stanza)


Paragraph = Union[str, Verse]


@dataclass
class Section:
    key: str
    heading: str
    paragraphs: list[Paragraph]


# Prose wraps at ~70 columns; a block whose every line is this short is
# verse (hendecasyllables run to ~50 characters).
VERSE_MAX_LINE = 58
# Title lines the texts set over a poem, and how the preset prints them.
SONG_TITLES = {
    "Antonio": "Antonio",
    "Canción de Grisóstomo": "Canción de Grisóstomo",
    "ANTONIO’S BALLAD": "Antonio’s ballad",
    "THE LAY OF CHRYSOSTOM": "The lay of Chrysostom",
}
HEADING_LINE = re.compile(r"^(?:CHAPTER [IVX]+\.|Capítulo (?:primero|[IVX]+)\.)")


# A prose line the Spanish text runs straight into a quoted couplet.
PROSE_LEADS = ("— Para mí, señor castellano, cualquiera cosa basta, porque",)


def _is_verse(block: list[str]) -> bool:
    if len(block) < 2 or HEADING_LINE.match(block[0].strip()):
        return False
    return all(len(line.strip()) <= VERSE_MAX_LINE for line in block)


def _verse_line(line: str) -> str:
    line = line.strip()
    # The Spanish romance opens with a bare dash (`-Yo sé, Olalla…`).
    if line.startswith("-") and not line.startswith("- "):
        line = line[1:].strip()
    return line


def _paragraphs(lines: list[str]) -> list[Paragraph]:
    blocks: list[list[str]] = []
    buf: list[str] = []
    for raw in lines:
        line = raw.rstrip()
        if IMG_LINE.match(line.strip()):
            continue
        if not line.strip():
            if buf:
                blocks.append(buf)
                buf = []
            continue
        buf.append(line)
    if buf:
        blocks.append(buf)

    out: list[Paragraph] = []
    title: str | None = None
    for block in blocks:
        if _is_verse(block):
            if block[0].strip() in PROSE_LEADS:
                out.append(block[0].strip())
                block = block[1:]
            stanza = [_verse_line(line) for line in block]
            if out and isinstance(out[-1], Verse) and title is None:
                out[-1].stanzas.append(stanza)
            else:
                out.append(Verse([stanza], title))
            title = None
            continue
        text = re.sub(r"\s+", " ", " ".join(s.strip() for s in block)).strip()
        if not text:
            continue
        if text in SONG_TITLES:
            title = SONG_TITLES[text]
            continue
        if title is not None:
            out.append(title)
            title = None
        out.append(text)
    if title is not None:
        out.append(title)
    return out


def _slice(lines: list[str], start: int, end: int) -> list[str]:
    """1-based inclusive `start`, exclusive `end` line numbers."""
    return lines[start - 1 : end - 1]


# --- Spanish (Gutenberg #2000) ----------------------------------------------

ES_CHAPTER_RE = re.compile(r"^Capítulo (primero|[IVX]+)\. ")


def spanish_sections(text: str, chapters: int = 8) -> list[Section]:
    lines = text.split("\n")
    # The prologue of the first part sits between "PRÓLOGO" and the
    # commendatory verses ("AL LIBRO DE DON QUIJOTE DE LA MANCHA").
    start = next(i for i, l in enumerate(lines, 1) if l.strip() == "PRÓLOGO")
    end = next(i for i, l in enumerate(lines, 1) if l.startswith("AL LIBRO DE DON QUIJOTE"))
    sections = [Section("prologo", "Prólogo", _paragraphs(_slice(lines, start + 1, end)))]

    starts = [i for i, l in enumerate(lines, 1) if ES_CHAPTER_RE.match(l)]
    for n in range(chapters):
        s = starts[n]
        e = starts[n + 1]
        # A part title ("Segunda parte del ingenioso hidalgo…") may precede the
        # next chapter heading; drop it from the tail of this chapter.
        body = _slice(lines, s, e)
        while body and (not body[-1].strip() or body[-1].startswith("Segunda parte") or body[-1].startswith("Tercera parte")):
            body.pop()
        paras = _paragraphs(body)
        heading = paras[0]
        assert isinstance(heading, str)
        sections.append(Section(f"c{n + 1:02d}", heading, paras[1:]))
    return sections


# --- English (Gutenberg #996, Ormsby) ---------------------------------------

EN_CHAPTER_RE = re.compile(r"^CHAPTER ([IVX]+)\.$")


def english_sections(text: str, chapters: int = 8) -> list[Section]:
    lines = text.split("\n")
    # Second occurrence of the author's preface heading is the text itself
    # (the first is the contents listing); it runs to the commendatory verses.
    prefs = [i for i, l in enumerate(lines, 1) if l.strip() == "THE AUTHOR’S PREFACE"]
    start = prefs[1]
    end = next(i for i, l in enumerate(lines, 1) if l.strip() == "SOME COMMENDATORY VERSES")
    sections = [Section("prologo", "The Author’s Preface", _paragraphs(_slice(lines, start + 1, end)))]

    starts = [i for i, l in enumerate(lines, 1) if EN_CHAPTER_RE.match(l.strip())]
    for n in range(chapters):
        s = starts[n]
        e = starts[n + 1]
        body = _slice(lines, s, e)
        paras = _paragraphs(body)
        # "CHAPTER I." and the title lines form one paragraph.
        first = paras[0]
        assert isinstance(first, str)
        heading = re.sub(r"^CHAPTER [IVX]+\.\s*", "", first)
        sections.append(Section(f"c{n + 1:02d}", heading, paras[1:]))
    return sections


def titlecase_en(heading: str) -> str:
    """Ormsby's headings are all caps; set them in sentence case with the
    proper nouns the fourteen chapters and preface use restored."""
    s = heading.lower()
    s = s[0].upper() + s[1:]
    for name in ["Don Quixote", "La Mancha", "Sancho Panza", "Rocinante", "Dulcinea", "Toboso", "Amadis", "Cervantes",
                 "Puerto Lapice", "Biscayan", "Andres", "Haldudo", "Quintanar", "Marquis of Mantua", "Toledo", "Benedictine",
                 "Puerto Lápice", "Manchegan", "Marcela", "Chrysostom", "Ambrosio", "Vivaldo"]:
        s = re.sub(re.escape(name.lower()), name, s)
    return s
