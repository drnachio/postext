"""Shared settings of the Pepper&Carrot comics pipeline: the episode, the
languages, where the downloads and the generated files live.

    PC_CACHE  downloads (default: ./source, git-ignored)
    PC_OUT    generated files (default: ./work, git-ignored)

Every script reads these two variables so a run can keep its files outside
the checkout (`PC_CACHE=/tmp/pc-cache PC_OUT=/tmp/pc-out python3 fetch.py`).
"""
from __future__ import annotations

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.abspath(os.environ.get("PC_CACHE") or os.path.join(HERE, "source"))
OUT = os.path.abspath(os.environ.get("PC_OUT") or os.path.join(HERE, "work"))

EPISODE = 8
EPISODE_DIR = "ep08_Pepper-s-Birthday-Party"
SOURCES = "https://www.peppercarrot.com/0_sources/"
EPISODE_URL = SOURCES + EPISODE_DIR + "/"
PREFIX = f"E{EPISODE:02d}"  # E08
GFX = f"gfx_Pepper-and-Carrot_by-David-Revoy_{PREFIX}"

# Comic pages of the episode. P00 is the title page (the episode title is
# lettered over a drawn header), P01–P06 the story, P07 the credits page.
PAGES = [f"P{n:02d}" for n in range(0, 8)]
STORY_PAGES = [f"P{n:02d}" for n in range(1, 7)]

# Pepper&Carrot language code -> postext locale. `cn` is Simplified Chinese.
LANGS = {"en": "en", "ja": "ja", "es": "es", "fr": "fr", "cn": "zh", "ca": "ca", "ar": "ar"}
RTL = {"ar"}

# The art is 2481x3503 (A4 at 300 dpi); the SVGs share that canvas.
PAGE_W, PAGE_H = 2481, 3503


def cache(*parts: str) -> str:
    return os.path.join(CACHE, *parts)


def out(*parts: str) -> str:
    return os.path.join(OUT, *parts)


def gfx_page(page: str) -> str:
    """The hi-res text-free JPG of `page` ('P03') or the cover ('')."""
    return cache("hi-res", "gfx-only", f"{GFX}{page}.jpg")


def svg_page(lang: str, page: str) -> str:
    return cache("lang", lang, f"{PREFIX}{page}.svg")


def load_json(path: str):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_json(path: str, data) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write("\n")


def panel_id(page: str, index: int) -> str:
    """`e08p03-2`: episode, page, 1-based panel index in reading order."""
    return f"e{EPISODE:02d}{page.lower()}-{index}"
