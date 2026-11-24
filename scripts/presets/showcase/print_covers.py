#!/usr/bin/env python3
"""The print covers of the showcase books (#1709): one print version per
book in `production`, chosen for what the book is, and its cover sheet in
the design of the book's own cover and back pages (`cover`), with the
back cover's text, the flaps and the spine in the cover Markdown
(`cover.md`, `cover/<lang>.md`) for every language of the book.

    python3 print_covers.py [book …]

splices them into the committed bundles under apps/web/public/presets/
(their sources are not all kept, so the bundles are patched in place, as
`patch_covers.py` does) and rewrites each bundle's fingerprint. Don
Quijote's cover is its build.py's own (#1671) and is not touched here.

The sheet is placed by zone (`front`, `spine`, `back`, the flaps, the
joints of a case), so it follows the spine as the page count changes.
The front's title stands in text boxes anchored to the front, set in the
book's display face as on its cover page; the spine is lettered from the
book's metadata unless the Markdown gives it a line of its own.
"""
from __future__ import annotations

import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import _common  # noqa: E402
from _common import mm, pt  # noqa: E402

from print_covers_books import BOOKS  # noqa: E402


def whole_override(base: dict, new: dict) -> dict:
    """A language's `cover` that replaces the shared one whole under the
    layered configuration (configVersion 21+), where lists of entries with
    an `id` (or `name`) merge entry by entry: the shared entries the
    language does not keep are removed, and the shared keys it leaves out
    are put back to their default."""
    out: dict = {}
    for key in set(base) | set(new):
        if key not in new:
            out[key] = None
            continue
        value = new[key]
        old = base.get(key)
        if isinstance(value, list) and isinstance(old, list):
            field = "name" if key == "textBoxes" else "id"
            keep = {e[field] for e in value}
            out[key] = [{field: e[field], "$remove": True} for e in old if e[field] not in keep] + value
        elif isinstance(value, dict) and isinstance(old, dict) and key in ("verticalAlign", "zones", "sheets"):
            out[key] = whole_override(old, value)
        else:
            out[key] = value
    return out


def set_styles(styles: list[dict], new: list[dict]) -> list[dict]:
    ids = {s["id"] for s in new}
    return [s for s in styles if s["id"] not in ids] + new


def write_text(path: str, text: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def apply(book_id: str) -> None:
    spec = BOOKS[book_id]()
    out = os.path.join(_common.PRESETS_ROOT, book_id)
    path = os.path.join(out, "preset.json")
    p = json.load(open(path, encoding="utf-8"))
    cfg = p["config"]
    langs: list[str] = p.get("locales") or [p.get("locale")]
    main = p.get("locale") or langs[0]
    layered = (p.get("configVersion") or 0) >= 21

    cfg["production"] = spec.production(main)
    cfg["cover"] = spec.cover(main)
    cfg["paragraphStyles"] = set_styles(cfg.get("paragraphStyles", []), spec.styles(main))
    if spec.folio:
        cfg["folio"] = {**cfg.get("folio", {}), **spec.folio(cfg.get("folio", {}))}

    # Pictures the cover adds to the book (painted spine cloth, a back-cover
    # picture), copied from the showcase scripts' committed art.
    for res in spec.resources:
        src = os.path.join(HERE, res["from"])
        dest = os.path.join(out, res["file"])
        shutil.copyfile(src, dest)
        entry = {k: v for k, v in res.items() if k != "from"}
        p["resources"] = [r for r in p["resources"] if r["id"] != res["id"]] + [entry]

    write_text(os.path.join(out, "cover.md"), spec.markdown(main))
    p["coverMarkdown"] = "cover.md"
    for lang in langs:
        if lang == main:
            continue
        loc = p.setdefault("localized", {}).setdefault(lang, {})
        lc = loc.setdefault("config", {})
        if not layered:
            raise SystemExit(f"{book_id}: a multilingual cover needs configVersion 21+")
        lc["production"] = spec.production(lang)
        own = spec.cover(lang)
        if own != cfg["cover"]:
            lc["cover"] = whole_override(cfg["cover"], own)
        else:
            lc.pop("cover", None)
        lang_styles = [s for s in spec.styles(lang) if s not in spec.styles(main)]
        if lang_styles:
            lc["paragraphStyles"] = set_styles(lc.get("paragraphStyles", []), lang_styles)
        rel = f"cover/{lang}.md"
        write_text(os.path.join(out, rel), spec.markdown(lang))
        loc["coverMarkdown"] = rel

    with open(path, "w", encoding="utf-8") as f:
        json.dump(p, f, indent=1, ensure_ascii=False)
        f.write("\n")
    _common.write_fingerprint(out)
    print("cover", book_id)


def main() -> None:
    for book in sys.argv[1:] or list(BOOKS):
        apply(book)


if __name__ == "__main__":
    main()
