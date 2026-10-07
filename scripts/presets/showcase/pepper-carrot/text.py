#!/usr/bin/env python3
"""Write the episode in postext's comics syntax, one file per language:
`$PC_OUT/<lang>.md` for en, ja, es, fr, cn (zh), ca, ar, pt (pt-BR).

    # <episode title>

    :::page{split="26.9 / 20.5 / * [33.5 | 32.7 | *]"}
    ::panel{art=e08p02-1}
    pepper: Oh, invite the other witches we met at the Potion Contest?
    pepper{join=false}: Great idea Carrot!
    ::panel{art=e08p02-2 style=rounded}
    sfx{writing at="34.2% 86.7%" rotate=13}: Invitation
    …
    :::

Pages are the story pages P01–P06 (P00 is the title header, P07 the
patrons' page: the title becomes the heading, the credits a closing
section). Each page's split, panels and art are the same in every
language (panels.json); the script lines come from the language's SVG
sorted into the English slots (slots.py), so speaker ids match the art's
anchors everywhere. Balloon kinds come from the original balloon shapes: a
spiky outline is `shout`, a balloon that leaves its panel gets `break`,
balloons linked by a connector are `join`ed, two separate balloons of one
speaker in a panel are `join=false`. Arabic is written in its own reading
order (balloons that share a tier right to left); the split tree is not
mirrored here, the engine mirrors right-to-left pages itself. Japanese
stays as lettered (the engine sets it vertical).

    python3 text.py [--langs en,ja]
"""
from __future__ import annotations

import argparse
import math
import os

from common import LANGS, STORY_PAGES, load_json, out
from slots import Slot, language_texts, page_slots, reading_order

SPIKY = 1.25   # outline length / convex hull length above this: a shout balloon
HEADINGS = {"en": "Credits", "ja": "クレジット", "es": "Créditos", "fr": "Crédits", "cn": "制作人员", "ca": "Crèdits", "ar": "الاعتمادات", "pt": "Créditos"}
LICENCE = {
    "en": "Licence: Creative Commons Attribution 4.0 (CC BY 4.0).",
    "ja": "ライセンス：クリエイティブ・コモンズ 表示 4.0（CC BY 4.0）",
    "es": "Licencia: Creative Commons Reconocimiento 4.0 (CC BY 4.0).",
    "fr": "Licence : Creative Commons Attribution 4.0 (CC BY 4.0).",
    "cn": "许可协议：知识共享 署名 4.0（CC BY 4.0）",
    "ca": "Llicència: Creative Commons Reconeixement 4.0 (CC BY 4.0).",
    "ar": "الترخيص: المشاع الإبداعي – نسب المصنَّف 4.0 ‏(CC BY 4.0).",
    "pt": "Licença: Creative Commons Atribuição 4.0 (CC BY 4.0).",
}


def hull_length(pts) -> float:
    pts = sorted(set(pts))
    if len(pts) < 3:
        return 0.0

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    hull = lower[:-1] + upper[:-1]
    return sum(math.dist(a, b) for a, b in zip(hull, hull[1:] + hull[:1]))


def is_spiky(slot: Slot) -> bool:
    poly = max(slot.body.polys, key=len)
    length = sum(math.dist(a, b) for a, b in zip(poly, poly[1:]))
    hull = hull_length(poly)
    return hull > 0 and length / hull > SPIKY


BREAK_PX = 60  # page px: a balloon that leaves its panel by more than this crosses the border on purpose


def leaves_panel(slot: Slot, panel: dict) -> bool:
    b, p = slot.body.bbox, panel["box"]
    return b[0] < p[0] - BREAK_PX or b[1] < p[1] - BREAK_PX or b[2] > p[2] + BREAK_PX or b[3] > p[3] + BREAK_PX


def pct(v: float) -> str:
    return f"{round(v * 100, 1):g}%"


def attrs(parts: list[str]) -> str:
    return "{" + " ".join(parts) + "}" if parts else ""


def script_line(key: str, attr: list[str], text: str) -> str:
    """`key{attrs}: text`; a text with several lines continues on indented
    lines, each previous line ending with a forced break (backslash)."""
    lines = [t for t in text.split("\n") if t.strip()]
    head = f"{key}{attrs(attr)}: {lines[0]}"
    if len(lines) == 1:
        return head
    return "\\\n  ".join([head] + lines[1:])


def page_md(lang: str, page: str, panels: dict, anchors: dict, warnings: list[str]) -> str:
    info = panels["pages"][page]
    by_id = {p["id"]: p for p in info["panels"]}
    slots = page_slots(page, panels)
    texts = language_texts(lang, page, slots)
    ordered = reading_order(lang, slots)
    out_ = [f':::page{{split="{info["split"]}"}}']
    for p in info["panels"]:
        pa = [f"art={p['id']}"]
        if p["radius"]:
            pa.append("style=rounded")
        out_.append(f"::panel{attrs(pa)}")
        prev_speaker = None
        free = {f["slot"]: f for f in anchors.get(p["id"], {}).get("freeText", [])}
        for s in [s for s in ordered if s.panel == p["id"]]:
            text = texts.get(s.id, "").strip()
            if s.kind == "credits":
                continue
            if not text:
                warnings.append(f"{lang} {page} {s.id} ({s.kind} {s.speaker or ''}): no text in this edition")
                continue
            if s.kind == "speech":
                a = []
                if is_spiky(s):
                    a.append("shout")
                if s.joined_with_previous:
                    a.append("join")
                elif prev_speaker == s.speaker:
                    a.append("join=false")
                if leaves_panel(s, by_id[p["id"]]):
                    a.append("break")
                out_.append(script_line(s.speaker, a, text))
                prev_speaker = s.speaker
            elif s.kind in ("sfx", "writing"):
                f = free.get(s.id)
                a = ["writing"] if s.kind == "writing" else []
                if f:
                    a += [f'at="{pct(f["x"])} {pct(f["y"])}"', f"rotate={f['rotate']}"]
                out_.append(script_line("sfx", a, text.replace("\n", " ")))
                prev_speaker = None
            elif s.kind == "caption":
                out_.append(script_line("caption", ["at=bottom-end"], text))
                prev_speaker = None
    out_.append(":::")
    return "\n".join(out_)


def credits_md(lang: str, manifest: dict) -> str:
    c = manifest["credits"][lang]
    lines = [f"## {HEADINGS[lang]}", ""]
    if c.get("letteredCredit"):
        lines += [c["letteredCredit"], ""]
    lines += [c["attribution"], "", LICENCE[lang], "", c["derivative"], "", "<https://www.peppercarrot.com>"]
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--langs", default=",".join(LANGS))
    args = ap.parse_args()
    panels = load_json(out("panels.json"))
    anchors = load_json(out("anchors.json"))
    manifest = load_json(out("manifest.json")) if os.path.exists(out("manifest.json")) else None
    warnings: list[str] = []
    for lang in args.langs.split(","):
        title = manifest["credits"][lang]["title"] if manifest else ""
        parts = [f"# {title}"] if title else []
        parts += [page_md(lang, page, panels, anchors, warnings) for page in STORY_PAGES]
        if manifest:
            parts.append(credits_md(lang, manifest))
        path = out(f"{lang}.md")
        with open(path, "w", encoding="utf-8") as f:
            f.write("\n\n".join(parts) + "\n")
        print("wrote", path)
    for w in warnings:
        print("warning:", w)


if __name__ == "__main__":
    main()
