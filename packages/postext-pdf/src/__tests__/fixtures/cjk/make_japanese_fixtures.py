#!/usr/bin/env python3
"""Rebuild the Japanese font of the vertical-text tests (#419, #427).

Noto Serif JP (SIL OFL 1.1, see OFL.txt), the variable font set at weight
400 and cut down to the characters of TEXT with its OpenType `vert`,
`vrt2`, `fwid`, `hwid` and `locl` forms kept, so a test can check that a
PDF sets small kana, ー, 〝〟 and ：in their vertical forms and shapes with
the Japanese language system (`JAN `).

    python3 make_japanese_fixtures.py <NotoSerifJP[wght].ttf>

Writes `noto-serif-jp-vertical.ttf`.
"""
import os
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

HERE = os.path.dirname(os.path.abspath(__file__))
TEXT = ('私はその人を常に先生と呼んでいた。だからここでもただ先生と書くだけで本名は打ち明けない'
        'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん'
        'ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶㇰㇱㇲㇳㇴㇵㇶㇷㇸㇹㇺㇻㇼㇽㇾㇿ'
        'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンー'
        '本当言思彼何見直'
        '。、，．：；！？「」『』（）〝〟“”‘’・…‥―—〜～　'
        '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!?"\' ')


def build(src, dst):
    font = TTFont(src)
    font = instancer.instantiateVariableFont(font, {'wght': 400})
    opts = subset.Options()
    opts.layout_features = ['vert', 'vrt2', 'fwid', 'hwid', 'locl', 'ccmp', 'kern', 'palt', 'liga']
    opts.drop_tables += ['DSIG', 'STAT']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    opts.glyph_names = False
    sub = subset.Subsetter(opts)
    sub.populate(text=TEXT)
    sub.subset(font)
    font.flavor = None
    font.save(dst)


if __name__ == '__main__':
    build(sys.argv[1], os.path.join(HERE, 'noto-serif-jp-vertical.ttf'))
