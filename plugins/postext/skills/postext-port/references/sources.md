# Source formats: what each gives you and how to extract it

Every port has two inputs, often from different files:

1. **Content**: text with structure (headings, lists, emphasis, notes,
   tables, figures). Clean structured sources (DOCX, IDML, EPUB, XML) beat
   the printed PDF for this.
2. **Design**: page geometry, grid, type, colours, running heads, openers, box
   styles, placement habits. Only the *rendered pages* show this, so keep
   (or produce) a PDF of the original in every case, even when the content
   comes from DOCX or IDML.

Always start with `scripts/inventory.py SOURCE`. It lists fonts, styles, page
geometry, media and scan pages, and names the next command.

| Source | Content via | Design from | Notes |
|---|---|---|---|
| Print/press PDF | `pdf_extract.py` (type roles) | the same PDF: `measure_layout.py`, `inventory.py`, rasterised pages | the most common case |
| Scanned PDF / images | OCR first (`ocrmypdf`), then as PDF | page images | fonts/sizes unreliable: roles by size bands |
| Word (.docx) | `pandoc_to_postext.py` with a `--style-map` | a PDF export of the document + `inventory.py` (sections, margins, styles) | Word paragraph styles are your roles |
| PowerPoint (.pptx) | `pandoc_to_postext.py --split-level 2` | slide exports | slides are not pages: design a book from them |
| OpenDocument (.odt) | `pandoc_to_postext.py` | PDF export | convert to .docx to keep custom style names |
| EPUB | `pandoc_to_postext.py` | CSS + a rendered PDF, if one exists | chapters follow the spine |
| HTML / web pages | `pandoc_to_postext.py`, or a small parser for one site's markup | screenshots / print CSS | strip navigation, boilerplate and embeds |
| InDesign (.indd) | export **IDML** + print PDF, then `idml_extract.py` | the print PDF | IDML has styles and text but not the final positions |
| LaTeX | `pandoc_to_postext.py` (keeps `$…$` math and turns `\index{…}` into `:index` marks; a display in mid-paragraph stays glued to it, so the "where …" after it continues the paragraph) | the compiled PDF | custom macros need a pandoc Lua filter or manual care |
| Markdown (GitHub/pandoc) | `pandoc_to_postext.py SOURCE --from markdown` | — | never copy CommonMark as is: tables and `---` are not Postext (`[^n]` footnotes and, ≥ 1.23, ```` ``` ```` fences are) |
| XML (JATS, DocBook, CNXML, TEI) | pandoc (`jats`, `docbook`) or a small ElementTree walker | the publisher's PDF | two passes: register ids, then write |
| Plain text (Gutenberg…) | a small script: slice by heading regex, blank-line paragraphs | — | `_it_` → `*it*`; verse detection |
| Aozora Bunko (青空文庫) text | `aozora.py` (CP932 zip or .txt) | the base edition (底本) named in its credits, or a design of your own | furigana, bōten, headings, indents, 外字 converted; "Japanese sources" |
| Pages / Keynote / .doc / .ppt | export to .docx / .pptx first (`soffice --headless --convert-to docx`) | PDF export | |
| Google Docs / Slides | File → Download → .docx / .pptx | PDF download | |

## PDF (laid out by InDesign, QuarkXPress, LaTeX, Word…)

1. `inventory.py book.pdf`. Check the media box against the trim box: print
   PDFs carry bleed and a slug, so measure everything from the trim. Note the
   offset between the book's page number and the PDF page number (it usually
   differs by the preliminaries).
2. `pdf_extract.py roles book.pdf --pages <body pages> > roles.json`. Each
   design role is usually one unique (font, size, colour). Name the roles:
   body, h1–h6, caption, footnote, box text (`callout:<type>`), box titles
   (`callout-title:<type>`), special paragraphs (`paragraphs:<style>`),
   credits, and `skip` for running heads, folios, marginal line numbers
   (they come back from `config.lineNumbers`, configuration.md §19f) and
   label text inside artwork. Split a style with position conditions
   (`top_mm`, `x_mm`) when the same face serves two roles.
3. `pdf_extract.py markdown book.pdf --roles roles.json --out draft --lang es`.
   The extractor:
   - reads column by column, with page-wide bands between;
   - builds paragraphs from indents, gaps and short last lines;
   - continues paragraphs across columns and pages;
   - joins end-of-line hyphens using the book's own vocabulary, keeping real
     compounds and names;
   - expands ligatures and repairs dropped-ligature gaps ("Clasifi cación");
   - keeps bold and italic runs, and reads a roman the source slanted by
     its text matrix (a shear of 0.15 or more, measured on every
     character's box) as italic: `*…*`, counted in `report.md` per face;
   - keeps en and em spaces, and turns a thin space inside a number or
     before its unit (`1 000`, `21 %`) into a narrow no-break space;
   - sets raised small digits as `^n^` and lowered ones as `~n~`;
   - builds lists from bullet markers;
   - collects footnotes as endnotes;
   - links mentions (on by default, `--no-link-refs` to leave them):
     `Figura 3` / `Table 2` to the caption stub of that number (or to a
     resource of `--refs-from resources.json`), `capítulo 4` / `section
     3.2` (chapter and section words in es, en, ca, fr, pt, it, de, and
     `§`) to the heading numbered so, or the fourth chapter heading, kept
     in the source's words (`:ref{id="…" text="capítulo 4"}`). Every heading
     gets an `id`. A mention set in a bold or italic run of its own loses
     those marks (the reference style sets it: `referenceBold`), and
     `report.md` lists the mentions left as text and suggests
     `bodyText.referenceColor` when the source colours its mentions;
   - drops repeated running heads and folios;
   - writes caption stubs with page and box for the figure cutter; the
     label (`Fig. 1.`) is taken off the caption with the marks round it,
     never with the mark that opens the words after it (`*tako-tsubo* es`);
   - takes each role's base style (bold, italic) from the characters of
     all its spans, so an italic word in a roman caption keeps its `*`.
4. `pdf_figures.py stubs book.pdf draft/resources.json --out-dir project/resources`
   cuts the artwork next to each caption. Photos come out at native
   resolution in sRGB; vector art comes out as SVG (plus a PDF print master
   with `--format both`). Fix regions by hand with `pdf_figures.py crop`.
5. Tables: `extract_tables.py book.pdf --pages N` gives a TableModel whose
   cells carry the source's `align` (`center`, `right`), `verticalAlign`
   (`middle`, `bottom`, only where a cell is clearly taller than its
   text), `**…**` for a body cell set wholly in bold and `background` from
   the cell's fill. It prints a style hint beside the model: the nearest
   `rules` preset with the border colour and width, `headerBold`, and the
   fills a whole header or body shares (`headerBackground`,
   `bodyBackground`, `bodyAlternateBackground`), which go in the table's
   style, not in the cells. Postext has no per-cell borders: a rule pattern
   no preset draws gets a note naming the nearest one. `--full` prints all
   of it as JSON, `--plain` the text only. Merged cells come back as
   `colSpan` / `rowSpan` with `hiddenBy` on the cells they cover. With
   PyMuPDF 2.0, two ruled tables set close together (about 40 pt apart) can
   come back as one: count the tables against the page and cut the missing
   one with `--pages` and a clip if needed. A first
   row over every column that starts with a caption label ("Tabla 2.
   Valores normales") is taken out as the table's `label` and `caption`;
   any other row over every column is a group band, centred, with its fill
   as its `background`. The header rows are counted from the look (rows
   set wholly in bold, or with a fill of their own; `--header-rows N`
   overrides it), and a body row whose cells all hold the same number of
   lines, two rows with no rule between them, is split again. Merge tables
   continued over pages ("(cont.)"), dropping the repeated header.
   `pdf_extract.py markdown` does this itself for ruled tables: their
   lines leave the paragraphs, and each table becomes a `kind: "table"`
   resource set where it stood (its title row as the caption), or the
   model of the nearest table caption stub of its page; the style hint is
   in `source.tableStyle`, for the table's entry in `tableStyles`.
   `--no-tables` keeps them as text.
6. Read every chapter against the page images and correct it. The extractor
   gives a draft; the curated Markdown is the product.
7. A printed back-of-book index (`inventory.py` lists `index_pages`): once
   the chapters are final, `index_marks.py parse` the index pages and
   `index_marks.py place` the marks into the chapters (playbooks A10).

Gotchas:

- **Reading order**: sidebars, pull quotes and marginalia interrupt the flow.
  Give them their own roles so they become callouts, not body paragraphs.
- **Boxes in mid-paragraph**: if a box splits a sentence, join the halves and
  put the box after the paragraph.
- **Superscripts**: note calls (raised digits after words) vs chemistry
  (H₂O, lowered) vs units (m², raised). Check a sample.
- **Symbol fonts** (Symbol, Wingdings, Zapf Dingbats, private-use code
  points): map the characters to Unicode (⇌ ≤ α → •). Skip decorative
  bullets.
- **Small caps** extract as lower case: a numeral or an acronym the source
  prints in small capitals goes back into `:smallcaps[…]` in lower case
  (`siglo :smallcaps[xix]`, playbooks B8a); one printed in full capitals
  is written in capitals ("xix" → "XIX").
- **Tabbed lines** (a menu, a cast list, a price list, marks at the margin):
  the extractor joins the parts with a space and drops the dot leader, or
  keeps the dots as text. Delete typed leaders, write `:tab` between the
  parts and set the stops on the paragraph's style (playbooks B13);
  `extract_tables.py` may read such a page as a table: it is not one.
- **Infographic pages** (hundreds of vector drawings, little text): cut them
  as figures, or transcribe the data as tables/callouts. Retyping data is
  legitimate.
- **Text in images**: keep it as artwork. For a translated edition, see
  playbooks.md, "Live-text figures".
- **Scans**: `ocrmypdf --language spa+eng --deskew scan.pdf ocr.pdf`, then run
  the PDF path. Use size bands (`size: [11, 13]`) instead of exact fonts in
  roles.

## Word (.docx)

- A person with one manuscript to set in the Sandbox needs no script: the
  Sandbox's Text panel imports a `.docx` (**Import a Word document**), maps
  each Word style to a heading, paragraph style, callout, quote, caption or
  chip, reports the quality of the original and saves the mapping as a
  reusable template. **Export to Word** writes the chapter or book back
  as a semantic or a formatted document (below), and a file exported that
  way, corrected in Word or Google Docs, reopens through the same button as a list of
  edits to apply (docs: Sandbox → Word documents). Point them there; use the scripts below for the original's
  layout rules, batches of files, or what the dialog does not read.
- **Draft with the engine's own importer** before reaching for pandoc: `postext import-docx manuscript.docx -o
  draft/ --locale es --config design.json --template map.json --report --json` writes a project folder (or `-o
  x.postext`): `preset.json`, `chapters/NN-slug.md` (a chapter at each level-1 heading; `--no-split` keeps one),
  pictures as figure resources with their Word print resolution, tables as table resources (header rows, merged
  cells, widths, fills), each placed with `::resource` where it stood and captioned by the Caption paragraph
  beside it (its typed "Figure 3." label dropped). Footnotes and endnotes become `[^n]` notes, XE fields `:index`
  marks, OMML `$…$`/`$$…$$`, hyperlinks links, tabs `:tab{at=… align=… leader=…}`, Word lists Postext lists.
  Tracked insertions are kept and deletions dropped, comments are not imported, EMF/WMF/TIFF pictures are left out
  (`unsupportedPicture`), and notes on headings are dropped (`headingNote`). `--report` (and `report` in `--json`)
  is the Sandbox's quality report: styled share, hand formatting, typed numbering, manual breaks. Move the draft's
  chapters into `chapters/<lang>/` of the real project and curate them as for any extractor.
- The mapping is a template JSON (the Sandbox saves the same file; `.docx` files exported by postext ≤ 1.67 carry it). Unmapped
  styles are mapped by name: Word's built-in headings, Title, Quote, Caption, and any style named like a paragraph
  style, callout type, heading style or chip style of `--config`:

  ```json
  { "postextWordTemplate": { "version": 1, "name": "Publisher",
    "paragraphs": {
      "Chapter Title": { "kind": "chapter" },
      "Heading 2": { "kind": "heading", "level": 2, "style": "seccion" },
      "Epigraph": { "kind": "paragraphs", "style": "epigraph" },
      "Poem": { "kind": "verse", "style": "verse" },
      "Box Title": { "kind": "calloutTitle", "type": "box" }, "Box Text": { "kind": "callout", "type": "box" },
      "Quote": { "kind": "quote" }, "Caption": { "kind": "caption" },
      "Postext": { "kind": "markup" }, "Header": { "kind": "drop" } },
    "characters": { "Key Term": { "kind": "chip", "style": "term" }, "Foreign": { "kind": "italic" } },
    "options": { "lineBreaks": "break", "directFormatting": "keep", "manualHeadings": 0, "pageBreaks": "drop", "images": true, "tables": true } } }
  ```

  Paragraph kinds: `body`, `heading` (`level` 1–6, optional `style`), `paragraphs` (`style`), `verse` (optional
  `style`), `callout` / `calloutTitle` (`type`), `quote`, `caption`, `markup` (passed through verbatim), `chapter`
  (starts a chapter titled by the paragraph), `drop`. Character kinds: `text`, `bold`, `italic`, `boldItalic`,
  `smallCaps`, `sup`, `sub`, `chip` (`style`), `markup`, `drop`. Options: `lineBreaks` `break` (default) | `space`
  | `paragraph`; `directFormatting` `keep` | `ignore`; `manualHeadings` 0–6 (short bold paragraphs become headings
  of that level; 0 = off); `pageBreaks` `drop` (default) | `keep` (`:::pagebreak`); `images`, `tables` (default
  true). A bare `{ "paragraphs": …, "characters": … }` object is read too.
- `postext docx my-book -o book.docx` (or `build --docx F --docx-variant …`; postext ≥ 1.68, `--template` gone)
  writes one of three documents. Two are flowing text, editable in Word and in Google Docs, built from the Markdown
  with Word's own structures: heading styles (*Heading 2: Name* per heading style), paragraph styles named after the
  design's, Word lists, footnotes, hyperlinks, XE index fields, bookmarks for anchors, boxes as `ptx:box:<type>`
  content controls around a shaded one-cell table (*Box: …* styles), figures and tables with captions (label and
  number are generated text), OMML equations. What Word has no structure for (frontmatter, exercises, modules,
  composed pages, `:::figure`, comics, scores, other directives, maths that do not convert) travels verbatim in
  `ptx:raw:<kind>` content controls in the grey *Postext Source* style (*Postext Source Char* inline).
  `--variant formatted` (default) sets that text with the book's design as far as Word allows (sections with the
  design's trim, margins and columns, running heads, the styles' fonts and sizes, openers, boxes) and embeds the
  fonts (static TrueType, obfuscated, family suffix *PTX*; `fsType`-restricted, CFF and variable faces are reported
  and only named; `--no-embed-fonts` names them all; `customFonts` with `redistributable: false` falls back to the
  open fallback; Google Docs reads no embedded font and uses its own copy of a family when it has one).
  `--variant semantic` is the content alone, for a proofreader: a plain document (A4, one column, Arial) in the same
  Word styles, which name each part, with no page design and no fonts. `--variant facsimile` lays the book out as
  for `pdf` and writes each page as a Word section of its exact size with every line in a fixed text box; running
  heads, folios, bullets and maths (pictures) are display only. It is for looking at the layout in desktop Word, not
  for editing and not for Google Docs, and comes only from the command line and the API (`facsimileDocx`;
  `formattedDocx` is its old name). All three carry an export map and a snapshot of the exported chapters. Up to
  postext 1.70 there were two variants: `semantic` (the default) wrote today's formatted document, and `formatted`
  wrote the text boxes.
- `postext import-docx book.docx my-book [--dry-run] [--locale es] [--json]` brings the corrections made in Word
  in such a file back: a three-way merge against the snapshot, each edit `applied`, `conflict`
  (changed-since-export, target-missing, no-snapshot, overlap) or `rejected` (generated text such as caption labels
  and numbers, formatting that crosses Postext markup). Tracked changes count as accepted, comments are listed and
  not written, caption/note/alt/cell edits go to `preset.json` (or `localized.<lang>` with `--locale`). Exit 3 when
  an edit is left out; `--dry-run` prints a unified diff and writes nothing. Text added outside the exported
  paragraphs (before the first one, new footnotes, outside the facsimile's text boxes) is dropped. Use it when an
  editor corrects a ported book in Word; never as the porting path itself.
- `postext import-docx` (postext ≥ 1.39) sets the character spacing of Word paragraph and heading styles as
  `letterSpacing` (em of the style's size) on the bundle's config styles that set none (`styleTracking` in
  `--json`: `applied`, `skipped`; never into the Markdown), and `docx` export writes the levels' and heading
  styles' `letterSpacing` back as the Word style's character spacing. Before 1.39 set the tracking by hand. The Sandbox's import dialog and `sandbox_import_word` do the same from 1.40
  (**Take the character spacing of the Word styles**, on while the document's styles carry any; the dry run lists
  `characterSpacing.setOn` and `leftAsTheBookHasIt`; a style the book already tracks keeps its value), as their
  own step in the configuration history. For a manuscript set in Word styles with spacing, import first, then
  read the styles' `letterSpacing` in the Design panel rather than copying it by hand.
- `inventory.py doc.docx` gives sections (page size, margins, columns, mirror
  margins), paragraph styles in use with counts and samples, character styles,
  fonts, tables, images, footnotes and equations.
- `pandoc_to_postext.py doc.docx --dump-styles`, then write `map.json`:

```json
{
  "Title": {"heading": 1},
  "Heading 1": {"heading": 1}, "Heading 2": {"heading": 2},
  "Quote": {"paragraphs": "quote"},
  "Verse": {"paragraphs": "verse"},
  "Box Title": {"callout": "box", "title_from_text": true},
  "Box Text": {"callout": "box"},
  "Caption": {"caption": true},
  "Header": {"drop": true},
  "Key Term": {"chip": "term"}
}
```

- Built-in heading styles already map to `#` levels. Consecutive paragraphs
  mapped to the same callout become one box.
- Footnotes become chapter endnotes by default (`--notes endnotes`):
  `^n^` markers plus a `:::paragraphs{style="notes"}` block. Use
  `--notes inline` or `--notes drop` to change that. For real footnotes
  rewrite them as `[^n]` / `[^n]:` (playbooks B3). Alternatively, move them
  into side callouts in a `oneAndHalf` layout.
- Word index entries (XE fields) become `:index` marks; add the index
  chapter (`:::index`) yourself (playbooks A10).
- Equations (OMML) arrive as TeX `$…$`. Check the output.
- EMF/WMF images must be converted (Inkscape, LibreOffice):
  `soffice --headless --convert-to png file.emf`.
- Tracked changes: accept or reject them in Word first.
- Word's "manual" formatting (bold paragraphs used as headings) has no
  style. Map by inspection, or add styles in Word before converting.
- Tabs: `pandoc_to_postext.py` writes a Word tab as a space. Where the
  source aligns text at tab stops (menus, cast lists, forms), write `:tab`
  there and copy the stops of the Word style (Paragraph → Tabs) into the
  paragraph style's `tabStops` (playbooks B13). The Sandbox's Word import
  does both by itself.

## PowerPoint (.pptx)

- A deck is not a book. Decide the mapping first:
  - handout/book: slide titles become sections, bullets become lists or
    prose, the speaker notes become the body text;
  - catalogue: one slide per page, each slide an opener with its picture.
- `pandoc_to_postext.py deck.pptx --split-level 2` (pandoc sets each slide
  title as a level-2 heading; `--shift-headings -1` makes them H1). Speaker
  notes are dropped unless you pass `--speaker-notes keep` (body text) or
  `--speaker-notes callout` (a `notes` box).
- Pictures come out as `::resource` embeds, and slide tables as table
  resources.

## EPUB / HTML

- The spine order is the chapter order. `pandoc_to_postext.py book.epub`
  unwraps section divs and splits at H1.
- Web pages: remove navigation, "related" boxes, share buttons and embargo
  lines. Take captions from `figcaption` or lightbox titles. Take the
  standfirst from the subtitle, or from the first sentence of the lead.
- Math: MathJax `\(…\)` / `\[…\]` becomes `$…$` / `$$…$$`. Math already
  rendered to HTML is kept as text.

## InDesign (IDML)

### Importer or port

Postext has two routes in, and they give different books
(docs: https://postext.dev/en/docs/indesign):

- **The importer** (`postext import-idml`, the Sandbox's *New book from an
  InDesign document*, `idmlToPostext`) is deterministic and imperative: it
  copies what the package holds, frames at their coordinates
  (`--layout pages`) or stories under the document's styles
  (`--layout flow`), local overrides, empty paragraphs used as space and
  all. It infers no rules. The result replicates the craft of the pages.
- **The port** (this skill) reads the whole source folder, measures the
  print PDF, works out the rules (grid, type roles, openers, running heads,
  box families, float habits, page-template kinds) and writes reflowable
  Markdown free of page positions. It is the default for any book the user
  will keep, revise, translate, reflow to another trim or publish as EPUB.

The importer alone is right when the brief asks for a copy: an `.idml` that
Postext itself exported (it comes back with the same lines), a one-off fixed
page (poster, form, single spread), or a quick look at what a package holds.
Say so in the brief and confirm with the user before choosing it over a
port.

Inside a port, use the importer as an inventory:
`postext import-idml source/Book.idml --report --json > work/idml-report.json`
lists the paragraph styles and how each was read, the stories, the fonts the
book needs, linked pictures found and missing, tables, and findings with
counts (`textOnPath`, `rotatedCell`, `nestedStyles`, `grepStyles`,
`tableFooterRows`…), so the spec sheet can plan for them. Do not start the
chapters from its Markdown: frames at fixed places become rules and
templates, overrides become styles, empty paragraphs become spacing.

### The source folder

Ask for InDesign's File › Package output, with Include IDML and Include PDF
(Print): the `.indd`, the `.idml`, the print PDF, `Document fonts/` and
`Links/`. Keep it as the project's `source/` (`pack` leaves `source/` out of
the bundle).

- `.idml`: text, styles, tables, anchored pictures in story order.
- Print PDF: where every line, box and figure landed; the measurements and
  the final page-by-page comparison come from it.
- `Document fonts/`: the original faces, so the measured line breaks hold.
  Check the licence before shipping them (configuration.md, fonts).
- `Links/`: the artwork. `.ai` and vector `.pdf`/`.eps` become SVG with
  `convert_assets.py`; `.psd` and `.tif` become bitmaps with `images.py prep`.

### Extraction

- Export IDML and a print PDF from the same document.
- The other way round, `postext idml my-book -o book.idml` (postext ≥ 1.71; in code `idmlDocument`
  from the `postext-idml` package, which postext ≥ 1.76 needs in place of the old `postext/idml`
  subpath) writes the laid-out pages as an InDesign package: page items for rules, boxes and
  pictures, one story per composed-page frame (`next` chains share one), callout styles as paragraph
  styles, authored CMYK colours as swatches, form-field chips as InDesign form fields. From 1.76
  the pages stand in facing spreads for a book with mirrored margins (else one page per spread),
  every line ends where Postext ended it (`--lines keep`, the default; `--lines reflow` leaves the
  paragraphs to InDesign's composer, and line breaks can differ), tables are InDesign tables, inline
  maths, music and swatches are anchored inline objects, links are hyperlinks and right-to-left text
  comes out in right-to-left stories; vertical text still comes out horizontal, with an `idml.*`
  warning. `--fonts` writes the font files beside the package in `Document fonts/` (families the
  book may not redistribute are left out). Use it when the brief hands the port back to an InDesign
  studio, not as a way to check the port.
- `postext-idml` also reads: `idmlToPostext(bytes, { layout })` returns chapters, configuration,
  resources and a report (verdict, findings with counts) of what Postext has no equivalent for. It
  is deterministic and brings a book that Postext exported back with the same lines, faithful as
  composed pages (postext ≥ 1.83.2: its character styles, boxes and tints come back; not yet as a
  flowing book, #1559); a document made in InDesign comes through with the losses the report lists.
  The importer also cuts a text frame behind a Jump Object or Jump to Next Column wrap into chained
  frames above and below the object (≥ 1.82.2), splits a package's font collections (`.ttc`,
  `.otc`) into the single faces the text uses (≥ 1.83), and in `--layout flow` sets a page with no
  running text (cover, divider) as a composed page and an opener's band, kicker and title as a
  heading design (≥ 1.83.1; `composedPagesInFlow`, `openerDesigns`). `postext import-idml file.idml -o book/
  --report` runs it from the command line and prints the report: a first import to start from, which
  the port then corrects. For a port, keep to the steps below.
- `idml_extract.py roles book.idml > map.json` lists the paragraph styles in
  use (resolved font, size, colour, sample) and the stories in page order.
  Map style names to roles; prefer the style names over geometry.
- `idml_extract.py markdown book.idml --map map.json --out draft`. You get
  text in story order with bold, italic, superscript and subscript runs
  (underlined and struck runs come out plain: add `:underline[…]` and `~~…~~` by hand),
  tables with spans and header rows as table resources, anchored images as
  stubs with their link, footnotes as endnotes, and index page references as
  `:index` marks (See / See also cross-references in `index-crossrefs.md`).
- IDML does not say where text lands on the printed page. Decide where boxes,
  side notes and figures go from the PDF: find each paragraph's first and last
  printed line there. A side box goes before the first paragraph that starts
  after it; a page-wide box goes before the first paragraph that ends after it.
- Tab-led centred paragraphs are usually displayed equations
  (`:::paragraphs{style="equation"}`). `idml_extract.py` writes every tab as
  a space; where a paragraph style aligns text with its `TabList` (a menu, a
  cast list, a price list), write `:tab` and copy the stops into the
  paragraph style's `tabStops` (playbooks B13). Paragraphs set smaller than body to
  copy-fit a page belong in a `compact` paragraph style.
- Linked artwork (`.ai`, `.psd`, `.tif`, `.eps`) is in the package's Links
  folder. Convert it with `convert_assets.py` (`.ai`/`.pdf` → SVG) and
  `images.py prep`.

## XML (CNXML, JATS, DocBook, TEI)

- Namespace-aware ElementTree walker, two passes: first register every
  figure/table id → resource id, then write blocks, turning `<link target>`
  into `:ref`.
- Map note/box classes to callout types (learning objectives, worked example,
  check your understanding…). Skip teacher-only notes and problem sets unless
  wanted.
- Convert MathML to LaTeX:
  - use tables for operators, Greek letters, accents and functions;
  - add a space after commands so `\rho V` does not become `\rhoV`;
  - write a decimal comma as `{,}`;
  - use `\text{}` for words.
- Unnumbered tables become table resources with an unnumbered type (never
  pipe tables).

## Plain text / e-books (Gutenberg)

- Slice sections with a heading regex. Skip the book's own contents list; it
  is the first occurrence of each title.
- Paragraphs are blank-line separated. `_italic_` → `*italic*`. Escape stray
  `*` and `_`.
- ALL-CAPS headings → sentence case, with a list of proper nouns to restore.
- **Verse**: a block of 2 or more short lines (≤ ~58 characters) is a stanza.
  Emit a `:::verse{style="verse"}` block (postext ≥ 1.23): the lines as they
  are, a blank line between stanzas, the source's indents as leading spaces.

## Chinese, Japanese and Korean sources

Postext sets Chinese horizontally and vertically (postext ≥ 1.9; playbooks F5–F6). What each source says
about it (Japanese: the same, plus the next section):

- **PDF, horizontal**: the PDF path works; PyMuPDF gives the characters in reading order. Chinese has no
  end-of-line hyphens to join, but lines that end mid-sentence must be joined with no space: Postext drops a
  line end between two Chinese characters by itself, so writing one source line per printed line is harmless.
- **PDF, vertical** (直排): `pdf_extract.py` assumes horizontal lines. Read the text with PyMuPDF
  `page.get_text("dict")`: each line has `dir` = (0, 1) (characters running down; sideways Latin runs have
  (1, 0) inside a vertical column), and its `bbox`. Sort the columns by `x` **descending** (right to left),
  the characters of a column by `y`, tiers by `y` before `x`; a new paragraph starts where a column opens two
  characters lower (the indent). Numbers set in one cell come out as a separate horizontal span: rejoin them.
  Running heads in the fore-edge are vertical too: drop them by position.
- **Scans**: `ocrmypdf --language chi_tra` (or `chi_sim`; `chi_tra_vert` / `chi_sim_vert` for vertical
  pages), then as above. Check the rare characters by hand.
- **InDesign (IDML)**: `idml_extract.py` turns character attributes into marks: `RubyFlag`/`RubyString`
  (`RubyType` PerCharacterRuby = one reading per character) → `:ruby[…]{rt="…"}`, `Tatechuyoko` → `:tcy[…]`,
  `KentenKind` (emphasis marks) → `:dots[…]` (sesame and circles, white ones as `fill="open"`; triangles,
  squares and custom marks come out as plain dots, listed in the report), `Warichu` → `:warichu[…]`. A run
  that carries several nests them, the note outermost, then ruby, dots and tate-chu-yoko, and keeps its bold
  and italic inside them; headings and callout titles keep the text only, and the report counts the marks
  they lose. It reports stories with
  `StoryPreference@StoryOrientation="Vertical"` (→ `layout.writingMode: 'vertical-rl'`) and
  `DocumentPreference@PageBinding="RightToLeft"` (→ `page.binding: 'right'`). The frame grid
  (`CjkGridPreference`, `FrameGridOption`: characters per line, lines, size) gives `cjk.grid`; the kinsoku and
  mojikumi sets (`KinsokuSet`, `Mojikumi`) say which `cjk.lineBreak` and `punctuationWidth` the book used.
- **Word (.docx)**: vertical sections carry `w:textDirection w:val="tbRl"` in `w:sectPr` (→ vertical);
  `w:eastAsianLayout` on a run: `w:vert="1"` is horizontal-in-vertical (→ `:tcy[…]`), `w:combine="1"` two lines
  in one (双行合一, → `:warichu[…]`); `w:em` is an emphasis mark (→ `:dots[…]`); `w:ruby` holds `w:rubyBase` and
  `w:rt` (→ `:ruby[…]`). pandoc drops most of these: check the draft against the document, or read
  `word/document.xml` for the runs that carry them. Chinese paragraph styles often indent with two U+3000:
  delete them (the config indents).
- **EPUB**: the OPF spine's `page-progression-direction="rtl"` and CSS `writing-mode: vertical-rl`
  (`-epub-writing-mode`) mean a vertical right-bound book. `<ruby>紅<rt>hóng</rt></ruby>` → `{紅|hóng}`;
  `text-emphasis` → `:dots[…]`; `text-combine-upright` → `:tcy[…]`; a wavy `text-decoration` under titles →
  `:book[…]`, a straight one under names → `:name[…]`.
- **HTML / Wikisource**: the same `<ruby>` and CSS mapping. zh.wikisource classics carry notes in `<small>` or
  brackets (candidates for `:warichu`) and variant characters in templates: resolve them to text.
- **Plain text** (Gutenberg, ctext): paragraphs are usually indented with U+3000 (delete) and chapters titled
  `第X回　上聯　下聯` (split into the heading and its couplet, `\\` between the halves).
- **Script**: never convert Simplified ↔ Traditional unless asked; when asked, use OpenCC (`t2s`, `s2t`,
  `s2twp` for Taiwan phrasing) and switch the quotes (「」 ↔ “”) with the region.

## Japanese sources

Postext sets Japanese after JLReq, horizontally and vertically (postext ≥ 1.16; playbooks F9–F10). The
formats above read the same way; what differs:

- **Aozora Bunko** (青空文庫, https://www.aozora.gr.jp/): public-domain texts typed by volunteers in their own
  notation. Take the ruby file (`<id>_ruby_<n>.zip` on the work's 図書カード, `card<id>.html`): one `.txt` in
  **Shift_JIS read as CP932** (CRLF). iconv's `SHIFT_JIS` turns ―― into U+2014 and drops NEC characters;
  read it as `cp932`. Convert it with the skill's converter:

  ```bash
  python3 scripts/aozora.py 773_ruby_5968.zip -o draft/ja/01.md --styles styles.json \
    --credits credits.json --report report.json [--ruby directive] [--heading-levels 1,2,3] [--blank-lines drop]
  ```

  As a library: `from aozora import convert; r = convert(path)` → `r.markdown`, `r.styles` (ParagraphStyle
  configs for `paragraphStyles`), `r.doc.credits` (the bibliographic block), `r.doc.editorial` (notes not
  printed), `r.report`. Lower level: `parse`, `render_blocks` and `render_heading` (to split a book into
  chapter files and give headings ids). Read the report: `unknownAnnotations`, `unresolvedGaiji`,
  `unmatchedTargets` and `gaps` (notation Postext cannot express yet) carry line numbers.
- **What the converter writes** (Appendix A of the Japanese reference, as implemented):

  | Aozora | Postext |
  |---|---|
  | header (title, author), `-----` legend | dropped from the text; title and author in `credits` |
  | footer from `底本：` (or after ［＃本文終わり］) | `credits` (底本, 初出, 入力, 校正, dates): print it in the colophon |
  | `漢字《かんじ》` (base = the run of one script before 《; 々〻〆〇ヶ仝 count as kanji: `日〻《ひび》` reads over 日〻), `｜base《よみ》` | `{漢字\|かんじ}`: one group reading (Aozora never splits a reading per character) |
  | reading with spaces, a base of Latin or marks, `--ruby directive` | `:ruby[base]{rt="…" group}` |
  | ［＃「X」の左に「r」のルビ］, ［＃「X」に「r」の注記］ (ママ) | `:ruby[X]{rt="r" group pos=under}` / reading over X |
  | 《〔r〕》 (the edition's added reading) | kept as ruby without 〔〕 (`editorial_ruby="drop"` removes it) |
  | ［＃「X」に傍点］, ［＃傍点］…［＃傍点終わり］; 白ゴマ, 丸, 白丸; `の左に` | `:dots[X]{style=sesame}`, `{… fill=open}`, `{style=circle fill=filled}`, `{style=circle fill=open}`; left side `pos=under` |
  | 黒三角, 白三角, 二重丸, 蛇の目, ばつ傍点 | `:dots{style=triangle…}` etc., kept but drawn as dots (reported gap) |
  | 傍線, 二重傍線, 鎖線, 破線, 波線 | `:sideline[X]`, `{style=double}`, `{style=dotted}`, `{style=dashed}` (gap: drawn solid), `{style=wavy}` |
  | ［＃「X」は縦中横］, ［＃「X」は横組み］ | `:tcy[X]`, `:sideways[X]` |
  | 太字, 斜体 | `**X**`, `*X*` (in a `ja` book `*…*` is bōten: reported) |
  | 上付き小文字, 行右小書き / 下付き小文字, 行左小書き | `^X^` / `~X~` |
  | ［＃割り注］…［＃割り注終わり］ | `:warichu[…]` (source （） consumed into `open`/`close`); ［＃改行］ inside → U+3000 (gap) |
  | `字［＃（ヲ）］［＃レ］`, ［＃一レ］, 竪点 `敬‐［＃二］` | `:kunten[字]{kaeri="レ" okuri="ヲ"}`, `{tate kaeri="二"}` |
  | 大/中/小見出し (forward, block, ここから), 同行/窓 | `#` `##` `###` (`--heading-levels`), `{indent="N"}` from ［＃N字下げ］ (read by the engine; set the level's `indent` to the common value too, so headings written by hand match), `kind="runin"`/`"window"` (gap) |
  | ［＃改ページ］, ［＃改丁］, ［＃改見開き］, ［＃改段］ | `:::pagebreak`, `{parity="odd"}`, `{parity="even"}`, `:::columnbreak` |
  | a paragraph's leading U+3000 / 「 with none / neither | dropped (the body's 1-em indent) / plain (the engine's bracket rule) / `:::paragraphs{style="aozora-f0"}` (flush) |
  | ［＃N字下げ］, ここからN字下げ, 折り返してM字下げ, 改行天付き | `aozora-iN-fK`, `aozora-iN-hM`, `aozora-hN` styles |
  | 地付き, 地からN字上げ (line, block, mid-line) | `aozora-end` (`textAlign: 'end'`), `aozora-endN` (+ `endIndent: N em`) |
  | N字詰め, ページの左右中央 (paragraphs) | `-wN`, `-center` style suffixes, reported (use `:::pagebreak{center}` for a centred page) |
  | `※［＃「てへん＋劣」、第3水準1-84-77］`, `第4水準2-…`, `U+XXXX`, `［＃二の字点、1-2-22］` | the character (JIS X 0213); unresolved → 〓 and listed |
  | `／＼`, `／″＼` after kana | 〳〵, 〴〵 |
  | CP932 ～ (U+FF5E), half-width katakana | 〜 (U+301C); full width. Full-width Latin (Ｋ) untouched |
  | 〔E'tude〕 accent decomposition | Étude |
  | ［＃「X」は底本では「Y」］, ［＃「X」はママ］, ［＃ルビの…］ | not printed; in `editorial` |
  | ［＃…（fig.png、横W×縦H）入る］ + キャプション | `::resource{id="fig"}`, an image block with its caption |
  | blank lines between paragraphs | `:::space{lines=N}` (`--blank-lines drop`) |

- **Rights and credits.** Aozora publishes works whose copyright has expired (and a few its rights holders
  released). In Japan the term is life + 70 years since 2018-12-30, and works whose term had ended before then
  stayed free: an author who died in **1967 or earlier** is in the public domain there. The book must also be
  free where it is published: the EU counts life + 70 (in 2026, died 1955 or earlier); the US counts
  publication (in 2026, published before 1931). A translation or a modern editor's additions (notes, added
  readings) have their own author. Aozora asks that a redistributed file keep its bibliographic block and the
  notice that volunteers typed and proofread it (「このファイルは、インターネットの図書館、青空文庫で作られました。…」):
  print `credits` in the colophon, with the card URL, and say what the port changed (notation turned into
  markup, 外字 set as characters, ～ as 〜, ／＼ as 〳〵).
- **NDL Digital Collections** (国立国会図書館デジタルコレクション, https://dl.ndl.go.jp/): scans of first
  editions, covers, frontispieces and illustrations. Items marked インターネット公開（保護期間満了） are free to
  reuse; credit the collection and the item's `pid`. Images come through IIIF:
  `https://dl.ndl.go.jp/api/iiif/<pid>/manifest.json`, then
  `https://dl.ndl.go.jp/api/iiif/<pid>/R<canvas, 7 digits>/full/full/0/default.jpg`. Pace the requests.
  For a text not on Aozora the item's OCR text, where NDL has made one, is a draft to proofread (ruby is lost,
  old kanji are misread).
- **PDF, vertical**: as Chinese vertical PDFs (columns right to left, `dir` (0, 1)). Readings come out as
  small separate spans beside their base: rebuild them as `{base|reading}` from their position, or take
  the text from another source. A hung 、。 sits outside the column's last cell.
- **Scans**: `ocrmypdf --language jpn` (`jpn_vert` for vertical pages); ruby and bōten do not survive OCR.
- **InDesign (IDML)**: `idml_extract.py` reads Japanese ruby (`RubyType` GroupRuby → one reading, PerCharacterRuby
  → per character; in a `ja` book a per-character ruby of a word is jukugo), kenten, tate-chu-yoko and warichu
  as for Chinese. Read the paragraph styles' composition settings by hand: the kinsoku set
  (`KinsokuSet`: 強い禁則 Hard → `ja-very-strict`, 弱い禁則 Soft → `ja-strict` or `ja-loose`), the hanging
  (`BurasagariType` `BurasagariNone` / `BurasagariStandard` / `BurasagariForced` → `cjk.hangingPunctuation`
  `'none'` / `'allow'` / `'force'`) and the mojikumi set (the punctuation spacing; JLReq's defaults match
  the usual 行末約物半角 sets).
- **Word (.docx)**: `w:ruby` (group or per character), `w:em` (bōten: `comma` = sesame, `dot`, `circle`,
  `underDot` = a dot under), `w:eastAsianLayout` as for Chinese; a Japanese paragraph indented with one U+3000 is
  the 1-em indent.
- **EPUB** (Japanese publishers follow the 電書協 production guide): `<ruby>` per word, emphasis classes
  (`em-sesame` and the like) or `text-emphasis` → `:dots[…]`, `.tcy` / `text-combine-upright` → `:tcy[…]`,
  `page-progression-direction="rtl"` and `writing-mode: vertical-rl` → a vertical right-bound book.
- **Text as written**: keep the edition's kanji forms and kana usage (旧字旧仮名 stays), its numbers in kanji,
  full-width Ｋ and １２ (upright one per cell in vertical text). Never NFKC the whole text: only half-width
  katakana become full width. Keep IVS selectors after names. Japanese writes no spaces between words: a space
  typed inside Japanese text is usually a typo, except between Latin words.

## Arabic sources

Postext sets Arabic right to left with a mirrored page (postext ≥ 1.15; playbooks F7–F8). What each source
says about it:

- **PDF**: PyMuPDF returns Arabic in *logical* order for most InDesign/Word PDFs, but some (older Quark,
  certain LaTeX/XeTeX, scanned-and-OCRed files) store glyphs visually: words come out reversed and joined
  forms as presentation forms (U+FB50–FEFF). Check a known word; repair visual lines by reversing each run of
  Arabic and normalising with NFKC (presentation forms → letters), then put back the harakat order (NFKC can
  reorder shadda + vowel: keep the source's order, UTR #53). Kashidas typed or drawn as U+0640 in the PDF are
  justification, not text: strip every tatweel that is not a stylistic one the author meant.
- **Scans**: `ocrmypdf --language ara` (Tesseract `ara`), then as above. Vocalised text OCRs poorly: compare the
  marks by hand or take the text from an edition already transcribed (Wikisource, Hindawi, Shamela).
- **Word (.docx)**: `w:bidi` on paragraphs and `w:rtl` on runs mark right-to-left text; `w:cs` fonts are the
  Arabic faces (`w:rFonts w:cs="…"`), `w:szCs` their size — read those, not `w:ascii`. A Latin paragraph inside
  an Arabic document (no `w:bidi`) becomes `:::paragraphs{dir=ltr}`.
- **InDesign (IDML)**: Middle East builds carry `ParagraphDirection="RightToLeftDirection"`,
  `CharacterDirection`, `Kashidas` (`DefaultKashidas` / `KashidasOff` → `bodyText.kashida`) and
  `DigitsType` (`ArabicDigits` = 0–9, `HindiDigits` = ٠–٩, `FarsiDigits` = ۰–۹ → `numerals`); check them
  against the PDF, as they are not always set. `DocumentPreference@PageBinding="RightToLeft"` → right binding (the
  default for an Arabic locale anyway). `idml_extract.py` reports the binding; directions it leaves as text.
- **EPUB / HTML**: `dir="rtl"` on `<html>` or blocks, `lang="ar"`, `page-progression-direction="rtl"`.
  `<bdi>`, `<span dir="ltr">` → `:ltr[…]`; a block with `dir="ltr"` → `:::paragraphs{dir=ltr}`.
- **Wikisource / Hindawi / Shamela**: poems are `{{أبيات|ṣadr \\ ʿajuz …}}` (one bayt a line) → `:::verse`
  with `||`; centred headings `{{وسط|…}}` → headings; page headers `–٥–` are folios (drop them). Hindawi
  editions are CC BY 4.0 (design) over a public-domain text.
- **Orthography**: keep the edition's spelling (فى, الامر, مائة, missing hamzas) and its digits; type Arabic
  punctuation (، ؛ ؟) where the source has it. Never run NFC/NFD over vocalised text you keep.

## Content you must not copy blindly

- **Rights**: when the user owns the title (publisher, author, licensee;
  see SKILL.md, "Who ports"), convert the text and images in full. Only for
  third-party pieces they cannot reuse: replace those pictures with licensed
  ones (Wikimedia Commons, CC0 or public-domain museum collections), checking
  the licence of each file before downloading, and record credits (a credits
  chapter plus `note` credit lines). Licensed fonts: `redistributable: false`.
- **Characters the fonts cannot set** (Greek, IPA, emoji, CJK): check font
  coverage (`fonts.py info`; `lint_project.py` lists the CJK characters a
  bundled face lacks), then choose between a face that has them (for
  Chinese, donor glyphs copied into the subset, playbooks E6), a paragraph
  style in another family, or removal.
