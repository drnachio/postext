#!/usr/bin/env python3
"""Rebuild the fonts of the Arabic shaping tests (#380).

Amiri Regular 1.002 and Noto Naskh Arabic 2.021 (SIL OFL 1.1, see OFL.txt),
cut down to the characters of TEXT (the test sentences), with every
OpenType layout feature kept (joining forms, lam-alef, the vocalised-Allah
lookups, mark-to-base and mark-to-mark positioning, `rtlm`). Noto Naskh is a variable font; it is pinned to its
default instance (wght 400), the one pdf-lib embeds.

    python3 make_fixtures.py <Amiri-Regular.ttf> <NotoNaskhArabic[wght].ttf>

Writes `amiri-subset.ttf` and `noto-naskh-subset.ttf`.
"""
import os
import sys

from fontTools import subset
from fontTools.varLib import instancer

HERE = os.path.dirname(os.path.abspath(__file__))
TEXT = ('بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ السلام عليكم ورحمة الله وبركاته لا إله إلا الله كتـــاب '
        'عام 2024 م سنة ١٤٤٥ هـ كلمة Latin كلمة (قوس) ﴿ ﴾ « » ، ؛ ؟ AAA ZZZ '
        '0123456789 ٠١٢٣٤٥٦٧٨٩ .,:-')


def build(src, dst):
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
    sub.populate(text=TEXT)
    sub.subset(font)
    font.flavor = None
    subset.save_font(font, dst, opts)


if __name__ == '__main__':
    build(sys.argv[1], os.path.join(HERE, 'amiri-subset.ttf'))
    build(sys.argv[2], os.path.join(HERE, 'noto-naskh-subset.ttf'))
