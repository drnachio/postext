# Playbooks: the unusual cases, solved

Every case below came up while porting real publications to Postext:

- two-column magazines;
- a column-and-a-half literary edition with margin glosses;
- an exhibition catalogue;
- a report re-set from its PDF;
- a physics textbook converted from XML with formulas;
- a whole two-column medical textbook: 56 chapters in four colour-coded
  sections, with front matter and a dynamic table of contents;
- a column-and-a-half biochemistry textbook ported from InDesign, with
  live-text translated figures.

Each entry: **case → technique**, with the Markdown/config to write. Syntax
details are in document-format.md and configuration.md.

**Principle**: never hard-code a book in the engine. Express every need as
config, Markdown or a resource. If something cannot be expressed, say so and
report it upstream; do not fake it with images of text.

---

## A. Book structure

### A1. Cover, half title, title page, colophon
Level-1 headings with **heading styles** (`numbered: false`, `toc: false`),
each with its own design, header, footer, margins and layout. Metadata comes
from the first chapter's front matter.

```md
---
title: "Deep Sky"
subtitle: "Eight observations"
author: "ESO · NOIRLab"
---

# Deep Sky {style="cover" toc="false" issue="No. 1 · 2026" publisher="Postext"}

:::pagebreak

:::paragraphs{style="colophon"}
Set in Newsreader and Archivo. Texts and images CC BY 4.0.
:::
```

```jsonc
"headingStyles": [{
  "id": "cover", "numbered": false, "toc": false, "span": "page",
  "breakBefore": { "enabled": true, "parity": "odd" },
  "header": { "elements": [] }, "footer": { "elements": [] },
  "layout": { "layoutType": "single" },
  "margins": { "top": {"value": 200, "unit": "mm"} },   // push the colophon text low on the verso
  "advancedDesign": { "enabled": true, "minHeight": {"value": 250, "unit": "mm"}, "slot": { "elements": [
    { "kind": "image", "id": "art", "resourceId": "cover-photo",
      "placement": { "anchor": {"to": "bleed", "edge": "top-left"}, "size": {"width": "fill", "height": {"value": 180, "unit": "mm"}} } },
    { "kind": "text", "id": "t", "content": "{title}", "fontFamily": "Archivo", "fontSize": {"value": 48, "unit": "pt"},
      "fontWeight": 900, "overflow": "wrap", "align": "left",
      "placement": { "anchor": {"to": "page", "edge": "top-left"}, "offset": {"x": {"value": 20, "unit": "mm"}, "y": {"value": 190, "unit": "mm"}},
                     "size": {"width": {"value": 170, "unit": "mm"}, "height": "auto"} } },
    { "kind": "text", "id": "issue", "content": "{attr.issue}", "…": "…" }
  ] } }
}]
```

Heading attribute values cannot contain `"`, `}` or `$…$`. Replace `"` with
`”` (`postext_md.attr_value` does it). A multi-paragraph opener text can use
`\n\n` inside the value.

### A2. Front matter in roman numerals, body from 1
Use `page.pageNumbering: {"format": "lower-roman"}` (or `upper-roman`), then
restart before chapter 1, before its `:::part` if there is one:

```md
:::pagebreak{parity="odd"}

:::numbering{format="decimal" startAt=1}

# First chapter
```

Front-matter pages with different margins, single column or no running heads
use heading styles with `margins`, `layout`, `header` and `footer`. Signatures,
dedications and author lists use `:::paragraphs{style="author"}`, with
right-aligned styles.

### A3. Table of contents that follows the book
Make a chapter holding only the contents heading and `:::toc`. The outline is
computed from the whole book, so renames, moves and author changes follow
automatically.

```md
# Contents {style="contents" toc="false"}

:::toc
```

- `toc.levels` sets the typography per heading level, number column and leader
  dots.
- `toc.subtitle: {"enabled": true, "attr": "author"}` prints a heading
  attribute (author, standfirst, summary) under each entry.
- `toc.parts.design` draws part rows (a band in the part colour,
  "SECTION {number}", title, `{pageNumber}`). `toc.parts.breakBefore: true`
  gives one section per contents page.

### A4. Parts / sections with their own colour
Put the part fence **at the top of the first chapter file of the part**. Its
body is optional: a numbered list of its chapters with their real numbers, or
free text such as a bio.

```md
:::part{number="II" title="Health and illness" palette="band=#f9ba96; band-tint=#fde6d6"}
7. Concepts of health
8. Community health
:::

# Concepts of health \\ and illness {author="A. Author"}
```

- `palette` swaps every palette-linked colour from this part until the next
  one: opener bands, tabs, running-head squares, heading colours, caption
  labels, table headers and TOC rows. Chapters laid out one at a time still
  know their part.
- Config: `parts.design` (the divider page: tinted bleed, number, title),
  `parts.versoDesign` (the back), `parts.breakBefore: {"parity": "always-odd"}`
  (a blank leaf before) and `parts.breakAfter`, and `parts.bodyStyle` (the
  chapter list).
- To paint the blank verso facing a part in the part colour, use a header
  element with `pages: "blank"` and `parity: "even"`.
- For a screen edition without divider pages:
  `htmlViewer.overrides.parts.page: false`.

### A5. Chapter openers
Use H1 with `span: "page"`, `breakBefore` (parity from the book) and an
`advancedDesign` holding:

- band, big number (`{chapterNumber}`), label and `{titleText}` (wrapped,
  fixed width);
- author (`{attr.author}`), lead and standfirst (`{attr.lead}`, with an
  optional `dropCap`);
- illustration (`image` element), credit;
- `minHeight` = the distance from the top margin to where the body starts.

- `\\` in the heading forces a break in the designed title only. The TOC,
  running heads and bookmarks show one line.
- A different picture or colour per chapter needs one heading style per
  chapter (`# Title {style="cap-7"}`), each embedding its own image and
  literal colour.
- `{number}` is empty in a heading opener design. Pass a catalogue number
  or similar as an attribute (`{attr.cat}`).
- A chapter that opens with a poem instead of prose: a style variant without
  the lead element (`{style="opener-poem"}`).

### A6. Magazine: sections containing articles
Either:

- sections are parts (one chapter file per section) and each article is an
  H2 with its own opener design (`breakBefore` parity `even`, so the dark
  band and the hero picture face each other as a spread); or
- one H1 per article with a heading style per article (its own bleed photo,
  kicker and standfirst from attributes).

Place the hero right after the heading with `::resource{id}` (placement
`here`, span `page`). A top float cited on an opener page would land on the
next page, because the opener owns the top band.

### A7. Catalogue: entry on the verso, plate on the facing recto
Open each entry on a verso (H1 `breakBefore: {"parity": "even"}`). Give the
plate type the default placement `top`/`page`, and cite the plate on the
opener page. It floats onto the next page, the facing recto. Size tall plates
with `width = min(1, aspect × maxHeight / textWidth)`, because the engine does
not shrink an over-tall page float. One part per artist
(`:::part{title="El Greco" palette="band=#3d4a63"}` with the artist's dates
and bio as the part body).

### A8. Blank pages
Use `:::pagebreak{parity="always-odd"}` to force a blank leaf before a section
or the credits. A chapter's `breakBefore` parity `odd` adds a blank only when
needed, and `any` never adds one.

### A9. Credits / sources chapter
Generate it from the metadata you kept while fetching each asset (link,
author, licence), in a small paragraph style. Also give each resource a `note`
credit line under its caption.

---

## B. Text

### B1. Verse, poems, song lyrics
Use one paragraph per line, blank lines between, inside a paragraph style
with no indent, no hyphenation, left alignment, a hanging indent for wrapped
lines and `spaceBetween: 0`. Put stanza gaps between separate containers. A
poem title goes in its own style.

```md
:::paragraphs{style="song-title"}
Grisóstomo's song
:::

:::paragraphs{style="verse"}
Since thou dost in thy cruelty desire

the ruthless rigour of thy tyranny
:::
```

### B2. Margin glosses and side notes
Use `layout.layoutType: "oneAndHalf"`, `sideColumnRole: "floats"` and
`sideColumnSide: "outer"`. Add a callout style with `span: "side"`
(placement `here`, a light top stripe and a small-caps title for the lemma).
Insert the callout right after the paragraph it glosses. Anchor it on a text
fragment of that paragraph and fail loudly when a fragment is not found.

### B3. Footnotes
Postext has no footnotes. Choose one:

- endnotes: `^1^` markers plus `:::paragraphs{style="notes"}` at the end of
  the section or chapter (the converters' default);
- side notes in a `oneAndHalf` layout (a `span: "side"` callout after the
  paragraph);
- short notes set inline in parentheses.

Drop reference-number superscripts when the notes themselves are dropped.

### B4. Epigraphs, dedications, signatures, interview questions, sources lines
Each gets a paragraph style (`:::paragraphs{style="…"}`), including
right-aligned ones, a question in the accent colour with `boldColor`, and a
source line in a small face.

### B5. Equations
- A real math source (LaTeX, MathML, OMML) becomes `$…$` / `$$…$$`, with
  `math.enabled` and the scale and margins set. MathML → LaTeX needs care:
  add a space after commands, write the decimal comma as `{,}` and use
  `\text{}` for words.
- For chemistry and simple formulas use `^sup^`, `~sub~` and Unicode arrows
  (`H~2~O + H~2~O ⇌ H~3~O^+^ + OH^−^`), in an `equation` paragraph style
  (centred, no indent) when displayed. mhchem works too:
  `$\ce{H2O}$`.
- There is no math in captions, table cells or heading attribute values; use
  `^ ^`, `~ ~` and Unicode there.
- Escape every literal `$` as `\$` (prices!).

### B6. Headings deeper than six levels
Map levels 6 and 7 to `######` plus an inline mark (`###### **x**` and
`###### *x*`), and style them through level 6.

### B7. Dialogue dashes, years at paragraph start, stray markers
- Dialogue: use `—`, never `- `, which makes a list item.
- `1998. …` at the start of a paragraph becomes a list item: prefix U+2060
  (the converters do it).
- Escape `* _ ^ ~ $` in literal text, including intraword underscores in
  URLs and identifiers.

### B8. Inline styles the parser cannot nest
Write `**a** ***b***`, never `**a *b***`. Move punctuation stuck between two
styled runs to one side. A style change inside a word is a typesetting slip:
the larger part wins. The converters do all of this (`postext_md.render_runs`).

### B9. Copy-fitted pages
The source set some paragraphs smaller or tighter so a page fits. Use a
`compact` paragraph style and accept ±1 page per chapter. Do not chase the
source line by line.

### B10. Inline chips (word banks, keys, tags) and colour legends
- `:chip[Ctrl]{style="key"}` with `chipStyles`.
- A colour key square: `:swatch{color="band"}` (a palette id or `#hex`), in
  text, captions or table notes.

### B11. Lists that stay on the grid
Engine list margins are em-based. Restate `marginTop`/`marginBottom`,
`itemSpacing` and `indent` for both `unorderedLists` and `orderedLists` in
pt or grid multiples, or numbered lists drift off the baseline grid. Mirror
the source's bullet per level (`levels[].bulletChar`: `•`, `–`, `○` with a
symbol face if needed). Every item is one line; type the real numbers.

### B12. Bibliography
Use a paragraph style: smaller size, tighter leading, a hanging indent, and a
negative `marginTop` to sit closer to its heading. One paragraph per entry;
in a PDF, a new entry starts on each un-indented line.

---

## C. Boxes (callouts)

### C1. Box families
Make one `calloutStyles` entry per family: objectives, key points, notes,
worked examples, check-your-understanding, fact files, pull quotes, "in
numbers" panels, grey boxes, badges. In Markdown write
`:::callout{type="id" title="…"}`.

### C2. Visual vocabulary
| Source | Config |
|---|---|
| Coloured stripe on one side | `stripe: {enabled: true, side: "left", width, color}` |
| Hairline frame, rounded corners | `border: {enabled: true, width: 0.5pt}`, `borderRadius` |
| Icon at the start of the title | `icon: {kind: "resource", resourceId: "icon-note", size, align: "top"}` |
| Icon on a corner, half outside | `icon.position: "corner"`, `cornerSide: "outer"` |
| Icon outside the box with a vertical rule | `marker: {kind: "resource", resourceId, gap, rule: {enabled: true, color, width, length}}` |
| Numbered tab ("BOX 1-1") | `label: {background, color, position: "top-right", height, paddingX}` + fence `label="BOX 1-1"` (reduce `marginTop` by the tab's rise) |
| Glyph icon hanging in the margin (a big quote mark) | `icon: {kind: "glyph", glyph: "“"}`, negative left padding |
| Title in caps with tracking | `titleStyle: {textTransform: "uppercase", letterSpacing}` |
| Key terms in colour inside | `body.boldColor` |
| Two columns inside the box | `:::columns{count=2 breaks="4"}` inside the callout (`breaks` = index of the first block of column 2, from the printed page) + `columnGap` |
| A 3-up "in numbers" panel | a dark callout (`span: "page"`) with `:::columns{count=3}` of `**22 000 000** people…` paragraphs |

### C3. Placement
- Mid-page box across the columns: `span: "page"`.
- Side-column box: `span: "side"`. It stacks beside the text and never floats.
- Boxes the book always sets at the head or foot of a page: style
  `placement: "top"` / `"bottom"` / `"auto"`. The text after the box keeps
  filling the page. Floated boxes are placed in order, so **put each fence
  right after the paragraph that cites it** (in citation order).
- A chapter-closing summary nothing may pass: `floatBarrier: true`.
- A badge pinned to a page position: `placement: "fixed"`,
  `fixed: {anchor, offset}`.

### C4. Long boxes
Set `keepTogether: false` to let a box split between children or lines, with
at least `splitMinLines` (default 2) lines per side. The continuation drops
the title and the in-box icon but keeps the stripe, border and marker. Boxes
taller than a column split anyway. Set `snapToGrid: false` for an exact
`marginBottom` (stacked worksheet boxes).

### C5. Nested boxes
A `:::callout` inside a callout is its own box, at the parent's inner width.
Use it for a video box inside a feature, or an answer inside an exercise.

---

## D. Figures and tables

### D1. Numbering and references
Resource ids are descriptive slugs (from the caption), never numbers. Numbers
come from the first citation: `numberingTemplate` `{h1}.{n}` / `{h1}-{n}` /
`{n}`, with `resetOn` and `counterFormat` (roman plates). Keep the authored
form of each reference:

- "Fig. 3-2": `:ref{id="…"}`;
- "Figure 3-2": `style="full"`;
- "figure 3-2" in the middle of a sentence: add `case="lower"`;
- "tables 33-3, 33-4 and 33-5":
  `:ref{id="a" style="full" case="lower"}, :ref{id="b" style="number"} and :ref{id="c" style="number"}`.

### D2. Unnumbered artwork, ornaments, vignettes, logos
Give them a resource type with an empty `numberingTemplate` or
`captionPrefix` and an empty caption, placement `here` (`width: 0.8`,
`align: "center"`), embedded with `::resource{id}`. Design furniture (chapter
motifs, part icons, closing strips) is an `image` element in a design slot.

### D3. Where floats go
The first free slot after the first `:ref`, keeping the order of each
numbering sequence. Placement vocabulary is in design-analysis.md §7.
Ways to choose placement automatically:

- by role: hero here/page, plate top/page, column auto/column, side
  auto/side;
- by aspect: tall or small → side, very wide (> 2.2) → page, otherwise
  column (width 0.9 when wide);
- by original width: wider than the column → page.

### D4. Vector figures for print
Keep the original vector artwork as a single-page PDF **print master**
(`pdfFile`). The PDF export embeds it verbatim, so text stays text. The screen
uses the SVG (`file`).

- `pdf_figures.py crop … fig.pdf` makes one from a region.
- Slim a master down: drop thumbnails and XMP; replace ICC-based colour
  spaces with the device space.
- The SVG preview: `pdftocairo -svg` or `pdf_figures.py crop … fig.svg`.
- Previews with more than ~20 nested filters render blank in Chrome: flatten
  them (Ghostscript `-dCompatibilityLevel=1.3`) or rasterise.

### D5. No originals: cut artwork out of the book PDF
Use `pdf_figures.py stubs` or `crop`. The region is the figure's objects
above or beside the caption, minus the caption lines. Drop printer's marks.
For picture clusters with soft masks or blends, render the region at 300 dpi.
Keep crop regions in a JSON so they can be tuned.

### D6. Live-text figures (translated editions)
Keep labels as SVG `<text>` and embed `@font-face` WOFF2 subsets of the
faces they use in the SVG's own `<defs>`, since an `<img>` cannot see page
fonts. Key translations by source text, not by run index (indices move when
a crop is tuned).

- Words baked into rasters or outlined: erase them (interpolating the
  background) and set new `<text>`.
- Locale-specific artwork: `localized.en.resources[].file` pointing at
  `resources/en/<id>.svg`.

### D7. Photographs
- CMYK and Adobe-CMYK JPEGs: convert to sRGB (`images.py prep`).
- Scans or plates: greyscale, autocontrast and a white-border trim; crop off
  a printed caption by fraction box.
- Downscale to about 300 dpi at the printed size, JPEG q80–85.
- A multi-part figure sent as separate files: join them side by side
  (`images.py join`).
- Pulling a raster out of the book PDF: `pdf_figures.py image --xref`.
- Always declare `width` and `height`.

### D8. Diagrams in a single ink
For a spot-colour book use `diagramStyle.singleInk: true` (every SVG
recoloured to tints of `main-color`). This disables print masters.

### D9. Tables
- A table becomes a resource with a TableModel (`extract_tables.py`, pandoc
  and IDML give drafts). Set header rows (on the header fill, or a bold first
  row), merges (colSpan/rowSpan + hiddenBy), `columnWidths` from the printed
  columns and the per-cell `align`.
- Notes under the table go in `note`. A table continued on the next page is
  one table: merge it and drop the repeated header.
- "Tables" that are really framed text boxes: one row per paragraph, or a
  callout.
- Cell lists: `• item` lines, two spaces per nesting level.
- Tables cited and printed right under their paragraph: placement `here` +
  `::resource`. The rest float.
- Captions above (`resourceTypes[].captionStyle.position: "above"`), with a
  caption bar (`backgroundEnabled`). Table looks: `tableStyle` / named
  `tableStyles` + `table.styleId`, and `borderRadius` for rounded frames.

### D10. Colour-coded cells and legends
Use cell `background` linked to palette ids (`table-compatible`,
`table-incompatible`). The legend goes in the note:
`:swatch{color="table-compatible"} compatible`.

### D11. Pictures inside cells
Use `{"content": "text under it", "image": {"resourceId": "fig-pattern-a", "width": 0.7}, "align": "center", "verticalAlign": "middle"}`.
To cut them from a PDF: on a copy of the page, redact the cell's own text
(only the table text face), render the region at 300 dpi and trim.

### D12. Landscape tables and long tables
- Landscape: `placement: {"span": "page", "rotate": "ccw"}`. It takes a whole
  page, spine-flush, and splits between rows when too long.
- Long tables split with `tableStyle.overflow: "split"`. Header rows repeat,
  and there is a "(cont.)" suffix and a "Continued" marker in the document
  locale. The split never falls inside a rowspan or after a group-head row,
  and the tail keeps at least 3 rows.

### D13. Infographics and charts
Cut them as figures, or transcribe the data: a table resource, a callout
with a list, or a "stats" callout with `:::columns{count=3}`. Detect the
pages by drawing count (`inventory.py` → `vector_heavy_pages`).

### D14. Pictures you may not reproduce
Replace them with licensed ones (CC0 or public-domain collections, Wikimedia
Commons), checking the licence of each file before downloading. Credit them
in `note` and in a credits chapter.

---

## E. Fonts

### E1. Variable Google/OFL fonts
Make static instances per weight and italic at a fixed `opsz`/`wdth`
(`fonts.py instance`). Copy the OFL licence next to them.

### E2. Licensed faces
Subset them to the characters used (`fonts.py subset --text-from chapters/ --woff2`)
and mark them `"redistributable": false`. Check the embedding permission
(`fonts.py info`, where `restricted` means the face may not be embedded).

### E3. Faces missing weights or glyphs
- Semibold used as bold: add a 600 face plus `boldFontWeight: 600`.
- A weight only embedded in the PDF: rebuild it only if the licence allows.
- Missing Greek, arrows or bullets: graft glyphs from a donor face into a
  derived face, or give that list level its own `fontFamily`.

### E4. Horizontal scaling
Use `fonts.py scale --factor 1.10 --family "Garamond 110"`.

### E5. Collections
Use `fonts.py split file.ttc`.

---

## F. Languages

### F1. The same book in two languages
Use one shared `config` in the primary language plus `localized.<lang>.config`.
It replaces whole top-level keys, so restate them: `locale`, `bodyText`
(hyphenation), `headings` (labels), `headingStyles`, `parts`, `toc`,
`resourceTypes`, `header`. Add `localized.<lang>.resources` (captions, notes,
alt text, tables) and chapters per locale. Parse both sources with the same
code, anchoring glosses by per-language text fragments.

### F2. Two different books per language
Give resources language-prefixed ids (`es-1-…`, `en-1-…`) and keep all of
them in the shared list. Give heading styles per locale.

### F3. Translating a finished config
Keep a map of names and literal slot texts ("SECTION {partNumber}"), and walk
the config replacing them. Translate tables cell by cell by exact source
text.

### F4. Number formats
Decimal comma vs point in data and captions; `{,}` in LaTeX.

---

## G. The screen edition (HTML viewer)

`htmlViewer.overrides` is a partial config used only on screen. Use it for:

- simpler openers (no bleed, number top-right, title beside it with
  `width: "fill"`);
- `parts.page: false`;
- side boxes set inline;
- floated boxes kept `auto`.

Arrays (`headingStyles`, `calloutStyles`, design `elements`) are replaced
wholesale, while `headings.levels` merge by level. The viewer also fits
figures to the page.

---

## H. Worked examples: which presets used what

Public presets (open them at postext.dev → Sandbox → Projects; their generator
scripts are in the Postext repository under `scripts/presets/showcase/<id>/`):

| Preset | Source | Techniques |
|---|---|---|
| `deep-sky` (two-column magazine) | press-release HTML pages, two languages | A1 cover with image element, A3, A4 sections as parts with `band` palette, A6 articles as H2 openers facing their hero, B4, B10 swatches in table captions, C2 fact file/pull quote/"in numbers" panel, D9 table with cell fills, E1, F1 |
| `don-quijote` (column-and-a-half novel) | Gutenberg plain text + Commons plates | A2 roman front matter, A4 parts with chapter lists, A5 lead with drop cap and poem variant, A8, B1 verse, B2 margin glosses anchored by text fragment, D2 ornaments, D7 plate processing, D1 roman plate numbers, F1 |
| `pintura-espanola` (catalogue) | museum open-access records + Wikipedia extracts | A7 verso entry / recto plate, A4 one part per artist with its colour, A5 tombstone and catalogue number attributes, D14 licensing, F4 |
| `senales` (report) | the publisher's PDFs (EN/ES) | PDF type roles, reading order, reference calls, D13 infographics transcribed as panels, D14 replaced photos, B4 interview questions/signatures, C4 splitting grey boxes, per-article heading styles (A6) |
| `openstax-fisica` (textbook) | CNXML/MathML | XML two-pass conversion, B5 MathML → LaTeX, C1 worked examples/objectives/checks with `splitMinLines`, D3 placement by aspect, F2 different books per locale |
| `bioquimica-feduchi` (column-and-a-half textbook, one chapter) | InDesign IDML + print PDF | IDML roles and positions from the PDF, `oneAndHalf` with side figures and `captionSide`, C2 corner icons and numbered tabs, C3 floated boxes, `:::columns` in boxes, B5 equations as paragraphs, D6 live-text translated figures, E2 subset licensed fonts, E4 scaled faces, G screen openers |
| built-in guide (two-column manual) | written for Postext | A3 with part rows, A4 coloured blank versos, A5 opener with kicker/lead, C2 quote glyph icon, dark 3-column panels |

A complete 56-chapter two-column textbook was also ported from its print PDF
alone, with the same toolkit:

- PDF type roles, book-vocabulary de-hyphenation and ligature repair;
- Illustrator originals as print masters with re-texted SVG previews;
- CMYK photos converted to sRGB;
- pictures inside table cells;
- rotated, colour-coded tables with swatch legends;
- four sections with part palettes;
- front matter in six files with a dynamic contents;
- seven heading levels;
- floated, split and nested boxes, and a pinned badge with a marker.
