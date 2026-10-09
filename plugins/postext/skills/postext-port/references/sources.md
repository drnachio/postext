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
| Markdown (GitHub/pandoc) | `pandoc_to_postext.py SOURCE --from markdown` | — | never copy CommonMark as is: tables, fences, `---` are not Postext (`[^n]` footnotes are) |
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
- **Small caps** extract as lower case: restore roman numerals ("xix" → "XIX")
  and acronyms.
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
  chip, reports the quality of the original, saves the mapping as a
  reusable template, and exports back to Word with the template embedded,
  so an edited manuscript returns unchanged (docs: Sandbox → Word
  documents). Point them there; use the scripts below for the original's
  layout rules, batches of files, or what the dialog does not read.
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

- Export IDML and a print PDF from the same document.
- `idml_extract.py roles book.idml > map.json` lists the paragraph styles in
  use (resolved font, size, colour, sample) and the stories in page order.
  Map style names to roles; prefer the style names over geometry.
- `idml_extract.py markdown book.idml --map map.json --out draft`. You get
  text in story order with bold, italic, superscript and subscript runs,
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
