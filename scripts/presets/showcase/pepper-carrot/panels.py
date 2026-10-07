#!/usr/bin/env python3
"""Find the panels of every story page on the text-free art and write them
out for the comics port:

- `$PC_OUT/panels.json`: per page the panel boxes (page px of the
  2481x3503 art, reading order), the split tree and its postext `split=`
  expression (D1.2), the measured gutters, rounded corners and bleed;
- `$PC_OUT/panels/<id>.jpg`: each panel's art cut out (1200 px long side,
  quality 82), ids `e08p03-2` (page 3, panel 2).

Detection is a recursive XY cut on the white (#FFFFFF) paper: a run of
rows (or columns) where almost no pixel differs from white is a gutter;
the region is split at every such run and each part is cut again on the
other axis. A part that touches the page edge is a bleed panel. When no
straight gutter splits a region a slanted one is looked for (a band from
`a` at one end to `b` at the other), which the split expression writes as
`a~b`. Soft edges that fade into the paper (P03 and P06 open on a sky that
dissolves into white) are snapped to the frame when they come within a
few millimetres of it.

    python3 panels.py [--pages P01,P02]
"""
from __future__ import annotations

import argparse
import os
import statistics

import numpy as np
from PIL import Image

from common import PAGE_H, PAGE_W, STORY_PAGES, gfx_page, out, panel_id, save_json

SCALE = 4             # detection runs on the art downscaled 4x
INK = 8               # a pixel is ink when 255 - min(R,G,B) exceeds this
GUTTER_FRAC = 0.004   # a row/column is paper when at most this share is ink
MIN_GUTTER = 24       # page px: thinner white runs are part of the art
MIN_PANEL = 120       # page px: smaller parts are noise (dust, a stray mark)
SNAP = 60             # page px: a soft edge this close to the frame snaps to it
CUT_LONG_SIDE = 1200
CUT_QUALITY = 82
CUT_INSET = 3         # page px trimmed off each side (antialiased border)
MM_PER_PX = 25.4 / 300


def ink_mask(path: str) -> np.ndarray:
    im = Image.open(path).convert("RGB")
    im = im.resize((im.width // SCALE, im.height // SCALE), Image.BILINEAR)
    a = np.asarray(im).astype(np.int16)
    return (255 - a.min(axis=2)) > INK


def runs(flags: np.ndarray) -> list[tuple[int, int]]:
    """[start, end) runs of True in a 1-D bool array."""
    out_, start = [], None
    for i, f in enumerate(flags):
        if f and start is None:
            start = i
        elif not f and start is not None:
            out_.append((start, i))
            start = None
    if start is not None:
        out_.append((start, len(flags)))
    return out_


def trim(mask: np.ndarray, box):
    """Shrink `box` (x0, y0, x1, y1, mask px) to the ink it holds."""
    x0, y0, x1, y1 = box
    sub = mask[y0:y1, x0:x1]
    rows = np.where(sub.mean(axis=1) > GUTTER_FRAC)[0]
    cols = np.where(sub.mean(axis=0) > GUTTER_FRAC)[0]
    if len(rows) == 0 or len(cols) == 0:
        return None
    return (x0 + cols[0], y0 + rows[0], x0 + cols[-1] + 1, y0 + rows[-1] + 1)


def cut(mask: np.ndarray, box, axis: str):
    """Split `box` at the white runs along `axis` ('rows': horizontal
    gutters). Returns the parts and the gutters between them."""
    x0, y0, x1, y1 = box
    sub = mask[y0:y1, x0:x1]
    prof = sub.mean(axis=1) if axis == "rows" else sub.mean(axis=0)
    white = prof <= GUTTER_FRAC
    gaps = [r for r in runs(white) if r[1] - r[0] >= MIN_GUTTER / SCALE and r[0] > 0 and r[1] < len(white)]
    if not gaps:
        return [box], []
    parts, gutters, prev = [], [], 0
    for g0, g1 in gaps:
        parts.append((prev, g0))
        gutters.append((g0, g1))
        prev = g1
    parts.append((prev, len(white)))
    boxes = []
    for p0, p1 in parts:
        b = (x0, y0 + p0, x1, y0 + p1) if axis == "rows" else (x0 + p0, y0, x0 + p1, y1)
        t = trim(mask, b)
        if t and (t[2] - t[0]) * SCALE >= MIN_PANEL and (t[3] - t[1]) * SCALE >= MIN_PANEL:
            boxes.append(t)
    off = y0 if axis == "rows" else x0
    return boxes, [(off + a, off + b) for a, b in gutters]


def slanted_cut(mask: np.ndarray, box, axis: str):
    """Look for one slanted gutter across `box`: a band joining position
    `a` on the start edge to `b` on the far edge that is (almost) all paper.
    `axis='columns'`: a near-vertical line from (a, top) to (b, bottom)."""
    x0, y0, x1, y1 = box
    sub = mask[y0:y1, x0:x1]
    h, w = sub.shape
    along, across = (h, w) if axis == "columns" else (w, h)
    half = max(2, int(MIN_GUTTER / SCALE / 2))
    best = None
    step = max(1, across // 120)
    t = np.arange(along)
    for a in range(int(across * 0.1), int(across * 0.9), step):
        for b in range(max(int(across * 0.1), a - across // 4), min(int(across * 0.9), a + across // 4), step):
            if a == b:
                continue
            centre = a + (b - a) * t / max(1, along - 1)
            ok = True
            for d in range(-half, half + 1):
                idx = np.clip(np.round(centre + d).astype(int), 0, across - 1)
                vals = sub[t, idx] if axis == "columns" else sub[idx, t]
                if vals.mean() > GUTTER_FRAC * 3:
                    ok = False
                    break
            if ok:
                best = (a, b)
                break
        if best:
            break
    return best


def detect(mask: np.ndarray):
    """Recursive XY cut from the whole page. Returns the split tree:
    {'box', 'axis', 'children', 'gutters', 'slant'} or a leaf {'box'}."""
    h, w = mask.shape
    root = trim(mask, (0, 0, w, h))

    def rec(box, axis, depth=0):
        boxes, gutters = cut(mask, box, axis)
        if len(boxes) > 1:
            other = "columns" if axis == "rows" else "rows"
            return {"box": box, "axis": axis, "gutters": gutters, "children": [rec(b, other, depth + 1) for b in boxes]}
        other = "columns" if axis == "rows" else "rows"
        boxes, gutters = cut(mask, box, other)
        if len(boxes) > 1:
            return {"box": box, "axis": other, "gutters": gutters, "children": [rec(b, axis, depth + 1) for b in boxes]}
        if depth < 4:
            for ax in ("columns", "rows"):
                s = slanted_cut(mask, box, ax)
                if s:
                    return slanted_node(mask, box, ax, s, rec, depth)
        return {"box": box}

    return rec(root, "rows")


def slanted_node(mask, box, axis, ab, rec, depth):
    x0, y0, x1, y1 = box
    a, b = ab
    # Split the box into the two sides of the slanted line, by bounding boxes.
    if axis == "columns":
        left = trim(mask, (x0, y0, x0 + max(a, b), y1))
        right = trim(mask, (x0 + min(a, b), y0, x1, y1))
        kids = [left, right]
    else:
        top = trim(mask, (x0, y0, x1, y0 + max(a, b)))
        bot = trim(mask, (x0, y0 + min(a, b), x1, y1))
        kids = [top, bot]
    off = x0 if axis == "columns" else y0  # the line in absolute mask px
    return {"box": box, "axis": axis, "slant": [(off + a, off + b)], "gutters": [], "children": [{"box": k} for k in kids if k]}


# --- geometry in page px ----------------------------------------------------------


def to_page(b):
    return [int(b[0]) * SCALE, int(b[1]) * SCALE, min(PAGE_W, int(b[2]) * SCALE), min(PAGE_H, int(b[3]) * SCALE)]


def leaves(node, path=()):
    if "children" not in node:
        yield path, node
        return
    for i, ch in enumerate(node["children"]):
        yield from leaves(ch, path + (i,))


def snap_soft_edges(panels: list[dict], frame: list[int]) -> None:
    """Panels whose art fades into the paper end a little short of the frame;
    pull such an edge out to the frame when it is within SNAP px."""
    for p in panels:
        b = p["box"]
        for side, idx, target in (("top", 1, frame[1]), ("left", 0, frame[0]), ("right", 2, frame[2]), ("bottom", 3, frame[3])):
            if b[idx] != target and abs(b[idx] - target) <= SNAP:
                p.setdefault("snapped", []).append(side)
                b[idx] = target


def nominal_frame(panels: list[dict]) -> list[int]:
    """The page frame: the most common outer edges of the panels (an edge
    that fades into the paper does not move it)."""
    def mode(vals):
        vals = sorted(vals)
        best = max(vals, key=lambda v: sum(1 for u in vals if abs(u - v) <= 8))
        return int(round(statistics.median([u for u in vals if abs(u - best) <= 8])))
    return [mode([p["box"][0] for p in panels]), min(p["box"][1] for p in panels), mode([p["box"][2] for p in panels]), max(p["box"][3] for p in panels)]


FRAME_STD = None  # filled in main(): the frame shared by every page


def rounded_radius(page_rgb: np.ndarray, box) -> int:
    """Estimate the corner radius (page px) from how far the paper reaches
    along the panel's diagonal at its top-left and bottom-right corners."""
    x0, y0, x1, y1 = box
    rs = []
    for cx, cy, dx, dy in ((x0, y0, 1, 1), (x1 - 1, y0, -1, 1), (x0, y1 - 1, 1, -1), (x1 - 1, y1 - 1, -1, -1)):
        k = 0
        while k < 120:
            px = page_rgb[cy + dy * k, cx + dx * k]
            if 255 - int(px.min()) > 40:
                break
            k += 1
        rs.append(k)
    k = statistics.median(rs)
    # The diagonal of a quarter circle of radius r leaves the paper at r(1 - 1/sqrt2).
    return int(round(k / (1 - 1 / 2**0.5))) if k >= 3 else 0


# --- split expression ------------------------------------------------------------------


def fmt(v: float) -> str:
    s = f"{v:.1f}".rstrip("0").rstrip(".")
    return s or "0"


def split_expr(node, frame) -> str:
    """The D1.2 expression of the tree. Sizes are percentages of the parent
    cell along the list's axis; a split line sits at the middle of its
    gutter; the last child is `*`. A leaf is the empty size."""

    def extent(n, axis):
        b = n["cell"]
        return (b[1], b[3]) if axis == "rows" else (b[0], b[2])

    def rec(n) -> str:
        if "children" not in n:
            return ""
        axis = n["axis"]
        sep = " / " if axis == "rows" else " | "
        lo, hi = extent(n, axis)
        span = hi - lo
        items = []
        for i, ch in enumerate(n["children"]):
            c0, c1 = extent(ch, axis)
            if i == len(n["children"]) - 1:
                size = "*"
            elif n.get("slant"):
                a, b = n["slant"][i]
                size = f"{fmt(100 * (a - lo) / span)}~{fmt(100 * (b - lo) / span)}"
            else:
                size = fmt(100 * (c1 - c0) / span)
            inner = rec(ch)
            items.append(f"{size} [{inner}]" if inner else size)
        return sep.join(items)

    return rec(node) or "*"


def assign_cells(node, cell) -> None:
    """Give every node its cell: the parent cell divided at the middle of
    each gutter (so cells tile the frame, as the engine's split lines do)."""
    node["cell"] = list(cell)
    if "children" not in node:
        return
    axis = node["axis"]
    kids = node["children"]
    i0, i1 = (1, 3) if axis == "rows" else (0, 2)
    lines = []
    for a, b in zip(kids, kids[1:]):
        lines.append((a["box"][i1] + b["box"][i0]) / 2)
    edges = [cell[i0]] + lines + [cell[i1]]
    for k, ch in enumerate(kids):
        c = list(cell)
        c[i0], c[i1] = edges[k], edges[k + 1]
        assign_cells(ch, c)


def page_tree(page: str):
    mask = ink_mask(gfx_page(page))
    tree = detect(mask)

    def conv(n):
        m = {"box": to_page(n["box"])}
        if "children" in n:
            m["axis"] = n["axis"]
            m["children"] = [conv(c) for c in n["children"]]
            m["gutters"] = [[int(g[0]) * SCALE, int(g[1]) * SCALE] for g in n.get("gutters", [])]
            if n.get("slant"):
                m["slant"] = [[int(v) * SCALE for v in ab] for ab in n["slant"]]
        return m

    return conv(tree)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pages", default=",".join(STORY_PAGES))
    args = ap.parse_args()
    pages = args.pages.split(",")

    trees = {p: page_tree(p) for p in pages}
    all_leaves = [leaf for t in trees.values() for _, leaf in leaves(t)]
    frame = nominal_frame(all_leaves)
    print("frame", frame)

    result = {"frame": frame, "pageSize": [PAGE_W, PAGE_H], "pages": {}}
    row_gutters, col_gutters = [], []
    os.makedirs(out("panels"), exist_ok=True)
    for page, tree in trees.items():
        rgb = np.asarray(Image.open(gfx_page(page)).convert("RGB"))
        lv = list(leaves(tree))
        panels = [leaf for _, leaf in lv]
        snap_soft_edges(panels, frame)
        # Outer nodes take the snapped boxes of their leaves.
        def refit(n):
            if "children" in n:
                for c in n["children"]:
                    refit(c)
                bs = [c["box"] for c in n["children"]]
                n["box"] = [min(b[0] for b in bs), min(b[1] for b in bs), max(b[2] for b in bs), max(b[3] for b in bs)]
        refit(tree)
        assign_cells(tree, frame)
        expr = split_expr(tree, frame)

        def collect_gutters(n):
            if "children" not in n:
                return
            kids = n["children"]
            for a, b in zip(kids, kids[1:]):
                if n["axis"] == "rows":
                    row_gutters.append(b["box"][1] - a["box"][3])
                else:
                    col_gutters.append(b["box"][0] - a["box"][2])
            for c in kids:
                collect_gutters(c)
        collect_gutters(tree)

        out_panels = []
        for k, (path, leaf) in enumerate(lv, start=1):
            b = leaf["box"]
            bleed = [s for s, cond in (("top", b[1] <= 2), ("left", b[0] <= 2), ("right", b[2] >= PAGE_W - 2), ("bottom", b[3] >= PAGE_H - 2)) if cond]
            # Square panels read 10-15 px (the antialiased corner); a faded
            # edge reads as a huge radius: neither is a rounded panel.
            radius = 0 if leaf.get("snapped") else rounded_radius(rgb, b)
            radius = radius if radius >= 30 else 0
            pid = panel_id(page, k)
            ci = [b[0] + CUT_INSET, b[1] + CUT_INSET, b[2] - CUT_INSET, b[3] - CUT_INSET]
            im = Image.fromarray(rgb[ci[1]:ci[3], ci[0]:ci[2]])
            s = CUT_LONG_SIDE / max(im.size)
            im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
            fn = f"{pid}.jpg"
            im.save(out("panels", fn), quality=CUT_QUALITY, optimize=True, progressive=True)
            out_panels.append({
                "id": pid, "page": page, "index": k, "path": list(path),
                "box": b, "cell": [round(v, 1) for v in leaf["cell"]], "cut": ci,
                "file": f"panels/{fn}", "width": im.width, "height": im.height,
                "radius": radius, "bleed": bleed, "snapped": leaf.get("snapped", []),
            })
        result["pages"][page] = {"split": expr, "tree": strip_tree(tree), "panels": out_panels}
        print(page, f'split="{expr}"', [p["box"] for p in out_panels], "radius", [p["radius"] for p in out_panels])

    rg = statistics.median(row_gutters) if row_gutters else 0
    cg = statistics.median(col_gutters) if col_gutters else 0
    result["gutters"] = {
        "rowsPx": rg, "columnsPx": cg,
        "rowsMm": round(rg * MM_PER_PX, 2), "columnsMm": round(cg * MM_PER_PX, 2),
    }
    result["frameMm"] = {
        "top": round(frame[1] * MM_PER_PX, 2), "left": round(frame[0] * MM_PER_PX, 2),
        "right": round((PAGE_W - frame[2]) * MM_PER_PX, 2), "bottom": round((PAGE_H - frame[3]) * MM_PER_PX, 2),
    }
    print("gutters", result["gutters"], "frame mm", result["frameMm"])
    save_json(out("panels.json"), result)


def strip_tree(n):
    m = {k: v for k, v in n.items() if k in ("box", "cell", "axis", "gutters", "slant")}
    if "children" in n:
        m["children"] = [strip_tree(c) for c in n["children"]]
    return m


if __name__ == "__main__":
    main()
