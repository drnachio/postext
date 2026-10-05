# kokoro: こころ

The Japanese showcase book (issue #438): Natsume Sōseki's *Kokoro* (1914)
from Aozora Bunko, set vertically and bound on the right, with Sōseki's own
designs and paintings and a set of scene plates painted to match. The
source pipeline produces the chapter Markdown, the fonts and the pictures;
`build.py` lays them out as the bundle `apps/web/public/presets/kokoro/` and
registers it on the home shelf (`apps/web/public/presets/index.json`).

```sh
python3 fetch.py             # source/: Aozora zips, NDL scans (IIIF), fonts, manifest.json
python3 text.py              # work/draft/ja/*.md, work/text.json, work/charset.txt, work/display.txt
python3 fonts.py             # work/fonts/*.woff2 + report.json (needs fontTools)
python3 plates.py check      # each scene's anchor phrase is in its section
python3 plates.py generate   # source/generated/<scene>.png through fal.ai (FAL_KEY; skips existing)
python3 plates.py process    # work/plates/*.jpg + work/pictures.json
python3 plates.py sheet      # work/plates-sheet.jpg
python3 build.py             # the bundle (--out DIR: a draft elsewhere, not registered;
                             # --keep-fonts: a design change, fonts of the last build)
```

`thumbnail.jpg` is the cover as laid out: page 1 rendered with the
postext-port skill's `render.mjs --jpeg … --pages '#1' --dpi 96`.

`source/` and `work/` are git-ignored. Python 3.10+ with Pillow, NumPy and
fontTools.

## Text

Aozora card 773 (新字新仮名, after the 集英社文庫 edition) and the three
short texts printed with the 1914 book: the preface (序, card 4688), the
advertisement (広告文, 4689) and the newspaper notice (予告, 4687). text.py
converts them with the postext-port skill's Aozora converter
(`plugins/postext/skills/postext-port/scripts/aozora.py`): readings become
group ruby `{漢字|かんじ}`, the four 外字 are resolved through JIS X 0213, the
three corrections Aozora records are kept and their notes dropped, the
credit blocks are kept for CREDITS.md and the colophon.

One file per part (`01-kami.md`, `02-naka.md`, `03-shimo.md`), each opening
with `:::part{number="上" title="先生と私"}`. The 110 newspaper instalments
are level-2 headings in the run of the text, `## 一 {indent="5"
id="kami-1"}` (Aozora sets them 5字下げ; the id names the section for plates
and cross-references). `--split-shimo N` cuts part 下 (86,000 characters)
into N files on section boundaries; `--part-heading h1` writes the parts as
level-1 headings instead.

Paragraphs follow Aozora's indents: a leading ideographic space is the
ordinary 1 em indent; a paragraph opening with 「 has none and is left to
the engine's bracket rule; the date of the preface is 2字下げ
(`:::paragraphs{style="aozora-i2-f0"}`, defined in `work/text.json`
`paragraphStyles`). Part 下 is Sensei's letter: every paragraph opens with
「 and only the last one closes, as printed. Nothing balances the brackets.

`work/draft/ja/edition-note.md` (本書について) lists the base texts and
every change, in Japanese.

## Fonts

Shippori Mincho B1 Regular for the text (the Tsukiji No. 5 Mincho lineage,
with letterpress ink pooling), Bold for headings and part titles, Shippori
Antique B1 for running heads and folios; all OFL. fonts.py subsets the
Regular and the Bold to the book's characters plus a Japanese reserve, and
the antique to the headings, the design's words and the plate captions. Every
layout feature is kept; `check()` fails the build if a subset loses `vert`,
`vhea` or `vmtx`, or a vertical form of 、。「」（）ー〜…― or the small kana.

## Pictures

`plates.json` lists them, with captions and alt text in Japanese and
English and the credit line of each.

- NDL scans (public domain mark): the 1914 title-page woodblock (cut by 伊上凡骨
  to Sōseki's design; the 帝國圖書館 stamp disappears in the levels), its
  facing seal, the cover label and the colophon of the first edition (pid
  945471); the endpapers and the colophon's leaf frame, its panel cleared,
  from the cleaner 1917 printing (906330); four of Sōseki's paintings from
  『漱石遺墨集』 (1192970): 山上有山図, 萩の粥図 and 孤客入石門図 open the three
  parts, 山水図 is a spare.
- Eleven scene plates, generated in the manner of those paintings (sumi
  line, pale washes, bare paper, no writing anywhere), each anchored to a
  phrase of its section; credited "Generated With Diffusion Models". K's
  death and Sensei's are not shown: 下 四十八 is the open sliding door and the
  lamp, 下 五十六 Sensei writing on the night of the imperial funeral. The
  originals are not reproducible: keep `source/generated/` (PNG plus the
  request JSON of each) when moving the pipeline.

Every picture is set on the book's paper, `#f4ebd8`: the scenes are painted
on white, scaled so their margins read white, near-white pushed to white
and multiplied by the paper; the woodblocks and microfilm pages are levelled
and mapped between ink `#1d1916` and the paper; the paintings are
white-balanced from the album's page tone to the paper. JPEG q80, at most
3000 px.

`CREDITS.draft.md` is the draft of the bundle's CREDITS.md.
