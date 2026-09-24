---
name: postext-port
description: Port an existing publication into a Postext project (config manifest + enriched Markdown chapters + resources + fonts) that reproduces the original's layout rules. Use when the user wants to convert, adapt, migrate, re-typeset or rebuild a book, textbook, magazine, catalogue, report, manual, course or deck in Postext from a PDF, Word (.docx), PowerPoint (.pptx), EPUB, HTML, InDesign (IDML), LaTeX, Markdown, XML or scanned pages; when writing or fixing Postext preset.json/config/chapters; or when asked how to express a source layout (columns, openers, parts, boxes, floats, tables, running heads) in Postext.
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

## Read before writing anything

Postext Markdown is **not CommonMark**. These habits break a port:

- **No pipe tables, code fences, footnotes, raw HTML, `---` rules or inline
  images.** They print literally or vanish. Tables and figures are
  *resources* (JSON), cited with `:ref{id="…"}` or placed with
  `::resource{id="…"}`.
- **Blank lines around every block.** An ordered list, a `$$` block or a
  `::resource` glued under a paragraph line is swallowed into that paragraph.
- **One line per list item**, 2 spaces per nesting level, real numbers typed.
- **Escape `* _ ^ ~ $`** in literal text, including intraword `_` and prices
  (`\$5`).
- A paragraph starting with `- `, `1998. `, `# ` or `> ` becomes a list,
  heading or quote. Use `—` for dialogue; prefix U+2060 otherwise.
- **Inline marks do not nest** the CommonMark way: write `**a** ***b***`.
  Heading text is plain; marks in headings are stripped.
- Only four containers exist (`:::callout`, `:::paragraphs`, `:::part`,
  `:::columns`, the last only inside a callout) and four directives
  (`:::pagebreak`, `:::numbering`, `:::columnbreak`, `:::toc`). Anything else
  prints literally.
- **No hard line breaks**: verse, addresses and code lines need one
  paragraph per line inside `:::paragraphs{style="…"}`.

Config traps:

- Once `headings` exists, **H1 loses its page break** unless you write
  `levels[0].breakBefore`.
- Accents default to the palette entry `main-color` (blue), and so do bold and
  italic text (`bodyText.boldColor`).
- Without a `header`, the built-in blue Open Sans running head is used.
- Built-in `figure`/`table` types are English.
- Geometry, font sizes and design offsets in `em` throw: use mm and pt.
- Never write `config.customFonts`; fonts come from the manifest's `fonts`.

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
  floated/split/nested boxes, print masters, live-text figures, cell
  pictures, rotated tables, translated editions…) and which public preset
  shows each.
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
- Rights: text, images and fonts. Licensed fonts get
  `redistributable: false`; pictures you may not reproduce get replaced.

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
- footnotes as endnotes or side notes;
- verse one line per paragraph.

Resources get descriptive ids, captions without the number, `note` credit
lines, `altText`, and bitmap `width`/`height`. Keep the source's wording;
list deliberate deviations.

### 6. Fonts and images
- Fonts: `scripts/fonts.py info|instance|subset|scale|split`.
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
