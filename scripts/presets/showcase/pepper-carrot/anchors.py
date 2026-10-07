#!/usr/bin/env python3
"""Speaker anchors from the balloon tails of the English SVGs.

Every balloon in the `speechbubbles` layer is drawn as a body plus a
separate tail shape; the tail's farthest point from the body (its tip)
points at the speaker but stops short of the mouth. For each speaker in a
panel:

- two or more tails of the same speaker: the mouth is where their rays
  (body edge -> tip) cross, when they cross in front of both tips;
- one tail: the ray is extended past the tip by EXTEND x the tail length;
- CURATED overrides any of these with a point read off the art (page px)
  where the estimate misses the mouth (a short tail aimed at a house, a
  speaker drawn far from the tail's line).

Sound effects and writing drawn on the art (a letter, a book cover) get
their position and rotation from the SVG flow region or FREE_TEXT; a sound
effect also becomes an anchor `sfx` of its panel (SPEC D3.4).

Anchors are written as fractions of the panel's cut picture (the file
panels.py wrote), the frame the engine's `ResourceAnchor` uses; points
outside 0..1 are speakers outside the picture (the engine then points the
tail at the panel edge). Output: `$PC_OUT/anchors.json`.

    python3 anchors.py
"""
from __future__ import annotations

import math

from common import STORY_PAGES, out, save_json
from slots import load_panels, page_slots

EXTEND = 0.6

# Mouths read off the art, page px of the 2481x3503 page:
# {(panel id, speaker): (x, y, why)}.
CURATED: dict[tuple[str, str], tuple[float, float, str]] = {
    ("e08p01-2", "pepper"): (1377, 1789, "mouth, the tail stops at her chin"),
    ("e08p02-1", "pepper"): (794, 485, "mouth between the two tails, which do not cross"),
    ("e08p03-1", "pepper"): (1737, 745, "inside the house: the porch opening"),
    ("e08p03-2", "pepper"): (1603, 1655, "mouth, the tail stops at her shoulder"),
    ("e08p04-1", "pepper"): (1702, 725, "mouth"),
    ("e08p05-1", "pepper"): (1071, 755, "open mouth, the shout tail is short"),
    ("e08p05-2", "pepper"): (1893, 2099, "the small figure's face under the hat"),
}

# Free text drawn on the art, page px: {slot id: (x, y, rotate)}. SVG flow
# regions give the box of the writing on a letter or a book cover well, but
# the sound effect's region is a large rotated box its letters only start in.
FREE_TEXT: dict[str, tuple[float, float, float]] = {
    "P05-4": (527, 3176, -28),   # DZZZOOO rising from the bottom-left corner
}


def ray_intersection(p, d, q, e):
    """t, u with p + t d = q + u e (None when parallel)."""
    den = d[0] * e[1] - d[1] * e[0]
    if abs(den) < 1e-9:
        return None
    w = (q[0] - p[0], q[1] - p[1])
    t = (w[0] * e[1] - w[1] * e[0]) / den
    u = (w[0] * d[1] - w[1] * d[0]) / den
    return t, u


def unit(v):
    n = math.hypot(*v) or 1.0
    return (v[0] / n, v[1] / n)


def estimate(tails: list[dict]) -> tuple[tuple[float, float], str]:
    if len(tails) >= 2:
        pts = []
        for i, a in enumerate(tails):
            for b in tails[i + 1:]:
                da = unit((a["tip"][0] - a["base"][0], a["tip"][1] - a["base"][1]))
                db = unit((b["tip"][0] - b["base"][0], b["tip"][1] - b["base"][1]))
                r = ray_intersection(a["tip"], da, b["tip"], db)
                if r and r[0] > 0 and r[1] > 0 and r[0] < 4 * a["length"] + 400 and r[1] < 4 * b["length"] + 400:
                    pts.append((a["tip"][0] + r[0] * da[0], a["tip"][1] + r[0] * da[1]))
        if pts:
            return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)), "tails-crossing"
    # One tail (or rays that do not meet): extend each and average.
    pts = []
    for a in tails:
        d = unit((a["tip"][0] - a["base"][0], a["tip"][1] - a["base"][1]))
        ext = EXTEND * a["length"]
        pts.append((a["tip"][0] + ext * d[0], a["tip"][1] + ext * d[1]))
    return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)), "tail-extended"


def to_fraction(panel: dict, x: float, y: float) -> tuple[float, float]:
    c = panel["cut"]
    return (round((x - c[0]) / (c[2] - c[0]), 4), round((y - c[1]) / (c[3] - c[1]), 4))


def main() -> None:
    panels = load_panels()
    result: dict[str, dict] = {}
    for page in STORY_PAGES:
        by_id = {p["id"]: p for p in panels["pages"][page]["panels"]}
        groups: dict[tuple[str, str], list[dict]] = {}
        page_slot_list = page_slots(page, panels)
        for s in page_slot_list:
            if s.kind in ("sfx", "writing"):
                x, y, rot = FREE_TEXT.get(s.id, (s.centre[0], s.centre[1], s.rotate))
                fx, fy = to_fraction(by_id[s.panel], x, y)
                entry = result.setdefault(s.panel, {"anchors": [], "tails": []})
                entry.setdefault("freeText", []).append({"slot": s.id, "kind": s.kind, "x": fx, "y": fy, "rotate": round(rot), "page": [round(x), round(y)]})
                if s.kind == "sfx":  # D3.4: the art's `sfx` point places the effect
                    entry["anchors"].append({"id": "sfx", "x": fx, "y": fy, "page": [round(x), round(y)], "source": "sound effect position"})
        for s in page_slot_list:
            if s.kind != "speech" or not s.speaker:
                continue
            groups.setdefault((s.panel, s.speaker), []).extend(
                {**t, "slot": s.id} for t in s.tails)
            groups.setdefault((s.panel, s.speaker), [])
        for (pid, speaker), tails in groups.items():
            if (pid, speaker) in CURATED:
                x, y, why = CURATED[(pid, speaker)]
                src = f"curated: {why}"
            elif tails:
                (x, y), src = estimate(tails)
            else:
                continue  # a joined balloon whose partner carries the tail
            fx, fy = to_fraction(by_id[pid], x, y)
            entry = result.setdefault(pid, {"anchors": [], "tails": []})
            entry["anchors"].append({"id": speaker, "x": fx, "y": fy, "page": [round(x), round(y)], "source": src})
            for t in tails:
                tx, ty = to_fraction(by_id[pid], *t["tip"])
                entry["tails"].append({"speaker": speaker, "slot": t["slot"], "tip": [tx, ty],
                                       "tipPage": [round(t["tip"][0]), round(t["tip"][1])],
                                       "basePage": [round(t["base"][0]), round(t["base"][1])]})
            print(pid, speaker, (fx, fy), src)
    save_json(out("anchors.json"), result)


if __name__ == "__main__":
    main()
