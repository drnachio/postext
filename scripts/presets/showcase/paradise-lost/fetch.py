#!/usr/bin/env python3
"""Download the sources of the `paradise-lost` showcase preset into
`source/` (git-ignored): the poem from Project Gutenberg, A. W. Verity's
annotated Cambridge edition (1910) as the Internet Archive's OCR text,
Gustave Doré's fifty plates (1866) from Wikimedia Commons and the OFL fonts
from the google/fonts repository.

    python3 scripts/presets/showcase/paradise-lost/fetch.py

The verse paragraphs and the Arguments come from Wikisource (see text.py).
Everything is public domain or SIL OFL; `source/plates/meta.json` records the
Commons page and licence tag of every plate for the credits. Downloads are
paced (Commons rate-limits bots) and skipped when the file already exists.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "source")
UA = {"User-Agent": "postext-presets/1.0 (https://github.com/drnachio/postext)"}

sys.path.insert(0, HERE)
from plates import PLATES  # noqa: E402

TEXTS = {
    # The twelve-book text of 1674, in modern spelling.
    "paradise-lost.txt": "https://www.gutenberg.org/cache/epub/26/pg26.txt",
    # Verity's edition: the Arguments, the notes keyed to line numbers.
    "verity-1910.txt": "https://archive.org/download/paradiselostmilt00miltuoft/paradiselostmilt00miltuoft_djvu.txt",
}

# Wikisource's validated transcription of an 1890 reprint: its verse
# paragraphs and Milton's Arguments (see text.py).
WS_INDEX = "Paradise lost by Milton, John.djvu"
WS_API = "https://en.wikisource.org/w/api.php"
# Milton's note on the verse (1668), from the 1674 text on Wikisource.
WS_VERSE = "Paradise_Lost_(1674)/The_Verse"

COMMONS_CATEGORY = "Category:Illustrations of Paradise Lost by Gustave Doré"

# google/fonts `ofl/<family>/<file>`; EB Garamond is instanced by build.py.
FONTS = [
    "ebgaramond/EBGaramond[wght].ttf",
    "ebgaramond/EBGaramond-Italic[wght].ttf",
    "ebgaramond/OFL.txt",
    "imfellenglish/IMFeENrm28P.ttf",
    "imfellenglish/IMFeENit28P.ttf",
    "imfellenglish/OFL.txt",
    "imfellenglishsc/IMFeENsc28P.ttf",
    "imfellenglishsc/OFL.txt",
]


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req) as r:
        return r.read()


def download(url: str, path: str, pace: float = 0.0) -> bool:
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return False
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for attempt in range(5):
        try:
            data = get(url)
            with open(path, "wb") as f:
                f.write(data)
            if pace:
                time.sleep(pace)
            return True
        except Exception as err:  # noqa: BLE001 — retry on 429/5xx and network hiccups
            wait = 15 * (attempt + 1)
            print(f"  retry in {wait}s: {err}", file=sys.stderr)
            time.sleep(wait)
    raise SystemExit(f"could not download {url}")


def fetch_texts() -> None:
    for name, url in TEXTS.items():
        if download(url, os.path.join(SOURCE, name)):
            print("text ", name)


def fetch_wikisource() -> None:
    path = os.path.join(SOURCE, "ws1890", "pages.json")
    if not os.path.exists(path):
        books = {}
        for b in range(1, 13):
            raw = get(f"https://en.wikisource.org/w/index.php?title=Paradise_Lost_(1890)/Book_{b}&action=raw").decode()
            m = re.search(r"from=(\d+)\|to=(\d+)", raw)
            books[str(b)] = [int(m.group(1)), int(m.group(2))]
            time.sleep(0.5)
        lo, hi = min(v[0] for v in books.values()), max(v[1] for v in books.values())
        pages: dict[str, str | None] = {}
        for start in range(lo, hi + 1, 50):
            titles = "|".join(f"Page:{WS_INDEX}/{n}" for n in range(start, min(hi, start + 49) + 1))
            data = json.loads(get(f"{WS_API}?action=query&prop=revisions&rvprop=content&rvslots=main&format=json&titles=" + urllib.parse.quote(titles)))
            for page in data["query"]["pages"].values():
                n = page["title"].rsplit("/", 1)[1]
                pages[n] = page["revisions"][0]["slots"]["main"]["*"] if "revisions" in page else None
            time.sleep(1)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"books": books, "pages": pages}, f, ensure_ascii=False)
        print("text  wikisource 1890")
    if download(f"https://en.wikisource.org/w/index.php?title={WS_VERSE}&action=raw", os.path.join(SOURCE, "the-verse.wiki")):
        print("text  the-verse.wiki")


def fetch_plates() -> None:
    api = (
        "https://commons.wikimedia.org/w/api.php?action=query&generator=categorymembers&gcmtitle="
        + urllib.parse.quote(COMMONS_CATEGORY)
        + "&gcmtype=file&gcmlimit=500&prop=imageinfo&iiprop=url|size|extmetadata"
        + "&iiextmetadatafilter=LicenseShortName|Artist&format=json"
    )
    pages = {p["title"][5:]: p for p in json.loads(get(api))["query"]["pages"].values()}
    meta = []
    for plate in PLATES:
        title = plate["commons"]
        page = pages.get(title)
        if page is None:
            raise SystemExit(f"plate not found in the Commons category: {title}")
        info = page["imageinfo"][0]
        path = os.path.join(SOURCE, "plates", f"{plate['slug']}.jpg")
        if download(info["url"], path, pace=2.5):
            print("plate", plate["slug"])
        meta.append(
            {
                "slug": plate["slug"],
                "file": os.path.relpath(path, SOURCE),
                "title": title,
                "width": info["width"],
                "height": info["height"],
                "page": info["descriptionurl"],
                "license": info.get("extmetadata", {}).get("LicenseShortName", {}).get("value", ""),
            }
        )
    with open(os.path.join(SOURCE, "plates", "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=1, ensure_ascii=False)


def fetch_fonts() -> None:
    for rel in FONTS:
        url = "https://raw.githubusercontent.com/google/fonts/main/ofl/" + urllib.parse.quote(rel)
        if download(url, os.path.join(SOURCE, "fonts", rel)):
            print("font ", rel)


if __name__ == "__main__":
    fetch_texts()
    fetch_wikisource()
    fetch_fonts()
    fetch_plates()
    print("sources in", SOURCE)
