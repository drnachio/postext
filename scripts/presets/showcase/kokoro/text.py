#!/usr/bin/env python3
"""The text of the `kokoro` showcase: Aozora Bunko's こころ (card 773) and the
1914 preface, converted to Postext Markdown with the postext-port skill's
Aozora converter (`plugins/postext/skills/postext-port/scripts/aozora.py`).

    python3 text.py [--split-shimo N] [--part-heading part|h1]

writes

- `work/draft/ja/00-jijo.md`: 序 (the 1914 preface, Aozora 4688);
- `work/draft/ja/01-kami.md`, `02-naka.md`, `03-shimo.md` (or
  `03-shimo-1.md` … with `--split-shimo N`): the three parts, one file each,
  opening with `:::part{number="上" title="先生と私"}`; the 110 newspaper
  instalments 一 … 五十六 are level-2 headings in the run of the text,
  `{indent="5" id="kami-1"}` (Aozora sets them 5字下げ; the id lets plates and
  cross-references point at a section);
- `work/draft/ja/kokoku.md` and `yokoku.md`: the 1914 advertisement (one
  sentence, Aozora 4689) and the newspaper notice of the serial (4687), for
  the front or back matter; `work/draft/ja/edition-note.md`: what this
  edition changed, in Japanese;
- `work/text.json`: parts and sections (ids, titles, character counts,
  readings), the Aozora credit blocks of the four texts, the editorial
  notes, the paragraph styles the text uses, the conversion report;
- `work/charset.txt`: every character the book prints (text, readings,
  front and back matter, running heads), and `work/display.txt`: the
  characters of headings and design text, for fonts.py.

Part 下 is Sensei's letter: every paragraph opens with 「 and only the last
one closes it (830 「 for 775 」). That is how a letter quoted over many
paragraphs is printed; nothing here balances the brackets.

`--part-heading h1` writes each part as a level-1 heading
(`# 先生と私 {number="上"}`) instead of a `:::part` block, for a design that
opens parts with a chapter opener.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
SOURCE = os.path.join(HERE, "source")
WORK = os.path.join(HERE, "work")
sys.path.insert(0, os.path.join(REPO, "plugins", "postext", "skills", "postext-port", "scripts"))
import aozora  # noqa: E402

NOVEL = os.path.join(SOURCE, "aozora", "773_ruby_5968.zip")
JIJO = os.path.join(SOURCE, "aozora", "4688_ruby_9465.zip")
KOKOKU = os.path.join(SOURCE, "aozora", "4689_txt_9473.zip")
YOKOKU = os.path.join(SOURCE, "aozora", "4687_ruby_9467.zip")

PART_IDS = {"上": "kami", "中": "naka", "下": "shimo"}
KANJI_DIGITS = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}

# Printed by the design (running heads, part pages, contents, colophon) and
# kept in every font subset.
DESIGN_TEXT = "こころ夏目漱石上中下先生と私両親と遺書序目次本書について広告文奥付岩波書店大正三年九月二十日発行青空文庫国立国会図書館漱石遺墨集"


def kanji_number(s: str) -> int:
    """一 → 1, 十六 → 16, 五十六 → 56."""
    if "十" in s:
        tens, _, ones = s.partition("十")
        return (KANJI_DIGITS.get(tens, 1) if tens else 1) * 10 + (KANJI_DIGITS[ones] if ones else 0)
    return KANJI_DIGITS[s]


def split_parts(doc: aozora.AozoraDocument) -> list[dict]:
    """The novel's blocks by part (大見出し) and section (中見出し)."""
    parts: list[dict] = []
    for b in doc.blocks:
        if b.kind == "heading" and b.level == "大":
            number, _, title = b.plain.partition("　")
            parts.append({"number": number, "title": title, "id": PART_IDS[number], "indent": b.indent, "sections": []})
        elif b.kind == "heading" and b.level == "中":
            n = kanji_number(b.plain)
            parts[-1]["sections"].append({"n": n, "title": b.plain, "id": f"{parts[-1]['id']}-{n}", "indent": b.indent, "blocks": []})
        elif b.kind == "break":
            continue  # 改ページ before 中 and 下: the part opens its own page.
        elif parts and parts[-1]["sections"]:
            parts[-1]["sections"][-1]["blocks"].append(b)
        elif b.kind != "blank":
            raise SystemExit(f"text before the first section (line {b.line}): {b.plain[:20]}")
    return parts


def section_markdown(sec: dict, opts: aozora.RenderOptions, report: aozora.Report) -> tuple[str, list[str]]:
    head = aozora.Block("heading", nodes=[aozora.Text(sec["title"])], level="中", indent=sec["indent"])
    body, styles = aozora.render_blocks(sec["blocks"], opts, report)
    return aozora.render_heading(head, opts, extra={"id": sec["id"]}) + "\n\n" + body, styles


def part_opening(part: dict, how: str) -> str:
    if how == "h1":
        return f'# {part["title"]} {{number="{part["number"]}" id="{part["id"]}"}}'
    return f':::part{{number="{part["number"]}" title="{part["title"]}"}}\n:::'


def write(path: str, text: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text if text.endswith("\n") else text + "\n")


def readings(nodes) -> list[str]:
    out = []
    for n in nodes:
        if isinstance(n, aozora.Ruby):
            out.append(n.reading)
            out.extend(readings(n.children))
        elif isinstance(n, aozora.Mark):
            out.extend(readings(n.children))
    return out


def jijo_markdown(res: aozora.Result) -> str:
    """序: the Aozora title 「『心』自序」 is the 1995 editors' (the 1914
    book heads it 序). Its date line is set 2字下げ in the source."""
    md = res.markdown.strip()
    return "# 序 {id=\"jijo\"}\n\n" + md + "\n"


def kanji_digits(n: int) -> str:
    """4567 → 四五六七 (digit by digit, as numbers are set in vertical text)."""
    return "".join("〇一二三四五六七八九"[int(d)] for d in str(n))


def edition_note(editorial: list[dict], gaiji: list[dict], ruby_count: int) -> str:
    """本書について: the base texts and every change made to them."""
    fixes = "、".join(f"「{e['text']}」（底本「{e['teihon']}」）" for e in editorial if e["kind"] == "teihon")
    chars = "、".join(f"{g['char']}（{g['description']}）" for g in gaiji)
    return (
        "# 本書について {id=\"edition-note\"}\n\n"
        "本文は青空文庫所収「こころ」（底本：集英社文庫、一九九一年）に、序は同「『心』自序」（底本：『漱石全集』第十六巻、岩波書店、一九九五年）による。\n\n"
        f"青空文庫の入力者が「漱石全集」を参照して正した次の箇所は、その訂正に従った。{fixes}。\n\n"
        f"青空文庫で外字注記とされている{chars}は、それぞれの文字で組んだ。\n\n"
        f"振り仮名（{kanji_digits(ruby_count)}箇所）は底本の通りとし、序の振り仮名は『漱石全集』編集部が現代仮名遣いで補ったものである。\n\n"
        "下「先生と遺書」は手紙の全文であり、各段落を鉤括弧で起こし、閉じ括弧は最後の段落の末尾にのみ置く。底本の通りである。\n"
    )


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--split-shimo", type=int, default=1, help="files for part 下 (split on section boundaries)")
    ap.add_argument("--part-heading", choices=["part", "h1"], default="part")
    ap.add_argument("--out", default=os.path.join(WORK, "draft", "ja"))
    a = ap.parse_args()

    opts = aozora.RenderOptions()
    novel = aozora.convert(NOVEL, opts=opts)
    doc = novel.doc
    report = doc.report
    if report.unknown or report.unmatched or report.unresolved_gaiji:
        raise SystemExit(f"conversion problems: {novel.report}")
    parts = split_parts(doc)
    assert [len(p["sections"]) for p in parts] == [36, 18, 56], [len(p["sections"]) for p in parts]

    for f in os.listdir(a.out) if os.path.isdir(a.out) else []:
        if f.endswith(".md"):
            os.remove(os.path.join(a.out, f))

    files: list[dict] = []
    used_styles: list[str] = []
    for i, part in enumerate(parts, start=1):
        chunks = [part["sections"]]
        if part["number"] == "下" and a.split_shimo > 1:
            secs = part["sections"]
            total = sum(len(aozora.plain(b.nodes)) for s in secs for b in s["blocks"])
            chunks, cur, size = [], [], 0
            for s in secs:
                cur.append(s)
                size += sum(len(aozora.plain(b.nodes)) for b in s["blocks"])
                if size >= total / a.split_shimo * (len(chunks) + 1) and len(chunks) < a.split_shimo - 1:
                    chunks.append(cur)
                    cur = []
            chunks.append(cur)
        for k, chunk in enumerate(chunks, start=1):
            out = [part_opening(part, a.part_heading)] if k == 1 else []
            for sec in chunk:
                md, styles = section_markdown(sec, opts, report)
                out.append(md.strip())
                used_styles += [s for s in styles if s not in used_styles]
            name = f"{i:02d}-{part['id']}" + (f"-{k}" if len(chunks) > 1 else "") + ".md"
            write(os.path.join(a.out, name), "\n\n".join(out))
            files.append({"file": name, "part": part["number"], "sections": [s["id"] for s in chunk]})

    jijo = aozora.convert(JIJO, editorial_ruby="keep")
    write(os.path.join(a.out, "00-jijo.md"), jijo_markdown(jijo))
    files.insert(0, {"file": "00-jijo.md", "part": None, "sections": ["jijo"]})
    kokoku = aozora.convert(KOKOKU)
    write(os.path.join(a.out, "kokoku.md"), kokoku.markdown)
    yokoku = aozora.convert(YOKOKU)
    write(os.path.join(a.out, "yokoku.md"), yokoku.markdown)
    note = edition_note(doc.editorial, report.gaiji, report.counts["ruby"])
    write(os.path.join(a.out, "edition-note.md"), note)

    for extra in (jijo, kokoku, yokoku):
        used_styles += [s["id"] for s in extra.styles if s["id"] not in used_styles]
    styles = []
    for sid in used_styles:
        cfg, _ = aozora.style_config(sid)
        styles.append(cfg)

    # Every character printed: the texts, their readings, the matter the
    # build adds.
    chars = set()
    for res in (novel, jijo, kokoku, yokoku):
        for b in res.doc.blocks:
            chars.update(b.plain)
            for r in readings(b.nodes):
                chars.update(r)
        # The colophon prints the credit blocks with the JIS wave dash, as
        # the converter sets the text (CP932 decodes it as ～ U+FF5E).
        chars.update(res.doc.credits.get("raw", "").replace("～", "〜"))
        chars.update(res.doc.title + res.doc.author)
    chars.update(note + DESIGN_TEXT)
    charset = "".join(sorted(c for c in chars if not c.isspace() or c == "　"))
    write(os.path.join(WORK, "charset.txt"), charset)
    # The display faces (bold heads, the antique of running heads and
    # folios) print only headings and the design's own words.
    heads = "".join(b.plain for res in (novel, jijo) for b in res.doc.blocks if b.kind == "heading")
    display = set(heads + DESIGN_TEXT + "序本書について" + "".join(p["number"] + p["title"] for p in parts))
    write(os.path.join(WORK, "display.txt"), "".join(sorted(display)))

    def stats(sec):
        text = "".join(b.plain for b in sec["blocks"])
        return {"chars": len(text), "readings": sum(len(readings(b.nodes)) for b in sec["blocks"]), "paragraphs": sum(1 for b in sec["blocks"] if b.kind == "paragraph")}

    data = {
        "title": doc.title,
        "author": doc.author,
        "files": files,
        "parts": [
            {k: v for k, v in p.items() if k != "sections"} | {"sections": [{"id": s["id"], "n": s["n"], "title": s["title"], **stats(s)} for s in p["sections"]]}
            for p in parts
        ],
        "credits": {
            "kokoro": {"title": doc.title, **doc.credits},
            "jijo": {"title": jijo.doc.title, **jijo.doc.credits},
            "kokoku": {"title": kokoku.doc.title, **kokoku.doc.credits},
            "yokoku": {"title": yokoku.doc.title, **yokoku.doc.credits},
        },
        "editorial": doc.editorial,
        "paragraphStyles": styles,
        "report": novel.report,
        "charset": len(charset),
    }
    write(os.path.join(WORK, "text.json"), json.dumps(data, ensure_ascii=False, indent=1))
    total = sum(s["chars"] for p in data["parts"] for s in p["sections"])
    print(f"{len(files)} files, {sum(len(p['sections']) for p in parts)} sections, {total} characters, "
          f"{report.counts['ruby']} readings, {len(charset)} distinct characters, styles: {', '.join(used_styles) or '-'}")
    for p in data["parts"]:
        print(f"  {p['number']} {p['title']}: {len(p['sections'])} sections, {sum(s['chars'] for s in p['sections'])} characters")


if __name__ == "__main__":
    main()
