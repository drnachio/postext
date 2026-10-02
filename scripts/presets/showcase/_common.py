"""Helpers shared by the showcase preset builders (`scripts/presets/showcase/*/build.py`):
units, colours, design-element constructors, static font instancing from
variable fonts, the bundle fingerprint and the `index.json` registration.

Every builder writes into `apps/web/public/presets/<id>/`; nothing here
reads or writes anywhere else.
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import sys
from typing import Callable

SHOWCASE_DIR = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(SHOWCASE_DIR, "..", "..", ".."))
PRESETS_ROOT = os.path.join(REPO, "apps", "web", "public", "presets")


# --- units ------------------------------------------------------------------


def mm(v: float) -> dict:
    return {"value": round(v, 3), "unit": "mm"}


def pt(v: float) -> dict:
    return {"value": round(v, 3), "unit": "pt"}


def at(to: str, edge: str) -> dict:
    return {"to": to, "edge": edge}


def size(width, height="auto") -> dict:
    return {
        "width": width if isinstance(width, str) else mm(width),
        "height": height if isinstance(height, str) else mm(height),
    }


# --- design elements ----------------------------------------------------------


def make_palette(colours: dict[str, str], names: dict[str, str]) -> tuple[Callable[[str], dict], list[dict]]:
    """Returns `col(id)` (a ColorValue linked to the palette) and the
    `colorPalette` config list."""

    def col(pid: str) -> dict:
        return {"hex": colours[pid], "model": "hex", "paletteId": pid}

    palette = [{"id": k, "name": names.get(k, k), "value": {"hex": v, "model": "hex"}} for k, v in colours.items()]
    return col, palette


def text_el(
    id_: str,
    content: str,
    *,
    col: Callable[[str], dict],
    anchor: dict,
    offset: tuple[float, float] = (0, 0),
    width="auto",
    size_pt: float = 10,
    family: str,
    weight: int = 400,
    italic: bool = False,
    align: str = "left",
    line_height: float = 1.2,
    color: str,
    overflow: str = "wrap",
    **extra,
) -> dict:
    el = {
        "kind": "text",
        "id": id_,
        "placement": {"anchor": anchor, "offset": {"x": mm(offset[0]), "y": mm(offset[1])}, "size": size(width, "auto")},
        "content": content,
        "fontFamily": family,
        "fontSize": pt(size_pt),
        "fontWeight": weight,
        "italic": italic,
        "align": align,
        "verticalAlign": "middle",
        "lineHeight": line_height,
        "overflow": overflow,
        "color": col(color),
    }
    el.update(extra)
    return el


def rule_el(id_: str, *, col: Callable[[str], dict], anchor: dict, offset: tuple[float, float], width: float, color: str, thickness: float = 0.5, **extra) -> dict:
    el = {
        "kind": "rule",
        "id": id_,
        "direction": "horizontal",
        "placement": {"anchor": anchor, "offset": {"x": mm(offset[0]), "y": mm(offset[1])}, "size": {"width": mm(width)}},
        "color": col(color),
        "thickness": pt(thickness),
    }
    el.update(extra)
    return el


def box_el(id_: str, *, col: Callable[[str], dict], anchor: dict, offset=(0, 0), width="fill", height="fill", fill: str, **extra) -> dict:
    el = {
        "kind": "box",
        "id": id_,
        "placement": {"anchor": anchor, "offset": {"x": mm(offset[0]), "y": mm(offset[1])}, "size": size(width, height)},
        "style": {"backgroundColor": col(fill), "borderRadius": mm(0)},
    }
    el.update(extra)
    return el


def image_el(id_: str, resource: str, *, anchor: dict, offset=(0, 0), width="auto", height="auto", **extra) -> dict:
    el = {
        "kind": "image",
        "id": id_,
        "placement": {"anchor": anchor, "offset": {"x": mm(offset[0]), "y": mm(offset[1])}, "size": size(width, height)},
        "resourceId": resource,
    }
    el.update(extra)
    return el


# --- fonts -----------------------------------------------------------------

WEIGHT_NAMES = {100: "Thin", 200: "ExtraLight", 300: "Light", 400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold", 800: "ExtraBold", 900: "Black"}


def instance_font(src: str, out_dir: str, file_stem: str, axes: dict[str, float], weight: int, italic: bool) -> str:
    """Write a static instance of a variable font (or copy a static one) as
    `<file_stem>-<Weight>[Italic].ttf` and return its file name."""
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer

    suffix = WEIGHT_NAMES[weight] + ("Italic" if italic else "")
    if weight == 400 and italic:
        suffix = "Italic"
    name = f"{file_stem}-{suffix}.ttf"
    path = os.path.join(out_dir, name)
    if not os.path.exists(path):
        font = TTFont(src)
        if "fvar" in font:
            location = {**axes, "wght": weight}
            try:
                font = instancer.instantiateVariableFont(font, location, inplace=False, updateFontNames=True)
            except ValueError:
                # The STAT table has no named value for one of the axis
                # positions (an arbitrary SOFT/wdth setting): instance without
                # renaming and write plain family/subfamily names ourselves.
                font = instancer.instantiateVariableFont(TTFont(src), location, inplace=False, updateFontNames=False)
                _rename(font, file_stem, suffix)
        font.save(path)
    return name


def _rename(font, family: str, subfamily: str) -> None:
    """Family / subfamily / full / PostScript names of a static instance."""
    style = subfamily.replace("Regular", "").strip() or "Regular"
    full = f"{family} {style}" if style != "Regular" else family
    ps = f"{family}-{subfamily}".replace(" ", "")
    for name_id, value in ((1, family), (2, style if style in ("Regular", "Bold", "Italic", "Bold Italic") else "Regular"), (4, full), (6, ps), (16, family), (17, style)):
        font["name"].setName(value, name_id, 3, 1, 0x409)
        font["name"].setName(value, name_id, 1, 0, 0)


def copy_licences(source_fonts_dir: str, out_dir: str, folders: dict[str, str]) -> None:
    """`folders` maps a google/fonts family folder to the licence file name to
    write (`{"fraunces": "Fraunces-OFL.txt"}`)."""
    for folder, licence in folders.items():
        shutil.copyfile(os.path.join(source_fonts_dir, folder, "OFL.txt"), os.path.join(out_dir, licence))


# --- bundle bookkeeping -----------------------------------------------------------


def write_fingerprint(out: str) -> None:
    """A static `fingerprint.json` (sha1 of every bundle file) so the sandbox
    can tell a rebuilt bundle from the one it loaded."""
    h = hashlib.sha1()
    for dp, _, fs in sorted(os.walk(out)):
        for f in sorted(fs):
            if f == "fingerprint.json":
                continue
            rel = os.path.relpath(os.path.join(dp, f), out)
            h.update(rel.encode())
            with open(os.path.join(dp, f), "rb") as fh:
                h.update(fh.read())
    with open(os.path.join(out, "fingerprint.json"), "w", encoding="utf-8") as f:
        json.dump({"fingerprint": h.hexdigest()}, f)
        f.write("\n")


def copy_thumbnail(here: str, out: str) -> None:
    """Copy `thumbnail.jpg` (the default-locale cover) and any per-locale
    `thumbnail-<lang>.jpg` (e.g. the English cover the home page shows on
    /en) from next to build.py into the bundle."""
    thumb = os.path.join(here, "thumbnail.jpg")
    if os.path.exists(thumb):
        shutil.copyfile(thumb, os.path.join(out, "thumbnail.jpg"))
    else:
        print("note: no thumbnail.jpg next to build.py (render the cover page and drop it there)", file=sys.stderr)
    for f in sorted(os.listdir(here)):
        if f.startswith("thumbnail-") and f.endswith(".jpg"):
            shutil.copyfile(os.path.join(here, f), os.path.join(out, f))


def register(preset_id: str, meta: dict) -> None:
    """Add or replace the preset's entry in the public `index.json`."""
    index_path = os.path.join(PRESETS_ROOT, "index.json")
    index = json.load(open(index_path, encoding="utf-8")) if os.path.exists(index_path) else {"version": 1, "presets": []}
    entry = {"id": preset_id, "dir": preset_id, **{k: v for k, v in meta.items() if k != "id"}}
    index["presets"] = [e for e in index["presets"] if e.get("id") != preset_id] + [entry]
    index["presets"].sort(key=lambda e: e["id"])
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2, ensure_ascii=False)
        f.write("\n")


def bundle_size(out: str) -> float:
    return sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(out) for f in fs) / 1e6


def attr_value(s: str) -> str:
    """A heading-attribute value: no ASCII double quotes or backslashes."""
    return s.replace('"', "”").replace("\\", "")


# --- the spine (Folio) ---------------------------------------------------------

# Board thickness (mm) Folio gives the covers of each binding (postext-folio
# bookGeometry.ts BINDINGS.boardMm).
FOLIO_BOARD_MM = {"hardcover": 2.6, "paperback": 0.35, "sewn": 0.35, "layflat": 2.2, "saddleStitch": 0.25}


def spine_thickness_mm(pages: int, grammage: float, bulk: float, binding: str) -> float:
    """The book block as Folio draws it closed: a sheet per two pages at the
    paper's caliper, and the two boards."""
    return pages / 2 * grammage * bulk / 1000 + 2 * FOLIO_BOARD_MM[binding]


def _hex_rgb(value: str) -> tuple[int, int, int]:
    return tuple(int(value[i : i + 2], 16) for i in (1, 3, 5))  # type: ignore[return-value]


def render_spine(
    path: str,
    *,
    height_mm: float,
    thickness_mm: float,
    ground: str,
    ink: str,
    pieces: list[dict],
    rules: str | None = None,
    vertical: bool = False,
    px_per_mm: float = 14,
) -> tuple[int, int]:
    """Draws a book's spine for `folio.binding.spineImage`: the spine as seen
    with the book standing, head up, `thickness_mm` wide and `height_mm`
    tall. `pieces` are set along it from head to tail, each a dict with
    `text`, `font` (a .ttf/.otf/.woff2 path), `size` (a fraction of the
    spine's width), `at` (where its centre falls, 0 head … 1 tail) and an
    optional `color`. Latin text runs top to bottom (the letters' tops face
    the front cover, so it reads with the book lying face up); `vertical`
    stacks upright CJK characters instead. `rules`: a colour for two thin
    bands near head and tail. Returns the picture's size in px."""
    from PIL import Image, ImageDraw, ImageFont

    w = max(8, round(thickness_mm * px_per_mm))
    h = round(height_mm * px_per_mm)
    if vertical:
        im = Image.new("RGB", (w, h), _hex_rgb(ground))
        draw = ImageDraw.Draw(im)
        for p in pieces:
            font = ImageFont.truetype(p["font"], max(6, round(w * p["size"])))
            chars = list(p["text"])
            step = font.size * 1.12
            y = p["at"] * h - step * len(chars) / 2
            for ch in chars:
                draw.text((w / 2, y + step / 2), ch, font=font, fill=_hex_rgb(p.get("color", ink)), anchor="mm")
                y += step
        if rules:
            for y in (0.035 * h, 0.965 * h):
                draw.rectangle((0, y - w * 0.03, w, y + w * 0.03), fill=_hex_rgb(rules))
    else:
        # Laid out as a horizontal strip (head on the left), then turned a
        # quarter clockwise: the head goes to the top, the letters face the
        # front cover.
        strip = Image.new("RGB", (h, w), _hex_rgb(ground))
        draw = ImageDraw.Draw(strip)
        for p in pieces:
            font = ImageFont.truetype(p["font"], max(6, round(w * p["size"])))
            draw.text((p["at"] * h, w / 2), p["text"], font=font, fill=_hex_rgb(p.get("color", ink)), anchor="mm")
        if rules:
            for x in (0.035 * h, 0.965 * h):
                draw.rectangle((x - w * 0.03, 0, x + w * 0.03, w), fill=_hex_rgb(rules))
        im = strip.rotate(-90, expand=True)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, quality=90, optimize=True)
    return im.size


def build_spines(out: str, rid: str, type_id: str, default_lang: str, per_lang: dict[str, dict]) -> tuple[dict, dict[str, dict]]:
    """One spine picture per edition (`render_spine` keyword arguments by
    language) under one resource id: the shared spec names the default
    edition's file, each edition's wording swaps in its own. Returns the
    spec and the wording by language."""
    sizes: dict[str, tuple[str, int, int]] = {}
    for lang, kwargs in per_lang.items():
        rel = f"resources/{rid}-{lang}.jpg"
        w, h = render_spine(os.path.join(out, rel), **kwargs)
        sizes[lang] = (rel, w, h)
    rel, w, h = sizes[default_lang]
    spec = {
        "id": rid, "typeId": type_id, "kind": "bitmap", "file": rel, "width": w, "height": h,
        "placement": {"position": "here", "span": "column", "width": 0.2, "align": "center"}, "caption": "", "altText": "",
    }
    wording = {lang: {"id": rid, "file": r, "width": ww, "height": hh} for lang, (r, ww, hh) in sizes.items()}
    return spec, wording
