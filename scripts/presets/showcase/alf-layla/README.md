# alf-layla: ألف ليلة وليلة

The Arabic showcase book (issue #386): the source pipeline produces the
structured text, the chapter markdown and the plates; `build.py` lays them
out as the bundle `apps/web/public/presets/alf-layla/` and registers it.

```sh
python3 fetch.py      # source/: six Hindawi EPUBs, fonts, Commons pictures, manifest.json
python3 text.py       # source/text.json + source/text-report.json
python3 markup.py     # work/draft/ar/NNN-<tale>.md + chapters.json (or --out DIR)
python3 plates.py     # work/plates/<id>.jpg + plates.json + sheet.jpg
python3 build.py      # the bundle (--out DIR: a draft, not registered; --keep-fonts)
```

`source/` and `work/` are git-ignored. Python 3.10+ with Pillow; nothing else.

## Text

The Hindawi edition (مؤسسة هنداوي, 2022) of the Bulaq vulgate, six volumes,
nights 1–1001 and the conclusion: 686,000 words, 4,665 verse lines in 1,322
poems, 74 Qurʾān quotations. hindawi.org is behind a Cloudflare challenge, so
`fetch.py` takes the EPUBs from the Wayback Machine (`id_` captures, one at a
time, with back-off). The original text is public domain; Hindawi's
vocalisation and punctuation are CC BY 4.0 and must be credited.

`text.py` reads the XHTML into a flat list of blocks (volume, basmala, tale,
night, paragraph with Qurʾān runs, verse with hemistichs), normalises the
text (NFC, bidi controls and ZWNJ out, Arabic punctuation) and checks that
every night 1–1001 is there once, in order, ending at dawn. The report lists
what it found and fixed.

`tales.json` is the editorial layer: Hindawi heads tales at one level only and
leaves the tales told inside tales unheaded. Each entry gives a heading its id,
level and parent; `anchor`/`split` insert the unheaded ones (the three old men,
King Yunan, the ensorcelled prince …); `group` puts a heading of ours
(«… وحكايات أخرى») over runs of short anecdotes; `chapter` says where a
chapter file starts; `repeat` drops a heading Hindawi prints again where a tale
resumes; `joinNextVolume` moves a tale whose first lines close a volume into
the next one.

`markup.py` writes Postext markdown: one chapter per tale cycle (63), `#` for
the chapter's tale and `##`–`####` for tales inside it, nights as level-6
headings `{style="night" n=N}`, verse in `:::verse` blocks with
` || ` between hemistichs, Qurʾān quotations in ﴿ ﴾, a `:::part` at the head
of each volume. `ordinal_ar()` spells night numbers as words
(«الليلة الحادية بعد الألف») for `--night-title ordinal`.

## Plates

`plates.json` chooses 47 panels from Sani ol-Molk's watercolours for the
Persian Nights (Golestan Palace Library MS 2240, vol. 1, 1849–56), each with
its Persian caption as read from the scan, an Arabic caption and the tale it
shows, plus 8 of William Harvey's wood engravings for Lane's translation
(1839–41): six for tales the Persian volume does not reach, two arabesque
ornaments. All public domain on Wikimedia Commons. About 19 MB as JPEG q80.

Each plate's `find` is a phrase of the scene it shows: build.py sets the
picture just before the paragraph that holds it (else after the tale's first
paragraph), and the engine floats it to the next free slot.

## The book

`build.py`: 17 × 24 cm, right-bound (the Arabic locale binds it), one column
of Amiri 13/24 pt in a ruled double frame on every page, running heads in the
frame's head, folios in abjad letters (front matter) then Arabic-Indic
digits. Openers under a headpiece drawn by `ornaments.py` (sarlawḥ and
rosettes, plain SVG); nights as red headings in feminine ordinal words
(`markup.py --night-title ordinal --night-level 0`); the six volumes as part
pages; الفهرس, a tapering colophon and the sources at the end. The cover
(`thumbnail.jpg` is its render, page 1 with `render.mjs --jpeg … --pages '#1'`
at 600 px wide) is a painting of tooled oxblood morocco round a miniature of
Shahrazad and Shahryar, the title stamped in gold Ruqʿa in its cartouche.
The cover and the spine are paintings (GPT Image 2.5 through fal.ai, no
lettering): `../covers.py generate` paints them from `../covers.json`,
`../covers.py process` crops them into `art/` (committed); build.py sets the
title over them. `../patch_covers.py` splices a changed design or spine into
the committed bundle without a rebuild.
`CREDITS.draft.md` was the draft of the bundle's `CREDITS.md`.
