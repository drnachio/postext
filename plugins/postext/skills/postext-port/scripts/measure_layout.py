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
        x1 = ends[int(len(ends) * 0.6)] if len(ends) > 1 else ends[0]
        columns.append((x0, x1))
    # merge clusters whose starts are too close to be separate columns (indents,
    # hanging lists); wide lines (boxes, titles) must not glue real columns together
    merged: list[tuple[float, float]] = []
    for col in columns:
        if merged and col[0] - merged[-1][0] < page_width * 0.12 and col[0] < merged[-1][1] - tolerance:
            merged[-1] = (merged[-1][0], max(merged[-1][1], col[1]))
        else:
            merged.append(col)
    return merged


def page_lines(page) -> list[tuple[float, float, float, float, float, float]]:
    """(x0, y0, x1, y1, size, baseline) of every text line, size = dominant span."""
    out = []
    for block in page.get_text("dict")["blocks"]:
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            spans = [s for s in line.get("spans", []) if s.get("text", "").strip()]
            if not spans:
                continue
            text = "".join(s["text"] for s in spans).strip()
            if len(text) < 4 and text.strip(".").isalnum():
                continue  # folios and stray labels would skew the margins
            main = max(spans, key=lambda s: len(s["text"].strip()))
            bx0, by0, bx1, by1 = line["bbox"]
            out.append((bx0, by0, bx1, by1, round(main["size"], 1), main["origin"][1]))
    return out


def measure_page(page, body_size: float | None = None) -> dict:
    """Geometry from the BODY lines only (the dominant size): titles, boxes,
    captions, running heads and folios would widen columns and margins."""
    rect = page.rect
    all_lines = page_lines(page)
    body = [l for l in all_lines if body_size is None or abs(l[4] - body_size) <= 0.3]
    if not body:
        return {"number": page.number + 1, "empty": True}
    lines = [(l[0], l[2]) for l in body]
    x0 = min(l[0] for l in body)
    y0 = min(l[1] for l in body)
    x1 = max(l[2] for l in body)
    y1 = max(l[3] for l in body)
    columns = cluster_columns(lines, rect.width)
    pitches = []
    for col in columns:
        ys = sorted(l[5] for l in body if col[0] - 5 <= l[0] <= col[1])
        pitches += [b - a for a, b in zip(ys, ys[1:]) if 0 < b - a < body[0][4] * 2.2]
    return {
        "pitchPt": statistics.median(pitches) if pitches else None,
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

    pitches = [p["pitchPt"] for p in measured if p.get("pitchPt")]
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
        "leadingPt": round(statistics.median(pitches), 2) if pitches else None,
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
        sizes: dict[float, int] = {}
        for i in indexes:
            for l in page_lines(doc[i]):
                sizes[l[4]] = sizes.get(l[4], 0) + 1
        body_size = max(sizes, key=sizes.get) if sizes else None
        measured = [measure_page(doc[i], body_size) for i in indexes]
    finally:
        doc.close()

    page_info = {
        "width": mm(first.width),
        "height": mm(first.height),
        "count": len(indexes),
    }
    result: dict = {"page": page_info, "bodySizePt": body_size, "layout": summarize(measured),
                    "note": "measured on body-size lines; the margins are the body text block. "
                            "leadingPt is the baseline grid (bodyText.lineHeight in pt)."}
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
