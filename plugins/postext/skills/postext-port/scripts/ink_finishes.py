#!/usr/bin/env python3
"""Special inks and die-line plates read from their names (#1571).

    ink_finishes.py NAME [NAME ...]

A Python port of the engine's `guessInkFinish` (packages/postext/src/color/
finishes.ts): the finish a separation or swatch name suggests (`Gold`,
`PANTONE 871 C` metallic; `Hot foil` foil; `Fluo pink`, `PANTONE 806 C`
fluorescent; `Opaque white` white; `Varnish`, `Spot UV`, `Barniz UVI`
varnish) and its sheen. The word lists are the engine's, in the same order;
keep them in step when the engine's change (tests/test_ink_finishes.py
checks a sample of both). It is a hint for the port report: a finish is
written in the config only after someone looks at the source.

`die_line_plate(name)` says whether a plate is the die-maker's (CutContour,
Die, Dieline, Troquel…), which becomes `print.dieLine.ink`, not a colour.
"""
from __future__ import annotations

import json
import re
import sys

# The engine's `(?<![\p{L}\p{N}])…(?![\p{L}\p{N}])`: `[^\W_]` is a letter or
# a digit in any script.
_EDGE_L = r"(?<![^\W_])"
_EDGE_R = r"(?![^\W_])"
# The engine's `\p{L}*`.
_LETTERS = r"[^\W\d_]*"


def _whole_words(words: list[str]) -> re.Pattern[str]:
    body = "|".join(w.replace(r"\p{L}*", _LETTERS) for w in words)
    return re.compile(f"{_EDGE_L}(?:{body}){_EDGE_R}", re.I)


def _anywhere(words: list[str]) -> re.Pattern[str]:
    return re.compile("|".join(words))


# In the order they are tried: a varnish or foil word wins over a colour word
# (`Gold foil` is a foil, `Barniz oro` a varnish), a fluorescent word over
# `white`, a metal over `white` (白金). French `or` is left out on purpose.
FINISH_WORDS: list[tuple[str, list[re.Pattern[str]]]] = [
    ("varnish", [
        _whole_words([
            "varnish", "spot[ -]?uv", "uv[ -]?(?:varnish|coating|lack)", "overprint varnish", "lacquer",
            "barniz", "uvi", "vern[ií]s", "vernis", "lack", "drucklack", "spot-?lack", "vernice", "verniz",
        ]),
        _anywhere(["ニス", "バーニッシュ", "光油", "上光", "ورنيش"]),
    ]),
    ("foil", [
        _whole_words([
            "foil", "hot[ -]?foil", "hot[ -]?stamp(?:ing)?", "foil stamping", "stamping foil",
            "estampaci[oó]n", "estampat", "estampado en caliente", "estampagem", "dorure", "dorure à chaud", "marquage à chaud",
            "hei(?:ß|ss)folie", "folienpr[äa]gung", "pr[äa]gefolie", "lamina", "lámina", "stampa a caldo", "estampagem a quente",
        ]),
        _anywhere(["烫金", "烫银", "燙金", "箔押し", "箔", "ホイル", "رقائق", "بصمة ساخنة", "ختم حراري"]),
    ]),
    ("fluorescent", [
        _whole_words([
            "fluo", "fluor", "flúor", "fluorescent", "fluorescente", "fluoreszierend", "fluoreszenz", r"leucht\p{L}*", "ne[oó]n",
            # Pantone's fluorescent inks: 801 to 814.
            "80[1-9] ?[cu]", "81[0-4] ?[cu]",
        ]),
        _anywhere(["蛍光", "荧光", "螢光", "ネオン", "فلوري", "فسفوري", "فلورسنت", "نيون"]),
    ]),
    ("metallic", [
        _whole_words([
            "metallic", "metallics", "métallique", "métallisée?", "metallisch", "metallic[oa]", "metallizzat[oa]", "met[aá]lic[oa]",
            "metalizad[oa]", "metal·litzad[ae]", "metal·litzat", "metàl·lic[a]?", "metal", "métal",
            "gold", "silver", "copper", "bronze", "bronce", "bronzo", "oro", "plata", "cobre", "argent", "argento", "cuivre",
            "silber", "kupfer", "rame", "ouro", "prata", "daurat", "daurada", "coure", "doré", "dorée", "argenté", "argentée",
            "goldfarben", "silbern", "dorado", "plateado", "dourado", "prateado", "dorato", "argentato",
            # Pantone's metallic inks: 871 to 877, the 8000s and the 10000s.
            "87[1-7] ?[cu]", "8[0-9]{3} ?[cu]", "10[0-9]{3} ?[cu]",
        ]),
        _anywhere(["金色", "银色", "銀色", "专金", "专银", "金属", "金屬", "ゴールド", "シルバー", "メタリック", "カッパー", "ブロンズ",
                   "金", "銀", "银", "銅", "铜", "ذهب", "فضي", "فضة", "معدني", "نحاس", "برونز"]),
    ]),
    ("white", [
        _whole_words([
            "white", "opaque white", "blanco", "blanc", "blanca", "wei(?:ß|ss)", "deckwei(?:ß|ss)", "bianco", "branco",
        ]),
        _anywhere(["白", "ホワイト", "أبيض", "بيضاء"]),
    ]),
]

# Soft touch, then satin (`Seidenmatt` is a satin though it holds `matt`),
# then matte, then gloss.
SHEEN_WORDS: list[tuple[str, list[re.Pattern[str]]]] = [
    ("softTouch", [
        _whole_words(["soft[ -]?touch", "soft[ -]?feel", "tacto suave", "toucher doux", "tacte suau", "toque suave", "soft-?touch-?lack"]),
        _anywhere(["ソフトタッチ", "触感", "肤感", "ملمس ناعم"]),
    ]),
    ("satin", [
        _whole_words(["satin", "satinado", "satinada", "satiné", "satinée", "setinat", "setinada", "satinato", "acetinado", "seidenmatt", "seidenglanz"]),
        _anywhere(["サテン", "丝光", "絲光", "ساتان"]),
    ]),
    ("matte", [
        _whole_words(["matte?", "mate", "mat", "opaco", "fosco", "mattiert"]),
        _anywhere(["マット", "哑光", "亚光", "啞光", "مطفي"]),
    ]),
    ("gloss", [
        _whole_words(["gloss", "glossy", "brillo", "brillante", "brillant", "brilhante", "brilho", "glänzend", "glanz", "hochglanz", "lucido"]),
        _anywhere(["グロス", "光沢", "亮光", "لامع"]),
    ]),
]


def _matches(patterns: list[re.Pattern[str]], text: str) -> bool:
    return any(p.search(text) for p in patterns)


def guess_ink_finish(name: str) -> dict | None:
    """The finish `name` suggests, as the config writes it (`{"kind": …,
    "sheen"?: …}`), or None. Only a varnish, a foil or a metallic ink takes
    a sheen from the name, and soft touch only a varnish."""
    import unicodedata

    n = unicodedata.normalize("NFC", name)
    for kind, patterns in FINISH_WORDS:
        if not _matches(patterns, n):
            continue
        out: dict = {"kind": kind}
        if kind in ("varnish", "foil", "metallic"):
            for sheen, sheen_patterns in SHEEN_WORDS:
                if sheen == "softTouch" and kind != "varnish":
                    continue
                if _matches(sheen_patterns, n):
                    out["sheen"] = sheen
                    break
        return out
    return None


# Plate names die-makers and printers give the die line. Checked before the
# finishes: a `Die` plate is never an ink.
_DIE_LINE = _whole_words([
    "cut ?contour", "die ?line", "die ?cut(?:ting)?", "die", "cutter", "cut ?line", "kiss ?cut", "thru ?cut",
    "troquel", "troquelado", "línea de troquel", "linea de troquel", "fustella", "faca", "stanz\\p{L}*", "découpe", "decoupe",
])
_DIE_LINE_CJK = _anywhere(["模切", "刀模", "刀版", "抜き型", "トムソン", "قالب القص"])


def die_line_plate(name: str) -> bool:
    """Whether `name` is the die-maker's plate (CutContour, Die, Dieline,
    Troquel, Stanzform…): it becomes `print.dieLine.ink`, never a colour."""
    return bool(_DIE_LINE.search(name) or _DIE_LINE_CJK.search(name))


def suggested_ink_config(names: list[str]) -> dict:
    """The `print` suggestions for the spot plates `names`: an ink table
    entry with a guessed finish per special ink, and the die line's plate
    name. Only names that suggest something are listed."""
    inks, die = [], None
    for name in names:
        if die_line_plate(name):
            die = die or name
            continue
        finish = guess_ink_finish(name)
        if finish:
            inks.append({"name": name, "finish": finish})
    out: dict = {}
    if inks:
        out["inks"] = inks
    if die:
        out["dieLine"] = {"ink": die}
    return out


if __name__ == "__main__":
    for arg in sys.argv[1:]:
        print(json.dumps({"name": arg, "dieLine": die_line_plate(arg), "finish": guess_ink_finish(arg)}, ensure_ascii=False))
