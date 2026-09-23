#!/usr/bin/env python3
"""Download the sources of the `senales` showcase preset into `source/`
(git-ignored): the English and Spanish PDFs of EEA Signals 2020 — *Towards
zero pollution in Europe* (© EEA 2020, "reproduction is authorised,
provided the source is acknowledged"), the CC0 photographs that replace
the magazine's copyrighted pictures (Unsplash uploads on Wikimedia
Commons, checked against each file's licence metadata) and the OFL fonts.

    python3 scripts/presets/showcase/senales/fetch.py

`source/photos.json` records, per photograph, the Commons page, author,
licence and pixel size for the credits.
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "source")
UA = {"User-Agent": "postext-presets/1.0 (https://github.com/drnachio/postext)"}

PDFS = {
    "en": ("signals-en.pdf", "https://www.eea.europa.eu/en/analysis/publications/signals-2020/signals-2020/@@download/file"),
    "es": ("signals-es.pdf", "https://www.eea.europa.eu/en/analysis/publications/signals-2020/spanish-pdf-senales-de-la-aema-2020/@@download/file"),
}

# Photograph id → Commons file title. Every file must carry a CC0, CC BY or
# public-domain licence in its metadata, or the fetch stops.
PHOTOS = {
    "cover": "File:Copenhagen, Denmark (Unsplash A3Hbc08ZdlU).jpg",
    "editorial": "File:Bike on street Copenhagen (Unsplash).jpg",
    "air-1": "File:In the morning traffic (Unsplash).jpg",
    "air-2": "File:Skyscrapers in fog (Unsplash).jpg",
    "water-1": "File:Clouds mirrored in a mountain lake (Unsplash).jpg",
    "water-2": "File:Breaking waves (Unsplash zIU96X1f4pM).jpg",
    "soil-1": "File:Castellina In Chianti (Unsplash).jpg",
    "soil-2": "File:Harvesting the Wheat Crop (Unsplash).jpg",
    "chemicals-1": "File:Plants in beakers (Unsplash).jpg",
    "chemicals-2": "File:Pile of graduated cylinders.jpg",
    "polluter-1": "File:Sunset above power plant (Unsplash).jpg",
    "polluter-2": "File:Power Plant (Unsplash).jpg",
    "industry-1": "File:Powerhouse (Unsplash).jpg",
    "industry-2": "File:Wind Turbines (Unsplash).jpg",
    "noise-1": "File:Car trails on the Highway, Delyan, Bulgaria (Unsplash).jpg",
    "noise-2": "File:Airplane over white buildings (Unsplash).jpg",
    "health-1": "File:Walk in a thawing forest (Unsplash).jpg",
    "health-2": "File:Biking through Edinburgh (Unsplash).jpg",
}
ACCEPTED = {"CC0", "CC BY 4.0", "CC BY 3.0", "CC BY 2.0", "CC BY 2.5", "Public domain"}

FONTS = [
    "opensans/OpenSans[wdth,wght].ttf",
    "opensans/OpenSans-Italic[wdth,wght].ttf",
    "opensans/OFL.txt",
    "outfit/Outfit[wght].ttf",
    "outfit/OFL.txt",
]


def get(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300) as r:
        return r.read()


def download(url: str, path: str, min_bytes: int = 1000) -> bool:
    if os.path.exists(path) and os.path.getsize(path) > min_bytes:
        return False
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for attempt in range(4):
        data = get(url)
        if len(data) > min_bytes:
            with open(path, "wb") as f:
                f.write(data)
            return True
        time.sleep(5 * (attempt + 1))
    raise SystemExit(f"could not download {url}")


def commons(titles: list[str]) -> dict:
    q = urllib.parse.urlencode({"action": "query", "prop": "imageinfo", "iiprop": "url|size|extmetadata", "titles": "|".join(titles), "format": "json"})
    return json.loads(get("https://commons.wikimedia.org/w/api.php?" + q))


def strip_html(s: str) -> str:
    import re

    return re.sub(r"<[^>]+>", "", s or "").strip()


def fetch_photos() -> None:
    meta_path = os.path.join(SOURCE, "photos.json")
    meta = json.load(open(meta_path, encoding="utf-8")) if os.path.exists(meta_path) else {}
    ids = [k for k in PHOTOS if k not in meta]
    for i in range(0, len(ids), 10):
        chunk = ids[i:i + 10]
        d = commons([PHOTOS[k] for k in chunk])
        by_title = {}
        for p in d["query"]["pages"].values():
            by_title[p["title"]] = p
            for norm in d["query"].get("normalized", []):
                if norm["to"] == p["title"]:
                    by_title[norm["from"]] = p
        for k in chunk:
            p = by_title.get(PHOTOS[k])
            if p is None or "imageinfo" not in p:
                raise SystemExit(f"{PHOTOS[k]}: not found on Commons")
            ii = p["imageinfo"][0]
            m = ii.get("extmetadata", {})
            licence = m.get("LicenseShortName", {}).get("value", "")
            if licence not in ACCEPTED:
                raise SystemExit(f"{PHOTOS[k]}: licence {licence!r} is not accepted")
            meta[k] = {
                "title": p["title"],
                "page": ii["descriptionurl"],
                "url": ii["url"],
                "width": ii["width"],
                "height": ii["height"],
                "licence": licence,
                "licence_url": m.get("LicenseUrl", {}).get("value", ""),
                "author": strip_html(m.get("Artist", {}).get("value", "")),
                "credit": strip_html(m.get("Credit", {}).get("value", "")),
            }
            print("meta ", k, licence, "|", meta[k]["author"][:40])
        time.sleep(1)
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=1, ensure_ascii=False)
    for k, v in meta.items():
        path = os.path.join(SOURCE, "photos", f"{k}.jpg")
        if download(v["url"], path, min_bytes=100000):
            print("photo", k, os.path.getsize(path) // 1024, "KB")
            time.sleep(1)


def fetch_fonts() -> None:
    for rel in FONTS:
        if download("https://raw.githubusercontent.com/google/fonts/main/ofl/" + urllib.parse.quote(rel), os.path.join(SOURCE, "fonts", rel)):
            print("font ", rel)


if __name__ == "__main__":
    for lang, (name, url) in PDFS.items():
        if download(url, os.path.join(SOURCE, name), min_bytes=1_000_000):
            print("pdf  ", name)
    fetch_fonts()
    fetch_photos()
    print("sources in", SOURCE)
