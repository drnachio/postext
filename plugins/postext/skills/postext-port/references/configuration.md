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
| `resourceTypes` | ResourceType[] | Figure + Table (English!) | §15 numbering, caption prefix, default placement |
| `tableStyle` | TableStyleConfig | §16 | document table style |
| `tableStyles` | NamedTableStyleConfig[] | `[]` | §16 per-table via `resource.table.styleId` |
| `captionStyle` | CaptionStyleConfig | §17 | + per-type overrides |
| `diagramStyle` | DiagramStyleConfig | `{singleInk:false}` | §18 |
| `math` | MathConfig | §19 | |
| `colorPalette` | ColorPaletteEntry[] | `[main-color #295AA3]` | §0 |
| `locale` | HyphenationLocale | `'en-us'` | document language: hyphenation fallback, table continuation strings, PDF `/Lang` |
| `customFonts` | CustomFontFamily[] | — | §20 **do not write in preset.json config** |
| `htmlViewer` | HtmlViewerConfig | §21 | screen-only; `overrides` = partial config merged for HTML |
| `pdfGeneration` | PdfGenerationConfig | §21 | outlines, tagging, colour space |
| `debug` | DebugConfig | §21 | editor overlays + warning toggles; no effect on output |

Not configurable (no config exists — don't look for it): footnotes / endnotes / margin notes
(`[^1]` unsupported; emulate with callouts or `span:'side'`), blockquote style (always body font
in italic), body drop caps (only design text elements have `dropCap`),
table line height (= body leading ratio × table font size), heading hyphenation (off),
per-level heading `textAlign` (only `headings.textAlign`), negative tracking in design text
(`letterSpacing` clamped ≥ 0). Document metadata (`{title}`, `{subtitle}`, `{author}`,
`{publishDate}`) comes from the **front matter of the first chapter**, not from the config.

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
└─ fitFiguresToPage   boolean                                default false (HTML viewer sets it)
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
└─ hyphenation       { enabled=true, locale=<config.locale ?? 'en-us'> }
                      locale: 'en-us'|'es'|'fr'|'de'|'it'|'pt'|'ca'|'nl'
```
H&J / Knuth–Plass
```
├─ optimalLineBreaking  boolean  true   Knuth-Plass (false = greedy)
├─ maxWordSpacing       number   2      × normal space; also the cap for balancing "loose" paragraphs
├─ minWordSpacing       number   0.6    × normal space
├─ avoidRunts           true;  runtMinCharacters 20;  runtPenalty 1000;  avoidRuntsInLists true
├─ tightenRunts         true   re-set a runt paragraph one line shorter (tighter spaces, ≤ maxRuntTracking)
├─ maxRuntTracking      10     thousandths of an em (10 = 0.01em), applied negatively
├─ avoidOrphans         true;  orphanMinLines 2;  orphanPenalty 1000;  avoidOrphansInLists true
├─ avoidWidows          true;  widowMinLines 2;   widowPenalty 1000;   avoidWidowsInLists true
├─ slackWeight          10     pressure to fill columns (0 = off)
└─ keepColonWithList    true   paragraph ending in ':' stays with the list it introduces
```
Gotchas
- Hyphenation only applies when `textAlign: 'justify'`. Words < 5 chars never break (2 before / 3 after).
- For a Spanish book set top-level `locale: 'es'` (hyphenation follows unless `hyphenation.locale` is set).
- All widow/orphan/runt rules are soft penalties, never hard.

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
├─ snapToGrid    true              false = keep exact marginBottom (text may sit off-grid until next snap point)
├─ balancing     ColumnBalancingConfig — see 5.2
└─ levels        HeadingLevelConfig[] — entries matched by `level` (1–6)
```

### 5.1 `headings.levels[]` — HeadingLevelConfig
```
{ level: 1..6,                         REQUIRED
  fontSize: Dimension (abs)            defaults H1 18pt, H2 15, H3 12, H4 10, H5 9, H6 8
  lineHeight, fontFamily, color, fontWeight, marginTop, marginBottom   → inherit general
  italic: boolean                      false
  textTransform: 'none'|'uppercase'    'none' (length-preserving; number prefix kept as written)
  numberingTemplate: string            ''  → no automatic number
  breakBefore: { enabled: boolean, parity: 'any'|'odd'|'even'|'always-odd'|'always-even' }
  span: 'column'|'page'                'column'
  advancedDesign: { enabled: boolean, slot: DesignSlot, minHeight?: Dimension(abs) }
}
```
- **CRITICAL GOTCHA — H1 page break.** With `headings` absent, H1 defaults to
  `breakBefore: {enabled:true, parity:'always-odd'}` (blank separator page + recto). As soon as
  you provide ANY `headings` object, levels without an explicit `breakBefore` resolve to
  `{enabled:false, parity:'any'}` — including H1.
  Always spell out `levels[0].breakBefore` for chapter openers. (Verified: `{headings:{fontFamily:'X'}}` on a two-H1 doc gives 1 page; no headings key gives 3.)
- `numberingTemplate` tokens: `{1}`…`{6}` = counter of that level, optional style suffix
  `{1:I}` upper roman, `{1:i}` lower roman, `{1:A}`/`{1:a}` alpha, `{1:01}` zero-padded;
  other text literal; `\{` escapes. Empty counters collapse with their separator.
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
  block box in its column. Reserved height = max(design bottom, `minHeight`); elements
  anchored to `'page'`/`'bleed'` above the heading don't add height. Use `minHeight` to push
  the text down to where the book's first text line starts (e.g. 52mm opener).
- Heading slot placeholders: `{titleText}`, `{number}`, `{numberDecimal}`, `{numberRoman}`,
  `{numberRomanLower}`, `{numberAlpha}`, `{numberAlphaLower}`, `{chapterNumber}`, `{chapterTitle}`,
  `{partTitle}`, `{partNumber}`, `{pageNumber}`, `{totalPages}`, `{title}`, `{subtitle}`,
  `{author}`, `{publishDate}`, `{attr.<key>}` (heading-line attribute `# T {author="…"}`,
  falling back to the chapter H1's).
- Headings are never hyphenated; bold inside a heading uses the heading weight.

### 5.2 `headings.balancing` — ColumnBalancingConfig (vertical justification)
Defaults:
```
enabled true | maxLinesPerHeading 4 | stretchAfterLists true | maxLinesAfterList 1
stretchAfterFloats true | maxLinesAfterFloat 1 | looseParagraphs true | maxLooseParagraphs 2
trackParagraphs true | maxTracking 10 (‰ em) | trailing true | beforeSpan true
```
Levers in order: box closing a short column pushed to the foot → extra grid lines above headings
(favouring lower level numbers) → after list ends → under top floats → loose paragraphs
(TeX looseness +1, within `bodyText.maxWordSpacing`, optional ≤ maxTracking positive tracking).
`trailing`: level the closing band of a chapter (short last page → equal-height columns).
`beforeSpan`: level the columns a `span:'page'` callout interrupts. Disable `enabled` for
ragged-bottom books.

---------------------------------------------------------------------------------

## 6. `headingStyles[]` — HeadingStyleConfig

Applied with `# Title {style="id"}`. Two effects: (1) overrides the heading's level fields;
(2) governs the **section** it opens (its pages until the next heading of same or higher level):
running heads, margins, layout, body typography, palette.
```
{ id: string (REQUIRED), name?: string,
  numbered?: boolean = true      false: no counter advance, no number, {chapterNumber} empty (preface, index)
  toc?: boolean = true           listed by :::toc (heading can override {toc="false"})
  // any HeadingLevelConfig field except level/numberingTemplate:
  fontFamily, fontSize, lineHeight, color, fontWeight, marginTop, marginBottom, italic,
  textTransform, breakBefore, span, advancedDesign
  header?: DesignSlot, footer?: DesignSlot      replace document running heads on the section's pages ({elements:[]} = none)
  margins?: PageMargins                          each side inherits page margin; pair with breakBefore
  layout?: LayoutConfig                          e.g. {layoutType:'single'} — resolved from scratch (unset fields = layout DEFAULTS, not the document layout!)
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
  align='center' ('left'|'center'|'right'), verticalAlign='middle', lineHeight=1.2 (number × fontSize),
  letterSpacing?: Dimension (≥0, em = font size), textTransform?: 'none'|'uppercase',
  hyphenate?: boolean (wrap only), box?: ElementBoxStyle,
  dropCap?: { lines=2, fontFamily?, fontWeight?, fontSize?, color?, gap? },
  paragraphIndent?: Dimension     ('\n' in content separates paragraphs)
  parity?, pages? }
```
Element defaults are NOT the built-in header's (Open Sans 8pt/600 main colour) — set everything.
Resolver falls back to `overflow: 'ellipsis-end'` if omitted; use `'wrap'` for multi-line titles
with a fixed `size.width`.
Header/footer placeholders: `{pageNumber}` (the page LABEL, e.g. "xii"), `{totalPages}`,
`{title}`, `{subtitle}`, `{author}`, `{publishDate}` (front matter), `{chapterTitle}` (latest H1),
`{chapterNumber}`, `{partTitle}`, `{partNumber}`, `{attr.<key>}` (chapter H1 attribute).

**rule**: `{ kind:'rule', id, placement, direction: 'horizontal'|'vertical', color: ColorValue (req), thickness: Dimension (req) }`
— length from `size.width` (horizontal) / `size.height` (vertical); `'fill'` = to frame edge.

**box**: `{ kind:'box', id, placement (with size), style: ElementBoxStyle }`
`ElementBoxStyle = { backgroundColor?, borderColor?, borderWidth?, borderRadius?, padding?: {top,right,bottom,left} }`
(stroke painted inside; radius clamped). Use for colour bands, thumb tabs, backdrops.

**image**: `{ kind:'image', id, placement, resourceId }` — bitmap/SVG resource
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
caption labels, table text/rules, callout frames). So link section-coloured things to one
palette id (e.g. `band`) and give each part its own `palette="band=#…"`.
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
                  height = 2em (two body lines), marginTop=0, marginBottom=0 }
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
levels[]: { level 1–5, bulletChar, fontFamily, fontSize, color, fontWeight, italic, indent, verticalOffset }
taskCheckboxChar '☐', taskCheckedChar '☑', taskCompletedStrikethrough true, taskCompletedColor?
```
orderedLists
```
fontFamily = body, color = main-color, fontWeight = 700, italic = false  (number marker)
numberFormat = 'arabic'|'lower-alpha'|'upper-alpha'|'lower-roman'|'upper-roman'  ('arabic')
separator = '.', numberFontSize = 1em, gap = 0.5em, indent = 0em, numberVerticalOffset = 0em
marginTop/Bottom = 1.5em, itemSpacing = 0em, hangingIndent = true
separatorFontFamily / separatorFontWeight / separatorItalic / separatorColor  → inherit number style
separatorGap = 0em  (a differing separator style draws the separator as its own run)
levels[]: { level 1–5, numberFormat, separator, fontFamily, fontSize, color, fontWeight, italic,
            indent, verticalOffset, separatorFontFamily, separatorFontWeight, separatorItalic,
            separatorColor, separatorGap }
```
Numbers are right-aligned within a run. List margins of 1.5em are large — books usually want
`{0.5,'em'}` or a pt value. Nested list depth in markdown = 2 spaces per level (max 5).

---------------------------------------------------------------------------------

## 11. `paragraphStyles[]` — ParagraphStyleConfig

`:::paragraphs{style="id"}` … `:::` (bibliography, glossary, signature, dedication, credits).
```
{ id (REQUIRED), name?,
  fontFamily, fontSize, lineHeight (em = own size), color, textAlign, boldColor,
  hyphenation: boolean, firstLineIndent        → inherit bodyText
  hangingIndent: Dimension = 0   (non-zero replaces firstLineIndent)
  spaceBetween = 0, marginTop = 0, marginBottom = 0 (minimum; flow snaps back to grid after) }
```
No `fontWeight`/`italic`: weights follow the body text (use markdown `**…**`). Inside the
container the flow leaves the baseline grid.

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
  fixed = { anchor: {to:'container', edge:'bottom-left'}, offset: {x:0pt, y:0pt} }   for placement:'fixed' (container = content area)
  floatBarrier = false               pending figures placed before this box (chapter-closing summaries)
  width = 'fill'                     'auto' = shrink-wrap title only (badge), children ignored
  backgroundEnabled = true, background = #f4f4f4
  border = { enabled=false, color=#cccccc, width=0.5pt }
  borderRadius = 0em
  padding = { top, right, bottom, left } = 0.75em each
  stripe = { enabled=false, side='left'|'right'|'top', width=1.5em, color=main }
  icon = { kind='none'|'glyph'|'resource', glyph='', resourceId='', fontFamily=headings font,
           fontWeight=400, size=1.5em, width? (non-square box), color=main, align='top'|'center',
           position='inline'|'corner', cornerSide='right'|'left'|'outer'|'inner' }
  label = unset (no tab). If set: { fontFamily=headings, fontSize=body size, fontWeight=700,
           color=#fff, background=main, position='top-right'|'top-left', height=1.4em, paddingX=0.6em,
           offset=0, inset=0, icon:{resourceId,width=1em,gap=0.3em}, rule:{enabled=false,color=main,width=0.5pt} }
           prints the fence `label` attribute ("RECUADRO 1-1")
  marker = { kind='none', glyph, resourceId, fontFamily, fontWeight=400, size=1.5em, color=main,
             align='center', gap=0.5em, rule:{enabled=false, color=main, width=0.5pt, length=0} }
             icon + vertical rule OUTSIDE the box on its left
  titleStyle = { fontFamily=headings font, fontSize=body size, fontWeight=700, italic=false,
                 color=main, textTransform='none'|'uppercase', gap=0.5em, letterSpacing=0, indent=0 }
  body = { fontFamily, fontSize, lineHeight, color, boldColor, italicColor,
           textAlign: 'left'|'justify', hyphenation: boolean, paragraphSpacing, firstLineIndent }   → inherit bodyText
  lists = { bulletChar, color, indent, gap, itemSpacing, bulletFontSize?, bulletFontWeight? }  → inherit unorderedLists
  columnGap = 1.5em                  for :::columns{count=N} groups inside the box
  marginTop = 0.75em, marginBottom = 0.75em (minimum; grid-snapped after)
  snapToGrid = true                  false = exact marginBottom (stacked-box worksheets)
  keepTogether = true                false = may split between children / lines; continuation drops title+icon
  splitMinLines = 2 }
```
Gotchas: `body.textAlign` only `'left'|'justify'`. Callout body inherits body text colours,
so boxes with coloured bold need `body.boldColor`. `span:'page'` in a multi-column layout cuts
the page into bands (text above levelled). Nested callouts take their own style but ignore
span/placement/floatBarrier/snapToGrid.

---------------------------------------------------------------------------------

## 13. `chipStyles[]` — ChipStyleConfig

Inline `:chip[text]{style="id"}` (word banks, keys, tags). Chip without style → first style.
```
{ id (REQUIRED), name?, backgroundEnabled=true, background=#e8eef7, borderColor=main,
  borderWidth=0.5pt (0 = none), borderRadius=0.3em, paddingX=0.3em, paddingY=0.1em (paints outside line box),
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
- **Engine default types are English** ( uses `defaultResourceTypes` without
  locale). The sandbox injects `defaultResourceTypes(locale)` only when the config has none.
  For a non-English preset always declare `resourceTypes` explicitly (and translate per locale
  via `localized.<lang>.config.resourceTypes` in preset.json).
- Numbering follows first `:ref` in reading order; `{h1}` is the chapter number (continues across chapters in book mode).
- Pair `{h1}.{n}` with `resetOn:'h1'`.

---------------------------------------------------------------------------------

## 16. Tables — `tableStyle` and `tableStyles[]`

tableStyle; fonts/colours inherit bodyText:
```
bodyFontFamily, bodyFontSize, bodyColor           → body text
headerFontFamily, headerFontSize, headerColor     → body text
headerBold = true, headerItalic = false
headerBackgroundEnabled = true, headerBackground = #f0f0f0
bodyBackgroundEnabled = false, bodyBackground = #ffffff
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
No zebra striping key (use per-cell `background`).

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

`{ enabled = true, fontSizeScale = 1.0, color? (= body), marginTop = 0.8em, marginBottom = 0.8em }` (MathJax SVG).

---------------------------------------------------------------------------------

## 20. Fonts — `customFonts` and what goes in preset.json

`CustomFontFamily = { name, variants: [{ weight 100–900, style 'normal'|'italic', fileId, format 'woff2'|'woff'|'ttf'|'otf', fileName? }], redistributable?: boolean (default true) }`.
- Any `fontFamily` string resolves against customFonts first, then Google Fonts.
- Needed variants: at least 400/700 normal+italic (else "missing variant" warning); if the book
  uses semibold for bold, provide 600 and set `bodyText.boldFontWeight: 600`.
- `.woff` is rejected by the PDF backend and skipped by the preset loader — use woff2/ttf/otf.

**preset.json** — `version: 2` manifest (full reference: project-format.md):
```
{ version: 2, id, name, description?, locale?, locales?, thumbnail?, license?, credits?, tags?,
  default?, view?: { canvasScope?: 'book'|'chapter' },
  chapters: [{title, file}] | { "<locale>": [{title, file}] },
  config: PostextConfig,                          // WITHOUT customFonts
  resources: [ Resource minus createdAt/updatedAt/bitmap/svg, plus file?, pdfFile?, width?, height?, note? ],
  fonts: [ { name, variants: [{ weight, style, file: "fonts/X.woff2" }], redistributable? } ],
  localized?: { "<locale>": { config?: Partial<PostextConfig> (top-level keys REPLACED wholesale),
                              resources?: [{ id, caption?, note?, altText?, table?, file?, pdfFile?, width?, height? }] } } }
```
Must NOT go in `config`: `customFonts` (built from `fonts[]`; fileIds are storage-local —
anything in config.customFonts is concatenated and would point at nothing), resource payloads,
metadata (front matter of chapter 1), `view` (top-level of the manifest, not config).
`debug` is harmless but pointless. `localized.<lang>.config.X` replaces the whole `X`
(e.g. restate the complete `resourceTypes` or `colorPalette` array per locale).

---------------------------------------------------------------------------------

## 21. Output / viewer / debug

`pdfGeneration`: `{ outlines = true, forceColorSpace = false, colorSpace = 'cmyk'|'rgb'|'grayscale' ('cmyk'), accessible = true (tagged PDF/UA-1, lang = config.locale) }`.

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
4. `bodyText.textAlign`, `headings.textAlign`, caption `note.align`: docs list 2 values; type is full `TextAlign` (`left|justify|center|right`).
5. H1 `breakBefore` default only survives when `headings` is entirely absent (docs imply per-level default).
6. `defaultResourceTypes(locale)` is locale-aware, but the engine calls it without locale (English) when `resourceTypes` is unset; only the sandbox localizes.
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
