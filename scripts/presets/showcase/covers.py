#!/usr/bin/env python3
"""Painted covers and spines of the right-bound showcase books (issue #472):
ألف ليلة وليلة (alf-layla), 紅樓夢 (hongloumeng) and こころ (kokoro).

`covers.json` (committed) holds the prompts. The pictures carry no lettering:
the titles are set by Postext over them, in each book's cover design
(`build.py`), and on the spines by `_common.render_spine`.

    python3 covers.py generate [--only ID] [--force]
        # GPT Image 2.5 through the fal.ai queue (FAL_KEY from the environment
        # or the repository's .env) → <book>/source/generated/<id>-<n>.png,
        # the request recorded next to each; existing files are kept
    python3 covers.py process
        # the chosen variant (`pick`) of each → <book>/art/ (committed): a
        # cover cropped to each edition's trim (`mm`, kept against the
        # `anchor` edge, `mirror`ed for a left-bound edition), a spine's
        # material (`tint`: its mean colour moved to that colour)

Then each build.py lays the art out; `patch_covers.py` splices the new
cover designs and spines into the committed bundles without a rebuild.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
SPEC = os.path.join(HERE, "covers.json")


def spec() -> dict:
    return json.load(open(SPEC, encoding="utf-8"))


def generated_dir(book: str) -> str:
    return os.path.join(HERE, book, "source", "generated")


# --- generation ----------------------------------------------------------------------


def fal_key() -> str:
    key = os.environ.get("FAL_KEY")
    if key:
        return key
    env = os.path.join(REPO, ".env")
    if os.path.exists(env):
        for line in open(env, encoding="utf-8"):
            if line.startswith("FAL_KEY="):
                return line.split("=", 1)[1].strip().strip('"')
    raise SystemExit("FAL_KEY is not set")


def _request(url: str, key: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers={"Authorization": f"Key {key}", "Content-Type": "application/json"}, method="POST" if data else "GET")
    return json.load(urllib.request.urlopen(req, timeout=120))


def generate(only: list[str] | None, force: bool) -> None:
    """Paint each picture: submit, poll the status, fetch the result,
    download the PNGs (`variants` of them, `<id>-<n>.png`)."""
    s = spec()
    gen = s["generator"]
    key = fal_key()
    base = f"https://queue.fal.run/{gen['endpoint']}"
    pending = {}
    for p in s["pictures"]:
        if only and p["id"] not in only:
            continue
        out = generated_dir(p["book"])
        if os.path.exists(os.path.join(out, f"{p['id']}-1.png")) and not force:
            continue
        os.makedirs(out, exist_ok=True)
        body = {
            "prompt": p["prompt"] + " " + s["noText"],
            "image_size": {"width": p["size"][0], "height": p["size"][1]},
            "quality": gen["quality"],
            "num_images": p.get("variants", 1),
            "output_format": "png",
            "background": "opaque",
        }
        sub = _request(base, key, body)
        pending[p["id"]] = (p, sub, body)
        print("submitted", p["id"], sub.get("request_id"))
    while pending:
        time.sleep(10)
        for pid, (p, sub, body) in list(pending.items()):
            st = _request(sub["status_url"], key)
            if st.get("status") != "COMPLETED":
                continue
            res = _request(sub["response_url"], key)
            images = res.get("images") or []
            del pending[pid]
            if not images:
                print("NO IMAGE", pid, json.dumps(res)[:300], file=sys.stderr)
                continue
            out = generated_dir(p["book"])
            for n, im in enumerate(images, 1):
                data = urllib.request.urlopen(urllib.request.Request(im["url"], headers={"User-Agent": "postext-presets/1.0"}), timeout=300).read()
                with open(os.path.join(out, f"{pid}-{n}.png"), "wb") as f:
                    f.write(data)
            with open(os.path.join(out, f"{pid}.json"), "w", encoding="utf-8") as f:
                json.dump({"endpoint": gen["endpoint"], "request": body, "requestId": sub.get("request_id"), "date": time.strftime("%Y-%m-%d")}, f, ensure_ascii=False, indent=1)
            print("done", pid, len(images))


# --- processing ----------------------------------------------------------------------


def _crop_to(im, ratio: float, anchor: str):
    """The largest box of width/height `ratio` in `im`, centred, or kept
    against its `anchor` edge ("left" / "right") when width is cut."""
    w, h = im.size
    if w / h > ratio:
        cw = round(h * ratio)
        x = 0 if anchor == "left" else w - cw if anchor == "right" else (w - cw) // 2
        return im.crop((x, 0, x + cw, h))
    ch = round(w / ratio)
    y = (h - ch) // 2
    return im.crop((0, y, w, y + ch))


def process() -> None:
    from PIL import Image, ImageOps
    import numpy as np

    s = spec()
    for p in s["pictures"]:
        src = Image.open(os.path.join(generated_dir(p["book"]), f"{p['id']}-{p['pick']}.png")).convert("RGB")
        t = p.get("trim", 0)
        if t:
            dx, dy = round(src.width * t), round(src.height * t)
            src = src.crop((dx, dy, src.width - dx, src.height - dy))
        for o in p["outputs"]:
            im = src
            if "mm" in o:
                im = _crop_to(im, o["mm"][0] / o["mm"][1], o.get("anchor", "centre"))
                h = s["coverHeightPx"]
                im = im.resize((round(im.width * h / im.height), h), Image.LANCZOS)
            elif im.height > s["spineHeightPx"]:
                h = s["spineHeightPx"]
                im = im.resize((round(im.width * h / im.height), h), Image.LANCZOS)
            if o.get("mirror"):
                im = ImageOps.mirror(im)
            if "tint" in o:
                a = np.asarray(im, dtype=np.float32)
                target = np.array([int(o["tint"][i : i + 2], 16) for i in (1, 3, 5)], dtype=np.float32)
                im = Image.fromarray((a * (target / a.reshape(-1, 3).mean(0))).clip(0, 255).astype(np.uint8))
            path = os.path.join(HERE, p["book"], o["file"])
            os.makedirs(os.path.dirname(path), exist_ok=True)
            im.save(path, quality=80, optimize=True, progressive=True)
            print(path, im.size, os.path.getsize(path) // 1024, "KB")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    g = sub.add_parser("generate")
    g.add_argument("--only", nargs="*")
    g.add_argument("--force", action="store_true")
    sub.add_parser("process")
    a = ap.parse_args()
    if a.cmd == "generate":
        generate(a.only, a.force)
    elif a.cmd == "process":
        process()


if __name__ == "__main__":
    main()
