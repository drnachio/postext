# Verification: is the port faithful?

Check in this order, from cheap to expensive, and fix the cause each time.

## 1. Static checks

```bash
python3 scripts/lint_project.py my-book --quiet
python3 scripts/preset_kit.py lint my-book          # content in the config, config size
```

Fix every ERROR. Common ones:

- `contentInConfig`: the book's text typed into design text elements (a running head, an opener, a page
  style). Move it to the Markdown (playbooks J); allow a long label that is form with
  `config.checks.contentInConfig.allow`. `preset_kit.py lint` counts exactly as the engine's warning
  (configuration.md §19h), per edition, and prints each owner's slots and element paths; `--json` gives
  each edition's warnings in the engine's shape. It also lists design texts the engine's check does not
  read (a page template's decoration): move those too;

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

**Misspelt setting names.** A config key nobody knows is dropped in silence in most of the config.
- `postext check` reports `unknownConfigKey` (with `suggestion`) only in `headings` (its `balancing` and
  `levels[]`), `headingStyles[]`, `paragraphStyles[]` (and the same under `htmlViewer.overrides`), tab stops,
  drop caps (and `leadIn`), `lineNumbers`, `canvasViewer`, `checks` (and `contentInConfig`), `codeStyle` (its
  `tokens` and `inline`), `comics`, `pageTemplates` and `labelStyles`. Since postext#1122 it also reports the
  top-level keys of the config (and of `htmlViewer.overrides`), every design element's keys by its `kind`
  (running heads, decorations, heading and part designs: text, rule, box, image, path, connector, a `remove`
  entry), a connector's `from`/`to` ends, the `placement` of an element, a frame or a group (its `anchor`,
  `offset`, `size` and a `{to, edge}` size) and a decoration's own keys: a group's `size` written beside its
  `placement` is `/pageTemplates/0/groups/0/size`.
- `lint_project.py` checks the top-level keys (`bodyTex`, `pageTemplate` are reported), and the keys of `folio`,
  `comics`, `lineNumbers`, `codeStyle`, tab stops and drop caps.
- Nothing checks the keys inside `page`, `layout`, `bodyText`, `tableStyle(s)`, `captionStyle`, `diagramStyle`,
  `videoStyle`, `calloutStyles`, `chipStyles`, `markStyles`, `parts`, `toc`, `index`, the lists, `math`,
  `footnotes`, `crossRefs`, `citations`, `cjk`, `header`, `footer`, `htmlViewer`, `pdfGeneration`, `print`,
  `contrast`, `debug`, `colorPalette` and `resourceTypes`: check the generator's keys against configuration.md by
  hand, and look at the page a changed key should move.
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
- a config past 3 MB (the Sandbox keeps a book in about 5 MB of browser storage; aim under 1 MB);
- `designMarksLiteral`: `**…**`, `*…*`, `^…^`, `~…~` or `:mark[…]` typed in a design text element, or brought
  into it by an `{attr.key}` whose value carries them, while the element has no `inlineMarks: true`: the
  markers print as written. Set `inlineMarks: true` on the element;
- `fixedSpacePlusSpace`: a plain space typed beside an en, em, thin or no-break space (`1.  Title`): the
  line sets both, a gap wider than the source's. Keep the fixed space alone;
- `headingChip`: `:chip` in a heading on a book pinned to a postext older than 1.52.0, where it prints
  literally (`--engine 1.51.0` names the pin; the project's `package.json` or `recipe.json` is read
  otherwise; unpinned, an INFO line reminds you of the version);
- `smallCapsByHand`: capitals typed in a bare chip (no fill, no outline) at 55–85 % of the text: type the word
  in lowercase in `:smallcaps[…]`, which keeps the capitals at full size as small capitals do;
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
breaks the book (the last good pages stay). Only the files the manifest names are read; dot files,
`__pycache__`, `node_modules`, `source/`, `*.py`, `resources.json`, `chapters.json`, `report.md`, `roles.json`
and `layouts*.json` are neither read nor watched. To look at other pages, stop it
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

More of the command line (`postext help <command>` lists every option):

```bash
postext images my-book --pages 40 --set bodyText.fontSize.value=10.5 --set headings.levels.0.italic=true -o /tmp/try   # try a value without the generator
postext check my-book --locale es --strict --json   # exit 3 on any warning too
postext image my-book --page 12 --print-preview -o /tmp/p12-print.png   # through the output profile, trim and bleed drawn
postext pdf my-book --color-space grayscale --no-outlines --no-accessible -o /tmp/gray.pdf
postext docx my-book -o /tmp/my-book.docx            # Word for an editor; `import-docx` brings corrections back (sources.md § Word)
```

- `--set PATH=VALUE` (repeatable) works on every command that reads a book. It applies after
  `localized.<lang>.config`; numeric segments index arrays; the value is read as JSON when it parses (`10.5`,
  `true`, `{"value":11,"unit":"pt"}`), otherwise as text. Try a value with it, then write the one you keep into
  `build_preset.py`.
- `--config FILE` is deep-merged over the book's config (a bare config or a whole `preset.json`). It differs from
  `localized.<lang>.config`, which is merged field by field with lists keyed by `id` (configVersion 21) and replaces
  each top-level key it names below 21.
- `--font-dir DIR` (repeatable) is searched before the faces compiled into the executable, the cache
  (`--cache-dir`, `POSTEXT_CACHE_DIR`, default `~/.cache/postext`) and Google Fonts / Fontsource: licensed faces
  kept outside the bundle.
- `--pattern` gives `images` file names from `{n}`, `{n:03}`, `{label}` and `{chapter}` (default `page-{n:03}`);
  `--jobs N` encodes in parallel; `--quality` is for JPEG/WebP (default 90); `--dpi` defaults to 150.
- Exit codes: `0` done, `1` failed, `2` wrong usage (an unknown option, a missing input), `3` `check` found errors
  (or warnings with `--strict`). `--json` writes one object on stdout (`outputs`, `pages`, `warnings[]` with
  `kind`, `severity`, `message`, `at` = file:line, `page`, `timings`) and logs to stderr.
- Loose Markdown needs no `preset.json`: `postext pdf a.md b.md --config design.json --resources pics/ --fonts
  fonts/ --name "Title"`. The `--resources` file names are the ids; a `resources.json` in that folder describes
  them in the manifest's form.
- EPUB, HTML and press PDF deliverables: configuration.md §21, "Delivering EPUB, HTML and PDF files".

Differences from `render.mjs`: `--chapters` is 1-based (`--chapters 3`
is the third chapter file) and lays those chapters out as a short book;
`check` reports the engine's warnings and the print preflight but not the
Sandbox's extra checks (`render.mjs --repo <checkout>` adds them as `SANDBOX-WARN`, and the Sandbox itself
lists them, §4); a font
family the project does not bundle is downloaded and cached, from Google
Fonts or, for a family Google Fonts does not have, from Fontsource, as the
Sandbox loads it, where `render.mjs` downloads nothing and measures the
family with a stand-in face; `--offline` keeps it from downloading.
Both measure with no language (the CLI on Skia, render.mjs with fontkit) and lay the book out
with `bodyText.shapingLanguage: 'host'` whatever its config says: a line can
break at another word than in the Sandbox (configuration.md, `shapingLanguage`).

### `render.mjs` (Node)

```bash
node scripts/render.mjs my-book --lang es                                   # layout + diagnostics only
node scripts/render.mjs my-book --lang es --jpeg /tmp/pages --pages 12-15   # + those pages as JPEGs
node scripts/render.mjs my-book --lang es --out /tmp/my-book.pdf            # + the PDF (print checks)
```

Each call loads the engine afresh (a few seconds): use it at milestones for its
`NOTE` and `PARSE` lines, or for the loop when the executable cannot be had.
`SANDBOX-WARN` lines (heading hierarchy, design anchors, placeholders, parity; loose lines with
`--show-loose`) come only with `--repo /path/to/postext`, a Postext checkout with `packages/postext-sandbox`
built; the npm tools give none. `render.mjs` does not read a font family's `fallback`: a family with empty
`variants` is measured with a stand-in face and listed as not bundled, so check a plain bundle with `postext
check` / `composed_check.py`.

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

An SVG decoded with `loadImage` is a bitmap of the size the SVG declares,
and `drawImage` stretches it: a figure placed larger than its file says
comes out soft. `render.mjs` gives each SVG image the size it is drawn at
before every draw (`sizeSvgImage` and `drawsSvgAtSize` in its `--jpeg`
block, wrapped around both canvases above), recolours the markup of a
book with `diagramStyle.singleInk` and registers a video's poster: copy
those lines, or run the script.

### What the log says

- `layout: N pages, converged=true`: `converged=false` means the TOC or page
  labels did not settle. Look for a heading design that changes height with
  the number, or a TOC that pushes pages.
- `PARSE unclosedMath|unclosedContainer`: a stray `$` or a missing `:::`.
- `WARN calloutOverflow`: a keep-together box does not fit a column. Set
  `keepTogether: false`, shorten it, or change the box's span.
- Nothing warns when a **fixed** callout (`placement: "fixed"`) cannot take
  its place and moves to the next page (it met another fixed box, a float, a
  page-span box or the column's text; playbooks J2): check the page count
  and the page of every placed box against the source.
- `WARN afterText` (postext ≥ 1.25): a `span: "side"` box or a side figure
  stands on a page with no text, because its chapter ended while it waited
  for room in the side column. Fence it earlier or shorten it.
  `WARN unplaced`: a box or float is on no page (a side box in a section
  whose layout has no side column): change its span or the section's layout.
- `WARN shortListSplit` / `WARN openerFloat` (postext ≥ 1.28): the two
  composition rules set to report. A short list is cut between columns
  (`bodyText.shortListSplit`), or a float stands on a chapter or part
  opener page (`layout.openerFloats`). Set the rule to `"avoid"` to have
  the engine keep the list whole or move the float past the opener page;
  a `shortListSplit` left under `"avoid"` is a list taller than a column.
- `WARN unknownResourceId|unknownDirective|malformedEmbed|unknown…Style|raggedTableGrid`
  (releases with engine content warnings): a reference, `:::` line, `::resource`
  line or style id the engine could not resolve, or a table whose merged cells
  left the grid irregular. Each line says what the output does instead; fix the
  source at the reported file and line.
- `WARN fullwidthMarkup|attributeKeyInvalid` (Chinese sources): markup typed with a
  Chinese input method (`：：：` fence, `＃` heading, `［＾…］` footnote, `｛…｝` attributes,
  `＊＊…＊＊`) is set as text, and an attribute key outside ASCII (`作者=曹雪芹`) is
  dropped. Retype the ASCII form the warning names; keys are ASCII, values any script.
- `WARN tocGroupSplit` (postext ≥ 1.34): a kept block of the contents (`toc.groups`, `:::toc{keep}`) ran
  over several columns: it is taller than a column, or its column is short (a page-span box, a float).
  Fewer levels, a lower `toc.groups.head`, smaller or tighter entries; or accept it (the head row repeats
  with its continuation mark).
- `PROBLEM font families used but not bundled`: add the files to `fonts[]`.
- `WARN raggedLine` (postext ≥ 1.28.0): a line of a justified paragraph was set ragged because its word
  spaces would have stretched past 3× (the message gives the ratio). The line that cannot take the next word
  has too few spaces: reword it, or give the long word or address after it a place to break (a soft hyphen,
  U+200B in an address). `VDTLine.raggedSpaceRatio` marks the line. A paragraph the engine set one line
  shorter to take up a runt is not a warning: its block carries `runtFix: { tracking }` (thousandths of an
  em; at `bodyText.maxRuntTracking` the paragraph reads tight, so cut or add a few words).
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
- `CONFIG contentInConfig` (postext ≥ 1.34): a design text holds the book's text, one warning per owner:
  `headingStyles[3] (lesson-4): 30 design texts hold 1017 characters of content ("…") — move the text into
  the Markdown and keep only placeholders in the design`. `--json` adds `path` (owner), `ownerId`, `count`,
  `chars` (letters and digits left once the allowed phrases are out), `elements` (the first 20 paths,
  `headingStyles[3].header.elements[12]`) and `value` (a sample). The same count as `preset_kit.py lint`.
  Fix: the text into the Markdown (a heading, a callout, a paragraph, a heading attribute printed with
  `{attr.key}`); only form phrases (book title, journal, publisher, licence line) in
  `checks.contentInConfig.allow`; never raise `maxWords`/`maxChars`.
- `CONFIG template…|frame…|group…|labelStyleUnknown` (postext ≥ 1.34, page templates, configuration.md
  §19g): `path` is a JSON pointer (`/pageTemplates/3/frames/2/style`; an inherited field points at the
  template that wrote it; `labelStyleUnknown` at `/resources/<i>/anchors/<j>/style` with `resourceId`).
  `templateDuplicate` (rename or delete one), `templateExtendsCycle` (`value` "a → b → a": remove one
  `extends`), `templateExtendsUnknown` (fix the id; see `suggestion`), `frameDuplicate` (one entry per
  frame name, inherited ones included), `frameStyleUnknown` (fix the id or add the callout style),
  `frameAnchorUnknown` (anchor to an existing frame or group, or break the loop; decoration elements too),
  `frameMinMax` (`value` "minHeight 40mm > maxHeight 30mm", `used` what the frame takes),
  `groupFrameUnknown`, `groupFrameTwice`, `frameChainLoop` (end the `next` chain),
  `overflowTargetUnknown` (`'#frame'`, `'next-page'`, `'template:<id>'`; also `next` and
  `overflowTemplate`), `labelStyleUnknown`. A misspelt key gives `unknownConfigKey` with `suggestion`; a
  wrong word `unknownConfigValue`. Fix every one before handing a port back.
- Composed pages (postext ≥ 1.34, document-format.md §12.2): `WARN templateUnknown` (`template="…"` names
  no `pageTemplates` id, or the fence has none: fix the id or add the template); `WARN slotUnknown` (a slot
  names no frame of the template, inherited and variant frames included; the content goes to the flow
  frame: fix the name or add the frame); `NOTE slotEmpty` (info: a frame gets nothing on that page; write
  its content or mark the frame `optional: true`; chain targets are never reported); `WARN
  pageFenceLength` (`:::page{template=…}` with three colons, read as a comic page: use four);
  `unclosedContainer` with `composedPage` (no closing fence of the same colon count: "a ::::page is never
  closed by a fence of as many colons"); `WARN spreadMismatch` (postext ≥ 1.35: the fence's `spread`
  and the template's disagree; the template decides). On 1.34.0 the content of a composed page is set
  in the running text on pages of its own: judge the warnings, not the page images.
- `WARN frameOverflow` (postext ≥ 1.34.1; proposals from 1.36.0): a frame's content does not fit after
  the reflow ladder (free space, the group pushing and yielding, pictures down to `fit.imageMinScale`,
  the group's frames down to `minHeight`, text down to `fit.minScale`, then `overflow.continueIn`; from 1.38 a
  frame that can go on to another page goes on right after the group's frames gave way, before its pictures
  and text shrink); paged output cuts the rest at the frame's foot. An empty frame cut below its `minHeight`
  or fixed height (an answer space) is reported too (1.38). `--json` `data`: `template`, `frame`, `locale`, `overflowMm`, `configPath`, `stepsTried`,
  `scale`, `imageScale`, `proposals` (`{kind, path, value}`: `allowShrink`, `raiseMax`, `lowerMin`,
  `continueNextPage`; `useTemplate` and `shortenText` carry a Markdown range). Take the proposal that
  matches the design: `raiseMax`/`lowerMin` when the page has room, `allowShrink` only within the house
  minimum, `continueNextPage` for a box the source continues, `shortenText` last. A longer translation
  is the usual cause: fix the template's limits for every edition.
- `WARN frameContinuationLimit` (postext ≥ 1.37): a frame went on over 16 added pages and was cut; its
  frame on the added pages is far too small (an `overflowTemplate` with a larger one), or the box
  belongs in the running text.
- `WARN continueTargetMissing` (postext ≥ 1.38): a frame's `overflow.continueIn` is `'page:<id>'` and no
  `::::page{id="<id>"}` comes after the page the story is on (misspelt id, the `{attr.sigue}` attribute
  missing from the fence, or the fence comes before). `--json` `data`: `template`, `frame`, `target`,
  `configPath`, `before`. The rest went on on the next page. Fix: give the later fence that id, or correct the
  name; jumps go forward, within the chapter file or (≥ 1.41) into a later one.
- `WARN labelAnchorUnknown` (postext ≥ 1.37): a `::label` names an anchor its figure's resource lacks; it
  is not drawn (`known` lists the anchors). `NOTE anchorUnlabelled`: an anchor with a label style has no
  word in this edition (a missing translation, or take the style off).
- `WARN labelOverlap` (postext ≥ 1.39): a label runs into an earlier one by more than 12 % of the smaller
  line height (a label with a plate counts as its plate). The later label in the order written carries it,
  with its text, anchor, the first label it meets (`with`, `withAnchor`), how many it meets in all (`count`),
  locale, page and source range. Per edition: a translation with longer words shows where it needs room.
  Fix: move an anchor, narrow the anchor's `width` so the name wraps, or shorten the words in that
  edition's Markdown. `WARN labelOverflow` (≥ 1.39): a label is still wider than its anchor's `width` at the
  style's `minScale` (`text`, `anchor`, `widthPct`, `scale`). Fix: widen `width`, shorten the word, or lower
  `minScale`. Run `postext check --json` for every language of a map; `composed_check.py` fails on
  `labelOverflow` and lists `labelOverlap` between two labels as a note. From 1.42 an anchor or a label style
  with `overlap: "allow"` is left out of the check (names the source prints touching), and a label that runs
  onto one of the picture's `avoid` zones (the map's dots and icons) carries `withSymbol` (1-based) and
  `with: "symbol N"` (`count` = zones met): `composed_check.py` fails on that one, since the symbol is a point
  the source keeps clear (move the anchor, or `overlap: "allow"` when the label is meant to touch its dot).
  The contrast check skips a label bare on the picture
  (give a busy ground a halo or a plate); part palettes, the contrast check and the print preflight read
  label colours.
- `WARN figureWordsShared` (postext ≥ 1.42): a later `:::figure` of a resource says other `alt`, `caption` or
  `note` than the resource's first figure of the chapter (or words the first left unsaid), and a resource has one
  set of words per chapter, so the later words are not shown (`resourceId`, `words`; source range on the dropped
  `::caption[...]` or attribute). Fix: declare a second resource on the same `fileId` (new id, its own anchors if
  it has labels) and give that figure the second resource; it takes its own number in the type's sequence.
  `lint_project.py` raises it before the build and `composed_check.py` fails on it.
- `WARN calloutStyleExtendsUnknown` / `calloutStyleExtendsCycle` (postext ≥ 1.39): `calloutStyles[i].extends`
  names no style, or the chain loops (`a → b → a`); the style stands alone, without the parent's fields.
  `lint_project.py` reports both before the engine does.
- `WARN dropCap` reason `inBox` (postext ≥ 1.38): a drop cap asked inside a `:::callout` is not set (a frame
  of a composed page is running text and takes it). Reason `split` (≥ 1.39): a paragraph whose piece with the
  initial has fewer lines than the initial sinks and goes on in another piece: the frame is too short for the
  initial's lines (raise it or lengthen the frame; the engine moves the paragraph whole to the next frame when
  it can). `WARN pictureBelowPrintSize` (postext ≥ 1.37): a bitmap
  with a print size (its own `resolution`, or `layout.bitmapResolution`) is held at under half of it by a column
  narrower than the text block; a one-picture page ported as a `:::figure` in the flow wants
  `layout.layoutType: 'single'`, `placement: { position: 'top', span: 'page' }` or a composed-page frame
  (a picture in the flow is never wider than its column, and a config without `layout` has two). Treat it as a
  real finding when `resolution` came from the source's print size.
- `note emptyCaption` (postext ≥ 1.52): a figure or table prints its label and number alone ("Figure 1.2.")
  because its `caption` is empty. Right for a numbered plate; otherwise the port lost the caption: read it from
  the source. `WARN resourceMoved` (≥ 1.52): a `position: 'here'` figure too tall for the room left in its
  column moved on and left `emptyMm` mm empty on that page (`data.emptyMm` in `--json`); compare with the
  source page, and float it (`position: 'auto'`), narrow it or move its `::resource` line when the source has
  text there.
- `WARN folioMissing` (postext ≥ 1.53): a composed page draws nothing of a folio or running head (a template
  `header`/`footer` text, or a decoration text reading `{pageNumber}`, a running name or `{attr.x}`) that most
  pages of the same template and side draw (`data`: `template`, `elementId`, `slot`, `drawnOn`, `siblings`).
  Usually an `{attr.foot}` the page fence leaves out, or a running name empty on that page: copy the attribute
  from the source page. When the source page prints no folio on purpose (a title page, an opener), put
  `unless: 'x'` (or `when: 'x'`) on the element and `x` on that fence; a page switched off that way is not
  reported. `composed_check.py` fails on it.
- `WARN unknownMarkStyle` (postext ≥ 1.34.1): `:mark[…]{style}` names no `markStyles` id; the first style is
  used. `WARN comicPanelFrame` (postext ≥ 1.38): `unknownBox` (`box` names no callout style), `textOverflow`
  (a `::panel{text}` body is taller than its frame, `overflowMm`), `strip`/`spread` (raised
  only before 1.40: a text panel where frames took no text, its words set after the comic) and `flow` (only before
  1.39: a right-to-left or vertical edition).
- Contrast (postext ≥ 1.37): on a composed page the check follows the paint order: frame text stands on its
  frame's own box, else on the template `decoration` box under it, else on the paper; text over a decoration
  picture is skipped. White tab lettering in a frameless frame over a coloured decoration box is measured
  against that box, so a port needs no frame background to quiet a «#ffffff on #ffffff» report; the
  decoration's own texts are checked too.
- `WARN textWrap` reason `noContour` (postext ≥ 1.36): a `wrap: 'contour'` picture has no known shape (no
  alpha channel, no `contour.points`); the text ran round its box.
- `reflow p. N (template): dinero grew 8 mm; gasto moved down 8 mm` (postext ≥ 1.35; `--json` `reflow[]`):
  what the layout changed from the template's drawing. Empty on the source's own text when the
  template matches it; a box that grew there means its `minHeight` is short of what the book's fonts
  need. `text at 92.5 %` / `picture at 80 %` (1.36) and `continued on page 9` (1.37) per edition go in the
  report.
- **Composed pages, all at once**: `python3 scripts/composed_check.py check my-book [--stress 1.3]` runs
  `postext check --json` and `postext html` for every edition and fails on the warnings above, on
  `contentInConfig`, `tocGroupSplit`, template warnings, `unknownConfigKey` and `unknownConfigValue`, and
  on a page whose frames the HTML reads in another order than the Markdown; every other warning prints as
  WARN. `--json-out work/check.json` saves the result and keeps the report and the exit code, and
  `preset_kit.py pack` refuses while that result failed (SKILL.md §8). It warns when editions read a page differently and on each
  frame scaled as written (`frameScaled`). `--stress 1.3` repeats each edition with the text 30 % longer (the Cookbook bench's C38): a
  page must rearrange or go on; a `frameOverflow` with valued proposals warns, any other new warning
  fails (composed-pages.md §7). From postext 1.48 it also fails on `frameCovered` (a frame's lines,
  tab or pictures under an opaque frame painted after it) and `frameOutsideArea` (text past the trim,
  ink past the bleed, a frame past the frame or group it is anchored inside), printing the engine's
  fixes, and ends with `overlaps: N`: close a port at 0. An overlap the source prints is `overlap:
  "allow"` on the frame or an entry with its reason in the project's `composed-check.json`
  (composed-pages.md §6.18); `compare_pages.py --score --check` fails the likeness score while one
  remains. It also fails on frames that lay out nothing of their own (`emptyFrame`: the Sandbox's
  «Write here» placeholder, which no render shows) and warns on every frame set smaller at the text as
  written (`frameScaled`: fix the measure, not `fit.minScale`). A missing `postext`, or one older than
  1.53.0, stops the check (exit 2) or warns, with the fix `npm i -g postext-cli@latest`; global npm
  packages stay with the Node they were installed for, so after nvm switches its default Node, install
  it again. Passing the check does not mean the pages are right: review every page side by side
  (SKILL.md step 7, §3 below).
- `CONFIG cjkGridClamped`: `cjk.grid` asked for more characters or lines than the margins leave room for.
- `CONFIG fontFamilyStack`: a `fontFamily` (or any `…FontFamily`) holds a CSS stack (`'EB Garamond',
  Georgia, serif`); the text is set in the first family only (canvas, HTML and PDF embed one face per
  family, with no fallback). Write one family name.
- `CONFIG sideColumnPercentClamped`: a `oneAndHalf` `sideColumnPercent` that would leave a column with
  no width (or is not a number); `used` is the percent applied (path names the heading style when its
  own `layout` sets it). `CONFIG columnCountClamped`: `multiple` with `columnCount` outside 3–8.
- `CONFIG unknownNumberFormat`: a list `numberFormat`, `page.pageNumbering.format` or a resource
  `counterFormat` in no known spelling; it numbers in decimal.
- `CONFIG unknownNumerals`: `numerals` other than `auto`/`latn`/`arab`/`arabext`; the digits follow
  `locale` (`used`).
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
  compounds' hyphens, ragged breaking, split under a heading, space under paragraph containers;
  below 18, mark styles with no `borderRadius` rounded at 0.2em when the text has a `:mark`; below 19,
  formatted text broken after a slash only inside a web address; below 20, a notation fence read as code; below 21,
  each `localized.<lang>.config` replacing the shared top-level keys it names; below 22, the HTML viewer set line
  by line unless the config names `htmlViewer.optimalLineBreaking`).
  Set `"configVersion": 22` and check the pages again when the config is meant for today's rules.
- Run each language (`--lang`).

## 3. Compare with the source, page by page

`compare_pages.py` takes the render as a PDF or as the `--jpeg` folder
(`--render-pages` then counts layout positions, as the file names do).

```bash
python3 scripts/compare_pages.py source.pdf /tmp/my-book.pdf \
    --source-pages 23-40 --render-pages 1-18 --out /tmp/cmp --sheet
```

While you work, keep the pairs current with `--watch`: it runs beside the
watcher of the work loop and, each time a page image changes, writes that
page's pair and score again (only the pages whose images changed), and
prints one line per refresh:

```bash
postext build my-book --locale es --images /tmp/pages --pages '#12-#15' -f png --dpi 60 --watch > /tmp/watch.log 2>&1 &
python3 scripts/compare_pages.py source.pdf --watch /tmp/pages --source-pages 23-26 --render-pages 12-15 \
    --out /tmp/cmp --score /tmp/score.json > /tmp/cmp.log 2>&1 &
```

Edit a chapter, wait for the next `refreshed` line in `/tmp/cmp.log`, open
`/tmp/cmp/pair-NN.png`. `--render-pages` takes the numbers in the file
names (positions in the layout, hence `'#12-#15'` for the build). Stop both watchers when the
pages are right (by their PIDs: `kill %1 %2`).

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

Composed pages (textbooks, workbooks, magazines) need **every** page
looked at, at 80 dpi or more (`--dpi 80`), with SKILL.md step 7's list:
tabs and their icons, captions beside the right pictures, list spacing,
box heights and feet, art across a box's or a card's edge, map keys and
scale bars, label colours, empty frames and shrunk text. Every automatic
check can pass on a page that reads wrong, and the `--score` likeness can
improve while a caption moves beside the wrong photo: the score finds
regressions, the review accepts a page.

### Attribute by attribute: `port_audit.py`

The eye misses what a reader of the printed page finds: an en space set as a
word space, a synthetic italic read as roman, capitals where the source has
small capitals, a bullet a size too small, a cell centred in the source and
flush left in the port, a grey folio printed black. `port_audit.py` reads the
text of both PDFs, matches the source's words to the port's by their
content (line breaks and case aside) and compares, pair by pair: special
spaces (and two glued words broken across lines), italic (a sheared upright
face counts as italic), bold, small capitals, bullet size and weight (and a
missing bullet), the alignment and weight of ruled table cells, and the
colour of the head and foot margins (folios, running heads) and of the text:

```bash
postext pdf my-book --locale es -o /tmp/port.pdf
python3 scripts/port_audit.py source.pdf /tmp/port.pdf --source-pages 23-40 --port-pages 1-18 \
    --json /tmp/audit.json --md /tmp/audit.md
```

The report counts the gaps per attribute and per source page (a run of
words with the same gap counts once) and lists each with both pages, the
words and both values. Fix each at its cause (the draft, the config, the
chapter), or name it in the delivery report as a choice or an engine limit.
`--strict` exits 1 while any remains. Check the matched share first: under
half means the two page ranges do not cover the same stretch of the book.
Horizontal text only; synthetic bold (a stroked fill) and the colours inside
pictures are not read.

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

Open the project in the sandbox: import the `.postext` (`preset_kit.py pack
--manifest-only`), or serve the presets folder. A bundle in several languages
is kept whole by the new book from postext 1.39 (each edition named by `localized.<lang>.name` from 1.34.1,
#891, else by the manifest `name`; switch from the Books row or the edition bar; permalink `#project=ID&lang=L`).
Before 1.39 the import asked which one to keep and held that edition only: import each edition to check it, or open
the bundle as a preset or bundle instead. The Checks panel's Composed pages section lists every composed-page
warning per edition with its locale, page and frame, and «Side by side» aligns two editions (composed-pages.md §7). From 1.40 the WebMCP tool `sandbox_get_composed_checks` lists the same checks of every edition (`language` keeps one), and a book with more than 48 chapter layouts shows the chapter on screen with a **Check every edition** button instead of laying every language out unasked.
Check the canvas, the HTML viewer, the Folio
tab (the book bound, on its `config.folio` paper: cover, spine image,
`:::paper` plate sections, thickness) and the PDF tab. The sandbox shows its own warnings panel: loose lines, heading
hierarchy, design anchors and placeholders, parity issues. The PDF tab's
output is the reference; headless metrics can differ slightly.

### Driving the Sandbox from an agent (WebMCP)

With a browser it can script (Claude in Chrome, Chrome DevTools MCP, Puppeteer, Playwright), an agent checks the
bundle in the real Sandbox, with the Sandbox's own measure (`shapingLanguage: 'document'`) and its extra checks
(loose lines, heading hierarchy, placeholders, parity), which `postext check` does not give. Open
`https://postext.dev/en/sandbox`. The page registers 41 `sandbox_*` tools on `document.modelContext` (WebMCP) and on
`window.postextWebMcp` in every browser:

```js
await page.waitForFunction(async () => (await window.postextWebMcp?.executeTool('sandbox_get_state', {}))?.ready);
const run = (name, args) => page.evaluate(([n, a]) => window.postextWebMcp.executeTool(n, a), [name, args]);
await run('sandbox_import_book', { file: { base64: b64, fileName: 'my-book.postext' }, language: 'es' }); // inspect: true lists its languages only
await run('sandbox_get_warnings', { scope: 'book' });               // the Checks panel: kind, category, chapter, line, offsets, page
await run('sandbox_render_page', { chapter: 3, page: 41, count: 2, width: 1200, format: 'jpeg' }); // { content: [json text, image parts (base64)] }
await run('sandbox_get_composed_checks', {});                       // every edition (`language` keeps one)
await run('sandbox_export', { format: 'pdf', scope: 'book', deliver: 'data' }); // pdf|epub|postext|docx|markdown|config; `epubLayout: 'reflowable'`
```

- Every tool waits for the layout before it answers and gives each chapter's page count. Answers are `{ ok, … }`
  or `{ ok: false, error }`; misspelt arguments are refused with the right names.
- Trying a design value: `sandbox_set_config { changes: [{ path: 'bodyText.fontSize', value: '10.5pt' }] }`, look,
  then `sandbox_undo`. Copy the setting that works into `build_preset.py`: the Sandbox copy is not the source.
- A book in several languages: `sandbox_get_config` and `sandbox_set_config` take `scope: 'all'` (the general
  settings every edition reads) or `scope: 'edition'` (the edition on screen; open another with `sandbox_open_book
  { language }`). Left out, it is the Design panel's scope. `get_config` answers `ownFields`, the paths the edition
  sets itself; `set_config` with `scope: 'all'` answers `keptBy`, the languages that set the field themselves and
  keep their value. Try a page, grid or style value with `'all'`, a face or a left/right side with `'edition'`, and
  copy it into `config` or `localized.<lang>.config` of `build_preset.py` to match (project-format.md §2).
- A fresh browser profile has empty storage: the import makes a new project there, and nothing reaches the user's
  own browser.
- `sandbox_import_word` (`dryRun: true` first) runs the Word import of sources.md § Word in the Sandbox.
- `sandbox_remove_chapter`, `sandbox_delete_resource`, `sandbox_delete_book`, `sandbox_reset_to_original`,
  `sandbox_import_word` and `sandbox_answer` cannot be undone; do not call them on the user's own books unless asked.
- Full list and arguments: https://postext.dev/en/docs/webmcp

If you cannot open a browser, say so and hand the user the `.postext` and
the page images instead of claiming the port is visually verified.

## 5. Print checks (when the PDF is the deliverable)

- `postext check my-book --preflight` (or the PREFLIGHT lines of
  `render.mjs`): low-resolution pictures, hairlines, small text in several
  inks, ink over the limit, text near the trim, page by page.
- `pdffonts out.pdf`: every face embedded. A `.otf` (CFF) face reads `CID Type 0C`
  (postext-pdf ≥ 1.70.5); `CID TrueType` for a CFF face means an older
  postext-pdf, or a CID-keyed face (Source Han, Noto CJK `.otf`): use its
  TrueType build when the file goes to a printer.
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
| Figure lands pages after its citation | `citingPage: true` (≥ 1.25, top/auto floats) to head the citing page; `position: "auto"` (the foot of the citing page); check the sequence order (floats never overtake); a float cited on a chapter's first page or after a break goes to the next page |
| Box placed whole where the source runs text around it | floated box (`placement: "auto"`/`"top"`), fence right after the citing paragraph |
| Box cut or overflowing | `keepTogether: false` + `splitMinLines`; floats yield to keep-together boxes |
| A box, label or diagram that must sit at the source's position | a fixed callout style per position, a text-free image element with `resourceId: "{attr.…}"`, or a live-text SVG resource (playbooks J); never text in a design element |
| Config of several MB, a heading style per page | content in the config: `preset_kit.py lint` lists it; one style per kind of page (playbooks J7–J8) |
| Only the heading of a section fits at a column foot | it moves on by itself (a heading never closes a column); check `keepWithNext` |
| Over-stretched justified lines (URLs, long compounds) | the engine sets those lines ragged; break URLs with `/`; add soft hyphens (U+00AD) |
| Word overflowing a table cell | the engine divides it; widen `columnWidths` |
| Numbered list drifting off the grid | restate list margins in pt/grid units for both list types |
| Text in a figure in the wrong font | the bundle must hold the family its `font-family` names, spelt the same (or Google Fonts or Fontsource must have it, for the Sandbox and the command line); Checks shows `svgFontUnavailable` (≥ 1.25 embeds the faces itself) |
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
| The plain bundle (licensed faces left out) overflows every twentieth frame and fills the report with `missingFont` | the family has no file and no stand-in: set `fonts[].fallback` to an open family of about the same width (postext ≥ 1.42; `fonts.py width`, `preset_kit.py pack --fallback`), and check the bundle that carries the faces for the final PDF |
| A vertical book's spreads read left to right in the PDF viewer | Chrome's viewer ignores `/Direction /R2L`; Acrobat and Foxit follow it |
| Comic picture shown whole with bands (`comicPanelLetterbox`) | the cell's shape leaves the safe area: change the split, shrink the safe area, or `fit=contain` + `bg` on purpose |
| Balloon on a face, or below its speaker | mark the face (`anchors[].face`) or an `avoid` zone; give the panel's top more room; pin with `at=` |
| Balloons of one speaker merged into one outline when the source has two | `join=false` on the second line |
| Manga panels read left to right | `comics.artDirection: 'rtl'` (or the page's `direction=rtl`); never reverse the split by hand |
| Spread's panel 1 on the second page | the book's binding: a right-to-left comic in a left-bound book; give the config a `comics` section and leave `page.binding` on `'auto'`, or set `'right'` |
| Lettering too small on an A4 album | `comics.lettering.fontSize` (default 7.5 pt): 9–10 pt |
| A box of a composed page does not grow, the boxes under it do not move | put the boxes in a `stack` group and give each its drawn height as `minHeight` (`height` `auto`), not a fixed `height` |
| A translation overflows a box that fits in the source language | `maxHeight` up to what the page absorbs, `fit.minScale` (≥ 0.9), `overflow.continueIn: "next-page"`; take `frameOverflow`'s proposals; never a smaller font for one edition |
| A screen reader reads a box before the page's text | the Markdown order inside the `::::page`: text first, each box then its pictures |
| A frame's tab prints no words | the frame's callout style needs a `label` block; the words are the fence's `label="…"` |
| A titled box loses the heading design of its title | heading designs are not drawn inside frames yet (#906): make the title its own styled frame |

Accept remaining deviations explicitly and list them as known gaps, for
example a paragraph the source wraps around a box, or a caption set 1–5 %
tighter. Do not tweak individual line breaks.
