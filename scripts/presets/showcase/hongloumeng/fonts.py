#!/usr/bin/env python3
"""Static, subset font files for the `hongloumeng` bundle.

Each face is cut from the files fetch.py downloaded: the variable font is
first subset to the characters of the edition that uses it (plus a reserve of
punctuation, vertical presentation forms and full-width forms), then
instanced at each weight, so instancing works on a few thousand glyphs
instead of sixty thousand. Every OpenType layout feature is kept (`vert`,
`vrt2`, `vpal`, `vhal`, `halt`, `palt`, `locl`…), as are `vhea`/`vmtx`.

A character the face lacks is copied in from a donor with the same em
(1000 units): the sibling face of the other script (Noto Serif SC for Noto
Serif TC, LXGW WenKai for LXGW WenKai TC), then Chiron Sung HK, then Jigmo
(CC0). The engine sets text in one family per style with no fallback chain
(`primaryFontFamily` in packages/postext/src/measure/font.ts), so a glyph
missing from the face would print blank.

    python3 scripts/presets/showcase/hongloumeng/fonts.py   # sizes report

build.py imports `build_faces(edition, text, out_dir)` and passes the final
text of the edition (chapters plus editorial matter).
"""
from __future__ import annotations

import io
import json
import os
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
WORK = os.path.join(HERE, "work", "fonts")

JIGMO = "jigmo/Jigmo2.ttf"
CHIRON = "chironsunghk/ChironSungHK[wght].ttf"

# family → (source, weights, donors, file stem)
FACES: dict[str, list[dict]] = {
    "zh-Hant": [
        {"family": "Noto Serif TC", "src": "notoseriftc/NotoSerifTC[wght].ttf", "weights": [400, 700], "donors": ["notoserifsc/NotoSerifSC[wght].ttf", CHIRON, JIGMO], "stem": "NotoSerifTC"},
        {"family": "LXGW WenKai TC", "src": "lxgwwenkaitc/LXGWWenKaiTC-Regular.ttf", "weights": [400], "donors": ["lxgwwenkai/LXGWWenKai-Regular.ttf", JIGMO], "stem": "LXGWWenKaiTC"},
        {"family": "Noto Sans TC", "src": "notosanstc/NotoSansTC[wght].ttf", "weights": [500], "donors": ["notosanssc/NotoSansSC[wght].ttf", JIGMO], "stem": "NotoSansTC"},
    ],
    "zh-Hans": [
        {"family": "Noto Serif SC", "src": "notoserifsc/NotoSerifSC[wght].ttf", "weights": [400, 700], "donors": ["notoseriftc/NotoSerifTC[wght].ttf", CHIRON, JIGMO], "stem": "NotoSerifSC"},
        {"family": "LXGW WenKai", "src": "lxgwwenkai/LXGWWenKai-Regular.ttf", "weights": [400], "donors": ["lxgwwenkaitc/LXGWWenKaiTC-Regular.ttf", JIGMO], "stem": "LXGWWenKai"},
        {"family": "Noto Sans SC", "src": "notosanssc/NotoSansSC[wght].ttf", "weights": [500], "donors": ["notosanstc/NotoSansTC[wght].ttf", JIGMO], "stem": "NotoSansSC"},
    ],
    "en": [
        # 700 and 700 italic are not printed by the design; they are the bold
        # faces of the body family, which markdown **bold** would ask for.
        {"family": "EB Garamond", "src": "ebgaramond/EBGaramond[wght].ttf", "weights": [400, 600, 700], "donors": [], "stem": "EBGaramond", "latin": True},
        {"family": "EB Garamond", "src": "ebgaramond/EBGaramond-Italic[wght].ttf", "weights": [400, 700], "donors": [], "stem": "EBGaramond", "italic": True, "latin": True},
    ],
}

LICENCES = {
    "notoseriftc": "NotoSerifTC-OFL.txt",
    "notoserifsc": "NotoSerifSC-OFL.txt",
    "notosanstc": "NotoSansTC-OFL.txt",
    "notosanssc": "NotoSansSC-OFL.txt",
    "lxgwwenkaitc": "LXGWWenKaiTC-OFL.txt",
    "lxgwwenkai": "LXGWWenKai-OFL.txt",
    "chironsunghk": "ChironSungHK-OFL.txt",
    "ebgaramond": "EBGaramond-OFL.txt",
}


def _ranges(*pairs: tuple[int, int]) -> str:
    return "".join(chr(c) for a, b in pairs for c in range(a, b + 1))


# Kept in every CJK subset whatever the text: ASCII, Latin-1 punctuation,
# general punctuation (dashes, quotes, ellipsis, ※), CJK symbols and
# punctuation, vertical forms, CJK compatibility forms, full-width forms,
# circled numbers (list markers), the numerals of Chinese page numbers.
CJK_RESERVE = (
    _ranges((0x20, 0x7E), (0xA0, 0xFF), (0x2010, 0x2027), (0x2030, 0x203B), (0x2E3A, 0x2E3B), (0x2460, 0x2473), (0x25A0, 0x25CF))
    + _ranges((0x3000, 0x303F), (0xFE10, 0xFE19), (0xFE30, 0xFE4F), (0xFF00, 0xFFEF))
    + "〇零一二三四五六七八九十百千萬万卷第回頁页目錄录序跋圖图表續续見见注註"
)
LATIN_RESERVE = _ranges((0x20, 0x7E), (0xA0, 0x17F), (0x2010, 0x2027), (0x2030, 0x203A), (0x2070, 0x2079), (0x2080, 0x2089), (0x2150, 0x215F))


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


def _instance(font: TTFont, weight: int, stem: str, italic: bool) -> TTFont:
    if "fvar" not in font:
        return font
    loc = {"wght": weight}
    try:
        return instancer.instantiateVariableFont(font, loc, inplace=False, updateFontNames=True)
    except Exception:  # noqa: BLE001 — no STAT name for this position
        inst = instancer.instantiateVariableFont(font, loc, inplace=False, updateFontNames=False)
        suffix = _common.WEIGHT_NAMES[weight] + ("Italic" if italic else "")
        _common._rename(inst, stem, suffix)
        return inst


def _load_static(rel: str, weight: int, chars: str) -> TTFont | None:
    path = os.path.join(FONTS, rel)
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
    """The y of the vertical origin of the target's ideographs (tsb + yMax),
    read from a common ideograph."""
    if "vmtx" not in font:
        return None
    cmap = font.getBestCmap()
    for ch in "一永國国中":
        name = cmap.get(ord(ch))
        if name:
            g = font["glyf"][name]
            g.recalcBounds(font["glyf"])
            return g.yMax + font["vmtx"][name][1]
    return float(font["hhea"].ascent)


def _add_cmap(font: TTFont, cp: int, name: str) -> None:
    cmap = font["cmap"]
    has12 = any(t.format == 12 for t in cmap.tables)
    if cp > 0xFFFF and not has12:
        bmp = font.getBestCmap()
        t = CmapSubtable.newSubtable(12)
        t.platformID, t.platEncID, t.language = 3, 10, 0
        t.cmap = dict(bmp)
        cmap.tables.append(t)
    for t in cmap.tables:
        if t.isUnicode() and (t.format in (12, 13) or cp <= 0xFFFF):
            t.cmap[cp] = name


def _patch(font: TTFont, missing: list[str], donors: list[str], weight: int) -> dict[str, str]:
    """Copy the glyphs of `missing` from the first donor that has each."""
    got: dict[str, str] = {}
    upm = font["head"].unitsPerEm
    origin = _vertical_origin(font)
    for rel in donors:
        need = [c for c in missing if c not in got]
        if not need:
            break
        donor = _load_static(rel, weight, "".join(need))
        if donor is None:
            continue
        scale = upm / donor["head"].unitsPerEm
        dcmap = donor.getBestCmap()
        gs = donor.getGlyphSet()
        for ch in need:
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
            order = font.getGlyphOrder()
            if name in order:
                continue
            font.setGlyphOrder(order + [name])
            font["glyf"].glyphOrder = font.getGlyphOrder()
            font["glyf"][name] = glyph
            glyph.recalcBounds(font["glyf"])
            adv = round(donor["hmtx"][dname][0] * scale)
            font["hmtx"][name] = (adv, glyph.xMin if glyph.numberOfContours else 0)
            if "vmtx" in font:
                vadv = round(donor["vmtx"][dname][0] * scale) if "vmtx" in donor else upm
                tsb = round(origin - glyph.yMax) if origin is not None and glyph.numberOfContours else 0
                font["vmtx"][name] = (vadv, tsb)
            _add_cmap(font, ord(ch), name)
            got[ch] = os.path.basename(os.path.dirname(rel)) if "/" in rel else rel
    return got


def build_face(face: dict, weight: int, text: str, out_dir: str, woff2: bool = True) -> dict:
    """One static, subset, patched face. Returns its report entry."""
    italic = face.get("italic", False)
    reserve = LATIN_RESERVE if face.get("latin") else CJK_RESERVE
    chars = "".join(sorted(set(text + reserve) - {"\n", "\r", "\t"}))
    src = TTFont(os.path.join(FONTS, face["src"]))
    have = src.getBestCmap()
    font = _instance(_subset(src, chars), weight, face["stem"], italic)
    missing = [c for c in chars if ord(c) not in have and c in text and not c.isspace()]
    patched = _patch(font, missing, face["donors"], weight) if missing else {}
    still = [c for c in missing if c not in patched]
    suffix = _common.WEIGHT_NAMES[weight] + ("Italic" if italic else "")
    if weight == 400 and italic:
        suffix = "Italic"
    name = f"{face['stem']}-{suffix}.{'woff2' if woff2 else 'ttf'}"
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, name)
    if woff2:
        font.flavor = "woff2"
    # Keep the source's `head.modified`: a save stamps the current time by
    # default, and the bundle's fingerprint must not change between builds.
    font.recalcTimestamp = False
    buf = io.BytesIO()
    font.save(buf)
    with open(path, "wb") as f:
        f.write(buf.getvalue())
    return {
        "family": face["family"],
        "weight": weight,
        "style": "italic" if italic else "normal",
        "file": name,
        "bytes": len(buf.getvalue()),
        "glyphs": len(font.getGlyphOrder()),
        "patched": {c: d for c, d in patched.items()},
        "missing": "".join(still),
    }


def build_faces(edition: str, text: str, out_dir: str) -> list[dict]:
    return [build_face(face, w, text, out_dir) for face in FACES[edition] for w in face["weights"]]


def copy_licences(out_dir: str, families: list[str]) -> None:
    import shutil

    for folder in families:
        shutil.copyfile(os.path.join(FONTS, folder, "OFL.txt"), os.path.join(out_dir, LICENCES[folder]))
    shutil.copyfile(os.path.join(FONTS, "jigmo", "LICENSE.txt"), os.path.join(out_dir, "Jigmo-CC0.txt"))


def main() -> None:
    data = json.load(open(os.path.join(SOURCE, "chapters.json"), encoding="utf-8"))
    report = {}
    total = 0
    for edition in ("zh-Hant", "zh-Hans", "en"):
        text = data["charsets"][edition]
        entries = build_faces(edition, text, WORK)
        report[edition] = entries
        for e in entries:
            total += e["bytes"]
            patched = "".join(e["patched"]) or "-"
            print(f"{edition:8} {e['file']:32} {e['bytes'] / 1e6:6.2f} MB  {e['glyphs']:5} glyphs  patched {patched}  missing {e['missing'] or '-'}")
    print(f"total {total / 1e6:.2f} MB")
    with open(os.path.join(WORK, "report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
