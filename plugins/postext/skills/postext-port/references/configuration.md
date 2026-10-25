# Postext configuration manifest (`PostextConfig`)

The `config` object of `preset.json`: everything visual about the book. Written
for an agent reproducing the design of an existing publication. Checked against
the engine source (postext 1.46); where the online docs disagree, this file is
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
  math → header/footer → parts → headingStyles → toc. In a project in several
  languages, `localized.<lang>.config` is merged over `config` field by field
  before this runs (configVersion 21; below 21 it replaces whole top-level
  keys; project-format.md §2).
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
  every `headings.levels[].fontSize`, design-element `fontSize`, design `placement.offset.x/y`
  (rule, box and image elements; a text element's offset takes em of its own size since 1.9),
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
{ hex: string, model: 'hex' | 'rgb' | 'cmyk' | 'hsl', cmyk?: { c, m, y, k }, paletteId?: string }
```
- `hex`: `#rrggbb`, `#rgb`, `#rgba`, `#rrggbbaa`, `rgb()` / `rgba()` (comma or space syntax, alpha as number or %), or `'transparent'`. Translucent colours paint the same on canvas, HTML and PDF (ExtGState alpha); PDF/X-1a flattens them.
- `model` says how the colour was specified; screens draw `hex`.
- `cmyk` (percent, postext ≥ 1.22): the exact process values of a colour authored in CMYK (an
  InDesign CMYK swatch, a brand colour). A CMYK print render (`print`, §21) sets them as they
  are; `hex` is their screen rendering. Put them on the palette entry: every linked use follows.
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
| `layout` | LayoutConfig | §3 | `single` / `double` / `oneAndHalf` / `multiple` (3–8 columns, ≥ 1.18) |
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
| `markStyles` | MarkStyleConfig[] | `[{id:'mark'}]` (pale yellow) | §13b inline `:mark[…]{style=…}`, postext ≥ 1.34.1 |
| `exerciseStyles` | ExerciseStyleConfig[] | `[{id:'exercise'}]` | §13c `:::exercise{style=…}` — declaring replaces the default list |
| `exercises` | ExercisesConfig | — | §13c edition (student/teacher), solutions placement, shuffle seed, screen editions |
| `codeStyle` | CodeStyleConfig | §12b | code listings (```` ``` ```` / `~~~` fences, postext ≥ 1.23): face, box, tab width, long lines, line numbers, token colours, inline code |
| `resourceTypes` | ResourceType[] | Figure + Table + Video in the document language (a list without `video` still numbers video resources with the built-in one; `locale`, else the hyphenation locale; English for other languages) | §15 numbering, caption prefix, default placement |
| `tableStyle` | TableStyleConfig | §16 | document table style |
| `tableStyles` | NamedTableStyleConfig[] | `[]` | §16 per-table via `resource.table.styleId` |
| `captionStyle` | CaptionStyleConfig | §17 | + per-type overrides |
| `diagramStyle` | DiagramStyleConfig | `{singleInk:false, inkColor: main-color, inlineFonts:true}` | §18 |
| `scoreStyle` | ScoreStyleConfig | §18b | music scores (≥ 1.54): staff size, music font, text font, spacing, bar numbers, system gap, margins, ink, keep rule |
| `scoreStyles` | NamedScoreStyleConfig[] | `[]` | §18b per score via fence `style="…"` or `resource.score.styleId` |
| `videoStyle` | VideoStyleConfig | §18a | video resources (≥ 1.16): play mark, QR code, poster link, HTML/EPUB player options |
| `math` | MathConfig | §19 | |
| `footnotes` | FootnotesConfig | §19a | `[^id]` notes: placement, numbering, type, rule |
| `crossRefs` | CrossRefsConfig | §19a2 | words of heading/anchor references, default style, label breaking (≥ 1.12) |
| `citations` | CitationsConfig | §19a3 | CSL style, locale, markers, note mode, numbering, bibliography (≥ 1.12; needs postext-citeproc) |
| `index` | IndexConfig | §19b | what `:::index` prints: type, indents, separators, ranges, letter heads |
| `cjk` | CjkConfig | §19c | Chinese, Japanese and Korean composition: region, line breaking, punctuation widths, Han–Latin space, character grid, upright digits, marks, ruby, warichu (postext ≥ 1.9); Japanese summary §19c2 (≥ 1.16) |
| `lineNumbers` | LineNumbersConfig | §19f | line numbers in the margin, the gutter or the side column (postext ≥ 1.23): verse or every body line, interval, restarts, position, face; off by default |
| `comics` | ComicsConfig | §19e | comic pages and strips (`:::page`, `:::strip`, postext ≥ 1.20): reading direction, frame, gutters, panel styles, lettering, balloon styles, cast; full reference in comics.md |
| `colorPalette` | ColorPaletteEntry[] | `[main-color #295AA3]` | §0 |
| `locale` | LocaleTag (any BCP 47 tag: `'es'`, `'es-ES'`, `'pt-BR'`, `'zh-Hant-TW'`) | `'en-us'` | document language: hyphenation fallback, built-in resource types and table continuation strings, PDF `/Lang`, HTML `lang`. Chinese: the script picks the strings (图/圖), the region the `cjk` defaults (§19c); hyphenation is off. Japanese (`'ja'`, `'ja-JP'`; never `'jp'`, ≥ 1.16): the `japan` region (§19c2), 図/表, （続き）, 第{n}章 references, 参考文献, `{1:一}` = 百一 (japanese-informal), note defaults by writing mode (§19a), gojūon index, ja-JP citations, JAN glyph forms in the PDF |
| `direction` | `'auto'`\|`'ltr'`\|`'rtl'` | `'auto'` | base direction (postext ≥ 1.15): `auto` = `rtl` when the `locale` script is written right to left (ar, fa, ur, he…). An RTL document is laid out in a **mirrored frame**: first column on the right, indents/list markers/floats/notes on the right, `page.binding: 'auto'` → right. Body-flow `left`/`right` keywords are flow-relative (a preset converted LTR→RTL keeps working); header/footer slots stay physical. Blocks: `{dir=ltr\|rtl}` on headings and `:::` containers; inline `:ltr[…]`/`:rtl[…]` isolates. Never set `'rtl'` with a non-RTL locale |
| `numerals` | `'auto'`\|`'latn'`\|`'arab'`\|`'arabext'` | `'auto'` | digits of every engine-generated decimal number (pages, lists, notes, counters, `{h1}`/`{n}`, `{totalPages}`): `auto` = `arab` ٠–٩ for `ar` (Maghreb `ar-MA/DZ/TN/LY/MR/EH` → `latn`), `arabext` ۰–۹ for `fa`/`ps`/`ur-IN`, else `latn`; named formats print as named |
| `customFonts` | CustomFontFamily[] | — | §20 **do not write in preset.json config** |
| `htmlViewer` | HtmlViewerConfig | §21 | screen-only; `overrides` = partial config merged for HTML |
| `canvasViewer` | `{ pageGap?, rowGap? }` | `24` / `24` | §21 Sandbox Canvas page spacing (≥ 1.43); `pageGap: 0` for art across the spine |
| `composedViewerLeaf` | `{ width, height, margins? }` | — | host only (≥ 1.47): the Sandbox's HTML viewer lays composed pages on this print leaf, as `comics.viewerLeaf` does comic pages; **do not write in preset.json config** |
| `pdfGeneration` | PdfGenerationConfig | §21 | outlines, tagging, colour space |
| `print` | PrintConfig | §21 | PDF/X standard, ICC output profile, black (K-only, overprint, rich black), preflight (≥ 1.22) |
| `contrast` | ContrastConfig | §21 | contrast check of text on its ground (≥ 1.28): `level` AA/AAA, `mode` auto/screen/print/both, `reversedText` sizes, `allow` accepted pairs (>= 1.52); layout ignores it |
| `folio` | FolioConfig | §21 | Folio 3D viewer only: tilt, yaw, paper stock, binding (type, covers, spine image), surface, lighting |
| `debug` | DebugConfig | §21 | editor overlays + warning toggles; no effect on output |
| `checks` | `{ contentInConfig?: { enabled?, allow?, maxWords?, maxChars? } }` | §19h | the `contentInConfig` check of design texts (postext 1.34; read by `preset_kit.py lint` on any version); out of the layout key; an older engine ignores the key |
| `pageTemplates` | PageTemplate[] | §19g | composed-page templates (read and checked from 1.34.0, laid out from 1.34.1, groups and spreads from 1.35.0, `fit` from 1.36.0, continuation from 1.37.0, continue-before-shrink, `page:` jumps, ruled frames, vertical spreads from 1.38.0; frame `writingMode`/`direction`, label checks from 1.39.0; label styles that switch off a borrowed italic, frames in their own mode on right-to-left pages from 1.40.0; connectors, path elements, box shapes, repeating grids, modules and the overlap checks from 1.48.0; round 2, composed-pages.md) |
| `labelStyles` | LabelStyle[] | §19g | styles of `::label` words on pictures (read from 1.34.0, drawn from 1.37.0, vertical and checked from 1.39.0; `fontStyle` / `textTransform` left unset follow a borrowed paragraph style from 1.40.0; leaders, keys (`kind: 'legend'`), plates with outlines from 1.48.0) |

Not configurable (no config exists — don't look for it): margin notes (emulate with
`span:'side'` callouts; footnotes and endnotes are `footnotes`, §19a), a blockquote's own family, size,
leading or alignment (quotes take the body's; colour, italics and indents are `bodyText.blockquote`),
table line height (= body leading ratio × table font size), heading hyphenation (off),
per-level heading `textAlign` (only `headings.textAlign`). Document metadata (`{title}`,
`{subtitle}`, `{author}`, `{publishDate}`) comes from the **front matter of the first chapter**,
not from the config.

---------------------------------------------------------------------------------

## 2. `page` — PageConfig

```
page
├─ sizePreset   '11x17'|'12x19'|'17x24'|'21x28'|'custom'   default '17x24' (cm, W×H)
│               + 'broadsheet' 375×597 mm | 'berliner' 315×470 mm | 'tabloid' 280×430 mm
│                 | 'compact' 297×420 mm (half-broadsheet fold)   postext ≥ 1.18
├─ width        Dimension   default from preset (17 cm)    explicit value always wins
├─ height       Dimension   default from preset (24 cm)
├─ margins      PageMargins
│   ├─ top      default 2 cm
│   ├─ bottom   default 2 cm
│   ├─ left     default 1.5 cm   (= INNER/spine margin when mirror:true)
│   ├─ right    default 1.5 cm   (= OUTER margin when mirror:true)
│   └─ mirror   boolean, default false. Odd pages keep left/right as written, even pages swap.
├─ backgroundColor  ColorValue, default {hex:'transparent'}
├─ dpi          number, default 300: the layout's px per inch (the px unit). Not image resolution, but a
│               bitmap with no resolution of its own prints at this many ppi: keep 300 for print, or
│               give pictures a resolution (layout.bitmapResolution / bitmap.resolution, ≥ 1.24)
├─ cutLines     { enabled=false, bleed=3mm, markLength=5mm, markOffset=3mm, markWidth=0.25pt, color=#000 }
├─ baselineGrid { enabled=false, color=#cccccc, lineWidth=0.5pt }   VISUAL OVERLAY ONLY
├─ pageNumbering { format='decimal'|'lower-roman'|'upper-roman'|'lower-alpha'|'upper-alpha'|<East Asian style, §10>, startAt=1 }
└─ binding      'auto'|'left'|'right', default 'auto' (= 'right' when layout.writingMode is 'vertical-rl', the document is right to left, or its comics section reads right to left: a manga, a ja/zh-Hant edition, postext > 1.20.2)   postext ≥ 1.9
```
Gotchas
- Page 1 is odd (recto). With `mirror: true`, `left` is the spine margin on every page.
- `binding: 'right'` (vertical Chinese and Japanese books, Arabic/RTL books and comic books read right to left, by default): page 1 is still the recto but sits on the
  LEFT of its spread; with `mirror: true` the odd pages carry the inner (`left`) margin on their right.
  The Sandbox shows spreads `[3 | 2]`, the PDF asks viewers for `/Direction /R2L`. Folio templates do not
  swap sides by themselves: set odd/even elements for the right edge.
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
├─ layoutType         'single' | 'double' | 'oneAndHalf' | 'multiple'   default 'double'  (!)   'multiple' postext ≥ 1.18
├─ columnCount        number, whole 3–8                       default 3   multiple only (else clamped + columnCountClamped)
├─ gutterWidth        Dimension (absolute!)                  default 0.75 cm
├─ sideColumnPercent  number (0–100)                         default 33   oneAndHalf only
├─ sideColumnRole     'text' | 'floats'                      default 'text'   oneAndHalf only
├─ sideColumnSide     'right'|'left'|'outer'|'inner'         default 'right'  oneAndHalf only
├─ columnRule         { enabled=false, color=#cccccc, lineWidth=0.5pt }
├─ fitFiguresToPage   boolean                                default false (HTML viewer sets it)   hard cap at the content area
├─ bitmapResolution   'document'|'file'|number                default 'document'   ≥ 1.24 natural size of bitmaps without
│                                                             their own bitmap.resolution: 'document' = pixels at page.dpi;
│                                                             300 = every such bitmap at 300 ppi; 'file' = the file's
│                                                             pHYs/JFIF/EXIF (bitmap.fileResolution), 72/96 = unset
├─ floatShrink        { mode='never', minScale=0.7 }          ≥ 1.24 document default of placement.shrink / minScale (see §ResourcePlacement)
├─ wrap               { gap?, minTextWidth=12em, minLinesBeside=2, defaultWidth=0.45 }   ≥ 1.24 text wrap defaults (placement.wrap, callout wrap); gap unset = one body line; minTextWidth a Dimension or a share of the column
├─ floatsAtCitingPage boolean                                default false  ≥ 1.25 document default of placement.citingPage (see §ResourcePlacement)
├─ maxTopFraction     number                                 default 0.7    ≥ 1.25 largest share of the column a float heading its citing page takes (with the floats already there)
├─ hugClosingFloats   boolean                                default true   closing page: page-wide floats below the last text move up under it
├─ floatsUnderOpener  boolean                                default true   ≥ 1.25 under a span:'page' opener over 2+ text columns, the head of column 1 is a top slot; false = floats land from column 2, as ≤ 1.24 (a preset below configVersion 11 that sets a page-span heading reads false)
├─ openerFloats       'allow' | 'warn' | 'avoid'             default 'allow'  ≥ 1.28 floats on an opener page (a part's page, the page a heading opens with breakBefore or span:'page', the first page of a document that starts with a heading): 'warn' = same layout + one `openerFloat` warning per float; 'avoid' = the page takes no float, each goes to the first slot after it (inline 'here' resources, 'fixed' and span:'side' boxes stay)
├─ inlineResourceGap  'around' | 'above'                     default 'around'  (a preset without configVersion ≥ 5 reads 'above')
├─ inlineResourceGapInBoxes boolean                          default true  (a preset below configVersion 6 reads false)
├─ inlineCaptionSide  boolean                                default true  ≥ 1.28 a 'here' resource takes placement.captionSide: caption + note in the float-only side column, level with the body's top, where that column is free beside it (else under the body); false = column floats only (a oneAndHalf preset below configVersion 12 whose chapters embed a ::resource reads false)
├─ boxChildSplitMinLines number                              default 2  lines of a paragraph/item a box cut leaves per side (a preset below configVersion 6 with a :::callout reads 1)
├─ flowColumns        boolean                                default true   ≥ 1.25 :::columns outside a box sets sub-columns in the text (span="page" across a multi-column page), and a group, in a box or in the text, is cut across columns/pages; false = 1.24 (fence ignored outside a box, group never cut; a preset below configVersion 11 with a :::columns fence reads false)
└─ writingMode        'horizontal-tb' | 'vertical-rl'         default 'horizontal-tb'   postext ≥ 1.9; a heading style's layout may set its own
```
Geometry:
- `double`: two equal columns, `colW = (contentW − gutter)/2`.
- `multiple` (≥ 1.18): `columnCount` = n equal columns, `colW = (contentW − (n−1)·gutter)/n` (newspapers:
  broadsheet 6–8, tabloid 4–5). Column rules, balancing, footnotes, page-span floats/boxes/headings work
  across all of them. A heading style's own `multiple` layout takes the document's `columnCount` unless it
  sets its own. A count outside 3–8 or fractional is clamped and reported (`columnCountClamped`).
- `oneAndHalf`: `sideW = contentW × sideColumnPercent/100`; `mainW = contentW − sideW − gutter`.
  So to reproduce a book with main column M mm, side column S mm, gutter G mm:
  `contentW = M+S+G` (= page width − inner − outer margin), `sideColumnPercent = 100·S/contentW`
  (fractional values are fine, e.g. 30.5556).
- `sideColumnSide: 'outer'|'inner'` flips with parity **only when `page.margins.mirror` is true**
  (outer = right on recto, left on verso). Without mirror, outer = right, inner = left.
- `sideColumnRole: 'floats'` = textbook margin column: body text never enters it; it receives
  resources / callouts with `span: 'side'` (stacked beside their first reference; side figures
  stack from the head of the channel on the citing page). `'text'`: text flows main → side column.
  A side box its page's channel cannot hold takes the next page's. Where the chapter ends first, each
  box still waiting takes the channel of a page after the text, in fence order (≥ 1.25; ≤ 1.24 dropped
  all but the first such page), and the build reports each one (`afterText`): fence the glosses of a
  short chapter early, or shorten them, until no `afterText` is left. A box taller than an empty
  channel is set anyway (`calloutOverflow`).
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
- `writingMode: 'vertical-rl'`: the page is laid out as a horizontal page turned a quarter turn clockwise.
  Lines are columns read from the right; a layout column is a **tier** stacked top to bottom (`double` = two
  tiers, the column rule horizontal between them, not balanced at a chapter end unless
  `headings.balancing.enabled`); the flow's "top" is the sheet's right edge (openers, top floats), footnotes at
  the left end of each tier; figures and tables stand upright with horizontal captions and cells
  (`placement.rotate` is ignored there, warning `rotateIgnoredVertical`); running heads and folios stay
  horizontal on the sheet. `page.margins` keep their sheet names.
- `hugClosingFloats: false` leaves a `position: 'bottom'` float at the foot of a chapter's closing
  page, as on every other page (default: it moves up to sit one float gap under the last text).

---------------------------------------------------------------------------------

## 4. `bodyText` — BodyTextConfig

Typography
```
bodyText
├─ fontFamily        string          'EB Garamond'   a customFonts family, or one on Google Fonts / Fontsource
├─ figureStyle       FigureStyle     unset (font's)  figures of the running text, e.g. 'oldstyle' (§20a); paragraph styles,
│                                                   tables, captions, lists and box bodies that take the body family take them too
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
├─ emphasis          'auto'|'italic'|'bold'|'color'|'overline'   'auto'   how *…* is set; auto = bold for Arabic-script locales, else italic; Arabic letters are never slanted
├─ tashkil           'keep'|'strip'|'strip-vowels'   'keep'      Arabic vowel marks out of the set text (strip-vowels keeps shadda)
├─ textAlign         'left'|'justify'|'center'|'right'|'start'|'end'   'justify'   left = the side a line STARTS on (the right of an Arabic paragraph); start/end are synonyms
├─ paragraphSpacing  boolean|Dimension  false        true = one full grid line between paragraphs; a length (≥ 1.52, #1115: {2,'mm'}, {0.33,'em'}) = exactly that, in the flow, boxes and frames; off-grid until the next heading/list tail snaps back. Same slot as paragraphStyles[].spaceBetween (which wins inside :::paragraphs); boxes: calloutStyles[].body.paragraphSpacing
├─ firstLineIndent   Dimension       1.5 em          set {0,'mm'} for block paragraphs
├─ hangingIndent     boolean         false           indent all lines but the first
├─ indentAfterHeading boolean        true            false = first paragraph after a heading unindented (classic book style)
├─ blockquote        { color=#666666, italic=true (false in an Arabic-script document, ≥ 1.15), indent=0, firstLineIndent=<body's> }   how `> …` quotes are set (colour palette-linkable; indent = every line, first line counted from it)
├─ verse             { layout='auto', indentStep=0.5em, turnover='hang', hang=2em, turnoverMark='[', stanzaSpace=1, keepStanzas=0, tighten=true }   (≥ 1.23) defaults of `:::verse` poems set line by line; the fence's attributes of the same name win. layout 'bayt' = 1.22's centred single hemistichs for poems with no `||` (stored configs < 9 get it); stanzaSpace in lines of the poem's leading; tighten (≥ 1.24) = a line a little wider than the measure shrinks its word spaces down to minWordSpacing and stays on one line, only a line still too wide turns over (false = 1.23: every overlong line turns over; stored configs < 10 with a line-by-line poem get false)
├─ tabStops          TabStop[]       unset           (≥ 1.23, §4a) tab stops of every paragraph, list item and quotation; a paragraph style or a callout body that sets its own replaces them
├─ tabInterval       Dimension       unset           (≥ 1.23, §4a) default stops every interval past the last stop, from the start of the measure; unset = a tab past the last stop is a word space
└─ hyphenation       { enabled=true, locale=<config.locale ?? 'en-us'>, ragged=false, zone=3em, compounds=true, exceptions=none, capitalized=true }
                      locale: any BCP 47 tag; patterns for 'en-us'|'es'|'fr'|'de'|'it'|'pt'|'ca'|'nl' (region ignored; other languages → en-us + console warning)
                      ragged: also hyphenate ragged text, only where the word does not fit and sending it down would leave a gap wider than zone (em = text size); line by line ≤ 2 hyphenated lines in a row, with optimalRagged two in a row are only discouraged
                      compounds: false = the dictionary leaves a word with a hyphen between two letters whole; it breaks only after that hyphen (TeX; after- | dinner, never af- | ter-dinner)
                      'ca' (≥ 1.14) follows the IEC: two letters each side, hiatus kept, no break after an apostrophe,
                      prefixes (vos-altres), l·l breaks il- | lusió (the dot dropped, the line measured without it).
                      Type the dot as U+00B7 `·`: a PDF's `l.l`, `l•l`, `l∙l` (U+2219) or `ŀl` (U+0140) splits or
                      misses the word; normalise it when porting
```
H&J / Knuth–Plass
```
├─ optimalLineBreaking  boolean  true   Knuth-Plass (false = greedy); a paragraph holding a tab is always set greedy (§4a)
├─ optimalRagged        boolean  true   ragged running text (body, blockquotes, lists, ragged paragraph styles, box bodies, part and section bodies) broken with Knuth-Plass too: even edge, runt rules work;
│                        false = line by line (1.4; a preset without configVersion 7 that sets running text ragged reads false)
├─ breakAfterDashes     boolean  true   a line may end after an em/en dash set closed between words (say—that's, riddles.—I); never after an opening dash (—dijo, said "—Hola), before punctuation, a quote or a bracket (thinking—" and, says—“no”), or inside 1914–1918;
│                        false = 1.4 breaks (a preset without configVersion 7 whose chapters set such a dash reads false)
├─ breakAfterHyphens    boolean  true   Knuth-Plass may end a line after a compound's hyphen (well- | known) in every paragraph;
│                        false = 1.4 breaks: a justified paragraph without formatting never breaks there (a preset without configVersion 8 whose chapters set a compound reads false)
├─ breakAfterSlashes    boolean  true   (≥ 1.53) formatted text, captions, cells, notes and bibliographies may end a line after a slash between two words,
│                        each side ≥ 3 letters/digits and not digit/digit (ACC/ | AHA, entrada/ | salida; km/h, kg/m³, and/or, 1/2, 10/03/2026 stay whole);
│                        a word wider than its line is divided after a slash first; a typed U+200B is a break with no width either way;
│                        false = 1.51 breaks, after a slash only inside a URL (a preset below configVersion 19 reads false)
├─ repeatHyphen         boolean  false  the line after a break at a compound's hyphen opens with a hyphen too (vencer- | -se; Portuguese, Spanish RAE 2010); line.repeatedHyphen; never in a URL
├─ hardLineBreaks       boolean  true   (≥ 1.23) a backslash ending a source line, or `\\` + space, is a forced line break in paragraphs, quotes, list items;
│                        false = 1.22: the backslashes print (a preset below configVersion 9 whose chapters end a line with `\` reads false)
├─ scriptContext        boolean  true   (≥ 1.28) a word with no letter (`46.`, `1367)`, `».`) is shaped in the script of the text around it: nearest letter
│                        before it in its isolate, else after; nearest right-to-left letter when painted right to left; the document's language with
│                        no letter near. Acts only in a face that draws punctuation or digits by script (Amiri: Latin stop and brackets in Latin
│                        text, Arabic ones otherwise) and in Latin/Greek/Cyrillic/Arabic/Hebrew contexts; `seg.scriptContext` ('Latn', 'Arab'…) says so,
│                        and canvas, HTML, fixed EPUB and PDF paint those forms at the measured width in every browser. Do NOT glue `46.` or
│                        `(d. 1367)` to the word before with a no-break space to keep Latin forms in an Arabic book: write ordinary spaces.
│                        A piece with no letter of a word that has one (`10.1006/`, `.2001` of a DOI broken at its joints, the rest of a word
│                        cut at the line end) takes the script it has inside the word, so a DOI sets solid in Noto Serif SC. In a zh/ja document
│                        a doubled ellipsis or dash (`……`, `——`, `――`) cited in a Latin sentence (`are marked …….`) keeps its Han forms
│                        (`seg.scriptContext` 'Hani'), the stop after it the sentence's: no `:ltr[…]`, no styled span.
│                        Not for list markers, :ref labels, design text, comics, CJK-composed paragraphs. false = shaped alone as ≤ 1.27, where
│                        each browser version and the PDF picked its own forms (every preset below configVersion 12 reads false)
├─ shapingLanguage      'document' | 'host'  'document'   (≥ 1.29; the default since 1.30) the language the text is measured, painted and embedded in.
│                        'document': the document's `locale` (a run's own with `{lang=…}`) on every measuring context and on the canvas, so the lines
│                        are the same on a page in any language and in a layout worker; HTML/EPUB `lang`, PDF OpenType language system (ZHS, JAN, CAT…).
│                        Since 1.30 the text is measured under it as it is painted: one width per string whatever was measured before, right-to-left
│                        words measured right to left in any face, a hyphenatable word set whole where it stays on one line in any paragraph
│                        (since 1.31; canvas, HTML, PDF), the two halves of a word broken at a line end measured as
│                        painted (the rest as a text of its own; a Catalan geminate head as `col-`), design text measured run by run in the direction
│                        each run is painted in. The PDF shapes word by word as Chrome's canvas does and takes each character from the font file the
│                        browser took it from when the font provider says which (postext-pdf `declaredFontFile(bytes, { unicodeRange, order })`).
│                        Up to 1.30.1 a paragraph without formatting measured each piece of such a word by itself, so a face's form across a
│                        hyphenation point (EB Garamond's `ff` in of·fice, Crimson Pro's wide Catalan l·l dot) showed in a paragraph with an
│                        italic and not in a plain one; under 'host' a plain paragraph still does.
│                        'host' (= ≤ 1.28; the default of 1.29.1–1.29.2): the measure and the canvas take the host page's language (none in a worker);
│                        HTML declares lang for CJK and RTL documents; the widths and the PDF are the ones it had. A word broken at a line end leaves
│                        a gap after its rest in a face whose language form needs both neighbours (Crimson Pro's Catalan l·l), on a page in that language.
│                        Set `locale` on every ported book (zh-Hans / zh-Hant / ja / ar / ca …): it decides glyph forms and line breaks, not only
│                        strings. Leave shapingLanguage unset when porting. Below configVersion 14 with no value named: 'host' (the pin; a named
│                        value is kept). The `postext` CLI (Skia) and render.mjs (fontkit) measure with no language: they always lay out with 'host'.
├─ maxWordSpacing       number   2      × normal space; also the cap for balancing "loose" paragraphs
├─ minWordSpacing       number   0.6    × normal space
├─ avoidRunts           true;  runtMinCharacters 20;  runtPenalty 1000;  avoidRuntsInLists true
│                        runtMinCharacters counts word spaces, not letters (a space ≈ ½ letter): 2 × N for a last line of N letters
│                        CJK: a paragraph does not end on one character (孤字, 泣き別れ): the line above gives one up and is spread to the measure.
│                        A line set left/right/center gives it up too and stands one character short. Manuscript paper (原稿用紙):
│                        cjk.grid.fullLines: true (≥ 1.28) keeps every square of such a line, and the paragraph may end on one character
├─ gradedRuntPenalty    false  true = a runt costs runtPenalty × (1 − width/threshold): a two-word ending costs less than one word
├─ tightenRunts         true   re-set a runt paragraph one line shorter (tighter spaces, ≤ maxRuntTracking; refused if a justified line passes max(maxWordSpacing, the paragraph's loosest justified line) or more lines go ragged)
├─ maxRuntTracking      10     thousandths of an em (10 = 0.01em), applied negatively
├─ kashida            'auto'|'none'   'auto' in an Arabic-script document, else 'none'   justified Arabic lines open spaces ≤ 1.25× then insert whole tatweels (U+0640) at raqim-kashida points; never Latin/digits/headings/ragged/last lines; plain and PDF-copied text leave them out
├─ kashidaPatterns    'auto'|'naskh'|'simple'|'nastaliq'   'auto' (from the body font: Ruqʿa/Dīwānī e.g. Aref Ruqaa → none, Nastaʿlīq → nastaliq, else naskh)
├─ kashidaPerWord     1       elongations per word
├─ kashidaMaxLength   0.6     em per join (whole tatweels)
├─ maxJustifyTracking   0      thousandths of an em, either way: a justified line past maxWordSpacing (or under minWordSpacing) takes letter spacing instead (0 = off; 10 is plenty; needs optimalLineBreaking)
├─ avoidOrphans         true;  orphanMinLines 2;  orphanPenalty 1000;  avoidOrphansInLists true
├─ avoidWidows          true;  widowMinLines 2;   widowPenalty 1000;   avoidWidowsInLists true
│                        on a character grid (cjk.grid.enabled, ≥ 1.28) avoidWidows defaults to false, and avoidOrphans too in the
│                        japan region: the page holds the lines its grid counts (a Chinese grid keeps avoidOrphans, 孤行). Set a key
│                        to choose otherwise; a preset below configVersion 12 on a grid reads avoidWidows true (and avoidOrphans true in Japan).
│                        avoidWidows = first lines at a column's foot, avoidOrphans = last lines at the next one's head (CSS names them the other way)
├─ shortListSplit       'allow'  ≥ 1.28 a list of ≤ shortListMaxItems items cut between columns: 'warn' = same layout + a `shortListSplit` warning per list cut; 'avoid' = the list moves whole to the next column (headings right above it and its colon line go with it; one taller than an empty column is cut and reported). The list orphan/widow flags only keep the LINES of one item together
├─ shortListMaxItems    3        most items (nested ones included) a list has to count as short
├─ slackWeight          10     pressure to fill columns (0 = off)
├─ keepColonWithList    true   paragraph ending in ':' stays with the list it introduces
├─ colonListRoom        'item' room kept under the colon line: 'item' = what the first item needs by the list orphan/widow rules
│                        (a 2-line item kept whole needs 2 lines); 'line' = one line (1.4; a preset without configVersion 6 reads 'line'
│                        when a chapter has a list after a line ending in ':')
├─ hyphenateAcrossColumns true false = re-break a paragraph so the last line of a column (or page) ends on a whole word, within the word-spacing limits (InDesign's Hyphenate Across Column); ragged text set with optimalRagged too (only its line ends move). 'withinPage' (≥ 1.28) = guard the page ends only: a word may be divided between two columns of one page, never (where the limits allow) at the foot of a page; fewer lines move than with false, the value to prefer in 2+ columns when the source only avoids hyphens at page ends; same lines as false in one column
└─ paragraphContainerSpacing 'collapse'  space under a :::paragraphs container: 'collapse' = max(spaceBetween, marginBottom,
                         the text's paragraph spacing) merged with the next block's own space above (a heading's marginTop);
                         'add' = 1.4 (style space baked into the grid snap, next block's space added under it; a preset
                         without configVersion 8 that declares a paragraph style reads 'add' when a chapter has :::paragraphs)
```
Gotchas
- Hyphenation only applies when `textAlign: 'justify'`, unless `hyphenation.ragged: true` (ragged text too, within `zone`). Words < 5 chars never break (2 before / 3 after).
- For a Spanish book set top-level `locale: 'es'` (hyphenation follows unless `hyphenation.locale` is set).
- **Keeping words whole (postext ≥ 1.28).** `hyphenation.exceptions: ['Alice', 'You-Tube']`: a word without a hyphen is never divided, one with hyphens only there (TeX's `\hyphenation`). An entry matches a run of letters (`(Alice,`, `Alice’s`, each part of a compound); an inflected form is another entry; lower case matches any case, an initial capital only capitalised occurrences (`'Rose'` leaves `rose` alone). `hyphenation.capitalized: false` keeps every capitalised word whole, sentence openers included (InDesign's "Hyphenate Capitalized Words" off; useless in German, where every noun has a capital). `citations.hyphenateNames: false` keeps the family names of the cited authors whole (`(Lup-` | `ton, 2010)` never happens). All three reach captions, cells, notes and design text too. Port the source's hyphenation exception list and its "capitalized words" switch to these; for one occurrence, a soft hyphen before the word (references/document-format.md §3.3). Up to 1.27 the only ways were a `hyphenation: false` paragraph style, a soft hyphen typed inside the word, or rewording.
- All widow/orphan/runt rules are soft penalties, never hard.
- No-break spaces (U+00A0, U+202F, U+2007) and the word joiner (U+2060) glue their neighbours on every breaker; type the character, not `&nbsp;`. U+00A0 is in practically every face; a face without U+202F/U+2007 gets half a word space / a digit width.

### 4a. Tab stops — `TabStop` (postext ≥ 1.23)

Text aligned at positions across the measure inside a paragraph: a menu's
prices flush right after the dish, a cast list's actors after a dot leader,
an exam question's marks at the margin, a form's blanks, a run-in index
entry's page numbers. **Set these as paragraphs with tab stops, never as
two-column tables, `:::space`, runs of no-break spaces or chips.** A tab is
written `:tab` in the text (document-format.md §10.9).

`tabStops?: TabStop[]` and `tabInterval?: Dimension` go in three places:
`bodyText` (every paragraph, list item and quotation), a paragraph style
(§11; replaces the body's, unset = the body's, `[]` = none) and a callout
style's `body` (§12; replaces the body's inside the box). All absent by
default.

| `TabStop` key | default | notes |
|---|---|---|
| `position` | required | from the start edge of the paragraph's measure (after a paragraph style's `indent`): a Dimension (`em` = the paragraph's own size; a length as text such as `"120mm"` also reads), `'end'` = the line's end edge, or a share of the measure (`'50%'`). Anything else: the stop is left out (`unknownConfigValue`) |
| `align` | `'start'` | `'start'` (the text after the tab starts at the stop), `'end'` (ends there: prices, page numbers, marks), `'center'`, `'decimal'` (the first decimal separator sits on the stop; a run with none ends on it). An unknown word reads `'start'` (`unknownConfigValue`) |
| `leader` | none | repeated over the room before the stop: `'.'`, `'. '` (spaced dots), `'·'`, `'_'`, `'-'`, any short text in the paragraph's face, or `'rule'` (a line drawn a little under the baseline: a form's blank). Set flush with the END of its room, so the leaders of several lines line up; in the paragraph's face and colour. Three repeats or more, or none (a room for one or two dots stays empty; `toc.leader` too) |
| `leaderGap` | `0.5em` | room between the text and the leader and between the leader and the text at the stop (the contents' `leader.gap`); none before a leader that opens the line, none after one with nothing after it |
| `decimalChar` | the document language's | `'decimal'` stops: `.` in en/zh/ja/ar, `,` in es/ca/pt/fr/de… |

An unknown key in a stop raises `unknownConfigKey` (`leaders` → `leader`?).

How a tab is set:
- A tab goes to the first stop past the text before it, among the stops after
  the one the line's previous tab took (the n-th tab of a line usually takes
  the n-th stop). Past the last stop: with `tabInterval`, the next multiple
  of it from the start of the measure; without, a word space.
- **Overrun** (the text before the tab already passed every remaining stop):
  an `end`, `center` or `decimal` stop takes the last word before the tab
  down to the next line with the text at the stop (the text before sets
  narrower, as a contents row narrows its title for its page number); a
  `start` stop breaks the line before the tab, so the text after it starts
  the next line at its stop.
- A paragraph holding a tab is set **line by line** (greedy), never
  Knuth–Plass, and column balancing never loosens or tracks it. Chinese and
  Japanese text in it breaks between characters by the document's rules,
  without punctuation compression or inter-character justification;
  paragraphs with ruby, warichu or kanbun set their tabs as word spaces.
- Justified text: a line holding a tab is not stretched before its last tab;
  only the word spaces after it take the slack, and only on a line that is
  not the paragraph's last. A centred or right-aligned paragraph sets its
  tabbed lines from the start side (stops are positions on the measure).
- Right to left: stops are measured from the right; an `end` stop sits at the
  left, leaders run between in visual order.
- Vertical text (`layout.writingMode: 'vertical-rl'`): no stops; a `:tab` is a
  word space and raises the content warning `tabInVerticalText`.
- Not in headings, captions, table cells, design text (openers, running
  heads) or `:::toc` rows (those keep `toc.leader`, §9). No `leaderColor`.

Outputs: canvas, PDF, HTML viewer and fixed EPUB paint the leaders; they are
never text (plain text, copy, search and the source map have `\t` at each tab
and no dots), the HTML hides them from screen readers and tagged PDF sets
them as artifacts (pdftotext reads "Soup 8.50"). Reflowable EPUB turns each
tabbed line into a flex row: an `end`, `center` or `decimal` stop, or one
with a leader, pushes the next part to the row's end (a leader becomes a
dotted or solid border); a `start` stop keeps the part before it at its
printed width. VDT: `line.tabbed`, the tab's `space` segment carries
`tab: {align, at}`, leader segments `leader: 'text' | 'rule'`.

```json
"paragraphStyles": [
  { "id": "menu", "firstLineIndent": {"value": 0, "unit": "em"}, "textAlign": "left",
    "tabStops": [{ "position": "end", "align": "end", "leader": ". " }] },
  { "id": "cast", "firstLineIndent": {"value": 0, "unit": "em"}, "smallCaps": true,
    "tabStops": [{ "position": "end", "align": "end", "leader": "." }] },
  { "id": "form", "firstLineIndent": {"value": 0, "unit": "em"},
    "tabStops": [{ "position": {"value": 30, "unit": "mm"} },
                 { "position": "end", "leader": "rule" }] },
  { "id": "prices", "tabStops": [{ "position": "70%", "align": "decimal" },
                                 { "position": "end", "align": "end" }] }
]
```

### 4b. Drop caps — `ParagraphDropCap` (postext ≥ 1.23)

A body paragraph opening with its first letter set large beside its first
lines (a chapter's first paragraph, each entry of a catalogue). **Set it on
the paragraph, never as a heading attribute drawn by an opener design
(`{attr.lead}` + a design text `dropCap`)**: the paragraph is then broken,
justified and hyphenated with the rest of the text, the letter keeps its
lines across columns and pages, and copying reads the word whole.

Where it goes (all absent by default):
- `headings.levels[].dropCap` / `headingStyles[].dropCap`: the first body
  paragraph after a heading of that level or style (one setting per chapter
  level, one per opener style). A style's `dropCap: false` takes the level's
  off. Found past fences, directives, side/floated/fixed boxes and floated
  figures; never a paragraph inside a box, a list, a quotation or a poem.
- `paragraphStyles[].dropCap`: the first paragraph of each
  `:::paragraphs{style=…}` group; `each: true` = every paragraph (entries).
- In the Markdown: `# Title {dropcap=false}` (off for that chapter),
  `{dropcap=2}` (two lines), bare `{dropcap}` (on, 3 lines); the same on a
  `:::paragraphs` fence. No paragraph-level syntax.

| `ParagraphDropCap` key | default | notes |
|---|---|---|
| `lines` | 3 | lines it spans (top of its capitals to its baseline); `1` + a larger `fontSize` = a raised initial on the first baseline |
| `sink` | `lines` | lines it drops into the text (stands on line `sink`'s baseline; those lines are shortened). < `lines` = raised; the paragraph keeps the rise clear above it in whole grid lines |
| `characters` | 1 | grapheme clusters set large (É, a combining mark, a surrogate pair = 1); no further than the first word |
| `fontFamily`, `fontWeight`, `italic` | the paragraph's; false | collected for loading and embedding |
| `fontSize` | auto | unset: its capitals level with line 1's, both cap heights MEASURED from the faces (0.72 fallback): no per-face CAP_HEIGHT table needed |
| `color` | paragraph's | palette-linked colours follow part/section palettes |
| `gap` | `0.15em` | between the letter and the shortened lines (em = text size) |
| `punctuation` | `'with-cap'` | an opening “ ¿ ¡ ( before the letter: `'with-cap'` (large, part of the initial), `'hang'` (text size, outside the measure), `'text'` (text size, start of line 1) |
| `leadIn` | none | `{ words: N | 'line', smallCaps?: true, uppercase?: false }`: first words after the initial in small caps (or capitals) |
| `shortParagraph` | `'reserve'` | fewer lines than `sink`: `'reserve'` (block keeps `sink` lines), `'shrink'` (initial over the paragraph's lines), `'skip'` (none); each raises a `dropCap` content warning |
| `each` | false | paragraph styles only |

Rules: the rest of the first word follows the initial with no space (a
one-letter word keeps its space); the paragraph's first-line indent is
dropped; it never breaks before line `sink` (moves on whole; alone in a
too-short column it breaks and warns `dropCap` `split`); a heading kept with
its text keeps those lines under it; the continuation fragment has no
initial. Start side: left in Latin, right in Arabic/Hebrew; a letter that
joins the next (Arabic, Syriac, N'Ko) is not set apart (warning); horizontal
CJK takes a one-character initial; vertical text none (warning). Outputs:
canvas, PDF (tagged: the initial + rest of the word = a `Span` with
`/ActualText` of the word), HTML viewer / fixed EPUB, reflowable EPUB (CSS
`initial-letter`). VDT: `VDTBlock.dropCap` on the first fragment. Unknown
keys → `unknownConfigKey`; a bad `punctuation`/`shortParagraph`/`lines`/
`sink`/`characters` → `unknownConfigValue`.

```json
"headings": { "levels": [
  { "level": 1, "dropCap": { "lines": 3, "fontFamily": "Libre Bodoni", "fontWeight": 700,
    "color": {"hex": "#8b2e2a", "model": "hex", "paletteId": "accent"}, "leadIn": { "words": 3 } } } ] },
"paragraphStyles": [
  { "id": "entry", "dropCap": { "lines": 2, "each": true } }
]
```

---------------------------------------------------------------------------------

## 5. `headings` — HeadingsConfig

General (apply to all levels unless the level overrides)
```
headings
├─ fontFamily    'Open Sans'
├─ figureStyle   unset             figures of every level (§20a), e.g. 'lining'; a level's own wins, in its own family too
├─ lineHeight    1.2 em            (em = the level's font size)
├─ color         main-color
├─ textAlign     'left'            (TextAlign; general only — no per-level align)
├─ fontWeight    700
├─ marginTop     1.5 em            (em = level font size)
├─ marginBottom  0.5 em
├─ keepWithNext  true              never strand a heading at a column foot
├─ keepWithNextSpread false        (≥ 1.16) with keepWithNext, a heading may still close the last column of an
│                                  EVEN page, its text opening the facing odd page (JLReq §4.1.7 b; any binding)
├─ keepWithNextSplit 'rules'       the paragraph under a heading at a column foot splits keeping widowMinLines
│                                  under it and orphanMinLines after, else the heading moves on with it;
│                                  'fill' = as many lines as fit, however few go on (1.4; a preset without
│                                  configVersion 8 whose chapters have a heading reads 'fill')
├─ snapToGrid    true              false = keep exact marginBottom (text may sit off-grid until next snap point)
├─ columnHeadSpace 'none'          ('none' | 'remainder', ≥ 1.28) a snapping heading that opens a column: 'none' sets it on
│                                  the column's first line and the snap adds the part of a line under it (its text then stands
│                                  further from it than after a paragraph); 'remainder' keeps that part of a line above it, so
│                                  the text follows as closely as mid-column. Set 'remainder' for one-column books; keep 'none'
│                                  in several columns, where it would lower one column's head against its neighbour
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
  figureStyle: FigureStyle             → headings.figureStyle (§20a)
  italic: boolean                      false
  letterSpacing: Dimension             0 (tracking after every glyph, spaces and number prefix included;
                                       em = level fontSize; negative tightens; centre/right lines are placed
                                       by their letters, the tracking after the last glyph left out; ignored
                                       when advancedDesign renders the level: design text has its own)
  textTransform: 'none'|'uppercase'    'none' (length-preserving; number prefix kept as written)
  numberingTemplate: string            ''  → no automatic number
  numberSeparator: string              ' ' between the number and the title ('　' U+3000 or '' in Chinese: 第一回　回目)
  numberPosition: 'before'|'replace'  'replace': the number is the whole title (# Night → الليلة الثانية), listed so in contents/bookmarks
  breakBefore: { enabled: boolean, parity: 'any'|'odd'|'even'|'always-odd'|'always-even' }
  span: 'column'|'page'                'column'
  spanBreak: boolean                   true (≥ 1.19) span:'page' only. true = the opener starts a new page
                                       (breakBefore picks its side). false, with breakBefore.enabled:false =
                                       the opener is set where the text reaches, as a page-span box: the
                                       columns above end level (balanced when headings.balancing.trailing),
                                       the band runs across the content area under them, the text goes on in
                                       every column below (a bulletin's second article). When the room left
                                       cannot hold the heading plus widowMinLines under it, it opens the next
                                       page. The page's role stays the one its first block gives it
  advancedDesign: { enabled: boolean, slot: DesignSlot, minHeight?: Dimension(abs) }
  dropCap?: ParagraphDropCap | false   (≥ 1.23, §4b) the first body paragraph after the heading opens with a drop cap
  hidden: boolean                      false → structural heading: prints nothing, takes no room
                                       (in the flow and inside callouts), still breaks / counts /
                                       is listed / bookmarked
  lineSpan: number                     unset (≥ 1.16) 行取り: the heading takes N body lines (N × body pitch)
                                       instead of marginTop/marginBottom, its characters centred in them;
                                       more lines when its own need them; not for span:'page' openers,
                                       advancedDesign or headings in boxes; follows cjk.grid
  indent: Dimension                    0 (≥ 1.16) 字下げ from the line start, em = the BODY size (4/6/8 字 by
                                       level in a vertical book); a centred heading centres in the rest;
                                       `{indent=N}` on a heading line overrides it (body ems), `{indent=0}`
                                       sets that heading at the line start
  firstLineIndent: Dimension           0 (≥ 1.24) the FIRST line only, measured from `indent`, em = the BODY
                                       size; the turnover lines start at `indent`. GB/T 9704 heads (two
                                       cells in, turnover at the margin): {value: 2, unit: 'em'} on every
                                       level. Never type U+3000 into numberingTemplate for it (the spaces
                                       become the number and print in :::toc and the PDF bookmarks).
                                       `{firstLineIndent=N}` on a heading line overrides it, `=0` clears it
  jidori: number                       unset (≥ 1.16) 字取り: a one-line heading narrower than N of its OWN ems
                                       is spaced evenly to exactly that width (3: 序章 → 序　章); `{jidori=N}`
                                       on a heading line overrides it, `{jidori=0}` turns it off
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
  ordinal words (English or Spanish by `locale`, else the hyphenation locale; Chinese documents: 十二 and
  第十二; Arabic: definite ordinals الفصل الأول, with `-feminine`/`-f` الليلة الأولى … الحادية بعد الألف,
  `-classical` مائة; Japanese (≥ 1.16): 二十一 / 百一 and 第二十一; French, Italian, German, Catalan, Portuguese
  (> 1.33.9): vingt et un / premier, ventuno / primo, einundzwanzig / erste, vint-i-u / cinquè, vinte e um /
  vigésimo primeiro, `-feminine` première / prima / primera, German `-m`/`-f`/`-neuter` Erster Teil / Erstes
  Kapitel; other languages take English); other text literal; `\{` escapes. Chinese numerals (≥ 1.9):
  `{1:一}` informal in the document's script (`第{1:一}回` → 第一回 … 第一百二十回), `{1:〇}` cjk-decimal
  (一二〇), `{1:壹}` financial, `{1:①}` circled, `{1:甲}` stems, `{1:子}` branches, `{1:１}` fullwidth, or a
  CSS name (`{1:trad-chinese-informal}`). Design placeholder `{numberHan}`: the counter in informal numerals. Arabic: `{1:١}`
  arabic-indic, `{1:۱}` persian, `{1:أبجد}` abjad letters (أ ب ج د هـ), `{1:أبتث}` hijai letters (أ ب ت ث), or a name
  (`{1:arabic-abjad}` additive يا = 11). Japanese (≥ 1.16): in a `ja` document `{1:一}` is japanese-informal (第百一章,
  六千一: no 一 before 十百千, no 零), `{1:壱}` japanese-formal (壱拾), `{1:あ}` hiragana, `{1:ア}` katakana, `{1:い}`
  hiragana-iroha, `{1:イ}` katakana-iroha (`（{1:イ}）`); `{numberHan}` follows the same rule; `{1:〇}` gives positional
  二〇二六. `{1}` follows the document's `numerals`. Empty counters collapse with their separator.
  A heading line's `{startAt=N}` sets its level counter to N instead of advancing it.
  The number is prepended to the title **followed by one space**,
  e.g. `'{1}.{2}'` → "2.3 Title"; `'Chapter {1}.'` → "Chapter 2. Title". It also feeds `{number}`
  in designs (not prepended there) and the TOC. `{chapterNumber}` = the H1 prefix, or the chapter
  ordinal when H1 has no template.
- `breakBefore.parity`: `'odd'`/`'even'` insert one blank if needed (blank belongs to the NEW chapter);
  `'always-*'` inserts a mandatory separator blank (belongs to the PREVIOUS chapter) then parity.
  The very first block of a document never gets a leading blank.
- `span: 'page'` = chapter opener: the heading is set full content width as an **opener band**
  and starts a new page even with `breakBefore.enabled: false` (`breakBefore` only picks the
  side; `spanBreak: false` opens it mid-page instead). Without `advancedDesign` a default text
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
  A floated box fenced right after the opener (`placement="top"`, with `columns="k"` for k columns),
  or a `::resource` embed of a `top`/`auto` float there, takes the head of column 1 under the band,
  level with the other columns' heads, and column 1's text starts under it (≥ 1.25,
  `layout.floatsUnderOpener`; ≤ 1.24 it landed from column 2, so no teaser strip or page-span box is
  needed to open a band first). Only over 2+ text columns; a float cited with `:ref` in the text still
  follows its citing line.
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
enabled true | maxLinesPerHeading 4 | maxLinesBeforeLoose 2 (≥ 1.28) | stretchAfterLists true | maxLinesAfterList 1
stretchAfterDisplays true (≥ 1.28) | stretchAfterFloats true | maxLinesAfterFloat 1
stretchAfterWideFloats 'flush' ('flush' | 'always', ≥ 1.28) | trailingStep 'lines' ('lines' | 'grid', ≥ 1.28)
looseParagraphs true | maxLooseParagraphs 2
trackParagraphs true | maxTracking 10 (‰ em) | fillShortColumns false (#1236) | trailing true | beforeSpan true
closingBox 'first'  ('first' | 'last' | 'off') | gridLines 'allow' ('allow' | 'off', ≥ 1.25)
```
`enabled` is off by default in vertical text and on a character grid (`cjk.grid.enabled`, ≥ 1.25);
`true` turns it on there.
Levers in order: box closing a short column pushed to the foot → extra grid lines above headings
(favouring lower level numbers; at most `maxLinesBeforeLoose` each at this point, ≥ 1.28) → after list ends → under display formulas and boxes (one line;
`stretchAfterDisplays: false` skips it, ≥ 1.28, for a paper whose formulas should keep their own
margins) → under top floats (under a float over several columns, ≥ 1.28, the columns under it move
down together, or one alone only when the line ends it flush: `stretchAfterWideFloats: 'always'` is
the 1.27 lever, which could lower one head and still leave its column short) → loose paragraphs
(TeX looseness +1, within `bodyText.maxWordSpacing`, optional ≤ maxTracking positive tracking;
with `fillShortColumns: true`, #1236, ragged paragraphs too, no line looser than the limit or the
paragraph's own loosest line, and when none gains its line one paragraph set a line short, kept
only when its pages end with fewer short columns)
→ the headings' further lines up to `maxLinesPerHeading`, only when the loose paragraphs have
nothing left to give (≥ 1.28; up to 1.27 a heading took all its lines first, which opened four
lines above the one heading of a page: do not lower `maxLinesPerHeading` against that any more,
and set `maxLinesBeforeLoose` = `maxLinesPerHeading` only to reproduce a 1.27 layout).
`trailing`: level the closing band of a chapter (short last page → equal-height columns).
`trailingStep 'lines'` (≥ 1.28; `'grid'` = 1.27): the cut counts lines of the band's own text, so an
index or a list of references set on a leading of its own ends its columns within a line. Only when the
band's lines stand whole lines apart (4 in 5 per column): entries with a fractional gap between them
(`spaceBetween`, a hand-set group margin) keep the grid cut. Do not add
space above index groups (`index.groups.marginTop`) to make an off-grid closing band end level.
A closing band keeps its column heads level: no lever lowers the block that opens a column under a
float, nor (≥ 1.28) the heading right under a `span:'page'` opener in the opener's own column; the
lines go to a heading further down or the column ends short. Its columns, and the column rule, end
on the grid line under its text, also when the band was level and took no cut (≥ 1.28).
`beforeSpan`: level the columns a `span:'page'` callout interrupts. `closingBox: 'last'` runs the
box lever after the spacing levers (the box takes only the fraction of a line they leave, so a
box annotating the paragraph above it stays close to it); `'off'` never moves the box. Disable
`enabled` for ragged-bottom books.
On a character grid (≥ 1.25) balancing turned on keeps every character in its cell: the line levers
add whole grid lines (the grid's pitch), `gridLines: 'off'` keeps them out (a standard that counts
lines, GB/T 9704's 22 × 28), and a CJK paragraph runs a line long only when its characters spread
≤ `maxTracking` apart, with no letter tracking (so a grid of whole cells rarely gets one). Leave
`enabled` unset on a grid page: it is already off. `doc.gridBalancing` / `column.gridRefused` in the
VDT say why a grid column ends short. Up to 1.24 a horizontal grid was balanced with loose paragraphs
spread off the cells; recipes set `enabled: false` against it.

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
  sectionEnd?: 'level' | 'heading' = 'level'   (postext ≥ 1.45) 'heading': the section ends at the next
                                 heading of ANY level. A cover that is the book's only H1 over H2
                                 chapters needs it, or its empty header/footer run over the whole book
  numberingTemplate?: string     replaces the level's template ('Appendix {1:A}'); counter stays the
                                 level's, so restart it with {startAt=1} on the first heading;
                                 '' prints no number anywhere (no H1 ordinal in the contents or
                                 {chapterNumber} either), though the heading still counts
  // any HeadingLevelConfig field except level:
  fontFamily, fontSize, lineHeight, color, fontWeight, marginTop, marginBottom, italic,
  letterSpacing, textTransform, breakBefore (merged field by field over the level's), span,
  figureStyle (§20a; applied to the family of the level the style is used on),
  advancedDesign, spanBreak (≥ 1.19), hidden, snapToGrid, lineSpan / indent / jidori (≥ 1.16; 0 clears the level's),
  firstLineIndent (≥ 1.24; 0 clears the level's),
  dropCap (≥ 1.23, §4b; false clears the level's: e.g. a preface style without the chapters' initial)
  header?: DesignSlot, footer?: DesignSlot      replace document running heads on the section's pages ({elements:[]} = none)
  margins?: PageMargins                          each side inherits page margin; pair with breakBefore
  layout?: LayoutConfig                          e.g. {layoutType:'single'} — resolved from scratch (unset fields = layout DEFAULTS, not the document layout!),
                                                 except columnRule: its unset fields take the document's, and the section's pages draw it
                                                 only page geometry is read from it (layoutType, columnCount, gutterWidth, side column,
                                                 columnRule, writingMode, and fitFiguresToPage for moving a figure to a whole column);
                                                 inlineResourceGap, inlineResourceGapInBoxes, flowColumns, boxChildSplitMinLines,
                                                 hugClosingFloats and floatsUnderOpener stay the document's: setting them here does nothing
  bodyStyle?: PartsBodyStyleConfig               (§8) typography of paragraphs/lists in the section
  palette?: Record<paletteId, '#hex'>            recolours palette-linked design colours + flow colours on the section's pages,
                                                 and the page itself when page.backgroundColor links to an overridden id (1.18+)
}
```
Gotcha: `layout` in a heading style goes through `resolveLayoutConfig` alone, so
`{layoutType:'double'}` there gets gutter 0.75cm unless you restate `gutterWidth`.
Typical uses: cover page (`numbered:false, toc:false, span:'page', advancedDesign.minHeight = page height`),
front matter with roman folios / single column, unnumbered appendix, index.

**Headings in boxes and frames** (≥ 1.37): a heading inside a `:::callout` or a composed-page frame draws the
`advancedDesign` of its level or heading style (tab, band, rules, `{titleText}`), laid out at the box's width,
and the box keeps the room it takes: the tallest of the heading's text, the design's bottom and `minHeight`
(no grid in a box), then `marginBottom`. An element anchored to `container` with a negative offset reaches
over the box's padding; one anchored to `page`/`bleed` stays on the page. A `span:'page'` heading in a box is
laid out at the box's width (no opener band). A heading in a box opens no styled section: running heads, the
page's role and the chapter's `{attr.x}` come from the flow's headings, so never rely on that style's
`header`/`footer` for it. The design scales with a frame the reflow ladder scaled and turns with a turned
frame. Before 1.37 a box drew its headings plain (a tab in a box was the box's `label`, or its own frame).

---------------------------------------------------------------------------------

## 7. Design slots — header, footer, openers, parts, TOC rows

`DesignSlot = { elements: DesignElement[] }`; **array order = paint order** (first = back).
Elements can anchor to later elements; the engine topo-sorts for geometry.

**Form only.** A design text element's `content` holds placeholders and short labels; the book's
text lives in the chapters. Literal text that keeps more than 2 words or more than 24 letters and
digits in one element (placeholders and allowed phrases removed; a Han, kana, Hangul or Thai
character counts 3) is content: `preset_kit.py lint` fails on it, `lint_project.py` reports
`contentInConfig`, and so does `postext check` from postext 1.34 (§19h). Longer literals that are
form go in `checks.contentInConfig.allow` (the front matter's title, subtitle, author and
publisher are allowed without it; the manifest name is not). A design image's `resourceId` takes the same
placeholders (postext ≥ 1.8): one style draws a different picture per heading
(`resourceId: '{attr.fondo}'`), so per-page pictures never need per-page styles.

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
                  start/end (≥ 1.39) 'top-start'|'start'|'bottom-start'|'top-end'|'end'|'bottom-end'
                  element edges  'right-of'|'left-of'|'below'|'above'|'align-top'|'align-bottom'|'align-left'|'align-right'
                                 |'align-start'|'align-end' (≥ 1.39) },
  offset?: { x?: Dimension(abs), y?: Dimension(abs) },   // screen direction: +x right, +y DOWN (not "inward");
                                                         // a TEXT element's offset may be in em of its own size (≥ 1.9)
  size?: { width?: 'auto'|'fill'|Dimension|SizeTo, height?: 'auto'|'fill'|Dimension|SizeTo, maxWidth?: 'auto'|'fill'|Dimension }
}                                       // SizeTo = { to: 'container'|'page'|'bleed'|'outer'|'#id', edge: 'top'|'bottom'|'left'|'right' } (≥ 1.38)
```
- The anchor edge also picks the pin: `top-right` pins the element's top-right corner, so a
  right-anchored element needs a **negative** x offset to move inward; `bottom` anchors need
  negative y to move up (built-in header uses `bottom-right`, y = −16pt).
- `'fill'` runs to the frame edge from the anchor point.
- Start and end edges (≥ 1.39) name the sides by reading direction: the start is the left of a left-to-right
  page and the right of a right-to-left or vertical page on the sheet, and `offset.x` then runs from start to
  end (a kicker `top-start` with `x: 4mm` stands 4 mm in from the start side on both). They apply to
  container, page, bleed and outer anchors and to `align-start` / `align-end` between elements, in running
  heads, folios and a template's decoration (laid on the sheet); a design laid in the flow (heading
  designs, openers) and a composed page's frames already read `start` as `left`, the flow being mirrored
  or turned already. A template shared
  by an Arabic and a Latin edition places its kicker and folio with these, not `top-left`/`top-right` per
  edition.
- `{ to, edge }` (≥ 1.38) runs from the anchor point to an edge of another box: `height: { to: 'bleed',
  edge: 'bottom' }` for a ground from the foot of a band down to the bleed, `{ to: '#band', edge: 'top' }`
  up to another element; `to: '#id'` also names a frame or group on a composed page's decoration, so the
  ground follows the band when the band moves. A height takes `top`/`bottom`, a width `left`/`right`; an
  edge behind the anchor point gives 0, an edge across the axis or a missing box reads as `'fill'`. Do not
  work such lengths out from the page geometry in the generator.
- Element edges put a corner on a corner of the target: `right-of` = beside, tops level;
  `left-of` = to its left, tops level; `below` = under, left edges level; `above` = over, left
  edges level; `align-top` and `align-left` are the SAME placement (top-left corners together);
  `align-bottom` = bottom-left corners; `align-right` = top-right corners. No edge puts the
  bottom-right corners together: use `align-bottom` plus an x offset, or anchor the other way.
- Offsets in em throw on rule, box and image elements — use mm/pt. A text element takes em of its own
  `fontSize` (≥ 1.9): the fore-edge head sits `{y: {value: 4, unit: 'em'}}` below the type area.
- `anchor.to: 'outer'` (header/footer slots, ≥ 1.9): the page's outer margin, from the type area's edge to
  the trim edge on the side away from the spine, head to foot of the type area; follows parity and
  `page.binding`.

### 7.3 Element kinds
Common: `id` (string, unique in slot; referenced as `'#id'`), `parity: 'all'|'odd'|'even'`
(default 'all'; page 1 odd), `pages: 'all'|'body'|'opener'|'part'|'blank'|'comic'|'composed'` (page role filter;
`comic` = a `:::page` (≥ 1.20), `composed` = a `::::page` (≥ 1.34.1); a page template's `role` (default 'composed',
inherited through `extends`, ≥ 1.37) is the role its pages report, so `role: 'opener'` gives a unit-opening template
the folio the flow's openers get;
default 'all'; `'body'` hides running heads on chapter openers, `'opener'` shows e.g. a
bottom folio only there). Parity/pages are ignored inside heading slots.

**text** (`DesignTextElement`, )
```
{ kind:'text', id, placement, content: string (template; '{{' '}}' = literal braces),
  fontSize: Dimension(abs)  REQUIRED,  overflow?: 'wrap'|'ellipsis-start'|'ellipsis-end'|'ellipsis-middle'|'clip'
    (≥ 1.24 unset = the slot's: 'wrap' in heading and part designs, 'ellipsis-end' in header/footer/toc rows)
  fontFamily='EB Garamond', fontWeight=400, italic=false, color=#000000,
  figureStyle?: FigureStyle (§20a; the element names its own family, so the body's figures never reach a folio:
    set 'oldstyle' on it beside old-style text),
  direction?: 'ltr'|'rtl'|'auto' (= the document's; auto = first strong letter), align='center'
    ('left'|'center'|'right'|'justify'|'start'|'end' — start/end follow `direction`; justify: word spaces stretched on every wrapped line
    but a paragraph's last; with hyphenate a word is also cut at a syllable to fill), verticalAlign='middle'
    (lines taller than a fixed height run out on the free side: 'bottom' keeps the last line box's foot
    on the box's foot, 'middle' runs out both ways; a drop cap follows its lines),
    lineHeight=1.2 (a number × fontSize; or a Dimension: em/rem = the same multiplier, pt/mm = absolute
    distance between baselines, e.g. {value: 11, unit: 'pt'} to copy a measured leading; a zero, negative or
    malformed value sets 1.2. Never write `lineHeightLength`: it is the resolved form),
  letterSpacing?: Dimension (negative tightens, em = font size; the tracking after a line's last glyph
    counts neither for centre/right alignment nor for an auto width, and a justified line's last glyph
    ends on the edge; it never changes the glyphs: ligatures stay on canvas, HTML, EPUB and PDF, so a
    tracked running head or callout title is as wide as measured; a Hebrew run is tracked, only a
    text with Arabic letters is not), textTransform?: 'none'|'uppercase',
  hyphenate?: boolean (wrap only), box?: ElementBoxStyle,
  dropCap?: { lines=2, fontFamily?, fontWeight?, fontSize?, color?, gap? }   (design text only; a chapter's
            first PARAGRAPH takes a body drop cap instead, §4b; capitals fixed at 0.72; the text wraps whatever its
    overflow; default size = text size + (lines−1) × leading / 0.72, top level with the first line's
    capitals; a preset without configVersion 6 gets its 1.4 size written out as fontSize),
  paragraphIndent?: Dimension     ('\n' in content separates paragraphs)
  inlineMarks?: boolean   (read **b** *i* ^sup^ ~sub~ in the resolved text, values included; ≥ 1.53: a
    heading's :chip[…] in {titleText} is set too, in the document's chipStyles at the element's size)
  stroke?: { width: Dimension, color?: ColorValue (= text colour), hollow?: boolean }
  dotted?: { spacing = 0.1em, size = 0.05em }   (≥ 1.46: letters painted as rows of dots along their strokes, to
    trace; layout unchanged, text colour, replaces fill and stroke; the thinnest weight gives the evenest rows;
    the PDF keeps the text invisible under the dots; not on vertical text)
  repeat?: { gap = 1em, count? }   (≥ 1.46: a one-line text set again after itself, as many whole copies as its
    room holds or count at most, one line aligned as a whole, first copy on the start side; a row of {boxText}
    copies to trace with width 'fill')
  reserve?: boolean       (heading slots: false = don't count toward the reserved height)
  parity?, pages?,
  writingMode?: 'horizontal-tb' | 'vertical-rl'   (≥ 1.9: set top to bottom, lines right to left, in a
    horizontal slot such as a fore-edge running head; size.height = line length; ignored in a vertical flow) }
```
A newline or the two characters `\n` (in the template or an `{attr.*}` value; not in titles
or front-matter values, which print as written) always starts a new line, in every `overflow`
mode (ellipsis/clip act per line). An auto-width text is clamped to the room between its anchor
and the container edge it grows toward: an offset toward that edge shrinks it (twice for
`top`/`bottom`), one past it leaves it empty (ellipsis) or one letter per line (wrap) — use a
fixed `size.width` or anchor to `'page'`.
Element defaults are NOT the built-in header's (Open Sans 8pt/600 main colour) — set everything.
`overflow` left out (≥ 1.24) follows the slot: `'wrap'` in heading designs (`advancedDesign.slot`, levels
and heading styles), part pages (`parts.design`, `parts.versoDesign`) and box designs (`calloutStyles[].design`, ≥ 1.45), `'ellipsis-end'` in running
heads, folios (`header`, `footer`, a style's own) and contents part rows (`toc.parts.design`, fixed
height). So leave it out on opener and part titles, and set it only where the slot's default is wrong (a
running head that should wrap, a one-line kicker in an opener). Before 1.24 every slot fell back to
`'ellipsis-end'`: when the pen pins an older engine, write `'wrap'` on titles. A row (between `\n`) in Chinese or
Japanese is set by the CJK composer (≥ 1.25, `cjk.composeDesignText`): kinsoku, mark widths, Han–Latin space,
book titles kept whole, as in the body; Latin rows wrap as before. Every line cut by an
ellipsis, or clipped with ink past its box, raises the content warning `designTextTruncated` (≥ 1.24;
`slot`, `elementId`, `text`, `mode`, `pageIndex`, once a chapter for a running head): read it in the
render and fix the title or the box unless the cut is meant.
Header/footer placeholders: `{pageNumber}` (the page LABEL, e.g. "xii"), `{totalPages}`,
`{title}`, `{subtitle}`, `{author}`, `{publishDate}` (front matter), `{chapterTitle}` (latest H1),
`{chapterNumber}`, `{chapterTitleAtTop}` / `{chapterNumberAtTop}` (the chapter in force at the top
of the page: differs where a chapter starts below other text, for run-on chapters),
`{partTitle}`, `{partNumber}`, `{attr.<key>}` (chapter H1 attribute; in a heading design, that
heading's own attribute).
`{bookTotalPages}`: the page count of the whole book, blank pages included ("12 / 348"); in header,
footer, heading and part designs. A document laid out alone prints its own count; `buildBundle`,
`postext` and the Sandbox lay the book out again with the total, so every chapter prints the same
number (a host laying chapters itself passes `continuation.bookPageCount`). `{totalPages}` is the
chapter's own count in a book.
Guide words (header/footer only): `{firstMark.<key>}` / `{lastMark.<key>}` = the first and last mark
that starts on the page. Key `h1`…`h6` = a heading of that level (its text, no number); key = a
paragraph style id = the opening **bold** run of each paragraph of a `:::paragraphs{style=…}` group,
closing punctuation dropped (`**Aback.** Said of…` → Aback). A page where no mark starts prints the
mark in force for both; marks do not carry over chapters; an unknown key prints nothing. Dictionary
head: `content: '{firstMark.entry} – {lastMark.entry}'`.

**rule**: `{ kind:'rule', id, placement, direction: 'horizontal'|'vertical', color: ColorValue (req), thickness: Dimension (req), reserve? }`
(required in the type; a JSON config that leaves them out gets 'horizontal', #000000 and 0.5pt)
— length from `size.width` (horizontal) / `size.height` (vertical); `'fill'` = to frame edge.

**box**: `{ kind:'box', id, placement (with size), style: ElementBoxStyle, reserve? }`
`ElementBoxStyle = { backgroundColor?, borderColor?, borderWidth?, borderRadius?, padding?: {top,right,bottom,left} }`
(stroke painted inside: its outer edge on the box edge, in canvas, HTML and PDF; radius clamped).
Use for colour bands, thumb tabs, backdrops.

**image**: `{ kind:'image', id, placement, resourceId, reserve?, decorative?, fit?, focus? }` — bitmap/SVG resource
(`decorative: true` keeps an ornament out of the accessible text; otherwise the resource's `altText`, else its
caption, is the picture's alternative text in HTML and tagged PDF; running-head pictures are always furniture)
(e.g. logo, cover photo). One of width/height `'auto'` keeps aspect; both set = fit & centre. `fit: 'cover'`
(≥ 1.38, both sides set) fills the box and crops what runs past it, as a full-bleed photograph does; the
resource's `safeArea` stays whole, `focus: { x, y }` (fractions of the picture) says which point to centre;
`'contain'` is the default. Do not pre-cut a photograph to its box's ratio.

### 7.4 Header/footer defaults
`header`/`footer` **undefined** → built-in: header = `{title}` right on odd + `{chapterTitle}`
left on even + 1pt rule (Open Sans 8pt/600, main colour); footer = centred `{pageNumber}`.
`{ elements: [] }` = no header/footer. Legacy flat element fields (`align`, `marginFromBody`,
`marginFromEdge`, rule `width:'full'`) are migrated on input — don't write them.

### 7.5 Palette overrides in designs
Elements whose colours carry `paletteId` are recoloured on pages ruled by a part
(`:::part{palette="band=#f6c297"}`) or a styled section (`headingStyles[].palette`).
Since 1.18 the page colour follows too: link `page.backgroundColor` to e.g. `paper` and a
section with `palette: { paper: '#f2d3c0' }` prints its pages on salmon (a newspaper's business
pages); pair it with `:::paper{shade=…}` so Folio shows the same stock.
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
├─ leader       { enabled=true, char='.', gap=0.5em }      ('. ' spaces the dots; the leader code body tab stops use, §4a; an artifact in tagged PDF ≥ 1.23)
│                 + face ≥ 1.52 (#1121): color, fontFamily, fontSize (em of the page number's), fontWeight; unset = the page number's
├─ subtitle     { enabled=false, attr='author', fontFamily, fontSize, fontWeight, italic=true, color, indent=0 }
├─ parts        { enabled=true, breakBefore=false, design: DesignSlot (row; placeholders {number} {numberRoman}… {titleText} {pageNumber}, {leader} ≥ 1.34.1),
│                 leader ≥ 1.52: { color, fontFamily, fontSize (em of the element's), fontWeight } over toc.leader's face; unset = the element's own,
│                 height = 2em (twice the body size, not two body lines), marginTop=0, marginBottom=0 }
└─ groups       ≥ 1.34 blocks of the contents kept on one column/page
   ├─ keepTogether   false     a head row + every entry under it moves whole when it does not fit
   ├─ head           'part'    'part' | 1…6 — what heads a block (1 = chapter with its sections)
   ├─ minEntriesAfterHead 2    a block taller than a column keeps its head with ≥ N entries
   └─ continuation   { enabled: true, mark: <locale> }
                               the head row repeated at the top of each column a tall block goes on in,
                               title + mark ("(cont.)", "(suite)", "(Forts.)", "(segue)", "（续）", "（続き）", "(تابع)")
```
A part row that needs dots up to its page number is ONE text element: `content: "{number} {titleText}{leader}{pageNumber}"`
(any text before and after `{leader}`), width `fill` (an `auto` width fills to the row's edge anyway). The leader is
`toc.leader` (char, gap, enabled), the same as the entry rows, so the dots line up with them; a title too long is
cut, never the number. Never a literal run of dots in `content` (clipped, `designTextTruncated`). `{leader}` prints
nothing outside a part row and on a vertical page (postext ≥ 1.34.1).
Dots in their own colour, face or size (small coloured dots, a page number in bold): `toc.leader.color` / `fontFamily` /
`fontSize` / `fontWeight` (entry rows, and part rows unless `toc.parts.leader` sets its own), ≥ 1.52.
A page number in an element of its own (another face, a box around it) makes the part row THREE elements (≥ 1.52):
```jsonc
"elements": [
  { "kind": "text", "id": "title", "content": "{number} {titleText}", "placement": { "anchor": { "to": "container", "edge": "left" } } },
  { "kind": "text", "id": "page", "content": "{pageNumber}", "fontWeight": 700, "placement": { "anchor": { "to": "container", "edge": "right" } } },
  { "kind": "text", "id": "dots", "content": "{leader}",
    "placement": { "anchor": { "to": "#title", "edge": "right-of" }, "size": { "width": { "to": "#page", "edge": "left" } } } }
]
```
The leader element holds `{leader}` alone; its dots end `toc.leader.gap` before the page number element.
`:::toc{keep="part"}` / `keep="1"`…`"6"` / `keep="none"` and `:::toc{levels="1-2"}` override `groups` and
`levels` for one contents (≥ 1.34, document-format.md). A block that still runs over columns raises
`tocGroupSplit`.

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
taskBox 'drawn' | 'character' = 'drawn'  (≥ 1.29) the default ☐ / ☑ of a task item (`- [ ]`, `- [x]`) is
        drawn by the engine, not set as text: a square outline (a tick when done), side 0.6 em of the marker size
        (bulletFontSize / level fontSize), which is the room it takes before `gap`; centred where a bullet is (at
        the text's size it stands on the baseline); stroke follows the marker fontWeight, colour the marker color.
        No font is asked for it: same box on every machine, in canvas, PDF, HTML and EPUB; read as ☐ / ☑ by
        assistive technology (PDF `Lbl` /ActualText, HTML/EPUB role=img). Do not ship a symbol font for it.
        A character of your own in taskCheckboxChar / taskCheckedChar is still text in the list face (which must hold it).
        'character' = ≤ 1.28: ☐ / ☑ as text in the list face, as wide as whatever font holds them (a system font
        when the face lacks them); every preset below configVersion 13 with a task item reads 'character'.
```
orderedLists
```
fontFamily = body, color = main-color, fontWeight = 700, italic = false  (number marker)
numberFormat = 'arabic'|'lower-alpha'|'upper-alpha'|'lower-roman'|'upper-roman'  ('arabic')
               | East Asian (≥ 1.9): 'simp-chinese-informal' 一 | 'trad-chinese-informal' | 'simp-chinese-formal' 壹
               | 'trad-chinese-formal' | 'cjk-decimal' 〇 | 'cjk-heavenly-stem' 甲 | 'cjk-earthly-branch' 子
               | 'circled-decimal' ① | 'fullwidth-decimal' １
               | Japanese (≥ 1.16): 'japanese-informal' 一 百一 | 'japanese-formal' 壱 壱拾 | 'hiragana' あいう
               | 'katakana' アイウ | 'hiragana-iroha' いろは | 'katakana-iroha' イロハ (kana series wrap: 49 = ああ)
               | Arabic: 'arabic-indic' ١ | 'persian' ۱ | 'abjad' أ ب ج د هـ | 'hijai' أ ب ت ث
               | 'arabic-abjad' (additive, 11 = يا) | 'arabic-abjad-maghrebi'   (every numbering setting takes them: page labels,
               resource counterFormat, heading templates, :::numbering)
prefix = ''   (≥ 1.9) text before the number, in the separator's style: prefix '（' + separator '）' → （一）
separator = '.', numberFontSize = 1em, gap = 0.5em, indent = 0em, numberVerticalOffset = 0em
marginTop/Bottom = 1.5em, itemSpacing = 0em, hangingIndent = true, snapTopToGrid = false
numberWidth = 'run'  ('run' = text after the widest number of the item's own run, so a list broken by a figure or
                      a paragraph can shift its text; 'level' = widest number at that depth in the chapter;
                      'item' (≥ 1.28) = after the item's own number: each text one `gap` after its own label, 第九條 and
                      第十一條 followed by the same space, texts starting at different places (Japanese statutes);
                      turnovers by hangingIndent: false = back at the list indent, true = under the item's own text)
numberAlign = 'end'  (≥ 1.26; 'end' = numbers flush against the text, 9. and 10. end together; 'start' = numbers at
                      the start of the column, so 第九條 and 第十一條 begin together; the text starts at the same place)
separatorFontFamily / separatorFontWeight / separatorItalic / separatorColor  → inherit number style
separatorGap = 0em  (a differing separator style draws the separator as its own run)
levels[]: { level 1–5, numberFormat, prefix, separator, fontFamily, fontSize, color, fontWeight, italic,
            indent, verticalOffset, separatorFontFamily, separatorFontWeight, separatorItalic,
            separatorColor, separatorGap }
```
GB/T 15834 list hierarchy for Chinese: levels 一、 / （一） / 1. / （1） / ①:
`[{level:1,numberFormat:'simp-chinese-informal',separator:'、'}, {level:2,numberFormat:'simp-chinese-informal',prefix:'（',separator:'）'},
{level:3,numberFormat:'arabic',separator:'.'}, {level:4,numberFormat:'arabic',prefix:'（',separator:'）'}, {level:5,numberFormat:'circled-decimal',separator:''}]`
(`trad-chinese-informal` in Traditional). Japanese: vertical books 一、/（一）/ 1 /（1）/ ① (as above with
`japanese-informal`), horizontal books the official order 1. /（1）/ ア /（ア）/ ① (公用文作成の考え方):
`[{level:1,numberFormat:'arabic',separator:'.'}, {level:2,numberFormat:'arabic',prefix:'（',separator:'）'},
{level:3,numberFormat:'katakana',separator:''}, {level:4,numberFormat:'katakana',prefix:'（',separator:'）'}, {level:5,numberFormat:'circled-decimal',separator:''}]`.
Numbers are right-aligned within a run (within the depth with `numberWidth: 'level'`); `numberAlign: 'start'` sets
them at the start of the column instead (statute articles, any label of varying length), and `numberWidth: 'item'`
(≥ 1.28) drops the column: each text follows its own label by `gap` (numberAlign then changes nothing). Around a list nested
in another the outer list's `itemSpacing` applies on both sides. List margins of 1.5em are large — books usually want
`{0.5,'em'}` or a pt value. Nested list depth in markdown = 2 spaces per level (max 5).

---------------------------------------------------------------------------------

## 11. `paragraphStyles[]` — ParagraphStyleConfig

`:::paragraphs{style="id"}` … `:::` (bibliography, glossary, signature, dedication, credits).
```
{ id (REQUIRED), name?,
  fontFamily, fontSize, lineHeight (em = own size), color, textAlign, boldColor,
  figureStyle                    (§20a; unset = the body's figures with the body's family; own fontFamily = that font's default)
  italicColor                    (→ bodyText.italicColor, NOT `color`: a coloured style sets both)
  hyphenation: boolean, firstLineIndent,
  fontWeight, boldFontWeight                   → inherit bodyText
  italic = false                 (italic paragraphs; `*…*` runs flip upright — stage directions)
  smallCaps = false              (synthesised small caps, 0.7 of the size — cast lists, headwords)
  indent: Dimension = 0          (every line; firstLineIndent and hangingIndent count from it)
  endIndent: Dimension = 0       (≥ 1.16; from the END side: right of a horizontal line, foot of a vertical
                                 one; em = the style's size). With textAlign 'end': 地からN字上げ; textAlign
                                 'end' alone is 地付き (a letter's date and signature)
  hangingIndent: Dimension = 0   (lines 2+, from indent. The first line keeps a firstLineIndent the style
                                 sets ITSELF (≥ 1.23: first at indent + firstLineIndent, turnovers at
                                 indent + hangingIndent); an inherited one gives way and line 1 starts at indent)
  spaceBetween = 0, marginTop = 0, marginBottom = 0 (minimum; flow snaps back to grid after)
  snapToGrid = true              (false = exact space under the container, flow stays off the grid)
  containerSpacing?: 'collapse'|'add' (≥ 1.28; unset = bodyText.paragraphContainerSpacing; the rule under THIS
                                 style's containers, in the text and in a box: 'add' on a big figure or a
                                 reference list ends its groups on the style's own space, no paragraph-spacing
                                 line added, while the document stays on 'collapse')
  textTransform = 'none'         ('uppercase' = capitals, chip words and :ref labels too, length-preserving; maths untouched)
  letterSpacing: Dimension = 0   (≥ 1.37; tracking after every letter, em = the style's own fontSize: a page title tracked
                                 +15/1000 em is { value: 0.015, unit: 'em' }, InDesign tracking / 1000. Measured into the
                                 lines, justified lines spread their word spaces on top; canvas, HTML, PDF, EPUB, and a
                                 Word export's w:spacing. Arabic-script words stay untracked: joiningScriptLetterSpacing)
  wordBreak?: 'normal'|'keep-all' (≥ 1.16; unset = cjk.wordBreak; between CJK characters; ≥ 1.28 also holds
                                 for the characters a Latin paragraph quotes)
  lineNumbers?: boolean          (≥ 1.23, §19f; unset = counted when lineNumbers.count is 'all', and a poem
                                 set in the style counts under 'verse'; true = counted under 'verse' too and
                                 inside a callout; false = never)
  tabStops?: TabStop[]           (≥ 1.23, §4a; unset = bodyText.tabStops, [] = none; a tab character in the
                                 style's text is then a tab too) — menus, price lists, cast lists, forms, marks
  tabInterval?: Dimension        (≥ 1.23, §4a; unset = the body's)
  dropCap?: ParagraphDropCap     (≥ 1.23, §4b; the group's first paragraph, every one with each: true) }
```
Inside the container the flow leaves the baseline grid. When it closes on a paragraph, the space under it merges
with the next block's own (a heading's `marginTop`) and is at least the text's paragraph spacing
(`bodyText.paragraphContainerSpacing`, or the style's own `containerSpacing`); when it closes on a list, the list keeps its own space and `marginBottom` follows. Unknown keys in a style raise `unknownConfigKey`. The style applies inside callouts too,
margins included (they collapse with the neighbours' spacing; none at the top of the box); its
unset fields inherit the document body text, not the box's `body`.

---------------------------------------------------------------------------------

## 12. `calloutStyles[]` — CalloutStyleConfig

`:::callout{type="id" title="…" span="…" placement="…" columns="…" label="…"}` … `:::`. Unknown/missing
type → first style. Declaring the array replaces the default `note`.
All em values = the callout body font size.
```
{ id (REQUIRED), name?,
  extends?                           ≥ 1.39: another style's id; every field this style leaves unset comes from it
                                     (objects such as padding, fixed, titleStyle key by key; colours and lengths whole;
                                     never id/name); chains allowed; unknown id → calloutStyleExtendsUnknown, a loop →
                                     calloutStyleExtendsCycle (the style stands alone). One full style per look + a thin
                                     one per place: { id: 'caja-p5', extends: 'caja', placement: 'fixed', fixed: {…} }
  title = ''                         default title; fence title overrides
  span = 'column'                    'column' | 'page' (span block across columns) | 'side' (float-only side column)
  columns = 1                        ≥ 1.18: a floated (auto/top/bottom) span:'column' box across this many adjacent
                                     columns; ≥ the page's count = page-wide; in-flow boxes keep their column
  placement = 'here'                 'here' | 'auto' | 'top' | 'bottom' | 'fixed'   (side boxes never float)
  sideAtColumnEnd = 'before'         side box whose following text continues on the next page (full column, or a
                                     paragraph/heading the break rules move on): 'before' = at the fence, beside
                                     the text before it (slides up; glosses), 'after' = level with the first line
                                     of the text after it, on that page (marginal heads)
  fixed = { anchor: {to:'container', edge:'bottom-left'}, offset: {x:0pt, y:0pt} }   for placement:'fixed' (container = content area)
  floatBarrier = false               pending figures placed before this box (chapter-closing summaries)
  width = 'fill'                     'auto' = shrink-wrap title only (badge), children ignored
  backgroundEnabled = true, background = #f4f4f4
  border = { enabled=false, color=#cccccc, width=0.5pt }
  borderRadius = 0em                 the stripe is clipped to it; the label tab stays square
  padding = { top, right, bottom, left } = 0.75em each
  stripe = { enabled=false, side='left'|'right'|'top'|'start'|'end', width=1.5em, color=main }
  icon = { kind='none'|'glyph'|'resource', glyph='', resourceId='', fontFamily=headings font,
           fontWeight=400, size=1.5em, width? (non-square box), color=main, align='top'|'center',
           position='inline'|'corner', cornerSide='right'|'left'|'outer'|'inner'|'start'|'end' }
           (a corner icon is centred on its corner by its drawn width, a wide `width` strip included;
           a left-corner title starts past its inner half)
  label = unset (no tab). If set: { fontFamily=headings, fontSize=body size, fontWeight=700,
           color=#fff, background=main, position='top-right'|'top-left'|'top-start'|'top-end', height=1.4em, paddingX=0.6em,
           offset=0, inset=0, icon:{resourceId,width=1em,gap=0.3em, placement='beside'|'inside' (≥ 1.42), tint (≥ 1.43: paint the picture in label.color)},
           rule:{enabled=false,color=main,width=0.5pt} }
           prints the fence `label` attribute ("RECUADRO 1-1"). icon.placement 'inside' (≥ 1.42) fits the picture
           into icon.width × the tab's height, widens the tab by it and `gap`, and stands it before the words
           (at the start of the tab); 'beside' (default) keeps it past the tab's edge. The picture keeps its
           colours unless `icon.tint: true` (≥ 1.43: its silhouette in `label.color`); with no picture to draw the tab is the plain one
  marker = { kind='none', glyph, resourceId, fontFamily, fontWeight=400, size=1.5em, color=main,
             align='center', gap=0.5em, rule:{enabled=false, color=main, width=0.5pt, length=0} }
             icon + vertical rule OUTSIDE the box on its left
  titleStyle = { fontFamily=headings font, fontSize=body size, fontWeight=700, italic=false,
                 color=main, textTransform='none'|'uppercase', gap=0.5em, letterSpacing=0, indent=0,
                 lineHeight=1.2em (em = title size; set the body leading to keep boxes a whole number of lines) }
  body = { fontFamily, fontSize, lineHeight, color, boldColor, italicColor, fontWeight, boldFontWeight,
           textAlign: 'left'|'justify'|'start', hyphenation: boolean, paragraphSpacing, firstLineIndent,
           tabStops, tabInterval (≥ 1.23, §4a: replace the body's inside the box),
           letterSpacing (≥ 1.42: em of the body size, negative tightens; tracks the box's paragraphs and
           list items, measured into the lines) }   → inherit bodyText
         + italic = false, smallCaps = false   (paragraphs, list items and blockquotes of the box)
  lists = { bulletChar, color, indent, gap, itemSpacing, bulletFontSize?, bulletFontWeight?, bulletFontFamily?, marginTop?, marginBottom? }  → inherit unorderedLists (bulletFontFamily unset: the list level keeps its own face; margins unset: the document's, ordered lists too)
           (a set `color` also colours ordered-list numbers, even when equal to unorderedLists.color)
  columnGap = 1.5em                  for :::columns{count=N} groups inside the box (a fence `gap=` overrides it)
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
  continuesMarkerItalic = true
  numbering?                         (postext ≥ 1.19) { label: 'Theorem', counter = style id | shared name | 'equation' | false (label only),
                                     numberingTemplate = '{n}', resetOn = 'never', counterFormat = 'decimal',
                                     placement = 'runIn' ("Theorem 2 (title)." opens the first paragraph) | 'title',
                                     bold = true, italic = false (absolute, whatever body.italic), suffix = '.' }
                                     a fence {#id} becomes a target printing "Theorem 2" (\ref → "2")
  endMark = ''                       (postext ≥ 1.19) e.g. '□' / '∎' set flush right at the end of the box's last line (a proof)
  design?                            (postext ≥ 1.45) { enabled = true, slot: DesignSlot (the elements of a heading design),
                                     minHeight?, setsContent = false } — laid out in a band under the box title, across the
                                     inner width (anchor.to: 'container' = the band); the box's content follows the band.
                                     Texts read {titleText} (the box title), {boxText} (the content: each paragraph / list
                                     item on a line), {boxText.<n>} (the n-th, from 1), {attr.key} (fence attributes) and
                                     {title}/{author}…; image resourceId may use them ('ruling-{attr.r}'). setsContent: the
                                     design prints the content and the box does not set it again (and never splits): one
                                     style per shape, the words in each fence. First fragment only. }
```
Gotchas: `body.textAlign` only `'left'|'justify'|'start'` (start/end values, ≥ 1.15, follow the box's own `{dir}`: use them in a preset shared by LTR and RTL editions). Callout body inherits body text colours,
so boxes with coloured bold need `body.boldColor`. `span:'page'` in a multi-column layout cuts
the page into bands (text above levelled). Nested callouts take their own style but ignore
span/placement/floatBarrier/snapToGrid. Ordered-list numbers inside a box come from the global
`orderedLists` (callout `lists` has bullet fields only); `:::columns` groups share the box body. A box
that splits cuts inside a group too (≥ 1.25, `layout.flowColumns`): snake groups fill their columns in
turn, parallel ones (`breaks`) go on stream by stream; a nested box in a group stays whole.
A box style with a `design` replaces "one heading level per exercise kind": write each exercise as
`:::callout{type="row" title="Trace and write"}` / `cat` / `:::` and print `{boxText}` from the design
(`setsContent: true`); the fence `title` stays in the Markdown, the style holds the shape only.

---------------------------------------------------------------------------------

## 12b. `codeStyle` — CodeStyleConfig (postext ≥ 1.23)

Code listings: the ```` ``` ```` / `~~~` fences of the text (document-format.md §3.4) and inline
code. Every listing is set line by line as written in a box built from these fields (the callout
machinery: it nests in a `:::callout`, splits between lines across columns and pages, spans the
page). Unset fields keep their defaults; the section is absent from most presets.
```
codeStyle
├─ blocks          boolean  true      false = fences read as Markdown (1.22; a preset below configVersion 9 whose chapters hold a fence reads false)
├─ indentedCode    boolean  false     also read 4-space / tab-indented runs after a blank line (off: lists and prose indent with spaces)
├─ fontFamily      string   'Source Code Pro'   monospaced; a CJK mono face (BIZ UDGothic) sets full-width characters at two cells
├─ fontSize        Dimension 0.85em   em = body size
├─ fontWeight 400 / boldFontWeight 700
├─ lineHeight      Dimension (unset = the body grid line; em = code size)
├─ snapToGrid      true     color = body colour
├─ backgroundEnabled true  background=#f4f4f4   border {enabled=false, color=#cccccc, width=0.5pt}   borderRadius=0
├─ padding         {top,right,bottom,left} 0.6em (em = code size)   marginTop / marginBottom 0.75em
├─ span            'column' | 'page'   (fence: span=page)
├─ tabSize         4        a tab = segment to the next multiple of N cells (kept as \t when copied)
├─ overflow        'wrap' | 'shrink' | 'clip'   ('wrap': break after the last space/punctuation that fits, rest
│                  wrapIndent=2 cells in behind wrapMarker='»'; 'shrink': whole listing smaller down to
│                  minFontScale=0.8, then wrap; 'clip': cut at the box edge). Each raises `codeOverflow`.
├─ lineNumbers     false    gutter numbers (fence: lineNumbers, lineNumbers=false, start=N); lineNumberColor=#8a8a8a, lineNumberGap=1em
├─ highlightBackground #fff4c2  band behind fence highlight="3,5-7"
├─ keepTogether false  splitMinLines 2  repeatTitle false  continuesMarkerEnabled false  continuesMarker (doc language)
├─ titleStyle      CalloutTitleStyleConfig (default code face, bold, 0.9 size)   label? CalloutLabelConfig → title in a label tab
├─ highlight       'builtin' | 'none'
├─ tokens          Partial<Record<kind, {color?, bold?, italic?}>>   kinds: keyword string number comment function type
│                  operator punctuation variable meta prompt output; merged per kind onto a quiet default palette;
│                  palette-linked colours follow colorPalette and :::part palettes
└─ inline          { fontFamily (= codeStyle.fontFamily), fontSize=0.9em, color?, bold, italic, background?, borderColor?,
                     borderWidth=0.5pt, borderRadius=0.2em, paddingX (0.2em with a fill, else 0), paddingY=0.1em,
                     otherScripts='text' | 'code' (≥ 1.34.1: Arabic, Hebrew, CJK letters in inline code take the
                     face of the text around it; 'code' only for a code face that has them) }
                   unset = inline code in the body face (as ≤ 1.22). Set = one unbreakable unit, like a chip.
```
- **Built-in tokenizer**: js/ts (jsx, tsx), json, python, bash/sh/zsh, console (prompt lines vs
  output), css, html/xml, markdown, sql. Other languages are plain. `registerCodeHighlighter(lang | '*',
  fn)` (from `postext`) plugs in Shiki/Prism: `fn(code, lang)` returns lines of `{text, token?, color?}`
  runs; register inside the layout worker. A fence's title (`title=`, or a bare second word) prints in a
  title row, or in the label tab when `codeStyle.label` is set.
- **Recipes**: a dark terminal box = `background` dark, `color` light, `tokens.prompt {bold}`,
  `tokens.output {color}`; a manual's listing in the text face's tint = `background` the tint,
  `fontFamily` a CJK mono face. Copy the source's colours into `tokens`, never into bold/italic runs.

---------------------------------------------------------------------------------

## 13. `chipStyles[]` — ChipStyleConfig

Inline `:chip[text]{style="id"}` (word banks, keys, tags). Chip without style → first style.
```
{ id (REQUIRED), name?, backgroundEnabled=true, background=#e8eef7, borderColor=main,
  borderWidth=0.5pt (0 = none), borderRadius=0.3em, paddingX=0.3em, paddingY=0.1em (paints outside line box),
  paddingTop?/paddingBottom? (= paddingY; top larger than bottom, e.g. 0.2em/0.05em, centres a capital in a round chip),
  fontFamily?/fontSize?/color? (= surrounding text; fontSize em = surrounding), bold=false, italic=false, gap=0.25em,
  dotted?: { spacing = 0.1em, size = 0.05em } (≥ 1.46: the chip's letters as dots to trace; with no fill, no outline
  and no padding a chip is a dotted word in the line, :chip[gato]{style="dots"}),
  underline?: 'solid'|'dotted'|'dashed' (the outline as a line under the text only, borderWidth in borderColor: a
  blank to write on), minWidth?: Dimension (narrowest box, outline and padding included; the text is centred) }
```

---------------------------------------------------------------------------------

## 13b. `markStyles[]` — MarkStyleConfig (postext ≥ 1.34.1)

Inline `:mark[text]{style="id"}`: a coloured band behind a phrase, as a textbook highlights its key words. The
marked words stay ordinary text (they break at line ends, hyphenate and justify like the words round them; each
line gets its own band), unlike a chip, which is one unbreakable box. A mark without `style`, or with an id no
style declares (`unknownMarkStyle`), takes the first style; declaring `markStyles` replaces the default list.
```
{ id (REQUIRED), name?,
  background: ColorValue = #fff0a0 (palette-linkable), color?: ColorValue (the text's; reaches the whole word that
  holds glued punctuation), borderRadius = 0 (square ends, the print norm; 0.2em up to postext 1.51, which a config stored then keeps through the configVersion 18 pin when its text has a mark; write it to round a band's ends), paddingX = 0.15em (past the
  first and last letter, into the word spaces), paddingY = 0.05em, paddingTop?, paddingBottom? (each in place
  of paddingY), decorationBreak = 'slice' | 'clone' (postext ≥ 1.52.0; 'clone' gives every line piece of a wrapped
  phrase a whole band, paddingX and corners on both ends: a heading on a colour band cut per line) }
```
The band takes no room: the lines break as they would without the mark, so marking a laid-out book moves no page.
Port rule: one style per distinct highlight colour of the source, the highlight's text colour in the style's
`color`; never a row of chips split by hand at the source's line ends, and never two chips for a translated phrase.
Limits: a heading drawn by a design (an opener) prints the words without the band, and so does the HTML viewer on a
vertical page. An engine older than the release that ships `:mark` prints `:mark[…]` literally (check `postext
--version`).

---------------------------------------------------------------------------------

## 13c. `exerciseStyles[]` and `exercises` — exercises

`:::exercise{style="id"}` (document-format.md §7.6) picks a style; none or an unknown id (`exerciseUnknownStyle`)
→ the first. One style, `exercise`, ships by default; declaring `exerciseStyles` replaces it. `extends` merges
each group field by field (`icons` by id). Defaults marked *lang* follow the document language.
```
ExerciseStyleConfig {
  id (REQUIRED), name?, extends?,
  box?: calloutStyles id (frame: fill, border, stripe, padding, splitting); unset = frameless, kept together,
  marginTop=1em, marginBottom=1em (frameless only), itemSpacing=0.25em,
  number: { show=true, label=false (true = lang word "Exercise"/"Ejercicio"/"练习"…, or a string),
            shape='none'|'disc'|'square'|'rounded', color? (white on a shape, else main), background=main,
            fontFamily?, fontSize=1em, fontWeight=700, suffix='.' (none on a shape), template='{n}' ({h1} {h2}),
            resetOn='h1' ('never'|'h1'…'h6'), counter='exercise' (styles sharing it share the count),
            format='decimal' (any ResourceCounterFormat: 'simp-chinese-informal' 一二, 'circled-decimal' ①…) },
  instruction: { bold=true, italic?, color?, fontFamily?, fontSize? }  (the number stays upright in italic, ≥ 1.60),
  options: { labels=lang ('alpha-lower'; zh 'alpha-upper', ja 'katakana', ar 'abjad'; or 'none'), prefix='',
             suffix=lang (')'; zh '.', ja ''), marker='none'|'box'|'circle', layout='stack'|'row',
             columns? (row layout, ≤ 6), shuffle=false, indent=1em,
             bracket=false (（　） after each stem for the letter: zh/ja tests) },
  blank: { look='line'|'dots'|'box'|'none', width='longest'|'answer'|Dimension, extra=1.5em, minWidth=3em,
           color? (black; set, it also colours tick boxes/rings and bank word frames), weight=0.6pt },
  trueFalse: { labels=lang ([T,F] en; V F es ca fr it pt; R F de; √ × zh; ○ × ja; صح خطأ ar),
               look='boxes'|'bracket' (one blank), place='end'|'start' (≥ 1.60: before the statement, `( ) frase`) },
  match: { look='dots'|'letters', gap=4em, dotSize=0.35em, color=main (dots + bank frame) },
  bank: { box?: calloutStyles id, order='shuffle'|'alpha'|'written', separator=em space },
  area: { kind='lines'|'dots'|'grid'|'seyes'|'tianzige'|'box'|'none', lines=3, spacing? (1.35 × line height),
          color=#b8b8b8, weight=0.5pt },
  grid: { cell=1.6em, fontFamily?, color?, rule=#8a8a8a, ruleWidth=0.6pt, uppercase=true,
          fontSize? (em of the text; else 0.58 of the cell), blocked? (a crossword's empty cells) }  (operations' cells are 0.8 × cell),
  arithmetic: { division=lang ('bracket' en zh ja ar; 'potence' es ca fr it pt; 'inline' de), columns=4,
                partialProducts=true (≥ 1.60: a row per non-zero digit of a 2+ digit multiplier),
                working=lang (≥ 1.60: 'remainders' es ca it, one row a division step; 'products' elsewhere, two) },
  level: { glyph='●', empty='○', max=3, color=main },
  icons: { [id]: { resourceId? | glyph + fontFamily?, color?, alt?, size?=0.75 } }  (inline symbols after the number, size in ems; beside a shaped number they take its height and band),
  answers: { color=#d6246e, fontFamily?, italic=false }  (teacher's edition, example items, key marks),
  solutions?: ExerciseSolutionsConfig (over the book's, for this style's exercises),
  digital: { correctColor=#1e8e3e, wrongColor=#c5221f, maxChecks?, reset?, maxResets?, showSolution? (over the book's) }
}
ExercisesConfig (config.exercises) {
  edition='student'|'teacher' (teacher: every answer printed in its slot in answers.color),
  solutions: { placement='none'|'after'|'inverted'|'chapterEnd'|'directive', box?: calloutStyles id,
               heading=lang ("Solutions", "Soluciones", "参考答案"…), layout='full'|'key' },
  seed=1 (every shuffle; change it for another version of a test),
  digital: { interactive=true, persist=true (answers kept in the browser), check='button'|'instant',
             maxChecks=0 (Check presses per attempt; 0 no limit; not with 'instant'), reset=true (Try again),
             maxResets=0 (fresh starts; 0 no limit), showSolution='always'|'afterCheck'|'noChecksLeft'|'never'
             (≥ 1.63; showing it ends an attempt with limited checks), passingScore=0 (percent; a SCORM package's pass mark) }
}
```
For a test beside practice, give a style limits (`{ id: 'test', extends: 'exercise', digital: { maxChecks: 1,
maxResets: 0, showSolution: 'noChecksLeft' } }`) and keep the book's defaults for the rest. A source that is a course
for an LMS (a SCORM package, an e-learning module) maps its quiz rules here; the Sandbox's **SCORM** tab (and
`postext-scorm`'s `renderToScorm`) then exports chapters or sections as SCOs that report score, completion and
pass or fail. Limits bind in an LMS; in HTML and EPUB they live in the reader's browser.
The HTML viewer and EPUB make exercises answerable (type, click or drag, Check / Show solution / start again; the
bar shows only the buttons that apply, none for an exercise with nothing to answer); the key is always in an EPUB.
Every word of a `mark` text is markable on screen (wrong ones count). A fence's `area=none` (a talking exercise)
leaves nothing to type on screen; a style's `area.kind: 'none'` is an unruled area still typed in. A screen-only
form goes in `htmlViewer.overrides` (it takes `exercises` and `exerciseStyles`): `htmlViewer: { overrides: {
exercises: { solutions: { placement: 'none' } }, exerciseStyles: [{ id: 'exercise', area: { kind: 'none' } }] } }`
— print keeps its own.

Port rule: one exercise style per look of the source's exercises (numbered disc + sans instruction for activities,
a plain bold number for review questions), never one per exercise kind or per page; the questions, options and
answers stay in the chapters (playbooks.md C7).

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
                              ≥ 1.28 a token takes a heading template's style suffix: '{h1:A}.{n}' = A.1 in a lettered appendix,
                              '{h1:I}.{n}' = II.3, '{n:i}' over counterFormat; unknown style = decimal; ≤ 1.27 printed '{h1:A}' as text
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
          span 'page' + position 'here' (≥ 1.19): on a multi-column page the ::resource line cuts the band like a
                         page-span box: the columns above close level (or the resource moves to the next page's head),
                         it is set across the content width, and the text goes on in every column under it; on a
                         one-column page it is an ordinary inline embed. `columns` does nothing for an inline embed
rotate?:  'ccw' | 'cw'   (landscape: page-span float on its own page)
width?:   0 < w < 1 fraction of column/page width (default whole)
align?:   'left' (default) | 'center' | 'right' | 'start' | 'end'   (start/end ≥ 1.15: logical sides; left/right are
                         flow sides, so in an RTL book 'left' is the sheet's right)
captionSide?: boolean    caption in the float-only side column, level with the figure (oneAndHalf+floats): column floats and,
                         ≥ 1.28, a 'here' embed one column wide (layout.inlineCaptionSide; not in a box, a vertical page or with wrap)
              | 'inside' ≥ 1.52: caption + note beside a picture inside its own slot, any layout (1 or 2 columns,
                         page span, 'here', box, frame): picture = `width` of the slot (default 0.5) at `align`'s side,
                         caption = the rest after layout.gutterWidth, top-aligned; block = the taller of the two;
                         band < 1/5 of the slot -> caption under. Pictures only; no wrap, rotate or vertical page
columns?: number         ≥ 1.18: a span:'column' float across this many adjacent columns (picture across 2 of 5);
                         ≥ the page's column count = page-wide; ignored for page/side spans, rotate, here;
                         captionSide only on 1-column floats
shrink?:  'never' (default) | 'page' | 'slot'   ≥ 1.24, pictures only (bitmap, svg, video poster): scale the float,
                         proportions kept, to the room of its slot instead of moving it on. 'page': only when it is
                         too tall for a fresh page's band (opener, other floats, footnotes deducted); 'slot': also into
                         a slot of the citing page when it fits at minScale or more. Safe area cropped first.
                         Falls back to layout.floatShrink.mode. Tables split instead; rotated floats keep their own fit
minScale?: number        ≥ 1.24, 0–1, default 0.7 (then layout.floatShrink.minScale): smallest scale. A slot needing
                         less is skipped; on a fresh page the picture is set at minScale and overruns (floatShrunk
                         warning with overflowPx)
captionMeasure?: 'slot' (default) | 'body'   ≥ 1.24: caption and note of a picture narrower than its slot at the
                         picture's width, placed per align (floats and inline embeds)
wrap?:    'none' (default) | 'left' | 'right' | 'start' | 'end' | 'contour'   ≥ 1.24: text runs beside the resource, which sits at that
                         side of its column (flow sides, as align; start/end synonyms). position 'here': the paragraphs,
                         quotes and list items after the ::resource line run beside it, then full width under it (one
                         paragraph can do both); a 1-column span:'column' float at the head/foot of a column: the column's
                         first/last lines. Width = width, else layout.wrap.defaultWidth (0.45). Headings, display maths,
                         figures, tables, boxes and poems go under it. Page-span, multi-column, side, rotated floats and
                         vertical text keep their band. Too narrow (layout.wrap.minTextWidth) or too short
                         (minLinesBeside) = band + textWrap warning; columns with a wrap are not balanced
wrapGap?: Dimension      ≥ 1.24: space between the wrapped item (caption included) and the text beside and under it;
                         default layout.wrap.gap, else one body line
wrap: 'contour'          ≥ 1.36: text runs round the picture's shape instead of its box, on the side away from
                         align ('right'/'end' puts the picture right, anything else left). Each line beside it is as
                         short as the shape is wide there, plus the margin; a line clear of the shape takes the full
                         measure. Same uses and limits as a side wrap (inline embed or 1-column float). Shape =
                         Resource.contour: { points?: [{x,y}…] (≥ 3, fractions of the whole picture, wins; the way to
                         shape an SVG), alpha? = true (bitmap alpha channel), threshold? = 0.5 (opacity 0–1),
                         margin?: Dimension (default the wrap gap) }. The alpha trace (contour.traced) is made by the
                         bundle reader / Sandbox: never write it, bundles strip it. No known shape (JPEG, SVG with no
                         points, untraced) = runs round its box with textWrap reason noContour. Scales and crops with
                         the picture (safe area)
citingPage?: boolean     ≥ 1.25, position top/auto, span column/page, not rotated: head the page (page span) or column
                         (column span, columns too) where the citing line lands, LaTeX's [t], instead of the first free
                         slot after it; the text above the reference moves down under it. Only when it fits within
                         layout.maxTopFraction of the column, the earlier floats of its sequence are set, no explicit
                         break opens the page (chapter's first page, part, :::pagebreak), nothing page-wide stands above
                         the citing line, and the citing line stays on that page; else its usual slot. Falls back to
                         layout.floatsAtCitingPage. Read after its citation in tagged PDF / HTML
```
A type may leave fields out (≥ 1.38): the built-in type of the same id (`figure`, `table`, `video`, in the document's
language) fills them, else `name` is the id, `shortLabel` and `captionPrefix` the `name`, `numberingTemplate`
`{h1}.{n}` (`{h1}-{n}` in Chinese, Japanese and Arabic), `resetOn` `'h1'`, `counterFormat` `'decimal'`; a `resetOn` that
names no level counts as `'h1'` with `unknownConfigValue`. So `{ id: 'foto', numberingTemplate: '' }` is a whole
unnumbered type; write every field only for an engine older than 1.38.
Gotchas
- **Engine default types follow the document language**: with `resourceTypes` unset, the
  engine uses `defaultResourceTypes(locale)` (else the hyphenation locale; strings exist for
  en, es, fr, de, it, pt, ca, nl, Chinese (Simplified and Traditional), Japanese and Arabic, English otherwise). Chinese, Japanese
  and Arabic number `{h1}-{n}` (图1-1, 図1-1, شكل ٢-٣). Chinese: 图/圖 and 表, numbered
  `{h1}-{n}` (图1-1), continued tables （续）/（續）. Older engines used English. Still declare
  `resourceTypes` explicitly in a preset (and change a language's wording with
  `localized.<lang>.config.resourceTypes` entries by `id`, e.g.
  `[{ "id": "figure", "captionPrefix": "Figure" }]`, configVersion 21).
- Numbering follows first `:ref` in reading order; `{h1}` is the chapter number (continues across chapters in book mode).
- Pair `{h1}.{n}` with `resetOn:'h1'`.
- Only referenced resources are numbered (`:ref` or `::resource`, in first-reference order, any placement). An image
  that only a design draws (opener, running head, part page) gets no number and leaves the counter alone. In a book,
  the chapter with the first reference places and numbers it; later chapters' `:ref`s print that number and place
  nothing.
- `{h1}` counts every H1 whose style is not `numbered: false`, including one whose template is empty. So an article
  whose only H1 is its title numbers 1.1, 1.2. For Figure 1, 2…: a type `{ numberingTemplate: '{n}', resetOn: 'never' }`,
  or `numbered: false` on the title's heading style (such an H1 neither advances `{h1}` nor triggers `resetOn: 'h1'`;
  `{h1}.{n}` before the first counted H1 collapses to `{n}`). A heading token with no value collapses with its
  separator.
- Lettered appendices (heading style `numberingTemplate: 'Appendix {1:A}'`, `startAt=1` on the first): ONE extra type for all of them,
  `{ ...table, id: 'table-a', numberingTemplate: '{h1:A}.{n}', resetOn: 'h1' }` (≥ 1.28). Do not write the letter into the template
  (`'A.{n}'`, one type per appendix): that was the ≤ 1.27 workaround. Numbered boxes (`calloutStyles[].numbering.numberingTemplate`) and
  `equationNumbering.numberingTemplate` take the same suffix.

---------------------------------------------------------------------------------

## 16. Tables — `tableStyle` and `tableStyles[]`

tableStyle; fonts/colours inherit bodyText:
```
bodyFontFamily, bodyFontSize, bodyColor           → body text
headerFontFamily, headerFontSize, headerColor     → body text
figureStyle                                       every cell, header and body (§20a): 'lining-tabular' lines up columns; unset = body's
headerBold = true, headerItalic = false
headerLetterSpacing = 0pt (em = header size), headerTextTransform = 'none' | 'uppercase'
headerBackgroundEnabled = true, headerBackground = #f0f0f0
bodyBackgroundEnabled = false, bodyBackground = #ffffff
bodyAlternateBackgroundEnabled = false, bodyAlternateBackground = #f2f2f2   (zebra rows: every second body row after the header)
borders = true, borderColor = body colour, borderWidth = 0.75pt
cellPadding = 0.375em (em = table body size)
rules = 'grid' | 'horizontal' | 'outer' | 'none' | 'booktabs'   ('grid')
borderRadius = 0pt   (outer frame; fills clipped; booktabs rules stay straight)
booktabs (≥ 1.24) — journal tables: heavy rule above + under the last row, light rule under the header,
  no verticals; borderWidth is ignored, borderColor colours the rules (em = body cell size):
  heavyRuleWidth = 0.08em, lightRuleWidth = 0.05em, spanRuleWidth = 0.03em   (0 drops that rule)
  spanRules = 'trimmed' | 'full' | 'none' ('trimmed': rule under a head spanning columns above the
    last header row, shortened by spanRuleTrim = 0.5em at both ends, LaTeX \cmidrule(lr))
  groupRules = false   (light rule above body rows that head a group: one cell across the table)
  continuedFootRule = 'bottom' | 'light' | 'none' ('light' default: a split part that goes on ends light;
    every part repeats the header with top + header rules; only the last part gets the heavy rule)
overflow = 'split' | 'clip' | 'hide'                ('split': repeats header rows, caption + continuedSuffix)
splitInline = true   (≥ 1.25) overflow applies to `here` tables too: one that does not fit the rest of its column is
  cut between rows (first part ≥ header + 2 rows, else the whole table moves on; parts go on at the head of the
  next column at its width; < 5 body rows never cut); 'clip'/'hide' for one taller than a column; not inside boxes
  or on vertical pages. false = 1.24 (moves whole); a preset below configVersion 11 embedding a resource reads false
continuedSuffix = '(cont.)', continuesMarkerEnabled = true, continuesMarker = 'Continued' | 'Continúa' (by locale)
```
tableStyles[]: `{ id (REQUIRED), name?, …any tableStyle field }` — unset fields inherit
`tableStyle`, then body. Picked per table by `resource.table.styleId`.
Not in config (lives in the resource's TableModel): `columnWidths` (relative weights),
`headerRowCount`, cell `align`/`verticalAlign`/`background`/`colSpan`/`rowSpan`/`image`.
Table line height = body leading ratio × table font size (no key; `bodyLineHeight` is ignored).
Zebra rows: `bodyAlternateBackgroundEnabled` + `bodyAlternateBackground` (counted by model row after the
header rows; a cell's own `background` wins; a split table keeps each row's stripe).
Journal, paper and textbook tables with three rules (top, mid, bottom) and short rules under spanning
heads: `rules: 'booktabs'` with `headerBackgroundEnabled: false` and black (ink) `borderColor`; not
`'horizontal'` with pale hairlines, which rules every row.

---------------------------------------------------------------------------------

## 17. `captionStyle` — CaptionStyleConfig

```
fontFamily, fontSize, color  → body text (label and description share family+size: engine limit)
figureStyle                  label and description (§20a); unset = the body's figures when in the body family
align = 'left' (TextAlign), gap = 0.75em (em = caption size; body↔caption)
labelBold = true, labelItalic = false, labelColor = color
labelNumberGap = ' ' (no-break space) between label and number; labelSeparator = '. ' after the number (≥ 1.9)
   Chinese captions: labelNumberGap '' and labelSeparator '　' (U+3000) → 图1-1　标题
   Japanese documents (locale ja, ≥ 1.16): those two are the defaults when unset → 図1-1　題 (don't restate them)
descriptionItalic = false
position = 'below' | 'above'
backgroundEnabled = false, background = main, padding = 0.35em   (bar behind caption)
note = { fontSize = 0.85×caption size, color = caption color, italic = false, gap = 0.35em, align = 'left' }
```
Per-type: `resourceTypes[].captionStyle` partial (e.g. tables `{position:'above'}`).
Caption text supports inline markdown; a bold lead sentence is written as `**…**` in the caption.

---------------------------------------------------------------------------------

## 18. `diagramStyle`

`{ singleInk = false, inkColor = main-color, inlineFonts = true }` — `singleInk` recolours every
SVG to tints of one ink by luminance (spot-colour books) and disables SVG `pdfFileId` print
masters when on. `inlineFonts` (≥ 1.25) embeds in each SVG the faces its `<text>` names before it
is shown as an image (canvas, HTML, EPUB, PDF raster fallback), so labels set in the book's fonts;
a resource opts out with `svg.inlineFonts: false` (`"inlineFonts": false` in preset.json).

## 18b. `scoreStyle` / `scoreStyles` — music scores (postext ≥ 1.54)

How every notation fence and `kind: 'score'` resource is engraved (music.md).

```
scoreStyle
├─ enabled = true             notation fences are scores (false: code listings; configVersion < 20 pins false)
├─ staffSize = 6mm            height of a five-line staff (rastral size)
├─ musicFont = 'Bravura'      'Bravura'|'Leland'|'Petaluma'|'Leipzig'|'Gootville' (SMuFL)
├─ textFont = body face       lyrics, tempo, directions
├─ spacing = 1                horizontal note spacing factor (>1 spreads, fewer bars per system)
├─ barNumbers = 'system'      'none'|'system'|'every'
├─ systemGap = 3mm            between two systems of a score
├─ marginTop = 6pt, marginBottom = 6pt   around a fence score
├─ color = body text colour   ink of the notation
└─ minSystemsAtBreak = 1      fewest systems left at a column foot or carried over
scoreStyles[]  { id, name?, …any field above but enabled }   unset fields inherit scoreStyle
```

## 18a. `videoStyle` — VideoStyleConfig (postext ≥ 1.16)

How every `kind: 'video'` resource (project-format.md) prints and plays. Print (canvas, PDF, Folio)
shows the poster with the overlays; the HTML viewer and EPUB play the video.

```
videoStyle
├─ playMark { enabled=true, shape='circle'|'rounded'|'triangle', position='center', size=12mm,
│             inset=4mm, color=#ffffff, background=main-color, backgroundOpacity=0.9 }
├─ qr       { enabled=true, position='bottom-right', size=18mm, inset=3mm, errorCorrection='M'
│             ('L'|'M'|'Q'|'H'), quietZone=2 (modules), color=#000000, background=#ffffff, radius=1mm }
├─ linkPoster = true          PDF: URI link over the poster to video.link (EPUB: poster linked too)
├─ html = 'player'|'poster'   HTML viewer: play in place, or show the printed poster
└─ player { controls=true, download=true, fullscreen=true, playbackRate=true, pictureInPicture=true,
            remotePlayback=true, autoplay=false, muted=false, loop=false, exclusive=true, preload='metadata', privacy=true }
```

Positions: `'center'`, `'top-left'`, `'top'`, `'top-right'`, `'left'`, `'right'`, `'bottom-left'`,
`'bottom'`, `'bottom-right'`. The QR code encodes `video.link` (the YouTube/Vimeo watch URL, or a
self-hosted file's production `url`); a file without `url` prints no QR code and no link
(`videoWithoutUrl` warning). `resource.video.player` overrides `player` for one video.
`exclusive: false` (≥ 1.18) lets a video play alongside the others (HTML marks it `data-pt-alongside`; the
host calls `coordinateVideoPlayback(root)` to pause what a started video does not play with). In Folio an
`autoplay` + `exclusive: false` video starts muted each time its page comes into view and stops when it is
turned away, several at once: the silent loops (`loop: true`) of a "living" page. In an EPUB, a page or
chapter with two or more players, one of them exclusive, links the same rule as `scripts/videos.js`
(`VIDEO_PLAYBACK_SCRIPT`, the document declared `scripted`): readers that run scripts keep to it within
that document. YouTube/Vimeo embeds play on their own terms.
`download: false` hides the HTML5 download button (`controlslist="nodownload"`); it does not
protect the file. `privacy` embeds YouTube from youtube-nocookie.com and Vimeo with `dnt=1`. An
EPUB never embeds a YouTube/Vimeo player (EPUBCheck RSC-006): those are the poster linked to the
video; a self-hosted file is packed under `media/` and plays in `<video>`.

## 19. `math`

`{ enabled = true, fontSizeScale = 1.0, color? (= body), marginTop = 0.8em, marginBottom = 0.8em,
indentAfterDisplay = true, keepWithLeadIn = false, equationNumbering }` (MathJax SVG).
- `equationNumbering` (postext ≥ 1.19) `{ enabled = true, numberingTemplate = '{n}', resetOn = 'never',
  counterFormat = 'decimal', format = '({n})' }` numbers the formulas (rows) that carry `\label`;
  `'{h1}.{n}'` + `resetOn: 'h1'` gives (2.1). Counters carry across chapters in
  `LayoutContinuation.statementCounters` (`continuationAfter`).
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
| `placement` | `'column'` | `'column'` = foot of the column holding the citing line (one-column: page foot); `'chapterEnd'` = every note of the chapter after its last block, in citation order; `'spread'` (≥ 1.16, vertical books) = 傍注: the notes of both pages of a spread at the foot (fore-edge end) of its odd (left) page, top-aligned, overflow to the even page then the next spread; in horizontal text it falls back to `'column'` with an `unknownConfigValue` warning |
| `numbering` | `'chapter'` | restarts under each level-1 heading and each document; `'document'` runs on (book chapters carry it as `continuation.footnoteNumber`); `'page'` / `'column'` (≥ 1.11) restart on every page / column, counted where the layout sets the notes (column-foot notes only; `chapterEnd` numbers by chapter); `'spread'` (≥ 1.16) per spread, with `placement: 'spread'` |
| `numberFormat` | `'decimal'` | ≥ 1.11; any number-format spelling: `'lower-roman'`, `'circled-decimal'` / `'①'`, `'cjk-decimal'`, `'一'`…; circled past 50 → decimal |
| `numberFormat: 'symbols'` | | ≥ 1.19; `'symbols'` (or `'*'`) marks the notes with `symbols` in turn, then doubled (** †† ‡‡…) and tripled; with `placement: 'column'` the count restarts on every page unless `numbering` is set |
| `symbols` | `['*','†','‡','§','‖','¶']` | ≥ 1.19; the sequence for `'symbols'`; empty strings dropped, empty list = default. Google/Fontsource Latin files lack ‡ and ‖ (`missingGlyph` in the PDF): use `['*','†','§','¶']` or a face that has them |
| `markerPosition` | `'auto'` | ≥ 1.11; `'superscript'` / `'inline'` (on the baseline, upright cell in vertical text); `'auto'` = inline for `circled-decimal`, else superscript. ≥ 1.16: `'side'` (合印: a small marker beside the marked word on the ruby side, ending with its last character, taking no advance) and `'right'` (smaller, flush with the right side of a vertical line; superscript in horizontal text). The note's own number follows |
| `markerSize` | `1em` | ≥ 1.11; inline marker size, em = surrounding text (`0.75em` common); default `0.6em` for `side`, `0.7em` for `right` |
| `numberGap` | `'en'` | ≥ 1.16; space after the note's number: `'em'` = one note-em (U+3000 in CJK notes), JLReq's endnote setting |
| `markerTemplate` | `'{n}'` | `{n}` = the number in its format and the document digits; `'({n})'` → «(١)» for Arabic books; marker and note number alike |
| `noteNumberPosition` | `'auto'` | `'superscript'` / `'inline'` for the note's own number; `'auto'` follows `markerPosition`. Arabic books: `{markerTemplate:'({n})', numbering:'page', noteNumberPosition:'inline'}`; the rule and numbers go to the right by themselves in an RTL book |
| `chapterEndAlign` | `'foot'` | `chapterEnd` only: `'foot'` = the notes that close a column sit at its foot; `'text'` = right under the text |
| `fontSize` | `0.8em` | em/rem = body size; body family and weights |
| `lineHeight` | `1.25em` | em = note size; notes are **off the baseline grid** (stack up from the column foot) |
| `color` / `textAlign` | body | |
| `wordBreak` | `cjk.wordBreak` | ≥ 1.28; `'keep-all'` / `'normal'` for the notes alone: `'keep-all'` keeps the Chinese or Japanese readings an English or Spanish note quotes whole (`看月光`) in a book whose body breaks between any two characters. Use it instead of word joiners (U+2060) between the characters |
| `hangingIndent` | `0` | turnover lines align past the number |
| `spaceBetween` | `0` | between two notes |
| `spaceAbove` | `0.5em` | text → rule; em = body size |
| `spaceBelowRule` | `0.4em` | rule → first note |
| `separator` | `{enabled:true, width:0.3, lineWidth:0.5pt, color:note colour}` | `width` = fraction of the column, from its left edge; `enabled:false` keeps the spaces |

- **Japanese defaults** (`locale` ja, ≥ 1.16; only for fields left unset, so an explicit value survives a
  save): vertical books `placement: 'chapterEnd'` (後注), `numbering: 'chapter'`, `markerPosition: 'right'`,
  `markerTemplate: '（{n}）'` (digits upright by `cjk.uprightDigits`); horizontal books `placement: 'column'`,
  `numbering: 'page'`, superscript; both a ⅓ rule (`separator.width`) and, for chapter-end notes,
  `numberGap: 'em'` with a 2-note-em `hangingIndent`. Spread sidenotes: `placement: 'spread'` (numbering
  `'spread'` follows). Write the marker before a sentence-final 。: `先生[^1]。`.
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

## 19a2. `crossRefs` — CrossRefsConfig (postext ≥ 1.12)

What a cross-reference to a heading or an anchor prints (document-format.md §10.6). Templates hold `{n}`; one without it gets the number after a no-break space. Unset templates follow `locale` (en *chapter {n} / section {n} / p. {n}*, es *capítulo / sección / pág.*, zh *第{n}章 / 第{n}节 / 第{n}页*, plus fr, de, it, pt, ca, nl).

```ts
crossRefs: {
  chapter?: string;   // level-1 heading: "chapter {n}"; a number its template already words (第{1:一}章) prints as is
  section?: string;   // levels 2–6: "section {n}", "§ {n}"
  page?: string;      // style=page: "p. {n}"
  defaultStyle?: 'default' | 'number' | 'title' | 'page'; // a :ref to an anchor without style=
  breakLabels?: boolean; // ≥ 1.28, default true: a label of words breaks at its spaces; false = one word, as ≤ 1.27
}
```

**Labels that break (postext ≥ 1.28).** A reference that prints words (the text of a `[words]{#id}` anchor, a
heading's or a box's title under `style=title` or on an unnumbered target, a `text="…"` override, on a figure or
table reference too) is set word by word: lines break at its spaces, the spaces stretch on a justified line, the
words are never hyphenated, and it stays one link (one per line in the PDF, one `<a>` in the reflowable EPUB). A
label with a number or a page (`section 3.2`, `p. 112`, `Fig. 1.7`, `Theorem 2`) never breaks. In a label of words a number, a Roman
numeral or a single letter keeps to the word before it, so `text="Fig. 1a"`, `text="plate IV"` and `text="Appendix A"`
stay whole and `text="the map in Fig. 1a"` breaks only between its words. So anchor the
whole phrase the source refers to (`[close the lever so that it points backwards]{#step}`): up to 1.27 a long
label could not come up to the line before and ports shortened the anchored phrase to two or three words. Glue
words of a label that must stay together with U+00A0. A preset below `configVersion` 12 with a reference in a
chapter reads `breakLabels: false`.

## 19a3. `citations` — CitationsConfig (postext ≥ 1.12)

Citation style and presentation (document-format.md §10.7). Needs `postext-citeproc` registered.

```ts
citations: {
  style?: string;            // 'apa' (default) | 'ieee' | 'chicago-notes-bibliography' | … | 'custom'
  customStyle?: string;      // CSL XML when style: 'custom'
  locale?: string;           // CSL locale; default: document language (es → es-ES, zh-Hant → zh-TW, ja → ja-JP)
  link?: boolean;            // citations link to their entries (default true)
  marker?: 'style' | 'brackets' | 'parentheses' | 'superscript' | 'corner'; // numbered styles; 'corner' = 〔1〕
  collapseRanges?: boolean;  // 1–3 (default true)
  notes?: 'footnote' | 'warichu'; // note styles
  numbering?: 'book' | 'chapter'; // ≥ 1.19, default 'book'. 'chapter': each document and each level-1 heading starts again:
                                  // numbered styles count from 1, a note style writes a work in full at its first citation
                                  // per chapter. Pair with bibliography.scope: 'chapter' (proceedings, edited volumes)
  hyphenateNames?: boolean;  // false: family names of the cited authors are never divided (≥ 1.28; default true)
  bibliography?: {
    title?: string;            // default the language's word ("References", "Referencias", "参考文献"); '' = none
    scope?: 'book' | 'chapter';// 'book'
    auto?: boolean;            // true: set after the last chapter when no :::bibliography places it
    fontSize?: Dimension;      // 0.9em (em = body size)
    lineHeight?: Dimension;    // body leading (em = entry size)
    hangingIndent?: Dimension; // 2em (author-date lists)
    entrySpacing?: Dimension;  // 0.3em
    labelWidth?: Dimension;    // numbered lists: label column width; default the widest label
    labelAlign?: 'left' | 'right'; // 'left'; 'right' ends 9. and 10. together
    doi?: 'link' | 'text' | 'hide'; // 'link'
    includeUncited?: boolean;  // false (Pandoc nocite '@*')
    groupByLanguage?: boolean; // false; true sets CJK works before the others
  };
}
```

Japanese (≥ 1.16): the ja-JP locale (と, ほか, 「」 with 『』 inside) and `style: 'sist02'` (SIST 02, numeric, the
science and technology norm: `山田太郎, 佐藤花子. 縦組みの行間について. 印刷雑誌. 2015, vol. 98, no. 4, p. 12–19.`).
A CJK name with a space in BibTeX/YAML (`夏目 漱石`) is read family first. No humanities 『』 style ships; a house
style is `style: 'custom'` with its CSL.

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
| `see` | by language, italic | `{label?, alsoLabel?, italic?, separator?}`: "See"/"See also", "Véase"/"Véase también"… |
| `see.separator` | `'. '` by language | before a cross-reference (#836): `'. '` en/es/ar (Chicago: `Firearms. See weapons`), `', '` fr/it/de (`pierrier, voir éboulis`), `' '` pt/ca (NBR 6034: `Aviação ver Aeronáutica`), `'。'` zh, U+3000 ja; follows `index.locale`, else the document's. A built-in label is capitalised after `.`/`!`/`?` and lower-cased otherwise; an own label prints as written |
| `locale` | the document's | collation (Intl.Collator) |
| `ignoreArticle` | `true` for an Arabic index | sort/group Arabic entries ignoring a leading ال (البصرة under ب); vowel marks, tatweel and hamza seats are always ignored (أ إ آ ٱ → ا, ة → ه, ى → ي); separators become `، ` |
| `groupBy` | `'auto'` | `'letter'` \| `'pinyin'` (Han under the pinyin initial, 贾宝玉 → J) \| `'stroke'` (一畫, 二畫…; 一画… in zh-Hans) \| `'gojuon'` (あ行 か行 … わ行 by the reading's first kana) \| `'kana'` (each first kana: か for が/カ) \| `'none'` (no heads); `auto` = pinyin for zh / zh-Hans / zh-CN, stroke for zh-Hant / zh-TW / zh-HK, gojuon for ja, letter otherwise (since 1.9). A Japanese index sorts by reading in JIS X 4061 order: symbols, digits, Latin (letter heads), kana rows, then unread kanji entries. A polyphonic character read wrongly takes a Han `sort` key with the wanted reading (`sort="崇阳"` for 重阳); a pinyin key sorts after its letter's Han entries |
| `groups.enabled` | `true` | letter heads (A, B…, `0–9`, Symbols; 数字 / 數字 and 符号 / 符號 in Chinese) |
| `groups.fontFamily/fontSize/fontWeight/italic/color` | entries', 700 | set on the entries' pitch |
| `groups.marginTop` | one index line | above each group; none above the first or at a column top |
| `groups.splitMinEntries` | `2` (≥ 1.28) | entries of a group kept on each side of a column break: no entry alone under its head at a column foot, none alone at a column head; a group of 2–3 moves whole. `1` = any break (1.27; a preset without `configVersion` 12 that prints an index reads `1`). A last group that cannot be shared can leave the closing columns uneven |
| `groups.symbolsLabel` / `numbersLabel` | by language / `'0–9'` (数字 / 數字 in Chinese) | |

Two columns come from the **heading style** of the index chapter, not from `index`:

```json
"headingStyles": [{ "id": "index", "numbered": false, "layout": { "layoutType": "double", "gutterWidth": {"value": 6, "unit": "mm"} } }],
"index": { "fontSize": {"value": 8.5, "unit": "pt"}, "lineHeight": {"value": 11, "unit": "pt"}, "rangeFormat": "chicago",
  "groups": { "fontWeight": 700, "color": {"hex": "#8a1c1c", "model": "hex"} } }
```

Measure the source index like body text: size, leading, indent per level, hanging indent, separators
(comma, en dash), letter-head face and the space above each group.

---------------------------------------------------------------------------------

## 19c. `cjk` — East Asian typography (postext ≥ 1.9)

Every field optional; `'auto'` follows the **region** of `locale` (CN/SG/MY mainland, TW Taiwan, HK/MO Hong Kong;
`zh`, `zh-Hans` → mainland, `zh-Hant` → Taiwan; every `ja` tag → `japan`, ≥ 1.16, summarised in §19c2). A paragraph with more CJK characters than word spaces is set
by the CJK composer (first fit, push-in before push-out, spread between characters); a Latin paragraph quoting
CJK keeps Knuth–Plass. The guide is docs/chinese-layout-en.mdx (postext.dev/en/docs/chinese-layout).

| key | default (mainland / Taiwan / Hong Kong / Japan) | notes |
|---|---|---|
| `region` | `'auto'` | `'mainland'` \| `'taiwan'` \| `'hongkong'` \| `'japan'` (≥ 1.16) |
| `lineBreak` | `gb` / `basic` / `basic` / `ja-very-strict` | `'none'` (break anywhere) \| `'basic'` (no 、，。？！ 」）》 at a line start, no 「（《 at an end) \| `'gb'` (+ solidus) \| `'strict'` (+ —— …… at a start). Japanese levels (≥ 1.16, JLReq App. C): `'ja-very-strict'` (JIS X 4051: closing marks, 、。，．, ‐ – ゠ 〜 ～, ？！‼, ・：；, ゝゞヽヾ〻 々, ー, small kana, ％ ℃ never open a line; ―― …… may, unsplit) \| `'ja-strict'` (small kana, ー, 々 may open a line) \| `'ja-loose'` (newspapers: only closing marks and 、。 kept off) |
| `punctuationWidth` | `kaiming` / `fullwidth` / `fullwidth` / `fullwidth` | `'kaiming'`: 。？！ 1 em inside the line, every other mark ½, all ½ at a line end; `'fullwidth'` (in Japan with JLReq's pair table, ・：； ¼ em a side, a closing mark's ½ kept at a line end and given up first, 。's ½ never reduced inside a line); `'lineEndHalf'`; `'halfwidth'` |
| `compressAdjacent` | on / off / on / on | two marks that meet (`。」` `》（`) take 1.5 em; a centred TW/HK `。，` before a closing bracket keeps its em |
| `trimLineStart` | on / off / on / on | opening bracket at a line start, closing at an end, lose their outer half |
| `hangingPunctuation` | `'auto'`: none / none / none / allow | `'none'` \| `'allow'` \| `'force'`: one 、，。． (mainland also ；：？！) past the line end; `'allow'` never in horizontal TW/HK, `'force'` there too. Japan hangs 、，。． only, in both directions, only when the mark would otherwise open the next line (ぶら下げ) |
| `spaceAfterQuestion` | `'auto'`: off / off / off / on | ≥ 1.16; one em after ？！ inside a paragraph unless a closing bracket or another mark follows; a typed U+3000 there becomes that space; none at a line end |
| `paragraphStartBracket` | `'auto'`: as any line start (Chinese) / `half` (Japan) | ≥ 1.16; a paragraph whose first-line indent meets an opening bracket: `'indent'` (JLReq ①, indent then 「), `'half'` (③, the bracket fills the indent cell, text at 1 em: Japanese novels), `'flush'` (天付き) |
| `wordBreak` | `'normal'` | ≥ 1.16; `'keep-all'`: lines break only at spaces (U+0020, U+3000) and next to punctuation the level allows, never between two letters (kana, kanji, hangul, Latin): kana written with a space between phrases (分かち書き: picture books, primers) and Korean; a phrase longer than the line breaks inside. Replaces word joiners (U+2060) between kana. A paragraph style may set its own `wordBreak`, and the notes theirs (`footnotes.wordBreak`). ≥ 1.28: the rule also holds in a Latin paragraph that quotes CJK characters (up to 1.27 only paragraphs of CJK text obeyed it, and a quotation needed U+2060 between its characters) |
| `titleMinChars` | `2` | ≥ 1.25; a line breaks inside a 《…》/〈…〉 title (typed or added by `bookTitleMark`, also 『』 round a Japanese `:book[…]`) or a wavy/bare `:book[…]` only with this many title characters on either side: no `《說` / `文》` split, titles of ≤ 3 characters stay whole; gives way when the line has no other break. `1` = break anywhere the level allows (pre-1.25). Do not cut or reword a source to dodge a title break |
| `circledNumbers` | `'cjk'` | ≥ 1.25; ①–⑳, ⑴, ⒈, ⓐ, ❶, ➀ (U+2460–24FF, U+2776–2793) are CJK characters: one cell, no Han–Latin space, never at a line end (every level but `none` / `ja-loose`), so `**①**天也` needs no word joiner. `'western'` = pre-1.25 (Latin letters, ¼ em each side, may end a line). Vertical: upright either way |
| `composeDesignText` | `true` | ≥ 1.25; design text (openers, heading designs, running heads, page designs, part pages) whose row has more CJK letters than word spaces takes the body's `lineBreak`, mark widths, `latinSpacing`, hanging and title rule (ragged; ruby/warichu/dots print plain). A note may be one sentence with `，；、`: no `\n` per clause to dodge full-width marks. `false` = pre-1.25 (wrapped at spaces, marks at the font's width) |
| `latinSpacing` | `{0.25, em}` | Han ↔ Latin letter/digit; replaces a typed space; `0` off |
| `latinSpacingEdge` | `'auto'` | ≥ 1.28; which side of a Western word takes `latinSpacing`. `'letters'` (Chinese regions): a side ending in a letter or a digit. `'western'` (Japan): any side of a word holding a letter or a digit, so `normalize()関数`, `(abc)関数`, `100%関数` get the quarter em with no typed space; solid after an opening bracket/prefix sign that ends the word and before a closing bracket/comma/stop/postfix sign that opens it; a lone `(` `!` `+` between kana takes none. Do not type spaces after inline code in Japanese text. A Japanese preset below configVersion 12 reads `'letters'` |
| `uprightDigits` | `2` | vertical text: numbers of ≤ N digits in one upright cell (0, 2, 3, 4), but not inside a Latin sentence (a Latin word on both sides, past spaces, numbers and marks), where they run sideways with it; `:tcy[…]` / `:sideways[…]` by hand |
| `grid` | off | `{enabled, charsPerLine, linesPerPage, show, fullLines}`: rewrites margins so columns are whole ems and the type area whole lines; configured margins are minimums; warning `cjkGridClamped`. Column balancing is off on a grid unless `headings.balancing.enabled` (≥ 1.25, §5.2). On a grid `bodyText.avoidWidows` defaults to `false`, and `bodyText.avoidOrphans` too in the `japan` region (≥ 1.28, §4): a page holds every line its grid counts. `fullLines: true` (≥ 1.28, default off) is manuscript paper: a paragraph that is not justified keeps every square of its full lines under `avoidRunts` and may end on one character; without it such a paragraph gives the character up and the line above stands one square short, as on any page |
| `emphasis` | `'dots'` in a Chinese or Japanese document | what `*…*` does to CJK characters (`'italic'` fakes a slant) |
| `emphasisMark` | `{style: 'auto', fill: 'auto', position: 'auto'}` | ≥ 1.16; the shape of `*…*` dots and of `:dots` without attributes: `style` `'dot'\|'circle'\|'sesame'`, `fill` `'filled'\|'open'`, `position` `'over'\|'under'` (over = right in vertical text). Auto: Chinese dot under (right in vertical); Japan sesame ﹅ over / right in both directions. Dots go outside a ruby reading on the same side |
| `bookTitleMark` | brackets / wavy / wavy / brackets | `:book[…]` prints its brackets, a wavy line under it, or `'none'` |
| `bookTitleBrackets` | `'auto'`: 《》〈〉 (Chinese) / 『』「」 (Japan) | ≥ 1.16; `[{open, close}, …]` outermost first, a deeper title takes the last pair |
| `annotationColor` | text colour | dots and name/title lines |
| `ruby` | `{fontSize: 0.5em, position: 'auto', overhang: 'auto', align: 'auto', smallKana: 'keep'}` | `fontFamily`, `fontSize`, `color`, `position`: zhuyin right of each character, pinyin over (right in vertical); `overhang` `'none'\|'kana'\|'any'` (auto: `kana` in Japan = ≤ 1 ruby character onto kana and mark blanks, ½ onto 「, never onto kanji; elsewhere ¼ ruby em onto any neighbour); `align` `'center'\|'jis'\|'start'` (auto: `jis` 1:2:1 in Japan, centred elsewhere); `smallKana: 'full'` paints ゃっ full size (≥ 1.16) |
| `warichu` | `{fontSize: 0.5em, minChars: 2}` | `fontSize`, `color`, `open`, `close` (brackets around each note; none in Chinese, （） in Japan, `''` = none), `minChars` (≥ 1.28: characters of a note a line break leaves on each side, marks not counted, so no line or page opens on `異。`; a note of ≤ 3 characters never divides; `1` = 1.27, and a preset below configVersion 12 with a `:warichu[` or `citations.notes: 'warichu'` reads `1`). From 1.28 a part whose last characters may not open the lower row folds at the nearest fold (`本名。` = `本` over `名。`, not one row) |
| `kunten` | `{fontSize: 0.5em, placement: 'inline'}` | ≥ 1.16, `:kunten[…]` kanbun marks: `fontSize`, `color` (else `annotationColor`), `placement` `'inline'` (JIS X 4051: 返り点 take half an em after the character) \| `'interlinear'` (in the line gap, no advance) |

Content warnings to expect: `cjkLooseLine` (a justified line needing more than ½ em between characters, set
short; its Latin counterpart is `raggedLine`, ≥ 1.28.0: a justified line set ragged because its word spaces
would pass 3×), `cjkMarksExceedLeading` / `rubyExceedsLeading` (line gap under ½ em with marks on one side, ⅝ with both;
give annotated text more leading), `kuntenExceedsLeading` (送り仮名 need half an em on the reading side),
`indexReadingMissing` (a Japanese index entry with kanji and no `yomi`), `arabicMarksExceedLeading` (vowel marks of vocalised Arabic touch the line above; raise `lineHeight`, 1.7–2.1 em), `fullwidthMarkup`, `attributeKeyInvalid`, `rotateIgnoredVertical`, `textWrap` (≥ 1.24: a resource or box with wrap kept its band: `tooNarrow`, `fewLines`, `verticalText`, or an inline one `moved` to the next column), `floatShrunk` (≥ 1.24: a picture scaled to its slot; `overflowPx` when even `minScale` runs past the text block), `columnsFlowUnknown` (≥ 1.25: a `:::columns` flow other than snake/parallel; the default applies), `columnsTooNarrow` (≥ 1.25: sub-columns under six ems of their text: fewer columns or a smaller `gap`), `afterText` (≥ 1.25: a `span: 'side'` box or side figure set on a page with no text, because its chapter ended while it waited for the channel: fence it earlier or shorten it) and `unplaced` (≥ 1.25: a box or float no page could take, e.g. a side box in a section with no side column; it is on no page); config
warning `cjkGridClamped`; PDF warnings `missingGlyph`, `variableFontDefaultInstance`, `cffEmbeddedWhole`.

```json
"locale": "zh-Hant-TW",
"layout": { "layoutType": "single", "writingMode": "vertical-rl" },
"page": { "pageNumbering": { "format": "trad-chinese-informal" } },
"bodyText": { "fontFamily": "Noto Serif TC", "fontSize": {"value": 10.5, "unit": "pt"}, "lineHeight": {"value": 18, "unit": "pt"},
  "textAlign": "justify", "firstLineIndent": {"value": 2, "unit": "em"} },
"headings": { "fontFamily": "Noto Serif TC", "levels": [ { "level": 1, "numberingTemplate": "第{1:一}回", "numberSeparator": "　",
  "breakBefore": {"enabled": true, "parity": "odd"} } ] },
"cjk": { "grid": { "enabled": true, "charsPerLine": 38 } }
```

Fore-edge running heads for a vertical book (the Sandbox's **Header › Fore-edge heads (vertical)**): two text
elements with `writingMode: 'vertical-rl'`, anchored `{to: 'outer', edge: 'top'}` (offset y 4 em, `{chapterTitle}`)
and `{to: 'outer', edge: 'bottom'}` (offset y −5 em, `{pageNumber}`), at 80 % of the body size.

## 19c2. Japanese books (postext ≥ 1.16)

Guide: https://postext.dev/en/docs/japanese-layout. Everything below follows from `locale: 'ja'` (`ja-JP`; the
`japan` region, JLReq / JIS X 4051); set only what differs from the source. Never `'jp'`, never a `zh-*` tag.

| What | Key / markup | Japanese default |
|---|---|---|
| line breaking (kinsoku) | `cjk.lineBreak` | `ja-very-strict`; `ja-strict` lets っ ー 々 open a line, `ja-loose` (newspapers) |
| mark widths | `cjk.punctuationWidth`, `compressAdjacent`, `trimLineStart` | full width with JLReq pair compression; brackets trimmed at a line start |
| hanging 、。 (ぶら下げ) | `cjk.hangingPunctuation` | `allow` (、，。． only, horizontal and vertical) |
| space after ？！ | `cjk.spaceAfterQuestion` | on (1 em inside a paragraph) |
| 「 opening a paragraph | `cjk.paragraphStartBracket` | `half` (JLReq ③: the bracket fills the 1-em indent) |
| phrases spaced by the author (分かち書き) | `cjk.wordBreak` | `normal`; `keep-all` breaks only at the spaces (picture books, primers) |
| caption label | `captionStyle.labelNumberGap` / `labelSeparator` | `''` / `'　'`: 図1-1　題 (≥ 1.16; set only to change it) |
| paragraph indent | `bodyText.firstLineIndent` | not set by the locale: write `{value: 1, unit: 'em'}` (Chinese books use 2) |
| `*…*` | `cjk.emphasis`, `cjk.emphasisMark` | sesame bōten ﹅ over (right in vertical text) |
| `:book[…]` | `cjk.bookTitleMark`, `bookTitleBrackets` | 『』, a title inside one 「」 |
| furigana | `cjk.ruby.overhang` / `align` / `smallKana` | `kana` (≤ 1 ruby character onto kana, never onto kanji) / `jis` (1:2:1) / `keep`; `{東京\|とう\|きょう}` is jukugo, `{東京\|とうきょう}` group |
| warichu | `cjk.warichu.open/close` | （） |
| Western words | `cjk.latinSpacingEdge` | `western` (≥ 1.28): the quarter em also next to a word's brackets and signs |
| vertical text | `cjk.uprightDigits` | 2 digits and `!!` `!?` `?!` `??` upright in one cell; small kana, ー, 〝〟 (for “”), ：； take vertical forms |
| headings | `headings.levels[].lineSpan` / `indent` / `jidori`, `headings.keepWithNextSpread` | not set: 3行取り = `lineSpan: 3`, 5字下げ = `indent: {value: 5, unit: 'em'}` (body ems), 序　章 = `jidori: 3` |
| numbering | `第{1:一}章`, list `numberFormat` | 一 → japanese-informal (百一, 六千一); 壱 あ ア い イ tokens; `numberToWords` 二十一 / 第二十一 |
| notes | `footnotes` | vertical: after the chapter, （1） right of the line; horizontal: column foot, per page, superscript; ⅓ rule (§19a) |
| index | `index.groupBy`, `:index{yomi}` | `gojuon` (あ行 か行 …), JIS X 4061 order by reading; `indexReadingMissing` without one |
| citations | `citations.locale`, `style` | ja-JP (と, ほか, 「」); `sist02` on request |
| strings | `resourceTypes`, table continuation, cross-references | 図 / 表 (図1-1), （続き）, 第{n}章 / {n}節 / {n}ページ, 参考文献 |
| PDF | — | JAN `locl` forms of a pan-CJK face; `{lang=…}` isolates shaped and tagged in their language |
| letters, dates, signatures | `:::paragraphs{align=end endIndent=1}`, paragraph style `endIndent` | 地付き = `align=end`; 地から1字上げ = `align=end endIndent=1` |
| centred page (扉, dedication) | `:::pagebreak{center}` | the next page's text centred head to foot (across the page in vertical text) |
| kanbun | `:kunten[字]{kaeri="レ" okuri="ヲ"}`, `cjk.kunten` | 返り点 small at the lower left, 送り仮名 at the right (vertical) |

Vertical multi-tier pages run on at a chapter end (nariyuki) by default: balancing is off in vertical
text (and on a character grid, ≥ 1.25) unless `headings.balancing.enabled: true`. On a character grid a Japanese page
runs both break rules off (`bodyText.avoidWidows`, `bodyText.avoidOrphans`, ≥ 1.28): do not write them `false` by hand. Fonts: Noto Serif JP (body), Noto Sans JP (headings, gothic emphasis), or Shippori
Mincho / B1 for a bunko look (it has no ō ū: rōmaji with macrons needs another face for that text).

```json
"locale": "ja",
"page": { "sizePreset": "custom", "width": {"value": 105, "unit": "mm"}, "height": {"value": 148, "unit": "mm"},
  "margins": { "top": {"value": 14, "unit": "mm"}, "bottom": {"value": 12, "unit": "mm"}, "left": {"value": 10, "unit": "mm"},
    "right": {"value": 9, "unit": "mm"}, "mirror": true } },
"layout": { "layoutType": "single", "writingMode": "vertical-rl" },
"bodyText": { "fontFamily": "Noto Serif JP", "fontSize": {"value": 9, "unit": "pt"}, "lineHeight": {"value": 15, "unit": "pt"},
  "textAlign": "justify", "firstLineIndent": {"value": 1, "unit": "em"}, "indentAfterHeading": true },
"headings": { "fontFamily": "Noto Serif JP", "levels": [
  { "level": 1, "fontSize": {"value": 14, "unit": "pt"}, "numberingTemplate": "第{1:一}章", "numberSeparator": "　",
    "breakBefore": {"enabled": true, "parity": "odd"}, "indent": {"value": 4, "unit": "em"} },
  { "level": 2, "fontSize": {"value": 11, "unit": "pt"}, "lineSpan": 3, "indent": {"value": 6, "unit": "em"},
    "breakBefore": {"enabled": false} } ] },
"cjk": { "grid": { "enabled": true, "charsPerLine": 38, "linesPerPage": 16 } }
```

The 新潮文庫 grid (38 字 × 16 行) on an A6 bunko: 38 × 9 pt = 120.6 mm down the page and 16 × 15 pt = 84.7 mm
across fit inside the margins, which act as minimums (a grid that does not fit is clamped: `cjkGridClamped`).

## 19d. Arabic and right-to-left books (postext ≥ 1.15)

Guide: https://postext.dev/en/docs/arabic-layout. Everything follows from `locale: 'ar'` (or `ar-EG`,
`ar-MA`…); set only what differs.

| What | Key / markup | Arabic default |
|---|---|---|
| direction, mirrored frame, right binding | `direction`, `page.binding` | `rtl`, right |
| digits of generated numbers | `numerals` | ٠–٩ (Maghreb tags 0–9) |
| hyphenation | `bodyText.hyphenation` | off (Arabic words never hyphenated, cut or tracked) |
| kashida | `bodyText.kashida`… | `auto`, Naskh rules |
| emphasis | `bodyText.emphasis` | bold (never slanted) |
| vowel marks out | `bodyText.tashkil` | `keep` |
| notes «(١)» per page | `footnotes.markerTemplate/numbering/noteNumberPosition` | not set: write `'({n})'`, `'page'`, `'inline'` |
| chapter words | `numberingTemplate: 'الفصل {1:ordinal}'`, `'الليلة {1:ordinal-feminine}'` | — |
| caption | `captionStyle.labelSeparator: ': '` (a `.` after ١-٢ reads as a decimal point) | `'. '` |
| lists | `numberFormat: 'arabic'` + `separator: '-'` (١-), `'abjad'` (أ-) | — |
| front matter folios | `:::numbering{format="abjad"}` … `:::numbering{format="decimal" startAt=1}` | — |
| index | `index.ignoreArticle` | `true` |
| table direction | `resource.table.direction: 'ltr'\|'rtl'` | the document's |
| text element direction | `direction: 'ltr'\|'rtl'\|'auto'`, `align: 'start'\|'end'` | the document's |

Sides: `textAlign`/caption `align`/cell `align` `left` = the side the text starts on; `placement.align`,
callout `stripe.side`, `icon.cornerSide`, `labelTab.position` = body-flow sides (flow-relative in RTL);
`start`/`end` accepted everywhere (for callout sides they follow the box's own `{dir}`); header/footer
slots and sheet-anchored design elements are physical. `placement.rotate` stays physical.
Leading: unvocalised 1.55–1.7 em, partly vocalised 1.7–1.85 em, fully vocalised verse 1.9–2.1 em
(`arabicMarksExceedLeading` says when it is too tight). Body size 13–15 pt (Naskh looks small).

```json
"locale": "ar-EG",
"bodyText": { "fontFamily": "Noto Naskh Arabic", "fontSize": {"value": 13, "unit": "pt"},
  "lineHeight": {"value": 1.7, "unit": "em"}, "textAlign": "justify" },
"headings": { "fontFamily": "Noto Kufi Arabic",
  "levels": [{ "level": 1, "numberingTemplate": "الفصل {1:ordinal}", "numberSeparator": ": " }] },
"captionStyle": { "labelSeparator": ": " },
"footnotes": { "markerTemplate": "({n})", "numbering": "page", "noteNumberPosition": "inline" }
```

## 19e. `comics` — comic pages and strips (postext ≥ 1.20)

Read only by documents with `:::page` or `:::strip` blocks; every key is
optional and the defaults follow the document language. The full table
(lettering faces per language, the nine built-in balloon styles, every
balloon style key, cast, reading direction) is in
[comics.md §10](comics.md#10-the-comics-config).

```jsonc
"comics": {
  "artDirection": "ltr",                       // 'rtl' for manga; readingDirection 'auto' follows it, except rtl in an RTL, vertical, ja or zh-Hant document
  "gutter": { "horizontal": {"value": 4, "unit": "mm"}, "vertical": {"value": 2, "unit": "mm"} },
  "panel": { "borderWidth": {"value": 1, "unit": "pt"}, "borderStyle": "solid" },
  "panelStyles": [ { "id": "rounded", "borderRadius": {"value": 5, "unit": "mm"} } ],
  "lettering": { "fontFamily": "Comic Neue", "fontSize": {"value": 9, "unit": "pt"}, "textTransform": "uppercase" },
  "balloonStyles": [ { "id": "shout", "burstPoints": 18 }, { "id": "writing", "shape": "none", "tail": "none", "fontScale": 0.8 } ],
  "cast": [ { "id": "monster", "name": "The Monster", "fill": {"hex": "#0f0f0f", "model": "hex"}, "color": {"hex": "#ffffff", "model": "hex"} } ]
}
```

`lettering.fontSize`, `lettering.inset`, `gutter.*`, `frame.margins.*` and
panel `borderWidth`/`borderRadius` in em throw (use mm/pt); balloon
`padding`, `tailWidth`, `strokeWidth`, `halo` and `letterSpacing` are in em
of the balloon text. Bundle the lettering and sound-effect faces.

## 19f. `lineNumbers` — LineNumbersConfig (postext ≥ 1.23)

Numbers beside every Nth line, as critical editions, poetry editions, legal
texts and line-referenced teaching texts print them. The numbers are painted
in the margin (or the gutter, or the side column) and never move a line: they
take no room from the text, so leave a margin at least `gap` + the widest
number wide. Never number lines in the text or with side boxes.

| key | default | notes |
|---|---|---|
| `enabled` | `false` | |
| `count` | `'verse'` | `'verse'` = the lines of `:::verse` poems, one number per line of verse (a turnover takes none, stanza gaps are not counted; a bayt counts once); `'all'` = every laid-out line of body paragraphs, list items, blockquotes and verse, in reading order (page by page, column by column, top to bottom) |
| `interval` | `5` | print the multiples of N (5, 10, 15…); `1` = every line |
| `numberFirst` | `false` | also print the first line after each restart |
| `restart` | `'poem'` for `count:'verse'`, `'page'` for `'all'` | `'document'` (runs on through the chapters of a book), `'chapter'` (each level-1 heading), `'section'` (each level-1 or level-2 heading), `'page'`, `'poem'` (each `:::verse`) |
| `startAt` | `1` | number of the first line after a restart |
| `position` | `'outer'` | `'outer'` = away from the spine (right on a recto, left on a verso; mirrored for a right-bound book), `'inner'`, physical `'left'`/`'right'`, `'start'`/`'end'` (follow the document direction: `start` is the right in an RTL book), `'side'` = in the side column of a `oneAndHalf` layout with `sideColumnRole:'floats'`, flush with its edge next to the text (`gap` unused; a page without a side column falls back to `'outer'`) |
| `multiColumn` | `'outer-edges'` | pages with 2+ columns side by side: `'outer-edges'` = first column's numbers on its left, last column's on its right, the ones between as `each`; `'gutter'` = in the gutters (first column on its right, the others on their left); `'each'` = every column on the `position` side |
| `gap` | `1em` | text edge → number; em = the number's own size |
| `align` | `'auto'` | `'auto'` = flush toward the text (right-aligned in a left margin, left-aligned in a right one); `'left'`/`'right'` within the width of the page's widest number |
| `fontFamily` / `fontWeight` | body | bundle the family like any other face |
| `fontSize` | `0.8em` | em = body size; each number sits on its line's baseline in its own size |
| `italic` | `false` | |
| `color` | body colour | a palette-linked colour follows part and section palettes |
| `format` | decimal in the document's digits (`numerals`) | any numbering spelling: `'lower-roman'`, `'upper-roman'`, `'arabic-indic'`, `'一'`… |

Never counted: headings, captions, tables and pictures, display maths,
design text (openers, running heads), footnotes and chapter-end notes, the
contents, the index and bibliography entries, blank pages, and callout text.
Prose under `count:'verse'` and the text of a callout are counted only when
their paragraph style says `lineNumbers: true` (§11); `lineNumbers: false`
keeps a style out under `'all'`.

Per block (document-format.md §12): `:::verse{numbered=false}` skips a poem,
`lineStart=N` numbers its first line N and restarts the count there in any
mode (a poem resumed after a commentary), `interval=N` is the poem's own
interval; `:::numbering{lines=N}` numbers the next counted line N.

- Books: with `restart:'document'` the count runs on through the chapters
  (`continuation.lineNumber`; for `count:'all'` the Sandbox takes it from the
  previous chapter's layout).
- Vertical documents (`layout.writingMode:'vertical-rl'`) get no numbers; the
  Sandbox warns `lineNumbersUnsupported`.
- With `position:'side'` a number that falls on a side box, side caption or
  float in the side column is painted anyway and the Sandbox warns
  `lineNumberOverlap` (it points at the numbered line).
- Outputs: canvas, PDF, HTML viewer and fixed EPUB paint them; tagged PDF
  sets them as artifacts (copied and read-aloud text runs line to line), the
  HTML hides them from copy and screen readers. Reflowable EPUB prints only
  the verse numbers, beside the stanza. VDT: `page.lineNumbers` (a design
  slot) and `page.lineNumberMarks` (`{number, label, columnIndex, blockId,
  lineIndex}`).
- Not supported: a `:ref` to a line, notes keyed to line numbers by the
  engine (type the line number in the note: `:chip[8]{style="line"}`),
  numbers inside table cells, captions or code.

```json
"lineNumbers": { "enabled": true, "interval": 5, "position": "outer",
  "fontSize": {"value": 0.75, "unit": "em"}, "italic": true }
```
A Bible or statute numbered by page, every line, in the gutter of a
two-column page: `{ "enabled": true, "count": "all", "restart": "page",
"multiColumn": "gutter" }`. A critical edition with the numbers in a narrow
fore-edge column: `"layout": {"layoutType": "oneAndHalf", "sideColumnPercent":
8, "sideColumnRole": "floats", "sideColumnSide": "outer"}` (with
`page.margins.mirror`) and `"lineNumbers": {"enabled": true, "position":
"side"}`.

## 19g. `pageTemplates[]` and `labelStyles[]` (postext ≥ 1.34)

Composed pages (a textbook page of boxes, a worksheet, a magazine spread): the template holds
the frames' places, sizes and styles; the words come from the chapter's `::::page{template}`
block (document-format.md §12.2). How to port with them, the component library and recipes:
[composed-pages.md](composed-pages.md). What each release applies (`composed_check.py round`
says it for the installed one):

```
1.34.0  read, resolved and checked only (nothing laid out)          → round 1 (playbooks J)
1.34.1  laid out: grid/placement/anchors, sizes, style, padding, layer, rotate, exclude:'push',
        flow, takes, next, decoration, header/footer, variants       → round 1
1.35.0  groups (stack/row, gap, align, grow/shrink/priority), pin, reflow log; spread, gutter,
        crossGutter; Markdown reading order in HTML, EPUB, tagged PDF → round 2
1.36.0  fit (the reflow ladder), frameOverflow proposals; wrap:'contour'; source map
1.37.0  overflow.continueIn 'next-page'|'template:<id>', overflow.mark, overflowTemplate;
        labelStyles and anchors drawn (::label); headings keep their design in frames and boxes;
        paragraphStyles[].letterSpacing; moveTextToMarkdown
1.38.0  fit.preferContinue (continue before shrinking), threaded stories continue in the chain head's
        frame; continueIn 'page:<id>', {page} in overflow.mark, overflow.fromMark; frame rules; stacks
        keep empty frames, rows of 'auto' cards negotiate width; design size {to, edge}, image fit
        'cover' + focus; drop caps in frames; spreads on vertical books; resourceTypes written in part
1.39.0  frame writingMode and direction applied; labelOverlap/labelOverflow, vertical labels; calloutStyles
        extends; start/end edges; :::columns and frame columns cut by the widow/orphan rules; a figure's
        alt/caption/note in the Markdown; cover on upright pictures
1.40.0  label style fontStyle/textTransform unset (a borrowed paragraph style's italics and capitals
        hold; 'normal' / 'none' turn them off); vertical labels on right-to-left pages; frame writingMode
        on right-to-left pages, pictures upright in a vertical frame; comic text panels on strips and spreads
1.41.0  a story jumps into a page fence of a later chapter file (continueIn 'page:<id>')
1.42.0  calloutStyles[].body.letterSpacing; decoration elements removed in a child template or variant
        ({ id, remove: true }); Frame.look, PageTemplate.palette and the page fence's palette applied;
        Frame width 'auto' = longest line + padding; label.icon.placement 'inside'; {headingNumber} in
        decoration text; Frame.takes 'toc'; overlap 'allow' on anchors and label styles, avoid zones as map
        symbols, figureWordsShared; CustomFontFamily.fallback; pictures upright in the frames of a vertical
        page's own flow
1.43.0  anchor gutter 'keep'|'cross' (labels off a spread's fold); label.icon.tint; toc.parts.breakBefore in a
        contents frame that can go on; headingClaimsColumn; avoid zones read from an SVG's symbols (Sandbox)
1.46.0  a heading never ends a column of a frame set in columns or of a :::columns group
1.48.0  decoration connectors (straight/elbow/tree, '#card[*]', anchor ends, over) and path elements; anchor.at
        and size edge 'center'; per-corner borderRadius, per-side borders, label.joined + fillet, foot tabs,
        label.icon kind 'glyph'; ResourceAnchor.labelAt + leader, LabelStyle leader/align/border/radius/kind
        'legend', :::label and :icon; group kind 'grid' + repeat; role 'module' + modules groups (:::module);
        Frame.overlap and the frameCovered / frameOutsideArea checks; configVersion 16
1.48.1  a module's connector may end on a frame of the page that stacks it
1.49.0  caps 'ring' | 'bar' and opacity on connectors and leader looks
not yet template bodyStyle; modules side by side; a module inside a module
```

Both keys are in the layout key; `configVersion` 15 marks a config that may hold templates, 16 (1.48)
one whose decoration may hold connectors (14 and older load unchanged; nothing is pinned). 17 (1.52, #1119): a
paragraph style's unset type fields (face, size, leading, weights, colour) inside a box or frame take the box's
body, so one align-only style serves serif and sans boxes; 16 and older read with
`bodyText.paragraphStylesInBoxes: 'document'` (the document's body). 18 (#1149): a mark style with no
`borderRadius` has square ends; 17 and older keep 0.2em. Stamp new ports 18.
composed-pages.md §6.12–6.18 says when to use each 1.48 feature. With an engine older than 1.35.0 port composed pages with the round-1
ladder (playbooks J) and write templates only when the brief asks to prepare for them.

```
PageTemplate
├─ id, name?, extends?          extends = another template's id (chain, root first)
├─ area?        'content'|'trim'|'bleed'
├─ grid?        { columns, rows, columnGap?, rowGap? }
├─ frames?      Frame[]
├─ groups?      Group[]          a group name must not equal a frame name
├─ decoration?  DesignSlot       placeholders only, like every design text (§7)
├─ header? / footer?  DesignSlot | false
├─ spread?, gutter?, overflowTemplate?, bodyStyle? (read, not applied)
├─ role?        page role reported to header/footer/decoration `pages` filters (§7.3), default 'composed' (≥ 1.37);
│               'module' (≥ 1.48): a module, stacked by a page's modules group from `:::module` blocks; frames,
│               groups, decoration only (area, header, footer, variants, spread, gutter, overflowTemplate ignored)
├─ palette?     string "id=#hex, id=#hex" (applied from 1.42), as `:::part{palette}` writes it, NOT an object
│               (an object is dropped in silence; `headingStyles[].palette` is the object form). The page
│               fence's `palette="id=#hex, …"` goes on top of it:
│               recolours the palette-linked fills, borders and tabs of the boxes, the decoration and the
│               page ground of that page, as a part's palette does the flow
└─ variants?    { recto?, verso? } partial templates applied per side (a spread takes none)

Frame
├─ name                         what `:::frame{slot="name"}` and `slot=` name
├─ placement? | grid?: { col, row, cols?, rows? }
├─ width?/height?  Dimension | { percent } | 'auto' | 'fill'   default 'fill' / 'auto'; unset → placement.size;
│                 width 'auto' (≥ 1.42) = the longest line + padding, up to maxWidth and the room the anchor
│                 leaves (before, it read as 'fill'); not applied to a frame in its own writing mode
├─ minWidth?/maxWidth?/minHeight?/maxHeight?
├─ style?       a calloutStyles id (tab, title, fill, border come from it)
├─ look?        (≥ 1.42) the style's colours for this frame only: { background (turns the fill on), border:{color},
│               stripe:{color}, icon:{color}, marker:{color, rule:{color}}, titleStyle:{color}, body:{color,
│               boldColor, italicColor, letterSpacing}, label:{color, background, rule:{color}} }; a child
│               template or variant merges it key by key; an unknown key is `unknownConfigKey`
├─ layer? (1; decoration is 0, negative paints under it), rotate? (degrees clockwise, box and content together),
│  verticalAlign? 'top'|'middle'|'bottom'|'justify' ('top'; justify spreads the room between blocks),
│  columns? (1), columnGap?, padding? (side by side over the style's)
├─ exclude?     'none'|'push'
├─ wrap?        'box'|'contour' (1.36; with exclude:'push': the shape of the pictures it holds)
├─ rules?       { every? ('line'|Dimension), color?, width? (0.5pt), inset? } (1.38) ruled lines across the content box
├─ flow?, next?                 the flow frame; `next` chains frames
├─ takes?       'h1'…'h6'|'toc'  a heading of that level with no slot goes here; 'toc' (≥ 1.42) takes the
│               `:::toc` of the page (or write `:::toc` inside the frame): part rows, leaders, links and `keep`
├─ pin?, grow?, shrink?, priority?
├─ fit?         { shrinkText (true), minScale (0.9), scaleImages (true), imageMinScale (0.8), preferContinue (true, 1.38) }
├─ overflow?    { continueIn?: '#frame'|'next-page'|'template:<id>'|'page:<id>' (1.38; <id> may be {attr.x}),
│                 mark?: string|false ({page} = the page it goes on on, 1.38), fromMark?: string (1.38) }
├─ overlap?    'check'|'allow' (≥ 1.48, 'check'): 'allow' leaves the frame out of frameCovered (either side of a
│               pair) and frameOutsideArea: art meant to lie over text, a pill over its photo, a badge off its card
└─ optional? (no slotEmpty when nothing fills it), crossGutter? (spread: may cross the spine band), remove? (patch: drop it)
   pin? never moves or resizes; grow?/shrink?/priority? default 0 (lower priority gives way first)
   writingMode?  'horizontal-tb'|'vertical-rl' (applied from 1.39; before, read only): the frame's content is laid
                 in its box turned a quarter turn (right-to-left pages too from 1.40; a picture in it stands
                 upright, in a frame of a vertical page's own flow too from 1.42); an 'auto' height is the least that
                 holds the lines in the width, so give long vertical text a fixed height
   direction?    'ltr'|'rtl' (applied from 1.39): the frame's story, blocks with their own {dir} keep theirs

Decoration text (≥ 1.42): `{headingNumber}` = the counter of the first numbered heading the page's frames hold
(the document's digits; empty when none), `{headingNumber.<frame>}` the one a named frame holds; allowed in
composed pages' decoration only. A text over a frame answers a click where the frame has no text of its own.

Group  { name, kind?: 'stack'|'row'|'grid' ('stack'), frames?: string[], gap?, placement?, grid?,
         align?: 'start'|'center'|'end'|'space-between', remove?,
         columns?, columnGap?, rowGap?, rowAlign?: 'start'|'center'|'end'|'stretch',   (grid, ≥ 1.48)
         repeat?: { frames: string[] (main first), max? },   (grid: the set laid per item; instances frame[n])
         modules?: true, overflow?: { continueIn: 'next-page'|'template:<id>' } }   (≥ 1.48: takes the page's
         :::module blocks, a stack; goes on by whole modules)

Decoration elements (≥ 1.48, besides text, image, rule, box):
  { kind: 'connector', id, from: End, to: End | End[], routing?: 'straight'|'elbow'|'tree' ('elbow'), trunk? (0.5;
    0 = a tree with no bar), radius?, color? (main colour), width? (0.75pt), dash?, opacity? (1, ≥ 1.49),
    startCap?/endCap?: 'none'|'dot'|'arrow'|'ring'|'bar' ('none'; ring, bar ≥ 1.49), capSize? (3 × width),
    over? (default: true when an end has an anchor), pin?, parity?, pages? }   page templates and modules only
  End = { to: '#frame'|'#group'|'#frame[2]'|'#frame[*]' (to only)|'#element', side?, at?: 'start'|'center'|'end'|0..1,
          gap?, anchor?: a picture anchor of the frame }
  { kind: 'path', id, placement, d: SVG path data, viewBox?: [w, h] ([1, 1]), fill?, stroke?, width? (0.5pt), dash?,
    preserveAspectRatio?: 'none'|'meet' }   every design slot
  placement.anchor.at (a point along a side of '#x') and size { to, edge: 'center' } in every design slot
  box style: borderRadius: Dimension | { topLeft?, topRight?, bottomRight?, bottomLeft? }, borderSides: { top?, right?,
    bottom?, left?: { enabled?, color?, width? } }

Callout styles as frame dress (≥ 1.48): borderRadius per corner as above, border.sides per side, label.joined +
  label.fillet (one outline with the box; offset 0), label.position 'bottom-left'|'bottom-right'|'bottom-start'|
  'bottom-end', label.icon { kind: 'glyph', glyph, fontFamily?, fontWeight?, scale? (1), color?, placement?, gap? }
  label.borderRadius (#1102): CornerRadius of the tab itself. Plain tab: square unless set. Joined tab: its two
  outer corners (topLeft/topRight at the head, bottomLeft/bottomRight at the foot), default the box corner; fillets keep fillet.
  label.ownBackground: true (#1102): a joined tab painted in label.background over the box fill (white tab on a tinted card).
  Icons (#1120, 1.52): icon/marker/label.icon kind 'shape' + shape 'ring'|'dot' (+ strokeWidth, default size/8) is drawn
  by the engine in color, no font or picture; icon.tint / marker.tint / label.icon.tint: true (the icon's / words' colour)
  or a ColorValue (palette-linkable), so ONE ring SVG serves every tint. A box icon needs no label: icon.position
  'inline' | 'corner' on a label-less box is the tab-less ring card.

ResourceAnchor (≥ 1.48): labelAt?: { x, y } (fractions: the label away from its point), leader?: boolean | LeaderStyle
LeaderStyle  { color? (the label's), opacity? (≥ 1.49), width? (0.75pt), dash?, startCap? ('none'), endCap? ('dot'),
               capSize?, routing?: 'straight'|'elbow' }

LabelStyle  { id, name? (Sandbox only), paragraphStyle? (borrows its type; the fields below override it),
              fontFamily?/fontSize?/fontWeight?/color? (default: the body text's), fontStyle? 'normal'|'italic',
              textTransform? 'none'|'uppercase', letterSpacing? number (em, default 0; NOT a Dimension),
              halo?: { color, width: Dimension }, background? (a plate), padding?: Dimension,
              minScale? (0.85: how far a label wider than its anchor `width` shrinks),
              writingMode? 'horizontal-tb'|'vertical-rl' (≥ 1.39), overlap? 'check'|'allow' (≥ 1.42),
              align? 'start'|'center'|'end', border?: { color, width }, radius?, kind? 'legend' (a key: the
              symbol opening each row hangs in a column), leader?: LeaderStyle (≥ 1.48) }
              lines of a several-line label stand 1.15 × its size apart (or at the borrowed style's leading);
              the halo shrinks with the label
```

- **Label styles and a borrowed paragraph style** (≥ 1.40): `fontStyle` and `textTransform` stay unset
  unless written, so the `paragraphStyle`'s italics and capitals hold; write `fontStyle: 'normal'` /
  `textTransform: 'none'` to turn them off. Without a `paragraphStyle` the plain look is the default
  and those two values are dropped on save. Before 1.40 the default filled them in and a borrowed
  italic or capital could not be switched off.

- **Merge** (`extends`): root first; scalars replace, `grid` per key, frames and groups by `name`
  (the fields written override; `fit`, `overflow`, `padding` per key; `placement` whole;
  `remove: true` drops; new names are appended), decoration elements by `id`; then
  `variants[side]` of every template of the chain, root first. A default restated in a child
  counts.
- **Porting rule**: one template per recurring page layout, the variants derived with `extends`
  and small patches, never whole copies. No text in templates: per-page words come from the
  `::::page` attributes (`{attr.x}`) and from `:::frame{slot label title}` in the Markdown; a
  sentence in a template's decoration or running heads is `contentInConfig` (`preset_kit.py
  lint` counts it; the engine from #874).
- **Frame styles are callout styles** holding the dress only (fill, border, radius, padding, tab
  `label`, title, `body`); `placement`, `fixed`, `span`, `columns`, `width` and margins are ignored
  on a frame, so one style serves every box of its kind; position and measure go in the frame. A
  style may be based on another with `extends` (§12).
- **One style per box shape, the tint on the frame** (≥ 1.42): `look` on the frame, `palette` on the template
  or the page fence, or a palette-linked fill (`paletteId`) tinted by the page's `palette="tint=#f6c3d0"`
  (composed-pages.md §4). No callout style per tint.
- **Frames held at the foot of a card** (≥ 1.42): one `stack` group with a box of the card's height,
  `grow: 1` + `shrink: 1` on the frames above and `minHeight` on the held ones (composed-pages.md §5); never an
  anchor to the container's foot.
- **Sizes that follow the text**: `height` `'auto'` (default) with the drawn height as `minHeight`
  and the room the page leaves as `maxHeight`; boxes one under another in a `stack` group (the
  first frame's placement starts it), side by side in a `row`; pictures beside a box are frames
  of their own anchored to a corner of it (`#box`, `top-right`), outside its group.
- **fit** (1.36): `{ shrinkText: true, minScale: 0.9, scaleImages: true, imageMinScale: 0.8 }`,
  2.5 % steps, the largest scale that fits; keep body text at 0.9 or above. The ladder runs free
  space, push, scaleImages, redistribute, shrinkText, continue; from 1.38 a frame whose `continueIn`
  leaves the page runs free space, push, redistribute, continue, scaleImages, shrinkText
  (`preferContinue`, default true; `false` = the order above), so a body frame needs no
  `shrinkText: false` to keep one size.
- **overflow** (1.37): `continueIn: 'next-page'` (the template's `overflowTemplate`, else the same
  template with only that frame filled), `'template:<id>'`, `'#frame'` (= `next`); `mark`: string,
  `false`, unset = the style's `continuesMarker` in the document's language; up to 16 added pages.
  The rest lands in the frame of the same name, else the flow frame; a story threaded through
  `next` goes on where its chain starts (1.38). `'page:<id>'` (1.38) jumps to the later page fence
  `::::page{id="<id>"}` of the chapter (`'page:<id>#<frame>'` names the frame; `<id>` may be
  `{attr.sigue}`): `continueTargetMissing` when no later fence has it. `{page}` in `mark` and
  `fromMark` is the printed number of the other page (`"Continued on page {page}"`).
- **rules** (1.38): `{ every: 'line'|length, color, width, inset }` on a frame draws the lines of an
  answer space (empty fixed-height frame, or `:::space{lines=N}` in an `auto` one).
- **Design elements on a template's decoration** (1.38): `placement.size.height|width` may be
  `{ to: 'container'|'page'|'bleed'|'outer'|'#id', edge: 'top'|'bottom'|'left'|'right' }` (7.2);
  an `image` takes `fit: 'contain'|'cover'` (both sides set) and `focus: {x, y}` (7.3).
- **Frames are running text**: their paragraphs take drop caps (1.38) as the flow's do; a heading in
  a frame draws its level's or style's design (1.37), and opens no styled section. From 1.39 a
  `takes` frame's heading gives the text frame's first paragraph its level's drop cap, a drop-cap
  paragraph is not cut above the initial's last line across `next` chains or continuations
  (`dropCap` reason `split` = a frame too short for the initial), and a `columns` frame (like a
  `:::columns` group set whole) is cut with `widowMinLines`/`orphanMinLines` lines each side.
- **Resource anchors** gain `width` (a fraction of the picture width), `align` ('center'),
  `verticalAlign` ('middle'), `rotate`, `style` (a `labelStyles` id) and, from 1.39, `writingMode`
  ('vertical-rl': `width` is then a fraction of the picture's height, `align` runs down the column with
  `start` = top, `verticalAlign` across the columns with `top` = the first, right-hand one); comics ignore
  them. Anchors live on the resource, so every locale shares them. From 1.39 `postext check` reports
  `labelOverlap` (a label runs into an earlier one by more than 12 % of the smaller line height) and
  `labelOverflow` (wider than `width` at `minScale`) per edition. From 1.42 an anchor (or a label style)
  may say `overlap: 'allow'` (default `'check'`): that label, and every pair it is in, is left out of the check
  (names the source prints touching); a label placed by `at="x% y%"` takes its style's value. A picture's
  `avoid` zones (rectangles in fractions of the picture) count as the map's symbols: a label that runs onto one
  raises `labelOverlap` with `withSymbol` (1-based) and `with: "symbol N"`. For an SVG map the dots and icons can be read from the drawing (1.43):
  Sandbox Avoid zones mode › Symbols of the drawing takes an id prefix or a class and adds a zone over each
  element (one per group named as a symbol); over WebMCP `sandbox_save_resource` with
  `marks: { svgSymbols: { idPrefix, className } }`. Reading again adds only what is new. From 1.43 an anchor's `gutter?: 'keep' | 'cross'` (default
  `'keep'`, not written) says whether a label of a figure across the spine of a spread slides off the gutter band
  (`'keep'`) or may run across both pages (`'cross'`, a title over the map). Editable under Design › Figures &
  tables › Label styles in the Sandbox; renaming a label style there (1.43) rewrites the `style` of the anchors and
  of the `::label` lines that name it.
- **Figure words** (1.39): `:::figure{resource alt caption note}`, or `::alt[…]`, `::caption[…]`,
  `::note[…]` lines beside the `::label` lines, give the edition's alt text, caption and note for the
  picture (document-format.md §12.2); the stored resource is untouched. A resource has one set of words per
  chapter, the first `:::figure`'s: a later figure of it with other words (or words the first left unsaid) is not
  shown them and raises `figureWordsShared` (≥ 1.42); declare a second resource on the same `fileId` for it.
- Scripts: `resolvePageTemplate(config, id, { parity: 'recto'|'verso' })` returns the merged
  template with defaults (`configPath`, per-field `fieldPaths`); `validatePageTemplates(config,
  { resources })` returns the warnings (verification.md, "Composed pages").

## 19h. `checks` — the `contentInConfig` check (postext 1.34)

```
checks.contentInConfig
├─ enabled   true
├─ allow     []     phrases a design text may hold (a journal's name, an imprint or licence line)
├─ maxWords  2      words left after the allowed phrases are taken out
└─ maxChars  24     letters and digits left; a Han/kana/Hangul/Thai character counts 3
```

Out of the layout key (changing it lays nothing out again). A design text (every `text` element
of `header`, `footer`, `headings.levels[i].advancedDesign.slot`, a heading style's
`advancedDesign.slot`/`header`/`footer`, a page template's `decoration`/`header`/`footer` and its
variants' (the engine from #874, `preset_kit.py lint` always), `parts.design`/`versoDesign`,
`toc.parts.design`, each box style's `calloutStyles[i].design.slot` (postext ≥ 1.45), and the same under `htmlViewer.overrides`) is content when its literal (the `content` with every
`{placeholder}` removed, `{{`/`}}` read as braces, white space collapsed) still has more than
`maxWords` words or weighs more than `maxChars` once the allowed phrases are out. Allowed: `allow`
plus the document metadata `title`, `subtitle`, `author`, `publisher` (the first chapter's front
matter); never the manifest `name`. Comparison: NFKC, any case, whole words between spaces with
outer punctuation dropped (`·` is no word, `postext.dev` is one), anywhere inside unspaced
script; a text with no letter or digit (a dot leader, an ornament) is never content. One warning
per owner (`headingStyles[3]` with `ownerId`, `headings.levels[0]`, `header`…). A misspelt key
under `checks` gives `unknownConfigKey`; a negative or fractional limit `unknownConfigValue` (the
default is used). Never raise the limits to quiet a port: move the text into the Markdown.
`preset_kit.py lint` applies the same rule on any installed version.
A box design prints the box's words through `{boxText}` / `{boxText.<n>}` and `{titleText}`; literal
text typed into its elements is content like any other design text.

## 20. Fonts — `customFonts` and what goes in preset.json

`CustomFontFamily = { name, variants: [{ weight 100–900, style 'normal'|'italic', fileId, format 'woff2'|'woff'|'ttf'|'otf', fileName? }], redistributable?: boolean (default true), fallback?: string (≥ 1.42) }`.
- `fallback` is the open family every host sets this family's faces in where it has no file of them (a
  licensed family the pack left out): the configuration keeps naming the licensed family, the fallback's
  cuts of the same weight and slant load under its name. A family with files keeps them and takes only a slant
  it lacks from the fallback. Not a general substitution table: Google and system families stay `missingFont`.
  Manifest: `fonts[].fallback` (project-format.md §4). From 1.43 the fallback's faces are
  embedded in EPUB and HTML exports and in SVG pictures set in the family, under its name.
- Any `fontFamily` string resolves against customFonts first, then Google Fonts, then Fontsource
  for a family Google Fonts does not have (Commit Mono, FiraGO). The Sandbox and the `postext`
  command line fetch them; `render.mjs` does not, and measures an unbundled family with a stand-in face.
  Both fetch static files, one per weight and style (the Sandbox Fontsource's
  `@fontsource/<family>@5` on jsDelivr, the files a Cookbook pen loads and a PDF embeds; the
  command line Google's static instances), so a weight between two cuts of a variable family
  (450) has no file of its own: name a weight the family has.
- Needed variants: at least 400/700 normal+italic (else "missing variant" warning); if the book
  uses semibold for bold, provide 600 and set `bodyText.boldFontWeight: 600`. The `postext` command
  line (≥ 1.28.0) fetches the bold weight the configuration names, and `postext check` reports a
  `fontFallback` when a weight the family ships is missing and another face stood in (lines then
  break otherwise than in the Sandbox): add the file, or run once online so it is cached.
- `.woff` is rejected by the PDF backend and skipped by the preset loader — use woff2/ttf/otf.
- Chinese faces: one static file per weight (a variable font embeds its default instance), TrueType
  outlines (CFF files are embedded whole), subset to the book's characters with layout features and
  vertical metrics kept (playbooks E6). No italic variants: a Chinese face has none; the missing-variant
  note for them is harmless. A face must cover every character: there is no fallback to another family.

**preset.json** — `version: 2` manifest (full reference: project-format.md):
```
{ version: 2, configVersion: 15, id, name, description?, locale?, locales?, thumbnail?, license?, credits?, tags?,
  default?, view?: { canvasScope?: 'book'|'chapter' },
  start?: { pageIndexOffset?, pageNumbering?: { startAt?, format? }, headings?: { h1..h6 }, part?: { number, title, palette? },
            resourceCounters?, resourceNumbers?, statementCounters?, footnoteNumber?, lineNumber?, afterPartPage? },
                                                  // where the book starts when the bundle holds part of a longer one: the
                                                  // first chapter's `continuation` (after 1.26.3; project-format.md §2)
  chapters: [{title, file}] | { "<locale>": [{title, file}] },
  config: PostextConfig,                          // WITHOUT customFonts
  resources: [ Resource minus createdAt/updatedAt/bitmap/svg, plus file?, pdfFile?, inlineFonts?, width?, height?, resolution?, fileResolution?, note? ],
  fonts: [ { name, variants: [{ weight, style, file: "fonts/X.woff2" }], redistributable?, fallback? (≥ 1.42) } ],
  localized?: { "<locale>": { config?: ConfigOverride (configVersion ≥ 21: merged over `config` field by field, keyed
                                lists by id / level, $remove drops an entry, null = default; ≤ 20: top-level keys REPLACED wholesale),
                              resources?: [{ id, caption?, note?, altText?, table?, file?, pdfFile?, width?, height?, poster?, video?, resolution?, fileResolution? }],
                              view?: { canvasScope?: 'book'|'chapter' },        // the edition's view over `view` (≥ 1.9.2)
                              start?: { … } } } }                               // the edition's own start, in place of `start`
```
`configVersion: 21` says `config` and the `localized` overrides are written for today's rules (`preset_kit.write_manifest` sets it).
Rule 15 marks a config that may hold `pageTemplates` / `labelStyles` and pins nothing, so a manifest stamped 14
(postext 1.30 to 1.33) loads unchanged. Without a number the bundle reads as postext 1.4 wrote it: H1 breaks pinned, maths × 1.1312 when a chapter has `$`,
`layout.inlineResourceGap: 'above'` when a chapter embeds a `::resource`, `layout.inlineResourceGapInBoxes: false`
when one is embedded inside a `:::callout`, `headings.inlineMarks: false` when a heading carries `*`, `_`, `^`,
`~` or a link, `bodyText.colonListRoom: 'line'` when a chapter has a list after a line ending in ':',
`layout.boxChildSplitMinLines: 1` when a chapter opens a `:::callout`, `bodyText.breakAfterDashes: false` when
a chapter sets an em or en dash closed between words, `bodyText.optimalRagged: false` when the config sets some
running text ragged, `bodyText.breakAfterHyphens: false` when a chapter sets a hyphen between two letters,
`headings.keepWithNextSplit: 'fill'` when a chapter has a heading, `bodyText.paragraphContainerSpacing: 'add'`
when the config declares a paragraph style and a chapter opens a `:::paragraphs` container, and every design
drop cap's 1.4 size written out. A manifest stamped 5 gets the pins of rules 6, 7 and 8 only; one stamped 6,
those of rules 7 and 8; one stamped 7, those of rules 8; one stamped 8 (postext 1.5 to 1.22), those of rules 9:
`bodyText.verse.layout: 'bayt'` when a chapter sets a `:::verse` poem with no `||`, the `firstLineIndent` of a
paragraph style that also hangs dropped, `bodyText.hardLineBreaks: false` when a chapter ends a line with a
backslash or sets `\\` before a space, and `codeStyle.blocks: false` when a chapter opens a ```` ``` ```` or `~~~`
fence (its lines then read as Markdown); one stamped 9 (postext 1.23), those of rules 10:
`bodyText.verse.tighten: false` when a chapter sets a poem line by line, and `overflow: 'ellipsis-end'` written
on every text element of a heading design or a part page (`parts.design`, `parts.versoDesign`) that sets none
(in `htmlViewer.overrides` too); one stamped 10 (postext 1.24), that of rules 11:
`headings.balancing.enabled: true` on a horizontal `cjk.grid` config that does not set it, `tableStyle.splitInline: false`
when a chapter embeds a resource, `layout.flowColumns: false` when a chapter opens a `:::columns` fence (#634) and
`layout.floatsUnderOpener: false` when the config sets a `span: 'page'` heading (#639); one stamped 11 (postext 1.25 to 1.27),
those of rules 12: `bodyText.avoidWidows: true` on a `cjk.grid` config that does not set it, and `bodyText.avoidOrphans: true`
too in the `japan` region (#717), and `cjk.warichu.minChars: 1` when a chapter sets a `:warichu[` note or the config sets
`citations.notes: 'warichu'` (#720), and `cjk.latinSpacingEdge: 'letters'` on a config of the `japan` region whose chapters hold
kana or kanji (#721), and `layout.inlineCaptionSide: false` on a `oneAndHalf` config whose chapters embed a `::resource` (#729), and `crossRefs.breakLabels: false` when a chapter holds a `:ref{`, `\ref{`, `\eqref{` or `@id`
reference (#702), and `bodyText.scriptContext: false` on every such config, whatever its chapters hold (#725: words with
no letter shaped alone); one stamped 12 (postext 1.28), those of rules 13: `bodyText.shapingLanguage: 'host'` on every such
config, whatever its chapters hold (#764: text measured in the host page's language, in none in a worker), and
`unorderedLists.taskBox: 'character'` when a chapter holds a task item (`- [ ]`, `- [x]`) (#765: its box stays the character
☐ / ☑ in the list face, the item's text after that character's width); one stamped 13 (postext 1.29), that of rules 14:
`bodyText.shapingLanguage: 'host'` on every such config that names no value (#770: from 1.30 the default is 'document', the
document's own language; 1.29.1 and 1.29.2 laid such a preset out with 'host', 1.29.0 with 'document' and a canvas and a PDF
that did not follow the measure; a config that names a value keeps it). The pins keep what those rules changed, not
every 1.4 page: 1.5's layout fixes (page-span opener measure, drop caps in heading designs, tracking in boxes,
the loose-paragraph limit…) apply to an old bundle too.
Must NOT go in `config`: `customFonts` (built from `fonts[]`; fileIds are storage-local —
anything in config.customFonts is concatenated and would point at nothing), resource payloads,
metadata (front matter of chapter 1), `view` (top-level of the manifest, not config).
`debug` is harmless but pointless. `localized.<lang>.config.X` replaces the whole `X`
(e.g. restate the complete `resourceTypes` or `colorPalette` array per locale).

### 20a. Figure styles — `figureStyle` (released after 1.60, #1237)

`FigureStyle = 'default' | 'oldstyle' | 'lining' | 'tabular' | 'proportional' | 'oldstyle-tabular' |
'oldstyle-proportional' | 'lining-tabular' | 'lining-proportional'` → OpenType `onum` (old-style), `lnum`
(lining), `tnum` (tabular, one width), `pnum` (proportional); a pair sets a form and a width; `'default'` = the
font's own figures. On `bodyText`, `paragraphStyles[]`, `headings`, `headings.levels[]`, `headingStyles[]`,
`tableStyle` / `tableStyles[]` (header and body cells), `captionStyle` (label + description, also
`resourceTypes[].captionStyle`) and design text elements (header/footer, heading and part designs, toc rows).
Sandbox: the **Figures** field next to each style's typeface in the Design panel.
- Inheritance: a style that takes its family from another takes its figures too (paragraph styles, tables,
  captions, lists and box bodies take the body's). A style that names its own `fontFamily` sets that font's
  default figures unless it sets `figureStyle`. A level without one takes `headings.figureStyle`; a heading
  style's applies over the family of the level it is used on. `'default'` undoes inherited figures. A design
  text element has its own family ('EB Garamond' by default): the body's figures never reach it.
- A font without the feature keeps its own figures; a generic family (`serif`)
  takes none. A family the host has no file of (a face installed only on the reader's system, which the Sandbox
  does not fetch) takes no figure style: its text keeps that font's own figures, in the font itself. Ship the
  face in `fonts[]` under that name and it gets them. A host that sets text in faces it has no files of tells the
  engine which families can take features with `setFigureStyleFamilies((family) => boolean)` (from `postext`;
  the Sandbox registers it in the page and its layout worker). An unknown value is a `unknownConfigValue`
  warning, read as unset.
- Catalogue cuts often lack the features: the files Google Fonts and Fontsource serve often leave `onum` and `lnum`
  out (Source Serif 4's latin file keeps `pnum` and `tnum` only), and a style that asks for them then keeps the
  font's own figures. The foundry's full files have them: ship those in `fonts[]`.
- Measured with the features: canvas, HTML, PDF and both EPUB layouts break lines alike. Font strings and some
  warnings name a feature family `Base@onum`, `Base@lnum+tnum` (the base family's files with the features).
  The CLI (Skia sets no features) registers a copy whose cmap maps the digits to the feature's glyphs (single
  substitutions only: a font that reaches its figures through contextual lookups keeps its own there).
- Porting: measure the source's figures. Old-style figures in the text and lining tabular ones in the tables
  (the usual book setting) → `bodyText.figureStyle: 'oldstyle'`, `tableStyle.figureStyle: 'lining-tabular'`;
  lining headings over old-style text → `headings.figureStyle: 'lining'`; old-style folios → `figureStyle:
  'oldstyle'` on the folio text element. A timetable or price list set as paragraphs → a paragraph style with
  `'lining-tabular'`. Check that the files you will ship have the features, and prefer the foundry's files
  to catalogue cuts (fetch them, put them in `fonts/`, list them in `fonts[]`):
  `python3 -c "from fontTools.ttLib import TTFont as T; import sys; f=T(sys.argv[1]); print(sorted({r.FeatureTag for r in f['GSUB'].table.FeatureList.FeatureRecord}))" fonts/X.woff2`
  (`onum`, `lnum`, `tnum`, `pnum` as the config asks). A file without them sets its default figures whatever the
  config says; when those are already old-style (some book faces), `'oldstyle'` changes nothing and the tables
  need `'lining-tabular'` to get lining figures. Nothing reports a missing feature, so check the files.

---------------------------------------------------------------------------------

## 21. Output / viewer / debug

`pdfGeneration`: `{ outlines = true, forceColorSpace = false, colorSpace = 'cmyk'|'rgb'|'grayscale' ('cmyk'), accessible = true (tagged PDF/UA-1, lang = config.locale) }`.
`renderToPdf` takes each setting from its own options, else from the first document's `pdfGeneration`
(`colorSpace` only while `forceColorSpace` is on), else the defaults (bookmarks, tagged, RGB).
`renderToPdf(docs, { date })` (postext-pdf ≥ 1.28.0; a `Date`, milliseconds or a date string) fixes
the file's creation and modification dates (and a PDF/X file's XMP dates and document id): the same
document and `date` give the same bytes, so a regenerated PDF with an unchanged layout does not show
as a change. Left out, the file is stamped with the time of the call.

`print` (postext ≥ 1.22; layout ignores it, postext-pdf / the preflight / the print preview read it):

```jsonc
"print": {
  "standard": "none",              // none | pdfx1a (PDF/X-1a:2003, CMYK only, no transparency) | pdfx4 (PDF/X-4)
  "outputProfile": "fogra39",      // fogra39 | fogra51 (PSO Coated v3) | fogra52 (PSO Uncoated v3) | fogra47 | fogra29 | fogra30
                                   // | fogra27 | fogra28 | fogra45 | fogra40 | gracol2006 | swop3 | swop5 | ifra26 | snap2007 | custom
  "customProfile": { "name": "PSO Coated v3", "fileId": "profiles/pso-coated-v3.icc", "registryName": "FOGRA51" },
                                   // with "custom": the printer's .icc, a file of the bundle (path)
  "renderingIntent": "relative",   // relative | perceptual
  "blackPointCompensation": true,
  "convertImages": true,           // RGB pictures → CMYK (pdfx1a always)
  "inkLimit": 300,                 // % TAC; default = the profile's (ifra26 230, fogra30/40 340, snap2007 320)
  "black": { "kOnlyNeutrals": true, "overprint": true, "richBlack": true,
             "richBlackColor": { "c": 60, "m": 40, "y": 40, "k": 100 }, "richBlackMinSize": { "value": 6, "unit": "mm" } },
  "preflight": { "enabled": true, "minImageResolution": 300, "criticalImageResolution": 150,
                 "minRuleWidth": { "value": 0.25, "unit": "pt" }, "smallTextSize": { "value": 9, "unit": "pt" },
                 "safeZone": { "value": 5, "unit": "mm" }, "bleedSnap": { "value": 3, "unit": "mm" }, "checkFonts": true }
}
```
- A source printed as PDF/X keeps its standard and condition: `inventory.py` reads the output
  intent and the bleed and prints a `suggested_config` (`print` + `page.cutLines`). Map the
  condition to the catalogue id; a condition the catalogue lacks needs the printer's `.icc` as
  `customProfile` (ECI's own profiles may be embedded but not redistributed, so postext ships CC0
  equivalents).
- A PDF/X file carries no link annotations (bookmarks stay) and every page gets a TrimBox/BleedBox.
- `pdfGeneration.colorSpace: 'cmyk'` separates through the same profile without the PDF/X marks.
- `postext check my-book --preflight` prints `preflight.<kind>` with chapter file:line and page (critical = error,
  exit 3); `render.mjs` prints `PREFLIGHT <severity> <kind> page N` for a book set up for print (or with
  `--preflight`). Kinds: `lowImageResolution` (under `minImageResolution` ppi at the printed size, crop included;
  critical under `criticalImageResolution`), `declaredPixelsMismatch` (≥ 1.24: declared width/height ≠ the file's),
  `rgbImage`, `thinRule` (< `minRuleWidth`), `smallProcessText` (< `smallTextSize` in more than one ink; K-only black
  never counts), `inkLimit` (TAC over the limit), `safeZone` (text within `safeZone` of the trim; figure labels
  count), `nearTrim` (a box or picture ending within `bleedSnap` of the trim without bleeding). Fix the critical ones.
  `customProfile` may also carry `inkLimit` (percent) for the condition.

`contrast` (postext ≥ 1.28; layout ignores it, out of the layout key) is the check that the text reads on its ground:

```jsonc
"contrast": {
  "enabled": true,
  "level": "AA",                 // AA (4.5:1 text, 3:1 large) | AAA (7:1, 4.5:1); large = ≥ 18 pt, or ≥ 14 pt at weight ≥ 700
  "mode": "auto",                // auto | screen | print | both; auto = screen, plus print for a book set up for print
                                 // (print.standard ≠ none, a CMYK pdfGeneration, or page.cutLines)
  "reversedText": {              // print only: light text knocked out of an inked ground fills in on press
    "enabled": true,
    "minSize": { "value": 8, "unit": "pt" },       // reversed text under this is reported
    "minFineSize": { "value": 12, "unit": "pt" },  // the same for italics and light weights
    "lightWeight": 300                             // a weight at or under this counts as light
  },
  "allow": [                     // (>= 1.52, #1124) the source's own pairs, accepted with a reason
    { "fg": "#b7820f", "bg": "#ffffff", "reason": "publisher's ochre" },   // by colours (as written or painted)
    { "style": "margin-note", "reason": "source sets margin notes in light grey" }  // by style id: box (or frame
  ]                              // style), paragraph, heading, chip or label style; fg/bg narrow a style entry
}
```
- Screen = WCAG 2 ratio of the sRGB colours. Print = the same formula over the colours as separated through
  the output profile, relative to the bare paper: solid black on white is about 14:1 on coated stock (FOGRA39/51),
  8:1 uncoated (FOGRA47/52), 5:1 newsprint (IFRA26, SNAP). `#767676` on white passes on screen (4.54:1) and
  fails coated print (about 3.3:1).
- Read: body lines with their inline colours, list markers, drop caps, captions, notes, table cells, running
  heads, openers, heading designs, box titles, against the topmost fill under them (box, callout, caption
  bar, cell, chip, else the page or part paper). Text over a picture, comic lettering, ruby and formulas are
  skipped.
- `postext check` prints each pair once as `contrast.lowContrast` (colours, size, ratio per rendition,
  required ratio, first text) or `contrast.reversedText` (inks of the ground, minimum size), severity
  warning (exit 3 only with `--strict`). With `--preflight` a `mode: 'auto'` book is checked for print too.
  The Sandbox lists them in Checks.
- A port keeps the source's colours. Report a low ratio the source has as a finding; do not recolour.
  When the source sets the pair on purpose (its palette), add a `contrast.allow` entry with the reason
  instead of turning the check off: the pair stays listed as accepted (`accepted` on the finding, a note
  in `postext check`, its own group in the Sandbox Checks) and no longer counts as a warning.
  Turn the check off (`enabled: false`) only when the user asks.

`htmlViewer`: `{ maxCharsPerLine = 70, columnGap = 50 (CSS px number), optimalLineBreaking = false, overrides?: Omit<PostextConfig,'htmlViewer'> }`.
`overrides` merge: objects recursive; `levels` arrays merged by `level`; every other array
(design `elements`, `calloutStyles`, `colorPalette`, …) replaced wholesale. Typical:
`{ parts: { page: false }, headings: { levels: [{ level: 1, advancedDesign: { enabled: true, slot: {…screen opener…} } }] } }`.
The HTML viewer also turns on `layout.fitFiguresToPage` itself.

`canvasViewer` (postext ≥ 1.43): `{ pageGap = 24, rowGap = 24 }`, screen px at any zoom, whole numbers 0–200 (another
value is read as the nearest such number, or 24 when not a number, with `unknownConfigValue`). `pageGap` is the space
between the two pages of a pair in the Sandbox Canvas's double-page view; `0` joins them with no shadow or rounded
corner at the spine. `rowGap` is the space between rows of pages in both views. A viewer setting: it never lays the
book out again or changes the PDF, HTML or EPUB. Set `"canvasViewer": { "pageGap": 0 }` on a book whose pictures or
designs run across the spread, so the Canvas shows the spread as one (Sandbox: Design › Export › Canvas).

### Delivering EPUB, HTML and PDF files

The `postext` command line writes every output from the project folder or the `.postext`; `build` takes
the same options and lays the book out once for all of them
(`postext build my-book --locale es --pdf out/es.pdf --epub out/es.epub --html out/es.html --docx out/es.docx`):

```bash
postext epub my-book.postext -o my-book.epub                        # fixed layout: every page as printed (default)
postext epub my-book.postext --layout reflowable --cover cover.jpg  # reflowable text; --cover JPEG/PNG/WebP/SVG
postext html my-book.postext -o my-book.html                        # one self-contained file (pictures, fonts inside)
postext html my-book.postext -o site/ --mode single                 # folder: index.html + assets/; pages one under another
                                                                    # (--mode multi, the default: side by side); --assets embed|folder
postext pdf my-book -o print.pdf --pdfx x4 --profile fogra51         # --pdfx none|x1a|x4, --profile a catalogue id or an .icc file
postext pdf my-book -o proof.pdf --color-space grayscale --no-outlines   # rgb|cmyk|grayscale; --accessible/--no-accessible, --page-negative
postext image my-book --page 12 --print-preview -o p12.png          # soft proof through the output profile, trim and bleed drawn
```

- **Which EPUB.** `fixed` (EPUB `pre-paginated`: one XHTML per printed page, columns, floats and line breaks
  kept, real text) suits illustrated books, textbooks, magazines, comics. `reflowable` (one XHTML per
  chapter, a part opens its own; headings, paragraphs, lists, boxes as asides, figures and tables after the
  text that cites them, notes, links, print page markers) suits novels, essays, reports. Columns, running
  heads, designs and exact breaks are lost there. A composed page becomes its frames in Markdown order.
  Both carry a nav TOC, a page list with the printed labels, landmarks, an NCX and EPUB Accessibility 1.1
  metadata. Deliver the one the brief names, else ask. A designed book usually gets both.
- **Metadata** comes from the first chapter's front matter: `title` (else the manifest name), `subtitle`,
  `author` or `authors` (a YAML list for several), `publishDate` or `date` (ISO year, month or day), `isbn`
  or `identifier` (a bare ISBN becomes `urn:isbn:…`; else a stable `urn:uuid:` per book), `publisher`,
  `rights` (or `copyright`, `license`), `description` (or `abstract`). The language is `config.locale`. Put
  them in the front matter when the source has them. The cover is `--cover`, else the manifest `thumbnail`.
  Without either, the fixed layout uses page 1 and the reflowable book has no cover picture.
- **Fonts.** `redistributable: false` faces are never copied into an EPUB or HTML file. A family with a
  `fonts[].fallback` is embedded in the fallback's faces under its own name (≥ 1.43). Without one it is
  named without files and reading systems substitute. SVG pictures get the faces their `<text>` names
  (warnings `svgFontUnavailable`, `svgFontsTooLarge` over 2 MiB, `fontWithheld`).
- **`postext html`** is the print layout at screen size, with real text; its reading order is the Markdown's
  (`composed_check.py` checks it). The Sandbox's HTML tab is different: it reflows the text for the window
  (`htmlViewer`).
- **Videos.** A self-hosted file is packed under `media/` and plays in `<video>`. YouTube and Vimeo are the
  poster linked to the video (§18a).
- **Check the file** with `epubcheck my-book.epub` (W3C EPUBCheck). Usage notes `CSS-028`, `OBS-001` and
  `HTM_062` are informational. In a Postext checkout,
  `node packages/postext-epub/scripts/epubcheck.mjs my-book.postext --layout both` lays out and checks
  both renditions.
- **From code** (`postext-epub`, peer of `postext`, same version):
  `renderToEpub(docs, { layout, metadata: { title, language, creators?, identifier?, date?, publisher?, rights?, description?, modified? }, fonts, resourceBytes, cover?: { bytes, mediaType, alt?, showsFirstPage? }, svgFonts?: { provider?, withhold?, standIn?, maxBytes?, inline? }, kindlePanelView?, onWarning })`.
  `svgFonts.standIn: (f) => exportStandInOf(config.customFonts, f)` gives SVG text the stand-in faces;
  `kindlePanelView: true` adds Kindle panel magnification to a fixed-layout comic (code only; the command line
  has no flag); pass `modified` for byte-identical output.

`folio` (the Folio 3D viewer, `postext-folio` and the Sandbox's Folio tab; layout, canvas, PDF and HTML ignore it, so it never changes a page or the layout hash):

```jsonc
"folio": {
  "tilt": 22,                         // degrees from overhead, 0–70 (clamped)
  "yaw": 0,                           // degrees round the book, −180–180 (wrapped); + = eye to the right
  "paper": {
    "type": "uncoated",               // uncoated | bookWove | coatedMatte | coatedSilk | coatedGloss | bible | newsprint | cardStock | board
                                      // default newsprint on a newspaper trim (broadsheet | berliner | tabloid | compact)
    "grammage": 90,                   // g/m², 20–2500; default: the stock's
    "bulk": 1.25,                     // cm³/g, 0.5–3; caliper µm = grammage × bulk
    "finish": "auto",                 // auto | uncoated | matte | silk | gloss
    "texture": "auto",                // auto | smooth | vellum | wove | laid | linen | felt
    "textureStrength": 1,             // 0–2
    "shade": { "hex": "#fcfbf8", "model": "hex" },
    "showThrough": true
  },
  "binding": {
    "type": "hardcover",              // hardcover | paperback | sewn | layflat | saddleStitch | folded (≥ 1.18: newspaper)
                                      // default folded on a newspaper trim
    "cover": "case",                  // case (drawn round the pages) | pages (first page = front board, last verso = back board)
    "coverMaterial": "auto",          // auto (cloth on hardcover, card otherwise) | cloth | paper | leather
    "coverColor": { "hex": "#2c3e57", "model": "hex" },
    "spineImage": "spine"             // a bitmap/SVG resource id; ignored on saddleStitch and folded
  },
  "surface": { "type": "oak", "color": null },   // oak | walnut | linen | felt | leather | marble | plain | none; color tints (plain: is the colour)
  "lighting": { "environment": "studio", "intensity": 1, "shadows": true }  // studio | daylight | lamp | overcast | night; intensity 0.25–2
}
```

Stock defaults (`FOLIO_PAPER_STOCKS`; unset paper fields follow the chosen stock):

| type | g/m² | bulk | caliper | finish | texture | shade |
|---|---|---|---|---|---|---|
| uncoated | 90 | 1.25 | 113 µm | uncoated | wove | #fcfbf8 |
| bookWove | 80 | 1.6 | 128 µm | uncoated | wove | #f6efdc |
| coatedMatte | 115 | 1.0 | 115 µm | matte | smooth | #fdfdfc |
| coatedSilk | 115 | 0.9 | 104 µm | silk | smooth | #ffffff |
| coatedGloss | 115 | 0.8 | 92 µm | gloss | smooth | #ffffff |
| bible | 40 | 1.1 | 44 µm | uncoated | vellum | #f9f6ee |
| newsprint | 48 | 1.5 | 72 µm | uncoated | wove | #ebe7dc |
| cardStock | 250 | 1.2 | 300 µm | uncoated | vellum | #fbfaf6 |
| board | 1250 | 1.6 | 2000 µm | silk | smooth | #ffffff |

How the viewer reads it:
- Thickness of the page blocks = leaves × caliper, the whole book counted (a chapter shown alone counts the
  others). A 600-page novel on `bookWove` is ~38 mm thick; on `bible` ~13 mm: set the real stock.
- `cover: "pages"`: the book lies closed on its first page until it is turned; that page and the last one (when
  the page count is even) turn as rigid boards and no case is drawn. Use it only when chapter 1 really starts
  with the front cover (a full-page design or image) and the last chapter ends on the back cover.
- `spineImage`: the spine as seen with the book standing, head up, front cover to the right; scaled to cover
  the spine and centred: make it spine-thickness × page-height in proportion, with room at the edges.
- `:::paper{type=coatedGloss grammage=130}` in the text prints a run of pages on another stock (plate
  sections, card inserts); its attributes are the `paper` fields above (document-format.md §7.5).
- Colours: `{hex, model}` objects, palette links (`paletteId`) followed like any other colour.
- The Sandbox edits it under Design → Folio (View, Paper, Binding, Surface, Lighting); changes redraw the
  book without a relayout. `lint_project.py` checks every key, enum, range and the spine resource.

Match the printed book: a novel on cream book wove → `{ "paper": { "type": "bookWove" }, "binding": { "type": "paperback" } }`;
an art book → `coatedSilk` 150 g/m², hardcover, cloth `coverColor`; a magazine → `coatedGloss` 90 g/m², `saddleStitch`,
`cover: "pages"` when the cover is page 1; a board book for children → `board`, hardcover; a newspaper →
`newsprint`, `folded` (sheets folded once and nested: no staples, spine or boards), with
`:::paper{shade=#f4cfb5}` around a section printed on salmon stock (the business pages). On a newspaper
trim (`page.sizePreset` broadsheet | berliner | tabloid | compact) those two are the defaults (≥ 1.18): leave
`paper.type` and `binding.type` unset and Folio shows folded newsprint; a stock or binding you set wins
(`resolveFolioConfig(folio, sizePreset)`, `stripFolioDefaults(folio, sizePreset)`, `folioForTrim`). Newsprint
shows the reverse page more than any stock but bible (its coldset ink soaks into the sheet).

`debug`: `cursorSync {enabled=true,color}`, `selectionSync {enabled=true,color}`,
`looseLineHighlight {enabled=false,color,threshold=3}`, `pageNegative {enabled=false}`,
`warnings { missingFont=true, looseLines=true, headingHierarchy=true, consecutiveHeadings=false, listAfterHeading=false, designIssues=true }`,
`fitMarks='problems'|'all'|'none'` and `fitMarksMinScale=1` (postext ≥ 1.52, #1160; default `problems` since #1200, `all`
before): which fit marks the Sandbox canvas draws over composed pages for a reader who has not chosen in the canvas rail
(`problems` keeps the frames that do not fit and the unknown looks, drops the scale badges; `all` adds them), and the
scale at or above which a frame gets no scale badge in `all` (0.95 for a multi-language book whose headings may set at
90 %). Out of the layout key; never in the PDF, HTML, EPUB or Folio.
Reading a line's word spacing off the VDT (postext ≥ 1.28): compare `lineWordSpacing(line)` with `minWordSpacing` /
`maxWordSpacing`, not `line.justifiedSpaceRatio`. The latter is the width every space is painted at over the regular
face's space, and a line with an italic or a bold space reads a few hundredths under or over the limit it was
broken within; `line.justifiedSpaceLimitRatio` (present only on such lines) is the number the limits bound, and
`lineWordSpacing` returns it or the painted ratio. The loose-line highlight, `findLooseLines` and the capture's
C24 use it.
`missingFont` also gates the engine's `fontFallback` content warning (≥ 1.25): a face the text was set in
that the browser's font set could not give when the build ran (`reason` `missing` or `synthesized`, a
weight or slant the family has no face for, drawn from another of its faces: a 600 set from the 700 as
much as a bold made from the regular). Builds with a font set check it (the browser, a worker), and so does
the `postext` command line (≥ 1.28): it warns `fontFallback` when a face the family ships could not be loaded
(offline with nothing cached, a failed download, a `--font-dir` without the file) and another face of the family
stood in. A weight or slant the family does not ship stays silent there. `render.mjs` does not check it.
It gates `glyphFallback` too (≥ 1.52): characters the text sets in a face with no glyph for them, which
another face drew (an arrow or a Greek letter from a fallback serif beside a sans text face), one warning per
face with the characters. The command line reads the `cmap` of every face it loads; browser and worker builds
ask a probe face that `prepareFonts` and the layout worker declare (`installGlyphProbe`).

**Fonts and caches in browser code (≥ 1.25).** Build with `buildDocumentWithFonts(content, config,
{ resolve })`, or call `prepareFonts(content, config, { resolve })` before `buildDocument`: it loads
every face the config and the text ask for (all weights and slants, for the characters the text sets,
so Arabic, Greek or CJK slices come in), from the page's `@font-face` rules or from `resolve(family,
weight, style, { text })`, which answers with files like a PDF font provider. Faces that arrive later
drop their family's measurements by themselves (`watchFonts` + `onFontsChanged(relayout)` for a live
view); never call `clearMeasurementCache()` and rebuild by hand. A config object changed in place is
resolved again on the next build, so a `config()` factory per build is not needed.

---------------------------------------------------------------------------------

## 22. Docs vs code discrepancies (code wins)

1. `page.margins` default: docs "2 cm all sides"; code top/bottom 2 cm, **left/right 1.5 cm**.
2. Lists `fontFamily`/`fontWeight`/`italic`/`color`: docs "item text"; code = **marker only**, item text is body style.
3. (Fixed in 1.24) Design text `overflow` default: follows the slot (`'wrap'` in heading and part designs, `'ellipsis-end'` elsewhere); up to 1.23 the resolver fell back to `'ellipsis-end'` everywhere and the type required the field.
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
