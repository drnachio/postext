#!/usr/bin/env python3
"""Subset font files for the `kokoro` bundle.

Shippori Mincho B1 (FONTDASH, OFL) sets the text: its kana and kanji follow
the 東京築地活版製造所 五号明朝, the type of Meiji and Taishō books, and B1
adds the rounded corners and ink pooling of letterpress. Regular for the
text, Bold for part and section titles (and any bold the text takes). Shippori Antique B1
(the same family's antique, 築地体後期五号仮名) sets running heads and folios.

Each face is subset to the characters of the book (`work/charset.txt`,
written by text.py) plus a Japanese reserve: ASCII and Latin-1, the CJK
symbols and punctuation, every hiragana and katakana, the full-width forms,
the vertical presentation forms, the kanji numerals. Every OpenType layout
feature is kept, so the subset keeps `vert`/`vrt2` (vertical alternates of
、。「」（）ー〜…―, the small kana and the rest), `vkna`, `vpal`/`palt`, and the
glyphs those features reach; `vhea`/`vmtx` are kept too. `check()` reads the
result back and fails if any of that went missing.

A character a face lacks would print blank (the engine sets text in one
family per style, packages/postext/src/measure/font.ts), so it is copied in
from Noto Serif JP (same 1000-unit em, same vertical origin).

    python3 scripts/presets/showcase/kokoro/fonts.py      # work/fonts/*.woff2 + report

The antique is a display face, subset to the headings, the design's
words and the plate captions (`work/display.txt`
from text.py, plus plates.json); Regular carries the whole text.

build.py imports `build_faces(text, display, out_dir)`, `plate_text()` and
`copy_licences(out_dir)`.
"""
from __future__ import annotations

import io
import json
import os
import shutil
import sys

from fontTools import subset
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._c_m_a_p import CmapSubtable
from fontTools.varLib import instancer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import _common  # noqa: E402

SOURCE = os.path.join(HERE, "source")
FONTS = os.path.join(SOURCE, "fonts")
WORK = os.path.join(HERE, "work")

DONOR = "notoserifjp/NotoSerifJP[wght].ttf"

FACES: list[dict] = [
    {"family": "Shippori Mincho B1", "weight": 400, "src": "shipporiminchob1/ShipporiMinchoB1-Regular.ttf", "stem": "ShipporiMinchoB1"},
    # Bold carries the whole text too: headings and part titles, and any
    # `**…**` an editor sets in the Sandbox.
    {"family": "Shippori Mincho B1", "weight": 700, "src": "shipporiminchob1/ShipporiMinchoB1-Bold.ttf", "stem": "ShipporiMinchoB1"},
    {"family": "Shippori Antique B1", "weight": 400, "src": "shipporiantiqueb1/ShipporiAntiqueB1-Regular.ttf", "stem": "ShipporiAntiqueB1", "scope": "display"},
]

LICENCES = {
    "shipporiminchob1": "ShipporiMinchoB1-OFL.txt",
    "shipporiantiqueb1": "ShipporiAntiqueB1-OFL.txt",
    "notoserifjp": "NotoSerifJP-OFL.txt",
}


def _ranges(*pairs: tuple[int, int]) -> str:
    return "".join(chr(c) for a, b in pairs for c in range(a, b + 1))


# Kept whatever the text: ASCII and Latin-1; general punctuation (dashes,
# quotes, ‥ …, ※); arrows and geometric shapes (◎○●△▲, the emphasis marks
# the engine may draw from the font); CJK symbols and punctuation (、。〃々〆
# 〇「」『』【】〔〕〜〳〴〵 …); all hiragana and katakana (with ゝゞヽヾ and the
# small kana); the katakana phonetic extensions; the vertical forms; the
# CJK compatibility forms (︵︶…); full-width and half-width forms; the
# kanji numerals and the words of numbered matter (第 章 頁 巻 図 表 注).
JA_RESERVE = (
    _ranges((0x20, 0x7E), (0xA0, 0xFF), (0x2010, 0x2027), (0x2030, 0x203B), (0x2190, 0x2193), (0x25A0, 0x25CF), (0x2460, 0x2473))
    + _ranges((0x3000, 0x303F), (0x3041, 0x309F), (0x30A0, 0x30FF), (0x31F0, 0x31FF), (0xFE10, 0xFE19), (0xFE30, 0xFE4F), (0xFF00, 0xFFEF))
    + "〇一二三四五六七八九十百千万億零壱弐参拾第章節頁巻図表注続上中下序目次跋"
)


# The reserve of a display face (`scope: "display"`: headings, running
# heads, folios, captions): ASCII, CJK punctuation, kana, full-width
# forms, the kanji numerals.
DISPLAY_RESERVE = (
    _ranges((0x20, 0x7E), (0x2010, 0x2026), (0x3000, 0x303F), (0x3041, 0x309F), (0x30A0, 0x30FF), (0xFE30, 0xFE4F), (0xFF01, 0xFF5E))
    + "〇一二三四五六七八九十百千万第章節頁巻図表注続上中下序目次"
)


def _subset(font: TTFont, text: str) -> TTFont:
    opts = subset.Options()
    opts.layout_features = ["*"]
    opts.layout_scripts = ["*"]
    opts.name_IDs = ["*"]
    opts.name_languages = ["*"]
    opts.name_legacy = True
    opts.notdef_outline = True
    opts.glyph_names = False
    opts.hinting = False
    opts.legacy_kern = True
    opts.drop_tables += ["DSIG", "hdmx", "LTSH", "VDMX"]
    sub = subset.Subsetter(opts)
    sub.populate(text=text)
    sub.subset(font)
    return font


def _load_donor(weight: int, chars: str) -> TTFont | None:
    path = os.path.join(FONTS, DONOR)
    if not os.path.exists(path):
        return None
    font = TTFont(path)
    have = font.getBestCmap()
    want = "".join(c for c in chars if ord(c) in have)
    if not want:
        return None
    font = _subset(font, want)
    if "fvar" in font:
        axis = next(a for a in font["fvar"].axes if a.axisTag == "wght")
        font = instancer.instantiateVariableFont(font, {"wght": max(axis.minValue, min(axis.maxValue, weight))}, inplace=False)
    return font


def _vertical_origin(font: TTFont) -> float | None:
    """The y of the vertical origin of the face's ideographs (tsb + yMax)."""
    if "vmtx" not in font:
        return None
    cmap = font.getBestCmap()
    for ch in "一永国中":
        name = cmap.get(ord(ch))
        if name:
            g = font["glyf"][name]
            g.recalcBounds(font["glyf"])
            return g.yMax + font["vmtx"][name][1]
    return float(font["hhea"].ascent)


def _add_cmap(font: TTFont, cp: int, name: str) -> None:
    cmap = font["cmap"]
    if cp > 0xFFFF and not any(t.format == 12 for t in cmap.tables):
        t = CmapSubtable.newSubtable(12)
        t.platformID, t.platEncID, t.language = 3, 10, 0
        t.cmap = dict(font.getBestCmap())
        cmap.tables.append(t)
    for t in cmap.tables:
        if t.isUnicode() and (t.format in (12, 13) or cp <= 0xFFFF):
            t.cmap[cp] = name


def _patch(font: TTFont, missing: list[str], weight: int) -> list[str]:
    """Copy the glyphs of `missing` from Noto Serif JP; returns the ones copied."""
    donor = _load_donor(weight, "".join(missing))
    if donor is None:
        return []
    got = []
    upm = font["head"].unitsPerEm
    scale = upm / donor["head"].unitsPerEm
    origin = _vertical_origin(font)
    dcmap = donor.getBestCmap()
    gs = donor.getGlyphSet()
    for ch in missing:
        dname = dcmap.get(ord(ch))
        if not dname:
            continue
        pen = TTGlyphPen(None)
        if scale != 1:
            from fontTools.pens.transformPen import TransformPen

            gs[dname].draw(TransformPen(pen, (scale, 0, 0, scale, 0, 0)))
        else:
            gs[dname].draw(pen)
        glyph = pen.glyph()
        name = f"u{ord(ch):04X}"
        if name in font.getGlyphOrder():
            continue
        font.setGlyphOrder(font.getGlyphOrder() + [name])
        font["glyf"].glyphOrder = font.getGlyphOrder()
        font["glyf"][name] = glyph
        glyph.recalcBounds(font["glyf"])
        font["hmtx"][name] = (round(donor["hmtx"][dname][0] * scale), glyph.xMin if glyph.numberOfContours else 0)
        if "vmtx" in font:
            vadv = round(donor["vmtx"][dname][0] * scale) if "vmtx" in donor else upm
            tsb = round(origin - glyph.yMax) if origin is not None and glyph.numberOfContours else 0
            font["vmtx"][name] = (vadv, tsb)
        _add_cmap(font, ord(ch), name)
        got.append(ch)
    return got


def _features(font: TTFont, table: str) -> set[str]:
    if table not in font:
        return set()
    return {fr.FeatureTag for fr in font[table].table.FeatureList.FeatureRecord if font[table].table.FeatureList}


def check(font: TTFont, text: str) -> dict:
    """What a vertical book needs from the subset: the vertical metrics, the
    `vert`/`vrt2` lookups and a vertical alternate for the marks that turn
    or move in vertical text."""
    gsub = font["GSUB"].table if "GSUB" in font else None
    vert_map: dict[str, str] = {}
    if gsub:
        for fr in gsub.FeatureList.FeatureRecord:
            if fr.FeatureTag != "vert":
                continue
            for li in fr.Feature.LookupListIndex:
                lookup = gsub.LookupList.Lookup[li]
                for st in lookup.SubTable:
                    st = getattr(st, "ExtSubTable", st)
                    vert_map.update(getattr(st, "mapping", {}) or {})
    cmap = font.getBestCmap()
    # 〳〴〵 are not probed: the くの字点 halves exist only in vertical
    # text, their nominal glyphs are already the vertical ones.
    probes = "、。「」『』（）〔〕ー〜…―ぁぃぅぇぉっゃゅょァィゥェォッャュョ"
    no_vert = [c for c in probes if ord(c) in cmap and cmap[ord(c)] not in vert_map]
    out = {
        "vhea": "vhea" in font,
        "vmtx": "vmtx" in font,
        "gsub": sorted(_features(font, "GSUB")),
        "gpos": sorted(_features(font, "GPOS")),
        "vertSubstitutions": len(vert_map),
        "noVerticalForm": "".join(no_vert),
        "missing": "".join(c for c in text if not c.isspace() and ord(c) not in cmap),
    }
    if not (out["vhea"] and out["vmtx"] and "vert" in out["gsub"] and out["vertSubstitutions"] > 0):
        raise SystemExit(f"vertical support lost in the subset: {out}")
    return out


def build_face(face: dict, text: str, out_dir: str, woff2: bool = True) -> dict:
    reserve = DISPLAY_RESERVE if face.get("scope") == "display" else JA_RESERVE
    chars = "".join(sorted(set(text + reserve) - {"\n", "\r", "\t"}))
    src = TTFont(os.path.join(FONTS, face["src"]))
    have = src.getBestCmap()
    font = _subset(src, chars)
    missing = [c for c in sorted(set(text)) if ord(c) not in have and not c.isspace()]
    patched = _patch(font, missing, face["weight"]) if missing else []
    name = f"{face['stem']}-{_common.WEIGHT_NAMES[face['weight']]}.{'woff2' if woff2 else 'ttf'}"
    os.makedirs(out_dir, exist_ok=True)
    if woff2:
        font.flavor = "woff2"
    # Keep the source's `head.modified`: the bundle fingerprint must not
    # change between builds.
    font.recalcTimestamp = False
    buf = io.BytesIO()
    font.save(buf)
    with open(os.path.join(out_dir, name), "wb") as f:
        f.write(buf.getvalue())
    reread = TTFont(io.BytesIO(buf.getvalue()))
    return {
        "family": face["family"],
        "weight": face["weight"],
        "style": "normal",
        "file": name,
        "bytes": len(buf.getvalue()),
        "glyphs": len(reread.getGlyphOrder()),
        "patched": "".join(patched),
        **check(reread, text),
    }


def build_faces(text: str, display: str, out_dir: str) -> list[dict]:
    """`text`: every character of the book; `display`: the characters the
    display faces print (headings, running heads, captions)."""
    return [build_face(face, display if face.get("scope") == "display" else text, out_dir) for face in FACES]


def plate_text() -> str:
    """Captions and credits of the plates (plates.json), printed under the
    pictures and in the colophon."""
    s = json.load(open(os.path.join(HERE, "plates.json"), encoding="utf-8"))
    return "".join(p.get("caption", "") + p.get("credit", "") + p.get("alt", {}).get("ja", "") for p in s["scans"] + s["scenes"])


def copy_licences(out_dir: str, folders: tuple[str, ...] = ("shipporiminchob1", "shipporiantiqueb1")) -> None:
    """The OFL of each family that ships (add notoserifjp when a glyph was
    patched in from it)."""
    for folder in folders:
        shutil.copyfile(os.path.join(FONTS, folder, "OFL.txt"), os.path.join(out_dir, LICENCES[folder]))


def main() -> None:
    captions = plate_text()
    text = open(os.path.join(WORK, "charset.txt"), encoding="utf-8").read() + captions
    display = open(os.path.join(WORK, "display.txt"), encoding="utf-8").read() + captions
    out = os.path.join(WORK, "fonts")
    entries = build_faces(text, display, out)
    folders = ["shipporiminchob1", "shipporiantiqueb1"] + (["notoserifjp"] if any(e["patched"] for e in entries) else [])
    copy_licences(out, tuple(folders))
    total = 0
    for e in entries:
        total += e["bytes"]
        print(f"{e['file']:32} {e['bytes'] / 1e3:7.0f} KB  {e['glyphs']:5} glyphs  vert {e['vertSubstitutions']:3}  "
              f"GSUB {','.join(e['gsub'])}  GPOS {','.join(e['gpos'])}  patched {e['patched'] or '-'}  missing {e['missing'] or '-'}  "
              f"no vertical form {e['noVerticalForm'] or '-'}")
    print(f"total {total / 1e6:.2f} MB")
    with open(os.path.join(out, "report.json"), "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
