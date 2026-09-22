#!/usr/bin/env python3
"""Download the sources of the `espana-en-mapas` showcase preset into
`source/` (git-ignored): the Spanish and English editions of the history
chapter of the Atlas Nacional de España (IGN, CC BY 4.0 ign.es) and the
OFL fonts from the google/fonts repository.

    python3 scripts/presets/showcase/espana-en-mapas/fetch.py
"""
from __future__ import annotations

import os
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "source")
UA = {"User-Agent": "postext-presets/1.0 (https://github.com/drnachio/postext)"}

PDFS = {
    "06_Referenciashistoricas_2023.pdf": "https://www.ign.es/web/resources/docs/IGNCnig/ANE/Capitulos/06_Referenciashistoricas_2023.pdf",
    "06_Historicaloverview_2024.pdf": "https://www.ign.es/web/resources/docs/IGNCnig/ANE/Capitulos/06_Historicaloverview_2024.pdf",
}
FONTS = [
    "sourcesans3/SourceSans3[wght].ttf",
    "sourcesans3/SourceSans3-Italic[wght].ttf",
    "sourcesans3/OFL.txt",
    "archivo/Archivo[wdth,wght].ttf",
    "archivo/OFL.txt",
]


def download(url: str, path: str) -> bool:
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return False
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA)) as r, open(path, "wb") as f:
        f.write(r.read())
    return True


if __name__ == "__main__":
    for name, url in PDFS.items():
        if download(url, os.path.join(SOURCE, name)):
            print("pdf  ", name)
    for rel in FONTS:
        if download("https://raw.githubusercontent.com/google/fonts/main/ofl/" + urllib.parse.quote(rel), os.path.join(SOURCE, "fonts", rel)):
            print("font ", rel)
    print("sources in", SOURCE)
