#!/usr/bin/env python3
"""Font chores for a Postext project (requires fontTools; brotli for woff2).

  fonts.py info FONT...
      Family, subfamily, weight, italic, glyph count, variable axes, licence
      (name ID 13/14), embedding permissions (OS/2 fsType), scripts covered.

  fonts.py instance VARIABLE.ttf --out fonts/ --stem Newsreader --weights 400,700
        [--italic] [--axis opsz=16 --axis wdth=100]
      Static instances of a variable font (Postext wants single static faces):
      writes <stem>-Regular.ttf, <stem>-Bold.ttf… Static fonts are copied.

  fonts.py subset FONT... --out fonts/ [--ranges latin,latin-ext,greek,punct,math]
        [--text-from chapters/] [--woff2]
      Subset licensed faces to what the book needs (and mark them
      `redistributable: false` in the manifest so a .postext export leaves
      them out). --text-from adds every character used in the chapters.

  fonts.py scale FONT --factor 1.10 --family "Garamond 110" --out fonts/
      A horizontally scaled copy (layout apps set body text at 105-110 %
      horizontal scale; Postext has no such setting): every glyph and advance
      is stretched and the family renamed.

  fonts.py split COLLECTION.ttc --out fonts/ [--faces regular,italic]
      Single faces out of a .ttc/.otc collection.

Remember: only ttf, otf and woff2 load (not .woff); every family used by the
config (body, headings, callouts, captions, tables, running heads, design text)
must be declared in the manifest `fonts` array, or the PDF/headless render
falls back.
"""
from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path

try:
    from fontTools.ttLib import TTFont, TTCollection
except ImportError:  # pragma: no cover
    sys.exit("fontTools is required: python3 -m pip install fonttools brotli")

WEIGHT_NAMES = {100: "Thin", 200: "ExtraLight", 300: "Light", 400: "Regular", 500: "Medium", 600: "SemiBold",
                700: "Bold", 800: "ExtraBold", 900: "Black"}
RANGES = {
    "latin": [(0x20, 0x7E), (0xA0, 0xFF)],
    "latin-ext": [(0x100, 0x24F), (0x1E00, 0x1EFF)],
    "greek": [(0x370, 0x3FF)],
    "cyrillic": [(0x400, 0x4FF)],
    "punct": [(0x2000, 0x206F), (0x20A0, 0x20CF), (0x2100, 0x214F)],
    "supsub": [(0x2070, 0x209F)],
    "arrows": [(0x2190, 0x21FF)],
    "math": [(0x2200, 0x22FF), (0x00B1, 0x00B1), (0x00D7, 0x00D7), (0x00F7, 0x00F7)],
    "shapes": [(0x25A0, 0x25FF), (0x2600, 0x26FF), (0x2700, 0x27BF)],
    "ligatures": [(0xFB00, 0xFB06)],
}


def name_of(font, nid: int) -> str:
    return font["name"].getDebugName(nid) or ""


def cmd_info(args) -> None:
    for f in args.fonts:
        font = TTFont(f, lazy=True, fontNumber=0)
        os2 = font["OS/2"] if "OS/2" in font else None
        cmap = font.getBestCmap() or {}
        scripts = [k for k, rs in RANGES.items() if any(lo <= cp <= hi for lo, hi in rs for cp in cmap)]
        fs = os2.fsType if os2 else 0
        perm = {0: "installable", 2: "restricted (no embedding!)", 4: "preview & print", 8: "editable"}.get(fs & 0xF, f"fsType={fs}")
        print(f"{f}\n  family: {name_of(font, 16) or name_of(font, 1)} / {name_of(font, 17) or name_of(font, 2)}"
              f"\n  weight: {os2.usWeightClass if os2 else '?'}  italic: {bool(os2 and os2.fsSelection & 1)}"
              f"  glyphs: {font['maxp'].numGlyphs}  outlines: {'CFF' if 'CFF ' in font or 'CFF2' in font else 'TrueType'}"
              f"\n  axes: {[(a.axisTag, a.minValue, a.defaultValue, a.maxValue) for a in font['fvar'].axes] if 'fvar' in font else 'static'}"
              f"\n  covers: {', '.join(scripts)}\n  embedding: {perm}"
              f"\n  licence: {(name_of(font, 13) or '')[:160]} {name_of(font, 14)}")


def _rename(font, family: str, subfamily: str) -> None:
    style = subfamily.replace("Regular", "").strip() or "Regular"
    full = f"{family} {style}" if style != "Regular" else family
    ps = f"{family}-{subfamily}".replace(" ", "")
    legacy = style if style in ("Regular", "Bold", "Italic", "Bold Italic") else "Regular"
    for nid, value in ((1, family), (2, legacy), (4, full), (6, ps), (16, family), (17, style)):
        font["name"].setName(value, nid, 3, 1, 0x409)
        font["name"].setName(value, nid, 1, 0, 0)


def cmd_instance(args) -> None:
    from fontTools.varLib import instancer

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    axes = {}
    for a in args.axis or []:
        k, v = a.split("=")
        axes[k] = float(v)
    for w in [int(x) for x in args.weights.split(",")]:
        suffix = WEIGHT_NAMES[w] + ("Italic" if args.italic else "")
        if w == 400 and args.italic:
            suffix = "Italic"
        path = out / f"{args.stem}-{suffix}.ttf"
        font = TTFont(args.font)
        if "fvar" in font:
            loc = {**axes}
            if any(a.axisTag == "wght" for a in font["fvar"].axes):
                loc["wght"] = w
            try:
                font = instancer.instantiateVariableFont(font, loc, inplace=False, updateFontNames=True)
            except Exception:
                font = instancer.instantiateVariableFont(TTFont(args.font), loc, inplace=False, updateFontNames=False)
                _rename(font, args.stem, suffix)
            font.save(path)
        else:
            shutil.copyfile(args.font, path)
        print(f"wrote {path}")


def cmd_subset(args) -> None:
    from fontTools import subset as ft

    unicodes: set[int] = set()
    for r in (args.ranges or "latin,latin-ext,punct,supsub,ligatures").split(","):
        for lo, hi in RANGES[r.strip()]:
            unicodes.update(range(lo, hi + 1))
    if args.text_from:
        for p in Path(args.text_from).rglob("*"):
            if p.suffix in (".md", ".json", ".txt"):
                unicodes.update(ord(c) for c in p.read_text(encoding="utf-8", errors="ignore"))
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for f in args.fonts:
        opts = ft.Options()
        opts.layout_features = ["*"]
        opts.name_IDs = ["*"]
        opts.notdef_outline = True
        font = TTFont(f)
        sub = ft.Subsetter(options=opts)
        sub.populate(unicodes=unicodes)
        sub.subset(font)
        ext = ".woff2" if args.woff2 else Path(f).suffix
        if args.woff2:
            font.flavor = "woff2"
        path = out / (Path(f).stem + ext)
        font.save(path)
        print(f"wrote {path} ({path.stat().st_size // 1024} KB)")
    print('Mark these families "redistributable": false in the manifest if their licence forbids sharing.')


def cmd_scale(args) -> None:
    from fontTools.pens.transformPen import TransformPen
    from fontTools.pens.t2CharStringPen import T2CharStringPen
    from fontTools.pens.ttGlyphPen import TTGlyphPen

    font = TTFont(args.font)
    k = float(args.factor)
    gs = font.getGlyphSet()
    if "glyf" in font:
        glyf = font["glyf"]
        new = {}
        for name in font.getGlyphOrder():
            pen = TTGlyphPen(gs)
            gs[name].draw(TransformPen(pen, (k, 0, 0, 1, 0, 0)))
            new[name] = pen.glyph()
        for name, g in new.items():
            glyf[name] = g
    elif "CFF " in font:
        cff = font["CFF "].cff
        top = cff.topDictIndex[0]
        cs = top.CharStrings
        for name in font.getGlyphOrder():
            width = font["hmtx"][name][0]
            pen = T2CharStringPen(round(width * k), gs)
            gs[name].draw(TransformPen(pen, (k, 0, 0, 1, 0, 0)))
            c = pen.getCharString(private=cs[name].private, globalSubrs=cs[name].globalSubrs)
            cs[name] = c
    else:
        sys.exit("unsupported outline format")
    hmtx = font["hmtx"]
    for name in font.getGlyphOrder():
        w, lsb = hmtx[name]
        hmtx[name] = (round(w * k), round(lsb * k))
    sub = name_of(font, 17) or name_of(font, 2) or "Regular"
    _rename(font, args.family, sub.replace(" ", ""))
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    path = out / f"{args.family.replace(' ', '')}-{sub.replace(' ', '')}{Path(args.font).suffix}"
    font.save(path)
    print(f"wrote {path}  (family {args.family!r}; family names ending in digits are fine)")


def cmd_split(args) -> None:
    coll = TTCollection(args.collection)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    want = [w.strip().lower() for w in (args.faces or "").split(",") if w.strip()]
    for font in coll.fonts:
        ps = name_of(font, 6) or "face"
        if want and not any(w in ps.lower() for w in want):
            continue
        ext = ".otf" if "CFF " in font else ".ttf"
        path = out / f"{re.sub(r'[^A-Za-z0-9-]', '', ps)}{ext}"
        font.save(path)
        print(f"wrote {path}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("info")
    p.add_argument("fonts", nargs="+")
    p = sub.add_parser("instance")
    p.add_argument("font")
    p.add_argument("--out", required=True)
    p.add_argument("--stem", required=True)
    p.add_argument("--weights", default="400,700")
    p.add_argument("--italic", action="store_true")
    p.add_argument("--axis", action="append")
    p = sub.add_parser("subset")
    p.add_argument("fonts", nargs="+")
    p.add_argument("--out", required=True)
    p.add_argument("--ranges")
    p.add_argument("--text-from")
    p.add_argument("--woff2", action="store_true")
    p = sub.add_parser("scale")
    p.add_argument("font")
    p.add_argument("--factor", required=True)
    p.add_argument("--family", required=True)
    p.add_argument("--out", required=True)
    p = sub.add_parser("split")
    p.add_argument("collection")
    p.add_argument("--out", required=True)
    p.add_argument("--faces")
    args = ap.parse_args()
    {"info": cmd_info, "instance": cmd_instance, "subset": cmd_subset, "scale": cmd_scale, "split": cmd_split}[args.cmd](args)


if __name__ == "__main__":
    main()
