#!/usr/bin/env python3
"""Download the sources of the `openstax-fisica` showcase preset into
`source/` (git-ignored): the CNXML modules and media of the first chapters
of two CC BY 4.0 OpenStax textbooks — *Física universitaria, volumen 1*
(Spanish) and *Physics* (English, the high-school course) — from the
`openstax/osbooks-*` GitHub repositories, and the OFL fonts.

    python3 scripts/presets/showcase/openstax-fisica/fetch.py

`source/<lang>/collection.xml` is the book's table of contents; every module
lands in `source/<lang>/modules/<id>.cnxml` and every picture it references
in `source/<lang>/media/`.
"""
from __future__ import annotations

import os
import re
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "source")
UA = {"User-Agent": "postext-presets/1.0 (https://github.com/drnachio/postext)"}

BOOKS = {
    "es": {
        "repo": "openstax/osbooks-fisica-universitaria-bundle",
        "collection": "collections/física-universitaria-volumen-1.collection.xml",
        "chapters": [0, 1],  # indices into the book's chapter list (Unidades y medidas, Vectores)
    },
    "en": {
        "repo": "openstax/osbooks-physics",
        "collection": "collections/physics.collection.xml",
        "chapters": [0, 1],  # What is Physics?, Motion in One Dimension
    },
}

FONTS = [
    "sourceserif4/SourceSerif4[opsz,wght].ttf",
    "sourceserif4/SourceSerif4-Italic[opsz,wght].ttf",
    "sourceserif4/OFL.txt",
    "sourcesans3/SourceSans3[wght].ttf",
    "sourcesans3/SourceSans3-Italic[wght].ttf",
    "sourcesans3/OFL.txt",
]


def get(url: str) -> bytes:
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                return r.read()
        except Exception as err:  # noqa: BLE001
            print(f"  retry {url}: {err}", file=sys.stderr)
            time.sleep(5 * (attempt + 1))
    raise SystemExit(f"could not download {url}")


def download(url: str, path: str) -> bool:
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return False
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(get(url))
    return True


def raw(repo: str, rel: str) -> str:
    return f"https://raw.githubusercontent.com/{repo}/main/" + urllib.parse.quote(rel)


def chapters_of(collection_xml: str) -> list[tuple[str, list[str]]]:
    """(title, module ids) of every chapter (a subcollection holding modules
    directly, or through its own subcollections)."""
    out: list[tuple[str, list[str]]] = []
    for block in re.findall(r"<col:subcollection>(.*?)</col:subcollection>", collection_xml, re.S):
        pass
    # The books nest chapters under a "unit" subcollection or not; walk the
    # tree and take the subcollections whose direct content holds modules.
    def walk(xml: str) -> None:
        pos = 0
        depth = 0
        stack: list[tuple[str, int]] = []
        for m in re.finditer(r"<col:subcollection>|</col:subcollection>|<md:title>(.*?)</md:title>|<col:module document=\"(m\d+)\"/>", xml):
            tok = m.group(0)
            if tok == "<col:subcollection>":
                stack.append(["", []])
            elif tok == "</col:subcollection>":
                title, mods = stack.pop()
                if mods:
                    out.append((title, mods))
            elif m.group(1) is not None and stack and not stack[-1][0]:
                stack[-1][0] = m.group(1)
            elif m.group(2) is not None and stack:
                stack[-1][1].append(m.group(2))

    walk(collection_xml)
    return out


if __name__ == "__main__":
    for rel in FONTS:
        if download("https://raw.githubusercontent.com/google/fonts/main/ofl/" + urllib.parse.quote(rel), os.path.join(SOURCE, "fonts", rel)):
            print("font ", rel)
    for lang, book in BOOKS.items():
        root = os.path.join(SOURCE, lang)
        cpath = os.path.join(root, "collection.xml")
        if download(raw(book["repo"], book["collection"]), cpath):
            print("toc  ", lang)
        xml = open(cpath, encoding="utf-8").read()
        chapters = chapters_of(xml)
        wanted = [chapters[i] for i in book["chapters"]]
        for title, mods in wanted:
            print(f"chapter {lang}: {title} ({len(mods)} modules)")
            for mid in mods:
                mpath = os.path.join(root, "modules", f"{mid}.cnxml")
                if download(raw(book["repo"], f"modules/{mid}/index.cnxml"), mpath):
                    print("  module", mid)
                cnxml = open(mpath, encoding="utf-8").read()
                for src in re.findall(r'<image[^>]*src="\.\./\.\./media/([^"]+)"', cnxml):
                    if download(raw(book["repo"], f"media/{src}"), os.path.join(root, "media", src)):
                        print("  media ", src)
                        time.sleep(0.2)
    print("sources in", SOURCE)
