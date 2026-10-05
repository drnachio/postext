#!/usr/bin/env python3
"""Download the sources of the `kokoro` showcase preset into `source/`
(git-ignored):

- Aozora Bunko (青空文庫), Natsume Sōseki: card 773 こころ (the ruby text,
  新字新仮名, after the 集英社文庫 edition) and the three short texts that
  went with the 1914 book: 4688 『心』自序 (the preface), 4689 『心』広告文
  (the advertisement) and 4687 『心』予告 (the newspaper notice), with their
  card pages;
- the National Diet Library's scans (NDL Digital Collections, IIIF, public
  domain mark): the 1914 first edition 『こゝろ』 (岩波書店, pid 945471),
  whose cover, endpapers, title-page woodblock and colophon frame Sōseki
  designed himself; the 1917 reprint (pid 906330), a second witness of the
  same designs; and 『漱石遺墨集』 (岩波書店 1935, pid 1192970), his
  paintings, for the part openers;
- the OFL fonts from google/fonts: Shippori Mincho B1 (the text face),
  Shippori Antique B1 (running heads, folios) and Noto Serif JP (glyph
  donor, should a character be missing).

    python3 scripts/presets/showcase/kokoro/fetch.py [--no-images] [--no-fonts]

Downloads are paced, retried and skipped when the file is already there
with the checksum `source/manifest.json` recorded, so the script can be
re-run. `source/ndl/meta.json` records the canvas, the IIIF image URL and
the persistent id of every scan.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "source")
MANIFEST = os.path.join(SOURCE, "manifest.json")
UA = {"User-Agent": "postext-presets/1.0 (https://github.com/drnachio/postext)"}

AOZORA = "https://www.aozora.gr.jp/cards/000148/"
AOZORA_FILES = {
    "aozora/773_ruby_5968.zip": "files/773_ruby_5968.zip",
    "aozora/4688_ruby_9465.zip": "files/4688_ruby_9465.zip",
    "aozora/4689_txt_9473.zip": "files/4689_txt_9473.zip",
    "aozora/4687_ruby_9467.zip": "files/4687_ruby_9467.zip",
    "aozora/card773.html": "card773.html",
    "aozora/card4688.html": "card4688.html",
    "aozora/card4689.html": "card4689.html",
    "aozora/card4687.html": "card4687.html",
}

# NDL IIIF: `{pid: {canvas: what it shows}}`. 945471 is the 帝国図書館 copy
# of the first edition (microfilm, greyscale spreads 3951×2735); 906330 the
# 1917 printing of the same book; 1192970 the 1935 album of paintings and
# calligraphy (colour, 4856×6576). In the album each plate is preceded by
# the ghost of its tissue guard on the canvas before it: those are skipped.
NDL = {
    "945471": {
        2: "表紙 (cover): the 康熙字典 「心」 label on the mottled board",
        3: "見返し (endpapers): roundels of standing figures and lotus",
        4: "扉 (title page): Sōseki's woodblock of a man gazing at 「心」, cut by 伊上凡骨; the seal on the facing page",
        221: "奥付 (colophon): the woodblock frame of leaves, the 「漱石」 seal",
    },
    "906330": {
        2: "見返し (endpapers), 1917 printing",
        3: "扉 (title page), 1917 printing",
        225: "奥付 (colophon), 1917 printing",
    },
    "1192970": {
        11: "山上有山圖 (大正3, colour): blue mountains, willows, a red-roofed house",
        19: "孤客入石門圖 (大正3, colour): a lone traveller enters the stone gate",
        43: "萩の粥圖 (大正3, monochrome; the original burned): a pot on the hearth hook, bush clover",
        51: "菊圖 (大正5, monochrome)",
        55: "山水圖 (大正5, monochrome): a hut under trees",
    },
}
NDL_TITLES = {
    "945471": "夏目漱石『こゝろ』岩波書店、1914（大正3）年",
    "906330": "夏目漱石『こゝろ』岩波書店、1917（大正6）年",
    "1192970": "『漱石遺墨集』岩波書店、1935（昭和10）年",
}

GOOGLE_FONTS = [
    "shipporiminchob1/ShipporiMinchoB1-Regular.ttf",
    "shipporiminchob1/ShipporiMinchoB1-Bold.ttf",
    "shipporiminchob1/ShipporiMinchoB1-ExtraBold.ttf",
    "shipporiminchob1/OFL.txt",
    "shipporiantiqueb1/ShipporiAntiqueB1-Regular.ttf",
    "shipporiantiqueb1/OFL.txt",
    # Donor only: fonts.py copies a glyph from it if Shippori lacks one.
    "notoserifjp/NotoSerifJP[wght].ttf",
    "notoserifjp/OFL.txt",
]


# --- HTTP and manifest --------------------------------------------------------


def get(url: str, timeout: int = 300) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def get_retry(url: str, attempts: int = 6, base_wait: float = 10) -> bytes:
    """Retry with a growing back-off (10, 20, 40 s …); a 404 is final."""
    for attempt in range(attempts):
        try:
            return get(url)
        except urllib.error.HTTPError as err:
            if err.code == 404:
                raise
            wait = base_wait * 2**attempt
            print(f"  HTTP {err.code}, retry in {wait:.0f}s: {url}", file=sys.stderr)
        except Exception as err:  # noqa: BLE001 — network hiccups, truncated reads
            wait = base_wait * 2**attempt
            print(f"  {err!r}, retry in {wait:.0f}s", file=sys.stderr)
        time.sleep(min(wait, 300))
    raise RuntimeError(f"could not download {url}")


def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_manifest() -> dict:
    return json.load(open(MANIFEST, encoding="utf-8")) if os.path.exists(MANIFEST) else {}


def save_manifest(m: dict) -> None:
    os.makedirs(SOURCE, exist_ok=True)
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump(dict(sorted(m.items())), f, indent=1, ensure_ascii=False)


def download(url: str, rel: str, manifest: dict, pace: float = 0.0) -> bool:
    """Download `url` to `source/<rel>` unless it is there with the checksum
    the manifest recorded."""
    path = os.path.join(SOURCE, rel)
    if os.path.exists(path) and os.path.getsize(path) > 0:
        rec = manifest.get(rel)
        if rec is None:
            manifest[rel] = {"url": url, "bytes": os.path.getsize(path), "sha256": sha256(path)}
            return False
        if rec["sha256"] == sha256(path):
            return False
        print(f"  checksum mismatch, downloading again: {rel}", file=sys.stderr)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    data = get_retry(url)
    tmp = path + ".part"
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, path)
    manifest[rel] = {"url": url, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
    save_manifest(manifest)
    if pace:
        time.sleep(pace)
    return True


# --- sources ---------------------------------------------------------------------


def fetch_aozora(manifest: dict) -> None:
    for rel, path in AOZORA_FILES.items():
        if download(AOZORA + path, rel, manifest, pace=1.0):
            print("aozora", rel)


def iiif_image(pid: str, canvas: int, size: str = "full") -> str:
    return f"https://dl.ndl.go.jp/api/iiif/{pid}/R{canvas:07d}/full/{size}/0/default.jpg"


def fetch_ndl(manifest: dict) -> None:
    meta = {}
    for pid, canvases in NDL.items():
        if download(f"https://dl.ndl.go.jp/api/iiif/{pid}/manifest.json", f"ndl/{pid}/manifest.json", manifest, pace=1.0):
            print("ndl manifest", pid)
        for canvas, what in canvases.items():
            rel = f"ndl/{pid}/R{canvas:07d}.jpg"
            url = iiif_image(pid, canvas)
            if download(url, rel, manifest, pace=2.0):
                print("ndl", rel)
            meta[rel] = {
                "pid": f"info:ndljp/pid/{pid}",
                "page": f"https://dl.ndl.go.jp/pid/{pid}/1/{canvas}",
                "image": url,
                "title": NDL_TITLES[pid],
                "content": what,
                "licence": "Public Domain Mark (NDL: インターネット公開・保護期間満了)",
            }
    with open(os.path.join(SOURCE, "ndl", "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)


def fetch_fonts(manifest: dict) -> None:
    for rel in GOOGLE_FONTS:
        url = "https://raw.githubusercontent.com/google/fonts/main/ofl/" + urllib.parse.quote(rel)
        if download(url, "fonts/" + rel, manifest, pace=0.3):
            print("font", rel)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--no-images", action="store_true")
    ap.add_argument("--no-fonts", action="store_true")
    a = ap.parse_args()
    manifest = load_manifest()
    fetch_aozora(manifest)
    if not a.no_images:
        fetch_ndl(manifest)
    if not a.no_fonts:
        fetch_fonts(manifest)
    save_manifest(manifest)


if __name__ == "__main__":
    main()
