#!/usr/bin/env python3
"""`$PC_OUT/manifest.json`: everything the bundle build needs besides the
per-language Markdown.

- `panels`: one entry per cut panel picture: id, file, pixel size, the
  page and the box it came from (page px of the 2481x3503 art), the safe
  area (fractions of the picture: the characters and the action, what a
  crop must keep), the speaker anchors (`ResourceAnchor`, SPEC D1.4), the
  corner radius, English alt text;
- `pages`: the `split=` expression of every story page and its panels;
- `credits`: per language the translators from `lang/<xx>/info.json`, the
  attribution line, the credit line as the translator lettered it on the
  last page, the episode title;
- `licence`, `sources`, the derivative note;
- `suggestedConfig`: frame margins and gutters measured on the art, the
  rounded panel style of page 2, the cast (the monsters speak in black
  balloons) and a `writing` balloon style for words drawn on objects.

    python3 manifest.py
"""
from __future__ import annotations

import re

from common import EPISODE_URL, LANGS, PAGE_H, PAGE_W, STORY_PAGES, cache, load_json, out, save_json
from slots import language_texts, page_slots

# Safe areas read off the panels (fractions of the cut picture).
SAFE: dict[str, tuple[float, float, float, float]] = {
    "e08p01-1": (0.10, 0.12, 0.86, 0.88),   # Pepper on the bed, Carrot bottom right
    "e08p01-2": (0.23, 0.00, 0.38, 1.00),   # the two faces; the bokeh on the right is free
    "e08p01-3": (0.18, 0.00, 0.58, 1.00),
    "e08p01-4": (0.02, 0.05, 0.90, 0.95),   # Carrot pointing at the framed drawing
    "e08p02-1": (0.15, 0.08, 0.85, 0.92),   # Pepper left, Carrot right
    "e08p02-2": (0.08, 0.05, 0.72, 0.90),   # Carrot, the envelope, Pepper writing
    "e08p02-3": (0.00, 0.08, 1.00, 0.92),   # the broom at the top, Coriander below
    "e08p02-4": (0.00, 0.10, 1.00, 0.90),   # Shichimi at the top, Pepper at the bottom
    "e08p02-5": (0.00, 0.18, 1.00, 0.82),   # the broom against the sun, Saffron below
    "e08p03-1": (0.45, 0.05, 0.50, 0.90),   # the house
    "e08p03-2": (0.22, 0.10, 0.60, 0.85),   # Carrot, the table, Pepper
    "e08p03-3": (0.22, 0.12, 0.58, 0.83),
    "e08p04-1": (0.20, 0.15, 0.68, 0.80),
    "e08p04-2": (0.30, 0.15, 0.55, 0.80),   # Pepper by the lantern, Carrot asleep
    "e08p04-3": (0.10, 0.05, 0.80, 0.95),   # the face
    "e08p05-1": (0.00, 0.00, 0.92, 1.00),   # Carrot, Pepper, the book
    "e08p05-2": (0.00, 0.05, 0.90, 0.95),   # the circles and Pepper
    "e08p05-3": (0.10, 0.00, 0.88, 1.00),   # the sound effect and the face
    "e08p06-1": (0.00, 0.05, 1.00, 0.95),   # three demons, Pepper and Carrot
    "e08p06-2": (0.50, 0.00, 0.48, 1.00),   # the face on the right
    "e08p06-3": (0.03, 0.05, 0.94, 0.95),   # the whole table
}
ANCHOR_PAD = 0.04  # a safe area always holds its anchors with this margin

ALT: dict[str, str] = {
    "e08p01-1": "Pepper sits on the edge of her bed in a sunlit attic, her hands on her knees. Carrot watches her from the floor.",
    "e08p01-2": "Close-up: Pepper looks to the right, sad. Carrot looks up at her.",
    "e08p01-3": "Pepper hides her face in her arm. Carrot leans against her, worried.",
    "e08p01-4": "Carrot points at a framed drawing of the witches of the Potion Contest, next to a winner's coin.",
    "e08p02-1": "Pepper sits up on her bed, delighted. Carrot sits facing her.",
    "e08p02-2": "Pepper writes with a quill while Carrot holds up an envelope. A small white bird sits on the windowsill.",
    "e08p02-3": "Coriander, at her window, gives a thumbs-up as Pepper and Carrot fly past on a broom. A black hen sits beside her.",
    "e08p02-4": "Seen from above, Shichimi holds up her invitation by a cauldron in a green clearing, her fox at her feet. Pepper, on her broom, waves back.",
    "e08p02-5": "Saffron reads her invitation on a balcony over the rooftops, her white cat beside her. Pepper and Carrot fly off into the sunset.",
    "e08p03-1": "Pepper's house at the edge of a wood on a fine day.",
    "e08p03-2": "Inside, bunting hangs from the beams and cakes and a teapot wait on the low table. Pepper throws up her arms; Carrot grins.",
    "e08p03-3": "Later: Pepper waits, chin in hand, a cupcake in the other. Carrot dozes on the table.",
    "e08p04-1": "Rain pours through the awning. Pepper looks out, anxious; Carrot sits soaked by the table.",
    "e08p04-2": "Night and rain: Pepper sits alone by a lantern at the party table, scowling. Carrot sleeps.",
    "e08p04-3": "Close-up of Pepper's face under her hat in the rain, her eyes red, her jaw set.",
    "e08p05-1": "Lightning. Pepper, furious, pulls a book with a demon's face on its cover from the shelf. Carrot is terrified.",
    "e08p05-2": "From above, in the rain, Pepper draws three glowing red magic circles on the ground with her wand. Carrot watches.",
    "e08p05-3": "Red light floods the scene. Pepper, grim, holds the open book.",
    "e08p06-1": "Pepper and Carrot stand before three huge red-eyed demons that rise in the storm, lightning crackling around them.",
    "e08p06-2": "Pepper smiles a sly smile.",
    "e08p06-3": "The party: Pepper, Carrot and the three demons drink tea around the table by candlelight, all smiling.",
}

LANG_NAMES = {"en": "English", "ja": "Japanese", "es": "Spanish", "fr": "French", "cn": "Simplified Chinese", "ca": "Catalan", "ar": "Arabic"}

# "A derivative of …" in each edition's language.
DERIVATIVE = {
    "en": "A derivative of “{title}” by David Revoy, licensed under CC BY 4.0: the balloons and the lettering were rebuilt and the pages laid out again by Postext from the official English translation.",
    "fr": "Œuvre dérivée de « {title} » de David Revoy, sous licence CC BY 4.0 : bulles et lettrage refaits et pages remises en page par Postext à partir de la version française originale.",
    "es": "Obra derivada de «{title}», de David Revoy, con licencia CC BY 4.0: Postext ha rehecho los bocadillos y la rotulación y ha vuelto a componer las páginas a partir de la traducción oficial al español.",
    "ca": "Obra derivada de «{title}», de David Revoy, amb llicència CC BY 4.0: Postext n'ha refet els globus i la retolació i n'ha tornat a compondre les pàgines a partir de la traducció oficial al català.",
    "ja": "David Revoy『{title}』（CC BY 4.0）の二次著作物です。公式日本語訳をもとに、Postext が吹き出しと写植を作り直し、ページを組み直しました。",
    "cn": "本作品为 David Revoy《{title}》（CC BY 4.0）的衍生作品：Postext 依据官方简体中文译本重新制作了对白框与文字，并重新排版。",
    "ar": "عمل مشتق من «{title}» لديفيد ريفوي، مرخّص بموجب CC BY 4.0: أعاد Postext رسم فقاعات الحوار وكتابة النصوص وتنضيد الصفحات انطلاقًا من الترجمة العربية الرسمية.",
}


def clean_name(s: str) -> str:
    return re.sub(r"\s*<[^>]*>", "", s).strip()


def credits(lang: str, titles: dict, credit_lines: dict) -> dict:
    info = load_json(cache("lang", lang, "info.json")).get("credits", {})
    roles = {k: [clean_name(n) for n in v if clean_name(n) and clean_name(n).lower() != "original version"] for k, v in info.items()}
    original = any(clean_name(n).lower() == "original version" for n in info.get("translation", []))
    translators = roles.get("translation", [])
    if original:
        line = "Art & Scenario: David Revoy (original version)"
    else:
        line = "Art & Scenario: David Revoy — Translation: " + ", ".join(translators)
    extra = {k: v for k, v in roles.items() if k != "translation" and v}
    if extra:
        line += " — " + " — ".join(f"{k.capitalize()}: {', '.join(v)}" for k, v in extra.items())
    title = titles.get(lang, "")
    plain_title = re.sub(r"^[^:：]*[:：]\s*", "", title)  # drop "Episode 8: "
    return {
        "lang": lang,
        "locale": LANGS[lang],
        "language": LANG_NAMES[lang],
        "title": title,
        "shortTitle": plain_title,
        "originalVersion": original,
        "translation": translators,
        **{k: v for k, v in roles.items() if k != "translation"},
        "attribution": line,
        "letteredCredit": credit_lines.get(lang, ""),
        "derivative": DERIVATIVE[lang].format(title=plain_title),
    }


def safe_area(pid: str, anchors: list[dict]) -> dict:
    x, y, w, h = SAFE.get(pid, (0.05, 0.05, 0.9, 0.9))
    x1, y1 = x + w, y + h
    for a in anchors:
        if 0 <= a["x"] <= 1 and 0 <= a["y"] <= 1:
            x, y = min(x, max(0, a["x"] - ANCHOR_PAD)), min(y, max(0, a["y"] - ANCHOR_PAD))
            x1, y1 = max(x1, min(1, a["x"] + ANCHOR_PAD)), max(y1, min(1, a["y"] + ANCHOR_PAD))
    return {"x": round(x, 3), "y": round(y, 3), "width": round(x1 - x, 3), "height": round(y1 - y, 3)}


def main() -> None:
    panels = load_json(out("panels.json"))
    anchors = load_json(out("anchors.json"))
    titles = load_json(cache("hi-res", "titles.json"))
    mm = 25.4 / 300

    # The credit line each translator lettered under the last panel.
    last = STORY_PAGES[-1]
    slots = page_slots(last, panels)
    credit_slot = next((s for s in slots if s.kind == "credits"), None)
    credit_lines = {}
    if credit_slot:
        for lang in LANGS:
            credit_lines[lang] = language_texts(lang, last, slots).get(credit_slot.id, "")

    out_panels, pages = [], {}
    radii = []
    for page in STORY_PAGES:
        info = panels["pages"][page]
        pages[page] = {"split": info["split"], "panels": [p["id"] for p in info["panels"]]}
        for p in info["panels"]:
            a = anchors.get(p["id"], {})
            anc = [{"id": x["id"], "x": x["x"], "y": x["y"]} for x in a.get("anchors", [])]
            if p["radius"]:
                radii.append(p["radius"])
            out_panels.append({
                "id": p["id"],
                "file": p["file"],
                "width": p["width"],
                "height": p["height"],
                "page": page,
                "index": p["index"],
                "box": p["box"],
                "cut": p["cut"],
                "safeArea": safe_area(p["id"], anc),
                "anchors": anc,
                "anchorNotes": [{"id": x["id"], "source": x["source"]} for x in a.get("anchors", [])],
                "freeText": a.get("freeText", []),
                "radius": p["radius"],
                "radiusMm": round(p["radius"] * mm, 2),
                "alt": ALT.get(p["id"], ""),
            })

    radius_mm = round(sorted(radii)[len(radii) // 2] * mm, 1) if radii else 0
    fm = panels["frameMm"]
    manifest = {
        "episode": {
            "number": 8,
            "title": titles.get("en", ""),
            "originalLanguage": "fr",
            "published": load_json(cache("info.json")).get("published"),
            "url": "https://www.peppercarrot.com/en/webcomic/ep08_Pepper-s-Birthday-Party.html",
            "sources": EPISODE_URL,
        },
        "art": {"pageSizePx": [PAGE_W, PAGE_H], "dpi": 300, "pageSizeMm": [round(PAGE_W * mm, 1), round(PAGE_H * mm, 1)],
                "frame": panels["frame"], "frameMm": fm, "gutters": panels["gutters"]},
        "licence": {
            "name": "CC BY 4.0",
            "url": "https://creativecommons.org/licenses/by/4.0/",
            "author": "David Revoy",
            "attribution": "Art & Scenario: David Revoy — www.peppercarrot.com",
            "derivativeNote": "Re-lettered and re-laid out by Postext: the balloons and the lettering are generated by the engine from the official translations; the art is David Revoy's text-free artwork, cut into panels.",
        },
        "sources": [
            EPISODE_URL,
            "https://www.peppercarrot.com",
            "https://framagit.org/peppercarrot/webcomics",
            "https://www.davidrevoy.com/article605/best-practices-for-attribution",
        ],
        "pages": pages,
        "panels": out_panels,
        "credits": {lang: credits(lang, titles, credit_lines) for lang in LANGS},
        "suggestedConfig": {
            "page": {"widthMm": 210, "heightMm": 297, "marginsMm": fm},
            "comics": {
                "gutter": {"horizontal": f"{panels['gutters']['rowsMm']}mm", "vertical": f"{panels['gutters']['columnsMm']}mm"},
                "panel": {"borderWidth": "0mm", "borderStyle": "none"},
                "panelStyles": [{"id": "rounded", "borderRadius": f"{radius_mm}mm", "borderStyle": "none"}],
                "balloonStyles": [{"id": "writing", "shape": "none", "fontFamily": "serif", "fontScale": 0.8, "color": "#3b2a1e", "tail": "none"}],
                "cast": [
                    {"id": "pepper", "name": "Pepper"},
                    {"id": "carrot", "name": "Carrot"},
                    {"id": "monster", "name": "Monsters of Chaosah", "fill": "#0f0f0f", "color": "#ffffff"},
                ],
            },
        },
    }
    save_json(out("manifest.json"), manifest)
    print("manifest:", len(out_panels), "panels,", len(pages), "pages")


if __name__ == "__main__":
    main()
