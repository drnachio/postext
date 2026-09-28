# Postext configuration manifest (`PostextConfig`)

The `config` object of `preset.json`: everything visual about the book. Written
for an agent reproducing the design of an existing publication. Checked against
the engine source (postext 1.2); where the online docs disagree, this file is
right (§22 lists the differences).

- There is **no runtime validation**: unknown keys are silently ignored (real
  presets carry dead keys such as `tableStyle.bodyLineHeight`, which do
  nothing). Run `scripts/lint_project.py` to catch the dangerous mistakes.
- Every section is optional; an unset field takes its default. Write only what
  differs from the defaults, but see the traps below: some defaults vanish as
  soon as a section is present.
- Resolution order: palette flattening → bodyText (with `locale`) → headings →
  lists (inherit bodyText) → page → layout → tables → captions → diagrams →
  paragraphStyles → calloutStyles (inherit bodyText/headings/lists) → chips →
  math → header/footer → parts → headingStyles → toc. In a bilingual project,
  `localized.<lang>.config` replaces whole top-level keys before this runs.
- Baseline grid pitch = `bodyText.fontSize × bodyText.lineHeight` (em) or the
  absolute `lineHeight`. Everything snaps to it.

---------------------------------------------------------------------------------

## 0. Primitive types (read this first)

### Dimension
```ts
{ value: number, unit: 'cm' | 'mm' | 'in' | 'pt' | 'px' | 'em' | 'rem' }
```
Conversion at `page.dpi` (default 300):
- `cm` = value/2.54·dpi, `mm` = value/25.4·dpi, `in` = value·dpi, `pt` = value/72·dpi.
- `px` = **device pixels at page.dpi, NOT CSS px** (at 300 dpi, 1px = 1/300 in). Avoid `px` in presets.
- `em` / `rem` = value × a base font size supplied by the caller. `rem` is treated exactly like
  `em` (same base) — it is NOT the root/body size unless the caller passes the body size.
- **Hard rule: fields with no font context THROW on em/rem** (`dimensionToPx` requires a base).
  Always use absolute units (mm/pt/cm) for: `page.width/height/margins`, `cutLines.*`,
  `baselineGrid.lineWidth`, `layout.gutterWidth`, `columnRule.lineWidth`, `bodyText.fontSize`,
  every `headings.levels[].fontSize`, design-element `fontSize`, design `placement.offset.x/y`,
  `advancedDesign.minHeight`, rule `thickness`. Safe rule for an agent: **use mm for geometry,
  pt for type sizes and hairlines**, em only where listed below as "em = X".
  (Verified: em in `bodyText.fontSize`, `layout.gutterWidth` or a design `offset.y` makes
  `buildDocument` throw `dimensionToPx: baseFontSizePx is required for unit "em"`.)
- em bases (where em is allowed):
  - bodyText.lineHeight / firstLineIndent → body font size. (`lineHeight` in em = multiplier; pt = absolute leading.)
  - headings level `lineHeight`, `marginTop`, `marginBottom` → that heading's font size.
  - lists (`gap`, `indent`, `marginTop/Bottom`, `itemSpacing`, `bulletFontSize`, `verticalOffset`) → body font size.
  - math margins → body size × `math.fontSizeScale`.
  - callout everything (padding, stripe width, icon size, gaps, margins, radius, label sizes) → the callout's **body** font size.
  - chip box dims → chip font size; chip `fontSize` em → surrounding text.
  - caption `gap`, `padding` → caption font size; `note.fontSize` default = 0.85 × caption size.
  - table `cellPadding`, `borderRadius` → table body font size.
  - paragraphStyles `lineHeight` → the style's own font size; other em → style font size.
  - toc entry dims → entry font size.
  - design text `letterSpacing`, `paragraphIndent`, `dropCap.gap`, `box.padding` → the element font size.

### ColorValue
```ts
{ hex: string, model: 'hex' | 'rgb' | 'cmyk' | 'hsl', paletteId?: string }
```
- `hex`: `#rrggbb`, `#rrggbbaa` (alpha ok, e.g. debug overlays), or `'transparent'`.
- `model` is intent only (PDF may keep CMYK intent); rendering uses `hex`.
- `paletteId`: link to `colorPalette[].id`. When the id exists, the palette entry's hex/model win;
  otherwise the inline hex is the fallback. Palette links are what `:::part{palette=…}` and
  `headingStyles[].palette` recolour (§14, §16). **Always write a sensible `hex` too.**

### ColorPaletteEntry
`{ id: string, name: string, value: ColorValue }` (value without paletteId).

### Built-in defaults you inherit implicitly
- Main colour: `{ hex: '#295AA3', model: 'hex', paletteId: 'main-color' }`.
  Defaults of heading colour, bold/italic/reference colour, bullets/numbers, callout
  title/stripe/icon/marker/label, chip border, caption bar, diagram ink all point to `main-color`.
  **If you define `colorPalette`, include an entry with `id: 'main-color'`** (set to the book's
  accent) or every such default stays #295AA3.
- Body text colour default: `{ hex: '#000000', model: 'cmyk' }` (not palette-linked).

---------------------------------------------------------------------------------

## 1. Top level — `PostextConfig`

| key | type | default | notes |
|---|---|---|---|
| `page` | PageConfig | §2 | trim size, margins, bleed/cut marks, grid overlay, folio format |
| `layout` | LayoutConfig | §3 | `single` / `double` / `oneAndHalf` |
| `bodyText` | BodyTextConfig | §4 | also H&J, KP, widows/orphans/runts |
| `headings` | HeadingsConfig | §5 | per-level typography, chapter openers, **column balancing** |
| `headingStyles` | HeadingStyleConfig[] | `[]` | §6 named heading/section styles |
| `header` / `footer` | DesignSlot | built-in running head / centred folio | §7 (`{elements: []}` = none) |
| `parts` | PartsConfig | §8 | `:::part` divider pages |
| `toc` | TocConfig | §9 | what `:::toc` prints |
| `unorderedLists` / `orderedLists` | … | §10 | |
| `paragraphStyles` | ParagraphStyleConfig[] | `[]` | §11 `:::paragraphs{style=…}` |
| `calloutStyles` | CalloutStyleConfig[] | `[{id:'note',name:'Note'}]` | §12 `:::callout{type=…}` — declaring replaces the default list |
| `chipStyles` | ChipStyleConfig[] | `[{id:'chip',name:'Chip'}]` | §13 inline `:chip[…]{style=…}` |
| `resourceTypes` | ResourceType[] | Figure + Table in the document language (`locale`, else the hyphenation locale; English for other languages) | §15 numbering, caption prefix, default placement |
| `tableStyle` | TableStyleConfig | §16 | document table style |
| `tableStyles` | NamedTableStyleConfig[] | `[]` | §16 per-table via `resource.table.styleId` |
| `captionStyle` | CaptionStyleConfig | §17 | + per-type overrides |
| `diagramStyle` | DiagramStyleConfig | `{singleInk:false}` | §18 |
| `math` | MathConfig | §19 | |
| `footnotes` | FootnotesConfig | §19a | `[^id]` notes: placement, numbering, type, rule |
| `index` | IndexConfig | §19b | what `:::index` prints: type, indents, separators, ranges, letter heads |
| `colorPalette` | ColorPaletteEntry[] | `[main-color #295AA3]` | §0 |
| `locale` | LocaleTag (any BCP 47 tag: `'es'`, `'es-ES'`, `'pt-BR'`) | `'en-us'` | document language: hyphenation fallback, built-in resource types and table continuation strings, PDF `/Lang` |
| `customFonts` | CustomFontFamily[] | — | §20 **do not write in preset.json config** |
| `htmlViewer` | HtmlViewerConfig | §21 | screen-only; `overrides` = partial config merged for HTML |
| `pdfGeneration` | PdfGenerationConfig | §21 | outlines, tagging, colour space |
| `debug` | DebugConfig | §21 | editor overlays + warning toggles; no effect on output |

Not configurable (no config exists — don't look for it): margin notes (emulate with
`span:'side'` callouts; footnotes and endnotes are `footnotes`, §19a), a blockquote's own family, size,
leading or alignment (quotes take the body's; colour, italics and indents are `bodyText.blockquote`),
body drop caps (only design text elements have `dropCap`),
table line height (= body leading ratio × table font size), heading hyphenation (off),
per-level heading `textAlign` (only `headings.textAlign`). Document metadata (`{title}`,
`{subtitle}`, `{author}`, `{publishDate}`) comes from the **front matter of the first chapter**,
not from the config.

---------------------------------------------------------------------------------

## 2. `page` — PageConfig

```
page
├─ sizePreset   '11x17'|'12x19'|'17x24'|'21x28'|'custom'   default '17x24' (cm, W×H)
├─ width        Dimension   default from preset (17 cm)    explicit value always wins
├─ height       Dimension   default from preset (24 cm)
├─ margins      PageMargins
│   ├─ top      default 2 cm
│   ├─ bottom   default 2 cm
│   ├─ left     default 1.5 cm   (= INNER/spine margin when mirror:true)
│   ├─ right    default 1.5 cm   (= OUTER margin when mirror:true)
│   └─ mirror   boolean, default false. Odd pages keep left/right as written, even pages swap.
├─ backgroundColor  ColorValue, default {hex:'transparent'}
├─ dpi          number, default 300 (raster resolution + px unit)
├─ cutLines     { enabled=false, bleed=3mm, markLength=5mm, markOffset=3mm, markWidth=0.25pt, color=#000 }
├─ baselineGrid { enabled=false, color=#cccccc, lineWidth=0.5pt }   VISUAL OVERLAY ONLY
└─ pageNumbering { format='decimal'|'lower-roman'|'upper-roman'|'lower-alpha'|'upper-alpha', startAt=1 }
```
Gotchas
- Page 1 is odd (recto). With `mirror: true`, `left` is the spine margin on every page.
- For a custom trim size set `sizePreset: 'custom'` + width/height (width/height alone also win).
- The **baseline grid itself is always on**: pitch = `bodyText.fontSize × bodyText.lineHeight`
  (em) or the absolute `lineHeight`. `page.baselineGrid` only draws it.
- `page.margins` is the body area. Headers/footers live *inside* the margins (they never reserve space).
- If `margins` is given, each missing side falls back to the built-in default (2cm / 1.5cm), not to anything else.
- Mid-document folio changes (roman front matter → decimal from 1) use the `:::numbering` directive
  in markdown, not config. Book mode continues numbering across chapters automatically.
- `cutLines.enabled` expands the sheet by the bleed; design elements anchored to `'bleed'` then run into it.
  The sheet grows by bleed + markOffset + markLength a side; marks start max(bleed, markOffset)
  outside the trim. The PDF gets a TrimBox and a BleedBox, and CMYK output paints the marks in
  registration colour (`/All`). Everything the page paints is clipped to the bleed box (canvas,
  PDF, HTML): only the marks print outside it.

---------------------------------------------------------------------------------

## 3. `layout` — LayoutConfig

```
layout
├─ layoutType         'single' | 'double' | 'oneAndHalf'     default 'double'  (!)
├─ gutterWidth        Dimension (absolute!)                  default 0.75 cm
├─ sideColumnPercent  number (0–100)                         default 33   oneAndHalf only
├─ sideColumnRole     'text' | 'floats'                      default 'text'   oneAndHalf only
├─ sideColumnSide     'right'|'left'|'outer'|'inner'         default 'right'  oneAndHalf only
├─ columnRule         { enabled=false, color=#cccccc, lineWidth=0.5pt }
├─ fitFiguresToPage   boolean                                default false (HTML viewer sets it)
├─ hugClosingFloats   boolean                                default true   closing page: page-wide floats below the last text move up under it
├─ inlineResourceGap  'around' | 'above'                     default 'around'  (a preset without configVersion ≥ 5 reads 'above')
├─ inlineResourceGapInBoxes boolean                          default true  (a preset below configVersion 6 reads false)
└─ boxChildSplitMinLines number                              default 2  lines of a paragraph/item a box cut leaves per side (a preset below configVersion 6 with a :::callout reads 1)
```
Geometry:
- `double`: two equal columns, `colW = (contentW − gutter)/2`.
- `oneAndHalf`: `sideW = contentW × sideColumnPercent/100`; `mainW = contentW − sideW − gutter`.
  So to reproduce a book with main column M mm, side column S mm, gutter G mm:
  `contentW = M+S+G` (= page width − inner − outer margin), `sideColumnPercent = 100·S/contentW`
  (fractional values are fine, e.g. 30.5556).
- `sideColumnSide: 'outer'|'inner'` flips with parity **only when `page.margins.mirror` is true**
  (outer = right on recto, left on verso). Without mirror, outer = right, inner = left.
- `sideColumnRole: 'floats'` = textbook margin column: body text never enters it; it receives
  resources / callouts with `span: 'side'` (stacked beside their first reference; side figures
  stack from the head of the channel on the citing page). `'text'`: text flows main → side column.
- Chapter-opener design containers (`span:'page'` headings) are the **whole content width**
  (main + gutter + side), not just the main column.
- Default is `'double'`: a single-column book must say `layoutType: 'single'`.
- A section can switch layout via `headingStyles[].layout` (e.g. single-column preface in a two-column book).
- `inlineResourceGap: 'around'` (postext ≥ 1.5): an inline `::resource` keeps one line of float gap
  below it as well as above, and the text after it goes back onto the grid under that gap. `'above'`
  is the 1.4 rule: the text resumes at the next grid line, however close. A manifest without
  `"configVersion"` (or one below 5) is read as a 1.4 bundle and gets `'above'` when a chapter
  embeds a resource (project-format.md).
- `inlineResourceGapInBoxes: true` (postext ≥ 1.5): an inline `::resource` inside a `:::callout`
  keeps a line of the box's text above it (and below it with `'around'`); `false` is the 1.4 rule,
  the resource right against the text around it. A manifest below `"configVersion": 6` gets
  `false` when a chapter embeds a resource inside a box. The old workaround `:::space{lines=0.33}`
  around the embed is no longer needed.
- `boxChildSplitMinLines: 2` (postext ≥ 1.5): a box that splits inside a paragraph or list item
  leaves at least 2 of its lines on each side (the style's `splitMinLines` when lower). `1` is the
  1.4 rule, a lone line allowed as long as each side holds `splitMinLines` lines in all. A manifest
  below `"configVersion": 6` gets `1` when a chapter opens a `:::callout`.
- `columnRule` stops under a page-span heading's band (it starts where the text starts). A heading
  style's `layout.columnRule` is drawn on its section's pages; its unset fields take the document's.
- `hugClosingFloats: false` leaves a `position: 'bottom'` float at the foot of a chapter's closing
  page, as on every other page (default: it moves up to sit one float gap under the last text).

---------------------------------------------------------------------------------

## 4. `bodyText` — BodyTextConfig

Typography
```
bodyText
├─ fontFamily        string          'EB Garamond'   Google Font name or a customFonts family name
├─ fontSize          Dimension(abs)  8 pt
├─ lineHeight        Dimension       1.5 em          em = × fontSize; pt = absolute leading → BASELINE GRID PITCH
├─ fontWeight        number          400
├─ boldFontWeight    number          700             weight used for **bold** runs (e.g. 600 for semibold)
├─ color             ColorValue      #000000 (cmyk)
├─ boldColor         ColorValue      main-color (!)  set to body colour for black bold
├─ italicColor       ColorValue      main-color (!)  set to body colour for black italics
├─ referenceColor    ColorValue      = boldColor     colour of inline :ref labels ("Fig. 1.7")
├─ referenceBold     boolean         true
├─ referenceItalic   boolean         false
├─ textAlign         'left'|'justify'|'center'|'right'   'justify'
├─ paragraphSpacing  boolean         false           true = one full grid line between paragraphs (no fractional option)
├─ firstLineIndent   Dimension       1.5 em          set {0,'mm'} for block paragraphs
├─ hangingIndent     boolean         false           indent all lines but the first
├─ indentAfterHeading boolean        true            false = first paragraph after a heading unindented (classic book style)
├─ blockquote        { color=#666666, italic=true, indent=0, firstLineIndent=<body's> }   how `> …` quotes are set (colour palette-linkable; indent = every line, first line counted from it)
└─ hyphenation       { enabled=true, locale=<config.locale ?? 'en-us'>, ragged=false, zone=3em, compounds=true }
                      locale: any BCP 47 tag; patterns for 'en-us'|'es'|'fr'|'de'|'it'|'pt'|'ca'|'nl' (region ignored; other languages → en-us + console warning)
                      ragged: also hyphenate ragged text, only where the word does not fit and sending it down would leave a gap wider than zone (em = text size); line by line ≤ 2 hyphenated lines in a row, with optimalRagged two in a row are only discouraged
                      compounds: false = the dictionary leaves a word with a hyphen between two letters whole; it breaks only after that hyphen (TeX; after- | dinner, never af- | ter-dinner)
```
H&J / Knuth–Plass
```
├─ optimalLineBreaking  boolean  true   Knuth-Plass (false = greedy)
├─ optimalRagged        boolean  true   ragged running text (body, blockquotes, lists, ragged paragraph styles, box bodies, part and section bodies) broken with Knuth-Plass too: even edge, runt rules work;
│                        false = line by line (1.4; a preset without configVersion 7 that sets running text ragged reads false)
├─ breakAfterDashes     boolean  true   a line may end after an em/en dash set closed between words (say—that's, riddles.—I); never after an opening dash (—dijo, said "—Hola), before punctuation, a quote or a bracket (thinking—" and, says—“no”), or inside 1914–1918;
│                        false = 1.4 breaks (a preset without configVersion 7 whose chapters set such a dash reads false)
├─ breakAfterHyphens    boolean  true   Knuth-Plass may end a line after a compound's hyphen (well- | known) in every paragraph;
│                        false = 1.4 breaks: a justified paragraph without formatting never breaks there (a preset without configVersion 8 whose chapters set a compound reads false)
├─ repeatHyphen         boolean  false  the line after a break at a compound's hyphen opens with a hyphen too (vencer- | -se; Portuguese, Spanish RAE 2010); line.repeatedHyphen; never in a URL
├─ maxWordSpacing       number   2      × normal space; also the cap for balancing "loose" paragraphs
├─ minWordSpacing       number   0.6    × normal space
├─ avoidRunts           true;  runtMinCharacters 20;  runtPenalty 1000;  avoidRuntsInLists true
│                        runtMinCharacters counts word spaces, not letters (a space ≈ ½ letter): 2 × N for a last line of N letters
├─ gradedRuntPenalty    false  true = a runt costs runtPenalty × (1 − width/threshold): a two-word ending costs less than one word
├─ tightenRunts         true   re-set a runt paragraph one line shorter (tighter spaces, ≤ maxRuntTracking; refused if a justified line passes max(maxWordSpacing, the paragraph's loosest justified line) or more lines go ragged)
├─ maxRuntTracking      10     thousandths of an em (10 = 0.01em), applied negatively
├─ maxJustifyTracking   0      thousandths of an em, either way: a justified line past maxWordSpacing (or under minWordSpacing) takes letter spacing instead (0 = off; 10 is plenty; needs optimalLineBreaking)
├─ avoidOrphans         true;  orphanMinLines 2;  orphanPenalty 1000;  avoidOrphansInLists true
├─ avoidWidows          true;  widowMinLines 2;   widowPenalty 1000;   avoidWidowsInLists true
├─ slackWeight          10     pressure to fill columns (0 = off)
├─ keepColonWithList    true   paragraph ending in ':' stays with the list it introduces
├─ colonListRoom        'item' room kept under the colon line: 'item' = what the first item needs by the list orphan/widow rules
│                        (a 2-line item kept whole needs 2 lines); 'line' = one line (1.4; a preset without configVersion 6 reads 'line'
│                        when a chapter has a list after a line ending in ':')
├─ hyphenateAcrossColumns true false = re-break a paragraph so the last line of a column (or page) ends on a whole word, within the word-spacing limits (InDesign's Hyphenate Across Column); ragged text set with optimalRagged too (only its line ends move)
└─ paragraphContainerSpacing 'collapse'  space under a :::paragraphs container: 'collapse' = max(spaceBetween, marginBottom,
                         the text's paragraph spacing) merged with the next block's own space above (a heading's marginTop);
                         'add' = 1.4 (style space baked into the grid snap, next block's space added under it; a preset
                         without configVersion 8 that declares a paragraph style reads 'add' when a chapter has :::paragraphs)
```
Gotchas
- Hyphenation only applies when `textAlign: 'justify'`, unless `hyphenation.ragged: true` (ragged text too, within `zone`). Words < 5 chars never break (2 before / 3 after).
- For a Spanish book set top-level `locale: 'es'` (hyphenation follows unless `hyphenation.locale` is set).
- All widow/orphan/runt rules are soft penalties, never hard.
- No-break spaces (U+00A0, U+202F, U+2007) and the word joiner (U+2060) glue their neighbours on every breaker; type the character, not `&nbsp;`. U+00A0 is in practically every face; a face without U+202F/U+2007 gets half a word space / a digit width.

---------------------------------------------------------------------------------

## 5. `headings` — HeadingsConfig

General (apply to all levels unless the level overrides)
```
headings
├─ fontFamily    'Open Sans'
├─ lineHeight    1.2 em            (em = the level's font size)
├─ color         main-color
├─ textAlign     'left'            (TextAlign; general only — no per-level align)
├─ fontWeight    700
├─ marginTop     1.5 em            (em = level font size)
├─ marginBottom  0.5 em
├─ keepWithNext  true              never strand a heading at a column foot
├─ keepWithNextSplit 'rules'       the paragraph under a heading at a column foot splits keeping widowMinLines
│                                  under it and orphanMinLines after, else the heading moves on with it;
│                                  'fill' = as many lines as fit, however few go on (1.4; a preset without
│                                  configVersion 8 whose chapters have a heading reads 'fill')
├─ snapToGrid    true              false = keep exact marginBottom (text may sit off-grid until next snap point)
├─ inlineMarks   true              *it* **b** ^sup^ ~sub~ :smallcaps[] and links print in headings (italic flips:
│                                  upright in an italic heading); false = plain, as 1.4 (a preset without
│                                  configVersion 6 whose headings carry marks reads false)
├─ balancing     ColumnBalancingConfig — see 5.2
└─ levels        HeadingLevelConfig[] — entries matched by `level` (1–6)
```

### 5.1 `headings.levels[]` — HeadingLevelConfig
```
{ level: 1..6,                         REQUIRED
  fontSize: Dimension (abs)            defaults H1 18pt, H2 15, H3 12, H4 10, H5 9, H6 8
  lineHeight, fontFamily, color, fontWeight, marginTop, marginBottom, snapToGrid   → inherit general
  italic: boolean                      false
  letterSpacing: Dimension             0 (tracking after every glyph, spaces and number prefix included;
                                       em = level fontSize; negative tightens; centre/right lines are placed
                                       by their letters, the tracking after the last glyph left out; ignored
                                       when advancedDesign renders the level: design text has its own)
  textTransform: 'none'|'uppercase'    'none' (length-preserving; number prefix kept as written)
  numberingTemplate: string            ''  → no automatic number
  breakBefore: { enabled: boolean, parity: 'any'|'odd'|'even'|'always-odd'|'always-even' }
  span: 'column'|'page'                'column'
  advancedDesign: { enabled: boolean, slot: DesignSlot, minHeight?: Dimension(abs) }
  hidden: boolean                      false → structural heading: prints nothing, takes no room
                                       (in the flow and inside callouts), still breaks / counts /
                                       is listed / bookmarked
}
```
- **H1 page break.** H1 defaults to `breakBefore: {enabled:true, parity:'always-odd'}` (blank
  separator page + recto), and a partial `breakBefore` merges field by field over it
  (`{parity:'odd'}` keeps the break). **postext 1.4 and earlier** dropped it as soon as ANY
  `headings` object was given (levels without an explicit `breakBefore` resolved to
  `{enabled:false, parity:'any'}`), so spell out `levels[0].breakBefore` for chapter openers:
  the project then reads the same on every version.
- `numberingTemplate` tokens: `{1}`…`{6}` = counter of that level, optional style suffix
  `{1:I}` upper roman, `{1:i}` lower roman, `{1:A}`/`{1:a}` alpha, `{1:01}` zero-padded,
  `{1:words}`/`{1:Words}`/`{1:WORDS}` spelled out, `{1:ordinal}`/`{1:Ordinal}`/`{1:ORDINAL}`
  ordinal words (English or Spanish by `locale`, else the hyphenation locale; other languages
  take English); other text literal; `\{` escapes. Empty counters collapse with their separator.
  A heading line's `{startAt=N}` sets its level counter to N instead of advancing it.
  The number is prepended to the title **followed by one space**,
  e.g. `'{1}.{2}'` → "2.3 Title"; `'Chapter {1}.'` → "Chapter 2. Title". It also feeds `{number}`
  in designs (not prepended there) and the TOC. `{chapterNumber}` = the H1 prefix, or the chapter
  ordinal when H1 has no template.
- `breakBefore.parity`: `'odd'`/`'even'` insert one blank if needed (blank belongs to the NEW chapter);
  `'always-*'` inserts a mandatory separator blank (belongs to the PREVIOUS chapter) then parity.
  The very first block of a document never gets a leading blank.
- `span: 'page'` = chapter opener: the heading is set full content width as an **opener band**;
  requires `breakBefore.enabled: true` to matter. Without `advancedDesign` a default text
  (`{number} {titleText}` in the level typography) is synthesised.
- `advancedDesign.enabled: true` → the heading's own text is NOT drawn; the slot must include
  `{titleText}` somewhere. Container: `span:'page'` → x = content-area left, width = full
  content width, y = heading top, height = reserved height; `span:'column'` → the heading's
  block box in its column. Reserved height = max(heading text, design bottom, `minHeight`)
  plus the heading's `marginBottom` (from its style, its level or `headings.marginBottom`; 0.5 em
  by default), rounded up to the grid when headings snap: for a band exactly `minHeight` tall,
  set that `marginBottom` to 0;
  elements anchored to `'page'`/`'bleed'` above the heading don't add height, those reaching
  below it do (a seal at the page foot reserves the page). Not counted: elements with
  `reserve: false` (decoration under the text) and elements that follow the band (container
  middle/bottom anchors, `'fill'` heights, boxes/vertical rules with no height, and anything
  chained to them). Use `minHeight` to push the text down to where the book's first text line
  starts (e.g. 52mm opener). A reservation past the column foot claims the rest of the page
  (in-column: the column), so a full-page cover needs no `:::pagebreak`; one after it is
  harmless (never adds a blank page). In-column designs paint with the heading block and are
  clipped to the column (canvas/PDF): put page-anchored decoration in a `span:'page'` opener.
  A `\\` break in the title is a newline in `{titleText}` in both kinds of design. Under a
  page-span band every column starts like the heading's own: text where text right under the
  opener would start (its marginBottom below its title or design, on the page grid when the level
  snaps; 1.4 set it against the band when a heading followed the opener), a heading or display
  formula level with the first visible heading or display formula under the opener (balancing
  space above that one is not repeated), else with that text; what it snaps lands on the grid.
- Heading slot placeholders: `{titleText}`, `{number}`, `{numberDecimal}`, `{numberRoman}`,
  `{numberRomanLower}`, `{numberAlpha}`, `{numberAlphaLower}`, `{chapterNumber}`, `{chapterTitle}`,
  `{partTitle}`, `{partNumber}`, `{pageNumber}`, `{totalPages}`, `{title}`, `{subtitle}`,
  `{author}`, `{publishDate}`, `{attr.<key>}` (heading-line attribute `# T {author="…"}`,
  falling back to the chapter H1's), `{numberWords}` / `{numberWordsLower}` /
  `{numberOrdinalWords}` / `{numberOrdinalWordsLower}` (the counter in words).
  `{numberDecimal}`…`{numberAlphaLower}` and the words print the heading's counter (its level's
  running count) whatever the template prints — empty on postext 1.4 and earlier (parts only
  there), and on unnumbered headings.
- Headings are never hyphenated; bold inside a heading takes `bodyText.boldFontWeight`, or the heading weight when heavier.

### 5.2 `headings.balancing` — ColumnBalancingConfig (vertical justification)
Defaults:
```
enabled true | maxLinesPerHeading 4 | stretchAfterLists true | maxLinesAfterList 1
stretchAfterFloats true | maxLinesAfterFloat 1 | looseParagraphs true | maxLooseParagraphs 2
trackParagraphs true | maxTracking 10 (‰ em) | trailing true | beforeSpan true
closingBox 'first'  ('first' | 'last' | 'off')
```
Levers in order: box closing a short column pushed to the foot → extra grid lines above headings
(favouring lower level numbers) → after list ends → under top floats → loose paragraphs
(TeX looseness +1, within `bodyText.maxWordSpacing`, optional ≤ maxTracking positive tracking).
`trailing`: level the closing band of a chapter (short last page → equal-height columns).
`beforeSpan`: level the columns a `span:'page'` callout interrupts. `closingBox: 'last'` runs the
box lever after the spacing levers (the box takes only the fraction of a line they leave, so a
box annotating the paragraph above it stays close to it); `'off'` never moves the box. Disable
`enabled` for ragged-bottom books.

---------------------------------------------------------------------------------

## 6. `headingStyles[]` — HeadingStyleConfig

Applied with `# Title {style="id"}`. Two effects: (1) overrides the heading's level fields;
(2) governs the **section** it opens (its pages until the next heading of same or higher level):
running heads, margins, layout, body typography, palette.
```
{ id: string (REQUIRED), name?: string,
  numbered?: boolean = true      false: no counter advance, no number, {chapterNumber} empty (preface, index)
  toc?: boolean = true           listed by :::toc (heading can override {toc="false"})
  runningChapter?: boolean = true  false (H1 only): running heads pass over it and keep the chapter
                                 it interrupts ({chapterTitle}, {chapterNumber}, {attr.*}, h1 marks);
                                 for a plate or a map set as an H1 inside a chapter; the style still
                                 opens its own section (slots, margins, palette) until the next H1
  numberingTemplate?: string     replaces the level's template ('Appendix {1:A}'); counter stays the
                                 level's, so restart it with {startAt=1} on the first heading;
                                 '' prints no number anywhere (no H1 ordinal in the contents or
                                 {chapterNumber} either), though the heading still counts
  // any HeadingLevelConfig field except level:
  fontFamily, fontSize, lineHeight, color, fontWeight, marginTop, marginBottom, italic,
  letterSpacing, textTransform, breakBefore (merged field by field over the level's), span,
  advancedDesign, hidden, snapToGrid
  header?: DesignSlot, footer?: DesignSlot      replace document running heads on the section's pages ({elements:[]} = none)
  margins?: PageMargins                          each side inherits page margin; pair with breakBefore
  layout?: LayoutConfig                          e.g. {layoutType:'single'} — resolved from scratch (unset fields = layout DEFAULTS, not the document layout!),
                                                 except columnRule: its unset fields take the document's, and the section's pages draw it
  bodyStyle?: PartsBodyStyleConfig               (§8) typography of paragraphs/lists in the section
  palette?: Record<paletteId, '#hex'>            recolours palette-linked design colours + flow colours on the section's pages
}
```
Gotcha: `layout` in a heading style goes through `resolveLayoutConfig` alone, so
`{layoutType:'double'}` there gets gutter 0.75cm unless you restate `gutterWidth`.
Typical uses: cover page (`numbered:false, toc:false, span:'page', advancedDesign.minHeight = page height`),
front matter with roman folios / single column, unnumbered appendix, index.

---------------------------------------------------------------------------------

## 7. Design slots — header, footer, openers, parts, TOC rows

`DesignSlot = { elements: DesignElement[] }`; **array order = paint order** (first = back).
Elements can anchor to later elements; the engine topo-sorts for geometry.

### 7.1 Containers ("container" anchor frame)
| slot | container |
|---|---|
| `header` | x/width = content area (mirrors with margins); y from **trim top** down to **body top** |
| `footer` | x/width = content area; y from **body bottom** to **trim bottom** |
| heading `advancedDesign.slot` | see §5.1 (full content width for `span:'page'`) |
| `parts.design` / `versoDesign` | the **trim box** (container == 'page') |
| `toc.parts.design` | the TOC row (column width × `toc.parts.height`) |
| callout `fixed` anchor | content area (see §12) |

`anchor.to: 'page'` = trim box, `'bleed'` = trim box + bleed (= trim when cutLines off). Using
them also makes that frame the reference for `size:'fill'`. Header `bottom-*` anchors = body edge;
header `top-*` = trim edge. Easiest reliable method for running heads: anchor to `'page'`
with explicit mm offsets measured from the trim corner, and split odd/even with `parity`.

### 7.2 ElementPlacement
```
placement: {
  anchor: { to: 'container'|'page'|'bleed'|'#elementId',
            edge: container edges 'top-left'|'top'|'top-right'|'left'|'center'|'right'|'bottom-left'|'bottom'|'bottom-right'
                  element edges  'right-of'|'left-of'|'below'|'above'|'align-top'|'align-bottom'|'align-left'|'align-right' },
  offset?: { x?: Dimension(abs), y?: Dimension(abs) },   // screen direction: +x right, +y DOWN (not "inward")
  size?: { width?: 'auto'|'fill'|Dimension, height?: 'auto'|'fill'|Dimension, maxWidth?: 'auto'|'fill'|Dimension }
}
```
- The anchor edge also picks the pin: `top-right` pins the element's top-right corner, so a
  right-anchored element needs a **negative** x offset to move inward; `bottom` anchors need
  negative y to move up (built-in header uses `bottom-right`, y = −16pt).
- `'fill'` runs to the frame edge from the anchor point.
- Element edges put a corner on a corner of the target: `right-of` = beside, tops level;
  `left-of` = to its left, tops level; `below` = under, left edges level; `above` = over, left
  edges level; `align-top` and `align-left` are the SAME placement (top-left corners together);
  `align-bottom` = bottom-left corners; `align-right` = top-right corners. No edge puts the
  bottom-right corners together: use `align-bottom` plus an x offset, or anchor the other way.
- Offsets in em throw — use mm/pt.

### 7.3 Element kinds
Common: `id` (string, unique in slot; referenced as `'#id'`), `parity: 'all'|'odd'|'even'`
(default 'all'; page 1 odd), `pages: 'all'|'body'|'opener'|'part'|'blank'` (page role filter,
default 'all'; `'body'` hides running heads on chapter openers, `'opener'` shows e.g. a
bottom folio only there). Parity/pages are ignored inside heading slots.

**text** (`DesignTextElement`, )
```
{ kind:'text', id, placement, content: string (template; '{{' '}}' = literal braces),
  fontSize: Dimension(abs)  REQUIRED,  overflow: 'wrap'|'ellipsis-start'|'ellipsis-end'|'ellipsis-middle'|'clip'  REQUIRED in type
  fontFamily='EB Garamond', fontWeight=400, italic=false, color=#000000,
  align='center' ('left'|'center'|'right'|'justify' — justify: word spaces stretched on every wrapped line
    but a paragraph's last; with hyphenate a word is also cut at a syllable to fill), verticalAlign='middle'
    (lines taller than a fixed height run out on the free side: 'bottom' keeps the last line box's foot
    on the box's foot, 'middle' runs out both ways; a drop cap follows its lines),
    lineHeight=1.2 (number × fontSize),
  letterSpacing?: Dimension (negative tightens, em = font size; the tracking after a line's last glyph
    counts neither for centre/right alignment nor for an auto width, and a justified line's last glyph
    ends on the edge), textTransform?: 'none'|'uppercase',
  hyphenate?: boolean (wrap only), box?: ElementBoxStyle,
  dropCap?: { lines=2, fontFamily?, fontWeight?, fontSize?, color?, gap? }   (the text wraps whatever its
    overflow; default size = text size + (lines−1) × leading / 0.72, top level with the first line's
    capitals; a preset without configVersion 6 gets its 1.4 size written out as fontSize),
  paragraphIndent?: Dimension     ('\n' in content separates paragraphs)
  inlineMarks?: boolean   (read **b** *i* ^sup^ ~sub~ in the resolved text, values included)
  stroke?: { width: Dimension, color?: ColorValue (= text colour), hollow?: boolean }
  reserve?: boolean       (heading slots: false = don't count toward the reserved height)
  parity?, pages? }
```
A newline or the two characters `\n` (in the template or an `{attr.*}` value; not in titles
or front-matter values, which print as written) always starts a new line, in every `overflow`
mode (ellipsis/clip act per line). An auto-width text is clamped to the room between its anchor
and the container edge it grows toward: an offset toward that edge shrinks it (twice for
`top`/`bottom`), one past it leaves it empty (ellipsis) or one letter per line (wrap) — use a
fixed `size.width` or anchor to `'page'`.
Element defaults are NOT the built-in header's (Open Sans 8pt/600 main colour) — set everything.
Resolver falls back to `overflow: 'ellipsis-end'` if omitted; use `'wrap'` for multi-line titles
with a fixed `size.width`.
Header/footer placeholders: `{pageNumber}` (the page LABEL, e.g. "xii"), `{totalPages}`,
`{title}`, `{subtitle}`, `{author}`, `{publishDate}` (front matter), `{chapterTitle}` (latest H1),
`{chapterNumber}`, `{chapterTitleAtTop}` / `{chapterNumberAtTop}` (the chapter in force at the top
of the page: differs where a chapter starts below other text, for run-on chapters),
`{partTitle}`, `{partNumber}`, `{attr.<key>}` (chapter H1 attribute).

**rule**: `{ kind:'rule', id, placement, direction: 'horizontal'|'vertical', color: ColorValue (req), thickness: Dimension (req), reserve? }`
(required in the type; a JSON config that leaves them out gets 'horizontal', #000000 and 0.5pt)
— length from `size.width` (horizontal) / `size.height` (vertical); `'fill'` = to frame edge.

**box**: `{ kind:'box', id, placement (with size), style: ElementBoxStyle, reserve? }`
`ElementBoxStyle = { backgroundColor?, borderColor?, borderWidth?, borderRadius?, padding?: {top,right,bottom,left} }`
(stroke painted inside: its outer edge on the box edge, in canvas, HTML and PDF; radius clamped).
Use for colour bands, thumb tabs, backdrops.

**image**: `{ kind:'image', id, placement, resourceId, reserve? }` — bitmap/SVG resource
(e.g. logo, cover photo). One of width/height `'auto'` keeps aspect; both set = fit & centre.

### 7.4 Header/footer defaults
`header`/`footer` **undefined** → built-in: header = `{title}` right on odd + `{chapterTitle}`
left on even + 1pt rule (Open Sans 8pt/600, main colour); footer = centred `{pageNumber}`.
`{ elements: [] }` = no header/footer. Legacy flat element fields (`align`, `marginFromBody`,
`marginFromEdge`, rule `width:'full'`) are migrated on input — don't write them.

### 7.5 Palette overrides in designs
Elements whose colours carry `paletteId` are recoloured on pages ruled by a part
(`:::part{palette="band=#f6c297"}`) or a styled section (`headingStyles[].palette`).
Unlinked hex colours never change.

---------------------------------------------------------------------------------

## 8. `parts` — PartsConfig

For `:::part{number="II" title="…" palette="band=#hex, tab=#hex"}` … `:::` in markdown.
```
parts
├─ page         boolean  true      false = no divider page; number/title/palette just take effect (screen editions)
├─ breakBefore  { parity: HeadingBreakParity = 'odd' }
├─ breakAfter   { enabled = true, parity = 'any' }    next chapter's own breakBefore decides the verso
├─ margins      PageMargins      body area of the part page (fence body flows here); each side inherits page margins
├─ design       DesignSlot       opener art; container = TRIM BOX; decorative only (raise margins.top to clear it)
│                                empty → synthesised '{number} {titleText}' in H1 typography at body top-left
├─ versoDesign  DesignSlot       design of the blank verso after the part page (empty = plain)
└─ bodyStyle    PartsBodyStyleConfig
     { fontFamily, fontSize, lineHeight, color, textAlign   → inherit bodyText
       bulletColor → unorderedLists.color, numberColor → orderedLists.color (numbers set bold)
       unorderedLists?: UnorderedListsConfig (partial override), orderedLists?: OrderedListsConfig (partial) }
```
Part-slot placeholders: `{titleText}` (fence title), `{number}` (as written), `{numberDecimal}`,
`{numberRoman}`, … (number parsed as decimal or roman), `{partTitle}`, `{partNumber}`,
`{chapterTitle}`, `{chapterNumber}`, `{pageNumber}`, `{totalPages}`, metadata, `{attr.*}`.
Part palette: applies from the part page until the next part (and across separately laid-out
chapters via continuation); recolours palette-linked design colours AND every flow colour equal
to the base value of an overridden entry (headings, bold/italic/ref colours, bullets, numbers,
caption labels and bars, table text/rules/fills, callout frames, chips). So link section-coloured things to one
palette id (e.g. `band`) and give each part its own `palette="band=#…"`.
Two entries with the same base value that a part sets apart: each flow colour follows the entry
its own settings link to. Told apart: a block's text / bold / italic / reference / marker /
separator colours; each heading level and heading style; a contents row's text / number / page
number; each callout style's fills / border / rules / text; each colour of each table, chip and
caption style. Still by value (the override wins): settings in different places that set the same
colour of a block (`bodyText.color` vs a callout `body.color`, a paragraph style `color`,
`bodyText.blockquote.color`) linked to such entries: give those entries distinct base values.
Page role of a part page = `'part'` (filter running heads with `pages`).

---------------------------------------------------------------------------------

## 9. `toc` — TocConfig

For `:::toc` in markdown (book outline supplied automatically in the sandbox).
```
toc
├─ levels[]   TocLevelConfig { level (1–6), + TocEntryStyleConfig }   default: [{level:1}]
│   TocEntryStyleConfig, all inherit body text:
│     fontFamily, fontSize, lineHeight (= body leading), fontWeight (= body weight), italic=false, color,
│     indent=0, numberWidth=2em, numberGap=0.5em, numberFontFamily, numberFontSize,
│     numberFontWeight (= entry weight ?? body bold weight), numberColor, marginTop=0, marginBottom=0
├─ unnumbered   TocEntryStyleConfig partial — for headings of a style with numbered:false
├─ pageNumber   { fontFamily, fontSize (= level-1), fontWeight (= body weight), italic=false, color, width=2em }
├─ leader       { enabled=true, char='.', gap=0.5em }      ('. ' spaces the dots)
├─ subtitle     { enabled=false, attr='author', fontFamily, fontSize, fontWeight, italic=true, color, indent=0 }
└─ parts        { enabled=true, breakBefore=false, design: DesignSlot (row; placeholders {number} {numberRoman}… {titleText} {pageNumber}),
                  height = 2em (twice the body size, not two body lines), marginTop=0, marginBottom=0 }
```

---------------------------------------------------------------------------------

## 10. Lists — `unorderedLists` / `orderedLists`

**Item text is always set in the body style.** `fontFamily`, `fontWeight`, `italic`, `color`
style only the **bullet / number marker** — the docs say otherwise.

unorderedLists
```
fontFamily = bodyText.fontFamily   (marker font)
color = main-color                 (marker colour)
fontWeight = 700, italic = false   (marker)
bulletChar = '•', bulletFontSize = 1em (em = body size), bulletVerticalOffset = 0em (neg = up)
gap = 0.5em (marker → text), indent = 0em (level 1; deeper levels cascade from parent text start unless set)
marginTop = 1.5em, marginBottom = 1.5em, itemSpacing = 0em, hangingIndent = true
snapTopToGrid = false  (true: the space above rounds up so the first item sits on the grid)
levels[]: { level 1–5, bulletChar, fontFamily, fontSize, color, fontWeight, italic, indent, verticalOffset }
taskCheckboxChar '☐', taskCheckedChar '☑', taskCompletedStrikethrough true, taskCompletedColor?
```
orderedLists
```
fontFamily = body, color = main-color, fontWeight = 700, italic = false  (number marker)
numberFormat = 'arabic'|'lower-alpha'|'upper-alpha'|'lower-roman'|'upper-roman'  ('arabic')
separator = '.', numberFontSize = 1em, gap = 0.5em, indent = 0em, numberVerticalOffset = 0em
marginTop/Bottom = 1.5em, itemSpacing = 0em, hangingIndent = true, snapTopToGrid = false
numberWidth = 'run'  ('run' = text after the widest number of the item's own run, so a list broken by a figure or
                      a paragraph can shift its text; 'level' = widest number at that depth in the chapter)
separatorFontFamily / separatorFontWeight / separatorItalic / separatorColor  → inherit number style
separatorGap = 0em  (a differing separator style draws the separator as its own run)
levels[]: { level 1–5, numberFormat, separator, fontFamily, fontSize, color, fontWeight, italic,
            indent, verticalOffset, separatorFontFamily, separatorFontWeight, separatorItalic,
            separatorColor, separatorGap }
```
Numbers are right-aligned within a run (within the depth with `numberWidth: 'level'`). Around a list nested
in another the outer list's `itemSpacing` applies on both sides. List margins of 1.5em are large — books usually want
`{0.5,'em'}` or a pt value. Nested list depth in markdown = 2 spaces per level (max 5).

---------------------------------------------------------------------------------

## 11. `paragraphStyles[]` — ParagraphStyleConfig

`:::paragraphs{style="id"}` … `:::` (bibliography, glossary, signature, dedication, credits).
```
{ id (REQUIRED), name?,
  fontFamily, fontSize, lineHeight (em = own size), color, textAlign, boldColor,
  italicColor                    (→ bodyText.italicColor, NOT `color`: a coloured style sets both)
  hyphenation: boolean, firstLineIndent,
  fontWeight, boldFontWeight                   → inherit bodyText
  italic = false                 (italic paragraphs; `*…*` runs flip upright — stage directions)
  smallCaps = false              (synthesised small caps, 0.7 of the size — cast lists, headwords)
  indent: Dimension = 0          (every line; firstLineIndent and hangingIndent count from it)
  hangingIndent: Dimension = 0   (non-zero replaces firstLineIndent; counts from indent)
  spaceBetween = 0, marginTop = 0, marginBottom = 0 (minimum; flow snaps back to grid after)
  snapToGrid = true              (false = exact space under the container, flow stays off the grid)
  textTransform = 'none'         ('uppercase' = capitals, chip words and :ref labels too, length-preserving; maths untouched) }
```
Inside the container the flow leaves the baseline grid. When it closes on a paragraph, the space under it merges
with the next block's own (a heading's `marginTop`) and is at least the text's paragraph spacing
(`bodyText.paragraphContainerSpacing`); when it closes on a list, the list keeps its own space and `marginBottom` follows. Unknown keys in a style raise `unknownConfigKey`. The style applies inside callouts too,
margins included (they collapse with the neighbours' spacing; none at the top of the box); its
unset fields inherit the document body text, not the box's `body`.

---------------------------------------------------------------------------------

## 12. `calloutStyles[]` — CalloutStyleConfig

`:::callout{type="id" title="…" span="…" placement="…" label="…"}` … `:::`. Unknown/missing
type → first style. Declaring the array replaces the default `note`.
All em values = the callout body font size.
```
{ id (REQUIRED), name?,
  title = ''                         default title; fence title overrides
  span = 'column'                    'column' | 'page' (span block across columns) | 'side' (float-only side column)
  placement = 'here'                 'here' | 'auto' | 'top' | 'bottom' | 'fixed'   (side boxes never float)
  sideAtColumnEnd = 'before'         side box whose following text continues on the next page (full column, or a
                                     paragraph/heading the break rules move on): 'before' = at the fence, beside
                                     the text before it (slides up; glosses), 'after' = level with the first line
                                     of the text after it, on that page (line numbers, marginal heads)
  fixed = { anchor: {to:'container', edge:'bottom-left'}, offset: {x:0pt, y:0pt} }   for placement:'fixed' (container = content area)
  floatBarrier = false               pending figures placed before this box (chapter-closing summaries)
  width = 'fill'                     'auto' = shrink-wrap title only (badge), children ignored
  backgroundEnabled = true, background = #f4f4f4
  border = { enabled=false, color=#cccccc, width=0.5pt }
  borderRadius = 0em                 the stripe is clipped to it; the label tab stays square
  padding = { top, right, bottom, left } = 0.75em each
  stripe = { enabled=false, side='left'|'right'|'top', width=1.5em, color=main }
  icon = { kind='none'|'glyph'|'resource', glyph='', resourceId='', fontFamily=headings font,
           fontWeight=400, size=1.5em, width? (non-square box), color=main, align='top'|'center',
           position='inline'|'corner', cornerSide='right'|'left'|'outer'|'inner' }
           (a corner icon is centred on its corner by its drawn width, a wide `width` strip included;
           a left-corner title starts past its inner half)
  label = unset (no tab). If set: { fontFamily=headings, fontSize=body size, fontWeight=700,
           color=#fff, background=main, position='top-right'|'top-left', height=1.4em, paddingX=0.6em,
           offset=0, inset=0, icon:{resourceId,width=1em,gap=0.3em}, rule:{enabled=false,color=main,width=0.5pt} }
           prints the fence `label` attribute ("RECUADRO 1-1")
  marker = { kind='none', glyph, resourceId, fontFamily, fontWeight=400, size=1.5em, color=main,
             align='center', gap=0.5em, rule:{enabled=false, color=main, width=0.5pt, length=0} }
             icon + vertical rule OUTSIDE the box on its left
  titleStyle = { fontFamily=headings font, fontSize=body size, fontWeight=700, italic=false,
                 color=main, textTransform='none'|'uppercase', gap=0.5em, letterSpacing=0, indent=0,
                 lineHeight=1.2em (em = title size; set the body leading to keep boxes a whole number of lines) }
  body = { fontFamily, fontSize, lineHeight, color, boldColor, italicColor, fontWeight, boldFontWeight,
           textAlign: 'left'|'justify', hyphenation: boolean, paragraphSpacing, firstLineIndent }   → inherit bodyText
         + italic = false, smallCaps = false   (paragraphs, list items and blockquotes of the box)
  lists = { bulletChar, color, indent, gap, itemSpacing, bulletFontSize?, bulletFontWeight? }  → inherit unorderedLists
           (a set `color` also colours ordered-list numbers, even when equal to unorderedLists.color)
  columnGap = 1.5em                  for :::columns{count=N} groups inside the box
  marginTop = 0.75em, marginBottom = 0.75em (minimum; grid-snapped after)
  snapToGrid = true                  false = exact marginBottom (stacked-box worksheets)
  keepTogether = true                false = may split between children / lines; continuation drops icon (its column stays, empty) (+ title unless repeatTitle)
  splitMinLines = 2                  fewest text lines on each side of a cut; a cut inside a paragraph or
                                     list item also keeps ≥ layout.boxChildSplitMinLines (2) of its lines
                                     per side (splitMinLines when lower)
  repeatTitle = false                continuation repeats the title + continuedSuffix ("HAMLET (CONT'D)")
  continuedSuffix = '(cont.)'        by locale, like tables
  continuesMarkerEnabled = false     marker under the last line of each part that goes on
  continuesMarker = 'Continued' | 'Continúa' (by locale)   e.g. '(MORE)'
  continuesMarkerAlign = 'right'     'left' | 'center' | 'right'
  continuesMarkerItalic = true }
```
Gotchas: `body.textAlign` only `'left'|'justify'`. Callout body inherits body text colours,
so boxes with coloured bold need `body.boldColor`. `span:'page'` in a multi-column layout cuts
the page into bands (text above levelled). Nested callouts take their own style but ignore
span/placement/floatBarrier/snapToGrid. Ordered-list numbers inside a box come from the global
`orderedLists` (callout `lists` has bullet fields only); `:::columns` groups share the box body.

---------------------------------------------------------------------------------

## 13. `chipStyles[]` — ChipStyleConfig

Inline `:chip[text]{style="id"}` (word banks, keys, tags). Chip without style → first style.
```
{ id (REQUIRED), name?, backgroundEnabled=true, background=#e8eef7, borderColor=main,
  borderWidth=0.5pt (0 = none), borderRadius=0.3em, paddingX=0.3em, paddingY=0.1em (paints outside line box),
  paddingTop?/paddingBottom? (= paddingY; top larger than bottom, e.g. 0.2em/0.05em, centres a capital in a round chip),
  fontFamily?/fontSize?/color? (= surrounding text; fontSize em = surrounding), bold=false, italic=false, gap=0.25em }
```

---------------------------------------------------------------------------------

## 14. Colour palette & section colours — summary

- `colorPalette: [{ id, name, value: {hex, model} }]`. Link any ColorValue with `paletteId`.
- Include `main-color` (see §0).
- Part / heading-style palette overrides are `Record<paletteId, '#hex'>` (strings, not ColorValue).
- Pattern for sectioned textbooks: palette entry `band` (section colour) used by the opener
  band box, thumb tab, heading levels, caption labels, table header fill; each `:::part`
  sets `palette="band=#9bcdbf"`. Also used by `htmlViewer.overrides` if needed.

---------------------------------------------------------------------------------

## 15. `resourceTypes[]` — ResourceType

```
{ id: string (REQUIRED; resource.typeId), name: string, namePlural?: string,
  shortLabel: string          used by :ref default style ("Fig. 1.7")
  numberingTemplate: string   tokens {n} (counter, per counterFormat), {h1}…{h6} (heading counters, decimal); '' = unnumbered
                              (≥ 1.5: caption "<prefix>. <caption>", no second stop after a prefix ending in . : ! ? …,
                              :ref prints the label alone; 1.4 printed "Do .Caption" / "Do ")
  resetOn: 'never'|'h1'|…|'h6'
  counterFormat: 'decimal'|'roman-lower'|'roman-upper'|'alpha-lower'|'alpha-upper'
  captionPrefix: string       caption = "<prefix> <number>. <caption>" ('' for unlabelled photos)
  defaultPlacement?: ResourcePlacement
  captionStyle?: CaptionStyleConfig   partial override merged over the global captionStyle }
```
ResourcePlacement, resolved field-by-field: resource.placement → type.defaultPlacement → built-in:
```
position: 'auto' (default) | 'top' | 'bottom' | 'here' (inline at ::resource directive)
span:     'column' (default) | 'page' | 'side' (float-only side column; else behaves as 'column')
rotate?:  'ccw' | 'cw'   (landscape: page-span float on its own page)
width?:   0 < w < 1 fraction of column/page width (default whole)
align?:   'left' (default) | 'center' | 'right'
captionSide?: boolean    caption in the float-only side column, level with the figure (column floats, oneAndHalf+floats)
```
Gotchas
- **Engine default types follow the document language**: with `resourceTypes` unset, the
  engine uses `defaultResourceTypes(locale)` (else the hyphenation locale; strings exist for
  en, es, fr, de, it, pt, ca, nl, English otherwise). Older engines used English. Still declare
  `resourceTypes` explicitly in a preset (and translate per locale via
  `localized.<lang>.config.resourceTypes` in preset.json).
- Numbering follows first `:ref` in reading order; `{h1}` is the chapter number (continues across chapters in book mode).
- Pair `{h1}.{n}` with `resetOn:'h1'`.

---------------------------------------------------------------------------------

## 16. Tables — `tableStyle` and `tableStyles[]`

tableStyle; fonts/colours inherit bodyText:
```
bodyFontFamily, bodyFontSize, bodyColor           → body text
headerFontFamily, headerFontSize, headerColor     → body text
headerBold = true, headerItalic = false
headerLetterSpacing = 0pt (em = header size), headerTextTransform = 'none' | 'uppercase'
headerBackgroundEnabled = true, headerBackground = #f0f0f0
bodyBackgroundEnabled = false, bodyBackground = #ffffff
bodyAlternateBackgroundEnabled = false, bodyAlternateBackground = #f2f2f2   (zebra rows: every second body row after the header)
borders = true, borderColor = body colour, borderWidth = 0.75pt
cellPadding = 0.375em (em = table body size)
rules = 'grid' | 'horizontal' | 'outer' | 'none'   ('grid')
borderRadius = 0pt   (outer frame; fills clipped)
overflow = 'split' | 'clip' | 'hide'                ('split': repeats header rows, caption + continuedSuffix)
continuedSuffix = '(cont.)', continuesMarkerEnabled = true, continuesMarker = 'Continued' | 'Continúa' (by locale)
```
tableStyles[]: `{ id (REQUIRED), name?, …any tableStyle field }` — unset fields inherit
`tableStyle`, then body. Picked per table by `resource.table.styleId`.
Not in config (lives in the resource's TableModel): `columnWidths` (relative weights),
`headerRowCount`, cell `align`/`verticalAlign`/`background`/`colSpan`/`rowSpan`/`image`.
Table line height = body leading ratio × table font size (no key; `bodyLineHeight` is ignored).
Zebra rows: `bodyAlternateBackgroundEnabled` + `bodyAlternateBackground` (counted by model row after the
header rows; a cell's own `background` wins; a split table keeps each row's stripe).

---------------------------------------------------------------------------------

## 17. `captionStyle` — CaptionStyleConfig

```
fontFamily, fontSize, color  → body text (label and description share family+size: engine limit)
align = 'left' (TextAlign), gap = 0.75em (em = caption size; body↔caption)
labelBold = true, labelItalic = false, labelColor = color
descriptionItalic = false
position = 'below' | 'above'
backgroundEnabled = false, background = main, padding = 0.35em   (bar behind caption)
note = { fontSize = 0.85×caption size, color = caption color, italic = false, gap = 0.35em, align = 'left' }
```
Per-type: `resourceTypes[].captionStyle` partial (e.g. tables `{position:'above'}`).
Caption text supports inline markdown; a bold lead sentence is written as `**…**` in the caption.

---------------------------------------------------------------------------------

## 18. `diagramStyle`

`{ singleInk = false, inkColor = main-color }` — recolours every SVG to tints of one ink by
luminance (spot-colour books). Disables SVG `pdfFileId` print masters when on.

## 19. `math`

`{ enabled = true, fontSizeScale = 1.0, color? (= body), marginTop = 0.8em, marginBottom = 0.8em,
indentAfterDisplay = true, keepWithLeadIn = false }` (MathJax SVG).
- `indentAfterDisplay: false` sets every paragraph right after a display formula flush (the "where …"
  continuation). A display written inside a paragraph (no blank line above) always gets a flush
  continuation: see document-format.md §11.
- `keepWithLeadIn: true` carries the lead-in line (the paragraph's last line) to the next column with a
  formula that does not fit under it (TeX's predisplay penalty); the whole paragraph goes when the
  lines left behind would be fewer than `bodyText.widowMinLines` (one line when `avoidWidows` is off).
  Default: the formula alone moves on.

One em of a formula = surrounding text size × `fontSizeScale` (body size for display maths and inline maths in body text; the heading / caption / box size for inline maths there) (postext ≥ 1.5; 1.4 set maths ~13 % larger —
`pinLegacyMathSize(config)` from `postext/bundle` reproduces it, i.e. `fontSizeScale: 1.131` plus
`marginTop`/`marginBottom` `0.7072em` for the default margins: em margins grow with the scale, so the scale alone
moves the text after each display formula). Measure a source's maths against its body text before setting it.

## 19a. `footnotes` — FootnotesConfig (postext ≥ 1.6)

Notes cited with `[^id]` (document-format.md §10.4).

| key | default | notes |
|---|---|---|
| `placement` | `'column'` | `'column'` = foot of the column holding the citing line (one-column: page foot); `'chapterEnd'` = every note of the chapter after its last block, in citation order |
| `numbering` | `'chapter'` | restarts under each level-1 heading and each document; `'document'` runs on (book chapters carry it as `continuation.footnoteNumber`) |
| `chapterEndAlign` | `'foot'` | `chapterEnd` only: `'foot'` = the notes that close a column sit at its foot; `'text'` = right under the text |
| `fontSize` | `0.8em` | em/rem = body size; body family and weights |
| `lineHeight` | `1.25em` | em = note size; notes are **off the baseline grid** (stack up from the column foot) |
| `color` / `textAlign` | body | |
| `hangingIndent` | `0` | turnover lines align past the number |
| `spaceBetween` | `0` | between two notes |
| `spaceAbove` | `0.5em` | text → rule; em = body size |
| `spaceBelowRule` | `0.4em` | rule → first note |
| `separator` | `{enabled:true, width:0.3, lineWidth:0.5pt, color:note colour}` | `width` = fraction of the column, from its left edge; `enabled:false` keeps the spaces |

- The citing line and its notes share a column: a line whose notes do not fit moves on (orphan/widow
  rules apply). The column's text area shrinks by the notes, so balancing counts only the text.
- Several notes in a column stack in citation order under one rule. A bottom float placed after
  the notes goes above them.
- A note is **never split**; one taller than a column overflows it (`chapterEnd` for long notes).
- Output: canvas, HTML, PDF (marker links to note; tagged PDF sets `Note` elements with `/ID`).
  VDT: notes are `VDTBlock`s with `footnoteNote` in `page.floats`, rules in `page.footnoteAreas`.

```json
"footnotes": { "fontSize": {"value": 7.5, "unit": "pt"}, "lineHeight": {"value": 9.5, "unit": "pt"},
  "hangingIndent": {"value": 0.8, "unit": "em"}, "separator": {"width": 0.25, "lineWidth": {"value": 0.4, "unit": "pt"}} }
```

## 19b. `index` — IndexConfig (postext ≥ 1.7)

What `:::index` prints from the `:index` marks (document-format.md §10.5). An entry = term +
`separator` + pages; sub-entries indent one `indent` per level; wrapped lines hang by `turnoverIndent`.

| key | default | notes |
|---|---|---|
| `fontFamily` / `fontSize` / `lineHeight` / `fontWeight` / `color` | body | every index line (letter heads too) sits on `lineHeight`, **off the baseline grid** |
| `indent` | `1em` | per sub-entry level |
| `turnoverIndent` | `2em` | wrapped lines, beyond the entry's own level |
| `entrySpacing` | `0` | above each main entry |
| `separator` / `locatorSeparator` / `rangeSeparator` | `', '` / `', '` / `'–'` | term→first page, page→page, range ends |
| `mergeRanges` | `true` | 12, 13, 14 → 12–14 (main pages never joined) |
| `rangeFormat` | `'full'` | `'chicago'` drops shared digits: 234–37, 101–8 (roman always full) |
| `main` | `{bold:true}` | `{bold?, italic?}` for `main` pages |
| `see` | by language, italic | `{label?, alsoLabel?, italic?}`: "See"/"See also", "Véase"/"Véase también"… |
| `locale` | the document's | collation (Intl.Collator) |
| `groups.enabled` | `true` | letter heads (A, B…, `0–9`, Symbols) |
| `groups.fontFamily/fontSize/fontWeight/italic/color` | entries', 700 | set on the entries' pitch |
| `groups.marginTop` | one index line | above each group; none above the first or at a column top |
| `groups.symbolsLabel` / `numbersLabel` | by language / `'0–9'` | |

Two columns come from the **heading style** of the index chapter, not from `index`:

```json
"headingStyles": [{ "id": "index", "numbered": false, "layout": { "layoutType": "double", "gutterWidth": {"value": 6, "unit": "mm"} } }],
"index": { "fontSize": {"value": 8.5, "unit": "pt"}, "lineHeight": {"value": 11, "unit": "pt"}, "rangeFormat": "chicago",
  "groups": { "fontWeight": 700, "color": {"hex": "#8a1c1c", "model": "hex"} } }
```

Measure the source index like body text: size, leading, indent per level, hanging indent, separators
(comma, en dash), letter-head face and the space above each group.

---------------------------------------------------------------------------------

## 20. Fonts — `customFonts` and what goes in preset.json

`CustomFontFamily = { name, variants: [{ weight 100–900, style 'normal'|'italic', fileId, format 'woff2'|'woff'|'ttf'|'otf', fileName? }], redistributable?: boolean (default true) }`.
- Any `fontFamily` string resolves against customFonts first, then Google Fonts.
- Needed variants: at least 400/700 normal+italic (else "missing variant" warning); if the book
  uses semibold for bold, provide 600 and set `bodyText.boldFontWeight: 600`.
- `.woff` is rejected by the PDF backend and skipped by the preset loader — use woff2/ttf/otf.

**preset.json** — `version: 2` manifest (full reference: project-format.md):
```
{ version: 2, configVersion: 8, id, name, description?, locale?, locales?, thumbnail?, license?, credits?, tags?,
  default?, view?: { canvasScope?: 'book'|'chapter' },
  chapters: [{title, file}] | { "<locale>": [{title, file}] },
  config: PostextConfig,                          // WITHOUT customFonts
  resources: [ Resource minus createdAt/updatedAt/bitmap/svg, plus file?, pdfFile?, width?, height?, note? ],
  fonts: [ { name, variants: [{ weight, style, file: "fonts/X.woff2" }], redistributable? } ],
  localized?: { "<locale>": { config?: Partial<PostextConfig> (top-level keys REPLACED wholesale),
                              resources?: [{ id, caption?, note?, altText?, table?, file?, pdfFile?, width?, height? }] } } }
```
`configVersion: 8` says `config` is written for today's rules (`preset_kit.write_manifest` sets it). Without it
the bundle reads as postext 1.4 wrote it: H1 breaks pinned, maths × 1.1312 when a chapter has `$`,
`layout.inlineResourceGap: 'above'` when a chapter embeds a `::resource`, `layout.inlineResourceGapInBoxes: false`
when one is embedded inside a `:::callout`, `headings.inlineMarks: false` when a heading carries `*`, `_`, `^`,
`~` or a link, `bodyText.colonListRoom: 'line'` when a chapter has a list after a line ending in ':',
`layout.boxChildSplitMinLines: 1` when a chapter opens a `:::callout`, `bodyText.breakAfterDashes: false` when
a chapter sets an em or en dash closed between words, `bodyText.optimalRagged: false` when the config sets some
running text ragged, `bodyText.breakAfterHyphens: false` when a chapter sets a hyphen between two letters,
`headings.keepWithNextSplit: 'fill'` when a chapter has a heading, `bodyText.paragraphContainerSpacing: 'add'`
when the config declares a paragraph style and a chapter opens a `:::paragraphs` container, and every design
drop cap's 1.4 size written out. A manifest stamped 5 gets the pins of rules 6, 7 and 8 only; one stamped 6,
those of rules 7 and 8; one stamped 7, those of rules 8. The pins keep what those rules changed, not
every 1.4 page: 1.5's layout fixes (page-span opener measure, drop caps in heading designs, tracking in boxes,
the loose-paragraph limit…) apply to an old bundle too.
Must NOT go in `config`: `customFonts` (built from `fonts[]`; fileIds are storage-local —
anything in config.customFonts is concatenated and would point at nothing), resource payloads,
metadata (front matter of chapter 1), `view` (top-level of the manifest, not config).
`debug` is harmless but pointless. `localized.<lang>.config.X` replaces the whole `X`
(e.g. restate the complete `resourceTypes` or `colorPalette` array per locale).

---------------------------------------------------------------------------------

## 21. Output / viewer / debug

`pdfGeneration`: `{ outlines = true, forceColorSpace = false, colorSpace = 'cmyk'|'rgb'|'grayscale' ('cmyk'), accessible = true (tagged PDF/UA-1, lang = config.locale) }`.
`renderToPdf` takes each setting from its own options, else from the first document's `pdfGeneration`
(`colorSpace` only while `forceColorSpace` is on), else the defaults (bookmarks, tagged, RGB).

`htmlViewer`: `{ maxCharsPerLine = 70, columnGap = 50 (CSS px number), optimalLineBreaking = false, overrides?: Omit<PostextConfig,'htmlViewer'> }`.
`overrides` merge: objects recursive; `levels` arrays merged by `level`; every other array
(design `elements`, `calloutStyles`, `colorPalette`, …) replaced wholesale. Typical:
`{ parts: { page: false }, headings: { levels: [{ level: 1, advancedDesign: { enabled: true, slot: {…screen opener…} } }] } }`.
The HTML viewer also turns on `layout.fitFiguresToPage` itself.

`debug`: `cursorSync {enabled=true,color}`, `selectionSync {enabled=true,color}`,
`looseLineHighlight {enabled=false,color,threshold=3}`, `pageNegative {enabled=false}`,
`warnings { missingFont=true, looseLines=true, headingHierarchy=true, consecutiveHeadings=false, listAfterHeading=false, designIssues=true }`.

---------------------------------------------------------------------------------

## 22. Docs vs code discrepancies (code wins)

1. `page.margins` default: docs "2 cm all sides"; code top/bottom 2 cm, **left/right 1.5 cm**.
2. Lists `fontFamily`/`fontWeight`/`italic`/`color`: docs "item text"; code = **marker only**, item text is body style.
3. Design text `overflow` default: docs `'wrap'`; resolver fallback `'ellipsis-end'` (field is required in the type anyway).
4. `bodyText.textAlign`: docs list 2 values; type is full `TextAlign` (`left|justify|center|right`). (`headings.textAlign` is documented with all four.) Caption `align` and `note.align` take all four; `center` / `right` work since 1.5 (1.4 set them flush left).
5. postext 1.4 and earlier: the H1 `breakBefore` default only survives when `headings` is entirely absent. Fixed since (merged per field); restate it for older versions.
6. (Fixed) `defaultResourceTypes(locale)` is locale-aware, and the engine now calls it with the document language when `resourceTypes` is unset; older engines used English there.
7. `customFonts` docs schema omits `redistributable`.
8. Docs say `rem` is relative to body size; code treats `rem` identically to `em` (caller's base).
9. Docs' header/footer element tables still describe legacy `marginFromBody`/`marginFromEdge`/`width:'full'`; write `placement` instead.

---------------------------------------------------------------------------------

## 23. Recipe: measuring a book into a config

1. Trim W×H → `page.sizePreset:'custom'`, width/height in mm. Facing pages → `margins.mirror:true`,
   `left` = inner (gutter/spine), `right` = outer.
2. Text block → margins (top = trim top → first baseline's line top of body text; bottom = last line bottom → trim bottom).
3. Columns → `layoutType`, `gutterWidth` (mm). Column-and-a-half: compute `sideColumnPercent` (§3),
   `sideColumnRole:'floats'` if the narrow column only holds figures/boxes, `sideColumnSide:'outer'` if it flips.
4. Body: size in pt, leading in pt (= baseline grid; everything else snaps to it), indent,
   `indentAfterHeading:false` for classic style, `paragraphSpacing:true` for block paragraphs, `boldColor`/`italicColor` = ink.
5. Headings: explicit `breakBefore` on H1, `span:'page'` + `advancedDesign` for designed openers,
   `numberingTemplate` for "1.2" numbering, per-level margins in pt.
6. Running heads: header/footer elements anchored to `'page'` with mm offsets, split by `parity`,
   hide on openers with `pages:'body'`, folio on openers with `pages:'opener'`.
7. Colours: palette with `main-color` + semantic ids; link everything via `paletteId`.
8. Boxes → `calloutStyles`; bibliographies → `paragraphStyles`; figures/tables → `resourceTypes`,
   `captionStyle`, `tableStyle(s)`; sections → `parts` + `palette` attribute; front matter → `headingStyles`.

---------------------------------------------------------------------------------

## 24. Example A — two-column textbook (21×28 cm, sections with colour bands)

Valid JSON; only real keys; both examples lay out without errors. (Spanish book → explicit resourceTypes.)

```json
{
  "locale": "es",
  "colorPalette": [
    { "id": "main-color", "name": "Acento", "value": { "hex": "#0b5c8a", "model": "hex" } },
    { "id": "ink", "name": "Tinta", "value": { "hex": "#1a1a1a", "model": "cmyk" } },
    { "id": "band", "name": "Color de sección", "value": { "hex": "#9bcdbf", "model": "hex" } },
    { "id": "tint", "name": "Fondo de recuadro", "value": { "hex": "#eef4f2", "model": "hex" } },
    { "id": "rule", "name": "Filetes", "value": { "hex": "#b9c2c8", "model": "hex" } },
    { "id": "muted", "name": "Gris", "value": { "hex": "#6b7278", "model": "hex" } }
  ],
  "page": {
    "sizePreset": "21x28",
    "margins": {
      "top": { "value": 22, "unit": "mm" },
      "bottom": { "value": 20, "unit": "mm" },
      "left": { "value": 20, "unit": "mm" },
      "right": { "value": 15, "unit": "mm" },
      "mirror": true
    },
    "cutLines": { "enabled": false, "bleed": { "value": 3, "unit": "mm" } }
  },
  "layout": {
    "layoutType": "double",
    "gutterWidth": { "value": 6, "unit": "mm" },
    "columnRule": { "enabled": false }
  },
  "bodyText": {
    "fontFamily": "Source Serif 4",
    "fontSize": { "value": 9.5, "unit": "pt" },
    "lineHeight": { "value": 12, "unit": "pt" },
    "textAlign": "justify",
    "firstLineIndent": { "value": 4, "unit": "mm" },
    "indentAfterHeading": false,
    "boldFontWeight": 700,
    "color": { "hex": "#1a1a1a", "model": "cmyk", "paletteId": "ink" },
    "boldColor": { "hex": "#1a1a1a", "model": "cmyk", "paletteId": "ink" },
    "italicColor": { "hex": "#1a1a1a", "model": "cmyk", "paletteId": "ink" },
    "referenceColor": { "hex": "#0b5c8a", "model": "hex", "paletteId": "main-color" },
    "referenceBold": true,
    "hyphenation": { "enabled": true }
  },
  "headings": {
    "fontFamily": "Source Sans 3",
    "color": { "hex": "#0b5c8a", "model": "hex", "paletteId": "main-color" },
    "keepWithNext": true,
    "balancing": { "enabled": true, "maxLinesPerHeading": 3 },
    "levels": [
      {
        "level": 1,
        "fontSize": { "value": 26, "unit": "pt" },
        "lineHeight": { "value": 30, "unit": "pt" },
        "numberingTemplate": "{1}",
        "breakBefore": { "enabled": true, "parity": "odd" },
        "span": "page",
        "advancedDesign": {
          "enabled": true,
          "minHeight": { "value": 60, "unit": "mm" },
          "slot": {
            "elements": [
              {
                "kind": "box", "id": "band",
                "placement": { "anchor": { "to": "bleed", "edge": "top-left" }, "size": { "width": "fill", "height": { "value": 38, "unit": "mm" } } },
                "style": { "backgroundColor": { "hex": "#9bcdbf", "model": "hex", "paletteId": "band" } }
              },
              {
                "kind": "text", "id": "num",
                "placement": { "anchor": { "to": "page", "edge": "top-left" }, "offset": { "x": { "value": 20, "unit": "mm" }, "y": { "value": 12, "unit": "mm" } } },
                "content": "CAPÍTULO {chapterNumber}",
                "fontFamily": "Source Sans 3", "fontSize": { "value": 10, "unit": "pt" }, "fontWeight": 700,
                "letterSpacing": { "value": 1.5, "unit": "pt" }, "align": "left", "overflow": "ellipsis-end",
                "color": { "hex": "#ffffff", "model": "hex" }
              },
              {
                "kind": "text", "id": "title",
                "placement": { "anchor": { "to": "#num", "edge": "below" }, "offset": { "y": { "value": 3, "unit": "mm" } }, "size": { "width": { "value": 150, "unit": "mm" }, "height": "auto" } },
                "content": "{titleText}",
                "fontFamily": "Source Sans 3", "fontSize": { "value": 26, "unit": "pt" }, "fontWeight": 700,
                "lineHeight": 1.1, "align": "left", "overflow": "wrap",
                "color": { "hex": "#ffffff", "model": "hex" }
              }
            ]
          }
        }
      },
      {
        "level": 2,
        "fontSize": { "value": 14, "unit": "pt" },
        "lineHeight": { "value": 16, "unit": "pt" },
        "numberingTemplate": "{1}.{2}",
        "marginTop": { "value": 18, "unit": "pt" },
        "marginBottom": { "value": 6, "unit": "pt" },
        "breakBefore": { "enabled": false, "parity": "any" }
      },
      {
        "level": 3,
        "fontSize": { "value": 11, "unit": "pt" },
        "lineHeight": { "value": 13, "unit": "pt" },
        "color": { "hex": "#1a1a1a", "model": "cmyk", "paletteId": "ink" },
        "marginTop": { "value": 12, "unit": "pt" },
        "marginBottom": { "value": 3, "unit": "pt" }
      }
    ]
  },
  "header": {
    "elements": [
      {
        "kind": "text", "id": "folioEven", "parity": "even", "pages": "body",
        "placement": { "anchor": { "to": "page", "edge": "top-left" }, "offset": { "x": { "value": 15, "unit": "mm" }, "y": { "value": 12, "unit": "mm" } } },
        "content": "{pageNumber}", "fontFamily": "Source Sans 3", "fontSize": { "value": 9, "unit": "pt" }, "fontWeight": 700,
        "align": "left", "overflow": "ellipsis-end", "color": { "hex": "#1a1a1a", "model": "cmyk", "paletteId": "ink" }
      },
      {
        "kind": "text", "id": "headEven", "parity": "even", "pages": "body",
        "placement": { "anchor": { "to": "#folioEven", "edge": "right-of" }, "offset": { "x": { "value": 4, "unit": "mm" } }, "size": { "width": "auto", "maxWidth": { "value": 120, "unit": "mm" } } },
        "content": "{partTitle}", "fontFamily": "Source Sans 3", "fontSize": { "value": 8, "unit": "pt" },
        "align": "left", "overflow": "ellipsis-end", "textTransform": "uppercase", "color": { "hex": "#6b7278", "model": "hex", "paletteId": "muted" }
      },
      {
        "kind": "text", "id": "folioOdd", "parity": "odd", "pages": "body",
        "placement": { "anchor": { "to": "page", "edge": "top-right" }, "offset": { "x": { "value": -15, "unit": "mm" }, "y": { "value": 12, "unit": "mm" } } },
        "content": "{pageNumber}", "fontFamily": "Source Sans 3", "fontSize": { "value": 9, "unit": "pt" }, "fontWeight": 700,
        "align": "right", "overflow": "ellipsis-end", "color": { "hex": "#1a1a1a", "model": "cmyk", "paletteId": "ink" }
      },
      {
        "kind": "text", "id": "headOdd", "parity": "odd", "pages": "body",
        "placement": { "anchor": { "to": "#folioOdd", "edge": "left-of" }, "offset": { "x": { "value": -4, "unit": "mm" } }, "size": { "width": "auto", "maxWidth": { "value": 120, "unit": "mm" } } },
        "content": "{chapterTitle}", "fontFamily": "Source Sans 3", "fontSize": { "value": 8, "unit": "pt" },
        "align": "right", "overflow": "ellipsis-end", "color": { "hex": "#6b7278", "model": "hex", "paletteId": "muted" }
      },
      {
        "kind": "box", "id": "thumbTabOdd", "parity": "odd", "pages": "body",
        "placement": { "anchor": { "to": "bleed", "edge": "top-right" }, "offset": { "y": { "value": 40, "unit": "mm" } }, "size": { "width": { "value": 8, "unit": "mm" }, "height": { "value": 25, "unit": "mm" } } },
        "style": { "backgroundColor": { "hex": "#9bcdbf", "model": "hex", "paletteId": "band" } }
      }
    ]
  },
  "footer": {
    "elements": [
      {
        "kind": "text", "id": "folioOpener", "pages": "opener",
        "placement": { "anchor": { "to": "page", "edge": "bottom" }, "offset": { "y": { "value": -10, "unit": "mm" } } },
        "content": "{pageNumber}", "fontFamily": "Source Sans 3", "fontSize": { "value": 9, "unit": "pt" },
        "align": "center", "overflow": "ellipsis-end", "color": { "hex": "#1a1a1a", "model": "cmyk", "paletteId": "ink" }
      }
    ]
  },
  "parts": {
    "breakBefore": { "parity": "odd" },
    "breakAfter": { "enabled": true, "parity": "any" },
    "margins": { "top": { "value": 120, "unit": "mm" } },
    "design": {
      "elements": [
        {
          "kind": "box", "id": "bg",
          "placement": { "anchor": { "to": "bleed", "edge": "top-left" }, "size": { "width": "fill", "height": "fill" } },
          "style": { "backgroundColor": { "hex": "#9bcdbf", "model": "hex", "paletteId": "band" } }
        },
        {
          "kind": "text", "id": "pnum",
          "placement": { "anchor": { "to": "page", "edge": "top-left" }, "offset": { "x": { "value": 20, "unit": "mm" }, "y": { "value": 60, "unit": "mm" } } },
          "content": "SECCIÓN {numberRoman}", "fontFamily": "Source Sans 3", "fontSize": { "value": 14, "unit": "pt" }, "fontWeight": 700,
          "align": "left", "overflow": "ellipsis-end", "color": { "hex": "#ffffff", "model": "hex" }
        },
        {
          "kind": "text", "id": "ptitle",
          "placement": { "anchor": { "to": "#pnum", "edge": "below" }, "offset": { "y": { "value": 4, "unit": "mm" } }, "size": { "width": { "value": 160, "unit": "mm" }, "height": "auto" } },
          "content": "{titleText}", "fontFamily": "Source Sans 3", "fontSize": { "value": 30, "unit": "pt" }, "fontWeight": 700,
          "lineHeight": 1.1, "align": "left", "overflow": "wrap", "color": { "hex": "#ffffff", "model": "hex" }
        }
      ]
    },
    "bodyStyle": { "fontSize": { "value": 11, "unit": "pt" }, "numberColor": { "hex": "#ffffff", "model": "hex" } }
  },
  "unorderedLists": {
    "bulletChar": "■",
    "bulletFontSize": { "value": 0.6, "unit": "em" },
    "color": { "hex": "#0b5c8a", "model": "hex", "paletteId": "main-color" },
    "gap": { "value": 2, "unit": "mm" },
    "marginTop": { "value": 0.5, "unit": "em" },
    "marginBottom": { "value": 0.5, "unit": "em" }
  },
  "orderedLists": {
    "color": { "hex": "#0b5c8a", "model": "hex", "paletteId": "main-color" },
    "gap": { "value": 2, "unit": "mm" },
    "marginTop": { "value": 0.5, "unit": "em" },
    "marginBottom": { "value": 0.5, "unit": "em" }
  },
  "resourceTypes": [
    { "id": "figure", "name": "Figura", "namePlural": "Figuras", "shortLabel": "fig.", "captionPrefix": "Figura",
      "numberingTemplate": "{h1}-{n}", "resetOn": "h1", "counterFormat": "decimal",
      "defaultPlacement": { "position": "auto", "span": "column" } },
    { "id": "table", "name": "Tabla", "namePlural": "Tablas", "shortLabel": "tabla", "captionPrefix": "Tabla",
      "numberingTemplate": "{h1}-{n}", "resetOn": "h1", "counterFormat": "decimal",
      "defaultPlacement": { "position": "top", "span": "page" },
      "captionStyle": { "position": "above" } }
  ],
  "captionStyle": {
    "fontFamily": "Source Sans 3",
    "fontSize": { "value": 8, "unit": "pt" },
    "gap": { "value": 2, "unit": "mm" },
    "labelBold": true,
    "labelColor": { "hex": "#0b5c8a", "model": "hex", "paletteId": "main-color" },
    "note": { "fontSize": { "value": 6.5, "unit": "pt" }, "color": { "hex": "#6b7278", "model": "hex", "paletteId": "muted" } }
  },
  "tableStyle": {
    "bodyFontFamily": "Source Sans 3",
    "bodyFontSize": { "value": 8, "unit": "pt" },
    "headerFontFamily": "Source Sans 3",
    "headerFontSize": { "value": 8, "unit": "pt" },
    "headerColor": { "hex": "#ffffff", "model": "hex" },
    "headerBackground": { "hex": "#0b5c8a", "model": "hex", "paletteId": "main-color" },
    "borderColor": { "hex": "#b9c2c8", "model": "hex", "paletteId": "rule" },
    "borderWidth": { "value": 0.5, "unit": "pt" },
    "cellPadding": { "value": 1.5, "unit": "mm" },
    "rules": "horizontal"
  },
  "tableStyles": [
    { "id": "plain", "name": "Sin fondo", "headerBackgroundEnabled": false, "headerColor": { "hex": "#1a1a1a", "model": "cmyk", "paletteId": "ink" }, "rules": "outer", "borderRadius": { "value": 2, "unit": "mm" } }
  ],
  "calloutStyles": [
    {
      "id": "recuadro", "name": "Recuadro", "span": "page", "placement": "here", "keepTogether": false,
      "background": { "hex": "#eef4f2", "model": "hex", "paletteId": "tint" },
      "padding": { "top": { "value": 4, "unit": "mm" }, "right": { "value": 5, "unit": "mm" }, "bottom": { "value": 3, "unit": "mm" }, "left": { "value": 5, "unit": "mm" } },
      "stripe": { "enabled": true, "side": "top", "width": { "value": 1.5, "unit": "mm" }, "color": { "hex": "#9bcdbf", "model": "hex", "paletteId": "band" } },
      "label": { "position": "top-left", "fontSize": { "value": 8, "unit": "pt" }, "background": { "hex": "#0b5c8a", "model": "hex", "paletteId": "main-color" } },
      "titleStyle": { "fontFamily": "Source Sans 3", "fontSize": { "value": 10, "unit": "pt" }, "gap": { "value": 2, "unit": "mm" } },
      "body": { "fontFamily": "Source Sans 3", "fontSize": { "value": 8.5, "unit": "pt" }, "lineHeight": { "value": 11, "unit": "pt" }, "textAlign": "left", "firstLineIndent": { "value": 0, "unit": "mm" } },
      "marginTop": { "value": 6, "unit": "pt" },
      "marginBottom": { "value": 8, "unit": "pt" }
    },
    {
      "id": "resumen", "name": "Puntos clave", "title": "PUNTOS CLAVE", "floatBarrier": true,
      "backgroundEnabled": false,
      "border": { "enabled": true, "color": { "hex": "#0b5c8a", "model": "hex", "paletteId": "main-color" }, "width": { "value": 0.75, "unit": "pt" } },
      "borderRadius": { "value": 2, "unit": "mm" },
      "titleStyle": { "fontFamily": "Source Sans 3", "letterSpacing": { "value": 1, "unit": "pt" } },
      "lists": { "bulletChar": "–" }
    }
  ],
  "paragraphStyles": [
    { "id": "bibliografia", "name": "Bibliografía", "fontSize": { "value": 8, "unit": "pt" }, "lineHeight": { "value": 10, "unit": "pt" },
      "textAlign": "left", "hangingIndent": { "value": 4, "unit": "mm" }, "spaceBetween": { "value": 2, "unit": "pt" } }
  ],
  "toc": {
    "levels": [
      { "level": 1, "fontFamily": "Source Sans 3", "fontWeight": 700, "numberWidth": { "value": 8, "unit": "mm" }, "marginTop": { "value": 4, "unit": "pt" } },
      { "level": 2, "indent": { "value": 8, "unit": "mm" }, "numberWidth": { "value": 10, "unit": "mm" } }
    ],
    "leader": { "enabled": true, "char": ".", "gap": { "value": 1, "unit": "mm" } },
    "pageNumber": { "width": { "value": 8, "unit": "mm" } }
  },
  "pdfGeneration": { "outlines": true, "accessible": true },
  "htmlViewer": {
    "overrides": {
      "parts": { "page": false }
    }
  }
}
```
Markdown side of this design: `:::part{number="II" title="Metabolismo" palette="band=#f9ba96"}` … `:::`,
chapters `# Título`, boxes `:::callout{type="recuadro" label="RECUADRO 3-1" title="…"}`,
tables resources with `"table": { "model": {...}, "styleId": "plain" }`.

---------------------------------------------------------------------------------

## 25. Example B — column-and-a-half book (outer float column, margin figures & boxes)

Trim 210×275 mm, inner 20 / outer 16 mm → content 174 mm; main 115 mm + gutter 7 mm +
side 52 mm → `sideColumnPercent = 52/174·100 = 29.885`.

```json
{
  "locale": "en-us",
  "colorPalette": [
    { "id": "main-color", "name": "Accent", "value": { "hex": "#005a8c", "model": "hex" } },
    { "id": "ink", "name": "Ink", "value": { "hex": "#1f2328", "model": "hex" } },
    { "id": "tint", "name": "Box tint", "value": { "hex": "#e8f1f7", "model": "hex" } },
    { "id": "muted", "name": "Muted", "value": { "hex": "#5f6b74", "model": "hex" } }
  ],
  "page": {
    "sizePreset": "custom",
    "width": { "value": 210, "unit": "mm" },
    "height": { "value": 275, "unit": "mm" },
    "margins": {
      "top": { "value": 24, "unit": "mm" },
      "bottom": { "value": 22, "unit": "mm" },
      "left": { "value": 20, "unit": "mm" },
      "right": { "value": 16, "unit": "mm" },
      "mirror": true
    }
  },
  "layout": {
    "layoutType": "oneAndHalf",
    "gutterWidth": { "value": 7, "unit": "mm" },
    "sideColumnPercent": 29.885,
    "sideColumnRole": "floats",
    "sideColumnSide": "outer"
  },
  "bodyText": {
    "fontFamily": "Source Serif 4",
    "fontSize": { "value": 10, "unit": "pt" },
    "lineHeight": { "value": 14, "unit": "pt" },
    "textAlign": "justify",
    "firstLineIndent": { "value": 0, "unit": "mm" },
    "paragraphSpacing": true,
    "indentAfterHeading": false,
    "color": { "hex": "#1f2328", "model": "hex", "paletteId": "ink" },
    "boldColor": { "hex": "#1f2328", "model": "hex", "paletteId": "ink" },
    "italicColor": { "hex": "#1f2328", "model": "hex", "paletteId": "ink" },
    "referenceColor": { "hex": "#005a8c", "model": "hex", "paletteId": "main-color" },
    "referenceBold": false
  },
  "headings": {
    "fontFamily": "Source Sans 3",
    "color": { "hex": "#1f2328", "model": "hex", "paletteId": "ink" },
    "levels": [
      {
        "level": 1,
        "fontSize": { "value": 30, "unit": "pt" },
        "lineHeight": { "value": 34, "unit": "pt" },
        "numberingTemplate": "{1}",
        "breakBefore": { "enabled": true, "parity": "odd" },
        "span": "page",
        "advancedDesign": {
          "enabled": true,
          "minHeight": { "value": 45, "unit": "mm" },
          "slot": {
            "elements": [
              {
                "kind": "box", "id": "topStripe",
                "placement": { "anchor": { "to": "bleed", "edge": "top-left" }, "size": { "width": "fill", "height": { "value": 3, "unit": "mm" } } },
                "style": { "backgroundColor": { "hex": "#005a8c", "model": "hex", "paletteId": "main-color" } }
              },
              {
                "kind": "text", "id": "chapNum",
                "placement": { "anchor": { "to": "container", "edge": "top-left" } },
                "content": "CHAPTER {chapterNumber}", "fontFamily": "Source Sans 3", "fontSize": { "value": 10, "unit": "pt" }, "fontWeight": 700,
                "letterSpacing": { "value": 1.6, "unit": "pt" }, "align": "left", "overflow": "ellipsis-end",
                "color": { "hex": "#005a8c", "model": "hex", "paletteId": "main-color" }
              },
              {
                "kind": "text", "id": "chapTitle",
                "placement": { "anchor": { "to": "#chapNum", "edge": "below" }, "offset": { "y": { "value": 3, "unit": "mm" } }, "size": { "width": { "value": 115, "unit": "mm" }, "height": "auto" } },
                "content": "{titleText}", "fontFamily": "Source Sans 3", "fontSize": { "value": 28, "unit": "pt" }, "fontWeight": 700,
                "lineHeight": 1.08, "align": "left", "overflow": "wrap",
                "color": { "hex": "#1f2328", "model": "hex", "paletteId": "ink" }
              },
              {
                "kind": "rule", "id": "chapRule", "direction": "horizontal",
                "placement": { "anchor": { "to": "#chapTitle", "edge": "below" }, "offset": { "y": { "value": 4, "unit": "mm" } }, "size": { "width": { "value": 30, "unit": "mm" } } },
                "color": { "hex": "#005a8c", "model": "hex", "paletteId": "main-color" },
                "thickness": { "value": 1.5, "unit": "pt" }
              }
            ]
          }
        }
      },
      {
        "level": 2,
        "fontSize": { "value": 16, "unit": "pt" },
        "lineHeight": { "value": 20, "unit": "pt" },
        "color": { "hex": "#005a8c", "model": "hex", "paletteId": "main-color" },
        "numberingTemplate": "{1}.{2}",
        "marginTop": { "value": 20, "unit": "pt" },
        "marginBottom": { "value": 6, "unit": "pt" },
        "breakBefore": { "enabled": false, "parity": "any" }
      },
      {
        "level": 3,
        "fontSize": { "value": 12, "unit": "pt" },
        "lineHeight": { "value": 15, "unit": "pt" },
        "marginTop": { "value": 12, "unit": "pt" },
        "marginBottom": { "value": 3, "unit": "pt" }
      }
    ]
  },
  "headingStyles": [
    {
      "id": "front-matter",
      "name": "Front matter",
      "numbered": false,
      "breakBefore": { "enabled": true, "parity": "odd" },
      "span": "page",
      "layout": { "layoutType": "single" },
      "margins": { "left": { "value": 30, "unit": "mm" }, "right": { "value": 30, "unit": "mm" } },
      "footer": { "elements": [] }
    }
  ],
  "header": {
    "elements": [
      {
        "kind": "text", "id": "folioEven", "parity": "even", "pages": "body",
        "placement": { "anchor": { "to": "page", "edge": "top-left" }, "offset": { "x": { "value": 16, "unit": "mm" }, "y": { "value": 14, "unit": "mm" } } },
        "content": "{pageNumber}", "fontFamily": "Source Sans 3", "fontSize": { "value": 9, "unit": "pt" }, "fontWeight": 700,
        "align": "left", "overflow": "ellipsis-end", "color": { "hex": "#1f2328", "model": "hex", "paletteId": "ink" }
      },
      {
        "kind": "text", "id": "titleEven", "parity": "even", "pages": "body",
        "placement": { "anchor": { "to": "page", "edge": "top-left" }, "offset": { "x": { "value": 25, "unit": "mm" }, "y": { "value": 14, "unit": "mm" } }, "size": { "width": { "value": 130, "unit": "mm" }, "height": "auto" } },
        "content": "{title}", "fontFamily": "Source Sans 3", "fontSize": { "value": 8, "unit": "pt" },
        "align": "left", "overflow": "ellipsis-end", "color": { "hex": "#5f6b74", "model": "hex", "paletteId": "muted" }
      },
      {
        "kind": "text", "id": "folioOdd", "parity": "odd", "pages": "body",
        "placement": { "anchor": { "to": "page", "edge": "top-right" }, "offset": { "x": { "value": -16, "unit": "mm" }, "y": { "value": 14, "unit": "mm" } } },
        "content": "{pageNumber}", "fontFamily": "Source Sans 3", "fontSize": { "value": 9, "unit": "pt" }, "fontWeight": 700,
        "align": "right", "overflow": "ellipsis-end", "color": { "hex": "#1f2328", "model": "hex", "paletteId": "ink" }
      },
      {
        "kind": "text", "id": "chapterOdd", "parity": "odd", "pages": "body",
        "placement": { "anchor": { "to": "page", "edge": "top-right" }, "offset": { "x": { "value": -25, "unit": "mm" }, "y": { "value": 14, "unit": "mm" } }, "size": { "width": { "value": 130, "unit": "mm" }, "height": "auto" } },
        "content": "{chapterNumber} · {chapterTitle}", "fontFamily": "Source Sans 3", "fontSize": { "value": 8, "unit": "pt" },
        "align": "right", "overflow": "ellipsis-end", "color": { "hex": "#5f6b74", "model": "hex", "paletteId": "muted" }
      }
    ]
  },
  "footer": { "elements": [] },
  "resourceTypes": [
    { "id": "figure", "name": "Figure", "namePlural": "Figures", "shortLabel": "Fig.", "captionPrefix": "Figure",
      "numberingTemplate": "{h1}.{n}", "resetOn": "h1", "counterFormat": "decimal",
      "defaultPlacement": { "position": "auto", "span": "side" } },
    { "id": "table", "name": "Table", "namePlural": "Tables", "shortLabel": "Table", "captionPrefix": "Table",
      "numberingTemplate": "{h1}.{n}", "resetOn": "h1", "counterFormat": "decimal",
      "defaultPlacement": { "position": "auto", "span": "column", "captionSide": true },
      "captionStyle": { "position": "above" } }
  ],
  "captionStyle": {
    "fontFamily": "Source Sans 3",
    "fontSize": { "value": 8, "unit": "pt" },
    "gap": { "value": 1.8, "unit": "mm" },
    "labelColor": { "hex": "#005a8c", "model": "hex", "paletteId": "main-color" },
    "note": { "fontSize": { "value": 6.8, "unit": "pt" }, "color": { "hex": "#5f6b74", "model": "hex", "paletteId": "muted" } }
  },
  "tableStyle": {
    "bodyFontFamily": "Source Sans 3",
    "bodyFontSize": { "value": 8.5, "unit": "pt" },
    "headerColor": { "hex": "#ffffff", "model": "hex" },
    "headerBackground": { "hex": "#005a8c", "model": "hex", "paletteId": "main-color" },
    "borderWidth": { "value": 0.5, "unit": "pt" },
    "cellPadding": { "value": 1.6, "unit": "mm" },
    "rules": "horizontal"
  },
  "calloutStyles": [
    {
      "id": "key-concept", "name": "Key concept (margin)", "title": "KEY CONCEPT",
      "span": "side",
      "background": { "hex": "#e8f1f7", "model": "hex", "paletteId": "tint" },
      "padding": { "top": { "value": 3, "unit": "mm" }, "right": { "value": 3, "unit": "mm" }, "bottom": { "value": 2.5, "unit": "mm" }, "left": { "value": 3, "unit": "mm" } },
      "icon": { "kind": "glyph", "glyph": "!", "position": "corner", "cornerSide": "outer", "size": { "value": 5, "unit": "mm" } },
      "titleStyle": { "fontFamily": "Source Sans 3", "fontSize": { "value": 8, "unit": "pt" }, "letterSpacing": { "value": 1.2, "unit": "pt" }, "gap": { "value": 1.5, "unit": "mm" } },
      "body": { "fontFamily": "Source Sans 3", "fontSize": { "value": 8.5, "unit": "pt" }, "lineHeight": { "value": 11, "unit": "pt" }, "textAlign": "left", "firstLineIndent": { "value": 0, "unit": "mm" } },
      "marginTop": { "value": 0, "unit": "mm" },
      "marginBottom": { "value": 3, "unit": "mm" }
    },
    {
      "id": "example", "name": "Worked example", "title": "Example",
      "backgroundEnabled": false,
      "border": { "enabled": true, "color": { "hex": "#5f6b74", "model": "hex", "paletteId": "muted" }, "width": { "value": 0.6, "unit": "pt" } },
      "stripe": { "enabled": true, "side": "left", "width": { "value": 3, "unit": "pt" } },
      "keepTogether": false,
      "splitMinLines": 2
    },
    {
      "id": "self-check", "name": "Self check",
      "marker": { "kind": "glyph", "glyph": "✎", "size": { "value": 6, "unit": "mm" },
                  "rule": { "enabled": true, "width": { "value": 0.75, "unit": "pt" } } },
      "background": { "hex": "#e8f1f7", "model": "hex", "paletteId": "tint" }
    }
  ],
  "diagramStyle": { "singleInk": false },
  "pdfGeneration": { "outlines": true, "accessible": true, "forceColorSpace": false }
}
```
Note on Example B: margin figures come from `resourceTypes.figure.defaultPlacement.span:'side'`;
tables stay in the main column with their caption beside them in the side column
(`captionSide:true`); `key-concept` boxes stack in the side column beside the text that
interrupts them. A resource can still override per instance with `placement` (e.g. a wide
figure `{ "span": "page", "position": "top" }`).
