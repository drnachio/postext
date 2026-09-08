#!/usr/bin/env python3
"""Detect tables in a PDF page range and print each one as a Postext
`TableModel` JSON object:

    { "rows": [ [ { "content": "...", "isHeader": true }, ... ], ... ],
      "headerRowCount": 1 }

Paste the model into a `preset.json` resource of kind "table":
    { "id": "...", "typeId": "table", "kind": "table", "caption": "...",
      "table": { "model": <output> } }

Requires PyMuPDF >= 1.23 (`python3 -m pip install pymupdf`).
"""
from __future__ import annotations

import argparse
import json
import re
import sys


def parse_pages(spec: str | None, page_count: int) -> list[int]:
    if not spec:
        return list(range(page_count))
    pages: list[int] = []
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            start, end = part.split("-", 1)
            start_i = int(start) if start else 1
            end_i = int(end) if end else page_count
        else:
            start_i = end_i = int(part)
        for page_no in range(start_i, end_i + 1):
            if 1 <= page_no <= page_count and (page_no - 1) not in pages:
                pages.append(page_no - 1)
    return pages


def clean(text) -> str:
    if text is None:
        return ""
    return re.sub(r"\s+", " ", str(text).replace("\n", " ")).strip()


def table_model(table, header_rows: int) -> dict:
    grid = table.extract()
    rows = []
    for row_index, row in enumerate(grid):
        cells = []
        for value in row:
            cell: dict = {"content": clean(value)}
            if row_index < header_rows:
                cell["isHeader"] = True
            cells.append(cell)
        rows.append(cells)
    # drop fully empty trailing rows that some detectors produce
    while rows and all(not c["content"] for c in rows[-1]):
        rows.pop()
    return {"rows": rows, "headerRowCount": header_rows}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("pdf", help="reference PDF")
    parser.add_argument("--pages", metavar="SPEC", help="1-based page selection, e.g. 12 or 3-5 (default: all)")
    parser.add_argument("--header-rows", type=int, default=1, help="rows to mark as header (default: 1)")
    parser.add_argument(
        "--strategy", default="lines_strict", choices=["lines", "lines_strict", "text"],
        help="PyMuPDF find_tables strategy (default: lines_strict; use `text` for ruleless tables)",
    )
    parser.add_argument("--json-only", action="store_true", help="print one JSON array with all tables, nothing else")
    args = parser.parse_args(argv)

    try:
        import fitz  # PyMuPDF
    except ImportError:
        print("PyMuPDF is required:  python3 -m pip install pymupdf", file=sys.stderr)
        return 2

    doc = fitz.open(args.pdf)
    found: list[dict] = []
    try:
        for index in parse_pages(args.pages, doc.page_count):
            page = doc[index]
            if not hasattr(page, "find_tables"):
                print("this PyMuPDF build has no page.find_tables(); upgrade to >= 1.23", file=sys.stderr)
                return 2
            tables = page.find_tables(strategy=args.strategy)
            for table_index, table in enumerate(tables.tables):
                model = table_model(table, args.header_rows)
                if not model["rows"]:
                    continue
                found.append({
                    "page": index + 1,
                    "index": table_index,
                    "bbox": [round(v, 1) for v in table.bbox],
                    "model": model,
                })
    finally:
        doc.close()

    if args.json_only:
        print(json.dumps([f["model"] for f in found], indent=2, ensure_ascii=False))
        return 0
    if not found:
        print("no tables found (try --strategy text)", file=sys.stderr)
        return 1
    for entry in found:
        rows = entry["model"]["rows"]
        cols = max((len(r) for r in rows), default=0)
        print(f"# page {entry['page']} table {entry['index']}: {len(rows)} rows x {cols} cols, bbox(pt)={entry['bbox']}")
        print(json.dumps(entry["model"], indent=2, ensure_ascii=False))
        print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
