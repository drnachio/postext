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
| LaTeX | `pandoc_to_postext.py` (keeps `$…$` math) | the compiled PDF | custom macros need a pandoc Lua filter or manual care |
| Markdown (GitHub/pandoc) | `pandoc_to_postext.py SOURCE --from markdown` | — | never copy CommonMark as is: tables, footnotes, fences, `---` are not Postext |
| XML (JATS, DocBook, CNXML, TEI) | pandoc (`jats`, `docbook`) or a small ElementTree walker | the publisher's PDF | two passes: register ids, then write |
| Plain text (Gutenberg…) | a small script: slice by heading regex, blank-line paragraphs | — | `_it_` → `*it*`; verse detection |
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
   credits, and `skip` for running heads, folios and label text inside
   artwork. Split a style with position conditions (`top_mm`, `x_mm`) when
   the same face serves two roles.
3. `pdf_extract.py markdown book.pdf --roles roles.json --out draft --lang es --link-refs`.
   The extractor:
   - reads column by column, with page-wide bands between;
   - builds paragraphs from indents, gaps and short last lines;
   - continues paragraphs across columns and pages;
   - joins end-of-line hyphens using the book's own vocabulary, keeping real
     compounds and names;
   - expands ligatures and repairs dropped-ligature gaps ("Clasifi cación");
   - keeps bold and italic runs;
   - sets raised small digits as `^n^` and lowered ones as `~n~`;
   - builds lists from bullet markers;
   - collects footnotes as endnotes;
   - drops repeated running heads and folios;
   - writes caption stubs with page and box for the figure cutter.
4. `pdf_figures.py stubs book.pdf draft/resources.json --out-dir project/resources`
   cuts the artwork next to each caption. Photos come out at native
   resolution in sRGB; vector art comes out as SVG (plus a PDF print master
   with `--format both`). Fix regions by hand with `pdf_figures.py crop`.
5. Tables: `extract_tables.py book.pdf --pages N` gives a TableModel. Add
   merges (colSpan/rowSpan + hiddenBy) and header rows by hand. Merge tables
   continued over pages ("(cont.)"), dropping the repeated header.
6. Read every chapter against the page images and correct it. The extractor
   gives a draft; the curated Markdown is the product.

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
- **Small caps** extract as lower case: restore roman numerals ("xix" → "XIX")
  and acronyms.
- **Infographic pages** (hundreds of vector drawings, little text): cut them
  as figures, or transcribe the data as tables/callouts. Retyping data is
  legitimate.
- **Text in images**: keep it as artwork. For a translated edition, see
  playbooks.md, "Live-text figures".
- **Scans**: `ocrmypdf --language spa+eng --deskew scan.pdf ocr.pdf`, then run
  the PDF path. Use size bands (`size: [11, 13]`) instead of exact fonts in
  roles.

## Word (.docx)

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
  `--notes inline` or `--notes drop` to change that. Alternatively, move them
  into side callouts in a `oneAndHalf` layout.
- Equations (OMML) arrive as TeX `$…$`. Check the output.
- EMF/WMF images must be converted (Inkscape, LibreOffice):
  `soffice --headless --convert-to png file.emf`.
- Tracked changes: accept or reject them in Word first.
- Word's "manual" formatting (bold paragraphs used as headings) has no
  style. Map by inspection, or add styles in Word before converting.

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

- Export IDML and a print PDF from the same document.
- `idml_extract.py roles book.idml > map.json` lists the paragraph styles in
  use (resolved font, size, colour, sample) and the stories in page order.
  Map style names to roles; prefer the style names over geometry.
- `idml_extract.py markdown book.idml --map map.json --out draft`. You get
  text in story order with bold, italic, superscript and subscript runs,
  tables with spans and header rows as table resources, anchored images as
  stubs with their link, and footnotes as endnotes.
- IDML does not say where text lands on the printed page. Decide where boxes,
  side notes and figures go from the PDF: find each paragraph's first and last
  printed line there. A side box goes before the first paragraph that starts
  after it; a page-wide box goes before the first paragraph that ends after it.
- Tab-led centred paragraphs are usually displayed equations
  (`:::paragraphs{style="equation"}`). Paragraphs set smaller than body to
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
  Emit `:::paragraphs{style="verse"}` with **one paragraph per line**, blank
  lines between. Postext has no hard line break.

## Content you must not copy blindly

- **Rights**: check the licence of the text, images and fonts. Replace
  pictures you may not reproduce with licensed ones (Wikimedia Commons, CC0
  or public-domain museum collections), checking the licence of each file
  before downloading. Record credits (a credits chapter plus `note` credit
  lines). Licensed fonts: `redistributable: false`.
- **Characters the fonts cannot set** (Greek, IPA, emoji, CJK): check font
  coverage (`fonts.py info`), then choose between a fallback family for those
  runs, a paragraph style, or removal.
