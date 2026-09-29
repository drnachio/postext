---
name: postext-port
description: Port an existing publication into a Postext project (config manifest + enriched Markdown chapters + resources + fonts) that reproduces the original's layout rules; typically a publisher or author migrating their own titles. Use when the user wants to convert, adapt, migrate, re-typeset or rebuild a book, textbook, magazine, catalogue, report, manual, course or deck in Postext from a PDF, Word (.docx), PowerPoint (.pptx), EPUB, HTML, InDesign (IDML), LaTeX, Markdown, XML or scanned pages, Chinese books set horizontally or vertically included; when writing or fixing Postext preset.json/config/chapters; or when asked how to express a source layout (columns, openers, parts, boxes, floats, tables, running heads) in Postext.
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
- Only four containers exist (`:::callout`, `:::paragraphs`, `:::part`,
  `:::columns`, the last only inside a callout) and six directives
  (`:::pagebreak`, `:::numbering`, `:::columnbreak`, `:::space`, `:::toc`,
  `:::index`), plus inline index marks (`:index[…]`, `:index{term="…"}`).
  Anything else prints literally.
- **Extra blank lines add no space.** Where the source has deliberate
  vertical space (a scene break, room above a signature), write
  `:::space` (one body line) or `:::space{lines=N}`.
- **No hard line breaks**: verse, addresses and code lines need one
  paragraph per line inside `:::paragraphs{style="…"}`.

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

Chinese, Japanese and Korean traps (postext ≥ 1.9; playbooks F5–F6):

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
- **Vertical books** (`layout.writingMode: 'vertical-rl'`) are bound on the
  right by default (`page.binding: 'auto'`); page 1 is the recto and sits on
  the left of its spread. `page.margins` keep their names on the sheet.

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
  horizontally and vertically, CJK fonts…) and which public preset shows
  each.
- [references/verification.md](references/verification.md): lint, headless
  render, page-by-page comparison, and a symptom → lever table.

## Setup (once)

```bash
python3 -m pip install pymupdf pillow fonttools brotli     # PDF, images, fonts
brew install pandoc poppler                                  # or apt: pandoc poppler-utils (DOCX/PPTX/EPUB/HTML, page images)
mkdir -p ~/.cache/postext-tools && cd ~/.cache/postext-tools \
  && npm init -y >/dev/null && npm i postext postext-pdf react @pdf-lib/fontkit   # headless render (Node >= 22.15)
```

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
- For Chinese (or Japanese, Korean) sources: the script and region (简体
  mainland; 繁體 Taiwan or Hong Kong), the writing direction (horizontal or
  vertical) and the binding edge (a vertical book is bound on the right).
  Keep the source's; a redesign may change the direction, never the script
  without being asked.
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
- Images: `scripts/images.py prep|join|size`.
- Vector artwork: `scripts/convert_assets.py` (`.ai`/`.pdf` → SVG) and
  `scripts/pdf_figures.py crop … .pdf` (print masters).

Then `python3 build_preset.py`.

### 7. Verify and iterate
Follow [verification.md](references/verification.md):

```bash
python3 scripts/lint_project.py my-book --quiet
node scripts/render.mjs my-book --lang es --out /tmp/my-book.pdf
python3 scripts/compare_pages.py source.pdf /tmp/my-book.pdf --source-pages 23-40 --render-pages 1-18 --out /tmp/cmp --sheet
```

Look at the comparison images and fix the config or the Markdown. Aim for:

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
Report what matches, the known gaps, and anything that needs a human
decision (rights, design choices).

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
- **Fidelity where it matters.** Match the grid, type, openers, boxes, figure
  placement and page breaks. Don't chase individual line breaks.
- **Bilingual**: one design, per-language wording (`localized`); the same
  extraction code for both sources.
