"""Read the Pepper&Carrot Inkscape SVGs: balloon outlines from the
`speechbubbles` layer and text blocks (flowRoot / text) from the
`speechbubbles` and `txt` layers, in page px of the 2481x3503 art.

Only what the pipeline needs: transforms (matrix, translate, scale, rotate,
skew), path data flattened to polylines (M L H V C S Q T A Z, absolute and
relative), flowRoot regions, flowPara/flowSpan/tspan text with bold and
italic runs.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field

from lxml import etree

SVG = "{http://www.w3.org/2000/svg}"
INK_LABEL = "{http://www.inkscape.org/namespaces/inkscape}label"
INK_MODE = "{http://www.inkscape.org/namespaces/inkscape}groupmode"

Matrix = tuple[float, float, float, float, float, float]  # a b c d e f
IDENTITY: Matrix = (1, 0, 0, 1, 0, 0)


def mul(m: Matrix, n: Matrix) -> Matrix:
    a, b, c, d, e, f = m
    a2, b2, c2, d2, e2, f2 = n
    return (a * a2 + c * b2, b * a2 + d * b2, a * c2 + c * d2, b * c2 + d * d2, a * e2 + c * f2 + e, b * e2 + d * f2 + f)


def apply(m: Matrix, x: float, y: float) -> tuple[float, float]:
    a, b, c, d, e, f = m
    return (a * x + c * y + e, b * x + d * y + f)


def parse_transform(s: str | None) -> Matrix:
    m = IDENTITY
    if not s:
        return m
    for name, args in re.findall(r"(\w+)\s*\(([^)]*)\)", s):
        v = [float(x) for x in re.findall(r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?", args)]
        if name == "matrix":
            t = tuple(v[:6])
        elif name == "translate":
            t = (1, 0, 0, 1, v[0], v[1] if len(v) > 1 else 0)
        elif name == "scale":
            t = (v[0], 0, 0, v[1] if len(v) > 1 else v[0], 0, 0)
        elif name == "rotate":
            r = math.radians(v[0])
            t = (math.cos(r), math.sin(r), -math.sin(r), math.cos(r), 0, 0)
            if len(v) == 3:
                t = mul(mul((1, 0, 0, 1, v[1], v[2]), t), (1, 0, 0, 1, -v[1], -v[2]))
        elif name == "skewX":
            t = (1, 0, math.tan(math.radians(v[0])), 1, 0, 0)
        elif name == "skewY":
            t = (1, math.tan(math.radians(v[0])), 0, 1, 0, 0)
        else:
            continue
        m = mul(m, t)  # type: ignore[arg-type]
    return m


def rotation_deg(m: Matrix) -> float:
    """The rotation of the x axis under `m`, degrees clockwise (SVG y down)."""
    return math.degrees(math.atan2(m[1], m[0]))


# --- path data ---------------------------------------------------------------

_TOKEN = re.compile(r"[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?")
_ARGC = {"M": 2, "L": 2, "H": 1, "V": 1, "C": 6, "S": 4, "Q": 4, "T": 2, "A": 7, "Z": 0}


def _bez(p0, p1, p2, p3, n=12):
    out = []
    for i in range(1, n + 1):
        t = i / n
        u = 1 - t
        out.append((u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0],
                    u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1]))
    return out


def _arc(p0, rx, ry, phi, large, sweep, p1, n=16):
    # SVG implementation notes F.6.5
    if rx == 0 or ry == 0:
        return [p1]
    phi = math.radians(phi)
    cp, sp = math.cos(phi), math.sin(phi)
    dx, dy = (p0[0] - p1[0]) / 2, (p0[1] - p1[1]) / 2
    x1, y1 = cp * dx + sp * dy, -sp * dx + cp * dy
    rx, ry = abs(rx), abs(ry)
    lam = x1 * x1 / (rx * rx) + y1 * y1 / (ry * ry)
    if lam > 1:
        rx, ry = rx * math.sqrt(lam), ry * math.sqrt(lam)
    num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
    den = rx * rx * y1 * y1 + ry * ry * x1 * x1
    co = math.sqrt(max(0, num / den)) if den else 0
    if large == sweep:
        co = -co
    cx1, cy1 = co * rx * y1 / ry, -co * ry * x1 / rx
    cx = cp * cx1 - sp * cy1 + (p0[0] + p1[0]) / 2
    cy = sp * cx1 + cp * cy1 + (p0[1] + p1[1]) / 2
    a1 = math.atan2((y1 - cy1) / ry, (x1 - cx1) / rx)
    a2 = math.atan2((-y1 - cy1) / ry, (-x1 - cx1) / rx)
    da = a2 - a1
    if sweep and da < 0:
        da += 2 * math.pi
    elif not sweep and da > 0:
        da -= 2 * math.pi
    out = []
    for i in range(1, n + 1):
        a = a1 + da * i / n
        x, y = rx * math.cos(a), ry * math.sin(a)
        out.append((cp * x - sp * y + cx, sp * x + cp * y + cy))
    return out


def flatten_path(d: str) -> list[list[tuple[float, float]]]:
    """Subpaths of `d` as polylines (curves sampled), untransformed.
    Also returns the nodes (on-curve points) through `path_nodes`."""
    return _walk(d)[0]


def path_nodes(d: str) -> list[list[tuple[float, float]]]:
    """The on-curve nodes of every subpath (tail tips are nodes)."""
    return _walk(d)[1]


def _walk(d: str):
    toks = _TOKEN.findall(d)
    subs: list[list[tuple[float, float]]] = []
    nodes: list[list[tuple[float, float]]] = []
    cur = (0.0, 0.0)
    start = cur
    last_ctrl = None
    last_cmd = ""
    i = 0
    cmd = ""
    poly: list[tuple[float, float]] = []
    nd: list[tuple[float, float]] = []

    def flush():
        nonlocal poly, nd
        if len(poly) > 1:
            subs.append(poly)
            nodes.append(nd)
        poly, nd = [], []

    while i < len(toks):
        t = toks[i]
        if re.match(r"[A-Za-z]", t):
            cmd = t
            i += 1
            if cmd in "Zz":
                if poly:
                    poly.append(start)
                cur = start
                flush()
                last_cmd = "Z"
                continue
        up = cmd.upper()
        n = _ARGC[up]
        args = [float(x) for x in toks[i:i + n]]
        if len(args) < n:
            break
        i += n
        rel = cmd.islower()
        ox, oy = cur if rel else (0.0, 0.0)
        if up == "M":
            flush()
            cur = (ox + args[0], oy + args[1])
            start = cur
            poly, nd = [cur], [cur]
            cmd = "l" if rel else "L"  # implicit lineto after moveto
            last_ctrl = None
        elif up == "L":
            cur = (ox + args[0], oy + args[1])
            poly.append(cur)
            nd.append(cur)
            last_ctrl = None
        elif up == "H":
            cur = ((cur[0] if rel else 0) + args[0], cur[1])
            poly.append(cur)
            nd.append(cur)
            last_ctrl = None
        elif up == "V":
            cur = (cur[0], (cur[1] if rel else 0) + args[0])
            poly.append(cur)
            nd.append(cur)
            last_ctrl = None
        elif up in "CS":
            if up == "C":
                c1 = (ox + args[0], oy + args[1])
                c2 = (ox + args[2], oy + args[3])
                p = (ox + args[4], oy + args[5])
            else:
                c1 = (2 * cur[0] - last_ctrl[0], 2 * cur[1] - last_ctrl[1]) if last_cmd in "CS" and last_ctrl else cur
                c2 = (ox + args[0], oy + args[1])
                p = (ox + args[2], oy + args[3])
            poly.extend(_bez(cur, c1, c2, p))
            last_ctrl = c2
            cur = p
            nd.append(p)
        elif up in "QT":
            if up == "Q":
                q = (ox + args[0], oy + args[1])
                p = (ox + args[2], oy + args[3])
            else:
                q = (2 * cur[0] - last_ctrl[0], 2 * cur[1] - last_ctrl[1]) if last_cmd in "QT" and last_ctrl else cur
                p = (ox + args[0], oy + args[1])
            c1 = (cur[0] + 2 / 3 * (q[0] - cur[0]), cur[1] + 2 / 3 * (q[1] - cur[1]))
            c2 = (p[0] + 2 / 3 * (q[0] - p[0]), p[1] + 2 / 3 * (q[1] - p[1]))
            poly.extend(_bez(cur, c1, c2, p))
            last_ctrl = q
            cur = p
            nd.append(p)
        elif up == "A":
            p = (ox + args[5], oy + args[6])
            poly.extend(_arc(cur, args[0], args[1], args[2], int(args[3]), int(args[4]), p))
            cur = p
            nd.append(p)
            last_ctrl = None
        last_cmd = up
    flush()
    return subs, nodes


def shape_polylines(el, m: Matrix) -> tuple[list[list[tuple[float, float]]], list[list[tuple[float, float]]]]:
    """Polylines and nodes (page px) of a path / rect / ellipse / circle."""
    tag = etree.QName(el).localname
    if tag == "path":
        subs, nodes = _walk(el.get("d") or "")
    elif tag == "rect":
        x, y = float(el.get("x", 0)), float(el.get("y", 0))
        w, h = float(el.get("width", 0)), float(el.get("height", 0))
        subs = [[(x, y), (x + w, y), (x + w, y + h), (x, y + h), (x, y)]]
        nodes = subs
    elif tag in ("ellipse", "circle"):
        cx, cy = float(el.get("cx", 0)), float(el.get("cy", 0))
        rx = float(el.get("rx", el.get("r", 0)))
        ry = float(el.get("ry", el.get("r", 0)))
        subs = [[(cx + rx * math.cos(2 * math.pi * k / 48), cy + ry * math.sin(2 * math.pi * k / 48)) for k in range(49)]]
        nodes = [[]]
    else:
        return [], []
    tr = lambda pl: [apply(m, x, y) for x, y in pl]  # noqa: E731
    return [tr(p) for p in subs], [tr(p) for p in nodes]


# --- text ----------------------------------------------------------------------


def _style(el) -> dict[str, str]:
    out = {}
    for part in (el.get("style") or "").split(";"):
        if ":" in part:
            k, v = part.split(":", 1)
            out[k.strip()] = v.strip()
    for k in ("font-weight", "font-style", "font-size", "font-family", "fill", "direction", "writing-mode", "text-anchor"):
        if el.get(k) is not None:
            out[k] = el.get(k)
    return out


def _runs(el, inherited: dict, out: list):
    """Collect (text, bold, italic, size) runs below `el`, one list per
    paragraph is handled by the caller."""
    st = {**inherited, **_style(el)}
    bold = st.get("font-weight", "normal") in ("bold", "bolder", "600", "700", "800", "900")
    italic = st.get("font-style", "normal") in ("italic", "oblique")
    size = st.get("font-size", "")
    if el.text:
        out.append((el.text, bold, italic, size))
    for ch in el:
        if not isinstance(ch.tag, str):
            continue
        name = etree.QName(ch).localname
        if name in ("flowRegion", "flowRegionExclude", "title", "desc"):
            if ch.tail:
                out.append((ch.tail, bold, italic, size))
            continue
        _runs(ch, st, out)
        if ch.tail:
            out.append((ch.tail, bold, italic, size))


@dataclass
class TextBlock:
    id: str
    layer: str
    paras: list[list[tuple[str, bool, bool, str]]]  # runs per line/paragraph
    box: tuple[float, float, float, float]  # page px bbox of the region / estimate
    centre: tuple[float, float]
    rotate: float
    style: dict = field(default_factory=dict)

    @property
    def plain(self) -> str:
        return " ".join("".join(r[0] for r in p).strip() for p in self.paras if "".join(r[0] for r in p).strip())


@dataclass
class Balloon:
    id: str
    polys: list[list[tuple[float, float]]]
    nodes: list[list[tuple[float, float]]]
    fill: str
    stroke: str
    bbox: tuple[float, float, float, float]


def _bbox(pts):
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return (min(xs), min(ys), max(xs), max(ys))


def read_svg(path: str) -> tuple[list[Balloon], list[TextBlock]]:
    root = etree.parse(path).getroot()
    balloons: list[Balloon] = []
    texts: list[TextBlock] = []

    def visit(el, m: Matrix, layer: str | None, st: dict):
        if not isinstance(el.tag, str):
            return
        name = etree.QName(el).localname
        m2 = mul(m, parse_transform(el.get("transform")))
        st2 = {**st, **_style(el)}
        if name in ("g", "svg"):
            lab = el.get(INK_LABEL) if el.get(INK_MODE) == "layer" else None
            if (st2.get("display") == "none") and lab is None:
                return
            for ch in el:
                visit(ch, m2, lab or layer, st2)
            return
        if layer not in ("speechbubbles", "txt"):
            return
        if st2.get("display") == "none":
            return
        if name in ("path", "rect", "ellipse", "circle"):
            subs, nodes = shape_polylines(el, m2)
            if not subs:
                return
            allp = [p for s in subs for p in s]
            balloons.append(Balloon(el.get("id") or "", subs, nodes, st2.get("fill", ""), st2.get("stroke", ""), _bbox(allp)))
        elif name == "flowRoot":
            region = el.find(f"{SVG}flowRegion")
            rect = region.find(f".//{SVG}rect") if region is not None else None
            paras = []
            for para in el.iter(f"{SVG}flowPara", f"{SVG}flowDiv"):
                runs: list = []
                _runs(para, st2, runs)
                paras.append(runs)
            if not any("".join(r[0] for r in p).strip() for p in paras):
                return
            if rect is not None:
                rm = mul(m2, parse_transform(rect.get("transform")))
                x, y = float(rect.get("x", 0)), float(rect.get("y", 0))
                w, h = float(rect.get("width", 0)), float(rect.get("height", 0))
                # Text fills the region from the top: estimate the used height.
                fs = _font_px(st2)
                used = min(h, max(fs * 1.25 * len(paras), fs))
                corners = [apply(rm, x, y), apply(rm, x + w, y), apply(rm, x + w, y + used), apply(rm, x, y + used)]
                bb = _bbox(corners)
                c = apply(rm, x + w / 2, y + used / 2)
                texts.append(TextBlock(el.get("id") or "", layer, paras, bb, c, rotation_deg(rm), st2))
        elif name == "text":
            paras = []
            pts = []
            fs = _font_px(st2)
            tm = m2
            tspans = [t for t in el if isinstance(t.tag, str) and etree.QName(t).localname == "tspan"]
            if tspans:
                for t in tspans:
                    runs: list = []
                    _runs(t, st2, runs)
                    paras.append(runs)
                    if t.get("x") is not None and t.get("y") is not None:
                        pts.append((float(t.get("x").split()[0]), float(t.get("y").split()[0])))
            else:
                runs = []
                _runs(el, st2, runs)
                paras.append(runs)
            if el.get("x") is not None and el.get("y") is not None:
                pts.append((float(el.get("x").split()[0]), float(el.get("y").split()[0])))
            if not any("".join(r[0] for r in p).strip() for p in paras) or not pts:
                return
            # Rough extent: baseline points, one em above, a guess at the width.
            chars = max(len("".join(r[0] for r in p)) for p in paras)
            anchor = st2.get("text-anchor", "start")
            w = 0.5 * fs * chars
            x0 = min(p[0] for p in pts) - (w / 2 if anchor == "middle" else w if anchor == "end" else 0)
            y0 = min(p[1] for p in pts) - fs
            y1 = max(p[1] for p in pts) + 0.25 * fs
            corners = [apply(tm, x0, y0), apply(tm, x0 + w, y0), apply(tm, x0 + w, y1), apply(tm, x0, y1)]
            bb = _bbox(corners)
            c = apply(tm, x0 + w / 2, (y0 + y1) / 2)
            texts.append(TextBlock(el.get("id") or "", layer, paras, bb, c, rotation_deg(tm), st2))

    visit(root, IDENTITY, None, {})
    return balloons, texts


def _font_px(st: dict) -> float:
    v = st.get("font-size", "40px")
    mm = re.match(r"([\d.]+)\s*(px|pt)?", v)
    if not mm:
        return 40.0
    n = float(mm.group(1))
    return n * (1.25 if mm.group(2) == "pt" else 1)


def point_in_poly(x: float, y: float, poly: list[tuple[float, float]]) -> bool:
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-9) + xi:
            inside = not inside
        j = i
    return inside
