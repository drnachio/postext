#!/usr/bin/env python3
"""Download the sources of the `don-quijote` showcase preset into `source/`
(git-ignored): the Project Gutenberg texts, Gustave Doré's plates from
Wikimedia Commons and the OFL fonts from the google/fonts repository.

    python3 scripts/presets/showcase/don-quijote/fetch.py

Everything is public domain or SIL OFL; `source/plates/meta.json` records the
Commons page and licence tag of every plate for the credits. Downloads are
paced (Commons rate-limits bots) and skipped when the file already exists.
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

GUTENBERG = {
    "quijote-es.txt": "https://www.gutenberg.org/cache/epub/2000/pg2000.txt",
    "quixote-en.txt": "https://www.gutenberg.org/cache/epub/996/pg996.txt",
}

COMMONS_CATEGORY = (
    "Category:Illustrations by Gustave Doré in L'ingénieux hidalgo don Quichotte de la Manche (1863), Volume I"
)

# Commons file title → slug used by build.py.
PLATES = {
    'Gustave Doré - Miguel de Cervantes - Don Quixote - Part 1 - Chapter 1 - Plate 1 "A world of disorderly notions, picked out of his books, crowded into his imagination".jpg': "c01-plate-library",
    "Gustave Doré - Dom Quixote - Parte 1 - Cap 1 - 1.jpg": "c01-head",
    "Gustave Doré - Dom Quixote - Parte 1 - Cap 1 - 2.jpg": "c01-tail",
    "Gustave Doré - Miguel de Cervantes - Don Quixote - Parte 1 - Prólogo 1.png": "prologo-head",
    "Gustave Doré - Miguel de Cervantes - Don Quixote - Parte 1 - Prólogo 2.png": "prologo-tail",
    "Gustave Doré - Dom Quixote - Parte 1 - Cap 2 - 1.jpg": "c02-head",
    "Cap II Chegada de Quixote a uma estalagem.jpg": "c02-inn",
    "Cap II beber vinho por um canudo.jpg": "c02-wine",
    "Cap III Quixote a velar armas.jpg": "c03-plate-vigil",
    "Cap III Quixote armado cavaleiro.jpg": "c03-knighted",
    "Cap III Quixote e o estalajadeiro.jpg": "c03-innkeeper",
    "Cap IV Dom Quixote encontra o moço a ser vergastado.jpg": "c04-head",
    "Cap IV Dom Quixote investe contra o ruim vilão.jpg": "c04-plate-andres",
    "Cap IV Dom Quixote é sovado pelo criado dos mercadores.jpg": "c04-plate-beaten",
    "Cap IV Dom Quixote desfalecido.jpg": "c04-fallen",
    "Cap V Dom Quixote é ajudado por um lavrador seu vizinho.jpg": "c05-plate-neighbour",
    "Cap V Dom Quixote chega a casa.jpg": "c05-home",
    "Cap V Dom Quixote acompanhado pelo lavrador vizinho.jpg": "c05-tail",
    "Cap VI Dom Quixote convalescente Doré.jpg": "c06-head",
    "Cap VI A queima dos livros Doré.jpg": "c06-books",
    "Cap VII D. Quixote convence Sancho Pança Doré.jpg": "c07-head",
    "Cap VII D. Quixote convence Sancho Pança II G Doré.jpg": "c07-plate-sancho",
    "Cap VII A Varredura das histórias fantásticas Gustave Doré.jpg": "c07-tail",
    "Cap VIII Dom Quixote encontra dois beneditinos e um coche.jpg": "c08-head",
    "Adventure with the Windmills.jpg": "c08-plate-windmills",
    "Cap VIII Dom Quixote caido Gustave Doré.jpg": "c08-plate-fallen",
    "Cap VIII Sancho Pança ajuda Dom Quixote a montar a cavalo Doré.jpg": "c08-tail",
    "The Enchantment of Don Quixote.jpg": "x-enchantment",
}

# google/fonts `ofl/<family>/<file>`; variable fonts are instanced by build.py.
FONTS = [
    "alegreya/Alegreya[wght].ttf",
    "alegreya/Alegreya-Italic[wght].ttf",
    "alegreya/OFL.txt",
    "alegreyasc/AlegreyaSC-Regular.ttf",
    "alegreyasc/AlegreyaSC-Italic.ttf",
    "alegreyasc/OFL.txt",
    "playfairdisplay/PlayfairDisplay[wght].ttf",
    "playfairdisplay/PlayfairDisplay-Italic[wght].ttf",
    "playfairdisplay/OFL.txt",
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
    for name, url in GUTENBERG.items():
        if download(url, os.path.join(SOURCE, name)):
            print("text ", name)


def fetch_plates() -> None:
    api = (
        "https://commons.wikimedia.org/w/api.php?action=query&generator=categorymembers&gcmtitle="
        + urllib.parse.quote(COMMONS_CATEGORY)
        + "&gcmtype=file&gcmlimit=500&prop=imageinfo&iiprop=url|size|extmetadata"
        + "&iiextmetadatafilter=LicenseShortName|Artist&format=json"
    )
    pages = {p["title"][5:]: p for p in json.loads(get(api))["query"]["pages"].values()}
    meta = []
    for title, slug in PLATES.items():
        page = pages.get(title)
        if page is None:
            raise SystemExit(f"plate not found in the Commons category: {title}")
        info = page["imageinfo"][0]
        ext = title.rsplit(".", 1)[1].lower()
        path = os.path.join(SOURCE, "plates", f"{slug}.{ext}")
        if download(info["url"], path, pace=2.5):
            print("plate", slug)
        meta.append(
            {
                "slug": slug,
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
    fetch_fonts()
    fetch_plates()
    print("sources in", SOURCE)
