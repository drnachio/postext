#!/usr/bin/env python3
"""Split a TrueType/OpenType collection (.ttc/.otc) into single-face files.

Each face is written to `--out` as `<PostScriptName>.ttf`, or `.otf` when the
face carries a `CFF ` table. Requires fontTools (`python3 -m pip install fonttools`).
"""
from __future__ import annotations

import argparse
import os
import sys


def postscript_name(font) -> str:
    name_table = font["name"]
    for record in name_table.names:
        if record.nameID == 6:
            try:
                value = record.toUnicode().strip()
            except UnicodeDecodeError:
                continue
            if value:
                return value
    family = name_table.getDebugName(1) or "Font"
    style = name_table.getDebugName(2) or "Regular"
    return f"{family}-{style}".replace(" ", "")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("ttc", help="path to the .ttc/.otc collection")
    parser.add_argument("--out", required=True, help="output directory (created)")
    parser.add_argument(
        "--faces",
        metavar="NAME[,NAME...]",
        help="only extract faces whose PostScript name contains one of these (case-insensitive)",
    )
    parser.add_argument("--force", action="store_true", help="overwrite existing files")
    parser.add_argument("--list", action="store_true", help="list faces, write nothing")
    args = parser.parse_args(argv)

    try:
        from fontTools.ttLib import TTCollection
    except ImportError:
        print("fontTools is required:  python3 -m pip install fonttools", file=sys.stderr)
        return 2

    wanted = [f.strip().lower() for f in args.faces.split(",") if f.strip()] if args.faces else []

    collection = TTCollection(args.ttc)
    if not args.list:
        os.makedirs(args.out, exist_ok=True)

    written = 0
    for index, font in enumerate(collection.fonts):
        ps_name = postscript_name(font)
        ext = ".otf" if "CFF " in font else ".ttf"
        if wanted and not any(w in ps_name.lower() for w in wanted):
            print(f"[{index}] {ps_name}{ext}  (skipped by --faces)")
            continue
        if args.list:
            print(f"[{index}] {ps_name}{ext}")
            continue
        safe_name = "".join(c for c in ps_name if c.isalnum() or c in "-_.") or f"face{index}"
        dst = os.path.join(args.out, safe_name + ext)
        if os.path.exists(dst) and not args.force:
            print(f"[{index}] {ps_name}{ext}  -> exists, skipped (use --force)")
            continue
        font.save(dst)
        written += 1
        print(f"[{index}] {ps_name}{ext}  -> {dst}")

    if not args.list:
        print(f"{written} face(s) written to {os.path.abspath(args.out)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
