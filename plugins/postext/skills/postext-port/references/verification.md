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
  default EB Garamond or Open Sans (checked with fontTools; they would print as empty boxes);
- kana under a `zh-*` locale (a Japanese book set with Chinese rules) and `locale: 'jp'`;
- Aozora Bunko notation left in a chapter (`X《よみ》`, `｜`, `［＃…］`).
- comics: a `split` that does not parse, `art=` naming no picture, `em` in the lettering size, gutters or
  panel borders, malformed anchors, faces, avoid zones or safe areas.

Read every WARN:

- H1 without `breakBefore` once `headings` exists;
- a missing header design (the default one is blue Open Sans);
- font families that are not bundled;
- odd `$`;
- a `here` resource that is never embedded;
- Chinese text with no `config.locale`, or `locale: 'zh'` with no script; Japanese text (kana) with no locale;
- a Japanese book with a Chinese `cjk.region` or `lineBreak`, italic `cjk.emphasis`, a left binding on a vertical
  page, or a Chinese (SC/TC) face setting its kana; kanji index entries without `yomi` (`indexReadingMissing`);
- Aozora's ／＼ くの字点 left as typed;
- markup typed with an input method (`：：：`, `＃`, `［＾…］`, `＊＊`);
- a CFF font over 2 MB, a variable font, a vertical book whose Chinese face lacks `vert`;
- comics: panels ≠ cells, stray text, unknown balloon or panel styles, script attributes that do not read,
  an anchor outside its safe area, unbundled lettering or sound-effect faces, and editions whose splits or
  panel pictures differ (the geometry is the same in every language). INFO lists speakers no picture marks.

## 2. Headless layout

### The work loop: `postext build --watch`

Work on the unpacked project folder with one watcher running on the pages at
hand (SKILL.md §7 has the full recipe, with the wait for each rebuild):

```bash
postext build my-book --locale es --images /tmp/pages --pages 12-15 -f jpeg --dpi 100 --watch > /tmp/watch.log 2>&1 &
```

Every save of a chapter, of `preset.json` (run the generator) or of a
resource lays the whole book out again with the engine and fonts still
loaded, about a second on a long book, and rewrites `/tmp/pages/page-NNN.jpg`
(NNN = position in the book); the log gets the build's warnings, with chapter
file:line and page, and a `rebuilt in N ms` line, or `error …` when the save
breaks the book (the last good pages stay). Files that are not part of the
book (`source/`, `*.py`, `resources.json`, `report.md`, `layouts*.json`) are
neither read nor watched. To look at other pages, stop it
(`pkill -f "postext build my-book"`) and start it with the new `--pages`.
`--pages` takes printed numbers (`12-15`, `iv`) or positions (`'#40'`,
`'#10-#20'`). Add `--pdf /tmp/my-book.pdf` to the same command when the PDF
itself is what you are checking (fonts, print settings); it costs more per
round.

### One-shot commands

The [postext command line](https://postext.dev/en/docs/command-line) (one
self-contained executable per system: download it from
`https://github.com/drnachio/postext/releases/latest/download/postext-<system>`,
or `npx postext-cli`):

```bash
postext check my-book --locale es --json                         # every warning with chapter file:line and page; exit 3 on errors
postext images my-book --locale es --pages 12-15 -f jpeg --dpi 100 -o /tmp/pages   # same page-NNN.jpg names as render.mjs
postext image my-book --locale es --page '#40' --dpi 150 -o /tmp/p40.png
postext pdf my-book --locale es -o /tmp/my-book.pdf              # print checks; --pdfx x4 --profile fogra51 to try print settings
postext info my-book --pages                                     # chapters, pages, where each font family comes from
```

Differences from `render.mjs`: `--chapters` is 1-based (`--chapters 3`
is the third chapter file) and lays those chapters out as a short book;
`check` reports the engine's warnings and the print preflight but not the
Sandbox's extra checks that `render.mjs` adds with `SANDBOX-WARN`; a font
family the project does not bundle is downloaded from Google Fonts (and
cached) as the browser would, where `render.mjs` measures it with a
stand-in face; `--offline` keeps it from downloading.

### `render.mjs` (Node)

```bash
node scripts/render.mjs my-book --lang es                                   # layout + diagnostics only
node scripts/render.mjs my-book --lang es --jpeg /tmp/pages --pages 12-15   # + those pages as JPEGs
node scripts/render.mjs my-book --lang es --out /tmp/my-book.pdf            # + the PDF (print checks)
```

Each call loads the engine afresh (a few seconds): use it at milestones for its
`SANDBOX-WARN`, `NOTE` and `PARSE` lines, or for the loop when the executable
cannot be had.

### Page JPEGs from `render.mjs`

`--jpeg DIR` paints pages with the engine's own canvas renderer
(`renderPageToCanvas` on `@napi-rs/canvas`, the Sandbox Canvas tab's
painter) and writes `DIR/page-NNN.jpg`, NNN the page's position in the
layout. Open the files to look at them. Options:

- `--pages 12-15,20`: pages by the number they print; `--pages '#3'` or
  `'#3-6'`: by position in the layout (front matter in roman numerals and
  restarted numbering repeat printed numbers; the log line of each file
  gives both). Without `--pages`, every page.
- `--dpi 100` (default): body text readable; 150–200 to check hairlines,
  kerning or a formula; 50 for a contact look at a whole chapter.
- `--quality 85` (default): JPEG quality.
- `--chapters 0,3`: lay out those chapter files only (indexes into the
  manifest's list), joined into one flow numbered from 1.

Requires `npm i @napi-rs/canvas` in the tools folder (the script says so if
it is missing). Images are decoded by Skia: bitmaps and SVGs both paint;
`JPEG-WARN … does not decode` names a file to convert. Use the JPEGs for
every look while iterating (better still, the watch loop above); the PDF (`--out`, `--png`) is for the print
checks in §5 and the final hand-off. `--png` rasterises the PDF with
pdftoppm and is slower.

In your own Node code the same takes a few lines (after `render.mjs`'s
resolve hook, fonts measured as it does):

```js
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { renderPageToCanvas, registerResourceImage } from 'postext';

GlobalFonts.register(fontBytes, 'EB Garamond');            // every bundled face, under its family
registerResourceImage('resources/fig.svg', await loadImage(svgBytes), { vector: true });
globalThis.OffscreenCanvas = class { constructor(w, h) { return createCanvas(w, h); } };
const canvas = createCanvas(1, 1);
renderPageToCanvas(doc.pages[11], doc, canvas, { scale: 100 / doc.config.page.dpi });
writeFileSync('/tmp/p12.jpg', await canvas.encode('jpeg', 85));
```

### What the log says

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
- `WARN cjkMarksExceedLeading|rubyExceedsLeading|kuntenExceedsLeading`: emphasis dots, side lines, name lines,
  ruby readings, interlinear note markers or 送り仮名 do not fit in the line gap. Give the paragraph (or the book)
  more leading (Japanese bunko: about 1.7 em).
- `WARN indexReadingMissing` (Japanese): an index entry with kanji has no reading and files after the kana.
  Add `yomi="…"` to its marks.
- `WARN rotateIgnoredVertical`: a figure with `placement.rotate` is cited in vertical text, where figures
  already stand upright. Remove the rotation.
- `WARN designTextTruncated` (≥ 1.24): a design text lost part of a line to fit its width (an ellipsis, or
  ink clipped past its box), named by slot and element id. Compare with the source: a title the source
  breaks onto lines wants `overflow: 'wrap'` (the default in heading and part designs) or a wider box; a
  running head the source cuts may keep it.
- `CONFIG cjkGridClamped`: `cjk.grid` asked for more characters or lines than the margins leave room for.
- `PDF-WARN missingGlyph` (with `--out`): characters no file of a face has a glyph for; they print as
  empty boxes. `variableFontDefaultInstance`: a variable font printed at its default weight.
  `cffEmbeddedWhole`: a CFF font over 2 MB embedded whole. Fix the font files (playbooks E6).
- `WARN comicPanelLetterbox|comicBalloonOverflow|comicSplit…|comicUnknown…` (comics): a cell that cannot
  hold its picture's safe area, a balloon that does not fit, a split or name the engine could not read.
  Each is listed with its fix in comics.md §14.
- `NOTE preset.json has no "configVersion"` (or an older one): the config is
  laid out, as in the Sandbox, with the postext 1.4 rules the line names
  (heading breaks, formula size, space around inline resources, plain
  headings, drop-cap sizes, room under a colon line, box cuts, breaks at dashes, breaks at
  compounds' hyphens, ragged breaking, split under a heading, space under paragraph containers).
  Set `"configVersion": 10` and check the pages again when the config is meant for today's rules.
- Run each language (`--lang`).

## 3. Compare with the source, page by page

`compare_pages.py` takes the render as a PDF or as the `--jpeg` folder
(`--render-pages` then counts layout positions, as the file names do).

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

Japanese books, page by page (the Chinese checks, plus):
- no line opens with っ ゃ ー 々 (unless the source allows it: `ja-strict`), 、。 hang past the column foot
  where the source hangs them, ―― and …… never split;
- a paragraph opening with 「 sets the bracket as the source does (③ in the indent cell, ① after it);
- furigana: right of the column (over the line in horizontal text), half size, a long reading running onto kana
  but never onto kanji; jukugo words split between characters at a line break;
- bōten as sesame ﹅ right of the column; no 1-character last line; headings on their lines (行取り) and
  indented as in the source; notes where the source sets them;
- small kana sit up and right in their cells, ー is a vertical stroke, “” print as 〝〟.

### Comic pages

Comic pages have no source text lines to compare: compare pictures and
lettering, every page, every language.

1. **Geometry, once.** `comic_panels.py detect` sheets of the source pages
   (panels numbered in reading order) next to the rendered pages:
   `python3 scripts/comic_panels.py contact src-sheets/*.jpg /tmp/pages/*.jpg --out /tmp/cmp.jpg`.
   Same panels, same order, gutters and frame within a millimetre, no
   `comicPanelLetterbox` unless chosen.
2. **Marks.** `python3 scripts/comic_panels.py check preset.json --out /tmp/check`:
   each mouth on its speaker's mouth, faces covering the faces, the safe area
   around everything a crop must keep.
3. **Lettering, per language.** Render each edition
   (`render.mjs --lang ja --jpeg /tmp/ja`) and look at every page at
   `--dpi 150`:
   - every line of the script is lettered (count balloons per panel against
     the script lines; joined lines share one outline);
   - balloons read in order (top to bottom, from the start side), none
     covers a face or a key object, none crosses a border it should not;
   - each tail points at its speaker's mouth; off-panel voices point to the
     right border;
   - no balloon is cramped: `comicBalloonOverflow` names the panel; break the
     line with `\`, shorten it, give the panel more room, or pin it with `at=`
     (in the Sandbox, drag the balloon: the pin is written into its line;
     double-click to unpin);
   - Japanese and Traditional Chinese balloons are vertical with upright
     `！？`, no balloon ending in `。`; Arabic pages read right to left and
     their balloons too;
   - sound effects sit where the source puts them, at its angle.
4. **Text against the source.** Read the lettered pages against the
   source's balloons (or transcript) for missing or swapped lines; the
   lettering never drops text, so a missing balloon is a missing script
   line.
5. **Print.** The PDF (`--out`) once at the end, like any book: spreads
   open on a verso (a blank page before one when the parity needs it) and
   a panel across the spine shows on both pages; PDF/UA tags put each
   panel's balloons after its figure.

## 4. The real viewer

Open the project in the sandbox: import the `.postext` (`preset_kit.py pack`),
or serve the presets folder. Check the canvas, the HTML viewer, the Folio
tab (the book bound, on its `config.folio` paper: cover, spine image,
`:::paper` plate sections, thickness) and the PDF tab. The sandbox shows its own warnings panel: loose lines, heading
hierarchy, design anchors and placeholders, parity issues. The PDF tab's
output is the reference; headless metrics can differ slightly.

If you cannot open a browser, say so and hand the user the `.postext` and
the page images instead of claiming the port is visually verified.

## 5. Print checks (when the PDF is the deliverable)

- `postext check my-book --preflight` (or the PREFLIGHT lines of
  `render.mjs`): low-resolution pictures, hairlines, small text in several
  inks, ink over the limit, text near the trim, page by page.
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
| Japanese kanji in Chinese shapes (直 骨 角) | a SC/TC face, or a pan-CJK face without `locale: 'ja'`: use Noto Serif JP (playbooks E8) |
| Japanese lines open with っ or ー, 、 is half width inside the line (Kaiming), no space after a mid-paragraph ？ | `locale` is not `ja` (`lint_project.py` says so) or `cjk.region`/`lineBreak` set to a Chinese value |
| Furigana or 送り仮名 overlap the next line | more leading (`rubyExceedsLeading`, `kuntenExceedsLeading`) |
| Empty boxes in the PDF | `missingGlyph`: the face lacks the character; rebuild the subset from the final text (playbooks E6) |
| Bold Chinese headings print regular | a variable font: cut a static 700 instance (`variableFontDefaultInstance`) |
| Vertical brackets turned instead of vertical forms | the face lost `vert` in subsetting: use `fonts.py subset`, which keeps it |
| A vertical book's spreads read left to right in the PDF viewer | Chrome's viewer ignores `/Direction /R2L`; Acrobat and Foxit follow it |
| Comic picture shown whole with bands (`comicPanelLetterbox`) | the cell's shape leaves the safe area: change the split, shrink the safe area, or `fit=contain` + `bg` on purpose |
| Balloon on a face, or below its speaker | mark the face (`anchors[].face`) or an `avoid` zone; give the panel's top more room; pin with `at=` |
| Balloons of one speaker merged into one outline when the source has two | `join=false` on the second line |
| Manga panels read left to right | `comics.artDirection: 'rtl'` (or the page's `direction=rtl`); never reverse the split by hand |
| Spread's panel 1 on the second page | the book's binding: a right-to-left comic in a left-bound book; give the config a `comics` section and leave `page.binding` on `'auto'`, or set `'right'` |
| Lettering too small on an A4 album | `comics.lettering.fontSize` (default 7.5 pt): 9–10 pt |

Accept remaining deviations explicitly and list them as known gaps, for
example a paragraph the source wraps around a box, or a caption set 1–5 %
tighter. Do not tweak individual line breaks.
