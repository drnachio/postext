"""The script of a page as language-independent *slots*: one slot per
balloon (or per free text: sound effect, writing in the art, narration),
built from the English SVG and transcript, with its speaker, its reading
order, its balloon body and tails and its panel. Every language's text
blocks are then sorted into these slots by geometry, so speaker ids and
panels are the same in every edition even where a translator renamed an
element, split a line in two or swapped two balloons.

    slots = page_slots('P05')            # canonical slots (English)
    texts = language_texts('ja', 'P05', slots)   # {slot id: text}
"""
from __future__ import annotations

import difflib
import math
import re
import unicodedata
from dataclasses import dataclass, field

from common import RTL, cache, load_json, out, svg_page
from svgread import Balloon, TextBlock, point_in_poly, read_svg

# Transcript names -> what the line becomes.
SPEAKERS = {"Pepper": "pepper", "Carrot": "carrot", "Monster": "monster"}
KINDS = {"Sound": "sfx", "Writing": "writing", "Narrator": "caption", "Title": "title", "Credits": "credits"}

TAIL_MIN_SIDE = 40   # page px: thinner shapes near a balloon are drips, not tails
TAIL_REACH = 60      # page px: a tail starts within this distance of its body


@dataclass
class Slot:
    id: str                      # 'P05-s1'
    kind: str                    # speech | sfx | writing | caption | title | credits
    speaker: str | None
    order: float                 # transcript position (English reading order)
    centre: tuple[float, float]
    box: tuple[float, float, float, float]
    body: Balloon | None = None
    tails: list[dict] = field(default_factory=list)   # {'id', 'tip', 'base'}
    blocks: list[TextBlock] = field(default_factory=list)
    panel: str | None = None     # panel id
    rotate: float = 0.0
    joined_with_previous: bool = False   # bodies linked by a connector (P04)


# --- transcript ------------------------------------------------------------------


def read_transcript(lang: str = "en") -> dict[str, list[dict]]:
    path = cache("lang", lang, f"ep08_{lang}_transcript.md")
    pages: dict[str, list[dict]] = {}
    cur = None
    for line in open(path, encoding="utf-8"):
        line = line.rstrip("\n")
        m = re.match(r"^### (P\d\d)", line)
        if m:
            cur = m.group(1)
            pages[cur] = []
            continue
        if cur and "|" in line and not line.startswith(("Name|", "----")):
            parts = line.split("|")
            if len(parts) >= 4 and parts[1].strip().isdigit():
                pages[cur].append({"name": parts[0].strip(), "pos": int(parts[1]), "concat": parts[2].strip() == "True", "text": "|".join(parts[3:]).strip()})
    return pages


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    return "".join(c for c in s.lower() if c.isalnum())


# --- geometry helpers ------------------------------------------------------------------


def poly_area(poly) -> float:
    a = 0.0
    for (x0, y0), (x1, y1) in zip(poly, poly[1:] + poly[:1]):
        a += x0 * y1 - x1 * y0
    return abs(a) / 2


def balloon_area(b: Balloon) -> float:
    return max(poly_area(p) for p in b.polys)


def contains(b: Balloon, x: float, y: float) -> bool:
    return any(point_in_poly(x, y, p) for p in b.polys)


def dist_to_balloon(b: Balloon, x: float, y: float) -> float:
    if contains(b, x, y):
        return 0.0
    return min(math.hypot(px - x, py - y) for p in b.polys for px, py in p)


def bbox_iou(a, b) -> float:
    ix = max(0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / ua if ua > 0 else 0.0


def bodies_of(balloons: list[Balloon], texts: list[TextBlock]) -> dict[str, Balloon]:
    """text id -> the balloon body that holds it (the largest shape that
    contains the text centre; connectors and tails are smaller)."""
    out_: dict[str, Balloon] = {}
    for t in texts:
        hits = [b for b in balloons if contains(b, *t.centre)]
        if hits:
            out_[t.id] = max(hits, key=balloon_area)
    return out_


def tails_for(body: Balloon, balloons: list[Balloon], bodies: list[Balloon]) -> list[dict]:
    """The tails of `body`: other shapes that start at its outline, are not
    bodies themselves, are wide enough (not a drip) and do not bridge two
    bodies (a connector). The tip is the tail point farthest from the body."""
    found = []
    for b in balloons:
        if b is body or any(b is o for o in bodies):
            continue
        w, h = b.bbox[2] - b.bbox[0], b.bbox[3] - b.bbox[1]
        if min(w, h) < TAIL_MIN_SIDE:
            continue
        pts = [p for poly in b.polys for p in poly]
        d_body = [dist_to_balloon(body, *p) for p in pts[:: max(1, len(pts) // 80)]]
        if min(d_body) > TAIL_REACH:
            continue
        # A connector touches two bodies.
        touching = [o for o in bodies if o is not body and min(dist_to_balloon(o, *p) for p in pts[:: max(1, len(pts) // 40)]) <= TAIL_REACH]
        if touching:
            continue
        ds = [(dist_to_balloon(body, *p), p) for p in pts]
        dmax, tip = max(ds, key=lambda t: t[0])
        near = [p for d, p in ds if d <= 8] or [min(ds, key=lambda t: t[0])[1]]
        base = (sum(p[0] for p in near) / len(near), sum(p[1] for p in near) / len(near))
        found.append({"id": b.id, "tip": tip, "base": base, "length": dmax, "bbox": b.bbox})
    return found


def connectors(balloons: list[Balloon], bodies: list[Balloon]) -> list[tuple[Balloon, Balloon]]:
    """Pairs of bodies linked by a connector shape (or overlapping)."""
    pairs = []
    for i, a in enumerate(bodies):
        for b in bodies[i + 1:]:
            linked = bbox_iou(a.bbox, b.bbox) > 0
            for c in balloons:
                if c is a or c is b or any(c is o for o in bodies):
                    continue
                pts = [p for poly in c.polys for p in poly][::4]
                if pts and min(dist_to_balloon(a, *p) for p in pts) < 10 and min(dist_to_balloon(b, *p) for p in pts) < 10:
                    linked = True
            if linked:
                pairs.append((a, b))
    return pairs


# --- panels ---------------------------------------------------------------------------


def panel_for(page_panels: list[dict], x: float, y: float) -> str:
    def d(p):
        b = p["box"]
        dx = max(b[0] - x, 0, x - b[2])
        dy = max(b[1] - y, 0, y - b[3])
        return math.hypot(dx, dy)
    return min(page_panels, key=d)["id"]


def load_panels() -> dict:
    return load_json(out("panels.json"))


# --- canonical slots ---------------------------------------------------------------------


def page_slots(page: str, panels: dict | None = None) -> list[Slot]:
    panels = panels or load_panels()
    page_panels = panels["pages"][page]["panels"]
    balloons, texts = read_svg(svg_page("en", page))
    rows = read_transcript("en").get(page, [])
    body_of = bodies_of(balloons, texts)
    bodies: list[Balloon] = []
    for b in body_of.values():
        if not any(b is o for o in bodies):
            bodies.append(b)

    def row_for(t: TextBlock) -> dict | None:
        n = norm(t.plain)
        best, score = None, 0.0
        for r in rows:
            s = difflib.SequenceMatcher(None, n, norm(r["text"])).ratio()
            if s > score:
                best, score = r, s
        return best if score >= 0.6 else None

    slots: list[Slot] = []
    by_body: dict[int, Slot] = {}
    for t in texts:
        row = row_for(t)
        name = row["name"] if row else "Narrator"
        pos = row["pos"] if row else 99
        body = body_of.get(t.id)
        if body is not None:
            key = id(body)
            if key not in by_body:
                s = Slot(f"{page}-b{len(by_body) + 1}", "speech", SPEAKERS.get(name, name.lower()), pos,
                         ((body.bbox[0] + body.bbox[2]) / 2, (body.bbox[1] + body.bbox[3]) / 2), body.bbox, body=body)
                by_body[key] = s
                slots.append(s)
            s = by_body[key]
            s.blocks.append(t)
            s.order = min(s.order, pos)
            continue
        kind = KINDS.get(name, "caption")
        if kind == "caption":
            prev = next((s for s in slots if s.kind == "caption"), None)
            if prev is not None:  # one narration box per page: title + FIN
                prev.blocks.append(t)
                prev.order = min(prev.order, pos)
                continue
        slots.append(Slot(f"{page}-t{len(slots) + 1}", kind, None, pos, t.centre, t.box, blocks=[t], rotate=t.rotate))

    for s in slots:
        if s.body is not None:
            s.tails = tails_for(s.body, balloons, bodies)
        s.panel = panel_for(page_panels, *s.centre)
    for a, b in connectors(balloons, bodies):
        sa = next(s for s in slots if s.body is a)
        sb = next(s for s in slots if s.body is b)
        later = sa if sa.order > sb.order else sb
        later.joined_with_previous = True
    slots.sort(key=lambda s: s.order)
    for i, s in enumerate(slots, start=1):  # stable, readable ids in reading order
        s.id = f"{page}-{i}"
    return slots


# --- per-language text --------------------------------------------------------------------

CJK = re.compile(r"[　-ヿ㐀-鿿豈-﫿＀-￯]")


def join_cjk_aware(parts: list[str]) -> str:
    out_ = ""
    for p in parts:
        p = p.strip()
        if not p:
            continue
        last, first = out_.rstrip("*")[-1:], p.lstrip("*")[:1]  # look through emphasis marks
        if out_ and not (CJK.search(last or " ") and CJK.search(first or " ")):
            out_ += " "
        out_ += p
    return out_


def style_shares(blocks: list[TextBlock]) -> tuple[float, float]:
    """Share of the characters set bold and italic over a whole balloon."""
    runs = [r for t in blocks for p in t.paras for r in p if r[0].strip()]
    n = sum(len(r[0].strip()) for r in runs) or 1
    return (sum(len(r[0].strip()) for r in runs if r[1]) / n, sum(len(r[0].strip()) for r in runs if r[2]) / n)


def block_text(t: TextBlock, kind: str, shares: tuple[float, float] | None = None) -> str:
    """The text of a block, paragraphs joined, emphasis as Markdown where a
    run differs from the balloon's dominant style (`shares`, see
    style_shares; default: the block's own)."""
    bold_share, ital_share = shares or style_shares([t])
    emphasis_ok = True
    paras = []
    for p in t.paras:
        s = ""
        for text, bold, italic, _size in p:
            text = re.sub(r"\s+", " ", text)
            core = text.strip()
            if not core:
                s += text
                continue
            mark = ""
            if emphasis_ok and kind not in ("sfx", "writing"):
                if bold and bold_share < 0.5:
                    mark = "**"
                elif italic and ital_share < 0.5:
                    mark = "*"
            if mark:
                lead = text[: len(text) - len(text.lstrip())]
                trail = text[len(text.rstrip()):]
                s += f"{lead}{mark}{core}{mark}{trail}"
            else:
                s += text
        paras.append(s.strip())
    if kind == "sfx" and all(len(p) <= 3 for p in paras if p):
        return "".join(paras)  # letters set one per paragraph to grow in size
    return join_cjk_aware(paras)


def tidy(s: str) -> str:
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"\*\*\s*\*\*", "", s)
    return s


def language_texts(lang: str, page: str, slots: list[Slot]) -> dict[str, str]:
    """{slot id: text} for `lang`: every text block is sorted into the slot
    whose balloon holds it (matched through the language's own balloon
    shapes), or for free text into the slot of the same element id, else
    the nearest free-text slot."""
    balloons, texts = read_svg(svg_page(lang, page))
    body_of = bodies_of(balloons, texts)
    speech = [s for s in slots if s.body is not None]
    free = [s for s in slots if s.body is None]

    def en_slot_for_body(b: Balloon) -> Slot | None:
        best = max(speech, key=lambda s: bbox_iou(s.body.bbox, b.bbox), default=None)
        if best is not None and bbox_iou(best.body.bbox, b.bbox) > 0.2:
            return best
        cx, cy = (b.bbox[0] + b.bbox[2]) / 2, (b.bbox[1] + b.bbox[3]) / 2
        return min(speech, key=lambda s: math.hypot(s.centre[0] - cx, s.centre[1] - cy), default=None)

    assigned: dict[str, list[TextBlock]] = {}
    for t in texts:
        slot = None
        body = body_of.get(t.id)
        if body is not None and speech:
            slot = en_slot_for_body(body)
        if slot is None:
            slot = next((s for s in free if any(b.id == t.id for b in s.blocks)), None)
        if slot is None and speech:
            near = min(speech, key=lambda s: dist_to_balloon(s.body, *t.centre))
            if dist_to_balloon(near.body, *t.centre) < 40:
                slot = near
        if slot is None and free:
            slot = min(free, key=lambda s: math.hypot(s.centre[0] - t.centre[0], s.centre[1] - t.centre[1]))
        if slot is None:
            continue
        assigned.setdefault(slot.id, []).append(t)

    rtl = lang in RTL
    result = {}
    for sid, blocks in assigned.items():
        slot = next(s for s in slots if s.id == sid)
        en_ids = [b.id for b in slot.blocks]
        if slot.kind == "caption" and all(b.id in en_ids for b in blocks):
            blocks.sort(key=lambda b: en_ids.index(b.id))  # title, then FIN
        else:
            blocks.sort(key=lambda b: (round(b.centre[1] / 40), -b.centre[0] if rtl else b.centre[0]))
        shares = style_shares(blocks)
        parts = [block_text(b, slot.kind, shares) for b in blocks]
        if slot.kind == "caption":
            result[sid] = "\n".join(tidy(p) for p in parts if p.strip())  # one line each
        else:
            result[sid] = tidy(join_cjk_aware(parts))
    return result


def reading_order(lang: str, slots: list[Slot]) -> list[Slot]:
    """Slots in the order a reader of `lang` meets them. The English
    transcript order holds for left-to-right editions; a right-to-left
    edition reads balloons that share a tier from right to left (the
    Arabic letterer moved the text accordingly, e.g. P06 panel 1)."""
    if lang not in RTL:
        return list(slots)
    by_panel: dict[str, list[Slot]] = {}
    for s in slots:
        by_panel.setdefault(s.panel, []).append(s)
    out_: list[Slot] = []
    for pid in dict.fromkeys(s.panel for s in slots):
        group = by_panel[pid]
        speech = [s for s in group if s.kind == "speech"]
        if len(speech) > 1:
            ordered = iter(rtl_tiers(speech))
            group = [next(ordered) if s.kind == "speech" else s for s in group]
        out_.extend(group)
    return out_


def rtl_tiers(slots: list[Slot]) -> list[Slot]:
    """Group balloons into tiers (vertical overlap of at least half the
    smaller height), tiers top to bottom, each tier right to left."""
    tiers: list[list[Slot]] = []
    for s in sorted(slots, key=lambda s: s.box[1]):
        for tier in tiers:
            t = tier[0]
            overlap = min(s.box[3], t.box[3]) - max(s.box[1], t.box[1])
            if overlap >= 0.5 * min(s.box[3] - s.box[1], t.box[3] - t.box[1]):
                tier.append(s)
                break
        else:
            tiers.append([s])
    return [s for tier in tiers for s in sorted(tier, key=lambda s: -s.centre[0])]
