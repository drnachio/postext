#!/usr/bin/env python3
"""Pictures of the `kokoro` bundle. `plates.json` (committed) lists them all.

No illustrated edition of こころ is in the public domain (the 1914 serial
ran without pictures), so the book is illustrated with what Sōseki made
himself and with scenes painted to match:

- **scans** (NDL Digital Collections, public domain): his own designs for
  the 1914 first edition (title-page woodblock cut by 伊上凡骨, its facing
  seal, the cover label, the endpaper roundels, the colophon's leaf frame,
  taken from the 1914 copy or the cleaner 1917 printing) and four of his
  paintings from 『漱石遺墨集』 (1935) for the part openers;
- **scenes**: eleven plates generated in the manner of those paintings (sumi
  line, pale mineral washes, bare paper), one per chosen section, credited
  "Generated With Diffusion Models". K's death and Sensei's are never shown;
  where the story needs them the plates show the rooms and the objects.

    python3 plates.py check      # every scene anchor is in its section (needs text.py's sources)
    python3 plates.py generate   # the scenes, through the fal.ai queue API → source/generated/<id>.png
                                 # (FAL_KEY from the environment or the repository's .env;
                                 #  existing files are kept, --force to paint one again: --only ID)
    python3 plates.py process    # scans and scenes → work/plates/<id>.jpg + work/pictures.json
    python3 plates.py sheet      # work/plates-sheet.jpg, a contact sheet to look at

Processing. Every picture is set on the book's paper (`paper` in
plates.json): the generated scenes are painted on white, their near-white
is pushed to pure white and the picture multiplied by the paper colour; the
woodblocks and microfilm pages are levelled (paper to white, ink to black)
and mapped between the ink and paper colours; Sōseki's paintings are
white-balanced from the album's page tone to the book's paper, so the
painting keeps its colours and loses the 1935 paper's yellow. Library stamps
on the 1914 title page are light grey on white and vanish in the levels; the
colophon frame has its printed panel cleared for this edition's colophon.
JPEG q80, at most 3000 px on the long side.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.request

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
SOURCE = os.path.join(HERE, "source")
WORK = os.path.join(HERE, "work")
SPEC = os.path.join(HERE, "plates.json")
GENERATED = os.path.join(SOURCE, "generated")
OUT = os.path.join(WORK, "plates")


def spec() -> dict:
    return json.load(open(SPEC, encoding="utf-8"))


def hex_rgb(h: str) -> np.ndarray:
    return np.array([int(h[i : i + 2], 16) for i in (1, 3, 5)], dtype=np.float32)


# --- anchors -----------------------------------------------------------------------


def check() -> dict:
    """The section of every scene's anchor phrase, which must be the one
    plates.json names (build.py places the plate before the paragraph that
    holds the phrase)."""
    sys.path.insert(0, HERE)
    import text as T  # noqa: E402

    doc = T.aozora.convert(T.NOVEL).doc
    secs = {s["id"]: s for p in T.split_parts(doc) for s in p["sections"]}
    found = {}
    bad = []
    for sc in spec()["scenes"]:
        where = [sid for sid, s in secs.items() if any(sc["anchor"] in b.plain for b in s["blocks"])]
        found[sc["id"]] = where
        if where != [sc["section"]]:
            bad.append((sc["id"], sc["section"], where))
    if bad:
        raise SystemExit(f"anchors not found where plates.json says: {bad}")
    print(f"{len(found)} anchors found in their sections")
    return found


# --- generation ---------------------------------------------------------------------


def fal_key() -> str:
    key = os.environ.get("FAL_KEY")
    if key:
        return key
    for env in (os.path.join(REPO, ".env"), "/Users/ignacioferropicon/dev/postext/.env"):
        if os.path.exists(env):
            for line in open(env, encoding="utf-8"):
                if line.startswith("FAL_KEY="):
                    return line.split("=", 1)[1].strip().strip('"')
    raise SystemExit("FAL_KEY is not set")


def _request(url: str, key: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method="POST" if body is not None else "GET", headers={"Authorization": f"Key {key}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())


def prompt_of(s: dict, sc: dict) -> str:
    return f"{sc['prompt']} {s['palettes'][sc['part']]} {s['style']}"


def generate(only: list[str] | None, force: bool) -> None:
    """Paint each scene through the fal.ai queue: submit, poll the status,
    fetch the result, download the PNG. The prompt sent is recorded next to
    the picture (`<id>.json`)."""
    s = spec()
    gen = s["generator"]
    key = fal_key()
    os.makedirs(GENERATED, exist_ok=True)
    base = f"https://queue.fal.run/{gen['endpoint']}"
    pending = {}
    for sc in s["scenes"]:
        if only and sc["id"] not in only:
            continue
        path = os.path.join(GENERATED, sc["id"] + ".png")
        if os.path.exists(path) and not force:
            continue
        body = {"prompt": prompt_of(s, sc), "image_size": {"width": gen["size"][0], "height": gen["size"][1]}, "quality": gen["quality"], "num_images": 1, "output_format": "png", "background": "opaque"}
        sub = _request(base, key, body)
        pending[sc["id"]] = (sub, body)
        print("submitted", sc["id"], sub.get("request_id"))
    while pending:
        time.sleep(10)
        for sid, (sub, body) in list(pending.items()):
            st = _request(sub["status_url"], key)
            if st.get("status") != "COMPLETED":
                continue
            res = _request(sub["response_url"], key)
            images = res.get("images") or []
            del pending[sid]
            if not images:
                print("NO IMAGE", sid, json.dumps(res)[:300], file=sys.stderr)
                continue
            img = urllib.request.urlopen(urllib.request.Request(images[0]["url"], headers={"User-Agent": "postext-presets/1.0"}), timeout=300).read()
            with open(os.path.join(GENERATED, sid + ".png"), "wb") as f:
                f.write(img)
            with open(os.path.join(GENERATED, sid + ".json"), "w", encoding="utf-8") as f:
                json.dump({"endpoint": gen["endpoint"], "request": body, "requestId": sub.get("request_id"), "date": time.strftime("%Y-%m-%d")}, f, ensure_ascii=False, indent=1)
            print("done", sid, images[0].get("width"), images[0].get("height"))


# --- processing ----------------------------------------------------------------------


def _fit(im: Image.Image, max_side: int) -> Image.Image:
    if max(im.size) <= max_side:
        return im
    s = max_side / max(im.size)
    return im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)


def _ink_on_paper(grey: np.ndarray, ink: np.ndarray, paper: np.ndarray) -> Image.Image:
    """`grey` in 0…1 (1 = paper) mapped between the ink and paper colours."""
    v = grey[..., None]
    return Image.fromarray(np.clip(ink + (paper - ink) * v, 0, 255).astype(np.uint8), "RGB")


def process_scan(item: dict, s: dict) -> Image.Image:
    paper, ink = hex_rgb(s["paper"]), hex_rgb(s["ink"])
    src = Image.open(os.path.join(SOURCE, item["source"]))
    x0, y0, x1, y1 = item["box"]
    if item["kind"] == "painting":
        rgb = np.asarray(src.convert("RGB"), dtype=np.float32)
        sx0, sy0, sx1, sy1 = item["paperSample"]
        page = np.median(rgb[sy0:sy1, sx0:sx1].reshape(-1, 3), axis=0)
        crop = rgb[y0:y1, x0:x1]
        if item.get("trim"):
            crop = _trim_plate(crop, page)
        # White balance: the album page → the book's paper, keeping the
        # painting's colours relative to its ground.
        out = np.clip(crop / page * paper, 0, 255).astype(np.uint8)
        return Image.fromarray(out, "RGB")
    g = np.asarray(src.convert("L"), dtype=np.float32)[y0:y1, x0:x1]
    if item["kind"] == "woodblock":
        lo, hi = item.get("levels", [60, 125])
    else:  # document: keep the tones, paper to white
        lo, hi = float(np.percentile(g, 1)), float(np.percentile(g, 75))
    v = np.clip((g - lo) / max(1.0, hi - lo), 0, 1)
    for cx0, cy0, cx1, cy1 in item.get("clear", []):
        v[cy0 - y0 : cy1 - y0, cx0 - x0 : cx1 - x0] = 1.0
    return _ink_on_paper(v, ink, paper)


def _trim_plate(crop: np.ndarray, page: np.ndarray) -> np.ndarray:
    """Cut a collotype plate out of the page around it: the rows and columns
    whose median differs from the page tone."""
    diff = np.abs(crop - page).sum(axis=2)
    rows = np.where(np.median(diff, axis=1) > 18)[0]
    cols = np.where(np.median(diff, axis=0) > 18)[0]
    if len(rows) < 10 or len(cols) < 10:
        return crop
    pad = 4  # inside the plate's edge
    return crop[rows[0] + pad : rows[-1] + 1 - pad, cols[0] + pad : cols[-1] + 1 - pad]


def process_scene(sc: dict, s: dict) -> Image.Image | None:
    """A generated picture on the book's paper. The model paints on a white
    that is not quite white (a faint grey or warm texture, 225–246 in the
    margins): each channel is first scaled so the margins' paper reads 255,
    then near-white is pushed to pure white (a soft ramp from 232 to 248 in
    luminance, so the edges of the washes keep their gradation), and the
    picture is multiplied by the paper colour."""
    path = os.path.join(GENERATED, sc["id"] + ".png")
    if not os.path.exists(path):
        return None
    rgb = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)
    m = max(8, min(rgb.shape[:2]) // 25)
    border = np.concatenate([rgb[:m].reshape(-1, 3), rgb[-m:].reshape(-1, 3), rgb[:, :m].reshape(-1, 3), rgb[:, -m:].reshape(-1, 3)])
    white = np.percentile(border, 75, axis=0)
    rgb = np.clip(rgb / white * 255, 0, 255)
    lum = rgb @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    t = np.clip((lum - 232) / (248 - 232), 0, 1)[..., None]
    rgb = rgb * (1 - t) + 255 * t
    out = rgb / 255 * hex_rgb(s["paper"])
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGB")


def process() -> None:
    s = spec()
    os.makedirs(OUT, exist_ok=True)
    meta = json.load(open(os.path.join(SOURCE, "ndl", "meta.json"), encoding="utf-8"))
    pictures = []
    for item in s["scans"]:
        im = _fit(process_scan(item, s), s["maxSide"])
        im.save(os.path.join(OUT, item["id"] + ".jpg"), quality=s["jpegQuality"], optimize=True, progressive=True)
        m = meta[item["source"]]
        pictures.append({
            "id": item["id"], "file": f"plates/{item['id']}.jpg", "width": im.width, "height": im.height,
            "kind": item["kind"], "part": item.get("part"), "use": item["use"], "caption": item["caption"], "alt": item["alt"],
            "credit": item["credit"], "source": m["page"], "image": m["image"], "licence": m["licence"],
        })
        print(f"{item['id']:30} {im.width}×{im.height}")
    for sc in s["scenes"]:
        im = process_scene(sc, s)
        if im is None:
            print(f"{sc['id']:30} (not generated yet)")
            continue
        im = _fit(im, s["maxSide"])
        im.save(os.path.join(OUT, sc["id"] + ".jpg"), quality=s["jpegQuality"], optimize=True, progressive=True)
        pictures.append({
            "id": sc["id"], "file": f"plates/{sc['id']}.jpg", "width": im.width, "height": im.height, "kind": "scene",
            "part": sc["part"], "section": sc["section"], "anchor": sc["anchor"], "caption": sc["caption"], "alt": sc["alt"],
            "credit": s["generator"]["credit"], "licence": "",
        })
        print(f"{sc['id']:30} {im.width}×{im.height}")
    with open(os.path.join(WORK, "pictures.json"), "w", encoding="utf-8") as f:
        json.dump({"paper": s["paper"], "ink": s["ink"], "pictures": pictures}, f, ensure_ascii=False, indent=1)
    total = sum(os.path.getsize(os.path.join(OUT, p["id"] + ".jpg")) for p in pictures)
    print(f"{len(pictures)} pictures, {total / 1e6:.1f} MB")


def sheet() -> None:
    files = sorted(f for f in os.listdir(OUT) if f.endswith(".jpg"))
    w, h, cols = 300, 420, 6
    rows = (len(files) + cols - 1) // cols
    S = Image.new("RGB", (cols * w, rows * (h + 24)), "#888888")
    d = ImageDraw.Draw(S)
    font = ImageFont.load_default()
    for k, f in enumerate(files):
        im = Image.open(os.path.join(OUT, f))
        im.thumbnail((w - 10, h - 10))
        x, y = (k % cols) * w, (k // cols) * (h + 24)
        S.paste(im, (x + (w - im.width) // 2, y + 24 + (h - im.height) // 2))
        d.text((x + 4, y + 6), f[:-4], fill="white", font=font)
    S.save(os.path.join(WORK, "plates-sheet.jpg"), quality=85)
    print(os.path.join(WORK, "plates-sheet.jpg"))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=["check", "generate", "process", "sheet"])
    ap.add_argument("--only", nargs="*", help="scene ids (generate)")
    ap.add_argument("--force", action="store_true", help="paint again even if the file exists")
    a = ap.parse_args()
    if a.command == "check":
        check()
    elif a.command == "generate":
        generate(a.only, a.force)
    elif a.command == "process":
        process()
    else:
        sheet()


if __name__ == "__main__":
    main()
