# Verification: is the port faithful?

Check in this order, from cheap to expensive, and fix the cause each time.

## 1. Static checks

```bash
python3 scripts/lint_project.py my-book --quiet
```

Fix every ERROR. Common ones:

- pipe tables, code fences or `---` left over from CommonMark;
- a `[^id]` marker with no `[^id]:` definition, or a marker in a heading (prints as written);
- index marks: no term, an unpaired `range`, a `see`/`seealso` target that is no entry, a mark right after a colon or in a caption/cell, marks with no `:::index` to print them;
- a `::resource` or ordered list glued to the paragraph above, or a `$$` fence glued there that does not close before the next blank line;
- unknown callout types, paragraph styles, heading styles or resource ids;
- a bitmap without `width`/`height`;
- `em` in page, gutter, body size or heading sizes (the layout throws);
- `config.customFonts` written by hand;
- Chinese, Japanese or Korean characters a bundled face has no glyph for, or set in a Latin face such as the
  default EB Garamond or Open Sans (checked with fontTools; they would print as empty boxes).

Read every WARN:

- H1 without `breakBefore` once `headings` exists;
- a missing header design (the default one is blue Open Sans);
- font families that are not bundled;
- odd `$`;
- a `here` resource that is never embedded;
- Chinese text with no `config.locale`, or `locale: 'zh'` with no script;
- markup typed with an input method (`：：：`, `＃`, `［＾…］`, `＊＊`);
- a CFF font over 2 MB, a variable font, a vertical book whose Chinese face lacks `vert`.

## 2. Headless layout

```bash
node scripts/render.mjs my-book --lang es --out /tmp/my-book.pdf --png /tmp/pages --dpi 50
```

- `layout: N pages, converged=true`: `converged=false` means the TOC or page
  labels did not settle. Look for a heading design that changes height with
  the number, or a TOC that pushes pages.
- `PARSE unclosedMath|unclosedContainer`: a stray `$` or a missing `:::`.
- `WARN calloutOverflow`: a keep-together box does not fit a column. Set
  `keepTogether: false`, shorten it, or change the box's span.
- `WARN unknownResourceId|unknownDirective|malformedEmbed|unknown…Style|raggedTableGrid`
  (releases with engine content warnings): a reference, `:::` line, `::resource`
  line or style id the engine could not resolve, or a table whose merged cells
  left the grid irregular. Each line says what the output does instead; fix the
  source at the reported file and line.
- `WARN fullwidthMarkup|attributeKeyInvalid` (Chinese sources): markup typed with a
  Chinese input method (`：：：` fence, `＃` heading, `［＾…］` footnote, `｛…｝` attributes,
  `＊＊…＊＊`) is set as text, and an attribute key outside ASCII (`作者=曹雪芹`) is
  dropped. Retype the ASCII form the warning names; keys are ASCII, values any script.
- `PROBLEM font families used but not bundled`: add the files to `fonts[]`.
- `WARN cjkLooseLine` (Chinese): a justified line could not be spread to the measure without more than half
  an em between its characters and was set short. Usually a long Latin word or URL: reword, or let it be.
- `WARN cjkMarksExceedLeading|rubyExceedsLeading`: emphasis dots, name lines or ruby readings do not fit in
  the line gap. Give the paragraph (or the book) more leading.
- `WARN rotateIgnoredVertical`: a figure with `placement.rotate` is cited in vertical text, where figures
  already stand upright. Remove the rotation.
- `CONFIG cjkGridClamped`: `cjk.grid` asked for more characters or lines than the margins leave room for.
- `PDF-WARN missingGlyph` (with `--out`): characters no file of a face has a glyph for; they print as
  empty boxes. `variableFontDefaultInstance`: a variable font printed at its default weight.
  `cffEmbeddedWhole`: a CFF font over 2 MB embedded whole. Fix the font files (playbooks E6).
- `NOTE preset.json has no "configVersion"` (or an older one): the config is
  laid out, as in the Sandbox, with the postext 1.4 rules the line names
  (heading breaks, formula size, space around inline resources, plain
  headings, drop-cap sizes, room under a colon line, box cuts, breaks at dashes, breaks at
  compounds' hyphens, ragged breaking, split under a heading, space under paragraph containers).
  Set `"configVersion": 8` and check the pages again when the config is meant for today's rules.
- Run each language (`--lang`).

## 3. Compare with the source, page by page

```bash
python3 scripts/compare_pages.py source.pdf /tmp/my-book.pdf \
    --source-pages 23-40 --render-pages 1-18 --out /tmp/cmp --sheet
```

Look at the sheet, then at single pairs:

- chapter opener: band, number, title wrap, lead, first text line height;
- running heads: position, content per parity, hidden on openers;
- text block: margins, columns, gutter, lines per column (grid);
- body: face, size, leading, indents, hyphenation, bold and italic colour;
- headings: levels, spacing, numbering;
- boxes: look, position, splits;
- figures and tables: size, column or page span, caption look and position,
  numbering;
- page breaks: aim for the same pages as the source on most pages, and
  within ±1 page per chapter.

Chinese books, page by page:
- lines never start with 、，。）」》 or end with 「（《 (the region's `lineBreak`), and a justified line ends in
  the same cell as the others;
- punctuation sits where the source puts it (corner or centred) and takes the source's widths
  (full width or Kaiming): compare a line with several marks;
- no paragraph ends on a single character (孤字) where the source avoided one;
- a right-bound book: page 1 on the left of its spread; compare spreads right to left;
- vertical text: brackets and quotes in their vertical forms, short numbers upright, Latin sideways, the
  running heads where the source has them (horizontal, fore-edge, outer foot).

## 4. The real viewer

Open the project in the sandbox: import the `.postext` (`preset_kit.py pack`),
or serve the presets folder. Check the canvas, the HTML viewer and the PDF
tab. The sandbox shows its own warnings panel: loose lines, heading
hierarchy, design anchors and placeholders, parity issues. The PDF tab's
output is the reference; headless metrics can differ slightly.

If you cannot open a browser, say so and hand the user the `.postext` and
the page images instead of claiming the port is visually verified.

## 5. Print checks (when the PDF is the deliverable)

- `pdffonts out.pdf`: every face embedded.
- `pdfimages -list out.pdf`: resolution of the photos. PyMuPDF `get_xobjects()`
  confirms print masters are embedded as pages.
- Tagged PDF/UA-1 is the default output. Validate it with
  `verapdf -f ua1 out.pdf` if available.
- Crop details at 600 dpi to check kerning, ligatures and hairlines.

## 6. Typical defects and the lever that fixes them

| Symptom | Lever |
|---|---|
| Chapters run on without a page break | `headings.levels[0].breakBefore: {"enabled": true, "parity": "odd"}` |
| Blue headings/bullets/bold you did not ask for | `main-color` in the palette; `bodyText.boldColor`/`italicColor` = ink |
| Blue Open Sans running heads | define `header` (or `{"elements": []}`) |
| English "Figure" in a Spanish book | declare `resourceTypes` (per locale) |
| Column one or two lines short at the foot | column balancing (`headings.balancing`), on by default: extra grid lines above headings → after lists → under top floats → loose paragraphs; `maxLooseParagraphs`, `maxTracking` |
| Chapter's last page ragged between columns | `balancing.trailing` |
| Short columns before a page-wide box | `balancing.beforeSpan`; `keepTogether: false` on the box |
| Figure lands pages after its citation | cite earlier; `position: "auto"`; check the sequence order (floats never overtake); a page float cited on an opener goes to the next page |
| Box placed whole where the source runs text around it | floated box (`placement: "auto"`/`"top"`), fence right after the citing paragraph |
| Box cut or overflowing | `keepTogether: false` + `splitMinLines`; floats yield to keep-together boxes |
| Only the heading of a section fits at a column foot | it moves on by itself (a heading never closes a column); check `keepWithNext` |
| Over-stretched justified lines (URLs, long compounds) | the engine sets those lines ragged; break URLs with `/`; add soft hyphens (U+00AD) |
| Word overflowing a table cell | the engine divides it; widen `columnWidths` |
| Numbered list drifting off the grid | restate list margins in pt/grid units for both list types |
| Text in a figure in the wrong font | outline the text, or embed `@font-face` subsets in the SVG |
| Blank figure in the browser | too many nested SVG filters: flatten |
| Page count differs by one per chapter | a copy-fitted source (`compact` style), or accept it and note it |
| Chinese lines a character longer or shorter than the source's | `cjk.grid` `charsPerLine`; the region's `punctuationWidth` (Kaiming vs full width) and `compressAdjacent` |
| Chinese punctuation in the wrong corner | the region (`locale` / `cjk.region`) and a face of that region (SC/TC/HK) must agree |
| Empty boxes in the PDF | `missingGlyph`: the face lacks the character; rebuild the subset from the final text (playbooks E6) |
| Bold Chinese headings print regular | a variable font: cut a static 700 instance (`variableFontDefaultInstance`) |
| Vertical brackets turned instead of vertical forms | the face lost `vert` in subsetting: use `fonts.py subset`, which keeps it |
| A vertical book's spreads read left to right in the PDF viewer | Chrome's viewer ignores `/Direction /R2L`; Acrobat and Foxit follow it |

Accept remaining deviations explicitly and list them as known gaps, for
example a paragraph the source wraps around a box, or a caption set 1–5 %
tighter. Do not tweak individual line breaks.
