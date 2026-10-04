#!/usr/bin/env python3
"""Download the sources of the `alf-layla` showcase preset (ألف ليلة وليلة)
into `source/` (git-ignored):

- the six volumes of the Hindawi edition (مؤسسة هنداوي, 2022: the Bulaq
  vulgate, lightly vocalised and punctuated), as EPUB. hindawi.org now
  redirects to safahat.org and both sit behind a Cloudflare challenge, so
  the files come from the Wayback Machine's raw `id_` captures. Requests are
  sequential, paced, and retried with a growing back-off (the archive
  answers bursts with 429);
- the OFL fonts: Amiri 1.003 (the release zip from aliftype/amiri, with
  Amiri Quran), Noto Naskh Arabic, Aref Ruqaa and Reem Kufi (google/fonts)
  and EB Garamond for the Latin credits page;
- the pictures: Sani ol-Molk's watercolours for the Persian translation
  (Golestan Palace Library MS 2240, 1849–56; the 23 manuscript pages on
  Wikimedia Commons) and the William Harvey woodcuts of Lane's translation
  (1839–41) that `plates.json` uses. plates.py crops them.

    python3 scripts/presets/showcase/alf-layla/fetch.py [--no-text] [--no-fonts] [--no-images]

Every download is recorded in `source/manifest.json` with its URL, size and
SHA-256; `source/plates/meta.json` holds the Commons page, licence and artist
of every picture. Files already present are kept (their checksum is checked
against the manifest), so the script can be re-run.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "source")
MANIFEST = os.path.join(SOURCE, "manifest.json")
UA = {"User-Agent": "postext-presets/1.0 (https://github.com/drnachio/postext)"}

# Hindawi book ids of the six volumes, with the Wayback capture used. The
# CDX index is asked again when a capture fails, so a newer one can stand in.
# Volume 3 has two captures with different files (2022: 36.9 MB, 2024:
# 29.4 MB); the 2024 one is the reissue with recompressed figures, same text.
HINDAWI = [
    (1, "61961973", "20240309110546"),
    (2, "36973840", "20250426000416"),
    (3, "85931905", "20241213163249"),
    (4, "39419251", "20250528173414"),
    (5, "75264279", "20250527135931"),
    (6, "27482482", "20250527140048"),
]
WAYBACK = "http://web.archive.org/web/{ts}id_/https://downloads.hindawi.org/books/{id}.epub"
CDX = "http://web.archive.org/cdx/search/cdx?url=downloads.hindawi.org/books/{id}.epub&output=json&filter=statuscode:200"

AMIRI_VERSION = "1.003"
AMIRI_ZIP = f"https://github.com/aliftype/amiri/releases/download/{AMIRI_VERSION}/Amiri-{AMIRI_VERSION}.zip"
GOOGLE_FONTS = [
    "notonaskharabic/NotoNaskhArabic[wght].ttf",
    "notonaskharabic/OFL.txt",
    # Ruqʿa for the night headings and running heads (a design option).
    "arefruqaa/ArefRuqaa-Regular.ttf",
    "arefruqaa/ArefRuqaa-Bold.ttf",
    "arefruqaa/OFL.txt",
    # Kufi for the title page and part titles (a design option).
    "reemkufi/ReemKufi[wght].ttf",
    "reemkufi/OFL.txt",
    "ebgaramond/EBGaramond[wght].ttf",
    "ebgaramond/EBGaramond-Italic[wght].ttf",
    "ebgaramond/OFL.txt",
]

COMMONS_API = "https://commons.wikimedia.org/w/api.php"
GOLESTAN_CATEGORY = "Category:One Thousand and One Nights (Golestan Palace Library)"
GOLESTAN_FILE = re.compile(r"^File:One Thousand and One Nights MS (\d+) - Saniolmolk\.jpg$")


# --- HTTP and manifest --------------------------------------------------------------


def get(url: str, timeout: int = 300) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def get_retry(url: str, attempts: int = 7, base_wait: float = 15) -> bytes:
    """Retry with a growing back-off: 15, 30, 60 s … (the Wayback Machine
    asks clients to slow down with 429 and sometimes drops connections on
    large files). A 404 is final."""
    for attempt in range(attempts):
        try:
            return get(url)
        except urllib.error.HTTPError as err:
            if err.code == 404:
                raise
            wait = base_wait * 2**attempt
            print(f"  HTTP {err.code}, retry in {wait:.0f}s: {url}", file=sys.stderr)
        except Exception as err:  # noqa: BLE001 — network hiccups, truncated reads
            wait = base_wait * 2**attempt
            print(f"  {err!r}, retry in {wait:.0f}s", file=sys.stderr)
        time.sleep(min(wait, 600))
    raise RuntimeError(f"could not download {url}")


def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_manifest() -> dict:
    if os.path.exists(MANIFEST):
        return json.load(open(MANIFEST, encoding="utf-8"))
    return {}


def save_manifest(m: dict) -> None:
    os.makedirs(SOURCE, exist_ok=True)
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump(dict(sorted(m.items())), f, indent=1, ensure_ascii=False)


def download(url: str, rel: str, manifest: dict, pace: float = 0.0, check=None) -> bool:
    """Download `url` to `source/<rel>` unless it is there with the checksum
    the manifest recorded. `check(data)` may reject a body (an HTML error
    page served with status 200, say)."""
    path = os.path.join(SOURCE, rel)
    if os.path.exists(path) and os.path.getsize(path) > 0:
        rec = manifest.get(rel)
        if rec is None:
            manifest[rel] = {"url": url, "bytes": os.path.getsize(path), "sha256": sha256(path)}
            return False
        if rec["sha256"] == sha256(path):
            return False
        print(f"  checksum mismatch, downloading again: {rel}", file=sys.stderr)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    data = get_retry(url)
    if check:
        check(data)
    tmp = path + ".part"
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, path)
    manifest[rel] = {"url": url, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
    save_manifest(manifest)
    if pace:
        time.sleep(pace)
    return True


# --- Hindawi EPUBs --------------------------------------------------------------------


def check_epub(data: bytes) -> None:
    """Reject anything that is not a whole EPUB: an HTML error page served
    with status 200, or a body cut short (the zip directory sits at the end)."""
    import io

    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            ok = z.read("mimetype").strip() == b"application/epub+zip"
    except (zipfile.BadZipFile, KeyError) as err:
        raise RuntimeError(f"not an EPUB ({err})") from err
    if not ok:
        raise RuntimeError("not an EPUB (wrong mimetype)")


def captures(book_id: str) -> list[str]:
    rows = json.loads(get_retry(CDX.format(id=book_id)))
    return [r[1] for r in rows[1:]][::-1]  # newest first


def fetch_hindawi(manifest: dict) -> list[int]:
    """The six volumes, one after the other. Returns the volumes that could
    not be fetched (text.py then works on the others and says so)."""
    missing = []
    for vol, book_id, ts in HINDAWI:
        rel = f"hindawi/vol{vol}-{book_id}.epub"
        tried = [ts]
        while True:
            url = WAYBACK.format(ts=tried[-1], id=book_id)
            try:
                if download(url, rel, manifest, pace=5.0, check=check_epub):
                    print(f"hindawi vol. {vol} ({book_id}) from capture {tried[-1]}")
                break
            except Exception as err:  # noqa: BLE001
                print(f"  vol. {vol}: {err}", file=sys.stderr)
                others = [t for t in captures(book_id) if t not in tried]
                if not others:
                    missing.append(vol)
                    break
                tried.append(others[0])
    if missing:
        print(f"MISSING Hindawi volumes: {missing}", file=sys.stderr)
    return missing


# --- fonts ------------------------------------------------------------------------------


def fetch_fonts(manifest: dict) -> None:
    for rel in GOOGLE_FONTS:
        url = "https://raw.githubusercontent.com/google/fonts/main/ofl/" + urllib.parse.quote(rel)
        if download(url, "fonts/" + rel, manifest, pace=0.3):
            print("font", rel)
    zrel = f"fonts/amiri/Amiri-{AMIRI_VERSION}.zip"
    if download(AMIRI_ZIP, zrel, manifest):
        print("font", zrel)
    # The zip holds Amiri-{Regular,Bold,Italic,BoldItalic}.ttf, AmiriQuran.ttf,
    # AmiriQuranColored.ttf, the OFL and the documentation.
    with zipfile.ZipFile(os.path.join(SOURCE, zrel)) as z:
        for name in z.namelist():
            base = os.path.basename(name)
            if base.endswith(".ttf") or base in ("OFL.txt", "README.md", "NEWS.md"):
                target = os.path.join(SOURCE, "fonts", "amiri", base)
                if not os.path.exists(target):
                    with z.open(name) as src, open(target, "wb") as out:
                        out.write(src.read())


# --- Commons ------------------------------------------------------------------------------


def api(params: dict) -> dict:
    params = {**params, "format": "json", "formatversion": "2"}
    return json.loads(get_retry(COMMONS_API + "?" + urllib.parse.urlencode(params), base_wait=5))


def clean_html(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s or "")).strip()


META_FILTER = "LicenseShortName|Artist|ImageDescription|DateTimeOriginal|Credit|UsageTerms"


def describe(title: str, info: dict) -> dict:
    em = info.get("extmetadata", {})
    v = lambda k: clean_html(em.get(k, {}).get("value", ""))  # noqa: E731
    return {
        "title": title,
        "url": info["url"],
        "descriptionurl": info["descriptionurl"],
        "width": info.get("width"),
        "height": info.get("height"),
        "mime": info.get("mime"),
        "license": v("LicenseShortName"),
        "artist": v("Artist"),
        "date": v("DateTimeOriginal"),
        "credit": v("Credit")[:300],
        "description": v("ImageDescription")[:500],
    }


def category_files(category: str) -> list[dict]:
    out, cont = [], {}
    while True:
        d = api(
            {
                "action": "query",
                "generator": "categorymembers",
                "gcmtitle": category,
                "gcmtype": "file",
                "gcmlimit": 500,
                "prop": "imageinfo",
                "iiprop": "url|size|mime|extmetadata",
                "iiextmetadatafilter": META_FILTER,
                **cont,
            }
        )
        for p in d.get("query", {}).get("pages", []):
            if "imageinfo" in p:
                out.append(describe(p["title"], p["imageinfo"][0]))
        if "continue" not in d:
            return sorted(out, key=lambda r: r["title"])
        cont = d["continue"]


def file_info(title: str) -> dict:
    d = api({"action": "query", "titles": title, "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata", "iiextmetadatafilter": META_FILTER})
    page = d["query"]["pages"][0]
    if "imageinfo" not in page:
        raise RuntimeError(f"not on Commons: {title}")
    return describe(page["title"], page["imageinfo"][0])


def is_public_domain(rec: dict) -> bool:
    lic = rec["license"].lower()
    return "public domain" in lic or lic.startswith("pd") or lic == "cc0"


def fetch_images(manifest: dict) -> None:
    """All 23 Sani ol-Molk manuscript pages (plates.py crops the panels
    `plates.json` chooses; the whole set is kept to review the others), then
    every other Commons file `plates.json` names (`commons`)."""
    meta: dict[str, dict] = {}
    for rec in category_files(GOLESTAN_CATEGORY):
        m = GOLESTAN_FILE.match(rec["title"])
        if not m:
            continue
        if not is_public_domain(rec):
            print(f"  skipped (licence {rec['license']!r}): {rec['title']}", file=sys.stderr)
            continue
        rel = f"plates/sani-ms{int(m.group(1)):02d}.jpg"
        if download(rec["url"], rel, manifest, pace=2.0):
            print("picture", rel)
        meta[rel] = rec
    spec_path = os.path.join(HERE, "plates.json")
    if os.path.exists(spec_path):
        spec = json.load(open(spec_path, encoding="utf-8"))
        for plate in spec["plates"]:
            if "commons" not in plate:
                continue
            rel = "plates/" + plate["file"]
            rec = file_info(plate["commons"])
            if not is_public_domain(rec):
                raise SystemExit(f"not public domain on Commons ({rec['license']}): {plate['commons']}")
            if download(rec["url"], rel, manifest, pace=2.0):
                print("picture", rel)
            meta[rel] = rec
    os.makedirs(os.path.join(SOURCE, "plates"), exist_ok=True)
    with open(os.path.join(SOURCE, "plates", "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=1, ensure_ascii=False)


IA_PAGE = "https://archive.org/download/{id}/page/n{n}.jpg"
IA_DETAILS = "https://archive.org/details/{id}/page/n{n}/mode/1up"


def fetch_lane(manifest: dict) -> None:
    """The pages of Lane's translation (London 1839–41) that hold the Harvey
    wood engravings `plates.json` takes from the Internet Archive scans
    (`ia: {id, n}`, the leaf index of the scan), added to meta.json."""
    spec = json.load(open(os.path.join(HERE, "plates.json"), encoding="utf-8"))
    meta_path = os.path.join(SOURCE, "plates", "meta.json")
    meta = json.load(open(meta_path, encoding="utf-8")) if os.path.exists(meta_path) else {}
    for plate in spec["plates"]:
        ia = plate.get("ia")
        if not ia:
            continue
        rel = "plates/" + plate["file"]
        if download(IA_PAGE.format(**ia), rel, manifest, pace=2.0):
            print("picture", rel)
        source = spec["sources"][plate["source"]]
        meta[rel] = {
            "title": f"{source['work']}, {ia['id']} n{ia['n']}",
            "url": IA_PAGE.format(**ia),
            "descriptionurl": IA_DETAILS.format(**ia),
            "license": "Public domain",
            "artist": source["artist"],
        }
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=1, ensure_ascii=False)


if __name__ == "__main__":
    args = set(sys.argv[1:])
    manifest = load_manifest()
    try:
        if "--no-fonts" not in args:
            fetch_fonts(manifest)
        if "--no-images" not in args:
            fetch_images(manifest)
            fetch_lane(manifest)
        missing = [] if "--no-text" in args else fetch_hindawi(manifest)
    finally:
        save_manifest(manifest)
    print("sources in", SOURCE)
    if missing:
        sys.exit(2)
