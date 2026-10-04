#!/usr/bin/env python3
"""Write `source/text.json` (text.py) as Postext chapter markdown.

build.py imports `chapters()` and `chapter_markdown()`; run on its own the
module writes a draft for inspection:

    python3 scripts/presets/showcase/alf-layla/markup.py [--out DIR]
        [--night-title hindawi|ordinal] [--night-level 6] [--max-words N] [--no-parts]

Chapters are tale cycles (tales.json `chapter`), with the long romance of
King ʿUmar al-Nuʿman cut at Hindawi's own headings and runs of short
anecdotes gathered under a heading of ours («… وحكايات أخرى»). A volume of
the Hindawi edition opens with a `:::part`; where a tale runs on across the
volume break, the new volume opens a continuation chapter headed by that
tale's title with `continued="true"`. `--max-words` also cuts a chapter
longer than N words at the next night heading (off by default).

Inside a chapter:

- the chapter's tale is `#`; a tale told inside it is `##`, `###`, `####` by
  depth (so the outline nests tale in tale);
- a night is a heading at `--night-level` (6 by default: below every tale,
  so the outline reads tale › night) with `{style="night" n=N}`. Its text is
  Hindawi's «فلما كانت الليلة ١٢», or with `--night-title ordinal` the words
  «الليلة الثانية عشرة» (`ordinal_ar`), the Hindawi text then kept in the
  `hindawi` attribute. A night design that prints `{attr.n}` in words can
  hide the text entirely;
- prose is one paragraph per line; Qurʾān quotations are wrapped in the
  ornate parentheses (U+FD3F … U+FD3E in logical order: the pair a
  right-to-left line shows as ﴿…﴾) when Hindawi has not bracketed them;
- verse is a `:::verse` block, one bayt per line with its two hemistichs
  separated by ` || `; a hemistich Hindawi sets alone (centred) is a line
  without the separator.

Escaping: the inline markers Postext reads (`* _ ^ ~ ` $`) are escaped with
a backslash; the only one in the text is the asterisk Hindawi puts between
two āyāt. No paragraph opens with a block marker (`#`, `>`, `- `, `1. `,
`:::`); `check_markdown` asserts it.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "source")
DRAFT = os.path.join(HERE, "work", "draft")

AR_DIGITS = str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")
QURAN_OPEN, QURAN_CLOSE = "﴿", "﴾"
HEMISTICH_SEPARATOR = " || "


# --- Arabic ordinals ------------------------------------------------------------------------
# arabic-typography.md §7.4: nominative, definite; feminine for ليلة, masculine
# for جزء. «مائة» in the classical spelling the Bulaq prints use.

_UNITS = {
    "m": ["", "الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر"],
    "f": ["", "الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة", "السابعة", "الثامنة", "التاسعة", "العاشرة"],
}
_COMPOUND_ONE = {"m": "الحادي", "f": "الحادية"}
_TENS = {20: "العشرون", 30: "الثلاثون", 40: "الأربعون", 50: "الخمسون", 60: "الستون", 70: "السبعون", 80: "الثمانون", 90: "التسعون"}
_HUNDREDS = {
    "classical": {100: "المائة", 200: "المائتين", 300: "الثلاثمائة", 400: "الأربعمائة", 500: "الخمسمائة", 600: "الستمائة", 700: "السبعمائة", 800: "الثمانمائة", 900: "التسعمائة"},
    "modern": {100: "المئة", 200: "المئتين", 300: "الثلاثمئة", 400: "الأربعمئة", 500: "الخمسمئة", 600: "الستمئة", 700: "السبعمئة", 800: "الثمانمئة", 900: "التسعمئة"},
}


def _below_100(r: int, g: str) -> str:
    if r <= 10:
        return _UNITS[g][r]
    unit = _COMPOUND_ONE[g] if r % 10 == 1 else _UNITS[g][r % 10]
    if r < 20:
        return unit + " " + ("عشر" if g == "m" else "عشرة")
    if r % 10 == 0:
        return _TENS[r]
    return unit + " و" + _TENS[r - r % 10]


def ordinal_ar(n: int, feminine: bool = True, spelling: str = "classical", one_after: str = "hadi") -> str:
    """1 → الأولى, 12 → الثانية عشرة, 145 → الخامسة والأربعون بعد المائة,
    1001 → الحادية بعد الألف (feminine); masculine for الجزء الأول. After a
    hundred or a thousand, one is الحادية / الحادي; `one_after="ula"` gives
    the variant الأولى بعد المائة."""
    if not 1 <= n <= 1999:
        raise ValueError(n)
    g = "f" if feminine else "m"
    if n < 100:
        return _below_100(n, g)
    if n == 1000:
        return "الألف"
    hundreds = _HUNDREDS[spelling]
    if n < 1000 and n % 100 == 0:
        # The exact hundreds: nominative المائتان for 200.
        return "المائتان" if n == 200 and spelling == "classical" else ("المئتان" if n == 200 else hundreds[n])
    base = 1000 if n > 1000 else n // 100 * 100
    base_word = "الألف" if base == 1000 else hundreds[base]
    rest = n - base
    rest_word = _COMPOUND_ONE[g] if rest == 1 and one_after == "hadi" else _below_100(rest, g)
    return rest_word + " بعد " + base_word


def arabic_digits(n: int) -> str:
    return str(n).translate(AR_DIGITS)


# --- text --------------------------------------------------------------------------------------

_INLINE = re.compile(r"([*_^~`$\\])")


def escape(s: str) -> str:
    return _INLINE.sub(r"\\\1", s)


def quran(q: str) -> str:
    q = q.strip()
    if q[:1] in (QURAN_OPEN, QURAN_CLOSE, "("):
        return escape(q)
    return QURAN_OPEN + escape(q) + QURAN_CLOSE


def paragraph(runs: list) -> str:
    out = []
    for r in runs:
        if isinstance(r, str):
            out.append(escape(r))
        elif "quran" in r:
            out.append(quran(r["quran"]))
        elif "note" in r:
            out.append(f"[^{r['note']}]")
    return "".join(out).strip()


def attr(s: str) -> str:
    """A double-quoted attribute value (no `"` or braces allowed in values)."""
    return '"' + s.replace('"', "”").replace("{", "(").replace("}", ")") + '"'


def words(s: str) -> int:
    return len(re.findall(r"[؀-ۿ]+", re.sub(r"[ً-ٰٟـ]", "", s)))


# --- chapters --------------------------------------------------------------------------------


def _new(kind: str, **kw) -> dict:
    return {"kind": kind, "blocks": [], **kw}


def chapters(data: dict, max_words: int | None = None) -> list[dict]:
    """Group the blocks into chapters. Each chapter: `slug`, `title`, `tale`
    (the id of its first tale), `cycle`, `volume`, `part` (the volume it
    opens, if any), `continued`, `blocks`."""
    tales = {t["id"]: t for t in data["tales"]}
    blocks = _move_joined_volumes(data["blocks"])
    out: list[dict] = []
    cur: dict | None = None
    open_chapter_tale: dict | None = None
    pending_part: int | None = None

    def start(**kw) -> dict:
        nonlocal cur
        cur = _new("chapter", **kw)
        out.append(cur)
        return cur

    for b in blocks:
        t = b["type"]
        if t == "volume":
            pending_part = b["n"]
            cur = None  # the next block opens a chapter
            continue
        if t == "basmala":
            start(slug=f"basmala-v{b['v']}", title=b["text"], tale=None, cycle=None, volume=b["v"], part=pending_part, continued=False, front=True)
            pending_part = None
            cur["blocks"].append(b)
            continue
        if t == "tale" and b.get("chapter") and not b.get("repeat"):
            # Night headings (and nothing else) just before the tale go with it.
            carried = []
            if cur is not None:
                while cur["blocks"] and cur["blocks"][-1]["type"] == "night":
                    carried.insert(0, cur["blocks"].pop())
                if not cur["blocks"]:
                    # A continuation chapter that held only those night headings.
                    out.remove(cur)
                    if cur.get("part"):
                        pending_part = cur["part"]
            start(slug=b["id"], title=b["title"], tale=b["id"], cycle=b.get("cycle"), volume=b["v"], part=pending_part, continued=False)
            pending_part = None
            # The chapter heading comes first, the night heading after it.
            cur["blocks"].append(b)
            cur["blocks"] += carried
            open_chapter_tale = b
            continue
        elif cur is None:
            # A volume opening inside a tale: a continuation chapter.
            ot = open_chapter_tale or {"id": "tale", "title": "", "cycle": None}
            start(slug=ot["id"] + f"-v{b['v']}", title=ot["title"], tale=ot["id"], cycle=ot.get("cycle"), volume=b["v"], part=pending_part, continued=True)
            pending_part = None
            if t == "tale" and b.get("repeat"):
                continue  # Hindawi's repeated heading: the chapter heading stands for it
        if t == "tale" and b.get("repeat"):
            continue
        cur["blocks"].append(b)

    if max_words:
        out = _cut_long(out, max_words)
    for i, ch in enumerate(out):
        ch["index"] = i
        ch["file"] = f"{i:03d}-{ch['slug']}.md"
        ch["words"] = sum(_block_words(b) for b in ch["blocks"])
        ns = [b["night"] for b in ch["blocks"] if b["type"] in ("p", "verse", "night")]
        ch["nights"] = [min(ns), max(ns)] if ns else None
        ch["tales"] = [b["id"] for b in ch["blocks"] if b["type"] == "tale"]
        ch["cycleTitle"] = tales.get(ch.get("cycle") or "", {}).get("title")
    return out


def _move_joined_volumes(blocks: list[dict]) -> list[dict]:
    """A tale flagged `joinNextVolume` (Sindbad, whose first 225 words close
    Hindawi's volume 3) moves into the next volume: that volume's opening
    (its block, and the basmala and preface Hindawi's volume 4 has) is moved
    up to just before the tale's heading and the night headings before it."""
    blocks = list(blocks)
    for tid in [b["id"] for b in blocks if b["type"] == "tale" and b.get("joinNextVolume")]:
        i = next(k for k, b in enumerate(blocks) if b["type"] == "tale" and b.get("id") == tid)
        j = next((k for k in range(i + 1, len(blocks)) if blocks[k]["type"] == "volume"), None)
        if j is None:
            continue
        k = j + 1
        if k < len(blocks) and blocks[k]["type"] == "basmala":
            k += 1
            while k < len(blocks) and blocks[k]["type"] == "p":
                k += 1
        opening = blocks[j:k]
        del blocks[j:k]
        at = i
        while at > 0 and blocks[at - 1]["type"] == "night":
            at -= 1
        vol = opening[0]["n"]
        blocks[at:at] = opening
        for m in range(at + len(opening), j + len(opening)):
            blocks[m] = {**blocks[m], "v": vol}
    return blocks


def _block_words(b: dict) -> int:
    if b["type"] == "p":
        return words("".join(r if isinstance(r, str) else r.get("quran", "") for r in b["runs"]))
    if b["type"] == "verse":
        return sum(words(" ".join(h)) for h in b["bayts"])
    return 0


def _cut_long(chs: list[dict], max_words: int) -> list[dict]:
    out = []
    for ch in chs:
        total = sum(_block_words(b) for b in ch["blocks"])
        if total <= max_words * 1.25:
            out.append(ch)
            continue
        parts = max(2, round(total / max_words))
        target = total / parts
        piece = {**ch, "blocks": []}
        acc, n = 0, 1
        for b in ch["blocks"]:
            if b["type"] == "night" and acc >= target and n < parts:
                out.append(piece)
                n += 1
                piece = {**ch, "blocks": [], "slug": f"{ch['slug']}-{n}", "part": None, "continued": True}
                acc = 0
            piece["blocks"].append(b)
            acc += _block_words(b)
        out.append(piece)
    return out


# --- markdown ----------------------------------------------------------------------------------


def night_heading(b: dict, level: int, mode: str) -> str:
    attrs = f'style="night" n={b["n"]}'
    if mode == "ordinal":
        text = "الليلة " + ordinal_ar(b["n"])
        attrs += f" hindawi={attr(b['heading'])}"
    else:
        text = b["heading"]
    return "#" * level + f" {text} {{{attrs}}}"


def chapter_markdown(ch: dict, *, night_level: int = 6, night_title: str = "hindawi", parts: bool = True) -> str:
    """`night_level` 0: a night is a heading one level below the tale it
    falls in (so the outline never skips a level)."""
    lines: list[str] = []
    auto_nights = night_level == 0
    tale_cap = 5 if auto_nights else night_level - 1
    current = 1
    if parts and ch.get("part"):
        n = ch["part"]
        lines += [f':::part{{number={attr(arabic_digits(n))} title={attr("الجزء " + ordinal_ar(n, feminine=False))}}}', ":::", ""]
    first_level = None
    head_attrs = []
    if ch.get("front"):
        lines += [f'# {ch["title"]} {{style="basmala" toc="false"}}', ""]
    elif ch["continued"]:
        head_attrs = ['continued="true"']
        if ch.get("cycleTitle") and ch["cycleTitle"] != ch["title"]:
            head_attrs.append(f"cycle={attr(ch['cycleTitle'])}")
        lines += [f'# {ch["title"]} {{{" ".join(head_attrs)} toc="false"}}', ""]
    for b in ch["blocks"]:
        t = b["type"]
        if t == "basmala":
            continue
        if t == "night":
            lines += [night_heading(b, min(6, current + 1) if auto_nights else night_level, night_title), ""]
        elif t == "tale":
            if first_level is None:
                first_level = b["level"]
                level = 1
            else:
                level = 1 if ch["continued"] and b["level"] <= first_level else max(2, min(tale_cap, b["level"] - first_level + 1))
            a = [f"tale={attr(b['id'])}"]
            if level == 1:
                if ch.get("cycleTitle") and ch["cycleTitle"] != b["title"]:
                    a.append(f"cycle={attr(ch['cycleTitle'])}")
                if b.get("group"):
                    a.append('group="true"')
            current = level
            lines += ["#" * level + f" {b['title']} {{{' '.join(a)}}}", ""]
        elif t == "p":
            lines += [paragraph(b["runs"]), ""]
        elif t == "verse":
            lines.append(":::verse")
            for h in b["bayts"]:
                lines.append(HEMISTICH_SEPARATOR.join(escape(x) for x in h if x))
            lines += [":::", ""]
        elif t == "heading":
            lines += [f"## {b['text']}", ""]
        elif t == "resource":
            # A plate build.py places after a paragraph (`::resource`).
            lines += [f'::resource{{id="{b["id"]}"}}', ""]
    md = "\n".join(lines).rstrip() + "\n"
    check_markdown(md, ch["file"] if "file" in ch else ch["slug"])
    return md


_BLOCK_START = re.compile(r"^(#{1,6} |> |[-+*] |\d+[.)] |:::|\[\^[^\]]+\]:|\$\$)")


def check_markdown(md: str, where: str) -> None:
    """Every paragraph line must read as a paragraph: no line that is not one
    of ours may open with a block marker."""
    in_verse = False
    for line in md.split("\n"):
        if line == ":::verse":
            in_verse = True
            continue
        if line == ":::":
            in_verse = False
            continue
        if in_verse or not line or line.startswith("#") or line.startswith(":::part"):
            continue
        if _BLOCK_START.match(line):
            raise SystemExit(f"{where}: a paragraph reads as a block marker: {line[:60]}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=DRAFT)
    ap.add_argument("--night-title", choices=["hindawi", "ordinal"], default="hindawi")
    ap.add_argument("--night-level", type=int, default=6, help="0: one below the tale it falls in")
    ap.add_argument("--max-words", type=int, default=None)
    ap.add_argument("--no-parts", action="store_true")
    args = ap.parse_args()
    data = json.load(open(os.path.join(SOURCE, "text.json"), encoding="utf-8"))
    chs = chapters(data, max_words=args.max_words)
    out_dir = os.path.join(args.out, "ar")
    os.makedirs(out_dir, exist_ok=True)
    for f in os.listdir(out_dir):
        if f.endswith(".md"):
            os.remove(os.path.join(out_dir, f))
    index = []
    for ch in chs:
        md = chapter_markdown(ch, night_level=args.night_level, night_title=args.night_title, parts=not args.no_parts)
        with open(os.path.join(out_dir, ch["file"]), "w", encoding="utf-8") as f:
            f.write(md)
        index.append({k: ch.get(k) for k in ("file", "title", "tale", "cycle", "volume", "part", "continued", "nights", "words", "tales")})
    with open(os.path.join(args.out, "chapters.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=1)
    sizes = sorted(c["words"] for c in index)
    print(f"{len(index)} chapters in {out_dir}; words per chapter: min {sizes[0]}, median {sizes[len(sizes) // 2]}, max {sizes[-1]}")


if __name__ == "__main__":
    sys.exit(main())
