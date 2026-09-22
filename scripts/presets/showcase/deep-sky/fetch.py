#!/usr/bin/env python3
"""Download the sources of the `deep-sky` showcase preset into `source/`
(git-ignored): eight ESO and NSF NOIRLab press releases in English and
Spanish (text CC BY 4.0), their images (CC BY 4.0, credit line mandatory)
and the OFL fonts.

    python3 scripts/presets/showcase/deep-sky/fetch.py

Release pages are saved as HTML and parsed by build.py; `source/images.json`
records every image's origin, size and credit line for the credits.
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

# Release id → source and the images used (hero first). Credits are the
# lines printed on the image pages, reproduced verbatim as the licence asks.
RELEASES = [
    {
        "id": "eso2314", "source": "eso", "section": "solar",
        "images": {
            "eso2314a": "ESO/P. Irwin et al.",
            "eso2314b": "ESO/P. Irwin et al.",
        },
    },
    {
        "id": "noirlab2532", "source": "noirlab", "section": "solar",
        "images": {
            "noirlab2532b": "International Gemini Observatory/NOIRLab/NSF/AURA/B. Bolin. Image Processing: J. Miller & M. Rodriguez (International Gemini Observatory/NSF NOIRLab), T.A. Rector (University of Alaska Anchorage/NSF NOIRLab), M. Zamani (NSF NOIRLab)",
            "noirlab2532a": "International Gemini Observatory/NOIRLab/NSF/AURA/B. Bolin. Image Processing: J. Miller & M. Rodriguez (International Gemini Observatory/NSF NOIRLab), T.A. Rector (University of Alaska Anchorage/NSF NOIRLab), M. Zamani (NSF NOIRLab)",
        },
    },
    {
        "id": "eso2511", "source": "eso", "section": "stars",
        "images": {
            "eso2511a": "ESO/P. Das et al. Background stars (Hubble): K. Noll et al.",
            "eso2511b": "ESO/P. Das et al.",
        },
    },
    {
        "id": "noirlab2515", "source": "noirlab", "section": "stars",
        "images": {
            "noirlab2515a": "CTIO/NOIRLab/DOE/NSF/AURA. Image Processing: T.A. Rector (University of Alaska Anchorage/NSF NOIRLab), D. de Martin & M. Kosari (NSF NOIRLab)",
            "noirlab2515b": "CTIO/NOIRLab/DOE/NSF/AURA. Image Processing: T.A. Rector (University of Alaska Anchorage/NSF NOIRLab), D. de Martin & M. Kosari (NSF NOIRLab)",
            "noirlab2515c": "CTIO/NOIRLab/DOE/NSF/AURA. Image Processing: T.A. Rector (University of Alaska Anchorage/NSF NOIRLab), D. de Martin & M. Kosari (NSF NOIRLab)",
        },
    },
    {
        "id": "eso2510", "source": "eso", "section": "galaxies",
        "images": {
            "eso2510a": "ESO/E. Congiu et al.",
            "eso2510b": "ESO/E. Congiu et al.",
        },
    },
    {
        "id": "noirlab2612", "source": "noirlab", "section": "galaxies",
        "images": {
            "noirlab2612a": "CTIO/NOIRLab/DOE/NSF/AURA. Image Processing: T.A. Rector (University of Alaska Anchorage/NSF NOIRLab), D. de Martin & M. Zamani (NSF NOIRLab)",
            "noirlab2612b": "CTIO/NOIRLab/DOE/NSF/AURA. Image Processing: T.A. Rector (University of Alaska Anchorage/NSF NOIRLab), D. de Martin & M. Zamani (NSF NOIRLab)",
        },
    },
    {
        "id": "eso2406", "source": "eso", "section": "cosmos",
        "images": {
            "eso2406a": "EHT Collaboration",
            "eso2406b": "EHT Collaboration",
        },
    },
    {
        "id": "noirlab2618", "source": "noirlab", "section": "cosmos",
        "images": {
            "noirlab2618a": "NSF–DOE Vera C. Rubin Observatory/NOIRLab/SLAC/AURA",
            "noirlab2618b": "NSF–DOE Vera C. Rubin Observatory/NOIRLab/SLAC/AURA",
            "noirlab2618c": "NSF–DOE Vera C. Rubin Observatory/NOIRLab/SLAC/AURA",
        },
    },
]

PAGES = {
    "eso": {"en": "https://www.eso.org/public/news/{id}/", "es": "https://www.eso.org/public/spain/news/{id}/", "image": "https://www.eso.org/public/images/{img}/"},
    "noirlab": {"en": "https://noirlab.edu/public/news/{id}/", "es": "https://noirlab.edu/public/es/news/{id}/", "image": "https://noirlab.edu/public/images/{img}/"},
}
IMAGE_FILES = {
    "eso": ["https://cdn.eso.org/images/publicationjpg/{img}.jpg", "https://cdn.eso.org/images/large/{img}.jpg"],
    "noirlab": ["https://storage.noirlab.edu/media/archives/images/publicationjpg/{img}.jpg", "https://storage.noirlab.edu/media/archives/images/large/{img}.jpg"],
}

FONTS = [
    "archivo/Archivo[wdth,wght].ttf",
    "archivo/Archivo-Italic[wdth,wght].ttf",
    "archivo/OFL.txt",
    "newsreader/Newsreader[opsz,wght].ttf",
    "newsreader/Newsreader-Italic[opsz,wght].ttf",
    "newsreader/OFL.txt",
    "chivo/Chivo[wght].ttf",
    "chivo/Chivo-Italic[wght].ttf",
    "chivo/OFL.txt",
]


def get(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA)) as r:
        return r.read()


def download(url: str, path: str, pace: float = 0.0) -> bool:
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return False
    os.makedirs(os.path.dirname(path), exist_ok=True)
    data = get(url)
    with open(path, "wb") as f:
        f.write(data)
    if pace:
        time.sleep(pace)
    return True


def fetch_pages() -> None:
    for rel in RELEASES:
        for lang in ("en", "es"):
            url = PAGES[rel["source"]][lang].format(id=rel["id"])
            path = os.path.join(SOURCE, "pages", f"{rel['id']}-{lang}.html")
            if download(url, path, pace=1.5):
                print("page ", rel["id"], lang)


def fetch_images() -> None:
    meta_path = os.path.join(SOURCE, "images.json")
    meta = json.load(open(meta_path, encoding="utf-8")) if os.path.exists(meta_path) else {}
    for rel in RELEASES:
        for img, credit in rel["images"].items():
            path = os.path.join(SOURCE, "images", f"{img}.jpg")
            if not os.path.exists(path):
                for pattern in IMAGE_FILES[rel["source"]]:
                    url = pattern.format(img=img)
                    try:
                        download(url, path, pace=2)
                        print("image", img, "from", url.rsplit("/", 2)[-2], os.path.getsize(path) // 1024, "KB")
                        break
                    except Exception as err:  # noqa: BLE001
                        print("  no", url, err, file=sys.stderr)
                else:
                    raise SystemExit(f"no file for image {img}")
            meta[img] = {"release": rel["id"], "source": rel["source"], "page": PAGES[rel["source"]]["image"].format(img=img), "credit": credit, "file": f"images/{img}.jpg"}
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=1, ensure_ascii=False)


def fetch_fonts() -> None:
    for rel in FONTS:
        url = "https://raw.githubusercontent.com/google/fonts/main/ofl/" + urllib.parse.quote(rel)
        if download(url, os.path.join(SOURCE, "fonts", rel)):
            print("font ", rel)


if __name__ == "__main__":
    fetch_fonts()
    fetch_pages()
    fetch_images()
    print("sources in", SOURCE)
