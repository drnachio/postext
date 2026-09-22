"""Parse a saved ESO / NSF NOIRLab press-release page: title, subtitle,
date, body paragraphs (up to the "More information" section) and the
caption of every image the page embeds.
"""
from __future__ import annotations

import html
import re
from dataclasses import dataclass, field
from html.parser import HTMLParser

STOP_HEADINGS = re.compile(
    r"^(más información|información adicional|more information|notas?|notes?|enlaces|links|contactos?|contacts?|"
    r"about the release|sobre la nota|acerca de)", re.I,
)
FOOTNOTE = re.compile(r"\s*\[\d+\]")
BLOCK_TAGS = {"h1", "h2", "h3", "h4", "p", "li", "blockquote"}


@dataclass
class Release:
    title: str = ""
    subtitle: str = ""
    date: str = ""
    paragraphs: list[str] = field(default_factory=list)
    captions: dict[str, str] = field(default_factory=dict)


class _Blocks(HTMLParser):
    """Text of every block element with its class, in document order, with
    `<em>`/`<i>` runs marked as *italics*."""

    def __init__(self) -> None:
        super().__init__()
        self.blocks: list[tuple[str, str, str]] = []
        self._buf: list[str] | None = None
        self._cur = ("", "")
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ("script", "style"):
            self._skip += 1
        if tag in BLOCK_TAGS:
            self._buf = []
            self._cur = (tag, a.get("class", "") or "")
        elif tag in ("em", "i") and self._buf is not None:
            self._buf.append("*")
        elif tag == "br" and self._buf is not None:
            self._buf.append(" ")

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self._skip = max(0, self._skip - 1)
        if tag in ("em", "i") and self._buf is not None:
            self._buf.append("*")
        if tag in BLOCK_TAGS and self._buf is not None:
            text = re.sub(r"\s+", " ", "".join(self._buf)).strip()
            text = re.sub(r"\*\s+", "* ", text)
            text = re.sub(r"\*\*", "", text)
            if text:
                self.blocks.append((self._cur[0], self._cur[1], text))
            self._buf = None

    def handle_data(self, data):
        if self._buf is not None and not self._skip:
            self._buf.append(data)


POPUP = re.compile(r"<a\s+class=\"popup\"([^>]*)>", re.I)
ATTR = re.compile(r"([a-z-]+)=\"([^\"]*)\"", re.I)
IMG_ID = re.compile(r"/(?:screen|newsfeature|large|publicationjpg)/([a-z0-9]+)\.jpg", re.I)


def parse(page: str) -> Release:
    parser = _Blocks()
    parser.feed(page)
    rel = Release()
    started = False
    body_done = False
    for tag, cls, text in parser.blocks:
        if tag == "h1" and not started:
            rel.title = text
            started = True
            continue
        if not started or body_done:
            continue
        if tag == "h3" and not rel.date and not rel.paragraphs:
            rel.subtitle = text
            continue
        if tag == "p" and "date" in cls:
            rel.date = text
            continue
        if tag in ("h2", "h3", "h4"):
            if STOP_HEADINGS.match(text):
                body_done = True
            continue
        if tag == "p" and (rel.date or rel.paragraphs or "text_intro" in cls):
            rel.paragraphs.append(FOOTNOTE.sub("", text))
    # Captions: the popup anchors around the embedded images.
    for m in POPUP.finditer(page):
        attrs = dict((k.lower(), html.unescape(v)) for k, v in ATTR.findall(m.group(1)))
        idm = IMG_ID.search(attrs.get("href", ""))
        if not idm:
            continue
        cap = attrs.get("title") or attrs.get("aria-label") or ""
        if cap and idm.group(1) not in rel.captions:
            rel.captions[idm.group(1)] = cap.strip()
    return rel
