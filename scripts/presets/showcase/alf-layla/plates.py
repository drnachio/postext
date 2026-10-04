#!/usr/bin/env python3
"""Pictures of the `alf-layla` bundle.

The plates are Sani ol-Molk's watercolours for the Persian translation of the
Nights (هزار و یک شب, Golestan Palace Library MS 2240, 1849–56): the 23
manuscript pages of volume 1 on Wikimedia Commons, each holding two to six
framed panels with a Persian caption in a cartouche above. `plates.json`
lists the panels chosen, as boxes in fractions of the page (inside the
painted frame), with the caption transcribed (`captionFa`, nastaʿlīq read
from the scan; `…` where it could not be read), an Arabic caption of ours
(`caption`) and the tale it shows (a tales.json id). Volume 1 of the
manuscript covers Bulaq volume 1 only, so the later tales come from William
Harvey's wood engravings for Lane's translation (1839–41); two of those are
arabesque ornaments for openers.

    python3 fetch.py            # downloads the pages (source/plates)
    python3 plates.py           # crops → work/plates/<id>.jpg, work/plates/plates.json
                                # (anchor night, credit, licence), work/plates/sheet.jpg

Crops keep the source resolution (the panels are 1,300–1,500 px wide; the
long side is capped at 3,000 px) and are saved as JPEG q80. `find`, when a
plate has one, is a phrase (without tashkīl) searched in the plate's tale to
name the night the picture belongs to; otherwise the tale's first night.
"""
from __future__ import annotations

import json
import os
import re
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "source")
WORK = os.path.join(HERE, "work", "plates")
SPEC = os.path.join(HERE, "plates.json")
MAX_SIDE = 3000
QUALITY = 80
BUDGET_MB = 20

HARAKAT = re.compile("[ً-ٰٟـ]")


def bare(s: str) -> str:
    return HARAKAT.sub("", s)


def tale_spans(data: dict) -> dict[str, list[dict]]:
    """The paragraphs of every tale (its own and those of the tales inside
    it), in reading order."""
    parent = {t["id"]: t.get("parent") for t in data["tales"]}
    spans: dict[str, list[dict]] = {}
    current: str | None = None
    for b in data["blocks"]:
        if b["type"] == "tale" and not b.get("repeat"):
            current = b["id"]
        if b["type"] != "p" or current is None:
            continue
        tid = current
        while tid:
            spans.setdefault(tid, []).append(b)
            tid = parent.get(tid)
    return spans


def anchor(plate: dict, spans: dict, tales: dict) -> dict:
    tid = plate.get("tale")
    if not tid:
        return {}
    if tid not in tales:
        raise SystemExit(f"{plate['id']}: unknown tale {tid}")
    paras = spans.get(tid, [])
    hit = None
    if plate.get("find"):
        pat = re.compile(re.escape(bare(plate["find"])).replace(r"\ ", r"\s+"))
        hit = next((b for b in paras if pat.search(bare("".join(r if isinstance(r, str) else "" for r in b["runs"])))), None)
        if hit is None:
            print(f"  {plate['id']}: «{plate['find']}» not found in {tid}", file=sys.stderr)
    b = hit or (paras[0] if paras else None)
    out = {"taleTitle": tales[tid]["title"], "volume": tales[tid]["volume"]}
    if b:
        out["night"] = b["night"]
        out["src"] = b["src"]
        if hit:
            text = "".join(r if isinstance(r, str) else "" for r in b["runs"])
            i = bare(text).find(bare(plate["find"]))
            out["fragment"] = bare(text)[max(0, i - 20): i + 60] if i >= 0 else None
    return out


def crop(plate: dict) -> Image.Image:
    im = Image.open(os.path.join(SOURCE, "plates", plate["file"])).convert("RGB")
    if "box" in plate:
        w, h = im.size
        x0, y0, x1, y1 = plate["box"]
        im = im.crop((round(x0 * w), round(y0 * h), round(x1 * w), round(y1 * h)))
    if max(im.size) > MAX_SIDE:
        im.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    return im


def main() -> None:
    spec = json.load(open(SPEC, encoding="utf-8"))
    meta = json.load(open(os.path.join(SOURCE, "plates", "meta.json"), encoding="utf-8"))
    data = json.load(open(os.path.join(SOURCE, "text.json"), encoding="utf-8"))
    tales = {t["id"]: t for t in data["tales"]}
    spans = tale_spans(data)
    os.makedirs(WORK, exist_ok=True)
    out, total, thumbs = [], 0, []
    for plate in spec["plates"]:
        im = crop(plate)
        path = os.path.join(WORK, plate["id"] + ".jpg")
        im.save(path, quality=QUALITY, optimize=True, progressive=True)
        size = os.path.getsize(path)
        total += size
        src = spec["sources"][plate["source"]]
        m = meta["plates/" + plate["file"]]
        rec = {
            **{k: v for k, v in plate.items() if k not in ("box",)},
            "box": plate.get("box"),
            "width": im.size[0],
            "height": im.size[1],
            "bytes": size,
            "commonsPage": m["descriptionurl"],
            "license": m["license"],
            "artist": m["artist"] or src["artist"],
            "credit": src["credit"],
            "creditEn": src["creditEn"],
            **anchor(plate, spans, tales),
        }
        out.append(rec)
        t = im.copy()
        t.thumbnail((360, 260))
        thumbs.append((plate["id"], rec.get("night"), t))
    with open(os.path.join(WORK, "plates.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    # A contact sheet to review the crops.
    cols = 6
    rows = (len(thumbs) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * 370, rows * 290), "white")
    d = ImageDraw.Draw(sheet)
    for i, (pid, night, t) in enumerate(thumbs):
        x, y = (i % cols) * 370, (i // cols) * 290
        sheet.paste(t, (x + 5, y + 22))
        d.text((x + 5, y + 5), f"{pid}  n{night}", fill="red")
    sheet.save(os.path.join(WORK, "sheet.jpg"), quality=80)
    mb = total / 1e6
    print(f"{len(out)} plates, {mb:.1f} MB (budget {BUDGET_MB} MB) → {WORK}")
    if mb > BUDGET_MB:
        sys.exit("over the image budget")


if __name__ == "__main__":
    main()
