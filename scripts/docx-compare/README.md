# Word export fidelity check

Tools for #1399. They measure how closely the formatted `.docx` (the PDF's pages written as Word text boxes, #1392) matches the PDF the same layout produced. They also say where the round-trip tests for the Word import live.

| File | What it does |
| --- | --- |
| `compare.mjs` | Compares one `.docx` with its reference PDF: pixels per page and line breaks per page |
| `export-fixtures.mjs` | Lays out the reference books once and writes each one as a PDF plus a formatted `.docx` (and a semantic `.docx` if asked) |
| `guide-bundle.ts` | Packs the built-in guide into a `.postext` book the CLI can read (Bun only, because it imports the Sandbox's sources) |
| `compare.test.mjs` | Tests for the comparator: `node --test scripts/docx-compare/compare.test.mjs` |

## Requirements

- **Poppler** (`pdftoppm`, `pdftotext`, `pdfinfo`): `brew install poppler`
- **ImageMagick 7 or 6** (`magick`, or `compare` and `montage`): used for the pixel comparison and the contact sheets. Without it, only text is compared.
- **LibreOffice**, which converts the `.docx` to PDF: `brew install --cask libreoffice`. The script looks for `soffice` on `PATH` and in `/Applications/LibreOffice.app/Contents/MacOS/soffice`. If it isn't there, `compare.mjs` exits with code 3, unless `--docx-pdf` gives it a PDF converted some other way (for example exported from Word, see below).
- **Bun**, to run the CLI from its sources and to pack the guide. Built `postext` and `postext-pdf` packages: `pnpm turbo run build --filter=postext --filter=postext-pdf`.

## Comparing one file

```sh
node scripts/docx-compare/compare.mjs book.docx book.pdf --out out/book --sheets
node scripts/docx-compare/compare.mjs book.docx book.pdf --docx-pdf book-from-word.pdf
```

The steps:

1. LibreOffice converts the `.docx` to PDF in headless mode. It runs with its own profile in `<out>/lo-profile`, so a LibreOffice window that is already open does not take over the job.
2. `pdftoppm` rasterises both PDFs at `--dpi` (72 by default).
3. ImageMagick measures each page with `compare -metric AE -fuzz 10%`. A page counts as differing when its share of changed pixels is above `--threshold` (0.02 by default). If the two PDFs have different page sizes, the docx page is padded with white to the reference size and the size difference goes into the report.
4. `pdftotext -bbox-layout` reads the lines of each page. Before comparing, every line is normalised:
   - NFKC, which also undoes ligatures and Arabic presentation forms
   - soft hyphens, tatweels and zero-width characters removed
   - whitespace collapsed

   Lines are then matched by their text, ignoring spaces. A reference line with no match on the same docx page means Word or LibreOffice broke the line somewhere else, or the text changed. For matched lines the report also gives how far they moved (`maxDx`, `maxDy`, `meanDy` in points).

Output in `--out` (default `<tmp>/postext-docx-compare/<name>`):

- `report.json`: the summary, plus for each page the pixel ratio, the diff image, and the lines found in only one of the two PDFs (`missing` are reference lines, `extra` are docx lines)
- `report.txt`: the same text the script prints, with up to `--max-lines` differing lines from each side per page
- `reference/`, `docx/`, `diff/`: the page images
- `sheets/` (with `--sheets`): a contact sheet for each page with differences (or every page with `--sheets all`), showing reference, docx and diff side by side

Options:

- `--pages 1-5,9` limits the comparison to those pages
- `--fuzz` sets the colour tolerance
- `--quiet` prints nothing

Exit codes:

| Code | Meaning |
| --- | --- |
| 0 | Every page is within the thresholds and the page counts match |
| 1 | Differences found |
| 2 | Wrong usage, or a tool failed |
| 3 | LibreOffice not found |

## Reference fixtures

```sh
node scripts/docx-compare/export-fixtures.mjs --out /tmp/docx-fixtures            # PDF + formatted .docx
node scripts/docx-compare/export-fixtures.mjs --out /tmp/docx-fixtures --semantic --compare
node scripts/docx-compare/export-fixtures.mjs --only rtl,vertical-cjk
node scripts/docx-compare/export-fixtures.mjs --list
```

Each fixture is one `postext build <book> --pdf F.pdf --docx F.docx --docx-variant formatted`. The PDF and the `.docx` therefore come from the same layout. The CLI runs from `packages/postext-cli/src/main.ts` under Bun, the same way its tests run it, or from the executable `POSTEXT_BIN` names. Files go to `--out` (default `<tmp>/postext-docx-fixtures`), and `fixtures.json` in that folder lists what was written. A run with `--only` keeps the other entries already in the list.

| Name | Book | Part laid out |
| --- | --- | --- |
| `guide` | The built-in guide, English edition (`guide-bundle.ts`) | Whole book (72 pages) |
| `two-column` | `apps/web/public/presets/deep-sky` (`layoutType: double`) | `--locale en` |
| `column-and-a-half` | `apps/web/public/presets/openstax-fisica` (`oneAndHalf`) | `--locale es --chapters 1` |
| `footnotes` | `apps/web/public/presets/paradise-lost` (footnotes lettered per page) | `--chapters 4` (Book I) |
| `rtl` | `apps/web/public/presets/alf-layla` (Arabic, right-bound) | `--locale ar --chapters 1-4` |
| `vertical-cjk` | `apps/web/public/presets/kokoro` (Japanese, vertical, furigana) | `--locale ja --chapters 1-3` |

A whole run takes about 20 s.

Known gaps in the fixtures:

- **Guide:** the guide's figures and tables are included, with every SVG drawn for the edition. The comic strips, the videos and the cover painting are not: they live in the Sandbox's blob store, and the CLI reports them as missing. The pages that use them differ from the Sandbox's own guide, but the PDF and the `.docx` still come from the same layout.
- **Bioquímica (Feduchi):** this is the other column-and-a-half preset. `postext docx --variant formatted` on it currently crashes inside the CLI's SVG rasteriser (a resvg panic: `geom.rs: called Option::unwrap() on a None value`). The PDF and the semantic `.docx` are fine. Once that is fixed, it can replace or join OpenStax.
- **The private column-and-a-half preset** (Feduchi *colymedia*) lives outside this repository and is not a fixture.

## Manual check in Microsoft Word

LibreOffice does not render text boxes, `eaVert` text, ruby or kashida the way Word does. For each reference fixture, check it in Word once per release that changes the formatted writer:

1. Open `F.docx` in Word (Microsoft 365, Mac or Windows). Accept no prompts that offer to convert or update the file. Word should open it without a repair message.
2. Check:
   - pages: every page has the reference page's size, and the page count is the same
   - line breaks: no line has rewrapped (spot-check the last line of every paragraph and the hyphenated line ends)
   - fonts: File → Info shows the fonts embedded, and nothing falls back to Calibri or Times
3. Export a PDF from Word (File → Save As → PDF, "Best for printing"), then compare it:
   `node scripts/docx-compare/compare.mjs F.docx F.pdf --docx-pdf F-word.pdf --sheets`
4. Look at the contact sheets of the pages that differ. Check each fixture's own points:
   - `footnotes`: the note numbers are lettered per page, and the notes sit at the foot of the column
   - `rtl`: the lines run right to left, the kashida is as long as the engine set it, and Word adds none of its own (`jc=both` on Arabic)
   - `vertical-cjk`: the columns run top to bottom and right to left, the furigana stand beside the base text, and the 縦中横 digits stand upright
   - `two-column` and `column-and-a-half`: the floats and the side column sit where they sit in the PDF
5. Type a word into a paragraph, save, and run `postext import-docx F.docx <book> --dry-run`. Only that word should be reported, as applied.

Write the Word version and the result into the issue that tracks the release.

Text extraction is weak on vertical pages: `pdftotext` returns few lines for vertical text, so on `vertical-cjk` the line comparison says little, and the pixel comparison and the contact sheets carry the check.

## Round-trip corpus test

The export → edit → import round trip over every book in the repository is a vitest suite in `postext`. It is slow, so it only runs when asked:

```sh
cd packages/postext
WORD_CORPUS=1 npx vitest run src/word/integration/corpus
WORD_CORPUS=1 WORD_CORPUS_ONLY=guide npx vitest run src/word/integration/corpus   # one set, or any book-name substring
WORD_CORPUS=1 WORD_CORPUS_VARIANT=formatted npx vitest run src/word/integration/corpus   # one writer only
```

It covers:

- the guide in every edition, cut into chapters the way the Sandbox cuts it
- every Cookbook recipe text, with each recipe's chapters in one locale forming one book
- every showcase preset book

Each book goes through both writers. The semantic writer exports the Markdown as it stands. For the formatted writer, every chapter is first laid out by the engine on a justified, hyphenated two-column page with a deterministic measurer (every character 7 px wide), so line ends, added hyphens and column breaks fall inside most paragraphs. The suite checks two things for each writer:

1. Read back untouched, the book gives no edits and every chapter comes back byte-identical.
2. In each chapter, one word of a plain paragraph is retyped the way Word saves typing. The word is picked by a generator seeded with the chapter's name, so the choice is the same on every run. The context typed over stands once in the whole book and once in the document text, so the edit cannot land in another chapter. Exactly that word must change in the Markdown, and the edit must be reported as applied.

Defects the corpus found are cut down to a few lines in `src/word/integration/corpus.known.test.ts`, which runs with the ordinary test suite. Each case is an `it.fails`: when a fix makes it pass, the test turns red, and the case moves into the writer's own tests.
