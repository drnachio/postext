#!/usr/bin/env python3
"""Build `tiny-cff.otf`: a CFF-flavoured OpenType face ('OTTO') of a few
Latin letters, drawn from Lora Regular (SIL OFL 1.1), for the tests of the
CFF size report (a CFF face embeds whole).

    python3 make_cff_fixture.py      # needs fontTools
"""
import os

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, '../../../../../apps/web/public/fonts/Lora-Regular.ttf')
TEXT = 'Tiny CFF abc'

src = TTFont(SOURCE)
cmap = src.getBestCmap()
glyph_set = src.getGlyphSet()
hmtx = src['hmtx']
names = ['.notdef'] + sorted({cmap[ord(c)] for c in TEXT})
charstrings = {}
metrics = {}
for name in names:
    pen = T2CharStringPen(hmtx[name][0], glyph_set)
    glyph_set[name].draw(pen)
    charstrings[name] = pen.getCharString()
    metrics[name] = hmtx[name]
fb = FontBuilder(src['head'].unitsPerEm, isTTF=False)
fb.setupGlyphOrder(names)
fb.setupCharacterMap({ord(c): cmap[ord(c)] for c in set(TEXT)})
fb.setupCFF('TinyCFF-Regular', {'FullName': 'Tiny CFF'}, charstrings, {})
fb.setupHorizontalMetrics(metrics)
fb.setupHorizontalHeader(ascent=src['hhea'].ascent, descent=src['hhea'].descent)
fb.setupNameTable({'familyName': 'Tiny CFF', 'styleName': 'Regular'})
fb.setupOS2(sTypoAscender=src['OS/2'].sTypoAscender, sTypoDescender=src['OS/2'].sTypoDescender, usWinAscent=src['OS/2'].usWinAscent, usWinDescent=src['OS/2'].usWinDescent)
fb.setupPost()
fb.save(os.path.join(HERE, 'tiny-cff.otf'))
