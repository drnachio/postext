#!/usr/bin/env python3
"""Download the sources of the Pepper&Carrot comics port (episode 8,
"Pepper's Birthday Party", David Revoy, CC BY 4.0) into `$PC_CACHE`
(default `source/`, git-ignored):

- the episode `info.json`, `README.md` and `hi-res/titles.json`;
- the text-free art: `hi-res/gfx-only/gfx_…E08Pnn.jpg` for the cover and
  every page (2481x3503), and with `--lossless` the PNG masters;
- per language (en, ja, es, fr, cn, ca, ar, pt): the Inkscape SVGs
  `lang/<xx>/E08Pnn.svg` (layers `speechbubbles` and `txt`), `info.json`
  (translator credits), the transcript `ep08_<xx>_transcript.md` when the
  translator wrote one, the accessibility transcript
  `hi-res/html/<xx>_E08Pnn.html` and the lettered low-res page JPGs (a
  visual reference for checking the port);
- the global `langs.json` (language names).

    python3 fetch.py [--lossless] [--no-lettered]

Files already there with the checksum `$PC_CACHE/manifest.json` recorded
are skipped, so the script can be re-run.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request

from common import CACHE, EPISODE_URL, GFX, LANGS, PAGES, PREFIX, SOURCES

UA = {"User-Agent": "postext-presets/1.0 (https://github.com/drnachio/postext)"}
MANIFEST = os.path.join(CACHE, "manifest.json")


def get(url: str, timeout: int = 300) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def get_retry(url: str, attempts: int = 5, base_wait: float = 5) -> bytes:
    """Retry with a growing back-off; a 404 is final."""
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
        time.sleep(min(wait, 120))
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
    os.makedirs(CACHE, exist_ok=True)
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump(dict(sorted(m.items())), f, indent=1, ensure_ascii=False)


def download(url: str, rel: str, manifest: dict, optional: bool = False) -> bool:
    """Download `url` to `$PC_CACHE/<rel>` unless it is there with the
    recorded checksum. `optional`: a 404 is reported and skipped."""
    path = os.path.join(CACHE, rel)
    if os.path.exists(path) and os.path.getsize(path) > 0:
        rec = manifest.get(rel)
        if rec is None:
            manifest[rel] = {"url": url, "bytes": os.path.getsize(path), "sha256": sha256(path)}
            return False
        if rec["sha256"] == sha256(path):
            return False
        print(f"  checksum mismatch, downloading again: {rel}", file=sys.stderr)
    try:
        data = get_retry(url)
    except urllib.error.HTTPError as err:
        if optional and err.code == 404:
            print(f"  (none) {rel}")
            return False
        raise
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".part"
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, path)
    manifest[rel] = {"url": url, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
    save_manifest(manifest)
    print("  got", rel, f"{len(data) // 1024} KB")
    return True


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--lossless", action="store_true", help="also fetch the PNG masters (~10 MB a page)")
    ap.add_argument("--no-lettered", action="store_true", help="skip the lettered low-res reference JPGs")
    args = ap.parse_args()

    manifest = load_manifest()
    download(SOURCES + "langs.json", "langs.json", manifest)
    for rel in ("info.json", "README.md", "hi-res/titles.json"):
        download(EPISODE_URL + rel, rel, manifest)

    for page in [""] + PAGES:
        rel = f"hi-res/gfx-only/{GFX}{page}.jpg"
        download(EPISODE_URL + rel, rel, manifest)
        if args.lossless:
            rel = f"hi-res/gfx-only/lossless/{GFX}{page}.png"
            download(EPISODE_URL + rel, rel, manifest, optional=True)

    for lang in LANGS:
        download(EPISODE_URL + f"lang/{lang}/info.json", f"lang/{lang}/info.json", manifest)
        rel = f"lang/{lang}/ep08_{lang}_transcript.md"
        download(EPISODE_URL + rel, rel, manifest, optional=True)
        for page in PAGES:
            rel = f"lang/{lang}/{PREFIX}{page}.svg"
            download(EPISODE_URL + rel, rel, manifest)
            rel = f"hi-res/html/{lang}_{PREFIX}{page}.html"
            download(EPISODE_URL + rel, rel, manifest, optional=True)
            if not args.no_lettered:
                rel = f"low-res/{lang}_Pepper-and-Carrot_by-David-Revoy_{PREFIX}{page}.jpg"
                download(EPISODE_URL + rel, rel, manifest, optional=True)
    save_manifest(manifest)
    print("done:", CACHE)


if __name__ == "__main__":
    main()
