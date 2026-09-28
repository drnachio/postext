#!/usr/bin/env python3
"""Download the sources of the `hongloumeng` showcase preset into `source/`
(git-ignored):

- zh.wikisource 《紅樓夢（程乙本）》 (1792), twelve pages of ten 回 each, as
  wikitext: the base text of the Chinese editions;
- zh.wikisource 《紅樓夢》 (the main edition, 庚辰本 1–80 + 程甲本 81–120), 120
  pages as wikitext: only its `<poem>` blocks are used, to find the verse in
  the 程乙本 text, which has no verse markup;
- zh.wikisource 《紅樓夢（程甲本）》 (1791), rendered HTML of the 120 回 pages:
  a diplomatic transcription used as a spelling check (`text.py --qa`);
- Project Gutenberg #9603 and #9604, H. Bencraft Joly's English translation
  (1892–93, chapters 1–56);
- the chapter plates from the 1884 《增評補圖石頭記》 lithographs (the CADAL
  scans on Wikimedia Commons, one page per plate rendered by the Commons
  thumbnailer; `plates.json` next to this script lists the pages) and Gai
  Qi's portraits from 《紅樓夢圖詠》 (Commons);
- the OFL fonts: Noto Serif TC/SC and Noto Sans TC/SC (variable, from
  google/fonts), Chiron Sung HK (the one ideograph Noto lacks), LXGW WenKai TC
  and LXGW WenKai (GitHub releases) and EB Garamond for the English edition.

    python3 scripts/presets/showcase/hongloumeng/fetch.py [--no-chengjia] [--no-images] [--no-fonts]

Everything is public domain, CC BY-SA (Wikisource's typing and punctuation)
or SIL OFL. `source/plates/meta.json` and `source/portraits/meta.json` record
the Commons page and licence of every picture. Downloads are paced, retried
and skipped when the file already exists, so the script can be re-run.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import sys
import time
import unicodedata
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "source")
UA = {"User-Agent": "postext-presets/1.0 (https://github.com/drnachio/postext)"}

WIKISOURCE_API = "https://zh.wikisource.org/w/api.php"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"

CHENGYI = "紅樓夢（程乙本）"
MAIN = "紅樓夢"
CHENGJIA = "紅樓夢（程甲本）"

GUTENBERG = {
    "pg9603.txt": "https://www.gutenberg.org/cache/epub/9603/pg9603.txt",
    "pg9604.txt": "https://www.gutenberg.org/cache/epub/9604/pg9604.txt",
}

# google/fonts `ofl/<folder>/<file>`; variable fonts are instanced by fonts.py.
GOOGLE_FONTS = [
    "notoseriftc/NotoSerifTC[wght].ttf",
    "notoseriftc/OFL.txt",
    "notoserifsc/NotoSerifSC[wght].ttf",
    "notoserifsc/OFL.txt",
    "notosanstc/NotoSansTC[wght].ttf",
    "notosanstc/OFL.txt",
    "notosanssc/NotoSansSC[wght].ttf",
    "notosanssc/OFL.txt",
    # Only for 𠺕 (U+20E95, chapter 64), which no Noto face has.
    "chironsunghk/ChironSungHK[wght].ttf",
    "chironsunghk/OFL.txt",
    "ebgaramond/EBGaramond[wght].ttf",
    "ebgaramond/EBGaramond-Italic[wght].ttf",
    "ebgaramond/OFL.txt",
]

LXGW_VERSION = "v1.522"
OTHER_FONTS = {
    "lxgwwenkaitc/LXGWWenKaiTC-Regular.ttf": f"https://github.com/lxgw/LxgwWenkaiTC/releases/download/{LXGW_VERSION}/LXGWWenKaiTC-Regular.ttf",
    "lxgwwenkaitc/OFL.txt": "https://raw.githubusercontent.com/lxgw/LxgwWenkaiTC/main/OFL.txt",
    "lxgwwenkai/LXGWWenKai-Regular.ttf": f"https://github.com/lxgw/LxgwWenKai/releases/download/{LXGW_VERSION}/LXGWWenKai-Regular.ttf",
    "lxgwwenkai/OFL.txt": "https://raw.githubusercontent.com/lxgw/LxgwWenKai/main/OFL.txt",
}
# Jigmo (字雲, CC0, GlyphWiki's Mincho): the donor of the two ideographs
# that no Noto, LXGW or Chiron face has (𠞆 U+20786, and 𠺕 U+20E95 for the
# Sans and Kai faces). fonts.py takes single glyphs from Jigmo2.ttf.
JIGMO = ("jigmo/Jigmo-20250912.zip", "https://kamichikoichi.github.io/jigmo/Jigmo-20250912.zip")

PORTRAIT_CATEGORY = "Category:Portraits_of_the_Dream_of_the_Red_Chamber_by_Gai_Qi"
# Files whose Commons title has no Latin name to make a slug from.
PORTRAIT_SLUGS = {
    "File:巧姊（紅樓夢圖詠）.jpg": "hongloumeng-tuyong-qiaojie-b",
    "File:红楼梦图咏-巧姊.jpg": "hongloumeng-tuyong-qiaojie",
    "File:红楼梦图咏-通灵宝石、绛珠仙草.jpg": "hongloumeng-tuyong-stone-and-flower",
}

CN_DIGITS = {"〇": 0, "零": 0, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}


def cn_number(s: str) -> int:
    """一百一十 → 110, 一百十一 → 111, 第一百零一 → 101 (上限 999)."""
    s = s.strip("第回 　")
    total, num = 0, 0
    for ch in s:
        if ch in CN_DIGITS:
            num = CN_DIGITS[ch]
        elif ch == "十":
            total += (num or 1) * 10
            num = 0
        elif ch == "百":
            total += (num or 1) * 100
            num = 0
        else:
            raise ValueError(f"not a Chinese numeral: {s}")
    return total + num


def cn_numeral(n: int) -> str:
    """110 → 一百一十, 101 → 一百零一 (the 程甲本 subpage names)."""
    d = "〇一二三四五六七八九"
    if n < 10:
        return d[n]
    if n < 20:
        return "十" + (d[n % 10] if n % 10 else "")
    if n < 100:
        return d[n // 10] + "十" + (d[n % 10] if n % 10 else "")
    h, r = divmod(n, 100)
    if r == 0:
        return d[h] + "百"
    if r < 10:
        return d[h] + "百零" + d[r]
    return d[h] + "百" + d[r // 10] + "十" + (d[r % 10] if r % 10 else "")


# --- HTTP -----------------------------------------------------------------------


def get(url: str, timeout: int = 120) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def get_retry(url: str) -> bytes:
    for attempt in range(6):
        try:
            return get(url)
        except Exception as err:  # noqa: BLE001 — retry on 429/5xx and network hiccups
            wait = 10 * (attempt + 1)
            print(f"  retry in {wait}s: {err}", file=sys.stderr)
            time.sleep(wait)
    raise SystemExit(f"could not download {url}")


def download(url: str, path: str, pace: float = 0.0) -> bool:
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return False
    os.makedirs(os.path.dirname(path), exist_ok=True)
    data = get_retry(url)
    tmp = path + ".part"
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, path)
    if pace:
        time.sleep(pace)
    return True


def api(base: str, params: dict) -> dict:
    params = {**params, "format": "json", "formatversion": "2"}
    return json.loads(get_retry(base + "?" + urllib.parse.urlencode(params)))


def write_text(path: str, text: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


# --- Wikisource -------------------------------------------------------------------


def subpages(page: str) -> list[str]:
    d = api(WIKISOURCE_API, {"action": "parse", "page": page, "prop": "links"})
    return [l["title"] for l in d["parse"]["links"] if l["title"].startswith(page + "/")]


def fetch_wikitext(page: str, path: str) -> bool:
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return False
    d = api(WIKISOURCE_API, {"action": "parse", "page": page, "prop": "wikitext|revid", "redirects": 1})
    write_text(path, d["parse"]["wikitext"])
    time.sleep(0.5)
    return True


def fetch_html(page: str, path: str) -> bool:
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return False
    d = api(WIKISOURCE_API, {"action": "parse", "page": page, "prop": "text", "redirects": 1, "disablelimitreport": 1})
    write_text(path, d["parse"]["text"])
    time.sleep(0.5)
    return True


def fetch_wikisource(chengjia: bool) -> None:
    ws = os.path.join(SOURCE, "wikisource")
    revs: dict[str, dict] = {}
    # 程乙本: twelve pages 「第一回　至第十回」…, saved under the first 回's number.
    for title in subpages(CHENGYI):
        first = re.search(r"/(第.+?回)", title)
        if not first:
            continue
        n = cn_number(first.group(1))
        path = os.path.join(ws, "chengyi", f"{n:03d}.wikitext")
        if fetch_wikitext(title, path):
            print("wikisource", title)
        revs[f"chengyi/{n:03d}"] = {"page": title}
    # The main edition: 「紅樓夢/第001回」… .
    for n in range(1, 121):
        title = f"{MAIN}/第{n:03d}回"
        if fetch_wikitext(title, os.path.join(ws, "main", f"{n:03d}.wikitext")):
            print("wikisource", title)
    if chengjia:
        # 程甲本 pages are ProofreadPage transclusions: their wikitext is a
        # `<pages …>` tag, so the rendered HTML is what holds the text.
        for n in range(1, 121):
            title = f"{CHENGJIA}/{cn_numeral(n)}"
            if fetch_html(title, os.path.join(ws, "chengjia", f"{n:03d}.html")):
                print("wikisource", title)
    with open(os.path.join(ws, "pages.json"), "w", encoding="utf-8") as f:
        json.dump(revs, f, indent=1, ensure_ascii=False)


# --- Gutenberg ----------------------------------------------------------------------


def fetch_gutenberg() -> None:
    for name, url in GUTENBERG.items():
        if download(url, os.path.join(SOURCE, "gutenberg", name)):
            print("gutenberg", name)


# --- Commons -------------------------------------------------------------------------


def clean_html(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s or "")).strip()


def file_info(title: str, **extra) -> dict:
    d = api(
        COMMONS_API,
        {
            "action": "query",
            "titles": title,
            "prop": "imageinfo",
            "iiprop": "url|size|extmetadata",
            "iiextmetadatafilter": "LicenseShortName|Artist|ImageDescription",
            **extra,
        },
    )
    page = d["query"]["pages"][0]
    if "imageinfo" not in page:
        raise SystemExit(f"not on Commons: {title}")
    return page["imageinfo"][0]


def fetch_plates() -> None:
    """One chapter plate per 回: a page of the CADAL 《增評補圖石頭記》 DJVU scans
    rendered by the Commons thumbnailer, or, for the two 回 that copy lacks,
    the spread of the University of Tokyo PDF that holds the picture
    (`plates.json` lists the pages; plates.py crops them)."""
    spec_path = os.path.join(HERE, "plates.json")
    if not os.path.exists(spec_path):
        print("note: no plates.json next to fetch.py; chapter plates skipped", file=sys.stderr)
        return
    spec = json.load(open(spec_path, encoding="utf-8"))
    out_dir = os.path.join(SOURCE, "plates")
    width = spec["renderWidth"]
    infos: dict[str, dict] = {}
    for vol in spec["volumes"].values():
        infos[vol["file"]] = file_info("File:" + vol["file"])
    meta = []
    for plate in spec["plates"]:
        path = os.path.join(out_dir, f"{plate['id']}.jpg")
        if "utokyo" in plate:
            ut = plate["utokyo"]
            info = file_info("File:" + ut["file"])
            pdf = os.path.join(out_dir, f"{plate['id']}.pdf")
            if download(info["url"], pdf, pace=1.0):
                print("plate", plate["id"], "(University of Tokyo copy)")
            if not os.path.exists(path):
                # The spreads are embedded JPEGs: take image `n` as it is.
                import subprocess
                import tempfile

                with tempfile.TemporaryDirectory() as tmp:
                    subprocess.run(["pdfimages", "-j", "-f", str(ut["image"] + 1), "-l", str(ut["image"] + 1), pdf, os.path.join(tmp, "p")], check=True)
                    got = sorted(os.listdir(tmp))[0]
                    shutil.copyfile(os.path.join(tmp, got), path)
            source_url = info["descriptionurl"] + f"?page={ut['image'] + 1}"
            licence = clean_html(info.get("extmetadata", {}).get("LicenseShortName", {}).get("value", ""))
            meta.append({**plate, "file": os.path.relpath(path, SOURCE), "commonsFile": ut["file"], "page_url": source_url, "descriptionurl": info["descriptionurl"], "license": licence, "side": ut["side"]})
            continue
        vol = spec["volumes"][plate["volume"]]
        info = infos[vol["file"]]
        if not os.path.exists(path):
            thumb = file_info("File:" + vol["file"], iiurlwidth=width, iiurlparam=f"page{plate['page']}-{width}px")["thumburl"]
            download(thumb, path, pace=1.0)
            print("plate", plate["id"], "page", plate["page"])
        meta.append(
            {
                **plate,
                "file": os.path.relpath(path, SOURCE),
                "commonsFile": vol["file"],
                "page_url": f"{info['descriptionurl']}?page={plate['page']}",
                "descriptionurl": info["descriptionurl"],
                "license": clean_html(info.get("extmetadata", {}).get("LicenseShortName", {}).get("value", "")),
                "artist": clean_html(info.get("extmetadata", {}).get("Artist", {}).get("value", "")),
            }
        )
    with open(os.path.join(out_dir, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=1, ensure_ascii=False)


def ascii_slug(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def fetch_portraits() -> None:
    """Gai Qi's portraits (《紅樓夢圖詠》, woodcut edition 1879): every
    public-domain JPEG of the Commons category, with its character tags."""
    out_dir = os.path.join(SOURCE, "portraits")
    pages: list[dict] = []
    cont: dict = {}
    while True:
        d = api(
            COMMONS_API,
            {
                "action": "query",
                "generator": "categorymembers",
                "gcmtitle": PORTRAIT_CATEGORY,
                "gcmtype": "file",
                "gcmlimit": 200,
                "prop": "imageinfo|categories",
                "cllimit": "max",
                "clshow": "!hidden",
                "iiprop": "url|size|mime|extmetadata",
                "iiextmetadatafilter": "LicenseShortName|Artist|ImageDescription|ObjectName",
                **cont,
            },
        )
        pages += d.get("query", {}).get("pages", [])
        if "continue" not in d:
            break
        cont = d["continue"]
    # Merge continuation pages of the same file (categories arrive in pieces).
    merged: dict[str, dict] = {}
    for p in pages:
        m = merged.setdefault(p["title"], {"title": p["title"], "categories": []})
        if "imageinfo" in p:
            m["imageinfo"] = p["imageinfo"]
        m["categories"] += [c["title"] for c in p.get("categories", [])]
    meta = []
    for title, p in sorted(merged.items()):
        info = (p.get("imageinfo") or [{}])[0]
        licence = clean_html(info.get("extmetadata", {}).get("LicenseShortName", {}).get("value", ""))
        if info.get("mime") != "image/jpeg" or "public domain" not in licence.lower():
            continue
        slug = PORTRAIT_SLUGS.get(title) or ascii_slug(title[5:].rsplit(".", 1)[0])
        path = os.path.join(out_dir, f"{slug}.jpg")
        if download(info["url"], path, pace=1.5):
            print("portrait", slug)
        meta.append(
            {
                "slug": slug,
                "file": os.path.relpath(path, SOURCE),
                "title": title,
                "width": info.get("width"),
                "height": info.get("height"),
                "page": info.get("descriptionurl"),
                "license": licence,
                "artist": clean_html(info.get("extmetadata", {}).get("Artist", {}).get("value", "")),
                "description": clean_html(info.get("extmetadata", {}).get("ImageDescription", {}).get("value", ""))[:400],
                "categories": sorted(set(c[9:] for c in p["categories"])),
            }
        )
    with open(os.path.join(out_dir, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=1, ensure_ascii=False)


# --- fonts ------------------------------------------------------------------------------


def fetch_fonts() -> None:
    for rel in GOOGLE_FONTS:
        url = "https://raw.githubusercontent.com/google/fonts/main/ofl/" + urllib.parse.quote(rel)
        if download(url, os.path.join(SOURCE, "fonts", rel)):
            print("font", rel)
    for rel, url in OTHER_FONTS.items():
        if download(url, os.path.join(SOURCE, "fonts", rel)):
            print("font", rel)
    rel, url = JIGMO
    zpath = os.path.join(SOURCE, "fonts", rel)
    if download(url, zpath):
        print("font", rel)
    import zipfile

    with zipfile.ZipFile(zpath) as z:
        for name in z.namelist():
            base = os.path.basename(name)
            if base in ("Jigmo2.ttf", "LICENSE.txt", "README.txt") or base.lower().startswith("license"):
                target = os.path.join(SOURCE, "fonts", "jigmo", base)
                if not os.path.exists(target):
                    with z.open(name) as src, open(target, "wb") as out:
                        out.write(src.read())


if __name__ == "__main__":
    args = set(sys.argv[1:])
    fetch_wikisource(chengjia="--no-chengjia" not in args)
    fetch_gutenberg()
    if "--no-fonts" not in args:
        fetch_fonts()
    if "--no-images" not in args:
        fetch_portraits()
        fetch_plates()
    print("sources in", SOURCE)
