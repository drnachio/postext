#!/usr/bin/env python3
"""Write the `pepper-carrot` showcase bundle (apps/web/public/presets/
pepper-carrot): episode 8 of David Revoy's webcomic Pepper&Carrot,
"Pepper's Birthday Party" (CC BY 4.0), in seven editions — en, es, ca, fr,
ja, zh-Hans (the `cn` translation) and ar — over the text-free art, with
the balloons and the lettering laid out by the engine.

Each edition is three chapters: a title page (the episode's cover art, the
title, "Art & Scenario: David Revoy" and the translators from the
language's info.json), the six comic pages (`$PC_OUT/<lang>.md`, written by
text.py) and the credits, with the attribution Pepper&Carrot's licence
guide asks for, the derivative note and the licence link.

The geometry is shared by every edition: the 21 panel pictures with their
safe areas, speaker anchors, the faces no balloon covers and the other
regions balloons avoid; A4 pages with the art's own frame (8.5 mm margins,
5.4 mm between tiers, 2.4 mm between panels side by side); the `rounded`
panel style of page 2; the `writing` balloon style for words on objects
(dark brown with a cream halo, readable on the letter and on the dark
grimoire); the monsters' black balloons with white text. Lettering at 9 pt
in the face of each language (fonts.py); the Japanese balloons are set in
columns, the Arabic pages read right to left (the panels of a tier swap
sides, the art does not flip).

The alt texts of the panels and the cover are written in every edition's
language (alts.py): the panels' as `::panel{… alt="…"}`, the cover's as
the edition's `localized[…].resources` wording.

    cd scripts/presets/showcase/pepper-carrot
    export PC_CACHE=… PC_OUT=…        # as for the content pipeline
    python3 fetch.py && python3 fonts.py && python3 panels.py && python3 anchors.py \\
      && python3 manifest.py && python3 text.py
    python3 build.py [--out DIR] [--keep-fonts]

`--out` writes elsewhere (no index registration); `--keep-fonts` reuses the
bundle's fonts when only the text or the config changed.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import sys

from PIL import Image

import alts
from common import CACHE, OUT as PC_OUT, gfx_page, load_json

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import _common  # noqa: E402
import fonts as fontkit  # noqa: E402

PRESET_ID = "pepper-carrot"
OUT = os.path.join(_common.PRESETS_ROOT, PRESET_ID)
CONFIG_VERSION = 8

# Edition locale -> Pepper&Carrot language code. The bundle opens in the
# reader's language; English is its own locale (`locale`).
EDITIONS = {"en": "en", "es": "es", "ca": "ca", "fr": "fr", "ja": "ja", "zh-Hans": "cn", "ar": "ar"}
DEFAULT = "en"

EPISODE_SOURCE = "https://www.peppercarrot.com/0_sources/ep08_Pepper-s-Birthday-Party/"
LICENCE_URL = "https://creativecommons.org/licenses/by/4.0/"

# --- faces ----------------------------------------------------------------------------------------

# Lettering (balloons, credits) and display (titles; the engine's sound
# effects use the same faces by default) per edition.
LETTERING = {"ja": "Zen Antique", "zh-Hans": "Noto Sans SC", "ar": "Playpen Sans Arabic"}
DISPLAY = {"ja": "Dela Gothic One", "zh-Hans": "ZCOOL KuaiLe", "ar": "Lalezar"}


def lettering_face(loc: str) -> str:
    return LETTERING.get(loc, "Comic Neue")


def text_face(loc: str) -> str:
    """The credits page's face: the lettering face, but for Japanese, whose
    lettering face has no bold for an editor's `**…**`."""
    return "Noto Sans JP" if loc == "ja" else lettering_face(loc)


def display_face(loc: str) -> str:
    return DISPLAY.get(loc, "Bangers")


# --- palette --------------------------------------------------------------------------------------

COLOURS = {
    "ink": "#1d1a17",
    "paper": "#ffffff",
    "accent": "#b4402a",  # Pepper's red
    "muted": "#6b625a",
    "writing": "#3b2a1e",
    "cream": "#fbf3dc",
    "night": "#0f0f0f",
}
NAMES = {
    "ink": "Ink",
    "paper": "Paper",
    "accent": "Pepper's red",
    "muted": "Muted text",
    "writing": "Writing on objects",
    "cream": "Halo of the writing",
    "night": "Monster balloons",
}
col, PALETTE = _common.make_palette(COLOURS, NAMES)
mm, pt = _common.mm, _common.pt

# --- page geometry ----------------------------------------------------------------------------------

PAGE_W, PAGE_H = 210.0, 297.0
# The text pages (title, credits) have a book's margins; the comic pages
# keep the art's own frame (`comics.frame.margins`, measured by panels.py).
TEXT_MARGINS = {"top": 22.0, "bottom": 24.0, "left": 22.0, "right": 22.0}

# --- panels: faces and regions balloons keep off ---------------------------------------------------

# Fractions of each panel picture, read off the cut JPGs with a 10 % grid.
# `face` joins the speaker's anchor (no balloon covers it); `avoid` holds
# the other faces and key objects. Pepper&Carrot marks none of these; the
# engine guards an unmarked speaker's head with a small box, which is not
# enough in the crowded panels.
FACES = {
    "e08p01-2": {"pepper": {"x": 0.47, "y": 0.12, "width": 0.11, "height": 0.62}},
    "e08p02-1": {"pepper": {"x": 0.24, "y": 0.27, "width": 0.12, "height": 0.23}},
    "e08p03-2": {"pepper": {"x": 0.625, "y": 0.37, "width": 0.09, "height": 0.22}},
    "e08p04-1": {"pepper": {"x": 0.665, "y": 0.39, "width": 0.085, "height": 0.23}},
    "e08p05-1": {"pepper": {"x": 0.38, "y": 0.40, "width": 0.13, "height": 0.32}},
    "e08p05-2": {"pepper": {"x": 0.75, "y": 0.54, "width": 0.09, "height": 0.13}},
    "e08p06-1": {"monster": {"x": 0.40, "y": 0.05, "width": 0.22, "height": 0.18}},
}
AVOID = {
    # Carrot's head beside Pepper.
    "e08p01-2": [{"x": 0.26, "y": 0.38, "width": 0.17, "height": 0.62}],
    # Pepper's hat and Carrot's head.
    "e08p02-1": [{"x": 0.18, "y": 0.0, "width": 0.21, "height": 0.27}, {"x": 0.70, "y": 0.26, "width": 0.14, "height": 0.32}],
    "e08p03-2": [{"x": 0.32, "y": 0.50, "width": 0.09, "height": 0.20}],
    "e08p04-1": [{"x": 0.31, "y": 0.55, "width": 0.11, "height": 0.20}],
    # Carrot in the corner; the demon on the grimoire.
    "e08p05-1": [{"x": 0.0, "y": 0.66, "width": 0.19, "height": 0.34}, {"x": 0.73, "y": 0.22, "width": 0.13, "height": 0.30}],
    "e08p05-2": [{"x": 0.55, "y": 0.12, "width": 0.10, "height": 0.17}],
    # The other two monsters' eyes and Carrot.
    "e08p06-1": [
        {"x": 0.15, "y": 0.25, "width": 0.15, "height": 0.14},
        {"x": 0.73, "y": 0.63, "width": 0.14, "height": 0.15},
        {"x": 0.45, "y": 0.77, "width": 0.13, "height": 0.20},
    ],
}

# --- words per edition ------------------------------------------------------------------------------

# The title page's credit lines and the chapter names. `{x}` is filled from
# the language's info.json (manifest.json `credits`).
WORDS: dict[str, dict] = {
    "en": {
        "titlePage": "Title page", "credits": "Credits",
        "art": "Art & Scenario: David Revoy", "translation": "Translation: {x}",
        "contribution": "Contribution: {x}", "proofreading": "Proofreading: {x}", "original": "Original version",
        "and": " and ", "sep": ", ",
        "episode": "*{t}* is episode 8 of the webcomic Pepper&Carrot, first published in June 2015.",
        "attribution": (
            "Based on the webcomic Pepper&Carrot by David Revoy. <https://www.peppercarrot.com> "
            "Licensed under the Creative Commons Attribution 4.0. <" + LICENCE_URL + "> "
            "Based on the universe of Hereva created by David Revoy with contributions by Craig Maloney. "
            "Corrections by Willem Sonke, Moini, Hali, CGand and Alex Gryson."
        ),
        "derivative": (
            "Re-lettered and re-laid out by Postext. This edition is a derivative of “Pepper's Birthday Party” by "
            "David Revoy (CC BY 4.0): the engine rebuilt the balloons and the lettering from the official English "
            "translation and set the pages again over the text-free art, cut into panels. The changes are not the "
            "author's."
        ),
        "fonts": "Lettering in {f}, under the SIL Open Font License.",
        "source": "Source files of the episode: <" + EPISODE_SOURCE + ">",
    },
    "es": {
        "titlePage": "Portada", "credits": "Créditos",
        "art": "Dibujo y guion: David Revoy", "translation": "Traducción: {x}",
        "contribution": "Colaboración: {x}", "proofreading": "Revisión: {x}", "original": "Versión original",
        "and": " y ", "sep": ", ",
        "episode": "*{t}* es el episodio 8 del webcómic Pepper&Carrot, publicado en junio de 2015.",
        "attribution": (
            "Basado en el webcómic Pepper&Carrot de David Revoy. <https://www.peppercarrot.com> "
            "Con licencia Creative Commons Attribution 4.0 (CC BY 4.0). <" + LICENCE_URL + "deed.es> "
            "Basado en el universo de Hereva, creado por David Revoy con contribuciones de Craig Maloney. "
            "Correcciones de Willem Sonke, Moini, Hali, CGand y Alex Gryson."
        ),
        "fonts": "Rotulado con {f}, con licencia SIL Open Font License.",
        "source": "Archivos fuente del episodio: <" + EPISODE_SOURCE + ">",
    },
    "ca": {
        "titlePage": "Portada", "credits": "Crèdits",
        "art": "Dibuix i guió: David Revoy", "translation": "Traducció: {x}",
        "contribution": "Col·laboració: {x}", "proofreading": "Revisió: {x}", "original": "Versió original",
        "and": " i ", "sep": ", ",
        "episode": "*{t}* és l'episodi 8 del webcòmic Pepper&Carrot, publicat el juny del 2015.",
        "attribution": (
            "Basat en el webcòmic Pepper&Carrot de David Revoy. <https://www.peppercarrot.com> "
            "Amb llicència Creative Commons Attribution 4.0 (CC BY 4.0). <" + LICENCE_URL + "deed.ca> "
            "Basat en l'univers d'Hereva, creat per David Revoy amb contribucions de Craig Maloney. "
            "Correccions de Willem Sonke, Moini, Hali, CGand i Alex Gryson."
        ),
        "fonts": "Retolat amb {f}, amb llicència SIL Open Font License.",
        "source": "Fitxers font de l'episodi: <" + EPISODE_SOURCE + ">",
    },
    "fr": {
        "titlePage": "Page de titre", "credits": "Crédits",
        "art": "Dessin et scénario : David Revoy", "translation": "Traduction : {x}",
        "contribution": "Contribution : {x}", "proofreading": "Relecture : {x}", "original": "Version originale",
        "and": " et ", "sep": ", ",
        "episode": "*{t}* est l'épisode 8 du webcomic Pepper&Carrot, publié en juin 2015.",
        "attribution": (
            "D'après le webcomic Pepper&Carrot de David Revoy. <https://www.peppercarrot.com> "
            "Sous licence Creative Commons Attribution 4.0 (CC BY 4.0). <" + LICENCE_URL + "deed.fr> "
            "D'après l'univers d'Hereva créé par David Revoy, avec les contributions de Craig Maloney. "
            "Corrections de Willem Sonke, Moini, Hali, CGand et Alex Gryson."
        ),
        "fonts": "Lettrage en {f}, sous licence SIL Open Font License.",
        "source": "Fichiers sources de l'épisode : <" + EPISODE_SOURCE + ">",
    },
    "ja": {
        "titlePage": "扉", "credits": "クレジット",
        "art": "作画・シナリオ：David Revoy", "translation": "翻訳：{x}",
        "contribution": "協力：{x}", "proofreading": "校正：{x}", "original": "原語版",
        "and": "、", "sep": "、",
        "episode": "『{t}』は、ウェブコミック Pepper&Carrot の第8話です（2015年6月公開）。",
        "attribution": (
            "David Revoy のウェブコミック Pepper&Carrot に基づく。<https://www.peppercarrot.com> "
            "ライセンス：クリエイティブ・コモンズ 表示 4.0（CC BY 4.0）。<" + LICENCE_URL + "deed.ja> "
            "Hereva の世界は David Revoy が創作し、Craig Maloney が協力した。"
            "校正：Willem Sonke、Moini、Hali、CGand、Alex Gryson。"
        ),
        "fonts": "写植書体：{f}（SIL Open Font License）。",
        "source": "このエピソードのソースファイル：<" + EPISODE_SOURCE + ">",
    },
    "zh-Hans": {
        "titlePage": "扉页", "credits": "制作人员",
        "art": "绘图及脚本：David Revoy", "translation": "翻译：{x}",
        "contribution": "贡献：{x}", "proofreading": "校对：{x}", "original": "原版",
        "and": "、", "sep": "、",
        "episode": "《{t}》是网络漫画 Pepper&Carrot 的第8集，2015年6月发表。",
        "attribution": (
            "本书基于 David Revoy 的网络漫画 Pepper&Carrot。<https://www.peppercarrot.com> "
            "依知识共享 署名 4.0 协议（CC BY 4.0）授权。<" + LICENCE_URL + "deed.zh-hans> "
            "Hereva 的世界由 David Revoy 创作，Craig Maloney 参与贡献。"
            "校对：Willem Sonke、Moini、Hali、CGand、Alex Gryson。"
        ),
        "fonts": "字体：{f}（SIL Open Font License）。",
        "source": "本集源文件：<" + EPISODE_SOURCE + ">",
    },
    "ar": {
        "titlePage": "صفحة العنوان", "credits": "الاعتمادات",
        "art": "الرسم والقصة: David Revoy", "translation": "الترجمة: {x}",
        "contribution": "المساهمة: {x}", "proofreading": "المراجعة: {x}", "original": "النسخة الأصلية",
        "and": " و", "sep": "، ",
        "episode": "«{t}» هي الحلقة الثامنة من القصة المصورة Pepper&Carrot على الإنترنت، نُشرت في يونيو ٢٠١٥.",
        "attribution": (
            "مبنية على القصة المصورة Pepper&Carrot لـ David Revoy. <https://www.peppercarrot.com> "
            "مرخّصة بموجب رخصة المشاع الإبداعي نَسب المُصنَّف 4.0 (CC BY 4.0). <" + LICENCE_URL + "deed.ar> "
            "مبنية على عالم Hereva الذي ابتكره David Revoy بمساهمات من Craig Maloney. "
            "التصحيح: Willem Sonke وMoini وHali وCGand وAlex Gryson."
        ),
        "fonts": "الخطوط: {f}، برخصة SIL Open Font License.",
        "source": "ملفات المصدر للحلقة: <" + EPISODE_SOURCE + ">",
    },
}


def names(loc: str, people: list[str]) -> str:
    w = WORDS[loc]
    if len(people) <= 1:
        return "".join(people)
    return w["sep"].join(people[:-1]) + w["and"] + people[-1]


def credit_lines(loc: str, cr: dict) -> list[str]:
    """The translators' lines of an edition, from its info.json."""
    w = WORDS[loc]
    lines = []
    if cr.get("originalVersion"):
        lines.append(w["original"])
    if cr.get("translation"):
        lines.append(w["translation"].format(x=names(loc, cr["translation"])))
    if cr.get("proofreading"):
        lines.append(w["proofreading"].format(x=names(loc, cr["proofreading"])))
    if cr.get("contribution"):
        lines.append(w["contribution"].format(x=names(loc, cr["contribution"])))
    return lines


def attr_value(s: str) -> str:
    return _common.attr_value(s)


# --- chapters ----------------------------------------------------------------------------------------


def title_markdown(loc: str, cr: dict) -> str:
    w = WORDS[loc]
    lines = credit_lines(loc, cr)
    # The document metadata (PDF title and author, `{title}` placeholders).
    front = f'---\ntitle: {json.dumps(cr["title"], ensure_ascii=False)}\nauthor: "David Revoy"\n---\n\n'
    return front + (
        f'# {cr["title"]} {{style="title" toc="false" art="{attr_value(w["art"])}" '
        f'credit="{attr_value(" · ".join(lines))}"}}\n'
    )


# Panels narrower than their tier: the art's inset from the frame, start
# and end, in mm (panels.json boxes; frame x 100–2384 px of 2481 px = 210 mm).
FRAME_X0, FRAME_X1, ART_W = 100, 2384, 2481


def panel_pads(manifest: dict) -> dict[str, str]:
    """`pad` for every panel whose box stops short of the frame's sides in a
    tier of its own (page 2, panel 2: centred, 20 mm in from each side).
    Without it the cell spans the frame, the art cannot cover it and keep
    its safe area, and it is letterboxed with square corners."""
    pads: dict[str, str] = {}
    boxes = {p["id"]: p["box"] for p in manifest["panels"]}
    for page in manifest["pages"].values():
        for pid in page["panels"]:
            box = boxes[pid]
            beside = [o for o in page["panels"] if o != pid and boxes[o][1] < box[3] and boxes[o][3] > box[1]]
            if beside:
                continue
            start = (box[0] - FRAME_X0) * 210 / ART_W
            end = (FRAME_X1 - box[2]) * 210 / ART_W
            if min(start, end) > 3:
                pads[pid] = f'0 {end:.1f}mm 0 {start:.1f}mm'
    return pads


def add_panel_attr(md: str, pid: str, attr: str) -> str:
    """`attr` appended to the attributes of panel `pid`'s `::panel{…}` line."""
    out, n = re.subn(r"(::panel\{art=" + re.escape(pid) + r"\b[^}]*)\}", lambda m: f"{m.group(1)} {attr}}}", md)
    if n != 1:
        raise SystemExit(f"{pid}: {n} ::panel lines")
    return out


def episode_markdown(lang: str, pads: dict[str, str]) -> str:
    """The six `:::page` blocks of text.py's Markdown, without its title and
    credits (the book has its own pages for them), with `pad` on the panels
    narrower than their tier and every panel's alt text in the edition's
    language (`alt` overrides the picture's English `altText`)."""
    md = open(os.path.join(PC_OUT, f"{lang}.md"), encoding="utf-8").read()
    md = re.sub(r"\A# [^\n]*\n+", "", md)
    md = re.split(r"\n## [^\n]*\n", md, maxsplit=1)[0]
    for pid, pad in pads.items():
        md = add_panel_attr(md, pid, f'pad="{pad}"')
    for pid in re.findall(r"^::panel\{art=([\w-]+)", md, re.M):
        md = add_panel_attr(md, pid, f'alt="{alts.attr(alts.ALT[pid][lang])}"')
    return md.strip() + "\n"


# `alt="…"` on a panel line: words no face sets (the font subsets and the
# coverage check leave them out).
ALT_ATTR = re.compile(r' alt="[^"]*"')


def url_paragraphs(text: str) -> list[str]:
    """`text` cut at its `<url>` marks into paragraphs, each address a
    paragraph of its own, written plain (the engine prints angle brackets)
    and without a trailing slash (in an Arabic paragraph a final slash
    would run to the other end of the line)."""
    out = []
    for i, part in enumerate(re.split(r"\s*<(https?://[^>]+)>\s*", text)):
        part = part.strip()
        if part:
            out.append(part.rstrip("/") if i % 2 else part)
    return out


def colophon_markdown(loc: str, cr: dict) -> str:
    """The credits page: the episode, who made it and translated it, the
    attribution Pepper&Carrot's licence guide asks for (its wording, with
    each address on a line of its own as the guide sets it), what Postext
    changed, the faces, the sources."""
    w = WORDS[loc]
    faces = list(dict.fromkeys([lettering_face(loc), display_face(loc), text_face(loc)]))
    derivative = w.get("derivative") or cr["derivative"]
    paras = [
        f'# {w["credits"]} {{style="colophon"}}',
        w["episode"].format(t=cr["shortTitle"]),
        w["art"],
        *credit_lines(loc, cr),
        *url_paragraphs(w["attribution"]),
        derivative,
        w["fonts"].format(f=names(loc, faces)),
        *url_paragraphs(w["source"]),
    ]
    return "\n\n".join(paras) + "\n"


def write_chapters(out: str, manifest: dict) -> dict[str, list[dict]]:
    credits = manifest["credits"]
    pads = panel_pads(manifest)
    chapters: dict[str, list[dict]] = {}
    for loc, lang in EDITIONS.items():
        cr = credits[lang]
        d = os.path.join(out, "chapters", loc)
        os.makedirs(d, exist_ok=True)
        files = [
            ("00-title.md", WORDS[loc]["titlePage"], title_markdown(loc, cr)),
            ("01-episode-8.md", cr["shortTitle"], episode_markdown(lang, pads)),
            ("02-credits.md", WORDS[loc]["credits"], colophon_markdown(loc, cr)),
        ]
        chapters[loc] = []
        for name, title, md in files:
            with open(os.path.join(d, name), "w", encoding="utf-8") as f:
                f.write(md)
            chapters[loc].append({"title": title, "file": f"chapters/{loc}/{name}"})
    return chapters


# --- resources ---------------------------------------------------------------------------------------

COVER_ID = alts.COVER_ID


def resources(out: str, manifest: dict) -> list[dict]:
    rdir = os.path.join(out, "resources")
    os.makedirs(rdir, exist_ok=True)
    specs: list[dict] = []
    # The episode's cover illustration, for the title page.
    cover = Image.open(gfx_page("")).convert("RGB")
    cover.save(os.path.join(rdir, f"{COVER_ID}.jpg"), quality=82, optimize=True, progressive=True)
    specs.append({
        "id": COVER_ID, "typeId": "art", "kind": "bitmap", "file": f"resources/{COVER_ID}.jpg",
        "width": cover.width, "height": cover.height,
        "altText": alts.ALT[COVER_ID]["en"],
    })
    for p in manifest["panels"]:
        src = os.path.join(PC_OUT, p["file"])
        dst = os.path.join(rdir, f"{p['id']}.jpg")
        shutil.copyfile(src, dst)
        faces = FACES.get(p["id"], {})
        anchors = []
        for a in p["anchors"]:
            entry = {"id": a["id"], "x": round(a["x"], 4), "y": round(a["y"], 4)}
            if a.get("head"):
                entry["head"] = a["head"]
            if a["id"] in faces:
                entry["face"] = faces[a["id"]]
            anchors.append(entry)
        missing = set(faces) - {a["id"] for a in anchors}
        if missing:
            raise SystemExit(f"{p['id']}: faces for speakers with no anchor: {sorted(missing)}")
        spec = {
            "id": p["id"], "typeId": "art", "kind": "bitmap", "file": f"resources/{p['id']}.jpg",
            "width": p["width"], "height": p["height"],
            "altText": p["alt"],
            "safeArea": p["safeArea"],
        }
        if anchors:
            spec["anchors"] = anchors
        if p["id"] in AVOID:
            spec["avoid"] = AVOID[p["id"]]
        specs.append(spec)
    return specs


# --- config ------------------------------------------------------------------------------------------


def title_design(loc: str) -> dict:
    """The title page: the cover art across the head of the page to the
    trim, the series name, the episode title, the credit lines, the address
    and licence at the foot."""
    art_h = round(PAGE_W * 765 / 1100, 2)
    display, lettering = display_face(loc), lettering_face(loc)
    cjk = loc in ("ja", "zh-Hans")
    text_w = PAGE_W - 2 * 20
    page = _common.at("page", "top-left")
    return {
        "enabled": True,
        "minHeight": mm(PAGE_H - TEXT_MARGINS["top"] - TEXT_MARGINS["bottom"] - 2),
        "slot": {"elements": [
            _common.image_el("cover", COVER_ID, anchor=_common.at("bleed", "top-left"), width=PAGE_W, height=art_h),
            _common.text_el("series", "Pepper&Carrot", col=col, anchor=page, offset=(20, art_h + 14), width=text_w,
                            size_pt=18, family=display, align="center", color="accent", letterSpacing=pt(1.5)),
            _common.text_el("title", "{titleText}", col=col, anchor=page, offset=(20, art_h + 27), width=text_w,
                            size_pt=32 if cjk else 42, family=display, align="center",
                            line_height=1.12, color="ink", direction="auto"),
            _common.text_el("art", "{attr.art}", col=col, anchor=page, offset=(20, art_h + 82), width=text_w,
                            size_pt=14, family=lettering, weight=400 if loc == "ja" else 700, align="center", color="ink", direction="auto"),
            _common.text_el("credit", "{attr.credit}", col=col, anchor=page, offset=(20, art_h + 93), width=text_w,
                            size_pt=11.5, family=lettering, align="center", line_height=1.35, color="ink", direction="auto"),
            _common.text_el("site", "www.peppercarrot.com · CC BY 4.0", col=col, anchor=_common.at("page", "bottom-left"),
                            offset=(20, -16), width=text_w, size_pt=9, family=lettering, align="center", color="muted"),
        ]},
    }


# The one resource type: David Revoy's art (the panels and the cover),
# neither captioned nor numbered.
ART_TYPE_NAMES = {
    "en": ("Artwork", "Artwork"), "es": ("Ilustración", "Ilustraciones"), "ca": ("Il·lustració", "Il·lustracions"),
    "fr": ("Illustration", "Illustrations"), "ja": ("原画", "原画"), "zh-Hans": ("原画", "原画"), "ar": ("رسم", "رسوم"),
}


def resource_types(loc: str) -> list[dict]:
    name, plural = ART_TYPE_NAMES[loc]
    return [{
        "id": "art", "name": name, "namePlural": plural, "shortLabel": name, "captionPrefix": "",
        "numberingTemplate": "", "resetOn": "never", "counterFormat": "decimal",
        "defaultPlacement": {"position": "auto", "span": "page", "width": 1, "align": "center"},
    }]


def heading_styles(loc: str) -> list[dict]:
    return [
        {
            "id": "title", "name": "Title page", "numbered": False, "toc": False, "span": "page",
            "runningChapter": False,
            "breakBefore": {"enabled": True, "parity": "odd"},
            "marginBottom": pt(0),
            "advancedDesign": title_design(loc),
        },
        {
            "id": "colophon", "name": "Credits", "numbered": False, "toc": False,
            "breakBefore": {"enabled": True, "parity": "any"},
            "fontFamily": display_face(loc),
            "fontSize": pt(26), "lineHeight": pt(30),
            "color": col("accent"),
            "marginBottom": pt(14),
        },
    ]


# The one sound effect at the size it is drawn in the original; the
# Chinese one is eight characters and an ellipsis, set smaller so it stays
# in its panel.
SFX_SCALE = {"zh-Hans": 2.1}


def comics_config(loc: str) -> dict:
    return {
        "readingDirection": "auto",
        "frame": {"margins": {"top": mm(8.47), "bottom": mm(8.72), "left": mm(8.47), "right": mm(8.21)}},
        "gutter": {"horizontal": mm(5.42), "vertical": mm(2.37)},
        "panel": {"borderWidth": mm(0), "borderStyle": "none"},
        "panelStyles": [{"id": "rounded", "name": "Rounded", "borderRadius": mm(5.8), "borderStyle": "none"}],
        "lettering": {"fontSize": pt(9)},
        "balloonStyles": [
            {"id": "sfx", "fontScale": SFX_SCALE.get(loc, 3.4)},
            # Zen Antique has no bold: the Japanese shouts take the heavy
            # display face, as manga letterers do.
            *([{"id": "shout", "fontFamily": "Dela Gothic One", "bold": False}] if loc == "ja" else []),
            {
                "id": "writing", "name": "Writing on objects", "shape": "none", "tail": "none",
                "fontScale": 0.85, "bold": False, "italic": True, "color": col("writing"),
                "halo": pt(1.4), "haloColor": col("cream"), "strokeWidth": pt(0),
            },
        ],
        "cast": [
            {"id": "pepper", "name": "Pepper"},
            {"id": "carrot", "name": "Carrot"},
            {"id": "monster", "name": "Monsters of Chaosah", "fill": col("night"), "color": col("paper")},
        ],
    }


def config(loc: str) -> dict:
    body = {
        "fontFamily": text_face(loc),
        "fontSize": pt(10.5),
        "lineHeight": pt(15.5),
        "textAlign": "left",
        "firstLineIndent": mm(0),
        "paragraphSpacing": True,
        "color": col("ink"),
        "boldColor": col("ink"),
        "italicColor": col("ink"),
        "avoidWidows": True,
        "avoidOrphans": True,
    }
    if loc in ("en", "es", "ca", "fr"):
        body["hyphenation"] = {"enabled": False}
    return {
        "locale": loc,
        "page": {
            "sizePreset": "custom",
            "width": mm(PAGE_W),
            "height": mm(PAGE_H),
            "margins": {k: mm(v) for k, v in TEXT_MARGINS.items()} | {"mirror": False},
            "pageNumbering": {"format": "decimal", "startAt": 1},
        },
        "layout": {"layoutType": "single"},
        "bodyText": body,
        "headings": {
            "fontFamily": display_face(loc),
            "color": col("ink"),
            "keepWithNext": True,
            "levels": [{"level": 1, "numberingTemplate": "", "fontSize": pt(26), "lineHeight": pt(30), "marginBottom": pt(14)}],
        },
        "headingStyles": heading_styles(loc),
        # No running heads or folios: the comic pages are art to the frame.
        "header": {"elements": []},
        "footer": {"elements": []},
        "comics": comics_config(loc),
        "colorPalette": PALETTE,
        "resourceTypes": resource_types(loc),
        "pdfGeneration": {"outlines": True},
        "folio": {
            "paper": {"type": "coatedMatte", "grammage": 130},
            "binding": {"type": "saddleStitch", "cover": "pages"},
            "surface": {"type": "walnut"},
            "lighting": {"environment": "studio"},
        },
    }


def localized_configs() -> tuple[dict, dict[str, dict]]:
    """The English config, and per other edition the top-level keys that
    differ from it (a bundle's `localized[…].config` replaces keys
    wholesale) and the cover's alt text in its language (`localized[…]
    .resources` wording is merged by id)."""
    base = config(DEFAULT)
    out: dict[str, dict] = {}
    for loc, lang in EDITIONS.items():
        if loc == DEFAULT:
            out[loc] = {}
            continue
        cfg = config(loc)
        out[loc] = {
            "config": {k: v for k, v in cfg.items() if v != base.get(k)},
            # The cover's alt text (the panels carry theirs in the Markdown).
            "resources": [{"id": COVER_ID, "altText": alts.ALT[COVER_ID][lang]}],
        }
    return base, out


# --- fonts -------------------------------------------------------------------------------------------


def bundle_text(out: str, cfgs: list[dict]) -> str:
    s = "".join(json.dumps(c, ensure_ascii=False) for c in cfgs)
    for dp, _, fs in os.walk(os.path.join(out, "chapters")):
        for f in fs:
            s += ALT_ATTR.sub("", open(os.path.join(dp, f), encoding="utf-8").read())
    return s


def edition_faces(loc: str) -> set[str]:
    return {lettering_face(loc), display_face(loc)}


def build_fonts(out: str, cfgs: list[dict]) -> list[dict]:
    fonts_dir = os.path.join(out, "fonts")
    os.makedirs(fonts_dir, exist_ok=True)
    built = fontkit.build_faces(bundle_text(out, cfgs), fonts_dir)
    families: dict[str, list[dict]] = {}
    cmaps: dict[str, set[int]] = {}
    for e in built:
        families.setdefault(e["family"], []).append({"weight": e["weight"], "style": e["style"], "file": f"fonts/{e['file']}"})
        if e["weight"] == 400 and e["style"] == "normal":
            cmaps[e["family"]] = e["cmap"]
        print(f"  {e['file']:34} {e['bytes'] / 1e3:7.1f} kB  {e['glyphs']:5} glyphs" + (f"  composed {e['patched']}" if e["patched"] else ""))
    fontkit.copy_licences(fonts_dir)
    check_coverage(out, cmaps)
    return [{"name": n, "variants": v, "redistributable": True} for n, v in families.items()]


def check_coverage(out: str, cmaps: dict[str, set[int]]) -> None:
    """Every character an edition sets must be in its lettering face (the
    balloons, the credits); the display face only sets titles and sound
    effects, checked on those."""
    problems = []
    for loc in EDITIONS:
        text = ""
        for name in os.listdir(os.path.join(out, "chapters", loc)):
            text += ALT_ATTR.sub("", open(os.path.join(out, "chapters", loc, name), encoding="utf-8").read())
        body = {c for c in text if not c.isspace() and c not in "#{}\\*<>:=\"[]_" }
        for face in {lettering_face(loc), text_face(loc)}:
            missing = sorted(c for c in body if ord(c) not in cmaps[face])
            if missing:
                problems.append(f"{loc} {face}: {''.join(missing)}")
        display_text = "Pepper&Carrot" + "".join(re.findall(r"^# ([^{\n]+)", text, re.M)) + "".join(re.findall(r"^sfx(?:\{(?![^}]*writing)[^}]*\})?: (.*)$", text, re.M))
        dmissing = sorted({c for c in display_text if not c.isspace() and ord(c) not in cmaps[display_face(loc)]})
        if dmissing:
            problems.append(f"{loc} {display_face(loc)} (titles/sfx): {''.join(dmissing)}")
    if problems:
        raise SystemExit("faces lack characters the bundle sets:\n  " + "\n  ".join(problems))


# --- manifest ----------------------------------------------------------------------------------------

META = {
    "id": PRESET_ID,
    "name": "Pepper&Carrot · Pepper's Birthday Party",
    "description": (
        "El episodio 8 del cómic de David Revoy en siete idiomas: las viñetas originales sin texto, con los "
        "bocadillos y la rotulación que el motor compone a partir de las traducciones oficiales; los bocadillos "
        "japoneses van en vertical y las páginas árabes se leen de derecha a izquierda · Episode 8 of David "
        "Revoy's webcomic in seven languages: the original text-free panels, with balloons and lettering the "
        "engine sets from the official translations; the Japanese balloons are set vertically and the Arabic "
        "pages read right to left"
    ),
    "locale": DEFAULT,
    "locales": list(EDITIONS),
    "thumbnail": "thumbnail.jpg",
    "license": "CC BY 4.0 · OFL fonts",
    "credits": "David Revoy · Pepper&Carrot translators · peppercarrot.com",
    "tags": ["comic", "panels", "balloons", "multilingual", "vertical", "right-to-left"],
}


def write_manifest(out: str, chapters: dict, shared: list[dict], fonts: list[dict], cfg: dict, localized: dict) -> dict:
    manifest = {
        "version": 2,
        "configVersion": CONFIG_VERSION,
        **META,
        # Eight pages: the canvas shows the whole book.
        "view": {"canvasScope": "book"},
        "chapters": chapters,
        "config": cfg,
        "localized": localized,
        "resources": shared,
        "fonts": fonts,
    }
    with open(os.path.join(out, "preset.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=1, ensure_ascii=False)
        f.write("\n")
    return dict(META)


def write_credits_md(out: str, credits: dict) -> None:
    rows = "\n".join(
        f"| `{loc}` | {credits[lang]['title']} | {credits[lang]['attribution']} |" for loc, lang in EDITIONS.items()
    )
    faces = "\n".join(f"- {n}: `fonts/{lic}`" for n, lic in fontkit.LICENCES.items())
    text = (
        "# Credits — Pepper&Carrot · Pepper's Birthday Party\n\n"
        "Showcase preset for the Postext sandbox: episode 8 of the webcomic Pepper&Carrot (June 2015), in seven\n"
        "languages, re-lettered and re-laid out by Postext.\n\n"
        "## The comic\n\n"
        "Based on the webcomic Pepper&Carrot by David Revoy. https://www.peppercarrot.com\n"
        "Licensed under the Creative Commons Attribution 4.0. " + LICENCE_URL + "\n"
        "Based on the universe of Hereva created by David Revoy with contributions by Craig Maloney.\n"
        "Corrections by Willem Sonke, Moini, Hali, CGand and Alex Gryson.\n\n"
        "Art & Scenario: David Revoy. Episode sources: " + EPISODE_SOURCE + "\n\n"
        "## Translations\n\n| edition | title | credits |\n| --- | --- | --- |\n" + rows + "\n\n"
        "## Changes\n\n"
        "The pictures are David Revoy's text-free art (`hi-res/gfx-only`), cut into one picture per panel and\n"
        "scaled to 1200 px. The words come from each translation's Inkscape SVG; the balloons, their tails and\n"
        "the lettering are new, laid out by the Postext engine. Speaker anchors, faces and safe areas were\n"
        "marked for the port. The title page and the credits page are new.\n\n"
        "## Fonts\n\n"
        "All under the SIL Open Font License 1.1, from google/fonts; the Chinese, Japanese and Arabic faces are\n"
        "subset. Comic Neue, Zen Antique, ZCOOL KuaiLe and Playpen Sans Arabic carry letters composed from\n"
        "their own glyphs (ồ ự for a translator's name, ŗ for the monsters' voice), which they lack; none\n"
        "of these faces has a Reserved Font Name.\n\n" + faces + "\n\n"
        "## Build\n\n"
        "`scripts/presets/showcase/pepper-carrot/` in the Postext repository: `fetch.py`, `fonts.py`, `panels.py`,\n"
        "`anchors.py`, `manifest.py` and `text.py` prepare the pictures and the text, `build.py` writes this\n"
        "bundle.\n"
    )
    with open(os.path.join(out, "CREDITS.md"), "w", encoding="utf-8") as f:
        f.write(text)


def main() -> None:
    args = sys.argv[1:]
    out = args[args.index("--out") + 1] if "--out" in args else OUT
    manifest = load_json(os.path.join(PC_OUT, "manifest.json"))
    credits = manifest["credits"]
    keep_fonts = "--keep-fonts" in args and os.path.exists(os.path.join(out, "preset.json"))
    old_fonts = json.load(open(os.path.join(out, "preset.json"), encoding="utf-8"))["fonts"] if keep_fonts else None
    for sub in ("chapters", "resources") + (() if keep_fonts else ("fonts",)):
        shutil.rmtree(os.path.join(out, sub), ignore_errors=True)
    os.makedirs(out, exist_ok=True)
    chapters = write_chapters(out, manifest)
    shared = resources(out, manifest)
    cfg, localized = localized_configs()
    fonts = old_fonts if keep_fonts else build_fonts(out, [config(loc) for loc in EDITIONS])
    meta = write_manifest(out, chapters, shared, fonts, cfg, localized)
    write_credits_md(out, credits)
    _common.copy_thumbnail(HERE, out)
    _common.write_fingerprint(out)
    if out == OUT:
        # After the right-bound books on the home shelf.
        _common.register(PRESET_ID, {**meta, "shelfOrder": 4})
    print(f"wrote {out} ({_common.bundle_size(out):.1f} MB)")


if __name__ == "__main__":
    main()
