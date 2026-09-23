#!/usr/bin/env python3
"""Convert any document pandoc can read (DOCX, PPTX, ODT, EPUB, HTML, LaTeX,
JATS, DocBook, RTF, Markdown…) into a DRAFT Postext project: chapter files in
the Postext Markdown dialect, a resources.json with figures and tables, the
extracted media, and a report of what needs a human (or agent) decision.

    pandoc_to_postext.py SOURCE --out DIR [--from docx] [--split-level 1]
        [--style-map map.json] [--lang es] [--prefix 01] [--notes endnotes|inline|drop]
        [--keep-urls] [--link-refs] [--dump-styles]

Word/ODT paragraph and character styles are kept (pandoc `+styles`), so a
`--style-map` can turn "Box Title"/"Key Points"/"Verse" paragraphs into callouts,
paragraph styles or headings. Run with `--dump-styles` first to list them.

Style map (JSON), keys are the source style names:
  {
    "Heading 1": {"heading": 1},
    "Chapter Title": {"heading": 1},
    "Quote": {"paragraphs": "quote"},
    "Verse": {"paragraphs": "verse"},
    "Key Points": {"callout": "keypoints", "title": "Key points"},
    "Box Title": {"callout": "box", "title_from_text": true},   # opens a box titled with its text
    "Box Text": {"callout": "box"},
    "Caption": {"caption": true},          # caption of the next/previous figure or table
    "Running Head": {"drop": true},
    "Emphasis Strong": {"bold": true},      # character style
    "Term": {"chip": "term"}                # character style -> :chip[…]{style="term"}
  }
Consecutive paragraphs mapped to the same callout become one box.

Requires pandoc >= 3 on PATH (`brew install pandoc`); Pillow is optional
(bitmap sizes). Output is a draft: review it against the source.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from collections import Counter, OrderedDict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from postext_md import (  # noqa: E402
    Run,
    Slugger,
    attr_value,
    clean_text,
    escape,
    fence,
    guard_line_start,
    heading,
    join_blocks,
    ref,
    render_runs,
    resource_embed,
    slugify,
    CAPTION_LABEL_RE,
    caption_kind,
    link_mentions,
)

FORMAT_BY_EXT = {
    ".docx": "docx+styles",
    ".odt": "odt",
    ".pptx": "pptx",
    ".epub": "epub",
    ".html": "html",
    ".htm": "html",
    ".xhtml": "html",
    ".tex": "latex",
    ".md": "markdown",
    ".markdown": "markdown",
    ".rst": "rst",
    ".rtf": "rtf",
    ".xml": "jats",
    ".dbk": "docbook",
    ".ipynb": "ipynb",
    ".org": "org",
    ".typ": "typst",
}

# ---------------------------------------------------------------------------
# pandoc
# ---------------------------------------------------------------------------


def run_pandoc(src: Path, fmt: str, media_dir: Path) -> dict:
    if not shutil.which("pandoc"):
        sys.exit("pandoc not found on PATH (brew install pandoc / apt install pandoc)")
    cmd = [
        "pandoc",
        str(src),
        "-f",
        fmt,
        "-t",
        "json",
        f"--extract-media={media_dir}",
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        sys.exit(f"pandoc failed:\n{res.stderr}")
    if res.stderr.strip():
        print(res.stderr.strip(), file=sys.stderr)
    return json.loads(res.stdout)


def t(node) -> str:
    return node.get("t", "") if isinstance(node, dict) else ""


def c(node):
    return node.get("c") if isinstance(node, dict) else None


def attr_of(a) -> tuple[str, list[str], dict[str, str]]:
    ident, classes, kvs = a
    return ident, classes, {k: v for k, v in kvs}


def plain_text(inlines) -> str:
    """Flatten inlines to plain text (used for headings, alt text, attributes)."""
    out: list[str] = []

    def walk(xs):
        for x in xs:
            k = t(x)
            v = c(x)
            if k == "Str":
                out.append(v)
            elif k in ("Space", "SoftBreak", "LineBreak"):
                out.append(" ")
            elif k in ("Emph", "Strong", "Underline", "Strikeout", "Superscript", "Subscript", "SmallCaps"):
                walk(v)
            elif k == "Quoted":
                q = ("“", "”") if t(v[0]) == "DoubleQuote" else ("‘", "’")
                out.append(q[0])
                walk(v[1])
                out.append(q[1])
            elif k in ("Span",):
                walk(v[1])
            elif k in ("Link",):
                walk(v[1])
            elif k == "Image":
                walk(v[1])
            elif k == "Cite":
                walk(v[1])
            elif k == "Code":
                out.append(v[1])
            elif k == "Math":
                out.append("$" + v[1] + "$")
            elif k == "RawInline":
                out.append(re.sub(r"<[^>]+>", "", v[1]))
            elif k == "Note":
                pass

    walk(inlines or [])
    return re.sub(r"\s+", " ", "".join(out)).strip()


# ---------------------------------------------------------------------------
# converter
# ---------------------------------------------------------------------------


class Converter:
    def __init__(self, args, out: Path, media_dir: Path) -> None:
        self.args = args
        self.out = out
        self.media_dir = media_dir
        self.res_dir = out / "resources"
        self.res_dir.mkdir(parents=True, exist_ok=True)
        self.style_map: dict[str, dict] = {}
        if args.style_map:
            self.style_map = json.loads(Path(args.style_map).read_text(encoding="utf-8"))
        self.slug = Slugger()
        self.resources: "OrderedDict[str, dict]" = OrderedDict()
        self.label_to_id: dict[tuple[str, str], str] = {}
        self.notes: list[str] = []  # endnotes of the current chapter
        self.note_counter = 0
        self.report: Counter = Counter()
        self.unmapped_styles: Counter = Counter()
        self.char_styles: Counter = Counter()
        self.para_styles: Counter = Counter()
        self.pending_caption: str | None = None
        self.quotes = ("«", "»") if args.lang and args.lang.lower().startswith(("es", "fr", "ca", "it", "pt")) else ("“", "”")

    # ----- inline ----------------------------------------------------------

    def runs(self, inlines, bold=False, italic=False, sup=False, sub=False) -> list[Run]:
        out: list[Run] = []
        for x in inlines or []:
            k = t(x)
            v = c(x)
            if k == "Str":
                out.append(Run(v, bold, italic, sup, sub))
            elif k in ("Space", "SoftBreak"):
                out.append(Run(" ", bold, italic, sup, sub))
            elif k == "LineBreak":
                self.report["hard line breaks joined (Postext has no <br>)"] += 1
                out.append(Run(" ", bold, italic, sup, sub))
            elif k == "Emph":
                out += self.runs(v, bold, not italic, sup, sub)
            elif k == "Strong":
                out += self.runs(v, True, italic, sup, sub)
            elif k == "Superscript":
                out += self.runs(v, bold, italic, True, False)
            elif k == "Subscript":
                out += self.runs(v, bold, italic, False, True)
            elif k in ("Underline", "SmallCaps", "Strikeout"):
                self.report[f"{k} dropped (no inline equivalent)"] += 1
                out += self.runs(v, bold, italic, sup, sub)
            elif k == "Quoted":
                q = (self.quotes[0], self.quotes[1]) if t(v[0]) == "DoubleQuote" else ("‘", "’")
                out.append(Run(q[0], bold, italic))
                out += self.runs(v[1], bold, italic, sup, sub)
                out.append(Run(q[1], bold, italic))
            elif k == "Cite":
                out += self.runs(v[1], bold, italic, sup, sub)
            elif k == "Code":
                out.append(Run(v[1], bold, italic, sup, sub))
            elif k == "Math":
                kind = t(v[0])
                tex = v[1].strip()
                if kind == "DisplayMath":
                    # display math inside a paragraph: kept inline, flagged
                    self.report["display math inside a paragraph set inline"] += 1
                out.append(Run("$" + tex.replace("$", "\\$") + "$", raw=True))
            elif k == "RawInline":
                txt = re.sub(r"<br\s*/?>", " ", v[1], flags=re.I)
                txt = re.sub(r"<[^>]+>", "", txt)
                if txt.strip():
                    out.append(Run(txt, bold, italic, sup, sub))
            elif k == "Link":
                _, inner, (url, _title) = v
                out += self.runs(inner, bold, italic, sup, sub)
                label = plain_text(inner)
                if url.startswith("#"):
                    self.report["internal links reduced to their text"] += 1
                elif self.args.keep_urls and url and url.rstrip("/") != label.rstrip("/"):
                    out.append(Run(f" ({url})", bold, italic))
                else:
                    self.report["link URLs dropped (Postext keeps link text only)"] += 1
            elif k == "Image":
                rid = self.image_resource(v, inline=True)
                if rid:
                    out.append(Run(ref(rid, case="lower"), raw=True))
            elif k == "Note":
                out += self.footnote(v)
            elif k == "Span":
                a, inner = v
                _, classes, kv = attr_of(a)
                style = kv.get("custom-style")
                if style:
                    self.char_styles[style] += 1
                    m = self.style_map.get(style, {})
                    if m.get("drop"):
                        continue
                    if m.get("chip"):
                        txt = plain_text(inner).replace("]", "\\]")
                        out.append(Run(f':chip[{txt}]{{style="{m["chip"]}"}}', raw=True))
                        continue
                    out += self.runs(inner, bold or bool(m.get("bold")), italic ^ bool(m.get("italic")), sup, sub)
                    continue
                if "smallcaps" in classes:
                    self.report["small caps dropped"] += 1
                out += self.runs(inner, bold, italic, sup, sub)
        return out

    def inline(self, inlines) -> str:
        return render_runs(self.runs(inlines))

    def footnote(self, blocks) -> list[Run]:
        mode = self.args.notes
        if mode == "drop":
            self.report["footnotes dropped"] += 1
            return []
        text = " ".join(self.inline(x) for x in para_inlines(blocks)).strip()
        if mode == "inline":
            self.report["footnotes set inline in parentheses"] += 1
            return [Run(f" ({text})", raw=True)]
        self.note_counter += 1
        n = self.note_counter
        self.notes.append(f"^{n}^ {text}")
        self.report["footnotes turned into chapter endnotes"] += 1
        return [Run(str(n), sup=True)]

    # ----- resources --------------------------------------------------------

    def media_path(self, url: str) -> Path | None:
        p = Path(url)
        if not p.is_absolute():
            for base in (Path.cwd(), self.media_dir.parent, Path(self.args.source).parent):
                if (base / p).exists():
                    return (base / p).resolve()
        return p if p.exists() else None

    def copy_media(self, url: str, rid: str) -> tuple[str | None, str, dict]:
        src = self.media_path(url)
        if not src:
            self.report[f"missing media: {url}"] += 1
            return None, "bitmap", {}
        ext = src.suffix.lower()
        if ext in (".emf", ".wmf", ".tif", ".tiff", ".bmp", ".eps", ".pdf", ".ai"):
            self.report[f"media to convert by hand ({ext}): convert_assets.py / images.py"] += 1
        dest = self.res_dir / f"{rid}{ext}"
        shutil.copyfile(src, dest)
        kind = "svg" if ext == ".svg" else "bitmap"
        size: dict = {}
        if kind == "bitmap":
            try:
                from PIL import Image  # type: ignore

                with Image.open(dest) as im:
                    size = {"width": im.width, "height": im.height}
            except Exception:
                self.report["bitmap sizes unknown (install Pillow or fill width/height)"] += 1
        return f"resources/{dest.name}", kind, size

    def register_label(self, caption: str, rid: str) -> str:
        """Strip a leading 'Figure 1.2.' label from a caption and remember it so
        mentions in the text can become :ref."""
        m = CAPTION_LABEL_RE.match(caption)
        if not m:
            return caption
        self.label_to_id[(caption_kind(m.group("label")), m.group("num").replace("–", "-"))] = rid
        return caption[m.end():].strip()

    def image_resource(self, v, inline: bool = False, caption_blocks=None) -> str | None:
        a, alt_inlines, (url, title) = v
        alt = plain_text(alt_inlines)
        caption = ""
        if caption_blocks:
            caption = " ".join(self.inline(x) for x in para_inlines(caption_blocks)).strip()
        if not caption and self.pending_caption:
            caption, self.pending_caption = self.pending_caption, None
        rid = self.slug(re.sub(r"^\W+", "", CAPTION_LABEL_RE.sub("", caption) or alt or Path(url).stem), "fig")
        caption = self.register_label(caption, rid)
        file, kind, size = self.copy_media(url, rid)
        spec = {
            "id": rid,
            "typeId": "figure",
            "kind": kind,
            **({"file": file} if file else {}),
            **size,
            "caption": caption,
            "altText": attr_value(alt or caption),
            "placement": {"position": "here", "span": "column"},
        }
        if not caption:
            self.report["figures without caption (decorative? use an unnumbered type)"] += 1
        self.resources[rid] = spec
        return rid

    def table_resource(self, v) -> str:
        a, caption, colspecs, thead, tbodies, tfoot = v
        cap_blocks = caption[1] if caption else []
        cap = " ".join(self.inline(x) for x in para_inlines(cap_blocks)).strip()
        if not cap and self.pending_caption:
            cap, self.pending_caption = self.pending_caption, None
        rid = self.slug(CAPTION_LABEL_RE.sub("", cap) or "table", "table")
        cap = self.register_label(cap, rid)
        ncols = len(colspecs)
        widths = []
        for cs in colspecs:
            w = cs[1]
            widths.append(c(w) if t(w) == "ColWidth" else None)
        header_rows = thead[1]
        body_rows = []
        for body in tbodies:
            body_rows += body[2] + body[3]
        foot_rows = tfoot[1]
        all_rows = header_rows + body_rows + foot_rows
        grid: list[list[dict | None]] = [[None] * ncols for _ in all_rows]
        for r, row in enumerate(all_rows):
            col = 0
            for cell in row[1]:
                _cattr, align, rowspan, colspan, blocks = cell
                while col < ncols and grid[r][col] is not None:
                    col += 1
                if col >= ncols:
                    break
                content = self.cell_content(blocks)
                entry: dict = {"content": content}
                if r < len(header_rows):
                    entry["isHeader"] = True
                al = {"AlignLeft": "left", "AlignRight": "right", "AlignCenter": "center"}.get(t(align))
                if al:
                    entry["align"] = al
                if colspan > 1:
                    entry["colSpan"] = colspan
                if rowspan > 1:
                    entry["rowSpan"] = rowspan
                grid[r][col] = entry
                for dr in range(rowspan):
                    for dc in range(colspan):
                        if dr == 0 and dc == 0:
                            continue
                        rr, cc = r + dr, col + dc
                        if rr < len(grid) and cc < ncols and grid[rr][cc] is None:
                            grid[rr][cc] = {"content": "", "hiddenBy": {"row": r, "col": col}}
                col += colspan
        rows = [[cell if cell is not None else {"content": ""} for cell in row] for row in grid]
        model: dict = {"rows": rows}
        if header_rows:
            model["headerRowCount"] = len(header_rows)
        if all(w for w in widths) and widths:
            model["columnWidths"] = [round(w, 4) for w in widths]
        self.resources[rid] = {
            "id": rid,
            "typeId": "table",
            "kind": "table",
            "caption": cap,
            "placement": {"position": "here", "span": "column" if ncols <= 3 else "page"},
            "table": {"model": model},
        }
        if not cap:
            self.report["tables without caption"] += 1
        return rid

    def cell_content(self, blocks) -> str:
        """Table cell snippet: paragraphs separated by \\n, list items as
        '• ' / '1. ' hanging items (two spaces per nesting level). No $math$
        in cells: formulas are left as their TeX source in plain text."""
        parts: list[str] = []

        def emit_list(items, ordered: bool, start: int, depth: int):
            for i, item in enumerate(items):
                marker = f"{start + i}. " if ordered else "• "
                first = True
                for b in item:
                    if t(b) in ("BulletList", "OrderedList"):
                        emit_block(b, depth + 1)
                        continue
                    txt = self.inline(b_inlines(b)) if b_inlines(b) is not None else ""
                    if txt:
                        parts.append("  " * depth + (marker if first else "") + txt)
                        first = False

        def emit_block(b, depth=0):
            k = t(b)
            if k in ("Para", "Plain"):
                txt = self.inline(c(b))
                if txt:
                    parts.append(txt)
            elif k == "BulletList":
                emit_list(c(b), False, 1, depth)
            elif k == "OrderedList":
                emit_list(c(b)[1], True, c(b)[0][0], depth)
            elif k == "Div":
                for bb in c(b)[1]:
                    emit_block(bb, depth)
            elif k == "LineBlock":
                for line in c(b):
                    parts.append(self.inline(line))
            else:
                txt = block_text(b)
                if txt:
                    parts.append(escape(txt))

        for b in blocks:
            emit_block(b)
        out = "\n".join(parts)
        out = re.sub(r"(?<!\\)\$([^$]+)(?<!\\)\$", lambda m: m.group(1), out)  # no math in cells
        return out

    # ----- blocks -----------------------------------------------------------

    def blocks(self, blocks, depth: int = 0) -> list[str]:
        out: list[str] = []
        i = 0
        while i < len(blocks):
            b = blocks[i]
            k = t(b)
            v = c(b)
            if k == "Div":
                a, inner = v
                _, classes, kv = attr_of(a)
                style = kv.get("custom-style")
                if style:
                    self.para_styles[style] += 1
                    m = self.style_map.get(style)
                    if m and m.get("callout"):
                        # group consecutive Divs with the same callout mapping
                        group = [inner]
                        j = i + 1
                        while j < len(blocks) and t(blocks[j]) == "Div":
                            _, _, kv2 = attr_of(c(blocks[j])[0])
                            m2 = self.style_map.get(kv2.get("custom-style", ""), {})
                            if m2.get("callout") == m["callout"] and not m2.get("title_from_text"):
                                group.append(c(blocks[j])[1])
                                j += 1
                            else:
                                break
                        body: list[str] = []
                        title = m.get("title")
                        for g in group:
                            if m.get("title_from_text") and title is None:
                                title = plain_text(b_inlines(g[0]) or [])
                                g = g[1:]
                            body += self.blocks(g, depth)
                        out.append(fence("callout", body, type=m["callout"], title=title))
                        i = j
                        continue
                    if m:
                        out += self.mapped(m, inner, depth)
                        i += 1
                        continue
                    self.unmapped_styles[style] += 1
                if "notes" in classes or "speaker-notes" in classes:
                    if self.args.speaker_notes == "keep":
                        self.report["speaker notes kept as body paragraphs"] += 1
                        out += self.blocks(inner, depth)
                    elif self.args.speaker_notes == "callout":
                        out.append(fence("callout", self.blocks(inner, depth), type="notes"))
                    else:
                        self.report["speaker notes dropped (--speaker-notes keep|callout)"] += 1
                    i += 1
                    continue
                out += self.blocks(inner, depth)
                i += 1
                continue
            # a caption set as its own paragraph just before a figure/table
            if k in ("Para", "Plain") and CAPTION_LABEL_RE.match(plain_text(v)) and i + 1 < len(blocks) and self.is_float(blocks[i + 1]):
                self.pending_caption = self.inline(v)
                i += 1
                continue
            before = set(self.resources)
            out += self.block(b, depth)
            i += 1
            # ...or just after it
            new = [rid for rid in self.resources if rid not in before]
            if new and i < len(blocks) and t(blocks[i]) in ("Para", "Plain") and CAPTION_LABEL_RE.match(plain_text(c(blocks[i]))):
                spec = self.resources[new[-1]]
                if not spec.get("caption"):
                    spec["caption"] = self.register_label(self.inline(c(blocks[i])), spec["id"])
                    if spec["typeId"] == "figure" and not spec.get("altText"):
                        spec["altText"] = attr_value(plain_text(c(blocks[i])))
                    i += 1
        return out

    def is_float(self, b) -> bool:
        k = t(b)
        if k in ("Table", "Figure"):
            return True
        if k in ("Para", "Plain"):
            only = [x for x in c(b) if t(x) not in ("Space", "SoftBreak", "LineBreak")]
            return len(only) == 1 and t(only[0]) == "Image"
        return False

    def mapped(self, m: dict, inner, depth: int) -> list[str]:
        if m.get("drop"):
            return []
        if m.get("caption"):
            self.pending_caption = " ".join(self.inline(x) for x in para_inlines(inner)).strip()
            return []
        if "heading" in m:
            return [heading(int(m["heading"]), plain_text(b_inlines(inner[0]) or []), style=m.get("style"))] if inner else []
        if m.get("paragraphs"):
            body = []
            for b in inner:
                if t(b) == "LineBlock":
                    body += [guard_line_start(self.inline(line)) for line in c(b)]
                elif b_inlines(b) is not None:
                    body.append(guard_line_start(self.inline(b_inlines(b))))
                else:
                    body += self.block(b, depth)
            return [fence("paragraphs", body, style=m["paragraphs"])]
        if m.get("bold") or m.get("italic"):
            return self.blocks(inner, depth)
        return self.blocks(inner, depth)

    def block(self, b, depth: int = 0) -> list[str]:
        k = t(b)
        v = c(b)
        if k in ("Para", "Plain"):
            # a paragraph holding only an image is a figure
            only = [x for x in v if t(x) not in ("Space", "SoftBreak", "LineBreak")]
            if len(only) == 1 and t(only[0]) == "Image":
                rid = self.image_resource(c(only[0]))
                return [resource_embed(rid)] if rid else []
            if len(only) == 1 and t(only[0]) == "Math" and t(c(only[0])[0]) == "DisplayMath":
                return [f"$$\n{c(only[0])[1].strip()}\n$$"]
            # split display math out of mixed paragraphs
            parts: list[list] = [[]]
            maths: list[str] = []
            for x in v:
                if t(x) == "Math" and t(c(x)[0]) == "DisplayMath":
                    maths.append(c(x)[1].strip())
                    parts.append([])
                else:
                    parts[-1].append(x)
            out: list[str] = []
            for n, p in enumerate(parts):
                txt = self.inline(p)
                if txt:
                    out.append(guard_line_start(txt))
                if n < len(maths):
                    out.append(f"$$\n{maths[n]}\n$$")
            return out
        if k == "Header":
            level, a, inlines = v
            ident, classes, kv = attr_of(a)
            text = plain_text(inlines)
            if not text:
                return []
            m = CAPTION_LABEL_RE.match(text)
            return [heading(level, text)]
        if k == "BlockQuote":
            inner = [x for x in v]
            paras = [x for x in inner if t(x) in ("Para", "Plain")]
            if len(paras) == len(inner) == 1:
                return ["> " + self.inline(c(paras[0]))]
            self.report["multi-paragraph quotes -> :::paragraphs{style=\"quote\"}"] += 1
            body = []
            for x in inner:
                body += self.block(x, depth)
            return [fence("paragraphs", body, style="quote")]
        if k in ("BulletList", "OrderedList"):
            return ["\n".join(self.list_lines(b, 0))]
        if k == "DefinitionList":
            out = []
            for term, defs in v:
                d = " ".join(self.inline(b_inlines(x)) for dd in defs for x in dd if b_inlines(x) is not None)
                out.append(guard_line_start(f"**{escape(plain_text(term))}** {d}".strip()))
            self.report["definition lists -> bold-led paragraphs"] += 1
            return out
        if k == "LineBlock":
            self.report["line blocks (verse) -> :::paragraphs{style=\"verse\"}"] += 1
            return [fence("paragraphs", [guard_line_start(self.inline(line)) for line in v if line], style="verse")]
        if k == "CodeBlock":
            (_, classes, _), code = v
            lines = []
            for l in code.rstrip("\n").split("\n"):
                l = l.rstrip().expandtabs(4)
                lead = len(l) - len(l.lstrip(" "))
                # lines are trimmed by the parser: a word joiner keeps the indent
                lines.append(("\u2060" + "\u00a0" * lead if lead else "") + escape(l.lstrip(" ")))
            self.report["code blocks -> :::paragraphs{style=\"code\"} (one paragraph per line)"] += 1
            body = [guard_line_start(l) if l.strip() else "⁠" for l in lines]
            return [fence("paragraphs", body, style="code")]
        if k == "RawBlock":
            fmt, txt = v
            txt = re.sub(r"<[^>]+>", " ", txt)
            txt = re.sub(r"\s+", " ", txt).strip()
            if txt:
                self.report[f"raw {fmt} blocks reduced to text"] += 1
                return [guard_line_start(escape(txt))]
            return []
        if k == "HorizontalRule":
            self.report["horizontal rules -> :::paragraphs{style=\"asterism\"}"] += 1
            return [fence("paragraphs", ["⁂"], style="asterism")]
        if k == "Table":
            rid = self.table_resource(v)
            return [resource_embed(rid)]
        if k == "Figure":
            a, caption, content = v
            cap_blocks = caption[1] if caption else []
            imgs = [x for blk in content for x in (b_inlines(blk) or []) if t(x) == "Image"]
            out = []
            for n, img in enumerate(imgs):
                rid = self.image_resource(c(img), caption_blocks=cap_blocks if n == 0 else None)
                if rid:
                    out.append(resource_embed(rid))
            tables = [blk for blk in content if t(blk) == "Table"]
            for tb in tables:
                out += self.block(tb, depth)
            return out
        if k == "Div":
            return self.blocks([b], depth)
        return []

    def list_lines(self, b, depth: int) -> list[str]:
        k = t(b)
        v = c(b)
        ordered = k == "OrderedList"
        items = v[1] if ordered else v
        start = v[0][0] if ordered else 1
        style = t(v[0][1]) if ordered else ""
        if ordered and style not in ("Decimal", "DefaultStyle", "Example"):
            self.report[f"ordered lists styled {style}: set orderedLists.levels[].numberFormat"] += 1
        lines: list[str] = []
        indent = "  " * depth
        for n, item in enumerate(items):
            marker = f"{start + n}." if ordered else "-"
            texts: list[str] = []
            sub: list[str] = []
            for blk in item:
                kk = t(blk)
                if kk in ("BulletList", "OrderedList"):
                    sub += self.list_lines(blk, min(depth + 1, 4))
                elif b_inlines(blk) is not None:
                    texts.append(self.inline(b_inlines(blk)))
                elif kk == "Div":
                    texts += [self.inline(b_inlines(x)) for x in c(blk)[1] if b_inlines(x) is not None]
                else:
                    self.report["list items with block content flattened"] += 1
                    texts.append(escape(block_text(blk)))
            if len(texts) > 1:
                self.report["multi-paragraph list items joined into one line"] += 1
            if k == "BulletList" and texts and texts[0].startswith(("☐ ", "☒ ")):
                box = "[x]" if texts[0].startswith("☒") else "[ ]"
                texts[0] = box + texts[0][1:]
            lines.append(f"{indent}{marker} {' '.join(t_ for t_ in texts if t_)}".rstrip())
            lines += sub
        return lines

    # ----- mentions -> refs ------------------------------------------------

    def link_mentions(self, text: str) -> str:
        def float_it(rid: str) -> None:
            spec = self.resources.get(rid)
            if spec:
                spec["placement"]["position"] = "auto"

        return link_mentions(text, self.label_to_id, float_it)


def para_inlines(blocks):
    """Inline lists of every paragraph in `blocks`, looking through Divs
    (Word wraps captions and notes in styled Divs)."""
    for b in blocks or []:
        if t(b) in ("Para", "Plain"):
            yield c(b)
        elif t(b) == "Div":
            yield from para_inlines(c(b)[1])
        elif t(b) == "LineBlock":
            for line in c(b):
                yield line


def b_inlines(b):
    k = t(b)
    if k in ("Para", "Plain"):
        return c(b)
    return None


def block_text(b) -> str:
    k = t(b)
    v = c(b)
    if k in ("Para", "Plain"):
        return plain_text(v)
    if k == "CodeBlock":
        return v[1]
    if k in ("BlockQuote", "Div"):
        inner = v if k == "BlockQuote" else v[1]
        return " ".join(block_text(x) for x in inner)
    if k in ("BulletList",):
        return " ".join(block_text(x) for it in v for x in it)
    if k == "OrderedList":
        return " ".join(block_text(x) for it in v[1] for x in it)
    if k == "Header":
        return plain_text(v[2])
    return ""


# ---------------------------------------------------------------------------
# chapters
# ---------------------------------------------------------------------------


MATH_DELIMS = re.compile(r"^\s*(?:\\\(|\\\[|\$\$|\$)(.*?)(?:\\\)|\\\]|\$\$|\$)\s*$", re.S)


def normalise(blocks: list) -> list:
    """Undo reader-specific wrapping so every source looks alike:
    - EPUB/HTML section Divs (class `section`, or no attributes) are unwrapped,
      so chapter headings sit at the top level;
    - empty paragraphs (EPUB file anchors) are dropped;
    - HTML/EPUB `span.math` becomes a real Math node."""
    out = []
    for b in blocks:
        k = t(b)
        if k == "Div":
            ident, classes, kv = attr_of(c(b)[0])
            if "section" in classes or (not classes and not kv):
                out += normalise(c(b)[1])
                continue
            b["c"][1] = normalise(c(b)[1])
        elif k in ("Para", "Plain"):
            b["c"] = fix_math_spans(c(b))
            if not plain_text(c(b)) and not any(t(x) in ("Image", "Math") for x in c(b)):
                continue
        elif k == "BlockQuote":
            b["c"] = normalise(c(b))
        out.append(b)
    return out


def fix_math_spans(inlines: list) -> list:
    res = []
    for x in inlines:
        if t(x) == "Span":
            _, classes, _ = attr_of(c(x)[0])
            if "math" in classes:
                tex = plain_text(c(x)[1])
                m = MATH_DELIMS.match(tex)
                if not m:  # math already rendered to HTML (no TeX source): keep the runs
                    x["c"][1] = fix_math_spans(c(x)[1])
                    res.append(x)
                    continue
                tex = m.group(1)
                kind = "DisplayMath" if "display" in classes else "InlineMath"
                res.append({"t": "Math", "c": [{"t": kind}, tex.strip()]})
                continue
            x["c"][1] = fix_math_spans(c(x)[1])
        elif t(x) in ("Emph", "Strong", "Superscript", "Subscript", "Underline", "SmallCaps", "Strikeout"):
            x["c"] = fix_math_spans(c(x))
        res.append(x)
    return res


def split_chapters(blocks: list, level: int) -> list[list]:
    """Cut the document at every heading of `level` (like the sandbox's sampleBook:
    anything before the first heading stays with the first chapter)."""
    if level <= 0:
        return [blocks]
    chapters: list[list] = [[]]
    for b in blocks:
        if t(b) == "Header" and c(b)[0] <= level and chapters[-1] and any(t(x) == "Header" for x in chapters[-1]):
            chapters.append([])
        chapters[-1].append(b)
    return [ch for ch in chapters if ch]


def meta_value(meta: dict, key: str) -> str:
    node = meta.get(key)
    if not node:
        return ""
    k = t(node)
    if k == "MetaInlines":
        return plain_text(c(node))
    if k == "MetaString":
        return c(node)
    if k == "MetaBlocks":
        return " ".join(block_text(b) for b in c(node))
    if k == "MetaList":
        return ", ".join(meta_value({"x": x}, "x") for x in c(node))
    return ""


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source")
    ap.add_argument("--out", required=True, help="output folder (chapters/<lang>/, resources/, resources.json, report.md)")
    ap.add_argument("--from", dest="fmt", help="pandoc input format (default: from the extension; docx uses docx+styles)")
    ap.add_argument("--split-level", type=int, default=1, help="cut chapters at headings of this level or above (0 = one file)")
    ap.add_argument("--shift-headings", type=int, default=0, help="add N to every heading level (e.g. -1 when the source's title is H1 and chapters are H2)")
    ap.add_argument("--style-map", help="JSON map from source style names to Postext constructs")
    ap.add_argument("--lang", default="en", help="content language (chapters/<lang>/, quote marks)")
    ap.add_argument("--notes", choices=["endnotes", "inline", "drop"], default="endnotes", help="what to do with footnotes (Postext has none)")
    ap.add_argument("--speaker-notes", choices=["drop", "keep", "callout"], default="drop", help="PPTX speaker notes: drop, keep as body text, or wrap in a callout of type 'notes'")
    ap.add_argument("--keep-urls", action="store_true", help="append (url) after link text (Postext keeps only link text)")
    ap.add_argument("--link-refs", action="store_true", help="turn 'Figure 1.2' / 'Table 3' mentions into :ref and float those resources")
    ap.add_argument("--dump-styles", action="store_true", help="only list the Word/ODT paragraph and character styles with counts")
    args = ap.parse_args()

    src = Path(args.source).resolve()
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    fmt = args.fmt or FORMAT_BY_EXT.get(src.suffix.lower())
    if not fmt:
        sys.exit(f"cannot guess the pandoc format of {src.name}; pass --from")
    media = out / "_media"
    doc = run_pandoc(src, fmt, media)
    conv = Converter(args, out, media)

    blocks = normalise(doc["blocks"])
    if args.shift_headings:
        for b in walk_blocks(blocks):
            if t(b) == "Header":
                b["c"][0] = max(1, min(6, b["c"][0] + args.shift_headings))

    if args.dump_styles:
        conv.blocks(blocks)
        print("Paragraph styles (custom-style on blocks):")
        for s, n in conv.para_styles.most_common():
            print(f"  {n:6d}  {s}")
        print("Character styles (custom-style on spans):")
        for s, n in conv.char_styles.most_common():
            print(f"  {n:6d}  {s}")
        shutil.rmtree(media, ignore_errors=True)
        shutil.rmtree(out / "resources", ignore_errors=True)
        return

    meta = doc.get("meta", {})
    front = {k: meta_value(meta, k) for k in ("title", "subtitle", "author", "date")}
    chapters = split_chapters(blocks, args.split_level)
    chap_dir = out / "chapters" / args.lang
    chap_dir.mkdir(parents=True, exist_ok=True)
    manifest_chapters = []
    for n, ch in enumerate(chapters, 1):
        conv.notes = []
        conv.note_counter = 0
        parts = conv.blocks(ch)
        if conv.notes:
            parts.append(fence("paragraphs", conv.notes, style="notes"))
        body = join_blocks(parts)
        if args.link_refs:
            body = conv.link_mentions(body)
        title = next((plain_text(c(b)[2]) for b in ch if t(b) == "Header"), f"Chapter {n}")
        if n == 1 and any(front.values()):
            fm = ["---"]
            for k in ("title", "subtitle", "author"):
                if front[k]:
                    fm.append(f'{k}: "{attr_value(front[k])}"')
            if front["date"]:
                fm.append(f'publishDate: "{attr_value(front["date"])}"')
            fm.append("---")
            body = "\n".join(fm) + "\n\n" + body
        name = f"{n:02d}-{slugify(title)}.md"
        (chap_dir / name).write_text(body, encoding="utf-8")
        manifest_chapters.append({"title": title, "file": f"chapters/{args.lang}/{name}"})

    (out / "resources.json").write_text(json.dumps(list(conv.resources.values()), ensure_ascii=False, indent=2), encoding="utf-8")
    (out / "chapters.json").write_text(json.dumps({args.lang: manifest_chapters}, ensure_ascii=False, indent=2), encoding="utf-8")
    shutil.rmtree(media, ignore_errors=True)

    lines = [f"# Conversion report: {src.name}", "", f"- pandoc format: `{fmt}`", f"- chapters: {len(manifest_chapters)}", f"- resources: {len(conv.resources)}", ""]
    if conv.report:
        lines.append("## Decisions to review")
        lines.append("")
        for k, v in conv.report.most_common():
            lines.append(f"- {k}: {v}")
        lines.append("")
    if conv.unmapped_styles:
        lines.append("## Unmapped source styles (add them to --style-map)")
        lines.append("")
        for k, v in conv.unmapped_styles.most_common():
            lines.append(f"- `{k}`: {v}")
        lines.append("")
    lines.append("Paragraph styles introduced by the draft that the config must define: "
                 "`notes`, `quote`, `verse`, `code`, `asterism` (only those that appear in the chapters).")
    (out / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))


def walk_blocks(blocks):
    for b in blocks:
        yield b
        k = t(b)
        v = c(b)
        if k in ("BlockQuote",):
            yield from walk_blocks(v)
        elif k == "Div":
            yield from walk_blocks(v[1])
        elif k == "BulletList":
            for it in v:
                yield from walk_blocks(it)
        elif k == "OrderedList":
            for it in v[1]:
                yield from walk_blocks(it)


if __name__ == "__main__":
    main()
