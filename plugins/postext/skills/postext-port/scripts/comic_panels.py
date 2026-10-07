#!/usr/bin/env python3
"""Measure comic pages for a Postext port: panels, split expression, gutters,
cut panel pictures, and overlays to read anchors and safe areas by eye.

    comic_panels.py detect PAGE.jpg [PAGE2.jpg …] --out work/panels
        [--direction ltr|rtl] [--page-mm 210x297 | --dpi 300] [--prefix p]
        [--tolerance 0.004] [--paper auto|#ffffff] [--frame x0,y0,x1,y1]
        [--long-side 1600] [--quality 85] [--no-cuts]
    comic_panels.py grid PICTURE… --out work/grid          # labelled 10 % grid
    comic_panels.py check preset.json|manifest.json --out work/check [--root DIR]
    comic_panels.py contact IMAGE… --out sheet.jpg [--height 420]

`detect` reads each page image (scan, export, gfx-only art) and finds its
panels by a recursive XY cut on the paper colour: a run of rows (or
columns) where almost no pixel differs from the paper is a gutter; each
part is cut again on the other axis. When no straight gutter splits a part,
a slanted one is searched (written `a~b` in the split). It writes:

- `<out>/panels.json`: per page the split expression (`:::page{split=…}`),
  the panel boxes in page px in reading order, their cells, bleed sides and
  corner radius, the measured gutters and the frame (px, and mm when the
  page size is known);
- `<out>/<prefix><NN>-<k>.jpg`: each panel cut out (a few px inside its
  border), ready to be a bitmap resource (`art=<prefix><NN>-<k>`);
- `<out>/<prefix><NN>-sheet.jpg`: the page with the panels (green, reading
  order numbers), cells (yellow) and gutters drawn over it: check it;
- on stdout, a `:::page{…}` skeleton per page with one `::panel{art=…}` line
  per panel.

Reading order: rows top to bottom; within a row, columns from the start
side (`--direction rtl`: right to left, as manga and Arabic comics read).
The split is written for that direction, so the engine rebuilds the same
geometry. Several pages at once share one frame (the most common panel
edges), as a printed book does.

Lettered pages: balloons that cross a gutter put ink in it; raise
`--tolerance` (0.02-0.05) until the gutters are found, and check the sheet.
Pages on black or coloured paper: `--paper '#000000'`.

`grid` overlays a labelled 10 % grid (5 % minor lines) on pictures, so mouth
points, faces, avoid zones and safe areas can be read as fractions of the
picture. `check` draws the safe area (green), mouths (red dots, labelled),
heads (blue), faces (red boxes) and avoid zones (orange) of every resource
that has them, from a preset.json or an art manifest (a list of
`{file, safeArea, anchors, avoid}`). `contact` tiles images into one sheet.

Needs Pillow and NumPy.
"""
from __future__ import annotations

import argparse
import json
import os
import statistics
import sys

try:
    import numpy as np
    from PIL import Image, ImageDraw, ImageFont
except ImportError as e:  # pragma: no cover
    sys.exit(f"comic_panels.py needs Pillow and NumPy ({e}): python3 -m pip install pillow numpy")

Image.MAX_IMAGE_PIXELS = None


# --- image helpers --------------------------------------------------------------


def font(size: int):
    for path in ("/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/System/Library/Fonts/Helvetica.ttc",
                 "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "C:/Windows/Fonts/arialbd.ttf"):
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                pass
    return ImageFont.load_default()


def flat(im: Image.Image) -> Image.Image:
    """RGB, transparent pixels on a blue-grey ground (cut-outs stay visible)."""
    if im.mode in ("P", "LA"):
        im = im.convert("RGBA")
    if im.mode == "RGBA":
        bg = Image.new("RGBA", im.size, (90, 130, 170, 255))
        bg.alpha_composite(im)
        return bg.convert("RGB")
    return im.convert("RGB")


def fit(im: Image.Image, long_side: int) -> Image.Image:
    s = long_side / max(im.size)
    return im if s >= 1 else im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)


def parse_color(value: str) -> tuple[int, int, int]:
    v = value.lstrip("#")
    if len(v) == 3:
        v = "".join(c * 2 for c in v)
    return int(v[0:2], 16), int(v[2:4], 16), int(v[4:6], 16)


# --- detection ------------------------------------------------------------------------


class Page:
    """One page image and its ink mask (downscaled by `scale`)."""

    def __init__(self, path: str, paper: str, ink: int):
        self.path = path
        self.rgb = flat(Image.open(path))
        self.w, self.h = self.rgb.size
        self.scale = max(1, round(max(self.w, self.h) / 900))
        small = self.rgb.resize((self.w // self.scale, self.h // self.scale), Image.BILINEAR)
        a = np.asarray(small).astype(np.int16)
        if paper == "auto":
            # The paper: the median colour of the outer 2 % ring.
            k = max(1, int(min(a.shape[:2]) * 0.02))
            ring = np.concatenate([a[:k].reshape(-1, 3), a[-k:].reshape(-1, 3), a[:, :k].reshape(-1, 3), a[:, -k:].reshape(-1, 3)])
            self.paper = tuple(int(v) for v in np.median(ring, axis=0))
        else:
            self.paper = parse_color(paper)
        self.ink = ink
        self.mask = np.abs(a - np.array(self.paper, dtype=np.int16)).max(axis=2) > ink

    def full_ink(self, box) -> np.ndarray:
        """The ink mask of a box (x0, y0, x1, y1, page px) at full resolution."""
        a = np.asarray(self.rgb.crop(box)).astype(np.int16)
        return np.abs(a - np.array(self.paper, dtype=np.int16)).max(axis=2) > self.ink


def runs(flags) -> list[tuple[int, int]]:
    """[start, end) runs of True."""
    out, start = [], None
    for i, f in enumerate(flags):
        if f and start is None:
            start = i
        elif not f and start is not None:
            out.append((start, i))
            start = None
    if start is not None:
        out.append((start, len(flags)))
    return out


class Detector:
    def __init__(self, page: Page, tolerance: float, min_gutter: float, min_panel: float):
        self.p = page
        self.mask = page.mask
        self.tol = tolerance
        short = min(page.w, page.h)
        self.min_gutter = max(2, min_gutter * short / page.scale)   # mask px
        self.min_panel = max(4, min_panel * short / page.scale)

    def trim(self, box):
        x0, y0, x1, y1 = box
        sub = self.mask[y0:y1, x0:x1]
        if sub.size == 0:
            return None
        rows = np.where(sub.mean(axis=1) > self.tol)[0]
        cols = np.where(sub.mean(axis=0) > self.tol)[0]
        if len(rows) == 0 or len(cols) == 0:
            return None
        return (x0 + int(cols[0]), y0 + int(rows[0]), x0 + int(cols[-1]) + 1, y0 + int(rows[-1]) + 1)

    def cut(self, box, axis):
        """Parts of `box` between straight gutters along `axis`, and the
        gutters ((a, b) mask px, absolute)."""
        x0, y0, x1, y1 = box
        sub = self.mask[y0:y1, x0:x1]
        prof = sub.mean(axis=1) if axis == "rows" else sub.mean(axis=0)
        white = prof <= self.tol
        gaps = [r for r in runs(white) if r[1] - r[0] >= self.min_gutter and r[0] > 0 and r[1] < len(white)]
        if not gaps:
            return [box], []
        parts, prev = [], 0
        for g0, g1 in gaps:
            parts.append((prev, g0))
            prev = g1
        parts.append((prev, len(white)))
        boxes, kept_gaps = [], []
        off = y0 if axis == "rows" else x0
        for i, (p0, p1) in enumerate(parts):
            b = (x0, y0 + p0, x1, y0 + p1) if axis == "rows" else (x0 + p0, y0, x0 + p1, y1)
            t = self.trim(b)
            if t and t[2] - t[0] >= self.min_panel and t[3] - t[1] >= self.min_panel:
                if boxes:
                    kept_gaps.append(self.refine(box, axis, off + gaps[i - 1][0], off + gaps[i - 1][1]))
                boxes.append(t)
        return boxes, kept_gaps

    def refine(self, box, axis, g0, g1):
        """A gutter found on the downscaled mask, measured again at full
        resolution (mask units, fractional): the paper run inside it."""
        s = self.p.scale
        x0, y0, x1, y1 = box
        lo, hi = max(0, (g0 - 1) * s), (g1 + 1) * s
        if axis == "rows":
            hi = min(hi, self.p.h)
            prof = self.p.full_ink((x0 * s, lo, x1 * s, hi)).mean(axis=1)
        else:
            hi = min(hi, self.p.w)
            prof = self.p.full_ink((lo, y0 * s, hi, y1 * s)).mean(axis=0)
        white = [r for r in runs(prof <= self.tol)]
        if not white:
            return g0, g1
        a, b = max(white, key=lambda r: r[1] - r[0])
        return (lo + a) / s, (lo + b) / s

    def slanted(self, box, axis):
        """One slanted gutter across `box`: (a, b) mask px along the axis at
        the start and the end of the cross axis (top/bottom for columns,
        left/right for rows), or None."""
        x0, y0, x1, y1 = box
        sub = self.mask[y0:y1, x0:x1]
        h, w = sub.shape
        along, across = (h, w) if axis == "columns" else (w, h)
        if along < 8 or across < 8:
            return None
        half = max(1, int(self.min_gutter / 2))
        t = np.arange(along)
        step = max(1, across // 120)
        best = None
        for a in range(int(across * 0.1), int(across * 0.9), step):
            for b in range(max(int(across * 0.1), a - across // 3), min(int(across * 0.9), a + across // 3), step):
                if abs(a - b) < 2 * step:
                    continue
                centre = a + (b - a) * t / max(1, along - 1)
                ok = True
                for d in range(-half, half + 1):
                    idx = np.clip(np.round(centre + d).astype(int), 0, across - 1)
                    vals = sub[t, idx] if axis == "columns" else sub[idx, t]
                    if vals.mean() > self.tol * 3:
                        ok = False
                        break
                if ok:
                    best = (a, b)
                    break
            if best:
                break
        if not best:
            return None
        off = x0 if axis == "columns" else y0
        return off + best[0], off + best[1]

    def detect(self):
        root = self.trim((0, 0, self.mask.shape[1], self.mask.shape[0]))
        if root is None:
            return None

        def rec(box, axis, depth):
            other = "columns" if axis == "rows" else "rows"
            for ax in (axis, other):
                boxes, gutters = self.cut(box, ax)
                if len(boxes) > 1:
                    nxt = "columns" if ax == "rows" else "rows"
                    kids = [rec(b, nxt, depth + 1) for b in boxes]
                    lines = [((g0 + g1) / 2, (g0 + g1) / 2) for g0, g1 in gutters]
                    return {"box": box, "axis": ax, "children": kids, "lines": lines, "gutters": [g1 - g0 for g0, g1 in gutters]}
            if depth < 5:
                for ax in ("columns", "rows"):
                    s = self.slanted(box, ax)
                    if not s:
                        continue
                    a, b = s
                    x0, y0, x1, y1 = box
                    if ax == "columns":
                        parts = [self.trim((x0, y0, int(max(a, b)), y1)), self.trim((int(min(a, b)), y0, x1, y1))]
                    else:
                        parts = [self.trim((x0, y0, x1, int(max(a, b)))), self.trim((x0, int(min(a, b)), x1, y1))]
                    if all(parts):
                        return {"box": box, "axis": ax, "children": [{"box": q} for q in parts], "lines": [(a, b)],
                                "gutters": [], "slanted": True}
            return {"box": box}

        return rec(root, "rows", 0)


def to_page(node, scale: int):
    """Mask px -> page px, recursively; same-axis nests flattened."""
    out = {"box": [v * scale for v in node["box"]]}
    if "children" not in node:
        return out
    own = [(a * scale, b * scale) for a, b in node["lines"]]
    kids, lines, gutters = [], [], [g * scale for g in node["gutters"]]
    slanted = bool(node.get("slanted"))
    for i, ch in enumerate(node["children"]):
        c = to_page(ch, scale)
        if i > 0:
            lines.append(own[i - 1])   # the line between the previous child and this one
        if c.get("axis") == node["axis"]:
            # A list on its parent's axis: its cells join the parent's list.
            kids.extend(c["children"])
            lines.extend(c["lines"])
            gutters.extend(c["gutters"])
            slanted = slanted or bool(c.get("slanted"))
        else:
            kids.append(c)
    out.update(axis=node["axis"], children=kids, lines=lines, gutters=gutters)
    if slanted:
        out["slanted"] = True
    return out


def leaves(node):
    if "children" not in node:
        yield node
        return
    for ch in node["children"]:
        yield from leaves(ch)


def order_for(node, direction: str):
    """Columns from the start side: reverse them (and their lines) for rtl."""
    if "children" not in node:
        return node
    kids = [order_for(c, direction) for c in node["children"]]
    lines = list(node["lines"])
    if node["axis"] == "columns" and direction == "rtl":
        kids.reverse()
        lines.reverse()
    if node["axis"] == "rows" and direction == "rtl":
        # A slanted row line runs from the start side (the right) to the end.
        lines = [(b, a) for a, b in lines]
    return {**node, "children": kids, "lines": lines}


def fmt(v: float) -> str:
    s = f"{v:.1f}".rstrip("0").rstrip(".")
    return s if s not in ("", "-0") else "0"


def split_expression(node, cell, direction: str) -> str:
    """The `split=` value of a (reading-ordered) tree inside `cell`
    ([x0, y0, x1, y1] page px). Sizes are extents in percent of the parent
    cell; slanted lines give `a~b`; the last cell is `*`."""
    if "children" not in node:
        return ""
    axis = node["axis"]
    x0, y0, x1, y1 = cell
    lo, hi = (y0, y1) if axis == "rows" else (x0, x1)
    span = max(1e-6, hi - lo)

    def pos(v):
        if axis == "columns" and direction == "rtl":
            return 100 * (hi - v) / span
        return 100 * (v - lo) / span

    items = []
    prev = (0.0, 0.0)
    n = len(node["children"])
    for i, ch in enumerate(node["children"]):
        if i < n - 1:
            a, b = node["lines"][i]
            cur = (pos(a), pos(b))
            sa, sb = cur[0] - prev[0], cur[1] - prev[1]
            size = fmt(sa) if abs(sa - sb) < 0.3 else f"{fmt(sa)}~{fmt(sb)}"
            # The child's cell: its raw bounding box between the lines.
            lo_i = min(prev) if i else 0.0
            hi_i = max(cur)
            prev = cur
        else:
            size = "*"
            lo_i, hi_i = (min(prev), 100.0) if i else (0.0, 100.0)
        def back(p):
            return hi - p * span / 100 if axis == "columns" and direction == "rtl" else lo + p * span / 100
        if axis == "rows":
            ccell = [x0, back(lo_i), x1, back(hi_i)]
        else:
            e0, e1 = sorted((back(lo_i), back(hi_i)))
            ccell = [e0, y0, e1, y1]
        ch["cell"] = [round(v, 1) for v in ccell]
        inner = split_expression(ch, ccell, direction)
        items.append(f"{size} [{inner}]" if inner else size)
    return (" / " if axis == "rows" else " | ").join(items)


def radius_of(rgb: np.ndarray, box, paper) -> int:
    """Corner radius (page px) from how far the paper reaches along the
    diagonals of the panel's corners."""
    x0, y0, x1, y1 = [int(v) for v in box]
    h, w = rgb.shape[:2]
    rs = []
    for cx, cy, dx, dy in ((x0, y0, 1, 1), (x1 - 1, y0, -1, 1), (x0, y1 - 1, 1, -1), (x1 - 1, y1 - 1, -1, -1)):
        k = 0
        while k < 200:
            px, py = cx + dx * k, cy + dy * k
            if not (0 <= px < w and 0 <= py < h):
                break
            if np.abs(rgb[py, px].astype(int) - np.array(paper)).max() > 40:
                break
            k += 1
        rs.append(k)
    k = statistics.median(rs)
    # A rounded panel has four similar corners; a faded or vignetted edge
    # (paper deep in two corners only) is not a radius.
    if k < 3 or min(rs) < 0.4 * max(rs):
        return 0
    return int(round(k / (1 - 1 / 2 ** 0.5)))


def nominal_frame(pages_boxes: list[list[list[float]]], w: int, h: int, edge: float) -> list[float]:
    """The frame: each page's panels' bounding box, a side left out where a
    panel bleeds off the image; then the median of each side over the pages
    (a printed book keeps one frame, and a soft edge on one page does not
    move it)."""
    sides: list[list[float]] = [[], [], [], []]
    for boxes in pages_boxes:
        x0 = min(b[0] for b in boxes)
        y0 = min(b[1] for b in boxes)
        x1 = max(b[2] for b in boxes)
        y1 = max(b[3] for b in boxes)
        for i, (v, bleeds) in enumerate(((x0, x0 <= edge), (y0, y0 <= edge), (x1, x1 >= w - edge), (y1, y1 >= h - edge))):
            if not bleeds:
                sides[i].append(v)
    full = [0, 0, w, h]
    return [statistics.median(v) if v else full[i] for i, v in enumerate(sides)]


def cmd_detect(a) -> None:
    os.makedirs(a.out, exist_ok=True)
    pages = []
    for path in a.pages:
        pg = Page(path, a.paper, a.ink)
        tree = Detector(pg, a.tolerance, a.min_gutter, a.min_panel).detect()
        if tree is None:
            print(f"{path}: no ink found (blank page, or --paper is wrong)", file=sys.stderr)
            continue
        pages.append((pg, to_page(tree, pg.scale)))
    if not pages:
        sys.exit(1)
    w, h = pages[0][0].w, pages[0][0].h
    mm_per_px = None
    if a.page_mm:
        pw, ph = (float(v) for v in a.page_mm.lower().split("x"))
        mm_per_px = pw / w
    elif a.dpi:
        mm_per_px = 25.4 / a.dpi
    edge = 0.004 * min(w, h)
    if a.frame:
        frame = [float(v) for v in a.frame.split(",")]
    else:
        frame = nominal_frame([[lf["box"] for lf in leaves(tree)] for _, tree in pages], w, h, edge)
    result = {"pageSize": [w, h], "frame": [round(v, 1) for v in frame], "direction": a.direction, "pages": []}
    row_g, col_g = [], []
    for n, (pg, tree) in enumerate(pages, start=1):
        tree = order_for(tree, a.direction)
        expr = split_expression(tree, frame, a.direction) or "*"

        def gutters(node):
            if "children" not in node or node.get("slanted"):
                return
            (row_g if node["axis"] == "rows" else col_g).extend(node["gutters"])
            for c in node["children"]:
                gutters(c)
        gutters(tree)
        prefix = f"{a.prefix}{n:02d}" if len(pages) > 1 or a.prefix else os.path.splitext(os.path.basename(pg.path))[0]
        rgb = np.asarray(pg.rgb)
        panels = []
        for k, lf in enumerate(leaves(tree), start=1):
            b = [int(v) for v in lf["box"]]
            bleed = [s for s, cond in (("top", b[1] <= edge), ("left", b[0] <= edge),
                                       ("right", b[2] >= w - edge), ("bottom", b[3] >= h - edge)) if cond]
            radius = radius_of(rgb, b, pg.paper) if not bleed else 0
            radius = radius if radius >= 0.012 * min(w, h) else 0
            pid = f"{prefix}-{k}"
            cut = [b[0] + a.cut_inset, b[1] + a.cut_inset, b[2] - a.cut_inset, b[3] - a.cut_inset]
            entry = {"id": pid, "index": k, "box": b, "cell": lf.get("cell", b), "cut": cut,
                     "radius": radius, "bleed": bleed}
            if not a.no_cuts:
                im = fit(pg.rgb.crop(cut), a.long_side)
                fn = f"{pid}.jpg"
                im.save(os.path.join(a.out, fn), quality=a.quality, optimize=True, progressive=True)
                entry.update(file=fn, width=im.width, height=im.height)
            if mm_per_px:
                entry["radiusMm"] = round(radius * mm_per_px, 2)
            panels.append(entry)
        sheet = draw_sheet(pg, tree, panels, frame)
        sheet_path = os.path.join(a.out, f"{prefix}-sheet.jpg")
        sheet.save(sheet_path, quality=82)
        result["pages"].append({"image": pg.path, "paper": "#%02x%02x%02x" % pg.paper, "split": expr,
                                "panels": panels, "sheet": sheet_path})
    rg = statistics.median(row_g) if row_g else None
    cg = statistics.median(col_g) if col_g else None
    result["gutters"] = {"rowsPx": rg, "columnsPx": cg}
    if mm_per_px:
        result["gutters"].update(rowsMm=rg and round(rg * mm_per_px, 2), columnsMm=cg and round(cg * mm_per_px, 2))
        result["frameMm"] = {"top": round(frame[1] * mm_per_px, 2), "bottom": round((h - frame[3]) * mm_per_px, 2),
                             "left": round(frame[0] * mm_per_px, 2), "right": round((w - frame[2]) * mm_per_px, 2)}
    with open(os.path.join(a.out, "panels.json"), "w", encoding="utf-8") as f:
        json.dump(result, f, indent=1, ensure_ascii=False)
    # The Markdown skeletons.
    gut = ""
    if mm_per_px and rg and cg:
        gut = f' gutter="{fmt(rg * mm_per_px)}mm {fmt(cg * mm_per_px)}mm"'
    for page in result["pages"]:
        rtl = " direction=rtl" if a.direction == "rtl" else ""
        print(f':::page{{split="{page["split"]}"{gut}{rtl}}}')
        for p in page["panels"]:
            extra = f' bleed="{" ".join(p["bleed"])}"' if p["bleed"] else ""
            extra += " style=rounded" if p["radius"] else ""
            print(f"::panel{{art={p['id']}{extra}}}")
        print(":::\n")
    radii = [p.get("radiusMm", p["radius"]) for page in result["pages"] for p in page["panels"] if p["radius"]]
    if radii:
        print(f"rounded corners on {len(radii)} panels, median {statistics.median(radii)} {'mm' if mm_per_px else 'px'}: "
              "declare comics.panelStyles [{id: 'rounded', borderRadius: …}]", file=sys.stderr)
    print(f"frame {result['frame']} px" + (f" = margins {result['frameMm']} mm" if mm_per_px else "")
          + f"; gutters {result['gutters']}; sheets and cuts in {a.out}", file=sys.stderr)


def draw_sheet(pg: Page, tree, panels, frame) -> Image.Image:
    im = pg.rgb.copy()
    d = ImageDraw.Draw(im, "RGBA")
    lw = max(3, pg.w // 400)
    d.rectangle(frame, outline=(0, 120, 255, 200), width=lw)

    def cells(node):
        if "cell" in node:
            d.rectangle(node["cell"], outline=(255, 210, 0, 230), width=lw)
        for c in node.get("children", []):
            cells(c)
    cells(tree)
    f = font(max(24, pg.w // 25))
    for p in panels:
        d.rectangle(p["box"], outline=(0, 200, 0, 255), width=lw)
        x, y = p["box"][0] + lw * 3, p["box"][1] + lw * 3
        d.text((x, y), str(p["index"]), fill=(255, 255, 255, 255), font=f, stroke_width=max(2, lw), stroke_fill=(0, 0, 0, 255))
    return fit(im, 1600)


# --- grid / check / contact ---------------------------------------------------------------


def grid_image(im: Image.Image) -> Image.Image:
    im = fit(flat(im), 1000)
    w, h = im.size
    ov = Image.new("RGBA", im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    fn = font(18)
    for i in range(1, 20):
        x, y = w * i / 20, h * i / 20
        major = i % 2 == 0
        col = (255, 0, 255, 200) if major else (0, 255, 255, 120)
        d.line([(x, 0), (x, h)], fill=col, width=2 if major else 1)
        d.line([(0, y), (w, y)], fill=col, width=2 if major else 1)
        if major:
            lab = str(i * 5)
            for tx, ty in ((x + 3, 2), (x + 3, h - 22), (2, y + 2), (w - 28, y + 2)):
                d.rectangle((tx - 1, ty, tx + 25, ty + 20), fill=(0, 0, 0, 170))
                d.text((tx, ty), lab, fill=(255, 255, 0, 255), font=fn)
    return Image.alpha_composite(im.convert("RGBA"), ov).convert("RGB")


def cmd_grid(a) -> None:
    os.makedirs(a.out, exist_ok=True)
    for path in a.pictures:
        out = os.path.join(a.out, os.path.splitext(os.path.basename(path))[0] + "-grid.jpg")
        grid_image(Image.open(path)).save(out, quality=85)
        print(out)


def _rect(d, r, w, h, col, width=3):
    d.rectangle((r["x"] * w, r["y"] * h, (r["x"] + r["width"]) * w, (r["y"] + r["height"]) * h), outline=col, width=width)


def cmd_check(a) -> None:
    data = json.load(open(a.manifest, encoding="utf-8"))
    root = a.root or os.path.dirname(os.path.abspath(a.manifest))
    entries = data.get("resources", []) if isinstance(data, dict) else data
    os.makedirs(a.out, exist_ok=True)
    fn = font(22)
    count = 0
    for e in entries:
        if not (e.get("safeArea") or e.get("anchors") or e.get("avoid")) or not e.get("file"):
            continue
        path = os.path.join(root, e["file"])
        if not os.path.exists(path):
            print(f"missing {path}", file=sys.stderr)
            continue
        im = fit(flat(Image.open(path)), 900)
        w, h = im.size
        d = ImageDraw.Draw(im)
        if e.get("safeArea"):
            _rect(d, e["safeArea"], w, h, (0, 255, 0), 4)
        for r in e.get("avoid", []):
            _rect(d, r, w, h, (255, 140, 0), 3)
        for an in e.get("anchors", []):
            x, y = an["x"] * w, an["y"] * h
            d.ellipse((x - 9, y - 9, x + 9, y + 9), fill=(255, 0, 0), outline="white", width=2)
            d.text((x + 12, y - 12), an["id"], fill=(255, 255, 0), font=fn, stroke_width=3, stroke_fill="black")
            if an.get("head"):
                hx, hy = an["head"]["x"] * w, an["head"]["y"] * h
                d.ellipse((hx - 7, hy - 7, hx + 7, hy + 7), fill=(0, 120, 255), outline="white", width=2)
            if an.get("face"):
                _rect(d, an["face"], w, h, (255, 0, 0), 2)
        out = os.path.join(a.out, os.path.splitext(os.path.basename(e["file"]))[0] + "-check.jpg")
        im.save(out, quality=82)
        count += 1
    print(f"{count} check images in {a.out}")


def cmd_contact(a) -> None:
    tiles = []
    fn = font(24)
    for path in a.images:
        im = flat(Image.open(path))
        im = im.resize((max(1, round(im.width * a.height / im.height)), a.height), Image.LANCZOS)
        d = ImageDraw.Draw(im)
        lab = os.path.splitext(os.path.basename(path))[0]
        d.rectangle((0, 0, 14 * len(lab) + 16, 32), fill="black")
        d.text((6, 3), lab, fill="white", font=fn)
        tiles.append(im)
    rows, row, x = [], [], 0
    for t in tiles:
        if row and x + t.width > a.width:
            rows.append(row)
            row, x = [], 0
        row.append(t)
        x += t.width + 10
    rows.append(row)
    W = max(sum(t.width + 10 for t in r) for r in rows) + 10
    sheet = Image.new("RGB", (W, len(rows) * (a.height + 10) + 10), (235, 235, 235))
    for i, r in enumerate(rows):
        x = 10
        for t in r:
            sheet.paste(t, (x, 10 + i * (a.height + 10)))
            x += t.width + 10
    fit(sheet, 2400).save(a.out, quality=80)
    print(a.out)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("detect", help="panels, split expression, gutters and cuts of page images")
    d.add_argument("pages", nargs="+")
    d.add_argument("--out", required=True)
    d.add_argument("--direction", choices=("ltr", "rtl"), default="ltr", help="reading direction of the panels")
    d.add_argument("--page-mm", help="trim size of the page images, WxH in mm (210x297): gutters and frame in mm")
    d.add_argument("--dpi", type=float, help="resolution of the page images, when --page-mm is not given")
    d.add_argument("--prefix", default="", help="panel id prefix: <prefix><page>-<panel> (default: the file name)")
    d.add_argument("--paper", default="auto", help="paper colour (#ffffff), or auto: the page's outer ring")
    d.add_argument("--ink", type=int, default=12, help="a pixel differing from the paper by more than this is ink (0-255)")
    d.add_argument("--tolerance", type=float, default=0.004, help="share of ink a gutter row/column may hold (0.02-0.05 on lettered pages)")
    d.add_argument("--min-gutter", type=float, default=0.006, help="narrowest gutter, a fraction of the page's short side")
    d.add_argument("--min-panel", type=float, default=0.05, help="smallest panel side, a fraction of the page's short side")
    d.add_argument("--frame", help="x0,y0,x1,y1 page px of the panel frame (default: the most common outer panel edges)")
    d.add_argument("--cut-inset", type=int, default=3, help="page px trimmed off each panel cut (its antialiased border)")
    d.add_argument("--long-side", type=int, default=1600)
    d.add_argument("--quality", type=int, default=85)
    d.add_argument("--no-cuts", action="store_true", help="measure only; write no panel pictures")
    d.set_defaults(func=cmd_detect)
    g = sub.add_parser("grid", help="labelled 10 %% grid over pictures (read anchors, faces, safe areas)")
    g.add_argument("pictures", nargs="+")
    g.add_argument("--out", required=True)
    g.set_defaults(func=cmd_grid)
    c = sub.add_parser("check", help="draw safe areas, anchors, faces and avoid zones over the pictures")
    c.add_argument("manifest", help="preset.json, or a JSON list of {file, safeArea, anchors, avoid}")
    c.add_argument("--out", required=True)
    c.add_argument("--root", help="folder the files are relative to (default: the manifest's)")
    c.set_defaults(func=cmd_check)
    k = sub.add_parser("contact", help="tile images into one contact sheet")
    k.add_argument("images", nargs="+")
    k.add_argument("--out", required=True)
    k.add_argument("--height", type=int, default=420)
    k.add_argument("--width", type=int, default=2200)
    k.set_defaults(func=cmd_contact)
    a = ap.parse_args()
    a.func(a)


if __name__ == "__main__":
    main()
