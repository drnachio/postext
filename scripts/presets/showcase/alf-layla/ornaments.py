#!/usr/bin/env python3
"""The ornaments of the `alf-layla` bundle, drawn as SVG.

The Bulaq prints open each volume with a sarlawḥ (سرلوح), a headpiece band
above the first lines of the text; the Harvey woodcuts the source pipeline
kept are pictures of a gateway and a roundel, not bands, so the headpiece is
drawn here: a ruled band cresting in a dome over its middle, a cartouche at
its centre and a row of eight-pointed stars (two squares turned on each
other, the khātam) on a woven double line either side.

Only paths, polygons, circles and rects with flat fills and strokes, which
every renderer (canvas, HTML, the PDF's vector subset) draws alike.

    python3 ornaments.py [OUT_DIR]   # writes the SVGs and a PNG preview of each
"""
from __future__ import annotations

import math
import os
import subprocess
import sys

W, H = 1200, 300
BAND_TOP, BAND_BOTTOM = 92, 292
MID = (BAND_TOP + BAND_BOTTOM) / 2


def _f(v: float) -> str:
    return f"{v:.1f}".rstrip("0").rstrip(".")


def _pts(points: list[tuple[float, float]]) -> str:
    return " ".join(f"{_f(x)},{_f(y)}" for x, y in points)


def star8(cx: float, cy: float, r: float) -> list[tuple[float, float]]:
    """The khātam: two squares of circumradius `r`, one turned 45°, as one
    16-point outline."""
    inner = r * math.cos(math.pi / 4) / math.cos(math.pi / 8)
    pts = []
    for k in range(16):
        a = -math.pi / 2 + k * math.pi / 8
        rr = r if k % 2 == 0 else inner
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    return pts


def diamond(cx: float, cy: float, r: float) -> list[tuple[float, float]]:
    return [(cx, cy - r), (cx + r, cy), (cx, cy + r), (cx - r, cy)]


def wave(x0: float, x1: float, y: float, amp: float, period: float, phase: float) -> str:
    """A sine wave from x0 to x1 as cubic Béziers (four per period)."""
    q = period / 4
    n = max(1, round((x1 - x0) / q))
    q = (x1 - x0) / n
    k = q * 0.3642  # control length matching a sine quarter

    def at(i: int) -> tuple[float, float, float]:
        t = phase + i * math.pi / 2
        return x0 + i * q, y + amp * math.sin(t), amp * math.cos(t)

    x, yy, _ = at(0)
    d = f"M{_f(x)} {_f(yy)}"
    for i in range(n):
        xa, ya, sa = at(i)
        xb, yb, sb = at(i + 1)
        # slope dy/dx = amp·cos·(π/2)/q
        ma, mb = sa * (math.pi / 2) / q, sb * (math.pi / 2) / q
        d += f" C{_f(xa + k)} {_f(ya + ma * k)} {_f(xb - k)} {_f(yb - mb * k)} {_f(xb)} {_f(yb)}"
    return d


def ogee_cartouche(x0: float, x1: float, cy: float, h: float) -> str:
    """A horizontal cartouche with pointed, ogee-curved ends."""
    r = h / 2
    tip = h * 0.75
    return (
        f"M{_f(x0)} {_f(cy)}"
        f" C{_f(x0 + tip * 0.35)} {_f(cy)} {_f(x0 + tip * 0.45)} {_f(cy - r)} {_f(x0 + tip)} {_f(cy - r)}"
        f" L{_f(x1 - tip)} {_f(cy - r)}"
        f" C{_f(x1 - tip * 0.45)} {_f(cy - r)} {_f(x1 - tip * 0.35)} {_f(cy)} {_f(x1)} {_f(cy)}"
        f" C{_f(x1 - tip * 0.35)} {_f(cy)} {_f(x1 - tip * 0.45)} {_f(cy + r)} {_f(x1 - tip)} {_f(cy + r)}"
        f" L{_f(x0 + tip)} {_f(cy + r)}"
        f" C{_f(x0 + tip * 0.45)} {_f(cy + r)} {_f(x0 + tip * 0.35)} {_f(cy)} {_f(x0)} {_f(cy)} Z"
    )


def dome(cx: float, base: float, half: float, height: float) -> str:
    """An ogee dome standing on `base`: the outline of the crest."""
    return (
        f"M{_f(cx - half)} {_f(base)}"
        f" C{_f(cx - half)} {_f(base - height * 0.55)} {_f(cx - half * 0.2)} {_f(base - height * 0.55)} {_f(cx - half * 0.08)} {_f(base - height * 0.86)}"
        f" L{_f(cx)} {_f(base - height)} L{_f(cx + half * 0.08)} {_f(base - height * 0.86)}"
        f" C{_f(cx + half * 0.2)} {_f(base - height * 0.55)} {_f(cx + half)} {_f(base - height * 0.55)} {_f(cx + half)} {_f(base)} Z"
    )


def merlon(cx: float, base: float, w: float, h: float) -> str:
    """A small pointed leaf of the cresting."""
    return (
        f"M{_f(cx - w / 2)} {_f(base)}"
        f" C{_f(cx - w / 2)} {_f(base - h * 0.6)} {_f(cx - w * 0.1)} {_f(base - h * 0.7)} {_f(cx)} {_f(base - h)}"
        f" C{_f(cx + w * 0.1)} {_f(base - h * 0.7)} {_f(cx + w / 2)} {_f(base - h * 0.6)} {_f(cx + w / 2)} {_f(base)} Z"
    )


def headpiece(ink: str, rubric: str, ground: str | None, field: str | None) -> str:
    """The sarlawḥ, 1200 × 300 units. `ground` fills the band (None: no fill),
    `field` the cartouche and the stars' hearts (None: no fill)."""
    out: list[str] = []
    add = out.append
    nofill = "none"
    gfill = ground or nofill
    ffill = field or nofill
    cx = W / 2
    # The cresting: leaves along the band's top, the dome over the middle.
    for i in range(13):
        for side in (-1, 1):
            x = cx + side * (150 + 34 + i * 34)
            if x < 20 or x > W - 20:
                continue
            add(f'<path d="{merlon(x, BAND_TOP, 22, 26)}" fill="{rubric}"/>')
    add(f'<path d="{dome(cx, BAND_TOP + 1, 150, 86)}" fill="{rubric}" stroke="{ink}" stroke-width="4"/>')
    add(f'<path d="{dome(cx, BAND_TOP + 1, 112, 64)}" fill="{ffill}" stroke="{ink}" stroke-width="2"/>')
    add(f'<polygon points="{_pts(star8(cx, BAND_TOP - 22, 18))}" fill="{rubric}" stroke="{ink}" stroke-width="1.5"/>')
    # The band and its rules.
    add(f'<rect x="3" y="{BAND_TOP}" width="{W - 6}" height="{BAND_BOTTOM - BAND_TOP - 3}" fill="{gfill}" stroke="{ink}" stroke-width="6"/>')
    add(f'<rect x="15" y="{BAND_TOP + 12}" width="{W - 30}" height="{BAND_BOTTOM - BAND_TOP - 27}" fill="none" stroke="{rubric}" stroke-width="3"/>')
    add(f'<rect x="24" y="{BAND_TOP + 21}" width="{W - 48}" height="{BAND_BOTTOM - BAND_TOP - 45}" fill="none" stroke="{ink}" stroke-width="1.5"/>')
    # Either side: a woven double line under a row of stars and diamonds.
    for x0, x1 in ((34, 412), (788, W - 34)):
        for phase in (0, math.pi):
            add(f'<path d="{wave(x0, x1, MID, 40, 189, phase)}" fill="none" stroke="{ink}" stroke-width="3"/>')
        span = x1 - x0
        n = 4
        step = span / n
        for i in range(n):
            sx = x0 + step * (i + 0.5)
            add(f'<polygon points="{_pts(star8(sx, MID, 36))}" fill="{rubric}" stroke="{ink}" stroke-width="2.5"/>')
            add(f'<circle cx="{_f(sx)}" cy="{_f(MID)}" r="12" fill="{ffill}" stroke="{ink}" stroke-width="2"/>')
        for i in range(n + 1):
            dx = x0 + step * i
            if dx in (x0, x1):
                continue
            add(f'<polygon points="{_pts(diamond(dx, MID, 12))}" fill="{ink}"/>')
    # The cartouche at the centre, with a star and two buds.
    add(f'<path d="{ogee_cartouche(424, 776, MID, 130)}" fill="{ffill}" stroke="{ink}" stroke-width="5"/>')
    add(f'<path d="{ogee_cartouche(444, 756, MID, 104)}" fill="none" stroke="{rubric}" stroke-width="2.5"/>')
    add(f'<polygon points="{_pts(star8(cx, MID, 40))}" fill="{rubric}" stroke="{ink}" stroke-width="2.5"/>')
    add(f'<polygon points="{_pts(star8(cx, MID, 20))}" fill="{ffill}" stroke="{ink}" stroke-width="1.5"/>')
    for side in (-1, 1):
        for j, (dx, r) in enumerate(((78, 12), (124, 9), (162, 6))):
            add(f'<circle cx="{_f(cx + side * dx)}" cy="{_f(MID)}" r="{r}" fill="{rubric if j % 2 == 0 else ink}"/>')
    body = "\n".join(out)
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">\n{body}\n</svg>\n'


def rosette(ink: str, rubric: str, field: str | None) -> str:
    """A small round ornament (the star in two rings) for the part pages and
    the colophon, 200 × 200 units."""
    c = 100
    ffill = field or "none"
    parts = [
        f'<circle cx="{c}" cy="{c}" r="94" fill="none" stroke="{ink}" stroke-width="4"/>',
        f'<circle cx="{c}" cy="{c}" r="84" fill="none" stroke="{rubric}" stroke-width="2"/>',
    ]
    for k in range(16):
        a = k * math.pi / 8
        parts.append(f'<circle cx="{_f(c + 72 * math.cos(a))}" cy="{_f(c + 72 * math.sin(a))}" r="5" fill="{rubric if k % 2 else ink}"/>')
    parts += [
        f'<polygon points="{_pts(star8(c, c, 58))}" fill="{rubric}" stroke="{ink}" stroke-width="3"/>',
        f'<polygon points="{_pts(star8(c, c, 30))}" fill="{ffill}" stroke="{ink}" stroke-width="2"/>',
        f'<circle cx="{c}" cy="{c}" r="9" fill="{ink}"/>',
    ]
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">\n' + "\n".join(parts) + "\n</svg>\n"


def write_all(out_dir: str, ink: str, rubric: str, tint: str, paper: str, gold: str, gold_dark: str) -> dict[str, tuple[str, int, int]]:
    """Writes the ornaments into `out_dir`; returns id → (file, width, height)."""
    os.makedirs(out_dir, exist_ok=True)
    files = {
        "headpiece": (headpiece(ink, rubric, tint, paper), W, H),
        "headpiece-gold": (headpiece(gold, gold_dark, None, None), W, H),
        "rosette": (rosette(ink, rubric, paper), 200, 200),
        "rosette-gold": (rosette(gold, gold_dark, None), 200, 200),
    }
    out = {}
    for rid, (svg, w, h) in files.items():
        path = os.path.join(out_dir, f"{rid}.svg")
        with open(path, "w", encoding="utf-8") as f:
            f.write(svg)
        out[rid] = (f"{rid}.svg", w, h)
    return out


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "work", "ornaments")
    made = write_all(out, "#1f1a14", "#9a2f1f", "#efe3c6", "#f7f0e0", "#d2ad5c", "#a8823a")
    for rid, (f, _, _) in made.items():
        subprocess.run(["rsvg-convert", "-w", "900", "-b", "#5a2a20" if "gold" in rid else "#f7f0e0", os.path.join(out, f), "-o", os.path.join(out, f.replace(".svg", ".png"))], check=True)
    print("wrote", ", ".join(made))
