#!/usr/bin/env python3
"""Panel art for the Cookbook comics recipes (issue #573).

`prompts/<cast>.json` (committed) holds, per cast, the style line, the
reference sheets and every panel prompt. Pictures carry no lettering, no
balloons and no panel borders: Postext letters every edition itself.

    python3 generate.py --art ART_DIR prompts/lighthouse.json [--only id,id] [--force] [--dry]

Each item is painted with GPT Image 2.5 through the fal.ai queue:

- `"endpoint": "t2i"` → `openai/gpt-image-2.5/sunburst/text-to-image`
  (reference sheets, first pictures of a setting);
- `"endpoint": "edit"` → `openai/gpt-image-2.5/sunburst/edit` with `refs`
  (paths under ART_DIR, usually crops holding ONE character of a sheet) sent
  as `image_urls`, so the cast stays the same from panel to panel.

Outputs land at ART_DIR/<item.out> (PNG); every call is appended to
ART_DIR/log.jsonl (endpoint, prompt, refs, size, request id, cost estimate).
Existing outputs are kept unless --force. FAL_KEY comes from the environment
or the repository's .env and is never printed.

Whole pipeline, per cast (lighthouse, kendo, neko, mercado, pipotto):

    generate.py  --art A prompts/C.json --only sheet-cast[,sheet-setting]
    postprocess.py --art A crops prompts/C.json       # one character per ref
    generate.py  --art A prompts/C.json               # every panel (edit)
    postprocess.py --art A shrink <slugs…>            # JPEG ≤ 160 KB each
    postprocess.py --art A pops prompts/lighthouse.json
    postprocess.py --art A grid <slug>                # read anchors by eye
    anchors.py A                                      # manifest.json
    postprocess.py --art A check|contact <slug>
    postprocess.py --art A reuse comic-page-splitters comic-epub-guided-view
    postprocess.py --art A reuse comic-page-splitters one-page-six-languages

(The neko `customer` reference is cut from panel n5, so n7–n8 run after it.)
The lettering scripts (script.<locale>.md) live next to the pictures in A.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
ENDPOINTS = {
    "t2i": "openai/gpt-image-2.5/sunburst/text-to-image",
    "edit": "openai/gpt-image-2.5/sunburst/edit",
}
# Canonical price of one `high` picture per megapixel (fal model page, 2026-10):
# 1024×1024 ≈ $0.053, 1536×1024 ≈ $0.041; reference images add input tokens.
HIGH_PER_MP = 0.045
REF_COST = 0.006


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


def _request(url: str, key: str, body: dict | None = None, method: str | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Authorization": f"Key {key}", "Content-Type": "application/json"},
        method=method or ("POST" if data else "GET"),
    )
    try:
        return json.load(urllib.request.urlopen(req, timeout=180))
    except urllib.error.HTTPError as e:
        return {"_error": e.code, "_body": e.read().decode("utf-8", "replace")[:800]}


def _ref_payload(path: str, max_side: int = 1024) -> tuple[bytes, str]:
    """A reference picture, downscaled (PNG keeps transparency)."""
    from PIL import Image

    im = Image.open(path)
    im.thumbnail((max_side, max_side), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    return buf.getvalue(), "image/png"


def upload_ref(path: str, key: str, cache: dict) -> str:
    """fal storage URL of a local reference (cached by content hash);
    falls back to a data URI when the upload API refuses."""
    data, ctype = _ref_payload(path)
    digest = hashlib.sha256(data).hexdigest()
    if digest in cache:
        return cache[digest]
    init = _request(
        "https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3",
        key,
        {"content_type": ctype, "file_name": os.path.basename(path)},
    )
    if "upload_url" in init:
        req = urllib.request.Request(init["upload_url"], data=data, headers={"Content-Type": ctype}, method="PUT")
        urllib.request.urlopen(req, timeout=180).read()
        url = init["file_url"]
    else:
        print("upload refused, using a data URI:", init.get("_error"), file=sys.stderr)
        url = f"data:{ctype};base64," + base64.b64encode(data).decode()
    cache[digest] = url
    return url


def cost_estimate(item: dict) -> float:
    w, h = item["size"]
    q = {"low": 0.1, "medium": 0.25, "high": 1.0, "xhigh": 1.8, "max": 4.0}[item.get("quality", "high")]
    return round(HIGH_PER_MP * q * (w * h) / 1e6 + REF_COST * len(item.get("refs", [])), 4)


def build_body(spec: dict, item: dict, ref_urls: list[str]) -> dict:
    parts = [item["prompt"]]
    if not item.get("raw"):
        parts.insert(0, spec["style"])
        parts.append(item.get("suffix", spec["suffix"]))
    body = {
        "prompt": " ".join(p for p in parts if p),
        "image_size": {"width": item["size"][0], "height": item["size"][1]},
        "quality": item.get("quality", spec.get("quality", "high")),
        "num_images": 1,
        "output_format": "png",
        "background": item.get("background", "opaque"),
    }
    if ref_urls:
        body["image_urls"] = ref_urls
    return body


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("spec")
    ap.add_argument("--art", required=True, help="output root (not committed)")
    ap.add_argument("--only", default="")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    spec = json.load(open(a.spec, encoding="utf-8"))
    only = {s for s in a.only.split(",") if s}
    key = fal_key()
    cache_path = os.path.join(a.art, ".ref-urls.json")
    cache = json.load(open(cache_path)) if os.path.exists(cache_path) else {}
    log = open(os.path.join(a.art, "log.jsonl"), "a", encoding="utf-8")
    pending = {}
    for item in spec["items"]:
        if only and item["id"] not in only:
            continue
        out = os.path.join(a.art, item["out"])
        if os.path.exists(out) and not a.force:
            continue
        ep = ENDPOINTS[item.get("endpoint", "edit" if item.get("refs") else "t2i")]
        refs = [os.path.join(a.art, r) for r in item.get("refs", [])]
        if a.dry:
            print(item["id"], ep, item["size"], [os.path.basename(r) for r in refs], cost_estimate(item))
            print("  ", build_body(spec, item, [])["prompt"][:600])
            continue
        urls = [upload_ref(r, key, cache) for r in refs]
        json.dump(cache, open(cache_path, "w"))
        body = build_body(spec, item, urls)
        sub = _request(f"https://queue.fal.run/{ep}", key, body)
        if "_error" in sub:
            print("SUBMIT FAILED", item["id"], sub, file=sys.stderr)
            continue
        pending[item["id"]] = (item, sub, body, ep, out, time.time())
        print("submitted", item["id"], sub.get("request_id"), flush=True)
    while pending:
        time.sleep(8)
        for iid, (item, sub, body, ep, out, t0) in list(pending.items()):
            st = _request(sub["status_url"], key)
            if st.get("status") != "COMPLETED":
                continue
            res = _request(sub["response_url"], key)
            del pending[iid]
            images = res.get("images") or []
            entry = {
                "time": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "cast": spec.get("cast"),
                "id": iid,
                "endpoint": ep,
                "prompt": body["prompt"],
                "refs": item.get("refs", []),
                "size": item["size"],
                "quality": body["quality"],
                "background": body["background"],
                "requestId": sub.get("request_id"),
                "costEstimateUSD": cost_estimate(item),
                "seconds": round(time.time() - t0),
                "ok": bool(images),
            }
            if not images:
                entry["error"] = json.dumps(res)[:800]
                print("NO IMAGE", iid, entry["error"], file=sys.stderr)
            else:
                os.makedirs(os.path.dirname(out), exist_ok=True)
                data = urllib.request.urlopen(
                    urllib.request.Request(images[0]["url"], headers={"User-Agent": "postext-presets/1.0"}), timeout=300
                ).read()
                with open(out, "wb") as f:
                    f.write(data)
                print("done", iid, out, flush=True)
            log.write(json.dumps(entry, ensure_ascii=False) + "\n")
            log.flush()


if __name__ == "__main__":
    main()
