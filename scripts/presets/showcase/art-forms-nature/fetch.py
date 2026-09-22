#!/usr/bin/env python3
"""Download the sources of the `art-forms-nature` showcase preset into
`source/` (git-ignored): twelve plates of Ernst Haeckel's *Kunstformen der
Natur* (1899–1904, public domain) from Wikimedia Commons, the Wikipedia
articles (CC BY-SA 4.0) the essays are cut from, and the OFL fonts.

    python3 scripts/presets/showcase/art-forms-nature/fetch.py

`source/plates/selection.json` records the Commons page, size and licence
tag of every plate; `source/wiki-extracts.json` the article title, URL,
revision id and timestamp of every extract, for the credits.
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

# Plate number → Commons file (the largest clean scan of each plate: Library
# of Congress scans where they exist, the classic Commons set otherwise).
PLATES = {
    8: "File:Discomedusae. - Scheibenquallen LCCN2014645035.jpg",
    17: "File:Siphonophorae. - Staatsquallen LCCN2015648941.jpg",
    41: "File:Acanthophracta. - Wunderstrahlinge LCCN2015648927.jpg",
    44: "File:Haeckel Ammonitida.jpg",
    49: "File:Actiniae. - Seeanemonen LCCN2014645036.jpg",
    53: "File:Prosobranchia. - Dorderkiemen-Schnecken LCCN2015648937.jpg",
    62: "File:Nepenthaceae. - Kannenpflanzen LCCN2015648944.jpg",
    66: "File:Arachnida. - Spinnentiere LCCN2015648948.jpg",
    67: "File:Haeckel Chiroptera.jpg",
    74: "File:Haeckel Orchidae.jpg",
    84: "File:Diatomea. - Schachtellinge LCCN2015648965.jpg",
    99: "File:Kunstformen der Natur (Tafel 99) BHL47388491.jpg",
}

WIKI = {
    "es": ["Ernst Haeckel", "Kunstformen der Natur", "Scyphozoa", "Siphonophorae", "Radiolaria", "Ammonoidea", "Actiniaria", "Gastropoda", "Nepenthes", "Arachnida", "Chiroptera", "Orchidaceae", "Bacillariophyta", "Trochilidae"],
    "en": ["Ernst Haeckel", "Kunstformen der Natur", "Scyphozoa", "Siphonophorae", "Radiolaria", "Ammonoidea", "Sea anemone", "Gastropoda", "Nepenthes", "Arachnid", "Bat", "Orchidaceae", "Diatom", "Hummingbird"],
}

FONTS = [
    "fraunces/Fraunces[SOFT,WONK,opsz,wght].ttf",
    "fraunces/Fraunces-Italic[SOFT,WONK,opsz,wght].ttf",
    "fraunces/OFL.txt",
    "newsreader/Newsreader[opsz,wght].ttf",
    "newsreader/Newsreader-Italic[opsz,wght].ttf",
    "newsreader/OFL.txt",
    "archivo/Archivo[wdth,wght].ttf",
    "archivo/Archivo-Italic[wdth,wght].ttf",
    "archivo/OFL.txt",
]


def get(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA)) as r:
        return r.read()


def api(host: str, params: dict) -> dict:
    return json.loads(get(f"https://{host}/w/api.php?" + urllib.parse.urlencode({**params, "format": "json"})))


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
        except Exception as err:  # noqa: BLE001
            wait = 15 * (attempt + 1)
            print(f"  retry in {wait}s: {err}", file=sys.stderr)
            time.sleep(wait)
    raise SystemExit(f"could not download {url}")


def fetch_plates() -> None:
    titles = list(PLATES.values())
    d = api("commons.wikimedia.org", {"action": "query", "titles": "|".join(titles), "prop": "imageinfo", "iiprop": "url|size|extmetadata", "iiextmetadatafilter": "LicenseShortName"})
    by_title = {p["title"]: p for p in d["query"]["pages"].values()}
    sel = {}
    for n, title in PLATES.items():
        p = by_title.get(title)
        if p is None or "imageinfo" not in p:
            raise SystemExit(f"plate not found on Commons: {title}")
        ii = p["imageinfo"][0]
        ext = title.rsplit(".", 1)[1].lower()
        path = os.path.join(SOURCE, "plates", f"tafel-{n:03d}.{ext}")
        if download(ii["url"], path, pace=3):
            print("plate", n)
        sel[str(n)] = {"plate": n, "title": title, "url": ii["url"], "page": ii["descriptionurl"], "w": ii["width"], "h": ii["height"], "license": ii.get("extmetadata", {}).get("LicenseShortName", {}).get("value", "")}
    with open(os.path.join(SOURCE, "plates", "selection.json"), "w", encoding="utf-8") as f:
        json.dump(sel, f, indent=1, ensure_ascii=False)


def fetch_wiki() -> None:
    path = os.path.join(SOURCE, "wiki-extracts.json")
    if os.path.exists(path):
        return
    out: dict[str, dict] = {}
    for lang, titles in WIKI.items():
        out[lang] = {}
        for t in titles:
            d = api(f"{lang}.wikipedia.org", {"action": "query", "prop": "extracts|revisions|info", "explaintext": 1, "redirects": 1, "rvprop": "ids|timestamp", "inprop": "url", "titles": t})
            p = list(d["query"]["pages"].values())[0]
            rev = p.get("revisions", [{}])[0]
            out[lang][t] = {"title": p.get("title"), "url": p.get("fullurl"), "revid": rev.get("revid"), "timestamp": rev.get("timestamp"), "extract": p.get("extract", "")}
            print("wiki ", lang, t)
            time.sleep(1)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)


def fetch_fonts() -> None:
    for rel in FONTS:
        url = "https://raw.githubusercontent.com/google/fonts/main/ofl/" + urllib.parse.quote(rel)
        if download(url, os.path.join(SOURCE, "fonts", rel)):
            print("font ", rel)


if __name__ == "__main__":
    fetch_fonts()
    fetch_wiki()
    fetch_plates()
    print("sources in", SOURCE)
