"""Text extraction for EEA Signals 2020 (`source/signals-<lang>.pdf`).

The magazine is set in Open Sans with one role per font/size: article
titles (Bold 25), standfirsts (Semibold 9), body (Regular 9 in two columns
at x≈43 / x≈245), subheads (Bold 11 in a column), grey boxes (Bold 11 title
with Regular 9 body at x≈54 spanning the page), interview questions
(Regular 11), the editorial's signature (Bold 9 + Regular 9), photo credits
(7 pt, starting with ©) and infographic pages (hundreds of drawings; their
title is Bold 11 at the top and their introduction Regular 8). This module
turns the pages into a list of articles made of typed blocks.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

import fitz  # PyMuPDF

COLUMN_SPLIT = 200.0  # x of the gutter between the two body columns
BOX_X = 50.0  # grey-box body starts at x≈54 (columns at 43 / 245)
LINE_PITCH = 14.0
PARA_GAP = 20.0
LABELS = {"editorial": "editorial", "interview": "interview", "entrevista": "interview"}


@dataclass
class Block:
    kind: str  # paragraph | subhead | question | box | signature | infographic | credit
    text: str = ""
    title: str = ""
    paras: list[str] = field(default_factory=list)
    page: int = 0


@dataclass
class Article:
    title: str
    standfirst: str
    kind: str  # editorial | article | interview
    page: int
    blocks: list[Block] = field(default_factory=list)
    byline: str = ""
    photos: list[tuple[int, str]] = field(default_factory=list)  # (page, credit)
    infographics: list[tuple[int, str, str]] = field(default_factory=list)  # (page, title, intro)


@dataclass
class Extraction:
    articles: list[Article]
    references: list[tuple[str, str]]  # (number, url)


def _span_text(spans) -> str:
    """Text of a line without its superscript reference numbers (raised
    digits); chemical subscripts (lowered digits, NO₂ / PM₂.₅) stay."""
    out = []
    main = max(spans, key=lambda s: len(s["text"]))
    for s in spans:
        t = s["text"]
        if s["size"] < main["size"] - 1.5 and t.strip().isdigit() and s["origin"][1] < main["origin"][1] - 1:
            continue
        if s["size"] < main["size"] - 1.5 and re.fullmatch(r"[\d.,x]+", t.strip()):
            t = t.strip()  # subscript glued to the symbol
            if out:
                out[-1] = out[-1].rstrip()
        out.append(t)
    text = "".join(out)
    text = re.sub(r"\s+", " ", text)
    text = text.replace("ﬁ", "fi").replace("ﬂ", "fl").replace("ﬀ", "ff").replace("ﬃ", "ffi")
    return text.strip()


def _join(lines: list[str]) -> str:
    text = ""
    for ln in lines:
        if not text:
            text = ln
        elif text.endswith("-") and ln[:1].islower():
            text = text[:-1] + ln
        elif text.endswith("‑"):  # non-breaking hyphen inside a word
            text = text + ln
        else:
            text = text + " " + ln
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    text = re.sub(r":(?=(?:www\.|https?://))", ": ", text)
    return text.strip()


def _lines(page) -> list[dict]:
    """Every text line of the page with its role, in reading order."""
    out = []
    for b in page.get_text("dict")["blocks"]:
        if b["type"] != 0:
            continue
        for l in b["lines"]:
            spans = [s for s in l["spans"] if s["text"].strip()]
            if not spans:
                continue
            s0 = max(spans, key=lambda s: len(s["text"]))
            text = _span_text(spans)
            if not text:
                continue
            x0, y0, x1, y1 = l["bbox"]
            raw = re.sub(r"\s+", " ", "".join(s["text"] for s in spans)).strip()
            out.append({"font": s0["font"], "size": round(s0["size"]), "x": x0, "y": y0, "w": x1 - x0, "text": text, "raw": raw})
    return out


def _role(ln: dict) -> str:
    f, s = ln["font"], ln["size"]
    bold = "bold" in f.lower()
    semi = "semibold" in f.lower()
    if s >= 20 and (bold or semi):
        return "title"
    if s == 11 and bold:
        return "subhead"
    if s == 11 and not bold and not semi:
        return "question"
    if s == 9 and semi:
        return "standfirst"
    if s == 9 and bold:
        return "bold9"
    if s == 9:
        return "body"
    if s == 7 and ln["text"].startswith("©"):
        return "credit"
    if s == 8 and not bold and not semi:
        return "small"
    return "other"


def _is_infographic(page, lines: list[dict]) -> bool:
    """Infographic pages carry hundreds of drawings, or a couple of dozen
    with no body text at all (the chemicals and waste diagrams)."""
    n = len(page.get_drawings())
    body = sum(1 for ln in lines if _role(ln) in ("body", "standfirst", "title", "question"))
    return n > 100 or (n > 15 and body == 0)


def _page_number_line(ln: dict) -> bool:
    return ln["y"] > 640 and ln["text"].strip().isdigit()


def extract(pdf_path: str, first_page: int, last_page: int, references_from: int) -> Extraction:
    doc = fitz.open(pdf_path)
    articles: list[Article] = []
    current: Article | None = None
    open_para: list[str] | None = None  # lines of the paragraph being built
    open_para_kind = "paragraph"
    open_box: Block | None = None
    last_y = None
    last_col = None
    pending_signature: str | None = None
    signature_col: int | None = None  # column the open signature is set in
    pending_kind = "article"

    def flush_para() -> None:
        nonlocal open_para
        if open_para and current is not None:
            text = _join(open_para)
            if open_box is not None and open_para_kind == "paragraph":
                open_box.paras.append(text)
            else:
                current.blocks.append(Block(open_para_kind, text, page=current_page))
        open_para = None

    current_page = 0
    for pn in range(first_page - 1, last_page):
        page = doc[pn]
        current_page = pn + 1
        lines = [ln for ln in _lines(page) if not _page_number_line(ln)]
        if _is_infographic(page, lines):
            title = next((ln["text"] for ln in lines if _role(ln) == "subhead" and ln["y"] < 60), "")
            intro_lines = [ln["text"] for ln in lines if _role(ln) == "small" and ln["y"] < 110 and ln["w"] > 250]
            if current is not None and title:
                current.infographics.append((current_page, title, _join(intro_lines)))
            continue
        # A photo page: credits only, no body text.
        credits = [ln["text"] for ln in lines if _role(ln) == "credit"]
        body_count = sum(1 for ln in lines if _role(ln) in ("body", "standfirst", "title", "subhead", "question"))
        if credits and current is not None:
            for c in credits:
                current.photos.append((current_page, c))
        if body_count == 0:
            continue
        # Reading order: full-width blocks (titles, standfirst, boxes) go by y;
        # column lines by (column, y). Boxes at x≈54 are full width.
        def col_of(ln):
            if ln["w"] > 220 or ln["x"] > BOX_X and ln["x"] < 60:
                return -1  # full width / box
            return 0 if ln["x"] < COLUMN_SPLIT else 1

        # Split the page into vertical zones: a zone is a run of full-width
        # lines or a run of column lines; zones are read top to bottom.
        ordered = sorted(lines, key=lambda ln: ln["y"])
        zones: list[list[dict]] = []
        for ln in ordered:
            if _role(ln) == "credit":
                continue
            full = col_of(ln) == -1
            if zones and (col_of(zones[-1][0]) == -1) == full:
                zones[-1].append(ln)
            else:
                zones.append([ln])
        seq: list[dict] = []
        for z in zones:
            if col_of(z[0]) == -1:
                seq += z
            else:
                seq += sorted(z, key=lambda ln: (col_of(ln), ln["y"]))

        for ln in seq:
            role = _role(ln)
            col = col_of(ln)
            if role == "title":
                label = ln["text"].strip().lower()
                if label in LABELS:
                    pending_kind = LABELS[label]
                    last_y = ln["y"]
                    continue
                if current is not None and current.page == current_page and not current.standfirst and not current.blocks and last_y is not None and ln["y"] - last_y < 40:
                    current.title = _join([current.title, ln["text"]])  # a wrapped title
                    last_y = ln["y"]
                    continue
                flush_para()
                open_box = None
                current = Article(title=ln["text"], standfirst="", kind=pending_kind, page=current_page)
                pending_kind = "article"
                articles.append(current)
                open_para = None
                last_y = ln["y"]
                continue
            if current is None:
                continue
            if role == "standfirst":
                flush_para()
                if current.title == "" or (current.kind == "editorial" and not current.blocks and current.page != current_page and current.standfirst == ""):
                    pass
                if ln["y"] > 160 and ln["w"] < 120 and not current.standfirst and current.blocks == [] and current.page != current_page:
                    current.byline = ln["text"]  # the editorial's author line on the label page
                else:
                    current.standfirst = _join([current.standfirst, ln["text"]]) if current.standfirst else ln["text"]
                last_y = ln["y"]
                continue
            if role == "subhead":
                flush_para()
                if col == -1 or ln["x"] > BOX_X and ln["x"] < 60:
                    if open_box is not None and not open_box.paras and last_y is not None and ln["y"] - last_y < PARA_GAP:
                        open_box.title = _join([open_box.title, ln["text"]])  # a wrapped box title
                    else:
                        open_box = Block("box", title=ln["text"], page=current_page)
                        current.blocks.append(open_box)
                else:
                    open_box = None
                    if current.blocks and current.blocks[-1].kind == "subhead" and last_y is not None and ln["y"] - last_y < PARA_GAP:
                        current.blocks[-1].text = _join([current.blocks[-1].text, ln["text"]])
                    else:
                        current.blocks.append(Block("subhead", ln["text"], page=current_page))
                last_y = ln["y"]
                continue
            if role == "question":
                flush_para()
                open_box = None
                current.kind = "interview"
                # a question may wrap over two lines
                if current.blocks and current.blocks[-1].kind == "question" and ln["y"] - last_y < PARA_GAP:
                    current.blocks[-1].text = _join([current.blocks[-1].text, ln["text"]])
                else:
                    current.blocks.append(Block("question", ln["text"], page=current_page))
                last_y = ln["y"]
                continue
            if role == "bold9":
                flush_para()
                text = ln["text"]
                if re.search(r"\d", text) and len(text) < 30:
                    current.blocks.append(Block("stat", text, page=current_page))  # a pulled figure ("83 %")
                elif text.endswith(":") or text.lower().startswith(("find out more", "read more", "más información", "lea más", "leer más", "para más información")):
                    target = open_box.paras if open_box is not None else None
                    if target is not None:
                        target.append("**" + text + "**")
                    else:
                        current.blocks.append(Block("paragraph", "**" + text + "**", page=current_page))
                elif current.blocks and current.blocks[-1].kind == "signature" and last_y is not None and ln["y"] - last_y < PARA_GAP:
                    current.blocks[-1].text = _join([current.blocks[-1].text, text])
                else:
                    pending_signature = text
                last_y = ln["y"]
                continue
            if role == "body":
                if pending_signature is not None:
                    current.blocks.append(Block("signature", pending_signature + " · " + ln["text"], page=current_page))
                    pending_signature = None
                    signature_col = col
                    last_y = ln["y"]
                    continue
                # A signature runs on over as many lines as its affiliation
                # needs: every following line of the same column at the line
                # pitch belongs to it (a new paragraph opens after a wider gap).
                if (current.blocks and current.blocks[-1].kind == "signature" and last_y is not None
                        and col == signature_col and 0 < ln["y"] - last_y < PARA_GAP):
                    current.blocks[-1].text = _join([current.blocks[-1].text, ln["text"]])
                    last_y = ln["y"]
                    continue
                in_box = col == -1
                if in_box and open_box is None:
                    # box body without a title on this page (continuation): plain paragraph
                    pass
                new_para = (
                    open_para is None
                    or (last_col is not None and col != last_col and last_y is not None and ln["y"] < last_y - 100 and _ends_sentence(open_para[-1]))
                    or (last_y is not None and ln["y"] - last_y > PARA_GAP and ln["y"] > last_y)
                    or (last_y is None and _ends_sentence(open_para[-1]))
                )
                if new_para:
                    flush_para()
                    open_para = [ln["text"]]
                    open_para_kind = "paragraph"
                else:
                    open_para.append(ln["text"])
                last_y = ln["y"]
                last_col = col
                continue
            # anything else (small print, other) is ignored
        if open_para and (_ends_sentence(open_para[-1]) or open_box is not None):
            flush_para()
        # a box does not continue to the next page
        open_box = None
        last_y = None
        last_col = None
    flush_para()

    references: list[tuple[str, str]] = []
    for pn in range(references_from - 1, doc.page_count):
        page = doc[pn]
        lines = [ln for ln in _lines(page) if not _page_number_line(ln)]
        if not any(ln["text"].startswith("http") or re.match(r"^\d+\s+http", ln["text"]) for ln in lines):
            continue
        ordered = sorted(lines, key=lambda ln: (0 if ln["x"] < COLUMN_SPLIT else 1, ln["y"]))
        num, url = None, ""
        for ln in ordered:
            m = re.match(r"^(\d+)\s*((?:https?://|www\.)\S.*)$", ln["raw"])
            if m:
                if num is not None:
                    references.append((num, url))
                num, url = m.group(1), m.group(2)
            elif num is not None and ln["x"] > 50:
                url += ln["raw"]
        if num is not None:
            references.append((num, url))
    return Extraction(articles, references)


def _ends_sentence(text: str) -> bool:
    return text.rstrip().endswith((".", "!", "?", "”", ")", ":"))


if __name__ == "__main__":
    import sys

    ex = extract(sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]))
    for a in ex.articles:
        print(f"\n### [{a.kind}] p{a.page} {a.title}  ({a.byline})")
        print("   standfirst:", a.standfirst[:120])
        for b in a.blocks:
            if b.kind == "box":
                print(f"   BOX «{b.title}» {len(b.paras)} paras:", (b.paras[0][:80] if b.paras else ""))
            else:
                print(f"   {b.kind:10} {b.text[:100]}")
        print("   photos:", a.photos)
        print("   infographics:", [(p, t) for p, t, _ in a.infographics])
    print("\nreferences:", len(ex.references), ex.references[:3])
