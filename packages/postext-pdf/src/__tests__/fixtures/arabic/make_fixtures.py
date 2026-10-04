#!/usr/bin/env python3
"""Rebuild the fonts of the Arabic shaping tests (#380).

Amiri Regular 1.002 and Noto Naskh Arabic 2.021 (SIL OFL 1.1, see OFL.txt),
cut down to the characters of TEXT (the test sentences), with every
OpenType layout feature kept (joining forms, lam-alef, the vocalised-Allah
lookups, mark-to-base and mark-to-mark positioning, `rtlm`). Noto Naskh is a variable font; it is pinned to its
default instance (wght 400), the one pdf-lib embeds.

    python3 make_fixtures.py <Amiri-Regular.ttf> <NotoNaskhArabic[wght].ttf> [<Amiri-Bold.ttf>]

Writes `amiri-subset.ttf` and `noto-naskh-subset.ttf`. With Amiri Bold
(1.003) it also writes the fonts of the styled-word and font-slice tests
(#380 part 2): `amiri-bold-subset.ttf`, Amiri Bold cut to TEXT and
BOLD_TEXT, and `amiri-latin-slice.ttf`, Amiri Regular cut to Basic Latin
and the joining controls, the way Fontsource's `latin` file serves
U+2000–206F, and `amiri-arabic-slice.ttf`, Amiri Regular cut to the Arabic
characters of TEXT, the space and `(` alone, the way Fontsource's `arabic`
file of Amiri holds an opening bracket and no closing one (#401).
"""
import os
import sys

from fontTools import subset
from fontTools.varLib import instancer

HERE = os.path.dirname(os.path.abspath(__file__))
TEXT = ('بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ السلام عليكم ورحمة الله وبركاته لا إله إلا الله كتـــاب '
        'عام 2024 م سنة ١٤٤٥ هـ كلمة Latin كلمة (قوس) ﴿ ﴾ « » ، ؛ ؟ AAA ZZZ '
        '0123456789 ٠١٢٣٤٥٦٧٨٩ .,:-')

BOLD_TEXT = 'كتاب بَيت \u200c\u200d'
LATIN_SLICE = [*range(0x20, 0x7f), 0x200c, 0x200d]


def build(src, dst, text=TEXT, unicodes=None, drop=()):
    opts = subset.Options()
    opts.layout_features = ['*']
    opts.drop_tables += ['DSIG']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    opts.glyph_names = False
    font = subset.load_font(src, opts)
    if 'fvar' in font:
        font = instancer.instantiateVariableFont(font, {'wght': 400})
    sub = subset.Subsetter(opts)
    if unicodes is not None:
        sub.populate(unicodes=unicodes)
    else:
        sub.populate(text=text)
    sub.subset(font)
    # The subsetter keeps the code points of a glyph another one is built
    # from; a slice that lacks a character in its source has it removed.
    for table in font['cmap'].tables:
        for cp in drop:
            table.cmap.pop(cp, None)
    font.flavor = None
    subset.save_font(font, dst, opts)


if __name__ == '__main__':
    build(sys.argv[1], os.path.join(HERE, 'amiri-subset.ttf'))
    build(sys.argv[2], os.path.join(HERE, 'noto-naskh-subset.ttf'))
    if len(sys.argv) > 3:
        build(sys.argv[3], os.path.join(HERE, 'amiri-bold-subset.ttf'), text=TEXT + BOLD_TEXT)
        build(sys.argv[1], os.path.join(HERE, 'amiri-latin-slice.ttf'), unicodes=LATIN_SLICE)
        arabic = sorted({ord(c) for c in TEXT if 0x0600 <= ord(c) <= 0x06ff} | {0x20, 0x28})
        build(sys.argv[1], os.path.join(HERE, 'amiri-arabic-slice.ttf'), unicodes=arabic, drop=(0x29,))
