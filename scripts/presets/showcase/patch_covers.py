#!/usr/bin/env python3
"""Splice the painted covers and spines (covers.py, issue #472) into the
committed bundles of alf-layla, hongloumeng and kokoro without rebuilding
them: their sources (`source/`, `work/`) are not kept. Each book's build.py
is the single source of the designs: this calls its cover design, its
`cover_art_specs` and its spine function exactly as `build.py` does, and
writes their output into the bundle's preset.json and resources.

    python3 patch_covers.py [alf-layla hongloumeng kokoro]

A full `build.py` run gives the same bundle.
"""
from __future__ import annotations

import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import _common  # noqa: E402


def load_build(book: str):
    d = os.path.join(HERE, book)
    sys.path.insert(0, d)
    spec = importlib.util.spec_from_file_location(f"build_{book.replace('-', '_')}", os.path.join(d, "build.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    sys.path.remove(d)
    return mod


def set_style(cfg: dict, style_id: str, design: dict) -> None:
    for h in cfg["headingStyles"]:
        if h["id"] == style_id:
            h["advancedDesign"] = json.loads(json.dumps(design))
            return
    raise SystemExit(f"no heading style {style_id}")


def replace_specs(resources: list[dict], new: list[dict], drop: tuple[str, ...] = ()) -> list[dict]:
    ids = {r["id"] for r in new} | set(drop)
    kept = [r for r in resources if r["id"] not in ids]
    return kept + new


def remove_files(out: str, rels: list[str]) -> None:
    for rel in rels:
        path = os.path.join(out, rel)
        if os.path.exists(path):
            os.remove(path)


def patch_alf_layla(b, p: dict, out: str) -> None:
    set_style(p["config"], "cover", b.cover_design())
    shared: list[dict] = []
    b.add_spine(out, shared)
    p["resources"] = replace_specs(p["resources"], b.cover_art_specs(os.path.join(out, "resources")) + shared, drop=("cover-panel",))
    remove_files(out, ["resources/cover-panel.jpg"])


def patch_hongloumeng(b, p: dict, out: str) -> None:
    set_style(p["config"], "cover", b.v_cover("zh-Hant", b.ZhFaces("zh-Hant")))
    set_style(p["localized"]["zh-Hans"]["config"], "cover", b.zh_cover("zh-Hans", b.ZhFaces("zh-Hans"), "left"))
    shared: list[dict] = []
    wording: dict[str, list[dict]] = {lang: [] for lang in b.LANGS}
    b.add_spines(out, shared, wording)
    p["resources"] = replace_specs(p["resources"], b.cover_art_specs(os.path.join(out, "resources")) + shared)
    for lang in b.LANGS:
        loc = p["localized"][lang]
        loc["resources"] = [r for r in loc["resources"] if r["id"] != b.SPINE] + wording[lang]


def patch_kokoro(b, p: dict, out: str) -> None:
    # The design reads picture sizes from PICTURES (work/pictures.json in a
    # build): the bundle's specs carry the same widths and heights.
    for r in p["resources"]:
        b.PICTURES.setdefault(r["id"], {"width": r.get("width", 1), "height": r.get("height", 1), "caption": r.get("caption", ""), "file": r["file"]})
    set_style(p["config"], "cover", b.cover_design())
    set_style(p["config"], "colophon", b.colophon_design(*b.colophon_lines()))
    shared: list[dict] = []
    b.add_spine(out, shared)
    p["resources"] = replace_specs(p["resources"], b.cover_art_specs(os.path.join(out, "resources")) + shared, drop=(b.COVER_LABEL,))
    remove_files(out, [f"resources/{b.COVER_LABEL}.jpg"])
    # The credits page: the cover no longer carries the 1914 label.
    path = os.path.join(out, "chapters", "ja", "902-credits.md")
    md = open(path, encoding="utf-8").read()
    for old, new in b.CREDITS_CHANGES:
        md = md.replace(old, new)
    open(path, "w", encoding="utf-8").write(md)


PATCHES = {"alf-layla": patch_alf_layla, "hongloumeng": patch_hongloumeng, "kokoro": patch_kokoro}


def main() -> None:
    books = sys.argv[1:] or list(PATCHES)
    for book in books:
        b = load_build(book)
        out = b.OUT
        path = os.path.join(out, "preset.json")
        p = json.load(open(path, encoding="utf-8"))
        PATCHES[book](b, p, out)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(p, f, indent=1, ensure_ascii=False)
            f.write("\n")
        _common.write_fingerprint(out)
        print("patched", book)


if __name__ == "__main__":
    main()
