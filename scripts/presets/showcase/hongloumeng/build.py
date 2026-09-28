#!/usr/bin/env python3
"""Build the `hongloumeng` showcase bundle (SKELETON: content only).

    python3 fetch.py                          # sources (once)
    <venv>/bin/python text.py --qa            # source/chapters.json (needs OpenCC)
    python3 plates.py scan && python3 fetch.py && python3 plates.py process
    python3 build.py [--out DIR] [--register] # the bundle

The page design (vertical right-bound zh-Hant, horizontal zh-Hans, English)
waits for the engine's Chinese features (writing mode, binding, Chinese
numbering, `cjk` settings); `design_config()` returns an empty config until
then. What this script already does is the content side, the part the design
does not change:

- one chapter file per 回 and per language, `chapters/<lang>/NNN-hui.md`
  (`NNN-chapter.md` for English), the 回目 couplet in the heading attributes,
  verse, the 曲 titles of chapter 5 and the closing formula as paragraph
  styles (`詩`, `曲牌`, `回末`), the chapter plate as a resource at the head;
- the resources (chapter plates, gallery portraits) and their wording per
  language;
- the fonts, subset to the final text of each edition (fonts.py);
- the manifest, CREDITS.md and fingerprint.json.

Without `--out` the bundle goes to `work/bundle/` so a draft never lands in
apps/web/public by accident; `--register` also adds it to the public index.
"""
from __future__ import annotations

import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))
import _common  # noqa: E402
import fonts as fontkit  # noqa: E402

SOURCE = os.path.join(HERE, "source")
WORK = os.path.join(HERE, "work")
PRESET_ID = "hongloumeng"
LANGS = ("zh-Hant", "zh-Hans", "en")

# Paragraph styles the design will define (names are the markup contract).
STYLE_VERSE = "詩"
STYLE_SONG = "曲牌"
STYLE_CLOSING = "回末"


def md_escape(s: str) -> str:
    """Markdown-significant ASCII in the source texts: only `*` (the English
    italics text.py writes) is meant as markup; brackets are Joly's."""
    return s.replace("[", "\\[").replace("]", "\\]")


def block(style: str, lines: list[str]) -> str:
    body = "\n\n".join(md_escape(l) for l in lines)
    return f':::paragraphs{{style="{style}"}}\n{body}\n:::\n'


def chapter_md(lang: str, c: dict, plate: dict | None) -> str:
    first, second = c["title_couplet"][0], c["title_couplet"][1] if len(c["title_couplet"]) > 1 else ""
    attrs = f'first="{_common.attr_value(first)}" second="{_common.attr_value(second)}"'
    title = f"{first}　{second}" if lang != "en" else f"{first} {second}"
    out = [f"# {md_escape(title)} {{{attrs}}}\n"]
    if plate:
        out.append(f'::resource{{id="{plate["id"]}"}}\n')
    for p in c["paragraphs"]:
        if p["kind"] == "verse":
            out.append(block(STYLE_VERSE, p["text"].split("\n")))
        elif p["kind"] == "song-title":
            out.append(block(STYLE_SONG, [p["text"]]))
        else:
            out.append(md_escape(p["text"]) + "\n")
    if c.get("closing_formula"):
        out.append(block(STYLE_CLOSING, [c["closing_formula"]]))
    return "\n".join(out)


def write_chapters(out: str, data: dict, pictures: dict) -> dict[str, list[dict]]:
    plates = {p["chapter"]: p for p in pictures["plates"]}
    lists: dict[str, list[dict]] = {}
    for lang in LANGS:
        d = os.path.join(out, "chapters", lang)
        os.makedirs(d, exist_ok=True)
        specs = []
        for c in data["editions"][lang]["chapters"]:
            rel = f"chapters/{lang}/{c['n']:03d}-{'chapter' if lang == 'en' else 'hui'}.md"
            with open(os.path.join(out, rel), "w", encoding="utf-8") as f:
                f.write(chapter_md(lang, c, plates.get(c["n"])))
            specs.append({"title": "　".join(c["title_couplet"]) if lang != "en" else c["title_couplet"][0], "file": rel})
        lists[lang] = specs
    return lists


def resources(out: str, pictures: dict) -> tuple[list[dict], dict[str, list[dict]]]:
    os.makedirs(os.path.join(out, "resources"), exist_ok=True)
    shared: list[dict] = []
    wording: dict[str, list[dict]] = {lang: [] for lang in LANGS}
    for kind in ("plates", "portraits"):
        for p in pictures[kind]:
            if kind == "portraits" and not p["gallery"]:
                continue
            src = os.path.join(WORK, p["file"])
            rel = f"resources/{os.path.basename(p['file'])}"
            shutil.copyfile(src, os.path.join(out, rel))
            entry = {"id": p["id"], "typeId": "figure", "kind": "bitmap", "file": rel, "width": p["width"], "height": p["height"], "caption": p["caption"]["zh-Hant"], "altText": p["caption"]["zh-Hant"]}
            shared.append(entry)
            for lang in LANGS:
                cap = p["caption"].get(lang) or p["caption"]["zh-Hant"]
                wording[lang].append({"id": p["id"], "caption": cap, "altText": cap})
    return shared, wording


def edition_text(lang: str, out: str) -> str:
    text = ""
    for dp, _, fs in os.walk(os.path.join(out, "chapters", lang)):
        for f in fs:
            text += open(os.path.join(dp, f), encoding="utf-8").read()
    return text


def build_fonts(out: str) -> list[dict]:
    fonts_dir = os.path.join(out, "fonts")
    families: dict[str, list[dict]] = {}
    for lang in LANGS:
        # The English edition sets any Chinese it prints (the 回目) in the
        # zh-Hant faces, which already cover every 回目.
        text = edition_text(lang, out)
        for e in fontkit.build_faces(lang, text, fonts_dir):
            families.setdefault(e["family"], []).append({"weight": e["weight"], "style": e["style"], "file": f"fonts/{e['file']}"})
            if e["missing"]:
                print(f"warning: {e['file']} lacks {e['missing']}", file=sys.stderr)
    fontkit.copy_licences(fonts_dir, list(fontkit.LICENCES))
    return [{"name": n, "variants": v} for n, v in families.items()]


def design_config() -> dict:
    """Placeholder until the engine's Chinese features land."""
    return {}


def write_manifest(out: str, chapters: dict, shared: list[dict], wording: dict, fonts: list[dict]) -> dict:
    meta = {
        "id": PRESET_ID,
        "name": "紅樓夢 · Dream of the Red Chamber",
        "description": "Novela en 120 capítulos, en chino tradicional vertical, chino simplificado horizontal y la traducción inglesa de Joly · A novel in 120 chapters: vertical Traditional Chinese, horizontal Simplified Chinese and Joly's English translation",
        "locale": "zh-Hant",
        "locales": list(LANGS),
        "thumbnail": "thumbnail.jpg",
        "license": "Public domain · CC BY-SA 4.0 (Wikisource transcription) · OFL fonts",
        "credits": "曹雪芹 · 高鶚 · zh.wikisource · H. Bencraft Joly · Project Gutenberg · 同文書局 1884 · 改琦 · Wikimedia Commons",
        "tags": ["book", "chinese", "vertical", "right-bound"],
    }
    manifest = {
        "version": 2,
        **meta,
        "chapters": chapters,
        "config": design_config(),
        "localized": {lang: {"resources": wording[lang]} for lang in LANGS},
        "resources": shared,
        "fonts": fonts,
    }
    with open(os.path.join(out, "preset.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=1, ensure_ascii=False)
        f.write("\n")
    return meta


def main() -> None:
    args = sys.argv[1:]
    out = args[args.index("--out") + 1] if "--out" in args else os.path.join(WORK, "bundle")
    data = json.load(open(os.path.join(SOURCE, "chapters.json"), encoding="utf-8"))
    pictures = json.load(open(os.path.join(WORK, "pictures.json"), encoding="utf-8"))
    for sub in ("chapters", "resources", "fonts"):
        shutil.rmtree(os.path.join(out, sub), ignore_errors=True)
    os.makedirs(out, exist_ok=True)
    chapters = write_chapters(out, data, pictures)
    shared, wording = resources(out, pictures)
    fonts = build_fonts(out)
    meta = write_manifest(out, chapters, shared, wording, fonts)
    _common.copy_thumbnail(HERE, out)
    _common.write_fingerprint(out)
    if "--register" in args:
        _common.register(PRESET_ID, {**meta, "openLocale": "zh-Hant"})
    print(f"wrote {out} ({_common.bundle_size(out):.1f} MB)")


if __name__ == "__main__":
    main()
