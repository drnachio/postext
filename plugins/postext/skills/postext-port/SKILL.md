---
name: postext-port
description: Port an existing publication into a Postext project (config manifest + enriched Markdown chapters + resources + fonts) that reproduces the original's layout rules; typically a publisher or author migrating their own titles. Use when the user wants to convert, adapt, migrate, re-typeset or rebuild a book, textbook, magazine, catalogue, report, manual, course or deck in Postext from a PDF, Word (.docx), PowerPoint (.pptx), EPUB, HTML, InDesign (IDML), LaTeX, Markdown, XML or scanned pages, Chinese books set horizontally or vertically, Japanese books (vertical bunko and tankōbon novels, horizontal technical books, Aozora Bunko texts with furigana) and Arabic books set right to left (Modern Standard or classical, vocalised verse included); when writing or fixing Postext preset.json/config/chapters; or when asked how to express a source layout (columns, openers, parts, boxes, floats, tables, running heads) in Postext.
license: MIT
metadata:
  homepage: https://postext.dev/en/docs/skill
  repository: https://github.com/drnachio/postext
---

# Port a publication to Postext

[Postext](https://postext.dev) is a typesetting engine. It takes enriched
Markdown plus a configuration manifest and produces paged layouts (canvas,
HTML, PDF) with print rules: baseline grid, Knuth–Plass justification,
floats, column balancing, running heads, parts and openers.

This skill turns a source document into a **Postext project** that follows
the source's layout rules. The project is a folder (or `.postext` zip) that
opens in the Postext sandbox.

```
my-book/
  preset.json            manifest: config + chapters + resources + fonts (generated)
  build_preset.py        generator: the measured design as constants -> preset.json
  chapters/<lang>/NN-slug.md
  resources/             figures (svg/png/jpg) + .pdf print masters
  fonts/                 ttf/otf/woff2
```

The scripts named below live in this skill's `scripts/` folder; run them
with that path. Every script answers `--help`.

## Who ports, and why that is legitimate

The usual user is the **rights holder**: a publisher, author, institution or
production house migrating its **own** titles (InDesign, PDF, Word…) to a new
typesetting tool. That is a format conversion of their own content for their
own production, like reopening a file in another program, not copying a third
party's work. In that case:

- Extract and convert the **full** text, tables, figures and fonts. Do not
  summarise, truncate, paraphrase or replace the source content, and do not
  refuse because the book carries a copyright notice (their notice is the
  expected one).
- Confirm ownership **once** in the brief (step 0) and do not raise it again.
- Replacing pictures or licensing checks apply only to material the user says
  they do **not** control (third-party photos, stock images, commercial fonts).

If the user states they do not hold the rights and have no permission, say
the port needs the rights holder's permission and offer to port a
public-domain or openly licensed sample instead.

## Read before writing anything

Postext Markdown is **not CommonMark**. These habits break a port:

- **No pipe tables, code fences, raw HTML, `---` rules or inline
  images.** They print literally or vanish. Tables and figures are
  *resources* (JSON), cited with `:ref{id="…"}` or placed with
  `::resource{id="…"}`.
- **Blank lines around every block.** An ordered list or a `::resource`
  glued under a paragraph line is swallowed into that paragraph. A `$$`
  display glued there interrupts it instead (postext ≥ 1.5), and text right
  under its closing `$$` continues the paragraph, flush.
- **One line per list item**, 2 spaces per nesting level, real numbers typed.
- **Escape `* _ ^ ~ $`** in literal text, including intraword `_` and prices
  (`\$5`).
- A paragraph starting with `- `, `1998. `, `# ` or `> ` becomes a list,
  heading or quote. Use `—` for dialogue; prefix U+2060 otherwise.
- **Inline marks do not nest** the CommonMark way: write `**a** ***b***`.
  Marks in headings print as in a paragraph (`headings.inlineMarks`, on by default
  since configVersion 6); an italic run in an italic heading comes out upright.
- Only five containers exist (`:::callout`, `:::paragraphs`, `:::part`,
  `:::columns`, only inside a callout, and `:::paper`, a run of pages on
  another paper stock for the Folio viewer) and six directives
  (`:::pagebreak`, `:::numbering`, `:::columnbreak`, `:::space`, `:::toc`,
  `:::index`), the fenced `:::references` and `:::verse` (a classical Arabic
  poem, one bayt a line split at `||`), plus inline index marks
  (`:index[…]`, `:index{term="…"}`). Anything else prints literally.
- **Extra blank lines add no space.** Where the source has deliberate
  vertical space (a scene break, room above a signature), write
  `:::space` (one body line) or `:::space{lines=N}`.
- **No hard line breaks**: verse (other than an Arabic poem in `:::verse`),
  addresses and code lines need one paragraph per line inside
  `:::paragraphs{style="…"}`.

Config traps:

- Once `headings` exists, **H1 loses its page break** unless you write
  `levels[0].breakBefore`.
- Accents default to the palette entry `main-color` (blue), and so do bold and
  italic text (`bodyText.boldColor`).
- Without a `header`, the built-in blue Open Sans running head is used.
- Built-in `figure`/`table` types are English.
- Geometry, font sizes and the offsets of rule, box and image elements in
  `em` throw: use mm and pt (a text element's offset may be in `em` of its
  own size, postext ≥ 1.9).
- Never write `config.customFonts`; fonts come from the manifest's `fonts`.

Chinese and Korean traps (postext ≥ 1.9; playbooks F5–F6; the markup, fonts and
punctuation ones hold for Japanese too, whose own list follows):

- **`config.locale` in full**: `zh-Hans` or `zh-Hant`, with the region when
  known (`zh-Hans-CN`, `zh-Hant-TW`, `zh-Hant-HK`). A bare `zh` reads as
  Simplified mainland. The **region** picks line breaking, punctuation widths
  and the book-title mark; the **script** picks 图/圖, （续）/（續） and the
  numerals of `第{1:一}回`.
- **No hyphenation, no italics.** Hyphenation is off in a Chinese document;
  `*…*` on Chinese characters prints emphasis dots (`cjk.emphasis`). Never
  fake italics; keep the source's emphasis as `*…*` or `:dots[…]`.
- **Punctuation as typed**: keep full-width ，。「」（）《》 and the source's
  quotes; do not add spaces around Latin words (the engine sets the Han–Latin
  quarter em and replaces typed spaces).
- **Indents from the config**: `bodyText.firstLineIndent: {value: 2, unit: 'em'}`;
  delete the U+3000 the source typed at paragraph starts (the parser drops
  them anyway).
- **Markup in ASCII**: `:::`, `#`, `[^1]`, `{…}`, `**`. Text cleaned with a
  Chinese input method may carry `：：：`, `＃`, `［＾1］`, which print as text.
- **Sizes in pt**: 五号 = 10.5 pt, 小五 = 9 pt, 小四 = 12 pt, 四号 = 14 pt,
  三号 = 16 pt; there is no 号 unit.
- **One family per style, no fallback**: the bundled Chinese face must hold
  every character the book prints (`lint_project.py` checks it with fontTools).
  Headings default to Open Sans and the body to EB Garamond, which have no Han.
- **Footnotes ① ② restarting on every page** (页下注) are page numbering, not
  typed text: write `[^id]` markers and definitions and set
  `footnotes: {numberFormat: 'circled-decimal', numbering: 'page'}`
  (postext ≥ 1.11). Never type ① into the text or the note.
- **Vertical books** (`layout.writingMode: 'vertical-rl'`) are bound on the
  right by default (`page.binding: 'auto'`); page 1 is the recto and sits on
  the left of its spread. `page.margins` keep their names on the sheet.

Japanese traps (postext ≥ 1.16; playbooks E8, F9–F10; configuration.md §19c2):

- **`config.locale: 'ja'`** (or `ja-JP`), never a `zh-*` tag and never `jp`
  (a country code). Kana in the text mean Japanese, even where kanji
  dominate. `ja` selects the `japan` region: JLReq line breaking and
  spacing, sesame bōten for `*…*`, 『』 for `:book[…]`, jukugo furigana,
  （） warichu, 図/表, 第{1:一}章 as 第百一章 (not 一百零一), gojūon index,
  Japanese note defaults. `lint_project.py` errors on kana under a Chinese
  locale.
- **Fonts must carry kana and Japanese forms**: Noto Serif JP / Noto Sans
  JP, Shippori Mincho, BIZ UDMincho, never the SC/TC builds (Chinese forms
  of 直 骨 角). A pan-CJK face (Source Han, Noto CJK) gets its Japanese forms
  in the PDF from `locale: 'ja'` (JAN `locl`). Prefer TrueType: those faces'
  CFF `.otf` files are embedded whole (`cffEmbeddedWhole`, well over 10 MB a
  weight). Subset with `--ranges latin,latin-ext,punct,cjk-punct,kana`.
- **Furigana**: one reading over a word is `{麦藁帽|むぎわらぼう}` (group
  ruby, what Aozora's 《》 means); one per character is `{東京|とう|きょう}`
  (jukugo: it may break between characters). Never leave `X《よみ》`,
  `｜`, `［＃…］` in a chapter: convert Aozora files with
  `scripts/aozora.py` (sources.md, "Japanese sources").
- **Vertical books**: `layout.writingMode: 'vertical-rl'`, bound on the right
  (`page.binding: 'auto'`); two-digit numbers stand upright by themselves
  (`cjk.uprightDigits: 2`), `!!` `!?` too. Keep full-width Ｋ, ＧＮＰ, １２ as
  typed (upright, one per cell); never NFKC the text (only half-width kana
  become full width). Traditional texts write numbers in kanji: keep them.
- **Kinsoku and hanging**: auto is `ja-very-strict` (JIS X 4051: no っ, ー,
  々 at a line start); a source whose lines open with small kana or ー is
  `ja-strict`, a newspaper `ja-loose`. Hanging 、。 past the line end
  (burasagari) is on by default (`hangingPunctuation: 'auto'`); a source
  whose line ends are all flush is `'none'`.
- **Indents**: 1 em (`firstLineIndent: {value: 1, unit: 'em'}`), not the
  Chinese 2 em. A paragraph opening with 「 sets the bracket in the indent
  (`cjk.paragraphStartBracket` auto). In Aozora a leading U+3000 is the
  indent, 「 has none, and a paragraph with neither is flush: aozora.py
  keeps that distinction.
- **Notes**: unset fields take Japanese defaults that differ by direction:
  vertical = notes after the chapter (後注) with （1） beside the line;
  horizontal = foot of the column, numbered per page, superscript, ⅓ rule.
  The marker goes before a sentence-final 。 (`先生[^1]。`).
- **Index**: every kanji entry needs its reading: `:index[漱石]{yomi="そうせき"}`
  or kana ruby on the marked text; without it the entry files after the
  kana (`indexReadingMissing`). Citations: `citations.style: 'sist02'` for
  science and technology (the CSL locale is ja-JP by itself).
- **Glyph forms as the source prints them**: keep 旧字体 and 歴史的仮名遣い
  (國, ゐ, いふ) when the edition has them; an IVS selector after a kanji
  (葛 + U+E0100, a variant the name needs) stays. The engine never modernises.
- **Never repair unbalanced 「**: a quotation of several paragraphs (a
  letter in a novel) opens every paragraph with 「 and closes once.

Arabic and right-to-left traps (postext ≥ 1.15; playbooks F7–F8; configuration.md §19d):

- **`config.locale: 'ar'`** (or the region, `ar-EG` ٠–٩, `ar-MA` 0–9) is what
  turns the book: right to left, right binding, a mirrored page (first column
  on the right), the region's digits, no hyphenation, kashida, bold emphasis,
  شكل/جدول. Without it an Arabic book is laid out left to right. Do not set
  `direction` by hand; never mirror margins or swap `left`/`right` in the
  config yourself: body-flow sides are flow-relative, so a preset converted
  from an LTR book keeps working. Header/footer slots stay physical.
- **Words are never cut, hyphenated or letter-spaced.** No `letterSpacing` on
  Arabic styles (`joiningScriptLetterSpacing`); a word wider than a narrow
  cell overflows (`unbreakableWordOverflow`): widen the cell.
- **Emphasis**: keep `*…*`; it prints bold (Arabic is never slanted). Do not
  set `emphasis: 'italic'`.
- **Notes «(١)»**: `[^id]` markers before the following punctuation, and
  `footnotes: {markerTemplate: '({n})', numbering: 'page',
  noteNumberPosition: 'inline'}`. Never type the brackets or digits.
- **Mixed direction**: English paragraphs in `:::paragraphs{dir=ltr}`, a
  Latin title inside Arabic as `:ltr[…]{lang=en}` (else its final stop or
  bracket lands on the wrong side). Headings take `{dir=…}`.
- **Keep the text as typed**: the author's digits, ، ؛ ؟ « », the edition's
  orthography (فى، مائة), the harakat. Quranic ﴿…﴾ typed U+FD3F first.
  Strip only justification tatweels a PDF extraction brings in.
- **Verse**: a classical poem is `:::verse`, one bayt a line `ṣadr || ʿajuz`;
  give vocalised verse a paragraph style with 1.9–2.1 em leading.
- **Fonts**: one family per style, no fallback: Amiri, Noto Naskh Arabic,
  Scheherazade New (Noto Kufi Arabic, Reem Kufi, Aref Ruqaa for headings);
  subset with `--ranges latin,punct,arabic` keeping GSUB/GPOS (`lint_project.py`
  checks glyphs and joining tables). Body 13–15 pt; leading 1.6–1.85 em.
- **Contents at the end** (فهرس): `:::toc` in the last chapter, under a
  heading with `{toc="false"}`.

Full references (load the one you need):

- [references/document-format.md](references/document-format.md): every
  Markdown construct, attribute and trap, verified against the parser.
- [references/configuration.md](references/configuration.md): every config
  key, its default and unit, with two complete example configs.
- [references/project-format.md](references/project-format.md): preset.json,
  chapters, languages, resources, tables, fonts, import, headless rendering.
- [references/sources.md](references/sources.md): extraction per source
  format (PDF, DOCX, PPTX, EPUB/HTML, IDML, LaTeX, XML, text, scans).
- [references/design-analysis.md](references/design-analysis.md): measuring
  geometry, grid, type, colour, boxes, openers and placement, and mapping
  them to config.
- [references/playbooks.md](references/playbooks.md): the unusual cases
  already solved (parts with palettes, openers, verse, glosses, footnotes,
  back-of-book indexes,
  floated/split/nested boxes, print masters, live-text figures, cell
  pictures, rotated tables, translated editions, Chinese books set
  horizontally and vertically, CJK fonts, Japanese books (horizontal, and
  vertical bunko or tankōbon) and Japanese fonts, Arabic books (modern and
  classical vocalised editions) and Arabic fonts, the printed object for the
  Folio 3D viewer…) and which public preset shows each.
- [references/verification.md](references/verification.md): lint, headless
  render, page JPEGs, page-by-page comparison, and a symptom → lever table.

## Setup (once)

```bash
python3 -m pip install pymupdf pillow fonttools brotli     # PDF, images, fonts
brew install pandoc poppler                                  # or apt: pandoc poppler-utils (DOCX/PPTX/EPUB/HTML, page images)
mkdir -p ~/.cache/postext-tools && cd ~/.cache/postext-tools \
  && npm init -y >/dev/null && npm i postext postext-pdf postext-citeproc react @pdf-lib/fontkit @napi-rs/canvas   # headless render + page JPEGs (Node >= 22.15)
```

`@napi-rs/canvas` (prebuilt, no system libraries) lets `render.mjs --jpeg`
paint pages with the engine's own canvas renderer. Add it to an existing
tools folder with `npm i @napi-rs/canvas`.

Optional: `ocrmypdf` (scans), `magick` (SVG fallback rasters, contact sheets),
`verapdf` (PDF/UA).

## Workflow

Work in this order. Show the user intermediate results (the spec sheet, the
first chapter, page comparisons) instead of converting everything blind.

### 0. Agree the brief
Ask only what you cannot infer:

- **Faithful** reproduction or a redesign inspired by the source?
- Which part: the whole book, or a sample chapter first (recommended)?
- Languages.
- Print (PDF) and/or screen.
- The printed object, for the Folio 3D viewer: paper stock and weight,
  binding, cover (a case, or the book's own first and last pages). Read it
  from the source's colophon or the publisher's spec; ask only when it is
  nowhere and the user cares (playbooks A11).
- For Chinese (or Japanese, Korean) sources: the script and region (简体
  mainland; 繁體 Taiwan or Hong Kong), the writing direction (horizontal or
  vertical) and the binding edge (a vertical book is bound on the right).
  Keep the source's; a redesign may change the direction, never the script
  without being asked.
- For Japanese sources: vertical (縦組, bound on the right) or horizontal
  (横組); the grid (字詰め × 行数); the ruby policy (every reading the source
  prints, or only hard words); where the notes go (after the chapter, page
  foot, spread sidenotes); bōten or bold for emphasis; and the edition's
  orthography (新字新仮名 or 旧字旧仮名, kept as it is). For a public-domain
  text: which edition (底本) and its credits.
- For Arabic sources: Modern Standard or classical, the region's digits
  (٠–٩ or 0–9), how much of the text is vocalised (sets the leading),
  whether the poems are set as two-hemistich bayts, and where the contents
  go (front or back).
- Rights, asked once: "Is this your own title (publisher, author or
  licensee)?" Yes → port everything as is. Then only ask about third-party
  pieces they do not control: licensed fonts get `redistributable: false`
  (the files stay in their project, only exports leave them out);
  third-party pictures they cannot reuse get replaced.

Get or produce **a PDF of the original**: the design is read from rendered
pages even when the text comes from DOCX or IDML.

### 1. Inventory
`python3 scripts/inventory.py SOURCE [--pages 1-40]` shows geometry, fonts,
styles in use, media, vector-heavy pages (infographics) and text-less pages
(OCR needed). It names the next command. Rasterise pages for a look:
`pdftoppm -r 50 -png source.pdf /tmp/src/p`.

### 2. Measure the design (spec sheet)
Follow [design-analysis.md](references/design-analysis.md).

- `scripts/measure_layout.py source.pdf --pages <body pages>` gives the trim,
  margins per parity, columns, gutter and leading (the baseline grid).
- `scripts/pdf_extract.py roles source.pdf` gives the type roles (font, size,
  colour).
- Record page types, openers, running heads, box families, table and caption
  looks, placement habits and palette colours.

Write each number with where you measured it.

Chinese books: measure the grid in characters, as their designers specify
it: characters per line × lines per page (字数 × 行数, the 版心), the body size
as its 号 in pt, the line gap as a fraction of the size, the tiers of a
vertical page, and where the punctuation sits (in the corner or centred,
full width or Kaiming). Then set `cjk.grid` (design-analysis.md §2a).

Japanese books: measure the hanmen (版面) as its designer set it:
characters per line × lines per page (字詰め × 行数, a bunko 38–42 × 16–18),
the size in pt or Q (13 Q ≈ 9.2 pt), the line feed (行送り), the indent of
each heading level in body characters and the lines it takes (行取り)
(design-analysis.md §2c).

Arabic books: measure inner/outer margins, not left/right; column 1 is the
right one; note the folio position, the kashida (long elongated joins or
none), the verse hemistich width and gap (design-analysis.md §2b).

### 3. Scaffold the project
```bash
python3 scripts/preset_kit.py init my-book --id my-book --name "My Book" --lang es [--lang en]
```

This creates `build_preset.py`, a generator using the `preset_kit` helpers
(`mm`, `pt`, `color`, `palette`, `text_el`, `rule_el`, `box_el`, `image_el`,
`place`, `bitmap`, `svg`, `table`, `chapters_from_dir`, `font_families`,
`write_manifest`). Put the spec sheet in it as constants and build `config`
from them. Always generate `preset.json`; never hand-edit it.

### 4. Extract the content into draft chapters
Pick the path per [sources.md](references/sources.md):

- **PDF**: edit `roles.json` (the role of each font/size/colour), then run
  `scripts/pdf_extract.py markdown source.pdf --roles roles.json --out draft --lang es --link-refs`.
  Cut the figures with
  `scripts/pdf_figures.py stubs source.pdf draft/resources.json --out-dir my-book/resources`,
  and the tables with `scripts/extract_tables.py source.pdf --pages N`.
- **DOCX / PPTX / ODT / EPUB / HTML / LaTeX / Markdown / JATS / DocBook**:
  `scripts/pandoc_to_postext.py SOURCE --dump-styles`, then
  `scripts/pandoc_to_postext.py SOURCE --out draft --lang es --style-map map.json --link-refs`.
- **InDesign**: export IDML and a print PDF, then run
  `scripts/idml_extract.py roles book.idml > map.json` and
  `scripts/idml_extract.py markdown book.idml --map map.json --out draft`.
- **Scans**: `ocrmypdf` first, then the PDF path.
- **Chinese sources**, vertical ones included: see sources.md, "Chinese,
  Japanese and Korean sources". `idml_extract.py` turns InDesign ruby,
  tate-chu-yoko, kenten and warichu into `:ruby`, `:tcy`, `:dots` and
  `:warichu`, and reports vertical stories and a right-to-left binding.
- **Japanese sources**: an Aozora Bunko text converts with
  `python3 scripts/aozora.py 773_ruby_5968.zip -o draft/01.md --styles styles.json --credits credits.json --report report.json`
  (CP932 zip or text: furigana, bōten, side lines, headings, indents,
  page breaks, 外字, kunten); merge `styles.json` into `paragraphStyles`,
  read the report's gaps, and print the credits block (底本, 入力, 校正) in
  the colophon. Public domain: in Japan an author who died in 1967 or
  earlier; check the country of publication too (EU: life + 70; US:
  published before 1931). Scans of public-domain editions (covers,
  illustrations, the first edition's text) come from the NDL Digital
  Collections. See sources.md, "Japanese sources".
- **Arabic sources**: see sources.md, "Arabic sources" (visual-order PDF
  text, presentation forms, Word `w:bidi`/`w:cs` runs, Wikisource `{{أبيات}}`
  poems → `:::verse`).
- **Other XML or plain text**: a small script of your own, following
  sources.md; reuse `scripts/postext_md.py` to write safe Markdown
  (`render_runs`, `escape`, `heading`, `fence`, `attr_value`,
  `guard_line_start`).

Every extractor writes `chapters/<lang>/*.md`, `resources.json` and a
`report.md` of decisions to review. Copy the chapters into `my-book/chapters/`
and merge `resources.json` into the generator's resource list.

### 5. Curate: make it Postext, not a transcript
Read each chapter against the source pages and apply
[playbooks.md](references/playbooks.md):

- styles as containers: `:::callout{type}`, `:::paragraphs{style}`;
- parts at the top of their first chapter;
- openers as heading attributes (`# Title {author="…" lead="…"}`);
- figures cited with `:ref` in the sentence that first mentions them
  (`style="full"`, `case="lower"` to keep the authored form);
- ornaments and inline tables with `::resource`;
- footnotes as `[^n]` markers + `[^n]: text` definitions (not in headings,
  captions or cells), margin notes as side callouts;
- a back-of-book index as `:index` marks plus a closing `:::index` chapter,
  rebuilt from the source's markup or, for a printed index,
  `scripts/index_marks.py parse|place` once the text is final
  (playbooks A10);
- verse one line per paragraph.

Resources get descriptive ids, captions without the number, `note` credit
lines, `altText`, and bitmap `width`/`height`. Keep the source's wording;
list deliberate deviations.

### 6. Fonts and images
- Fonts: `scripts/fonts.py info|instance|subset|scale|split`.
- Chinese faces: subset a TrueType build to the book's text first
  (`fonts.py subset NotoSerifTC[wght].ttf --out work/ --text-from chapters/ --ranges latin,punct,cjk-punct`),
  then cut static weights (`fonts.py instance`). Layout features (`vert`)
  and vertical metrics survive (playbooks E6).
- Japanese faces: `fonts.py subset NotoSerifJP[wght].ttf --out work/ --text-from . --ranges latin,latin-ext,punct,cjk-punct,kana`,
  then `fonts.py instance` for the weights (playbooks E8).
- Arabic faces: `fonts.py subset Amiri-Regular.ttf --out fonts/ --text-from . --ranges latin,punct,arabic`
  (keeps the joining tables and the tatweel); cut static weights of variable
  faces such as Noto Naskh Arabic (playbooks E7).
- Images: `scripts/images.py prep|join|size`.
- Vector artwork: `scripts/convert_assets.py` (`.ai`/`.pdf` → SVG) and
  `scripts/pdf_figures.py crop … .pdf` (print masters).

Then `python3 build_preset.py`.

### 7. Verify and iterate
Follow [verification.md](references/verification.md).

**Look at pages as JPEGs.** Inside the loop (change the config or a chapter,
look, change again) render only the pages you need, straight from the
layout, and open the files:

```bash
python3 scripts/lint_project.py my-book --quiet
node scripts/render.mjs my-book --lang es --jpeg /tmp/pages --pages 12-15               # printed page numbers
node scripts/render.mjs my-book --lang es --jpeg /tmp/pages --pages '#40' --dpi 150      # 40th page of the layout, sharper
```

Each page is `/tmp/pages/page-NNN.jpg` (NNN = position in the layout; the
log line gives the number it prints). They are painted by the engine's
canvas renderer, the painter of the Sandbox's Canvas tab, in about a second
for a chapter: no PDF to build, no images to extract from it, no browser.
`--dpi` defaults to 100 (enough to read body text); 150–200 for fine
detail. `--chapters 2` lays out that chapter file alone (faster on a long
book; its pages then number from its own first page). Compare with the source from the same folder:

```bash
python3 scripts/compare_pages.py source.pdf /tmp/pages --source-pages 23-26 --render-pages 1-4 --out /tmp/cmp --sheet
```

Build the PDF (`--out`) for the print checks and once at the end, not on
every iteration.

Fix the config or the Markdown until you reach:

- zero lint errors;
- `converged=true`;
- no warnings;
- the same page breaks on most pages, within ±1 page per chapter.

A right-bound book reads its spreads right to left: compare page by page,
and when you look at spreads, the source's odd page is the left one.

### 8. Deliver
```bash
python3 scripts/preset_kit.py pack my-book        # my-book.postext
```

Import it at https://postext.dev/en/sandbox (Books → New → Open a .postext file…), or
serve a presets folder to a local sandbox (`preset_kit.py index <root>` +
`POSTEXT_PRIVATE_PRESETS_DIR`). The same file loads in the user's own
program through the `postext` npm package (`openBundle` → `buildBundle` →
canvas, HTML or `postext-pdf`); see
[project-format.md §7](references/project-format.md#7-bundles-from-code).
In the Sandbox, open the **Folio** tab to see the book bound, on the
paper and binding of `config.folio` (Design → Folio). Report what matches,
the known gaps, and anything that needs a human decision (rights, design
choices).

## Bundles from code

The `.postext` file is the hand-off point between this skill, the Sandbox
and code. The `postext` package reads and writes it (`openBundle`,
`createBundle`, `buildBundle` and backend adapters; details in
[project-format.md §7](references/project-format.md#7-bundles-from-code)).
Use it when:

- **the user renders from their own program**: deliver the `.postext` and
  show the loading snippet instead of asking them to rebuild the config;
- **the source is produced by code** (a JS/TS pipeline, a CMS export):
  write the bundle with `createBundle` from that code instead of
  `preset_kit.py`, so the program stays the source of truth;
- **debugging a program's output**: have the program write its book with
  `createBundle`, import it in the Sandbox, fix config/Markdown/resources
  there with the live preview, export, and load the corrected file back
  (`openBundle`) — or copy the manifest's `config` (defaults already
  stripped) back into the code.

`render.mjs` accepts a packed `.postext` as well as a project folder.

## Rules of thumb

- **Config and Markdown only.** Never ask for engine changes to fit one book.
  If Postext cannot express something, say so, choose the closest
  expression, and note it as a gap.
- **Measure, don't guess.** Every number in the generator has a source page.
- **Draft, then curate.** Extractors produce drafts. Never re-run an
  extractor over curated chapters.
- **Semantic ids and styles.** Name things by role (`keypoints`, `band`,
  `fig-cohort-study`), never by number or position.
- **Look at JPEGs, not PDFs, while iterating.** `render.mjs --jpeg` with
  `--pages`; never build a PDF and rasterise it, or screenshot a browser,
  just to see a page.
- **The book is an object too.** Set `config.folio` (paper, binding,
  covers) from the source's specification; layout ignores it, so it costs
  nothing to get right (playbooks A11).
- **Fidelity where it matters.** Match the grid, type, openers, boxes, figure
  placement and page breaks. Don't chase individual line breaks.
- **Bilingual**: one design, per-language wording (`localized`); the same
  extraction code for both sources.
