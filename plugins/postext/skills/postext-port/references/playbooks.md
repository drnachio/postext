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
  live-text translated figures;
- a 120-chapter Chinese classic in three editions: Traditional set
  vertically and bound on the right, Simplified set horizontally, and an
  English translation;
- a Japanese novel from Aozora Bunko set vertically as a bunko, with
  furigana, part openers centred on the page and the Aozora credits in the
  colophon;
- a webcomic re-lettered in seven languages from its text-free pages, and
  manga, strip and album pages lettered from scripts (section I);
- a 28-page children's textbook of placed boxes, maps and time lines in
  three languages, whose first port put its text in the config (section J
  says how to avoid that).

Each entry: **case → technique**, with the Markdown/config to write. Syntax
details are in document-format.md and configuration.md.

**Principle**: never hard-code a book in the engine. Express every need as
config, Markdown or a resource, with the book's text in the Markdown and
only form in the config. If something cannot be expressed that way, stop:
write the gap as an issue draft and ask the user (J9). Do not fake it with
images of text or with text typed into design elements.

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
- A block that must stay on the same column and page as its entries (a part
  row, a section heading with its topics): `toc.groups` /
  `:::toc{keep="part"}` (`keep="1"` with `levels="1-2"` when the blocks are
  chapters with sections), when the installed Postext supports `toc.groups`
  (postext ≥ 1.34: check with `postext --version` and the docs' contents
  settings). Style the rows with `toc.levels` and `toc.parts.design`.
  Otherwise write that contents by hand with
  `:ref{id="…" style="pageNumber"}` page numbers and list it in the report
  as a documented gap. Never retype the source's page numbers, and never
  draw the contents in a design slot.
- On a book of composed pages (postext ≥ 1.42) the contents page is one
  too: a frame with `takes: "toc"` (or `:::toc` inside a `:::frame`) lays the
  same rows, part rows, leaders and links over the page ground the template
  draws, and the title heading is `{toc="false"}` as above
  (composed-pages.md §6.11). Do not set it as a flow page with a heading
  design to get the ground.

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
- author (`{attr.author}`) and a standfirst set apart from the text
  (`{attr.standfirst}`);
- illustration (`image` element), credit;
- `minHeight` = the distance from the top margin to where the body starts.

- The chapter's first paragraph stays in the body text (postext ≥ 1.23). A
  drop cap, a raised initial or a first line in small capitals is the
  level's `dropCap` (configuration.md §4b): `{ lines: 3 }` for a three-line
  initial, `{ lines: 1, fontSize: … }` (or `{ lines: 3, sink: 1 }`) for a
  raised one, `leadIn: { words: 'line' }` for the first line in small
  capitals, the face and colour of the opener. One heading style per opener
  kind can carry its own. Never copy the opening words into a `lead`
  attribute drawn by a design text: that text is set apart, ragged, and
  copy-fitted by hand.
- `\\` in the heading forces a break in the designed title only. The TOC,
  running heads and bookmarks show one line. In Chinese the bookmarks and the
  PDF title join the break with nothing where a Chinese character meets a
  digit or Latin text (`关于举办 \\ 2026年` → `关于举办2026年`), with an
  ideographic space between two Chinese characters (a 回目 couplet), and with
  a space between Latin words (postext ≥ 1.9.2).
- A different picture per chapter needs no style per chapter: a design
  image's `resourceId` takes the placeholders a design text takes
  (postext ≥ 1.8), so one opener style draws the picture each heading
  names: `resourceId: "{attr.vignette}"` with
  `# Title {style="opener" vignette="fig-harbour"}`. An id that resolves
  empty draws nothing. A colour per chapter is form: a part palette (A4)
  when the chapters of a part share it, otherwise one heading style per
  colour with its `palette` override, never one per chapter holding text.
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
opener page. It floats onto the next page, the facing recto. Let the engine
size a plate taller than the page (≥ 1.24): `shrink: "page"` scales it to the
band the recto keeps, `captionMeasure: "body"` and `align: "center"` set the
caption at the plate's width under it, and `minScale` (default 0.7) is the
smallest share of its width it may shrink to. One part per artist
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

### A10. Back-of-book index (analytical index, index of names)
Port it whenever the source has one (`inventory.py` reports `index_pages`,
`index_entries` or `index_page_references`); don't add one the source lacks
unless asked. Postext computes the page numbers, so the port places marks in
the text and never copies the printed numbers (document-format.md §10.5).

- **Word XE fields, LaTeX `\index`:** `pandoc_to_postext.py` writes the marks
  (levels, sort keys, bold = `main`, `see`/`seealso`, `|(`…`|)` ranges).
- **IDML:** `idml_extract.py` turns page references into marks and writes
  the topics' See / See also cross-references to `index-crossrefs.md`.
  Page references that span (to end of story, next N paragraphs) come out as
  one page: add the `range="end"` mark by hand.
- **PDF with a printed index only** (the usual case):
  1. `index_marks.py parse book.pdf --pages <index pages> > index.json`.
     Levels come from leading dashes (`– sub`, `--sub`) or indents; bold
     numbers become `main`, `34–37` a range, `f`/`t` suffixes (figure,
     table) are kept as page refs. Check the entry count against the index
     and fix odd paths in the JSON (a source typo shows up here).
  2. Extract and curate the chapters first; marking comes last, because
     it matches the final text.
  3. `index_marks.py place index.json book.pdf my-book/chapters/es/*.md --in-place --page-fallback --crossrefs xrefs.md --report index-report.md`.
     Each page reference is looked up on its PDF page (through the PDF's
     page labels, or `--offset`) and placed after the same words in the
     Markdown. On a real textbook chapter: ~80 % of references placed from
     the term alone, ~97 % with `--page-fallback` (the page's first words
     when the page does not contain the term), none on the wrong page.
     Terms inside figures and tables cannot be marked: they stay in the
     report.
  4. Paste `xrefs.md` under the index heading, above `:::index`.
  5. Work through `index-report.md`: mark the rest by hand or drop them.
- **EPUB / HTML indexes** (entries linking to anchors): a small script that
  puts `:index{term=…}` at each anchor's position.
- **Layout:** an index chapter `# Índice analítico {style="index"}` +
  `:::index` at the end, a heading style with a two-column `layout`, and
  `index` typography measured from the source (configuration.md §19b). A
  separate index of names: `index="names"` on its marks and its own chapter
  with `:::index{index="names"}`.
- **Check:** `lint_project.py` (unpaired ranges, unknown See targets, marks
  after a colon or in captions, an index never printed), then render and
  compare a few entries with the printed index.

### A11. The printed object (Folio 3D viewer)

The Sandbox's Folio tab and `postext-folio` show the port as a bound book
on a desk. Its look is `config.folio` (configuration.md §21); layout never
reads it, so set it from facts, not taste.

- **Paper.** Read the colophon or imprint page ("printed on 80 g/m² Munken
  Premium Cream", "papel estucado mate de 115 g"), the publisher's spec
  sheet, or the source PDF's metadata. Map it to the nearest stock and set
  `grammage` when the sheet gives one: cream/natural book paper →
  `bookWove`; white offset → `uncoated`; art books and catalogues →
  `coatedMatte`/`coatedSilk` (130–170 g/m²); magazines → `coatedGloss`
  (70–100 g/m²); pocket classics and dictionaries → `bible`; board books →
  `board`. With a measured book: `bulk` = spine thickness (µm) ÷ leaves ÷
  grammage, so the page block in the viewer is as thick as the real one.
- **Binding.** Case-bound with boards → `hardcover`; glued softcover →
  `paperback`; sewn softcover (opens flat-ish) → `sewn`; spiral/lay-flat →
  `layflat`; stapled through the fold (magazines, booklets, programmes) →
  `saddleStitch` (no spine image then); a newspaper (sheets folded once and
  nested, nothing holding them) → `folded` (≥ 1.18; no spine image either),
  with `paper.type: "newsprint"` and a salmon section as
  `:::paper{shade=#f4cfb5}` around its pages.
- **Covers.** When the port includes the cover as its first page (A1) and,
  for an even page count, the back cover as the last, set
  `binding.cover: "pages"`: the book lies closed on it and opens as the
  reader turns it. Otherwise keep `"case"` and set `coverColor` (and
  `coverMaterial`) from the real case.
- **Spine.** Cut or draw the spine as its own resource (`::resource` is not
  needed: a resource listed in the manifest is enough) and name it in
  `binding.spineImage`: the spine as seen with the book standing, head up,
  front cover to the right. Proportions: spine thickness × page height.
- **Plate sections.** Pages printed on another stock in the source (a
  gloss insert in a matte book, card dividers) → `:::paper{type=coatedGloss
  grammage=130}` around their content (document-format.md §7.5). The run
  starts and ends on a page break, as a real insert does.
- **Desk and light** are presentation: a neutral `oak`/`studio` default is
  fine; match the book's mood only when the user asks.
- **Check:** `lint_project.py` validates every key, enum, range and the
  spine resource; then open the Folio tab: orbit with a right-drag to see
  the spine and the block, turn the cover, and check the thickness against
  the real book.

All eight public presets set `folio` (section H): `deep-sky` and
`bioquimica-feduchi` are saddle-stitched on gloss/silk, `don-quijote` and
`paradise-lost` hardcovers on laid book wove with their own covers and a
spine image, `hongloumeng` sewn on bible
paper, `pintura-espanola` lay-flat on 170 g matte, `openstax-fisica` and
`senales` paperbacks.

---

## B. Text

### B1. Verse, poems, song lyrics
Postext ≥ 1.23 sets a poem as it is written in `:::verse` (document-format.md
§12; classical Arabic poems with `||` take the bayt layout of the same fence:
F8). Write one line of verse a line, a blank line between stanzas, and the
source's indents as leading spaces (two spaces = 1 em at the default
`indentStep`; set `indentStep` to the source's step). Give the poem a paragraph
style for its face, size, leading, `indent` and margins, and its
`hangingIndent` for wrapped lines (2 em when none); `turnover=right` sets
turnovers flush right behind `[` as English and Spanish editions do. Since
1.24 a line only a few points too long tightens its word spaces (down to
`bodyText.minWordSpacing`) and stays on one line, as a print edition sets it:
keep the source's lines, never break or shorten them by hand. A poem title
goes in its own style, outside the fence.

```md
:::paragraphs{style="poem-title"}
Stopping by Woods on a Snowy Evening
:::

:::verse{style="verse"}
Whose woods these are I think I know.
His house is in the village though;
  He will not see me stopping here
  To watch his woods fill up with snow.

My little horse must think it queer
To stop without a farmhouse near
:::
```

- Stanza space: one line of the poem's leading (`stanzaSpace`), whole grid
  lines on the grid. Short forms that must not break: `keepStanzas=3` (haiku),
  `keepStanzas=5` (tanka), not invisible callouts.
- Shared lines of dramatic verse: `+ ` opens a line that starts where the line
  above ended. A caesura or a gap the poet set: `keepSpaces` on the fence.
- Vertical Japanese or Chinese poems: leading U+3000 (two units each) or
  spaces indent from the head; `align` defaults to `start` there.
- Line numbers (postext ≥ 1.23): set config `lineNumbers` (configuration.md
  §19f), never typed in the text and never side boxes after every fifth line.
  Poems: `{"enabled": true}` numbers every fifth line of verse in the outer
  margin, from 1 in each poem; `restart: "document"` runs on through a long
  poem split into chapters (books, cantos); a poem resumed after a commentary
  takes `:::verse{lineStart=37}`; a motto or song left out takes
  `numbered=false`. Prose (statutes, Bibles, line-referenced teaching texts):
  `count: "all"`, `restart: "page"` (or `"chapter"`), and `multiColumn:
  "gutter"` on a two-column page; a paragraph style with `lineNumbers: false`
  keeps headnotes and summaries out. A critical edition with a narrow
  fore-edge column: `position: "side"` in a `oneAndHalf` layout with
  `sideColumnRole: "floats"`; side glosses there may collide with a number
  (`lineNumberOverlap`). Match the source's interval, side, size and italics;
  strip the source's own numbers when extracting (they come out of PDFs as
  stray digits at line ends). Notes keyed to lines keep the number typed in
  the note (`:chip[8]{style="line"}`): the engine does not key them.

### B2. Margin glosses and side notes
Use `layout.layoutType: "oneAndHalf"`, `sideColumnRole: "floats"` and
`sideColumnSide: "outer"`. Add a callout style with `span: "side"`
(placement `here`, a light top stripe and a small-caps title for the lemma).
Insert the callout right after the paragraph it glosses. Anchor it on a text
fragment of that paragraph and fail loudly when a fragment is not found.
A gloss the channel of its page cannot hold waits for the next page; at the
end of a chapter the ones still waiting take pages after the text and raise
`afterText` (postext ≥ 1.25; earlier releases dropped them): move those
glosses up or shorten them until the warning is gone.

### B3. Footnotes
Postext ≥ 1.6 sets real footnotes (document-format.md §10.4,
configuration.md §19a):

- write a `[^n]` marker after the cited word or punctuation and a
  `[^n]: text` definition paragraph in the same chapter, under the citing
  paragraph or all at the chapter's end. Numbers follow citation order;
- markers work only in paragraphs, list items, blockquotes and callouts. A
  note cited from a heading, caption or table cell: move the marker into
  the text, or keep the note in the caption or cell itself;
- a note never splits across columns. Long notes: `footnotes.placement:
  'chapterEnd'`, or a callout;
- match the source's size, leading, hanging indent and rule in `footnotes`;
- the converters still emit endnotes (`^n^` markers plus
  `:::paragraphs{style="notes"}`). Rewrite them as `[^n]` / `[^n]:` unless
  the source really sets endnotes as a styled list;
- margin notes stay side callouts in a `oneAndHalf` layout (a
  `span: "side"` callout after the paragraph).

Drop reference-number superscripts when the notes themselves are dropped.

### B4. Epigraphs, dedications, signatures, interview questions, sources lines
Each gets a paragraph style (`:::paragraphs{style="…"}`), including
right-aligned ones, a question in the accent colour with `boldColor`, and a
source line in a small face. A block of short lines that belong together (a
signature with its title, an address, a dedication over two lines) is one
paragraph whose lines end in a backslash (postext ≥ 1.23; document-format.md
§3.3), not one paragraph per line: it then keeps together by the paragraph
rules and its lines are never justified.

```md
:::paragraphs{style="signature"}
Ana Ruiz\
Director of the Observatory
:::
```

### B5. Equations
- A real math source (LaTeX, MathML, OMML) becomes `$…$` / `$$…$$`, with
  `math.enabled` and the scale and margins set. MathML → LaTeX needs care:
  add a space after commands, write the decimal comma as `{,}` and use
  `\text{}` for words.
- For chemistry and simple formulas use `^sup^`, `~sub~` and Unicode arrows
  (`H~2~O + H~2~O ⇌ H~3~O^+^ + OH^−^`), in an `equation` paragraph style
  (centred, no indent) when displayed. mhchem works too:
  `$\ce{H2O}$`.
- Captions, table cells and notes take inline `$…$` (postext ≥ 1.19; Pandoc's rule, so "$5 to $10" stays
  text). Heading attribute values and chip texts have none: use `^ ^`, `~ ~` and Unicode there.
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

### B8a. Roman numerals in small capitals (centuries, reigns, volumes)
Many books set a century or a reign number in small capitals: «siglo
xviii», «Luis xiv», «tomo iii». Write the numeral in lower case inside
`:smallcaps[…]`: `siglo :smallcaps[xviii]`, `Luis :smallcaps[xiv]`. The
letters are drawn as capitals at 70 % of the size, the same on every
backend, and the text stays searchable as its letters. Never type capitals
in a smaller font size by hand, and never write the numeral in capitals
inside `:smallcaps` (capitals stay full size). A source PDF extracts such
numerals in lower case (sources.md): turn `siglo xviii` back into
`siglo :smallcaps[xviii]`, not into `XVIII`, when the source shows small
capitals; full capitals only when the source prints full capitals. A
whole paragraph in small caps is a paragraph style with `smallCaps: true`.

### B9. Copy-fitted pages
The source set some paragraphs smaller or tighter so a page fits. Use a
`compact` paragraph style and accept ±1 page per chapter. Do not chase the
source line by line.

### B10. Inline chips (word banks, keys, tags) and colour legends
- `:chip[Ctrl]{style="key"}` with `chipStyles`.
- A chip is one unbreakable box: it never breaks across lines. A chip that
  does not fit moves to the next line, and one wider than the line
  overflows. Keep chips to a word or two.
- A **highlighted phrase** (a band behind key words that runs over line
  ends, as school textbooks do) is `:mark[text]{style="id"}` with
  `markStyles` (postext ≥ 1.34.1; document-format.md §10.1b,
  configuration.md §13b): the words stay text, break and hyphenate with the
  line, each line gets a band, and the mark takes no room. One style per
  distinct highlight colour of the source, its text colour in the style's
  `color`. Never a row of chips split by hand at the source's line ends,
  and never two chips for a translated phrase. A heading drawn by a design
  (an opener) prints the words without the band. On an older engine
  `:mark[…]` prints literally: use a chip for one or two words and say so.
- A **heading on a colour band** that wraps to two lines, each line on a
  band of its own with rounded ends (a textbook's unit title):
  `## :mark[The water cycle and the seasons of the river]{style="band"}`
  with a mark style that clones its ends on every line (postext ≥ 1.52):
  ```json
  "markStyles": [{ "id": "band", "background": { "hex": "#1d4f91", "model": "hex" },
    "color": { "hex": "#ffffff", "model": "hex" }, "paddingX": { "value": 0.35, "unit": "em" },
    "borderRadius": { "value": 0.3, "unit": "em" }, "decorationBreak": "clone" }]
  ```
  The default `"slice"` cuts one band at the line end (no padding or corner
  there), as a highlighter does on running text. A heading drawn by a design
  (an opener) prints the words without the band.
- A colour key square: `:swatch{color="band"}` (a palette id or `#hex`), in
  text, captions or table notes; from 1.52 it takes `size`, `border`,
  `radius` and `gap` to match the source's key.

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

### B13. Tab stops: menus, price lists, cast lists, marks, forms, run-in indexes
Text the source aligns at fixed positions inside a line (postext ≥ 1.23;
configuration.md §4a, document-format.md §10.9) is paragraphs whose style has
`tabStops`, with `:tab` where the source has a tab. Never rebuild it as a
two-column table resource, runs of no-break spaces, `:::space` or chips
pushed apart. How to read the source: a value whose right edge lines up
from line to line is an `end` stop (at `'end'` when it touches the margin,
else at the measured distance from the start of the text); values lined up
on their decimal point are `decimal`; columns whose left edges line up are
`start` stops at lengths; dots, a dotted line or a ruled blank between are
the leader (`'.'`, `'. '` when the dots are spaced, `'·'`, `'rule'`). Measure
positions from the start of the paragraph's measure, after the style's
`indent`.

- **Menu, price list, wine list**: a `menu` style with one stop
  `{position: 'end', align: 'end'}` (add `leader: '. '` when the source sets
  dots) and one paragraph per dish, `Leek and potato soup :tab 8.50`. A dish
  with its translation under it: one paragraph whose first line ends in a
  backslash (`Sopa de puerros\` over `Leek and potato soup :tab 8.50`). A
  long dish name takes its last word down with the price instead of
  overrunning it. Two price columns (glass, bottle): two stops,
  `{position: '78%', align: 'end'}` and `{position: 'end', align: 'end'}`;
  their headings (12 cl, 75 cl) are one more paragraph in the same style. A
  wine list with region rows spanning the card may read better as a table
  resource: keep it there only when it needs merged rows or rules.
- **Cast list, dramatis personae**: `{position: 'end', align: 'end', leader:
  '.'}` with `smallCaps` for the roles if the source sets them so,
  `Ophelia :tab Marta Gil`. A role that wraps keeps the actor on its last
  line.
- **Exam papers, worksheets**: marks flush right on the question's last line,
  `… take place? :tab :chip[1 mark]{style="marks"}`, with the list's stop
  from `bodyText.tabStops: [{position: 'end', align: 'end'}]` (or
  `:tab{at=end align=end}` in the line). Answer lines are still
  `:::space{lines=N}` in a box (C1); a single ruled blank after a prompt is a
  `rule` leader.
- **Forms**: `Name :tab` in a style whose stop is `{position: 'end', leader:
  'rule'}`; labels in a column, blanks after it: a `start` stop at the
  label column's width plus the ruled `end` stop, `Name :tab :tab`.
- **Run-in indexes, lists of figures, catalogue entries**: `{position:
  'end', align: 'end', leader: '.'}` and `Coleridge, S. T. :tab 12, 48`. The
  book's own contents and back-of-book index are generated (`:::toc`,
  `:::index`); do not type them with tabs.
- **Small accounts and tables inside prose** (two or three aligned values, no
  header rules): start stops at lengths, a `decimal` stop for amounts
  (`decimalChar` follows the locale). A real grid with a header row, rules,
  fills or merged cells stays a table resource (D9).
- Paragraphs holding a tab are set line by line, never Knuth–Plass, and
  justified lines stretch only after their last tab, so set such styles
  `textAlign: 'left'` unless the source justifies the text after the tab.
  Vertical books have no tab stops: a `:tab` there is a word space
  (`tabInVerticalText`); set such lists as a table resource or as lines with
  `:::paragraphs` styles.
- Word sources: the Sandbox's Word import turns each Word tab into `:tab`
  with the attributes of the stop Word set for it (its paragraph's and its
  style's `w:tabs`, as one-off `:tab{at=… align=… leader=…}`); the extractor
  scripts write a tab as a space, so put `:tab` back where the source aligns
  text, and give the paragraph style the stops (from the IDML `TabList` or
  the Word style) so the text keeps bare `:tab`.

### B14. Code listings, terminal sessions, configuration files
A program, a shell session or a file shown in the text is a ```` ``` ```` fence
(postext ≥ 1.23; document-format.md §3.4, configuration.md §12b), copied as
the source sets it: indentation, blank lines, columns of output. Never
rebuild it as one paragraph per line in `:::paragraphs` or a callout, with
word joiners, no-break spaces and escaped `* _ ^ ~ $`, and never colour it
with bold and italic runs.

- **The fence**: the language first (`js`, `python`, `bash`, `console` for a
  session with prompts, `json`, `sql`…), then the file name the source prints
  over it as a bare title (`` ```bash backup.sh ``) or `title="…"`; the
  source's line numbers as `lineNumbers start=N`; lines it shades as
  `highlight="3,5-7"`; a listing across both columns as `span=page`.
- **The look** goes in `codeStyle`: the source's mono face (`fontFamily`;
  for Japanese or Chinese comments a mono face with kanji, BIZ UDGothic, so
  full-width characters take two cells), its size against the text, the
  box's tint or dark ground (`background`, `color`), padding, radius, border.
  A file name on a tab at the box's top edge: `codeStyle.label` (the title
  then prints there). Lines the source turns over behind a mark: `overflow:
  'wrap'` with its `wrapMarker`; a source that sets a long listing smaller:
  `overflow: 'shrink'` with `minFontScale`.
- **Colours**: measure the source's colours per kind (keywords, strings,
  comments, numbers, the prompt and the output of a session) into
  `codeStyle.tokens`; link them to palette entries when parts recolour the
  book. A language the tokenizer does not know is set plain: register a
  highlighter (`registerCodeHighlighter`) in the host when it must be
  coloured, or accept plain.
- **Inline code** in a mono face (`grep`, `--force`): `codeStyle.inline`
  (with `background` when the source tints it). Keyboard keys stay chips.
- **Checks**: `codeOverflow` names listings with lines wider than the box;
  shorten the box's padding, the size, or choose `shrink`/`clip` as the
  source does. A preset stamped below `configVersion` 9 reads fences as
  Markdown: write 9.

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
| Rounded tab, a pill on the box's edge | `label.borderRadius` (≥ 1.52; one length or per corner; half the tab's `height` for a pill) |
| Tab grown out of the box, one outline | `label: {joined: true, fillet, offset: 0}` + the box's per-corner `borderRadius`; `label.borderRadius` when the tab's outer corners differ (≥ 1.52) |
| Glyph icon hanging in the margin (a big quote mark) | `icon: {kind: "glyph", glyph: "“"}`, negative left padding |
| Title in caps with tracking | `titleStyle: {textTransform: "uppercase", letterSpacing}` |
| Key terms in colour inside | `body.boldColor` |
| Two columns inside the box | `:::columns{count=2 breaks="4"}` inside the callout (`breaks` = index of the first block of column 2, from the printed page) + `columnGap` |
| A 3-up "in numbers" panel | a dark callout (`span: "page"`) with `:::columns{count=3}` of `**22 000 000** people…` paragraphs |
| Columns with no frame, in the text (briefs, a poster band) | no box: `:::columns{count=3 span="page"}` in the running text (≥ 1.25), `rule` for a rule down each gap |

### C3. Placement
- Mid-page box across the columns: `span: "page"`.
- Side-column box: `span: "side"`. It stacks beside the text and never floats.
- Pull quote or sidebar with the text running beside it inside the column:
  `:::callout{wrap="right" width=0.4}` (≥ 1.24; `placement="top"` floats it to
  a column's head with the column's first lines beside it). Not a
  `:::columns` group: the text after the box runs on beside it and under it.
- Boxes the book always sets at the head or foot of a page: style
  `placement: "top"` / `"bottom"` / `"auto"`. The text after the box keeps
  filling the page. Floated boxes are placed in order, so **put each fence
  right after the paragraph that cites it** (in citation order).
- A chapter-closing summary nothing may pass: `floatBarrier: true`.
- A badge or a box pinned to a page position: `placement: "fixed"`,
  `fixed: {anchor, offset}`; the text stays in the fence (J2).

### C4. Long boxes
Set `keepTogether: false` to let a box split between children or lines, with
at least `splitMinLines` (default 2) lines per side, and never a lone line of
a paragraph or list item (`layout.boxChildSplitMinLines`, default 2). The continuation drops the title and the in-box
icon (the text keeps the icon's column, empty) but keeps the stripe, border
and marker. Boxes taller than a column split anyway. Set `snapToGrid: false` for an exact
`marginBottom` (stacked worksheet boxes).

### C5. Nested boxes
A `:::callout` inside a callout is its own box, at the parent's inner width.
Use it for a video box inside a feature. An exercise's answer is not a
nested box: write it in the `:::exercise` (C7).

### C6. Worksheets: exercises of one shape, words in the Markdown
Workbooks repeat a few shapes (a word to trace on a ruling, a sentence to
copy, four pictures with their words, a row of squares) with different
words. One box style per shape; each exercise is a fence whose content is
its words, and the style's `design` (postext ≥ 1.45) sets them:

```md
## The vowels {kicker="Lesson 1" letters="a e i o u" pic="bee"}

:::callout{type="word" title="Trace and write"}
owl
:::

:::callout{type="dictionary" p1="sun" p2="moon" p3="cat" p4="fish"}
- sun
- moon
- cat
- fish
:::
```

```js
{ id: 'word', backgroundEnabled: false, padding: { top: pt(0), right: pt(0), bottom: pt(0), left: pt(0) },
  titleStyle: { fontSize: pt(9), lineHeight: mm(5), gap: mm(2) }, snapToGrid: false,
  design: { setsContent: true, minHeight: mm(40), slot: { elements: [
    { kind: 'image', id: 'ruling', resourceId: 'ruling', decorative: true, placement: {…} },
    { kind: 'text', id: 'model', content: '{boxText}', fontFamily: 'Playwrite GB J', placement: {…} },
    // the copies to trace: the same word in dots, as many as the row holds (postext ≥ 1.46)
    { kind: 'text', id: 'copies', content: '{boxText}', fontFamily: 'Playwrite GB J', fontWeight: 100,
      dotted: {}, repeat: { gap: mm(8) }, placement: { …, size: { width: 'fill' } } },
  ] } } }
// dictionary: texts '{boxText.1}'…'{boxText.4}', images '{attr.p1}'…'{attr.p4}'
```

The lesson stays a heading (`##` under the book's `#`), the exercise is not
one: never use `###`/`####` with attributes such as `{w="owl" model="owl"}`
as design slots. The text a reader reads (the word, the box title) lives in
the chapter; attributes carry only ids (pictures, patterns). Recipe Nº 161
(handwriting workbook) is the worked example. Exercises that ask and answer
(choice, gaps, matching…) are `:::exercise` fences instead (C7).

### C7. Textbook and workbook exercises: `:::exercise`
Activities, review questions, tests and drills are `:::exercise` fences
(document-format.md §7.6), not boxes with answer boxes inside. The engine
prints the pupil's version from the answers written in the Markdown, builds
the key and places the solutions, and the HTML and EPUB editions make the
same exercises answerable.

1. **Read the source's conventions** before writing a line: how exercises
   are numbered (bold `1.`, a number in a disc or square, "Activity 3",
   一、二、, restarting per unit or running through the book), how options
   are labelled (a) b), A. B., ア イ, أ ب) and ticked (a box, a ring, the
   label circled, a bracket （　） after the stem), how a blank looks (line,
   dots, box, its width), what the writing space is (ruled lines, squares,
   Seyès, 田字格, an empty frame), difficulty marks and activity icons, and
   where the answers are (none, after each exercise, upside down at the
   foot, at the end of the unit or the book, a teacher's edition in red).
2. **Pick the kind of each exercise** from what the pupil does: tick or
   ring an option `choice`; T/F `truefalse`; fill in `gaps` (word bank:
   `bank` or `::bank[distractors]`; "circle the right form" is an inline
   choice `[[go | (goes)]]`); join with lines `match`; number the steps
   `order`; unscramble words `scramble`; put words in columns `sort`;
   circle/underline words in a text `mark`; write an answer `open`; word
   search, crossword, column operations. A source exercise that mixes two
   kinds becomes two fences, or an `open` one when nothing is graded.
3. **Write the answers in the Markdown**: `- [x]`, `[[answer | variant]]`,
   `Left -> Right`, the right order, `- Category: a, b`, `- WORD: clue`,
   `- 345 + 278`. A worked or model answer goes in `:::solution`; a hint in
   `:::hint`. Take the answers from the source's key or teacher's book;
   when the source has none, solve the exercise and say so in the report.
   Keep printed numbers with `n=` only when the book's numbering is not a
   plain count (gaps, a number repeated in a later unit).
4. **Mimic the look with `exerciseStyles`** (configuration.md §13c): the
   number's `shape`, `background`, `color`, `fontFamily` and `label`; the
   instruction's family and colour; `options.labels`/`suffix`/`marker`/
   `layout`/`bracket`; `blank.look`/`width`/`color`; `area.kind`/`lines`;
   `trueFalse.labels` only when the book's letters differ from the
   language default, `trueFalse.place: 'start'` when the boxes or the
   bracket open the statement; `arithmetic.working` and
   `partialProducts` for the room the source leaves under a sum (≥ 1.60);
   `level` glyphs; `icons` glyphs; `answers.color` for
   the teacher's red; `box` naming a `calloutStyles` entry when the
   exercises sit in a tinted or ruled frame. One style per look (activity,
   review, test), never one per kind or per page.
5. **Place the solutions** with `exercises.solutions.placement` (`after`,
   `inverted`, `chapterEnd`, `directive` + `:::solutions` or
   `:::solutions{scope="book"}` in a final chapter); a teacher's edition is
   the same chapters with `exercises.edition: 'teacher'` (a second edition
   of the bundle, not a copy of the text). A screen edition that should
   hide them sets `htmlViewer.overrides.exercises`.

Content/form rule: every word a pupil reads (instruction, question,
options, the words of a bank, clues, the solution) stays in the chapter;
the config holds only form. Never type `______` for a blank, `☐` for a box
or `a)` for a label, never draw answer lines with `:::space` inside a
callout, and never print solutions by hand in a callout: the engine sets
all of them from the exercise.

```md
:::exercise{type=truefalse level=1 icon="pair"}
True or false?

- [x] The Sun is a star.
- [ ] The Moon gives its own light.
:::
```

```js
exerciseStyles: [{ id: 'activity', box: 'activity-frame',
  number: { shape: 'disc', background: { hex: '#e2631b', model: 'hex' } },
  instruction: { fontFamily: 'Source Sans 3' }, options: { marker: 'circle' },
  blank: { look: 'dots' }, icons: { pair: { glyph: '👥' } } }],
exercises: { solutions: { placement: 'chapterEnd' } },
```

Check the pages for: blanks wide enough for a pupil's hand (raise
`blank.minWidth`), exercises split across a page (a framed style's callout
`keepTogether`), word searches or crosswords that could not place a word
(`exerciseWordUnplaced`), and the key at the chapter end matching the
source's.

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

A figure the source sets at the head of the page that cites it (a plate
over the text that introduces it, LaTeX's `[t]`): `citingPage: true` on
its placement or its type's `defaultPlacement` (≥ 1.25), or
`layout.floatsAtCitingPage` for the whole book. Do not move the citation
earlier to drag the figure forward. It never heads a chapter's first page
or a page after a forced break; `layout.maxTopFraction` (0.7) caps how
much of the column it takes.

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
Keep labels as SVG `<text>` and name the family in `font-family`: since
postext 1.25 the engine embeds the faces they use when the picture is shown
(the bundle's fonts, then Google Fonts or Fontsource families), and the PDF sets them as real
text, so neither outlines nor hand-made `@font-face` subsets are needed.
Ship the faces the labels use in the bundle's `fonts` when neither
Google Fonts nor Fontsource has them. Key translations by source text, not by run index (indices
move when a crop is tuned).

- Words baked into rasters or outlined: erase them (interpolating the
  background) and set new `<text>`.
- Locale-specific artwork: `localized.en.resources[].file` pointing at
  `resources/en/<id>.svg`.

### D7. Photographs
- CMYK and Adobe-CMYK JPEGs: convert to sRGB (`images.py prep`): browsers draw CMYK wrongly. A
  print render (`print`, PDF/X) separates them back through the output profile.
- A source printed as PDF/X, or with a bleed: set `print` and `page.cutLines` from
  `inventory.py`'s `suggested_config`. IDML CMYK swatches come out of `idml_extract.py markdown`
  as `palette.json` with their `cmyk` values: merge it into `colorPalette` so brand colours print
  exact.
- Scans or plates: greyscale, autocontrast and a white-border trim; crop off
  a printed caption by fraction box.
- Downscale to about 300 dpi at the printed size, JPEG q80–85. Declare the file's real pixels and,
  when the page is laid out at another dpi (a newspaper at 150), `resolution: 300` on the picture or
  `layout.bitmapResolution: 300` (≥ 1.24) instead of print-size pixels worked out by hand; with
  sources whose files state their resolution, `layout.bitmapResolution: 'file'`.
- A multi-part figure sent as separate files: join them side by side
  (`images.py join`).
- An illustration on white that should let the text run round it:
  `images.py cutout <resource-id>` makes the white joined to its edge
  transparent (a white plate inside the art stays) and adds a `contour`.
  To trim a cut: `images.py crop <resource-id> --left 3mm --bottom 40`
  (px or mm per side); anchors, `avoid`, `faces`, `safeArea` and contour
  points move with the crop, so labels stay on their points.
- Pulling a raster out of the book PDF: `pdf_figures.py image --xref`.
- Always declare `width` and `height`.
- A narrow photo with its caption beside it in the column (manuals,
  textbooks): `placement: {captionSide: "inside", width: 0.5}` (≥ 1.52), in
  a one- or two-column page, a float, a `here` embed, a box or a frame. The
  caption takes the slot's rest after `layout.gutterWidth`, level with the
  picture's top. `captionSide: true` is the side column of a
  column-and-a-half layout, not this.

### D8. Diagrams in a single ink
For a spot-colour book use `diagramStyle.singleInk: true` (every SVG
recoloured to tints of `main-color`). This disables print masters. With a
spot `inkColor` the drawings print in tints of that plate. SVGs that keep
several inks of their own print on them only by name (`data-spot`,
`icc-named-color`) or by a palette spot colour of exactly their hex
(configuration.md, ColorValue `spot`).

### D9. Tables
- A table becomes a resource with a TableModel (`extract_tables.py`, pandoc
  and IDML give drafts). Set header rows (on the header fill, or a bold first
  row), merges (colSpan/rowSpan + hiddenBy), `columnWidths` from the printed
  columns and the per-cell `align`. From a PDF, `extract_tables.py` writes
  the cells' `align`, `verticalAlign`, bold (`**…**`) and `background`,
  and a style hint (nearest `rules` preset, border colour and width,
  header bold, shared fills) for the table style. Rules belong to the
  table style (`rules`, `borders`), never to a cell: a source with a rule
  under one cell gets the nearest preset.
- Notes under the table go in `note`. A table continued on the next page is
  one table: merge it and drop the repeated header.
- "Tables" that are really framed text boxes: one row per paragraph, or a
  callout.
- "Tables" that are really tabbed text (a menu, a cast list, a list of
  entries with page numbers at the margin, a form): paragraphs with tab
  stops (B13), not a table resource.
- Cell lists: `• item` lines, two spaces per nesting level.
- Tables cited and printed right under their paragraph: placement `here` +
  `::resource`. The rest float.
- Captions above (`resourceTypes[].captionStyle.position: "above"`), with a
  caption bar (`backgroundEnabled`). Table looks: `tableStyle` / named
  `tableStyles` + `table.styleId`, and `borderRadius` for rounded frames.
- Tables ruled only above, under the header and under the last row (journals,
  papers, LaTeX `booktabs`): `rules: "booktabs"`, no header fill, ink rules;
  a head over several columns gets its short rule from the model's `colSpan`,
  a group row (one cell across the table) a light rule with `groupRules`.

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
- A table set `here` splits the same way (≥ 1.25, `tableStyle.splitInline`):
  keep it where the source has it (a menu course, a timetable, a parts list);
  do not float it only to make it split. It goes on at the head of the next
  column, before the text after it. Only turned (landscape) tables need a
  float.

### D13. Infographics and charts
Cut them as figures, or transcribe the data: a table resource, a callout
with a list, or a "stats" callout with `:::columns{count=3}`. Detect the
pages by drawing count (`inventory.py` → `vector_heavy_pages`).

### D14a. Music examples, songbooks and hymnals (postext ≥ 1.54)
Bring the music in as notation, never as pictures of scores: the
publisher's MusicXML or MEI exports as `example` resources
(`resources/ex-2-3.musicxml`), short one-voice examples re-entered in ABC,
chorales in Humdrum. Unnumbered examples go in the text as fences; numbered
ones are resources with the source's caption. Measure the staff size and
match the music font in `scoreStyle`; examples in boxes or margins get a
smaller named style. Full guide: [music.md](music.md).

### D14. Pictures you may not reproduce
Only for third-party pictures the user does not control (their own titles
keep every picture). Replace them with licensed ones (CC0 or public-domain collections, Wikimedia
Commons), checking the licence of each file before downloading. Credit them
in `note` and in a credits chapter.

---

## E. Fonts

### E1. Variable Google/OFL fonts
Make static instances per weight and italic at a fixed `opsz`/`wdth`
(`fonts.py instance`). Copy the OFL licence next to them.

### E2. Licensed faces
Subset them to the characters used (`fonts.py subset FONT… --out fonts/ --text-from chapters/ --woff2`)
and mark them `"redistributable": false`. Check the embedding permission
(`fonts.py info`, where `restricted` means the face may not be embedded).
Name the open family that stands in for it (postext ≥ 1.42,
`fonts[].fallback`, project-format.md §4): the plain bundle without the
faces is then set in a face of about the same width, so the checks of a
composed book mean something on it. Pick it by measurement
(`fonts.py width LICENSED.ttf CANDIDATE.ttf… --text-from chapters/<lang>/`,
within about 2 % in regular, bold and italic) and pack with
`preset_kit.py pack --fallback "Family=Open family"`. From postext 1.43 the
fallback's faces are also embedded in the EPUB, HTML and SVG exports under the
licensed name, so it must be an open face (OFL, Apache or similar); write the
choice and the measured ratio in the port notes, and when none is within 5 %
say so and deliver both bundles, warning that only the one with its faces is
checked.

### E3. Faces missing weights or glyphs
- Semibold used as bold: add a 600 face plus `boldFontWeight: 600`.
- A weight only embedded in the PDF: rebuild it only if the licence allows.
- Missing Greek, arrows or bullets: graft glyphs from a donor face into a
  derived face, or give that list level its own `fontFamily`.

### E4. Horizontal scaling
Use `fonts.py scale --factor 1.10 --family "Garamond 110"`.

### E5. Collections
Use `fonts.py split file.ttc`.

### E6. CJK faces
A Chinese family is tens of MB and thousands of glyphs; ship it cut to the book.
- Start from a **TrueType** build (Google Fonts `NotoSerifTC[wght].ttf`, Fontsource files), not the CFF
  `.otf` of Source Han / Noto CJK: postext-pdf embeds CFF whole (`cffEmbeddedWhole`).
- **Subset first, then instance**: `fonts.py subset NotoSerifTC[wght].ttf --out work/ --text-from chapters/
  --ranges latin,punct,cjk-punct` (add `bopomofo` for zhuyin), then `fonts.py instance work/NotoSerifTC[wght].ttf
  --out fonts/ --stem NotoSerifTC --weights 400,700`. Instancing a few thousand glyphs takes seconds; a variable
  font left as is prints every weight at its default (`variableFontDefaultInstance`). Rebuild the subset
  whenever the text changes (config strings, captions and running heads count: `--text-from` the whole
  project folder).
- `fonts.py subset` keeps every layout feature (`vert`, `vrt2`, `locl`, `fwid`) and the vertical metrics
  (`vhea`, `vmtx`): vertical punctuation comes from them.
- **Coverage**: Postext sets a style in one family and never falls back to another. A character missing from
  the face (a rare Han, a variant form) prints as an empty box. `lint_project.py` lists them per face; copy the
  glyphs in from a donor face of the same em (the TC face from the SC one, then a CC0 face such as Jigmo),
  or change the character if the edition allows it.
- **Voices**: Song/Ming for the text (Noto Serif SC/TC/HK), Hei for headings and labels (Noto Sans), Kai for
  quotations, verse and prefaces (LXGW WenKai / WenKai TC), Fangsong for official documents. No italics: a
  Chinese face has none. Use the face of the book's region (SC mainland, TC Taiwan, HK Hong Kong).

### E7. Arabic faces
- Book faces (OFL, Google Fonts/Fontsource, each with an `arabic` subset file): **Amiri** (Būlāq Naskh,
  curved kashida, vocalisation; classical editions, verse; 400/700), **Noto Naskh Arabic** (modern prose;
  variable: cut static weights with `fonts.py instance`), **Scheherazade New** (fully vocalised text),
  **Markazi Text** (modern; explicit leading), **Noto Kufi Arabic** / **Reem Kufi** (headings), **Aref Ruqaa**
  (display; Ruqʿa takes no kashida, the engine knows).
- Subset with layout features kept: `fonts.py subset Amiri-Regular.ttf --out fonts/ --text-from . --ranges
  latin,punct,arabic`. GSUB/GPOS hold the joining forms, lām-alif, mark positions and `rtlm` mirrored
  brackets; a subset without them prints isolated letters. The tatweel U+0640 must stay (kashida inserts it).
- One family per style, no fallback: the face must hold every Arabic letter, mark and digit (٠–٩), and the
  Latin of the book (Amiri has its own). Headings default to Open Sans, the body to EB Garamond: neither has
  Arabic — `lint_project.py` flags it.
- In the browser, the `arabic` subset file loads only when a character needs it; the Sandbox and the kit's
  `loadArabicFonts` load it before layout; a host calls `prepareFonts(content, config, { resolve })`
  (≥ 1.25), which loads every face for the characters the text sets, the `arabic` slice included.

### E8. Japanese faces
- **Body (mincho 明朝)**: **Noto Serif JP** (variable 200–900; full JIS X 0213, so Aozora's 第3・第4水準 外字
  are there; 14,787 IVS sequences; `vert`/`vrt2`) is the default. **Shippori Mincho** / **Shippori Mincho B1**
  give a bunko look; they lack ō ū Ō Ū (rōmaji with macrons needs another face for that text) and ヿ ゟ.
  **BIZ UDMincho** is fixed-pitch, good on a grid (BIZ UDPMincho has proportional kana: not for grid setting).
  **Zen Old Mincho** covers JIS levels 1–2 only and lacks ―, 〳〵, ﹅ and the macrons; Kaisei and Hina Mincho are
  display faces (no vertical forms for some marks).
- **Headings, run-in heads, labels (gothic ゴシック)**: **Noto Sans JP**, Zen Kaku Gothic New, BIZ UDPGothic.
  Children's books and textbooks: Klee One (教科書体).
- **Never the SC/TC builds** of Noto or Source Han: their kanji take Chinese forms (直, 骨, 角, 写).
  `lint_project.py` warns when one sets kana. A pan-CJK `.otf` (Source Han Serif, Noto Serif CJK) gets its
  Japanese forms in the PDF from `locale: 'ja'` (the JAN `locl`), but it is CFF: embedded whole
  (`cffEmbeddedWhole`). Start from the TrueType `NotoSerifJP[wght].ttf` (Google Fonts) instead.
- **Subset, then instance**: `fonts.py subset NotoSerifJP[wght].ttf --out work/ --text-from . --ranges
  latin,latin-ext,punct,cjk-punct,kana` (every kana, the small kana and 〳〵 〝〟 ― ‥ … that vertical pages
  ask for), then `fonts.py instance work/NotoSerifJP[wght].ttf --out fonts/ --stem NotoSerifJP --weights 400,700`.
  `vert`, `vrt2`, `locl` and `vhea`/`vmtx` survive: small kana, ー, brackets and 、。 take their vertical
  forms from them. Rebuild the subset when the text changes (`--text-from .` counts the config's strings).
- **Coverage**: one family per style, no fallback. `lint_project.py` lists the characters a face lacks
  (rare kanji, Aozora 外字 such as 挘 愷 睜 燄, which Noto Serif JP, Shippori Mincho and BIZ UDPMincho have and
  Zen Old Mincho, Kaisei and Hina do not).
- **Voices**: mincho for the text, gothic for headings and for bold emphasis where the source uses it
  (a paragraph or heading style in Noto Sans JP), bōten (`*…*`) for emphasis in the text. No italics.
- In the Sandbox the font picker's Japanese group lists these faces from Fontsource's `japanese` subset.

---

## F. Languages

### F1. The same book in two languages
One bundle for every edition, never a preset or a bundle per language. Use
one `config` with the general settings plus `localized.<lang>.config` with
only what each language sets differently, merged field by field
(configVersion 21, project-format.md §2): `locale`, the faces and size of its
script, hyphenation, label words (`headings.levels[level=1].numberingTemplate`,
a `header` label), a left/right side. Build each edition's whole config and
write `preset_kit.diff_config_layers(config(primary), config(lang))`. Add
`localized.<lang>.resources` (captions, notes,
alt text, tables) and chapters per locale. Parse both sources with the same
code, anchoring glosses by per-language text fragments. Check every edition:
`postext check my-book --locale <lang>` per locale.

### F2. Two different books per language
Give resources language-prefixed ids (`es-1-…`, `en-1-…`) and keep all of
them in the shared list. Give heading styles per locale.

### F3. Translating a finished config
The config holds labels, not text (J7): keep a map of style names and label
literals ("SECTION {partNumber}", "Contents") and walk the config replacing
them in `localized.<lang>.config`. Everything else is translated in the
chapters. Translate tables cell by cell by exact source text, into
`localized.<lang>.resources[].table`.

### F4. Number formats
Decimal comma vs point in data and captions; `{,}` in LaTeX.

### F5. Chinese, horizontal (mainland novel, textbook, report)
- `locale: 'zh-Hans'` (`zh-Hans-CN`); body in Noto Serif SC, headings Noto Sans SC; `firstLineIndent: 2em`,
  justified, no paragraph spacing, `indentAfterHeading: true` (Chinese books indent every paragraph).
- Measure the grid in characters (design-analysis §2a) and set `cjk.grid` (`charsPerLine`, `linesPerPage`):
  the columns come out in whole ems and every justified line ends in the same cell.
- Leave `cjk` to the region unless the source differs: GB line breaking, Kaiming punctuation (。？！ one em in
  the line, other marks half, every mark half at a line end), adjacent marks compressed, brackets trimmed at
  line edges, a quarter em between Han and Latin. A source set with every mark full width:
  `punctuationWidth: 'fullwidth'`.
- Numbering: `numberingTemplate: '第{1:一}章'` with `numberSeparator: '　'`; resource types 图/表 numbered
  `{h1}-{n}` come with the locale; `captionStyle: {labelNumberGap: '', labelSeparator: '　'}` gives 图1-1　标题;
  lists 一、（一）1.（1）① (configuration.md §10).
- Footnotes: a source whose notes read ① ② and start again on every page uses page numbering, not typed
  numbers: `[^id]` markers + `footnotes: {numberFormat: 'circled-decimal', numbering: 'page'}`
  (configuration.md §19a, postext ≥ 1.11).
- Markup: keep the source's full-width punctuation, quotes and typed 《》; emphasis as `*…*` (dots) or
  `:dots[…]`; readings as `{字|zì}`.
- Index: `:index[…]` marks work as in any book; `groupBy` auto gives pinyin initials; a polyphonic
  character takes a Han `sort` key with the wanted reading (`sort="崇阳"` for 重阳).
- Check `cjkLooseLine` in the render (a line that could not be spread, usually a long Latin word or URL). A
  single-character last line (孤字) is avoided by the composer under `bodyText.avoidRunts` (default on): the line
  above gives up its last character; one left over means that line could not be spread: reword or accept.
  Manuscript paper (genkō yōshi) set ragged wants every square filled instead: `cjk.grid.fullLines: true` (≥ 1.28).

### F6. Chinese, vertical and bound on the right (Taiwan novel, classic, poetry)
- `locale: 'zh-Hant-TW'` (or `zh-Hant-HK`, or `zh-Hans` for a mainland classic set vertically: the region,
  not the script, decides where the punctuation sits); `layout.writingMode: 'vertical-rl'`; `page.binding`
  stays `'auto'` (right). Body in Noto Serif TC.
- The grid: `cjk.grid.charsPerLine` is the column length down the page; leave `linesPerPage` unset to take the
  columns that fit, or set it from the source. Two tiers = `layoutType: 'double'` (not balanced at a
  chapter end).
- Taiwan defaults: basic line breaking, every mark full width and centred, no compression, wavy `:book[…]`.
  Short numbers stand upright (`cjk.uprightDigits` 2; `:tcy[…]` for three or four characters); Latin words
  lie sideways, and so do the short numbers inside a Latin sentence (a colophon's `chapters 49 and 32`). Literary sources usually write numbers in Chinese numerals: keep them.
- Openers: `numberingTemplate: '第{1:一}回'` and `breakBefore.parity: 'odd'` (the recto is the LEFT page);
  the 回目 couplet as `# 上聯 \\ 下聯`. A design opener lays out in the turned frame: "top" is the page's
  right edge.
- A long novel (120 回): `view.canvasScope: 'book'` opens it whole (up to 200 chapters: 129 chapters,
  ~2,000 pages take ~25 s and ~100 MB on the canvas); a translation that paints whole much more slowly
  opens a chapter at a time with `localized.<lang>.view`. Save each edition's pagination from the
  sandbox as `layouts.<lang>.json` so it opens paginated (project-format.md), again after every engine
  release.
- Running heads: horizontal ones need no change; fore-edge heads are two vertical text elements anchored
  to `'outer'` (configuration.md §19c); folios in Chinese numerals with
  `page.pageNumbering.format: 'trad-chinese-informal'`.
- Figures and tables stand upright with horizontal captions; `placement.rotate` is ignored. A horizontal
  appendix or index: a heading style whose `layout` sets `writingMode: 'horizontal-tb'`.
- Commentary editions: `:warichu[…]` for two-line inline notes (双行夹注), `:name[…]` / `:book[…]` for the
  proper-name and wavy title lines of classical editions, ruby as `{字|zhuyin}` (zhuyin stands right of the
  character). Give such text enough leading (half an em of line gap with marks on one side, ⅝ with both):
  `cjkMarksExceedLeading` / `rubyExceedsLeading` say when it is short.
- Fonts need `vert` (E6); the canvas loads a `vert` twin itself in the Sandbox, and the PDF shapes with it.
- Compare pages right to left: the source's page 1 is the left page of the first spread.

### F7. Arabic, modern (MSA novel, report, textbook)
- `locale: 'ar'` (or the region: `ar-EG` ٠–٩, `ar-MA` 0–9). That alone gives right to left, right binding, a
  mirrored frame (first column right), the region's digits, no hyphenation, kashida, bold emphasis, شكل/جدول.
  Never set `direction` by hand unless the source is an LTR book quoting Arabic.
- Body Noto Naskh Arabic or Markazi Text 13–15 pt, leading 1.6–1.75 em; headings Noto Kufi Arabic.
  `captionStyle.labelSeparator: ': '` (شكل ١-٢: …); chapters `numberingTemplate: 'الفصل {1:ordinal}'`;
  lists `arabic` + `-` (١-), `abjad` + `-` (أ-).
- Notes «(١)»: `[^id]` markers + `footnotes: {markerTemplate: '({n})', numbering: 'page', noteNumberPosition:
  'inline'}`; never type the brackets or the digits.
- English passages: `:::paragraphs{dir=ltr}`; English titles inside Arabic text: `:ltr[…]{lang=en}`.
- Running heads/folios are physical: chapter title on odd (left) pages, book title on even (right) pages,
  folio outer corner (left of odd pages) or centred.
- Keep the author's typed digits and punctuation (، ؛ ؟ «»); generated numbers follow `numerals`.
- Watch in the render: `unbreakableWordOverflow` (a word wider than a narrow cell/column: widen it;
  a Latin word there is cut instead and reported as `wordDividedByCharacter` / `wordDividedBySyllable`;
  a number is never cut, ≥ 1.82: `numberOverflow` with the cell, caption or note),
  `joiningScriptLetterSpacing` (a style tracks Arabic: remove `letterSpacing`).

### F8. Arabic, classical vocalised edition (turāth, tahqīq, Nights)
- `locale: 'ar'`; Amiri 14 pt; leading 1.85 em for lightly vocalised prose, a `verse` paragraph style at
  2.1 em for fully vocalised poems; `arabicMarksExceedLeading` says where it is short.
- Poems → `:::verse{style="verse"}`, one bayt a line `ṣadr || ʿajuz` (Wikisource `{{أبيات|… \\ …}}` maps
  line by line; spaced `\\` also works); keep the introducer («فأنشد يقول:») as the paragraph before it.
- Night/chapter words: `'الليلة {1:ordinal-feminine}'` (الليلة الأولى … الحادية بعد الألف), `-classical`
  for مائة; a run-in night heading stays a heading (set `breakBefore.enabled: false`).
- Front matter folios in abjad letters: `:::numbering{format="abjad" startAt=1}` before the introduction,
  `:::numbering{format="decimal" startAt=1}` before the text. Folio top centre between dashes: `'– {pageNumber} –'`.
- Contents at the end: last chapter `# فهرس المحتويات {toc="false"}` + `:::toc`. Index ignores ال by default.
- Apparatus: variant readings as per-page notes «(١)» (F7); editorial additions in `[…]` as typed; Qurʾān
  quotations in ﴿…﴾ (U+FD3F first). An unvocalised reading edition from the same source: `bodyText.tashkil:
  'strip'` (or `'strip-vowels'` to keep shadda).
- Keep the edition's orthography (فى, الامر, مائة); the engine never corrects it.
- Compare pages right to left: page 1 is the left page; columns read right first.

### F9. Japanese, horizontal (technical book, textbook, report)
- `locale: 'ja'`; horizontal (the default); body Noto Serif JP 9–10 pt, headings Noto Sans JP; leading
  1.7–1.8 em (room for furigana); `firstLineIndent: {value: 1, unit: 'em'}`, justified, no paragraph
  spacing, `indentAfterHeading: true`.
- Grid: count 字詰め × 行数 (design-analysis §2c; JLReq's example 35 × 28 at 9 pt) and set `cjk.grid`.
- Leave `cjk` to the locale: JIS X 4051 kinsoku (`ja-very-strict`; `ja-strict` when the source lets っ or ー
  open a line), full-width marks with JLReq's pair compression, 1 em after ？！, bracket pattern ③, a quarter
  em between Japanese and Latin. JLReq advises against hanging punctuation in text mixed with much Latin:
  `hangingPunctuation: 'none'` when the source's line ends are flush. Keep the source's ，． or 、。.
- Numbering in Arabic digits: `numberingTemplate: '第{1}章'` with `numberSeparator: '　'`, sections
  `'{1}.{2}'`; resource types 図/表 and the caption label 図1-1　 come with the locale (nothing to set);
  lists in the official order 1. （1） ア （ア） ① (configuration.md §10).
- Notes: by default at the column foot, numbered per page, superscript, a ⅓ rule (nothing to set).
- Headings: often centred (`headings.textAlign: 'center'`) and taking a fixed number of lines (`lineSpan`).
- Index: `:index[…]{yomi="…"}` on every kanji entry; `groupBy` auto = gojūon rows (あ行 か行 …). Citations:
  `citations.style: 'sist02'` for science and technology, or the publisher's CSL.
- Latin words and numbers in proportional type; keep the source's full-width ones; never type spaces between
  Japanese words.

### F10. Japanese, vertical and bound on the right (bunko, tankōbon novel)
- `locale: 'ja'`, `layout.writingMode: 'vertical-rl'`; `page.binding` stays `'auto'` (right: page 1 is the
  LEFT page of its spread, a chapter on an odd page opens on a left page). Body Noto Serif JP or Shippori
  Mincho B1.
- The grid: `cjk.grid.charsPerLine` = 字詰め down the column, `linesPerPage` = 行数. Bunko A6 (105 × 148 mm):
  38–42 × 16–18 at 8.5–9.25 pt; 四六判 (127 × 188 mm): 42–43 × 17–18 at 9–9.5 pt. A5 two-tier pages:
  `layoutType: 'double'` (24–26 字 a tier).
- Leave `cjk` to the locale: `ja-very-strict`, hanging 、。, upright two-digit numbers and `!?`, small kana and
  ー in their vertical forms, “” painted 〝〟, sesame bōten right of the text, 『』 for `:book`, furigana right
  of the text (`{漢字|かんじ}` group, `{東京|とう|きょう}` jukugo), JIS 1:2:1 ruby spacing.
- Notes: by default after the chapter (後注) with （1） right of the line; `footnotes.placement: 'spread'`
  for sidenotes on the left page of each spread (傍注); `markerPosition: 'side'` for small interlinear marks.
- Headings: 字下げ in body ems and 行取り in lines (`indent`, `lineSpan`; JLReq: top 4 字, middle 6 字 and
  3行取り, low 8 字 and 2行取り); short ones spread (`jidori`). Part titles and dedications centred across the
  page: `:::pagebreak{center}`. A heading may close an even page when its text opens the facing odd page:
  `headings.keepWithNextSpread: true`.
- Running head (single method): the book or chapter title on odd (left) pages only, horizontal, in the head
  margin about one body em above the type area at its fore-edge (left) side; folio in Arabic digits at the
  foot, fore-edge side (left on odd pages, right on even). Fore-edge vertical heads: configuration.md §19c.
- Aozora sources: `aozora.py` (sources.md, "Japanese sources"); merge its `styles.json` into
  `paragraphStyles`, set the level's `indent` to the usual heading `{indent="N"}` (the attribute itself
  is read, so the few that differ stay as written), print its credits.
- Letters inside a novel: an indented block (`:::paragraphs{indent=2}`), the date and signature
  `:::paragraphs{align=end}` or `{align=end endIndent=1}`; paragraphs that each open with 「 and close once
  stay so.
- Compare pages right to left: the source's page 1 is the left page of the first spread.

```json
{
  "locale": "ja",
  "page": { "sizePreset": "custom", "width": {"value": 105, "unit": "mm"}, "height": {"value": 148, "unit": "mm"},
    "margins": { "top": {"value": 16, "unit": "mm"}, "bottom": {"value": 11, "unit": "mm"},
      "left": {"value": 9, "unit": "mm"}, "right": {"value": 9, "unit": "mm"}, "mirror": true } },
  "layout": { "layoutType": "single", "writingMode": "vertical-rl" },
  "bodyText": { "fontFamily": "Shippori Mincho B1", "fontSize": {"value": 9, "unit": "pt"},
    "lineHeight": {"value": 15, "unit": "pt"}, "textAlign": "justify", "firstLineIndent": {"value": 1, "unit": "em"},
    "indentAfterHeading": true, "paragraphSpacing": false,
    "color": {"hex": "#1d1916", "model": "hex"}, "boldColor": {"hex": "#1d1916", "model": "hex"} },
  "cjk": { "grid": { "enabled": true, "charsPerLine": 38, "linesPerPage": 16 } },
  "headings": { "fontFamily": "Shippori Mincho B1", "fontWeight": 700, "color": {"hex": "#1d1916", "model": "hex"},
    "keepWithNextSpread": true,
    "levels": [
      { "level": 1, "fontSize": {"value": 13, "unit": "pt"}, "numberingTemplate": "第{1:一}章", "numberSeparator": "　",
        "breakBefore": {"enabled": true, "parity": "odd"}, "indent": {"value": 4, "unit": "em"} },
      { "level": 2, "fontSize": {"value": 10, "unit": "pt"}, "breakBefore": {"enabled": false},
        "lineSpan": 3, "indent": {"value": 6, "unit": "em"} },
      { "level": 3, "fontSize": {"value": 9, "unit": "pt"}, "lineSpan": 2, "indent": {"value": 8, "unit": "em"} } ] },
  "header": { "elements": [
    { "kind": "text", "id": "head", "parity": "odd", "pages": "body", "content": "{chapterTitle}",
      "placement": { "anchor": {"to": "container", "edge": "bottom-left"}, "offset": {"x": {"value": 0, "unit": "mm"}, "y": {"value": -1, "unit": "em"}} },
      "fontFamily": "Shippori Mincho B1", "fontSize": {"value": 7, "unit": "pt"}, "align": "left", "overflow": "ellipsis-end",
      "color": {"hex": "#1d1916", "model": "hex"} } ] },
  "footer": { "elements": [
    { "kind": "text", "id": "folio-odd", "parity": "odd", "content": "{pageNumber}",
      "placement": { "anchor": {"to": "container", "edge": "top-left"}, "offset": {"x": {"value": 0, "unit": "mm"}, "y": {"value": 3, "unit": "mm"}} },
      "fontFamily": "Shippori Mincho B1", "fontSize": {"value": 7, "unit": "pt"}, "align": "left", "overflow": "clip",
      "color": {"hex": "#1d1916", "model": "hex"} },
    { "kind": "text", "id": "folio-even", "parity": "even", "content": "{pageNumber}",
      "placement": { "anchor": {"to": "container", "edge": "top-right"}, "offset": {"x": {"value": 0, "unit": "mm"}, "y": {"value": 3, "unit": "mm"}} },
      "fontFamily": "Shippori Mincho B1", "fontSize": {"value": 7, "unit": "pt"}, "align": "right", "overflow": "clip",
      "color": {"hex": "#1d1916", "model": "hex"} } ] }
}
```

The margins are minimums: the 38 × 16 grid (120.6 × 84.7 mm) is centred in the room they leave. The
manifest bundles the Shippori Mincho B1 files (subset as in E8) and the chapters carry
`:::paragraphs{style="aozora-…"}` blocks whose styles come from `aozora.py --styles`. A tankōbon: 127 × 188 mm,
9.25 pt on a 16.5 pt feed, `charsPerLine: 42`, `linesPerPage: 17`, margins about 22 / 18 / 14 / 14 mm.

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
| `paradise-lost` (annotated verse, English only) | Gutenberg + Wikisource transcriptions aligned line by line, a 1910 annotated edition's OCR, Commons plates | B1 verse one line per paragraph (opening line in its own indented style), footnotes keyed to line numbers lettered per page, page-head plates sized to a fixed height, a third text as witness between two transcriptions, F1 |
| `pintura-espanola` (catalogue) | museum open-access records + Wikipedia extracts | A7 verso entry / recto plate, A4 one part per artist with its colour, A5 tombstone and catalogue number attributes, D14 licensing, F4 |
| `senales` (report) | the publisher's PDFs (EN/ES) | PDF type roles, reading order, reference calls, D13 infographics transcribed as panels, D14 replaced photos, B4 interview questions/signatures, C4 splitting grey boxes, per-article heading styles (A6) |
| `openstax-fisica` (textbook) | CNXML/MathML | XML two-pass conversion, B5 MathML → LaTeX, C1 worked examples/objectives/checks with `splitMinLines`, D3 placement by aspect, F2 different books per locale |
| `bioquimica-feduchi` (column-and-a-half textbook, one chapter) | InDesign IDML + print PDF | IDML roles and positions from the PDF, `oneAndHalf` with side figures and `captionSide`, C2 corner icons and numbered tabs, C3 floated boxes, `:::columns` in boxes, B5 equations as paragraphs, D6 live-text translated figures, E2 subset licensed fonts, E4 scaled faces, G screen openers |
| built-in guide (two-column manual) | written for Postext | A3 with part rows, A4 coloured blank versos, A5 opener with kicker/lead, C2 quote glyph icon, dark 3-column panels; a Simplified Chinese edition (F5) |
| `hongloumeng` (紅樓夢, 120 chapters, three editions) | zh.wikisource 程乙本 (1792) text, 1884 plates from Commons, Joly's English (Gutenberg) | F6 Traditional vertical right-bound edition, F5 Simplified horizontal edition, F1 English edition (chapters 1–56), E6 subset TC/SC faces with donor glyphs, A2, A3 contents grouped by 卷 (`parts.page: false`), A5 opener with the chapter plate (`{attr.plate}`) and the couplet, A10 index of characters by strokes / pinyin / letters, B1 verse and song titles, `openLocale: 'zh-Hant'` |

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

## I. Comics, manga and strips

Comic pages (`:::page`), strips (`:::strip`) and spreads are their own
reference: [comics.md](comics.md). Its §16 holds the porting playbooks:

- **P1** text-free art plus translations (Pepper&Carrot: panels from the
  gutters, anchors from the original balloon tails, script lines from the
  transcripts);
- **P2** lettered art (blank or inpaint the balloons, OCR the text, keep the
  original positions as `at=` pins);
- **P3** a script only, art generated with reference images (clean art with
  quiet room for the balloons);
- **P4** manga: right to left, vertical lettering, yonkoma;
- **P5** Arabic editions;
- **P6** newspaper strips.

Measure pages with `scripts/comic_panels.py` (comics.md §15). The
Postext repository's `scripts/presets/showcase/pepper-carrot/` (a full port
in seven languages) and `scripts/presets/comics/` (generated art for the
Cookbook's comic recipes) are working pipelines.

---

## J. Fixed-page books: textbooks, worksheets, picture books

A children's textbook, a workbook or an infographic book sets many pages as
**composed** pages: boxes, labels, maps and diagrams at set places, with
little running text. **With postext 1.35.0 or later, port them as composed
pages (round 2, [composed-pages.md](composed-pages.md))**: page templates in
the config, `::::page{template}` with `:::frame{slot}` in the chapter, boxes
that grow with their text. `python3 scripts/composed_check.py round` reads
the installed version and says which round to use. This section is round 1,
the fallback for older engines (1.34.0 reads templates and lays none out;
1.34.1 lays frames out but cannot make them move with their text), and the
reference for ports made with it. What went wrong before: a
28-page textbook ported with Postext 1.33 drew every page's diagram text as
design text elements of a hidden heading style per page, at the source's
coordinates, and built one bundle per language from them. The English
edition carried 77 heading styles and 3,384 design elements, the bundle
broke the Sandbox's import, and fixing a typo meant regenerating styles.
None of the rungs below puts text in the config.

### J1. Classify the pages first
In the inventory, mark each page **flow** (running text with figures and
boxes the engine places) or **composed** (positions are the design). Count
them in the spec sheet. In round 2 go on with composed-pages.md §3.1. In
round 1, more than a third composed: ask the user before
building whether the port is an **identical layout** (J2–J4 at the source's
positions; edited or translated text must still fit its box; whatever
Postext cannot place is a listed gap) or **editable, translatable text**
(composed pages set as flow pages that keep the source's faces, colours and
boxes, placed by the engine). When the brief already says which, do not ask
again: follow it and name the choice, with the count of composed pages, in
the report. Flow pages follow the rest of this file.

### J2. Placed boxes: one fixed callout style per position
A box at a set place on the page is a callout whose style pins it there.
The text stays in the chapter, at the page it belongs to:

```jsonc
"calloutStyles": [{
  "id": "card-top-left", "placement": "fixed",
  "fixed": { "anchor": { "to": "page", "edge": "top-left" },
             "offset": { "x": { "value": 25, "unit": "mm" }, "y": { "value": 48, "unit": "mm" } } },
  "background": { "hex": "#ffffff", "model": "hex" }, "borderRadius": { "value": 3.5, "unit": "mm" }
}]
```

```md
:::callout{type="card-top-left" title="The cardinal points"}
The Sun rises in the **east** and sets in the **west**.
:::
```

- One style per **position** (or per kind of box at a position), shared by
  every page that uses it, never one per page. On a textbook where every
  box has a place of its own this means about one style per box (117 styles
  for 121 boxes in the 28-page port), named by kind and position
  (`card-top-left`, `aside-right-mid`), never by page number. That is
  expected in round 1 and is no content in the config: the style holds the
  place, size and colours, the words stay in the fence. From postext 1.39
  a style can be based on another (`"extends": "caja"`): write one full style
  per look and, per box, a thin style that carries only its place
  (`{ "id": "caja-p5", "extends": "caja", "placement": "fixed", "fixed": {…},
  "marginBottom": … }`), instead of 115 full copies. In round 2
  page templates replace them with one template per kind of page, a frame
  per box and one callout style per kind of box (composed-pages.md §4, §9).
- The box goes on the page where its fence falls in the flow; put the fence
  after the `:::pagebreak` (or heading) that opens that page. If its place
  is taken there, it moves to the next page. **Nothing warns: check the page
  count and the page of every box.**
- **Width.** The frame is laid out at the content area's width, placed by
  its anchor, and then takes the width of the text column under that
  probe's horizontal midpoint; when the midpoint falls on no column (the
  gutter of a two-column page), it keeps the content area's width.
  `width: "auto"` is a badge sized to its title; `span` is ignored for
  fixed boxes. Any other measure is padding: a frame of the column's width
  with asymmetric `padding` (and a transparent background, the fill drawn
  in the page ground, J3) gives the source's measure.
- **Collisions.** A fixed box that would overlap another fixed box, a float
  or a page-span box moves one page on, silently, and is set there even if
  it overlaps something on that page too. Every frame is a column
  or the content area wide, so two boxes side by side collide unless their
  frames grow in opposite directions: anchor one at `top-left` (it grows
  right) and the other at `top-right` (it grows left, past the page edge if
  need be), each padded to its measure. Three or more boxes in a row: one
  callout holding `:::columns{count=3 breaks="…"}`.
- **The box cuts the text column.** Its zone is the box plus its style's
  `marginTop`/`marginBottom`, snapped outwards to the baseline grid. In a
  column it overlaps, a zone whose centre is in the column's lower half
  ends the column at the zone's top: no text continues below the box, and
  a box that would sit over text already set goes to the next page. A zone
  in the upper half starts the column below it, but only while the column
  is still empty; with text in it the box goes to the next page. So on a
  composed page put **every** text block in a fixed callout (the
  introduction too) and give each style a `marginBottom` that runs its zone
  to the page foot, so the column is cut once and later boxes never meet
  text.
- **Tab labels** (`label` of the style, printed when the fence has
  `label="…"`, not on a continuation): fields `position` (`top-right`
  default, `top-left`, `top-start`, `top-end`), `height`, `paddingX` (on
  both sides of the text), `offset` (how far the tab rises above the box),
  `inset` (from the side edge), `background`, `icon {resourceId, width,
  gap}` and `rule`. The tab is square (no radius) and as wide as its text
  plus twice `paddingX`. With an `offset` the whole box moves down by it:
  the anchored frame starts at the tab's top and the box `offset` lower, so
  measure the anchor to the tab. The icon sits beside the tab on the side
  away from the corner (left of a `top-right` tab); a tab with a rounded
  end or a ring at its left is a `top-right` tab whose icon picture draws
  that end.
- **Baselines.** A line's baseline sits 0.8 × its line height below the
  line's top, in boxes as everywhere; the first block of a box loses its
  top margin (the title's `gap` takes its place, 0 without a title). So the
  first baseline is 0.8 × the line height under the content top (inside
  `padding`): measure the source's first baseline and set the padding from
  it (design-analysis.md).
- **Headings inside a box** are listed by `:::toc` and the bookmarks (a
  second topic on a page can be an `##` in its box). From postext 1.37 a
  heading in a box draws its level's or heading style's design (tab, band,
  `{titleText}`, anchored to `container`; the box keeps the room it takes,
  `minHeight` places the text under a tab); before 1.37 the design was not
  applied there: a title in a coloured tab inside a box was the box's
  `label`, or the tab drawn in the page ground (J3). A heading in a box
  opens no styled section: running heads and the chapter's `{attr.x}` come
  from flow headings.
- **Lists inside a box** take the document's `unorderedLists` /
  `orderedLists` `marginTop` and `marginBottom` (the style's `lists` has no
  margin field); a list that opens the box drops its `marginTop`. A list
  after a paragraph in a box starts lower by the document's margin: set it
  in pt or grid lines with boxes in mind (B11).

### J3. Page backgrounds and furniture: image elements, no text
A page ground, a card, a band or a frame cut from the source (with its text
removed) is an `image` element in the **opener design of a page-span
heading**: a heading style with `span: "page"` and `advancedDesign.slot`,
the element marked `reserve: false` so the heading reserves no height for
it. The opener design is painted before the columns, under the text. The
running head and foot (`header`/`footer`, a heading style's own included)
are painted after the columns and floats, on top of them: a full-page
ground there hides every word, so keep them for furniture that never sits
under text (chevrons, folio pictograms). One style serves every page of the
kind, the picture named by the heading:

```jsonc
"headingStyles": [{
  "id": "topic", "span": "page", "breakBefore": { "enabled": true, "parity": "any" },
  "advancedDesign": { "enabled": true, "slot": { "elements": [
    { "kind": "image", "id": "ground", "resourceId": "{attr.fondo}", "decorative": true, "reserve": false,
      "placement": { "anchor": { "to": "page", "edge": "top-left" },
                     "size": { "width": { "value": 230, "unit": "mm" }, "height": { "value": 288, "unit": "mm" } } } },
    { "kind": "text", "id": "title", "content": "{titleText}", "…": "…" }
  ] } },
  "header": { "elements": [ { "kind": "text", "id": "folio", "content": "{pageNumber}", "…": "…" } ] }
}]
```

```md
# Finding your position {style="topic" fondo="ground-p05"}
```

- A design image's `resourceId` takes the placeholders a design text takes
  (postext ≥ 1.8). In a heading design `{attr.key}` reads that heading's
  own attributes; in a running head, the current chapter's level-1
  heading's. An id that resolves empty draws nothing.
- The design replaces the heading's own lines: the title prints only where
  the design places `{titleText}` (leave it out and nothing prints; the
  heading still opens the page and stays in the contents and bookmarks).
  The textbook port also set the H1 small, on one grid line, so the column
  under it starts on the grid.
- **Do not hide the heading that carries the ground.** `hidden: true` skips
  the opener design too, so a hidden H1 draws no ground. A hidden heading
  is for a page with no ground and no title in print; it stays in the
  contents and the bookmarks.
- A topic set on a spread: two elements with `parity: "even"` and
  `"odd"`, `resourceId: "{attr.verso}"` and `"{attr.recto}"`.
- Pictures that overhang a box are image elements too (or `::resource`
  in the box); their captions and labels are not.

### J4. Maps and diagrams with many labels
A map, a time line or a labelled diagram whose words sit at set places is a
**resource**: an SVG with live `<text>` labels (D6), placed with
`::resource{id}` or `:ref`, and translated by
`localized.<lang>.resources[].file` (`resources/en/map-europe.svg`).
Translators edit the labels in the SVG (or the strings file your script
builds it from, `labels/strings.<lang>.json`), never a style. Text a box
holds next to the map is a callout (J2), not part of the picture.

- In round 1 that strings file (or the SVG) is the **second place the
  book's text lives**, besides the Markdown. Say so in the report, with the
  number of words it holds (670 of 4,990 in the 28-page port), so whoever
  corrects or translates the book knows where to look. From postext
  1.37.0 `::label` lines in a `:::figure` are drawn at the picture's
  anchors and the words live in the Markdown (composed-pages.md §6.4);
  use that instead whenever the engine has it.
- The `postext` command line drew SVGs differently from the Sandbox with
  postext 1.33 (#890): an SVG whose `viewBox` did not start at `0 0` printed
  empty in `postext images`, and an SVG that embeds a raster
  (`<image href="data:image/…">`, drawn by resvg) matched `font-family`
  against each font file's internal family name, so labels in a family
  whose bundle name differs fell back to another face. From postext 1.34.1
  both work: leave the `viewBox` as the art has it, and name the bundle's
  family in the SVG's `font-family`; map art and lettering can live in one
  SVG. Only for an engine older than 1.34.1: write `viewBox="0 0 w h"`
  (move the art with `<g transform="translate(-x -y)">`), keep the map art
  in the page ground (J3) and the SVG to the lettering alone, and compare
  the command line's page images with the Sandbox.

### J5. Contents
`:::toc`, always (A3). A block (a part, a section) that must stay with its
topics uses `toc.groups` / `:::toc{keep="part"}` when the installed
Postext supports `toc.groups` (≥ 1.34); otherwise a hand-written contents with
`:ref{id="…" style="pageNumber"}` page numbers, listed in the report as a
documented gap. A part row with dots up to its page number is ONE text
element in `toc.parts.design`, `content: "{number} {titleText}{leader}{pageNumber}"`,
width `fill` (≥ 1.34.1; configuration.md §9): the leader is `toc.leader`, the
same as the entry rows; never a literal run of dots in the content (it is
clipped and warns `designTextTruncated`).

### J6. Editions in other languages
One bundle: `chapters.<lang>` per locale, `localized.<lang>.resources` for
captions, alt text, tables and the label SVGs, `localized.<lang>.config` for
the locale, labels and faces only (F1). A translation that runs longer than
the source reflows in its box or flow; it is never re-placed line by line
at the source's coordinates. Run `postext check my-book --locale <lang>` and
look at the pages of every locale. The Sandbox keeps every edition of a
multi-language bundle in one book (postext ≥ 1.39; before, it asked which
one and kept that edition only, so each was imported to look at it);
give each edition its own title with `localized.<lang>.name` and
`localized.<lang>.description` (postext ≥ 1.34.1, #891; the primary edition
keeps the manifest's `name`; `postext check my-book --locale <lang>` prints
it in the header, the library and the import dialog use it, and a showcase's
`index.json` entry can copy it as `localized: { <lang>: { name, description } }`). Composed pages in several languages: one bundle,
the same templates, slots and anchors (composed-pages.md §8).

### J7. Never
- Literal text in design text elements beyond a label, the publisher's name
  or the book title (`{title}`); `preset_kit.py lint` fails on it, counting
  as the engine's `contentInConfig` warning does.
- Heading styles that hold content: one hidden style per page carrying that
  page's text, styles named after page numbers.
- One preset or one bundle per language.
- The source's line breaks copied into the paragraphs (B9).
- A contents written into design slots.

### J8. Size budget
The Sandbox keeps the working book in about 5 MB of browser storage. Aim for
a config under 1 MB; `preset_kit.py lint` reports the size, warns from 3 MB
and fails above `--max-size`. A config past 1 MB in a short book almost
always means content or per-page styles in it. Pack with `preset_kit.py
pack my-book --manifest-only`: the plain `pack` zips the whole folder (bar
`source/`, scripts and caches), so a `work/` folder, label sources or tool
outputs would ship in the bundle; `--exclude GLOB` leaves more out.

### J9. Stop and ask
When the source needs something none of these rungs expresses (text that
must flow around a drawn shape, a box chained to another, labels anchored
to points of a photograph; all of them round 2 features: check
`composed_check.py round` first), stop before reaching for the config. Write the
gap as an issue draft for the user:

```md
**Gap:** <what the source does>, pages <n–m>.
**Closest expression today:** <rung and how it looks>; it loses <what>.
**What Postext would need:** <the feature, in the book's terms>.
**Workaround that breaks content/form (not used):** <what it would cost:
  edits, translations, config size>.
```

Show it and ask whether to accept the closest expression or wait for the
feature. Never hard-code the book in the engine, and never take the
workaround without the user's yes.
