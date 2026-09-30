#!/usr/bin/env python3
"""Pictures of the `hongloumeng` bundle.

Chapter plates come from the 1884 Shanghai 同文書局 lithographs of
《增評補圖石頭記》, in the CADAL scan of its Republican-era reprint on
Wikimedia Commons (two DJVU volumes, 2684×4000 pages, public domain). Every
回 opens with two picture pages, one for each half of its 回目 couplet, whose
inscription is that half; this edition prints the first one facing the
chapter opener.

    python3 plates.py scan      # 120 px thumbnails of every page (work/thumbs, cached),
                                # picture pages found by ink texture, paired and
                                # numbered → plates.json (committed) + work/plates-sheet.jpg
    python3 fetch.py            # downloads the chosen pages at 1280 px (source/plates)
    python3 plates.py process   # crop + grey → work/plates/*.png, work/portraits/*.png,
                                # work/pictures.json (captions, sources, licences)

Line art compresses badly as JPEG (170–210 KB at 1200 px, q50–70), so the
plates are four-level grey PNG (≈80 KB at 1200 px tall): paper white, ink
black, two greys for the lithograph's soft edges. postext-pdf embeds PNG.

Gai Qi's portraits (《紅樓夢圖詠》, woodcut edition 1879) make the front-matter
gallery: 24 of them, the twelve beauties of the 金陵十二釵正冊 first.
"""
from __future__ import annotations

import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

from PIL import Image, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "source")
WORK = os.path.join(HERE, "work")
SPEC = os.path.join(HERE, "plates.json")
UA = {"User-Agent": "postext-presets/1.0 (https://github.com/drnachio/postext)"}

VOLUMES = {
    "u": {"file": "CADAL07015047 增評補圖石頭記 （上冊）.djvu", "pages": 915},
    "l": {"file": "CADAL07018893 增評補圖石頭記 （下冊）.djvu", "pages": 760},
}
# The first chapter picture of the upper volume; the pages before it hold
# the prefaces, the 繡像 portraits with their eulogies and the table of contents.
FIRST_CHAPTER_PAGE = {"u": 92, "l": 1}
# Facts about this copy, found by reading the 卷 header on the text page
# after each picture pair (the automatic pairing is only a first pass):
# - after 卷六十 the upper volume binds in a second copy of 卷五十五–六十
#   (and four 「原书缺页」 placeholders), pp. 827–915;
SKIP = [("u", 827, 915)]
# - two chapter-end text pages with wide margins pass the texture test;
NOT_PICTURES = {("l", 729), ("l", 730), ("l", 759), ("l", 760)}
# - 卷四十六 and 卷五十二 have no pictures in this copy: their first plate
#   comes from the University of Tokyo copy (《增評補圖大觀瑣錄》, one PDF per
#   回, grey 1500×1200 spreads; the first picture is the left half of the
#   second spread).
NO_PICTURES = {
    46: {"file": "IOC.UTokyo-010415 增評補圖大觀瑣錄一百二十卷首一卷據悼紅軒本排印 卷四十六.pdf", "image": 1, "side": "left"},
    52: {"file": "IOC.UTokyo-010421 增評補圖大觀瑣錄一百二十卷首一卷據悼紅軒本排印 卷五十二.pdf", "image": 1, "side": "left"},
}


def skipped(kp: tuple[str, int]) -> bool:
    return any(kp[0] == v and a <= kp[1] <= b for v, a, b in SKIP)


RENDER_WIDTH = 1280
PLATE_HEIGHT = 1200
PORTRAIT_HEIGHT = 1000

# --- scan ------------------------------------------------------------------------


def commons_url(title: str) -> str:
    q = urllib.parse.urlencode({"action": "query", "titles": "File:" + title, "prop": "imageinfo", "iiprop": "url", "format": "json", "formatversion": 2})
    with urllib.request.urlopen(urllib.request.Request("https://commons.wikimedia.org/w/api.php?" + q, headers=UA), timeout=60) as r:
        return json.load(r)["query"]["pages"][0]["imageinfo"][0]["url"]


def fetch_thumbs() -> None:
    os.makedirs(os.path.join(WORK, "thumbs"), exist_ok=True)
    for key, vol in VOLUMES.items():
        url = commons_url(vol["file"])
        name = url.rsplit("/", 1)[1]
        base = url.replace("/commons/", "/commons/thumb/")
        for p in range(1, vol["pages"] + 1):
            path = os.path.join(WORK, "thumbs", f"{key}{p:03d}.jpg")
            if os.path.exists(path):
                continue
            for attempt in range(6):
                try:
                    with urllib.request.urlopen(urllib.request.Request(f"{base}/page{p}-120px-{name}.jpg", headers=UA), timeout=90) as r:
                        data = r.read()
                    with open(path, "wb") as f:
                        f.write(data)
                    break
                except Exception as err:  # noqa: BLE001 — 429 and timeouts: back off
                    print(f"  {key}{p}: {err}; retry", file=sys.stderr)
                    time.sleep(15 * (attempt + 1))
            time.sleep(0.3)


def texture(path: str) -> tuple[float, float, float]:
    """Ink share, the share of mid greys and the share of empty cells of an
    8×12 grid. A text page is thin strokes (many anti-aliased greys per inked
    pixel) filling the whole grid; a picture is dense hatching with open sky
    and ground."""
    im = Image.open(path).convert("L")
    w, h = im.size
    im = im.crop((int(w * 0.04), int(h * 0.04), int(w * 0.96), int(h * 0.96)))
    hist = im.histogram()
    n = sum(hist)
    dark = sum(hist[:140]) / n
    mid = sum(hist[61:200]) / n
    g = im.resize((80, 120))
    px = g.load()
    empty = sum(
        1
        for gx in range(8)
        for gy in range(12)
        if sum(1 for x in range(gx * 10, gx * 10 + 10) for y in range(gy * 10, gy * 10 + 10) if px[x, y] < 140) < 3
    ) / 96
    return dark, mid, empty


def is_picture(dark: float, mid: float, empty: float) -> bool:
    """A candidate: some ink, open space, hatching (few anti-aliased greys
    per inked pixel). A chapter-end text page can pass; `scan` keeps the
    candidates that come in pairs."""
    return dark >= 0.045 and empty >= 0.25 and mid / dark <= 2.5


def is_light_picture(dark: float, mid: float, empty: float) -> bool:
    """The looser test for the partner of a lone candidate: a lightly drawn
    plate is mostly open space and thin line."""
    return dark >= 0.045 and empty >= 0.4


def is_blank(dark: float) -> bool:
    """「原书空白页」: the scan's placeholder for a page missing in the copy."""
    return dark < 0.02


def scan(offline: bool = False) -> None:
    if not offline:
        fetch_thumbs()
    plates = []
    feats: dict[tuple[str, int], tuple[float, float, float]] = {}
    for key, vol in VOLUMES.items():
        for p in range(FIRST_CHAPTER_PAGE[key], vol["pages"] + 1):
            path = os.path.join(WORK, "thumbs", f"{key}{p:03d}.jpg")
            if os.path.exists(path):
                feats[(key, p)] = texture(path)
    ratio = {kp: (f[1] / f[0] if f[0] else 99.0) for kp, f in feats.items()}
    cand = {kp for kp, f in feats.items() if is_picture(*f)}
    blank = {kp for kp, f in feats.items() if is_blank(f[0])}
    # Runs of consecutive candidates. A run of two is a 回's pair (first
    # half, second half); a longer run drops its most text-like end page (a
    # chapter-end page before the pictures); a lone candidate pairs with a
    # lightly drawn neighbour, or stands alone next to a 「原书空白页」
    # placeholder (the copy lacks the other picture), or is a false hit.
    runs: list[list[tuple[str, int]]] = []
    for kp in sorted(cand):
        if runs and runs[-1][-1] == (kp[0], kp[1] - 1):
            runs[-1].append(kp)
        else:
            runs.append([kp])
    pairs: list[tuple] = []
    for run in runs:
        while len(run) > 2:
            run = run[1:] if ratio[run[0]] >= ratio[run[-1]] else run[:-1]
        if len(run) == 2:
            pairs.append((run[0], run[1]))
            continue
        k, p = run[0]
        nxt, prv = (k, p + 1), (k, p - 1)
        if nxt in feats and nxt not in blank and is_light_picture(*feats[nxt]):
            pairs.append(((k, p), nxt))
        elif prv in feats and prv not in blank and is_light_picture(*feats[prv]) and prv not in {q for pr in pairs for q in pr}:
            pairs.append((prv, (k, p)))
        elif nxt in blank and not any((k, p + j) in cand for j in (2, 3, 4)):
            pairs.append(((k, p), None))
        elif prv in blank and not any((k, p - j) in cand for j in (2, 3, 4)):
            pairs.append((None, (k, p)))
        else:
            print(f"lone candidate {k}{p} ignored", file=sys.stderr)
    pairs = [pr for pr in pairs if not any(q and (q in NOT_PICTURES or skipped(q)) for q in pr)]
    order = {"u": 0, "l": 1}
    pairs.sort(key=lambda pr: (order[(pr[0] or pr[1])[0]], (pr[0] or pr[1])[1]))
    pictures = [q for pr in pairs for q in pr if q]
    print(f"{len(pictures)} picture pages, {len(pairs)} chapters with pictures, {len(NO_PICTURES)} without")
    events = iter(pairs)
    for n in range(1, 121):
        if n in NO_PICTURES:
            plates.append({"id": f"plate-{n:03d}", "chapter": n, "utokyo": NO_PICTURES[n], "half": 0})
            continue
        first, second = next(events, (None, None))
        if not (first or second):
            break
        use, half = (first, 0) if first else (second, 1)
        plates.append({"id": f"plate-{n:03d}", "chapter": n, "volume": use[0], "page": use[1], "half": half, "otherHalf": second[1] if first and second else None})
    left = list(events)
    if left:
        print(f"warning: {len(left)} picture pairs left over: {left}", file=sys.stderr)
    check_against_text(plates)
    spec = {
        "source": "《增評補圖石頭記》 (Shanghai 同文書局 1884), CADAL scan of the 民國叢書 reprint, Wikimedia Commons",
        "renderWidth": RENDER_WIDTH,
        "volumes": {k: {"file": v["file"]} for k, v in VOLUMES.items()},
        "plates": plates,
    }
    with open(SPEC, "w", encoding="utf-8") as f:
        json.dump(spec, f, indent=1, ensure_ascii=False)
        f.write("\n")
    contact_sheet(pairs)
    if len(plates) != 120 or left:
        print(f"warning: {len(plates)} chapters found, expected 120; check work/plates-sheet.jpg", file=sys.stderr)


def check_against_text(plates: list[dict]) -> None:
    """The pages between two chapter starts should follow the length of the
    chapter in the 程乙本 text (the 1884 book adds commentary, so only
    roughly): print the correlation and the chapters that stand out."""
    path = os.path.join(SOURCE, "chapters.json")
    if not os.path.exists(path):
        return
    data = json.load(open(path, encoding="utf-8"))
    lengths = data["stats"]["zh-Hant"]["perChapter"]
    starts = []
    offset = {"u": 0, "l": VOLUMES["u"]["pages"]}
    chapters = []
    vols = []
    for pl in plates:
        if pl.get("page"):
            starts.append(offset[pl["volume"]] + pl["page"])
            chapters.append(pl["chapter"])
            vols.append(pl["volume"])
    # A chapter without pictures is merged with the one before it.
    xs, ys = [], []
    for i in range(len(starts) - 1):
        a, b = chapters[i], chapters[i + 1]
        if vols[i] != vols[i + 1]:
            continue  # the volume break
        xs.append(sum(lengths[a - 1 : b - 1]))
        ys.append(starts[i + 1] - starts[i])
    n = len(xs)
    if n < 3:
        return
    mx, my = sum(xs) / n, sum(ys) / n
    cov = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    r = cov / ((sum((x - mx) ** 2 for x in xs) * sum((y - my) ** 2 for y in ys)) ** 0.5 or 1)
    k = sum(ys) / sum(xs)
    odd = [(chapters[i], ys[i], round(xs[i] * k, 1)) for i in range(n) if abs(ys[i] - xs[i] * k) > max(4, 0.4 * xs[i] * k)]
    print(f"pages per chapter vs 程乙本 length: r = {r:.2f}; outliers (chapter, pages, expected): {odd}")


def contact_sheet(pairs) -> None:
    from PIL import ImageDraw

    W, H, cols = 60, 90, 20
    rows = (len(pairs) + cols - 1) // cols
    sheet = Image.new("L", (cols * W * 2, rows * (H + 12)), 255)
    draw = ImageDraw.Draw(sheet)
    for i, (a, b) in enumerate(pairs):
        x, y = (i % cols) * W * 2, (i // cols) * (H + 12)
        for j, kp in enumerate((b, a)):  # read right to left
            if kp is None:
                continue
            k, p = kp
            im = Image.open(os.path.join(WORK, "thumbs", f"{k}{p:03d}.jpg")).convert("L")
            im.thumbnail((W - 2, H))
            sheet.paste(im, (x + j * W, y))
        first = a or b
        draw.text((x + 2, y + H), f"{i + 1} {first[0]}{first[1]}", fill=0)
    sheet.save(os.path.join(WORK, "plates-sheet.jpg"), quality=80)


# --- processing ---------------------------------------------------------------------


def _clusters(profile: list[float], thr: float, gap: int) -> list[tuple[int, int]]:
    out, start, last = [], None, None
    for i, v in enumerate(profile):
        if v > thr:
            if start is None:
                start = i
            elif i - last > gap:
                out.append((start, last))
                start = i
            last = i
    if start is not None:
        out.append((start, last))
    return out


def crop_to_ink(im: Image.Image, row_gap: float = 1 / 12) -> Image.Image:
    """The picture without the page's margins: the widest run of inked
    columns (the running title in the fore-edge margin is a narrow run of
    its own), then the inked rows inside it, the inscription included."""
    g = im.convert("L")
    W, H = g.size
    s = 4
    small = g.resize((W // s, H // s))
    w, h = small.size
    px = small.load()
    col = [sum(1 for y in range(h) if px[x, y] < 170) / h for x in range(w)]
    # A printed frame: long vertical rules near both sides.
    frame_cols = [x for x, v in enumerate(col) if v > 0.6]
    if frame_cols and frame_cols[-1] - frame_cols[0] > w * 0.5:
        l, r = frame_cols[0], frame_cols[-1]
        row = [sum(1 for x in range(l, r + 1) if px[x, y] < 170) / (r - l + 1) for y in range(h)]
        frame_rows = [y for y, v in enumerate(row) if v > 0.6]
        if frame_rows and frame_rows[-1] - frame_rows[0] > h * 0.5:
            # A long horizontal line inside the picture (a roof, a wall) can
            # pass for the frame: the inked rows decide the extent too.
            t, b = max(_clusters(row, 0.01, max(2, int(h * row_gap))), key=lambda c: c[1] - c[0])
            t, b = min(t, frame_rows[0]), max(b, frame_rows[-1])
            return g.crop((l * s, t * s, (r + 1) * s, (b + 1) * s))
    l, r = max(_clusters(col, 0.02, max(2, w // 60)), key=lambda c: c[1] - c[0])
    # The running title of the page margin («增評補圖石頭記 卷一») can sit
    # close enough to the picture to join its run: a strip of text-dense
    # columns at one end, narrower than 8 % of the page, then a dip.
    edge = max(3, (r - l) * 15 // 100)
    cut = None
    for x in range(l + 1, min(r, l + edge)):
        strip = col[l:x]
        if col[x] < 0.02 and x - l <= w * 0.08 and sum(strip) / len(strip) >= 0.04:
            cut = x + 1
    if cut:
        l = cut
    cut = None
    for x in range(r - 1, max(l, r - edge), -1):
        strip = col[x + 1 : r + 1]
        if col[x] < 0.02 and r - x <= w * 0.08 and sum(strip) / len(strip) >= 0.04:
            cut = x - 1
    if cut:
        r = cut
    # When the title strip touches the picture there is no dip. The strip is
    # a line of large characters at the top and a folio lower down: its
    # columns carry no ink between 50 % and 80 % of the page height, where a
    # picture always has some.
    band = range(int(h * 0.5), int(h * 0.8))
    empty = lambda x: sum(1 for y in band if px[x, y] < 170) < 0.02 * len(band)  # noqa: E731
    n = 0
    while n < 25 and l + n < r and empty(l + n):
        n += 1
    if n >= 5:
        l += n
    n = 0
    while n < 25 and r - n > l and empty(r - n):
        n += 1
    if n >= 5:
        r -= n
    row = [sum(1 for x in range(l, r + 1) if px[x, y] < 170) / (r - l + 1) for y in range(h)]
    rs = _clusters(row, 0.01, max(2, int(h * row_gap)))
    t, b = max(rs, key=lambda c: c[1] - c[0])
    pad = 2
    return g.crop((max(0, (l - pad) * s), max(0, (t - pad) * s), min(W, (r + pad + 1) * s), min(H, (b + pad + 1) * s)))


def _grey_palette(levels: int) -> Image.Image:
    pal = Image.new("P", (1, 1))
    flat: list[int] = []
    for i in range(levels):
        v = round(i * 255 / (levels - 1))
        flat += [v, v, v]
    pal.putpalette(flat + [0] * (768 - len(flat)))
    return pal


# Paper to white, ink to black, the rest spread between.
CURVE = [0 if v < 40 else 255 if v > 200 else int((v - 40) * 255 / 160) for v in range(256)]


def line_art_png(im: Image.Image, height: int, levels: int = 4) -> bytes:
    im = ImageOps.autocontrast(im.convert("L"), cutoff=(0.5, 0.2))
    im = im.resize((round(im.width * height / im.height), height), Image.LANCZOS).point(CURVE)
    q = im.convert("RGB").quantize(palette=_grey_palette(levels), dither=Image.Dither.NONE)
    buf = io.BytesIO()
    q.save(buf, "PNG", optimize=True, bits=2 if levels <= 4 else 4)
    return buf.getvalue()


# Gai Qi's portraits: Commons slug → names (zh-Hant, zh-Hans, English as in
# Joly where he names the character) and whether the gallery prints it.
PORTRAITS = {
    "hongloumeng-tuyong-stone-and-flower": ("通靈寶玉　絳珠仙草", "通灵宝玉　绛珠仙草", "The Stone of Spiritual Perception and the Crimson Pearl Flower", True),
    "lin-daiyu-hongloumeng-tuyong": ("林黛玉", "林黛玉", "Lin Tai-yü", True),
    "hongloumeng-tuyong-xue-baochai": ("薛寶釵", "薛宝钗", "Hsüeh Pao-ch’ai", True),
    "hongloumeng-tuyong-jia-yuanchun": ("賈元春", "贾元春", "Chia Yüan-ch’un", True),
    "hongloumeng-tuyong-jia-tanchun": ("賈探春", "贾探春", "Chia T’an-ch’un", True),
    "hongloumeng-tuyong-shi-xiangyun": ("史湘雲", "史湘云", "Shih Hsiang-yün", True),
    "hongloumeng-tuyong-miaoyu": ("妙玉", "妙玉", "Miao Yü", True),
    "hongloumeng-tuyong-jia-yingchun": ("賈迎春", "贾迎春", "Chia Ying-ch’un", True),
    "hongloumeng-tuyong-jia-xichun": ("賈惜春", "贾惜春", "Chia Hsi-ch’un", True),
    "hongloumeng-tuyong-wang-xifeng": ("王熙鳳", "王熙凤", "Wang Hsi-feng", True),
    "hongloumeng-tuyong-qiaojie": ("巧姐", "巧姐", "Ch’iao Chieh", True),
    "hongloumeng-tuyong-li-wan": ("李紈", "李纨", "Li Wan", True),
    "hongloumeng-tuyong-qin-keqing": ("秦可卿", "秦可卿", "Ch’in K’o-ch’ing", True),
    "jia-baoyu-hongloumeng-tuyong": ("賈寶玉", "贾宝玉", "Chia Pao-yü", True),
    "hongloumeng-tuyong-jinghuan-xianzi": ("警幻仙子", "警幻仙子", "The Fairy of the Monitory Vision", True),
    "hongloumeng-tuyong-hua-xiren": ("花襲人", "花袭人", "Hua Hsi Jen", True),
    "hongloumeng-tuyong-qingwen": ("晴雯", "晴雯", "Ch’ing Wen", True),
    "hongloumeng-tuyong-xiangling": ("香菱", "香菱", "Hsiang Ling", True),
    "hongloumeng-tuyong-ping-er": ("平兒", "平儿", "P’ing Erh", True),
    "hongloumeng-tuyong-yuanyang": ("鴛鴦", "鸳鸯", "Yüan Yang", True),
    "hongloumeng-tuyong-zijuan": ("紫鵑", "紫鹃", "Tzu Chüan", True),
    "hongloumeng-tuyong-xue-baoqin": ("薛寶琴", "薛宝琴", "Hsüeh Pao-ch’in", True),
    "hongloumeng-tuyong-you-sanjie": ("尤三姐", "尤三姐", "Yu San-chieh", True),
    "hongloumeng-tuyong-qin-zhong": ("秦鍾", "秦钟", "Ch’in Chung", True),
    "hongloumeng-tuyong-zhen-baoyu": ("甄寶玉", "甄宝玉", "Chen Pao-yü", False),
    "hongloumeng-tuyong-bei-jing-wang": ("北靜王", "北静王", "The Prince of Pei Ching", False),
    "hongloumeng-tuyong-beiming": ("焙茗", "焙茗", "Pei Ming", False),
    "hongloumeng-tuyong-bihen": ("碧痕", "碧痕", "Pi Hen", False),
    "hongloumeng-tuyong-cai-luan": ("彩鸞", "彩鸾", "Ts’ai Luan", False),
    "hongloumeng-tuyong-chunyan-wuer": ("春燕　五兒", "春燕　五儿", "Ch’un Yen and Wu Erh", False),
    "hongloumeng-tuyong-cuilu": ("翠縷", "翠缕", "Ts’ui Lü", False),
    "hongloumeng-tuyong-cuimo": ("翠墨", "翠墨", "Ts’ui Mo", False),
    "hongloumeng-tuyong-fang-guan": ("芳官", "芳官", "Fang Kuan", False),
    "hongloumeng-tuyong-jia-lan": ("賈蘭", "贾兰", "Chia Lan", False),
    "hongloumeng-tuyong-jia-qiang": ("賈薔", "贾蔷", "Chia Ch’iang", False),
    "hongloumeng-tuyong-jia-rong": ("賈蓉", "贾蓉", "Chia Jung", False),
    "hongloumeng-tuyong-jia-yun": ("賈芸", "贾芸", "Chia Yün", False),
    "hongloumeng-tuyong-jiang-yuhan": ("蔣玉菡", "蒋玉菡", "Chiang Yü-han", False),
    "hongloumeng-tuyong-li-wen-li-qi": ("李紋　李綺", "李纹　李绮", "Li Wen and Li Ch’i", False),
    "hongloumeng-tuyong-ling-guan": ("齡官", "龄官", "Ling Kuan", False),
    "hongloumeng-tuyong-liu-xianglian": ("柳湘蓮", "柳湘莲", "Liu Hsiang-lien", False),
    "hongloumeng-tuyong-peifeng": ("佩鳳", "佩凤", "P’ei Feng", False),
    "hongloumeng-tuyong-qiuwen": ("秋紋", "秋纹", "Ch’iu Wen", False),
    "hongloumeng-tuyong-sheyue": ("麝月", "麝月", "She Yüeh", False),
    "hongloumeng-tuyong-siqi": ("司棋", "司棋", "Ssu Ch’i", False),
    "hongloumeng-tuyong-xiaohong": ("小紅", "小红", "Hsiao Hung", False),
    "hongloumeng-tuyong-xing-xiuyan": ("邢岫煙", "邢岫烟", "Hsing Hsiu-yen", False),
    "hongloumeng-tuyong-xue-ke": ("薛蝌", "薛蝌", "Hsüeh K’o", False),
    "hongloumeng-tuyong-ying-er": ("鶯兒", "莺儿", "Ying Erh", False),
    "hongloumeng-tuyong-zhineng": ("智能", "智能", "Chih Neng", False),
}
GALLERY_ORDER = [k for k, v in PORTRAITS.items() if v[3]]


def process() -> None:
    data = json.load(open(os.path.join(SOURCE, "chapters.json"), encoding="utf-8"))
    hant = {c["n"]: c for c in data["editions"]["zh-Hant"]["chapters"]}
    hans = {c["n"]: c for c in data["editions"]["zh-Hans"]["chapters"]}
    en = {c["n"]: c for c in data["editions"]["en"]["chapters"]}
    out: dict[str, list] = {"plates": [], "portraits": []}
    plates_dir = os.path.join(WORK, "plates")
    os.makedirs(plates_dir, exist_ok=True)
    meta_path = os.path.join(SOURCE, "plates", "meta.json")
    for m in json.load(open(meta_path, encoding="utf-8")) if os.path.exists(meta_path) else []:
        n, half = m["chapter"], m["half"]
        page = Image.open(os.path.join(SOURCE, m["file"]))
        if m.get("side"):
            # A University of Tokyo spread: the picture is one half.
            w, h = page.size
            page = page.crop((0, 0, w // 2, h) if m["side"] == "left" else (w // 2, 0, w, h))
        pic = crop_to_ink(page)
        png = line_art_png(pic, min(PLATE_HEIGHT, pic.height))
        name = f"{m['id']}.png"
        with open(os.path.join(plates_dir, name), "wb") as f:
            f.write(png)
        w, h = Image.open(io.BytesIO(png)).size
        out["plates"].append(
            {
                "id": m["id"],
                "file": f"plates/{name}",
                "bytes": len(png),
                "width": w,
                "height": h,
                "chapter": n,
                "half": half,
                "caption": {
                    "zh-Hant": hant[n]["title_couplet"][half],
                    "zh-Hans": hans[n]["title_couplet"][half],
                    "en": en[n]["title_couplet"][half] if n in en else None,
                },
                "source": m["page_url"],
                "licence": m["license"] or "Public domain",
                "credit": "《增評補圖石頭記》, 同文書局, 1884" + ("; University of Tokyo copy (《增評補圖大觀瑣錄》)" if m.get("side") else ""),
            }
        )
    pmeta = {p["slug"]: p for p in json.load(open(os.path.join(SOURCE, "portraits", "meta.json"), encoding="utf-8"))}
    pdir = os.path.join(WORK, "portraits")
    os.makedirs(pdir, exist_ok=True)
    for slug, (zh, zhs, name_en, gallery) in PORTRAITS.items():
        p = pmeta.get(slug)
        if p is None:
            print(f"warning: portrait {slug} not downloaded", file=sys.stderr)
            continue
        png = line_art_png(crop_to_ink(Image.open(os.path.join(SOURCE, p["file"])), row_gap=1 / 40), PORTRAIT_HEIGHT)
        fname = f"portrait-{slug.replace('hongloumeng-tuyong-', '').replace('-hongloumeng-tuyong', '')}.png"
        with open(os.path.join(pdir, fname), "wb") as f:
            f.write(png)
        w, h = Image.open(io.BytesIO(png)).size
        out["portraits"].append(
            {
                "id": fname[:-4],
                "file": f"portraits/{fname}",
                "bytes": len(png),
                "width": w,
                "height": h,
                "gallery": gallery,
                "caption": {"zh-Hant": zh, "zh-Hans": zhs, "en": name_en},
                "source": p["page"],
                "licence": p["license"],
                "credit": "改琦《紅樓夢圖詠》, 1879",
            }
        )
    with open(os.path.join(WORK, "pictures.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1, ensure_ascii=False)
    for kind, items in out.items():
        total = sum(i["bytes"] for i in items)
        gal = sum(i["bytes"] for i in items if i.get("gallery", True))
        print(f"{kind}: {len(items)} files, {total / 1e6:.2f} MB (printed set {gal / 1e6:.2f} MB), largest {max((i['bytes'] for i in items), default=0) / 1e3:.0f} KB")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "scan":
        scan(offline="--offline" in sys.argv)
    elif cmd == "process":
        process()
    else:
        raise SystemExit(__doc__)
