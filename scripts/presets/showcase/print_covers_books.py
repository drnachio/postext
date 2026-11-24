"""The print cover of each showcase book (#1709), read by `print_covers.py`.

Each book is a `Spec`: its print version per language, its cover design
per language, the paragraph styles its cover text is set in, the cover
Markdown per language, and the pictures the cover adds to the bundle.
Measures are mm on the zone an item stands in (`front`, `spine`, `back`,
`flapFront`, `flapBack`, a case's `jointFront`/`jointBack`); the boards of
a case are the trim less 7 mm at the spine plus a 3 mm square, and stand
3 mm higher than the page at head and foot.
"""
from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from typing import Callable

from _common import PRESETS_ROOT, mm, pt


def C(hex_: str) -> dict:
    return {"hex": hex_, "model": "hex"}


def box(id_: str, zone: str, x: float, y: float, w: float, h: float, color: str, **extra) -> dict:
    return {"id": id_, "kind": "box", "zone": zone, "x": round(x, 2), "y": round(y, 2), "width": round(w, 2), "height": round(h, 2), "color": C(color), **extra}


def img(id_: str, zone: str, x: float, y: float, w: float, h: float, resource: str, **extra) -> dict:
    return {"id": id_, "kind": "image", "zone": zone, "x": round(x, 2), "y": round(y, 2), "width": round(w, 2), "height": round(h, 2), "resourceId": resource, **extra}


def tb(name: str, w: float, h: float, to: str, edge: str, x: float = 0, y: float = 0, **extra) -> dict:
    """A text box of the size given, anchored to a zone's safe area or to
    another box."""
    return {"name": name, "rect": {"x": 0, "y": 0, "width": round(w, 2), "height": round(h, 2)}, "anchor": {"to": to, "edge": edge, "x": x, "y": y}, **extra}


def ps(id_: str, name: str, family: str, size: float, lead: float, color: str, align: str = "center", **extra) -> dict:
    """A cover paragraph style: no hyphenation, no indent."""
    # Italic and bold runs keep the style's colour (they would otherwise
    # take the book's emphasis colour, unreadable on a dark ground).
    return {
        "id": id_, "name": name, "fontFamily": family, "fontSize": pt(size), "lineHeight": pt(lead),
        "color": C(color), "italicColor": C(color), "boldColor": C(color), "textAlign": align,
        "hyphenation": False, "firstLineIndent": mm(0), **extra,
    }


def esc(text: str) -> str:
    """Plain text for a cover paragraph: the Markdown emphasis marks a
    title or a credit may carry (Sagittarius A*) are written literally."""
    return re.sub(r"([*_])", r"\\\1", text)


def lines(*parts: str) -> str:
    """Lines of one paragraph, each after a hard break."""
    return "\\\n".join(parts)


def chapter_specs(book: str, lang: str) -> list[dict]:
    p = json.load(open(os.path.join(PRESETS_ROOT, book, "preset.json"), encoding="utf-8"))
    ch = p["chapters"]
    return ch if isinstance(ch, list) else ch[lang]


def headings(book: str, lang: str) -> list[tuple[str, dict]]:
    """Every level-one heading of a language's chapters: its text and its
    attributes, read from the committed bundle so the cover says what the
    book's own cover and back pages say."""
    out = []
    for spec in chapter_specs(book, lang):
        for line in open(os.path.join(PRESETS_ROOT, book, spec["file"]), encoding="utf-8"):
            m = re.match(r"^# (.*?)\s*\{(.*)\}\s*$", line)
            if m:
                out.append((m.group(1), dict(re.findall(r'(\w+)="([^"]*)"', m.group(2)))))
    return out


def heading_attrs(book: str, lang: str, style: str) -> dict:
    for _, attrs in headings(book, lang):
        if attrs.get("style") == style:
            return attrs
    raise SystemExit(f"{book}/{lang}: no heading in style {style}")


def front_matter(book: str, lang: str) -> dict:
    first = chapter_specs(book, lang)[0]
    text = open(os.path.join(PRESETS_ROOT, book, first["file"]), encoding="utf-8").read()
    m = re.match(r"---\n(.*?)\n---", text, re.S)
    return dict(re.findall(r'^(\w+):\s*"(.*)"\s*$', m.group(1), re.M)) if m else {}


def styled(style: str, text: str) -> str:
    return f':::paragraphs{{style="{style}"}}\n{text}\n:::\n'


def frame(slot: str, body: str = "", sheet: str | None = None) -> str:
    where = f' sheet="{sheet}"' if sheet else ""
    return f':::frame{{slot="{slot}"{where}}}\n{body}:::\n'


def cover_md(*frames: str) -> str:
    return "\n".join(frames)


@dataclass
class Spec:
    production: Callable[[str], dict]
    cover: Callable[[str], dict]
    styles: Callable[[str], list[dict]]
    markdown: Callable[[str], str]
    resources: list[dict] = field(default_factory=list)
    folio: Callable[[dict], dict] | None = None


# Case boards for a trim: 7 mm set back at the spine, a 3 mm square.
def board(page_w: float, page_h: float) -> tuple[float, float]:
    return page_w - 7 + 3, page_h + 6


# --- Paradise Lost ------------------------------------------------------------------
#
# A cloth case in a dust jacket, as Doré's Milton was sold: the jacket in
# the night and gold of the cover page (the first plate in a gold frame on
# the front, the last on the back over the closing lines and the blurb),
# its flaps with the edition's note; the black cloth case stamped in gold
# foil on the spine only; cream endpapers.

def paradise_lost() -> Spec:
    W, H = 156.0, 234.0
    BW, BH = board(W, H)
    night, gold, cream, rule = "#17151a", "#c9a96a", "#efe6d2", "#9c8f7d"

    def production(lang: str) -> dict:
        return {"versions": [{"id": "hardcover", "name": "Cloth, in a dust jacket", "binding": "case-flat", "caseMaterial": "cloth", "flaps": True}]}

    def framed(prefix: str, zone: str, x: float, y: float, w: float, h: float, res: str) -> list[dict]:
        return [box(f"{prefix}-frame", zone, x - 2.2, y - 2.2, w + 4.4, h + 4.4, gold), img(f"{prefix}-plate", zone, x, y, w, h, res, fit="cover")]

    def spine_rules(prefix: str, after: str) -> list[dict]:
        # Two pairs of gold rules across the spine, at head and foot: each
        # ends on the left of the zone after the spine, so it follows it.
        out = []
        for k, y in enumerate((14, 16.2, BH - 16.7, BH - 15)):
            out.append(box(f"{prefix}-rule-{k}", "spine", 0, y, 0, 0.5 if k in (1, 2) else 1.1, gold, to={"zone": after, "x": 0}))
        return out

    plate_w = 100.0
    plate_h = round(plate_w * 1210 / 959, 1)
    back_w = 64.0
    back_h = round(back_w * 1280 / 1032, 1)
    jacket = {
        "background": C(night),
        "verticalAlign": {"front": "top", "back": "top", "flapFront": "top", "flapBack": "top"},
        "elements": [
            *framed("front", "front", (BW - plate_w) / 2, 24, plate_w, plate_h, "plate-01-cover"),
            *framed("back", "back", (BW - back_w) / 2, 30, back_w, back_h, "plate-50-cover"),
            *spine_rules("j", "front"),
        ],
        "textBoxes": [
            tb("title", 120, 40, "front", "top", 0, 24 + plate_h + 4),
            tb("quote", 106, 40, "back", "top", 0, 30 + back_h + 4, maxHeight=60),
            tb("imprint", 106, 8, "back", "bottom", 0, -14),
        ],
    }
    case = {
        "background": C(night),
        "elements": spine_rules("c", "jointFront"),
        "finishes": [{"id": f"foil-{k}", "process": "foil", "sheen": "gloss", "shape": {"element": f"c-rule-{k}"}} for k in range(4)],
    }
    endpapers = {"background": C(cream)}

    def cover(lang: str) -> dict:
        return {**jacket, "sheets": {"case": case, "endpapers": endpapers}}

    def styles(lang: str) -> list[dict]:
        return [
            ps("cover-title", "Cover: title", "IM Fell English", 30, 32, cream, letterSpacing=pt(1.5)),
            ps("cover-author", "Cover: author", "IM Fell English SC", 12.5, 15, gold, letterSpacing=pt(2), marginTop=pt(12)),
            ps("cover-subtitle", "Cover: edition", "EB Garamond", 9, 12, cream, italic=True, marginTop=pt(14)),
            ps("cover-spine", "Cover: spine", "IM Fell English", 15, 17, gold, letterSpacing=pt(1.2)),
            ps("cover-quote", "Cover: quotation", "IM Fell English", 11.5, 16, cream, italic=True, marginBottom=pt(12)),
            ps("cover-blurb", "Cover: blurb", "EB Garamond", 9.2, 13.3, cream),
            ps("cover-imprint", "Cover: imprint", "IM Fell English SC", 9, 11, gold, letterSpacing=pt(1.2)),
            ps("cover-flap", "Cover: flap", "EB Garamond", 9, 13, cream, align="left", spaceBetween=pt(5)),
            ps("cover-flap-head", "Cover: flap heading", "IM Fell English SC", 10, 13, gold, align="left", letterSpacing=pt(1.2), marginBottom=pt(6)),
        ]

    def markdown(lang: str) -> str:
        return cover_md(
            frame("front", "", "jacket case"),
            frame("title",
                  styled("cover-title", "Paradise Lost")
                  + styled("cover-author", "John Milton")
                  + styled("cover-subtitle", "The text of 1674, with notes by A. W. Verity\\\nand the fifty plates of Gustave Doré"),
                  "jacket"),
            frame("quote",
                  styled("cover-quote", "The world was all before them, where to choose\\\nTheir place of rest, and Providence their guide;\\\nThey, hand in hand, with wandering steps and slow,\\\nThrough Eden took their solitary way.")
                  + styled("cover-blurb", "Milton’s epic of the war in Heaven, the fall of the rebel angels and the loss of Eden, in the twelve books of 1674, each with his own Argument. Verity’s notes stand at the foot of the page, and Doré’s fifty engravings at the passages they illustrate."),
                  "jacket"),
            frame("imprint", styled("cover-imprint", "Postext · postext.dev"), "jacket"),
            frame("back", "", "jacket case"),
            frame("flapFront",
                  styled("cover-flap-head", "The poem")
                  + styled("cover-flap", "*Paradise Lost* was first printed in ten books in 1667 and in twelve in 1674, the year of Milton’s death. This edition sets the poem of 1674 line for line, in modern spelling, with the standard numbering of the lines.\n\nEach book opens with the Argument Milton wrote for it, a prose summary of what is to come."),
                  "jacket"),
            frame("flapBack",
                  styled("cover-flap-head", "This edition")
                  + styled("cover-flap", "The notes are a selection from A. W. Verity’s edition (Cambridge, 1910), keyed to the lines. The plates are Gustave Doré’s wood engravings for the Cassell edition of 1866.\n\nSet in EB Garamond and the Fell types digitised by Igino Marini. A showcase edition of Postext, postext.dev."),
                  "jacket"),
            frame("spine", styled("cover-spine", "Paradise Lost · Milton")),
        )

    return Spec(production, cover, styles, markdown)



# --- shared: the softcover magazines and textbooks -----------------------------------

PAPERBACK = {"es": "Rústica", "en": "Paperback"}


def perfect(names: dict[str, str], **extra) -> Callable[[str], dict]:
    def production(lang: str) -> dict:
        return {"versions": [{"id": "paperback", "name": names[lang], "binding": "perfect", **extra}]}
    return production


def as_paperback(folio: dict) -> dict:
    """Folio binds the book as its print version: a softcover glued at the
    spine (the book's own `folio.binding` wins over the version's)."""
    return {"binding": {**folio.get("binding", {}), "type": "paperback"}}


# --- Cielo profundo · Deep Sky --------------------------------------------------------
#
# A square-backed magazine, glued: the front is the cover page (the
# NOIRLab galaxy across the head, the masthead under it), the back the
# back page (Sagittarius A* in polarised light over the masthead and the
# blurb), the spine black with the issue on it.

def deep_sky() -> Spec:
    W, H = 225.0, 297.0
    ink, black, band, muted, white = "#14181d", "#000000", "#2a7f97", "#666b73", "#ffffff"
    BOOK = "deep-sky"

    def cover(lang: str) -> dict:
        return {
            "background": C(ink),
            "zones": {"back": C(black)},
            "elements": [
                img("photo", "front", 0, -3, W + 3, 146.5, "noirlab2612a", fit="cover"),
                img("back-photo", "back", (W - 150) / 2, 38, 150, 150, "eso2406a", fit="cover"),
            ],
            "textBoxes": [
                tb("masthead", 195, 100, "front", "top-left", 11, 149.5),
                tb("publisher", 195, 8, "front", "bottom-left", 11, -11),
                tb("back-head", 160, 50, "back", "top", 0, 199),
                tb("back-foot", 160, 14, "back", "bottom", 0, -10),
            ],
        }

    def styles(lang: str) -> list[dict]:
        caps = {"textTransform": "uppercase"}
        return [
            ps("cover-issue", "Cubierta: número", "Chivo", 11, 14, band, "left", fontWeight=700, letterSpacing=pt(2.6), **caps),
            ps("cover-title", "Cubierta: título", "Archivo", 83, 80, white, "left", fontWeight=700, marginTop=pt(11)),
            ps("cover-subtitle", "Cubierta: subtítulo", "Newsreader", 19.5, 24, white, "left", italic=True, marginTop=pt(17)),
            ps("cover-publisher", "Cubierta: editor", "Chivo", 10.4, 13, muted, "left", letterSpacing=pt(1.8), **caps),
            ps("cover-back-title", "Cubierta: cabecera", "Archivo", 39, 42, white, fontWeight=700),
            ps("cover-blurb", "Cubierta: texto", "Newsreader", 15, 20, white, italic=True, marginTop=pt(14)),
            ps("cover-back-issue", "Cubierta: número (contra)", "Chivo", 9.75, 12, muted, fontWeight=700, letterSpacing=pt(2.1), marginBottom=pt(6), **caps),
            ps("cover-credit", "Cubierta: crédito", "Chivo", 7.8, 10, muted),
            ps("cover-spine", "Cubierta: lomo", "Chivo", 6.5, 6.5, white, fontWeight=700, letterSpacing=pt(1.3), **caps),
        ]

    def markdown(lang: str) -> str:
        fm = front_matter(BOOK, lang)
        front = heading_attrs(BOOK, lang, "portada")
        back = heading_attrs(BOOK, lang, "contraportada")
        return cover_md(
            frame("front"),
            frame("masthead", styled("cover-issue", esc(front["issue"])) + styled("cover-title", esc(fm["title"])) + styled("cover-subtitle", esc(fm["subtitle"]))),
            frame("publisher", styled("cover-publisher", esc(front["publisher"]))),
            frame("back-head", styled("cover-back-title", esc(back["masthead"])) + styled("cover-blurb", esc(back["blurb"]))),
            frame("back-foot", styled("cover-back-issue", esc(back["issue"])) + styled("cover-credit", esc(back["credit"]))),
            frame("spine", styled("cover-spine", esc(f"{fm['title']} · {front['issue']}"))),
        )

    def folio(f: dict) -> dict:
        # A collector's issue on a 150 g silk: 48 pages make a 4 mm square
        # back that takes the issue's line (on the 100 g gloss of a news-stand
        # magazine it would be 2.4 mm, a saddle-stitched issue's).
        return {**as_paperback(f), "paper": {**f.get("paper", {}), "type": "coatedSilk", "grammage": 150, "bulk": 1.0}}

    return Spec(perfect(PAPERBACK, spineText={"minSpine": 3.5}), cover, styles, markdown, folio=folio)


# --- Física universitaria · Physics ---------------------------------------------------
#
# A glued textbook in OpenStax blue: the whirlpool galaxy across the head
# of the front over the series and the title, the back cover's blurb under
# its masthead and an orange rule, as on the book's back page.

def openstax_fisica() -> Spec:
    W, H = 210.0, 275.0
    blue, white, tint, accent = "#005a8c", "#ffffff", "#e8f1f7", "#d9822b"
    BOOK = "openstax-fisica"

    def cover(lang: str) -> dict:
        return {
            "background": C(blue),
            "elements": [img("photo", "front", 0, -3, W + 3, 163, "es-1-cnx-uphysics-01-00-whirlpool", fit="cover")],
            "textBoxes": [
                tb("masthead", 174, 90, "front", "top-left", 15, 165),
                tb("publisher", 174, 8, "front", "bottom-left", 15, -9),
                tb("back-head", 150, 150, "back", "top-left", 11, 35),
                tb("back-foot", 150, 16, "back", "bottom-left", 11, -9),
            ],
        }

    def styles(lang: str) -> list[dict]:
        caps = {"textTransform": "uppercase"}
        return [
            ps("cover-series", "Cubierta: colección", "Source Sans 3", 9, 12, white, "left", fontWeight=700, letterSpacing=pt(2.4), **caps),
            ps("cover-title", "Cubierta: título", "Source Sans 3", 46, 50, white, "left", fontWeight=700, marginTop=pt(8)),
            ps("cover-subtitle", "Cubierta: subtítulo", "Source Serif 4", 13, 17, tint, "left", italic=True, marginTop=pt(14)),
            ps("cover-publisher", "Cubierta: editor", "Source Sans 3", 7.5, 10, tint, "left", letterSpacing=pt(1.4), **caps),
            ps("cover-back-title", "Cubierta: cabecera", "Source Sans 3", 34, 38, white, "left", fontWeight=700, marginTop=pt(8)),
            ps("cover-back-subtitle", "Cubierta: subtítulo (contra)", "Source Serif 4", 12, 16, tint, "left", italic=True, marginTop=pt(11)),
            ps("cover-rule", "Cubierta: filete", "Source Sans 3", 20, 20, accent, "left", fontWeight=700, marginTop=pt(14), marginBottom=pt(12)),
            ps("cover-blurb", "Cubierta: texto", "Source Serif 4", 12, 17, white, "left"),
            ps("cover-site", "Cubierta: sitio", "Source Sans 3", 11, 14, white, "left", fontWeight=700, marginBottom=pt(8)),
            ps("cover-spine", "Cubierta: lomo", "Source Sans 3", 7.5, 7.5, white, fontWeight=700, letterSpacing=pt(1.2), **caps),
        ]

    def markdown(lang: str) -> str:
        fm = front_matter(BOOK, lang)
        front = heading_attrs(BOOK, lang, "portada")
        back = heading_attrs(BOOK, lang, "contraportada")
        return cover_md(
            frame("front"),
            frame("masthead", styled("cover-series", esc(front["series"])) + styled("cover-title", esc(fm["title"])) + styled("cover-subtitle", esc(fm["subtitle"]))),
            frame("publisher", styled("cover-publisher", esc(front["publisher"]))),
            frame("back-head",
                  styled("cover-series", esc(back["series"])) + styled("cover-back-title", esc(back["masthead"]))
                  + styled("cover-back-subtitle", esc(back["subtitle"])) + styled("cover-rule", "———") + styled("cover-blurb", esc(back["blurb"]))),
            frame("back-foot", styled("cover-site", esc(back["site"])) + styled("cover-publisher", esc(back["publisher"]))),
            frame("spine", styled("cover-spine", esc(f"{fm['title']} · OpenStax"))),
        )

    return Spec(perfect(PAPERBACK, spineText={"minSpine": 3.5}), cover, styles, markdown)


# --- Señales 2020 · Signals 2020 --------------------------------------------------------
#
# The EEA's report as a glued paperback: the photograph across the head
# of the front with its blue rule under it, the masthead on the dark
# ground; the back in the report's blue under the lake.

def senales() -> Spec:
    W, H = 168.0, 237.0
    dark, band, white, light, rule, muted, tint = "#1c1f22", "#1f6f8b", "#ffffff", "#5aa9c4", "#cfd4d8", "#9aa0a6", "#e8f0f3"
    BOOK = "senales"

    def cover(lang: str) -> dict:
        return {
            "background": C(dark),
            "zones": {"back": C(band)},
            "elements": [
                img("photo", "front", 0, -3, W + 3, 152, "photo-cover", fit="cover"),
                box("photo-rule", "front", 0, 146, W + 3, 3, band),
                img("back-photo", "back", -3, -3, W + 3, 128, "photo-water-1", fit="cover"),
            ],
            "textBoxes": [
                tb("masthead", 138, 70, "front", "top-left", 11, 155),
                tb("publisher", 138, 10, "front", "bottom-left", 11, -8),
                tb("back-head", 138, 80, "back", "top-left", 9, 133),
                tb("back-foot", 138, 12, "back", "bottom-left", 9, -8),
            ],
        }

    def styles(lang: str) -> list[dict]:
        caps = {"textTransform": "uppercase"}
        return [
            ps("cover-series", "Cubierta: serie", "Outfit", 8, 11, light, "left", fontWeight=700, letterSpacing=pt(2.4), **caps),
            ps("cover-title", "Cubierta: título", "Outfit", 48, 50, white, "left", fontWeight=800, marginTop=pt(6)),
            ps("cover-subtitle", "Cubierta: subtítulo", "Outfit", 14, 18, rule, "left", fontWeight=500, marginTop=pt(11)),
            ps("cover-publisher", "Cubierta: editor", "Outfit", 7, 9.5, muted, "left", letterSpacing=pt(1.4), **caps),
            ps("cover-back-title", "Cubierta: cabecera", "Outfit", 26, 30, white, "left", fontWeight=800),
            ps("cover-blurb", "Cubierta: texto", "Outfit", 11.5, 15.5, white, "left", fontWeight=500, marginTop=pt(14), endIndent=mm(16)),
            ps("cover-back-series", "Cubierta: serie (contra)", "Outfit", 8, 11, white, "left", fontWeight=700, letterSpacing=pt(2.4), marginBottom=pt(5), **caps),
            ps("cover-credit", "Cubierta: crédito", "Outfit", 6.5, 9, tint, "left"),
            ps("cover-spine", "Cubierta: lomo", "Outfit", 6.5, 6.5, white, fontWeight=800, letterSpacing=pt(1.2), **caps),
        ]

    def markdown(lang: str) -> str:
        fm = front_matter(BOOK, lang)
        front = heading_attrs(BOOK, lang, "portada")
        back = heading_attrs(BOOK, lang, "contraportada")
        return cover_md(
            frame("front"),
            frame("masthead", styled("cover-series", esc(front["series"])) + styled("cover-title", esc(fm["title"])) + styled("cover-subtitle", esc(fm["subtitle"]))),
            frame("publisher", styled("cover-publisher", esc(front["publisher"]))),
            frame("back-head", styled("cover-back-title", esc(back["masthead"])) + styled("cover-blurb", esc(back["blurb"]))),
            frame("back-foot", styled("cover-back-series", esc(back["series"])) + styled("cover-credit", esc(back["credit"]))),
            frame("spine", styled("cover-spine", esc(f"{fm['title']} · {front['series']}"))),
        )

    return Spec(perfect(PAPERBACK, spineText={"minSpine": 3.5}), cover, styles, markdown)


# --- Pintura española · Spanish Painting ---------------------------------------------
#
# An exhibition catalogue as museums bind them: sewn, in a softcover with
# flaps. The front is the cover page (El Greco's Laocoön over the title),
# the back the back page (Sorolla on the beach over the blurb); the front
# flap lists the fourteen works, the back flap says where they come from.

PAINTERS = {
    1: "El Greco", 2: "El Greco", 3: "El Greco", 4: "José de Ribera", 5: "Diego Velázquez", 6: "Diego Velázquez",
    7: "Francisco de Zurbarán", 8: "Francisco de Zurbarán", 9: "Bartolomé Esteban Murillo", 10: "Bartolomé Esteban Murillo",
    11: "Francisco de Goya", 12: "Francisco de Goya", 13: "Francisco de Goya", 14: "Joaquín Sorolla",
}

PINTURA_FLAPS = {
    "es": {
        "works": "Las obras",
        "sources": "Las imágenes",
        "sources_text": [
            "Trece de las catorce pinturas están en museos que publican sus colecciones sin restricciones, bajo licencia CC0: The Metropolitan Museum of Art de Nueva York, la National Gallery of Art de Washington y el Cleveland Museum of Art. La decimocuarta, del Museo Sorolla de Madrid, se reproduce a partir de la digitalización de dominio público de Google Art Project.",
            "Los comentarios proceden de Wikipedia (CC BY-SA) o se escribieron para esta edición.",
            "Catálogo de muestra compuesto con Postext · postext.dev",
        ],
    },
    "en": {
        "works": "The works",
        "sources": "The images",
        "sources_text": [
            "Thirteen of the fourteen paintings belong to museums that publish their collections without restrictions, under CC0: The Metropolitan Museum of Art in New York, the National Gallery of Art in Washington and the Cleveland Museum of Art. The fourteenth, in the Museo Sorolla in Madrid, is reproduced from Google Art Project’s public-domain scan.",
            "The commentaries come from Wikipedia (CC BY-SA) or were written for this edition.",
            "A sample catalogue set with Postext · postext.dev",
        ],
    },
}


def pintura_espanola() -> Spec:
    W, H = 210.0, 270.0
    dark, white, stone = "#1c1a19", "#ffffff", "#c8c2b6"
    BOOK = "pintura-espanola"
    names = {"es": "Rústica cosida con solapas", "en": "Sewn paperback with flaps"}

    def production(lang: str) -> dict:
        # 48 pages on 170 g make a 4.6 mm spine: lettered from 4 mm.
        return {"versions": [{"id": "softcover", "name": names[lang], "binding": "sewn-softcover", "flaps": True, "spineText": {"minSpine": 4}}]}

    def cover(lang: str) -> dict:
        back_w = 128.0
        return {
            "background": C(dark),
            "verticalAlign": {"flapFront": "top", "flapBack": "top"},
            "elements": [
                img("painting", "front", 0, -3, W + 3, 171.6, "greco-laocoonte", fit="cover"),
                img("back-painting", "back", (W - back_w) / 2, 30, back_w, round(back_w * 2200 / 2172, 1), "sorolla-paseo", fit="cover"),
            ],
            "textBoxes": [
                tb("masthead", 164, 70, "front", "top-left", 17, 175.6),
                tb("publisher", 164, 8, "front", "bottom-left", 17, -9),
                tb("back-text", 132, 60, "back", "top", 0, 155.4),
                tb("back-foot", 150, 8, "back", "bottom", 0, -9),
            ],
        }

    def styles(lang: str) -> list[dict]:
        caps = {"textTransform": "uppercase"}
        return [
            ps("cover-series", "Cubierta: serie", "IBM Plex Sans Condensed", 8.5, 11, stone, "left", fontWeight=600, letterSpacing=pt(2.4), **caps),
            ps("cover-title", "Cubierta: título", "Bodoni Moda", 54, 58, white, "left", marginTop=pt(8)),
            ps("cover-subtitle", "Cubierta: subtítulo", "EB Garamond", 13, 17, stone, "left", italic=True, marginTop=pt(14), endIndent=mm(10)),
            ps("cover-publisher", "Cubierta: editor", "IBM Plex Sans Condensed", 7.5, 10, stone, "left", letterSpacing=pt(1.8), **caps),
            ps("cover-work", "Cubierta: obra", "EB Garamond", 8.5, 11, stone, italic=True),
            ps("cover-blurb", "Cubierta: texto", "Bodoni Moda", 15, 21, white, marginTop=pt(14)),
            ps("cover-imprint", "Cubierta: sello", "IBM Plex Sans Condensed", 7.5, 10, stone, letterSpacing=pt(1.8), **caps),
            ps("cover-flap-head", "Cubierta: solapa, título", "IBM Plex Sans Condensed", 8.5, 11, stone, "left", fontWeight=600, letterSpacing=pt(2), marginBottom=pt(10), **caps),
            ps("cover-flap", "Cubierta: solapa", "EB Garamond", 9.5, 13, white, "left", spaceBetween=pt(6)),
            ps("cover-flap-list", "Cubierta: solapa, lista", "EB Garamond", 9.5, 12.5, white, "left", spaceBetween=pt(4.5), hangingIndent=mm(5)),
            ps("cover-spine", "Cubierta: lomo", "Bodoni Moda", 7.5, 7.5, white),
        ]

    def works(lang: str) -> list[str]:
        out = []
        for title, attrs in headings(BOOK, lang):
            if "cat" in attrs:
                n = int(attrs["cat"])
                out.append((n, f"{n}\u2002{PAINTERS[n]}, *{esc(title)}*"))
        return [w for _, w in sorted(out)]

    def markdown(lang: str) -> str:
        fm = front_matter(BOOK, lang)
        front = heading_attrs(BOOK, lang, "portada")
        back = heading_attrs(BOOK, lang, "contraportada")
        f = PINTURA_FLAPS[lang]
        return cover_md(
            frame("front"),
            frame("masthead", styled("cover-series", esc(front["series"])) + styled("cover-title", esc(fm["title"])) + styled("cover-subtitle", esc(fm["subtitle"]))),
            frame("publisher", styled("cover-publisher", esc(front["publisher"]))),
            frame("back-text", styled("cover-work", esc(back["work"])) + styled("cover-blurb", esc(back["blurb"]))),
            frame("back-foot", styled("cover-imprint", esc(back["publisher"]))),
            frame("flapFront", styled("cover-flap-head", f["works"]) + styled("cover-flap-list", "\n\n".join(works(lang)))),
            frame("flapBack", styled("cover-flap-head", f["sources"]) + styled("cover-flap", "\n\n".join(f["sources_text"]))),
            frame("spine", styled("cover-spine", esc(f"{fm['title']} · {front['series']}"))),
        )

    return Spec(production, cover, styles, markdown)


# --- Bioquímica ------------------------------------------------------------------------
#
# The textbook's own look on a glued softcover: the cyan band of its
# chapter openers across the head, the molecular illustration of its part
# opener on white, the title in the blue and the face of its headings.
# The back carries the chapter's introduction and the chapters of the
# book's first part.

BIOQ = {
    "es": {
        "title": "Bioquímica",
        "subtitle": "Conceptos esenciales",
        "chapter": "Capítulo 1 · Las bases de la bioquímica",
        "authors": "Feduchi · Romero · Yáñez · Blasco · García-Hoz",
        "publisher": "Editorial Médica Panamericana",
        "part": "Parte I · Los materiales y funciones de la célula",
        "sample": "Capítulo de muestra compuesto con Postext",
    },
    "en": {
        "title": "Biochemistry",
        "subtitle": "Essential concepts",
        "chapter": "Chapter 1 · The foundations of biochemistry",
        "authors": "Feduchi · Romero · Yáñez · Blasco · García-Hoz",
        "publisher": "Editorial Médica Panamericana",
        "part": "Part I · The materials and functions of the cell",
        "sample": "A sample chapter set with Postext",
    },
}


def bioquimica() -> Spec:
    W, H = 210.0, 280.0
    cyan, navy, blue, white, tint, orange = "#35b4e7", "#263471", "#074ea2", "#ffffff", "#e0e2ee", "#f36f21"
    BOOK = "bioquimica-feduchi"
    ill_h = 150.0
    ill_w = round(ill_h * 250.87 / 362.55, 1)

    def cover(lang: str) -> dict:
        return {
            "background": C(white),
            "zones": {"spine": C(navy), "back": C(tint)},
            "elements": [
                box("band", "front", 0, -3, W + 3, 26, cyan),
                box("back-band", "back", -3, -3, W + 3, 26, cyan),
                box("spine-band", "spine", 0, -3, 0, 26, cyan, to={"zone": "front", "x": 0}),
                img("illustration", "front", W + 3 - ill_w, 92, ill_w, ill_h, "illustration-01", fit="contain"),
            ],
            "textBoxes": [
                tb("masthead", 160, 70, "front", "top-left", 10, 30),
                tb("authors", 120, 30, "front", "bottom-left", 10, -6),
                tb("back-text", 150, 150, "back", "top-left", 10, 30),
                tb("back-foot", 150, 12, "back", "bottom-left", 10, -6),
            ],
        }

    def styles(lang: str) -> list[dict]:
        return [
            ps("cover-title", "Cubierta: título", "Optima 105", 64, 66, navy, "left"),
            ps("cover-subtitle", "Cubierta: subtítulo", "Optima 105", 20, 24, blue, "left", marginTop=pt(6)),
            ps("cover-chapter", "Cubierta: capítulo", "Optima 110", 11, 14, navy, "left", marginTop=pt(18)),
            ps("cover-author", "Cubierta: autores", "Optima 105", 12, 16, navy, "left"),
            ps("cover-publisher", "Cubierta: editorial", "Optima 110", 9, 12, blue, "left", marginTop=pt(6)),
            ps("cover-back-head", "Cubierta: contra, título", "Optima 105", 21, 25, navy, "left", marginBottom=pt(14)),
            ps("cover-blurb", "Cubierta: texto", "Adobe Garamond Pro", 13.5, 18.5, navy, "left", spaceBetween=pt(8)),
            ps("cover-part", "Cubierta: parte", "Optima 110", 12, 15, orange, "left", marginTop=pt(26), marginBottom=pt(8)),
            ps("cover-list", "Cubierta: capítulos", "Optima 105", 12, 18, navy, "left"),
            ps("cover-sample", "Cubierta: muestra", "Optima 105", 8, 11, blue, "left"),
        ]

    def part_chapters(lang: str) -> list[str]:
        text = open(os.path.join(PRESETS_ROOT, BOOK, chapter_specs(BOOK, lang)[0]["file"]), encoding="utf-8").read()
        block = re.search(r":::part\{[^}]*\}\n(.*?)\n:::", text, re.S).group(1)
        return [re.sub(r"^(\d+)\.\s+", "\\1\u00a0\u00a0", line) for line in block.splitlines() if line.strip()]

    def intro(lang: str) -> list[str]:
        text = open(os.path.join(PRESETS_ROOT, BOOK, chapter_specs(BOOK, lang)[0]["file"]), encoding="utf-8").read()
        value = re.search(r'intro="([^"]*)"', text).group(1)
        return [esc(p) for p in value.split("\\n\\n")]

    def markdown(lang: str) -> str:
        b = BIOQ[lang]
        return cover_md(
            frame("front"),
            frame("masthead", styled("cover-title", b["title"]) + styled("cover-subtitle", b["subtitle"]) + styled("cover-chapter", b["chapter"])),
            frame("authors", styled("cover-author", b["authors"]) + styled("cover-publisher", b["publisher"])),
            frame("back-text", styled("cover-back-head", b["chapter"]) + styled("cover-blurb", "\n\n".join(intro(lang)))
                  + styled("cover-part", b["part"]) + styled("cover-list", "\n\n".join(part_chapters(lang)))),
            frame("back-foot", styled("cover-sample", b["sample"])),
            frame("spine"),
        )

    pur = {"es": "Encolado PUR de impresión digital", "en": "Digital print, PUR binding"}

    def production(lang: str) -> dict:
        # A sample chapter of 23 pages, 24 once bound: a 1.5 mm spine. A
        # digital printer binds that with PUR glue (the generic perfect
        # profile starts at 3 mm); it is too thin to letter, so the spine
        # carries only the book's colours and its Markdown frame is empty.
        return {
            "bindings": [{"id": "digital-pur", "name": pur[lang], "style": "perfect", "accepts": {"spine": {"min": 1.2}}}],
            "versions": [{"id": "paperback", "name": PAPERBACK[lang], "binding": "digital-pur", "spineText": {"minSpine": 1}}],
        }

    return Spec(production, cover, styles, markdown, folio=as_paperback)


BOOKS: dict[str, Callable[[], Spec]] = {
    "paradise-lost": paradise_lost,
    "deep-sky": deep_sky,
    "openstax-fisica": openstax_fisica,
    "senales": senales,
    "pintura-espanola": pintura_espanola,
    "bioquimica-feduchi": bioquimica,
}


# --- Pepper&Carrot ---------------------------------------------------------------------
#
# A comic album, as Pepper&Carrot's printed books are: a printed case. The
# front is the episode's cover art over the series and the title in each
# language's display face; the back the party at the end of the episode
# over the blurb; the spine in the series' red.

PEPPER_NAMES = {
    "en": "Hardcover", "es": "Cartoné", "ca": "Cartoné", "fr": "Relié", "it": "Cartonato",
    "pt-BR": "Capa dura", "de": "Hardcover", "ja": "上製本", "zh-Hans": "精装", "ar": "غلاف مقوى",
}

PEPPER_BLURBS = {
    "en": ["Pepper’s birthday is coming, and she has no friends to celebrate it with. Carrot has an idea: invite the witches they met at the Potion Contest. The table is laid and the invitations sent… but nobody comes. Pepper knows other spells.",
           "Episode 8 of David Revoy’s webcomic, free to read, share and adapt under CC BY 4.0."],
    "es": ["Se acerca el cumpleaños de Pimienta y no tiene amigos con quien celebrarlo. Zanahoria tiene una idea: invitar a las brujas que conocieron en el concurso de pociones. La mesa está puesta y las invitaciones enviadas… pero no viene nadie. Pimienta conoce otros hechizos.",
           "Episodio 8 del cómic web de David Revoy, libre para leer, compartir y adaptar con licencia CC BY 4.0."],
    "ca": ["S’acosta l’aniversari de la Pepper i no té cap amic amb qui celebrar-ho. En Carrot té una idea: convidar les bruixes del torneig de pocions. La taula és parada i les invitacions, enviades… però no ve ningú. La Pepper coneix altres encanteris.",
           "Episodi 8 del còmic web de David Revoy, lliure per llegir, compartir i adaptar amb llicència CC BY 4.0."],
    "fr": ["C’est bientôt l’anniversaire de Pepper, et elle n’a pas d’amis avec qui le fêter. Carrot a une idée : inviter les sorcières rencontrées au concours de potion. La table est mise, les invitations envoyées… mais personne ne vient. Pepper connaît d’autres sortilèges.",
           "Épisode 8 de la bande dessinée en ligne de David Revoy, à lire, partager et adapter librement sous licence CC BY 4.0."],
    "it": ["Il compleanno di Pepper si avvicina e lei non ha nessuno con cui festeggiare. Carrot ha un’idea: invitare le streghe conosciute alla Gara delle Pozioni. La tavola è apparecchiata e gli inviti spediti… ma non arriva nessuno. Pepper conosce altri incantesimi.",
           "Episodio 8 del fumetto online di David Revoy, da leggere, condividere e adattare liberamente con licenza CC BY 4.0."],
    "pt-BR": ["O aniversário da Pepper está chegando e ela não tem nenhuma amiga para comemorar. Carrot tem uma ideia: convidar as bruxas do Torneio de Poções. A mesa está posta e os convites foram enviados… mas ninguém aparece. Pepper conhece outros feitiços.",
              "Episódio 8 do webcomic de David Revoy, livre para ler, compartilhar e adaptar sob a licença CC BY 4.0."],
    "de": ["Bald ist Peppers Geburtstag, und sie hat keine Freunde, mit denen sie feiern kann. Carrot hat eine Idee: die Hexen vom Wettbewerb einladen. Der Tisch ist gedeckt, die Einladungen sind verschickt … doch niemand kommt. Pepper kennt noch andere Zaubersprüche.",
           "Episode 8 des Webcomics von David Revoy, frei zu lesen, zu teilen und zu bearbeiten unter der Lizenz CC BY 4.0."],
    "ja": ["もうすぐペッパーの誕生日。でも、いっしょに祝ってくれる友達がいない。キャロットの思いつきで、魔法薬コンテストで会った魔女たちを招待することに。テーブルの準備はできたのに、だれも来ない……。でもペッパーは魔女だ。",
           "David Revoyのウェブコミック第8話。CC BY 4.0ライセンスのもとで公開されている。"],
    "zh-Hans": ["小辣椒的生日就要到了，但她没有朋友一起庆祝。萝卜头有了主意：邀请魔药大赛上认识的魔女们。她一直等，可是没有人来……但是，小辣椒会魔法。",
                "David Revoy网络漫画第8集，以CC BY 4.0授权发表。"],
    "ar": ["اقترب عيد ميلاد فُلفُل، وليس لها أصدقاء تحتفل معهم. فيقترح جزر فكرة: أن تدعو الساحرات اللواتي التقتهنّ في مسابقة الجرعات. أُعدّت المائدة وأُرسلت الدعوات… لكن أحدًا لم يأتِ. وفُلفُل تعرف تعاويذ أخرى.",
           "الحلقة الثامنة من القصة المصورة على الويب لدافيد ريفوا، حرّة القراءة والمشاركة والتعديل بموجب رخصة CC BY 4.0."],
}

# The faces of each language's title page (its `title` heading design).
PEPPER_FACES = {
    "ja": {"display": "Dela Gothic One", "text": "Zen Antique", "weight": 400},
    "zh-Hans": {"display": "ZCOOL KuaiLe", "text": "Noto Sans SC", "weight": 400},
    "ar": {"display": "Lalezar", "text": "Playpen Sans Arabic", "weight": 400},
}


def pepper_carrot() -> Spec:
    W, H = 210.0, 297.0
    BW, BH = board(W, H)
    cream, red, ink, muted, night, gilt = "#fbf3dc", "#b4402a", "#1d1a17", "#6b625a", "#151a20", "#e4cf96"
    BOOK = "pepper-carrot"
    art_h = round(BW / (1100 / 765), 1)
    back_w = 172.0
    back_h = round(back_w / (1200 / 730), 1)

    def production(lang: str) -> dict:
        # A thin album: its spine takes a line from 4 mm.
        return {"versions": [{"id": "hardcover", "name": PEPPER_NAMES[lang], "binding": "case-flat", "caseMaterial": "printed", "spineText": {"minSpine": 4}}]}

    def cover(lang: str) -> dict:
        # The Japanese (read right to left) and Arabic editions are bound on
        # the right: their front's fore-edge, and the turn-in the art runs
        # into, is on its left.
        out = -18 if lang in ("ja", "ar") else 0
        return {
            "background": C(cream),
            "zones": {"spine": C(red), "jointBack": C(red), "jointFront": C(red)},
            "elements": [
                img("art", "front", out, -18, BW + 18, art_h + 18, "e08-cover", fit="cover", bleed="own"),
                box("art-rule", "front", 0, art_h, BW, 1.6, red),
                box("party-frame", "back", (BW - back_w) / 2 - 1.5, 26.5, back_w + 3, back_h + 3, night),
                img("party", "back", (BW - back_w) / 2, 28, back_w, back_h, "e08p06-3", fit="cover"),
            ],
            "textBoxes": [
                tb("masthead", 176, 90, "front", "top", 0, art_h + 6),
                tb("credits", 176, 20, "front", "bottom", 0, -8),
                tb("blurb", 160, 110, "back", "top", 0, 28 + back_h + 10),
                tb("site", 176, 8, "back", "bottom", 0, -8),
            ],
        }

    def styles(lang: str) -> list[dict]:
        f = PEPPER_FACES.get(lang, {"display": "Bangers", "text": "Comic Neue", "weight": 700})
        latin = lang not in PEPPER_FACES
        align = "center"
        return [
            ps("cover-series", "Cover: series", "Bangers", 26, 28, red, align, letterSpacing=pt(1.5)),
            ps("cover-title", "Cover: title", f["display"], 46 if latin else 34, 50 if latin else 44, ink, align, marginTop=pt(4)),
            ps("cover-author", "Cover: author", f["text"], 15, 19, ink, align, fontWeight=f["weight"], marginTop=pt(12)),
            ps("cover-credit", "Cover: credits", f["text"], 10, 13, muted, align),
            ps("cover-blurb", "Cover: blurb", f["text"], 13, 18.5 if latin else 22, ink, align, fontWeight=f["weight"], spaceBetween=pt(9)),
            ps("cover-site", "Cover: site", f["text"], 9, 12, muted, align),
            ps("cover-spine", "Cover: spine", "Bangers", 13, 14, cream, letterSpacing=pt(1.2)),
        ]

    def markdown(lang: str) -> str:
        title, attrs = next((t, a) for t, a in headings(BOOK, lang) if a.get("style") == "title")
        # The Japanese title page sets the episode over its name.
        titles = [attrs["episode"], attrs["name"]] if lang == "ja" else [title]
        return cover_md(
            frame("front"),
            frame("masthead", styled("cover-series", "Pepper&Carrot") + "".join(styled("cover-title", esc(t)) for t in titles) + styled("cover-author", esc(attrs["art"]))),
            frame("credits", styled("cover-credit", esc(attrs["credit"]))),
            frame("blurb", styled("cover-blurb", "\n\n".join(esc(p) for p in PEPPER_BLURBS[lang]))),
            frame("site", styled("cover-site", "www.peppercarrot.com · CC BY 4.0")),
            frame("back"),
            frame("spine", styled("cover-spine", "Pepper&Carrot · 8")),
        )

    def folio(f: dict) -> dict:
        return {"binding": {**f.get("binding", {}), "type": "hardcover"}}

    return Spec(production, cover, styles, markdown, folio=folio)


# --- ألف ليلة وليلة ---------------------------------------------------------------------
#
# The six volumes as one leather-bound book, a printed case: the painted
# morocco of the cover page on the front with the title in gold in its
# cartouche, the painted spine with its raised bands, and a back
# tooled in two gold fillets round the blurb. Bound on the right, so the
# sheet is mirrored: the front on the left.

def alf_layla() -> Spec:
    W, H = 170.0, 240.0
    BW, BH = board(W, H)
    # The case spine of the committed bundle (2,700 pages of 40 g bible
    # paper and two boards), as the cover check reports it: the painted
    # spine is laid at this width, its title across it.
    SPINE = 75.8
    leather, gold, gold_dark, tint = "#4a1d17", "#d2ad5c", "#a8823a", "#efe3c6"

    def production(lang: str) -> dict:
        return {"versions": [{"id": "hardcover", "name": "مجلد", "binding": "case-flat", "caseMaterial": "printed"}]}

    def fillet(id_: str, inset: float, weight: float, color: str) -> list[dict]:
        # A frame of four rules, `inset` mm inside the board.
        x0, y0, x1, y1 = inset, inset, BW - inset, BH - inset
        return [
            box(f"{id_}-t", "back", x0, y0, x1 - x0, weight, color),
            box(f"{id_}-b", "back", x0, y1 - weight, x1 - x0, weight, color),
            box(f"{id_}-l", "back", x0, y0, weight, y1 - y0, color),
            box(f"{id_}-r", "back", x1 - weight, y0, weight, y1 - y0, color),
        ]

    def cover(lang: str) -> dict:
        return {
            "background": C(leather),
            "elements": [
                img("art", "front", 0, 0, BW, BH, "cover-art", fit="cover"),
                img("spine-art", "spine", 0, -18, SPINE, BH + 36, "spine-art", fit="cover", bleed="own"),
                *fillet("fillet-out", 10, 0.9, gold),
                *fillet("fillet-in", 13, 0.4, gold_dark),
                img("rosette", "back", (BW - 30) / 2, 44, 30, 30, "rosette-gold"),
            ],
            # The fillets tooled in gold foil.
            "finishes": [{"id": f"foil-{e}-{side}", "process": "foil", "sheen": "gloss", "shape": {"element": f"{e}-{side}"}} for e in ("fillet-out", "fillet-in") for side in "tblr"],
            "textBoxes": [
                tb("title", BW, 30, "front", "top", 0, 21.25),
                tb("volumes", BW, 12, "front", "top", 0, 205.85),
                tb("blurb", 110, 100, "back", "top", 0, 80),
                tb("imprint", 110, 10, "back", "bottom", 0, -16),
                # Across the label of the painted spine, as on Folio's spine.
                tb("spine-title", SPINE - 14, 34, "spine", "top", 0, round(0.274 * BH - 5 - 17, 1)),
            ],
        }

    def styles(lang: str) -> list[dict]:
        return [
            ps("cover-title", "الغلاف: العنوان", "Aref Ruqaa", 50, 60, gold, fontWeight=700),
            ps("cover-volumes", "الغلاف: الأجزاء", "Amiri", 21, 26, gold, fontWeight=700),
            ps("cover-blurb", "الغلاف: النبذة", "Amiri", 13, 22, tint),
            ps("cover-imprint", "الغلاف: الطابع", "Amiri", 10, 14, gold),
            ps("cover-spine", "الغلاف: الكعب", "Aref Ruqaa", 34, 36, gold, fontWeight=700),
        ]

    def markdown(lang: str) -> str:
        title, volumes = "ألف ليلة وليلة", "في ستة أجزاء"
        blurb = ("ألف ليلة وليلة كاملةً في ستة أجزاء، على نص طبعة بولاق كما ضبطته مؤسسة هنداوي: حكايات شهرزاد للملك شهريار"
                 " من الليلة الأولى إلى الليلة الحادية بعد الألف، تصحبها تصاوير صنيع الملك ورسوم وليم هارفي.")
        return cover_md(
            frame("front"),
            frame("title", styled("cover-title", title)),
            frame("volumes", styled("cover-volumes", volumes)),
            frame("blurb", styled("cover-blurb", blurb)),
            frame("imprint", styled("cover-imprint", "طبعة نموذجية من Postext · postext.dev")),
            frame("back"),
            frame("spine-title", styled("cover-spine", lines("ألف ليلة", "وليلة"))),
            frame("spine"),
        )

    # The painted spine without its lettering (covers.py), for the cover
    # sheet to letter; the bundle's `spine` is the lettered one Folio shows.
    resources = [{"id": "spine-art", "from": "alf-layla/art/spine.jpg", "typeId": "ornament", "kind": "bitmap", "file": "resources/spine-art.jpg",
                  "width": 1120, "height": 3360, "placement": {"position": "here", "span": "column", "width": 0.2, "align": "center"},
                  "caption": "كعب الكتاب", "altText": ""}]
    return Spec(production, cover, styles, markdown, resources)


# --- こころ -----------------------------------------------------------------------------
#
# A Japanese hardcover (上製本) in its jacket (カバー). The jacket is the
# cover page: the painted shore of Kamakura with the red title slip, the
# blurb on the back and the flaps set in vertical lines. Under it, the
# case in the red cloth of the 1914 edition with Sōseki's seal on the
# back, as on the book's last page, and endpapers in his stone-drum
# pattern. Bound on the right: the sheet is mirrored.

def kokoro() -> Spec:
    W, H = 127.0, 188.0
    BW, BH = board(W, H)
    ink, shu, paper, muted = "#1d1916", "#b5462c", "#f4ebd8", "#6f655a"
    sw, sl, top, left = 19.0, 86.0, 15.0, 13.0  # the slip, as on the cover page

    def production(lang: str) -> dict:
        return {"versions": [{"id": "hardcover", "name": "上製本（カバー装）", "binding": "case-flat", "caseMaterial": "printed", "flaps": True}]}

    jacket = {
        "background": C(paper),
        "verticalAlign": {"back": "top", "flapFront": "top", "flapBack": "top"},
        "elements": [
            img("art", "front", -3, -3, BW + 3, BH + 6, "cover-art", fit="cover"),
            box("slip", "front", left, top, sw, sl, shu),
            box("slip-frame", "front", left + 1.3, top + 1.3, sw - 2.6, sl - 2.6, shu, stroke={"color": C(paper), "width": 0.18}),
            box("spine-head", "spine", 0, 10, 0, 1.2, shu, to={"zone": "front", "x": 0}),
            box("spine-foot", "spine", 0, BH - 11.2, 0, 1.2, shu, to={"zone": "front", "x": 0}),
        ],
        "textBoxes": [
            tb("slip-title", sw, 46, "front", "top-left", left - 5, top - 5 + 9),
            tb("slip-author", sw, 24, "front", "top-left", left - 5, top - 5 + sl - 7 - 24),
        ],
    }
    seal_w = 20.0
    case = {
        "background": C(shu),
        "elements": [
            box("seal-ground", "back", (BW - 24) / 2, 120, 24, 32.7, paper),
            img("seal", "back", (BW - seal_w) / 2, 122, seal_w, round(seal_w * 430 / 300, 1), "kokoro-1914-seal"),
        ],
    }
    endpapers = {
        "background": C(paper),
        "elements": [
            img("pattern-paste", "pastedown", -3, -3, W + 3, H + 6, "endpaper", fit="cover"),
            img("pattern-fly", "flyleaf", 0, -3, W + 3, H + 6, "endpaper", fit="cover"),
        ],
    }

    def cover(lang: str) -> dict:
        return {**jacket, "sheets": {"case": case, "endpapers": endpapers}}

    def styles(lang: str) -> list[dict]:
        mincho = "Shippori Mincho B1"
        return [
            ps("cover-title", "カバー：書名", mincho, 30, 36, paper, "left", fontWeight=700, letterSpacing=pt(10)),
            ps("cover-author", "カバー：著者", mincho, 12, 16, paper, "left", fontWeight=700, letterSpacing=pt(4)),
            ps("cover-blurb", "カバー：紹介文", mincho, 11, 20, ink, "left"),
            ps("cover-flap", "カバー：そで", mincho, 9.5, 17, ink, "left", spaceBetween=pt(0)),
            ps("cover-flap-head", "カバー：そで見出し", mincho, 10.5, 17, shu, "left", fontWeight=700, marginBottom=pt(8)),
            ps("cover-imprint", "カバー：版元", mincho, 9, 14, muted, "left"),
            ps("cover-spine", "カバー：背", mincho, 15, 18, ink, fontWeight=700, letterSpacing=pt(6)),
            ps("cover-spine-case", "表紙：背", mincho, 15, 18, paper, fontWeight=700, letterSpacing=pt(6)),
        ]

    def markdown(lang: str) -> str:
        blurb = ("鎌倉の海で出会い、「先生」と呼ぶようになった人は、なぜ世間から離れてひっそりと暮らしているのか。"
                 "上「先生と私」、中「両親と私」、下「先生と遺書」の三部で、明治の終わりを生きた一人の男の孤独と罪の意識を描く、夏目漱石の長篇小説。")
        flap_front = ("一九一四年（大正三年）四月から八月まで「朝日新聞」に連載され、同年九月に岩波書店から出版された。"
                      "表紙、見返し、扉、奥付の装丁は漱石みずからの手による。本書の本文は青空文庫に拠る。")
        flap_back = ("一八六七年、江戸に生まれる。大学で英文学を学び、英国留学ののち、一九〇五年に最初の小説を発表。"
                     "一九〇七年に朝日新聞社に入社し、以後の小説はすべて同紙に連載された。一九一六年、四十九歳で世を去る。")
        return cover_md(
            frame("front", "", "jacket case"),
            frame("slip-title", styled("cover-title", "こころ"), "jacket"),
            frame("slip-author", styled("cover-author", "夏目漱石"), "jacket"),
            frame("back", styled("cover-blurb", blurb) + styled("cover-imprint", "Postext　見本版"), "jacket"),
            frame("back", "", "case"),
            frame("flapFront", styled("cover-flap-head", "『こころ』について") + styled("cover-flap", flap_front), "jacket"),
            frame("flapBack", styled("cover-flap-head", "夏目漱石") + styled("cover-flap", flap_back), "jacket"),
            frame("spine", styled("cover-spine", "こころ　夏目漱石"), "jacket"),
            frame("spine", styled("cover-spine-case", "こころ"), "case"),
        )

    def folio(f: dict) -> dict:
        return {}

    return Spec(production, cover, styles, markdown)


# --- 紅樓夢 -----------------------------------------------------------------------------
#
# A sewn softcover with flaps, the form of Chinese literary paperbacks.
# Each edition keeps its cover page: the traditional one set vertically
# and bound on the right, with the paper title slip down the free edge
# and its texts in vertical lines; the simplified one horizontal and bound
# on the left, the slip on its free edge; the English one with a label of
# its own. The spine is indigo with a paper label; the back the same
# indigo round a paper panel that holds the blurb.

HLM = {
    "zh-Hant": {
        "version": "鎖線平裝",
        "title": "紅樓夢", "author": "曹雪芹", "note": "程乙本",
        "blurb": "《紅樓夢》以賈、史、王、薛四大家族的興衰為背景，寫賈寶玉、林黛玉、薛寶釵之間的悲歡離合。本書收程乙本一百二十回全文，附《增評補圖石頭記》回圖與改琦《紅樓夢圖詠》繡像。",
        "flap_front": ("作者", "曹雪芹（約一七一五—一七六三），字夢阮，號雪芹。祖上三代任江寧織造，家道中落後移居北京西郊，「披閱十載，增刪五次」，寫成此書前八十回。後四十回一般認為由程偉元、高鶚整理補成。"),
        "flap_back": ("本書", "正文據程乙本（一七九二），以維基文庫錄入本為底本。回圖採自光緒十年同文書局石印本《增評補圖石頭記》，繡像為改琦《紅樓夢圖詠》。Postext排版示例本。"),
        "imprint": "Postext",
    },
    "zh-Hans": {
        "version": "锁线平装",
        "title": "红楼梦", "author": "曹雪芹", "note": "程乙本",
        "blurb": "《红楼梦》以贾、史、王、薛四大家族的兴衰为背景，写贾宝玉、林黛玉、薛宝钗之间的悲欢离合。本书收程乙本一百二十回全文，附《增评补图石头记》回图与改琦《红楼梦图咏》绣像。",
        "flap_front": ("作者", "曹雪芹（约1715—1763），字梦阮，号雪芹。祖上三代任江宁织造，家道中落后移居北京西郊，“披阅十载，增删五次”，写成此书前八十回。后四十回一般认为由程伟元、高鹗整理补成。"),
        "flap_back": ("本书", "正文据程乙本（1792），以维基文库录入本为底本。回图采自光绪十年同文书局石印本《增评补图石头记》，绣像为改琦《红楼梦图咏》。Postext排版示例本。"),
        "imprint": "Postext",
    },
    "en": {
        "version": "Sewn paperback",
        "title": "Hung Lou Meng", "subtitle": "or, The Dream of the Red Chamber", "author": "Cao Xueqin", "translator": "Translated by H. Bencraft Joly",
        "blurb": "Cao Xueqin’s novel of the rise and fall of the Jia family, and of Baoyu, Daiyu and Baochai within its walls, in H. Bencraft Joly’s translation of 1892–93, the first in English: chapters I to LVI, with Gai Qi’s portraits of the characters.",
        "flap_front": ("The author", "Cao Xueqin (c. 1715–1763) came of a family that served the Qing emperors as textile commissioners in Nanjing for three generations and lost its fortune when he was a boy. He wrote the first eighty chapters of the novel in poverty near Beijing; the last forty were completed by Cheng Weiyuan and Gao E, who printed the whole in 1791 and 1792."),
        "flap_back": ("This edition", "H. Bencraft Joly’s translation (Hong Kong, 1892–93) stops at chapter LVI. The portraits are Gai Qi’s, from the album of 1879. A sample edition set with Postext, postext.dev."),
        "imprint": "Postext",
    },
}


def hongloumeng() -> Spec:
    ink, vermilion, paper, indigo, thread = "#1f1b16", "#b23a2e", "#f5efe1", "#34405a", "#e9e1cf"
    sizes = {"zh-Hant": (148.0, 210.0), "zh-Hans": (140.0, 203.0), "en": (140.0, 216.0)}
    slip_w, slip_h, slip_top, slip_edge = 23.0, 92.0, 14.0, 11.0
    # The spine of each edition (2,030, 1,309 and 1,107 pages of 40 g bible
    # paper), as the cover check reports it: the label is 16 mm wide in its
    # middle, its edges set in from both folds so it stays centred.
    spines = {"zh-Hant": 53.3, "zh-Hans": 34.6, "en": 44.2}
    label_w = 16.0

    def production(lang: str) -> dict:
        return {"versions": [{"id": "softcover", "name": HLM[lang]["version"], "binding": "sewn-softcover", "flaps": True}]}

    def slip(zone: str, x: float, y: float, w: float, h: float) -> list[dict]:
        return [
            box("slip", zone, x, y, w, h, paper, stroke={"color": C(ink), "width": 0.21}),
            box("slip-frame", zone, x + 1.4, y + 1.4, w - 2.8, h - 2.8, paper, stroke={"color": C(ink), "width": 0.1}),
        ]

    def panel(W: float, pw: float, ph: float, y: float) -> list[dict]:
        x = (W - pw) / 2
        return [
            box("panel", "back", x, y, pw, ph, paper, stroke={"color": C(ink), "width": 0.21}),
            box("panel-frame", "back", x + 1.6, y + 1.6, pw - 3.2, ph - 3.2, paper, stroke={"color": C(ink), "width": 0.1}),
        ]

    def cover(lang: str) -> dict:
        W, H = sizes[lang]
        vertical = lang == "zh-Hant"
        art = "cover-art" if vertical else "cover-art-zh-Hans"
        # The fore-edge bleed: on the left of a right-bound front.
        art_el = img("art", "front", -3 if vertical else 0, -3, W + 3, H + 6, art, fit="cover")
        inset = (spines[lang] - label_w) / 2
        # A vertical blurb stands in a tall panel, a horizontal one in a
        # wide one, each in the middle of the back.
        pw, ph = (64.0, 128.0) if vertical else (W - 40, 76.0)
        py = (H - ph) / 2
        els = [
            art_el,
            box("spine-label", "spine", inset, 16, 0, 80, paper, stroke={"color": C(ink), "width": 0.21},
                to={"zone": "back" if vertical else "front", "x": -inset}),
            *panel(W, pw, ph, py),
        ]
        boxes = [tb("blurb", pw - 16, ph - 16, "back", "top-left", (W - pw) / 2 + 8 - 5, py + 8 - 5)]
        if lang == "en":
            lw, lh = 96.0, 44.0
            els += slip("front", (W - lw) / 2, 18, lw, lh)
            boxes += [tb("label", lw - 8, lh - 8, "front", "top", 0, 17)]
        else:
            sx = slip_edge if vertical else W - slip_edge - slip_w
            els += slip("front", sx, slip_top, slip_w, slip_h)
            boxes += [
                tb("slip-title", slip_w, slip_h - 26, "front", "top-left", sx - 5, slip_top - 5 + 8),
                tb("slip-note", 6.4, 20, "front", "top-left", sx - 5 + 2.2, slip_top - 5 + slip_h - 24),
            ]
        boxes += [tb("spine-title", label_w - 4, 72, "spine", "top", 0, 15)]
        return {
            "background": C(indigo),
            "verticalAlign": {"flapFront": "top", "flapBack": "top"},
            "elements": els,
            "textBoxes": boxes,
        }

    def styles(lang: str) -> list[dict]:
        if lang == "en":
            serif = "EB Garamond"
            return [
                ps("cover-title", "Cover: title", serif, 21, 24, ink, letterSpacing=pt(2), textTransform="uppercase"),
                ps("cover-subtitle", "Cover: subtitle", serif, 12, 15, ink, italic=True, marginTop=pt(2)),
                ps("cover-author", "Cover: author", serif, 11, 14, vermilion, marginTop=pt(6)),
                ps("cover-blurb", "Cover: blurb", serif, 11.5, 16.5, ink),
                ps("cover-imprint", "Cover: imprint", serif, 8.5, 11, ink, letterSpacing=pt(2), textTransform="uppercase", marginTop=pt(14)),
                ps("cover-flap-head", "Cover: flap heading", serif, 10, 13, thread, "left", letterSpacing=pt(1.5), textTransform="uppercase", marginBottom=pt(8)),
                ps("cover-flap", "Cover: flap", serif, 10, 14, paper, "left"),
                ps("cover-spine", "Cover: spine", "LXGW WenKai TC", 17, 20, ink),
            ]
        kai = "LXGW WenKai TC" if lang == "zh-Hant" else "LXGW WenKai"
        serif = "Noto Serif TC" if lang == "zh-Hant" else "Noto Serif SC"
        return [
            ps("cover-title", "封面：書名", kai, 30, 40, ink, letterSpacing=pt(16)),
            ps("cover-note", "封面：版本", kai, 9, 11, ink, letterSpacing=pt(1)),
            ps("cover-blurb", "封底：介紹", serif, 11, 20, ink, "left"),
            ps("cover-imprint", "封底：出版", serif, 9, 14, vermilion, "left", marginTop=pt(12)),
            ps("cover-flap-head", "摺口：標題", kai, 11, 18, thread, "left", marginBottom=pt(8)),
            ps("cover-flap", "摺口：正文", serif, 9.5, 17, paper, "left"),
            ps("cover-spine", "書脊", kai, 17, 20, ink, letterSpacing=pt(8)),
        ]

    def markdown(lang: str) -> str:
        h = HLM[lang]
        vertical = lang == "zh-Hant"
        stack = (lambda s: s) if vertical else (lambda s: lines(*s))
        parts = [frame("front"), frame("back")]
        if lang == "en":
            parts += [
                frame("label", styled("cover-title", h["title"]) + styled("cover-subtitle", h["subtitle"]) + styled("cover-author", h["author"])),
                frame("blurb", styled("cover-blurb", esc(h["blurb"])) + styled("cover-imprint", h["imprint"])),
                frame("spine-title", styled("cover-spine", lines(*"紅樓夢"))),
                frame("spine"),
            ]
        else:
            parts += [
                frame("slip-title", styled("cover-title", stack(h["title"]))),
                frame("slip-note", styled("cover-note", stack(h["note"]))),
                frame("blurb", styled("cover-blurb", h["blurb"]) + styled("cover-imprint", h["imprint"])),
                frame("spine-title", styled("cover-spine", stack(h["title"]))),
                frame("spine"),
            ]
        parts += [
            frame("flapFront", styled("cover-flap-head", h["flap_front"][0]) + styled("cover-flap", esc(h["flap_front"][1]))),
            frame("flapBack", styled("cover-flap-head", h["flap_back"][0]) + styled("cover-flap", esc(h["flap_back"][1]))),
        ]
        return cover_md(*parts)

    return Spec(production, cover, styles, markdown)


BOOKS.update({
    "pepper-carrot": pepper_carrot,
    "alf-layla": alf_layla,
    "kokoro": kokoro,
    "hongloumeng": hongloumeng,
})
