# Verification: is the port faithful?

Check in this order, from cheap to expensive, and fix the cause each time.

## 1. Static checks

```bash
python3 scripts/lint_project.py my-book --quiet
```

Fix every ERROR. Common ones:

- pipe tables, code fences, footnotes or `---` left over from CommonMark;
- a `::resource`, `$$` or ordered list glued to the paragraph above;
- unknown callout types, paragraph styles, heading styles or resource ids;
- a bitmap without `width`/`height`;
- `em` in page, gutter, body size or heading sizes (the layout throws);
- `config.customFonts` written by hand.

Read every WARN:

- H1 without `breakBefore` once `headings` exists;
- a missing header design (the default one is blue Open Sans);
- font families that are not bundled;
- odd `$`;
- a `here` resource that is never embedded.

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
- `PROBLEM font families used but not bundled`: add the files to `fonts[]`.
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

Accept remaining deviations explicitly and list them as known gaps, for
example a paragraph the source wraps around a box, or a caption set 1–5 %
tighter. Do not tweak individual line breaks.
