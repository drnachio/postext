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
chapter endnotes.

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
    fence,
    guard_line_start,
    heading,
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


class IRun:
    __slots__ = ("text", "font", "fstyle", "size", "position", "color", "cstyle")

    def __init__(self, text, font, fstyle, size, position, color, cstyle):
        self.text, self.font, self.fstyle, self.size = text, font, fstyle, size
        self.position, self.color, self.cstyle = position, color, cstyle

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
                            a.get("Position", "Normal"), short(a.get("FillColor", "")), a.get("_cstyle", ""))

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
        for name in sorted(n for n in self.z.namelist() if n.startswith("Stories/") and n.endswith(".xml")):
            st = self.xml(name).find("Story")
            if st is not None:
                self.stories[st.get("Self")] = self.paras(st)

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

    def render(p: IPara, plain: bool = False) -> str:
        runs = []
        for r in p.runs:
            if r.text in (TABLE_MARK, OBJECT_MARK, "￲"):
                continue
            t = r.text.replace(" ", " ").replace("\t", " ")
            runs.append(Run(t, r.bold, r.italic, r.position in ("Superscript", "OTSuperscript"),
                            r.position in ("Subscript", "OTSubscript")))
        if plain:
            return re.sub(r"\s+", " ", "".join(x.text for x in runs)).strip()
        return render_runs(runs)

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
                model = table_model(doc, tbl, render)
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
                chapters[-1][1].append(heading(int(role[1:]), text_plain))
                continue
            if role == "caption":
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
        body = join_blocks(blocks)
        if args.link_refs:
            body = link_mentions(body, label_to_id)
        name = f"{n:02d}-{slugify(title or f'chapter {n}')}.md"
        (out / "chapters" / args.lang / name).write_text(body, encoding="utf-8")
        manifest.append({"title": title or f"Chapter {n}", "file": f"chapters/{args.lang}/{name}"})
    (out / "resources.json").write_text(json.dumps(resources, ensure_ascii=False, indent=2), encoding="utf-8")
    (out / "chapters.json").write_text(json.dumps({args.lang: manifest}, ensure_ascii=False, indent=2), encoding="utf-8")
    rep = [f"# IDML extraction report: {Path(args.idml).name}", "",
           f"- stories used: {len(order)}; chapters: {len(manifest)}; resources: {len(resources)}", ""]
    if unmapped:
        rep += ["## Styles missing from the map (set as body)", ""] + [f"- `{k}`: {v}" for k, v in unmapped.most_common()] + [""]
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
