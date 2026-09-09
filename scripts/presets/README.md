# Preset bundle tooling

Generic, publisher-agnostic helpers to turn a folder of source assets
(reference PDF, `.ai`/`.pdf` figures, bitmaps, fonts, a markdown transcript)
into a **preset bundle** the Postext sandbox can load.

Nothing here is tied to a specific publisher and nothing private is ever
written into this repository: every script takes `--out <dir>` (or works
inside the preset directory you point it at) and writes only there. Keep
preset bundles in a private folder outside the repo and point the web app at it
with `POSTEXT_PRIVATE_PRESETS_DIR`.

## Requirements

| Tool | Used by | Install |
| --- | --- | --- |
| Python 3.10+ | all `.py` scripts | system |
| poppler (`pdftocairo`, `pdftotext`) | `convert_assets.py`, `dump_text.sh` | `brew install poppler` |
| PyMuPDF (optional) | `measure_layout.py`, `extract_tables.py`, bitmap sizes, `pdftocairo` fallback | `python3 -m pip install pymupdf` |
| fontTools (optional) | `extract_ttc.py`, font metadata in `scaffold_preset.py` | `python3 -m pip install fonttools` |

Every script answers `--help`.

## Workflow

```sh
S=scripts/presets
P=~/private/postext-presets/acme-journal      # the bundle, outside the repo

# 1. Create the bundle directory
mkdir -p "$P/resources" "$P/fonts"

# 2. Convert figures: .ai/.pdf -> SVG (glyphs outlined), bitmaps/SVGs copied,
#    names slugified (Fig. 1-1.ai -> fig-1-1.svg). Prints a table with sizes in pt.
$S/convert_assets.py ~/Downloads/acme/figures/*.ai --out "$P/resources"
$S/convert_assets.py ~/Downloads/acme/photos --out "$P/resources" --only '*.jpg' --dry-run

# 3. Fonts. Collections (.ttc) must be split into single faces first.
$S/extract_ttc.py /Library/Fonts/SomeFamily.ttc --out "$P/fonts" --faces regular,italic,bold
cp ~/Downloads/acme/fonts/*.otf "$P/fonts/"

# 4. Reference layout: measure the original PDF, dump its text, pull tables
$S/measure_layout.py ~/Downloads/acme/reference.pdf --pages 3-5
$S/dump_text.sh ~/Downloads/acme/reference.pdf "$P/reference.txt"
$S/extract_tables.py ~/Downloads/acme/reference.pdf --pages 12

# 5. Write the markdown transcript as $P/<name>.md (use reference.txt as a base)

# 6. Scaffold preset.json and register the bundle in ../index.json
$S/scaffold_preset.py "$P" --id acme-journal --name "Acme Journal" --locale en --default

# 7. Fill in captions/altText, paste `config` (from measure_layout.py + the
#    reference), add table resources (from extract_tables.py), then point the
#    sandbox at the presets root:
echo 'POSTEXT_PRIVATE_PRESETS_DIR=/Users/you/private/postext-presets' >> apps/web/.env.local
```

`apps/web/.env.local` is git-ignored (`apps/web/.gitignore` ignores `.env*`).

## Bundle layout

```
<presets-root>/
  index.json
  <preset-dir>/
    preset.json
    <document>.md          (one per locale if needed)
    resources/             figures: .svg / .png / .jpg / .jpeg / .webp / .gif
    fonts/                 .otf / .ttf / .woff2 single faces
```

A `.postext` file exported from the sandbox's Projects panel is one `<preset-dir>` zipped (`preset.json`, `document.md`, `resources/`, `fonts/`). To serve it as a preset, unzip it into `<presets-root>/<preset-dir>/` and add an `index.json` entry (`id`, `dir`, `name`); the sandbox also imports such files directly as local projects.

## Manifest schema (version 1)

### `index.json`

```jsonc
{
  "version": 1,
  "presets": [
    {
      "id": "acme-journal",          // stable id, [a-z0-9-]
      "dir": "acme-journal",         // directory name relative to index.json
      "name": "Acme Journal",
      "description": "Two-column journal article",   // optional
      "locale": "en",                 // optional
      "default": true                 // optional, at most one
    }
  ]
}
```

### `preset.json`

```jsonc
{
  "version": 1,
  "id": "acme-journal",
  "name": "Acme Journal",
  "description": "Two-column journal article",       // optional
  "locale": "en",                                     // optional
  "default": true,                                    // optional

  // A single file, or one per locale
  "markdown": "article.md",
  // "markdown": { "en": "article.en.md", "es": "article.es.md" },

  // Optional PostextConfig JSON (page, margins, columns, typography...).
  // Do NOT put customFonts here: fonts come from the `fonts` array below.
  "config": { },

  "resources": [
    {
      "id": "fig-1-1",                 // referenced from markdown (:ref)
      "typeId": "figure",              // resource type id (figure, table, ...)
      "kind": "svg",                   // "svg" | "bitmap" | "table"
      "file": "resources/fig-1-1.svg", // svg/bitmap only, relative to preset.json
      "width": 240.5,                  // optional, pt (svg) / px (bitmap)
      "height": 180,                   // optional
      "caption": "Caption text",
      "altText": "Accessible description",            // optional
      "placement": { "position": "top", "span": "column" },  // optional
      "note": "Source: ...",                          // optional
      "table": { "model": { "rows": [[{ "content": "A", "isHeader": true }]], "headerRowCount": 1 } }
                                                      // kind "table" only
    }
  ],

  "fonts": [
    {
      "name": "Some Family",           // family name used by the config
      "variants": [
        { "weight": 400, "style": "normal", "file": "fonts/SomeFamily-Regular.otf" },
        { "weight": 400, "style": "italic", "file": "fonts/SomeFamily-Italic.otf" },
        { "weight": 700, "style": "normal", "file": "fonts/SomeFamily-Bold.otf" }
      ]
    }
  ]
}
```

`table.model` is a Postext `TableModel` (`packages/postext/src/types.ts`):
`rows` is a row-major array of `TableCell` (`content`, optional `colSpan`,
`rowSpan`, `isHeader`, `align`, `verticalAlign`), `headerRowCount` the number of
leading header rows. `extract_tables.py` prints models in exactly that shape.

## Scripts

### `convert_assets.py`

```
convert_assets.py <files|dirs|globs>... --out DIR [--only GLOB] [--dry-run] [--force]
```

`.ai`/`.pdf` are rendered to SVG (first page) with `pdftocairo -svg`, which
outlines glyphs as paths so no publisher font is needed to display the figure.
Without poppler it falls back to PyMuPDF (`get_svg_image(text_as_path=True)`).
Bitmaps and SVGs are copied. Existing outputs are skipped unless `--force`. The
printed width/height (pt) come from the SVG `width`/`height`/`viewBox`.

### `extract_ttc.py`

```
extract_ttc.py <file.ttc> --out DIR [--faces name1,name2] [--list] [--force]
```

Writes each face as `<PostScriptName>.ttf` (`.otf` when the face has a `CFF `
table). `--faces` filters by case-insensitive substring of the PostScript name.
Exit code 2 when fontTools is missing.

### `scaffold_preset.py`

```
scaffold_preset.py <preset-dir> [--id ID] [--name NAME] [--description TEXT]
                   [--locale en] [--default] [--markdown FILE] [--force]
                   [--index FILE]
```

Scans `resources/*` and `fonts/*`, writes `preset.json` (or
`preset.scaffold.json` if one already exists, unless `--force`) and upserts the
entry in `<preset-dir>/../index.json` (or in `--index FILE`, with `dir` written
relative to that file, for a nested `<root>/<publisher>/<format>/` layout).
Resource ids are slugs of the file stems;
figures get `typeId: "figure"`, empty `caption`/`altText` and a
`{ top, column }` placement. Font families are grouped by the family name in
the font (`name` ID 16, then ID 1) with weight from `OS/2.usWeightClass` and
italic from `fsSelection` bit 0 / `head.macStyle` bit 1; without fontTools they
are guessed from the filename prefix before `-`.

### `measure_layout.py`

```
measure_layout.py <pdf> [--pages 3-5] [--per-page]
```

Prints `{ "page": { width, height }, "layout": { columns, columnWidth, gutter,
margins: { odd, even } } }` in mm. Columns are detected by clustering the
x-start of text lines; margins are the median distance from the text bbox to
the page edges, per odd/even page. Treat the numbers as a starting point (running
heads, folios and captions are included in the text bbox).

### `dump_text.sh`

```
dump_text.sh <pdf> <out.txt> [first-page] [last-page]
```

`pdftotext -layout` wrapper for reconstructing the markdown.

### `extract_tables.py`

```
extract_tables.py <pdf> [--pages 12] [--header-rows 1] [--strategy lines_strict|lines|text] [--json-only]
```

Runs PyMuPDF `page.find_tables()` and prints one `TableModel` per detected
table. Merged cells are not detected (every cell is 1x1); add `colSpan`/`rowSpan`
by hand if needed.
