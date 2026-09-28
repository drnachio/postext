#!/usr/bin/env python3
"""Rebuild the CJK font fixtures of the multi-file face tests.

Noto Serif TC 400 (SIL OFL 1.1, see OFL.txt) as Fontsource ships it: the
numbered unicode-range slices of `@fontsource/noto-serif-tc@5/400.css`, the
`latin` subset and the named `chinese-traditional` subset. Each file is cut
down to the characters of TEXT (and the space) so the fixtures stay small;
the slices keep their own partition, so a test provider can pick them by
unicode-range exactly as the Sandbox and Cookbook providers do.

    python3 make_fixtures.py        # needs fontTools and brotli

Writes `noto-serif-tc-<slice>.ttf` and `slices.json` (file -> unicode-range,
in the order the CSS declares them).
"""
import json
import os
import re
import urllib.request

from fontTools import subset
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
CDN = 'https://cdn.jsdelivr.net/npm/@fontsource/noto-serif-tc@5'
# The opening of chapter 1 of 紅樓夢 (程乙本), with the heading and the
# full-width marks the named subset lacks.
TEXT = ('紅樓夢第一回　甄士隱夢幻識通靈'
        '此開卷第一回也。作者自云：因曾歷過一番夢幻之後，故將真事隱去，'
        '而借「通靈」之說，撰此《石頭記》一書也。（甄士隱）！？')
# One slice no character of TEXT falls in: a provider handing it over
# anyway must not get it embedded.
UNUSED = '101'


def fetch(url):
    with urllib.request.urlopen(url) as res:
        return res.read()


def parse_css(css):
    faces = []
    for body in re.findall(r'@font-face\s*{([^}]*)}', css):
        src = re.search(r'files/noto-serif-tc-(.+?)-400-normal\.woff2', body).group(1)
        rng = re.search(r'unicode-range:\s*([^;]+);', body).group(1).strip()
        faces.append((src, rng))
    return faces


def covers(rng, cp):
    for part in rng.split(','):
        part = part.strip()[2:]
        lo, _, hi = part.partition('-')
        if int(lo, 16) <= cp <= int(hi or lo, 16):
            return True
    return False


def cut(woff2, keep, out):
    path = os.path.join(HERE, '_tmp.woff2')
    with open(path, 'wb') as f:
        f.write(woff2)
    font = TTFont(path)
    cmap = font.getBestCmap()
    wanted = sorted(cp for cp in keep if cp in cmap)
    options = subset.Options()
    options.flavor = None
    options.layout_features = ['*']
    options.name_IDs = ['*']
    options.notdef_outline = True
    sub = subset.Subsetter(options)
    sub.populate(unicodes=wanted)
    sub.subset(font)
    font.flavor = None
    font.save(os.path.join(HERE, out))
    os.remove(path)
    return len(wanted)


def main():
    faces = parse_css(fetch(f'{CDN}/400.css').decode('utf-8'))
    cps = {ord(c) for c in TEXT} | {0x20}
    chosen = []
    for name, rng in faces:
        if name == UNUSED or name == 'latin' or any(covers(rng, cp) for cp in cps if cp != 0x20):
            chosen.append((name, rng))
    table = {}
    for name, rng in chosen:
        woff2 = fetch(f'{CDN}/files/noto-serif-tc-{name}-400-normal.woff2')
        keep = {0x20} | {cp for cp in cps if covers(rng, cp)}
        if name == UNUSED:
            keep |= set(sorted(cp for cp in range(0x21, 0x30000) if covers(rng, cp))[:6])
        out = f'noto-serif-tc-{name}.ttf'
        n = cut(woff2, keep, out)
        table[out] = rng
        print(out, n, 'code points')
    woff2 = fetch(f'{CDN}/files/noto-serif-tc-chinese-traditional-400-normal.woff2')
    n = cut(woff2, cps, 'noto-serif-tc-chinese-traditional.ttf')
    print('noto-serif-tc-chinese-traditional.ttf', n, 'code points')
    with open(os.path.join(HERE, 'slices.json'), 'w') as f:
        json.dump(table, f, indent=1, ensure_ascii=False)
        f.write('\n')


if __name__ == '__main__':
    main()
