#!/usr/bin/env python3
"""Measure the page geometry of a reference PDF (page size, text area,
columns, margins) and print a JSON snippet with millimetre values that can be
transcribed into a Postext config.

Requires PyMuPDF (`python3 -m pip install pymupdf`).
"""
from __future__ import annotations

import argparse
import json
import statistics
import sys

PT_TO_MM = 25.4 / 72.0


def parse_pages(spec: str | None, page_count: int) -> list[int]:
    """'3-5,8' -> [2,3,4,7] (zero-based). Default: every page."""
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


def mm(value: float) -> float:
    return round(value * PT_TO_MM, 2)


def cluster_columns(lines: list[tuple[float, float]], page_width: float, min_lines: int = 5) -> list[tuple[float, float]]:
    """Cluster text-line x-starts into columns; return [(x0, x1)] in pt.

    `lines` is a list of (x0, x1) per text line. Two starts belong to the
    same column when they are closer than 4% of the page width.
    """
    if not lines:
        return []
    tolerance = page_width * 0.04
    starts = sorted(lines, key=lambda l: l[0])
    clusters: list[list[tuple[float, float]]] = []
    for line in starts:
        if clusters and line[0] - clusters[-1][0][0] <= tolerance:
            clusters[-1].append(line)
        else:
            clusters.append([line])
    columns: list[tuple[float, float]] = []
    for cluster in clusters:
        if len(cluster) < min_lines:
            continue
        x0 = statistics.median(l[0] for l in cluster)
        # right edge: the typical justified line end (upper quartile is robust to short last lines)
        ends = sorted(l[1] for l in cluster)
        x1 = ends[int(len(ends) * 0.9)] if len(ends) > 1 else ends[0]
        columns.append((x0, x1))
    # merge columns that overlap (e.g. indented paragraphs inside the same column)
    merged: list[tuple[float, float]] = []
    for col in columns:
        if merged and col[0] < merged[-1][1] - tolerance:
            merged[-1] = (merged[-1][0], max(merged[-1][1], col[1]))
        else:
            merged.append(col)
    return merged


def measure_page(page) -> dict:
    rect = page.rect
    blocks = page.get_text("dict")["blocks"]
    lines: list[tuple[float, float]] = []
    x0 = y0 = float("inf")
    x1 = y1 = float("-inf")
    for block in blocks:
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            text = "".join(span.get("text", "") for span in line.get("spans", [])).strip()
            if not text:
                continue
            bx0, by0, bx1, by1 = line["bbox"]
            lines.append((bx0, bx1))
            x0, y0, x1, y1 = min(x0, bx0), min(y0, by0), max(x1, bx1), max(y1, by1)
    if not lines:
        return {"number": page.number + 1, "empty": True}
    columns = cluster_columns(lines, rect.width)
    return {
        "number": page.number + 1,
        "empty": False,
        "lineCount": len(lines),
        "textBboxPt": (x0, y0, x1, y1),
        "columnsPt": columns,
        "pageWidthPt": rect.width,
        "pageHeightPt": rect.height,
    }


def summarize(pages: list[dict]) -> dict:
    measured = [p for p in pages if not p.get("empty")]
    if not measured:
        return {}

    def side(parity: str) -> list[dict]:
        return [p for p in measured if (p["number"] % 2 == 1) == (parity == "odd")]

    def margins(group: list[dict]) -> dict | None:
        if not group:
            return None
        top = statistics.median(p["textBboxPt"][1] for p in group)
        bottom = statistics.median(p["pageHeightPt"] - p["textBboxPt"][3] for p in group)
        left = statistics.median(p["textBboxPt"][0] for p in group)
        right = statistics.median(p["pageWidthPt"] - p["textBboxPt"][2] for p in group)
        return {"top": mm(top), "bottom": mm(bottom), "left": mm(left), "right": mm(right)}

    column_counts = [len(p["columnsPt"]) for p in measured if p["columnsPt"]]
    column_count = statistics.mode(column_counts) if column_counts else 1
    widths: list[float] = []
    gutters: list[float] = []
    for p in measured:
        cols = p["columnsPt"]
        if len(cols) != column_count:
            continue
        widths.extend(c[1] - c[0] for c in cols)
        gutters.extend(cols[i + 1][0] - cols[i][1] for i in range(len(cols) - 1))
    layout: dict = {
        "columns": column_count,
        "columnWidth": mm(statistics.median(widths)) if widths else None,
        "gutter": mm(statistics.median(gutters)) if gutters else 0,
        "margins": {"odd": margins(side("odd")), "even": margins(side("even"))},
    }
    return layout


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("pdf", help="reference PDF")
    parser.add_argument("--pages", metavar="SPEC", help="1-based page selection, e.g. 3-5 or 2,4,6-8 (default: all)")
    parser.add_argument("--per-page", action="store_true", help="include per-page measurements")
    args = parser.parse_args(argv)

    try:
        import fitz  # PyMuPDF
    except ImportError:
        print("PyMuPDF is required:  python3 -m pip install pymupdf", file=sys.stderr)
        return 2

    doc = fitz.open(args.pdf)
    try:
        indexes = parse_pages(args.pages, doc.page_count)
        if not indexes:
            print("no pages selected", file=sys.stderr)
            return 1
        first = doc[indexes[0]].rect
        measured = [measure_page(doc[i]) for i in indexes]
    finally:
        doc.close()

    page_info = {
        "width": mm(first.width),
        "height": mm(first.height),
        "count": len(indexes),
    }
    result: dict = {"page": page_info, "layout": summarize(measured)}
    if args.per_page:
        result["pages"] = [
            {
                "number": p["number"],
                **({"empty": True} if p.get("empty") else {
                    "textBbox": {
                        "left": mm(p["textBboxPt"][0]),
                        "top": mm(p["textBboxPt"][1]),
                        "right": mm(p["textBboxPt"][2]),
                        "bottom": mm(p["textBboxPt"][3]),
                    },
                    "columns": [{"x0": mm(c[0]), "x1": mm(c[1]), "width": mm(c[1] - c[0])} for c in p["columnsPt"]],
                    "lineCount": p["lineCount"],
                }),
            }
            for p in measured
        ]
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
