#!/usr/bin/env python3
"""Convert publisher source assets into sandbox-ready resource files.

- `.ai` / `.pdf`  -> SVG (first page, glyphs outlined as paths) via `pdftocairo -svg`,
                     falling back to PyMuPDF when pdftocairo is not installed.
- `.svg`, `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif` -> copied as-is.

Output file names are slugified: `Fig. 1-1.ai` -> `fig-1-1.svg`.
Nothing is written outside `--out`.
"""
from __future__ import annotations

import argparse
import fnmatch
import glob
import os
import re
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET

VECTOR_EXT = {".ai", ".pdf"}
COPY_EXT = {".svg", ".jpg", ".jpeg", ".png", ".webp", ".gif"}
SUPPORTED_EXT = VECTOR_EXT | COPY_EXT

# 1 unit of X == N pt
_PT_PER_UNIT = {
    "": 1.0,
    "pt": 1.0,
    "px": 0.75,
    "in": 72.0,
    "cm": 72.0 / 2.54,
    "mm": 72.0 / 25.4,
    "pc": 12.0,
}


def slugify(text: str) -> str:
    """Lowercase, non-alphanumerics -> '-', collapsed and trimmed."""
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug or "asset"


def expand_inputs(patterns: list[str]) -> list[str]:
    files: list[str] = []
    for pattern in patterns:
        matches = glob.glob(os.path.expanduser(pattern), recursive=True)
        if not matches and os.path.exists(pattern):
            matches = [pattern]
        for match in sorted(matches):
            if os.path.isdir(match):
                for name in sorted(os.listdir(match)):
                    path = os.path.join(match, name)
                    if os.path.isfile(path):
                        files.append(path)
            elif os.path.isfile(match):
                files.append(match)
    # de-duplicate, keep order
    seen: set[str] = set()
    unique: list[str] = []
    for path in files:
        abspath = os.path.abspath(path)
        if abspath not in seen:
            seen.add(abspath)
            unique.append(path)
    return unique


def _parse_length(value: str | None) -> float | None:
    if not value:
        return None
    match = re.fullmatch(r"\s*([0-9.+-eE]+)\s*([a-zA-Z%]*)\s*", value)
    if not match:
        return None
    try:
        number = float(match.group(1))
    except ValueError:
        return None
    unit = match.group(2).lower()
    if unit == "%":
        return None
    factor = _PT_PER_UNIT.get(unit)
    if factor is None:
        return None
    return number * factor


def svg_size_pt(path: str) -> tuple[float | None, float | None]:
    """Return (width, height) in pt from width/height attrs or viewBox."""
    try:
        for _event, element in ET.iterparse(path, events=("start",)):
            tag = element.tag.rsplit("}", 1)[-1]
            if tag != "svg":
                return (None, None)
            width = _parse_length(element.get("width"))
            height = _parse_length(element.get("height"))
            view_box = element.get("viewBox")
            if (width is None or height is None) and view_box:
                parts = re.split(r"[\s,]+", view_box.strip())
                if len(parts) == 4:
                    try:
                        vb_w, vb_h = float(parts[2]), float(parts[3])
                        if width is None and height is None:
                            width, height = vb_w, vb_h
                        elif width is None and vb_h:
                            width = height * vb_w / vb_h
                        elif height is None and vb_w:
                            height = width * vb_h / vb_w
                    except ValueError:
                        pass
            return (width, height)
    except ET.ParseError:
        pass
    return (None, None)


def convert_with_pdftocairo(src: str, dst: str) -> None:
    subprocess.run(
        ["pdftocairo", "-svg", "-f", "1", "-l", "1", src, dst],
        check=True,
        capture_output=True,
        text=True,
    )


def convert_with_pymupdf(src: str, dst: str) -> None:
    import fitz  # PyMuPDF

    doc = fitz.open(src)
    try:
        page = doc[0]
        svg = page.get_svg_image(text_as_path=True)
    finally:
        doc.close()
    with open(dst, "w", encoding="utf-8") as handle:
        handle.write(svg)


def convert_vector(src: str, dst: str) -> str:
    """Return the name of the converter used."""
    if shutil.which("pdftocairo"):
        convert_with_pdftocairo(src, dst)
        return "pdftocairo"
    try:
        convert_with_pymupdf(src, dst)
        return "pymupdf"
    except ImportError as exc:
        raise RuntimeError(
            "pdftocairo not found and PyMuPDF is not installed "
            "(brew install poppler  or  python3 -m pip install pymupdf)"
        ) from exc


def format_num(value: float | None) -> str:
    if value is None:
        return "-"
    return f"{value:.1f}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("inputs", nargs="+", help="files, directories or globs")
    parser.add_argument("--out", required=True, help="output directory (created)")
    parser.add_argument(
        "--only", metavar="GLOB", help="only process inputs whose basename matches GLOB"
    )
    parser.add_argument("--dry-run", action="store_true", help="print the plan, write nothing")
    parser.add_argument("--force", action="store_true", help="overwrite existing outputs")
    args = parser.parse_args(argv)

    inputs = expand_inputs(args.inputs)
    if args.only:
        inputs = [p for p in inputs if fnmatch.fnmatch(os.path.basename(p), args.only)]
    inputs = [p for p in inputs if os.path.splitext(p)[1].lower() in SUPPORTED_EXT]
    if not inputs:
        print("no supported inputs found", file=sys.stderr)
        return 1

    out_dir = os.path.abspath(args.out)
    if not args.dry_run:
        os.makedirs(out_dir, exist_ok=True)

    rows: list[tuple[str, str, str, str, str]] = []
    failures = 0
    used_names: dict[str, str] = {}
    for src in inputs:
        stem, ext = os.path.splitext(os.path.basename(src))
        ext = ext.lower()
        out_ext = ".svg" if ext in VECTOR_EXT else ext
        out_name = slugify(stem) + out_ext
        if out_name in used_names and used_names[out_name] != src:
            base = slugify(stem)
            index = 2
            while f"{base}-{index}{out_ext}" in used_names:
                index += 1
            out_name = f"{base}-{index}{out_ext}"
        used_names[out_name] = src
        dst = os.path.join(out_dir, out_name)

        status = "planned" if args.dry_run else ""
        if not args.dry_run:
            if os.path.exists(dst) and not args.force:
                status = "skipped (exists)"
            else:
                try:
                    if ext in VECTOR_EXT:
                        status = convert_vector(src, dst)
                    else:
                        shutil.copyfile(src, dst)
                        status = "copied"
                except (RuntimeError, subprocess.CalledProcessError, OSError) as exc:
                    failures += 1
                    detail = getattr(exc, "stderr", None) or str(exc)
                    status = f"FAILED: {detail.strip().splitlines()[-1] if detail.strip() else exc}"

        width = height = None
        if out_ext == ".svg" and os.path.exists(dst):
            width, height = svg_size_pt(dst)
        elif out_ext == ".svg" and ext == ".svg":
            width, height = svg_size_pt(src)
        rows.append((src, out_name, format_num(width), format_num(height), status))

    col_in = max(len("input"), *(len(r[0]) for r in rows))
    col_out = max(len("output"), *(len(r[1]) for r in rows))
    header = f"{'input':<{col_in}}  {'output':<{col_out}}  {'w(pt)':>8}  {'h(pt)':>8}  status"
    print(header)
    print("-" * len(header))
    for src, name, width, height, status in rows:
        print(f"{src:<{col_in}}  {name:<{col_out}}  {width:>8}  {height:>8}  {status}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
