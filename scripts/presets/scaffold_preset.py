#!/usr/bin/env python3
"""Scaffold `preset.json` for a preset bundle directory and register it in
the sibling `index.json`.

Expected layout:

    <presets-root>/
      index.json                 (upserted by this script)
      <preset-dir>/
        preset.json              (written here; preset.scaffold.json if it exists)
        <name>.md                (the document markdown)
        resources/*.svg|png|...  (figures)
        fonts/*.otf|ttf|woff2    (custom fonts)

Resource ids are the slugified file stems; font families are grouped by the
family name stored in the font (fontTools), or by the filename prefix before
the first `-` when fontTools is missing.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import struct
import sys
import xml.etree.ElementTree as ET

RESOURCE_EXT = {".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif"}
FONT_EXT = {".otf", ".ttf", ".woff2"}
MANIFEST_VERSION = 1

_PT_PER_UNIT = {"": 1.0, "pt": 1.0, "px": 0.75, "in": 72.0, "cm": 72.0 / 2.54, "mm": 72.0 / 25.4, "pc": 12.0}


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug or "item"


def _round(value: float | None) -> float | None:
    return None if value is None else round(value, 2)


# --- resources --------------------------------------------------------------

def _parse_length(value: str | None) -> float | None:
    if not value:
        return None
    match = re.fullmatch(r"\s*([0-9.+-eE]+)\s*([a-zA-Z%]*)\s*", value)
    if not match:
        return None
    try:
        number = float(match.group(1))
    except ValueError:
        return None
    factor = _PT_PER_UNIT.get(match.group(2).lower())
    return None if factor is None else number * factor


def svg_size(path: str) -> tuple[float | None, float | None]:
    try:
        for _event, element in ET.iterparse(path, events=("start",)):
            if element.tag.rsplit("}", 1)[-1] != "svg":
                return (None, None)
            width = _parse_length(element.get("width"))
            height = _parse_length(element.get("height"))
            view_box = element.get("viewBox")
            if (width is None or height is None) and view_box:
                parts = re.split(r"[\s,]+", view_box.strip())
                if len(parts) == 4:
                    try:
                        vb_w, vb_h = float(parts[2]), float(parts[3])
                        if width is None and height is None:
                            width, height = vb_w, vb_h
                        elif width is None and vb_h:
                            width = height * vb_w / vb_h
                        elif height is None and vb_w:
                            height = width * vb_h / vb_w
                    except ValueError:
                        pass
            return (width, height)
    except ET.ParseError:
        pass
    return (None, None)


def _png_size(path: str) -> tuple[int, int] | None:
    with open(path, "rb") as handle:
        head = handle.read(24)
    if head[:8] == b"\x89PNG\r\n\x1a\n" and head[12:16] == b"IHDR":
        return struct.unpack(">II", head[16:24])
    return None


def _gif_size(path: str) -> tuple[int, int] | None:
    with open(path, "rb") as handle:
        head = handle.read(10)
    if head[:6] in (b"GIF87a", b"GIF89a"):
        return struct.unpack("<HH", head[6:10])
    return None


def bitmap_size(path: str) -> tuple[int | None, int | None]:
    """Pixel size via PyMuPDF; PNG/GIF headers as a fallback."""
    try:
        import fitz  # PyMuPDF

        try:
            pix = fitz.Pixmap(path)
            return (pix.width, pix.height)
        except Exception:  # noqa: BLE001 - some formats only open as documents
            doc = fitz.open(path)
            try:
                rect = doc[0].rect
                return (int(round(rect.width)), int(round(rect.height)))
            finally:
                doc.close()
    except ImportError:
        pass
    for reader in (_png_size, _gif_size):
        try:
            size = reader(path)
        except OSError:
            size = None
        if size:
            return size
    return (None, None)


def scan_resources(preset_dir: str) -> list[dict]:
    folder = os.path.join(preset_dir, "resources")
    if not os.path.isdir(folder):
        return []
    specs: list[dict] = []
    seen: set[str] = set()
    for name in sorted(os.listdir(folder)):
        stem, ext = os.path.splitext(name)
        ext = ext.lower()
        if ext not in RESOURCE_EXT or not os.path.isfile(os.path.join(folder, name)):
            continue
        rid = slugify(stem)
        if rid in seen:
            index = 2
            while f"{rid}-{index}" in seen:
                index += 1
            rid = f"{rid}-{index}"
        seen.add(rid)
        path = os.path.join(folder, name)
        kind = "svg" if ext == ".svg" else "bitmap"
        width, height = svg_size(path) if kind == "svg" else bitmap_size(path)
        spec: dict = {
            "id": rid,
            "typeId": "figure",
            "kind": kind,
            "file": f"resources/{name}",
        }
        if width is not None:
            spec["width"] = _round(width)
        if height is not None:
            spec["height"] = _round(height)
        spec["caption"] = ""
        spec["altText"] = ""
        spec["placement"] = {"position": "top", "span": "column"}
        specs.append(spec)
    return specs


# --- fonts ------------------------------------------------------------------

def _font_info_fonttools(path: str) -> dict | None:
    try:
        from fontTools.ttLib import TTFont
    except ImportError:
        return None
    font = TTFont(path, lazy=True)
    try:
        name_table = font["name"]
        family = name_table.getDebugName(16) or name_table.getDebugName(1)
        weight = 400
        italic = False
        if "OS/2" in font:
            os2 = font["OS/2"]
            weight = int(getattr(os2, "usWeightClass", 400) or 400)
            italic = bool(getattr(os2, "fsSelection", 0) & 0x01)
        if "head" in font and not italic:
            italic = bool(font["head"].macStyle & 0x02)
        return {"family": (family or "").strip(), "weight": weight, "italic": italic}
    finally:
        font.close()


_WEIGHT_WORDS = {
    "thin": 100, "hairline": 100, "extralight": 200, "ultralight": 200, "light": 300,
    "regular": 400, "book": 400, "normal": 400, "roman": 400, "medium": 500,
    "semibold": 600, "demibold": 600, "bold": 700, "extrabold": 800, "ultrabold": 800,
    "black": 900, "heavy": 900,
}


def _font_info_filename(name: str) -> dict:
    """Guess family/weight/style from `Family-Style.ext` (or `Family Style.ext`)."""
    stem = os.path.splitext(name)[0]
    family, _, style = stem.partition("-")
    if not style:
        # no dash: peel trailing style words (`Arial Narrow Bold Italic` -> Arial Narrow / Bold Italic)
        words = family.split()
        style_words: list[str] = []
        while len(words) > 1 and words[-1].lower() in (*_WEIGHT_WORDS, "italic", "oblique"):
            style_words.insert(0, words.pop())
        family, style = " ".join(words), " ".join(style_words)
    style_l = style.lower().replace(" ", "")
    italic = "italic" in style_l or "oblique" in style_l
    weight = 400
    for word, value in sorted(_WEIGHT_WORDS.items(), key=lambda kv: -len(kv[0])):
        if word in style_l:
            weight = value
            break
    return {"family": family.strip() or stem, "weight": weight, "italic": italic}


def scan_fonts(preset_dir: str) -> tuple[list[dict], bool]:
    """Return (families, used_fonttools)."""
    folder = os.path.join(preset_dir, "fonts")
    if not os.path.isdir(folder):
        return ([], True)
    families: dict[str, list[dict]] = {}
    used_fonttools = True
    for name in sorted(os.listdir(folder)):
        ext = os.path.splitext(name)[1].lower()
        path = os.path.join(folder, name)
        if ext not in FONT_EXT or not os.path.isfile(path):
            continue
        info = None
        try:
            info = _font_info_fonttools(path)
        except Exception as exc:  # noqa: BLE001 - fall back to the file name
            print(f"warning: fontTools could not read {name}: {exc}", file=sys.stderr)
        if info is None:
            used_fonttools = False
            info = _font_info_filename(name)
        if not info["family"]:
            info["family"] = _font_info_filename(name)["family"]
        families.setdefault(info["family"], []).append(
            {
                "weight": info["weight"],
                "style": "italic" if info["italic"] else "normal",
                "file": f"fonts/{name}",
            }
        )
    result = []
    for family, variants in families.items():
        variants.sort(key=lambda v: (v["weight"], v["style"]))
        result.append({"name": family, "variants": variants})
    return (result, used_fonttools)


# --- manifest ---------------------------------------------------------------

def upsert_index(index_path: str, entry: dict) -> None:
    index: dict = {"version": MANIFEST_VERSION, "presets": []}
    if os.path.exists(index_path):
        with open(index_path, encoding="utf-8") as handle:
            try:
                index = json.load(handle)
            except json.JSONDecodeError as exc:
                raise SystemExit(f"{index_path} is not valid JSON: {exc}")
        index.setdefault("version", MANIFEST_VERSION)
        index.setdefault("presets", [])
    presets = index["presets"]
    for position, existing in enumerate(presets):
        if existing.get("id") == entry["id"]:
            presets[position] = {**existing, **entry}
            break
    else:
        presets.append(entry)
    if entry.get("default"):
        for other in presets:
            if other.get("id") != entry["id"] and other.get("default"):
                other["default"] = False
    with open(index_path, "w", encoding="utf-8") as handle:
        json.dump(index, handle, indent=2, ensure_ascii=False)
        handle.write("\n")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("preset_dir", help="the preset bundle directory")
    parser.add_argument("--id", help="preset id (default: slug of the directory name)")
    parser.add_argument("--name", help="display name (default: directory name)")
    parser.add_argument("--description", default="", help="one-line description")
    parser.add_argument("--locale", default="en", help="document locale (default: en)")
    parser.add_argument("--default", action="store_true", help="mark as the default preset")
    parser.add_argument(
        "--markdown", metavar="FILE", help="markdown file (relative to the preset dir; default: first *.md)"
    )
    parser.add_argument("--force", action="store_true", help="overwrite an existing preset.json")
    args = parser.parse_args(argv)

    preset_dir = os.path.abspath(args.preset_dir)
    if not os.path.isdir(preset_dir):
        print(f"not a directory: {preset_dir}", file=sys.stderr)
        return 1
    dir_name = os.path.basename(preset_dir.rstrip(os.sep))
    preset_id = args.id or slugify(dir_name)
    preset_name = args.name or dir_name

    markdown = args.markdown
    if markdown is None:
        candidates = sorted(f for f in os.listdir(preset_dir) if f.lower().endswith(".md"))
        markdown = candidates[0] if candidates else None
    if markdown is None:
        print("warning: no markdown file found; set `markdown` in preset.json by hand", file=sys.stderr)
    elif not os.path.exists(os.path.join(preset_dir, markdown)):
        print(f"warning: markdown file not found in preset dir: {markdown}", file=sys.stderr)

    resources = scan_resources(preset_dir)
    fonts, used_fonttools = scan_fonts(preset_dir)
    if fonts and not used_fonttools:
        print(
            "note: fontTools not available; font families/weights were guessed from file names "
            "(python3 -m pip install fonttools for exact metadata)",
            file=sys.stderr,
        )

    preset: dict = {
        "version": MANIFEST_VERSION,
        "id": preset_id,
        "name": preset_name,
    }
    if args.description:
        preset["description"] = args.description
    preset["locale"] = args.locale
    if args.default:
        preset["default"] = True
    preset["markdown"] = {args.locale: markdown} if markdown else {}
    preset["config"] = {}
    preset["resources"] = resources
    preset["fonts"] = fonts

    target = os.path.join(preset_dir, "preset.json")
    if os.path.exists(target) and not args.force:
        target = os.path.join(preset_dir, "preset.scaffold.json")
        print("preset.json already exists; writing preset.scaffold.json instead (merge by hand or use --force)")
    with open(target, "w", encoding="utf-8") as handle:
        json.dump(preset, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    print(f"wrote {target}  ({len(resources)} resource(s), {len(fonts)} font famil{'y' if len(fonts) == 1 else 'ies'})")

    entry: dict = {"id": preset_id, "dir": dir_name, "name": preset_name}
    if args.description:
        entry["description"] = args.description
    entry["locale"] = args.locale
    if args.default:
        entry["default"] = True
    index_path = os.path.join(os.path.dirname(preset_dir), "index.json")
    upsert_index(index_path, entry)
    print(f"updated {index_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
