"""Slice the Project Gutenberg texts of Don Quijote (#2000, Spanish) and
Don Quixote (#996, John Ormsby's translation) into clean paragraphs.

Both files wrap lines at ~70 columns and separate paragraphs with blank
lines; the English one also carries `pNNN.jpg (150K)` / `Full Size` lines
left over from the illustrated HTML edition. Nothing here knows about the
preset: it only returns lists of paragraphs per section.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

IMG_LINE = re.compile(r"^(?:[a-z0-9_-]+\.jpg(?: \(\d+K\))?|Full Size)$")


@dataclass
class Section:
    key: str
    heading: str
    paragraphs: list[str]


def _paragraphs(lines: list[str]) -> list[str]:
    out: list[str] = []
    buf: list[str] = []
    for raw in lines:
        line = raw.rstrip()
        if IMG_LINE.match(line.strip()):
            continue
        if not line.strip():
            if buf:
                out.append(" ".join(s.strip() for s in buf))
                buf = []
            continue
        buf.append(line)
    if buf:
        out.append(" ".join(s.strip() for s in buf))
    return [re.sub(r"\s+", " ", p).strip() for p in out if p.strip()]


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
        heading = re.sub(r"^CHAPTER [IVX]+\.\s*", "", paras[0])
        sections.append(Section(f"c{n + 1:02d}", heading, paras[1:]))
    return sections


def titlecase_en(heading: str) -> str:
    """Ormsby's headings are all caps; set them in sentence case with the
    proper nouns the eight chapters and preface use restored."""
    s = heading.lower()
    s = s[0].upper() + s[1:]
    for name in ["Don Quixote", "La Mancha", "Sancho Panza", "Rocinante", "Dulcinea", "Toboso", "Amadis", "Cervantes",
                 "Puerto Lapice", "Biscayan", "Andres", "Haldudo", "Quintanar", "Marquis of Mantua", "Toledo", "Benedictine",
                 "Puerto Lápice"]:
        s = re.sub(re.escape(name.lower()), name, s)
    return s
