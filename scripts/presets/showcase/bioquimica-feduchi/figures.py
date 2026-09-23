"""Artwork for the Bioquímica bundle: the figures, box tables and design
furniture, cut out of the book PDF as SVG with their labels kept as **live
text**.

The private bundle sets every label as outlines (exact glyphs, no font
dependency). This bundle needs the words instead: the English edition
translates them, and a reader of either edition can select them. So the cut
keeps `<text>` runs for every readable face — only genuinely symbolic faces
(bond lines, arrows, Greek set from a Symbol encoding) stay outlined, where a
Unicode mapping would be a guess.

Live text needs the typeface to travel with the picture: a figure is drawn
through an `<img>`, whose SVG cannot reach the page's `@font-face` rules. Each
file therefore carries a `<defs><style>` with the faces it uses, subset to the
characters it actually sets — a few kilobytes, and never a usable copy of the
licensed font. The PDF backend skips `<style>` and sets the same runs from the
document's own embedded faces, so the figure stays vector in print.

Some of the book's figures are a flattened picture with the same words set
live over it, so translating the live run leaves the Spanish showing through
from underneath. `rasters_of()` reads the pictures a cut embeds and
`apply_translation()` paints the old word out — in the colour of the paper
around it — wherever one of them really carries it.

`Cutter.raw()` cuts one region; `labels()` reports every run of every region
(the translator's worklist); `apply_translation()` swaps each run for its
translation, re-spacing the letter stacks a vertical word is set as; and
`embed_faces()` puts the subset faces in.
"""
from __future__ import annotations

import base64
import io
import json
import os
import re
import sys
from typing import Callable

import fitz  # PyMuPDF

PT = 72 / 25.4
#: The book PDF carries a slug around the trimmed page; regions are in mm
#: from the trim.
SLUG = 7.4
#: Book page 1 is the 19th page of the PDF file.
PAGE_OFFSET = 18

#: Faces whose glyphs are shapes, not letters: they stay outlined.
SYMBOLIC = ('Symbol', 'Wingdings', 'ZapfDingbats')


def _pdfsvg(private_source: str):
    """The private bundle's PDF → SVG converter (it knows this book's fonts,
    clips and printer marks). Imported by path so the public builder keeps no
    copy of it."""
    if private_source not in sys.path:
        sys.path.insert(0, private_source)
    import pdfsvg  # noqa: PLC0415
    return pdfsvg


def _regions(private_source: str) -> dict:
    """Every region the bundle cuts: the figures found by the chapter
    extractor plus the fixed furniture of the design."""
    import importlib.util  # noqa: PLC0415
    path = os.path.join(private_source, 'build_figures.py')
    spec = importlib.util.spec_from_file_location('_emp_build_figures', path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    argv = sys.argv
    sys.argv = [path]  # the module parses no arguments at import, but be safe
    try:
        spec.loader.exec_module(module)
    finally:
        sys.argv = argv
    regions = json.load(open(os.path.join(private_source, 'regions.json'), encoding='utf-8'))
    regions.update(module.fixed_regions())
    return regions


class Cutter:
    """Holds the open book and the converter; one instance cuts every
    region."""

    def __init__(self, pdf: str, private_source: str):
        self.pdfsvg = _pdfsvg(private_source)
        self.doc = fitz.open(pdf)
        self.regions = _regions(private_source)
        # Only symbolic faces answer the glyph cache, so every other run is
        # left for the `<text>` branch of the converter.
        cache = self.pdfsvg.glyph_cache(self.doc)
        load = cache._load
        self._outline: set[int] = set()
        cache._load = lambda xref: load(xref) if xref in self._outline else None

    def raw(self, rid: str, width_of: Callable[[str, int, bool, str, float], float] | None = None) -> str:
        """The region as SVG, labels live, no fonts embedded.

        With `width_of`, every run is checked against the glyph origins the
        page actually uses and split where the two part company — the page
        sets some labels with its own spacing (padding a formula out with
        spaces, tracking a caption), which a run set from font metrics alone
        would slide out of place.
        """
        reg = self.regions[rid]
        x0, y0, x1, y1 = reg['bbox']
        clip = fitz.Rect((x0 + SLUG) * PT, (y0 + SLUG) * PT, (x1 + SLUG) * PT, (y1 + SLUG) * PT)
        pno = reg['page'] + PAGE_OFFSET - 1
        self._outline.update(
            f[0] for f in self.doc.get_page_fonts(pno, full=True)
            if any(k.lower() in f[3].lower() for k in SYMBOLIC)
        )
        exclude = [((e[0] + SLUG) * PT, (e[1] + SLUG) * PT, (e[2] + SLUG) * PT, (e[3] + SLUG) * PT)
                   for e in reg.get('exclude', ())]
        svg = self.pdfsvg.svg_region(
            self.doc, pno, clip,
            text=reg.get('text', True),
            skip_fills=tuple(reg.get('skip', ())),
            exclude=exclude,
        )
        if width_of is None or '<text' not in svg:
            return svg
        return split_runs(svg, self._origins(pno, clip), width_of)

    def _origins(self, pno: int, clip: fitz.Rect) -> dict[tuple[str, str, str], list[float]]:
        """Run key (x, y, text as the SVG writes them) → the x of each of its
        characters, from the page's own glyph origins."""
        page = self.doc[pno]
        ox, oy = clip.x0, clip.y0
        out: dict[tuple[str, str, str], list[float]] = {}
        for block in page.get_text('rawdict', clip=clip)['blocks']:
            if block['type'] != 0:
                continue
            for line in block['lines']:
                for span in line['spans']:
                    chars = span['chars']
                    if not chars:
                        continue
                    x, y = chars[0]['origin']
                    key = (self.pdfsvg.fmt(x - ox), self.pdfsvg.fmt(y - oy), ''.join(c['c'] for c in chars))
                    out.setdefault(key, [c['origin'][0] - ox for c in chars])
        return out


def split_runs(svg: str, origins: dict[tuple[str, str, str], list[float]],
               width_of: Callable[[str, int, bool, str, float], float]) -> str:
    """Break each run where the page's glyph origins leave what the font's own
    advances would give, and set each piece at its true x. A run the page sets
    plainly comes through whole.

    Pieces are cut at word boundaries: the advances here are metric sums with
    no kerning, so a couple of tenths of a point accumulate over any long run
    and a tighter rule would shred words — which is exactly what must not
    happen to a label about to be translated. What the page really does by
    hand (padding a formula out with spaces, setting a caption word by word)
    always shows up as a gap at a space, and that is where the cut goes. Only
    a drift no reader could miss cuts mid-word.
    """
    SOFT = 0.5   # pt of drift worth a cut at a space
    HARD = 2.0   # pt of drift worth a cut anywhere

    def replace(m: re.Match) -> str:
        attrs, text = m.group(1), _unescape(m.group(2))
        xs = origins.get((_attr(attrs, 'x') or '', _attr(attrs, 'y') or '', text))
        if not xs or len(xs) != len(text):
            return m.group(0)
        family = _attr(attrs, 'font-family') or ''
        weight = int(_attr(attrs, 'font-weight') or 400)
        italic = 'font-style="italic"' in attrs
        size = float(_attr(attrs, 'font-size') or 0)
        width = lambda run: width_of(family, weight, italic, run, size)  # noqa: E731
        # (first index of the piece, its x) — a piece runs to the next entry.
        pieces: list[tuple[int, float]] = [(0, xs[0])]
        boundary: int | None = None  # last word start seen inside this piece
        for i in range(1, len(text)):
            at_start, x = pieces[-1]
            drift = abs(x + width(text[at_start:i]) - xs[i])
            starts_word = text[i - 1].isspace() and not text[i].isspace()
            if starts_word and drift > SOFT:
                pieces.append((i, xs[i]))
            elif drift > HARD:
                cut = boundary if boundary is not None and boundary > at_start else i
                pieces.append((cut, xs[cut]))
            elif starts_word:
                boundary = i
                continue
            boundary = None
        ends = [p[0] for p in pieces[1:]] + [len(text)]
        pieces_text = [(x, text[at:end_]) for (at, x), end_ in zip(pieces, ends)]
        # A run cut into many short pieces is a word the page has tracked
        # apart. Setting those pieces solid would bunch their letters up and
        # leave the gaps between pieces showing, so every letter goes at the
        # origin the page gives it.
        if len(pieces) > 1 and len(text) / len(pieces) < 5:
            pieces_text = [(xs[i], ch) for i, ch in enumerate(text)]
        if len(pieces_text) == 1:
            return m.group(0)
        rest = re.sub(r'\bx="[^"]*"', '', attrs, count=1).strip()
        return ''.join(
            f'<text x="{_fmt(x)}" {rest}>{_escape(run)}</text>'
            for x, run in pieces_text if run.strip()
        )

    return TEXT_RE.sub(replace, svg)


# --- the runs of a picture ---------------------------------------------------

TEXT_RE = re.compile(r'<text\b([^>]*)>(.*?)</text>', re.S)


def _attr(attrs: str, name: str) -> str | None:
    m = re.search(rf'\b{name}="([^"]*)"', attrs)
    return m.group(1) if m else None


def runs_of(svg: str) -> list[str]:
    """The text of every `<text>` run, in document order (the index a
    translation entry refers to)."""
    return [_unescape(m.group(2)) for m in TEXT_RE.finditer(svg)]


def _unescape(t: str) -> str:
    return t.replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&')


def _escape(t: str) -> str:
    return t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def labels(cutter: Cutter, ids: list[str]) -> dict[str, list[str]]:
    """Every run of every region, for the translation file."""
    return {rid: runs_of(cutter.raw(rid)) for rid in ids}


# --- translating a picture ---------------------------------------------------

def apply_translation(svg: str, entries: list[dict] | dict[str, dict] | None,
                      width_of: Callable[[str, int, bool, str, float], float] | None = None,
                      rasters: list['Raster'] | None = None) -> str:
    """Replace each run with its translation.

    `entries` is positional — one entry per run, in the order `runs_of`
    reports — either as a list (`null` where nothing changes) or, as the
    translation file writes it, as a sparse map from index to entry. An entry
    is `{"en": "…"}`. Three optional keys handle what a different word length
    breaks:

    - `"anchor": "middle" | "end"` keeps the translated run centred (or
      right-aligned) on the original's own extent, measured in the real face,
      so a label centred under a drawing stays centred. `"was"` gives the
      text to measure that extent from, for when one run takes over a line
      the page had broken into several;
    - `"follows": <index>` moves the run by however much that run grew — how
      a superscript keeps its place against the word it belongs to;
    - `"dx"` / `"dy"` nudge the run, in points, for the cases no rule gets
      right;
    - `"cover": false` keeps the old word from being painted out where a
      picture underneath carries it (for a label whose box would swallow the
      drawing around it), and `"cover": true` forces the patch;
    - `"stack": "WORD"` on the *first* run of a letter stack (a word set one
      character per run, as the vertical titles of this book are) replaces the
      whole stack: the letters of `WORD` are spread along the stack's own
      direction and step, and its remaining runs are dropped. `"runs"` says
      how many runs the stack covers.
    """
    if not entries:
        return svg
    matches = list(TEXT_RE.finditer(svg))
    if not matches:
        return svg
    by_index: dict[int, dict] = ({int(k): v for k, v in entries.items() if v}
                                 if isinstance(entries, dict)
                                 else {i: e for i, e in enumerate(entries) if e})
    drop: set[int] = set()
    out: dict[int, str] = {}
    shift: dict[int, float] = {}  # how far each run has already moved
    for i, m in enumerate(matches):
        entry = by_index.get(i)
        if not entry or i in drop:
            continue
        attrs, text = m.group(1), _unescape(m.group(2))
        stack = entry.get('stack')
        if stack is not None:
            n = int(entry.get('runs') or 1)
            group = matches[i:min(i + n, len(matches))]
            out[i] = _restack(group, stack, width_of)
            drop.update(range(i + 1, i + len(group)))
            continue
        english = entry.get('en')
        if english is None:
            english = text
        new_attrs = attrs
        dx = float(entry.get('dx') or 0)
        dy = float(entry.get('dy') or 0)
        anchor = entry.get('anchor')
        follows = entry.get('follows')
        if (anchor in ('middle', 'end') or follows is not None) and width_of is not None:
            family = _attr(attrs, 'font-family') or ''
            weight = int(_attr(attrs, 'font-weight') or 400)
            italic = 'font-style="italic"' in attrs
            size = float(_attr(attrs, 'font-size') or 0)
            if follows is not None:
                at = int(follows)
                ref = by_index.get(at) or {}
                before = _unescape(matches[at].group(2))
                # Where the run it hangs on ended up: what that run was moved
                # by, plus how much longer its new words are.
                dx += shift.get(at, 0.0) + width_of(family, weight, italic, ref.get('en', before), size) \
                    - width_of(family, weight, italic, before, size)
            if anchor in ('middle', 'end'):
                was = entry.get('was', text)
                grew = width_of(family, weight, italic, english, size) - width_of(family, weight, italic, was, size)
                dx -= grew / 2 if anchor == 'middle' else grew
        shift[i] = dx
        if dx:
            new_attrs = _shift(new_attrs, 'x', dx)
        if dy:
            new_attrs = _shift(new_attrs, 'y', dy)
        if english == text and new_attrs == attrs:
            continue
        _erase_under(attrs, text, entry, width_of, rasters)
        out[i] = f'<text{new_attrs}>{_escape(english)}</text>'
    if not out and not drop:
        return svg
    pieces: list[str] = []
    last = 0
    for i, m in enumerate(matches):
        if i not in out and i not in drop:
            continue
        pieces.append(svg[last:m.start()])
        pieces.append(out.get(i, ''))
        last = m.end()
    pieces.append(svg[last:])
    return _rewrite_rasters(''.join(pieces), rasters)


def _rewrite_rasters(svg: str, rasters: list['Raster'] | None) -> str:
    """Put the pictures a wipe changed back into the markup."""
    for raster in rasters or ():
        if raster.dirty:
            svg = svg.replace(raster.href, raster.data_uri(), 1)
    return svg


def _erase_under(attrs: str, text: str, entry: dict,
                 width_of: Callable[[str, int, bool, str, float], float] | None,
                 rasters: list['Raster'] | None) -> None:
    """Wipe the old word out of the flattened picture beneath it, if one
    carries it."""
    if entry.get('cover') is False or not rasters or width_of is None or not text.strip():
        return
    family = _attr(attrs, 'font-family') or ''
    weight = int(_attr(attrs, 'font-weight') or 400)
    italic = 'font-style="italic"' in attrs
    size = float(_attr(attrs, 'font-size') or 0)
    x, y = float(_attr(attrs, 'x') or 0), float(_attr(attrs, 'y') or 0)
    box = (x - 0.3, y - size * 0.78, x + width_of(family, weight, italic, text, size) + 0.3, y + size * 0.24)
    erase_words(rasters, box)


def _shift(attrs: str, name: str, by: float) -> str:
    return re.sub(rf'\b{name}="([^"]*)"', lambda m: f'{name}="{_fmt(float(m.group(1)) + by)}"', attrs, count=1)


def _restack(group: list[re.Match], word: str,
             width_of: Callable[[str, int, bool, str, float], float] | None) -> str:
    """Re-set a word the page breaks into several runs, keeping its own
    spacing.

    Two shapes occur in this book. A word set down the page (the OXIDACIÓN /
    REDUCCIÓN arrows) has one run per letter and a constant step: the new
    letters take the same step from the same first origin. A word tracked
    across the page (the resource strip at the foot of the last page) is cut
    into pieces by the tracking: the new letters keep that tracking, measured
    from how far the original ran beyond its own natural width.
    """
    first, last = group[0], group[-1]
    attrs = first.group(1)
    x0, y0 = float(_attr(attrs, 'x') or 0), float(_attr(attrs, 'y') or 0)
    x1, y1 = float(_attr(last.group(1), 'x') or 0), float(_attr(last.group(1), 'y') or 0)
    base = re.sub(r'\b[xy]="[^"]*"', '', attrs).strip()

    def place(positions):
        return ''.join(
            f'<text x="{_fmt(x)}" y="{_fmt(y)}" {base}>{_escape(ch)}</text>'
            for (x, y), ch in zip(positions, word)
        )

    if abs(y1 - y0) > abs(x1 - x0):
        step = (y1 - y0) / max(len(group) - 1, 1)
        return place([(x0, y0 + step * i) for i in range(len(word))])

    original = ''.join(_unescape(m.group(2)) for m in group)
    if width_of is None or len(original) < 2:
        return place([(x0, y0)] + [(x1, y1)] * (len(word) - 1))
    family = _attr(attrs, 'font-family') or ''
    weight = int(_attr(attrs, 'font-weight') or 400)
    italic = 'font-style="italic"' in attrs
    size = float(_attr(attrs, 'font-size') or 0)
    tail = _unescape(last.group(2))
    extent = x1 + width_of(family, weight, italic, tail, size) - x0
    tracking = (extent - width_of(family, weight, italic, original, size)) / (len(original) - 1)
    positions = []
    x = x0
    for ch in word:
        positions.append((x, y0))
        x += width_of(family, weight, italic, ch, size) + tracking
    return place(positions)


def _fmt(v: float) -> str:
    s = f'{v:.2f}'.rstrip('0').rstrip('.')
    return s if s not in ('', '-0') else '0'


# --- words drawn as curves ------------------------------------------------------

PATH_RE = re.compile(r'<path\b([^>]*)/>')
NUM_RE = re.compile(r'-?\d+(?:\.\d+)?')
#: A glyph of a figure label, in points: tall enough to read, small enough not
#: to be the drawing.
GLYPH_H = (2.2, 13.0)
GLYPH_W = 14.0


def _path_box(d: str) -> tuple[float, float, float, float] | None:
    """A path's extent, from the coordinates in its data. Curve handles can
    overstate it a little, which costs nothing here."""
    nums = [float(n) for n in NUM_RE.findall(d)]
    if len(nums) < 4:
        return None
    xs, ys = nums[0::2], nums[1::2]
    return min(xs), min(ys), max(xs), max(ys)


class Cluster:
    """A run of glyph-shaped paths on one baseline — a word the artwork draws
    as curves instead of setting as text."""

    def __init__(self, member: int, box, fill: str):
        self.members = [member]
        self.x0, self.y0, self.x1, self.y1 = box
        self.fill = fill
        self.bottoms = [box[3]]

    def add(self, member: int, box, ) -> None:
        self.members.append(member)
        self.bottoms.append(box[3])
        self.x0, self.y0 = min(self.x0, box[0]), min(self.y0, box[1])
        self.x1, self.y1 = max(self.x1, box[2]), max(self.y1, box[3])

    @property
    def baseline(self) -> float:
        """Where the glyphs sit: the bottom most of them share, so a descender
        does not drag it down."""
        rounded = [round(b * 2) / 2 for b in self.bottoms]
        return max(set(rounded), key=rounded.count)

    @property
    def size(self) -> float:
        """Point size, from the cap height of the tallest glyph."""
        return round((self.baseline - self.y0) / 0.72, 1)

    def merge(self, other: 'Cluster') -> None:
        self.members += other.members
        self.bottoms += other.bottoms
        self.x0, self.y0 = min(self.x0, other.x0), min(self.y0, other.y0)
        self.x1, self.y1 = max(self.x1, other.x1), max(self.y1, other.y1)

    def holds(self, point: tuple[float, float]) -> bool:
        pad = (self.y1 - self.y0) * 0.6
        return self.x0 - pad <= point[0] <= self.x1 + pad and self.y0 - pad <= point[1] <= self.y1 + pad

    def __repr__(self) -> str:
        return (f'<{len(self.members)} glyphs  [{self.x0:.1f} {self.y0:.1f} {self.x1:.1f} {self.y1:.1f}]  '
                f'baseline {self.baseline:.1f}  {self.size:.1f} pt  {self.fill}>')


def join_lines(clusters: list[Cluster]) -> list[Cluster]:
    """Join the clusters that read as one line — a word the detector split at
    a wide letter gap, or a word and the number after it."""
    out: list[Cluster] = []
    for c in sorted(clusters, key=lambda c: (round(c.baseline, 1), c.x0)):
        for prev in out:
            if (abs(prev.baseline - c.baseline) <= 1.2
                    and 0 <= c.x0 - prev.x1 <= max(prev.size, c.size) * 1.6
                    and abs(prev.size - c.size) <= max(prev.size, c.size) * 0.45):
                prev.merge(c)
                break
        else:
            out.append(c)
    return out


def outlined_clusters(svg: str) -> list[Cluster]:
    """Every word the markup draws as curves, left to right and top to
    bottom. Only paths the size of a letter join a cluster, and a cluster
    breaks at a gap wider than an em."""
    glyphs: list[tuple[int, tuple[float, float, float, float], str]] = []
    for i, m in enumerate(PATH_RE.finditer(svg)):
        attrs = m.group(1)
        d = _attr(attrs, 'd')
        if not d:
            continue
        box = _path_box(d)
        if box is None:
            continue
        w, h = box[2] - box[0], box[3] - box[1]
        if not (GLYPH_H[0] <= h <= GLYPH_H[1]) or w > GLYPH_W or w <= 0:
            continue
        glyphs.append((i, box, _attr(attrs, 'fill') or '#000'))
    clusters: list[Cluster] = []
    for i, box, fill in sorted(glyphs, key=lambda g: (round(g[1][3], 1), g[1][0])):
        size = box[3] - box[1]
        for c in clusters:
            if (c.fill == fill and abs(c.baseline - box[3]) <= size * 0.45
                    and -size * 0.6 <= box[0] - c.x1 <= size * 1.1):
                c.add(i, box)
                break
        else:
            clusters.append(Cluster(i, box, fill))
    return join_lines([c for c in clusters if len(c.members) >= 2])


# --- the pictures a cut embeds --------------------------------------------------

IMAGE_RE = re.compile(r'<image\b([^>]*)>')
#: A run is taken to sit on a picture that carries its words when this share
#: of the pixels under it are darker than the paper around it.
INK_SHARE = 0.02


class Raster:
    """One embedded picture, with the box it is drawn into."""

    def __init__(self, attrs: str):
        from PIL import Image  # noqa: PLC0415
        href = _attr(attrs, 'xlink:href') or _attr(attrs, 'href') or ''
        m = re.match(r'data:image/(png|jpeg|jpg);base64,(.*)', href.strip(), re.S)
        self.ok = bool(m)
        if not m:
            return
        self.x = float(_attr(attrs, 'x') or 0)
        self.y = float(_attr(attrs, 'y') or 0)
        self.w = float(_attr(attrs, 'width') or 0)
        self.h = float(_attr(attrs, 'height') or 0)
        self.image = Image.open(io.BytesIO(base64.b64decode(m.group(2)))).convert('RGB')
        self.format = 'jpeg' if m.group(1) in ('jpeg', 'jpg') else 'png'
        self.href = m.group(0)
        self.dirty = False
        self.ok = self.w > 0 and self.h > 0

    def _pixels(self, box: tuple[float, float, float, float]) -> tuple[int, int, int, int] | None:
        """A box in user space as pixel bounds inside the picture, clipped to
        it; None when it falls outside."""
        px = self.image.width / self.w
        py = self.image.height / self.h
        x0 = int((box[0] - self.x) * px)
        y0 = int((box[1] - self.y) * py)
        x1 = int((box[2] - self.x) * px) + 1
        y1 = int((box[3] - self.y) * py) + 1
        if x1 <= 0 or y1 <= 0 or x0 >= self.image.width or y0 >= self.image.height:
            return None
        x0, y0 = max(x0, 0), max(y0, 0)
        x1, y1 = min(x1, self.image.width), min(y1, self.image.height)
        if x1 - x0 < 2 or y1 - y0 < 2:
            return None
        return x0, y0, x1, y1

    def erase(self, box: tuple[float, float, float, float]) -> None:
        """Paint a box out row by row, blending the pixel just left of the row
        into the one just right of it."""
        bounds = self._pixels(box)
        if bounds is None:
            return
        x0, y0, x1, y1 = bounds
        pixels = self.image.load()
        w = self.image.width

        def outside(at: int, step: int) -> tuple[int, int, int]:
            # The paper beside the box: the lightest of the few pixels just
            # past it, so a neighbouring letter or rule is not smeared in.
            near = [pixels[min(max(at + step * k, 0), w - 1), y] for k in range(1, 6)]
            return max(near, key=lambda p: p[0] + p[1] + p[2])

        for y in range(y0, y1):
            left, right = outside(x0, -1), outside(x1 - 1, 1)
            span = max(x1 - x0 - 1, 1)
            for x in range(x0, x1):
                t = (x - x0) / span
                pixels[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(left, right))
        self.dirty = True

    def data_uri(self) -> str:
        buf = io.BytesIO()
        if self.format == 'jpeg':
            self.image.save(buf, 'JPEG', quality=88, optimize=True)
        else:
            self.image.save(buf, 'PNG', optimize=True)
        return f'data:image/{self.format};base64,' + base64.b64encode(buf.getvalue()).decode('ascii')

    def crop(self, box: tuple[float, float, float, float]):
        """The picture's pixels under a box in user space, or None when the
        box falls outside it."""
        bounds = self._pixels(box)
        return self.image.crop(bounds) if bounds else None


def rasters_of(svg: str) -> list[Raster]:
    out = []
    for m in IMAGE_RE.finditer(svg):
        r = Raster(m.group(1))
        if r.ok:
            out.append(r)
    return out


def raster_words(rasters: list['Raster']) -> list[tuple['Raster', Cluster]]:
    """Every word baked into one of the pictures, in reading order.

    Letters are found as connected blobs of dark, near-neutral pixels (the
    drawings in this book are coloured; its labels are not), then joined into
    words on a shared baseline, exactly as the curve-drawn words are. Boxes
    come back in the figure's own units.
    """
    out: list[tuple['Raster', Cluster]] = []
    for raster in rasters:
        for cluster in _blobs(raster):
            out.append((raster, cluster))
    return sorted(out, key=lambda rc: (round(rc[1].baseline, 1), rc[1].x0))


def _blobs(raster: 'Raster') -> list[Cluster]:
    """The words of one picture, as clusters in the figure's units."""
    image = raster.image
    w, h = image.size
    px, py = image.width / raster.w, image.height / raster.h
    pixels = image.load()
    dark = bytearray(w * h)
    for y in range(h):
        base = y * w
        for x in range(w):
            r, g, b = pixels[x, y]
            hi, lo = max(r, g, b), min(r, g, b)
            if hi < 150 and hi - lo < 50:
                dark[base + x] = 1
    # Connected blobs, four-connected, with a union-find over the rows.
    parent: dict[int, int] = {}

    def find(a: int) -> int:
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    label = [0] * (w * h)
    nxt = 1
    for y in range(h):
        base = y * w
        for x in range(w):
            if not dark[base + x]:
                continue
            up = label[base - w + x] if y else 0
            left = label[base + x - 1] if x else 0
            if up and left:
                label[base + x] = up
                union(up, left)
            elif up or left:
                label[base + x] = up or left
            else:
                label[base + x] = parent[nxt] = nxt
                nxt += 1
    boxes: dict[int, list[int]] = {}
    for y in range(h):
        base = y * w
        for x in range(w):
            l = label[base + x]
            if not l:
                continue
            r = find(l)
            box = boxes.get(r)
            if box is None:
                boxes[r] = [x, y, x, y]
            else:
                box[0] = min(box[0], x); box[1] = min(box[1], y)
                box[2] = max(box[2], x); box[3] = max(box[3], y)
    glyphs = []
    for i, (x0, y0, x1, y1) in enumerate(boxes.values()):
        bw, bh = (x1 - x0 + 1) / px, (y1 - y0 + 1) / py
        if GLYPH_H[0] <= bh <= GLYPH_H[1] and 0 < bw <= GLYPH_W:
            glyphs.append((i, (raster.x + x0 / px, raster.y + y0 / py,
                               raster.x + (x1 + 1) / px, raster.y + (y1 + 1) / py)))
    clusters: list[Cluster] = []
    for i, box in sorted(glyphs, key=lambda g: (round(g[1][3], 1), g[1][0])):
        size = box[3] - box[1]
        for c in clusters:
            if abs(c.baseline - box[3]) <= size * 0.5 and -size * 0.6 <= box[0] - c.x1 <= size * 1.2:
                c.add(i, box)
                break
        else:
            clusters.append(Cluster(i, box, '#231f20'))
    return join_lines([c for c in clusters if len(c.members) >= 2])


def _paper(crop) -> tuple[int, int, int]:
    """The colour of the frame of a crop — the paper the words sit on."""
    w, h = crop.size
    edge = [crop.getpixel((x, y)) for x in range(w) for y in (0, h - 1)]
    edge += [crop.getpixel((x, y)) for y in range(h) for x in (0, w - 1)]
    return max(set(edge), key=edge.count)


def _carries_words(raster: 'Raster', box: tuple[float, float, float, float]) -> bool:
    """Whether this picture really has words in the box — enough pixels
    differing from the paper around them."""
    crop = raster.crop(box)
    if crop is None:
        return False
    paper = _paper(crop)
    pixels = list(crop.getdata())
    far = sum(1 for p in pixels if abs(p[0] - paper[0]) + abs(p[1] - paper[1]) + abs(p[2] - paper[2]) > 90)
    return far >= INK_SHARE * len(pixels)


def erase_words(rasters: list['Raster'], box: tuple[float, float, float, float]) -> bool:
    """Wipe a word out of whichever picture carries it, painting the box over
    row by row from the pixels just outside it — so a tint, a gradient or a
    coloured panel behind the word survives. True when something was wiped."""
    done = False
    for raster in rasters:
        if _carries_words(raster, box):
            raster.erase(box)
            done = True
    return done


# --- words the artwork draws for itself ------------------------------------------

def replace_artwork(svg: str, rasters: list['Raster'], entries: list[dict], family: str) -> str:
    """Set the words a figure *draws* — as curves, or as pixels in a picture —
    in another language.

    Each entry gives the box the word occupies, in the figure's own units,
    and the English to put there: `{"box": [x0, y0, x1, y1], "en": "Period"}`.
    Whatever the box covers is taken out — the glyph curves inside it, and
    the same area of any picture under it — and the new word is set centred on
    the box, at the size the box implies. `size`, `baseline`, `fill`, `align`
    (`middle` by default, or `start` / `end`) and `family` override what is
    inferred — a box with a descender in it needs at least its own `size`.

    `build.py --outlines <id>` lists the boxes a figure's own words occupy,
    which is where these come from.
    """
    if not entries:
        return svg
    drop: set[int] = set()
    added: list[str] = []
    for entry in entries:
        x0, y0, x1, y1 = (float(v) for v in entry['box'])
        english = entry.get('en')
        for i, m in enumerate(PATH_RE.finditer(svg)):
            box = _path_box(_attr(m.group(1), 'd') or '')
            if box and box[0] >= x0 - 0.5 and box[1] >= y0 - 0.5 and box[2] <= x1 + 0.5 and box[3] <= y1 + 0.5:
                drop.add(i)
        for raster in rasters:
            if raster.crop((x0, y0, x1, y1)) is not None:
                raster.erase((x0, y0, x1, y1))
        if not english:
            continue
        size = float(entry.get('size') or round((y1 - y0) / 0.72, 1))
        align = entry.get('align', 'middle')
        x = x0 if align == 'start' else x1 if align == 'end' else (x0 + x1) / 2
        added.append(
            f'<text x="{_fmt(x)}" y="{_fmt(float(entry.get("baseline", y1)))}" '
            f'font-family="{entry.get("family", family)}" '
            f'font-size="{_fmt(size)}" fill="{entry.get("fill", "#231f20")}"'
            + (f' text-anchor="{align}"' if align != 'start' else '')
            + f' xml:space="preserve">{_escape(english)}</text>'
        )
    if drop:
        pieces, last = [], 0
        for i, m in enumerate(PATH_RE.finditer(svg)):
            if i not in drop:
                continue
            pieces.append(svg[last:m.start()])
            last = m.end()
        pieces.append(svg[last:])
        svg = ''.join(pieces)
    if added:
        svg = svg.replace('</g></svg>', ''.join(added) + '</g></svg>')
    return _rewrite_rasters(svg, rasters)


# --- embedded faces ----------------------------------------------------------

def used_faces(svg: str) -> dict[tuple[str, int, bool], set[str]]:
    """Family / weight / italic → the characters the picture sets in it."""
    faces: dict[tuple[str, int, bool], set[str]] = {}
    for m in TEXT_RE.finditer(svg):
        attrs, text = m.group(1), _unescape(m.group(2))
        family = _attr(attrs, 'font-family') or ''
        weight = int(_attr(attrs, 'font-weight') or 400)
        italic = 'font-style="italic"' in attrs
        faces.setdefault((family, weight, italic), set()).update(text)
    return faces


def embed_faces(svg: str, subset: Callable[[str, int, bool, set[str]], bytes | None]) -> str:
    """Put an `@font-face` for every face the picture uses in its `<defs>`.

    `subset(family, weight, italic, chars)` returns the WOFF2 bytes of that
    face cut down to `chars`, or None when the bundle has no such face (the
    run then falls back to the reader's own, as it would anywhere else).
    """
    faces = used_faces(svg)
    if not faces:
        return svg
    rules: list[str] = []
    for (family, weight, italic), chars in sorted(faces.items()):
        chars.discard('')
        data = subset(family, weight, italic, chars)
        if not data:
            continue
        b64 = base64.b64encode(data).decode('ascii')
        rules.append(
            f"@font-face{{font-family:'{family}';font-weight:{weight};"
            f"font-style:{'italic' if italic else 'normal'};"
            f"src:url(data:font/woff2;base64,{b64}) format('woff2');}}"
        )
    if not rules:
        return svg
    defs = '<defs><style type="text/css">' + ''.join(rules) + '</style></defs>'
    head = svg.index('>') + 1
    return svg[:head] + '\n' + defs + svg[head:]


def subsetter(font_files: dict[tuple[str, int, bool], str]) -> Callable[[str, int, bool, set[str]], bytes | None]:
    """A `subset` for `embed_faces` over a family/weight/style → file map.
    A weight the family does not carry takes its nearest neighbour, as a
    browser would."""
    from fontTools import subset as ft_subset  # noqa: PLC0415
    from fontTools.ttLib import TTFont  # noqa: PLC0415

    cache: dict[tuple[str, int, bool, str], bytes | None] = {}

    def pick(family: str, weight: int, italic: bool) -> str | None:
        if (family, weight, italic) in font_files:
            return font_files[(family, weight, italic)]
        candidates = [(w, f) for (fam, w, it), f in font_files.items() if fam == family and it == italic]
        if not candidates and italic:
            candidates = [(w, f) for (fam, w, it), f in font_files.items() if fam == family]
        if not candidates:
            return None
        return min(candidates, key=lambda c: abs(c[0] - weight))[1]

    def subset(family: str, weight: int, italic: bool, chars: set[str]) -> bytes | None:
        path = pick(family, weight, italic)
        if not path:
            return None
        text = ''.join(sorted(chars))
        key = (family, weight, italic, text)
        if key in cache:
            return cache[key]
        font = TTFont(path, fontNumber=0)
        options = ft_subset.Options()
        options.flavor = 'woff2'
        options.desubroutinize = True
        options.drop_tables += ['DSIG']
        options.notdef_outline = True
        options.layout_features = ['*']
        subsetter_ = ft_subset.Subsetter(options=options)
        subsetter_.populate(text=text)
        subsetter_.subset(font)
        buf = io.BytesIO()
        font.flavor = 'woff2'
        font.save(buf)
        font.close()
        cache[key] = buf.getvalue()
        return cache[key]

    return subset


def measurer(font_files: dict[tuple[str, int, bool], str]) -> Callable[[str, int, bool, str, float], float]:
    """Advance width of a string in one of the bundle's faces, in the same
    units as `font-size` — enough to keep a re-worded label on its centre."""
    from fontTools.ttLib import TTFont  # noqa: PLC0415

    fonts: dict[str, tuple[dict, int]] = {}

    def metrics(path: str) -> tuple[dict, int]:
        if path not in fonts:
            font = TTFont(path, fontNumber=0)
            widths = {c: font['hmtx'][g][0] for c, g in font.getBestCmap().items() if g in font['hmtx'].metrics}
            fonts[path] = (widths, font['head'].unitsPerEm)
            font.close()
        return fonts[path]

    def width_of(family: str, weight: int, italic: bool, text: str, size: float) -> float:
        candidates = [(w, f) for (fam, w, it), f in font_files.items() if fam == family and it == italic] \
            or [(w, f) for (fam, w, it), f in font_files.items() if fam == family]
        if not candidates:
            return size * 0.5 * len(text)
        path = min(candidates, key=lambda c: abs(c[0] - weight))[1]
        widths, upem = metrics(path)
        default = widths.get(ord('n'), upem // 2)
        return sum(widths.get(ord(ch), default) for ch in text) * size / upem

    return width_of
