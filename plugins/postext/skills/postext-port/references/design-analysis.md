# Design analysis: from the source's pages to a Postext config

Goal: a **spec sheet** of measured facts about the source (every number with
where it was measured), then a config that reproduces it. Do the measuring
before you write config, and keep the spec sheet in `build_preset.py` as
commented constants. Presets built this way stayed maintainable. Configs
written by eye did not.

## 1. Rasterise and look

```bash
pdftoppm -r 50 -png book.pdf src/p     # whole book, contact-sheet resolution
pdftoppm -r 150 -f 23 -l 26 -png book.pdf src/detail
magick montage src/p-0{20..35}.png -tile 8x2 -geometry +4+4 src/sheet.png
```

Look at page types, and design each one:

- body page (verso and recto);
- chapter opener;
- part divider and its blank back;
- front matter: half title, title, copyright, dedication, contents, preface;
- pages with figures and tables (in the column, spanning the page, in the
  margin, rotated);
- boxes of every kind;
- the chapter's last page;
- bibliography, index and glossary.

## 2. Geometry (mm, from the trim)

`measure_layout.py book.pdf --pages <body pages>` measures from body-size
lines. It reports the trim, the text block margins per parity (odd/even), the
columns, the gutter and **the leading** (the baseline grid).

| Fact | How | Config |
|---|---|---|
| Trim W×H | page size (minus bleed/slug; see trimbox) | `page.sizePreset: "custom"`, `width`, `height` (mm) |
| Facing pages | margins differ per parity | `page.margins.mirror: true`; `left` = inner (spine), `right` = outer |
| Text block | first body line top → last body line bottom; column extents | `page.margins` (top/bottom/left/right) |
| Columns | body line x-starts cluster | `layout.layoutType`: `single`, `double`, `oneAndHalf` (default is `double`!) |
| Gutter | gap between column extents | `layout.gutterWidth` (mm) |
| Column-and-a-half | main M, side S, gutter G | `contentW = M+S+G`; `sideColumnPercent = 100·S/contentW`; `sideColumnRole: "floats"` when the side column only holds figures/boxes/notes; `sideColumnSide: "outer"` |
| Baseline grid | median distance between consecutive body baselines; confirm by counting lines per column | `bodyText.lineHeight` in **pt** |
| Lines per column | count on a full page | check: text block height ≈ lines × leading |
| Headers/footers | position of running heads and folios | design elements anchored to `page`, mm offsets, per parity |

Front-matter pages often have their own margins, single column and roman
folios. Use heading styles with their own `margins`/`layout`/`header`/`footer`
(configuration.md §6).

## 3. Type

`pdf_extract.py roles` / `inventory.py` list every (font, size, colour) with
samples. For each role record face, size, leading, colour, case, tracking,
alignment, indent, space before and after (in grid lines), and hyphenation.

| Role | Config |
|---|---|
| Body | `bodyText.fontFamily/fontSize (pt)/lineHeight (pt)/textAlign/firstLineIndent/indentAfterHeading/paragraphSpacing/hyphenation`; `boldColor`/`italicColor` = ink (they default to the accent!) |
| Headings | `headings.levels[n]`: `fontSize` (pt), `fontFamily`, `fontWeight`, `color`, `italic`, `textTransform`, `marginTop/Bottom` (em of the heading size, or pt), `numberingTemplate` (`{1}.{2}`), `breakBefore` (**always write it for H1**), `span`, `advancedDesign` |
| More than 6 heading levels | levels 6 and 7 → `######` + an inline mark (`###### **x**` / `###### *x*`), styled via level 6 |
| Special headings (cover, preface, appendix, each chapter's own opener) | `headingStyles[]` + `# Title {style="id"}` |
| Paragraph variants (bibliography, epigraph, verse, signature, equations, copy-fitted text, sources) | `paragraphStyles[]` + `:::paragraphs{style="id"}` |
| Lists | `unorderedLists`/`orderedLists`: `indent`, `gap`, per-level bullets (`levels[].bulletChar`, `numberFormat`: `arabic`, not `decimal`), put margins on the grid |
| Captions | `captionStyle` (+ per-type `resourceTypes[].captionStyle`): label colour/weight, description style, note (credit) style, position above/below, caption bar background |
| Tables | `tableStyle` (+ named `tableStyles`): header fill/typography, rules, borders, padding, radius, `overflow: "split"` |
| Boxes | `calloutStyles[]` (§5) |
| Inline chips / key caps | `chipStyles[]` |

- Units: geometry in **mm**, type in **pt**; `em` only where the reference
  allows it (never for page, gutter, body size, heading sizes or design
  offsets, which all throw).
- Families ending in digits (derived faces such as "Garamond 110") are fine.
- **Horizontal scaling** in the source (body at 105–110 %): build a scaled
  face (`fonts.py scale`). Postext has no horizontal-scale setting.
- Semibold used as bold: add a 600 face and set `bodyText.boldFontWeight: 600`.

## 4. Colour

- Take exact fills from the PDF (text span colours, `page.get_drawings()`
  fill colours) or sample pixels on a rasterised page for tints.
- Build `colorPalette` with **semantic ids**, and always include `main-color`
  (every built-in accent points to it): `main-color`, `ink`, `band` (the
  section colour), `tint` (box backgrounds), `rule`, `table-header`,
  `muted`…
- Link every colour in the config to its palette entry
  (`{"hex": "#…", "model": "hex", "paletteId": "band"}`). Palette-linked
  colours can be re-themed per part (`:::part{palette="band=#…"}`) and per
  heading style (`headingStyles[].palette`).
- Per-part colours: sample the same element (a corner tab, a band) on a page
  of each part. Ignore slivers in the bleed; they are layout artefacts.
- CMYK sources: convert values for screen (`hex`), and keep `model: "cmyk"`
  as intent where it matters.

## 5. Boxes (callouts)

For each box family, record the elements below and map them to a
`calloutStyles[]` entry (configuration.md §12):

- background and border (hairline width, radius);
- padding;
- a stripe on one side, with its width and colour;
- an icon: in the box, on a corner half outside, or outside the box with a
  rule (a "marker");
- a numbered tab label ("BOX 1-1");
- title typography: case, tracking, colour, gap;
- body typography (it can differ from the book body), bold colour, lists;
- width (fill or auto);
- span: in the column, across the page, or in the side column;
- placement: inline, floated to the head or foot of a page, or pinned to a
  fixed page position;
- whether it can split across columns/pages (`keepTogether`,
  `splitMinLines`);
- whether floats may pass it (`floatBarrier`).

Icons are resources (SVG), traced from the PDF (`pdf_figures.py crop … .svg`)
or taken from the originals.

## 6. Page furniture and openers (design slots)

Design slots are header, footer, heading `advancedDesign`, `parts.design`,
`parts.versoDesign` and `toc.parts.design`. Each is `{elements: [...]}` in
paint order: text, rule, box and image elements (configuration.md §7).

- **Running heads**: measure one reference element (a hairline, a tab) and
  anchor everything else to it. Split by `parity` (`odd`/`even`). Show on
  body pages only (`pages: "body"`); give openers a foot folio
  (`pages: "opener"`). Placeholders: `{pageNumber}`, `{chapterTitle}`,
  `{chapterNumber}`, `{partNumber}`, `{partTitle}`, `{title}` and
  `{attr.<key>}`. For the book title in running heads, a literal string is
  safer than `{title}`.
- Text element tops from a measured baseline: top ≈ baseline − 0.8 × size ×
  line-height. Cap long titles with `size.maxWidth` and
  `overflow: "ellipsis-end"`. Right/bottom anchors need negative offsets.
- **Chapter opener**: H1 `span: "page"`, `breakBefore` (parity from the book:
  odd = recto), and `advancedDesign.enabled` with elements for:
  - bleed band;
  - big number `{chapterNumber}`;
  - label ("Chapter {chapterNumber}");
  - `{titleText}` with `overflow: "wrap"` and a fixed width;
  - author, standfirst and lead from heading attributes (`{attr.lead}`), with
    an optional `dropCap`;
  - illustration (an `image` element pointing at a resource);
  - credit.

  `minHeight` = distance from the top margin to where the text starts. The
  heading's own text is not drawn when a design is on: include `{titleText}`.
  When every chapter has its own picture or colour, give each one a heading
  style (`cap-1`, `cap-2`…).
- **Part divider**: `parts.design` (a tinted bleed page with number, title
  and chapter list), `parts.versoDesign` (the back), `parts.breakBefore`
  (`always-odd` for a blank leaf before) and `breakAfter`, and
  `parts.bodyStyle` (the chapter list typography).
- **Screen (HTML viewer)**: there are no leaves or bleed there, so give it a
  simpler opener under `htmlViewer.overrides` (arrays such as `headingStyles`
  and `calloutStyles` are replaced wholesale: restate them).

## 7. Placement habits

Record where figures go and map it to `resourceTypes[].defaultPlacement` and
per-resource `placement`:

| Habit in the source | Placement |
|---|---|
| Top or bottom of the column, near the first citation | `position: "auto"`, `span: "column"` |
| Across the page, at the top | `position: "top"`, `span: "page"` |
| Exactly where it is mentioned, including ornaments and small tables under their paragraph | `position: "here"` + `::resource{id}` |
| In the outer margin column | `span: "side"` (layout `oneAndHalf`, side role `floats`) |
| Figure in the main column with its caption in the margin | `span: "column"`, `captionSide: true` |
| Narrower than the column | `width: 0.7`, `align: "center"` |
| Landscape table on its own page | `span: "page"`, `rotate: "ccw"` |
| Tall plate that must fit the page | `width = min(1, aspect × maxHeight / textWidth)`: the engine does not shrink an over-tall page float |

Floats of one numbering sequence never overtake each other. Resources are
numbered by their first mention.

## 8. Write it down

Spec sheet skeleton (keep it as comments and constants in `build_preset.py`):

```python
# Trim 210 x 280 mm (PDF has 7.4 mm slug: trimbox). Book page = PDF page - 12.
PAGE_W, PAGE_H = 210, 280
# Text block measured on pp. 34-41: top 24.5, bottom 21, inner 20, outer 18 mm; mirrored.
# Two columns 83 mm, gutter 6 mm. 56 lines of 11.5 pt (= text block 227 mm).
BODY = ("Minion Pro", 9.5, 11.5)       # face, size pt, leading pt; justified, indent 1 em, no indent after headings
H1 = ("Myriad Pro", 24, "band")        # opener: band 0-45 mm bleed, number 60 pt white at x=20 y=18
H2 = ("Myriad Pro Bold", 11, "main-color")  # 2 lines above, 1 below (grid)
# Palette sampled on p. 35 (tab) and pp. 36, 112, 260, 410 (part colours)
```
