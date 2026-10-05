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

## 2a. Chinese books: the grid in characters

Chinese designers specify a type area in characters (clreq §7.1.1): body size × characters per line ×
lines per page, plus the line gap and, with two columns, the gutter in characters. Measure it that way.

- **Characters per line**: count the characters of a full line (a justified line that is not a
  paragraph's last), marks included. In a vertical book, count down a column. clreq's range is 17–40,
  at most 48 across the page and 55 down it.
- **Lines per page**: count the lines of a full page (the columns of a vertical page, right to left).
- **Body size**: line length ÷ characters. Round to a named size: 五号 10.5 pt (book text), 小五 9 pt
  (magazines, notes), 小四 12 pt, 四号 14 pt, 三号 16 pt, 小二 18 pt, 二号 22 pt, 一号 27.5–28 pt; 六号 7.5–8 pt
  is the smallest for text. Taiwan also uses Q units (0.25 mm): 13 Q ≈ 9.2 pt.
- **Line gap**: pitch − size, usually ½ to 1 em (对开 = ½ of the size); the pitch is `bodyText.lineHeight`
  in pt. Marks and readings between lines need at least ½ em of gap (⅝ with both sides).
- **Punctuation**: where 。，、 sit (lower left of the cell = mainland; centred = Taiwan/Hong Kong), and
  their widths: a comma followed by a character with no gap = Kaiming or half width; the line-end marks at
  half width with a straight right edge = Kaiming or `lineEndHalf`; two marks side by side taking two full
  cells = no compression. These set `cjk.region` / `punctuationWidth` / `compressAdjacent`.
- **Space between Han and Latin**: a visible gap around Latin words and digits = `latinSpacing` (¼ em by
  default); none = `0`.
- Then set `cjk.grid: {enabled: true, charsPerLine, linesPerPage}` and give `page.margins` as minimums: the
  engine centres the type area in the room they leave.

Common trims and grids (五号, 6 pt gap unless noted): 大32开 140 × 203 mm, 28 × 28; 32开 130 × 184 mm,
26–27 × 26–27; 16开 184 × 260 mm, 39 × 37, or two columns of 23 at 小五 with a two-character gutter;
Taiwan 25開 (A5) 148 × 210 mm; 18開 170 × 230 mm.

A vertical page (直排):
- characters run down, columns from the right edge; the book is bound on the right and page 1 is the
  left page of its spread;
- tiers (栏) instead of columns, stacked top to bottom and not balanced;
- the head margin (天头) is usually larger than the foot (地脚); the type area is often placed by its foot;
- running heads: horizontal above the type area, or vertical in the fore-edge (书口/邊峰: chapter title about
  four characters below the head of the type area, folio about five above its foot, at ~80 % of the body,
  in Chinese numerals), or the folio alone in the outer foot corner;
- figures upright, captions horizontal;
- chapter openers (回目) on a new page, often a recto (left page): 第×回 on its own column, the couplet on two
  columns, lowered a few characters.

A thread-bound woodblock edition (线装) has its furniture in the centre strip of the folded leaf (版心:
title, fish-tail 鱼尾, chapter, leaf number). Postext sets one page per page, so reset such a book with
fore-edge heads rather than a centre strip.

## 2b. Arabic books: mirrored pages

An Arabic book is an English book seen in a mirror, and Postext lays it out that way: measure it as you
would an English book, but read every side from the start (right) of the text.

- **Binding**: right; page 1 is the left page of its spread; a recto opener opens on a left page.
- **Margins**: `page.margins.left` stays the *inner* margin with `mirror: true`; on an Arabic recto (odd,
  left page) the inner margin is on the page's right. Measure inner/outer, not left/right.
- **Columns**: column 1 is the right one; a side column at `'outer'` sits on the fore-edge.
- **Type**: Naskh body 13–15 pt where Latin would be 10–11 pt; leading 1.55–1.7 em unvocalised, 1.7–1.85
  partly vocalised, 1.9–2.1 em fully vocalised verse. Identify the face: Amiri (Būlāq look, curved kashidas),
  Noto Naskh / a Monotype-style Naskh (straight kashidas), Kufi or Ruqʿa headings.
- **Justification**: count elongated joins on a few lines; many long kashidas → keep `kashida: 'auto'` (and
  `kashidaMaxLength` up to 1 em for a Būlāq look), none → `kashida: 'none'`.
- **Furniture**: folio centred (often top centre between dashes in classical prints, `– ١٢ –`) or in the outer
  corner; chapter title on left (odd) pages; classical prints may have no running head, only a ruled frame.
- **Verse**: measure the hemistich width and the gap between ṣadr and ʿajuz (→ `:::verse{width=… gap=…}`);
  note an ornament between them (٭, ✻).
- **Notes**: «(١)» in the text, numbering per page or per chapter, the rule on the right.
- **Digits**: ٠–٩ (Mashriq) or 0–9 (Maghreb) on folios and lists → `numerals` / the locale's region.

## 2c. Japanese books: the hanmen (版面) in characters and lines

A Japanese designer builds the type area from the inside out (JLReq §2.4): the size, characters per line
(字詰め), lines per page (行数) and the line feed (行送り); the margins are what is left. Measure it that way and
set `cjk.grid`, as for Chinese (§2a).

- **字詰め**: count the cells of a full line (a justified line that is not a paragraph's last), marks
  included; in a vertical book, down a column. A 、 or 。 hanging below the column's foot (ぶら下げ) is not
  counted: its presence means `cjk.hangingPunctuation` (on by default in Japanese). Bunko 38–42, 四六判
  novels 42–43, A5 two-tier pages 24–26 a tier; JLReq's limits: about 52 down, 40 across.
- **行数**: the columns of a full page, right to left (lines, top to bottom, in a horizontal book). Bunko
  16–18 (新潮文庫 38 × 16, 講談社・中公文庫 40 × 16, 角川文庫 40 × 18), 四六判 17–18.
- **Size**: line length ÷ 字詰め, in pt or **Q** (級, 0.25 mm): 12 Q = 8.5 pt, 13 Q = 9.2 pt, 14 Q = 9.9 pt.
  Bunko bodies are 8.5–9.25 pt, hardcover novels 9–9.5 pt; 8 pt is the floor outside dictionaries.
- **行送り** (line feed, in pt or **H**/歯, 0.25 mm): the distance between two line centres → `bodyText.lineHeight`
  in pt. 行間 (the gap) = feed − size, between ½ and 1 em; ruby and bōten live in it and need half an em
  (bunko feeds are about 1.7–1.8 em). `rubyExceedsLeading` says when it is short.
- **Where the hanmen sits**: centred on the page, or placed by the foot (地) in vertical books with the
  running head in a taller head (天) margin. `cjk.grid` centres the area in the room the margins leave; to
  place it by the foot, give the measured bottom margin and a top margin of trim height − bottom − the
  grid's length (字詰め × size), so no slack is left to share.
- **Headings**: count the body lines a heading takes with its space (行取り: a 中見出し often takes 3 lines,
  centred in them → `lineSpan: 3`) and the cells it is lowered by from the head of the column (字下げ, 4/6/8
  by level → `indent` in body ems). A two- or three-character heading spread to a fixed width (序　章)
  is `jidori`.
- **Indents and blocks**: the paragraph indent (1 cell), a quotation's or a letter's indent (2 cells),
  dates and signatures flush with the foot (地付き) or raised N cells (地からN字上げ → `endIndent`).
- **Line edges**: a column that opens with っ, ゃ, ー or 々 → `ja-strict` (none in many pages → the default
  `ja-very-strict`). A paragraph opening with 「: the bracket inside the indent cell with the text at the
  second cell is JLReq ③ (`paragraphStartBracket: 'half'`, the default), a full blank before 「 is ①
  (`'indent'`), 「 flush with the column head is 天付き (`'flush'`). A blank after ？！ inside a paragraph
  is the default.
- **Annotations**: ruby on one side (right in vertical text), half size, over a whole word (group) or
  per character; bōten shape (sesame ﹅, the default, or dots); side lines; warichu; note markers beside
  the line (（1） right of the column, or small interlinear marks) and where the notes go (after the
  chapter, the page foot, the left page of the spread).
- **Running heads and folios**: in vertical books usually horizontal, in the head margin about one body
  em above the hanmen at its fore-edge side, often on odd (left) pages only; folios in Arabic digits at the
  foot, fore-edge side. A folio set vertically uses kanji (一〇五: `page.pageNumbering.format: 'cjk-decimal'`).
- **Horizontal Japanese books**: the same counts across the page (JLReq's example: 9 pt × 35 字 × 28 行,
  8 pt feed gap); headings centred or flush, numbered 第1章 with Arabic digits; ，． in technical books
  (keep the source's), 、。 in general ones.

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
- Chinese type roles by face rather than weight: Song/Ming (宋体/明體) body, Hei (黑体) headings and labels,
  Kai (楷体) quotations, verse, prefaces, signatures, Fangsong (仿宋) official text. Headings are usually
  10–20 % larger than the body, set in Hei or bold Song, centred or indented two characters. Emphasis is
  dots, never italics.

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

## 7a. The printed object

For the Folio viewer (`config.folio`, playbooks A11), note from the
colophon, the spec sheet or the book in hand: the paper (stock, g/m², shade:
cream or white), the binding (case, glued, sewn, stapled), the cover
(material and colour, or the cover pages themselves), the spine (an image
to cut, its thickness in mm) and any inserts on another paper (which pages).
None of it changes the layout.

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
# Object: 80 g/m2 cream book wove (colophon p. 4), sewn softcover, spine 22 mm (measured): folio below
```
