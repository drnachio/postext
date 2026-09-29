#!/usr/bin/env python3
"""InDesign (IDML) -> DRAFT Postext chapters, driven by paragraph style names.

IDML gives the text with its paragraph/character styles, the tables and the
anchored objects, but not where the text lands on the printed page (that is
the composer's job). Use the book's PDF for positions (pdf_extract.py /
pdf_figures.py) and IDML for clean text and style names.

  1. idml_extract.py roles book.idml > map.json
     Lists every paragraph style in use (count, resolved font/size/colour,
     sample) per story and writes a map skeleton: set each style's role.
  2. idml_extract.py markdown book.idml --map map.json --out draft/ [--lang es]
        [--stories auto|all|u123,u456] [--split-role h1]

Roles are the same as pdf_extract.py: body, h1..h6, skip, caption, footnote,
paragraphs:<style>, callout:<type>, callout-title:<type>, list, list:ordered.
Character runs keep bold/italic (from FontStyle), superscript/subscript
(Position); tables become table resources (TableModel with spans and header
rows); anchored images become resource stubs with their link; footnotes become
chapter endnotes; index page references (Window > Type & Tables > Index) become
`:index{term="…"}` marks (postext >= 1.7): topic levels, sort order, a bold
page-number style as `main`, ranged references as range start/end, and See /
See also cross-references gathered in the report as marks to paste above
`:::index`. East Asian character attributes become Postext marks (postext >= 1.9):
ruby (`RubyFlag`/`RubyString`) as `:ruby[…]{rt="…"}`, tate-chu-yoko as
`:tcy[…]`, kenten (emphasis marks) as `:dots[…]`, warichu as `:warichu[…]`,
nested when a run carries several (a warichu note outermost, then ruby, dots
and tate-chu-yoko) and keeping the run's bold and italic inside them;
vertical stories (`StoryOrientation="Vertical"`) and a right-to-left page
binding are reported, since they belong in the config.

Export IDML from InDesign with File > Export > InDesign Markup (IDML).
Standard library only.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from collections import Counter, defaultdict
from pathlib import Path
from xml.etree import ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parent))
from postext_md import (  # noqa: E402
    CAPTION_LABEL_RE,
    Run,
    Slugger,
    attr_value,
    caption_kind,
    clean_text,
    collapse_spaces,
    escape,
    fence,
    guard_line_start,
    fix_index_marks,
    heading,
    index_mark,
    join_blocks,
    link_mentions,
    render_runs,
    resource_embed,
    slugify,
)

PT = 72 / 25.4
ITEM_TAGS = {"TextFrame", "Rectangle", "Group", "Polygon", "Oval", "GraphicLine"}
TABLE_MARK = "￰"
OBJECT_MARK = "￱"
INDEX_MARK = "￳"  # prefix of a run holding a ready :index{…} mark


def short(name: str | None) -> str:
    if not name:
        return ""
    return name.split("/", 1)[-1].replace("%3a", ":").replace("$ID/", "")


def parse_transform(s):
    return tuple(float(v) for v in s.split()) if s else (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)


def apply(m, x, y):
    a, b, c, d, e, f = m
    return (a * x + c * y + e, b * x + d * y + f)


def compose(o, i):
    a, b, c, d, e, f = o
    a2, b2, c2, d2, e2, f2 = i
    return (a * a2 + c * b2, b * a2 + d * b2, a * c2 + c * d2, b * c2 + d * d2, a * e2 + c * f2 + e, b * e2 + d * f2 + f)


def item_bbox(el, m):
    m = compose(m, parse_transform(el.get("ItemTransform")))
    pts = []
    geo = el.find("Properties/PathGeometry")
    if geo is not None:
        for pp in geo.iter("PathPointType"):
            x, y = (float(v) for v in pp.get("Anchor").split())
            pts.append(apply(m, x, y))
    for ch in el:
        if ch.tag in ITEM_TAGS:
            b = item_bbox(ch, m)
            if b:
                pts += [(b[0], b[1]), (b[2], b[3])]
    if not pts:
        return None
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return (min(xs), min(ys), max(xs), max(ys))


def _props(el):
    return {pr.tag: (pr.text or "").strip() for pr in el.findall("Properties/*")}


# Kenten kinds as :dots styles: (style, fill), "" for the default. Other
# kinds (triangles, squares, bullseyes, custom marks) have no :dots style
# and are set as plain dots, which the report lists.
KENTEN_STYLES = {
    "KentenSesameDot": ("sesame", ""), "KentenWhiteSesameDot": ("sesame", "open"),
    "KentenBlackCircle": ("circle", "filled"), "KentenWhiteCircle": ("circle", ""),
    "KentenSmallBlackCircle": ("", ""), "KentenSmallWhiteCircle": ("", "open"),
}
# How the marks of one run nest, outermost first: a warichu note holds
# whatever its text carries, a ruby base may carry dots or a tate-chu-yoko
# cell.
CJK_ORDER = ("warichu", "ruby", "dots", "tcy")


def cjk_mark(a: dict) -> dict | None:
    """The East Asian marks a character range carries, from its IDML
    attributes, by kind: ruby (reading, group), warichu, tate-chu-yoko and
    kenten (emphasis marks: style, fill, the IDML kind)."""
    marks: dict = {}
    if a.get("RubyFlag") == "true" and a.get("RubyString"):
        marks["ruby"] = (a["RubyString"], a.get("RubyType", "GroupRuby") != "PerCharacterRuby")
    if a.get("Warichu") == "true":
        marks["warichu"] = True
    if a.get("Tatechuyoko") == "true":
        marks["tcy"] = True
    kind = a.get("KentenKind", "None")
    if kind and kind != "None":
        marks["dots"] = KENTEN_STYLES.get(kind, ("", "")) + (kind,)
    return marks or None


def _bracket_safe(text: str) -> str | None:
    """Markup for inside `:mark[…]`: balanced brackets stay as they are, a `]`
    with no `[` before it is escaped, an escaped character is kept as it is,
    and None when a `[` is left open (the parser would not close the mark)."""
    out, depth, i = [], 0, 0
    while i < len(text):
        ch = text[i]
        if ch == "\\" and i + 1 < len(text):
            out.append(text[i:i + 2])
            i += 2
            continue
        if ch == "[":
            depth += 1
        elif ch == "]":
            if depth == 0:
                out.append("\\]")
                i += 1
                continue
            depth -= 1
        out.append(ch)
        i += 1
    return None if depth else "".join(out)


def cjk_markup(kind: str, key, inner: str) -> str | None:
    """Postext markup for one East Asian mark around `inner` (markup already),
    or None when it cannot go inside the brackets (an unclosed `[`)."""
    inner = _bracket_safe(inner)
    if inner is None:
        return None
    if kind == "ruby":
        return f':ruby[{inner}]{{rt="{attr_value(key[0])}"{" group" if key[1] else ""}}}'
    if kind == "dots":
        a = " ".join(x for x in (f'style="{key[0]}"' if key[0] else "", f'fill="{key[1]}"' if key[1] else "") if x)
        return f":dots[{inner}]" + (f"{{{a}}}" if a else "")
    return f":{kind}[{inner}]"


class IRun:
    __slots__ = ("text", "font", "fstyle", "size", "position", "color", "cstyle", "cjk")

    def __init__(self, text, font, fstyle, size, position, color, cstyle, cjk=None):
        self.text, self.font, self.fstyle, self.size = text, font, fstyle, size
        self.position, self.color, self.cstyle = position, color, cstyle
        self.cjk = cjk

    @property
    def bold(self):
        return any(w in self.fstyle for w in ("Bold", "Semibold", "SemiBold", "Black", "Heavy", "Demi"))

    @property
    def italic(self):
        return "Italic" in self.fstyle or "Oblique" in self.fstyle


class IPara:
    __slots__ = ("style", "runs", "tables", "objects", "notes")

    def __init__(self, style):
        self.style = style
        self.runs: list[IRun] = []
        self.tables: list = []
        self.objects: list = []
        self.notes: list[list["IPara"]] = []

    def text(self) -> str:
        return "".join(r.text for r in self.runs)


class Idml:
    def __init__(self, path: Path) -> None:
        self.z = zipfile.ZipFile(path)
        self._styles()
        self._topics()
        self._spreads()
        self._stories()

    def xml(self, name: str):
        return ET.fromstring(self.z.read(name))

    def _styles(self) -> None:
        root = self.xml("Resources/Styles.xml")
        raw_p, raw_c = {}, {}
        for e in root.iter("ParagraphStyle"):
            raw_p[short(e.get("Self"))] = (dict(e.attrib), _props(e))
        for e in root.iter("CharacterStyle"):
            raw_c[short(e.get("Self"))] = (dict(e.attrib), _props(e))

        def resolve(raw, name, seen=()):
            if name not in raw or name in seen:
                return {}
            attrs, props = raw[name]
            base = short(props.get("BasedOn") or attrs.get("BasedOn"))
            out = dict(resolve(raw, base, seen + (name,))) if base and base != name else {}
            for k, v in list(attrs.items()) + list(props.items()):
                if k not in ("Self", "Name", "BasedOn", "NextStyle", "Imported", "KeyboardShortcut", "PreviewColor",
                             "TabList", "AllGREPStyles", "AllNestedStyles", "AllLineStyles"):
                    out[k] = v
            return out

        self.pstyles = {n: resolve(raw_p, n) for n in raw_p}
        self.cstyles = {n: resolve(raw_c, n) for n in raw_c}
        self.colors = {}
        if "Resources/Graphic.xml" in self.z.namelist():
            for c in self.xml("Resources/Graphic.xml").iter("Color"):
                self.colors[short(c.get("Self"))] = (c.get("Space"), c.get("ColorValue"))

    def hexcolor(self, name: str) -> str:
        c = self.colors.get(short(name))
        if not c or not c[1]:
            return ""
        vals = [float(v) for v in c[1].split()]
        if c[0] == "CMYK" and len(vals) == 4:
            cc, m, y, k = (v / 100 for v in vals)
            rgb = (255 * (1 - cc) * (1 - k), 255 * (1 - m) * (1 - k), 255 * (1 - y) * (1 - k))
        elif c[0] == "RGB" and len(vals) == 3:
            rgb = vals
        else:
            return ""
        return "#%02x%02x%02x" % tuple(round(v) for v in rgb)

    def _topics(self) -> None:
        """The index topics: Self -> (levels, sort key), plus the See / See
        also cross-references as ready marks."""
        self.topics: dict[str, tuple[list[str], str]] = {}
        self.index_crossrefs: list[str] = []
        self.index_report: Counter = Counter()
        cross: list[tuple[list[str], str, str]] = []

        def walk(el, path):
            for tp in el.findall("Topic"):
                here = path + [tp.get("Name", "")]
                self.topics[tp.get("Self")] = (here, tp.get("SortOrder", ""))
                for cr in tp.findall("CrossReference"):
                    cross.append((here, cr.get("ReferencedTopic", ""), cr.get("CrossReferenceType", "See")))
                walk(tp, here)

        for name in self.z.namelist():
            if not name.endswith(".xml"):
                continue
            raw = self.z.read(name)
            if b"<Topic " not in raw:
                continue
            for ix in ET.fromstring(raw).iter("Index"):
                walk(ix, [])
        for path, target, kind in cross:
            tgt = self.topics.get(target, ([], ""))[0]
            if not tgt:
                continue
            also = "Also" in kind
            self.index_crossrefs.append(index_mark(path, seealso=tgt) if also else index_mark(path, see=tgt))

    def page_reference(self, e) -> str:
        """A PageReference as an :index mark ('' when its topic is unknown)."""
        path, sort = self.topics.get(e.get("ReferencedTopic", ""), ([], ""))
        if not path:
            self.index_report["index page references with an unknown topic (dropped)"] += 1
            return ""
        kind = e.get("PageReferenceType", "CurrentPage")
        if kind == "SuppressPageNumbers":
            return ""
        style = short(e.get("PageNumberStyleOverride", "")).lower()
        main = any(w in style for w in ("bold", "negrita", "fett", "gras", "grassetto"))
        self.index_report["index page references -> :index marks"] += 1
        if kind != "CurrentPage":
            self.index_report[f"index page references of type {kind} set as one page (add range=\"end\" by hand)"] += 1
        return index_mark(path, sort=sort or None, main=main)

    def _spreads(self) -> None:
        dm = self.z.read("designmap.xml").decode("utf8")
        self.pages: list[tuple[str, tuple]] = []
        self.first_pos: dict[str, tuple] = {}  # story -> (page index, y, x)
        for sf in re.findall(r'idPkg:Spread src="([^"]+)"', dm):
            root = self.xml(sf)
            sp = root.find("Spread")
            if sp is None:
                continue
            here = []
            for pg in sp.findall("Page"):
                m = parse_transform(pg.get("ItemTransform"))
                gb = [float(v) for v in pg.get("GeometricBounds").split()]
                x0, y0 = apply(m, gb[1], gb[0])
                x1, y1 = apply(m, gb[3], gb[2])
                here.append((len(self.pages), (x0, y0, x1, y1)))
                self.pages.append((pg.get("Name"), (x0, y0, x1, y1)))

            def walk(el, m):
                for ch in el:
                    if ch.tag not in ITEM_TAGS:
                        continue
                    b = item_bbox(ch, m)
                    if b is None:
                        continue
                    cx = (b[0] + b[2]) / 2
                    idx = min(here, key=lambda p: abs((p[1][0] + p[1][2]) / 2 - cx))[0] if here else 999
                    story = ch.get("ParentStory")
                    if ch.tag == "TextFrame" and story:
                        pos = (idx, b[1], b[0])
                        if story not in self.first_pos or pos < self.first_pos[story]:
                            self.first_pos[story] = pos
                    if ch.tag == "Group":
                        walk(ch, compose(m, parse_transform(ch.get("ItemTransform"))))

            walk(sp, (1.0, 0.0, 0.0, 1.0, 0.0, 0.0))

    def _run(self, pstyle: str, plocal: dict, cel) -> dict:
        out = dict(self.pstyles.get(pstyle, {}))
        out.update(plocal)
        cs = short(cel.get("AppliedCharacterStyle"))
        if cs and "[No character style]" not in cs:
            out.update(self.cstyles.get(cs, {}))
        else:
            cs = ""
        out.update({k: v for k, v in cel.attrib.items() if k != "AppliedCharacterStyle"})
        out.update(_props(cel))
        out["_cstyle"] = cs
        return out

    def paras(self, el) -> list[IPara]:
        paras: list[IPara] = []

        def ranges(node):
            for ch in node:
                if ch.tag == "ParagraphStyleRange":
                    yield ch
                elif ch.tag not in ("Table", "Cell", "CharacterStyleRange", "Footnote"):
                    yield from ranges(ch)

        for pr in ranges(el):
            pstyle = short(pr.get("AppliedParagraphStyle"))
            plocal = {k: v for k, v in pr.attrib.items() if k != "AppliedParagraphStyle"}
            plocal.update(_props(pr))
            cur = IPara(pstyle)

            def mk(a, text):
                return IRun(text, a.get("AppliedFont", ""), a.get("FontStyle", "Regular"),
                            float(a["PointSize"]) if a.get("PointSize") else None,
                            a.get("Position", "Normal"), short(a.get("FillColor", "")), a.get("_cstyle", ""),
                            cjk_mark(a))

            for cel in pr:
                if cel.tag != "CharacterStyleRange":
                    continue
                a = self._run(pstyle, plocal, cel)
                for e in cel:
                    if e.tag == "Content":
                        if e.text:
                            cur.runs.append(mk(a, e.text))
                    elif e.tag == "Br":
                        paras.append(cur)
                        cur = IPara(pstyle)
                    elif e.tag == "Table":
                        cur.tables.append(e)
                        cur.runs.append(mk(a, TABLE_MARK))
                    elif e.tag in ITEM_TAGS:
                        cur.objects.append(e)
                        cur.runs.append(mk(a, OBJECT_MARK))
                    elif e.tag == "Footnote":
                        cur.notes.append(self.paras(e))
                        cur.runs.append(mk(a, "￲"))
                    elif e.tag == "PageReference":
                        mark = self.page_reference(e)
                        if mark:
                            cur.runs.append(mk(a, INDEX_MARK + mark))
                    elif e.tag == "Properties":
                        continue
                    else:
                        txt = "".join((c.text or "") for c in e.iter("Content"))
                        if txt:
                            cur.runs.append(mk(a, txt))
            paras.append(cur)
        while paras and not paras[-1].runs and not paras[-1].tables:
            paras.pop()
        return paras

    def _stories(self) -> None:
        self.stories: dict[str, list[IPara]] = {}
        self.vertical: set[str] = set()
        for name in sorted(n for n in self.z.namelist() if n.startswith("Stories/") and n.endswith(".xml")):
            st = self.xml(name).find("Story")
            if st is not None:
                self.stories[st.get("Self")] = self.paras(st)
                pref = st.find("StoryPreference")
                if pref is not None and pref.get("StoryOrientation") == "Vertical":
                    self.vertical.add(st.get("Self"))
        self.binding = ""
        if "Resources/Preferences.xml" in self.z.namelist():
            pref = self.xml("Resources/Preferences.xml").find(".//DocumentPreference")
            if pref is not None:
                self.binding = pref.get("PageBinding", "")

    def layout_notes(self, stories: list[str]) -> list[str]:
        """Config facts the stories imply: vertical text and a right-bound book."""
        notes = []
        vertical = [s for s in stories if s in self.vertical]
        if vertical:
            notes.append(f"{len(vertical)} of {len(stories)} stories are set vertically (StoryOrientation=Vertical): "
                         "layout.writingMode: 'vertical-rl'")
        if self.binding == "RightToLeft":
            notes.append("the document is bound on the right (PageBinding=RightToLeft): page.binding: 'right' "
                         "(the default for a vertical book)")
        return notes

    def ordered_stories(self) -> list[str]:
        """Stories placed on document pages, in page order of their first frame."""
        placed = [s for s in self.stories if s in self.first_pos]
        return sorted(placed, key=lambda s: self.first_pos[s])


def style_font(doc: Idml, style: str) -> str:
    a = doc.pstyles.get(style, {})
    font = a.get("AppliedFont", "")
    return f"{font} {a.get('FontStyle', '')} {a.get('PointSize', '')}pt {doc.hexcolor(a.get('FillColor', ''))}".strip()


def cmd_roles(args) -> None:
    doc = Idml(Path(args.idml))
    counts: Counter = Counter()
    samples: dict = {}
    for sid in doc.ordered_stories():
        for p in doc.stories[sid]:
            t = p.text().strip()
            counts[p.style] += 1
            if t and p.style not in samples:
                samples[p.style] = t[:70]
    print(f"# {Path(args.idml).name}: {len(doc.pages)} pages, {len(doc.stories)} stories "
          f"({len(doc.ordered_stories())} placed)", file=sys.stderr)
    for note in doc.layout_notes(doc.ordered_stories()):
        print(f"# {note}", file=sys.stderr)
    styles = {}
    for st, n in counts.most_common():
        low = st.lower()
        guess = "body"
        m = re.search(r"(?:heading|título|titulo|titre|h)\s*([1-6])\b", low)
        if m:
            guess = f"h{m.group(1)}"
        elif any(w in low for w in ("caption", "pie", "leyenda", "légende")):
            guess = "caption"
        elif any(w in low for w in ("footnote", "nota al pie", "nota pie")):
            guess = "footnote"
        elif any(w in low for w in ("bullet", "viñeta", "vineta", "list", "lista")):
            guess = "list"
        elif any(w in low for w in ("folio", "running", "cornisa", "header", "footer", "página")):
            guess = "skip"
        print(f"  {n:6d}  {st:40.40}  {style_font(doc, st):40.40}  [{guess}]  | {samples.get(st, '')}", file=sys.stderr)
        styles[st] = guess
    stories = [{"id": s, "page": doc.pages[doc.first_pos[s][0]][0] if doc.first_pos[s][0] < len(doc.pages) else "?",
                "paragraphs": len(doc.stories[s]), "chars": sum(len(p.text()) for p in doc.stories[s])}
               for s in doc.ordered_stories()]
    print(json.dumps({"idml": str(Path(args.idml).resolve()), "styles": styles, "stories": "auto",
                      "_stories": stories[:200],
                      "_help": "Set each style's role (body, h1..h6, skip, caption, footnote, list, list:ordered, "
                               "paragraphs:<style>, callout:<type>, callout-title:<type>). `stories`: 'auto' (every placed "
                               "story in page order), 'main' (the longest), or a list of story ids."},
                     ensure_ascii=False, indent=2))


def table_model(doc: Idml, tbl, render) -> dict:
    ncols = len(tbl.findall("Column"))
    nrows = len(tbl.findall("Row"))
    header = int(tbl.get("HeaderRowCount", "0"))
    widths = [float(c.get("SingleColumnWidth", "0")) for c in tbl.findall("Column")]
    grid: list[list[dict | None]] = [[None] * ncols for _ in range(nrows)]
    for cell in tbl.findall("Cell"):
        c, r = (int(v) for v in cell.get("Name").split(":"))
        cs, rs = int(cell.get("ColumnSpan", "1")), int(cell.get("RowSpan", "1"))
        paras = doc.paras(cell)
        content = "\n".join(render(p) for p in paras if p.text().strip())
        entry: dict = {"content": content}
        if r < header:
            entry["isHeader"] = True
        if cs > 1:
            entry["colSpan"] = cs
        if rs > 1:
            entry["rowSpan"] = rs
        fill = doc.hexcolor(cell.get("FillColor", ""))
        if fill and fill not in ("#ffffff",) and cell.get("FillColor", "").find("None") < 0:
            entry["background"] = {"hex": fill, "model": "hex"}
        if r < nrows and c < ncols:
            grid[r][c] = entry
            for dr in range(rs):
                for dc in range(cs):
                    if (dr or dc) and r + dr < nrows and c + dc < ncols:
                        grid[r + dr][c + dc] = {"content": "", "hiddenBy": {"row": r, "col": c}}
    rows = [[x if x is not None else {"content": ""} for x in row] for row in grid]
    model: dict = {"rows": rows}
    if header:
        model["headerRowCount"] = header
    if widths and all(widths):
        total = sum(widths)
        model["columnWidths"] = [round(w / total, 4) for w in widths]
    return model


def cmd_markdown(args) -> None:
    doc = Idml(Path(args.idml))
    cfg = json.loads(Path(args.map).read_text(encoding="utf-8"))
    roles: dict[str, str] = cfg.get("styles", {})
    sel = args.stories or cfg.get("stories", "auto")
    order = doc.ordered_stories()
    if sel == "main":
        order = [max(order, key=lambda s: sum(len(p.text()) for p in doc.stories[s]))]
    elif isinstance(sel, list) or (isinstance(sel, str) and sel not in ("auto", "all")):
        wanted = sel if isinstance(sel, list) else sel.split(",")
        order = [s for s in wanted if s in doc.stories]
    out = Path(args.out)
    (out / "chapters" / args.lang).mkdir(parents=True, exist_ok=True)
    slug = Slugger()
    resources: list[dict] = []
    label_to_id: dict = {}
    report: Counter = Counter()
    unmapped: Counter = Counter()
    chapters: list[list] = []  # [title, blocks, notes]
    callout: list | None = None
    list_run: list[str] = []

    def leaf(r: IRun, plain: bool, marks: bool) -> Run | None:
        if r.text.startswith(INDEX_MARK):
            if marks and not plain:
                return Run(r.text[1:], raw=True)
            if not marks:
                report["index marks in table cells or captions dropped (they print as written there)"] += 1
            return None
        t = r.text.replace("\u2028", " ").replace("\t", " ")
        return Run(t, r.bold, r.italic, r.position in ("Superscript", "OTSuperscript"),
                   r.position in ("Subscript", "OTSubscript"))

    def nest(prs: list[IRun], cjk: list, depth: int, plain: bool, marks: bool) -> list[Run]:
        """Runs for `prs`, the East Asian marks from CJK_ORDER[depth] on
        written around them, each kind nested inside the one before it."""
        if depth == len(CJK_ORDER):
            return [x for x in (leaf(r, plain, marks) for r in prs) if x is not None]
        kind = CJK_ORDER[depth]
        key = [(m or {}).get(kind) for m in cjk]
        out: list[Run] = []
        i = 0
        while i < len(prs):
            j = i + 1
            while j < len(prs) and key[j] == key[i]:
                j += 1
            inner = nest(prs[i:j], cjk[i:j], depth + 1, plain, marks)
            if key[i] is None:
                out += inner
            else:
                markup = cjk_markup(kind, key[i], render_runs(inner))
                if markup is None:
                    out += inner
                    report[f"East Asian :{kind} marks left out: the text holds an unclosed '[' (mark by hand)"] += 1
                else:
                    out.append(Run(markup, raw=True))
                    report[f"East Asian marks written as :{kind}[…] (check them against the PDF)"] += 1
                    if kind == "dots" and key[i][2] not in KENTEN_STYLES:
                        report[f"kenten {key[i][2]} set as plain :dots (no such style in Postext)"] += 1
            i = j
        return out

    def run_marks(prs: list[IRun]) -> list:
        """Each run's marks; an index mark takes the marks around it when both
        sides share them, so it does not cut a ruby or a note in two."""
        cjk = [r.cjk for r in prs]
        for i, r in enumerate(prs):
            if r.text.startswith(INDEX_MARK):
                before = next((prs[k].cjk for k in range(i - 1, -1, -1) if not prs[k].text.startswith(INDEX_MARK)), None)
                after = next((prs[k].cjk for k in range(i + 1, len(prs)) if not prs[k].text.startswith(INDEX_MARK)), None)
                cjk[i] = before if before == after else None
        return cjk

    def render(p: IPara, plain: bool = False, marks: bool = True) -> str:
        prs = [r for r in p.runs if r.text not in (TABLE_MARK, OBJECT_MARK, "\ufff2")]
        if plain:
            runs = nest(prs, [None] * len(prs), 0, plain, marks)
            return collapse_spaces("".join(x.text for x in runs))
        return render_runs(nest(prs, run_marks(prs), 0, plain, marks))

    def has_cjk_marks(p: IPara) -> bool:
        return any(r.cjk for r in p.runs)

    def target() -> list:
        return callout[2] if callout else chapters[-1][1]

    def close_callout():
        nonlocal callout
        if callout:
            chapters[-1][1].append(fence("callout", callout[2], type=callout[0], title=callout[1]))
        callout = None

    def flush_list():
        if list_run:
            target().append("\n".join(list_run))
            list_run.clear()

    note_no = 0
    for sid in order:
        for p in doc.stories[sid]:
            role = roles.get(p.style)
            if role is None:
                unmapped[p.style] += 1
                role = "body"
            text_plain = render(p, plain=True)
            if not chapters or (role == args.split_role and chapters[-1][1]):
                close_callout()
                if chapters:
                    flush_list()
                chapters.append(["", [], []])
                note_no = 0
            if role == "skip":
                continue
            for tbl in p.tables:
                model = table_model(doc, tbl, lambda q: render(q, marks=False))
                rid = slug(text_plain or f"table {len(resources) + 1}", "table")
                resources.append({"id": rid, "typeId": "table", "kind": "table", "caption": "",
                                  "placement": {"position": "here", "span": "column"}, "table": {"model": model}})
                flush_list()
                target().append(resource_embed(rid))
                report["tables -> table resources (add captions)"] += 1
            for obj in p.objects:
                link = obj.find(".//Link")
                uri = link.get("LinkResourceURI") if link is not None else ""
                if not uri:
                    report["anchored objects without an image link (text frames/drawings): check by hand"] += 1
                    continue
                rid = slug(Path(uri).stem, "fig")
                resources.append({"id": rid, "typeId": "figure", "kind": "bitmap", "caption": "",
                                  "placement": {"position": "here", "span": "column"},
                                  "source": {"link": uri}})
                flush_list()
                target().append(resource_embed(rid))
                report["anchored images -> resource stubs (convert the linked files)"] += 1
            if not text_plain:
                continue
            text = render(p)
            for notes in p.notes:
                note_no += 1
                chapters[-1][2].append(f"^{note_no}^ " + " ".join(render(n) for n in notes))
                text = text.replace("￲", f"^{note_no}^", 1)
            if role.startswith("h") and role[1:].isdigit():
                close_callout()
                flush_list()
                if role == args.split_role and not chapters[-1][0]:
                    chapters[-1][0] = text_plain
                marks = "".join(r.text[1:] for r in p.runs if r.text.startswith(INDEX_MARK))
                chapters[-1][1].append(heading(int(role[1:]), text_plain) + marks)
                if has_cjk_marks(p):
                    report["East Asian marks in headings dropped (the heading keeps the text; mark it by hand)"] += 1
                continue
            if role == "caption":
                text = render(p, marks=False)
                m = CAPTION_LABEL_RE.match(text_plain)
                last = resources[-1] if resources and not resources[-1].get("caption") else None
                if last is None:
                    kind = caption_kind(m.group("label")) if m else "figure"
                    rid = slug(CAPTION_LABEL_RE.sub("", text_plain), "table" if kind == "table" else "fig")
                    last = {"id": rid, "typeId": kind, "kind": "table" if kind == "table" else "bitmap",
                            "caption": "", "placement": {"position": "auto", "span": "column"}}
                    resources.append(last)
                    target().append(resource_embed(rid))
                if m:
                    label_to_id[(caption_kind(m.group("label")), m.group("num"))] = last["id"]
                    label = re.escape(m.group(0).strip()).replace("\\ ", "\\s*")
                    text = re.sub(rf"^(\*{{1,3}})?\s*{label}\s*(\*{{1,3}})?\s*", "", text, count=1)
                last["caption"] = text
                last["altText"] = attr_value(CAPTION_LABEL_RE.sub("", text_plain))
                continue
            if role == "footnote":
                chapters[-1][2].append(guard_line_start(text))
                continue
            if role.startswith("callout-title:"):
                close_callout()
                flush_list()
                callout = [role.split(":", 1)[1], text_plain, []]
                if has_cjk_marks(p):
                    report["East Asian marks in callout titles dropped (titles are plain text)"] += 1
                continue
            if role.startswith("callout:"):
                ctype = role.split(":", 1)[1]
                if not callout or callout[0] != ctype:
                    close_callout()
                    flush_list()
                    callout = [ctype, None, []]
            elif callout:
                close_callout()
            if role in ("list", "list:ordered"):
                txt = re.sub(r"^\s*(?:[•·▪◦○–—-]|\d{1,3}[.)])\s+", "", text)
                mark = f"{sum(1 for x in list_run if not x.startswith(' ')) + 1}." if role == "list:ordered" else "-"
                list_run.append(f"{mark} {txt}")
                continue
            flush_list()
            if role.startswith("paragraphs:"):
                style = role.split(":", 1)[1]
                tgt = target()
                if tgt and tgt[-1].startswith(f':::paragraphs{{style="{style}"}}'):
                    tgt[-1] = tgt[-1][: -len("\n:::")] + "\n\n" + guard_line_start(text) + "\n:::"
                else:
                    tgt.append(fence("paragraphs", [guard_line_start(text)], style=style))
                continue
            target().append(guard_line_start(text))
        flush_list()
        close_callout()

    manifest = []
    for n, (title, blocks, notes) in enumerate(chapters, 1):
        if notes:
            blocks.append(fence("paragraphs", notes, style="notes"))
        body = fix_index_marks(join_blocks(blocks))
        if args.link_refs:
            body = link_mentions(body, label_to_id)
        name = f"{n:02d}-{slugify(title or f'chapter {n}')}.md"
        (out / "chapters" / args.lang / name).write_text(body, encoding="utf-8")
        manifest.append({"title": title or f"Chapter {n}", "file": f"chapters/{args.lang}/{name}"})
    (out / "resources.json").write_text(json.dumps(resources, ensure_ascii=False, indent=2), encoding="utf-8")
    (out / "chapters.json").write_text(json.dumps({args.lang: manifest}, ensure_ascii=False, indent=2), encoding="utf-8")
    rep = [f"# IDML extraction report: {Path(args.idml).name}", "",
           f"- stories used: {len(order)}; chapters: {len(manifest)}; resources: {len(resources)}", ""]
    notes = doc.layout_notes(order)
    if notes:
        rep += ["## Layout the stories imply", ""] + [f"- {n}" for n in notes] + [""]
    if unmapped:
        rep += ["## Styles missing from the map (set as body)", ""] + [f"- `{k}`: {v}" for k, v in unmapped.most_common()] + [""]
    report.update(doc.index_report)
    if doc.index_crossrefs:
        (out / "index-crossrefs.md").write_text("\n".join(doc.index_crossrefs) + "\n", encoding="utf-8")
        report["index See / See also cross-references -> index-crossrefs.md (paste above :::index)"] += len(doc.index_crossrefs)
    if report:
        rep += ["## Decisions to review", ""] + [f"- {k}: {v}" for k, v in report.most_common()] + [""]
    rep += ["Paragraph order follows the stories; where boxes, figures and side notes sit on the printed page "
            "comes from the PDF (find each paragraph's printed first/last line there)."]
    (out / "report.md").write_text("\n".join(rep) + "\n", encoding="utf-8")
    print("\n".join(rep))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("roles")
    r.add_argument("idml")
    m = sub.add_parser("markdown")
    m.add_argument("idml")
    m.add_argument("--map", required=True)
    m.add_argument("--out", required=True)
    m.add_argument("--lang", default="en")
    m.add_argument("--stories", help="auto | main | comma-separated story ids (overrides the map)")
    m.add_argument("--split-role", default="h1")
    m.add_argument("--link-refs", action="store_true")
    args = ap.parse_args()
    (cmd_roles if args.cmd == "roles" else cmd_markdown)(args)


if __name__ == "__main__":
    main()
