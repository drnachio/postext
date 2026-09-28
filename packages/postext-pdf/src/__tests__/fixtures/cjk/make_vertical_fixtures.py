#!/usr/bin/env python3
"""Rebuild the fonts of the vertical-text tests (#191).

Noto Serif TC and Noto Serif SC 400 (SIL OFL 1.1, see OFL.txt), cut down to
the characters of TEXT with their OpenType `vert` forms (and `vhea`, `vmtx`)
kept, so a test can check that a PDF sets brackets, quotes and the mainland
pause marks in their vertical forms.

    python3 make_vertical_fixtures.py <NotoSerifTC-Regular.ttf> <NotoSerifSC-Regular.ttf>

Writes `noto-serif-tc-vertical.ttf` and `noto-serif-sc-vertical.ttf`.
"""
import os
import sys

from fontTools import subset

HERE = os.path.dirname(os.path.abspath(__file__))
TEXT = ('此開卷第一回也作者自云因曾歷過一番夢幻之後故將真事隱去而借通靈之說撰石頭記書曰甄士'
        '此开卷第一回也作者自云因曾历过一番梦幻之后故将真事隐去而借通灵之说撰石头记书曰甄士'
        '今天是年月日第回增長长倍用拍照問问答甲乙丙丁與与引號号單单書书名國国'
        '。，、．：；！？「」『』（）《》〈〉【】…—～·“”‘’　'
        '0123456789GDPiPhoneABC ')


def build(src, dst):
    opts = subset.Options()
    opts.layout_features = ['vert', 'vrt2', 'kern', 'liga', 'ccmp', 'locl']
    opts.drop_tables += ['DSIG']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    opts.glyph_names = False
    font = subset.load_font(src, opts)
    sub = subset.Subsetter(opts)
    sub.populate(text=TEXT)
    sub.subset(font)
    font.flavor = None
    subset.save_font(font, dst, opts)


if __name__ == '__main__':
    build(sys.argv[1], os.path.join(HERE, 'noto-serif-tc-vertical.ttf'))
    build(sys.argv[2], os.path.join(HERE, 'noto-serif-sc-vertical.ttf'))
