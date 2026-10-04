#!/usr/bin/env python3
"""Turn the six Hindawi EPUBs (see fetch.py) into `source/text.json`, the
intermediate that markup.py writes as Postext chapters.

The EPUBs are clean XHTML, one file per night:

- `<h1 class="title center">فلما كانت الليلة ١٢</h1>` opens a night (Arabic-Indic
  digits; the first file of volume 1 is the frame story, before night 1);
- `<h4 class="title">حكاية …</h4>` opens a tale, `<div class="subtitle">` a
  tale inside it (rare), the basmala of volume 1 is an `<h4>` too;
- prose is `<p>`; verse is `<div class="poetry_container line">`, one
  `<div><div>ṣadr</div><div>ʿajuz</div></div>` per bayt, fully vocalised,
  a `<div class="center">` for a hemistich set alone;
- Qurʾān quotations are `<span class="quran">`; ﷺ is U+FDFA in a span set in
  Hindawi's "yakout" face;
- the colour figures (`<div class="paragraph-block"><div class="mediaobject">`)
  are modern, unattributed and left out, captions included.

Hindawi's headings are coarse: a tale told inside another tale (the three
old men inside the Merchant and the Jinni, King Yunan inside the Fisherman)
has no heading of its own, and every `<h4>` sits at one level. `tales.json`
(committed next to this script) supplies the hierarchy: which headings open
a chapter (a tale cycle), which are nested and under which, the embedded
tales Hindawi leaves unheaded (found by a phrase of their first paragraph),
and a Latin slug for file names.

Normalisation: NFC; bidi controls (LRM, RLM, embeddings), BOM and ZWNJ
dropped (no Arabic word here needs ZWNJ; Hindawi's come from copy and
paste); no-break spaces and runs of white space made one space; no space
before a punctuation mark; Latin `?` `;` `,` between Arabic words made `؟`
`؛` `،`. Tashkīl, tatweel and ﷺ are kept as given.

Every night 1–1001 is checked to be present exactly once, in order, and to
end with Shahrazad falling silent at dawn («وأدرك شهرزاد الصباح فسكتت عن
الكلام المباح»); the report goes to `source/text-report.json` and stdout.

    python3 scripts/presets/showcase/alf-layla/text.py
"""
from __future__ import annotations

import collections
import json
import os
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "source")
OUT = os.path.join(SOURCE, "text.json")
REPORT = os.path.join(SOURCE, "text-report.json")
TALES = os.path.join(HERE, "tales.json")

sys.path.insert(0, HERE)
from fetch import HINDAWI  # noqa: E402

XHTML = "{http://www.w3.org/1999/xhtml}"
OPF = "{http://www.idpf.org/2007/opf}"

# Marks that may sit between the letters of a phrase we search for.
HARAKAT = "ً-ٰٟـ"
AR_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
DROP = dict.fromkeys(map(ord, "‌‎‏‪‫‬‭‮⁦⁧⁨⁩﻿"))
ARABIC_LETTER = "؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿"

QA: dict[str, list] = collections.defaultdict(list)
COUNT: collections.Counter = collections.Counter()


def fuzzy(phrase: str) -> re.Pattern:
    """A pattern matching `phrase` whatever tashkīl or tatweel the text
    carries, and with any run of spaces where the phrase has one."""
    out = []
    for ch in phrase:
        if ch == " ":
            out.append(r"\s+")
        else:
            out.append(re.escape(ch) + f"[{HARAKAT}]*")
    return re.compile("".join(out))


def bare(s: str) -> str:
    """The text without tashkīl and tatweel (for matching and counting)."""
    return re.sub(f"[{HARAKAT}]", "", s)


# Hindawi prints «فقال كانت الليلة ١٣٦» once (volume 2); the heading is read
# all the same and written back in its usual form.
NIGHT_HEADING = re.compile(r"^(فلما|فقال)\s+كانت\s+الليلة\s+([0-9٠-٩]+)\s*$")
# «شهرزاد» is also spelt «شهر زاد» (volume 6) and once «شهرزد» (night 712).
SHAHRAZAD = f"شهر[{HARAKAT}]*\\s?ز[{HARAKAT}]*ا?[{HARAKAT}]*د[{HARAKAT}]*"
DAWN = re.compile(fuzzy("وأدرك").pattern + r"\s+" + SHAHRAZAD + r"\s+" + fuzzy("الصباح").pattern)
DAWN_FULL = re.compile(DAWN.pattern + r"[\s،,]+" + fuzzy("فسكتت عن الكلام المباح").pattern)
OPENING = fuzzy("بلغني أيها الملك السعيد")
BASMALA = "بسم الله الرحمن الرحيم"


# --- normalisation ---------------------------------------------------------------------


def norm(s: str) -> str:
    n0 = len(s)
    s = unicodedata.normalize("NFC", s)
    dropped = s.translate(DROP)
    COUNT["controls dropped"] += len(s) - len(dropped)
    s = dropped.replace(" ", " ").replace(" ", " ")
    s = re.sub(r"\s+", " ", s)
    # Latin question mark, semicolon and comma after an Arabic letter.
    for latin, arabic in (("?", "؟"), (";", "؛"), (",", "،")):
        s, k = re.subn(f"(?<=[{ARABIC_LETTER}])\\s*\\{latin}" if latin == "?" else f"(?<=[{ARABIC_LETTER}])\\s*{latin}", arabic, s)
        COUNT[f"'{latin}' → '{arabic}'"] += k
    # No space before a closing punctuation mark.
    s, k = re.subn(r" +([،؛؟.:!»)\]])", r"\1", s)
    COUNT["space before punctuation removed"] += k
    s, k = re.subn(r"([«(\[]) +", r"\1", s)
    COUNT["space after opening bracket removed"] += k
    del n0
    return s


def text_of(el: ET.Element) -> str:
    return "".join(el.itertext())


# --- EPUB reading ----------------------------------------------------------------------


def spine(z: zipfile.ZipFile) -> list[str]:
    opf_path = next(n for n in z.namelist() if n.endswith(".opf"))
    opf = ET.fromstring(z.read(opf_path))
    base = os.path.dirname(opf_path)
    items = {i.get("id"): i.get("href") for i in opf.iter(OPF + "item")}
    return [os.path.normpath(os.path.join(base, items[r.get("idref")])) for r in opf.iter(OPF + "itemref")]


def runs_of(p: ET.Element, where: str) -> list:
    """Inline content of a paragraph as runs: plain strings, and
    `{"quran": text}` for a Qurʾān quotation, `{"note": id}` for a note call."""
    runs: list = []

    def add(s: str) -> None:
        if not s:
            return
        if runs and isinstance(runs[-1], str):
            runs[-1] += s
        else:
            runs.append(s)

    def walk(el: ET.Element) -> None:
        add(el.text or "")
        for ch in el:
            tag = ch.tag.replace(XHTML, "")
            cls = ch.get("class") or ""
            if tag == "span" and "quran" in cls:
                runs.append({"quran": norm(text_of(ch)).strip()})
                COUNT["quran quotations"] += 1
            elif tag == "br":
                add(" ")
            elif tag == "a" and (ch.get("{http://www.idpf.org/2007/ops}type") == "noteref" or "footnote" in cls or (ch.get("href") or "").startswith("#")):
                runs.append({"note": (ch.get("href") or "").lstrip("#") or text_of(ch)})
                COUNT["note calls"] += 1
            elif tag in ("span", "b", "strong", "i", "em", "bdo", "sup", "a"):
                if tag not in ("span", "bdo"):
                    QA["inline tags kept as text"].append(f"{where}: <{tag}> {text_of(ch)[:40]}")
                walk(ch)
            else:
                QA["unknown inline"].append(f"{where}: <{tag} class={cls}>")
                walk(ch)
            add(ch.tail or "")

    walk(p)
    # Normalise string runs; trim the edges of the paragraph.
    out = []
    for r in runs:
        if isinstance(r, str):
            r = norm(r)
            if r:
                out.append(r)
        else:
            out.append(r)
    if out and isinstance(out[0], str):
        out[0] = out[0].lstrip()
    if out and isinstance(out[-1], str):
        out[-1] = out[-1].rstrip()
    # A quotation glued to the following punctuation keeps it glued: drop the
    # space norm() may have left at the start of the next run before «،».
    for i in range(1, len(out)):
        if isinstance(out[i], str) and not isinstance(out[i - 1], str):
            out[i] = re.sub(r"^ +(?=[،؛؟.:!])", "", out[i])
    return [r for r in out if r != ""]


def plain(runs: list) -> str:
    return "".join(r if isinstance(r, str) else r.get("quran", "") for r in runs)


def verse_of(div: ET.Element, where: str) -> list[list[str]]:
    bayts = []
    for row in div:
        cls = row.get("class") or ""
        cells = [c for c in row if c.tag == XHTML + "div"]
        if "center" in cls or not cells:
            bayts.append([norm(text_of(row)).strip()])
            COUNT["single hemistichs (centred)"] += 1
            continue
        hem = [norm(text_of(c)).strip() for c in cells]
        if len(hem) != 2:
            QA["bayts with != 2 hemistichs"].append(f"{where}: {len(hem)}: {' | '.join(hem)[:80]}")
        bayts.append(hem)
    return bayts


def parse_volume(vol: int, path: str) -> tuple[list[dict], dict]:
    """The blocks of one volume in reading order, and facts about it."""
    blocks: list[dict] = []
    info = {"files": 0, "figures": 0, "title": None}
    with zipfile.ZipFile(path) as z:
        for name in spine(z):
            base = os.path.basename(name)
            if not (base.startswith("chapter-") or base.startswith("preface-") or base.startswith("appendix-") or base.startswith("postface-")):
                if base not in ("cover.xhtml", "fp1.xhtml", "fp2.xhtml", "copyright.xhtml"):
                    QA["spine items skipped"].append(f"v{vol} {base}")
                continue
            info["files"] += 1
            root = ET.fromstring(z.read(name))
            if info["title"] is None:
                t = root.find(f"{XHTML}head/{XHTML}title")
                info["title"] = norm(t.text or "").strip() if t is not None else None
            body = root.find(XHTML + "body")
            walk_block(body, vol, base, blocks, info)
    return blocks, info


def walk_block(el: ET.Element, vol: int, where: str, blocks: list[dict], info: dict) -> None:
    for ch in el:
        tag = ch.tag.replace(XHTML, "")
        cls = (ch.get("class") or "").split()
        loc = f"v{vol}/{where}"
        if tag == "h1":
            t = norm(text_of(ch)).strip()
            m = NIGHT_HEADING.match(t)
            if m:
                n = int(m.group(2).translate(AR_DIGITS))
                if m.group(1) != "فلما":
                    QA["night headings corrected"].append(f"{loc}: {t}")
                    t = "فلما" + t[len(m.group(1)):]
                blocks.append({"type": "night", "n": n, "heading": t, "src": loc})
            elif t == info["title"] or t.startswith("ألف ليلة وليلة"):
                pass  # the book title repeated at the top of the front file
            elif bare(t) == "الخاتمة":
                # The conclusion after night 1001: a tale-level heading.
                blocks.append({"type": "tale", "title": t, "src": loc, "tag": "h1"})
            else:
                blocks.append({"type": "heading", "level": 1, "text": t, "src": loc})
                QA["h1 that is not a night"].append(f"{loc}: {t}")
        elif tag in ("h2", "h3", "h4", "h5"):
            t = norm(text_of(ch)).strip()
            if bare(t) == BASMALA:
                blocks.append({"type": "basmala", "text": t, "src": loc})
            else:
                blocks.append({"type": "tale", "title": t, "src": loc, "tag": tag})
                if tag != "h4":
                    QA["tale headings not h4"].append(f"{loc}: <{tag}> {t}")
        elif tag == "div" and "subtitle" in cls:
            blocks.append({"type": "tale", "title": norm(text_of(ch)).strip(), "src": loc, "tag": "subtitle"})
        elif tag == "p":
            runs = runs_of(ch, loc)
            if runs:
                blocks.append({"type": "p", "runs": runs, "src": loc})
        elif tag == "div" and "poetry_container" in cls:
            blocks.append({"type": "verse", "bayts": verse_of(ch, loc), "src": loc})
        elif tag == "div" and ("mediaobject" in cls or ("paragraph-block" in cls and ch.find(f"{XHTML}div[@class='mediaobject center']") is not None)):
            info["figures"] += 1  # a Hindawi figure with its caption: left out
        elif tag == "div" and ("blank" in cls or "cf" in cls):
            pass
        elif tag in ("div", "section"):
            walk_block(ch, vol, where, blocks, info)
        elif tag in ("hr",):
            pass
        else:
            t = norm(text_of(ch)).strip()
            QA["unknown blocks"].append(f"{loc}: <{tag} class={' '.join(cls)}> {t[:60]}")
            if t:
                blocks.append({"type": "p", "runs": [t], "src": loc})


# --- tale hierarchy ----------------------------------------------------------------------


def load_tales() -> dict:
    if not os.path.exists(TALES):
        print("note: no tales.json; every heading becomes a chapter", file=sys.stderr)
        return {"tales": []}
    return json.load(open(TALES, encoding="utf-8"))


def key(title: str) -> str:
    """Titles are matched without tashkīl, tatweel or spacing differences."""
    return re.sub(r"\s+", " ", bare(title)).strip()


def split_runs(runs: list, pat: re.Pattern) -> tuple[list, list] | None:
    """Cut a paragraph's runs where `pat` first matches in a plain-text run.
    None when the phrase is absent or already opens the paragraph."""
    for i, r in enumerate(runs):
        if not isinstance(r, str):
            continue
        m = pat.search(r)
        if not m:
            continue
        head, tail = r[: m.start()].rstrip(), r[m.start():]
        before = runs[:i] + ([head] if head else [])
        if not before:
            return None
        return before, [tail] + runs[i + 1:]
    return None


def place(blocks: list[dict]) -> None:
    """Tag every block with its volume and night (the night whose heading
    precedes it; 0 for the frame story before night 1)."""
    vol, night = 0, 0
    for b in blocks:
        if b["type"] == "volume":
            vol = b["n"]
        elif b["type"] == "night":
            night = b["n"]
        b["v"], b["night"] = vol, night


def apply_tales(blocks: list[dict], spec: dict) -> tuple[list[dict], list[dict]]:
    """Resolve the tale headings against tales.json:

    - every Hindawi heading takes the id, level and parent of the entry with
      its title (the n-th heading of a title takes the n-th entry);
    - an entry with `anchor` is a tale Hindawi leaves unheaded: its heading is
      inserted before the paragraph of night `night` that holds the phrase,
      and with `split` that paragraph is cut where the phrase starts;
    - `repeat` marks a heading Hindawi prints again where a tale resumes
      (after a volume break or a long digression): kept, flagged, not set;
    - `group` entries are our own headings over a run of short tales,
      inserted before the tale `before`.

    Returns the blocks and the tale table in reading order."""
    entries = spec["tales"]
    by_id = {t["id"]: t for t in entries}
    place(blocks)

    # 1. unheaded tales
    out: list[dict] = []
    pending = [t for t in entries if t.get("anchor")]
    found: set[str] = set()
    for b in blocks:
        if b["type"] == "p":
            for t in pending:
                if t["id"] in found or t.get("night", b["night"]) != b["night"]:
                    continue
                if not fuzzy(t["anchor"]).search(plain(b["runs"])):
                    continue
                found.add(t["id"])
                cut = split_runs(b["runs"], fuzzy(t["split"])) if t.get("split") else None
                head = {"type": "tale", "title": t["title"], "src": b["src"], "tag": "anchor", "v": b["v"], "night": b["night"]}
                if cut:
                    out.append({**b, "runs": cut[0]})
                    b = {**b, "runs": cut[1]}
                    QA["paragraphs split for an unheaded tale"].append(f"{b['src']}: {t['id']}")
                out.append(head)
        out.append(b)
    for t in pending:
        if t["id"] not in found:
            QA["tale anchors not found"].append(f"{t['id']}: {t['anchor']}")
    blocks = out

    # 2. headings → entries, in order of occurrence per title
    queue: dict[str, list[dict]] = collections.defaultdict(list)
    for t in entries:
        if not t.get("group"):
            queue[key(t["title"])].append(t)
    taken: collections.Counter = collections.Counter()
    for b in blocks:
        if b["type"] != "tale":
            continue
        k = key(b["title"])
        cands = queue.get(k, [])
        if taken[k] >= len(cands):
            QA["tale headings not in tales.json"].append(f"{b['src']}: {b['title']}")
            b.update({"id": f"tale-{sum(taken.values()) + 1:03d}", "level": 1, "chapter": True})
            taken[k] += 1
            continue
        t = cands[taken[k]]
        taken[k] += 1
        b["id"] = t["id"]
        for f in ("level", "parent", "chapter", "repeat", "joinNextVolume"):
            if f in t:
                b[f] = t[f]
        b.setdefault("level", 1)
    for k, cands in queue.items():
        for t in cands[taken[k]:]:
            QA["tales.json entries never met"].append(f"{t['id']}: {t['title']}")

    # 3. group headings
    out = []
    groups = {t["before"]: t for t in entries if t.get("group")}
    for b in blocks:
        if b["type"] == "tale" and b.get("id") in groups:
            g = groups[b["id"]]
            out.append({"type": "tale", "title": g["title"], "src": b["src"], "tag": "group", "id": g["id"], "level": g.get("level", 1), "chapter": g.get("chapter", True), "group": True, "v": b["v"], "night": b["night"]})
        out.append(b)
    blocks = out

    # The table, with each tale's cycle (its level-1 ancestor) and path.
    def path(tid: str) -> list[str]:
        p = []
        while tid:
            p.append(tid)
            tid = by_id.get(tid, {}).get("parent")
        return p[::-1]

    table = []
    for b in blocks:
        if b["type"] == "tale" and not b.get("repeat"):
            pth = path(b["id"]) if b["id"] in by_id else [b["id"]]
            b["cycle"] = pth[0]
            row = {"id": b["id"], "title": b["title"], "level": b["level"], "parent": b.get("parent"), "cycle": pth[0], "path": pth, "volume": b["v"], "night": b["night"], "src": b["src"]}
            for f in ("chapter", "group", "joinNextVolume"):
                if b.get(f):
                    row[f] = True
            table.append(row)
    return blocks, table


# --- validation and statistics -----------------------------------------------------------


def annotate_nights(blocks: list[dict]) -> dict:
    """Tag every block with the night and volume it belongs to, flag the
    paragraphs that hold the dawn formula or the opening formula, and
    check the night sequence."""
    seen: dict[int, list[str]] = collections.defaultdict(list)
    night, vol = 0, 0
    order: list[int] = []
    dawn_in: dict[int, int] = collections.Counter()
    prev_type = None
    for b in blocks:
        if b["type"] == "volume":
            vol = b["n"]
        if b["type"] == "night":
            night = b["n"]
            seen[night].append(b["src"])
            order.append(night)
        b["v"] = vol
        b["night"] = night
        if b["type"] == "p":
            txt = plain(b["runs"])
            if DAWN.search(txt):
                b["dawn"] = True
                dawn_in[night] += 1
                if not DAWN_FULL.search(txt):
                    QA["dawn formula variants"].append(f"{b['src']}: {DAWN.search(txt) and txt[DAWN.search(txt).start():][:70]}")
            if prev_type == "night" and OPENING.search(txt[:200]):
                b["opening"] = True
            if prev_type == "verse":
                b["afterVerse"] = True
            if txt.rstrip().endswith(":"):
                b["colon"] = True
        prev_type = b["type"]
    missing = [n for n in range(1, 1002) if n not in seen]
    dupes = {n: srcs for n, srcs in seen.items() if len(srcs) > 1}
    out_of_order = [(a, b) for a, b in zip(order, order[1:]) if b != a + 1]
    no_dawn = [n for n in sorted(seen) if dawn_in.get(n, 0) == 0]
    many_dawn = {n: c for n, c in dawn_in.items() if c > 1}
    return {
        "nights": len(seen),
        "first": min(seen) if seen else None,
        "last": max(seen) if seen else None,
        "missing": missing,
        "duplicates": dupes,
        "outOfOrder": out_of_order,
        "nightsWithoutDawn": no_dawn,
        "nightsWithSeveralDawns": many_dawn,
    }


ARABIC_WORD = re.compile(f"[{ARABIC_LETTER}]+")


def words(s: str) -> int:
    return len(ARABIC_WORD.findall(bare(s)))


def stats(blocks: list[dict]) -> dict:
    per: dict[int, collections.Counter] = collections.defaultdict(collections.Counter)
    for b in blocks:
        c = per[b["v"]]
        if b["type"] == "p":
            c["paragraphs"] += 1
            c["words"] += words(plain(b["runs"]))
            c["chars"] += len(plain(b["runs"]))
            c["quran"] += sum(1 for r in b["runs"] if isinstance(r, dict) and "quran" in r)
            c["notes"] += sum(1 for r in b["runs"] if isinstance(r, dict) and "note" in r)
        elif b["type"] == "verse":
            c["poems"] += 1
            c["verseLines"] += len(b["bayts"])
            c["words"] += sum(words(" ".join(h)) for h in b["bayts"])
        elif b["type"] == "night":
            c["nights"] += 1
        elif b["type"] == "tale":
            c["tales"] += 1
    total = collections.Counter()
    for c in per.values():
        total.update(c)
    return {"perVolume": {str(v): dict(c) for v, c in sorted(per.items())}, "total": dict(total)}


def harakat_density(blocks: list[dict]) -> dict:
    """Tashkīl marks per word, prose and verse apart (a check that the
    vocalisation survived: about 0.3 in prose, 2+ in verse)."""
    marks = {"p": 0, "verse": 0}
    w = {"p": 0, "verse": 0}
    for b in blocks:
        if b["type"] == "p":
            s = plain(b["runs"])
        elif b["type"] == "verse":
            s = " ".join(" ".join(h) for h in b["bayts"])
        else:
            continue
        marks[b["type"]] += len(re.findall("[ً-ْٰ]", s))
        w[b["type"]] += words(s)
    return {k: round(marks[k] / w[k], 3) if w[k] else None for k in marks}


def odd_characters(blocks: list[dict]) -> dict:
    """Characters outside Arabic letters, marks and the usual punctuation:
    the list to read when Markdown escaping or the fonts are in doubt."""
    usual = set(" ،؛؟.:!«»()[]—…-'\"/ﷺ") | set("٠١٢٣٤٥٦٧٨٩")
    c: collections.Counter = collections.Counter()
    for b in blocks:
        if b["type"] == "p":
            s = plain(b["runs"])
        elif b["type"] == "verse":
            s = " ".join(" ".join(h) for h in b["bayts"])
        else:
            continue
        for ch in s:
            if ch in usual or re.match(f"[{ARABIC_LETTER}]", ch):
                continue
            c[f"U+{ord(ch):04X} {unicodedata.name(ch, '?')}"] += 1
    return dict(c.most_common())


def main() -> None:
    blocks: list[dict] = []
    volumes = []
    for vol, book_id, _ts in HINDAWI:
        path = os.path.join(SOURCE, "hindawi", f"vol{vol}-{book_id}.epub")
        if not os.path.exists(path):
            print(f"MISSING volume {vol}: {path} (run fetch.py)", file=sys.stderr)
            continue
        vb, info = parse_volume(vol, path)
        blocks.append({"type": "volume", "n": vol, "bookId": book_id, "title": info["title"]})
        blocks += vb
        volumes.append({"n": vol, "bookId": book_id, "title": info["title"], "files": info["files"], "figuresLeftOut": info["figures"]})
        print(f"volume {vol}: {info['files']} files, {len(vb)} blocks, {info['figures']} figures left out")

    blocks, table = apply_tales(blocks, load_tales())
    check = annotate_nights(blocks)
    for v in volumes:
        ns = [b["n"] for b in blocks if b["type"] == "night" and b["v"] == v["n"]]
        v["nights"] = [min(ns), max(ns)] if ns else None
    st = stats(blocks)
    report = {
        "volumes": volumes,
        "nights": check,
        "stats": st,
        "harakatPerWord": harakat_density(blocks),
        "normalisation": dict(COUNT),
        "oddCharacters": odd_characters(blocks),
        "qa": {k: v[:200] for k, v in QA.items()},
        "qaCounts": {k: len(v) for k, v in QA.items()},
    }
    data = {
        "edition": {
            "title": "ألف ليلة وليلة",
            "publisher": "مؤسسة هنداوي",
            "year": 2022,
            "licence": "Original text public domain; Hindawi's vocalisation and punctuation CC BY 4.0",
            "volumes": volumes,
        },
        "tales": table,
        "blocks": blocks,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    with open(REPORT, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    t = st["total"]
    print(f"{t.get('words', 0):,} words, {t.get('paragraphs', 0):,} paragraphs, {t.get('verseLines', 0):,} verse lines in {t.get('poems', 0):,} poems, {t.get('quran', 0)} Qurʾān quotations, {t.get('notes', 0)} notes")
    print(f"nights: {check['nights']} ({check['first']}–{check['last']}); missing {len(check['missing'])}: {check['missing'][:40]}; duplicates {sorted(check['duplicates'])}; out of order {check['outOfOrder'][:20]}")
    print(f"nights without the dawn formula: {len(check['nightsWithoutDawn'])}: {check['nightsWithoutDawn'][:40]}")
    for k, v in QA.items():
        print(f"QA {k}: {len(v)}")
    print("→", OUT, "and", REPORT)


if __name__ == "__main__":
    main()
