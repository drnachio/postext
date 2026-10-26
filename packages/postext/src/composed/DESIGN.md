# Composed pages: design (P1, drnachio/postext#847)

Status: approved (P1); §5.8–§5.12 record what P4, P14, P7, P5 and P15 built. Programme tracker: drnachio/postext#846.
Draft types: [`types.ts`](./types.ts) (no runtime effect).

A composed page is a page whose form is a **template** (named frames, groups, decoration) held in
the configuration, and whose content is the Markdown between a `::::page` fence, poured into the
frames by **slot** name. Geometry never appears in the Markdown; content text never appears in the
configuration.

## 1. Vocabulary

<table>
<tr><th>Term</th><th>Lives in</th><th>What it is</th></tr>
<tr><td>template</td><td>config <code>pageTemplates[]</code></td><td>A named page (or spread) layout: frames, groups, decoration, header/footer, variants.</td></tr>
<tr><td>frame</td><td>template <code>frames[]</code></td><td>A named rectangle that receives typeset content. Has position, size rules, style, layer, fitting and continuation.</td></tr>
<tr><td>group</td><td>template <code>groups[]</code></td><td>A <code>stack</code> or <code>row</code> of frames that share space and move together.</td></tr>
<tr><td>decoration</td><td>template <code>decoration</code></td><td>A design slot of images, rules and boxes (no content text) painted with the page.</td></tr>
<tr><td>slot</td><td>Markdown</td><td>The name a piece of content asks for. Matches a frame name.</td></tr>
<tr><td>flow frame</td><td>template</td><td>The frame that receives content with no slot.</td></tr>
<tr><td>label</td><td>Markdown <code>::label</code></td><td>A short text set at a named anchor of a picture (maps, diagrams).</td></tr>
<tr><td>anchor</td><td>resource <code>anchors[]</code></td><td>A point (and optional box) on a picture, in fractions, shared by every locale.</td></tr>
</table>

## 2. Configuration

### 2.1 Templates (`pageTemplates`)

```ts
pageTemplates: PageTemplate[]
```

- `id` (required, unique), `name` (UI only).
- `extends`: id of a template whose fields this one inherits. Merge is by key: scalar fields
  replace (`header`/`footer` whole); `grid` merges key by key; `frames` and `groups` merge **by
  name** (a frame with the same name overrides the fields it writes, `fit`/`overflow`/`padding`
  key by key and `placement` whole; `remove: true` drops it; new names are appended);
  `decoration.elements` merge by element `id` (new ids appended). `spread`, `gutter` and `role` are
  inherited; `id`, `name`, `extends` are not. Cycles are an error (`templateExtendsCycle`) and the
  template is dropped, with every template that extends into the loop. The first template with an
  id is the one it means (`templateDuplicate` for the others).
- `area`: the rectangle frame coordinates refer to: `'content'` (default, the page's content area,
  mirrored per parity like the flow), `'trim'` or `'bleed'`.
- `grid` (optional): `{ columns, rows, columnGap, rowGap }` dividing `area`; frames may then be
  placed by cell (`grid: { col, row, cols, rows }`, 1-based) instead of `placement`.
- `frames`, `groups`, `decoration`.
- `header` / `footer`: a design slot, `false` to hide, unset to inherit the running section's.
- `variants`: `{ recto?: TemplatePatch, verso?: TemplatePatch }`. The patch merges like `extends`
  on the page of that parity, after the whole `extends` chain, the root's variant first; a spread
  takes no variant. (Parity is the physical side, so left-to-right and right-to-left books
  both work.)
- `spread: true`: the template describes a sheet of two facing pages. `area` spans both pages;
  `gutter` gives the spine band frames must respect or may cross (`crossGutter: true` on a frame).
  A spread template always starts on a verso (left page in LTR, right page in RTL books), adding a
  parity blank like `breakToEvenPage` does for comic spreads.
- `overflowTemplate`: id of the template used for pages added by continuation (§5.6). Default: the
  same template with only the frames named in `overflow.continueIn` filled.
- `bodyStyle`, `palette`: as heading styles have them, applied to the page.
- `role`: page role reported to design slots (`pages` filters); default `'composed'`.

### 2.2 Frames

```ts
interface FrameConfig {
  name: string                  // slot name; unique per template
  placement?: ElementPlacement  // anchor/offset/size language of design slots
  grid?: { col, row, cols?, rows? }
  width?:  FrameSize            // Dimension | '%' of area | 'auto' | 'fill'
  height?: FrameSize
  minWidth?, maxWidth?, minHeight?, maxHeight?: Dimension
  style?: string                // a calloutStyles id (see 2.4); unset = frameless
  layer?: number                // paint order; default 1; decoration is 0; negative = below
  rotate?: number               // degrees, content and frame rotate together (P4)
  verticalAlign?: 'top' | 'middle' | 'bottom' | 'justify'
  columns?: number, columnGap?: Dimension
  padding?: CalloutPaddingConfig   // overrides the style's
  exclude?: 'none' | 'push'     // 'push': other frames' text wraps around this frame
  flow?: boolean                // receives content with no slot
  next?: string                 // chain: overflow continues in this frame
  takes?: 'h1'|'h2'|…|'h6'|'toc' // receives the first heading of that level with no slot, or the page's :::toc (#983)
  pin?: boolean                 // never moves or resizes (aligned with artwork)
  grow?: number, shrink?: number, priority?: number   // group negotiation (§5)
  fit?: { shrinkText?: boolean, minScale?: number, scaleImages?: boolean, imageMinScale?: number,
          preferContinue?: boolean }   // continue before 3 and 5 of the ladder (§5.4), default true
  overflow?: { continueIn?: string, mark?: string | false }
  writingMode?, direction?      // as the page; for a vertical box on a horizontal page (#944, §5.15)
  optional?: boolean            // no slotEmpty warning
  crossGutter?: boolean         // on a spread: may cross the spine band
  remove?: boolean              // in a patch: drop the inherited frame
}
```

Position, in order of precedence: `grid` cell, then `placement`. `placement.anchor.to` may be
`'#otherFrame'` with the element-to-element edges design slots already know (`right-of`, `below`,
`align-top`…), so a frame can hang off another and move with it. Without either, a frame takes the
whole `area`.

Size: a `Dimension` is fixed. `'auto'` height (the default) is the content's height, clamped to
`minHeight`/`maxHeight`; `'auto'` width (#982, §5.18) is the width of the content's longest line plus
the padding, up to the room the anchor leaves and `maxWidth`. `'fill'` takes what is left up to the anchor's edge (as in design slots).

`takes` exists so the page title of a textbook topic is just `# Title` at the top of the page
fence: no slot attribute needed.

### 2.3 Groups

```ts
interface FrameGroupConfig {
  name: string
  kind?: 'stack' | 'row'     // default 'stack'
  frames?: string[]          // order = order on the page (top→bottom, start→end)
  gap?: Dimension
  placement?, grid?          // the group's own box; default: union of its frames' declared boxes
  align?: 'start' | 'center' | 'end' | 'space-between'   // where spare space goes
}
```

A frame belongs to at most one group. A group's name is distinct from every frame name (anchors
name both as `'#name'`). Inside a group the frames' own `placement` y (stack) or x
(row) is ignored: the group lays them out in order with `gap`. A group is itself a box that other
frames may anchor to (`'#group'`).

### 2.4 Frame styles

Decision: **frames reuse callout styles** (`calloutStyles[]`). A callout style already draws
everything the textbook boxes need: background, border, radius, padding, stripe, icon, the label
tab (`label`, with position and icon), title style, marker column, column gap. A new style family
would duplicate all of it and the Sandbox editors. The Sandbox's "frame-style library" (U5) is the
callout-style library filtered to styles used by templates, with usage counts.

Per-instance text such as a tab's words comes from the Markdown: `:::frame{slot="dinero"
label="El dinero"}` (or `title=`), exactly as for `:::callout`. A style's `title` default is a
whitelisted literal for `contentInConfig` only when it is one or two words.

Properties a callout style has that do not apply to frames (`placement`, `span`, `columns`,
`sideAtColumnEnd`, `floatBarrier`, `fixed`, `width`) are ignored when the style dresses a frame.

### 2.5 Decoration

`decoration: DesignSlot` with image, rule and box elements, and text elements whose content is only
placeholders (`{pageNumber}`, `{chapterTitle}`, `{attr.x}`) or whitelisted literals. Elements may
anchor to `'#frameName'` and then move with the frame (P14). Decoration is laid out **after** the
frames, with the frames' final boxes known; it never pushes text. `pin` on a decoration element
keeps it where the template says even if its anchor frame moves.

### 2.6 Resource anchors

`Resource.anchors` (comics, #557) gains label fields; existing comic anchors keep working:

```ts
interface ResourceAnchor {
  id: string; x: number; y: number          // fractions of the picture, top-left origin
  head?, face?                              // comics, unchanged
  width?: number                            // label measure, fraction of the picture width
  align?: 'start' | 'center' | 'end'        // label position relative to (x, y)
  verticalAlign?: 'top' | 'middle' | 'bottom'
  rotate?: number                           // degrees
  style?: string                            // a labelStyles id
}
```

`labelStyles[]` (new, small): `{ id, paragraphStyle?, fontFamily?, fontSize?, fontWeight?,
fontStyle?, color?, textTransform?, letterSpacing?, halo?: { color, width }, background?,
padding?, minScale? }`. Anchors survive crops (`safeArea`) and splitter-free figure scaling because
they are fractions of the picture, mapped through the crop as `comicArtPointToPage` does.

### 2.7 Contents groups

Specified in #850: `toc.groups = { keepTogether, head: 'part' | 1…6, minEntriesAfterHead,
continuation: { enabled, mark } }`, `:::toc{keep="part" levels="1-2"}`. Independent of templates.

### 2.8 Checks (#849, not part of P2)

`checks.contentInConfig = { enabled?, allow?: string[], maxWords?: 2, maxChars?: 24 }` (#849).
Literals allowed without warning: per element at most `maxWords` words and `maxChars` characters
after removing placeholders (scripts without spaces: characters only); anything in `allow`; and,
when the check has the content, literals equal to the document's title, author or publisher
metadata. So: book title, publisher name and one- or two-word running heads ("Índice",
"Capítulo {chapterNumber}") pass; sentences fail.

### 2.9 Validation

The engine ignores unknown keys elsewhere; for `pageTemplates` it validates and warns (config
warnings, shown by `postext check` and the Sandbox): `templateDuplicate`, `templateExtendsCycle`,
`templateExtendsUnknown`, `frameDuplicate`, `frameStyleUnknown`, `frameAnchorUnknown` (anchor to a
frame or group that does not exist, or a cycle of anchors), `frameMinMax` (min > max, fixed size
outside min/max), `groupFrameUnknown`, `groupFrameTwice`, `frameChainLoop` (`next` cycle),
`overflowTargetUnknown`, `labelStyleUnknown`. Every warning carries the config path as a JSON
pointer: the entry for a duplicate (`/pageTemplates/3/frames/2`), the field at fault otherwise
(`/pageTemplates/3/frames/2/style`, `/pageTemplates/3/variants/recto/frames/0/next`), in the
template that wrote the field when it was inherited; `labelStyleUnknown` points into the resources
(`/resources/4/anchors/0/style`, with `resourceId`). `frameAnchorUnknown` also covers decoration
elements anchored to nothing the template has. Unknown keys and words of templates, frames, groups,
grids, `fit`, `overflow`, variants and label styles give `unknownConfigKey`/`unknownConfigValue`.
`resolvePageTemplate` applies the same fixes the warnings describe (anchor → `'container'`, broken
`next`/`continueIn` dropped, unknown group members skipped, unknown style → frameless), so the
layout never meets a dangling reference; min/max contradictions are left to the layout (min wins,
a fixed size is clamped).

`configVersion` goes from 14 to 15. Nothing older changes meaning, so the migration is a no-op;
the bump marks bundles that may hold templates so an older reader can warn.

## 3. Markdown

### 3.1 The page fence

```md
::::page{template="tema-cajas"}
…content…
::::
```

- **Four colons.** The parser learns fence lengths for this one directive: a line `::::page{…}`
  (four or more colons) opens a composed page container; the closing line is a bare fence of the
  **same** number of colons. Inside, three-colon containers (`:::frame`, `:::callout`,
  `:::figure`, `:::columns`…) open and close as today. A bare `:::` can never close the page.
- `:::page{split}` (three colons) stays the comics page with its raw body, byte for byte as today.
  A three-colon `:::page` carrying `template=` gets the warning `pageFenceLength` ("a composed page
  needs four colons") and is parsed as before (comics), so nothing silently changes meaning.
- Attributes: `template` (required), `spread` (flag; must match the template's `spread`), `id`
  (for `:ref`), and any other attribute, readable as `{attr.x}` by the template's decoration and
  header/footer (a page background chosen per page: `resourceId: "{attr.fondo}"`).
- A composed page always starts a new page (or spread). Content after `::::` resumes the normal
  flow on a new page.

### 3.2 Slots

```md
:::frame{slot="dinero" label="El dinero"}
Es el instrumento utilizado como medio de pago…
:::
```

- `:::frame{slot}` is a container holding full Markdown: paragraphs, lists, headings, chips,
  `::resource`, `:ref`, footnotes, `:::columns`, nested callouts.
- `slot="…"` on any single block (`## Heading {slot="title"}`, `::resource{id="x" slot="foto"}`,
  a fence's attributes) sends that block alone.
- Several pieces with the same slot concatenate in Markdown order.
- Content with no slot goes to the flow frame; a heading of level N with no slot goes to the frame
  that `takes` it, if any, before falling to the flow frame.
- A slot that the template does not have: `slotUnknown`, and the content goes to the flow frame
  (or, with no flow frame, is laid after the page in the normal flow so it is never lost).
- A frame of the template that receives nothing: `slotEmpty` (info level; a frame may be optional:
  `optional: true` on the frame silences it).

### 3.3 Figures with labels

```md
:::figure{resource="mapa-europa" slot="mapa"}
::label[OCÉANO ATLÁNTICO]{at="atlantico" style="mar"}
::label[Madrid]{at="madrid"}
::label[Mar Negro]{at="62% 48%"}
:::
```

- `:::figure` places one resource (its caption and numbering as `::resource` today) and sets each
  `::label` at its anchor; `at="x% y%"` is the fallback when no anchor exists.
- `style` overrides the anchor's label style. Text is ordinary inline Markdown (bold, chips).
- Outside composed pages `:::figure` works in the flow too, as a resource with labels.
- Warnings: `labelAnchorUnknown` (label names an anchor the resource lacks), `anchorUnlabelled`
  (info: an anchor with a style but no label in this locale).

### 3.4 Example: textbook p. 8

```md
::::page{template="tema-cajas" fondo="banda-retos"}
# La actividad económica y el dinero

## La actividad económica

Las personas utilizan :chip[recursos]{style="clave"} que se obtienen de la naturaleza…

- Las :chip[empresas.]{style="clave"} Ofrecen bienes y servicios a cambio de un beneficio.
- Las :chip[personas y familias.]{style="clave"} Adquieren lo que ofrecen las empresas…

:::frame{slot="dinero" label="El dinero"}
Es el instrumento utilizado como medio de pago, ya que su valor es conocido…

Hasta hace pocos años, lo más normal, era pagar con dinero en **efectivo**…
:::

::resource{id="dinero-pago" slot="dinero-fotos"}

:::frame{slot="gasto" label="El gasto"}
El dinero que utilizan las personas para satisfacer sus necesidades…

- **Fijo:** es el que se produce todos los meses…
- **Variable:** puede cambiar según las necesidades…
- **Inesperado:** se producen por situaciones imprevistas…
:::

::resource{id="gasto-compras" slot="gasto-fotos"}

:::frame{slot="ahorro" label="Préstamos y ahorro"}
Si necesitas o quieres comprar algo muy caro…
:::

::resource{id="ahorro-balanza" slot="ahorro-fotos"}
::::
```

Template (config, no text):

```jsonc
{ "id": "tema-cajas", "area": "content",
  "decoration": { "elements": [ { "kind": "image", "id": "fondo", "resourceId": "{attr.fondo}",
      "decorative": true, "placement": { "anchor": { "to": "bleed", "edge": "top-left" },
      "size": { "width": "fill", "height": "fill" } } } ] },
  "frames": [
    { "name": "titulo", "takes": "h1", "style": "tab-titulo", "height": "auto" },
    { "name": "texto", "flow": true },
    { "name": "dinero", "style": "caja-azul", "padding": { "right": { "value": 62, "unit": "mm" } } },
    { "name": "dinero-fotos", "layer": 2, "width": { "value": 60, "unit": "mm" },
      "placement": { "anchor": { "to": "#dinero", "edge": "top-right" },
                     "offset": { "y": { "value": -4, "unit": "mm" } } } },
    { "name": "gasto", "style": "caja-verde", "padding": { "left": { "value": 80, "unit": "mm" } } },
    { "name": "gasto-fotos", "layer": 2, "width": { "value": 76, "unit": "mm" },
      "placement": { "anchor": { "to": "#gasto", "edge": "top-left" } } },
    { "name": "ahorro", "style": "caja-amarilla", "padding": { "right": { "value": 48, "unit": "mm" } } },
    { "name": "ahorro-fotos", "layer": 2, "width": { "value": 46, "unit": "mm" },
      "placement": { "anchor": { "to": "#ahorro", "edge": "right" } } } ],
  "groups": [ { "name": "pagina", "kind": "stack", "gap": { "value": 6, "unit": "mm" },
                "frames": ["titulo", "texto", "dinero", "gasto", "ahorro"],
                "align": "start" } ] }
```

When the Catalan text of `dinero` is two lines longer, `dinero` grows, `gasto` and `ahorro` move
down, their photos follow their anchors, and the reflow log says so. If the stack no longer fits
the page, the ladder of §5.4 runs.

### 3.5 What P6 built (#860)

- **Layout** (`composed/labels.ts`): `layOutFigureLabels(labels, parsed, rb, ctx)` runs where the
  figure's block is measured (`runMeasurement`, and `buildFloatBlock` for a floated figure), on
  bitmaps and SVGs. Each label gets `VDTFigureLabel.layout`: its point `(x, y)` in px from the body's
  top-left (the anchor's fractions of the whole picture through `bodySource`, `pictureToBody`), its
  `rotate`, its lines set as a caption is (`layoutLabelLines` in `resourceLayout.ts`: chips, marks,
  refs, maths; no hyphenation; `\\` breaks) in the label's own frame, its box, fonts, colour, halo,
  plate and fit scale. Kept relative to the body, so placement, frames, spreads and the memo move it
  for free; painters apply `figureLabelMatrix(layout, bodyX, bodyY)`.
- **Look** (`resolveLabelLook`): body text ← borrowed paragraph style ← label style; the label's
  `style` beats the anchor's. `fontStyle`/`textTransform` resolve to defaults in P2, so a borrowed
  paragraph style's italics and capitals hold unless the label style turns them on (it cannot turn
  them off). Line pitch 1.15 em, or the paragraph style's.
- **Fit**: wrap at `anchor.width × picture width`; the widest word sets a first scale, then 0.97
  steps while a word is still divided (`hyphenated && !hardHyphen`), down to `minScale`; `overflow`
  when it still does not fit. Without `width`, one line.
- **Alignment**: `start`/`end` in the label's direction (first strong letter); default centre /
  middle. Anchors shared by LTR and RTL editions read best centred above or below the point.
- **After the pages**: `stampFigureLabelRects(doc)` (after `orientLinesToFrames`) fills `rect` in
  the block's frame (quarter-turned blocks included); `orientResourceBlock` mirrors label layouts on
  RTL pages (`mirrorLabelLayout`); `labelGlyphAt` maps a point to the glyph for `sourceAt`;
  `figureLabelWarnings` gives `labelAnchorUnknown` / `anchorUnlabelled` with page and locale.
- **Outputs**: canvas and PDF paint labels in `renderResourceBlock` after the picture (halo: the
  same line painter through a stroking context on canvas, `ctx.textOutline` hollow strokes in PDF);
  HTML writes `<div class="pt-figure-label">` with a CSS matrix and `-webkit-text-stroke`. The
  `alt`/`Alt` keeps only undrawn labels (`undrawnLabels`); tagged PDF reads a `Div` with one `P`
  per drawn label after the `Figure` (`StructureFlow.figureLabelsElem`), halo and plate artifacts.
  Reflowable EPUB unchanged (hidden list). Folio uses the canvas.

## 4. Document nodes

The parser emits (as built in P3, #854):

- The page fence stays in the block stream as a `containerStart` / `containerEnd` pair of
  `containerName: 'composedPage'` (not in `KNOWN_CONTAINERS`, so `:::page` stays a comic page); the
  start marker carries `composedPage: ComposedPageFence { template, spread, attrs, attrSources,
  fenceIndex, colons }`, where `fenceIndex` is the page fence's ordinal in its chapter (stable across
  locales).
- Frame containers become `containerStart/End` of name `frame`. Every block that names a slot carries
  `ContentBlock.slot: { name, sourceStart, sourceEnd }` (a heading's `{slot}`, a `::resource{id slot}`,
  a code fence's or any `:::` container's, a `:::frame`'s).
- `composedPages(blocks)` (`composed/document.ts`, pure) gathers one `ParsedComposedPage` per fence —
  the `ComposedPageNode` of `types.ts` (`slots: Record<slot, blockIndex[]>` in Markdown order,
  `unassigned`) plus `slotSources`, `firstHeadings` (for `takes`), `fence` and `unclosed`. A frame's own
  markers are left out of its slot; a nested container goes whole (markers included) to the slot it
  names, else to `unassigned`. It reads any block array, so P4 calls it on its transformed
  `contentBlocks`.
- `:::figure` is not a container in the stream: it is read whole into one `resourceBlock`
  (`resourceId` = `resource`) with `figure: FigureInfo { attrs, attrSources, labels }`, so the flow
  sets it as `::resource` until P6. Each `FigureLabel` extends `FigureLabelNode` with `spans`,
  `sourceMap`, `textStart/End` and `attrSources`; `at` is `{ anchor }` or `{ x, y }` in fractions of
  the picture (from `at="62% 48%"`).
- Recovery: a page left open closes at the end of the text; a `::::page` met while one is open closes
  it there; the closing fence closes any container still open inside the page; each is reported as
  `unclosedContainer`. A closing fence of another colon count stays text. A `:::figure` whose `:::` is
  missing ends at its first line that is neither a label nor blank (`unclosedContainer`, name
  `figure`). A bare `:::` with no `:::` container open (at the top level or right inside a page) whose
  last non-blank line before it is a one-line directive (`:::toc`, `:::index`, `:::pagebreak`,
  `:::space`, `:::columnbreak`, `:::numbering`, `:::bibliography`) is a closing fence written for a
  directive that takes none: it is dropped and reported as `strayFence` (#1125). Any other bare `:::`
  there stays text.
- Since P4 (#855) the layout sets a composed page on a page of its own from its template (§5.8). A
  page whose template is unknown is still set in the flow, in Markdown order, on pages of its own.

The layout emits (VDT):

- `VDTPage.composed: VDTComposedPage { template, variant, spread?, frames: VDTFrame[], decoration:
  VDTDesignSlot, log: ReflowEvent[], fenceIndex, sourceStart, sourceEnd }`.
- `VDTFrame { id, name, rect, rotate, layer, styleId, scale, overflowPx, continuedFrom?,
  continuesTo?, blockIds, configPath, sourceStart?, sourceEnd?, push? }`. The frame's box and its
  children are ordinary callout blocks in `page.floats` and `doc.blocks` (their `containerId` is the
  story's synthetic container, shared by the pieces of a chain; `blockIds` ties them to the frame), so canvas, PDF
  (tagging), HTML, EPUB and Sandbox caret mapping handle them without new painters; `VDTFrame`
  adds what only templates know (name, config path, scale, log).
- `VDTLabel` items on the figure block (text blocks with source maps, positioned on the page).

## 5. Layout

### 5.1 Where it runs

A new branch in the main block loop, next to the comic page branch: close the flow segment, take a
fresh page (a verso pair for a spread), set `page.role = 'composed'`, keep a single empty column so
column-wide machinery sees an empty page, lay the template, push frames and children to
`page.floats` / `doc.blocks`, then force a page break. Frames are **not** page columns: banding,
balancing, footnote areas and trailing caps keep assuming a page's columns are one chain.

The callout layouter (`makeCalloutLayouter`, `splitCalloutFragment`, `CalloutCut`) is the frame
typesetter: each frame's slot content is laid as a callout of the frame's style (or a frameless
synthetic style, as `:::columns` does) at the frame's inner width and cut at its height. P4 factors
these closures out of `placeDocumentPass` into `pipeline/callouts/frameLayout.ts` with an explicit pass
context, so composed pages do not grow `build.ts` further.

### 5.2 Order of work per page

1. Resolve the template (`extends`, variant for this parity, spread sheet).
2. Gather slot content; report `slotUnknown`, `slotEmpty`.
3. Resolve fixed geometry: grid cells, fixed placements, pinned frames, group boxes.
4. Measure each text frame's natural height at its width (`auto`), in **template order**.
5. Solve groups (§5.3), then frames anchored to other frames, in dependency order (anchors form a
   DAG; cycles were rejected by validation).
6. Run the reflow ladder for any frame whose content still does not fit (§5.4).
7. Typeset every frame for real (the measure of step 4 is reused when nothing changed), commit
   blocks, lay decoration with the final frame boxes, lay labels.
8. Record the reflow log and warnings.

### 5.3 Groups

Stack: members get their natural heights clamped to min/max, laid top to bottom with `gap`. If the
sum exceeds the group's height, frames with `shrink > 0` give back space in ascending `priority`
(ties: later frame first) down to their minimum — a frame given less than its content needs then
enters the ladder. Spare space goes to frames with `grow > 0` in proportion, else follows `align`.

Row: members get their declared widths. A member that overflows its height takes width from
`shrink > 0` siblings (ascending `priority`) whose own content still fits at the reduced width,
found by bisection on whole millimetres; `grow` distributes spare width. Row heights are the row
box's height (`auto`: the tallest member).

`pin: true` frames never move or resize; they act as obstacles the group flows around (a stack
skips the pinned frame's band).

### 5.4 The reflow ladder

For a frame whose content does not fit, stop at the first step that makes it fit:

1. **Free space** in the frame and its group (grow to `maxHeight`, take the group's spare space).
2. **Push siblings**: in a stack, frames below move down; `shrink` frames yield.
3. **Scale flexible images** in the frame and its group between 100 % and `fit.imageMinScale`
   (default 0.8), re-placing floats inside the frame.
4. **Redistribute within min/max**: lower other frames of the group towards their minimum; in a
   row, take width (§5.3).
5. **Shrink the frame's text** uniformly in steps of 2.5 % down to `fit.minScale` (default 0.9;
   `fit.shrinkText: false` disables). Font size, leading and spacing scale together; the frame
   records `scale`.
6. **Continue** (§5.6, §5.12) when `overflow.continueIn` sends content to another page.
7. **Warn** `frameOverflow`. The content that does not fit is clipped at the frame's edge on paged
   output (it is never dropped from reflowable output, the source map, or the warning).

A frame whose `overflow.continueIn` sends content to another page (`'next-page'`,
`'template:<id>'`, `'page:<id>'`) takes step 6 right after step 4, before 3 and 5 (#920,
`fit.preferContinue`, default true): free space, push, redistribute, continue, and only when it
cannot go on (the last page continuation may add, a receiver that takes none of it) smaller
pictures, then smaller text. A story set across pages keeps one size; a magazine's last page of an
article is not set smaller than the pages before it. `fit.preferContinue: false` keeps the order
above (shrink a few lines' worth, go on only when that is not enough).

The ladder is deterministic: same input, same output; steps are tried in this order with fixed
step sizes; ties break by template order. A change is confined to its page (or spread), except for
continuation, which also touches the pages it adds.

### 5.5 Reflow log

Each composed page records `ReflowEvent { frame, kind: 'grew' | 'moved' | 'resized' |
'imageScaled' | 'textScaled' | 'continued' | 'overflow', fromMm, toMm, scale?, cause?: frame }`,
exposed on `VDTComposedPage.log`, in `postext check --json`, and rendered by the Sandbox reflow
panel (U8): «dinero grew 8 mm; gasto moved down 8 mm; the photo is at 92 %».

### 5.6 Continuation

`overflow.continueIn`: `'#frame'` (another frame of the same page; equivalent to `next`),
`'next-page'` (the same frame on a following page built from `overflowTemplate`, or from the same
template with only that frame filled), `'template:<id>'`, or `'page:<id>'` (a jump, #917: a frame
of the later page fence `::::page{id="<id>"}`, past the pages between; `'page:<id>#<frame>'` names
the frame, and `<id>` may be `{attr.name}`, read from the sending fence, so one article template
serves every article: `continueIn: 'page:{attr.sigue}'` with `::::page{template="articulo"
sigue="p47"}`). The remaining content resumes from
the `CalloutCut` cursor, re-broken at the new width. A frame is cut as the running text is (#913,
`frameCutRules`, for `next` chains and continuation alike, and since #942 for a
`keepTogether: false` box of the running text too): a heading never ends a piece
(`headings.keepWithNext`), a cut between the items of a list leaves two items on each side
(`bodyText.avoidOrphansInLists` / `avoidWidowsInLists`; one when off), and a list of up to
`bodyText.shortListMaxItems` items under `shortListSplit: 'avoid'` is not cut between items. When
no cut allows it the piece ends before the heading or the list, or inside one of its items. A frame
set in columns (and any `:::columns` group) offers no column cut right after a heading either, nor
inside one: the heading opens the next column with its text (#1019). Marks: `overflow.mark` text (string, or the
localized default from the engine's continuation words, as tables' `continuesLines` uses: es
«sigue», en «continued», …; `false` for none), set at the end of the cut piece. Added pages keep
page numbering, running heads and parity rules (they are ordinary pages with `role:
'composed'`). Reflowable HTML/EPUB keep the content in one piece.

### 5.7 Warnings

<table>
<tr><th>Kind</th><th>Data</th><th>Fix proposals</th></tr>
<tr><td><code>frameOverflow</code></td><td>page, template, frame, locale, overflow mm, steps tried, final scale</td><td>allow more shrink (<code>fit.minScale</code>), raise <code>maxHeight</code>, lower a sibling's <code>minHeight</code>, continue on the next page, use another template, shorten the text</td></tr>
<tr><td><code>slotUnknown</code></td><td>page, template, slot, source range</td><td>rename the slot, add a frame</td></tr>
<tr><td><code>slotEmpty</code></td><td>page, template, frame</td><td>write content, mark the frame <code>optional</code></td></tr>
<tr><td><code>templateUnknown</code></td><td>page, template id, source range</td><td>pick an existing template</td></tr>
<tr><td><code>pageFenceLength</code></td><td>source range</td><td>use four colons</td></tr>
<tr><td><code>labelAnchorUnknown</code> / <code>anchorUnlabelled</code></td><td>resource, anchor, page, locale</td><td>add the anchor / the label</td></tr>
<tr><td><code>contentInConfig</code></td><td>owner path, element paths, chars, sample</td><td>move the text to the Markdown</td></tr>
<tr><td><code>tocGroupSplit</code></td><td>group head, page</td><td>shorten the group, change levels</td></tr>
</table>

Each proposal is data (`{ kind, path, value }`) so the Sandbox can offer it as a one-click,
confirmed config change (U8). What P5 built is in §5.11.

### 5.8 What P4 built (#855)

Recorded where the implementation settles a point the sections above leave open, or departs from them.

- **Stories.** Before layout, `composed/wrap.ts` regroups a page's content into one frameless box
  (`:::callout` of the synthetic style `__postext-frame`) per *story*: the content of a frame and of
  the frames its chain continues into (`next`, or `overflow.continueIn: '#frame'`, read the same),
  in chain order, each frame's pieces in Markdown order. The box typesetter (`pipeline/callouts/frameLayout.ts`,
  factored out of `placeDocumentPass` with no change for callouts) sets a story at each frame's width
  and cuts it at its height (`CalloutCut`); a later frame of the chain re-breaks the cut paragraph at
  its own width. The regrouping reads the template without a side's variant (takes, flow frame,
  chains, `columns`); a frame only a variant has keeps a story of its own, and on a side whose
  variant lacks it that story is set in the flow after the page.
- **Reading order.** Stories follow each other in the order of their first block, which is the
  `contentIndex` order: a frame is read whole, in the order its content first appears in the
  Markdown (flow text written after a box is read with the flow frame, before the box). Tagged PDF
  keeps this order whatever the layers paint (`readFloat` takes a read index).
- **Geometry** (`composed/geometry.ts`). A frame with no grid cell and no placement starts at the
  area's top-left, as wide as the area; its height follows its rule (`'auto'`, the default: the
  content's height; `'fill'`: the area's). An `'auto'` height never runs past the edge of the area
  (or trim, bleed) the frame grows towards; what does not fit there overflows the frame. A nine-point
  edge on another frame (`top-right` of `#dinero`) reads that point of its box. `'auto'` width reads
  as `'fill'` (the picture-width rule is left to P14). A group with no box of its own is the union of
  its frames' boxes; its frames keep their own placement until P14 negotiates them.
- **Order of work.** Frames are placed and filled in dependency order (anchors, then the frame a
  chain comes from), frames that push text as early as their anchors allow. When any frame pushes,
  the page is composed twice: the second run starts with every pushing frame's box from the first,
  so a box runs round a photo anchored to it.
- **Content no frame takes** (no flow frame) and stories whose frame is missing are set in the flow
  on the page after the composed page, never dropped. A `::resource` a story holds is set in its
  frame and does not float; a `:ref` in a frame to a picture set elsewhere floats from the page's end.
- **Decoration and running heads** are laid in `buildHeadersAndFooters`, on the sheet, after the
  frames: decoration elements may anchor to `'#frame'` (`DesignFrames.named`), text placeholders use
  the `'composed'` context kind, and `{attr.x}` reads the page fence's attributes before the chapter
  heading's (also in the running heads of that page). The decoration is `VDTComposedPage.decoration`,
  painted at layer 0.
- **VDT.** `VDTComposedPage` also carries `role`, `attrs`, `attrSources` (absolute) and `configPath`.
  A chained frame's box is the head's id plus `-cont-<n>` so tagged PDF and reflowable EPUB join the
  pieces; `VDTFrame.id` stays `cp<fence>:<name>`.
- **Overflow.** A frame that cannot hold its content and has no next frame lays it whole, draws its
  box at the frame's height, and records `overflowPx`; backends clip it to the frame. `frameOverflow`
  carries template, frame, fence index, overflow mm and the frame's config path (P5 adds the steps
  tried and the proposals); the page log gets an `overflow` event.
- **Not applied yet:** the template's `bodyStyle` and `palette`, a frame's `writingMode` and
  `direction`, `fit`, group negotiation with `grow`/`shrink`/`priority`/`pin` (P14, §5.9), `spread` (P7, §5.10),
  continuation to other pages (P15), labels (P6). A `exclude: 'push'` frame turned by `rotate` pushes
  with its turned box's bounds.

### 5.9 What P14 built (#856)

- **Declared and final boxes.** Each frame is placed twice in the same pass: as the template
  declares it (fixed sizes; an `'auto'` height at its `minHeight` when it has one, else at its
  content's height; anchors read declared boxes) and as its content needs. `VDTFrame.declaredRect`
  keeps the first when it differs. The reflow log is the difference between the two, so a page whose
  text fits the template's drawing logs nothing, and the same text gives the same log in any book.
  A frame with an `'auto'` height and no `minHeight` declares no height of its own: it never "grows",
  and the frames that follow it do not "move", whatever it holds. Templates drawn from a page give
  their boxes the drawn height as `minHeight`.
- **Order of work** (`composed/groups.ts`, `composedOrder`). A group is one step: after everything
  its frames and its own box anchor to, before anything anchored to the group or to one of its
  frames; its frames are filled in group order (a chain inside a group is measured with what its
  frame holds when the group is solved, so a later link of the chain measures empty).
- **A group with no box of its own** is elastic: a stack starts where its first frame's own
  placement puts it (members' own `y` is ignored, their `x` and width kept) and runs down as far as
  its frames need, to the foot of the template's area; only there do `shrink` frames yield. A row
  starts at its first frame, keeps its frames' widths and grows as tall as the tallest needs.
  Spare space, `grow` and `align` apply only to a group with its own box (`placement` or `grid`);
  a frame of such a group with no placement of its own takes the group's box as its area.
- **Stack.** Heights: fixed, or the content's (`'auto'`), clamped to min/max; `'fill'` asks for its
  `minHeight` and grows (weight `max(grow, 1)`). Too tall: frames with `shrink > 0` give space back,
  lowest `priority` first; frames of one priority yield **in proportion to `shrink`** (the number
  is a weight, not only a flag; §5.3's "later frame first" is not used), down to `minHeight`. When
  nothing more yields, no frame runs past the group's foot: its content overflows (`frameOverflow`,
  the ladder of P5). Spare space goes to `grow` frames in proportion, up to `maxHeight`, else to
  `align`.
- **Row.** Frames take their declared widths and the row's height (a fixed height keeps its own).
  A frame whose content runs past the row's height takes width from the spare space first, then
  from `shrink` siblings, lowest priority first, each down to the narrowest whole-millimetre width
  at which its own content still fits; the width a frame takes is the fewest whole millimetres that
  make it fit, found by bisection; when even all the room would not make it fit it takes none. Rows
  run left to right in every writing direction (right-to-left rows: later).
- **Pins.** A pinned frame takes its declared box (anchored to declared boxes) whatever its anchor
  or its group does. In a group, pinned frames and pinned frames outside the group whose box meets
  a frame across are obstacles: a stack sets the next frame past the pinned frame's band, a row past
  its column, `gap` kept on both sides; spare space then stays at the foot (no `align`).
- **Decoration.** Elements anchored to `'#frame'` move with the frame's final box (P4 already laid
  decoration after the frames); `pin: true` on a decoration element (new on design elements, read
  only by composed pages) anchors it to the frame's declared box (`DesignFrames.declared`).
- **Log.** `ReflowEvent` gains `axis: 'x'` for widths and moves across; `grew` / `resized` carry
  heights (or widths) in mm, `moved` the top (or left) edge in mm from the sheet's edge; the change
  is rounded once to 0.1 mm and events under 0.5 mm are not logged. `cause` is the nearest frame
  whose size changed among what the frame anchors to and the frames before it in its group, through
  frames that only moved. Events follow template order, each frame's size before its moves, its
  `overflow` last. Decoration moves are not logged (they follow their frame).
- **Surfaces.** `composedReflowLog(doc)` (per composed page: page index and label, template, fence,
  events, and `lines` in English from `describeReflowEvent`) is the data API for the Sandbox reflow
  panel (U8, #868); `postext check` prints one `reflow` line per page that has events and writes
  the entries under `reflow` in `--json`.
- **Confinement and determinism.** Nothing of a composed page's negotiation reads another page:
  boxes, logs and pages after it are unchanged by an edit on it as long as its content stays on it.
  Fixed iteration order, whole-millimetre widths and memoised measures give the same VDT for the same
  input.

### 5.10 Spreads (#861)

- **Where.** `placeComposedPage` (build.ts) resolves the template once as a sheet
  (`resolvePageTemplate(…, { spread: true })`); a `spread` template takes `breakToEvenPage`, the
  verso and the recto after it (one empty column each), as `placeComicSpread` does, and
  `layoutComposedSpread` (`composed/spread.ts`) lays it. The template decides; the fence's flag
  only feeds `spreadMismatch` (source check in `slotChecks.ts`, `spread` read through `extends`).
- **Sheet.** One `layoutComposedPage` run on spread coordinates: the first page's frame, the
  second's set `shift` (= the trim's width) along so the trims meet at the spine. The first page is
  the flow's left: the left page, or the right one on a mirrored (right-to-left) flow, whose frames
  are in flow coordinates; a right-bound left-to-right book starts the sheet on its left page, the
  recto. `content` is the union of both content areas (inner margins inside); `trim`/`bleed` run
  outer edge to outer edge, no bleed at the spine.
- **Gutter.** `ComposedPageInput.fitBox` (one hook in composedLayout.ts, `placeFitted`) gives
  `keepOffGutter`. It fits a frame's declared box and its final box alike (the band is the
  template's, not a reflow, so P14's log does not report it as one), and a group member's own box
  before the group negotiates (§5.9), so a stack on a spread lays its frames off the band;
  a frame without `crossGutter` that meets the band is cut at the band's edge (it reached across) or
  moved out whole (its inner edge was inside), on its centre's side (ties: the first page); an
  `'auto'` height is re-measured at the new width; the log gets `resized`/`moved` with cause
  `'gutter'`. A 0 gutter still keeps frames off the spine line.
- **Cut.** A frame goes to the page holding its bounds; a crossing frame is read on the page of its
  centre (ties: first page). The facing page gets a frame record with the same id, empty
  `blockIds` and `facingBlocks`: deep copies moved by `-shift`/`0`, ids `<id>-facing`, in no
  `page.floats` and no `doc.blocks`, so reflowable output, search, selection and source maps meet
  the text once. Blocks of frames on the second page are cloned before they are moved.
- **Paint.** `VDTComposedPage.sheetClip` (the page's bleed box) clips all of a spread page's frames
  and decoration (canvas, HTML `pt-sheet-clip`, PDF `re W n`); `composedPaintOrder` yields
  `facing: true` items, which the PDF tags as Layout artifacts and the HTML (written in reading order,
  §8) marks `aria-hidden`/`data-facing` and leaves out of the patchable blocks. Fixed EPUB adds `rendition:spread-both` to both pages; the
  page-spread side follows parity as before.
- **Decoration** is laid once (headerFooter.ts, on the first page of the pair met) over the
  physical sheet (left page at 0), `#frame` anchors read the frames' physical boxes
  (`flowRectToPage`, which also fixes `#frame` decoration on single right-to-left pages), then
  `splitSpreadDecoration` keeps the blocks that reach each page's bleed box, moved onto its sheet.
- **Vertical pages (#926):** the sheet is laid in the pages' flow frame, as single vertical
  composed pages are; the second page follows the first along the flow's y (`SpreadAxis` `'y'`:
  `spreadSheet`, `keepOffGutter` and `layoutComposedSpread` transpose), the physically right page
  first; trim and bleed are the flow frame's (`designFramesOn`). The decoration stays physical; its
  clip is the page's `sheetClip` mapped to the sheet (`composedSheetClipOnSheet`).
- **Not done:** frames with their own `writingMode` (a horizontal card on a vertical spread);
  per-side `mirrored` for frames' outer-corner icons (the first page's is used); running-head
  placeholders in a spread's decoration read the first page met.

### 5.11 What P5 built (#858)

- **Where the ladder runs.** In `layoutComposedPage` (`pipeline/composedPages/composedLayout.ts`), around one
  laying out of the whole page (`composePage`, P4's and P14's work unchanged): a step is a *fit
  state* (frame patches, text scale per story, picture scale per story, groups that redistribute)
  and the page is composed again with it; compositions are memoised by state. Frames that overflow
  climb the ladder one by one in template order, each step adopted on top of the ones before it
  (a step that does not make the frame fit stays at its limit: less is cut), stopping at the first
  that makes it fit. A budget of 96 compositions per page bounds the work. Same input, same VDT;
  nothing reads another page.
- **Steps as built.** `free`: P14 already lets an `'auto'` height take the room its area and group
  leave, so the step adds only that a frame with a fixed `height` and a higher `maxHeight` grows up
  to it (patched to `'auto'` with its height as `minHeight`). `push`: part of every composition
  (groups move and yield, anchored frames follow); reported when the frame is in a group with
  others or something anchors to it. `scaleImages`: bitmaps, SVGs and video posters of the stories
  of the frame and of its group's frames are set at a share of their width
  (`CalloutLayoutInput.pictureScale` → `figureMaxBodyWidth`), largest 2.5 % step that fits down to
  `fit.imageMinScale`, found by checking the minimum and then bisecting; floats do not exist
  inside frames (P4 sets a frame's pictures inline), so "re-place floats" is the text after a
  picture moving up. `redistribute`: in the frame's group every unpinned frame yields (`shrink`
  read as 1 when 0) down to `max(minHeight, its content's need)`, never above its height; in a
  row they give width as in P14 (each down to the narrowest width its own text fits). `shrinkText`:
  only for a frame whose story sets text; the whole story (all frames of a chain) at one scale.
  `continue`: reported for `overflow.continueIn: 'next-page' | 'template:…'`; #859 lays it out.
- **Text scale is geometric.** A scaled frame's story is laid out at `width / scale` and
  `height / scale` and painted scaled by `scale` about the top-left of `rect`: `frameMatrix` now
  composes the scale before the turn, `frameContentRect` is the box in the blocks' own coordinates
  (backends clip to it). Font size, leading and every spacing shrink by exactly the same factor,
  whatever the content (tables, formulas, nested boxes). The frame's chrome keeps its drawn size
  (`keepChromeAt`: padding, border width, radius, stripe and tab dimensions laid out at
  `1 / scale`), so padding that keeps room for photos set over a box stays that room. Blocks of a
  scaled frame are in its laid-out coordinates: anything that reads block boxes directly instead of
  painting through `frameMatrix` (the Sandbox's caret and selection overlay, tagged PDF bounding
  boxes) sees them unscaled, as it sees a rotated frame's upright (follow-up). The source map
  (`sourceAt`, `elementsForSource`, `findElement`) reads them where they are painted: a point goes
  through the inverse of `frameMatrix` and is tested against `frameContentRect`, and the boxes it
  returns inside the frame are scaled back upright (the turn stays in `rotate`).
- **Spreads and the memo.** On a spread the ladder runs on the sheet: the gutter cut (`fitBox`)
  narrows a frame first and the ladder works from that box; a frame of the second page keeps its
  `scale` when it is moved onto its sheet. The gutter events come from the composition the ladder
  settles on (`ComposedPageLayout.fitted`), not from the ones it tried. The page memo keys the
  inputs the ladder reads (the resolved configuration holds the other templates and the locale), so
  a reused page equals a fresh one, scales and proposals' source ranges included.
- **Warning.** `frameOverflow` gains `locale`, `stepsTried`, `scale`, `imageScale`, `proposals`.
  Proposals are data with set-the-pointer semantics (`path` → `value`); a Markdown change carries a
  source range instead (`useTemplate`: the fence's `template` value; `shortenText`: the frame's
  content). Values are tried on the page where the page can tell: `allowShrink` (largest 2.5 % step
  down to 50 %, `also` turns `shrinkText` on), `raiseMax` (height + shortfall, whole mm; offered only
  when it fits), `lowerMin` (a group sibling at its minimum with less content, lowered by the
  shortfall, not below its content; offered when it fits), `useTemplate` (first other template, in
  `pageTemplates` order, with a frame of that name where the content fits as it is; the stories
  keep the page's own regrouping). `continueNextPage` and `shortenText` (lines over × characters of
  a full line) are not tried. `slotUnknown` names the flow frame that takes the content; slot
  warnings already carried page and source range after layout.
- **Log.** `imageScaled` (with `cause` when another frame's ladder set it) and `textScaled`
  events, per frame after its size and moves, before its `overflow`; words to the tenth of a
  percent.
### 5.12 What P11 built (#883)

- **Config.** `ResourcePlacement.wrap: 'contour'` (the picture at the side its `align` names) and
  `FrameConfig.wrap: 'box' | 'contour'` (with `exclude: 'push'`; `ResolvedFrame.wrap` is set only for
  `'contour'`). The shape is `Resource.contour`: `points` (polygon in picture fractions, wins),
  `alpha` (default on for bitmaps), `threshold` (0.5), `margin` (default: the wrap gap / push gap).
- **No pixels at layout time.** The layout knows pictures by size only, so the alpha channel comes
  with the resource as `contour.traced` (`ContourTrace`: up to 256 rows, leftmost/rightmost opaque
  edge per row, the file id and threshold it was traced at; a stale trace is ignored). Hosts trace:
  `traceResourceContour` (synchronous PNG decoding on fflate in every host, the browser decoder for
  other formats), `readBundle` (`traceBundleContours`, every bitmap when a frame wraps by contour),
  the Sandbox (`useContourTraces`, from the blob store). Bundles never store the trace.
- **Engine.** `contour/index.ts`: rows from polygon or trace (`contourRowsOf`), mapped to page px
  through `bodySource` (safe-area crop) and `bodyRect` (scale), turned on mirrored pages
  (`contourOnPage` → `VDTExclusionContour {spans, margin, quantum?}`), and per-line insets
  (`contourInsetSteps`: the extent of the spans within the margin of each line's band; a line clear
  of the shape gets none; CJK grid rounds to whole characters). The flow keeps its rectangular
  `VDTExclusion` (band, settling, epub) and adds `contour`; `wrapInsetSteps` reads it. Frames: the
  pushing frame's shape is `composed/contour.ts` `frameContour` over its laid children (pictures by
  shape, everything else by box); `exclusionsFor` passes it to `calloutLayout.exclusionInsets`,
  which keeps its side choice (the wider side free) and sets each line by the shape. With the
  reflow ladder (§5.11) the shape is the pictures as scaled (`fit.imageMinScale`), and a frame laid
  out at a text scale maps its shape to the page by that scale (`scaleContourAbout`, as
  `frameMatrix`), and the exclusions it receives back into its laid-out coordinates. The page memo
  (§6, #857) keys the pictures' resources whole, so `contour` and its trace are in the key. Two shapes on
  either side inset both sides; text on both sides of a shape in the middle of a measure (split
  lines) is not done.
- **Fallback.** A contour wrap with no known shape runs round the box with a `textWrap` warning,
  reason `noContour` (once per resource per pass). Without contours the VDT is unchanged (preset
  parity harness, 583 chapters, 0 diffs).
- **Where.** The ladder's step 6 (`layoutComposedPage`): a frame whose `overflow.continueIn` is
  `'next-page'` or `'template:<id>'` (`continuesOffPage`) and that still overflows after
  `shrinkText` is composed again with the frame in `FitState.goOn`: it is cut at its foot with
  `splitCalloutFragment` (as a `next` chain is), its story's text scale and the picture scale its
  own ladder set are dropped (the rest goes on, so shrinking gains nothing), and the cut
  (`CalloutCut`, the pieces laid and the head's block id) is handed back as
  `ComposedPageLayout.continuations`. No `frameOverflow` for it. `build.ts` (`placeComposedPage`)
  adds the pages: generation after generation, one page per target template (`continuationTarget`:
  `template:<id>`, else the page's `overflowTemplate`, else the same template *collapsed*), each a
  fresh page after the last one laid (a spread target opens on the next verso, `breakToEvenPage`),
  laid with `layoutComposedPage` and `ComposedPageInput.continuing` (no memo).
- **Receivers** (`composed/continuation.ts`, `assignReceivers`): the frame of the same name, else
  the flow frame, else the first frame free; a story threaded through a chain (the sending frame
  has a frame before it, `ComposedContinuation.head`) goes on where its chain starts: the frame of
  the chain head's name, else the flow frame, else the sending frame's name (#919), so a body
  template of three threaded columns that goes on into itself fills all three on every added page; a continuation that finds none waits for another page
  of the same target. A receiver starts its chain on the added page (`chainPrev` ignores links into
  it) and its story starts at the cut. `continuationTemplate` patches the added page's template:
  the last frame of each receiver's chain goes on with the rule that brought the content unless it
  sends content off the page itself; with `collapse` (the template laid again), every other frame is
  `'auto'` with no min/max and leaves its groups, so it takes no room; on the last generation
  (`MAX_CONTINUATION_PAGES`, 16) nothing goes on and a remaining overflow is reported as
  `frameContinuationLimit` instead of `frameOverflow`. A receiver that takes none of its content
  (the cut does not move) does not go on: the step is reverted and `frameOverflow` lists `continue`.
- **What the pages keep (#912).** A frame cut for another page gives its group's room first
  (it yields down to its minimum before any other frame), so the frames after it keep their size.
  Empty frames right after it in its stack (no story, not pinned: an answer space under an
  activity box, `trailingFrames`) go with the rest when it lands on the same template laid again:
  on the sending page they take no room, and on the added page they keep their size after the
  frame that takes the content (`ComposedContinuation.trailing`). A frame that takes no room is
  `VDTFrame.collapsed`, and decoration anchored to it (directly or through other elements) is not
  drawn. On a template laid again, a group whose first frame collapses starts its remaining frames
  where that frame was placed (`collapseFrames`), so the rest of a box does not land on the
  page's kicker. A frame none of whose content fits draws nothing and takes no room (it is laid with
  no height): the whole box goes on (its tab with it), never a tab and a mark over an empty piece.
  The empty frames go with the rest only when there is a rest: a frame that holds all its content
  once they leave keeps them after it, unless they then cannot keep their size under it, in which
  case the whole box goes on with them. A frame that can go on and squeezes the frames after it in
  its stack below their declared size (the stack reached the foot and its last frames were cut) is
  treated by the ladder as content that does not fit (`squeezes`).
- **Marks.** The frame cut for another page is laid in its style with `continuesMarkerEnabled` (the
  callout layouter's marker under a fragment that goes on): `overflow.mark` string, `false` (none),
  unset = the style's `continuesMarker`, resolved from `defaultTableContinuationStrings(locale)`
  (10 site locales and more). Same-page `next` chains carry none. The start of a continuation has
  no mark of its own: it is a `continuation` fragment (no tab, no title), and a style with
  `repeatTitle` repeats its title with `continuedSuffix`, which is the "continued from" mark.
- **VDT and ids.** Added pages are ordinary pages (`role: 'composed'`, numbered, running heads and
  decoration of their template and side, `{attr.x}` of the fence) with
  `VDTComposedPage.continuationOf` = the fence's own page. Frames there are `cp<n>:<name>~<k>` (k =
  generation); a receiver is named by the slot that first sent the content (`cp0:dinero~2`). Blocks
  go on as `<headBlockId>-cont-<pieces>` with the story's container id. The sending frame gets
  `continuesTo`, the receiver `continuedFrom`, and the sending page's log a `continued` event with
  `toPage` and `toFrame` (`composedReflowLog` words it with the page's printed number).
- **Memo.** A page with continuations is never kept (`layoutComposedPageMemo`), so it and its
  added pages are always laid together, fresh.
- **Reflowable / tagged.** The EPUB walk opens no section for a page with `continuationOf`: its
  blocks go on in the open stories (by container id), so the box is one frame and a cut paragraph
  one paragraph with the page break inside. Tagged PDF already joins by container id (one `Div`).

### 5.13 What the findings round E1 built (#912, #913, #917, #919, #920)

- **Ladder order (#920).** `fit.preferContinue` (default true): for a frame that can go on to
  another page the ladder runs free, push, redistribute, continue, then scaleImages and shrinkText
  (§5.4). The Sandbox template editor has the toggle.
- **Receivers (#919).** `ComposedContinuation.head`: a threaded story goes on where its chain
  starts (§5.12).
- **Cuts (#913).** `frameCutRules` in `splitCalloutFragment` for frames (§5.6).
- **What the pages keep (#912).** Yield-first, `trailingFrames`, `collapseFrames`,
  `VDTFrame.collapsed`, whole-box moves (§5.12).
- **Jumps (#917).** `continueInPage` / `resolveContinueIn` (`templates.ts`) read the target;
  `continuesOffPage` counts it, so it is the ladder's continue step. `build.ts`
  (`placeComposedPage`): `fenceById` maps the chapter's planned fences by their `id`; `route` keeps
  a jumping continuation in `jumps` until that fence is placed, or, when no fence of that id comes
  after the sending page, raises `continueTargetMissing` (WARNING_SINCE 1.37.0; `before` when the
  fence is earlier) and sends it on as `'next-page'`. The receiving fence is laid with its own
  stories plus the jumping ones (`assignJumpReceivers`: the frame `#<frame>` names, else the frame
  of the sending chain head's name, else the first frame its own content leaves empty) and
  `ComposedContinuationInput.jump`: its frames keep the fence's ids (`cp<n>:<name>`, no `~k`), the
  receiving chain's end goes on as `'next-page'` (pages added after it, numbered from it), and a
  story that finds no free frame goes on there too. Such a page is never memoised. The sending
  frame gets `continuesTo`, its page's log a `continued` event with the jump page; the EPUB walk
  and tagged PDF already join the pieces by container id.
- **Page numbers in marks (#917, #925, #915).** `overflow.mark` may hold `{page}` (the page the
  rest goes on on), and `overflow.fromMark` (new; the receiving frame's, else the sending frame's)
  sets words at the head of the first piece a frame lays of a story that came from another page,
  `{page}` being the page it comes from (`CalloutLayoutInput.continuedMark`, laid as the
  continuation marker is, pagination furniture). Both are laid out with a guessed number of the
  right width and tagged `VDTDesignTextBlock.pageMark`; once the pages are numbered `fillPageMarks`
  (`build.ts`) writes the printed label of the page `continuesTo` / `continuedFrom` points to and
  measures the lines again, keeping their alignment.

### 5.14 Findings round E2 (#882)
- **Empty frames in stacks (#911).** When the tiers have nothing more to give, a stack cuts its
  frames from the foot up, each down to `GroupItem.floor` (its `minHeight`; a fixed height without
  one keeps it), before any frame is clamped at the foot. A frame left below that least height
  overflows by the cut (`boxShort` → `VDTFrame.overflowPx`), content or none, and climbs the ladder
  and warns. Proposals skip empty frames for `lowerMin`, and give an empty frame its own `lowerMin`
  instead of `raiseMax`/`continueNextPage`.
- **Elastic rows (#927).** `rowH` is the tallest height the cards write (fixed, else `minHeight`);
  the content's only when none writes one. Widths are negotiated there, then the row grows.
- **Ruled frames (#914).** `composed/rules.ts`: rules on the box's `designOverlay` (laid-out
  coordinates, lengths over the text scale); an empty frame keeps them on `VDTFrame.rules` and the
  decoration step adds them (mapped through the flow, turned on vertical pages).
- **Drop caps in frames (#922).** A story box (`FRAME_ATTR`) is not a box for `placesOf`; the box
  typesetter stamps `VDTBlock.dropCap` and `offsetBlock` moves it.

### 5.15 Findings round G (#882)
- **Drop caps in frame chains (#947).** `splitCalloutFragment` ranks a cut before a drop cap's
  sink line (`VDTBlock.dropCap.sink` on the piece that holds the initial) last, after the soft cuts
  of wrapped code: the paragraph moves on whole as in the flow, and is cut there only when no other
  cut fits. `dropCapWarnings` reports such a piece (`split`) from the laid-out document, since a
  box's trial cuts leave no notes. `wrapComposedPages` stamps the flow story's box with
  `__capHeading` (the heading's `sourceStart`) when its first block is a paragraph that followed,
  in the Markdown, a heading a `takes` frame took; `headingBefore` (`dropCap.ts`) reads it, so that
  paragraph takes the level's drop cap.
- **`useTemplate` regroups (#937).** `fitsWithTemplate` lays the page with the other template as
  the build would: `regroupStories` keeps a story whose head names a frame of it, sends one a
  `takes` frame took to its frame that takes the same level, and the rest to its flow frame after
  its own content (merged boxes appended past the pass's content blocks, a derived
  `FrameLayoutPass` whose `measureCtxFor` reads the first story's index), then runs
  `layoutComposedPage` with its ladder. Proposed only when no frame overflows, every story is laid
  and nothing continues; never on a page continuation added.
- **Trial passes and the measurement memo (#953).** `trialPass` (`composedLayout.ts`) builds the
  pass a trial lays: appended story blocks copy the page's (`originOf`), and everything keyed by
  content index follows the copy: `paragraphContainers.byBlock` (`:::paragraphs` groups), heading
  prefixes and numbers, list metrics, the `contentBlocks` the drop cap and indent rules read, comic
  strips and heading designs; each story's box takes the measure context of the story it replaces
  and the trial keeps its own `dropCapNotes` / `joiningLetterSpacing`. `layoutComposedPage` gives
  every run a `MeasureMemo` (`pipeline/composedPages/measureMemo.ts`) on its pass: `layoutCallout` asks it before
  `measureContentBlock` for a child at a width (key: context, style `body`/`lists`, block, width,
  paragraph-group style, writing mode and language state), replays the drop cap note and the
  joining-script mark of the first measure, and never keeps a figure or table. Dropped with the
  run, since `leftFlow` and the numbers are fixed only for it.
- **Box styles based on another (#905).** `CalloutStyleConfig.extends` (`defaults/calloutStyles.ts`:
  `inheritCalloutStyles` before resolving, objects merged key by key, colours and lengths whole,
  `id`/`name` never; `calloutStyleChain`; warnings `calloutStyleExtendsUnknown` /
  `calloutStyleExtendsCycle`, WARNING_SINCE 1.39.0). The frame-style library (§2.4) merging on the
  look keeps a style whose `:::callout` boxes stand elsewhere as a thin style (`extends` + its
  position fields, `placesToKeep`), so a book ends with one style per kind of box and no box moves.
- **Jump targets in the editor (#943).** The Sandbox template editor lists the book's page fences
  with an `id` as `page:<id>` targets and takes a typed `page:` value. Jumps across chapter files
  are not laid out (SP followup 943-rest: forward ids, carried story Markdown, chapter-qualified
  source map, numbering, book-level marks).

- **Sheet points on flow pages (#929).** A composed page's frames are laid in the page's flow
  frame (mirrored on a right-to-left page, turned on a vertical one); its decoration stands on the
  sheet. `sourceAt` takes sheet points and maps them with `pageToFlow` for the frames (the spread
  clip `sheetClip` read in the flow, the decoration's with `composedSheetClipOnSheet`). Every
  element whose `rect` is in the flow frame carries `flow: true` (`sourceAt`, `elementsForSource`,
  `findElement`; flow text of a vertical or right-to-left page too); `flowRectToPage` puts it on
  the sheet. Sandbox: `frameHit.ts` `sheetToFlow` / `flowBoxOnSheet`; the frame tools, the Design
  mode marks, the picked mark (flow matrix after the frame's turn), the selection's relocation
  and the template editor (pointer read in the flow, marks drawn through the flow's matrix) use
  them. The Cookbook's C40 probe clicks flagged boxes on the sheet.
- **Start and end edges (#936).** `AnchorEdge` gains `top-start`, `start`, `bottom-start`,
  `top-end`, `end`, `bottom-end`, `align-start`, `align-end` (`design/logicalEdges.ts`:
  `physicalEdge`, `physicalPlacement`). `LayoutContext.startRight` (set for slots laid on the
  sheet of a right-to-left or vertical page: running heads and a template's decoration, through
  `sheetExtras`) reads the start on the right and reverses the offset's `x`; frames (`anchorOn`),
  fixed boxes (`anchorBox`) and heading designs are laid in the flow, where the start is the left.
  So one decoration element follows the frames to the right of an Arabic page. Sandbox: the slot
  editor's Alignment list has Start / End and its edge lists the start and end sides.
- **Cover in vertical flows (#946).** `layoutImageElement` crops an upright picture (`DesignFrames.upright`)
  in its own upright frame (the box `boxH` × `boxW`) and maps the visible part back into the flow; the
  primitive keeps `upright` and `crop`. Canvas (`drawUprightInBox` + clip), HTML (the turned `<img>` at its
  uncropped size in an `overflow:hidden` box) and PDF (clip inside the quarter turn) paint it; preflight
  reads an upright picture's printed width as its box's height. Sandbox: the image editor's Focus point
  (`focusPoint.ts`: a click or the arrow keys; the window the crop keeps outlined, `comicArtCrop`).
- **Frames in their own writing mode and direction (#944).** `direction`: `wrapComposedPages` stamps the
  chain head's direction on the story box and on every block of the story that no `{dir}` of its own (or of a
  box round it) sets, so the box typesetter sets it against the page as a `{dir}` box. `writingMode` other
  than the page's flow (`composedLayout.ts` `ownMode`): the frame's box as placed is
  turned a quarter turn about its centre (`quarterTurnedRect`) and the story laid out in it under
  `withMeasureWritingMode`; `VDTFrame.writingMode`, `rotate` ± 90 on top of the frame's own
  (`frameModeTurn`), `rect` the turned box (`framePageRect` turns it back: decoration anchors, the template
  editor). An `'auto'` height is the least whose lines fit the box's width across (`turnedNaturalOf`,
  bisection to a px). Pushing frames do not wrap its text; empty frames' rules turn with it.
  `stampCentralBaselines` stamps `centralBaselines` / `dashAdvances` on a vertical frame. Canvas
  (`setVerticalPaint` per frame), PDF (`ctx.vertical` per frame, fonts collected with the frame's mode) and
  HTML (`vertical` paint options per frame) paint its text as a page of that mode does; the source map and
  the Sandbox's clicks read it through `frameMatrix`. (Round H, #960: see below.)
- **Comic text panels (#909).** On a vertical or right-to-left page a text panel is set in its frame
  (`comicTextPanelsSupported` is true for every document): `layoutComicTextFrames` maps the text area
  into the page's flow frame (`pageRectToFlow`), where the story is laid (set vertically on a vertical
  page); the comic's frame record stays on the sheet, and `comicFramePaintOrder` hands the backends the
  frame mapped into the flow (rect, polygon), painted inside the flow transform (canvas, PDF; the HTML
  writes it in a `pt-flow` box over its panel). `sourceAt` and the Sandbox's comic tools read its words
  through `pageToFlow`. A frameless text set from the top in a slanted cell takes the whole cell, each
  line set short by `slantExclusions` (contour exclusions per 2 px band, `edge` off the outline,
  `ComposedPageInput.frameExclusions`); with a box or `valign` middle/bottom it keeps `innerBox`.
  `::panel{text shrink}` lowers the frame's `fit.minScale` (`shrinkScale`: 0.5, or the value given,
  0.25–1). Tagged PDF: `comicStructure` makes a `Div` in the comic's `Div` at the text panel's place
  (`ComicTags.texts`); `StructureFlow.readInto` moves the frame's elements into it.
### 5.16 Findings round H (#882)

- **Comic text panels on strips and spreads, valign in slanted cells (#959).** Strips: the stories are done
  for the main loop from the start (`composedLaid`), and `placeStripTexts` lays them at the end of the pass
  (after `centrePageText`), where each strip block stands: `layoutStripTextFrames` moves the block's comic
  onto the sheet (`flowRectToPage` + `translateComicPage`, the panel sources copied with
  `copyComicPanelSources`), runs `layoutComicTextFrames` there, and writes the frames' results (`blockIds`,
  `overflowPx`, `scale`, warnings) back on the block's comic, whose `frames` array is replaced
  (`comicBlockOnSheet`'s memo checks it). A page-wide strip set where it stands is boxed by
  `wrapPageSpanEmbeds`, so `planComicTextPanels` hops the box's closing marker. Spreads: each half lays
  the text panels that have most of their width on it (`only`), off the 8 mm about the spine
  (`comicSpreadGutter` → `avoid`, a rectangular exclusion). Painting: `comicFramePaintOrder(page, comic)`
  and `composedFrameBlockIds` read the strips too; canvas and PDF paint a strip's panels, the flow
  frame's text frames, then its lettering in the strip loop after the flow (`comicHoldsText`); the HTML
  keys the over-panel markup by comic. `comicTextAncestors` and `sourceAt` answer for a strip's words
  before the strip block. Slanted cells: text set to the middle or the foot is laid with the slant moved
  by the room the alignment leaves above it (bisection on that shift, at most ten layouts, a layout kept
  only when every line lies inside the outline and none is empty); not settled → `innerBox`. Frames
  of a half are found by the panel's `index` (`comicPanelOfFrame`), not its place in `panels`.
- **Vertical frame on a right-to-left page (#960).** `ownMode` no longer excludes a mirrored page. The frame is
  laid out as on a left-to-right page (`mirroredIn(frame)` is false for its lines) and `VDTFrame.unmirrorX`
  holds the flow's mirror origin: `frameMatrix` then returns `mirror · matrix-of-the-box-mirrored-to-the-sheet ·
  move`, which, inside the page's mirrored flow, is a plain placement of the frame at the box the page shows
  (its first line at that box's right edge, running down). The backends paint such a frame without the flow's
  counter-flip (canvas `withoutMirroredPaint`, PDF `ctx.mirror` off for the frame, HTML class `pt-unmirrored` whose
  rules cancel `.pt-flow-mirrored`'s `scaleX(-1)` on runs and pictures); `orientLinesToFrames` leaves its blocks
  alone. Hit tests and the source map go through `frameMatrix` and need no change.
- **Pictures in a vertical frame of a horizontal page (#960).** The callout layouter takes `uprightMaxLength` (the
  frame's extent across its lines less padding, `uprightIn` in `composedLayout.ts`) and lays each resource child
  out upright (`ResourceLayoutInput.upright`, as a vertical page's flow does): counter-rotated against the frame's
  quarter turn, at most what is left of the box along the stacking axis (`uprightMaxLength` less the cursor and the
  gaps); `offsetResourceBlock` moves a rotated block's frame origin. A horizontal card on a vertical page already
  stands upright (the frame's −90° cancels the flow's turn); a frame in the page's own mode is unchanged. Pictures
  in the frames of a vertical page's own mode still turn with the flow (not touched).
- **Reflowable EPUB.** A frame with its own writing mode is a `div.pt-frame-vertical` / `pt-frame-horizontal` with
  `writing-mode` in the stylesheet and the length its lines run along (the page box's height or width) in em of
  the body text as `height` / `width` (`CalloutNode.frameMode`).
- **Chains of frames of different modes** work as they are: each piece is cut and laid out in its frame's mode
  (`frameModesChain.test.ts`). `framePageRect` is exported; the Cookbook probe reports the page's box of such a
  frame.

### 5.17 A story that jumps into a page of a later chapter file (#943)

A magazine kept as one chapter file per article jumps with `overflow.continueIn: 'page:<id>'` into the page
fence of a later file. One `buildDocument` call is one chapter, so the rest of the story crosses the call.

- **Forward ids.** `PostextContent.laterPageIds` (`id → chapter position`) comes from the host (`pageFenceIds`,
  `laterPageIdsOf`: the ids of the page fences whose template exists, of the chapters after each chapter). `route`
  (`build.ts`) sends a `page:<id>` that no fence of the chapter answers but `laterPageIds` has to
  `VDTDocument.pendingJumps` instead of `continueTargetMissing` and adds no `'next-page'` pages; the sending
  frame gets `continuesToChapter` and a `continued` event with `toChapter`. A host that passes nothing keeps
  every `page:<id>` inside the chapter, as before.
- **Carrying.** A `StoryJump` (`composed/carry.ts`) holds the story's box and children as the sender had them ready
  to lay (post-transform `ContentBlock`s, offsets of the sender's body), the `CalloutCut`, the continuation's
  fields, the heading numbers by position, the sender's ordered-list indents, the notes the story cites with their
  numbers and definitions, and `outline` when it refers to anchors. The host sets `chapter` (whose file the text is
  in; kept when a chapter hands a story on again) and `fromChapter` (who sent it) and gives it to the chapter with
  the page as `LayoutContinuation.jumps` (`buildBundle`: `incoming`; the Sandbox: the chapter layout record
  `ChapterLayout.jumps`, the planner, the chain and the canvas build from the documents).
- **Receiving.** `importJumps` copies the blocks past the chapter's own (`contentBlocks`), moves every source offset
  so that `offset + bodyOffset` is the offset in the sender's file, gives the containers ids of their own
  (`1_900_000_000+`), renames the notes (`~k~id`) and registers them in the chapter's note maps. `carriedPass`
  answers the lookups the box typesetter keys by content index for them: heading prefixes and numbers from the
  sender, ordered-list metrics and paragraph groups worked out again from the carried blocks alone, the
  context of the text (never a styled section's or a part's). The pre-passes of the chapter (numbering, floats,
  warnings, the main loop) never see them. The continuations wait in `jumps` for their fence exactly as an
  in-chapter jump's do (`assignJumpReceivers`, the page never memoised); the receiving chain goes on as `'next-page'`.
  A story whose page the chapter does not have raises `continueTargetMissing` with `fromChapter` and is not set.
- **Marks.** `resolveJumpMarks(docs)` (after the book is numbered) gives the sending frame `continuesTo`, fills the
  `continued` event's `toPage` / `toFrame` and writes the printed label of the page in the other chapter into the
  `{page}` marks (`pageMark`) of both frames, measuring the lines again as `fillPageMarks` does; idempotent. A
  chapter laid out on its own keeps the guessed number. `buildBundle` runs it; so do the Sandbox's chains.
- **Source.** `VDTBlock.sourceChapter` (and `VDTFrame.sourceChapter`) says whose file the offsets are in; the source
  map's `SourceRef.chapter` / `SourceElement.chapter` and the `chapterFile` / `chapter` / `ownChapter` options
  follow it. `VDTFrame.readIndex` makes a tagged PDF read a carried frame at its page. The reflowable EPUB and the
  HTML reading order read it in the chapter that has the page (its container ids are that chapter's own).
- **Book layout.** `buildBundle` keys a chapter on its `laterPageIds` (only for a chapter with a composed page,
  in a book whose templates name a `page:` target) and on the jumps it receives (they are in its continuation);
  `ChapterRecord.jumps` keeps what a chapter sent past a dropped document. The Sandbox planner adds `|j<hash>` /
  `|l<hash>` to the continuation key under the same conditions, so keys of other books are what they were.
- **Left out.** The sender's styled section or part typography does not reach the rest. (Index marks, anchors
  and headings written in the rest, and the editor selection over it, were left out here and are built in
  §5.18.)

### 5.18 Findings round I (#882)

- **Frame names by role (#979).** A drafted page names its frames by kind and order, a different box in the next
  template. `template_dedupe.py` renames them after the merge (`name_frames`): the callout style id for a box or a
  tab (the tab a style draws is already in the id, `box-light-blue-tab-white`), `picture`, `figure`,
  `caption-of-<picture>` for a text or box set `below` one, `<role>-in-<parent>` for a frame laid inside another,
  `rotated-text`, the flow `text` and the heading `title`. Content (a tab's `label` words) never enters a name. Names
  are the same in every template that has the role, a second one is numbered from 2, a child keeps the names of
  the template it extends, and a name that is not the positional `kind-N` form is left alone, so the pass is
  idempotent. The anchors, groups and the `slot="…"` of every page fence under `chapters/` follow. The Sandbox
  frame rename (`renameFrame`) now reaches the same family (`frameFamily`: the template that defines the frame and
  everything that extends it, siblings included) and rewrites the fences of every chapter on screen
  (`renameSlotChanges`) and of the other editions of a local project (`renameFrameInEdition`,
  `ProjectActions.renameFrameInEditions`, one `updateProject` transaction). A sample's bundle keeps its other
  editions read-only: only the edition open is renamed.
- **Image budget of a painted book (#985).** C20 stays at 0.9 MB for nine pages (+0.1 MB a page), failing at 1.4 MB.
  A recipe whose pages are paintings states the weight it means to publish in `capture.expect.imageMb` (above 0.9,
  at most 2): silent up to it, a failure past it, an info when it is not needed or 15 % too high; the card files take
  `capture.expect.cardKb` the same way. A budget that counted the painted area was rejected: the bytes of the
  rendered page, not the area, say what it weighs.
- **The contents in a frame (#983, #987).** `FrameConfig.takes` accepts `'toc'` besides `h1`…`h6`: the frame receives the
  rows of the page's `:::toc` that name no slot (`ParsedComposedPage.tocRows`, the directive before the contents are
  expanded, every row and the breaks between parts after; `takenBlocks` answers for both kinds of `takes` in `wrap.ts` and
  `slotChecks.ts`). A `:::toc` inside a `:::frame` needs no `takes`. The rows are children of the frame's story box, so the
  box typesetter lays them with `measureTocBlock` and stamps what the flow stamps (`tocBlockStamps`: `tocEntry` with the
  page it links to, `tocPart`), which was the whole of the defect: `buildHeadersAndFooters` drew the part rows of
  `page.columns` only, so a frame's part rows were empty lines, and the repeats of a block's head row (`toc.groups.continuation`),
  which the flow sets only at the head of a column that a cut block goes on in, were all set, one before every entry. Now
  (a) `placeChild` skips a continuation row unless it is the first row of the fragment, (b) `overlayTocPart` runs for the
  part rows of `page.floats` and of a spread's `facingBlocks` with the frame's page frames, (c) a cut between the rows of one
  block of the contents (`:::toc{keep}`) is offered only after its head (or the repeat of it) and `minEntriesAfterHead`
  entries, and ranks `soft` (taken when no other cut fits) when the whole block is no taller than the room, so a block that a
  frame holds goes whole to the added page, as the flow moves it to the next column; an entry is never cut inside its lines.
  The title of the contents is not listed because its heading style says `toc: false`, as in the flow. A page break between
  parts (`toc.parts.breakBefore`) goes with the rows; a box ignores the `:::pagebreak` row as every directive, and the
  part row carries the break itself since §5.19 (#996). Memoisation: a page with
  contents rows is never memoised (`pageMemo` already says so for any `toc` block).
- **A ground under the contents (#987).** The ground is the template's decoration, which paints under the frames of the
  page and on every page the frame adds; no heading design is asked to paint across the sheet. A design element anchored to
  the bleed that runs down to the trim claims the column (the reserved height of a heading design counts every element
  without `reserve: false`); a document with such a design says so only in the docs: a warning would also fire on every
  cover whose design claims its page on purpose (`headingDesignCuts.ts` makes the same call), so the answer is the note in
  the reserved-height section and the `reserve` rows of the design tables. #997 later told the two apart: an in-column
  heading is named (§5.19), a page-span opener never.
- **Frames held at the foot of a card (#980).** No new key. A stack group with a box of the card's height, `grow: 1` (and
  `shrink`) on the frames above the held ones and a `minHeight` on the held ones is the held foot: spare space goes to the
  frames that grow, so a shorter text moves nothing below it; a longer one is squeezed by the ladder (`redistribute`, then
  `shrinkText`) with the held frames at their `minHeight`, and `frameOverflow` and the reflow log (`textScaled`,
  `overflow`) say what did not fit. A frame anchored to the container's foot instead cannot do this: nothing relates it to
  the frames above it, so the ladder never squeezes them for it and an overlap is not reported. `footHold.test.ts` pins both
  directions.

- **Label styles in the Sandbox (#969).** A Design section, `labelStyles` in the Figures & tables group
  (`LabelStylesSection`, registry id `labelStyles`, counted by `sectionHasOverrides` when the list is not
  empty), modelled on Mark styles: id (renamed on blur, never to a colliding one), name, then three
  sub-sections: type (borrowed paragraph style, face, size, weight, slant, colour, letter case, tracking), halo
  and plate, fit and layout (`minScale`, `writingMode`, `overlap`). No label style is built in, so the list
  starts empty and `Add label style` writes `{ id, name }`. A field left unset shows what it inherits (the
  borrowed paragraph style, else the body text); `fontStyle` and `textTransform` are three-way selects whose
  *Inherited* is "not written", which keeps `resolveLabelLook`'s rule (#955: `'normal'` / `'none'` written turn
  a borrowed style's slant or capitals off). Renaming an id does not rewrite the anchors and labels that name
  it, as for chip and mark styles: the Checks panel flags them (`labelStyleUnknown`) until corrected. The
  config tools needed no change: `labelStyles` was already a section of `sandbox_get_config` /
  `sandbox_set_config`, items named by `[id=…]`, and the "every setting" tests walk it.
- **`overlap: 'allow'` (#977).** `ResourceAnchor.overlap` and `LabelStyle.overlap` (`'check' | 'allow'`,
  default `'check'`). `figureLabelWarnings` passes `overlappingLabels` a flag per label (anchor's value over
  its style's, where the style is the label's own `style` else its anchor's); a pair is skipped when either of
  its labels is allowed, since the overlap is as much the other's as that label's. The label style's value is
  checked (`unknownConfigValue`) and `stripLabelStylesDefaults` drops `'check'`. The anchor editor has a
  Check / Allow control (one anchor and the ticked ones), and the WebMCP marks schema takes the field. What the
  issue asks of the extraction scripts (merge labels of the same text within 0.5 mm into one anchor) is the
  porting skill's: its notes say so.
- **Words per figure (#986): a warning, not a second model.** A resource is the unit of numbering, of `:ref`
  and of the list of figures, so two figures cannot carry different words for one resource without becoming
  two figures. The deliberate answer is the existing one (a second resource for the same file) plus
  `figureWordsShared`, raised by `collectContentWarnings` from `figureWordConflicts` (figureWords.ts): for a
  resource already worded by a figure of the chapter, a later figure whose `alt`, `caption` or `note` differs
  from the first's, or that the first left unsaid (and so is not shown either). A figure that repeats the
  first's words, or gives none, is quiet. The range is the first of the dropped words; the Sandbox files it
  under Figures.
- **Pictures in the frames of a vertical page (#971).** `uprightIn` (`composedLayout.ts`) hands the box
  typesetter `uprightMaxLength` for every frame whose effective mode is vertical: its own `writingMode`, else
  the page's. A frame in the page's own mode on a vertical page lies in the flow frame, which is turned the
  same quarter turn as a vertical frame on a horizontal page, so the same counter-rotation applies with the
  frame's extent across its lines (`laidH`) less padding. `naturalOf` (the height a frame needs, for placement
  and proposals) passes the flow's whole height as the room, since the frame's height is what it settles. A
  horizontal frame on a vertical page is turned against the flow and already stood upright; horizontal pages
  are unchanged. The VDT of a vertical composed page that holds a figure in a frame changes (the picture and
  caption no longer turn with the flow); no public preset or bundle chapter does, parity 0 diffs.
- **The reflow ladder reuses a frame's whole layout (#972).** Each step of the ladder composes the page again,
  and most frames come out of it as they went in. `pass.layoutMemo` (`pipeline/composedPages/layoutMemo.ts`, made with the
  measurement memo in `layoutComposedPage` and dropped with it) answers `makeCalloutLayouter`'s `layoutRange`
  for a range laid out before: key = pass, measure context, story and its end, the box style by content (the
  ladder resolves the style again every composition: two equal styles are one key), the cut, width, frame id,
  continuation, mirroring, the frame's options (`boxHeight`, exclusions, picture scale, marks, upright length)
  and the measuring state (`measureStateKey`, shared with the measurement memo). A caller that moves the
  result (`fill`: `commitFrame` shifts it to the page) gets a private deep copy; the memo keeps a copy made
  before the first caller moved it. A caller that only reads (`peekRange`: the split probes, the natural height
  of a frame) gets the stored layout, which nobody changes. The copy preserves shared structure (units and
  children point at the same blocks) and what the layout keeps by identity, a block's end indent and a
  designed heading (`copyBlockEndIndent`, `copyDesignedBoxHeading`; a new layout-time registry keyed by VDT
  object must add a copier); a layout holding a comic page or an object that is not plain data is never kept.
  The writes a layout makes to the measure context (drop cap notes, joining-script marks) are recorded with the
  entry and replayed on a hit. `layoutMemoSwitch` turns it off for the test that lays a page both ways. Parity
  0 diffs; the heaviest composed chapter of the Cookbook (a magazine of threaded frames) lays out about 45 %
  faster.
- **Marks, anchors and headings written in the rest of a story that went to another chapter (#988).** The
  receiving chapter locates them (`locateCarriedOutline`, called from `withIndexMarks` once the pages are
  final): per carried story, the lines it laid for that story (offsets in the sender's file) answer, an index
  mark, an inline anchor or a heading is its own when a line holds the character or it lies inside the span the
  lines cover (what lies before is the sender's, laid by it). They go on `VDTDocument.carriedOutline`
  (`chapter`, `kind`, `sourceStart` in the sender's body, page), the anchors also as destinations on
  `doc.anchors` (`VDTAnchor.chapter`). The sending chapter's own location leaves out the lines of carried
  blocks (`sourceChapter`, they are another file's offsets), its anchors skip the marks of a sent story that
  none of its lines hold, and `outlineFromDoc` takes the heading blocks of a carried story out of the
  order its entries are matched with (the sent headings are matched by their source). `mergeCarriedOutline`
  puts the pages into the sender's entries by `(chapter, kind, sourceStart)`: `buildBundle` keeps
  `ChapterRecord.carried` (`carriedPlaces`) and merges before it assembles the book outline; the Sandbox
  planner keeps `ChapterLayout.carriedOutline` (and writes it in `layouts.json`) and merges in its
  `bookOutline`. Index, contents and references then read the page of the words. The Sandbox canvas paints the
  selection and the caret of the chapter being edited over the carried words on the later chapter's page
  (`drawOverlay` with `CarriedSelection`).
- **Tracking in a box's body (#974).** `CalloutBodyStyleConfig.letterSpacing` (em of the body size, negative
  tightens; absent when zero) rides on the derived `bodyText` of a box (`deriveCalloutResolvedConfig`), so
  `resolveBodyStyle` gives the body style a `letterSpacingPx` and paragraphs and list items are measured, stamped
  (`VDTBlock.letterSpacing`) and painted as a paragraph style's tracking is (#907). A paragraph in a
  `:::paragraphs` fence keeps its own style's tracking, code listings none. A frame takes it through its callout
  style; a frame's own override of it is the `look` of #976.
- **Removing an inherited decoration element (#975).** `decoration.elements` of a patch may hold
  `{ id, remove: true }` (`DecorationRemoval`): `mergePatch` drops the element of that `id` merged so far, parents
  first and a variant after the chain, as `remove: true` does for frames and groups. A removal naming nothing is
  silent (no warning kind); a new element of the same `id` may follow it. The Sandbox lists the inherited elements
  with a switch each and writes the removal in the scope being edited.
- **`width: 'auto'` on a frame (#982).** `placeBox` takes a `naturalWidth(room)` next to `natural(width)`; an `'auto'`
  width asks it (the grid cell's width, the area's, or the room from the anchor to the area's edge, less
  `maxWidth`) and clamps to `minWidth`/`maxWidth`. `naturalWidthOf` (`composedLayout.ts`) lays the frame's story
  out flush left at eight times the room, so that nothing wraps, and takes the right edge of the longest line
  (a picture by its box) plus what the box keeps to its right (`callout.innerRect`: padding, a right stripe), a
  quarter pixel over, capped at the room: text that does not fit wraps at the cap. The box starts at the edge its
  anchor names (`pinX`), so frames anchored to it follow, and a group member is placed the same way. Not for a
  frame in its own writing mode, nor for a frame with nothing to lay (width 0 up to `minWidth`). The Sandbox
  already offered *Its content* for width.
- **A decoration text over a frame, and the heading's number (#984).** `sourceAt` keeps the paint order (frames of
  layer 0 and up over the decoration) but a frame hit that has nothing of its own at the point (the chain is the
  frame alone: its box, its padding, an empty frame) is held back: a *text* element of the decoration under it
  answers instead (whether its words come from the Markdown, a page attribute or the configuration), and the
  held frame answers when none does. Rules, boxes and pictures of the decoration do not win over a frame. A
  `layer` on decoration elements, to paint them over the frames, was not added: it would make the decoration two
  paint items in every backend (canvas, HTML, PDF, tagged PDF, preflight, contrast, the source map); a frame
  with a negative `layer` already goes under the decoration. `{headingNumber}` and `{headingNumber.<frame>}`
  (`headingNumberPlaceholder`, `design/placeholders.ts`; allowed in the `'composed'` context only, so the running
  heads of other pages do not list them) print the `headingNumber` counter of the first heading block each
  frame holds, in the document's digits; `headerFooter.ts` gathers them while it names the page's frames and
  hands them to the placeholder context. Empty when no frame holds a numbered heading.
- **A picture inside a label tab (#981).** `CalloutLabelConfig.icon.placement` (`'beside'` | `'inside'`): inside, the
  tab is `paddingX + picture + gap + words + paddingX` wide, the picture (fitted into `icon.width` × the tab's
  height) at the tab's start, the words after it, a tab at the right corner growing leftwards; with no picture the
  tab is the plain one. The overlay is the same box, image and text blocks, so no backend changes. The picture
  keeps its colours; a tint from the tab's text colour would need a colour on `VDTDesignImageBlock` and the same
  in canvas, HTML and PDF, and is left (SP followup).
- **A frame's own colours, the page's palette, and the kinds of box (#976).** Decision: one callout style per *shape*,
  the tint elsewhere. Three levers, from the narrowest:
  (1) `FrameConfig.look` (`FrameLook`): colours named and nested as in the callout style (fill, border, stripe,
  icon, marker and its rule, title, body text, the tab's colours and rule) and `body.letterSpacing` (#974's
  frame override). `normalizeFrame` keeps what the engine can use (`LOOK_TREE`: a colour has a `hex`, tracking
  is a length that may be negative), a patch merges it key by key at every level (`mergeLook`), and
  `frameStyleOf` writes it over the resolved style (`styleWithLook`, memoised per style and look, so the `body`
  and `lists` objects a measurement is keyed by keep their identity). A fill colour turns the fill on; tab colours
  apply only to a style that has a tab. `validatePageTemplates` reports unknown keys at any depth. A `look` colour
  with a `paletteId` follows the palette like every colour of the config.
  (2) The template's `palette` and the page fence's `palette="id=#hex"`, which the engine read and ignored:
  `buildHeadersAndFooters` stacks them on the part's and section's overrides for a composed page, so the
  palette-linked colours of its frames (boxes recoloured by value, `partPalette.ts`) and decoration take the
  page's value. One style with a fill linked to a palette entry then serves every tint, each page fence naming
  its own.
  (3) Sandbox library: `styleKinds` groups a style with those that extend it or differ from it only in colours
  (`onlyColours`: every differing field a colour on both sides), and `mergeSuggestions` no longer proposes such
  a pair; a pair that also differs in a length, a switch or a word still is. The Frame styles section lists the
  kinds. What stays: a book whose boxes differ in colours *and* shape still has one style per shape.
**Sandbox, editions and bundles (#968, #970, #978).**

- **A licensed family names an open one (#978).** `CustomFontFamily.fallback` and the manifest's `fonts[].fallback` name a
  family of about the same width for the faces the book has no file of. The configuration keeps naming the licensed
  family (the book is still set "in" it; `fontFamily` fields are never rewritten): hosts load the fallback's cuts and
  register them *under the licensed name*, so measuring, painting and the PDF need no other change. The rule is one
  sentence, `hasOwnStyle`: a family with no file at all is set wholly in the fallback; a family with files keeps them
  and takes from the fallback only a slant it has none of (an italic). Weights between its own files stay with CSS
  matching, as for any family. It is not a general font-substitution map: `fontFallbackOf` reads only
  `config.customFonts`, so a Google or system family cannot be aliased this way (a family nobody has is still
  `missingFont`). Where it is done: the bundle reader keeps a family with a fallback and no file and warns once
  instead of once per file; the bundle writer writes a family it may not hand on as `{ name, variants: [], fallback,
  redistributable: false }`; `bundleFontProvider` and `loadBundleFonts` take the fallback's faces from the bundle or from
  the host; the CLI's `resolveFonts` looks the fallback up like any family (and asks no catalogue for the licensed
  name); the Sandbox's font loader declares the fallback's faces under the licensed name for the page, the layout
  worker and the PDF provider, and the Fonts panel has a Stand-in family field. A fallback that is itself a custom
  family (bundled open face) works too. The limits this round named (a fallback served only by Google's style sheet;
  EPUB and HTML leaving the licensed family to the reader) are lifted in §5.19.
  No new warning kind: the stand-in is announced by the import warning and shown in the Fonts panel; the PDF embeds
  the open face, which the docs say.
- **Editions (#968).** *Title:* `ProjectRecord.editionTitles` keeps `localized.<lang>.name` and `description` of every
  edition; the record's name follows the edition on screen (`withActiveEdition`) until the reader renames the
  project (`renamePatch` sets `titleEdited` on a book with editions when the title changed); then that title stands in
  every edition and an export gives no edition a title of its own. A copy's "… copy" name is the reader's. *Pagination:*
  the Sandbox writes `layouts.<locale>.json` for every edition (the records kept under its chapter ids, current for
  the edition's text, configuration and resources, keyed by the chapter files `BundlePlan.localeChapterFiles` reports);
  the reader already read it before `layouts.json`. *Fonts:* the families an edition laid out behind the reader declares
  and the book on screen lacks are served as the book's (`declareEditionFonts`, a second registry the book's own
  `setCustomFonts` overrides and `newBook` empties); two editions that give one name different files are not told apart.
  The Activity-bar badge counts the edition on screen (#903), by decision (§5.19).
- **The label editor of a surface (#970).** The hit test, hover, drag with its ghost, drop, click and double click are
  `createLabelEditor`, which knows nothing of the page: a `LabelSurface` paints its marks (`paint(page, shapes | null)`)
  and says how big a CSS pixel is there. The Canvas and the HTML preview adapt it per page element
  (`attachLabelAnchorEditor`, same capture-phase listeners as before); the Folio gives `attachPageInteraction` a
  surface that paints into the page texture (`viewer.redecorate`) in place of the page's own marks while a label is
  hovered or dragged, and enables it in select mode only (a drag never starts a page flip: flipping is hand mode's).
  The drop is `dropLabel` (anchor on the resource, or the `at` percentages in the Markdown), one history step, through
  the template editor host, which the Folio now lends too. The anchors dialog takes two fingers (move and pinch).

### 5.19 Findings round J (#846)

- **A page break between the parts of a contents in a frame (#996).** `TocBlockInfo.breakBefore` marks the part row
  that `toc.parts.breakBefore` puts after a `:::pagebreak` (every part but the first; the repeat of a head row drops it).
  `partBreakCut(pass, L, from)` in `frameLayout.ts` answers the cut at the first such row after something real in the
  fragment. Three places use it. (a) `splitCalloutFragment` takes a `partBreaks` argument (only the frame typesetter
  passes it, so a `:::toc` in a flow callout is cut as before): a top-level cut before a flagged part row is a candidate
  that skips `splitMinLines` and the list rules (the break is the author's), and no cut runs past the first such row;
  the deepest cut that fits wins as always, so a part taller than the room is cut by the room and the next part still
  opens a page. (b) `fill` in `composedLayout.ts` cuts even when the whole box would fit, when the frame can go on:
  chained (`next`) or `fit.goOn`. (c) A frame that could go on but is not in `fit.goOn` is reported by the composition
  (`Composition.wantsOn`); the ladder takes it as its first step (`goingOn`), before the pictures and text shrink, so
  nothing is scaled for a break. A frame with no `overflow.continueIn` and no chain ignores the break (documented, no
  warning: the option is the contents' and the template is the author's). `naturalOf` measures an auto-height frame up
  to the cut it will take. Rejected: handling the break in `layoutCallout` (it has no way to end a fragment); a new
  `FrameConfig` key (the option already says it).
- **A heading design that fills its column (#997).** `headingClaimsColumn` (`level`, `element?`; WARNING_SINCE 1.43.0),
  a content warning of the layout beside `tocGroupSplit`. `measureHeadingDesign` returns what sets the reserved height
  (`claimedBy`: the id of the element that reaches lowest, or `byMinHeight`); the build keeps it for an in-column heading
  (`span` not `'page'`) whose design is taller than its lines (`headingClaims`), and at the end of the pass reports the
  heading when it is the last block of its column, the column has no room for a line, and the next block of the flow is in
  another column. The two cases the issue wanted told apart: a page-span opener is never noted, and a heading followed by
  an explicit break is silent (the page is in `forcedBreakPages`, or the column in `forcedBreak`). On a page of one text column the column is the page, so a design that fills it is a cover and is silent too: one public recipe (a vertical title page) set exactly so, which the first version of the check named by mistake. Elements that follow
  the band (a box filling it) do not set the height, so they are never named. It is not part of `headingDesignCut`
  (`collectHeadingDesignCuts` stays a pure check on the finished layout, for design text lost past the foot): the claim
  needs what only the build knows (which element reserved the height). The Sandbox lists it in the design group of the
  Checks panel and the docs say what to do (`reserve: false` on the element, a lower `minHeight`, or `span: 'page'`).
**Sandbox editions and the template editor (#989, #991, #999).**

- **Add a language (#989).** `ProjectActions.addEdition(id, locale)` (Books panel row menu, `sandbox_save_book`
  `add_language`): `withNewEdition` (storage/projectEditions.ts) copies the edition the record opens with into
  `editions[locale]` (chapters under new ids, configuration cloned, resources cloned but pointing at the same files, which
  the sweep already counts across editions), sets `config.locale`, follows built-in figure/table names to the new language
  (`relocalizedResourceTypes`) and drops an explicit hyphenation language (it was the old language's). The record's own
  `locale` is filled when absent (configuration, then the interface language) because `withActiveEdition` keys on it;
  the action then opens the new edition with it. A language the record has (tag compared without case) is refused.
  An Arabic, Chinese or Japanese edition gets the defaults of its language (`withLanguageDefaults`: the Design panel's
  `arabicDefaults`, `chineseDefaults`, `japaneseDefaults` on the new edition's configuration, as a new book in that
  language gets them). Those lists already tell a setting the book chose for itself (`customised`) from one it left at
  the engine's or the other script's default: with no `include` they apply the rest and the rows that are part of the
  language (an explicit left-to-right direction goes back to Auto for Arabic), so the book's own typefaces, margins and
  the like are not overwritten. The writing mode the book has is kept (a vertical book gives a vertical Japanese
  edition, a horizontal one a horizontal edition). The notice says how many settings moved. Going from such a
  language to another one undoes nothing: direction, binding and writing mode stay as the first edition has them.
- **Copy names (#989).** Duplicating a project and "Copy of the open book" already added "copy"; the copy of a *sample*
  kept the sample's name. It now takes the same suffix (`projectCopySuffix`).
- **A title per language (#999).** The rule of #968 stays the default (a rename is the book's in every edition,
  `titleEdited`). `renameEditionPatch` is the other choice, offered by a box in the rename fields of a book in several
  languages (`sandbox_save_book` `rename` with `thisLanguageOnly`): the edition on screen gets its own entry in
  `editionTitles`, every other edition is given the title it shows now (so nothing moves under the reader's eyes, also
  when `titleEdited` was on) and `titleEdited` goes off, which is what an export reads to write `localized.<lang>.name`.
- **The badge (#999).** Decision: the Checks badge keeps counting the chapter and edition on screen. Other editions are
  laid out behind the reader only while the Checks panel is open (`useBookEditions`), so a badge reading their entries
  with the panel shut would show numbers that an edit has outdated, and keeping them current means laying every edition
  out after every edit. What changes is the accessible name: for a book in several languages it says which language the
  count is of (`navWarningsEdition`); the panel is where every language is listed.
- **Template editor (#991).** `newFrameFor`: a frame added to a template whose groups have members is sized like the last
  member of the last such group; with a stack and no member it is `fill` x `auto`; otherwise the old 60 x 40 mm box.
  Group members are an ordered list (`GroupsEditor`): a ticked frame joins at the end, `moveMember` and two arrow buttons
  reorder, and the engine already honours the order of `group.frames`; the old behaviour (always the template's order)
  was the UI's, not the engine's. "New" picks its first frame.
- **A label near the spine (#990).** On a spread the figure across the spine is one block painted twice, each page
  clipped to its sheet, so a label whose box reached into the gutter band was cut by the fold and read on neither page.
  `keepLabelsOffGutter(block, band)` (`composed/labels.ts`) runs in `layoutComposedSpread` on every block of the laid
  sheet, before the blocks are cut and the facing copies made: a label whose box (`labelRectInBlock`, the same box
  `stampFigureLabelRects` stamps, through a quarter-turned block's turn) meets the band `[spine - gutter / 2, spine +
  gutter / 2]` slides along the sheet's axis to the band's edge, on the side of its anchor point (ties, the point on the
  spine itself: the first page, as a frame is), and keeps its other coordinate. The design answers the issue's first
  option (draw the label on the side where its anchor lies) rather than the second (warn in the anchor dialog): the
  fold is a fact of the sheet, not an authoring mistake, so nothing is raised and the Sandbox needs no warning. A label
  set across both pages on purpose (a title over a map) keeps its place with `ResourceAnchor.gutter: 'cross'`
  (`'keep'` is the default and is not written); the anchor editor has a Keep off / Cross control, one anchor or the
  ticked ones, and the WebMCP marks schema takes the field. The move replaces the label object (the labels of a
  measured block may be shared with a cache), works in the flow frame (so a right-to-left sheet moves the same way
  before the page is mirrored) and on the transposed axis of a vertical sheet. The gutter band is the template's
  `gutter`; with a gutter of 0 the band is the spine line itself. The outer edges
  of the sheet are left alone, and documented so: a label past the trim is cut as the picture is.
- **Label styles (#994).** Renaming a label style in the Design panel now rewrites what names it, as a frame style
  rename does: `labelStyles/labelRefs.ts` reads the `style` of each `::label` line (outside code fences, quoted or
  bare) and of each anchor; `applyLabelStyleRename` writes one history step per chapter changed (the chapter in the
  editor through its editor), one per picture changed, then the design, so Undo takes them back one at a time; the card
  says how many anchors and lines it rewrote. Each card counts the anchors and label lines that name its style
  (`useLabelStyleUsage`, a chapter read again only when its text changed). The Avoid zones mode of the picture marks
  is worded for maps as well as comics (symbols a label keeps clear of). The EPUB limits stay deliberate and are
  documented: the reflowable book lists the labels its SVG layer cannot draw in a hidden list, and tracking is not drawn
  on Arabic words (a joining script is not tracked in print either).
- **An SVG's own shapes as symbols (#994).** Decision: measure once, store as `avoid` zones, read nothing at layout. The
  engine never holds a picture's markup (the file lives in the Sandbox's blob store or the bundle), and zones already
  mean "symbol" to `labelOverlap`, so no format and no engine path changed. `panels/resources/svgSymbols.ts`
  measures an SVG in a browser (`measureSvgNodes`: the drawing laid at its view box with `preserveAspectRatio` none, one
  `getBoundingClientRect` per element, so transforms, `use` and nested groups are exact) and `symbolZones` picks the
  elements by id prefix or class: the outermost match of a branch (a group named as a symbol is one zone), never one in a
  definition (`defs`, `symbol`, `clipPath`, ...), a point widened to the smallest zone the marks allow (0.6 % of the
  picture). `addZones` adds only zones that do not cover an old one by nine tenths, so reading the drawing again adds just
  what is new and never touches a hand-drawn zone. The Avoid zones mode of the marks dialog has the row (SVG pictures
  only); `sandbox_save_resource` takes `marks.svgSymbols { idPrefix, className }` and merges the zones into the call's
  or the picture's own. Known limit, documented: the zones are a snapshot, so a changed drawing has to be read again; a
  stroke's width is not part of an element's box.
**Outputs (#993, #995).**

- **A stand-in travels where the licensed face may not (#993).** A family marked `redistributable: false` that names a
  `fallback` is set, in a file that leaves the app, in the fallback's faces of the same weight and slant under the
  licensed name. Decision: the fallback is open by definition (it is what the licensed family's bundle ships in its
  place), so embedding it under the licensed name is a naming matter only, and the family's own files never go. The rule
  is `exportStandInOf(customFonts, family)`: only a withheld family has an export stand-in (a family the book may hand
  on keeps its files; `hasOwnStyle` is the layout's rule, this is the export's). Text fonts: the host gives the stand-in
  faces as ordinary `EpubFontFile`s under the licensed name (Sandbox `collectEpubFonts`, which asks the loader for the
  fallback's faces of every weight and slant the book uses and returns `stoodIn`; CLI `FontSet.exportStandIn`, which
  looks the fallback up like any family, the book's own files of it first). SVG pictures: `inlineSvgFonts*` takes
  `standIn(family)`; for a family `withhold` names, the provider is asked for the *stand-in's* face and the file is
  embedded under the withheld name, so the licensed files can never be answered by a provider that has them; a family
  whose stand-in lacks any face the SVG asks is left out whole (`fontWithheld` as before). `standIn` is passed by the
  host (`ResolvedConfig` carries no `customFonts`): `EpubSvgFontOptions.standIn`, `renderToHtml`'s
  `inlineSvgFonts.standIn`. No new engine warning kind: the Sandbox's EPUB tab gets a notice (`fontStoodIn`) and the CLI an
  info line. A stand-in with several licensed families in one fallback is embedded once per family (buffers copied).
  Third bullet of the issue: a fallback served only by Google's style sheet was already declared and sent to the layout
  worker (tests added); what failed was the PDF and SVG provider, which looked for Fontsource files only; it now ends with
  `sheetFaceFiles` (the sheet's faces for the cut CSS font matching settles on). The port kit's pack step is the skill's
  (skill-notes/993.md). Limits: a family with some own files and a fallback for one slant is, in an export, set wholly
  in the fallback (its own files are withheld, so no weight can be a mix); the lines were measured with the real files
  in the owner's Sandbox, with the stand-in in a plain bundle's.
- **A picture painted in the label's colour (#995).** `label.icon.tint` (boolean, default off) paints the picture's
  *silhouette* in `label.color`. Decision: one semantic for every backend, "the colour fills what the picture covers, in
  proportion to its opacity" (canvas `source-in`, HTML `feFlood` + `SourceAlpha`, PDF recoloured paths / alpha stencil),
  not SVG `currentColor` (it would work for some pictures and not for bitmaps or for SVGs with fixed colours). The block
  carries `VDTDesignImageBlock.tint` (`#rrggbb`), so any design image can use it later; only the label sets it. Tint wins
  over `diagramStyle.singleInk`. A picture with no transparency becomes a rectangle. PDF: a vector drawing is recoloured
  into its own Form XObject per colour (`tintedDrawing`); a bitmap (or an SVG that took the raster fallback) is painted
  through a 1-bit `ImageMask` of its alpha (cut at half transparency; no transparency, so PDF/X-1a stays valid, and the
  colour goes through the render's colour space); a print master (an embedded PDF page) cannot be recoloured, so a tinted
  SVG drops `pdfFileId`. HTML: the page defines one filter per colour (`pt-tint-<hex>-<page>`) beside the single-ink
  filter; a reader without CSS filters shows the picture in its own colours (the fixed-layout EPUB goes through it). The
  contrast check and preflight need nothing: the picture's colour is the label's, which they read for the words over
  the same tab. The reflowable EPUB does not draw label tabs, so it has no picture to tint.
- **A finger on a label (#992).** The label editor of the Canvas and the HTML viewer took its presses in capture
  listeners and its marks were an SVG that takes no pointer, so a touch on a label reached the browser as a plain
  page touch: after a few px it became a scroll, `pointercancel` ended the drag and nothing was written. The browser
  reads `touch-action` at the first touch, from what is under the finger, so the fix is something under it: a
  `touchPads` list (one box per label outline, a 44 px square round every point), laid over the page as `div`s with
  `touch-action: none`, only where the screen is `(hover: none) and (pointer: coarse)` (a screen that also has a mouse
  would have them intercept the presses the editor leaves alone). A finger that lands on bare paper still scrolls the
  canvas. The editor takes a finger or a pen within 22 CSS px of a point (a mouse 9) and lets it wander 8 px before a
  press is a drag (a mouse 3). Decision: not `touch-action: none` on the whole page in Design mode, which would stop
  the canvas scrolling wherever a page is under the finger. The Folio needed nothing (`.is-select` is
  `touch-action: none` already and a press on a mark never turns a page); the anchors dialog's stage is
  `touch-none`, and the browser's own page pinch does not start there. Checked with the browser's touch emulation
  and real touch events (Chrome DevTools protocol) on a tablet and a phone screen, not on a physical device.
  `drawLabelMarksOverlay`, unused since the HTML viewer takes the editor's marks, is gone.
- **Frame names in a draft that dedupe never sees (#998).** `pdf_regions.py extract` names frames by position
  (`box-4`) because `template_dedupe.py` compares the frames of two templates by name and the positions line up
  across the pages of a kind. A run of one page has nothing to merge, so `extract --name-frames auto` runs
  `name_frames` itself: templates, page Markdown, `figures.json`, `regions.json`, overlays and `report.json` follow.
  `always` does it for several pages, `never` keeps the positions. The callout styles are still `box-1` when
  `extract` runs, so a box says `box` and its order; dedupe, run later on such a draft, names it after its merged
  style (the role names match its positional pattern and are derived again). The Sandbox rename of a frame of a
  sample reaching only the open edition is a documented limit: the other editions of a bundle are read each time and
  have no store to write to.

## 6. Source map contract

Every painted thing knows its origin:

- Body text laid into frames: the usual `sourceStart`/`sourceEnd`/`sourceMap` per block and line
  (absolute offsets in the chapter file).
- Frames: `configPath` of the template frame and `sourceStart/End` of the slot's content.
- Labels: source range of the `::label` text and `resourceId#anchorId`.
- Decoration and header/footer elements: their config path (`/pageTemplates/3/decoration/elements/1`).
- Text produced by `{attr.x}`: the attribute's source range in the page fence (`attrSources`).
- Contents entries: the heading they come from.

Stable ids: a frame is `cp<fenceIndex>:<slot>` (plus `~<n>` on the n-th page added by continuation, §5.12); a
label is `cp<fenceIndex>:<slot>:label:<anchor>`; same id in every locale and across relayouts.

Relayout scope: the composed page's layout is memoised by (resolved template, slot content,
fonts, locale, page parity); an edit inside one page re-sets that page (and its continuations).
Budget (P16): < 100 ms for a property change on one page, < 300 ms with reflow.

### 6.1 What P16 built (#857)

- **Query API** (`composed/sourceMap.ts`): `sourceAt(doc, page, x, y, { file })` returns the
  elements at a point innermost first (`text` → `line` → `block` → `box` → `frame` → `group` →
  `template`; `design` → `slot` → `template` for decoration and running heads), each with a
  stable `id`, a `source` (`markdown` | `config` | `attr` | `resource`), `content` (the Markdown a
  frame or page holds) and `rect`. Hit order follows paint order: running heads, then frames and
  decoration from the top layer down; a turned frame is hit in its upright box. Reverse:
  `elementsForSource(doc, start, end)`; `findElement(doc, id)`. Nothing is laid out: the API reads
  stamps.
- **Stamps added.** `VDTChip.sourceOffsets` (relative to the chip's `:`, so the rich cache stays
  valid), `containerAttrSources` on container fences carried to the story box so a frame's tab and
  title map to `label` / `title`; every design block gets `elementId`, and `configPath` where the
  slot's pointer is known (decoration through `decorationPaths`, template header/footer through
  the new `headerPath` / `footerPath`, `/headingStyles/<i>/header`, `/header`); `attr` on a text or
  image block that shows `{attr.x}`; `{attr.x}` in a composed page's running heads maps to the page
  fence; `OutlineEntry.headingSource` → `TocBlockInfo` → `tocEntry.headingSource` (body offsets,
  kept out of `outlineKey`); `FigureLabel.anchorRef` (`resourceId#anchorId`) and `FigureLabel.id`
  (`cp<n>:<slot>:label:<anchor>`, `@<k>` for a percent label) for P6.
- **Ids** (`composed/ids.ts`): `cp<n>`, `cp<n>:<frame>` (`~<k>` reserved for continuation pieces
  on later pages, #859), blocks `cp<n>:<frame>-c<k>`, `cp<n>:group:<name>`,
  `cp<n>:decoration|header|footer:<elementId>`. A chained piece on the same page keeps P4's
  `-cont-<k>` block id.
- **Memo** (`composed/pageMemo.ts`): `layoutComposedPageMemo` keys a page by a 64-bit digest of the
  resolved config (once per pass), the measurement generation, the resolved template, the fence
  index, the page's Markdown slice and blocks (offsets relative, container ids by order), the
  geometry rounded to 1e-6 px, the side's `mirrored`, and a pass context from `build.ts` (heading
  numbers, part, section, paragraph containers, boxes out of flow, the pictures' resources, types,
  numbers and floats). Pages with footnotes, refs, citations, contents, index or strips are not
  kept, nor pages whose layout left drop-cap or joining-script notes. A hit parses the stored JSON
  and moves source offsets, `contentIndex`, container ids (`calloutPath` too) and `pageIndex`. The
  digest is `VDTComposedPage.layoutKey`; `composedPagePaintKey(page)` adds what is laid round the
  frames, and the Sandbox canvas keeps the bitmap of a page whose paint key is unchanged.
- **After P7, P9, P14.** `VDTFigureLabel` carries `id`, `anchorRef` and an absolute `sourceMap`
  (and its `sourceStart`/`sourceEnd` are now absolute: `figureLabels(block, bodyOffset)`); a
  label with a `rect` (P6) answers `sourceAt` at level `label`. The half of a spread frame on the
  facing page (`facingBlocks`) answers with the read blocks' ids and `facing: true`; points outside
  `sheetClip` miss frames and decoration. Spreads are laid out afresh every time (no memo, no
  `layoutKey`): the sheet's two pages depend on each other. Groups come from the resolved
  template; the negotiation reads only the template and the page's content, both in the key.
- **Cost.** A warm composed page sets in about 1 ms (stub measure), so the memo saves about half
  of the composed-page work on a rebuild; the whole chapter build is dominated by the rest of the
  pipeline. Bench: `__bench__/composedPage.bench.test.ts`.

## 7. Comics

`:::page{split}`, `::panel` and lettering keep their parser and layout unchanged in this
programme. P12 (later) re-implements them on templates: each split cell becomes a generated frame
holding the panel art, lettering stays positioned by the comics code. Every comics fixture and
Cookbook comics recipe must render unchanged before and after.

### 7.1 What P12 built (#885)

- **The split generates frames** (`comics/frames.ts`, `comicFrameSpecs`). The cells of the split
  tree (`comicGeometry`, unchanged) in reading order, each with its panel's `pad` taken off, and
  each `inset` panel over the frame laid before it (layer 2; cells are layer 1), are the page's
  frames; `layoutComicFrame` builds each panel from its frame. Names: the panel's `id` when no
  frame before took it, else `p<k>` (k = place in panel order, from 1). Ids follow §6:
  `cm<n>` for the comic (`n` = the comic fence's ordinal in its chapter, `:::page` and `:::strip`
  counted together, stamped by the block parser as `ComicPageSource.fenceIndex`),
  `cm<n>:<name>` for a frame (also `VDTComicPanel.frameId`), `cm<n>:<name>:b<order>` for a balloon
  (`VDTComicBalloon.elementId`; `id` keeps its layout-order value for the Sandbox).
- **Decision: polygon on the frame.** `VDTFrame` gains `polygon?` (set only when the outline is
  not the box: a cell cut by a slanted line) and `panel?` (the index in `VDTComicPage.panels`,
  which marks a generated frame; its `configPath` is `''`). Content is clipped to the polygon in
  canvas, PDF and HTML; hit-testing reads it. The comic keeps `VDTComicPanel.polygon` for its own
  painters, so frames are a record beside the panels, not a second painter: `VDTComicPage.frames`
  (pages, spread halves and strips; `translateComicPage` moves them, a spread half rebuilds them
  from its cut panels with `comicFramesFor`). The comics VDT and the HTML of every existing comic
  are unchanged (harness: 125 comic chapters of the public presets and the Cookbook bundles, all
  locales, full page JSON with only the new keys ignored, 0 diffs; preset parity 583 chapters, 0
  diffs).
- **Text panels** (`comics/textPanels.ts`). `::panel{text}` makes the body Markdown
  (`ComicPanelSource.text`, no script items). The block parser reads each body with the same
  parser on a copy of the text blanked before the body (offsets stay absolute; `:::` lines in the
  body are blanked, since a comic's body ends at its first bare `:::`) and emits its blocks right
  after the comic directive, so outline, index marks, warnings and the flow fallback see ordinary
  blocks. `wrapComicTextPanels` (beside `wrapComposedPages`) puts each body in a story box of
  `FRAME_STYLE_ID` keyed `comic:<panel>`; the comic page branch of `build.ts` sets each story
  with `layoutComposedPage` over a one-frame template whose area is the panel's text area (the
  panel's box inside its border plus `comics.lettering.inset`, or the box itself with `box`; in a
  slanted cell the widest straight-sided box inside the polygon, `innerBox`),
  `valign` → `verticalAlign`; ids are renamed `cp<n>:` → `cm<n>:`; the blocks go to `page.floats`
  and `doc.blocks`, the frame record gets `blockIds`, `overflowPx`, `scale`. A `::resource` in a
  story does not float (the float plan treats the text plans as composed pages). Not wrapped, so
  set in the flow after the comic: comics inside a container (strips and spreads since #959, vertical and
  mirrored documents since #909; `comicTextPanelsSupported` is true for every document).
- **Paint order** (`comicPaintsUnderText`, `comicFramePaintOrder` in `composed/paint.ts`): on a
  comic page holding text frames the panels are painted before the flow, the text frames after
  the floats (their ids are in `composedFrameBlockIds`), the lettering after the flow; elsewhere
  the comic paints whole as before. The HTML writes each text frame inside the comic's markup
  after its panel's figure (`ComicHtmlPaint.overPanel`), `z-index:auto`. Tagged PDF reads a text
  frame as one float after the comic's `Div`; the reflowable EPUB reads it after the panels.
- **Box styles.** `::panel{box=<calloutStyle>}` maps the style's background, border colour and
  width and radius onto the panel (its own `border`/`bg` win); on a text panel the frame draws the
  box (frame style = that callout style) and the panel draws none. `VDTFrame.styleId` names it.
- **Warning** `comicPanelFrame` (`reason`: `unknownBox`, `textOverflow` (layout); `strip`, `spread` and
  `flow` were raised up to 1.39 and stay in the type for old reports; `panel` = source index).
- **Source map** (`comics/sourceMap.ts`, called from `sourceAt`, `elementsForSource`,
  `findElement`): balloon glyph (`text`) → balloon (`box`) → frame → comic (`template`); picture
  (`resource`) → frame → comic; a text panel's words answer through the flow path with the frame
  and the comic appended. Sandbox: `comicTextFrameAt` (frameHit.ts), text frames in
  `frameTools` (Content mode: click off words → caret at the text, double click → in-place
  edit), `panelArtAt` ignores a text panel's words. The template editor never sees comic frames
  (they are not in `page.composed`).
- **Not done:** the comic frames in the template editor's views. (Vertical and right-to-left pages, lines
  following a slanted edge, `shrink` and the tagged PDF's reading order: round G, §5.15; strips, spreads and
  text set to the middle or the foot of a slanted cell: #959.)

## 8. HTML and EPUB

- Reflowable HTML/EPUB: reading order is Markdown order. A composed page becomes a `<section>` in
  which each frame is a block with its callout style, in source order (not template order).
  Decoration is dropped (or kept as decorative images). A figure's labels become accessible text:
  a visually hidden list after the image, in label order.
- Fixed-layout EPUB and the HTML viewer: the template is applied (they render the paged VDT).
- Tagged PDF: structure order follows the Markdown (`contentIndex`), not paint order.

What P9 (#862) built:

- **Reading order** is `composedReadingOrder(composedPaintOrder(page))`: the decoration first, then the
  frames by the lowest content index of their blocks (a frame a chain continues into after the frame
  before it). The HTML viewer (and so the fixed-layout EPUB) writes frames in that order inside one
  stacking context (`pt-composed`, `z-index: 0`) and paints them by `z-index` = place in the paint
  order; tagged PDF reads each frame in one `readFloat` call (a list stays one `L`).
- **Reflowable EPUB**: `ComposedNode` (`<section class="pt-composed pt-composed-<template>">`, the page
  break first), each story a `CalloutNode` with `frame` (`<div class="pt-frame pt-frame-<name>">`, plus
  `pt-callout pt-callout-<style>` when the frame has a style); frame CSS only in books that have
  composed pages. Decoration dropped.
- **Labels** ride on the VDT as `ResolvedResourceBlock.labels` (`VDTFigureLabel`: text, at, style,
  source range). Reflowable EPUB: a visually hidden `<ul class="pt-figure-labels pt-hidden">` after the
  picture, no `aria-describedby` (read once). HTML `alt` and PDF `Alt`: `altWithLabels` (`Alt (A, B)`,
  `（A、B）` for CJK, `،` for Arabic).

What #1045 changed (the screen viewer):

- **The leaf.** A host whose page is not a leaf sets `composedViewerLeaf` (the print page's size and
  margins, resolved as `ResolvedConfig.composedViewerLeaf`; never saved with a document). `build.ts`
  gives each page a composed page or spread side is laid on the leaf's geometry first (`toLeaf`:
  size, content area, columns, flow frame), and `designFramesOn` and `headerFooter.ts` read the leaf's
  trim and bleed for those pages (`composedLeafConfig`, `onComposedLeaf`). Frames, groups and
  decoration therefore stand exactly where print puts them; the pages of the flow keep the host's
  page. Before, the Sandbox's HTML viewer laid templates on its own page (a measure wide and 200,000 px
  tall in the vertical scroll, a screen high in the columns view): frames anchored to the foot landed
  a scroll away, frames ran past the page's width, and the columns view clipped what passed its foot.
- **The Sandbox.** The viewer asks for the leaf when the book has a `::::page` fence and shows each
  composed page scaled to the viewer's width (never above the leaf at the viewer's dpi) with a
  transform inside a box of the scaled size (`fitComposedPages`): in the vertical scroll the page is
  the leaf's height (`fitPagesToContent` keeps it), in the columns view a page taller than the screen
  scrolls down in a box of its own, and next/previous step by the page at the leading edge. CSS `zoom`
  was tried first: Chrome clips the lines of a vertical page's turned flow under it.
- **Labels as text.** `labelPlainText` reads a label's forced breaks (`\\` ending a word) as spaces
  in `altWithLabels` and the reflowable EPUB's hidden label list.

## 9. Literals allowed in the config

The `contentInConfig` whitelist (§2.8): book title, author and publisher (from metadata or
`checks.contentInConfig.allow`), and per element at most two words / 24 characters after removing
placeholders. Decoration text elements follow the same rule.

## 10. Answers to the open questions of #847

<table>
<tr><th>Question</th><th>Answer</th></tr>
<tr><td>Frame style: callout styles or new?</td><td>Callout styles (§2.4).</td></tr>
<tr><td>Position units</td><td>mm (any <code>Dimension</code>), grid cells, or anchored to a frame/group (§2.2).</td></tr>
<tr><td>Variants</td><td><code>variants.recto/verso</code> patches; <code>spread</code> templates (§2.1).</td></tr>
<tr><td>Header/footer</td><td>Per template, inherit by default, <code>false</code> hides.</td></tr>
<tr><td>Decoration with text?</td><td>Only placeholders and whitelisted literals.</td></tr>
<tr><td>Pushes other frames' text</td><td><code>exclude: 'push'</code>, rectangular, as <code>wrap</code> today; by the pictures' contour with <code>wrap: 'contour'</code> (P11, §5.12).</td></tr>
<tr><td>Flow frame and chaining</td><td><code>flow</code>, <code>next</code>, <code>overflow.continueIn</code>.</td></tr>
<tr><td>Fence syntax vs comics</td><td>Four-colon <code>::::page{template}</code>; <code>:::page{split}</code> unchanged (§3.1).</td></tr>
<tr><td>Geometry in Markdown?</td><td>Never; only <code>at="x% y%"</code> as a label fallback.</td></tr>
<tr><td>Determinism</td><td>Fixed ladder order and step sizes, template-order ties (§5.4).</td></tr>
<tr><td>Scope of a change</td><td>Its page or spread, plus continuation pages (§5.4, §6).</td></tr>
<tr><td>Rotation</td><td>Any angle per frame (content and box), drawn with a matrix in every backend as comic balloons are.</td></tr>
<tr><td>Comics</td><td>The split generates frames; text panels and box styles (P12, §7.1).</td></tr>
</table>

## 11. Issue map

P2 #853 config types/validation (§2) · P3 #854 parser (§3) · P4 #855 layout (§5.1–5.2, frames,
decoration, backends) · P14 #856 groups (§5.3, log) · P16 #857 source map and page-scoped relayout
(§6) · P5 #858 ladder and warnings (§5.4, §5.7) · P15 #859 continuation (§5.6) · P6 #860 anchors
and labels (§2.6, §3.3) · P7 #861 spreads (§2.1) · P9 #862 HTML/EPUB (§8) · P11 #883 contours (§5.12) ·
P12 #885 comics on frames (§7, §7.1).

## 12. Round 2 (#1051): lines, shapes, repeats, modules and overlap checks

Design of #1052 (C1). Status: approved. Draft types: `round2Types.ts` (no runtime effect; each issue
moved its part into `types.ts` / `composed/types.ts` and deleted it from the draft; C6, the last part
left, removed the file).
Each issue records what it built in a §12.x of its own, as §5.x did for round 1.

Why: a port of a 28-page children's textbook (checked privately) could only draw the lines of its
tree diagrams, its org chart, its timeline spread and its map notes inside a raster ground per page,
needed 27 one-off templates for 28 pages, drew its card and tabs into the same grounds, and passed
`check` with a clipped caption and a tab under a photo.

### 12.1 One vector primitive: `VDTDesignPathBlock`

Connectors (C5, C6), path elements (C9) and the shapes of C8 that a rounded rectangle cannot draw (a
card joined to its tab) all paint through one new design block, so each backend learns one thing:

```ts
interface VDTDesignPathBlock extends VDTDesignBlockOrigin {
  kind: 'path'
  bbox: BoundingBox                         // union of the ink, for hit tests and clips
  subpaths: VDTPathCommand[][]              // page px; M L C Q Z (absolute)
  fill?: string                             // resolved colour; absent = no fill
  fillRule?: 'nonzero' | 'evenodd'
  stroke?: { color: string; widthPx: number; dash?: number[]; cap?: 'butt'|'round'|'square';
             join?: 'miter'|'round'|'bevel' }
  markers?: { kind: 'dot' | 'arrow'; x: number; y: number; angle: number; sizePx: number; color: string }[]
}
```

Canvas (`Path2D`-free, plain `moveTo/lineTo/bezierCurveTo`), PDF (`m l c h f/S/B`, dash `d`), HTML/EPUB
(inline `<svg>` positioned like a rule), tagged PDF (Layout artifact), preflight (ink colours),
contrast (ignored: not text), part palettes (`partPalette.ts` recolours `fill`/`stroke`/markers like a
rule's colour). It landed with C4 (#1055, §12.13) ahead of C5; C5, C8 and C9 reuse it.

`VDTDesignBoxStyle` gains `borderRadiiPx?: [tl, tr, br, bl]` and `borderSides?: { top, right, bottom,
left: { color, widthPx } | null }` (C8); a box with neither paints as today.

### 12.2 Anchoring to a point of a side (C4)

- `ElementSizeTo.edge` adds `'center'`: the middle of the target box on the axis being sized
  (horizontal centre for a width, vertical centre for a height).
- `ElementAnchor.at?: 'start' | 'center' | 'end' | number`: on a side edge (`top`, `bottom`, `left`,
  `right` and the `-start`/`-end` forms read as their side) of a `'#frame'`/`'#group'`, the point along
  that side (a number is a fraction, 0 at the side's start in the page's line direction). Default: the
  edge's own point (today's behaviour). Ignored on the container, page and bleed.
- Both are read by every design slot (composed decoration, header/footer, heading designs).

### 12.3 Connectors (C5)

A decoration element of composed templates (not of running heads: they have no frames):

```ts
interface DesignConnectorElement {
  kind: 'connector'; id: string; parity?; pages?; pin?
  from: ConnectorEnd                        // one end
  to: ConnectorEnd | ConnectorEnd[]         // one or more; '#card[*]' expands to every instance (§12.6)
  routing?: 'straight' | 'elbow' | 'tree'   // default 'elbow'
  radius?: Dimension                        // corner radius of elbow/tree bends, default 0
  trunk?: number                            // tree/elbow: where the bar runs between the ends, 0..1, default 0.5
  color?: ColorValue                        // palette-linked like rules; default the main colour
  width?: Dimension                         // default 0.75 pt
  dash?: Dimension[]
  startCap?: 'none' | 'dot' | 'arrow'; endCap?: 'none' | 'dot' | 'arrow'   // default 'none'
  capSize?: Dimension                       // default 3 × width
}
interface ConnectorEnd {
  to: `#${string}`                          // frame, group, frame instance '#card[2]', module frame '#tree[1].left'
  side?: 'top' | 'bottom' | 'left' | 'right' | 'start' | 'end'   // default: the side facing the other end
  at?: 'start' | 'center' | 'end' | number  // default 'center'
  gap?: Dimension                           // room between the frame's edge and the line, default 0
  anchor?: string                           // C6: a figure anchor id of the picture the frame holds
}
```

- **Routing.** `straight`: one segment. `elbow`: horizontal–vertical–horizontal between left/right
  sides, vertical–horizontal–vertical between top/bottom sides, an L when the sides are perpendicular;
  the bar at `trunk` of the way. `tree`: one parent (`from`) and children (`to`): a trunk from the parent
  to the bar at `trunk` of the gap between the parent's side and the nearest child, the bar across the
  children's points (and the parent's, when it is outside them), one drop to each child. A child whose
  side point is on the bar's line gets no drop.
- **When.** Laid with the decoration, after the frames' final boxes (§5.8), so it follows groups, the
  ladder and continuation. `pin: true` reads declared boxes. An end on a frame that is collapsed, empty
  and optional, missing on this page, or on the other page of a spread with no `crossGutter` path:
  the end is dropped (a tree keeps its other children) and the reflow log says `connectorDropped`
  (info). Every end dropped: nothing is drawn.
- **Paint.** Decoration layer (0), under the frames; a `VDTDesignPathBlock` with markers. Spreads:
  laid on the sheet like the rest of the decoration (§5.10), split per page by `splitSpreadDecoration`
  (a path is clipped by the page's `sheetClip`). Right-to-left pages: `start`/`end` follow the flow;
  the geometry comes from mirrored frame boxes, nothing else to mirror.
- **Validation.** `frameAnchorUnknown` for an unknown `to` (pointer into `from`/`to`), `unknownConfigValue`
  for routing, caps, side, `at` outside 0..1.

### 12.4 Leaders to picture anchors (C6)

- A `ConnectorEnd` with `anchor` ends at that anchor of the picture its frame holds (the first
  `:::figure`/`::resource` of the frame's story that has the anchor), through crop, safe area and fit
  scale as labels are mapped (`pictureToBody`, `composed/labels.ts`). Unknown anchor:
  `labelAnchorUnknown` with `connector: id`.
- Labels: `ResourceAnchor.labelAt?: { x: number; y: number }` (fractions of the picture) sets the label
  away from its point, and `leader?: boolean | LeaderStyle` draws a line from the label's box (nearest
  side, centre) to the point; `LabelStyle.leader?: LeaderStyle` gives the look:
  `{ color?, width?, dash?, startCap?, endCap? }` (default end cap `'dot'`). In Markdown,
  `::label[…]{at="legend" leader}` turns it on for one label; `leader="none"` off.
- Painted with the figure's labels (after the picture), as path blocks in the figure's label layer;
  HTML/EPUB as SVG in the figure; the alt text is unchanged.

### 12.5 Legends and inline symbols in labels (C7)

- `:icon[alt]{resource="id"}` (a bitmap or SVG resource) and `:icon[alt]{glyph="⊙" font="…"}` and
  `:icon[alt]{line="solid|dashed|dotted" color="…"}` (a line sample), inline in label text: sized to the
  line's cap height by default (`size=` em), tinted with `color=`. Allowed in labels and, since the
  label line setter is the caption setter, in captions; not in body text in this round.
- Labels keep authored line breaks (a hard break in the label's Markdown, two trailing spaces or `\`
  at the end of a line inside a `::label` container form), besides `\\`.
- `LabelStyle` gains `align?: 'start' | 'center' | 'end'` (the lines inside the label box), `border?:
  { color, width }`, `radius?`, and `kind?: 'legend'`: a legend is a label whose lines are rows of symbol
  + text aligned on the symbol column (the first `:icon` of each line hangs in a column as wide as the
  widest symbol).
- Scale bars stay artwork; their numbers are labels on anchors along the bar.

### 12.6 Repeating frames (C10)

```ts
interface FrameGroupConfig {
  kind?: 'stack' | 'row' | 'grid'
  columns?: number; columnGap?: Dimension; rowGap?: Dimension     // grid
  rowAlign?: 'start' | 'center' | 'end' | 'stretch'               // grid: cells in a row, default 'stretch'
  repeat?: { frames: string[]; max?: number }                     // grid: the frame set laid per cell
}
```

- The first frame of `repeat.frames` is the cell's **main** frame: the set is laid in each cell with the
  main frame taking the cell's width and the other frames anchored as the template draws them (to the
  main frame or to each other; anchors to frames outside the set are kept).
- **Items.** Each `:::frame{slot="<main>"}` piece of the page is one item (pieces no longer
  concatenate for a repeated slot). Inside an item, a block with `slot="<member>"` (a member of the set)
  goes to that member's instance; the rest goes to the main frame. One `::resource{slot="<main>"}` (or
  `slot="<member>"`) outside a container is also an item of its own.
- **Instances** are named `<frame>[n]` (1-based) for the main frame and every member of the set:
  `#card[2]`, `#caption[2]`; `[*]` in a connector's `to` expands to all. Warnings, reflow log, source map, `VDTFrame.id`
  (`cp<fence>:<frame>[n]`) and the Sandbox use the instance name.
- **Layout.** Cells fill rows start to end; a row is as tall as its tallest cell (`rowAlign` places
  shorter ones); `max` caps the items, the rest is `slotUnknown`-like (`repeatOverflow`). The grid is one
  group step (§5.9); `grow`/`shrink` apply to rows. Ladder: a grid that does not fit its box first runs
  the ladder per row (text, then pictures, per instance), then continues **by whole rows** when the
  main frame has `overflow.continueIn` (the instances that did not fit go to the receiving page's grid),
  else warns `frameOverflow` on the last instance.
- Resolution: `resolvePageTemplate` stays per template; the instances are made in `composePage` from the
  page's item count (`expandRepeats`, before geometry), so the template cache is unchanged.

### 12.7 Modules (C11)

- A template with `role: 'module'` is a **module**: frames, groups, decoration, connectors; no `area`,
  header, footer, variants or spread; never used by a page fence (`moduleAsPage`).
- A page template asks for modules in a group: `groups: [{ name: 'body', kind: 'stack', modules: true }]`
  takes the page's modules in Markdown order; `:::module{template="arbol-3" name="?"}` (three colons,
  inside a page fence) holds that module's content, its blocks addressed by the module's slot names.
- **Instances** are scoped: `<name>.<frame>` with `name` from the fence or `<template>[n]`; anchors and
  connectors inside a module are rewritten to the instance; a module frame anchored to `'container'` reads
  its module box. A module is a box of the group: as wide as the group, as tall as its content (its
  frames' union), with the group's `gap` between modules.
- **Expansion.** Like repeats, modules are expanded per page in `composePage` into ordinary frames, groups
  and decoration (`expandModules`) before geometry: everything after (groups, ladder, continuation, source
  map, paint) sees plain frames. A module that does not fit moves whole to a continuation page when the
  page's module group continues (`overflow.continueIn` on the group, new), else the ladder runs on its
  frames.
- `extends` works between modules; a module may hold grids (§12.6); a module inside a module is not
  supported in this round (`moduleNested`).

### 12.8 Shapes (C8, C9)

- Callout/frame styles and `ElementBoxStyle`: `borderRadius` takes a `Dimension` or `{ topLeft?,
  topRight?, bottomRight?, bottomLeft? }`; `border` (callouts) / `borderSides` (decoration boxes) take
  per-side `{ enabled?, color?, width? }` over the whole border's values.
- **Joined tab** (`CalloutLabelConfig.joined?: boolean`, `fillet?: Dimension`): the tab and the box are
  one outline: the tab's side corners meet the box with concave fillets (default the box radius), the
  box's border runs round the tab, one fill. Works for every `position`; with `offset` 0 only (a joined
  tab sits on the edge).
- **Path element** (`DesignPathElement`, every design slot): `{ kind: 'path', id, placement, d, viewBox?:
  [w, h], fill?, stroke?, width?, dash?, preserveAspectRatio?: 'none' | 'meet' }`: SVG path data in the
  `viewBox` (default `[1, 1]`: fractions of the box), stretched to the element's box (`'none'`, default)
  or fitted. Colours palette-linked. Bad path data: `unknownConfigValue` and nothing drawn.

### 12.9 Glyph tab icon (C3)

`CalloutLabelConfig.icon` gains `kind?: 'resource' | 'glyph'` (default `'resource'` when
`resourceId`), `glyph`, `fontFamily`, `fontWeight`, `scale` (of the tab's text size, default 1) and
`color` (default the label `color`). `placement` and `gap` as for pictures. Tagged PDF: the glyph is an
artifact; HTML `aria-hidden`.

### 12.10 Overlap checks (C2)

- `frameCovered` (warning): a line of a frame (its ink box) or a picture block lies under the box of a
  frame painted later (higher `layer`, or the same layer later in template order) that has a fill, a
  picture or text over that point; or under a decoration path/box painted later (none today, decoration
  is below frames). Data: page, template, `frame`, `coveredBy`, overlap mm², the first covered words.
  Proposals: `{ kind: 'layer', path: …/coveredBy/layer, value }`, `{ kind: 'exclude', path:
  …/coveredBy/exclude, value: 'push' }`, `{ kind: 'move' }` (data only).
- `frameOutsideArea` (warning): a frame's final box (ink, for an auto frame) runs past the trim (bleed
  for `area: 'bleed'` templates) or past the box of the frame or group it is anchored *inside*
  (a nine-point anchor on `#x` with an offset into it). Proposals: `maxHeight`, `minHeight` of siblings,
  `continueIn`.
- `FrameConfig.overlap?: 'check' | 'allow'` (default `'check'`): `'allow'` on the covering frame (art
  meant to sit over text) or on the covered one silences the pair.
- Both are content warnings of the layout with `WARNING_SINCE` the release that ships C2, listed by
  `postext check`, the Sandbox Checks panel (U13) and `sandbox_get_warnings`.

### 12.11 Order, versions, outputs

- `CONFIG_VERSION` 15 → 16 with C5 (the first issue that adds a decoration kind): no migration; older
  readers drop unknown decoration elements with `unknownConfigValue`.
- Every engine issue paints on canvas, PDF, fixed HTML/EPUB and tagged PDF, keeps reflowable EPUB/HTML
  unchanged (decoration is not reflowed), updates `preflight.ts`, `partPalette.ts`, the source map
  (`sourceAt` hits paths like rules: never over a frame), the JSON validation and the warnings docs list.
- Issue map: C2 #1053 §12.10 · C3 #1054 §12.9 · C4 #1055 §12.2 · C5 #1056 §12.1, §12.3 · C6 #1057 §12.4 ·
  C7 #1058 §12.5 · C8 #1059 §12.1, §12.8 · C9 #1060 §12.8 · C10 #1061 §12.6 · C11 #1062 §12.7.

### 12.12 What C3 built (#1054)

Recorded where the implementation settles a point §12.9 leaves open, or departs from it.

- **Types.** `CalloutLabelConfig.icon` is `CalloutLabelIconConfig` (exported, with
  `CalloutLabelIconKind`); the draft's icon part left `round2Types.ts` (its `joined` / `fillet` stay
  for C8). The resolved icon always carries `kind`, `glyph`, `fontFamily`, `fontWeight` and `scale`;
  `color` is absent unless set.
- **Kind.** `kind` as written when it is `'resource'` or `'glyph'`; unset (or another word), a glyph
  when the icon sets `glyph` and no `resourceId`, else a picture. So a picture icon with a stray
  `glyph` stays a picture; `kind: 'glyph'` wins over a `resourceId`.
- **Defaults.** Face and weight: the label's (`label.fontFamily`, else the headings face;
  `label.fontWeight`, else 700). `scale` of the tab's text size, 1; a value that is not a positive
  finite number reads as 1. `color` is read when the tab is laid out: unset, the label's `color`, so a
  frame's `look.label.color` recolours the glyph with the words.
- **Geometry.** The glyph's box is its advance at `fontSize × scale`. `inside`: at the tab's start
  (`paddingX` in, the right end in a right-to-left box), the words `gap` after it; the tab grows by
  advance + gap. `beside`: `gap` past the tab's edge on the side away from the corner; the label rule
  stops at the glyph's outer edge. Picture `width` and `tint` do not apply. The baseline is the tab's
  middle plus 0.36 of the glyph size, the formula of the words: at scale 1 the glyph shares their
  baseline, at other scales it stays centred on the tab. `gap` is measured as the picture's (the box's
  em), and `keepChromeAt` (a frame at `scale`) does not scale it, as it does not for pictures.
- **Outputs.** The glyph is a design text block of the box overlay with `artifact: true`; no new VDT
  field. Canvas paints it as any design text; the PDF draws it as text in the glyph's face, a layout
  artifact in a tagged PDF (the tab's tagged content is its words); HTML and fixed EPUB set it in a
  `<div aria-hidden="true">`; the reflowable EPUB leaves it out of the box's title (it reads only
  non-artifact overlay text). Text extraction of the PDF (pdftotext, copy) still sees the glyph, as it
  sees a repeated callout title: no empty `/ActualText` over it.
- **Checks.** `unknownConfigValue` for `label.icon.kind`, `placement` and `scale` (with what is read);
  `unknownConfigKey` for a key `label.icon` does not have. A glyph the face lacks: the PDF's existing
  `missingGlyph` warning (the glyph goes through the same text primitives); canvas and HTML fall back
  as the browser does. The glyph's family joins `configFontFamilies`; `label.icon.color` is a text
  role for the part palette.
- **Not done.** Sandbox controls (U13) and docs (D3). A frame `look` has no glyph colour of its own
  (it recolours the glyph through `label.color` only).

### 12.13 What C7 built (#1058)

- **Inline symbols.** `:icon[alt]{…}` is read by `extractInlineSwatches(…, { icons: true })` and
  rides the swatch's placeholder (`SWATCH_PLACEHOLDER`, `InlineSpan.swatch.icon`, `VDTLineSegment
  .swatch.icon`): every pass that keeps a swatch whole (bidi, tracking, Knuth–Plass, the CJK composer,
  the measure cache, which now keys on the icon) keeps a symbol whole, and a painter that does not
  know icons paints a swatch's outline. Kind by the first attribute written of `resource`, `glyph`,
  `line` (an unknown `line` value reads `solid`); none of them: the directive stays text. `color` is a
  hex or a palette id (`resolveSwatchSpans`, which also fits a resource icon's picture: bitmap or SVG,
  its aspect, square for an SVG with no size; any other resource or an unknown id paints an outline).
- **Where it is read.** A figure label (`::label[…]`, `:::label`), and every resource snippet:
  captions, notes and table cells (`parseInlineSnippetSpans` reads them always, so the Sandbox's
  snippet map agrees with the measurer). Not the body text, headings or design texts in this round.
- **Size** (`measure/inlineIcon.ts`). The box stands on the baseline; height `size` ems, default
  `ICON_CAP_EM` 0.75 (a swatch's side). A picture keeps its proportions; a glyph is set at `height /
  0.75` px (its capitals as high as the box) in `font` (else the text's face with its size changed) and
  takes its advance; a line sample is twice as long as high, stroke 0.09 em (1 px at least), dashed
  3:2 stroke widths, dotted as round dots two widths apart. `size` is the height for every kind (the
  design said "em" without saying of what).
- **Kept lines.** `:::label{at=… style=…}` … `:::` inside a `:::figure`: every non-blank source line is a
  line of the label (departure: the design asked for a hard-break mark at each line end; in a label
  each line is meant as one, so the mark is optional and dropped when present). Lines are read one by
  one and joined with `BREAK_PLACEHOLDER`, mapped to the end of the earlier line; `\\` still breaks
  inside a line. The first `:::` closes the label, the next the figure. `::label[…]` stays one line.
- **`LabelStyle`.** `align` lines the lines up inside the box (in the label's direction); left out, as
  the anchor places the box (the old behaviour), `start` in a legend. `border` and `radius` make the
  plate (`background` in the VDT, its `color` now optional, `border`, `radiusPx`), painted as a
  design box (outline inside the plate). `kind: 'legend'` (`layout.legend`): the symbol that opens a
  row (its first non-space segment) has its segment widened to the widest such symbol and is centred
  in it (`VDTInlineIcon.insetPx`, `hangLegendSymbols`), so the words of the rows start on one edge;
  a row without one is left as it is. Not in vertical labels. Direction of a label is read past the
  placeholders, so an Arabic row that opens with a symbol is right to left.
- **Scale bars.** Nothing new: the bar is artwork, its numbers are labels at anchors along it.
- **Reading.** `VDTFigureLabel.icons` (placeholder index + alt): `labelPlainText` / `altWithLabels`
  (undrawn labels, reflowable EPUB list) read `[alt]`, nothing for an empty alt; `figureLabelReading`
  joins a legend's rows with `; `. Tagged PDF: a legend is `L` › `LI` › `LBody` per row (`ListNumbering
  None`) in the figure's label `Div`; a symbol with alt is a `Span` with `/ActualText [alt]`, its glyph
  under an empty `/ActualText`; one without is a layout artifact. HTML: `role="img" aria-label`.
- **Outputs.** Canvas `paintInlineIcon` (pictures through the image registry, glyphs through
  `fillContextText`); PDF `paintSwatchSegmentPdf` (`PageCtx.images` for the pictures, which
  `preloadResourceImages` embeds from `resourceBlockIcons`, tinted ones with their stencil; glyph faces
  join the font collection); fixed HTML/EPUB an inline SVG per glyph or stroke, an `<img>` (a mask over
  the tint) per picture; reflowable EPUB glyphs and line samples inline (styled in place, the book's
  stylesheet unchanged), a picture as `[alt]`. Preflight counts the plate's outline and the symbols'
  inks; the part palette recolours the outline (`label:border.color`). The glyph faces a text names join
  `configFontFamilies` / `collectFontUsage` (`iconFontFamilies`).
- **Checks.** `unknownConfigValue` for `align` and `kind`, `unknownConfigKey` inside `border`.
- **Fixture.** `__tests__/composed/fixtures/legendMap.ts`: a political map's key (country ■ in a
  palette colour, capital ⊙, town picture, dashed border), the capital's name with its ⊙ and the
  scale's numbers, in English, Spanish and Arabic (the Arabic key at an anchor whose box grows the
  other way). Parity: VDT hashes of six presets unchanged.
- **Not done.** Symbols in body text; a picture symbol in the reflowable EPUB (read as its name); a
  content warning for an icon naming an unknown resource; single ink on the canvas for SVG symbols (the
  PDF recolours them, as every SVG it embeds); turning back a picture symbol in the HTML of a mirrored page is unchecked. Sandbox (U11),
  docs (D3) and the skill have their own issues.

### 12.14 What C4 built (#1055)

- **The vector block.** `VDTDesignPathBlock`, `VDTPathCommand`, `VDTPathStroke`, `VDTPathMarker` in
  `vdt.ts` as drafted (§12.1), a fifth member of `VDTDesignBlock`. Shared helpers in
  `design/pathBlock.ts` (exported): `pathMarkerOutline` (a dot is a circle `sizePx` across; an arrow a
  triangle whose tip is the point, `sizePx` long along `angle`, its base 0.7 × `sizePx` wide),
  `pathSvgData` / `markerSvgData`, `quadToCubic`, `pathInkBox` (points and control points grown by half
  the stroke, plus markers: for hit tests and clips, not a tight bound), `offsetPathBlock` /
  `translatedPathBlock`, `pathBlockColors`, `recolorPathBlock`, `pathHit`.
- **Painters.** Canvas `renderPathBlock` (moveTo/lineTo/bezierCurveTo/quadraticCurveTo, `fill(rule)`,
  then `stroke` with width, `setLineDash`, cap, join; markers filled on top). HTML: an inline
  `<svg aria-hidden="true">` placed on `bbox` with `overflow:visible` (a mitre past the box still
  shows), the path in the box's own coordinates; fixed-layout EPUB takes the same markup. PDF
  (`pdf-backend/pathBlock.ts`): `m l c h`, a quadratic as its cubic, `f`/`f*`, `S`, `B`/`B*`, `w`, `J`,
  `j`, `d` (scaled to points), alpha through the shared ExtGState; a dot is four cubics, an arrow a
  triangle. Tagged PDF: the slot's artifact like a rule (a Layout artifact on decoration).
- **Other consumers.** `offsetDesignBlock` moves the outline and markers with the box (so spreads'
  `splitSpreadDecoration`, callout overlays and `movedCopies` follow); so does the Sandbox's float shift
  (`HtmlPreview/pageGeometry.ts`, the one other hand-written mover). Preflight: the stroke is a rule
  (`thinRule`, coverage), the fill and the markers are ink (coverage, `nearTrim` for a fill). Part
  palettes (`recolorFrame`, a box frame's overlay): the fill as the frame's fill; stroke and markers as
  its border when the path is filled (a shape), as its rules otherwise (a line). The source map answers
  on the ink only (`pathHit`: fill by its rule, stroke within half its width or 2 px, markers), so the
  empty box of an elbow never takes a click; under a frame it never wins, as rules. Contrast: ignored.
  No `never`-checked switch over design kinds exists; the three painters' final `else` were the only
  compile errors, every other consumer was found by search.
- **Side points.** `ElementAnchor.at` and `ElementSizeTo.edge: 'center'` in `types.ts`; `SidePosition`
  moved out of the draft. Resolution in `layoutDesignSlot` (`alongSide`), so composed decoration,
  running heads, heading and part designs and box designs read it alike. Decisions the design left open:
  - Along the side the element is **centred on the point** (pin `middle`) for every `at`, `'start'` and
    `'end'` included; across the side the edge keeps its pin (`below` hangs under the foot, `bottom`
    stands inside on it). A vertical rule's thickness so straddles a frame's middle with no offset.
    `'bottom'` + `at: 'start'` is therefore centred on the corner, not `bottom-left`.
  - `at` applies to an anchor on another slot element as well as on a frame or group (`'#name'`);
    ignored on `container`, `page`, `bleed`, `outer` and `center`.
  - The element edges read as their side: `below`/`above`/`align-top`/`align-bottom` horizontal,
    `right-of`/`left-of`/`align-left`/`align-right` vertical; corners and `-start`/`-end` forms as
    theirs (logical edges are made physical first). A horizontal side starts on the right when the slot
    starts there (`startRight`: right-to-left and vertical sheets); a vertical side always at its top.
  - A number is held in 0…1; a word other than the three is ignored.
- **Validation.** `collectConfigWarnings` walks every design slot (`configDesignSlots`):
  `unknownConfigValue` at `<slot>.elements[i].placement.anchor.at` (a bad word: `used: ''`, with a
  suggestion; a number outside 0…1: `used` the held value) and at `…placement.size.<axis>.edge`
  (`used: 'fill'`).
- **Not done.** Frames' own placements (`composed/geometry.ts` `anchorOn`) do not read `at`: the design
  names design slots only. No path *element* yet: C5 (connectors) and C9 (path elements) produce the
  block; `applyPaletteOverrides` and `primitiveToBlock` gain their path branch with them. Docs (D3) and
  the Sandbox fields for `at` and `'center'` belong to their own issues.

### 12.15 What C10 built (#1061)

- **Config.** `FrameGroupConfig.kind: 'grid'` with `columns` (default 1), `columnGap` / `rowGap` (default:
  the group's `gap`), `rowAlign` (default `'stretch'`) and `repeat: FrameRepeatConfig { frames, max? }`
  (`composed/types.ts`). `normalizeGroup` adds the grid fields only to a grid, so every other group
  resolves to the same object as before (page memo keys and `layoutKey`s of templates without grids do
  not move). A repeating grid's `frames` are its set (`repeat.frames`); written `frames` are not read.
  A grid that repeats nothing lays the frames it lists, one per cell.
- **Validation.** Repeating grids claim their frames before the other groups: a repeated frame listed
  in another group is `groupFrameTwice` there (the repeat keeps it), a frame the template lacks
  `groupFrameUnknown` at `…/repeat/frames/<k>`; `columns < 1`, an unknown `rowAlign` and `repeat.max < 1`
  are `unknownConfigValue`. Anchors (frames and decoration) to `#<frame>[n]` of a repeated frame are
  valid. No new config warning kinds.
- **Items** (`composed/repeat.ts`, `pageRepeats`). `composedPages` records every slotted piece of a
  page in Markdown order with the slotted pieces one level down inside a `:::frame`
  (`ParsedComposedPage.pieces`). Each piece sent to a frame of a set is one item (a top-level
  `::resource{slot="<member>"}` too, as §12.6 says); inside it a block or container naming another
  frame of the set goes to that instance (a nested `:::frame{slot="<member>"}` without its markers); a
  block naming a frame outside the set stays with the piece, as before. Items past `max` go to the flow
  frame (else after the page) with the new content warning `repeatOverflow` (`template`, `group`,
  `frame`, `item`, `max`, `flowFrame?`, at the item's `slot="…"`), one per item over. A repeated frame
  is never the flow frame and takes no heading (`takes` is ignored on it). `slotEmpty` for a frame of
  a set only when no item fills it.
- **Stories** (`wrap.ts`). One story per instance, `FRAME_ATTR` = `<frame>[n]`, dressed by its own
  item's `:::frame` fence (`label`, `title`), its figure labels' ids rewritten to
  `cp<n>:<frame>[n]:label:<anchor>`. A chain (`next`, `continueIn: '#x'`) among the frames of a set
  threads the item's text through its own instances; a link out of the set is not followed.
- **Expansion** (`expandRepeats`). In `layoutComposedPage` (the entry of single pages, spreads,
  continuation pages and `useTemplate` trials), from the items its stories hold (`repeatItemsOf`), not
  in `composePage`: the ladder then works on instances too. Instances replace the set in template
  order, item after item, main first; they copy the frame (`configPath`, `fieldPaths` unchanged) with
  anchors, `next` and `continueIn: '#x'` inside the set rewritten to the same item (links out of the set
  dropped). Frames and decoration outside the set anchored to a frame *of* the set read the grid's box
  (`#<group>`). The grid gets `frames` = its instances and `items` (cells). On a continuation page the
  items are those it receives, numbered as on the fence's page.
- **Geometry** (`placeGrid` in `composePage`, one group step). The grid's box is its own
  `placement`/`grid`; without one it starts where the template draws the main frame (its own
  placement, kept on the instances for that) and runs to the area's right edge and foot. Columns are
  equal; cells fill rows left to right in flow coordinates, which on a right-to-left page (mirrored
  flow) is right to left. The main frame takes the cell's width and its own height rule (`'auto'`:
  the content's, min/max applied). A member anchored in the set is placed with the cell's column as its
  area (`'fill'` and percentages are the cell's); one anchored to nothing is moved with the cell (the
  set as drawn, translated); one anchored outside the set stays where that anchor puts it and does
  not count for the cell. A row's height is the most any cell reaches above its main frame (a tab) plus
  the most any reaches below its top (a caption pill hanging under it); mains of a row share a top.
  `rowAlign`: `start`/`center`/`end` move shorter cells, `stretch` grows an `'auto'`/`'fill'` main frame
  to the row (up to `maxHeight`). Grid cells give no reflow events (declared = laid). The grid's box for
  `#<group>` anchors is its own box, else the union of the laid cells.
- **Overflow and ladder.** A row past the grid's foot is cut there (every rect clipped to the foot); the
  ladder runs per instance (free, push, pictures of the instance and its own item's frames, text);
  `redistribute` does not apply to grids. Clipped rows warn once: `frameOverflow` on the last instance
  cut, in template order. With the main frame's `overflow.continueIn` off the page, the continue step
  (taken for any instance, by the main frame's `continueIn` and `fit.preferContinue`) adds the grid to
  `FitState.gridsOn`: the first row that does not fit and every row after it are not laid; each of
  their instances that holds a story spills whole (`Spill.whole`), and becomes a
  `ComposedContinuation` with `whole: true`, the main frame's rule, and the item's empty instances as
  `trailing`. `assignReceivers` sends an instance continuation to the instance of its own name on any
  template that repeats that frame. On a received page the step is reverted when no row fits
  (`advanced` = a row was laid), so a cell taller than the box warns instead of going on for ever.
  `link` does not set `continuesTo` for whole items (nothing of them is on the sending page) and the
  receiving instance has no `continuedFrom`; the sending page's log gets a `continued` event per
  instance (`toPage`, `toFrame`).
- **VDT, ids, source map.** `VDTFrame.name` is the instance name, `VDTFrame.repeat = { frame, item }`,
  ids `cp<fence>:<frame>[n]` (`~<k>` on continuation pages). `sourceAt`/`findElement` treat an instance
  as a frame of its grid (`frame.repeat.frame` in the group's frames). Spread sides keep the laid
  record's order. The page memo keeps grid pages (keys unchanged: the expansion is a function of the
  template and the page's content).
- **Decoration.** `#card[2]` resolves through `DesignFrames.named` (instance names); an element
  anchored to an instance the page lacks is not drawn (as for a collapsed frame).
- **Parity.** Templates without grids lay out byte for byte as before: bench-layout hashes of five
  presets equal, composed-page recipes unchanged (see the report of #1061).
- **Not done.** `grow`/`shrink` on rows and a per-row ladder (scaling a whole row's pictures or text
  together); `fitBox` (spread gutter) on grid cells; a chain from a frame outside the set into an
  instance (`next: 'card[2]'` is still `overflowTargetUnknown`); a chain inside a cell whose later link
  has an `'auto'` height measures empty when the grid is solved (as for groups, §5.9); connectors'
  `[*]` (C5); Sandbox (U12), docs (D3) and the warnings docs list.

### 12.16 What C2 built (#1053)

- **Where it runs.** `composed/overlap.ts` (`overlapChecks`, pure), called once at the end of
  `layoutComposedPage` on the composition the ladder settled on (step 8, after `frameOverflow`), with the
  groups' final boxes (`Composition.groupRects`, new). A spread is checked on the whole sheet before
  `layoutComposedSpread` cuts it, so the facing copies never take part; `spread.ts` moves each warning to
  the page that holds its frame, as for `frameOverflow`. The page memo keeps the warnings with the layout.
  Every box goes to the sheet by its frame's `frameMatrix` (scale, turn, own writing mode) and is compared
  as the axis-aligned box holding it; a frame whose content overflows is clipped to its box first.
- **What covers, what is covered.** A frame covers with its overlay boxes that have an opaque background
  (the style's or `look`'s fill, the tab, a stripe, a code highlight; alpha under 50 % does not count; an
  outline alone does not cover), its overlay pictures (icons), its pictures (`bodyRect` of a bitmap, SVG or
  video) and its text lines. What is covered: body lines (`VDTLine.bbox`), caption and note lines, overlay
  text (tab, title, marks: a box from the font size round the baseline), pictures, tables. Departure:
  **words cover words, not pictures** (a line over a photo hides a hairline of it; whether the words read is
  the contrast check's), so text set on art is not reported and lowering a picture under text is a fix.
  A frame whose pictures push with `wrap: 'contour'` does not cover lines with its pictures' box (the
  contour is what keeps them clear). Thresholds: a cut thinner than 0.3 mm on either side is a touch; a
  pair under 1 mm² is not reported.
- **`frameCovered`** (one per pair, the covered frame's source range and page): `coveredBy`,
  `coveredByPath`, `overlapMm2`, `text` (the first covered words, 40 characters) or `picture`, `locale`,
  `proposals`: `layer` (the covering frame's `layer` to the covered one's − 1, proposed only when the
  covered frame has nothing opaque under the covering one: else the swap hides the other), `exclude:
  'push'` (only when body lines are hit: a caption or a tab does not run round a pushing frame), `move`
  (`frame`, `dxMm`, `dyMm`: the shortest shift along one axis that takes the covering ink off the covered
  ink; data only; since #1075 only one that lands clear of the page's other frames, §12.22).
- **`frameOutsideArea`.** Departure: instead of one limit by `area`, **text is checked against the trim
  and fills and pictures against the bleed** (a band anchored to `'bleed'` on a `'content'` template bleeds
  on purpose; text past the trim is cut whatever the area; with no bleed the two are one box). And, for a
  nine-point anchor on `'#frame'` / `'#group'` whose anchor point (offset added) lies inside that box
  (0.5 px slack), all the frame's ink against that box (`past: 'frame' | 'group'`, `target`). Element edges
  (`below`, `right-of`…) and anchor points outside the box are never "inside". Data: `excessMm`, `sides`
  (each side's overrun from 0.3 mm), `proposals`: `maxHeight` (the frame's height less the overrun at the
  foot, whole mm down; twice the overrun for a frame held by its middle, none for one held by its foot,
  which a smaller height does not bring in), `continueNextPage` (with it, for a frame of text with no
  `next` / `continueIn`), `minHeight` of the frame it is anchored inside (its height plus the overrun, whole
  mm up), and, added to the design, `move` (`frame`, `dxMm`, `dyMm`: the shift that brings it in when it
  runs past one side of an axis and is no larger than the box along it; data only), the one fix of a strap
  held by its foot below the trim.
- **`FrameConfig.overlap: 'check' | 'allow'`** (resolved as `overlap?: 'allow'`), validated
  (`unknownConfigValue`, used `'check'`). Decision: `'allow'` also leaves the frame out of
  `frameOutsideArea` (a badge hung off its card on purpose is the same kind of art), and an `'allow'` host
  is not checked as the box a frame is anchored inside.
- **Reflow log.** `ReflowEventKind` gains `covered` (`cause` the covering frame, `areaMm2`) and `outside`
  (`toMm` the largest overrun, `past`: `'trim' | 'bleed' | '#name'`), merged in template order;
  `describeReflowEvent` says «card lies under cutout (25.3 mm²)», «note runs 26 mm past card».
- **Outputs.** `formatWarning` words both with their fixes (`describeFrameCoverProposal`,
  `describeFrameOutsideProposal`, exported); `postext check --json` carries the warning's fields as `data`;
  `WARNING_SINCE` 1.47.0 for both. Not done here: the Sandbox payloads, labels and `sandbox_get_warnings`
  (U13, #1066, which owns the WebMCP coverage of the new kinds); decoration covering a frame of a negative
  layer (decoration is laid after the frames); the cookbook's C37 does not fail on the new kinds (a
  policy for the coordinator).
- **Fixture.** `__tests__/composed/fixtures/overlap/` (config, Markdown, three placeholder pictures): a
  caption under a picture frame on a higher layer, a tab under a cut-out photo, a note anchored inside a
  card that runs past its foot, a strap of text below the trim; `overlap.test.ts` and the CLI test read it.
  The page-8 stand-in (`fixtures/page8.ts`) now reports its photos hanging 1.3–1.8 mm past the foot of
  their boxes; `fit.test.ts` and `groups.test.ts` leave the overlap events out of their reflow
  assertions.

### 12.17 What C9 built (#1060)

- **The element.** `DesignPathElement` moved out of the draft into `types.ts` as drafted (§12.8), a fifth
  member of `DesignElement`, with `ResolvedDesignPathElement` (`resolvePathElement`: id `path-<n>`,
  placement as a box's). Every design slot takes it: composed decoration, running heads (a page
  template's too), heading and part designs, contents part rows, box designs. `applyPaletteOverrides`
  recolours a palette-linked `fill` and `stroke`; on a composed frame's overlay the block is recoloured by
  `partPalette.ts` as C4 left it.
- **Path data.** `design/svgPath.ts` (`parseSvgPath`, `arcToCubics`, `mapPath`, `pathViewBox`; the first
  two exported): `M L H V C S Q T A Z`, absolute and relative, implicit repeats (a repeated move draws
  lines), compact numbers (`M.5.5`, `-1-1`, exponents), arc flags without separators. `H`/`V` become `L`,
  `S`/`T` their full curve with the reflected control point, an arc cubics of at most a quarter turn (SVG
  1.1 F.6: radii scaled up when too small, a zero radius a line, the same point nothing). One pass over
  the characters, no regular expressions; at most 64 KiB of data. Errors: no initial move, a letter that is
  no command, a command short of its numbers, numbers after a close, a flag other than 0/1, empty data.
  Parses are kept per data string (256, cleared whole), so a running head's chevrons are read once.
- **Layout** (`layoutPathElement`): the box is sized and pinned as a box element's (a side left out or
  `'fill'` fills to the container's edge; `{ to, edge }` sizes and `anchor.at` as for every element), the
  outline mapped from `viewBox` units onto it: `'none'` scales each axis, `'meet'` the smaller scale on
  both, centred. The primitive keeps the element's box (what other elements anchor to, what a heading
  reserves); the block's `bbox` is `pathInkBox` (the ink), so a spread cuts, and the source map answers,
  by the ink.
- **Decisions the design left open.**
  - Neither `fill` nor `stroke`: filled black, as an SVG path is. `stroke` alone: no fill.
  - `width` (default 0.5 pt, a rule's) and `dash` are page lengths, not scaled with the box (a stretched
    outline keeps an even line). Caps and joins stay the block's defaults (butt, miter); no `fillRule`
    key (non-zero): neither is in the design.
  - Bad path data or a `viewBox` that is no pair of positive numbers draws nothing, but the element's box
    still stands for the elements anchored to it (a label beside a broken shape stays put).
  - Warnings (`collectConfigWarnings`, every design slot): `unknownConfigValue` at `…elements[i].d`
    (`value` the data's first 60 characters, `used: ''`), at `…viewBox` (`used: ''`), at
    `…preserveAspectRatio` (`used: 'none'`, with a suggestion); `unknownConfigKey` for a key the element
    does not have (the only element kind checked so; the others keep their silence). No new warning kind.
- **Outputs.** No backend change: the block C4 landed paints on canvas, PDF, HTML and fixed EPUB, is an
  artifact in tagged PDF, and is left out of the reflowable EPUB with the rest of the page furniture. Tests
  drive each from a laid-out element (`design/pathElement.test.ts`, the PDF and EPUB packages'
  `pathElement.test.ts`).
- **Sandbox.** `PlacementFields`' `Sibling.kind` is `DesignElement['kind']` (the one compile error); a
  path element shows in the slot editor with the box's title and no editor of its own: U10 (#1063) adds it.
- **Not done.** No `CONFIG_VERSION` bump (C5 owns it, §12.11). No `fillRule`, caps or joins on the element.
  Paths are not rotated, and a path in a vertical page's flow is laid in the flow frame like a box.

### 12.18 What C5 built (#1056)

- **Types.** `DesignConnectorElement`, `ConnectorEnd` and `LineCap` moved from the draft into `types.ts`
  (exported); the connector is a member of `DesignElement` (`ResolvedDesignConnectorElement` of
  `ResolvedDesignElement`). It has no `placement`, so `PlacedDesignElement` /
  `ResolvedPlacedDesignElement` name every other kind; the code that reads `placement` (topological
  sort, logical edges, `withoutAnchoredTo`, the repeat expansion, the page-design migrators) skips
  connectors. `LeaderStyle` (C6) stays in the draft and imports `LineCap`. `CONFIG_VERSION` 16
  (`CONNECTOR_RULES`, no pin: one stored under 15 is read as it is).
- **Where it is laid.** In `layoutDesignSlot`, after every placed element (an end may name another
  element of the decoration as well as a frame, group or instance), and only when the context has frames
  (`frames.named`): the composed decoration. Painted in array order with the rest (layer 0, under the
  frames). Geometry in `design/connector.ts` (`layoutConnector`, pure); the primitive is C9's
  `ResolvedPathPrimitive` with `markers` added (→ `VDTDesignPathBlock`). `applyPaletteOverrides`
  recolours `color`, so part palettes and `:::part palette` follow; the default colour is the main
  colour, palette-linked.
- **Decisions where §12.3 was open.**
  - Default side: the side of the box facing the other box, by the wider clear gap between the two (a
    tie goes vertical), else by the larger distance of the centres. A tree's parent faces the union of
    its children; each child faces the parent.
  - `at` and `start`/`end` read as C4's side points: a horizontal side starts on the right of a
    right-to-left page, a vertical side at its top.
  - `elbow` between perpendicular sides is an L; `trunk` places the middle run (0 at `from`). `radius`
    rounds each bend with a quarter-circle cubic, held to half a segment between two bends and the whole
    of an end segment; a rounded connector joins round.
  - `tree`: the bar stands `trunk` of the way from the parent's point to the nearest child (on the
    trunk's axis); the two outermost points (children, or the parent) hang from the bar's ends as one
    polyline (bends rounded), the others drop straight. **`trunk: 0`** (added): the bar would lie on the
    parent's own edge, under the frame, so none is drawn: a drop from that edge to each child, the start
    cap at the head of each drop (a timeline's ticks).
  - Caps: `startCap` at `from` (a tree's parent; with `trunk: 0` each drop's head), `endCap` at every
    `to`; marks that coincide (a fan leaving one point the same way) are drawn once. An arrow's line stops
    `0.6 × capSize` short of the tip so its end never shows beside the point. Defaults: width 0.75 pt,
    `capSize` 3 × width.
  - `[*]` expands at layout over the instances the page has (`named` keys `frame[n]`, item order); an end
    `#card` on a repeated frame reads the grid's box (`expandRepeats`), as decoration anchors do.
- **Dropped ends.** An end whose box is not in `named` (missing, an instance past the page's items, an
  element dropped with its anchor) or is in the new `DesignFrames.absent` (frames `collapsed`, and optional
  frames with no content: `sourceStart` unset and not continued) is left out with a `connectorDropped`
  layout issue; with no `from` or no `to` left nothing is drawn. `layoutSlotToVdt` hands the issues out
  (`SlotLayoutExtras.connectorDropped`) and the decoration pass logs each as a `ReflowEvent`
  `{ kind: 'connectorDropped', frame: <end>, cause: <connector id> }` on the page laid (a spread's first
  page); a pass that lays the decoration again replaces them. In words: «connector c left out opcional
  (not on the page)».
- **Spreads, right to left.** Nothing new: laid on the sheet with the spread's named boxes, cut by
  `splitSpreadDecoration` (by the ink box) and clipped as the rest; mirrored frames give the geometry.
  Departure: §12.3's «other page of a spread with no `crossGutter` path» is not a drop case: a connector
  between frames of the two pages always crosses the gutter.
- **Validation.** `settleReferences`: `frameAnchorUnknown` at `…/from/to`, `…/to/to` or `…/to/<k>/to` for
  an end on nothing (`[*]` valid only in `to` and on a repeated frame); that end is left out.
  `collectConfigWarnings` (`collectConnectorWarnings`): `unknownConfigValue` for `routing` (used `elbow`),
  `startCap` / `endCap` (`none`), an end's `side` and `at` (a number outside 0…1 is held), and for a
  connector in a slot that is not a template's decoration (`<slot>.elements[i].kind`, used `''`: not drawn
  there). No new warning kinds.
- **Outputs.** Every backend paints C4's path block (canvas, PDF vector paths, HTML/EPUB inline SVG,
  tagged PDF artifact, Folio through the canvas); the source map answers on the ink with the element's
  config path, and never over a frame (C4's `pathHit`).
- **Fixture and tests.** `__tests__/composed/fixtures/connectors.ts`: a three-level food-chain tree, a
  school org chart with two trees, a school-year timeline with drops, in English, Spanish and Catalan (a
  leaf of the Spanish and Catalan trees wraps to two lines). `connectors.test.ts`: routings, caps, gap,
  `at`, pin, part palette, `#foto[*]` over a grid, a spread, right to left, dropped ends, source map,
  validation.
- **Not done.** `ConnectorEnd.anchor` and leaders (C6); Sandbox (U10), docs (D3), skill (S6). Connectors
  inside modules are C11's to rewrite.

### 12.19 What C11 built (#1062)

- **Config.** `PageTemplate.role: 'module'` (`MODULE_ROLE`, `isModuleTemplate`) makes a template a module;
  `FrameGroupConfig.modules: boolean` and `overflow: { continueIn }` (moved out of the round 2 draft into
  `composed/types.ts`). `normalizeGroup` adds `modules: true` (and `overflow` when it continues) only to a
  modules group, which resolves as a `'stack'` with no frames; every other group resolves to the same
  object as before. Validation (`unknownConfigValue`, each ignored): a module's `area`, `header`, `footer`,
  `variants`, `spread`, `gutter`, `overflowTemplate`; a modules group inside a module (resolved as a plain
  stack); a modules group of another `kind` or with `frames`; a group `overflow.continueIn` other than
  `'next-page'` / `'template:<id>'`, or on a group that is no modules group. `extends` between modules is
  the usual `extends` (`role` is inherited, so a template extending a module is a module); a cycle is
  `templateExtendsCycle`, and the module it leaves unresolved is `moduleUnknown` on the page. No new config
  warning kinds.
- **Markdown.** `:::module{template="…" name="…"}` (three colons) is a container (`ContainerName
  'module'`) inside a page fence; outside one it is a plain box of its content. Decision: **the parser
  scopes the slots** of the blocks inside a module (`slot.name` = `<name>.<slot>`, the source range still
  the value as written) and names figure labels by the scoped slot, so `composedPages`, `wrap.ts`, the slot
  checks, label ids and the Sandbox's `pageSites` read module slots as page slots with no change. The
  instance name is `name` when it is free and has no space, `.`, `#`, `[` or `]`, else `<template>[n]`, `n`
  the module's ordinal among the page's modules of that template (named ones counted), the next free one
  on a clash. The fence records its modules (`ComposedPageFence.modules`, `ContentBlock.module`); a
  module inside a module is `nested` (not scoped, its blocks the outer module's). `ParsedComposedPage
  .modules` holds each module's blocks that name no slot and its first headings: they go to the module's
  `takes` frame, else its flow frame, else the page's flow frame.
- **Expansion** (`composed/modules.ts`, `expandModules`). Departure from §12.7: not in `composePage` but in
  `resolvePageTemplate(config, id, { modules })` (cached by the list): the stories (`wrap.ts`), the slot
  checks, the build (`singleOn`, spreads, continuation pages), the decoration (`headerFooter.ts`), the
  source map and the Sandbox all resolve the page's template with the page's modules
  (`VDTComposedPage.modules`), so every reader sees the same frames. Each module's frames, groups and
  decoration are appended to the page's, scoped (`<name>.<x>`); anchors, sizes `to`, `next` and
  `continueIn: '#x'` to the module's own names are rewritten (links out of the module dropped); frames lose
  `flow`, `takes` (kept on `ResolvedModule`) and `grid` (a module has no template grid: a cell reads as no
  placement); decoration anchored or sized to `'container'` reads `#<name>`, the module's box. The modules
  group lists every module frame in module order and `items` (`{ item, frames, module }`); the modules'
  own groups follow the page's, so `groupOfFrames` gives a module frame its modules group and
  `composedOrder` lays the group as one step. `expandRepeats` (C10) then replaces a module grid's set in
  the modules group and its items by the instances (`fotos[1].foto[3]`). A use whose template is unknown or
  no module is left out.
- **Layout** (`placeModules` in `composePage`, one group step). The group's box is its own placement, else
  the area. Each module, in order, gets a box as wide as the group from the foot of the one before
  (`gap` between): its steps (`composedOrder` of its frames and groups) run with that box as the area
  (`'container'`, `'fill'`, percentages), first in the room left with nothing filled, to find its height
  (the union of its frames, those held by the foot or middle or sized by the area's height left out), then
  in a box that tall, filled. The page's own frames before and after see the modules as one group box
  (`#<group>`). Declared boxes follow each other at their declared heights, so a module pushed down by the
  one before logs `moved` like a stack. RTL needs nothing: the flow is mirrored (the tree's left branch is
  on the start side). Module boxes are `VDTComposedPage.modules[].rect` (with `name`, `template`,
  `configPath`), read by the decoration as `#<name>`.
- **Overflow and continuation.** A module past the group's foot is laid with its frames clipped there
  (`clipped`), each runs the ladder (scaling pictures among its module's frames, `peersOf`), and clipped
  frames warn once per modules group (`frameOverflow` on the last cut). With the group's
  `overflow.continueIn` off the page, the ladder's continue step for any module frame (by that rule and
  the frame's `fit.preferContinue`; not on the last continuation page) adds the group to
  `FitState.gridsOn`: the first module that does not fit and every one after it are not laid; their frames
  that hold a story spill whole, each continuation carrying `module` (name and template) and, on the first
  of a module, the module's empty frames as `trailing`. `build.ts` resolves the receiving page's template
  with those modules, so they are laid there under the same names (`cp0:arbol[6].raiz~1`), at the top of
  the group (the page's other frames collapse as on any `'next-page'`). Without the group's rule a module
  frame's own `overflow.continueIn` works as on any frame.
- **Warnings** (content, `WARNING_SINCE` 1.48.0): `moduleUnknown` (`reason`: `'unknown'` id, `'notModule'`,
  `'noGroup'`: the page's template has no modules group; at `template="…"`; its content goes to the flow
  frame and raises no `slotUnknown`), `moduleAsPage` (a fence names a module: set in the flow, as for an
  unknown template; `planComposedPages`, `wrapComposedPages`, `pageFenceIds` and `useTemplate`
  alternatives leave modules out), `moduleNested`, `moduleNameRejected` (`reason` `'taken'` /
  `'invalid'`, `used` the name given instead). `slotEmpty` covers module frames at their `:::module` line.
- **Ids, source map, Sandbox.** `VDTFrame.name` / ids are scoped (`cp0:caja[1].texto`), `configPath` the
  module template's entry; `sourceAt` / `findElement` work through `templateOf` with the page's modules.
  Sandbox (selection only, no panels): the five viewport readers of the page's template pass
  `composed.modules`; `pageSites` reads slots inside `:::module` blocks and lists the modules, and a click on
  an empty module frame writes `:::frame{slot="<own slot>"}` inside its `:::module`.
- **Parity.** Templates without modules groups and pages without `:::module` lay out as before (see the
  report of #1062 for the bench and recipe hashes).
- **Not done.** Modules side by side (a modules group is always a stack; a grid of modules would be a
  follow-up); a module inside a module; template grids (`grid` cells) inside a module; connectors and leaders
  across modules (C5/C6 not landed here); decoration of a module that went on whole is drawn only on the page
  that lays it, and a module element anchored to the page (`'page'`, `'bleed'`) is drawn once per instance;
  Sandbox module library and Design panel entries (U12), docs (D3), skill (S7).
- **Fixture.** `__tests__/composed/fixtures/modules.ts`: a page shell (`tema`: a title and the modules
  group) and three modules (`caja`: a box with a tab and a photo beside it; `arbol`: a tree of three on a
  tinted ground; `fotos`: a heading and a 2 × 2 photo grid), words in Spanish and English;
  `modules.test.ts`.

### 12.20 What C8 built (#1059)

- **Types.** `CornerRadius`, `BorderSide`, `BorderSides` and `BoxSideName` in `types.ts` (out of the
  draft). `CalloutStyleConfig.borderRadius` and `ElementBoxStyle.borderRadius` take a `CornerRadius` (a
  corner left out of the object is square); `CalloutBorderConfig.sides` and `ElementBoxStyle.borderSides`
  give each side `{ enabled?, color?, width? }` over the whole border (a design box's whole border is on
  when it has a colour and a width). `CalloutLabelConfig.joined` / `fillet`. `VDTDesignBoxStyle` gains
  `borderRadiiPx` and `borderSides` as drafted; `borderRadiusPx`, `borderColor` and `borderWidthPx` stay
  filled (the largest radius, the first side's colour, the widest side) for the readers that want one
  value. A style whose corners or sides are all alike is folded back to the plain fields
  (`normalizeBoxStyle`), and a style with one radius and a whole border builds the very object it built
  before, so existing pages keep their VDT and their paint.
- **Geometry** (`design/boxShape.ts`, exported). An outline is a rectilinear polygon walked clockwise,
  each vertex a corner (convex, or concave for a fillet) with a radius, each edge on one side. The
  border's inner edge is the outline with each edge moved in by its side's width: a convex corner's radii
  shrink by the widths beside it (an ellipse when they differ: CSS's inner border edge), a fillet's grow.
  Corners are cubic quarter ellipses. Radii are clamped per edge (two corners never take more than their
  edge, each by its share). A border is one even-odd ring when all four sides have one colour and a
  width; otherwise each side is a closed piece, cut at the corners where the side changes in the ratio of
  the two widths (the whole corner to a side whose neighbour has none, as CSS draws a top border on a
  rounded box), the pieces of one colour filled together. Departure found on the way: a ring whose inner
  edge lies on the outer one (a side without a border) is drawn by PDF rasterisers as a hairline, so it
  is used only for four sides. A border wider than the box fills it, as before.
- **Painters.** Canvas `drawBoxBackground` and PDF `drawRoundedBox` send a box that has
  `borderRadiiPx` or `borderSides` through `boxStylePathBlocks` and the C4 path painter; every other box
  takes its old code. HTML writes `border-radius` with four values and `border-top…` per side (fixed
  EPUB alike). Reflowable EPUB writes the same CSS on the callout rule, the corners and sides of the
  mirrored flow in a right-to-left book as its padding.
- **Joined tab.** `label.joined` lays the box and its tab as one outline (`boxOutline` with a
  `ShapeTab`) and paints it as path blocks marked `boxPart: 'fill'` / `'border'` (with
  `borderWidthPx`), in place of the box block and the tab's own box. Decisions the design left open:
  - The tab stands on the edge, out of the box by its height: `offset` is not read; a non-zero offset
    is `unknownConfigValue` at `label.offset` (used `0`).
  - One fill: the box's `background` (none when `backgroundEnabled: false`); the tab's own
    `background` is not painted. Its words keep the label `color`, so a joined tab on a white card sets a
    dark label colour.
  - The tab's outer corners take the radius of the box's corner it hugs; the fillets `fillet`, default
    that radius. Beside an `inset` smaller than corner plus fillet, the fillet is held to half the room
    and the box corner to the rest; an inset under 0.5 px is flush: the side runs straight up into the
    tab (no corner, no fillet there).
  - "Every position": `CalloutLabelPosition` gains `bottom-right`, `bottom-left`, `bottom-start`,
    `bottom-end`, for plain tabs too (a `bottom-` tab is the top one turned over: its foot `offset` below
    the box's, the block taller by what hangs below, the `rule` along the foot). No left or right side
    tabs: the words of a tab are horizontal.
  - Per-side borders run round the tab with the side it stands on; a flush tab's outer side is the
    box's side it continues.
  - The stripe stays clipped to the box rectangle with the outline's corners: square where a flush tab
    goes on up the side.
  - The glyph and picture icons, the rule and the words are laid as before.
- **Tab corners (#1102).** `label.borderRadius` (a `CornerRadius`, the sheet's corners) gives the tab
  corners of its own. A tab apart from the box is a box block with `borderRadiiPx` (one radius on every
  corner folds back to `borderRadiusPx`), so the painters draw it through `boxOutline` as they draw a
  box with corners of its own; unset, the tab stays square. A joined tab reads the two outer corners
  (`topLeft` / `topRight` at the head, `bottomLeft` / `bottomRight` at the foot) into
  `ShapeTab.radius` as a pair, the corner at `x0` and the one at `x1`, each clamped to half the tab's
  width and its height less the fillet as the single radius was; unset, both copy the box corner the tab
  hugs. The fillets keep `fillet`, default the box corner.
- **A joined tab in its own fill (#1102).** `label.ownBackground` paints `tabRegionOutline` (the tab,
  its outer corners and the fillets flaring into the edge, closed along the edge; the same clamped
  geometry as `boxOutline`) in the label's `background`, as a `boxPart: 'fill'` path between the box's
  fill and the border, so palettes and the contrast check read it as a fill.
- **Drawn icons and tints (#1120).** `kind: 'shape'` on a box's `icon`, its `marker` or `label.icon`
  draws a ring or a dot (`design/iconShape.ts`): a path block marked `drawnIcon`, a dot one filled
  circle, a ring two circles filled even-odd, its line `strokeWidth` (an eighth of the size by default).
  A label tab's shape stands where a glyph would, `scale` of the words' size. `tint` on a resource icon
  (box, marker, tab) is `true` (the icon's colour, a tab's words' colour) or a `ColorValue`, so a
  palette link follows the palette; a tinted picture drops its PDF print master, as #995 did. Part
  palettes recolour a drawn icon and a tinted picture with the frame's text role.
- **Readers.** Part palettes recolour each side's colour as the border, a joined fill as the fill and
  its border pieces as the border; a frame's `look` border colour recolours every side; preflight checks
  each side (and a joined border) as a rule; the contrast check reads a joined fill as the ground; the
  overlap check (C2) counts a joined fill as fill and its border as an outline; design palettes
  (`applyPaletteOverrides`) override side colours. Comic panels dressed by a box style take the largest
  corner. `keepChromeAt` scales sides and `fillet`.
- **Validation** (`collectConfigWarnings`): `unknownConfigKey` for corner keys, side keys and side
  fields of callout styles and of design boxes (`style` of a box element, `box` of a text element);
  `unknownConfigValue` for a label `position` outside the eight and for a joined tab's offset. No new
  warning kind.
- **Fixture.** `__tests__/composed/fixtures/cards/` (`cardShapes.test.ts`): a card with its title tab
  grown out of it, a box with a top border only, a box rounded on two corners, a joined tab flush at the
  top right and one hanging from the foot, a decoration band rounded on top and ruled at its foot.
- **Not done.** Sandbox fields for per-corner radii, per-side borders and the joined tab (the Callout
  and box editors show a per-corner radius as 0 until U10, #1063); docs (D3); a split box's fragments do
  not square the corners where it continues (as before); a joined tab in the reflowable EPUB is a plain
  tab.

### 12.21 What U13 built (#1066)

The Sandbox side of C2 (§12.10, §12.16), C10's `repeatOverflow` (§12.15) and C3's glyph tab icon (§12.9,
§12.12).

- **Checks panel.** `frameCovered` and `frameOutsideArea` are layout warnings of the Sandbox
  (`warnings/compute.ts`, by book page) and composed checks (`composedChecks.ts`): listed by page, frame
  and edition, filed with the typesetting; `repeatOverflow` (read from the source, as the slot checks) is a
  composed check filed with the markup. Titles and details in the panel's words in all ten site languages
  (`warnings/frameOverlapText.ts`): the covered words or picture, the area hidden, what the frame runs past
  and by how much, the fixes, and the `overlap: 'allow'` way out.
- **Canvas.** Selecting an overlap check (a jump of the Checks panel, a frame of the Reflow panel) sets an
  overlap focus (`editions/overlapFocus.ts`) that the canvas draws in the overlay
  (`viewport/composed/overlapMarks.ts`) until another check is selected or a fix is made:
  for `frameCovered` the covered frame's box (blue, dashed), the covering frame's (red) and the rectangle
  where the two meet; for `frameOutsideArea` the frame, the box it runs past (trim, bleed, host frame, or the
  union of the group's frames as laid) dashed, and a band on each side it runs past as deep as the check's
  `sides`. Decision: the boxes are the frames as laid (a turned frame by the upright box holding it), not
  the ink boxes the engine measured, which the VDT does not keep; the meeting rectangle can so be larger than
  `overlapMm2`. A spread's trim and bleed are not drawn (its sheet is cut at the spine).
- **Fixes.** Every proposal of the two checks is a one-click confirmed change in the Checks and Reflow
  panels, one step of the undo history, as `frameOverflow`'s (#868): `layer`, `exclude`, `maxHeight`,
  `minHeight` set the value at their pointer. Departures: **`move` is made**, as the moved frame's
  `placement.offset` with the shift added (in mm; an offset in cm, in or pt is converted), and is only told
  in words for a frame with no placement or an offset in ems or percent; a template with recto/verso
  variants that mirror offsets is not special-cased. **`continueNextPage` of a `frameOutsideArea` also sets
  the `maxHeight` it comes with** (alone it does not bring the frame in). On the fixture every proposal of
  the four checks removes its check (`frameOverlap.e2e.test.ts`).
- **Reflow panel.** `covered` and `outside` events in words («figure lies under photo (25.3 mm²)», «note
  runs 26 mm past card»), short marks `▨ 25.3 mm²` / `⇥ 26 mm`; the fixes listed under each frame the events
  name (`frameFixChecks`). The p. 8 stand-in's test asserts the real lines (the photos' overruns) again.
- **WebMCP.** `sandbox_get_warnings` lists the new kinds with their data (`coveredBy`, `overlapMm2`, `text`,
  `picture`, `past`, `target`, `excessMm`, `sides`, `locale`; `group`, `item`, `max`, `flowFrame`) and
  numbered fixes in the engine's words; `sandbox_apply_proposal` takes any check of a frame with fixes
  (`check`, `coveredBy` to choose) and answers `fixed` (and `fits` for an overflow). No new tool.
- **Glyph tab icon.** The box style editor's label group has a kind switch (picture / glyph); a glyph tab
  shows its glyph field, a row of common symbols (◉ ● ○ ■ □ ▲ ★ ✓ ✎ ➜, toggle buttons named «Use ◉»), face,
  weight, size (`scale`), colour (the words' when unset), placement and gap; switching to a glyph with none
  set writes ◉. The resolved fields already passed `settings.test.ts`. Search index regenerated.
- **Not done.** Pointing at a frame in the Reflow panel does not draw the overlap (a click does); the
  Folio does not draw it.

### 12.22 What #1075 changed (C2 finding)

- **A `move` lands clear.** Before #1075 the `move` of `frameCovered` was the shortest shift along one axis
  that took the covering ink off the covered ink, whatever lay there: on the overlap fixture «move cutout
  8.5 mm up» uncovered the card's tab and covered the figure's caption. Now each proposed shift is tested
  on the page by the check's own rules (`tryMove` in `overlap.ts`): the moved frame, and every frame
  anchored to it (transitively: they move with it), against every other frame painted before or after
  them, with the same ink, paint order, thresholds and `'allow'`/contour rules. A move is offered only when
  the pair is cleared, no pair that had no warning comes to cover (pairs already warned may stay), and no
  moved frame runs further past the trim, the bleed or the box it is anchored inside than it did (0.5 px
  slack). Lines of a frame that a pushing frame covers are left out of the test: they run round it where
  it lands.
- **Direction.** All four directions are tried, each from the distance that takes the covering boxes off
  the covered ones; when the moved frame would land on another frame's ink, the move goes on past that
  ink and is tested again (up to 8 times); a direction stops when the pair is not cleared or a frame runs
  past what holds it. The smallest clear move wins (ties: right, left, down, up). The value is rounded
  away from zero to 0.1 mm, so the proposal never falls short of what was tested. On the fixture the
  cut-out now moves 13.1 mm right.
- **No move.** None when no direction lands clear, and none when the covered frame is anchored to the
  covering one (they move together). The warning then offers `layer` / `exclude` where they apply, and
  `overlap: 'allow'` as before; on the fixture the photo anchored inside the figure has no fix left (every
  way off the caption takes it out of the figure).
- **`frameOutsideArea`'s `move`** goes through the same test: it is dropped when the shift that brings a
  frame in would make it cover another frame or be covered by one.
- **Data unchanged.** `FrameCoverProposal` / `FrameOutsideProposal` keep their shape (`frame`, `dxMm`,
  `dyMm`, a shift added to the frame's placement offset), so `sandbox_apply_proposal` and the panels read
  them as before. Proposals are data: no layout moves.
- **Not done.** The test does not reflow: text pushed round a moved frame (`exclude: 'push'`) is assumed to
  run clear, and a group's box is not recomputed when a member moves.
- **Tests.** `overlap.test.ts`: every offered fix on the fixture (`layer`, `exclude`, `move`, `maxHeight`,
  `minHeight`, `continueNextPage`) applied as the Sandbox applies it clears its warning and raises no new
  pair; the move off the tab goes right, not up onto the caption; a move goes on past a frame it would land
  on; no move when every way out is blocked, nor when the covered frame hangs from the covering one.

### 12.23 What C6 built (#1057)

- **Types.** `LeaderStyle` moved into `types.ts` (exported); `ResourceAnchor.labelAt` / `.leader` and
  `LabelStyle.leader` are in the real types; the C6 part was the last of `round2Types.ts`: the draft file is
  removed. `LeaderStyle` has two keys the draft lacked: `capSize` (default 3 × width, as a connector's) and
  `routing: 'straight' | 'elbow'` (default `straight`). VDT: `VDTFigureLabel.leader` (the attribute) and
  `VDTFigureLabelLayout.leader: VDTFigureLabelLeader` (point, routing, stroke, caps, cap size, gap). No
  `CONFIG_VERSION` bump: only new optional keys.
- **Connector ends at a picture's anchor.** `DesignFrames.anchorPoint(frame, anchor)` (filled by the
  decoration pass in `headerFooter.ts` from each frame's blocks) answers with the point of the first
  bitmap or SVG block of the frame whose resource has the anchor, through `figureAnchorPointOnPage`
  (`composed/labels.ts`): `pictureToBody` (crop, safe area) on the body's box *on the sheet*
  (`flowRectToPage`), so the ladder's scale, mirrored pages (a picture is painted the right way round) and
  vertical pages (upright pictures) need nothing more; a quarter-turned block goes through its turn. On a
  spread the point takes the right page's shift with the frame's box. The end is a box of no size at the
  point; `at` is not read, `gap` stops the line short of the point.
- **Decisions where §12.4 was open.**
  - The side of an end at a point with no `side` written: the line arrives on the axis it leaves the other
    end by (a note's side gives a horizontal last run), from the side the other end stands on; a tree's
    point children arrive against the trunk. The connector's default (`facingSide`) turned the last run
    vertical whenever the point was further down than across, which ran a note's pointer through the map.
  - A point its frame cuts off (outside the frame's box on the sheet: a picture pushed past the frame's
    foot) is not pointed at: the end is dropped as `connectorDropped` (reflow log), with no warning.
  - Unknown anchor: `labelAnchorUnknown` with `connector` and `frame` added (no new kind, so no
    `WARNING_SINCE`); `resourceId` is the frame's first picture, empty when the frame holds none on the
    page; that end is dropped. A non-string `anchor` is `unknownConfigValue` (`collectConnectorWarnings`).
  - Connectors stay in the decoration layer (0). To point *into* a picture its frame goes under the
    decoration with `layer: -1` (the fixture does so). Raising a connector over the frames was not added,
    for the reason given in §5.18 (two decoration paint items in every backend).
- **Labels away from their point.** `labelAt` (fractions of the whole picture, any finite numbers) moves the
  label's frame origin; `align`, `verticalAlign` and `rotate` place the box about it. Which labels get a
  leader: the label's attribute (`leader`, any value but `none` / `false` / `off`; `leader="none"` turns it
  off), else the anchor's `leader` (`true`, an object, `false`), else a label set away from its point whose
  style has a `leader` look. The look is the style's `leader` under the anchor's object, field by field;
  colour by default the label's text colour (the part palette recolours it by `label:leader.color`, then by
  the label's colour); width 0.75 pt; end cap `dot`, no start cap.
- **Leader geometry** (`figureLabelLeaderPath`, laid when painted, not stored as a path). In the label's own
  frame: the box (the plate, else the lines' box) grown by a gap (0 with a plate, 0.25 em of the label's set
  size without); the side with the wider clear gap to the point (as `facingSide`), at its middle; straight to
  the point, or an elbow out of that side square with one turn onto the point. Leaving by the facing side
  keeps the line off the label's words, a turned label included (the points go through the label's matrix).
  A point under the grown box, or a line shorter than its cap, draws nothing. Because it is laid from the
  layout, `keepLabelsOffGutter` and `mirrorLabelLayout` / `unmirrorLabelLayout` / `labelLayoutOnSheet`
  (which reflect the point about the body as the rest) keep it on target. Caps and the polyline reuse the
  connector's `capEnd` and `polylineCommands`.
- **Paint.** `figureLabelLeaderPaths(rb, bx, by)` gives C4's path blocks, painted before the figure's labels
  (under every plate and halo): canvas `renderPathBlock` (Folio through it), PDF `renderPathBlock` under a
  Layout artifact (the structure tree is unchanged), HTML and fixed EPUB the design path's hidden inline SVG
  inside the figure's label markup, the reflowable EPUB paths in its label layer for the labels it draws.
  Preflight checks the line as a rule (`thinRule`, coverage). `labelOverlap` ignores leaders (they are not
  label boxes): a leader across another label is not reported.
- **Validation** (`validatePageTemplates`): `unknownConfigKey` / `unknownConfigValue` inside
  `labelStyles[i].leader` (caps, routing) and `resources[i].anchors[j].leader` (also a value that is neither
  a boolean nor an object), a `labelAt` that is not a point (`unknownConfigValue`) or has other keys. The
  anchor checks run when an anchor has `labelAt` or `leader` too.
- **Fixture and tests.** `__tests__/composed/fixtures/mapParts.ts`: the parts of a map (a painted map, its
  title, key and scale as labels, three notes joined to them, two names with leaders) in English, Spanish
  (longer notes) and Arabic (mirrored), and a spread variant. `leaders.test.ts`: connectors on target in two
  languages, under the ladder, right to left, across a spread, on grid instances, cut-off and unknown
  anchors; `labelAt`, straight and elbow leaders, attributes, style looks, mirroring, canvas and HTML paint,
  validation. `postext-pdf` `figureLeader.test.ts`; the reflowable EPUB's `labels.test.ts`.
- **Not done.** A connector over the frames without `layer: -1`; a connector that ends at a label's box (it
  ends at the anchor's point); the leader of a vertical label on a mirrored page is drawn from the mirrored
  layout (right on the sheet by construction, not covered by a test); frames painted unmirrored on a
  mirrored page (#960) read their blocks' boxes through the page's flow like any other (unchecked). Sandbox
  (U11), docs (D3) and the skill (S6) have their own issues.

### 12.24 What U12 built (#1065)

The Sandbox side of C10 (§12.6, §12.15) and C11 (§12.7, §12.19): grid groups and modules edited in the
Design panel, a module library, and two reshapes that move a port of one-off frames to them.

- **Grid groups.** The groups editor's kind is stack / row / grid; a grid shows columns, column and row
  gaps (the group's `gap` when unset), `rowAlign` and «Repeat a set of frames»: the main frame (a select
  of the frames no other group holds), the frames that go with it (checkboxes) and `max` (0: none). A
  repeating grid hides the plain member list (its `frames` are not read). A group can be switched to «Takes
  the page's modules» (`modules: true`, kind and members cleared) with «goes on to the next page»
  (`overflow.continueIn: 'next-page'`).
- **Modules in the template editor.** A «Module» switch sets `role: 'module'` (and clears area, spread,
  gutter, running heads, overflow template, variants); a module's editor hides those fields and the
  template grid. The Page templates list tags modules. Renaming a module's id rewrites the `:::module`
  blocks that name it (a page template's, the `::::page` fences, as before).
- **Module library** (Design › Page & columns › Modules, section `modules`): every module drawn by its
  sheet, its id and «N blocks on M pages» (`moduleUsage`, read from the Markdown of every chapter: blocks,
  pages, by chapter, the page templates holding it); «New module» (one `text` frame); Edit opens the template
  editor in place on the module; Insert writes `:::module{template}` with an empty `:::frame{slot}` per
  frame (none for a `takes` frame; a grid's set as one empty item with its members inside) before the
  closing fence of a composed page of the chapter in the editor (a select, the page at the caret first),
  puts the caret in its first slot, and adds a modules group to the page's template when it has none
  (under its last frame, `width`/`height` `'fill'`, 6 mm gap). Decision: the library lists module
  templates only; a template that is used as page and module is not distinguished.
- **Instances on the canvas and in the Markdown.** Design mode already names instances by their `[n]`.
  `pageSites` now also lists the slotted pieces one level inside a `:::frame` (`within`), left out of
  `sitesOf`; with the page template's repeat sets (`repeatSetsOf`) a site is read as its instance
  (`instanceOfSite`: the n-th top-level piece of the set, as `pageRepeats` counts) and an instance as its
  site (`siteOfInstance`). A click on `card[3]` puts the caret in the third item, on `caption[3]` in the
  caption written inside it, or writes an empty `:::frame{slot="caption"}` inside the item; the caret in
  an item marks its instance. Every viewer's pick reaches the template editor through `selectFrame`, which
  now opens the template frame that draws the pick (`templateFrameOf`: `card[2]` → `card`, a module frame
  `caja[1].nota` → frame `nota` of module `caja`). Departure: the canvas frame editor's drag handles are
  not drawn on an instance or a module frame (a drag would move every copy; the panel edits them).
- **«Turn into a grid»** (`templates/framesToGrid.ts`, «Reshape frames» in the template editor, base scope,
  not on spreads or modules). The frames picked are split in cards and what hangs from each by their names
  without the number (`foto1`/`foto2` one kind, `pie1`/`pie2` another; the cards are the first kind none of
  whose frames hangs from a frame of another kind; a member goes with the card of its number, else the card
  it hangs from, else the nearest); the lattice is read off the first laid page of the document on screen
  set with the template (tops within 0.6 mm make a row, starts make columns, equal widths, one column gap,
  full rows but the last, one row gap measured as the engine measures rows: reach above the card plus reach
  below its top). The grid repeats the first card's set renamed without the number when free, `rowAlign:
  'start'` (so a shorter card keeps its height), its box the first row's start, as wide as the columns, to
  the area's foot, anchored as the first card was when that hangs by its top-left (`below`, `right-of`,
  `align-top`, `align-left`, or `top-left` of the area), else at the area's top-left. Anchors elsewhere to a
  card or a member point at its instance (`#foto2` → `#foto[2]`); groups lose the cards (and go when empty).
  Every page set with the template gets one item per card, in reading order (`:::frame{slot="foto"}` with
  the member written inside it; a card written as a block is wrapped when it has members). Refusals are
  worded in the panel (too few, inherited, not laid, flow or `takes`, already repeated, off the lattice,
  widths, members differ).
- **«Extract a module»** (`planExtractModule`). The frames picked, a group (stack, row or grid) all of whose
  frames are picked, and the decoration anchored to them (a connector when both ends are) move into a new
  module after the page template; frames anchored outside the selection are placed at their laid offset in
  the module's box (percent widths and `'fill'`/percent heights fixed to the laid size). The page template
  gets a modules group where they stood: as wide as their union, anchored as the topmost frame was (same
  rule as the grid) else at the area's top-left, `height: 'fill'`, or the union's height when something
  else hangs from a moved frame; what hung from a moved frame hangs from the group, its offset shifted by
  as much as that frame's edge stood from the group's (`edgeShift`). Every page set with the template gets
  the pieces of the moved frames wrapped in one `:::module{template}` where the first stood (an empty block
  when the page wrote none, so the module is still laid). Refused: a template with a modules group already
  (stacking a second extraction is not done), a grid picked in part, flow / `takes` frames, a module.
- **Page looks the same.** `templates/reshape.e2e.test.ts` lays a page of five one-off photo cards (with
  caption pills) on a three-column lattice and a box with a tab and a picture, turns the cards into a grid,
  extracts the box into a module, and compares every frame box before and after (within 0.3 px) under its
  new name (`foto2` → `foto[2]`, `nota` → `caja[1].nota`), alone and both on one page.
- **Undo.** Both reshapes, a module insert, rename and create are the chapters' text changes (one step per
  chapter) then one design step (`applyTemplateRewrite`), as a style merge; «Reshape frames» offers Undo
  while they are the latest steps.
- **Checks.** `moduleUnknown` (each reason worded), `moduleAsPage`, `moduleNested`, `moduleNameRejected`
  are composed checks of the Checks panel (filed with the markup, as `repeatOverflow`), with titles and
  details in the ten languages, the Cookbook warnings registry explains them, and `sandbox_get_warnings`
  gives their data.
- **WebMCP.** `sandbox_modules` (modules with frames, groups and uses; page templates with their modules
  group), `sandbox_create_module`, `sandbox_rename_module`, `sandbox_insert_module` (chapter, page fence
  ordinal; `groupAdded`), `sandbox_frames_to_grid` and `sandbox_extract_module` (the boxes read off a laid
  chapter; answers the old → new names), each answering its `undoSteps`. None is consequential.
- **Not done.** A frame hanging from a moved frame keeps the shift measured on the page read (the group then has a fixed height): on a page where the moved frames come out at other heights it follows the group's box (an anchor from a page frame to a module's frame, `#caja[1].nota`, is not resolved by the engine; worth an engine issue). A second module extracted into an existing modules group; reshaping inherited frames or a
  variant's (variants are only retargeted); right-to-left and vertical pages are read in their flow frame
  but not tested; the Folio and HTML viewers reach instances through the same pick path but have no test of
  their own; a canvas multi-selection (the frames are picked in the panel).

### 12.25 What U10 built (#1063)

The Sandbox side of C4's side points (§12.14), C5's connectors (§12.18), C9's path element (§12.17) and
C8's box shapes (§12.20): all of them are edited in the Design panel and on the canvas without JSON.

- **Connectors.** The decoration of a page template (the slot editor given the template's frames and a
  `connectorHost`) has «Add connector»; a new one runs from the template's first frame to its second as an
  elbow. Its card (`ConnectorElementEditor`): the start in a list of the template's frames, groups and the
  decoration's placed elements; the ends as a row of toggle buttons (pressed: an end), with every instance of
  a repeated frame as `#card[*]` and an end on a name the list lacks (an instance `#card[2]`, a frame taken
  out) still listed so it can be taken out; per end (start and each `to`) its side («Facing» when unset),
  point on the side (start, middle, end or a fraction, shared with the placement fields) and gap; routing,
  bend radius and bar position (not on a straight line), colour (palette-aware, default the main colour),
  width, dash, start and end marks and the mark size (shown when a mark is set, default 3 × width), pin,
  parity and pages. The edits are pure (`templates/connectorEdits.ts`): a list of one end is written as an
  object, several as a list.
- **Picking on the page.** «Pick on the page» (a toggle button) sets the template editor's connector focus
  (`editorStore.connector`, phase `from`) and turns the Design mode on. On a page of that template (or one
  extending it) a click on a frame is an end, not a drag (`frameEditor.ts`): the first sets the start, and
  the ends start afresh; each later click adds an end or takes it out again; Shift-click adds or takes out an
  end in either phase; a click on the start itself does nothing; Escape (or the button) ends the picking. A
  live line under the button says what the next click does. Decisions: re-picking the start clears the ends
  (the issue's «pick a frame and then its targets»); a line never goes to its own start (setting the start
  takes it out of the ends). The write is one step of the history.
- **Handles.** While a connector's card is open its ends are drawn in the Design mode marks: a filled dot at
  the start, a ring at each end, and while picking the frames joined outlined (solid the start, dashed the
  ends). Geometry in `templates/connectorHandles.ts`, the engine's rules (default side facing the other end, a
  tree's parent facing the union of its children; `at`, `gap`), in the flow frame (`start` is its left: a
  right-to-left page's flow is the sheet mirrored). `facingSide`, `CONNECTOR_ROUTINGS`, `CONNECTOR_CAPS`,
  `CONNECTOR_SIDES` and `DEFAULT_CONNECTOR_WIDTH` are now exported by `postext`. The e2e test builds a tree of
  three connectors and a joined card with these edits and checks every handle lies on the engine's line.
  Departure: the handles show in Design mode only (the marks layer); they are not draggable (an end is moved
  by picking or by its fields).
- **Shapes.** «Add shape» in every design slot writes a bar filled with the main colour. Its card
  (`PathElementEditor`): presets bar, ribbon (a band with a pointed head and a notched tail), arrow, chevron
  and wave, each a toggle button with its outline drawn, writing `d` in the default 1 × 1 view box (and
  taking a `viewBox` off); the path field checks the data with `parseSvgPath` as it is typed and writes it only
  when it parses, saying at which character it goes wrong (`role="alert"`, `aria-invalid`); view box width and
  height, fit (stretch / keep proportions), fill and outline switches with their colours, outline width and
  dash; size (lengths or `{ to, edge }`), placement, parity and pages as a box's.
- **Corners and sides.** One component pair (`shapeFields.tsx`) for callout and frame styles (the frame
  styles section reuses the style card), decoration boxes and a text element's box: «Same radius on every
  corner» (off: four corner lengths, each starting from what it showed; on again: the largest) and «Same
  border on every side» (off: per side a switch, colour and width over the whole border's, each with its
  reset; a side switched to the whole border's state takes its own `enabled` off). On a callout style the
  sides are offered whether or not the whole border is on (a border on the top only is `enabled: false` plus
  a side). The callout card shows a per-corner radius for what it is (the 0 that `uniformRadius` gave is
  gone).
- **Tabs.** The label group has «Joined to the box» and, when joined, the fillet radius (default shown: the
  corner radius); turning it on writes `offset: 0` (a joined tab is on the edge, C8 warns on another) and
  the rise field is hidden. The position list has the four foot positions (left and right named by the flow,
  as the top ones).
- **Placement.** Decoration elements can be anchored to the template's frames and groups (they were only
  reachable through a size); a name the lists lack stays shown. On an anchor to another element or a frame
  the «Point on the side» field writes `anchor.at` («the edge's own point» when unset, start, middle, end, a
  fraction). The size-to edge offers the middle (`'center'`).
- **WebMCP.** No new tool: everything above is configuration `sandbox_set_config` writes. A gap found on the
  way: a per-corner `borderRadius` was refused as «a length»; `coerceSetting` now takes an object of corner
  keys, each coerced as a length. `connectorShapes.test.ts` draws the tree, the shape, the corners, the sides
  and the joined tab through the tools and writes every new leaf back unchanged.
- **Words.** 103 new labels, one changed (the size-to edge tooltip names the middle), in the ten site
  languages; the settings search index regenerated.
- **Not done.** Connector ends on a module's frames (`#tree[1].left`) are not listed (typed through the tools
  only). The handles are not drawn outside the Design mode nor in the Folio. Dragging an end along its side
  to set `at` is left for later.

### 12.26 What #1076 changed (C6 finding)

- **The key.** `DesignConnectorElement.over?: boolean`: the line is painted after every frame of the page.
  Default (`connectorPaintsOver`, `design/connector.ts`): `true` when an end as written (`from` or any `to`)
  has a non-empty `anchor`, else `false`; read from the element, not from the ends the page keeps, so a
  dropped end does not move the line to another layer. `over: true` raises a plain frame-to-frame
  connector, `over: false` keeps a pointer under the frames. A value that is not a boolean is
  `unknownConfigValue` at `…/over` (`used` the default). No `CONFIG_VERSION` bump: one new optional key.
- **One slot, two paint items.** §5.18 rejected a `layer` on decoration elements because the decoration
  would become two paint items in every backend. The decoration stays one slot in the VDT
  (`VDTComposedPage.decoration`): the connector's path block carries `over: true`
  (`VDTDesignPathBlock.over`, set by the layout through `ResolvedPathPrimitive.over`), and only the paint
  order knows the rest. `composedPaintOrder` appends a `{ kind: 'over' }` item after the last frame when
  the slot has such a block (never otherwise); `decorationUnder(slot)` (the slot itself when nothing is
  over, so nothing is copied) and `decorationOver(slot)` (undefined when nothing is over) give what each
  item paints, `paintsOverFrames(block)` the test (`connectorPaintsOver` is exported for editors). With `part` (`'below'` / `'above'`, a page painted
  through a flow frame) neither decoration item is listed: the caller paints `decorationUnder` on the
  sheet between the two calls and `decorationOver` on the sheet after the `'above'` frames. What reads the
  slot as data (preflight's thin-rule and coverage checks, the part palette, the spread cut, the font and
  image collectors, the Sandbox's page geometry) reads it unchanged.
- **Backends.** Canvas (`renderComposedFrames`, `renderComposedDecoration(…, 'over')`; Folio through
  it), PDF (`paintComposedItems`; the flow-frame branch paints the over part on the sheet after the
  frames, under the same Layout artifact mark as the rest of the decoration, so the structure tree is
  unchanged and the artifact comes later in the content stream), HTML and fixed EPUB (the over part in
  its own `pt-frame-decoration pt-frame-decoration-over` box with the last `z-index` of the paint order;
  through a flow frame, on the sheet after the decoration; `decorationHtml` includes it for patchers).
  `composedReadingOrder` reads the over item with the decoration, first: it holds no content. The
  reflowable EPUB reads frames only. Contrast skips the over item (lines are not a ground; the slot is
  walked once with the decoration item, as before).
- **Source map.** `sourceAt` reads the paint order backwards, so the over item is hit before every frame:
  on its ink (C4's `pathHit`) the connector answers inside the picture's frame; the decoration item hits
  only the blocks that are not over (indices stay the slot's, so element ids do not change).
- **Checks.** `frameCovered` reads frames only, so a connector over a frame's text or picture is not
  reported (a test pins it); `labelOverlap` is unchanged.
- **Fixture.** `fixtures/mapParts.ts` lost its `layer: -1` (single page and spread): the map frame is at
  the default layer and its pointers paint over it. With `layer: -1` patched back the lines are the same
  paths and still painted last (`overConnectors.test.ts`).
- **Parity.** A book without anchored connectors and without `over: true` has no `over` mark and no over
  item: its VDT and its output in every backend are unchanged (bench-layout hashes, the composed recipes'
  vdtHash). On a page whose connectors end at anchors the paint order changes (they move from layer 0 to
  last) and the VDT gains the mark; where the picture's frame was at `layer: -1` the look is the same.
- **Tests.** `overConnectors.test.ts` (default and both overrides, paint and reading order, canvas left to
  right and right to left, HTML z-index and the flow-frame page, source map, `frameCovered`, validation);
  `postext-pdf` `connectorOver.test.ts` (stroke after the picture left to right and through the mirrored
  flow, before it with `over: false`, a Layout artifact when tagged).
- **Not done.** Other decoration elements over the frames (a rule or box that should sit over a photo
  still needs the photo's frame at a negative layer); an over connector between frames of different
  layers is painted over both, never between them. Sandbox (U10/U11), docs (D3), skill (S6).

### 12.27 What U11 built (#1064)

The Sandbox side of C6 (§12.4, §12.23) and C7 (§12.5, §12.13): leaders and pointers, legends and inline
symbols, edited without writing JSON.

- **Label away from its point** (anchor editor, the picture marks dialog's Anchors mode). Each anchor has a
  «Label and leader» group: a switch sets the label away (`labelAt`, one step up and right of the point,
  turned back inside the picture near an edge) and its place in % of the picture. On the picture, a label set
  away has a handle where it stands (a tag with its words), the anchor picked a dashed grip beside its point;
  either is dragged, or focused and nudged with the arrow keys (Shift: five steps), and Delete sets the label
  back at its point (`MarkTarget` kind `label`, `pictureMarks.ts`). The line from the handle to the point is
  drawn live, solid in the style's colour when a leader will be drawn (`leaderDrawn`, the engine's rule:
  label attribute, else anchor, else away with a style look), dashed white when not. Decision: the dialog
  keeps `labelAt` inside the picture (0..1) like the points; the engine reads any number, and a value set
  outside it by hand or by a tool is kept.
- **Leader per anchor.** «As the style / On / Off» writes `leader` unset / `true` (an object kept) / `false`;
  with On, routing (straight, elbow) and the mark at the point (dot, arrow, none) write the anchor's own look.
  Colour, width, dash and caps of a look are the label style's (below); the anchor offers only these two.
- **Leader per label.** Every `::label` / `:::label` set at the anchor is listed with «As the anchor / On / Off»,
  which writes `leader` / `leader="none"` into the chapter's Markdown at once (`editor/labelAttrs.ts`
  `setLabelAttr`: the other attributes kept as written, scanned by hand), one step of the history; it is the
  text's, so it is not part of the dialog's Cancel or Undo. The dialog's lists now read the container form
  too (`figureLabels.ts`; its lines shown joined by « / », symbols left out).
- **Canvas.** A label set away from its point shows a line to the anchor's point and the point (Design
  mode); dragging it moves `labelAt`, no longer the anchor (before this, the drop wrote the label's place
  into the anchor's point). Alt held while dragging a label at its point sets it away the same way. The point
  of an anchor whose label is away is moved in the dialog.
- **Pointers** (`templates/pointerEdits.ts`). A pointer is a connector of the template's own decoration with
  one `to` end that names an anchor. On a composed page in Design mode the selected frame has a round grip
  beside the middle of its end side; dragging it shows every anchor of the pictures in the page's other
  frames (`frameAnchorsOnPage`, through crop, safe area, scale and turn as labels are) and a drop near one
  writes `{ kind: 'connector', from: { to: '#note' }, to: { to: '#map', anchor }, routing: 'straight',
  endCap: 'dot' }` (id `pointer-<frame>-<anchor>`), or keeps the one already joining the two. The frame's
  properties have a «Pointers» group, the keyboard's way: each pointer's frame and anchor (anchors of the laid
  pages, else typed), remove, add. Decisions: a pointer leaves the picture's frame at its layer: since #1076
  (§12.26) a connector with an anchor end paints over the frames by default (the first version of this
  lane set the frame to `layer: -1`, as §12.23 needed then); pointers are written on the page's template (every page it lays draws them; a page whose picture
  lacks the anchor gets `labelAnchorUnknown`), never on a variant; an inherited pointer is edited on the child
  under its id and removed by hiding it (`{ id, remove: true }`). The grip is not offered on a turned frame.
- **Connector card (U10's, #1063).** Each end has «Anchor of the picture»: the anchors of the picture the
  end's frame holds on the pages laid with the template (an anchor the pages lack is kept and named as such),
  or «None: a side of the box»; with an anchor the point-along-the-side field is hidden (the engine does not
  read `at` then). The canvas handle of such an end is drawn at the anchor's point (`connectorHandles`
  takes an `anchorPoint` reader; the frame editor gives it the page's anchors taken into the flow frame),
  where the engine ends the line. Instances (`#card[2]`) and groups offer no anchors.
  An «Over the frames» switch writes `over` (#1076); unset, it shows the default `connectorPaintsOver`
  gives (on when an end stops at an anchor) and says why under it.
- **Label style editor.** Plate group: outline (`border`, starting as a 0.5 pt line in the text colour),
  corner radius. New «Lines and key» group: `align` (as the anchor places it / start / centre / end) and
  `kind: 'legend'`. New «Leader» group: on (`leader: {}`), colour (shown as the text's while unset), width,
  dash (solid, dashed 3/2 pt, dotted 0.75/1.5 pt; another pattern shows as «Custom» and is kept), start and
  end caps, cap size, routing.
- **Symbol picker** (text editor toolbar, `editor/IconPicker.tsx`). A picture of the book (bitmap or SVG
  resource), a glyph (a row of ten common map symbols, or any typed, with an optional face) or a line sample
  (solid, dashed, dotted); colour (a swatch or a hex / palette id typed), size in ems (0: the default),
  the words a reader hears; the directive is shown and written at the caret (`iconDirective`). It is offered
  everywhere in the text; the engine reads it in labels and resource snippets only (§12.13).
- **WebMCP.** `sandbox_edit_labels` (new, not consequential): `leader` (a label's own attribute, by
  resource and anchor or text), `icon` (a symbol at the start or end of those labels), `pointer` (add,
  change by id, remove). `sandbox_save_resource` takes `labelAt` and `leader` on anchors (checked). The
  label style keys go through `sandbox_set_config` as before.
- **i18n, search, AAA.** 84 strings in all ten languages; settings search index regenerated. Every new
  control is labelled; the dialog's label handles and grips are 44 px targets that the arrow keys and Delete
  work on; the leader's state is said in words under the choice. The canvas grip of a pointer is a mouse
  target, as the frame editor's handles are (it takes no touch); the frame's «Pointers» group is the way
  for the keyboard and for a finger.
- **Tests.** `mapNotes.e2e.test.ts` builds a parts-of-a-map page with these edits only (three pointers, a key
  style, two names away with leaders, a label's own `leader="none"`) and checks on the laid page that each
  pointer ends on the anchor's point as the Sandbox locates it, the leaders and the legend; `labelAttrs`,
  `pointerEdits`, `labelLeaders` (marks, panel render), `webmcp/tools/labels.test.ts`.
- **Not done.** Leaders and pointers in the Folio's label editor (its pages take the canvas editor's drop,
  but the grip of a pointer is the frame editor's, which the Folio does not have); a pointer's look (colour,
  width, routing) has no fields of its own yet beyond what the design JSON says; the anchor's leader colour,
  width and dash are the style's only; the picker does not check that the caret is in a label.

### 12.28 What R8 built (#1069)

The Cookbook side of round 2: three recipes reworked and one new, each in all its editions.

- **Nº 158 (timeline).** The six one-off cards (`c1`…`c6`) and the twelve decoration elements that drew a
  dot and a tick per card are one card frame per band, repeated by a `grid` (three columns, placed in the
  template grid's cell), and one `tree` connector per band with `trunk: 0`, a `gap` under the band and a
  `dot` start cap, whose `to` is `#asia[*]`. Departure from the recipe's old teaching: the cards no longer
  trade width (`shrink` in a `row`); a longer text grows its row and `rowAlign: 'stretch'` levels the row.
  The hollow dot became a filled cap (connectors have no outlined marker).
- **Nº 157 (atlas).** The dashed line of section left the painted SVG: two `straight` connectors (a paper
  casing under a dashed ink line, no alpha on connector colours) between two unlabelled anchors of the
  map's picture; since #1076 no `layer: -1`. The locator sheet `extends` the sheet, removes the key frame
  and carries its key as a `kind: 'legend'` label (`:::label` container, `:icon` rows: a tinted square SVG
  resource and a dashed line sample). The section names its valley and plain with `labelAt` and a style
  `leader`. Borders, towns, peaks, the scale and the north arrow stay in the map's SVG (map data; scale
  bars stay artwork, §12.5).
- **Nº 156 (children's unit).** Photos, course boxes and the boxes with a picture are grids (the picture
  of a box written inside its `:::frame` as a member of the set); the three questions with their answer
  lines are a module stacked by the page's modules group; each course box points at its stretch of the
  river with an `elbow` connector to a map anchor, the three runs kept apart by their `trunk`; the spring
  and the dam are named away from their places with leaders (`flipped` mirrors `labelAt` too). The
  pointers are left out of the vertical editions.
- **Nº 162 (new, `org-chart-from-modules`).** An org chart stacked from a department module (a box, a
  grid of services, a `tree` to `#servicio[*]`, an `elbow` from the page's mayor box) and a page of photo
  galleries (module: heading + grid repeating photo and caption, a module-sized ground) with a notice
  module whose tab is `joined`. Spanish and English.
- **Engine fix found on the way.** A module's connector naming a frame of the page that stacks it was
  `frameAnchorUnknown` (validation reads the module alone) and lost its end before layout; such ends are
  now kept for module templates and dropped at layout with `connectorDropped` when the page lacks the
  frame (`settleReferences`, `moduleConnectorPage.test.ts`).
- **Cookbook tooling.** The lint (`detect.ts`) and the capture probe (`lib/probe.js`, C8) read a figure's
  `:::label` container.
- **Findings, not fixed.** In a vertical (`vertical-rl`) grid whose set has a picture anchored to the
  box's corner, rows came out wider than the boxes and the last cell's picture was scaled by the ladder;
  Nº 156 sets `rowGap: 0` for those editions. A connector has no colour alpha (a cased line needs an
  opaque casing). The recipes pin postext 1.48.0: until the release, the published ones fail the
  repository's engine-pin and stale-capture tests, and are captured from npm after it.

### 12.29 What D4 built (#1068)

The guides of round 2, in the ten site languages, with screenshots of each interface language.

- **Composed-page books** gains steps 8–11 on the textbook recipe's book, after the review page of
  step 3: a module `tree` (a root, a grid repeating `branch`, one tree connector to `#branch[*]`)
  inserted into the review page from the module library; a page `map-notes` whose notes point at
  anchors of `rio` (the copy of the map with no anchors, so the spread's names do not move), with a key
  (`:::label` in a `kind: 'legend'` style, `:icon` rows) and one name set away with a leader; a page
  `photos` with a grid repeating `photo` + `caption`; the library and how a series shares it (Duplicate,
  design Export/Import, or a shared module file in code); and a closing section on the rule that the
  Markdown says what and how many, the design draws each thing once. Section 2 now names the box styles
  the recipe has (`dato`, `actividad`).
- **Moving a book to composed pages** gains lines in a picture → connectors and pointers, and one-off
  frames → **Turn into a grid** / **Extract a module**, on a sample bundle
  (`apps/web/public/docs-examples/river-places-before.postext`, built by
  `apps/web/scripts/docs/cards-sample.mjs` from the recipe's paintings at 360 px).
- **Sandbox: composed pages** gains Connectors and shapes, Leaders, pointers and keys, Grids and modules
  (the library and both reshapes), Overlaps and glyph tabs.
- **Screenshots.** `apps/web/scripts/docs/capture-composed-shots.mjs` (puppeteer-core, a running
  `next dev`, one `<locale>-d4.localhost` origin per language) builds each step's state through the page
  tools and opens the panels by their labels in that language: tree, modules, map-notes, leader, grid,
  overlap, glyph-tab, reshape under `public/docs-shots/<locale>/`. The book is the English edition except
  for es and ca, as the guides' links open it. The older shots of steps 2–7 were taken on an earlier
  version of the recipe (green `dato-campo`) and were not retaken.
- **Gaps found (Sandbox, not fixed here).** The frame editor has no `overlap` field, so `overlap: 'allow'`
  (a caption pill hung over its photo, a badge off its card) cannot be set without JSON; the guide's grid
  hangs its caption below the photo instead. The module library's drawing of a module with a repeating
  grid draws the grid's main frame at the module's top-left, over the root.

### 12.30 What S6 built (#1070)

- **Where.** The porting skill only (`plugins/postext/skills/postext-port/scripts`): `pdf_regions.py extract`
  writes a page's line art and furniture as vector decoration of its template, with the geometry in a new
  module `line_art.py` (pure functions over millimetres, tested without a PDF). No engine change.
  `--raster-ground` keeps round 1's output (one JPEG ground per page, no connectors, no path elements,
  empty boxes as frames); the CLI, the file layout and every other output stay as they were.
- **Lines.** A stroke-only path of `l` items, at most `--line-width` (2 pt) wide, each piece straight across
  or down (pieces under 0.5 mm dropped: rounded corners drawn as short lines), not closing a rectangle, is a
  *line*: it is taken out of box candidates and picture clusters before either is read. A three-sided
  bracket (a tree's bar and drops) was read as an empty box frame holding the children, and its strokes went
  into the ground; both stopped. Pieces of one look on one line merge; pieces that meet form nets.
- **Reading a net** (`read_net`), in this order:
  - *Trees.* A segment with two or more perpendicular segments running off one side (drops) and exactly one
    off the other (the trunk) is a bar. The parent is the first frame the trunk reaches walking away from the
    bar (through other bars: two bars on one trunk, as a two-level diagram draws them, are two trees of one
    parent); each child the first frame its drop reaches (a walk stops at another bar, so the upper tree does
    not take the lower one's children). A trunk drawn under a frame on its way (a box of the middle row) makes
    that frame the parent of the bar below, which paints the same. `trunk` is the bar's place between the
    parent's point and the nearest child's; `at` is written when a point is off the side's middle by more
    than 0.3 mm, `gap` when a line stops short of its frame. A drop that reaches no frame and the bar beyond
    the outermost child are left as lines.
  - *Elbows.* Two or three segments end to end between two frames; the sides are the ones the line leaves
    and meets by, so two segments give the engine's L; `trunk` places the middle run of three.
  - *Straight runs.* Any other segment is cut at the frames it passes: one `straight` connector per run
    between two frames (a line through a row of pills behind a photo becomes pill to photo to pill, which
    paints what the source shows), the stubs that reach no frame left as lines.
  - *Pointers.* An end more than 2 mm inside a picture or figure frame whose line was painted after the
    picture there (the page's paint order, `get_bboxlog`; a photo placed after the line covers it) is an
    anchor end: `{ to: '#picture', anchor: 'pointer-N', side }`, the side the last run arrives from, and the
    point becomes an anchor `pointer-N` (fractions of the cut picture's box) of that picture's resource,
    after its label anchors. Such lines (and every line drawn as decoration that crosses a picture cut from
    the page) are redacted from the picture's cut. A line under a photo ends at the photo's side.
  - A drop is taken as far as its child's far edge; what runs on past it (a pill's line down to the photo
    under it) is read again as a straight run. A frame-to-frame run drawn over a picture it crosses (paint
    order, as for pointers) gets `over: true`. Lines inside a picture that touch only it and frames set on it
    (a map's scale bar, its key's samples) stay the picture's art.
  - Left lines covered whole by an opaque frame (a filled box or tab, a picture) are dropped; the rest are
    one `path` element per look (`lines-N`).
- **Furniture.** In paint order: the page's colour (`page-colour`, a box anchored to the bleed with `fill`
  sizes when the fill covers the trim; a box or path otherwise), the cards (`card`: a box with per-corner
  radii read from the corner curves, C8; a card with one tab of its colour standing on its top edge is one
  C9 path outline, flush sides straight, and that tab's frame style loses its background), borders, loose
  shapes (`shape-N` paths, consecutive paths of one look joined), lines, connectors, then the running heads
  and folios as before. Translucent shapes, even-odd fills with holes and pages with more than
  `--max-paths` loose shapes keep those shapes in the raster ground.
- **Borders with no words.** A box frame with no lines of its own and no tab words is no frame: its holder's
  children move to the holder's parent, and a decoration box (`border-N`) is anchored to the top-left of
  the first frame it holds and sized to a box of no size (`border-N-end`) anchored off the foot of the last
  one, so the border grows with what it holds (the engine's `{ to, edge }` sizes have no margin of their
  own: the helper carries the far padding). One inside a picture is the picture's art (the cut has it).
  A box whose only words are its tab becomes such a border plus a tab frame with the words (unless it lies
  on a picture: an inset keeps its labelled frame). A fill the render check calls hidden (a tinted folder
  mostly covered by its photo and white panel, only a ring showing) is still drawn: as a shape under the
  frames, and in the comparison.
- **The raster ground.** The page without its text is compared at `--ground-dpi` with the same page's paths
  redrawn on a blank page (every drawn path but the ones left to the raster), outside picture frames and
  opaque frames; what differs after a one-pixel opening (photos behind the page, art a card clips off a
  picture, shadings) is the ground: a transparent PNG (`{rid}-ground.png`), under the cards when the page
  has a page-size image, over them otherwise. Fewer than `--ground-min-px` pixels (60): no ground, no
  `ground=` attribute and no image element. `regions.json` gains `decoration` (counts per kind, ground or
  not).
- **template_dedupe.py.** `rename_in_template` renames every reference of a decoration element
  (`element_refs`: the anchor, `{ to, edge }` sizes, connector ends); a shared base keeps a decoration
  element only when the base has every frame and element it names (`element_targets`).
- **Departures.** §12.4's leader of a *label* (`labelAt`, `::label{leader}`) is not written: a source's
  pointer from a note box is a frame-to-anchor connector; labels on the picture stay at their points.
  Arrowheads are not read (a dot at a line's end is: a filled round path under 3 mm centred within 0.8 mm
  of the end becomes `startCap` / `endCap: 'dot'` with its diameter as `capSize`, and leaves the picture's
  cut). Diagonal lines and curves stay shapes or art. A drop that leaves the page (a spread's bar) is kept as a line on this page only.
- **Tests.** `tests/test_line_art.py` (segments, trees, two-level trees, elbows into a picture, a line under
  a photo, runs through pills, gaps, path data, the card outline) and `VectorDecorationTest` in
  `tests/test_pdf_regions.py`: an invented diagram page (page colour, card with its title tab, a tree, a
  drawn map with a note pointing into it, two pills and their line, a border round two boxes, a loose rule)
  checked element by element, the pointer gone from the map's cut, no ground, `--raster-ground` unchanged,
  dedupe renames, and with `POSTEXT_CLI` the draft passes `postext check` without unknown keys, values or
  anchors.

### 12.31 What #1081 and #1082 changed (D4 findings)

- **`overlap` in the frame editor (#1081).** The template editor's frame properties have a switch «May
  overlap on purpose» after **Layer**, in the frame's look: on writes `overlap: 'allow'`, off `'check'`,
  reset takes the field off. Its help names the two checks it silences (*Frame under another frame*,
  *Frame runs past its edge*). Labels in the 12 places, search index regenerated.
- **The Checks panel's way out is a fix.** Both overlap checks now end their fixes with a Sandbox-only
  proposal `allowOverlap` (`AllowOverlapProposal { frame, path }`, `warnings/frameOverlapText.ts`;
  `allowOverlapOf` / `fixesOf` in `proposalActions.ts`): `overlap: 'allow'` at the pointer the check names,
  one confirmed click and one undo step like the others, in the Checks and Reflow panels and in
  `sandbox_apply_proposal` (listed after the layout's fixes, so their numbers do not move). Decision: for
  `frameCovered` it goes on the **covering** frame (`coveredByPath`: the one laid over on purpose, a caption
  pill over its photo), for `frameOutsideArea` on the frame itself. The engine's payloads are unchanged;
  the detail sentence «set overlap to allow» stays.
- **Repeating grids drawn in their cells (#1082).** `templateSheet` (every template drawing: the module
  library, the Page templates list and the editor's sheet) lays a repeating grid's set as `placeGrid` does,
  on the template alone: the grid's own box (its placement, resolved against the frames' drawn boxes, so a
  grid `below` an `'auto'` root starts under the root's drawn height), else from the main frame's drawn
  place to the area's right edge and foot; equal columns, the main frame the cell's width and its height
  rule; members anchored in the set placed with the column as their area, members anchored to nothing moved
  with the cell, members anchored outside the set drawn once where the template puts them; row heights by
  reach above/below the main frame, `rowAlign`, cut at the foot. Decision: it draws a row of items, at least
  two (to show the repeat), at most `repeat.max` (`sketchItems`). `SheetFrame.instance` numbers the copies;
  only the first copy of a frame is a button in the editor's sheet (one name, one keyboard stop).
- **Not done.** A frame outside the set anchored to a frame of the set is drawn from the template's place
  of that frame, not from the grid's box (as the engine reads it); right-to-left cells are not mirrored;
  the drawing does not read a laid page. The composed-page-books guide's grid still hangs its caption under
  the photo (D4 chose that for want of the switch); a docs follow-up can now show `overlap: 'allow'`.

### 12.32 What #1079 changed (R8 finding)

- **Caps.** `LineCap` gains `'ring'` (a hollow dot centred on the end, stroked in the line's width) and
  `'bar'` (a stroke across the line at the end, in its width), for connectors and leader looks alike
  (`CONNECTOR_CAPS`, so `collectConnectorWarnings` and `checkLeader` accept them with no new code).
  `VDTPathMarker.kind` gains both and `widthPx` (the stroke of a ring or a bar; a marker without one
  strokes at a tenth of its size). Decisions: a ring's **outer edge** is `capSize` across, as a dot's
  is, so swapping a dot for a ring keeps the mark's size (the stroke's middle is `(capSize − width) / 2`
  out); a bar is `capSize` long, square-cut. `pathMarkerOutline` returns the two new outlines;
  `markerSvgData` traces them, `markerSvgElement` (exported) writes a marker as a filled or stroked
  `<path>` for HTML, fixed EPUB and the reflowable EPUB's label layer. Canvas strokes them solid
  (`setLineDash([])`, butt), PDF strokes them in their own `q … Q`. `pathInkBox` and `pathHit` (on the
  ring's stroke, not its hole) follow.
- **Where the line stops** (`capInset`, `design/connector.ts`). A ring: where the line's corners meet
  the ring's outer edge (`√(R² − (w/2)²)` short of the centre), so nothing shows in the hole and the
  overlap is a sliver under the ring's ink; a bar: at its inner side (`w / 2`), no overlap and no gap.
  For a **translucent** colour only, a dot stops the line at its edge in the same way and an arrow at its
  base (instead of `0.6 × capSize` inside it), so no spot is inked twice; opaque dots and arrows lay out
  as before (no VDT change for existing books). `capEnd` takes the line width as a new last argument.
- **Alpha.** Nothing was needed for `#rrggbbaa`: `ColorValue.hex` carries it from the config to the path
  block (EF-30), canvas and SVG paint it as a CSS colour and the PDF's `colorFromHex` → `alphaStateOp`
  sends it through the shared ExtGState (`ca` for fills, `CA` for strokes). Added: `opacity?: number`
  (0…1) on `DesignConnectorElement` and `LeaderStyle`, times the colour's own alpha
  (`colorWithOpacity`, exported; `#rgb`/`#rgba`/`#rrggbb`/`#rrggbbaa` → `#rrggbbaa`, other forms
  unchanged). Why a key and not only the colour: a palette-linked colour (the connector's default main
  colour included) takes the palette entry's `hex`, which would drop an alpha written beside it, and the
  Sandbox's colour picker has no alpha. A connector applies it in `layoutConnector` (after
  `applyPaletteOverrides`); a leader keeps it apart in `VDTFigureLabelLeader.opacity` and applies it in
  `figureLabelLeaderPath`, because the part palette's remap matches the leader's stroke colour as written.
  Validation: an `opacity` outside 0…1 is `unknownConfigValue` with the held value as `used`, a value
  that is not a number `used: '1'` (`opacityWarning`, at `…elements[i].opacity` and in a leader look at
  `…/leader/opacity`). No `CONFIG_VERSION` bump: one new optional key.
- **Translucency within one block.** A connector's lines are one stroke (one `S` / `stroke()` / `<path>`),
  so a tree's bar and drops do not darken where they meet; each mark is painted on its own, so two
  marks that overlap ink that spot twice. A cased line is two connectors (a wide pale one with `opacity`
  under a dashed one, `over: true` to sit on a picture).
- **Sandbox.** The connector editor's start and end marks offer Ring and Bar (a list now: five marks do
  not fit a segmented row) and an Opacity field (0–100 %) under the line colour; four new labels and the
  mark-size tooltip in the ten site languages. U11's leader look (label styles) takes the same marks (a
  list) and Opacity field, the anchors panel's end mark the two new marks; they reuse the connector's
  labels. The docs say «since postext 1.49» (1.48.0 was out before this landed).
- **Docs.** `configuration-composed-pages` (connector table: `opacity` row, alpha note, the new caps and
  sizes, checks; the label style's `leader`) and `composed-pages-figures` (leaders), ten languages.
- **Not done.** The atlas recipe's casing and a timeline with rings belong to R8 (#1069, the Cookbook);
  the skill (S6).

### 12.33 What #1078 changed (R8 finding)

- **The finding.** On a vertical page a grid of a box and a picture anchored inside it (the frame set
  `uso` + `uso-foto`) laid its rows (columns on the page) wider than the boxes, and the ladder scaled the
  last row's picture down. `placeGrid` was not at fault: it measures a row in the flow frame, where the
  block axis is `y` as on a horizontal page, from the cells' frame boxes. The picture's frame was wider
  than the picture it held.
- **Cause.** A picture in a frame of a vertical page stands upright (#971): `uprightIn` hands the box
  `uprightMaxLength`, the room across the lines. The natural measure (`naturalOf`) gives it the area's
  whole extent and the frame takes the height the picture settles at (a bitmap at its size). Laid in that
  box (`fill`, `uprightMaxLength` = the frame's height), the callout layouter took off a line's gap above
  the picture and one below it (`inlineResourceGapInBoxes`) although the box sets neither for its first
  block nor for its last; the picture came out two lines smaller and the frame kept the measured height.
  Any `'auto'`-height frame holding only a picture showed it (a grid only made it visible: its rows add
  the empty room up, and the last row went past the foot).
- **Fix** (`calloutLayout.ts`, where a resource child is measured with `uprightMaxLength`): the gaps taken
  off are the ones the box sets, `st.prevMarginBottom` alone above its first block (as its spacing is) and
  nothing below its last real child (`isLastRealOf`). Measure and fill now agree; the grid's row measure
  is unchanged and counts what the cells show.
- **Parity.** Horizontal pages never pass `uprightMaxLength`: no change (bench-layout hashes of the
  presets, the composed recipes' horizontal editions). Vertical pages change wherever a picture is the
  first or last block of a box whose room across the lines bounds it: the picture grows by up to two lines
  to the size its frame was laid for (frames do not move). bench-layout hashes of six presets are equal,
  the two vertical ones (Kokoro, Hongloumeng) included: their pictures are not bounded so. Of the
  composed recipes only Nº 156's Chinese and Japanese editions change (the contents' map, the field map,
  the pictures beside the boxes): there the pictures beside the boxes now stand at their size and reach
  past their boxes, which is what their 44 mm frames ask for (below).
- **The recipe.** With pictures at their size, a 44 mm `uso-foto` (along the lines) on the vertical
  editions holds a 720 × 540 px painting at 330 ppi at 55.4 × 41.6 mm: 8 + 55.4 mm across the lines, past
  the 52 mm box, so the row is honestly 63.4 mm and three of them do not fit 184 mm with any `rowGap`.
  The vertical editions get the template's 8 mm back when the picture stands inside its box: a 30 mm
  frame (`PIC = CJK ? 30 : 56`) sets the paintings 40 × 30 mm (`gridVertical.test.ts` reproduces the
  frame set: rows 8 mm apart, no picture scaled); the same `PIC` keeps the `cuidar` box's picture
  (52 mm box, `turno` 8 mm after it in a stack) from reaching the next box.
- **Not done.** A frame narrower than its picture needs along the lines still sets the picture in it as
  before (the column bounds the upright height, `UPRIGHT_MIN_PICTURE_SHARE`); no warning for a picture
  that hangs past the box it is anchored in (the overlap checks of C2 see frames, not their anchors).

### 12.34 What S7 built (#1071)

- **Where.** The porting skill only: `template_dedupe.py` runs a fold (new `scripts/template_fold.py`, pure
  functions over the templates, the measured boxes and the Markdown) after it merges the styles and the grounds
  and before it merges the templates. No engine change. It needs `regions.json` and templates one per page as
  `extract` wrote them (else it is skipped and the report says why); `--no-grids` / `--no-modules` turn either off.
- **Boxes.** Read off the draft as the engine lays it when given (`--laid FRAMES`, written by the new
  `render.mjs --frames`: every composed page's laid frame boxes in mm), else off `regions.json`. Decision: the laid
  boxes, not the measured ones, are the reference, because the extract's stack and row groups already move frames
  off their measured places (on a real textbook 129 of 367 frames by more than 0.3 mm), and the fold must keep the
  page as the draft lays it.
- **Grids** (C10, after U12's «Turn into a grid»). Departure from U12: nothing is picked; every set of frames of
  one look (kind, style, layer, rotate, optional; widths within `--lattice-tol`, 1 mm) is tried, largest first, no
  frame in two grids. A lattice: tops make rows, starts make columns, full rows but the last, one column gap, one
  row gap measured as the engine measures rows; one height rule (cards whose own `minHeight`/`maxHeight`/`height`
  differ while their laid heights differ are no lattice; laid alike, the main frame takes the smallest laid
  height); no other frame of the same or a higher layer with its centre among the cards (two boxes of one width
  far apart with others between them are no grid), frames hanging from a card excepted. Members, unlike U12, are
  found by geometry, not by names: a frame above, below or inside a card (centre over it, within 5 mm), one of
  each look per card, that every card has and that hangs the same way (offsets within the tolerance). Anchors:
  `top-left` off the card (above, inside), `below` the card (under it); members as wide as their words and
  centred over cards of one width become `top` / `bottom` with `width: 'auto'`, the narrowest width as `minWidth`
  and the widest as `maxWidth`. Cards with no members need `--grid-min` (3) cards. The grid's box is the first
  row's reach from the first card's start, as wide as the columns, `height: 'fill'`, `rowAlign: 'start'`,
  anchored as the topmost frame of the first card was (U12's rule). A row or stack group left empty is dropped
  and what hung from it hangs from the lowest card of the last row (a frame `below` a row of photos). Names:
  `grid` (`grid-2`), the set `grid-<kind>` (`grid-picture`, `grid-box`), never positional, so the role naming
  after it leaves them.
- **Modules: the page is a shell** (C11, after U12's «Extract a module»). Departure from U12: the whole page is
  read, not a picked set, every frame goes into a module and modules are shared across pages, so a page template
  is a shell (no frames, one modules group, the furniture) and pages differ only by their Markdown and their
  `:::module` blocks. Units: union of a containment parent (`regions.json`), anchors to another frame or group, a
  group's members, the frames an element reads (through the elements it reads: a border and its size helper), a
  `next` / `continueIn: '#x'` chain, and all flow and `takes` frames together (one module takes the pieces that
  name no slot). Bands: units side by side joined, top to bottom. The group: `modules: true`, `gap: 0`, at the
  area's top-left, `size: fill × fill`. A module: the band's frames anchored inside it as they were, the rest at
  their laid place with `x` from the area's left and `y` from the module's top plus its `lead` (the band's distance
  from the laid foot of the band before, the first band's from the area's top), so each frame lays where it laid
  and a band that grows pushes the ones after it (percent sizes and `'fill'` heights fixed); the band's groups; the
  decoration whose targets are all in the band (iterated) and every element the page paints at a fixed place inside
  the band's box (re-anchored to the module), so paint order holds (the engine paints a module's decoration after
  the page's). The rest of the page's own decoration (its card, a band of colour) goes with the first module as it
  is, anchored to the page. Frames named `<kind>-<n>` in the module (role names follow), elements
  `deco-<kind>-<n>` (an element id like `box-1` would be taken for a frame by the role naming). Modules alike
  (same frames by name, `frame_diff`, `_group_equal` and `element_diff` within `--module-tol`, 0.5 mm, tighter
  than the 3 mm of page templates, since a module's offsets are where its frames lay) are one template,
  `module-<what it holds>`. Page: one `:::module{template}` block per band, holding the band's pieces (container,
  leaf and `{slot}` heading pieces, and for the flowing text's module every piece that names no slot) with their
  slots renamed, where the first moved piece stood; instance names `<template>[n]` as C11 numbers them. Parity rule
  found on the way: a module frame outside a group of its own runs the ladder with its whole module as peers (it
  scales the module's pictures; on the page it scaled only its own), so a box or text frame that stood in no group
  gets `fit.scaleImages: false` in its module when the module holds pictures.
- **Furniture** (what the shell keeps). `mark_furniture`: an element (no frame anchor, no plain words) painted
  alike within 0.5 mm on every page of a side (by the folio's `parity`), or on every page with a folio, is renamed
  `furniture-N` on each page and kept to its side (`parity`), or to every page when it is alike on both. With it,
  `is_furniture` keeps the page colour (a box to the bleed), running heads and folios (`{pageNumber}`,
  `{attr.x}`) and a ground read from a fence attribute. A furniture element stays on the shell while nothing the
  page painted before it moved, or when its box meets nothing that did (marks under 25 mm² do not count): the shell
  paints under every module, so a running head painted over the page's card stays only off the card, and an
  attribute ground painted over the cards goes with the first module. In dedupe, an element reading `{attr.x}` is
  joinable like a parity one (it draws nothing where the fence sets no such attribute), and a one-line text set
  flush to the side it is anchored by is one element whatever its width (`text_width_free`; the widest is kept).
  Departure from the coordinator's plan (title tab as an `auto`-width frame drawing its own tab, card as a box,
  `'auto'` heights on the shell's text): with every frame and the card in the page's modules, nothing per-page is
  left in the shell, so the card keeps its outline with the tab grown out of it (the concave fillet at the join
  included) and the text keeps its measured height; nothing moves.
- **The rest of dedupe.** Module templates are kept out of the template merge and the shared base;
  `rewrite_markdown` follows `:::module` blocks (their slots by the module's renames) and nested containers;
  `rename_in_template` also renames group anchors and grid sets; `rename_module_refs` keeps page references into a
  module in step with the module's role names. The report gains `grids`, `modules` (with their uses), `after.grids`
  / `after.modules` and `pages`: per extract template, every frame's old name → the name on the laid page
  (`grid-picture[3]`, `module-box-picture[1].picture-in-box`).
- **Checking.** `template_dedupe.py DIR --compare-boxes BEFORE AFTER [--box-tol 0.5]` reads two `--frames` files and
  `pages`, and lists every frame that moved or is missing; `compare_pages.py --score [FILE]` gives round 1's
  likeness (grey, blurred 2 px, mean difference, share over 40) per page, and reads `postext images` PNGs too.
- **A real textbook** (28 pages, round-1 port 27 templates for 28 pages). After the fold: 2 page templates, one
  shell for the 25 body pages (page colour, folios and running heads kept to their side, the marks by the folio)
  and one bare shell for the 3 front-matter pages, which print no page colour and no folio; 36 modules (each used
  once: no two bands of the book are alike within 0.5 mm); 6 grids (3 × 1 photos, 3 × 2 figures, a 3 × 1 photo
  row, a row of three boxes, two boxes with a tab each, 2 × 2 photos). Laid frames: 367 compared, 1 off by more
  than 0.5 mm (a centred tab set `auto`, 1.55 mm narrower than the measured width); `postext check` warnings the
  same kinds and counts as before; likeness 6.04 / 2.79 % before, 6.05 / 2.79 % after. The folio stands where most
  pages print it (the source's drifts by up to 1.8 mm page to page, as dedupe merged it before).
- **Not done.** One shell for the front matter and the body (it needs a page to drop the shell's furniture, e.g.
  a fence attribute switching it off); modules side by side (C11 stacks them); per-item looks in a grid (a pill of
  another colour per card is no member); a lattice with one card off by more than the tolerance (a row of photos
  pushed 1.1 mm by the draft's own groups). Sandbox, docs (D3/D4) and the release (S8) are other lanes.
- **Tests.** `tests/test_template_fold.py` on invented pages: a 3 × 2 photo wall with pills (grid, items, reading
  order, names), tabs as wide as their words (centred `auto` members), a badge among the cards and a card off the
  lattice (no grid / a grid of the pills only), what hung from a row group, two pages of three bands (a bare
  shell, the text and the pair shared, the box 4 mm lower a module of its own, the connector and the shape moved,
  the folio left), a connector from the text joining its box to it, furniture kept to its side, `:::module` slot
  renames, `compare_boxes`; `dedupe_dir` end to end (one shell, modules kept apart, role names in the module and
  its Markdown, `pages`), with `POSTEXT_REPO` the draft laid out before
  and after with no frame off by 0.5 mm, with `POSTEXT_CLI` `postext check` without unknown anchors, slots,
  templates or module warnings.

### 12.35 What S8 built (#1072)

- **Where.** The porting skill only (`plugins/postext/skills/postext-port`), skill 1.58.0. No engine change.
- **References.** `references/composed-pages.md` gains recipes 6.12–6.18 (connectors; pointers into a picture
  and labels away from their point; keys and `:icon`; corners, sides, joined and foot tabs, path elements,
  glyph tab icons and side points; repeating grids; modules; overlaps), each saying when to use it and what
  a port did before 1.48; the version table runs to 1.49.0 (§12.32's caps and opacity, §12.33); §3.1 records
  bands, §3.7 writes the drafting loop as extract → lay out (`render.mjs --frames`) → fold
  (`template_dedupe.py`) → lay out and compare boxes → close (`composed_check.py`, 0 overlaps) → score; §7
  and §10 follow. `configuration.md` §19g, `document-format.md` §12.2, `verification.md` and `SKILL.md` list
  the new keys, blocks and the close rule.
- **Overlaps fail the close checks.** `composed_check.py` read every warning outside its failure list as
  nothing, so `frameCovered` / `frameOutsideArea` (warnings, §12.16) passed silently. Now both fail, printed
  with the engine's own fixes and a hint, and the report ends with `overlaps: N`. Decisions:
  - A **recorded exception list per project**: `composed-check.json` beside `preset.json` (or the bundle),
    or `--exceptions FILE`: `{ "overlaps": [{ kind?, template?, frame, coveredBy?, past?, target?, locale?,
    page?, reason }] }`. `frame` and `reason` are required; `[*]` stands for any instance number and `*` for
    any run (no regular expression from the file: each pattern is escaped piece by piece). A matched warning
    is listed as `allowed` with its reason; an invalid entry fails the run; an entry that matches nothing is a
    note, so stale ones go. `overlap: 'allow'` stays the first way out (the engine skips the pair); every frame
    that sets it is listed as a note, so the close report names what the engine no longer checks.
  - `repeatOverflow`, `moduleUnknown`, `moduleAsPage`, `moduleNested` and `moduleNameRejected` fail too.
  - **The score**: `compare_pages.py --score --check REPORT` (a `composed_check.py --json` report, or a raw
    `postext check --json` one read through the same exceptions) fails (exit 1, `passed: false`) while
    overlaps remain, listed by page label.
- **Reading order on shells.** A page template that is a shell of modules (S7, §12.34) has no frames of its
  own, so the HTML order check compared nothing. `page_fences` now records a slotted container's pieces one
  level down and `:::module` blocks with their own items; `expected_order` reads a repeating grid's pieces as
  instances (`foto[2]`, `pie[2]`, a lone member resource an item of its own) and a module's frames by their
  scoped names (`<name>.<frame>`, else `<template>[n]` as C11 numbers them; an unknown module's content to the
  page's flow frame). On the fresh port below the expected order equals the HTML's frame ids one for one.
- **lint_project.py** read `:::module` as an unknown container and every module slot as `slotUnknown` (22
  errors on a two-page S7 draft); it now checks a module's slots against the module template and raises
  `moduleUnknown` (three reasons), `moduleAsPage`, `moduleNested` and `moduleNameRejected` before the build,
  and reads a `:::label` container's lines inside a figure. `preset_kit.py` stamps `configVersion` 16.
- **`round`** knows the composed features of 1.46.0, 1.48.0, 1.48.1 and 1.49.0 (unreleased when written).
- **Release.** `plugins/postext/.claude-plugin/plugin.json` and `.cursor-plugin/plugin.json` 1.57.0 → 1.58.0;
  the marketplace files carry no version; `skills-lock.json` lists only third-party skills (unchanged); the
  docs Skill page (ten languages) says what the extract, the fold, the check and the score do with 1.48.
- **Fresh port.** Two invented diagram pages (the S6 test page twice) through extract, `render.mjs --frames`,
  `template_dedupe.py --laid`, manifest: one shell and two modules; `lint_project.py` 0 errors,
  `composed_check.py check` passed with 0 overlaps. The engine's overlap fixture as a book fails with the four
  overlaps and their fixes; two recorded exceptions leave two.
- **Not done.** The exception file is not packed by `preset_kit.py pack --manifest-only` (it is a porting
  record, not part of the book). The check does not reflow to test a fix; the Sandbox's fixes do.
- **Docs finding.** `configuration-composed-pages` lists `over` in the table of a connector's *end* fields;
  it is a key of the connector (`DesignConnectorElement.over`, §12.26).

### 12.36 What S9 found (#1073)

The acceptance test of round 2: the 28-page social-science textbook (230 × 288 mm, Spanish, checked
privately) re-ported with the S8 skill on 1.48.1 in Spanish, Catalan and English from one bundle, the
words taken from the round-1 port (the owner's corrected Spanish and his translations, as Markdown).

- **The loop as written.** `pdf_regions.py extract` (28 pages, 367 frames, 152 callout styles, 245
  labels) → `render.mjs --frames` → `template_dedupe.py --laid` (2 shells, 36 modules, 6 grids, 88
  styles) → manifest → render, compare boxes, `composed_check.py`, score. The curation is a generator
  (template changes) and a Markdown pass; no word of the book in either.
- **Result.** 3 shells (front matter, body, and a body child that adds the even running head of a
  block's closing page), 36 module templates, 6 grids, 52 connectors (trees, elbows, the map's pointers
  to anchors), 100 path elements, 2 raster grounds left (two art scraps the vectors do not paint; no line,
  connector or border in either). Config 0.32 MB. `composed_check.py` passed in every edition with 0
  overlaps and 21 recorded exceptions (pills on photos, boxes on an illustrated band, cut-outs past a
  box's edge, each with its reason); 0 `frameOverflow`, 0 `contentInConfig`. The bundle opens with the
  Sandbox's own import path (`openBundleZip`, `parseBundle`, `layOutBundle`): three editions, 28 pages each.
- **Likeness** (round 1's measure, 60 dpi grey, blurred 2 px, share of pixels off by more than 40;
  round 1 in brackets): es 1.6 % (2.0), ca 2.1 % (2.4), en 3.0 % (3.2); mean difference 8.1 (8.6),
  8.7 (8.9), 9.4 (9.5).
- **Skill fixes** (S9 commits): `render.mjs` stopped on a face with one unreadable glyph; the fold
  read a module's gap off the laid boxes (a grown box baked its growth into the gap under it) and lost
  the connector ends on a renamed grid's cards (`#grid-2-picture[2]`). `composed-pages.md` §3.7 lists the
  curation the draft still needs.
- **Engine.** Nothing changed. Two behaviours a port meets: a box frame with no content draws nothing
  (its tab and border too; a `:::space` keeps it), and a one-line pill held with `maxHeight` and
  `fit.minScale` still breaks a long word over two lines before it shrinks the word.

### 12.37 What #1084 changed (S9 findings)

- **An empty styled frame draws its box.** A `:::frame{slot=…}` fence with no blocks gave its frame no
  story (`wrap.ts` skipped a story with no indices), so a frame with a callout style drew nothing, its
  tab included. Now the fence of a frame with a `style` whose whole chain is empty makes an empty story
  (the `callout` container opens and closes at the fence, with the fence's attributes); the frame lays
  it through the existing "styled frame with nothing to hold" path, which now passes the piece's
  `continuation` (false for the story's first piece) so the tab and title are drawn. The box is the
  frame's size (`minHeight`, `height`), the label keeps its source. Decided where the issue was open: a
  fence without a `label` draws the box too (the author asked for the frame); a frame with no fence, or
  with no style, draws nothing as before, and `slotEmpty` is raised exactly as before (an empty fence
  already counted as filling its slot). An empty frame's `rules` (#914) now land on the box's overlay,
  as a frame with content has them.
- **A long word is set smaller before it is divided.** A line that holds nothing but the head of a
  divided word (`hyphenated`, no space in its text) marks a word wider than its measure
  (`dividesWord`). Two places act on it, both only for a frame whose text may shrink (`fit.shrinkText`,
  `minScale` < 1, text in its story):
  - in the ladder's step 5, once the largest scale that fits is found, if that scale divides a word, a
    smaller one down to `minScale` at which the frame still fits and no word is divided wins (the
    largest such, lowest first then bisection, as `searchScale`); none, and the division stays;
  - a frame that is not short but divides such a word and is held to its height (a fixed `height` or a
    `maxHeight`) gets the same search from its own scale down. This is the pill of the report: its
    height held the two pieces at full size, so the ladder never ran. A frame free to grow keeps its
    size: growing does not widen the measure, and shrinking every narrow auto box would move existing
    pages.
- **Not done** (done since #1090, §13.4). The `allowShrink` proposal still names the largest scale that fits, which may be one
  that divides a word (the pill of `minScale: 1` proposes 0.925, where the word is divided over two
  lines); once applied, the ladder sets the word whole only if `minScale` reaches that far. The skill's
  `:::space{lines=1}` workaround (composed-pages.md) is no longer needed; its text is the skill's issue.
- **Parity.** bench-layout hashes unchanged on Señales, Pepper&Carrot, Bioquímica, Kokoro, Don
  Quijote and a composed textbook port; the composed recipes pass `--check`.

## 13. Round 3 (#1086)

Round 3 of composed pages: what the round 2 ports still could not say (tracker #1086).

### 13.1 What R3-2 built (#1088)

Modules side by side (§12.7, §12.19 left them always stacked).

- **Config.** A modules group's `kind` is read: `'stack'` (the default, as before), `'row'` or `'grid'`
  (`columns`, `columnGap`, `rowGap`, `rowAlign`; `repeat` is not read on a modules grid and is reported
  as `unknownConfigValue`). `rowAlign` is also read on a modules row (default `'stretch'`). A module
  template has a new optional `width: ModuleWidth` (`Dimension | { percent } | 'fill'`, inherited through
  `extends` like `role`; `ResolvedPageTemplate.width`, `ResolvedModule.width`). Two new group keys:
  `within: '<stack>'` (a modules group inside the page's modules stack) and `templates: string[]` (the
  module templates such a group takes; unset, every one). `normalizeGroup` adds the modules fields only to
  a modules group, so a modules stack with neither resolves to the same object as before.
- **Decision: how a nested group is written and filled.** §12.7 left open how "a row inside a stack" is
  spelled. A modules group with `within` names the page's modules stack (the first modules group without
  `within`); `expandModules` gives each module, in Markdown order, to the first such group whose
  `templates` holds its template, else to the stack (`ResolvedModule.nested`, `items[].nested`). Each run of
  consecutive modules of one nested group is one item of the stack, laid as that group's kind where the
  run's first module comes; so a page of boxes and card rows interleaved needs no geometry in the Markdown,
  only the module templates it names. Nested groups have no frames and no `items`; `#<nested>` reads the
  union of its modules' boxes (all its runs) once the stack is laid. Only one level: `within` must name a
  modules stack that is in no other (else `unknownConfigValue` at `…/within`, and the group is a
  modules group of its own, which takes nothing since the page uses its first modules group);
  `templates` without `within`, and `overflow.continueIn` on a nested group, are `unknownConfigValue`.
- **Layout** (`placeModules`, rewritten as rows). The group's modules become a list of rows: a stack gives
  each module a row of its own, at its template's `width` from the start side (`'fill'`/unset: the group's
  width, as before); a row group one row, widths by template (`'fill'`/unset share what the fixed ones and
  the gaps leave, equally); a grid `columns` equal columns, `rowGap` between rows (the template width is
  not read). Each module of a row is measured as before (its frames placed in the room left, held-by-foot
  frames left out), the row is as tall as the tallest, and each is laid in a box that tall when the row has
  several modules and `rowAlign` is `'stretch'` (its `'container'` ground and `'fill'` frames reach the
  row's foot), else at its own height, moved by `'center'`/`'end'`. `placeGrid` is not reused: its cells
  are frame sets placed by the template's drawing, a module is a sub-layout of steps; the column and
  row-gap arithmetic is the same. Rows run left to right in flow coordinates: start to end on a
  right-to-left page (mirrored flow), as grids do. A stack row of one full-width module goes through the
  same arithmetic as the old per-module loop (cursor, declared shift, clip), so stacks lay out byte for byte.
- **Continuation.** By whole rows: the first row that does not fit, when the stack's (or the row/grid
  group's) `overflow.continueIn` goes off the page, and every row after it spill whole (`FitState.gridsOn`
  keyed by the top modules group, as before). A row of a nested group never splits; a nested grid keeps its
  rows that fit. The receiving page resolves its template with the modules it receives and routes them
  again, so a run cut by the page is one run on the next.
- **Ids, source map.** Unchanged: module frames keep `<name>.<frame>` ids; `moduleOfFrame` still returns
  the top modules group (the one with `items`), so cut warnings stay one per group.
- **Sandbox.** The group editor offers stack / row / grid for a modules group (grid: columns, gaps,
  `rowAlign`, no repeat; row: `rowAlign`), «Inside the group» (the template's other modules stacks) and
  «Modules it takes» (checkboxes of the book's module templates); the template editor of a module has
  «Width in its group» (share / length / percentage); the module library shows each module's width. 14
  new labels in ten languages; WebMCP `settings.test.ts` writes a nested group's kind and templates and a
  module's width.
- **Not done.** A group inside a row or grid of modules (one level only); a module wider than its
  group is not clipped; `grow`/`shrink` among a row's modules; anchoring a page frame to a nested group is
  read only after the stack is laid (no ordering dependency is recorded for it); the skill's
  `template_fold.py` side (a later lane).
- **Fixture.** `__tests__/composed/fixtures/moduleRows.ts` (a page shell whose stack holds a row of boxes
  and a 2 × 2 grid of cards, words in Spanish and English); `moduleRows.test.ts`.

### 13.2 What R3-4 built (#1090)

- **The shrink proposal keeps words whole.** `allowShrink` of a `frameOverflow` still starts from the
  largest scale (2.5 % steps down to `PROPOSAL_MIN_SCALE`, 50 %) at which the frame fits. When the
  frame laid at that scale divides a word wider than its measure (`dividesWord`, §12.37, now passed
  to `overflowProposals` through `ProposalContext`), the proposal looks below it for the largest
  scale at which the frame fits and no word is divided (lowest step first, then bisection, as the
  ladder's `wordWhole`) and names that one with `word: 'whole'`. None down to 50 %: the largest
  fitting scale stays and the proposal carries `word: 'divided'`. A frame whose largest fitting
  scale divides nothing gets no `word`, so proposals of existing books are unchanged.
- **Applied, it holds.** Setting `fit.minScale` to the proposed value lets the ladder's step 5 find
  the larger divided scale first and then `wordWhole` go down to `minScale`, which is the whole-word
  scale: the warning is gone and the word whole (the `minScale: 1` pill of #1084 proposes 0.825, not
  0.925; tested in the engine and through `sandbox_apply_proposal`).
- **Decided where the issue was open.** The floor of the whole-word search is the proposal's own
  floor (50 %), not the frame's current `minScale`: the proposal is about lowering it. The note is a
  field of the proposal (`word`), not a new kind, so the one-click fix path (`proposalActions.ts`,
  which reads `path`/`value`/`also`) needed no change. Words: the engine's English
  (`describeFrameOverflowProposal`: "…, where its long word is whole" / "…, a long word divided") and
  two Sandbox labels (`warningsFitFixAllowShrinkWhole`, `warningsFitFixAllowShrinkDivided`) in the
  ten locales; the docs' `frameOverflow` proposals table says the same.
- **Not done.** `dividesWord` sees a word divided because it is wider than the measure (a hyphenated
  line with no space); an ordinary hyphenation at a line end is not counted, as in §12.37.

Round 3 lets ports keep fewer templates and the Markdown say more about each page.

### 13.3 What R3-1 built (#1087)

- **Keys.** Every design element kind (`text`, `rule`, `box`, `image`, `path`, `connector`) gains
  `when?: string` and `unless?: string` in `types.ts`. Resolution (`resolveDesignSlot`, through
  `fenceConditionOf`) keeps a non-empty string, trimmed, and drops anything else, so the resolved element
  carries only a name it can test. Pure helpers in `design/fenceCondition.ts` (exported):
  `fenceSetsAttribute`, `fenceConditionMet`, `fenceConditionUses`, `fenceConditionsNeverMet`,
  `fenceAttributesSet`, `FENCE_CONDITION_SLOTS`.
- **What "sets" means.** Departure from the issue's wording ("any non-empty value"): the parser gives a
  flag (`::::page{template="pagina" folio}`) the value `''`, and the flag is the form the issue's own
  examples use, so a fence sets an attribute when it writes the key, as a flag or with any value but
  `false` (case-insensitive, as `spread` reads it). `folio=""` cannot be told from the flag and counts as
  set. `hasOwnProperty`, so `when: 'toString'` is never met through the prototype.
- **Where it is read.** In `layoutDesignSlot`, before the parity and role filters (`drawnOnFence`), for
  the contexts `header`, `footer` and `composed`: the document's and a styled section's running heads, a
  template's own `header`/`footer`, its decoration (and a module's, laid with the page's). The page's
  attributes are `DesignPlaceholderContext.pageAttrs`, already there for `{attr.x}` (#855): the fence's own
  attributes, never the chapter heading's. A page that is not composed has none: `when` is not met there,
  `unless` always is. Heading, part, contents-row and box designs ignore the keys (their contexts carry no
  page fence), and the validation says so.
- **What goes with an element left out.** Every element anchored to it (`anchor.to: '#id'`) or sized to
  one of its edges (`size.*.to`), transitively, as `withoutAnchoredTo` drops what hangs from a frame that
  takes no room: a label on the band goes with the band. A connector with an end on it drops that end
  through the existing path (`connectorDropped` in the reflow log); give the connector the same condition
  to avoid the log line.
- **Source map.** Unchanged in kind: undrawn elements emit no block, and every drawn block keeps the
  element's own config path (`elementPaths` is keyed by id), so indices do not shift. Tested.
- **Spreads, continuation.** The decoration of a spread is laid once with the first page's attributes
  (the fence is the same); pages added by continuation carry the fence's attributes as for `{attr.x}`.
- **Validation.** `collectFenceConditionWarnings`: `unknownConfigValue` (`used: ''`, the element drawn as
  if unconditioned) for a value that is not a non-empty string and for a condition in a slot that does not
  read it. `DESIGN_PATH_KEYS` lists the two keys. No new warning kind in the engine: the never-met check
  needs the whole book's fences, so it is `postext check`'s, an `info` note `conditionNeverMet` (`data`:
  `path`, `condition`, `attribute`) computed with `fenceConditionsNeverMet` over the laid pages'
  `composed.attrs`, only when every chapter is laid (a `--chapters` selection could leave out the page that
  sets it). Not a `ContentWarning`, so the Sandbox's warning panel and the Cookbook's `WARNING_SINCE` are
  untouched.
- **Sandbox.** `FenceConditionFields` under each element card of a slot that reads the keys (`slotKey`
  `header`/`footer`, or a decoration: `connectorHost` set): two selects, «Drawn when the page says» and «Not
  drawn when the page says», whose choices are `pageFenceAttributes` of the book (the open chapter as typed;
  `template`, `spread`, `id` left out) plus the current value when no fence sets it. `TemplateFence.attrs`
  reads a fence through `parseDirectiveAttrs` (now exported from postext). No free-text entry: the
  attribute is written in the Markdown first.
- **Parity.** Elements without the keys take the early return in `drawnOnFence` (the same array):
  bench-layout hashes unchanged, composed recipes pass `--check` (see the lane report for numbers).
- **Not done here.** The skill's fold (`template_fold.py` / `template_dedupe.py` merging shells that differ
  by furniture and writing the attribute on the fences) is the skill lane's.

### 13.4 What R3-3 built (#1089)

Named frame looks: one colour per item of a grid without leaving the grid.

- **Config.** `PostextConfig.frameLooks: FrameLookEntry[]` (`composed/types.ts`): `{ id, name?, …FrameLook }`,
  the fields of `FrameConfig.look` (#976) under an id. `normalizeFrameLooks` (`templates.ts`) keeps the
  entries with an id (the first of an id wins) and of each what `normalizeLook` keeps; `resolveAllConfig`
  carries `frameLooks` only when one survives, so a config without looks resolves (and hashes, and keys the
  page memo) as before. Palette-linked colours are relinked by `applyPaletteToResolvedConfig` like every
  colour of the config, so part and page palettes recolour them by value (`partPalette.ts` needs no kind
  for them, as for a template look).
- **Markdown.** `look="<id>"` on any `:::frame{slot}` piece: a page's frame, a grid item's main piece, a
  member's nested `:::frame`. The parser already kept every fence attribute (`containerAttrs`,
  `containerAttrSources`); `wrap.ts` already dressed each story (and each instance, by its own item's
  fence) with its fence's attributes, so the story box carries `look` like `label` and `title`. No parser
  change.
- **Resolution.** `layoutComposedPage`'s `styleOf` lays the story's named look over the frame
  (`withNamedLook`, memoised per look and frame so `styleWithLook` keeps its per-look styles) before
  `frameStyleOf`: style, then the template frame's `look`, then the named look, key by key (`lookOver` =
  `mergeLook`). Decision: the look is the **story's** (read from the head's fence), so every frame of a
  chain and the frames a story goes on in on later pages (`continueIn`) wear it; a later link's own fence
  is not read (as for `label` and `title`). Paint needs nothing: the look lives in the style the box is
  laid and drawn with.
- **Validation.** `validatePageTemplates` checks `frameLooks` (and `htmlViewer.overrides.frameLooks`): an
  entry with no id is `unknownConfigValue` at `…/id`, keys at any depth as a frame's look
  (`unknownConfigKey` with the nearest name); no new config kind. Content warning `lookUnknown`
  (`template`, `frame`, `look`, `suggestion?`, `fenceIndex`; WARNING_SINCE 1.50.0) from
  `checkFrameLookNames` (`slotChecks.ts`): each `:::frame` inside a page fence whose `look` names no entry,
  at the value; a `:::frame` outside a page is not checked. An empty `look=""` names none.
- **Sandbox.** Design › Boxes › Frame looks (`FrameLooksSection`): id (renamed on blur; the pieces that
  name it are rewritten in every chapter), name, the fourteen fields in three groups, a sample swatch and
  the count of pieces naming it. The editor's Frame look button (`LookPicker`) lists the looks for the
  `:::frame` piece at the caret (`framePieceAt`, a member before its item) and writes, replaces or removes
  `look="…"` on its opening line (`frameLookChange`; `SlotSite.look` and `attrsEnd` from `pageSites`).
  `lookUnknown` is a composed check; WebMCP reads and writes `frameLooks` and lists `lookUnknown`.
- **Parity.** bench-layout hashes unchanged on Don Quijote, Señales, Kokoro, Bioquímica and
  Pepper&Carrot (base and head); composed recipes `--check` (see the lane's report).
- **Not done.** The skill's fold into one grid with a look per colour is the skill lane's. The Canvas does
  not draw an unknown look's piece any differently (the Checks panel lists it). A look on a `:::frame`
  outside a page fence does nothing and is not reported.

### 13.5 What the skill lane built for R3-1, R3-2 and R3-3 (#1087, #1088, #1089)

`template_dedupe.py` / `template_fold.py` (skill 1.59.0) write what round 3 lets a port say.

- **One shell** (`merge_furniture_shells`, after the templates are merged). Root page templates equal
  but for decoration elements present on some and absent on others (shared elements must agree, none
  already conditioned) become the most used one. For each set of templates an element is on, the side
  with fewer pages gets the attribute: `unless` on what the minority leaves out, `when` on what only
  the minority draws. Name: `frontmatter` when those pages are the book's first fences, `backmatter`
  when its last, else `variant-N`; the fences get it as a flag. Parity-bound elements get the
  condition too (an odd front-matter page would otherwise print the odd folio).
- **Rows of modules** (`row_columns`, `nested_groups`). A band's units are clustered by their span
  across the page (a shape painted inside the band that spans two clusters joins them). Clusters
  inside equal columns of the trim are laid at `k × W / n` with `width: W / n`; else each module
  starts where its cluster starts, the last `fill`. Rows that share a module template are one nested
  group (all shells get every group, so they stay alike); two rows of one group in a row on a page
  make it a `grid` when all its rows are equal columns of one count, else the later band is folded as
  one module again and the book re-planned. Modules of a row carry `width` and are never alike with
  stack modules. Decision: gaps are 0 and each module keeps the band's lead in its frames' offsets,
  so rows and grids lay byte for byte as the stack did.
- **Looks** (`LookBook`). Lattices compare a style class (the style with the look-mappable colours
  left out; a one-line style set left with even side padding counts as centred). The set frame takes
  the style most cards have; each other card's colour difference (`colour_look`, CIEDE2000 within
  `--delta-e`) is a `frameLooks` entry, deduplicated, named by colour, and `look=` goes on the item's
  or member's `:::frame` (a leaf piece is wrapped). Also: a member's way of hanging (above/below) is
  the one most frames of its look have, and a picture is never a centred auto-width member.
- **Not done.** Rows are rare on extracted pages: extract anchors most frames to the frame above, so a
  page's units chain into one cluster; a column of a page is a row module only when it is a unit of
  its own. No nested group inside a row (engine: one level).

### 13.6 What #1095 changed (engine and Sandbox)

The engine and Sandbox items of #1095: the limits §13.1, §13.3 and §13.4 left noted.

- **Groups inside groups, to any depth.** `within` may name any modules group of the template (a row
  or a grid too), as long as following `within` reaches a modules group inside no other without a
  loop (`modulesGroupRoot`, `composed/modules.ts`; resolution drops a broken link and the validator
  reports it at `…/within`, as before). Routing (`expandModules`): a module goes to the first group,
  in template order, among those whose chain reaches the page's modules group, that takes its
  template; a group with `templates` takes those, one without takes every template **unless other
  groups lie inside it**, then none directly (decision: an intermediate row or grid would otherwise
  swallow every module; its content comes from its inner groups and the templates it names).
  `ResolvedModule.nested` is the innermost group; `nestedChain` gives the path out.
- **Layout** (`placeModules`). The rows are built recursively: `cellsOf` splits a list of modules
  into the cells of a group (a module the group lays itself, or a run of consecutive modules of the
  group inside it on their path). Inside a stack a run's rows join the stack's rows (as in R3-2, so
  continuation still goes by whole top-level rows); inside a row or a grid a run is one cell, laid as
  its group's kind in the cell's box (`layRows`), measured as the sum of its rows (`measureCell`).
  Decisions: such a cell takes a `'fill'` share of a row (grow 1; a group has no `width` key), is laid
  at its own height (`'stretch'` does not stretch a group's cell; `'center'`/`'end'` move it), and a
  module's percentage width is of the cell it is in. Every group on a module's path gets the union of
  its modules' boxes (`#banda` reads the row, column included). A row of a nested group is never split
  from its top-level row: the top-level row goes on whole.
- **grow / shrink among a row's modules.** `PageTemplate.grow` / `shrink` on a module template
  (inherited through `extends` like `width`; `moduleFactor`: a finite number ≥ 0, else
  `unknownConfigValue`; on a page template, `unknownConfigValue` with `used: ''`). In a row (not a
  stack, not a grid): the room the fixed widths and gaps leave goes by grow, a `'fill'` module (and a
  group's cell) taking `max(1, grow)` and a sized one `grow ?? 0`; when the widths run past the end,
  the sized modules give width back by `shrink × width` (CSS flex), down to 0. With every grow at its
  default the arithmetic is the old equal share (`spare × 1 / n`), so rows lay byte for byte. No
  `minWidth` for modules: a module shrinks to 0 at worst (not done).
- **Ordering dependency.** `composedOrder`'s `stepKey` reads a modules group with `within` as the step
  of the group it lies in, up to the one that holds the module frames: a page frame anchored to
  `#banda` is placed after the modules group step, so it sees the row's box on the first pass.
- **`rowAlign: 'stretch'` on `'auto'` boxes.** A stretched module (a row of several, `'stretch'`,
  spare > 0.01 px) sets `stretchTo` while it is laid; `stretchAuto` (run before `clipAtFoot` for a
  frame step, a group's members and a grid's cells) takes an `'auto'`-height frame of the module whose
  foot is the module's own foot (within 0.5 px) down to the row's foot, and its declared box by as
  much, so the reflow log shows no motion (the template asked for it). Left alone: a frame as wide as
  its content (`width: 'auto'`, a pill or a tab), a pinned one and one held by the module's foot.
  Decision: "the module's boxes" read as the frames that end where the module ends; a frame above
  another keeps its height (stretching it would move what hangs below).
- **Unknown look on the frame.** `VDTFrame.lookUnknown` (the id) is set on a frame that holds a story
  whose `look` names no `frameLooks` entry (`unknownLookOf`, the story's look as for #1089). Optional,
  absent on every existing book, so VDT hashes do not move.
- **Sandbox.** `FenceConditionFields`: each select ends with «Another attribute…», which opens a box
  (focus moves to it); Enter or leaving it takes the name when `fenceAttributeName`
  (`templates/templateUsage.ts`) accepts it (the ASCII key grammar of `parse/attrs.ts`, at most 64
  characters, not `template`/`spread`/`id`), else a `role="alert"` message tied to the box by
  `aria-describedby` and `aria-invalid`; Escape or an empty box gives up. The name then shows in the
  select as any value no fence sets. Canvas: `fitMarksFor` adds a `'look'` mark (violet dashed
  outline, `#6a2c91`, white text 8.8 : 1, the look's name at the top-left corner) for each frame with
  `lookUnknown`, beside its overflow or scale mark. Group editor: «Inside the group» lists
  `modulesGroupParents` (every other modules group but those inside the edited one); the module's
  template editor has «Share of the room left» (`grow`, shown at its default 1 or 0) and, once it has
  a width, «Width given back when short» (`shrink`). 11 new labels and 3 changed, in the ten
  languages; WebMCP `settings.test.ts` writes a group inside a row, `grow` and `shrink`.
- **Parity.** bench-layout hashes unchanged on Don Quijote, Señales, Kokoro, Bioquímica and
  Pepper&Carrot; the Cookbook bench (`--engine local --no-pixels --hash-warn`) and the composed
  recipes (`capture --composed --check`) keep every approved layout: no recipe has a stretched row of
  modules, a nested group or a module `grow`/`shrink` yet. A book whose row stretches a module ending
  in an `'auto'` box moves, as the issue asks.
- **Not done.** A `width` for a group's cell in a row (it is a `'fill'` share); `'stretch'` of a
  group's cell; `minWidth`/`maxWidth` for modules; the porting skill's items of #1095 (another lane).
- **Fixture.** `__tests__/composed/fixtures/moduleNesting.ts` (a box beside a column of two cards in a
  row inside the page's stack, a note under the row, a row of two boxes sharing by grow);
  `moduleNesting.test.ts`.

### 13.7 What the skill lane built for #1095 (the round-3 curation list)

`pdf_regions.py` / `template_fold.py` / `template_dedupe.py` (skill 1.60.0) do the seven steps §12.36 and
§13.5 left to a port's generator. No engine change.

- **Unseen art.** A drawn shape no pixel of its colour shows in the text-free render (a pixel counts on
  the line from white to the colour, so a thin stroke blended with the paper does, another colour's grey
  edge does not) is `unseen`: lettering under a white panel painted after it, a drawing in the bleed,
  art clipped away. It joins no picture, no box's art, no decoration and no ground comparison; a speck
  too small to judge goes with unseen shapes of its colour painted next to it. Decision: the test is
  the render, not the paint order, because clipping is what hid the real textbook's lettering. A drawn
  cluster with no paint of its own (white on white, a plate's corner) is no picture (`report.json`).
- **Cuts keep only the picture.** Highlights, and the boxes and tabs the draft lays over the picture
  (`drawn_over`: frames set on it, frames with `over`, a free tab over a free picture) are redacted
  from the cut, one rectangle at a time (MuPDF kept a path one of several rectangles applied together
  covered), a stroked one 6 widths wide (its miters). A box laid under the picture stays in the cut:
  the cut is opaque and would hide it where it lies over it. Art of the picture painted over a
  neighbour keeps that neighbour; its outline and fill are painted out of the cut in the picture's
  ground (`paint_out`). Then every cut (not an alpha one) is trimmed to the paint it has of its own
  (`trim_to_ink`: ground = the holder's or the card's colour, else the paper round it; neighbours'
  colours and the page past the card's rounded corner are not ink; a side moves by 1 mm or more, keeps
  0.3 mm, never past a label). `claim_of` keeps the untrimmed box as the picture's for the loose-shape
  and ground checks, so a map's white masks become neither paths nor a ground.
- **Over a picture** (`plates_over_pictures`, after containment). A box or tab with words that meets a
  picture is over it when its fill is at least half of what shows where they meet (render); with no
  fill, by the paint order weighed by area (`lies_over`). Such a frame is never the picture's overlay
  holder: the picture leaves it, and the frame hangs from the picture when it lies on it by half or
  more; else `make_template` gives it a layer above the picture's.
- **Measure.** A box's right padding is its left one (less the wrap slack) when nothing stands in the
  box beside its lines (`right_free`), whatever the source's longest line was.
- **Running-head ornaments** (`anchor_ornaments`). Path elements on a running head's line, each within
  8 mm of the next, are anchored `left-of` / `right-of` the head (ids `<head>-ornament-N`, so pages
  agree), carry `when: "<attr>"` of the head's `{attr.x}` and follow it in the list; the head loses its
  `size`. The fold: `mark_furniture` takes an element anchored to an element as furniture; the shell
  keeps whatever is anchored to an element it keeps; `_text_box` reads a head with no size as half the
  page; `merge_furniture_shells` keeps an extract `when` and refuses a merge that would need a second.
- **Captions in columns** (`split_captions`, before reading order). Lines of a box starting within 8 mm
  under (or 3 mm over) the foot of one of its pictures, middle over it, or on the baseline the row's
  other captions start on; per picture, columns by x; two columns or more in the box. Each column, line
  under line, is a text frame (child of the box, `caption_of`, `over` its pictures), placed `below` its
  picture, as wide as its longest line with the free-text slack, no further than halfway to the next
  caption; centred ones are centred by their style (`textAlign`), not a paragraph style, which would
  set them in the running text's face. Not the flowing text. `composed_check` leaves an empty fence (a
  box whose words all went to captions) out of the reading order: the HTML lays its frame anywhere.
- **Looks by role.** `look_roles`: palette entries with an id that is no colour name, callout styles
  whose id is not of a kind and its looks (`box-…`, `tab-…`), and the page colour; a look within
  `--delta-e` of one takes its name. On the real textbook nothing names those colours, so its looks
  stay named by colour.
- **Rows.** `soft_links`: a frame or group placed `below` a frame wholly above it. `bands_of` reads the
  bands without them, and a soft link stays apart only when one end lies in a band whose units stand
  side by side; the module keeps the frame at its laid place. Elsewhere the units join as before.
- **On the real textbook** (local acceptance): rows 1 → 7, one shell, 11 grids, 59 modules (43), two
  raster grounds; 0 overlaps in the three editions; likeness es 1.60, ca 2.14, en 3.06 % (round 3: 1.60
  / 2.14 / 3.08) with the curation of these seven steps removed from the generator. Still curated: a
  picture cut opaque over its holder's last line (crop), captions set beside a picture.
- **Not done.** Transparent cuts (a PNG ground for a drawing's paper is 3–4× the JPEG); grids whose cards
  differ in height take the smallest height (a picture of a caption grid shrank 5.6 mm with
  `--lattice-tol 2`); role names from the source itself (spot colour names are not read).

## 14. External port review, part II (#1097)

Findings from a full port of a 28-page fixed-layout school textbook as composed pages.

### 14.1 An empty styled fence reads in its place (#1116)

The story of an empty styled fence (§12.37) has no blocks, so `regroupPage` (`wrap.ts`) sorted it by
`Math.min()` of nothing (`Infinity`): its box came after every other story, and with it its tab's words
in the HTML, the EPUB and the tagged PDF (all three follow the regrouped order, `composedReadingOrder`
by content index). A story with no blocks now sorts by the index of the fence it was read from
(`fenceAt`, kept with each slot's fence block). `composed_check.py` `expected_order` puts an empty
fence of a styled frame in its place and leaves out what the frame's chain adds after it (nothing is
there); an empty fence of a plain frame draws nothing and stays out.

### 14.2 Unknown keys of design elements and placements (#1122)

`design/elementKeys.ts` holds a key table per object, each `satisfies Record<keyof T, true>` so a key
added to a type fails to compile until it is listed: every design element kind (text, rule, box, image,
path, connector), a decoration removal `{ id, remove }`, a template's `decoration`, a connector's ends,
a placement and its `anchor`, `offset`, `size` and `{ to, edge }` size, a text's `box`, `dropCap`,
`stroke`, `dotted` and `repeat`, a box element's `style` (with its `padding`), and the top-level config.
`configWarnings.ts` reports the element keys of every design slot (dotted paths, as the path element's
check did; the path element's own key loop moved there) and the config's own keys (and those of
`htmlViewer.overrides`); `validate.ts` reports a frame's and a group's `placement` keys and a
decoration's own keys with JSON pointers (`/pageTemplates/0/groups/0/placement/sise`). A group's `size`
written beside its placement was already `unknownConfigKey` (`GROUP_KEYS`). An element of an unknown
`kind` is not checked (it draws nothing). Sections outside the composed objects keep the checks they
had (`collectUnknownKeyWarnings`): `page`, `bodyText` and the rest are not walked key by key.

### 14.3 A picture covers by its shape (#1123)

`overlap.ts`: a covering bitmap or SVG whose shape is known (`contourRowsOf`: its polygon, or the
alpha channel its host traced) carries the rows of that shape (`contourOnPage` with no margin, through
its crop and scale; mirrored on a right-to-left page), each put through the frame's clip and matrix
as its box is. `inkCuts` cuts the covered ink by the rows: the depth test (0.3 mm on both sides) runs
on the bounds of the pieces under the rows taken together (a row of a 256-row trace is thinner than
the depth), and the area counted is their union. A picture with no known shape, a turned one
(`rotation`), a video, and every picture on a vertical page cover with their box as before; the
covered side is unchanged (a picture under a frame is read by its box), and so are `frameOutsideArea`
and the move proposals (they test the boxes). Decision: the glyph boxes are tested, not the glyphs'
ink; a line whose box meets the shape by more than the depth is covered there.

### 14.4 A frame that grows with the frames inside it (#1117)

`FrameConfig.growWith: 'children' | string[]` (the name `grow` was taken: a frame's share of its
group's spare room). `growMembers` (`grow.ts`): with `'children'`, the frames and groups anchored to
a point of the box's top side (`top-left`, `top`, `top-right`, `top-start`, `top-end`, the `align-…`
edges but `align-bottom`), then round after round those anchored (any edge) to a member, and the frames
of a member group (a grid's instances too); a frame anchored to the box's foot or middle never (its
place follows the box's height); with a list, the frames and groups named. `composePage`
(`pipeline/composedPages/composedLayout.ts`) lays the page; then, for each growing box that is laid and not turned,
`grownHeight` takes the lowest foot among its members and its style's bottom padding, and when the
box ends above it (by more than half a pixel) the page is laid again with that height as the box's
`minHeight` (in mm), at most three times. The members stand where the box's top puts them, so one
more lay settles it; what the box's foot places (a frame `below` it, the rest of its stack) moves down
as under any growing box. Decisions: the grown height wins over a fixed `height` and a `maxHeight`
(as `minHeight` does); the reflow log shows no motion for the box or the frames it moves, since the
box's declared height is grown too (the template asked for it, as for `stretchAuto`, §13.6); a page
with no `growWith` is laid once, as before. Modules scope a list's names (`modules.ts`), a grid's
instances name their own item's frames (`repeat.ts`). Validation: a value other than `'children'` or
a list is `unknownConfigValue` at `…/growWith`; a list's entry that is no string at `…/growWith/<k>`;
a name that is no frame or group of the resolved template, or the frame itself, at `…/growWith`.
Sandbox: the template editor's Size group has «Grows with the frames inside» (no, the frames
anchored inside it, the frames chosen) and, for a list, a checkbox per frame and group (seeded with
the frames anchored inside it). Fixture: `__tests__/composed/growWith.test.ts`, three photos and their
captions in a labelled box under a 1.3 text stress; the skill's end-to-end test runs the same page
through `composed_check --stress 1.3`. Decision kept (#1198): the room under the lowest member is the
box's whole bottom padding, also when the box's declared height leaves less (a box whose padding was
measured under its text and whose captions sit closer to its foot grows by the difference at the text
as written). Taking the room the first lay leaves instead would give a box of the same design two rooms,
one when its members fit and none (captions on the edge) once a longer text makes them run past it; a
port writes the bottom padding the source leaves under the lowest member when that member, not the
box's own text, is the lowest content.

### 14.5 Which fit marks the canvas draws (#1160)

The fit marks of §12 (a frame that does not fit, text or pictures the ladder scaled, an unknown look)
are split in two groups: problems (`frameOverflow`, `lookUnknown`) and information (the scale badges,
a scale within what `fit.minScale` allows). `debug.fitMarks: 'all' | 'problems' | 'none'` (default
`'problems'` since #1200, `'all'` before: a book that passes its checks shows no badge) is the book's default and `debug.fitMarksMinScale` (default 1) leaves out the badge of a frame
set at that scale or larger, text and pictures apart. Both are resolved and stripped with the rest of
`debug`; neither reaches `ResolvedConfig`, so the VDT is the same, and the Sandbox's `configKeyOf`
drops them, so a cached layout stays valid. Sandbox: `fitMarksFor` takes `mode` and `minScale`
(`viewport/composed/fitMarks.ts`); the reader's choice is kept per browser
(`viewport/composed/fitMarksView.ts`, the rail button next to the reflow switch, All → Problems only
→ None) and wins over the book's; `sandbox_get_state` reports `view.fitMarks` and `sandbox_set_view
{ fitMarks }` sets it (`book` forgets the choice). The frame a check just reached is outlined in every
mode. Only the Sandbox canvas and its side-by-side view draw these marks; the Folio, the HTML viewer,
the PDF and the EPUB never did.

### 14.6 A page that lost its folio (#1163)

`folioMissing` is a content warning found after the running heads are laid. While `headerFooter.ts` lays
each composed page it records what the page's slots mean to draw there (`composed/furniture.ts`,
`expectedFurniture`): the text elements of its `header` and `footer` slot (the template's own, or the
section's or document's it inherits) and the decoration texts that read `{pageNumber}`, a running name or
`{attr.x}`, after the parity filter, the page-role filter and the fence's `when` / `unless` (with what hangs
from an element left out, `fenceDroppedIds`, shared with `drawnOnFence`). `folioMissingWarnings` groups
the pages by template and side (recto or verso by book page) and, for each element, reports the pages that
meant to draw it and drew no visible text when at least two pages draw it and more than half of the other
pages that meant to draw it do. A page switched off on purpose never meant to draw the element, so it is
neither reported nor counted; neither is a page whose slot lacks the element (`footer: false`, a styled
opener's running heads). The decoration of a spread is laid on its sheet of two pages, so only its running
heads are compared. Each warning names the template, the element, its slot, the side, `drawnOn` and
`siblings`, with the page fence's source range. Pages are compared within one laid document (a chapter);
a template used across chapters is judged chapter by chapter. Nothing is drawn differently: the VDT is
unchanged and the record lives beside the document, not in it.

### 14.7 A module's texts (#1189)

A port found a module's `text` elements not drawn, a literal as well as `{attr.x}`. They were laid (in the
module's box, `'container'` read as `#<name>`), but the decoration paints under the frames and a module is
nearly always a box of filled frames, so its labels lay under their fill; and `{attr.x}` read the page
fence only, never the `:::module` fence. Decisions:

- **Over the frames.** `DesignTextElement.over?: boolean`, as a connector's (§12.26): the text's blocks
  carry `over: true` (`VDTDesignTextBlock.over`) and `paintsOverFrames` reads text blocks too, so every
  backend (canvas, HTML, PDF and fixed EPUB through `decorationOver`), the source map and the reading
  order take them with no change of their own. Default `true` for an element of a module template, `false`
  for a page template's: a module is a box and its texts label it, while a page template's texts sit on
  the page and may be meant under a photo. `headerFooter.ts` marks the blocks (`SlotLayoutExtras
  .overTexts`); a value that is not a boolean is `unknownConfigValue` at `…/over` (`used` the default:
  `true` in a template whose own `role` is `'module'`).
- **The module's fence first.** The parser keeps the fence's attributes (`ComposedModuleFence.attrs`);
  `VDTComposedPage.modules[]` records `attrs` / `attrSources` (absolute) for each module whose fence
  writes any attribute besides `template` and `name` (those choose the module and name it; `{attr.name}`
  still reads the page fence). `expandModules` records where each module's elements sit in the page's
  decoration (`ResolvedModule.decoration`, so elements with no `id` count), and the decoration layout
  reads, for those elements, the module's attributes over the page's: `{attr.x}` in text and in an
  image's `resourceId`, `when` / `unless` (`fenceDroppedIds` takes per-element attributes;
  `LayoutContext.elementAttrs`), the source a bare `{attr.x}` maps back to (the value on the `:::module`
  line) and `folioMissing`'s expectations. One layout call, so anchors between elements keep working. A
  module that goes on whole to an added page reads its fence there (the fence travels with the page).
- **Parity.** A book with no module texts and no module attributes lays out as before: no new key in
  its VDT, no new paint item. A module text gains `over: true` and moves to the over item; one that a
  filled frame hid now shows. No `CONFIG_VERSION` bump (as #1076): a text no one could see is the only
  look that changes. No cookbook recipe uses modules.
- **Tests.** `__tests__/composed/moduleText.test.ts` (over and under, the paint order, the decoration
  split, an element with no id, attributes from the module and the page fence with their sources, `when`
  on a module, a module laid on the next page, modules in rows and grids, HTML and canvas order, the
  contrast ground, validation); `postext-pdf` `moduleTextOver.test.ts` (filled after the module's picture left to right
  and right to left, before it with `over: false`).
- **Contrast.** `contrastPairs` walks a composed page in paint order: over texts are read with the
  over item, on the frame they lie on (the connectors, lines, are still walked with the decoration).
- **Not done.** A Sandbox control for a text's `over` (the connector editor has one; a text element's
  form does not).
