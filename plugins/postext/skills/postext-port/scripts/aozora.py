#!/usr/bin/env python3
"""Convert an Aozora Bunko (青空文庫) ruby text into Postext Markdown.

Aozora texts are plain text with their own notation (注記一覧,
https://www.aozora.gr.jp/annotation/): readings in 《》 after the base, ｜
where the base does not start at a change of script, ［＃…］ notes for
layout, emphasis, headings and characters outside JIS X 0208 (外字). This
module reads that notation and writes the Postext dialect:

  ruby          私《わたくし》, ｜麦藁帽《むぎわらぼう》   → {私|わたくし}, {麦藁帽|むぎわらぼう}
                (one reading for the whole base: Aozora never splits a
                reading per character, so it is a group ruby; a reading
                with spaces, or a base without kanji or kana, takes
                :ruby[base]{rt="…" group})
  left ruby     ［＃「X」の左に「r」のルビ］                → :ruby[X]{rt="r" group pos=under}
  bōten         ［＃「X」に傍点］, ［＃傍点］…［＃傍点終わり］ → :dots[X]{style=sesame} (shape and side kept)
  side lines    ［＃「X」に傍線］ and the four other kinds    → :sideline[X]{style=…}
  tate-chū-yoko ［＃「X」は縦中横］                         → :tcy[X]
  warichu       ［＃割り注］…［＃割り注終わり］             → :warichu[…]
  kunten        字［＃（ヲ）］［＃レ］                       → :kunten[字]{kaeri="レ" okuri="ヲ"}
                (a 竪点 ‐ after the character: 敬‐［＃二］祭 → :kunten[敬]{tate kaeri="二"}祭;
                one between two kanji on a line with kunten: 讀‐書 → :kunten[讀]{tate}書)
  headings      大/中/小見出し (forward and block forms)    → #, ##, ### with {indent="N"}
  indents       字下げ, 地付き, 字上げ blocks and lines      → :::paragraphs{style="aozora-…"}
  breaks        改ページ / 改丁 / 改見開き / 改段            → :::pagebreak / {parity="odd"} / {parity="even"} / :::columnbreak
  gaiji         ※［＃「てへん＋劣」、第3水準1-84-77］       → 挘 (JIS X 0213 plane-row-cell, U+XXXX)
  くの字点      ／＼, ／″＼                                → 〳〵, 〴〵

Paragraph indents follow the source (JLReq §3.1.5; Aozora writes the indent
into the text): a leading U+3000 is the ordinary 1 em indent and is dropped
(the engine indents every paragraph by `bodyText.firstLineIndent`); a
paragraph opening with a bracket has no U+3000 and is left to the engine's
bracket rule (`cjk.paragraphStartBracket`); a paragraph with neither is set
flush, so it goes into `:::paragraphs{style="aozora-f0"}`. Every
`aozora-…` style the text uses is returned as a ready ParagraphStyle config
(`Result.styles`) for the project's `paragraphStyles`.

Editorial notes (［＃「X」は底本では「Y」］, ［＃「X」はママ］) are not printed:
they are returned in `Result.doc.editorial`. The bibliographic block at the
end (底本, 入力, 校正 …, which Aozora asks to keep with the text) is returned
in `Result.doc.credits`, not in the Markdown.

Python 3.10+, standard library only. As a library:

    from aozora import convert
    result = convert("773_ruby_5968.zip")       # zip, .txt (CP932 or UTF-8), bytes or str
    result.markdown, result.styles, result.doc.credits, result.report

or from the command line:

    aozora.py kokoro.zip -o kokoro.md --report report.json --styles styles.json

Everything the converter does not know is listed in the report
(`unknownAnnotations`, `unresolvedGaiji`, `unmatchedTargets`, `gaps`) with its
line number: read it after a conversion.
"""
from __future__ import annotations

import argparse
import io
import json
import re
import sys
import unicodedata
import zipfile
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

# --- decoding ----------------------------------------------------------------


def decode(data: bytes) -> str:
    """Aozora files are Shift_JIS, read as CP932 (Windows-31J: iconv's
    SHIFT_JIS turns ―― into U+2014 and drops the NEC/IBM extensions); newer
    ones may be UTF-8. A BOM is dropped and line ends become `\\n`."""
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = data.decode("cp932")
    return text.replace("\r\n", "\n").replace("\r", "\n")


def read_source(src: str | Path | bytes) -> str:
    """The decoded text of a zip (its first .txt), a .txt path, raw bytes, or
    a str that is already text (it holds a newline or an Aozora mark)."""
    if isinstance(src, bytes):
        data = src
    elif isinstance(src, str) and ("\n" in src or "《" in src or "［＃" in src):
        return src.replace("\r\n", "\n").replace("\r", "\n").lstrip("﻿")
    else:
        data = Path(src).read_bytes()
    if data[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            name = next(n for n in z.namelist() if n.lower().endswith(".txt"))
            data = z.read(name)
    return decode(data)


# --- character classes ---------------------------------------------------------

# The base of a reading written without ｜ is the run of characters of one
# kind before 《 (注記一覧「ルビ」): kanji (々〆〇ヶ仝 count as kanji, and a
# resolved or unresolved 外字), hiragana, katakana, full-width or half-width
# Latin letters and digits.
_KANJI_RE = re.compile(r"[㐀-䶿一-鿿豈-﫿\U00020000-\U0003FFFF々〆〇ヶ仝〓]")
_HIRA_RE = re.compile(r"[ぁ-ゟー]")
_KATA_RE = re.compile(r"[゠-ヿㇰ-ㇿー]")
_ZEN_RE = re.compile(r"[Ａ-Ｚａ-ｚ０-９Α-ωА-я]")
_HAN_RE = re.compile(r"[A-Za-z0-9'\-.,&]")
_CLASSES = (_KANJI_RE, _HIRA_RE, _KATA_RE, _ZEN_RE, _HAN_RE)

# A compact ruby `{base|reading}` needs a Han, kana or bopomofo letter in
# its base (packages/postext/src/parse/annotations.ts RUBY_BASE_RE).
_COMPACT_BASE_RE = re.compile(r"[㐀-䶿一-鿿豈-﫿\U00020000-\U0003FFFFぁ-ヿㇰ-ㇿ㄀-ㄯ々〇]")

# Opening brackets a paragraph may start with (JLReq cl-01).
OPENING_BRACKETS = "「『（〔［｛〈《【〘〖〝“‘(["

_DIGITS = str.maketrans("０１２３４５６７８９", "0123456789")


def _int(s: str) -> int:
    return int(s.translate(_DIGITS))


# Characters Aozora reserves for its notation. A 外字 note may stand for one
# of them (※［＃始め二重山括弧、1-1-52］ is a literal 《): it is kept as a
# private-use stand-in while the line is parsed and restored on output.
_RESERVED = "｜《》［］＃※〔〕"
_GUARD = {c: chr(0xF8F0 + i) for i, c in enumerate(_RESERVED)}
_UNGUARD = {v: k for k, v in _GUARD.items()}


def _unguard(s: str) -> str:
    return "".join(_UNGUARD.get(c, c) for c in s)


# --- the document model ------------------------------------------------------


@dataclass
class Text:
    text: str


@dataclass
class Ruby:
    """A reading over (`side="right"`, over in horizontal text) or beside
    (`"left"`) its base. `editorial`: the reading was written in 〔〕, added
    by the base edition's editors."""

    children: list
    reading: str
    side: str = "right"
    editorial: bool = False


@dataclass
class Mark:
    """An inline mark over `children`: dots, sideline, bold, italic, tcy,
    sideways, sup, sub, warichu, kunten, size, box, heading, caption."""

    kind: str
    attrs: dict
    children: list


@dataclass
class LineBreak:
    """［＃改行］: a forced break (inside a warichu note, its second row)."""


@dataclass
class AlignTail:
    """A mid-line ［＃地付き］ / ［＃地からN字上げ］: the rest of the line goes to
    the line end."""

    raise_: int


@dataclass
class ParaStyle:
    """A paragraph's layout as Aozora records it, in body ems: `indent` of
    every line, `first` extra on the first line, `hang` extra on the
    turnovers (折り返して), `end` set to the line end (地付き) raised by
    `raise_` (地からN字上げ), `measure` (N字詰め), `center` (ページの左右中央)."""

    indent: int = 0
    first: int = 1
    hang: int = 0
    end: bool = False
    raise_: int = 0
    measure: int = 0
    center: bool = False

    def is_default(self) -> bool:
        return self == ParaStyle()

    def style_id(self) -> str:
        parts = []
        if self.indent:
            parts.append(f"i{self.indent}")
        if self.hang:
            parts.append(f"h{self.hang}")
        elif not self.end:
            parts.append(f"f{self.first}")
        if self.end:
            parts.append(f"end{self.raise_ or ''}")
        if self.measure:
            parts.append(f"w{self.measure}")
        if self.center:
            parts.append("center")
        return "aozora-" + "-".join(parts)


@dataclass
class Block:
    """`kind`: paragraph, heading, break, blank, image.

    - paragraph: `nodes`, `style` (ParaStyle), `lead` (indent | bracket |
      flush | spaces | indent+bracket);
    - heading: `nodes`, `level` (大 | 中 | 小), `form` (normal | runin |
      window), `indent` (字下げ in ems), `center`;
    - break: `brk` (page | recto | spread | column);
    - blank: `count` (empty source lines);
    - image: `file`, `alt`, `width`, `height`, `nodes` (caption)."""

    kind: str
    line: int = 0
    nodes: list = field(default_factory=list)
    style: ParaStyle | None = None
    lead: str = ""
    level: str = ""
    form: str = "normal"
    indent: int = 0
    center: bool = False
    brk: str = ""
    count: int = 0
    file: str = ""
    alt: str = ""
    width: int = 0
    height: int = 0

    @property
    def plain(self) -> str:
        return plain(self.nodes)


@dataclass
class Report:
    counts: Counter = field(default_factory=Counter)
    gaiji: list = field(default_factory=list)
    unresolved_gaiji: list = field(default_factory=list)
    unknown: list = field(default_factory=list)
    unmatched: list = field(default_factory=list)
    gaps: Counter = field(default_factory=Counter)
    gap_lines: dict = field(default_factory=dict)

    def gap(self, name: str, line: int) -> None:
        self.gaps[name] += 1
        self.gap_lines.setdefault(name, []).append(line)

    def to_dict(self) -> dict:
        return {
            "counts": dict(sorted(self.counts.items())),
            "gaiji": self.gaiji,
            "unresolvedGaiji": self.unresolved_gaiji,
            "unknownAnnotations": self.unknown,
            "unmatchedTargets": self.unmatched,
            "gaps": {k: {"count": v, "lines": self.gap_lines[k][:20]} for k, v in sorted(self.gaps.items())},
        }


@dataclass
class AozoraDocument:
    title: str
    author: str
    header: list[str]
    legend: str
    blocks: list[Block]
    credits: dict
    editorial: list[dict]
    report: Report


# --- plain text and node helpers ------------------------------------------------


def plain(nodes: Iterable) -> str:
    """The base text of `nodes`: readings and marks dropped."""
    out = []
    for n in nodes:
        if isinstance(n, Text):
            out.append(n.text)
        elif isinstance(n, (Ruby, Mark)):
            out.append(plain(n.children))
    return _unguard("".join(out))


def _raw_plain(nodes: Iterable) -> str:
    out = []
    for n in nodes:
        if isinstance(n, Text):
            out.append(n.text)
        elif isinstance(n, (Ruby, Mark)):
            out.append(_raw_plain(n.children))
    return "".join(out)


# --- whole-text normalisation ---------------------------------------------------

_GAIJI_RE = re.compile(r"※［＃([^［］]*)］")
_JIS_RE = re.compile(r"(?<![\d-])([12])-(\d{1,2})-(\d{1,2})(?![\d-])")
_UCS_RE = re.compile(r"U\+([0-9A-Fa-f]{4,6})")
_DESC_RE = re.compile(r"^「(.*)」、")


def resolve_gaiji(note: str) -> str | None:
    """The character a 外字 note stands for: `U+XXXX`, else a JIS X 0213
    plane-row-cell (第3水準1-84-77, 第4水準2-1-1, or a non-kanji symbol's
    1-2-22), decoded through the EUC-JIS-2004 codec (plane 1 = row/cell
    + 0xA0, plane 2 behind 0x8F). None when the note gives neither (only a
    description and a page-line reference)."""
    m = _UCS_RE.search(note)
    if m:
        return chr(int(m.group(1), 16))
    for m in reversed(list(_JIS_RE.finditer(note))):
        plane, row, cell = (int(g) for g in m.groups())
        if not (1 <= row <= 94 and 1 <= cell <= 94):
            continue
        raw = bytes([0xA0 + row, 0xA0 + cell])
        if plane == 2:
            raw = b"\x8f" + raw
        try:
            ch = raw.decode("euc_jis_2004")
        except UnicodeDecodeError:
            continue
        if ch:
            return ch
    return None


# Aozora's アクセント分解 (accent decomposition), written between 〔〕: a
# letter followed by the accent's sign. Ligatures and the special letters
# first.
_ACCENT_SPECIAL = {
    "AE&": "Æ", "ae&": "æ", "OE&": "Œ", "oe&": "œ", "s&": "ß",
    "A@": "Å", "a@": "å", "O/": "Ø", "o/": "ø", "!@": "¡", "?@": "¿",
}
_ACCENT_MARKS = {"`": "̀", "'": "́", "^": "̂", "~": "̃", ":": "̈", "_": "̄", ",": "̧"}
_ACCENT_RE = re.compile(r"〔([\x20-\x7E]+)〕")
_ACCENT_TOKEN_RE = re.compile(r"AE&|ae&|OE&|oe&|s&|A@|a@|O/|o/|!@|\?@|[A-Za-z][`'^~:_,]")


def _decompose_accents(m: re.Match) -> str:
    inner = m.group(1)
    if not _ACCENT_TOKEN_RE.search(inner):
        return m.group(0)

    def sub(t: re.Match) -> str:
        tok = t.group(0)
        if tok in _ACCENT_SPECIAL:
            return _ACCENT_SPECIAL[tok]
        return unicodedata.normalize("NFC", tok[0] + _ACCENT_MARKS[tok[1]])

    return _ACCENT_TOKEN_RE.sub(sub, inner)


_KUNOJI_RE = re.compile(r"(?<=[^\s／])／(″?)＼")
_HALFWIDTH_KANA_RE = re.compile(r"[｡-ﾟ]+")


def normalise_line(line: str, lineno: int, report: Report) -> str:
    """Characters before the notation is parsed: 外字 resolved, accents
    composed, くの字点 and half-width kana normalised, the wave dash restored."""

    def gaiji(m: re.Match) -> str:
        note = m.group(1)
        desc = _DESC_RE.match(note)
        ch = resolve_gaiji(note)
        if ch is None:
            report.unresolved_gaiji.append({"line": lineno, "note": note})
            report.counts["gaijiUnresolved"] += 1
            return "〓"
        report.gaiji.append({"line": lineno, "note": note, "char": ch, "description": desc.group(1) if desc else note.split("、")[0]})
        report.counts["gaiji"] += 1
        return "".join(_GUARD.get(c, c) for c in ch)

    line = _GAIJI_RE.sub(gaiji, line)
    line = _ACCENT_RE.sub(_decompose_accents, line)
    # くの字点: Aozora types the two-cell repeat mark as ／＼ (voiced ／″＼);
    # 〳〵 / 〴〵 are its Unicode halves (vertical text only, JLReq §3.1.10).
    n = len(_KUNOJI_RE.findall(line))
    if n:
        report.counts["kunojiten"] += n
        line = _KUNOJI_RE.sub(lambda m: "〴〵" if m.group(1) else "〳〵", line)
    # Half-width katakana are never used in books (Aozora forbids them):
    # full width, NFKC for that range only (Ａ１ must stay full width).
    line = _HALFWIDTH_KANA_RE.sub(lambda m: unicodedata.normalize("NFKC", m.group(0)), line)
    # CP932 decodes JIS 1-1-33 WAVE DASH as U+FF5E; JIS X 0208 and JLReq's
    # range mark is U+301C 〜.
    if "～" in line:
        report.counts["waveDash"] += line.count("～")
        line = line.replace("～", "〜")
    return line


# --- header and footer ------------------------------------------------------------

_RULE_RE = re.compile(r"^-{10,}\s*$")
_CREDIT_KEY_RE = re.compile(r"^(底本の親本|底本|初出|入力|校正|翻訳|編集|校訂|作成|ファイル作成|プログラム|画像)：(.*)$")


def split_text(text: str) -> tuple[list[str], str, list[str], int, list[str]]:
    """(header lines, legend, body lines, number of the body's first line,
    credit lines). The header is the lines before the first blank line
    (title, subtitle, author, translator); the legend is the block between
    two rules of hyphens; the credits start at the last `底本：` line (or
    after ［＃本文終わり］)."""
    lines = text.split("\n")
    i = 0
    header = []
    while i < len(lines) and lines[i].strip():
        header.append(lines[i].strip())
        i += 1
    legend = []
    j = i
    while j < len(lines) and not lines[j].strip():
        j += 1
    if j < len(lines) and _RULE_RE.match(lines[j]):
        k = j + 1
        while k < len(lines) and not _RULE_RE.match(lines[k]):
            legend.append(lines[k])
            k += 1
        i = k + 1
    start = i
    end = len(lines)
    for k in range(len(lines) - 1, start - 1, -1):
        if lines[k].startswith("底本：") or lines[k].startswith("［＃本文終わり］"):
            end = k
            break
    credits = lines[end:]
    if credits and credits[0].startswith("［＃本文終わり］"):
        credits = credits[1:]
    body = lines[start:end]
    while body and not body[-1].strip():
        body.pop()
    return header, "\n".join(legend).strip(), body, start + 1, [c for c in credits]


def parse_credits(lines: list[str]) -> dict:
    """The bibliographic block, with `raw` (the block as written, to
    reproduce in a colophon), `fields` (底本, 底本の親本, 初出, 入力, 校正 …:
    a list of values each, continuation lines joined), `dates` (公開,
    作成, 修正) and `notes` (the ※ lines)."""
    while lines and not lines[-1].strip():
        lines = lines[:-1]
    raw = "\n".join(lines).strip()
    fields: dict[str, list[str]] = {}
    dates: list[str] = []
    notes: list[str] = []
    key = None
    for line in lines:
        m = _CREDIT_KEY_RE.match(line)
        if m:
            key = m.group(1)
            fields.setdefault(key, []).append(m.group(2).strip())
            continue
        if line.startswith("　") and key:
            fields[key][-1] = (fields[key][-1] + "\n" + line.strip()).strip()
            continue
        key = None
        if line.startswith("※"):
            notes.append(line[1:].strip())
        elif re.match(r"^\d{4}年\d{1,2}月\d{1,2}日.*(公開|作成|修正)", line):
            dates.append(line.strip())
        elif line.startswith("青空文庫作成ファイル"):
            break
    return {"raw": raw, "fields": fields, "dates": dates, "notes": notes}


def header_fields(header: list[str]) -> tuple[str, str]:
    """(title, author) from the header lines: the first line is the title;
    the author is the last line not ending in 訳 (a translator)."""
    title = header[0] if header else ""
    rest = [h for h in header[1:] if not h.endswith("訳")]
    author = rest[-1] if rest else ""
    return title, author


# --- annotations --------------------------------------------------------------

DOTS = {
    "傍点": {"style": "sesame"},
    "白ゴマ傍点": {"style": "sesame", "fill": "open"},
    "丸傍点": {"style": "circle", "fill": "filled"},
    "白丸傍点": {"style": "circle", "fill": "open"},
    "黒三角傍点": {"style": "triangle"},
    "白三角傍点": {"style": "triangle", "fill": "open"},
    "二重丸傍点": {"style": "double-circle", "fill": "open"},
    "蛇の目傍点": {"style": "double-circle", "fill": "filled"},
    "ばつ傍点": {"style": "saltire"},
}
# Shapes the engine does not draw (it knows dot, circle, sesame): kept in the
# markup, listed as a gap.
_DOT_GAPS = {"triangle", "double-circle", "saltire"}
SIDELINES = {"傍線": "solid", "二重傍線": "double", "鎖線": "dotted", "破線": "dashed", "波線": "wavy"}
_SIDELINE_GAPS = {"dashed"}
SIMPLE = {
    "太字": "bold", "斜体": "italic", "縦中横": "tcy", "横組み": "sideways",
    "上付き小文字": "sup", "下付き小文字": "sub", "行右小書き": "sup", "行左小書き": "sub",
    "罫囲み": "box", "キャプション": "caption",
}
HEADING_LEVELS = {"大": 1, "中": 2, "小": 3}
BREAKS = {"改ページ": "page", "改丁": "recto", "改見開き": "spread", "改段": "column"}

_DOTS_ALT = "|".join(sorted(DOTS, key=len, reverse=True))
_LINES_ALT = "|".join(sorted(SIDELINES, key=len, reverse=True))
_SIMPLE_ALT = "|".join(SIMPLE)
_N = r"([0-9０-９]+)"

FWD_DOTS = re.compile(rf"^「(.+)」(に|の左に)({_DOTS_ALT})$")
FWD_LINES = re.compile(rf"^「(.+)」(に|の左に)({_LINES_ALT})$")
FWD_RUBY = re.compile(r"^「(.+)」(に|の左に)「(.+)」の(ルビ|注記)$")
FWD_SIMPLE = re.compile(rf"^「(.+)」は({_SIMPLE_ALT})$")
FWD_SIZE = re.compile(rf"^「(.+)」は{_N}段階(大きな|小さな)文字$")
FWD_HEADING = re.compile(r"^「(.+)」は(同行|窓)?(大|中|小)見出し$")
EDIT_TEIHON = re.compile(r"^(ルビの)?「(.+)」は底本では「(.*)」(.*)$")
EDIT_MAMA = re.compile(r"^(ルビの)?「(.+)」はママ$")
START_DOTS = re.compile(rf"^(左に)?({_DOTS_ALT})$")
END_DOTS = re.compile(rf"^(左に)?({_DOTS_ALT})終わり$")
START_LINES = re.compile(rf"^(左に)?({_LINES_ALT})$")
END_LINES = re.compile(rf"^(左に)?({_LINES_ALT})終わり$")
START_SIMPLE = re.compile(rf"^({_SIMPLE_ALT}|割り注|ここから割り注)$")
END_SIMPLE = re.compile(rf"^({_SIMPLE_ALT}|割り注|ここで割り注)終わり$")
START_SIZE = re.compile(rf"^{_N}段階(大きな|小さな)文字$")
END_SIZE = re.compile(r"^(大きな|小さな)文字終わり$")
START_HEADING = re.compile(r"^(同行|窓)?(大|中|小)見出し$")
END_HEADING = re.compile(r"^(同行|窓)?(大|中|小)見出し終わり$")
START_NOTE = re.compile(r"^(左に)?(注記|ルビ)付き$")
END_NOTE = re.compile(r"^(左に)?「(.+)」の(注記|ルビ)付き終わり$")
KAERI = re.compile(r"^(?:[一二三四五六七八九上中下甲乙丙丁戊己庚辛壬癸天地人]レ?|レ)$")
OKURI = re.compile(r"^（(.+)）$")
IMAGE = re.compile(r"^(.*?)（([^、（）]+\.(?:png|jpe?g|gif|svg))(?:、横([0-9]+)×縦([0-9]+))?）入る$")

# Line-level notes.
L_INDENT = re.compile(rf"^(?:天から)?{_N}字下げ$")
L_END = re.compile(rf"^地付き$|^地から{_N}字上げ$")
L_BLOCK_INDENT = re.compile(rf"^ここから{_N}字下げ$")
L_BLOCK_HANG = re.compile(rf"^ここから{_N}字下げ、折り返して{_N}字下げ$")
L_BLOCK_TENTSUKI = re.compile(rf"^ここから改行天付き、折り返して{_N}字下げ$")
L_BLOCK_END = re.compile(rf"^ここから地付き$|^ここから地から{_N}字上げ$")
L_BLOCK_MEASURE = re.compile(rf"^ここから{_N}字詰め$")
L_BLOCK_STYLE = re.compile(rf"^ここから({_SIMPLE_ALT}|{_N}段階(?:大きな|小さな)文字|(?:大|中|小)見出し)$")
L_BLOCK_STYLE_END = re.compile(rf"^ここで({_SIMPLE_ALT}|(?:大きな|小さな)文字|(?:大|中|小)見出し)終わり$")

_NOTE_RE = re.compile(r"［＃((?:[^［］「」]|「[^」]*」)*)］")


def _notes_at_start(line: str) -> tuple[list[str], str]:
    """The ［＃…］ notes at the very start of `line`, and the rest."""
    notes = []
    while line.startswith("［＃"):
        m = _NOTE_RE.match(line)
        if not m:
            break
        notes.append(m.group(1))
        line = line[m.end():]
    return notes, line


# --- the inline parser ----------------------------------------------------------


class _Frame:
    def __init__(self, kind: str, attrs: dict | None = None, key: str = "") -> None:
        self.kind = kind
        self.attrs = attrs or {}
        self.key = key  # what closes it
        self.children: list = []
        self.ruby_start: int | None = None  # index of the child after ｜


def _char_class(ch: str) -> int:
    for i, rx in enumerate(_CLASSES):
        if rx.match(ch):
            return i
    return -1


def _split_run(text: str) -> tuple[str, str]:
    """(head, base): the implicit ruby base is the longest run at the end
    of `text` of the last character's kind."""
    if not text:
        return text, ""
    cls = _char_class(text[-1])
    if cls < 0:
        return text, ""
    i = len(text)
    while i > 0 and (_char_class(text[i - 1]) == cls or (cls in (1, 2) and text[i - 1] == "ー")):
        i -= 1
    return text[:i], text[i:]


def _take_suffix(children: list, target: str) -> list | None:
    """Remove from the end of `children` the nodes whose base text is
    `target` and return them (a text node is split where it must be; a ruby
    or a mark is taken whole). None when the text before the note does not
    end with `target`."""
    if not target:
        return None
    if not _raw_plain(children).endswith(target):
        return None
    need = target
    taken: list = []
    while need:
        node = children.pop()
        t = _raw_plain([node])
        if isinstance(node, Text):
            if len(t) <= len(need):
                taken.insert(0, node)
                need = need[: len(need) - len(t)]
            else:
                children.append(Text(t[: len(t) - len(need)]))
                taken.insert(0, Text(t[len(t) - len(need):]))
                need = ""
        else:
            taken.insert(0, node)
            need = need[: max(0, len(need) - len(t))]
    return taken


class InlineParser:
    """Parses one source line into nodes."""

    def __init__(self, report: Report, editorial: list, lineno: int, editorial_ruby: str) -> None:
        self.report = report
        self.editorial = editorial
        self.lineno = lineno
        self.editorial_ruby = editorial_ruby
        self.stack = [_Frame("root")]

    @property
    def top(self) -> _Frame:
        return self.stack[-1]

    def add_text(self, s: str) -> None:
        kids = self.top.children
        # Right after ｜ a new text node starts: the ruby base begins there.
        if kids and isinstance(kids[-1], Text) and self.top.ruby_start != len(kids):
            kids[-1] = Text(kids[-1].text + s)
        else:
            kids.append(Text(s))

    def parse(self, line: str) -> list:
        i = 0
        n = len(line)
        while i < n:
            c = line[i]
            if c == "｜":
                self.top.ruby_start = len(self.top.children)
                # Split here so that the ruby base starts at a node boundary.
                i += 1
                continue
            if c == "《":
                j = line.find("》", i + 1)
                if j < 0:
                    self.add_text(c)
                    i += 1
                    continue
                self.ruby(line[i + 1 : j])
                i = j + 1
                continue
            if line.startswith("［＃", i):
                m = _NOTE_RE.match(line, i)
                if m:
                    self.note(m.group(1))
                    i = m.end()
                    continue
            self.add_text(c)
            i += 1
        # Close whatever a missing end note left open.
        while len(self.stack) > 1:
            frame = self.stack.pop()
            self.report.unmatched.append({"line": self.lineno, "note": f"{frame.key} (no end on the line)"})
            self.top.children.extend(frame.children)
        return self.top.children

    # -- ruby

    def ruby(self, reading: str) -> None:
        editorial = False
        if reading.startswith("〔") and reading.endswith("〕"):
            editorial = True
            reading = reading[1:-1]
            self.report.counts["rubyEditorial"] += 1
            if self.editorial_ruby == "drop":
                self.top.ruby_start = None
                return
        frame = self.top
        if frame.ruby_start is not None:
            base = frame.children[frame.ruby_start :]
            del frame.children[frame.ruby_start :]
            frame.ruby_start = None
            self.report.counts["rubyExplicit"] += 1
        else:
            kids = frame.children
            if kids and isinstance(kids[-1], Text):
                head, run = _split_run(kids[-1].text)
                if not run:
                    self.report.unmatched.append({"line": self.lineno, "note": f"《{reading}》 with no base"})
                    self.add_text(f"《{reading}》")
                    return
                kids.pop()
                if head:
                    kids.append(Text(head))
                base = [Text(run)]
            elif kids:
                # A reading right after a mark (an annotated word): it
                # belongs to that node.
                base = [kids.pop()]
            else:
                self.report.unmatched.append({"line": self.lineno, "note": f"《{reading}》 with no base"})
                return
        if not plain(base):
            self.add_text(f"《{reading}》")
            return
        self.report.counts["ruby"] += 1
        frame.children.append(Ruby(base, reading, "right", editorial))

    # -- notes

    def note(self, body: str) -> None:
        r = self.report
        r.counts["notes"] += 1
        m = FWD_DOTS.match(body)
        if m:
            style = dict(DOTS[m.group(3)])
            if m.group(2) == "の左に":
                style["pos"] = "under"
            if style["style"] in _DOT_GAPS:
                r.gap(f"dots style {style['style']}", self.lineno)
            return self.wrap_target(m.group(1), Mark("dots", style, []), body)
        m = FWD_LINES.match(body)
        if m:
            attrs = {"style": SIDELINES[m.group(3)]}
            if m.group(2) == "の左に":
                attrs["pos"] = "under"
            if attrs["style"] in _SIDELINE_GAPS:
                r.gap(f"sideline style {attrs['style']}", self.lineno)
            return self.wrap_target(m.group(1), Mark("sideline", attrs, []), body)
        m = FWD_RUBY.match(body)
        if m:
            side = "left" if m.group(2) == "の左に" else "right"
            return self.wrap_target(m.group(1), Ruby([], m.group(3), side), body)
        m = FWD_SIMPLE.match(body)
        if m:
            return self.wrap_target(m.group(1), Mark(SIMPLE[m.group(2)], {"aozora": m.group(2)}, []), body)
        m = FWD_SIZE.match(body)
        if m:
            step = _int(m.group(2)) * (1 if m.group(3) == "大きな" else -1)
            return self.wrap_target(m.group(1), Mark("size", {"step": step}, []), body)
        m = FWD_HEADING.match(body)
        if m:
            form = {"同行": "runin", "窓": "window"}.get(m.group(2) or "", "normal")
            return self.wrap_target(m.group(1), Mark("heading", {"level": m.group(3), "form": form}, []), body)
        m = EDIT_TEIHON.match(body)
        if m:
            self.editorial.append({"line": self.lineno, "kind": "teihon", "ruby": bool(m.group(1)), "text": _unguard(m.group(2)), "teihon": _unguard(m.group(3)), "note": m.group(4)})
            r.counts["editorial"] += 1
            return
        m = EDIT_MAMA.match(body)
        if m:
            self.editorial.append({"line": self.lineno, "kind": "mama", "ruby": bool(m.group(1)), "text": _unguard(m.group(2))})
            r.counts["editorial"] += 1
            return
        # Start / end forms.
        m = START_DOTS.match(body)
        if m:
            style = dict(DOTS[m.group(2)])
            if m.group(1):
                style["pos"] = "under"
            return self.open("dots", style, "dots:" + (m.group(1) or "") + m.group(2))
        m = END_DOTS.match(body)
        if m:
            return self.close("dots:" + (m.group(1) or "") + m.group(2), body)
        m = START_LINES.match(body)
        if m:
            attrs = {"style": SIDELINES[m.group(2)]}
            if m.group(1):
                attrs["pos"] = "under"
            return self.open("sideline", attrs, "line:" + (m.group(1) or "") + m.group(2))
        m = END_LINES.match(body)
        if m:
            return self.close("line:" + (m.group(1) or "") + m.group(2), body)
        m = START_SIMPLE.match(body)
        if m:
            name = m.group(1).replace("ここから", "")
            kind = "warichu" if name == "割り注" else SIMPLE[name]
            return self.open(kind, {"aozora": name}, "simple:" + name)
        m = END_SIMPLE.match(body)
        if m:
            return self.close("simple:" + m.group(1).replace("ここで", ""), body)
        m = START_SIZE.match(body)
        if m:
            step = _int(m.group(1)) * (1 if m.group(2) == "大きな" else -1)
            return self.open("size", {"step": step}, "size:" + m.group(2))
        m = END_SIZE.match(body)
        if m:
            return self.close("size:" + m.group(1), body)
        m = START_HEADING.match(body)
        if m:
            form = {"同行": "runin", "窓": "window"}.get(m.group(1) or "", "normal")
            return self.open("heading", {"level": m.group(2), "form": form}, "heading:" + (m.group(1) or "") + m.group(2))
        m = END_HEADING.match(body)
        if m:
            return self.close("heading:" + (m.group(1) or "") + m.group(2), body)
        m = START_NOTE.match(body)
        if m:
            return self.open("note", {"side": "left" if m.group(1) else "right"}, "note:" + (m.group(1) or ""))
        m = END_NOTE.match(body)
        if m:
            return self.close("note:" + (m.group(1) or ""), body, reading=m.group(2))
        if KAERI.match(body):
            return self.kunten(kaeri=body)
        m = OKURI.match(body)
        if m:
            return self.kunten(okuri=m.group(1))
        if body == "改行":
            r.counts["lineBreak"] += 1
            self.top.children.append(LineBreak())
            return
        m = L_END.match(body)
        if m:
            r.counts["alignEnd"] += 1
            self.top.children.append(AlignTail(_int(m.group(1)) if m.group(1) else 0))
            return
        r.unknown.append({"line": self.lineno, "note": _unguard(body)})
        r.counts["unknown"] += 1

    def wrap_target(self, target: str, node, body: str) -> None:
        """A forward-reference note (［＃「X」に傍点］): X is the text right
        before it, readings not counted (a heading's X may show them)."""
        kids = self.top.children
        tgt = re.sub(r"《[^》]*》", "", target).replace("｜", "")
        taken = _take_suffix(kids, tgt)
        if taken is None:
            self.report.unmatched.append({"line": self.lineno, "note": _unguard(body)})
            self.report.counts["unmatched"] += 1
            return
        node.children = taken
        kids.append(node)
        self.report.counts[f"mark:{node.kind if isinstance(node, Mark) else 'ruby-' + node.side}"] += 1

    def open(self, kind: str, attrs: dict, key: str) -> None:
        self.stack.append(_Frame(kind, attrs, key))

    def close(self, key: str, body: str, reading: str | None = None) -> None:
        for k in range(len(self.stack) - 1, 0, -1):
            if self.stack[k].key == key:
                break
        else:
            self.report.unmatched.append({"line": self.lineno, "note": _unguard(body) + " (no start on the line)"})
            return
        while len(self.stack) - 1 > k:  # close what was left open inside
            inner = self.stack.pop()
            self.top.children.extend(inner.children)
        frame = self.stack.pop()
        if frame.kind == "note":
            node = Ruby(frame.children, reading or "", frame.attrs["side"])
            self.report.counts[f"mark:ruby-{node.side}"] += 1
        else:
            node = Mark(frame.kind, frame.attrs, frame.children)
            self.report.counts[f"mark:{frame.kind}"] += 1
            if frame.kind == "warichu":
                self._warichu_brackets(node)
        self.top.children.append(node)

    def _warichu_brackets(self, node: Mark) -> None:
        """Aozora writes a bracketed warichu as （［＃割り注］…［＃割り注終わり］）:
        the brackets become the note's own (`open`/`close`); the closing one
        is taken when the line goes on (see InlineParser.parse)."""
        kids = self.top.children
        if kids and isinstance(kids[-1], Text) and kids[-1].text.endswith("（"):
            t = kids[-1].text[:-1]
            if t:
                kids[-1] = Text(t)
            else:
                kids.pop()
            node.attrs["open"] = "（"
            node.attrs["close"] = "）"
            node.attrs["eatClose"] = True

    def kunten(self, kaeri: str | None = None, okuri: str | None = None) -> None:
        """返り点 and 送り仮名 belong to the character before them; a 竪点 ‐
        between it and the note (Aozora writes 敬‐［＃二］祭) joins it to the
        next character, and becomes the mark's `tate` flag."""
        self.report.counts["kunten"] += 1
        kids = self.top.children
        if kids and isinstance(kids[-1], Mark) and kids[-1].kind == "kunten":
            target = kids[-1]
        elif len(kids) >= 2 and isinstance(kids[-1], Text) and kids[-1].text == "‐" and isinstance(kids[-2], Mark) and kids[-2].kind == "kunten":
            kids.pop()
            target = kids[-1]
            target.attrs["tate"] = True
        else:
            if not kids:
                self.report.unmatched.append({"line": self.lineno, "note": f"kunten {kaeri or okuri} with no character"})
                return
            last = kids.pop()
            tate = False
            if isinstance(last, Text):
                t = last.text
                if t.endswith("‐") and len(t) > 1:
                    tate = True
                    t = t[:-1]
                if len(t) > 1:
                    kids.append(Text(t[:-1]))
                base = [Text(t[-1])]
            else:
                base = [last]
            target = Mark("kunten", {"tate": True} if tate else {}, base)
            kids.append(target)
        if kaeri:
            target.attrs["kaeri"] = kaeri
        if okuri:
            target.attrs["okuri"] = target.attrs.get("okuri", "") + okuri


_HAN = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\U00020000-\U0003ffff々〇]")


def _has_kunten(nodes: list) -> bool:
    return any(isinstance(n, Mark) and (n.kind == "kunten" or _has_kunten(n.children)) for n in nodes)


def _tateten(nodes: list) -> list:
    """On a line of kanbun (one that carries kunten), a 竪点 ‐ between two
    kanji that no note follows: the first becomes a kunten mark with the
    `tate` flag (讀‐書 → :kunten[讀]{tate}書), or takes the flag when it is
    one already."""
    out: list = []
    for k, n in enumerate(nodes):
        if isinstance(n, Mark):
            n.children = _tateten(n.children)
            out.append(n)
            continue
        if not isinstance(n, Text) or "‐" not in n.text:
            out.append(n)
            continue
        t = n.text
        # The character after the text: the next node's first.
        after = _raw_plain(nodes[k + 1 : k + 2])[:1]
        buf = ""
        i = 0
        while i < len(t):
            c = t[i]
            nxt = t[i + 1] if i + 1 < len(t) else after
            if c == "‐" and _HAN.match(nxt):
                prev_mark = not buf and out and isinstance(out[-1], Mark) and out[-1].kind == "kunten"
                if prev_mark:
                    out[-1].attrs["tate"] = True
                    i += 1
                    continue
                if buf and _HAN.match(buf[-1]):
                    if len(buf) > 1:
                        out.append(Text(buf[:-1]))
                    out.append(Mark("kunten", {"tate": True}, [Text(buf[-1])]))
                    buf = ""
                    i += 1
                    continue
            buf += c
            i += 1
        if buf:
            out.append(Text(buf))
    return out


def _eat_warichu_close(nodes: list) -> list:
    """Drop the source's closing bracket after a bracketed warichu note."""
    out = []
    eat = False
    for n in nodes:
        if eat and isinstance(n, Text) and n.text.startswith("）"):
            n = Text(n.text[1:])
            eat = False
            if not n.text:
                continue
        if isinstance(n, Mark):
            n.children = _eat_warichu_close(n.children)
            if n.kind == "warichu" and n.attrs.pop("eatClose", False):
                eat = True
        elif isinstance(n, Ruby):
            n.children = _eat_warichu_close(n.children)
        out.append(n)
    return out


# --- the block parser ---------------------------------------------------------


def parse(text: str, *, editorial_ruby: str = "keep") -> AozoraDocument:
    """The document of an Aozora text (already decoded).

    `editorial_ruby`: readings written 《〔…〕》 were added by the base
    edition's editors in modern kana; `keep` sets them as ruby (brackets
    dropped), `drop` leaves them out."""
    report = Report()
    editorial: list[dict] = []
    header, legend, body, first_line, credit_lines = split_text(text)
    title, author = header_fields(header)
    blocks: list[Block] = []

    block_indent: ParaStyle | None = None  # ここから…字下げ
    block_end: ParaStyle | None = None  # ここから地付き / 地から…字上げ
    measure = 0
    center = False
    block_styles: list[str] = []  # ここから太字 / 斜体 / …
    block_heading: tuple[str, int, list] | None = None  # ここから中見出し
    blank = 0

    def flush_blank() -> None:
        nonlocal blank
        if blank:
            blocks.append(Block("blank", count=blank))
            blank = 0

    stop = False
    for offset, raw in enumerate(body):
        if stop:
            break
        lineno = first_line + offset
        line = raw.rstrip(" \t")
        if not line.strip(" 　\t"):
            blank += 1
            continue
        line = normalise_line(line, lineno, report)
        notes, rest = _notes_at_start(line)
        line_indent = None
        line_end = None
        handled_all = True
        leftover_notes = []
        for k, note in enumerate(notes):
            m = L_INDENT.match(note)
            if m:
                line_indent = _int(m.group(1))
                continue
            m = L_END.match(note)
            if m:
                line_end = _int(m.group(1)) if m.group(1) else 0
                continue
            if note in BREAKS:
                flush_blank()
                center = False
                blocks.append(Block("break", lineno, brk=BREAKS[note]))
                report.counts[f"break:{BREAKS[note]}"] += 1
                continue
            if note == "ページの左右中央":
                center = True
                report.counts["centerPage"] += 1
                report.gap("ページの左右中央 (page centring)", lineno)
                continue
            if note == "本文終わり":
                stop = True
                break
            m = L_BLOCK_INDENT.match(note)
            if m:
                block_indent = ParaStyle(indent=_int(m.group(1)), first=0)
                block_end = None
                continue
            m = L_BLOCK_HANG.match(note)
            if m:
                a, b = _int(m.group(1)), _int(m.group(2))
                block_indent = ParaStyle(indent=min(a, b), first=max(0, a - b), hang=max(0, b - a))
                block_end = None
                continue
            m = L_BLOCK_TENTSUKI.match(note)
            if m:
                block_indent = ParaStyle(indent=0, first=0, hang=_int(m.group(1)))
                block_end = None
                continue
            if note == "ここで字下げ終わり":
                block_indent = None
                continue
            m = L_BLOCK_END.match(note)
            if m:
                block_end = ParaStyle(end=True, raise_=_int(m.group(1)) if m.group(1) else 0)
                block_indent = None
                continue
            if note in ("ここで地付き終わり", "ここで字上げ終わり"):
                block_end = None
                continue
            m = L_BLOCK_MEASURE.match(note)
            if m:
                measure = _int(m.group(1))
                report.gap("N字詰め (short measure)", lineno)
                continue
            if note == "ここで字詰め終わり":
                measure = 0
                continue
            m = L_BLOCK_STYLE.match(note)
            if m:
                name = m.group(1)
                hm = re.match(r"^(大|中|小)見出し$", name)
                if hm:
                    block_heading = (hm.group(1), lineno, [])
                else:
                    block_styles.append(name)
                continue
            m = L_BLOCK_STYLE_END.match(note)
            if m:
                name = m.group(1)
                hm = re.match(r"^(大|中|小)見出し$", name)
                if hm and block_heading:
                    level, start, parts = block_heading
                    block_heading = None
                    flush_blank()
                    nodes = []
                    for p in parts:
                        if nodes:
                            nodes.append(Text("　"))
                        nodes.extend(p)
                    blocks.append(Block("heading", start, nodes=nodes, level=level, indent=(block_indent.indent if block_indent else 0), center=center))
                    report.counts[f"heading:{level}"] += 1
                else:
                    for k2 in range(len(block_styles) - 1, -1, -1):
                        if block_styles[k2].startswith(name[:2]) or name in block_styles[k2]:
                            del block_styles[k2]
                            break
                continue
            # Not a line-level note: give it back to the inline parser.
            leftover_notes = notes[k:]
            handled_all = False
            break
        if stop:
            break
        if not handled_all:
            rest = "".join(f"［＃{n}］" for n in leftover_notes) + rest
        if not rest.strip(" 　"):
            if line_indent is not None or line_end is not None:
                report.unknown.append({"line": lineno, "note": "indent note on an empty line"})
            continue

        # Image notes stand on their own line.
        im = _NOTE_RE.fullmatch(rest.strip())
        if im and IMAGE.match(im.group(1)):
            g = IMAGE.match(im.group(1))
            flush_blank()
            blocks.append(Block("image", lineno, file=g.group(2), alt=_unguard(g.group(1)), width=int(g.group(3) or 0), height=int(g.group(4) or 0)))
            report.counts["image"] += 1
            continue

        parser = InlineParser(report, editorial, lineno, editorial_ruby)
        nodes = _eat_warichu_close(parser.parse(rest))
        if "‐" in rest and _has_kunten(nodes):
            nodes = _tateten(nodes)
        for name in reversed(block_styles):
            kind = SIMPLE.get(re.sub(r"[0-9０-９]+段階", "", name), "size")
            nodes = [Mark(kind, {"aozora": name}, nodes)]

        if block_heading is not None:
            block_heading[2].append(nodes)
            continue
        if any(isinstance(n, Mark) and n.kind == "caption" for n in nodes) and blocks and blocks[-1].kind == "image":
            cap = next(n for n in nodes if isinstance(n, Mark) and n.kind == "caption")
            blocks[-1].nodes = cap.children
            report.counts["caption"] += 1
            continue

        flush_blank()
        _emit_line(blocks, nodes, lineno, report, line_indent, line_end, block_indent, block_end, measure, center)

    flush_blank()
    credits = parse_credits(credit_lines)
    return AozoraDocument(title, author, header, legend, blocks, credits, editorial, report)


def _emit_line(blocks, nodes, lineno, report, line_indent, line_end, block_indent, block_end, measure, center) -> None:
    """One source line: headings out of it, then paragraphs (a mid-line
    地付き splits the line in two)."""
    segments: list[tuple[str, list, dict]] = []
    cur: list = []
    for n in nodes:
        if isinstance(n, Mark) and n.kind == "heading":
            if plain(cur).strip("　 "):
                segments.append(("para", cur, {}))
            cur = []
            segments.append(("heading", n.children, n.attrs))
        elif isinstance(n, AlignTail):
            if plain(cur).strip("　 "):
                segments.append(("para", cur, {}))
            cur = []
            segments.append(("tail", [], {"raise": n.raise_}))
        else:
            cur.append(n)
    if plain(cur).strip("　 ") or (segments and segments[-1][0] == "tail"):
        segments.append(("para", cur, {}))

    tail = None
    for kind, seg, attrs in segments:
        if kind == "heading":
            seg = _strip_leading_spaces(seg)[1]
            indent = (line_indent or 0) + (block_indent.indent if block_indent else 0)
            if attrs["form"] != "normal":
                report.gap(f"{attrs['form']} heading", lineno)
            blocks.append(Block("heading", lineno, nodes=seg, level=attrs["level"], form=attrs["form"], indent=indent, center=center))
            report.counts[f"heading:{attrs['level']}"] += 1
            continue
        if kind == "tail":
            tail = attrs["raise"]
            if blocks and blocks[-1].kind == "paragraph" and blocks[-1].line == lineno:
                report.gap("mid-line 地付き (set on its own line)", lineno)
            continue
        if not seg:
            continue
        k, seg = _strip_leading_spaces(seg)
        first_char = plain(seg)[:1]
        bracket = first_char in OPENING_BRACKETS
        if tail is not None:
            style = ParaStyle(end=True, raise_=tail)
            lead = "end"
        elif line_end is not None:
            style = ParaStyle(end=True, raise_=line_end)
            lead = "end"
        elif block_end is not None:
            style = ParaStyle(end=True, raise_=block_end.raise_)
            lead = "end"
        else:
            base = block_indent or ParaStyle(first=0)
            indent = base.indent + (line_indent or 0)
            if base.hang:
                style = ParaStyle(indent=indent, first=0, hang=base.hang)
                if k:
                    report.gap("leading spaces in a hanging block", lineno)
            else:
                first = base.first + k
                if block_indent is None and line_indent is None and k == 1:
                    first = 1
                elif block_indent is None and line_indent is None and k == 0 and bracket:
                    # The engine's paragraph-start bracket rule places it.
                    first = 1
                style = ParaStyle(indent=indent, first=first, hang=0)
            lead = "indent+bracket" if (k and bracket) else "bracket" if bracket else "indent" if k == 1 else "spaces" if k > 1 else "flush"
        if measure:
            style.measure = measure
        style.center = center
        report.counts[f"lead:{lead}"] += 1
        blocks.append(Block("paragraph", lineno, nodes=seg, style=style, lead=lead))
        report.counts["paragraph"] += 1


def _strip_leading_spaces(nodes: list) -> tuple[int, list]:
    """(number of leading U+3000, nodes without them)."""
    if not nodes or not isinstance(nodes[0], Text):
        return 0, nodes
    t = nodes[0].text
    s = t.lstrip("　")
    k = len(t) - len(s)
    s = s.lstrip(" ")
    return k, ([Text(s)] if s else []) + nodes[1:]


# --- Postext output -----------------------------------------------------------

WORD_JOINER = "⁠"
_ESCAPABLE = set("*_^~$`")
_TRAP_RE = re.compile(r"^([0-9]+[.)]\s|[-*+]\s|>|#{1,6}\s|:::|::|\$\$|\[\^)")
_DIRECTIVE_LIKE = re.compile(r":(?=[A-Za-z][A-Za-z0-9-]*[\[{])")
_COMPACT_LIKE = re.compile(r"\{(?=[^{}\n]*\|[^{}\n]*\})")


def escape(text: str, *, in_brackets: bool = False) -> str:
    """Text made safe for a Postext paragraph: `* _ ^ ~ $` and backticks
    escaped, a `{…|…}` that would read as a ruby and a `:name[` / `:name{`
    that would read as a directive broken with an invisible WORD JOINER,
    `[^` and `[@` (a note or citation) likewise, `]` escaped inside a
    directive's brackets."""
    text = _unguard(text)
    out = []
    for i, ch in enumerate(text):
        if ch in _ESCAPABLE:
            out.append("\\" + ch)
        elif ch == "\\" and i + 1 < len(text) and text[i + 1] in _ESCAPABLE:
            out.append("\\")
        elif in_brackets and ch in "[]":
            out.append("\\" + ch)
        else:
            out.append(ch)
    s = "".join(out)
    s = _DIRECTIVE_LIKE.sub(":" + WORD_JOINER, s)
    s = _COMPACT_LIKE.sub("{" + WORD_JOINER, s)
    s = s.replace("[^", "[" + WORD_JOINER + "^").replace("[@", "[" + WORD_JOINER + "@")
    return s


def attr(value: str) -> str:
    """A quoted attribute value: no double quote, no braces."""
    v = _unguard(value).replace('"', "”").replace("{", "（").replace("}", "）").replace("\n", " ")
    return f'"{v}"'


@dataclass
class RenderOptions:
    """`ruby`: `compact` writes {base|reading} where the engine reads it as
    one group reading, `directive` always writes :ruby[base]{rt="…" group}.
    `heading_levels`: Markdown level of 大, 中, 小見出し. `styles`: put
    paragraphs whose layout is not the body's into :::paragraphs
    containers (False: every paragraph is plain). `blank_lines`: a run of
    empty source lines between two paragraphs becomes `space`
    (:::space{lines=N}) or is dropped (`drop`); next to a heading or a
    break it is always dropped."""

    ruby: str = "compact"
    heading_levels: dict = field(default_factory=lambda: dict(HEADING_LEVELS))
    styles: bool = True
    blank_lines: str = "space"


def render_inline(nodes: list, opts: RenderOptions | None = None, *, in_brackets: bool = False, report: Report | None = None) -> str:
    """Postext inline markup for `nodes`."""
    opts = opts or RenderOptions()
    out = []
    for n in nodes:
        if isinstance(n, Text):
            out.append(escape(n.text, in_brackets=in_brackets))
        elif isinstance(n, Ruby):
            out.append(_render_ruby(n, opts, in_brackets, report))
        elif isinstance(n, Mark):
            out.append(_render_mark(n, opts, in_brackets, report))
        elif isinstance(n, LineBreak):
            if report:
                report.gap("forced break inside warichu (［＃改行］)", 0)
            out.append("　")
    return "".join(out)


def _render_ruby(n: Ruby, opts: RenderOptions, in_brackets: bool, report) -> str:
    base_text = plain(n.children)
    reading = _unguard(n.reading)
    simple = all(isinstance(c, Text) for c in n.children)
    compact_ok = (
        opts.ruby == "compact"
        and n.side == "right"
        and simple
        and _COMPACT_BASE_RE.search(base_text) is not None
        and not re.search(r"[\s{}|\\\[\]]", reading)
        and not re.search(r"[{}|\\\n]", base_text)
        and not any(c in _ESCAPABLE for c in base_text + reading)
    )
    if compact_ok:
        return "{" + base_text + "|" + reading + "}"
    inner = render_inline(n.children, opts, in_brackets=True, report=report)
    pos = " pos=under" if n.side == "left" else ""
    return f":ruby[{inner}]{{rt={attr(reading)} group{pos}}}"


def _attrs(attrs: dict) -> str:
    parts = [f"{k}={attr(str(v)) if not re.fullmatch(r'[A-Za-z0-9-]+', str(v)) else v}" for k, v in attrs.items()]
    return "{" + " ".join(parts) + "}" if parts else ""


def _render_mark(n: Mark, opts: RenderOptions, in_brackets: bool, report) -> str:
    k = n.kind
    if k in ("dots", "sideline", "tcy", "sideways", "warichu", "kunten"):
        inner = render_inline(n.children, opts, in_brackets=True, report=report)
        if not inner:
            return ""
        attrs = {kk: v for kk, v in n.attrs.items() if kk not in ("aozora", "eatClose")}
        if k == "sideline" and attrs.get("style") == "solid":
            del attrs["style"]
        if k == "kunten":
            parts = (["tate"] if n.attrs.get("tate") else []) + [f"{kk}={attr(n.attrs[kk])}" for kk in ("kaeri", "okuri") if kk in n.attrs]
            return f":kunten[{inner}]" + "{" + " ".join(parts) + "}"
        if k == "warichu" and "open" in attrs:
            return f":warichu[{inner}]{{open={attr(attrs['open'])} close={attr(attrs['close'])}}}"
        return f":{k}[{inner}]" + _attrs(attrs)
    inner = render_inline(n.children, opts, in_brackets=in_brackets, report=report)
    if not inner.strip():
        return inner
    if k == "bold":
        return f"**{inner}**"
    if k == "italic":
        # In a Japanese document `*…*` is emphasis (dots), not a slant.
        if report:
            report.gap("斜体 (italic) written as *…*", 0)
        return f"*{inner}*"
    if k in ("sup", "sub"):
        mark = "^" if k == "sup" else "~"
        if inner != inner.strip() or mark in inner:
            return inner
        return f"{mark}{inner}{mark}"
    if report:
        report.gap(f"{k} ({n.attrs.get('aozora', n.attrs.get('step', ''))}) printed as plain text", 0)
    return inner


def render_heading(b: Block, opts: RenderOptions | None = None, extra: dict | None = None, report: Report | None = None) -> str:
    opts = opts or RenderOptions()
    level = opts.heading_levels.get(b.level, 2)
    text = render_inline(b.nodes, opts, report=report).replace("\n", " ").strip()
    attrs = {}
    if b.indent:
        attrs["indent"] = str(b.indent)
    if b.form != "normal":
        attrs["kind"] = b.form
    if b.center:
        attrs["center"] = "page"
    attrs.update(extra or {})
    blob = " {" + " ".join(f"{k}={attr(v)}" for k, v in attrs.items()) + "}" if attrs else ""
    # A title ending in braces would be read as attributes, unless they hold
    # a compact ruby (the attribute grammar does not read `{曙|あけぼの}`).
    if not blob and text.endswith("}") and not re.search(r"\{[^{}|]+\|[^{}]+\}$", text):
        text += WORD_JOINER
    return "#" * level + " " + text + blob


def render_paragraph(b: Block, opts: RenderOptions | None = None, report: Report | None = None) -> str:
    text = render_inline(b.nodes, opts, report=report)
    if _TRAP_RE.match(text):
        text = WORD_JOINER + text
    return text


BREAK_MARKDOWN = {"page": ":::pagebreak", "recto": ':::pagebreak{parity="odd"}', "spread": ':::pagebreak{parity="even"}', "column": ":::columnbreak"}


def render_blocks(blocks: list[Block], opts: RenderOptions | None = None, report: Report | None = None) -> tuple[str, list[str]]:
    """Postext Markdown for `blocks`, and the ids of the paragraph styles it
    uses. Recto is the odd page (`parity="odd"`) and a spread opens on its
    even page, which is how Postext numbers pages in either binding."""
    opts = opts or RenderOptions()
    out: list[str] = []
    styles: list[str] = []
    group: str | None = None
    pending_blank = 0
    prev_kind = ""

    def close_group() -> None:
        nonlocal group
        if group is not None:
            out.append(":::")
            group = None

    for b in blocks:
        if b.kind == "blank":
            pending_blank += b.count
            continue
        if b.kind == "paragraph":
            sid = None if (b.style is None or b.style.is_default() or not opts.styles) else b.style.style_id()
            if sid != group:
                close_group()
            if pending_blank and prev_kind == "paragraph" and opts.blank_lines == "space":
                out.append(f":::space{{lines={min(pending_blank, 20)}}}")
            if sid != group:
                out.append(f':::paragraphs{{style="{sid}"}}')
                group = sid
                if sid not in styles:
                    styles.append(sid)
            out.append(render_paragraph(b, opts, report))
        else:
            close_group()
            if b.kind == "heading":
                out.append(render_heading(b, opts, report=report))
            elif b.kind == "break":
                out.append(BREAK_MARKDOWN[b.brk])
            elif b.kind == "image":
                out.append(f'::resource{{id="{image_id(b.file)}"}}')
        pending_blank = 0
        prev_kind = b.kind
    close_group()
    return "\n\n".join(out) + "\n", styles


def image_id(file: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]+", "-", Path(file).stem).strip("-").lower() or "figure"


def style_config(sid: str, *, name_prefix: str = "") -> tuple[dict, list[str]]:
    """A ParagraphStyle config (packages/postext/src/types.ts
    ParagraphStyleConfig) for an `aozora-…` style id, and what it cannot
    express yet. Ems are body ems."""
    parts = sid.removeprefix("aozora-").split("-")
    cfg: dict = {"id": sid, "name": name_prefix + _style_name(parts)}
    gaps = []

    def em(v: int) -> dict:
        return {"value": v, "unit": "em"}

    for p in parts:
        if p.startswith("i"):
            cfg["indent"] = em(int(p[1:]))
        elif p.startswith("f"):
            cfg["firstLineIndent"] = em(int(p[1:]))
        elif p.startswith("h"):
            cfg["hangingIndent"] = em(int(p[1:]))
        elif p.startswith("end"):
            # 地付き / 地からN字上げ: flush with the line end, raised N body
            # ems from it (ParagraphStyle.endIndent, postext >= 1.16).
            cfg["textAlign"] = "end"
            cfg["firstLineIndent"] = em(0)
            if p[3:]:
                cfg["endIndent"] = em(int(p[3:]))
        elif p.startswith("w"):
            gaps.append(f"{sid}: short measure of {p[1:]} characters (字詰め) — no measure in ParagraphStyle")
        elif p == "center":
            gaps.append(f"{sid}: centred on the page across the lines (ページの左右中央)")
    return cfg, gaps


def _style_name(parts: list[str]) -> str:
    words = []
    for p in parts:
        if p.startswith("i"):
            words.append(f"{p[1:]}字下げ")
        elif p.startswith("f"):
            words.append("天付き" if p == "f0" else f"字下げ{p[1:]}")
        elif p.startswith("h"):
            words.append(f"折り返して{p[1:]}字下げ")
        elif p.startswith("end"):
            words.append(f"地から{p[3:]}字上げ" if p[3:] else "地付き")
        elif p.startswith("w"):
            words.append(f"{p[1:]}字詰め")
        elif p == "center":
            words.append("左右中央")
    return "Aozora " + "・".join(words)


@dataclass
class Result:
    markdown: str
    doc: AozoraDocument
    styles: list[dict]
    style_gaps: list[str]

    @property
    def report(self) -> dict:
        d = self.doc.report.to_dict()
        d["styleGaps"] = self.style_gaps
        d["editorial"] = self.doc.editorial
        return d


def convert(src: str | Path | bytes, *, editorial_ruby: str = "keep", opts: RenderOptions | None = None) -> Result:
    """Read, parse and render an Aozora text (see the module docstring)."""
    doc = parse(read_source(src), editorial_ruby=editorial_ruby)
    md, ids = render_blocks(doc.blocks, opts, doc.report)
    styles, gaps = [], []
    for sid in ids:
        cfg, g = style_config(sid)
        styles.append(cfg)
        gaps.extend(g)
    return Result(md, doc, styles, gaps)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source", help="an Aozora .zip or .txt (CP932 or UTF-8)")
    ap.add_argument("-o", "--out", help="Markdown file (default: stdout)")
    ap.add_argument("--report", help="write the conversion report (JSON)")
    ap.add_argument("--styles", help="write the paragraph styles the text uses (JSON list for paragraphStyles)")
    ap.add_argument("--credits", help="write the header and the bibliographic block (JSON)")
    ap.add_argument("--ruby", choices=["compact", "directive"], default="compact")
    ap.add_argument("--editorial-ruby", choices=["keep", "drop"], default="keep")
    ap.add_argument("--heading-levels", default="1,2,3", help="Markdown levels of 大,中,小見出し (default 1,2,3)")
    ap.add_argument("--no-styles", action="store_true", help="plain paragraphs, no :::paragraphs containers")
    ap.add_argument("--blank-lines", choices=["space", "drop"], default="space")
    a = ap.parse_args(argv)
    levels = [int(x) for x in a.heading_levels.split(",")]
    opts = RenderOptions(ruby=a.ruby, heading_levels=dict(zip("大中小", levels)), styles=not a.no_styles, blank_lines=a.blank_lines)
    res = convert(a.source, editorial_ruby=a.editorial_ruby, opts=opts)
    if a.out:
        Path(a.out).write_text(res.markdown, encoding="utf-8")
    else:
        sys.stdout.write(res.markdown)
    if a.report:
        Path(a.report).write_text(json.dumps(res.report, ensure_ascii=False, indent=1), encoding="utf-8")
    if a.styles:
        Path(a.styles).write_text(json.dumps(res.styles, ensure_ascii=False, indent=1), encoding="utf-8")
    if a.credits:
        meta = {"title": res.doc.title, "author": res.doc.author, "header": res.doc.header, **res.doc.credits}
        Path(a.credits).write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    r = res.doc.report
    print(
        f"{res.doc.title} / {res.doc.author}: {r.counts['paragraph']} paragraphs, {r.counts['ruby']} readings, "
        f"{sum(v for k, v in r.counts.items() if k.startswith('heading:'))} headings, {r.counts['gaiji']} gaiji "
        f"({r.counts['gaijiUnresolved']} unresolved), {len(r.unknown)} unknown notes, {len(r.unmatched)} unmatched",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
