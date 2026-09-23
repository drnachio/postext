"""CNXML (OpenStax module XML) → Postext Markdown.

A module becomes a section of a chapter: its paragraphs, subsections,
figures (numbered resources referenced from the text), tables, worked
examples, "check your understanding" boxes, learning objectives, notes,
equations (MathML converted to LaTeX for MathJax) and glossary. Teacher
notes, interactive iframes and the long problem sets are left out by the
caller's section filter.
"""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field

CNX = "http://cnx.rice.edu/cnxml"
MML = "http://www.w3.org/1998/Math/MathML"
MD = "http://cnx.rice.edu/mdml"


def q(tag: str, ns: str = CNX) -> str:
    return f"{{{ns}}}{tag}"


def local(el: ET.Element) -> str:
    return el.tag.split("}", 1)[-1]


# --- MathML → LaTeX -------------------------------------------------------------

# Postext unescapes `\$` inside inline math before MathJax sees it, so a
# formula's dollar sign is written as a code point.
DOLLAR = r"\unicode{36}"

MO = {
    "×": r"\times", "·": r"\cdot", "−": "-", "–": "-", "±": r"\pm", "∓": r"\mp", "≈": r"\approx", "≤": r"\le", "≥": r"\ge",
    "≠": r"\ne", "→": r"\to", "←": r"\leftarrow", "⇒": r"\Rightarrow", "∞": r"\infty", "∝": r"\propto", "°": r"^\circ",
    "∑": r"\sum", "∫": r"\int", "∂": r"\partial", "∇": r"\nabla", "√": r"\sqrt", "≡": r"\equiv", "∼": r"\sim", "≃": r"\simeq",
    "∈": r"\in", "∘": r"\circ", "…": r"\ldots", "⋯": r"\cdots", "⋅": r"\cdot", "′": "'", "″": "''", "Δ": r"\Delta", "∆": r"\Delta",
    "∣": "|", "‖": r"\|", "⟨": r"\langle", "⟩": r"\rangle", "%": r"\%", "&": r"\&", "#": r"\#", "$": DOLLAR, "_": r"\_", "{": r"\{", "}": r"\}",
    "⁢": "", "⁡": "", "⁣": "", "​": "", " ": r"\ ", " ": r"\ ",
}
GREEK = {
    "α": r"\alpha", "β": r"\beta", "γ": r"\gamma", "δ": r"\delta", "ε": r"\varepsilon", "ϵ": r"\epsilon", "ζ": r"\zeta", "η": r"\eta",
    "θ": r"\theta", "ϑ": r"\vartheta", "ι": r"\iota", "κ": r"\kappa", "λ": r"\lambda", "μ": r"\mu", "ν": r"\nu", "ξ": r"\xi", "π": r"\pi",
    "ρ": r"\rho", "σ": r"\sigma", "τ": r"\tau", "υ": r"\upsilon", "φ": r"\varphi", "ϕ": r"\phi", "χ": r"\chi", "ψ": r"\psi", "ω": r"\omega",
    "Γ": r"\Gamma", "Δ": r"\Delta", "Θ": r"\Theta", "Λ": r"\Lambda", "Ξ": r"\Xi", "Π": r"\Pi", "Σ": r"\Sigma", "Φ": r"\Phi", "Ψ": r"\Psi", "Ω": r"\Omega",
    "ℏ": r"\hbar", "∞": r"\infty", "ℓ": r"\ell",
}
FUNCTIONS = {"sin", "cos", "tan", "cot", "sec", "csc", "arcsin", "arccos", "arctan", "ln", "log", "exp", "lim", "max", "min", "sinh", "cosh", "tanh", "det", "deg", "arg", "gcd"}
ACCENTS = {"→": r"\vec", "⃗": r"\vec", "¯": r"\bar", "‾": r"\bar", "^": r"\hat", "˙": r"\dot", "¨": r"\ddot", "~": r"\tilde", "˜": r"\tilde", "_": r"\underline"}


def _tex_text(s: str) -> str:
    return s.replace("\\", r"\textbackslash ").replace("{", r"\{").replace("}", r"\}").replace("_", r"\_").replace("%", r"\%").replace("&", r"\&").replace("#", r"\#").replace("$", DOLLAR)


def _children(el: ET.Element) -> list[ET.Element]:
    return list(el)


def mathml_to_tex(el: ET.Element) -> str:
    tag = local(el)
    kids = _children(el)
    text = (el.text or "").strip()
    if tag == "math":
        return "".join(mathml_to_tex(k) for k in kids)
    if tag in ("mrow", "mstyle", "mpadded", "semantics", "maction"):
        return "".join(mathml_to_tex(k) for k in kids)
    if tag == "annotation" or tag == "annotation-xml":
        return ""
    if tag == "mi":
        if text in GREEK:
            # Trailing space: a bare `\rho` glues to a following letter and
            # makes an undefined command (`\rho` + `V` -> `\rhoV`).
            return GREEK[text] + " "
        if text in FUNCTIONS:
            return "\\" + text + " "
        if len(text) > 1 and text.isalpha():
            return r"\mathrm{" + text + "}"
        return MO.get(text, text)
    if tag == "mn":
        return text.replace(",", "{,}") if "," in text and "." not in text else text
    if tag == "mo":
        if text == "":
            return " "
        return MO.get(text, _tex_text(text) if text in "%&#$_{}" else text) + " " if text in MO and MO[text].startswith("\\") and MO[text][-1].isalpha() else MO.get(text, text)
    if tag == "mtext":
        raw = el.text or ""
        if raw.strip() == "":
            return r"\ " if raw else ""
        # `\text{…}` cannot hold the dollar code point: split around it.
        return DOLLAR.join(r"\text{" + _tex_text(p) + "}" if p else "" for p in raw.split("$"))
    if tag == "mspace":
        return r"\,"
    if tag == "msup" and len(kids) == 2:
        return "{" + mathml_to_tex(kids[0]) + "}^{" + mathml_to_tex(kids[1]) + "}"
    if tag == "msub" and len(kids) == 2:
        return "{" + mathml_to_tex(kids[0]) + "}_{" + mathml_to_tex(kids[1]) + "}"
    if tag == "msubsup" and len(kids) == 3:
        return "{" + mathml_to_tex(kids[0]) + "}_{" + mathml_to_tex(kids[1]) + "}^{" + mathml_to_tex(kids[2]) + "}"
    if tag == "mfrac" and len(kids) == 2:
        return r"\frac{" + mathml_to_tex(kids[0]) + "}{" + mathml_to_tex(kids[1]) + "}"
    if tag == "msqrt":
        return r"\sqrt{" + "".join(mathml_to_tex(k) for k in kids) + "}"
    if tag == "mroot" and len(kids) == 2:
        return r"\sqrt[" + mathml_to_tex(kids[1]) + "]{" + mathml_to_tex(kids[0]) + "}"
    if tag in ("mover", "munder") and len(kids) == 2:
        base, script = mathml_to_tex(kids[0]), kids[1]
        stext = (script.text or "").strip()
        if tag == "mover" and stext in ACCENTS:
            return ACCENTS[stext] + "{" + base + "}"
        cmd = r"\overset" if tag == "mover" else r"\underset"
        return cmd + "{" + mathml_to_tex(script) + "}{" + base + "}"
    if tag == "munderover" and len(kids) == 3:
        return "{" + mathml_to_tex(kids[0]) + "}_{" + mathml_to_tex(kids[1]) + "}^{" + mathml_to_tex(kids[2]) + "}"
    if tag == "mfenced":
        open_, close = el.get("open", "("), el.get("close", ")")
        return r"\left" + (open_ if open_ else ".") + " " + ",".join(mathml_to_tex(k) for k in kids) + r"\right" + (close if close else ".")
    if tag == "mtable":
        rows = []
        ncols = 1
        for tr in kids:
            cells = [mathml_to_tex(td) for td in _children(tr)]
            ncols = max(ncols, len(cells))
            rows.append(" & ".join(cells))
        return r"\begin{array}{" + "l" * ncols + "} " + r" \\ ".join(rows) + r" \end{array}"
    if tag == "mtr" or tag == "mtd":
        return "".join(mathml_to_tex(k) for k in kids)
    if tag == "menclose":
        inner = "".join(mathml_to_tex(k) for k in kids)
        if "strike" in (el.get("notation") or ""):
            return r"\cancel{" + inner + "}"
        return inner
    if tag == "mphantom":
        return r"\phantom{" + "".join(mathml_to_tex(k) for k in kids) + "}"
    if tag == "mmultiscripts":
        return "".join(mathml_to_tex(k) for k in kids)
    if tag in ("mglyph", "mprescripts", "none"):
        return ""
    return "".join(mathml_to_tex(k) for k in kids)


def tex_of(math_el: ET.Element) -> str:
    tex = mathml_to_tex(math_el)
    tex = re.sub(r"\s+", " ", tex).strip()
    tex = tex.replace("\\ \\ ", "\\ ")
    return tex


# --- inline content --------------------------------------------------------------

SUP = str.maketrans("0123456789+-−=()n", "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁻⁼⁽⁾ⁿ")
SUB = str.maketrans("0123456789+-−=()", "₀₁₂₃₄₅₆₇₈₉₊₋₋₌₍₎")


def md_escape(s: str) -> str:
    # A bare `$` opens inline math: currency must be escaped.
    return s.replace("\\", "\\\\").replace("*", "\\*").replace("_", "\\_").replace("[", "\\[").replace("#", "\\#").replace("$", "\\$")


@dataclass
class Ctx:
    lang: str
    module_id: str
    refs: dict[str, str] = field(default_factory=dict)  # cnxml element id → resource id
    words: dict[str, str] = field(default_factory=dict)
    splash: set[str] = field(default_factory=set)  # ids of the chapter-opener figures

SPLASH_REF = "\x00splash\x00"


def inline(el: ET.Element, ctx: Ctx, *, in_title: bool = False, strip: bool = True) -> str:
    """Markdown for the inline content of an element (its text and
    children's tails included)."""
    out: list[str] = []
    if el.text:
        out.append(md_escape(el.text))
    for k in el:
        tag = local(k)
        if k.tag == q("math", MML):
            tex = tex_of(k)
            if tex and k.get("display") == "block":
                out.append(f"\n\n$$\n{tex}\n$$\n\n")
            else:
                out.append(f"${tex}$" if tex else "")
        elif tag == "emphasis":
            effect = k.get("effect", "italics")
            inner = inline(k, ctx).strip()
            if inner.startswith("$") and inner.endswith("$"):
                out.append(inner)  # italics around a formula: MathJax sets it
            elif inner:
                out.append(f"**{inner}**" if effect == "bold" else f"*{inner}*")
        elif tag == "term":
            inner = inline(k, ctx).strip()
            out.append(f"**{inner}**" if inner and not in_title else inner)
        elif tag == "link":
            inner = inline(k, ctx).strip()
            url = k.get("url")
            target = k.get("target-id")
            if "os-embed" in (k.get("class") or ""):
                pass  # an exercise pulled from the OpenStax API: nothing to print
            elif target and target in ctx.splash:
                # The opener photo is set by the chapter design, never placed
                # as a numbered figure: name it instead of citing it.
                out.append(SPLASH_REF)
            elif url and inner:
                out.append(f"[{inner}]({url})")
            elif url:
                out.append(url)
            elif target and target in ctx.refs:
                out.append(f':ref{{id="{ctx.refs[target]}"}}')
            elif target:
                out.append(inner or ctx.words.get("here", ""))
            else:
                out.append(inner)
        elif tag == "sup":
            raw = "".join(k.itertext()).strip()
            out.append(raw.translate(SUP) if re.fullmatch(r"[0-9+\-−=()n]*", raw) else "${}^{" + _tex_text(raw) + "}$")
        elif tag == "sub":
            raw = "".join(k.itertext()).strip()
            out.append(raw.translate(SUB) if re.fullmatch(r"[0-9+\-−=()]*", raw) else "${}_{" + _tex_text(raw) + "}$")
        elif tag == "newline":
            out.append("  \n")
        elif tag in ("footnote",):
            inner = inline(k, ctx).strip()
            out.append(f" ({inner})" if inner else "")
        elif tag in ("span", "quote", "foreign", "cite", "code", "label"):
            out.append(inline(k, ctx))
        elif tag == "title":
            pass
        else:
            out.append(inline(k, ctx))
        if k.tail:
            out.append(md_escape(k.tail))
    text = "".join(out).replace("****", "")
    if SPLASH_REF in text:
        text = re.sub(r"\s*\(" + SPLASH_REF + r"\)", "", text).replace(SPLASH_REF, ctx.words.get("opener", ""))
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip() if strip else text


DISPLAY_RE = re.compile(r"\n*\$\$\n(.*?)\n\$\$\n*", re.S)
INLINE_MATH_RE = re.compile(r"(?<!\\)\$")
LIST_LINE_RE = re.compile(r"^(- |\d+\. )")


def split_display(text: str) -> list[tuple[str, str]]:
    """Split inline text holding display equations into ("text", …) and
    ("math", tex) parts."""
    parts: list[tuple[str, str]] = []
    pos = 0
    for m in DISPLAY_RE.finditer(text):
        parts.append(("text", text[pos:m.start()]))
        parts.append(("math", m.group(1).strip()))
        pos = m.end()
    parts.append(("text", text[pos:]))
    # Source line breaks are spaces; a hard break (`  \n`) stays.
    return [(k, v.strip() if k == "math" else re.sub(r"[ \t]+", " ", re.sub(r"(?<!  )\n", " ", v)).strip()) for k, v in parts if v.strip()]


def block_parts(piece: str) -> list[tuple[str, str]]:
    """Classify an already-rendered block for use inside a list item."""
    if piece.startswith("$$\n") and piece.endswith("\n$$"):
        return [("math", piece[3:-3].strip())]
    if LIST_LINE_RE.match(piece):
        return [("lines", piece)]
    return split_display(piece)


def snippet(text: str) -> str:
    """Text for a caption or table cell. Snippets have no math and no `\\$`
    escape, so a currency sign is written bare."""
    return text.replace("\\$", "$")


def one_line(text: str) -> str:
    """List items are one line: hard breaks become spaces."""
    return re.sub(r"\s+", " ", text.replace("  \n", " ")).strip()



# --- blocks ------------------------------------------------------------------------


@dataclass
class Resource:
    id: str
    kind: str  # bitmap | table
    file: str = ""
    caption: str = ""
    alt: str = ""
    table: dict | None = None
    wide: bool = False
    numbered: bool = True


@dataclass
class Module:
    id: str
    title: str
    blocks: list[str] = field(default_factory=list)
    resources: list[Resource] = field(default_factory=list)
    splash: Resource | None = None
    objectives: list[str] = field(default_factory=list)
    glossary: list[tuple[str, str]] = field(default_factory=list)


class Converter:
    def __init__(self, lang: str, words: dict[str, str], skip_sections: set[str], skip_notes: set[str]):
        self.lang = lang
        self.words = words
        self.skip_sections = skip_sections
        self.skip_notes = skip_notes

    # -- entry -------------------------------------------------------------
    def module(self, path: str, module_id: str, resource_prefix: str) -> Module:
        tree = ET.parse(path)
        root = tree.getroot()
        title_el = root.find(q("title"))
        mod = Module(module_id, inline(title_el, Ctx(self.lang, module_id), in_title=True) if title_el is not None else module_id)
        ctx = Ctx(self.lang, module_id, words=self.words)
        content = root.find(q("content"))
        self._prefix = resource_prefix
        self._counter = 0
        # First pass: register figure/table ids so `<link target-id>` resolves.
        for el in content.iter():
            tag = local(el)
            if tag == "figure" and el.get("id") and "splash" in (el.get("class") or ""):
                ctx.splash.add(el.get("id"))
            elif tag == "figure" and el.get("id"):
                ctx.refs[el.get("id")] = self._rid(el.get("id"))
            elif tag == "table" and el.get("id") and "unnumbered" not in (el.get("class") or ""):
                ctx.refs[el.get("id")] = self._rid(el.get("id"))
        self.mod = mod
        self.ctx = ctx
        # The Spanish books keep the learning objectives in the abstract.
        abstract = root.find(f"{q('metadata')}/{q('abstract', MD)}")
        if abstract is not None:
            lst = abstract.find(f".//{q('list')}")
            if lst is not None:
                mod.objectives = [inline(it, ctx) for it in lst.findall(q("item"))]
        first = next((k for k in content if local(k) not in ("title", "label")), None)
        if first is not None and local(first) == "list" and not mod.objectives:
            mod.objectives = [inline(it, ctx) for it in first.findall(q("item"))]
            content.remove(first)
        self.blocks(content, mod.blocks, level=3)
        gl = root.find(q("glossary"))
        if gl is not None:
            for d in gl.findall(q("definition")):
                t = d.find(q("term"))
                m = d.find(q("meaning"))
                if t is not None and m is not None:
                    mod.glossary.append((inline(t, ctx, in_title=True), inline(m, ctx)))
        return mod

    def _rid(self, cnx_id: str) -> str:
        slug = re.sub(r"[^a-z0-9]+", "-", cnx_id.lower()).strip("-")
        return f"{self._prefix}-{slug}"[:80]

    # -- block walker --------------------------------------------------------------
    def blocks(self, parent: ET.Element, out: list[str], level: int) -> None:
        for el in parent:
            tag = local(el)
            if tag == "para":
                self.para(el, out)
            elif tag == "section":
                self.section(el, out, level)
            elif tag == "figure":
                self.figure(el, out)
            elif tag == "note":
                self.note(el, out)
            elif tag == "example":
                self.example(el, out)
            elif tag == "equation":
                self.equation(el, out)
            elif tag == "list":
                out.extend(self.list_blocks(el))
            elif tag == "table":
                self.table(el, out)
            elif tag == "exercise":
                self.exercise(el, out, numbered=True)
            elif tag in ("title", "label", "metadata", "iframe", "commentary", "media", "glossary"):
                continue
            elif tag == "quote":
                text = inline(el, self.ctx)
                if text:
                    out.append("> " + text)
            elif tag in ("preformat", "code"):
                out.append("```\n" + (el.text or "") + "\n```")
            else:
                self.blocks(el, out, level)

    def para(self, el: ET.Element, out: list[str], run_in_title: bool = True) -> None:
        title = el.find(q("title"))
        # Block children inside a paragraph (lists, equations, figures) split
        # it; runs of inline children are converted together so the spaces
        # around them survive.
        pieces: list[str] = []
        run = ET.Element("run")
        run.text = el.text
        for k in el:
            tag = local(k)
            if tag in ("list", "equation", "figure", "note", "table"):
                text = inline(run, self.ctx, strip=False)
                if text.strip():
                    pieces.append(text)
                sub: list[str] = []
                self.blocks_one(k, sub)
                pieces.extend(sub)
                run = ET.Element("run")
                run.text = k.tail
            elif tag == "title":
                run.text = (run.text or "") + (k.tail or "")
            else:
                run.append(k)
        text = inline(run, self.ctx, strip=False)
        if text.strip():
            pieces.append(text)
        pieces = [re.sub(r"[ \t]+", " ", p).strip() for p in pieces]
        pieces = [p for p in pieces if p]
        if title is not None and pieces:
            t = inline(title, self.ctx, in_title=True)
            if t and run_in_title and LIST_LINE_RE.match(pieces[0]):
                pieces.insert(0, f"**{t}.**")
            elif t and run_in_title:
                pieces[0] = f"**{t}.** " + pieces[0]
        out.extend(pieces)

    def blocks_one(self, el: ET.Element, out: list[str]) -> None:
        wrapper = ET.Element("w")
        wrapper.append(el)
        self.blocks(wrapper, out, level=4)

    def section(self, el: ET.Element, out: list[str], level: int) -> None:
        cls = el.get("class") or ""
        title_el = el.find(q("title"))
        title = inline(title_el, self.ctx, in_title=True) if title_el is not None else ""
        key = title.lower()
        if any(s in cls for s in self.skip_sections) or key in self.skip_sections:
            return
        if title and "key-terms" in cls or key in ("section key terms", "términos clave de la sección"):
            return  # the glossary at the end of the module carries the terms
        if title:
            out.append("#" * min(level, 6) + " " + title)
        mark = len(out)
        n = 0
        for k in el:
            if local(k) == "exercise":
                if self.exercise(k, out, numbered=True, number=n + 1):
                    n += 1
            else:
                self.blocks_one(k, out) if local(k) != "title" else None
        if title and len(out) == mark:
            out.pop()  # only API-embedded exercises: nothing left under the heading

    def figure(self, el: ET.Element, out: list[str]) -> None:
        media = el.find(q("media"))
        image = media.find(q("image")) if media is not None else None
        if image is None:
            # sub-figures: take the first image
            image = el.find(f".//{q('image')}")
            media = el.find(f".//{q('media')}")
        if image is None:
            return
        src = (image.get("src") or "").split("/")[-1]
        cap = el.find(q("caption"))
        caption = snippet(inline(cap, self.ctx)) if cap is not None else ""
        alt = (media.get("alt") if media is not None else "") or ""
        rid = self.ctx.refs.get(el.get("id") or "") or self._rid(el.get("id") or src)
        res = Resource(rid, "bitmap", file=src, caption=caption, alt=alt)
        if "splash" in (el.get("class") or ""):
            self.mod.splash = res
            return
        self.mod.resources.append(res)
        ref = f':ref{{id="{rid}" case="lower"}}'
        # Attach the reference to the previous paragraph when it does not
        # already cite the figure (the text often does through <link>).
        if out and not out[-1].startswith(("#", ":::", "- ", "1. ", "$$", "> ", "|")) and f'id="{rid}"' not in out[-1]:
            out[-1] = out[-1] + f" ({ref})"
        elif not any(f'id="{rid}"' in b for b in out[-3:]):
            out.append(ref)

    def table(self, el: ET.Element, out: list[str]) -> None:
        cls = el.get("class") or ""
        if "unnumbered" in cls and "key-terms" in cls:
            return
        tgroup = el.find(q("tgroup"))
        if tgroup is None:
            return
        rows: list[list[dict]] = []
        header_rows = 0
        thead = tgroup.find(q("thead"))
        if thead is not None:
            for row in thead.findall(q("row")):
                rows.append([{"content": inline(e, self.ctx), "isHeader": True} for e in row.findall(q("entry"))])
            header_rows = len(rows)
        tbody = tgroup.find(q("tbody"))
        if tbody is not None:
            for row in tbody.findall(q("row")):
                cells = []
                for e in row.findall(q("entry")):
                    cell = {"content": inline(e, self.ctx)}
                    span = e.get("namest"), e.get("nameend")
                    if span[0] and span[1]:
                        try:
                            cell["colSpan"] = int(span[1][1:]) - int(span[0][1:]) + 1
                        except ValueError:
                            pass
                    cells.append(cell)
                rows.append(cells)
        if not rows:
            return
        ncols = max(len(r) for r in rows)
        title_el = el.find(q("title"))
        caption = snippet(inline(title_el, self.ctx, in_title=True)) if title_el is not None else ""
        rid = self.ctx.refs.get(el.get("id") or "") or self._rid(el.get("id") or f"table-{len(self.mod.resources)}")
        # Cells are resource snippets: body-text escapes (`\$`) do not apply there.
        model = {"rows": [[{**c, "content": snippet(c["content"])} for c in r] for r in rows], "headerRowCount": header_rows, "columnWidths": [1] * ncols}
        if "unnumbered" in cls:
            if any(INLINE_MATH_RE.search(c["content"]) for r in rows for c in r):
                # Formulas do not render in table cells (they print as
                # LaTeX): a key-equations table becomes a list of
                # "label: formula" lines, where MathJax sets them.
                items = []
                for r in rows[header_rows:]:
                    cells = [one_line(c["content"]) for c in r if c["content"].strip()]
                    if cells:
                        items.append("- " + (f"{cells[0]}: " + " · ".join(cells[1:]) if len(cells) > 1 else cells[0]))
                if items:
                    out.append("\n".join(items))
                return
            # Anything else is an unnumbered table resource set in place.
            self.mod.resources.append(Resource(rid, "table", caption=caption, table={"model": model}, wide=ncols > 3, numbered=False))
            out.append(f'::resource{{id="{rid}"}}')
            return
        self.mod.resources.append(Resource(rid, "table", caption=caption, table={"model": model}, wide=ncols > 3))
        ref = f':ref{{id="{rid}" case="lower"}}'
        if out and not out[-1].startswith(("#", ":::", "- ", "$$", "> ", "|")) and f'id="{rid}"' not in out[-1]:
            out[-1] = out[-1] + f" ({ref})"
        elif not any(f'id="{rid}"' in b for b in out[-3:]):
            out.append(ref)

    def equation(self, el: ET.Element, out: list[str]) -> None:
        m = el.find(q("math", MML))
        if m is None:
            text = inline(el, self.ctx)
            if text:
                out.append(text)
            return
        tex = tex_of(m)
        if tex:
            out.append(f"$$\n{tex}\n$$")

    # -- lists ----------------------------------------------------------------------
    # A Postext list item is one line, and a `$$` fence or an ordered item
    # right under a line of text is swallowed into it. Items with block
    # content (equations, figures, several paragraphs) are therefore
    # flattened: their text joins the item line; a display equation of a
    # top-level item ends the list (blank line, `$$…$$`, blank line), any
    # text after it follows as a paragraph, and the next item resumes the
    # list with its own number. In a nested list the equation stays on the
    # item line as inline math.

    def item_parts(self, it: ET.Element) -> list[tuple[str, str]]:
        """The content of a list item in order: ("text", s), ("math", tex)
        and ("lines", pre-rendered nested list lines)."""
        parts: list[tuple[str, str]] = []
        run = ET.Element("run")
        run.text = it.text

        def flush() -> None:
            nonlocal run
            text = inline(run, self.ctx, strip=False)
            parts.extend(split_display(text))
            run = ET.Element("run")

        for k in it:
            tag = local(k)
            if tag in ("para", "equation", "figure", "list", "note", "table"):
                flush()
                if tag == "list":
                    parts.append(("lines", "\n".join(self.list_blocks(k, nested=True))))
                elif tag == "figure":
                    # The figure is a resource; its `:ref` joins the item text.
                    last = next((i for i in range(len(parts) - 1, -1, -1) if parts[i][0] == "text"), None)
                    buf = [parts[last][1]] if last is not None else []
                    self.figure(k, buf)
                    if last is not None:
                        parts[last] = ("text", buf[0])
                        buf = buf[1:]
                    parts.extend(("text", b) for b in buf)
                else:
                    sub: list[str] = []
                    self.blocks_one(k, sub)
                    for piece in sub:
                        parts.extend(block_parts(piece))
                run.text = k.tail
            elif tag == "title":
                run.text = (run.text or "") + (k.tail or "")
            else:
                run.append(k)
        flush()
        return [(kind, v) for kind, v in parts if v.strip()]

    def item_blocks(self, prefix: str, parts: list[tuple[str, str]], nested: bool, pending: list[str]) -> list[str]:
        """Render one item. `pending` holds the current run of list lines;
        the returned blocks (if any) close it and must be emitted after it."""
        line = prefix
        has_text = False
        after: list[str] = []
        sub_lines: list[str] = []
        for kind, v in parts:
            if kind == "text" and not after:
                line += (" " if has_text else "") + one_line(v)
                has_text = True
            elif kind == "text":
                after.append(v)
            elif kind == "math" and (nested or not has_text) and not after:
                line += (" " if has_text else "") + f"${v}$"
                has_text = True
            elif kind == "math":
                after.append(f"$$\n{v}\n$$")
            elif kind == "lines" and not after:
                sub_lines += ["  " + ln for ln in v.split("\n")]
            else:
                after.append(v)
        pending.append(line.rstrip())
        pending.extend(sub_lines)
        return after

    def list_blocks(self, el: ET.Element, nested: bool = False) -> list[str]:
        ordered = el.get("list-type") == "enumerated"
        style = el.get("number-style") or "arabic"
        blocks: list[str] = []
        pending: list[str] = []
        for i, it in enumerate(el.findall(q("item"))):
            if ordered and style == "arabic":
                prefix = f"{i + 1}. "
            elif ordered:
                letter = chr(ord("a") + i)
                prefix = f"- ({letter}) " if style == "lower-alpha" else f"- {letter.upper() if 'upper' in style else letter}. "
            else:
                prefix = "- "
            after = self.item_blocks(prefix, self.item_parts(it), nested, pending)
            if after:
                blocks.append("\n".join(pending))
                pending = []
                blocks.extend(after)
        if pending:
            blocks.append("\n".join(pending))
        return blocks

    def exercise(self, el: ET.Element, out: list[str], numbered: bool, number: int | None = None, with_solution: bool = False) -> bool:
        problem = el.find(q("problem"))
        solution = el.find(q("solution"))
        pieces: list[str] = []
        if problem is not None:
            self.blocks(problem, pieces, level=5)
        if not pieces:
            return False
        if numbered:
            # The problem is an ordered item: its answer choices nest under it.
            parts = [p for piece in pieces for p in block_parts(piece)]
            pending: list[str] = []
            after = self.item_blocks(f"{number or 1}. ", parts, False, pending)
            out.append("\n".join(pending))
            out.extend(after)
        else:
            out.extend(pieces)
        if with_solution and solution is not None:
            sol: list[str] = []
            self.blocks(solution, sol, level=5)
            if sol:
                sol[0] = f"**{self.words['answer']}** " + sol[0]
                out.extend(sol)
        return True

    def note(self, el: ET.Element, out: list[str]) -> None:
        cls = el.get("class") or ""
        if any(c in cls for c in self.skip_notes):
            return
        title_el = el.find(q("title"))
        title = inline(title_el, self.ctx, in_title=True) if title_el is not None else ""
        body: list[str] = []
        if "learning-objectives" in cls:
            lst = el.find(q("list"))
            if lst is not None:
                self.mod.objectives = [inline(it, self.ctx) for it in lst.findall(q("item"))]
            return
        if "check-understanding" in cls or "grasp-check" in cls:
            for k in el:
                if local(k) == "exercise":
                    self.exercise(k, body, numbered=False, with_solution=True)
                elif local(k) != "title":
                    self.blocks_one(k, body)
            out.append(self.callout("comprobacion", title or self.words["check"], body))
            return
        if "worked-example" in cls:
            for k in el:
                if local(k) == "exercise":
                    self.worked_exercise(k, body)
                elif local(k) != "title":
                    self.blocks_one(k, body)
            out.append(self.callout("ejemplo", title or self.words["example"], body))
            return
        # Inner untitled notes of a worked example (Strategy / Solution / Discussion)
        if title and not cls:
            paras: list[str] = []
            for k in el:
                if local(k) != "title":
                    self.blocks_one(k, paras)
            if paras and LIST_LINE_RE.match(paras[0]):
                paras.insert(0, f"**{title}.**")  # a run-in title would turn the list into text
            elif paras:
                paras[0] = f"**{title}.** " + paras[0]
            out.extend(paras)
            return
        for k in el:
            if local(k) != "title":
                self.blocks_one(k, body)
        if not body:
            return
        kind = "nota"
        default = self.words["note"]
        if "media" in cls or "link" in cls:
            default = self.words["link"]
        elif "snap-lab" in cls:
            default = self.words["lab"]
        elif "tips" in cls:
            default = self.words["tips"]
        elif "fun" in cls or "boundless" in cls:
            default = self.words["aside"]
        out.append(self.callout(kind, title or default, body))

    def worked_exercise(self, el: ET.Element, out: list[str]) -> None:
        problem = el.find(q("problem"))
        if problem is not None:
            for k in problem:
                self.blocks_one(k, out)
        solution = el.find(q("solution"))
        if solution is not None:
            for k in solution:
                self.blocks_one(k, out)

    def example(self, el: ET.Element, out: list[str]) -> None:
        body: list[str] = []
        title = ""
        first = True
        for k in el:
            if local(k) == "title":
                title = inline(k, self.ctx, in_title=True)
                continue
            if local(k) == "para" and first:
                t = k.find(q("title"))
                if t is not None and not title:
                    title = inline(t, self.ctx, in_title=True)
                    self.para(k, body, run_in_title=False)
                    first = False
                    continue
            first = False
            self.blocks_one(k, body)
        out.append(self.callout("ejemplo", title or self.words["example"], body))

    def callout(self, kind: str, title: str, body: list[str]) -> str:
        title = title.replace('"', "”")
        return f':::callout{{type="{kind}" title="{title}"}}\n' + "\n\n".join(body) + "\n:::"
