#!/usr/bin/env python3
"""Build the `bioquimica-feduchi` showcase preset bundle into
`apps/web/public/presets/bioquimica-feduchi/` and register it in the public
`index.json`.

    python3 scripts/presets/showcase/bioquimica-feduchi/fetch.py   # check sources
    python3 scripts/presets/showcase/bioquimica-feduchi/build.py

Chapter 1 of *Bioquímica. Conceptos esenciales* (Feduchi et al., 4.ª ed.,
Editorial Médica Panamericana), in both editions: a column-and-a-half
textbook page, the main column at the spine and an outer column carrying the
figures, the key-concept boxes and the activities.

The Spanish edition is the private EMP bundle's own: its configuration,
chapter and resource list are read from `emp/21x28-4c-colymedia/preset.json`,
so the design stays one thing maintained in one place. What this builder adds
is everything the public bundle needs on top:

  * the artwork is re-cut from the book PDF with its labels as **live text**
    (figures.py), so the English edition can translate them — `resources/`
    holds the Spanish pictures, `resources/en/` the ones whose words changed;
  * the English edition — chapter, captions, alt texts, table cells, callout
    titles, palette and resource-type names — comes from `translations/`;
  * the licensed typefaces travel as subset WOFF2 and are marked
    `redistributable: false`, so the sandbox sets the pages with them but
    never hands the files on (a `.postext` export leaves them out).

`--labels` writes the translator's worklist instead of building: every text
run of every picture, in the order `translations/figures.json` indexes them.
`--outlines <id>` lists, for one picture, the words its artwork draws as
curves rather than sets as text — what `translations/` names under
`outlines`, in the same order.
"""
from __future__ import annotations

import argparse
import copy
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))
import figures  # noqa: E402
from _common import PRESETS_ROOT, bundle_size, copy_thumbnail, register, write_fingerprint  # noqa: E402
from fetch import book_pdf, check, private_dir  # noqa: E402

PRESET_ID = "bioquimica-feduchi"
OUT = os.path.join(PRESETS_ROOT, PRESET_ID)
TRANSLATIONS = os.path.join(HERE, "translations")
LANGS = ("es", "en")

NAME = "Bioquímica Feduchi Capítulo 1"
DESCRIPTION = (
    "Manual de bioquímica a columna y media: columna principal junto al lomo y "
    "columna exterior con figuras, conceptos clave y actividades · A "
    "column-and-a-half biochemistry textbook, the main column at the spine and an "
    "outer column of figures, key concepts and activities"
)
LICENSE = "© Editorial Médica Panamericana, reproduced with permission"
CREDITS = "Feduchi, Romero, Yáñez, Blasco, García-Hoz · Editorial Médica Panamericana"
#: The face the figures set their labels in — what a word this builder
#: puts back into a picture is set in.
LABEL_FAMILY = "DIN Pro"

TAGS = ["textbook", "one-and-a-half", "callouts", "tables", "figures", "parts"]

#: Characters every subset face keeps, so the document stays editable in the
#: sandbox: Latin-1 and Latin Extended-A, Greek, general punctuation,
#: super/subscripts, arrows and the common mathematical operators.
SUBSET_RANGES = (
    (0x0020, 0x007E), (0x00A0, 0x017F), (0x0192, 0x0192), (0x02C6, 0x02DC),
    (0x0374, 0x03CE), (0x2010, 0x203A), (0x2044, 0x2044), (0x2070, 0x209F),
    (0x20AC, 0x20AC), (0x2122, 0x2122), (0x2190, 0x2199), (0x21CB, 0x21CC),
    (0x2202, 0x2265), (0x25A0, 0x25CF), (0x2713, 0x2714),
)


# --- sources -----------------------------------------------------------------

def private_manifest() -> dict:
    return json.load(open(os.path.join(private_dir(), "preset.json"), encoding="utf-8"))


def font_files(manifest: dict) -> dict[tuple[str, int, bool], str]:
    """Family / weight / italic → the face's file in the private bundle."""
    out: dict[tuple[str, int, bool], str] = {}
    for family in manifest.get("fonts", ()):
        for v in family["variants"]:
            out[(family["name"], v["weight"], v["style"] == "italic")] = \
                os.path.realpath(os.path.join(private_dir(), v["file"]))
    return out


def translations(name: str, default):
    path = os.path.join(TRANSLATIONS, name)
    if not os.path.exists(path):
        return default
    if name.endswith(".json"):
        return json.load(open(path, encoding="utf-8"))
    return open(path, encoding="utf-8").read()


# --- artwork -----------------------------------------------------------------

def used_resources(manifest: dict, chapters: dict[str, list[dict]]) -> set[str]:
    """The resources the bundle actually shows: the ones a chapter refers to,
    the ones the design places (icons, motifs, the resources strip) and the
    pictures a table sets in a cell. The private bundle carries a couple of
    Spanish pictures that nothing uses any more — superseded by a real table
    — and they have no business in a public, bilingual bundle."""
    text = json.dumps(manifest["config"], ensure_ascii=False)
    text += json.dumps([r.get("table") for r in manifest["resources"] if r.get("table")], ensure_ascii=False)
    for specs in chapters.values():
        for spec in specs:
            text += open(os.path.join(OUT, spec["file"]), encoding="utf-8").read()
    return {r["id"] for r in manifest["resources"] if r["id"] in text}


def build_artwork(manifest: dict, cutter: figures.Cutter, width_of, subset, keep: set[str]) -> tuple[dict[str, str], set[str]]:
    """Cut every picture the bundle uses, Spanish into `resources/` and, where
    the translation changes a word, English into `resources/en/`. Returns the
    id → Spanish file map and the ids that have an English cut."""
    labels = translations("figures.json", {})
    artwork = {k: v for k, v in translations("artwork.json", {}).items() if not k.startswith("_")}
    ids = [r["id"] for r in manifest["resources"] if r.get("kind") == "svg" and r["id"] in keep]
    os.makedirs(os.path.join(OUT, "resources", "en"), exist_ok=True)
    files: dict[str, str] = {}
    translated: set[str] = set()
    for rid in ids:
        files[rid] = f"resources/{rid}.svg"
        if rid not in cutter.regions:
            # Two of the box pictures were cut by hand and the private bundle
            # keeps no region for them; they carry no words, so they travel
            # as they are, outlines and all.
            shutil.copyfile(os.path.join(private_dir(), "resources", f"{rid}.svg"),
                            os.path.join(OUT, files[rid]))
            continue
        svg = cutter.raw(rid, width_of)
        write(os.path.join(OUT, files[rid]), figures.embed_faces(svg, subset))
        entries = labels.get(rid)
        rasters = figures.rasters_of(svg)
        english = figures.apply_translation(svg, entries, width_of, rasters)
        english = figures.replace_artwork(english, rasters, artwork.get(rid) or [], LABEL_FAMILY)
        if english != svg:
            write(os.path.join(OUT, "resources", "en", f"{rid}.svg"), figures.embed_faces(english, subset))
            translated.add(rid)
    if not os.listdir(os.path.join(OUT, "resources", "en")):
        os.rmdir(os.path.join(OUT, "resources", "en"))
    return files, translated


def write_labels(manifest: dict, cutter: figures.Cutter, width_of) -> None:
    """The translator's worklist: every run of every picture, in index
    order, merged with whatever `figures.json` already says."""
    known = translations("figures.json", {})
    out: dict[str, dict] = {}
    for r in manifest["resources"]:
        if r.get("kind") != "svg" or r["id"] not in cutter.regions:
            continue
        rid = r["id"]
        runs = figures.runs_of(cutter.raw(rid, width_of))
        if not runs:
            continue
        entries = known.get(rid) or {}
        out[rid] = {
            str(i): {"es": run, **{k: v for k, v in (entries.get(str(i)) or {}).items() if k != "es"}}
            for i, run in enumerate(runs)
        }
    path = os.path.join(TRANSLATIONS, "figures.todo.json")
    os.makedirs(TRANSLATIONS, exist_ok=True)
    write(path, json.dumps(out, ensure_ascii=False, indent=1) + "\n")
    print(f"wrote {path}  ({len(out)} pictures, {sum(len(v) for v in out.values())} runs)")


# --- text --------------------------------------------------------------------

def build_chapters(manifest: dict) -> dict[str, list[dict]]:
    """One chapter file per edition: the Spanish one as the private bundle
    keeps it, the English one from `translations/`."""
    specs: dict[str, list[dict]] = {}
    spec = manifest["chapters"]["es"][0] if isinstance(manifest["chapters"], dict) else manifest["chapters"][0]
    markdown = open(os.path.join(private_dir(), spec["file"]), encoding="utf-8").read()
    strings = translations("strings.json", {})
    for lang in LANGS:
        name = os.path.basename(spec["file"]) if lang == "es" else "01-the-foundations-of-biochemistry.md"
        text = markdown if lang == "es" else translations("chapter-en.md", markdown)
        path = f"chapters/{lang}/{name}"
        write(os.path.join(OUT, path), text)
        title = spec["title"] if lang == "es" else strings.get("chapterTitle", spec["title"])
        specs[lang] = [{"title": title, "file": path}]
    return specs


def localized_config(config: dict, strings: dict) -> dict:
    """The configuration keys whose wording is Spanish, in English."""
    words = strings.get("config", {})
    out: dict = {"locale": "en"}

    palette = words.get("colorPalette", {})
    out["colorPalette"] = [{**c, "name": palette.get(c["id"], c["name"])} for c in config["colorPalette"]]

    types = words.get("resourceTypes", {})
    out["resourceTypes"] = [
        {**t, **{k: v for k, v in types.get(t["id"], {}).items()}} for t in config["resourceTypes"]
    ]

    styles = words.get("paragraphStyles", {})
    out["paragraphStyles"] = [{**s, "name": styles.get(s["id"], s["name"])} for s in config["paragraphStyles"]]

    callouts = words.get("calloutStyles", {})
    out["calloutStyles"] = [_callout(c, callouts.get(c["id"], {})) for c in config["calloutStyles"]]

    heads = words.get("runningHead", {})
    names = words.get("headingStyles", {})
    out["headings"] = _retitle(config["headings"], heads)
    out["headingStyles"] = [
        {**_retitle(s, heads), "name": names.get(s["id"], s["name"])} for s in config["headingStyles"]
    ]
    out["parts"] = _retitle(config["parts"], heads)

    viewer = copy.deepcopy(config["htmlViewer"])
    overrides = viewer.get("overrides", {})
    if "calloutStyles" in overrides:
        overrides["calloutStyles"] = [_callout(c, callouts.get(c["id"], {})) for c in overrides["calloutStyles"]]
    if "headingStyles" in overrides:
        overrides["headingStyles"] = [
            {**_retitle(s, heads), "name": names.get(s["id"], s["name"])} for s in overrides["headingStyles"]
        ]
    for key in ("headings", "parts"):
        if key in overrides:
            overrides[key] = _retitle(overrides[key], heads)
    out["htmlViewer"] = viewer
    return out


def _callout(style: dict, words: dict) -> dict:
    return {**style, **{k: v for k, v in words.items() if k in ("name", "title")}}


def _retitle(node, words: dict):
    """Replace the literal words of a design slot (`SECCIÓN {partNumber}`)
    wherever they appear under `node`."""
    if isinstance(node, dict):
        return {k: (words.get(v, v) if k == "content" and isinstance(v, str) else _retitle(v, words))
                for k, v in node.items()}
    if isinstance(node, list):
        return [_retitle(v, words) for v in node]
    return node


def localized_resources(manifest: dict, strings: dict, translated: set[str], keep: set[str]) -> list[dict]:
    """Per-resource English wording, plus the English cut of every picture
    whose labels changed."""
    words = strings.get("resources", {})
    out: list[dict] = []
    for r in manifest["resources"]:
        if r["id"] not in keep:
            continue
        entry: dict = {"id": r["id"]}
        w = words.get(r["id"], {})
        for key in ("caption", "note", "altText"):
            if key in w:
                entry[key] = w[key]
        if "table" in r and w.get("cells"):
            entry["table"] = _translate_table(r["table"], w["cells"])
        if r["id"] in translated:
            entry["file"] = f"resources/en/{r['id']}.svg"
        if len(entry) > 1:
            out.append(entry)
    return out


def _translate_table(table: dict, cells: dict[str, str]) -> dict:
    """A table with every cell whose text the glossary names replaced."""
    model = copy.deepcopy(table)
    for row in model["model"]["rows"]:
        for cell in row:
            content = cell.get("content")
            if content in cells:
                cell["content"] = cells[content]
    return model


# --- fonts -------------------------------------------------------------------

def build_fonts(manifest: dict, files: dict[tuple[str, int, bool], str]) -> list[dict]:
    """Every face the design uses, cut down to the repertoire the bundle can
    be edited in and written as WOFF2 — and marked as a family the sandbox
    may set but not pass on."""
    from fontTools import subset as ft_subset
    from fontTools.ttLib import TTFont

    os.makedirs(os.path.join(OUT, "fonts"), exist_ok=True)
    unicodes = [c for lo, hi in SUBSET_RANGES for c in range(lo, hi + 1)]
    out: list[dict] = []
    for family in manifest.get("fonts", ()):
        variants = []
        for v in family["variants"]:
            source = files[(family["name"], v["weight"], v["style"] == "italic")]
            name = os.path.splitext(os.path.basename(source))[0] + ".woff2"
            path = os.path.join(OUT, "fonts", name)
            if not os.path.exists(path):
                font = TTFont(source, fontNumber=0)
                options = ft_subset.Options()
                options.flavor = "woff2"
                options.drop_tables += ["DSIG"]
                options.notdef_outline = True
                options.layout_features = ["*"]
                options.ignore_missing_unicodes = True
                sub = ft_subset.Subsetter(options=options)
                sub.populate(unicodes=unicodes)
                sub.subset(font)
                font.flavor = "woff2"
                font.save(path)
                font.close()
            variants.append({"weight": v["weight"], "style": v["style"], "file": f"fonts/{name}"})
        out.append({"name": family["name"], "variants": variants, "redistributable": False})
    return out


# --- the bundle --------------------------------------------------------------

def write(path: str, text: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def write_credits(strings: dict) -> None:
    write(os.path.join(OUT, "CREDITS.md"), translations("CREDITS.md", "") or _default_credits())


def _default_credits() -> str:
    return (
        "# Credits\n\n"
        f"{CREDITS}\n\n{LICENSE}\n"
    )


def build() -> None:
    missing = check()
    if missing:
        raise SystemExit("\n".join(missing) + "\n\nrun fetch.py for the details")
    manifest = private_manifest()
    files = font_files(manifest)
    width_of = figures.measurer(files)
    subset = figures.subsetter(files)
    cutter = figures.Cutter(book_pdf(), os.path.join(private_dir(), "source"))
    strings = translations("strings.json", {})

    for sub in ("chapters", "resources"):
        shutil.rmtree(os.path.join(OUT, sub), ignore_errors=True)
    os.makedirs(OUT, exist_ok=True)

    chapters = build_chapters(manifest)
    keep = used_resources(manifest, chapters)
    dropped = [r["id"] for r in manifest["resources"] if r["id"] not in keep]
    artwork, translated = build_artwork(manifest, cutter, width_of, subset, keep)
    resources = [
        {**r, **({"file": artwork[r["id"]]} if r["id"] in artwork else {})}
        for r in manifest["resources"] if r["id"] in keep
    ]
    meta = {
        "name": NAME,
        "description": DESCRIPTION,
        "locale": "es",
        "locales": list(LANGS),
        "thumbnail": "thumbnail.jpg",
        "license": LICENSE,
        "credits": CREDITS,
        "tags": TAGS,
    }
    bundle = {
        "version": 2,
        "id": PRESET_ID,
        **meta,
        "chapters": chapters,
        "config": manifest["config"],
        "localized": {"en": {
            "config": localized_config(manifest["config"], strings),
            "resources": localized_resources(manifest, strings, translated, keep),
        }},
        "resources": resources,
        "fonts": build_fonts(manifest, files),
    }
    write(os.path.join(OUT, "preset.json"), json.dumps(bundle, indent=1, ensure_ascii=False) + "\n")
    write_credits(strings)
    copy_thumbnail(HERE, OUT)
    write_fingerprint(OUT)
    register(PRESET_ID, meta)
    print(f"wrote {OUT}  ({bundle_size(OUT):.1f} MB, {len(resources)} resources, "
          f"{len(translated)} translated pictures)")
    if dropped:
        print(f"  left out, nothing refers to them: {', '.join(dropped)}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--labels", action="store_true", help="write the picture-label worklist and stop")
    ap.add_argument("--outlines", metavar="ID", help="list one picture's curve-drawn words and stop")
    args = ap.parse_args()
    if args.outlines:
        manifest = private_manifest()
        width_of = figures.measurer(font_files(manifest))
        cutter = figures.Cutter(book_pdf(), os.path.join(private_dir(), "source"))
        svg = cutter.raw(args.outlines, width_of)
        print("outlines (words drawn as curves):")
        for i, cluster in enumerate(figures.outlined_clusters(svg)):
            print(f"{i:4}  {cluster}")
        print("raster (words baked into a picture):")
        for i, (_, cluster) in enumerate(figures.raster_words(figures.rasters_of(svg))):
            print(f"{i:4}  {cluster}")
        return
    if args.labels:
        missing = check()
        if missing:
            raise SystemExit("\n".join(missing))
        manifest = private_manifest()
        width_of = figures.measurer(font_files(manifest))
        write_labels(manifest, figures.Cutter(book_pdf(), os.path.join(private_dir(), "source")), width_of)
        return
    build()


if __name__ == "__main__":
    main()
