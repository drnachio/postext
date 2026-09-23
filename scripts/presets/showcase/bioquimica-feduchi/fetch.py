#!/usr/bin/env python3
"""Locate the sources of the `bioquimica-feduchi` showcase bundle.

Unlike the other showcases, this one downloads nothing: its chapter, its
artwork and its typefaces come from material Editorial Médica Panamericana
supplied for the private EMP preset, which is kept outside this repository.
This script only says whether the two things `build.py` needs are where it
expects them, so a failed build reports the cause instead of a traceback:

  * the private preset bundle `emp/21x28-4c-colymedia` (its `preset.json`
    holds the configuration, the chapter and the font files; its `source/`
    holds the PDF → SVG converter and the figure regions), under the presets
    root named by `POSTEXT_PRIVATE_PRESETS_DIR`;
  * the book PDF the artwork is cut from, named by `POSTEXT_BIOQUIMICA_PDF`
    or taken from the private builder's own path.

    python3 scripts/presets/showcase/bioquimica-feduchi/fetch.py
"""
from __future__ import annotations

import os
import re
import sys

DEFAULT_PRESETS_ROOT = os.path.expanduser("~/dev/postext-private/presets")
PRIVATE_FORMAT = os.path.join("emp", "21x28-4c-colymedia")


def private_dir() -> str:
    """The private bundle directory (not checked for existence)."""
    root = os.environ.get("POSTEXT_PRIVATE_PRESETS_DIR") or DEFAULT_PRESETS_ROOT
    return os.path.join(os.path.expanduser(root), PRIVATE_FORMAT)


def book_pdf() -> str | None:
    """The book PDF: the environment's, else the path the private figure
    builder uses."""
    env = os.environ.get("POSTEXT_BIOQUIMICA_PDF")
    if env:
        return os.path.expanduser(env)
    builder = os.path.join(private_dir(), "source", "build_figures.py")
    if not os.path.exists(builder):
        return None
    m = re.search(r'^PDF\s*=\s*"([^"]+)"', open(builder, encoding="utf-8").read(), re.M)
    return m.group(1) if m else None


def check() -> list[str]:
    """Everything missing, as messages."""
    missing: list[str] = []
    private = private_dir()
    for rel in ("preset.json", os.path.join("source", "pdfsvg.py"), os.path.join("source", "regions.json"),
                os.path.join("source", "build_figures.py"), os.path.join("chapters")):
        path = os.path.join(private, rel)
        if not os.path.exists(path):
            missing.append(f"missing {path}")
    pdf = book_pdf()
    if not pdf:
        missing.append("no book PDF: set POSTEXT_BIOQUIMICA_PDF")
    elif not os.path.exists(pdf):
        missing.append(f"missing {pdf} (set POSTEXT_BIOQUIMICA_PDF)")
    return missing


def main() -> None:
    missing = check()
    print(f"private bundle: {private_dir()}")
    print(f"book PDF:       {book_pdf() or '—'}")
    for m in missing:
        print(f"  ! {m}", file=sys.stderr)
    if missing:
        raise SystemExit(
            "\nThe sources of this bundle are not public. Point "
            "POSTEXT_PRIVATE_PRESETS_DIR at the private presets root and "
            "POSTEXT_BIOQUIMICA_PDF at the book PDF, then run build.py."
        )
    print("\nready: python3 scripts/presets/showcase/bioquimica-feduchi/build.py")


if __name__ == "__main__":
    main()
