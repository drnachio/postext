#!/usr/bin/env python3
"""The lettering faces of the `pepper-carrot` bundle: download them from
google/fonts (all SIL Open Font License) into `$PC_CACHE/fonts/` and write
the bundle's WOFF2 files.

| script   | lettering (balloons, colophon)  | sound effects and titles |
|----------|---------------------------------|--------------------------|
| Latin    | Comic Neue 400/700, italics     | Bangers                  |
| Japanese | Zen Antique (credits: Noto Sans JP 400/700) | Dela Gothic One |
| Chinese  | Noto Sans SC 400/700            | ZCOOL KuaiLe             |
| Arabic   | Playpen Sans Arabic 400/700     | Lalezar                  |

These are the faces the engine picks by itself for each language
(`defaultComicFont` / `defaultComicSfxFont` in
packages/postext/src/defaults/comics.ts); the bundle carries them so the
Sandbox, the PDF and the EPUB use the same files.

The Latin faces ship whole (they are small). The CJK and Arabic faces are
subset to the bundle's text plus a reserve (ASCII and Latin-1, general
punctuation, and per script: every kana, the CJK symbols, full-width and
vertical forms; the Arabic blocks and presentation forms), keeping every
OpenType layout feature (`vert`/`vrt2` for the vertical Japanese balloons,
the Arabic joining forms) and the vertical metrics.

    python3 fonts.py            # download only; build.py calls build_faces()
"""
from __future__ import annotations

import io
import os
import shutil
import sys
import urllib.parse

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import Glyph, GlyphComponent
from fontTools.varLib import instancer

from common import CACHE

FONTS = os.path.join(CACHE, "fonts")
GOOGLE = "https://raw.githubusercontent.com/google/fonts/main/ofl/"


def _ranges(*pairs: tuple[int, int]) -> str:
    return "".join(chr(c) for a, b in pairs for c in range(a, b + 1))


# Kept in every subset: ASCII, Latin-1, Latin Extended-A, general
# punctuation (dashes, quotes, … ‼ ⁇ ⁈ ⁉), the euro sign.
COMMON = _ranges((0x20, 0x7E), (0xA0, 0x17F), (0x2000, 0x206F), (0x20AC, 0x20AC))
RESERVE = {
    "cjk": COMMON
    + _ranges(
        (0x3000, 0x303F),  # CJK symbols and punctuation
        (0x3040, 0x30FF),  # hiragana, katakana
        (0x31F0, 0x31FF),  # katakana phonetic extensions
        (0xFE10, 0xFE1F),  # vertical forms
        (0xFE30, 0xFE4F),  # CJK compatibility forms
        (0xFF00, 0xFFEF),  # full-width and half-width forms
    )
    + "一二三四五六七八九十百千万",
    "arab": COMMON
    + _ranges(
        (0x0600, 0x06FF),  # Arabic
        (0x0750, 0x077F),  # Arabic supplement
        (0xFB50, 0xFDFF),  # presentation forms A
        (0xFE70, 0xFEFF),  # presentation forms B
        (0x200C, 0x200F),  # ZWNJ, ZWJ, LRM, RLM
    ),
}

# `src`: the file under google/fonts/ofl; `axes`: a variable font's
# instance (wght is set from `weight`); `scope`: None ships the face whole,
# else the reserve it is subset with.
FACES: list[dict] = [
    {"family": "Comic Neue", "weight": 400, "style": "normal", "src": "comicneue/ComicNeue-Regular.ttf", "file": "ComicNeue-Regular"},
    {"family": "Comic Neue", "weight": 700, "style": "normal", "src": "comicneue/ComicNeue-Bold.ttf", "file": "ComicNeue-Bold"},
    {"family": "Comic Neue", "weight": 400, "style": "italic", "src": "comicneue/ComicNeue-Italic.ttf", "file": "ComicNeue-Italic"},
    {"family": "Comic Neue", "weight": 700, "style": "italic", "src": "comicneue/ComicNeue-BoldItalic.ttf", "file": "ComicNeue-BoldItalic"},
    {"family": "Bangers", "weight": 400, "style": "normal", "src": "bangers/Bangers-Regular.ttf", "file": "Bangers-Regular"},
    {"family": "Zen Antique", "weight": 400, "style": "normal", "src": "zenantique/ZenAntique-Regular.ttf", "file": "ZenAntique-Regular", "scope": "cjk"},
    {"family": "Dela Gothic One", "weight": 400, "style": "normal", "src": "delagothicone/DelaGothicOne-Regular.ttf", "file": "DelaGothicOne-Regular", "scope": "cjk"},
    # The Japanese credits page: Zen Antique has no bold for `**…**`.
    {"family": "Noto Sans JP", "weight": 400, "style": "normal", "src": "notosansjp/NotoSansJP[wght].ttf", "file": "NotoSansJP-Regular", "scope": "cjk", "axes": {}},
    {"family": "Noto Sans JP", "weight": 700, "style": "normal", "src": "notosansjp/NotoSansJP[wght].ttf", "file": "NotoSansJP-Bold", "scope": "cjk", "axes": {}},
    {"family": "Noto Sans SC", "weight": 400, "style": "normal", "src": "notosanssc/NotoSansSC[wght].ttf", "file": "NotoSansSC-Regular", "scope": "cjk", "axes": {}},
    {"family": "Noto Sans SC", "weight": 700, "style": "normal", "src": "notosanssc/NotoSansSC[wght].ttf", "file": "NotoSansSC-Bold", "scope": "cjk", "axes": {}},
    {"family": "ZCOOL KuaiLe", "weight": 400, "style": "normal", "src": "zcoolkuaile/ZCOOLKuaiLe-Regular.ttf", "file": "ZCOOLKuaiLe-Regular", "scope": "cjk"},
    {"family": "Playpen Sans Arabic", "weight": 400, "style": "normal", "src": "playpensansarabic/PlaypenSansArabic[wght].ttf", "file": "PlaypenSansArabic-Regular", "scope": "arab", "axes": {}},
    {"family": "Playpen Sans Arabic", "weight": 700, "style": "normal", "src": "playpensansarabic/PlaypenSansArabic[wght].ttf", "file": "PlaypenSansArabic-Bold", "scope": "arab", "axes": {}},
    {"family": "Lalezar", "weight": 400, "style": "normal", "src": "lalezar/Lalezar-Regular.ttf", "file": "Lalezar-Regular", "scope": "arab"},
]

LICENCES = {
    "comicneue": "ComicNeue-OFL.txt",
    "bangers": "Bangers-OFL.txt",
    "zenantique": "ZenAntique-OFL.txt",
    "delagothicone": "DelaGothicOne-OFL.txt",
    "notosansjp": "NotoSansJP-OFL.txt",
    "notosanssc": "NotoSansSC-OFL.txt",
    "zcoolkuaile": "ZCOOLKuaiLe-OFL.txt",
    "playpensansarabic": "PlaypenSansArabic-OFL.txt",
    "lalezar": "Lalezar-OFL.txt",
}


def fetch() -> None:
    """Download every face and its OFL.txt (skipped when already there)."""
    from fetch import get_retry

    rels = sorted({f["src"] for f in FACES} | {f"{folder}/OFL.txt" for folder in LICENCES})
    for rel in rels:
        path = os.path.join(FONTS, rel)
        if os.path.exists(path):
            continue
        os.makedirs(os.path.dirname(path), exist_ok=True)
        data = get_retry(GOOGLE + urllib.parse.quote(rel))
        with open(path, "wb") as f:
            f.write(data)
        print(f"  fonts/{rel} {len(data) / 1e6:.2f} MB")


def _load(face: dict) -> TTFont:
    font = TTFont(os.path.join(FONTS, face["src"]))
    if "fvar" in font:
        font = instancer.instantiateVariableFont(font, {**face.get("axes", {}), "wght": face["weight"]}, inplace=False, updateFontNames=False)
    return font


def _component(name: str, dx: float, dy: float, scale: float = 1.0) -> GlyphComponent:
    c = GlyphComponent()
    c.glyphName = name
    c.x, c.y = round(dx), round(dy)
    c.flags = 0x4  # ROUND_XY_TO_GRID
    if scale != 1.0:
        c.transform = [[scale, 0], [0, scale]]
    return c


def _bounds(font: TTFont, name: str) -> tuple[int, int, int, int]:
    g = font["glyf"][name]
    g.recalcBounds(font["glyf"])
    return g.xMin, g.yMin, g.xMax, g.yMax


def _add_composite(font: TTFont, name: str, codepoint: int, advance_of: str, parts: list[GlyphComponent]) -> None:
    for tag in list(font.keys()):  # decompile every table before the glyph count changes
        font[tag]
    glyf = font["glyf"]
    g = Glyph()
    g.numberOfContours = -1
    g.components = parts
    order = font.getGlyphOrder() + [name]
    font.setGlyphOrder(order)
    glyf.glyphOrder = order
    glyf[name] = g
    g.recalcBounds(glyf)
    font["hmtx"][name] = (font["hmtx"][advance_of][0], g.xMin)
    if "vmtx" in font:
        font["vmtx"][name] = font["vmtx"][advance_of]
    for table in font["cmap"].tables:
        if table.isUnicode():
            table.cmap[codepoint] = name
    if "post" in font and hasattr(font["post"], "extraNames"):
        font["post"].formatType = 3.0
    font["maxp"].numGlyphs = len(order)


def patch_letters(font: TTFont) -> list[str]:
    """Compose ồ (U+1ED3), ự (U+1EF1) and ŗ (U+0157) from glyphs the face
    has, when it lacks them: the translators' credits name Hồ Nhựt Châu, the
    monsters' "šeŗvice" carries a cedilla, and the engine sets a run in one
    face (a missing glyph prints blank). ŗ is r over the face's combining
    comma below. ồ is ô with the
    grave set off to the right of the circumflex, as Vietnamese stacks it;
    ự is u with a horn (the face's right single quote, scaled down, on the
    right stem) and a dot below (its full stop under the letter). Returns
    the characters it added."""
    if "glyf" not in font:
        return []
    cmap = font.getBestCmap()
    upm = font["head"].unitsPerEm
    added: list[str] = []
    if 0x1ED3 not in cmap and 0xF4 in cmap and 0x300 in cmap:
        base, grave = cmap[0xF4], cmap[0x300]
        bx0, by0, bx1, by1 = _bounds(font, base)
        gx0, gy0, gx1, gy1 = _bounds(font, grave)
        dx = bx1 - 0.02 * upm - gx0 - (gx1 - gx0) * 0.35
        dy = by1 - (gy1 - gy0) * 0.75 - gy0
        _add_composite(font, "uni1ED3", 0x1ED3, base, [_component(base, 0, 0), _component(grave, dx, dy, 0.85)])
        added.append("ồ")
    if 0x1EF1 not in cmap and 0x75 in cmap and 0x2019 in cmap and 0x2E in cmap:
        base, quote, dot = cmap[0x75], cmap[0x2019], cmap[0x2E]
        bx0, by0, bx1, by1 = _bounds(font, base)
        qx0, qy0, qx1, qy1 = _bounds(font, quote)
        px0, py0, px1, py1 = _bounds(font, dot)
        s = 0.7
        horn = _component(quote, bx1 - 0.03 * upm - qx0 * s, by1 - 0.05 * upm - qy0 * s, s)
        dot_c = _component(dot, (bx0 + bx1) / 2 - (px0 + px1) / 2 * 0.9, -0.06 * upm - py1 * 0.9, 0.9)
        _add_composite(font, "uni1EF1", 0x1EF1, base, [_component(base, 0, 0), horn, dot_c])
        added.append("ự")
    if 0x157 not in cmap and 0x72 in cmap and 0x326 in cmap:
        base, comma = cmap[0x72], cmap[0x326]
        bx0, by0, bx1, by1 = _bounds(font, base)
        cx0, cy0, cx1, cy1 = _bounds(font, comma)
        dx = (bx0 + bx1) / 2 - (cx0 + cx1) / 2 - (bx1 - bx0) * 0.15
        _add_composite(font, "uni0157", 0x157, base, [_component(base, 0, 0), _component(comma, dx, 0)])
        added.append("ŗ")
    return added


def build_faces(text: str, out_dir: str) -> list[dict]:
    """Write `<file>.woff2` for every face into `out_dir`; `text` is every
    character the bundle sets (chapters and config). Returns one entry per
    face: family, weight, style, file, bytes, glyphs, the characters
    `patch_letters` composed (`patched`) and the face's cmap (`cmap`, for
    the build's coverage check)."""
    os.makedirs(out_dir, exist_ok=True)
    out: list[dict] = []
    for face in FACES:
        font = _load(face)
        patched = patch_letters(font) if any(c in text for c in "ồựŗ") else []
        cmap = font.getBestCmap()
        scope = face.get("scope")
        if scope:
            keep = sorted({ord(c) for c in RESERVE[scope] + text if ord(c) in cmap})
            opts = subset.Options()
            opts.layout_features = ["*"]
            opts.name_IDs = ["*"]
            opts.name_languages = ["*"]
            opts.notdef_outline = True
            opts.glyph_names = False
            opts.hinting = False
            opts.drop_tables += ["DSIG"]
            sub = subset.Subsetter(opts)
            sub.populate(unicodes=keep)
            sub.subset(font)
        font.flavor = "woff2"
        name = f"{face['file']}.woff2"
        buf = io.BytesIO()
        font.save(buf)
        with open(os.path.join(out_dir, name), "wb") as f:
            f.write(buf.getvalue())
        out.append({
            "family": face["family"],
            "weight": face["weight"],
            "style": face["style"],
            "file": name,
            "bytes": len(buf.getvalue()),
            "glyphs": len(font.getGlyphOrder()),
            "patched": "".join(patched),
            "cmap": set(font.getBestCmap()),
        })
    return out


def copy_licences(out_dir: str) -> None:
    for folder, name in LICENCES.items():
        shutil.copyfile(os.path.join(FONTS, folder, "OFL.txt"), os.path.join(out_dir, name))


if __name__ == "__main__":
    fetch()
    print("fonts in", FONTS, file=sys.stderr)
