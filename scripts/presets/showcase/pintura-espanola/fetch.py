#!/usr/bin/env python3
"""Download the sources of the `pintura-espanola` showcase preset into
`source/` (git-ignored): fourteen Spanish paintings from open-access museum
collections (The Met, National Gallery of Art, Cleveland Museum of Art — all
CC0 files — and a public-domain Museo Sorolla scan from Wikimedia Commons), the Wikipedia
articles (CC BY-SA 4.0) the commentaries are cut from, and the OFL fonts.

    python3 scripts/presets/showcase/pintura-espanola/fetch.py

`source/works.json` records, per work, the museum page, accession number,
image URL and licence statement for the credits.
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

# Verified 2026-09-22 against each museum's API (isPublicDomain / openaccess /
# share_license_status / is_public_domain). Images capped at ~4000 px; the NGA
# IIIF server truncates a few 4000 px renders, so those are asked at 3500 px.
WORKS = [
    {"id": "greco-toledo", "artist": "greco", "museum": "met", "accession": "29.100.6", "page": "https://www.metmuseum.org/art/collection/search/436575",
     "title": {"en": "View of Toledo", "es": "Vista de Toledo"}, "date": "ca. 1599–1600", "medium": {"en": "Oil on canvas", "es": "Óleo sobre lienzo"}, "size": "121,3 × 108,6 cm",
     "image": "https://images.metmuseum.org/CRDImages/ep/original/DP349564.jpg", "licence": "The Met Open Access · CC0", "wiki": {"en": "View of Toledo", "es": "Vista de Toledo"}},
    {"id": "greco-cardenal", "artist": "greco", "museum": "met", "accession": "29.100.5", "page": "https://www.metmuseum.org/art/collection/search/436573",
     "title": {"en": "Cardinal Fernando Niño de Guevara", "es": "El cardenal Fernando Niño de Guevara"}, "date": "ca. 1600", "medium": {"en": "Oil on canvas", "es": "Óleo sobre lienzo"}, "size": "170,8 × 108 cm",
     "image": "https://images.metmuseum.org/CRDImages/ep/original/DP-17777-001.jpg", "licence": "The Met Open Access · CC0", "wiki": {"en": "Portrait of Fernando Niño de Guevara", "es": "Retrato del cardenal Fernando Niño de Guevara"}},
    {"id": "greco-laocoonte", "artist": "greco", "museum": "nga", "accession": "1946.18.1", "page": "https://www.nga.gov/artworks/33253-laocoon",
     "title": {"en": "Laocoön", "es": "Laocoonte"}, "date": "c. 1610–1614", "medium": {"en": "Oil on canvas", "es": "Óleo sobre lienzo"}, "size": "137,5 × 172,5 cm",
     "image": "https://api.nga.gov/iiif/b9047a35-7e24-45bc-bd99-ea19137bc724/full/!3500,3500/0/default.jpg", "licence": "NGA Open Access · CC0", "wiki": {"en": "Laocoön (El Greco)", "es": "Laocoonte (El Greco)"}},
    {"id": "velazquez-pareja", "artist": "velazquez", "museum": "met", "accession": "1971.86", "page": "https://www.metmuseum.org/art/collection/search/437869",
     "title": {"en": "Juan de Pareja", "es": "Juan de Pareja"}, "date": "1650", "medium": {"en": "Oil on canvas", "es": "Óleo sobre lienzo"}, "size": "81,3 × 69,9 cm",
     "image": "https://images.metmuseum.org/CRDImages/ep/original/DP-14286-001.jpg", "licence": "The Met Open Access · CC0", "wiki": {"en": "Portrait of Juan de Pareja", "es": "Retrato de Juan de Pareja"}},
    {"id": "velazquez-costurera", "artist": "velazquez", "museum": "nga", "accession": "1937.1.81", "page": "https://www.nga.gov/collection/art-object-page.88.html",
     "title": {"en": "The Needlewoman", "es": "La costurera"}, "date": "c. 1640–1650", "medium": {"en": "Oil on canvas", "es": "Óleo sobre lienzo"}, "size": "74 × 60 cm",
     "image": "https://api.nga.gov/iiif/9150722c-f34d-484b-aa58-4079c7e85850/full/!3500,3500/0/default.jpg", "licence": "NGA Open Access · CC0", "wiki": {"en": "The Needlewoman", "es": "La costurera"}},
    {"id": "zurbaran-lucia", "artist": "zurbaran", "museum": "nga", "accession": "1943.7.11", "page": "https://www.nga.gov/artworks/12209-saint-lucy",
     "title": {"en": "Saint Lucy", "es": "Santa Lucía"}, "date": "c. 1625–1630", "medium": {"en": "Oil on canvas", "es": "Óleo sobre lienzo"}, "size": "104,1 × 77 cm",
     "image": "https://api.nga.gov/iiif/5074f3fc-e181-4c76-9c36-247d7c0978fa/full/!3500,3500/0/default.jpg", "licence": "NGA Open Access · CC0", "wiki": None},
    {"id": "zurbaran-nazaret", "artist": "zurbaran", "museum": "cma", "accession": "1960.117", "page": "https://clevelandart.org/art/1960.117",
     "title": {"en": "Christ and the Virgin in the House at Nazareth", "es": "Cristo y la Virgen en la casa de Nazaret"}, "date": "c. 1640", "medium": {"en": "Oil on canvas", "es": "Óleo sobre lienzo"}, "size": "165 × 218,2 cm",
     "image": "https://openaccess-cdn.clevelandart.org/1960.117/1960.117_print.jpg", "licence": "Cleveland Museum of Art · CC0", "wiki": None},
    {"id": "murillo-ventana", "artist": "murillo", "museum": "nga", "accession": "1942.9.46", "page": "https://www.nga.gov/collection/art-object-page.1185.html",
     "title": {"en": "Two Women at a Window", "es": "Mujeres en la ventana"}, "date": "c. 1655–1660", "medium": {"en": "Oil on canvas", "es": "Óleo sobre lienzo"}, "size": "125,1 × 104,5 cm",
     "image": "https://api.nga.gov/iiif/099e8599-3242-46f4-bf5d-1a2e6032eb13/full/!3500,3500/0/default.jpg", "licence": "NGA Open Access · CC0", "wiki": {"en": "Two Women at a Window", "es": "Mujeres en la ventana"}},
    {"id": "murillo-virgen", "artist": "murillo", "museum": "met", "accession": "43.13", "page": "https://www.metmuseum.org/art/collection/search/437175",
     "title": {"en": "Virgin and Child", "es": "La Virgen con el Niño"}, "date": "1670s", "medium": {"en": "Oil on canvas", "es": "Óleo sobre lienzo"}, "size": "165,7 × 109,2 cm",
     "image": "https://images.metmuseum.org/CRDImages/ep/original/DP-14936-010.jpg", "licence": "The Met Open Access · CC0", "wiki": None},
    {"id": "ribera-pedro", "artist": "ribera", "museum": "met", "accession": "2012.416", "page": "https://www.metmuseum.org/art/collection/search/441971",
     "title": {"en": "The Tears of Saint Peter", "es": "Las lágrimas de san Pedro"}, "date": "ca. 1612–1613", "medium": {"en": "Oil on canvas", "es": "Óleo sobre lienzo"}, "size": "161,9 × 114,3 cm",
     "image": "https://images.metmuseum.org/CRDImages/ep/original/DP286357.jpg", "licence": "The Met Open Access · CC0", "wiki": None},
    {"id": "goya-manuel", "artist": "goya", "museum": "met", "accession": "49.7.41", "page": "https://www.metmuseum.org/art/collection/search/436545",
     "title": {"en": "Manuel Osorio Manrique de Zuñiga", "es": "Don Manuel Osorio Manrique de Zúñiga"}, "date": "1787–1788", "medium": {"en": "Oil on canvas", "es": "Óleo sobre lienzo"}, "size": "127 × 101,6 cm",
     "image": "https://images.metmuseum.org/CRDImages/ep/original/DP287624.jpg", "licence": "The Met Open Access · CC0", "wiki": {"en": "Manuel Osorio Manrique de Zúñiga", "es": "Don Manuel Osorio Manrique de Zúñiga, niño"}},
    {"id": "goya-pontejos", "artist": "goya", "museum": "nga", "accession": "1937.1.85", "page": "https://www.nga.gov/artworks/92-marquesa-de-pontejos",
     "title": {"en": "The Marquesa de Pontejos", "es": "La marquesa de Pontejos"}, "date": "c. 1786", "medium": {"en": "Oil on canvas", "es": "Óleo sobre lienzo"}, "size": "210,3 × 127 cm",
     "image": "https://api.nga.gov/iiif/299ddaef-0a69-4a23-96dc-71d7f1ee6112/full/!3500,3500/0/default.jpg", "licence": "NGA Open Access · CC0", "wiki": {"en": None, "es": "Retrato de la marquesa de Pontejos"}},
    {"id": "goya-sabasa", "artist": "goya", "museum": "nga", "accession": "1937.1.88", "page": "https://www.nga.gov/artworks/95-senora-sabasa-garcia",
     "title": {"en": "Señora Sabasa García", "es": "La señora Sabasa García"}, "date": "c. 1806–1811", "medium": {"en": "Oil on canvas", "es": "Óleo sobre lienzo"}, "size": "71 × 58 cm",
     "image": "https://api.nga.gov/iiif/f3ce4ceb-a752-4880-8615-0e6a87f34679/full/!3500,3500/0/default.jpg", "licence": "NGA Open Access · CC0", "wiki": None},
    # The Art Institute's IIIF server sits behind a bot challenge, so Sorolla
    # comes from the Museo Sorolla's Google Art Project scan on Wikimedia
    # Commons (public domain: the painter died in 1923).
    {"id": "sorolla-paseo", "artist": "sorolla", "museum": "msorolla", "accession": "", "page": "https://commons.wikimedia.org/wiki/File:Joaqu%C3%ADn_Sorolla_y_Bastida_-_Strolling_along_the_Seashore_-_Google_Art_Project.jpg",
     "title": {"en": "Strolling along the Seashore", "es": "Paseo a orillas del mar"}, "date": "1909", "medium": {"en": "Oil on canvas", "es": "Óleo sobre lienzo"}, "size": "205 × 200 cm",
     "image": "https://upload.wikimedia.org/wikipedia/commons/d/d9/Joaqu%C3%ADn_Sorolla_y_Bastida_-_Strolling_along_the_Seashore_-_Google_Art_Project.jpg", "licence": "Public domain · Google Art Project scan, Wikimedia Commons", "wiki": {"en": "Walk on the Beach", "es": "Paseo a orillas del mar"}},
]

ARTISTS = {
    "greco": {"en": "El Greco", "es": "El Greco"},
    "velazquez": {"en": "Diego Velázquez", "es": "Diego Velázquez"},
    "zurbaran": {"en": "Francisco de Zurbarán", "es": "Francisco de Zurbarán"},
    "murillo": {"en": "Bartolomé Esteban Murillo", "es": "Bartolomé Esteban Murillo"},
    "ribera": {"en": "Jusepe de Ribera", "es": "José de Ribera"},
    "goya": {"en": "Francisco Goya", "es": "Francisco de Goya"},
    "sorolla": {"en": "Joaquín Sorolla", "es": "Joaquín Sorolla"},
}

FONTS = [
    "bodonimoda/BodoniModa[opsz,wght].ttf",
    "bodonimoda/BodoniModa-Italic[opsz,wght].ttf",
    "bodonimoda/OFL.txt",
    "ebgaramond/EBGaramond[wght].ttf",
    "ebgaramond/EBGaramond-Italic[wght].ttf",
    "ebgaramond/OFL.txt",
    "ibmplexsanscondensed/IBMPlexSansCondensed-Regular.ttf",
    "ibmplexsanscondensed/IBMPlexSansCondensed-Medium.ttf",
    "ibmplexsanscondensed/IBMPlexSansCondensed-SemiBold.ttf",
    "ibmplexsanscondensed/IBMPlexSansCondensed-Italic.ttf",
    "ibmplexsanscondensed/OFL.txt",
]


def get(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as r:
        return r.read()


def api(host: str, params: dict) -> dict:
    return json.loads(get(f"https://{host}/w/api.php?" + urllib.parse.urlencode({**params, "format": "json"})))


def download(url: str, path: str, pace: float = 0.0) -> bool:
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return False
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for attempt in range(4):
        try:
            data = get(url)
            with open(path, "wb") as f:
                f.write(data)
            if pace:
                time.sleep(pace)
            return True
        except Exception as err:  # noqa: BLE001
            print(f"  retry {url}: {err}", file=sys.stderr)
            time.sleep(10 * (attempt + 1))
    raise SystemExit(f"could not download {url}")


def fetch_images() -> None:
    for w in WORKS:
        path = os.path.join(SOURCE, "images", f"{w['id']}.jpg")
        if download(w["image"], path, pace=2):
            print("image", w["id"], os.path.getsize(path) // 1024, "KB")
    with open(os.path.join(SOURCE, "works.json"), "w", encoding="utf-8") as f:
        json.dump({"works": WORKS, "artists": ARTISTS}, f, indent=1, ensure_ascii=False)


def fetch_wiki() -> None:
    """Article extracts for the artists and the works; titles already in
    `wiki-extracts.json` are kept as fetched."""
    path = os.path.join(SOURCE, "wiki-extracts.json")
    out: dict[str, dict] = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {"es": {}, "en": {}}
    titles = {lang: set() for lang in out}
    for a in ARTISTS.values():
        for lang in out:
            titles[lang].add(a[lang])
    for w in WORKS:
        if w["wiki"]:
            for lang in out:
                if w["wiki"].get(lang):
                    titles[lang].add(w["wiki"][lang])
    for lang, ts in titles.items():
        for t in sorted(ts):
            if t in out[lang]:
                continue
            d = api(f"{lang}.wikipedia.org", {"action": "query", "prop": "extracts|revisions|info", "explaintext": 1, "redirects": 1, "rvprop": "ids|timestamp", "inprop": "url", "titles": t})
            p = list(d["query"]["pages"].values())[0]
            rev = p.get("revisions", [{}])[0]
            out[lang][t] = {"title": p.get("title"), "url": p.get("fullurl"), "revid": rev.get("revid"), "timestamp": rev.get("timestamp"), "extract": p.get("extract", "")}
            print("wiki ", lang, t, len(out[lang][t]["extract"].split()), "words")
            time.sleep(1)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)


def fetch_fonts() -> None:
    for rel in FONTS:
        if download("https://raw.githubusercontent.com/google/fonts/main/ofl/" + urllib.parse.quote(rel), os.path.join(SOURCE, "fonts", rel)):
            print("font ", rel)


if __name__ == "__main__":
    fetch_fonts()
    fetch_wiki()
    fetch_images()
    print("sources in", SOURCE)
