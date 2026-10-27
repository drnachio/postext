// Content warnings found by the layout: line numbers, drop caps, floats,
// captions, folios, columns, design texts and fonts.
import type { VDTDesignSlotKind } from '../design.js';

/** Members of `ContentWarning` (`../contentWarnings.ts`). */
export type LayoutWarning =
  /** A line number set in the side column (`lineNumbers.position:
   *  'side'`, #621) overlaps a side box, a side caption or another float
   *  of that column: both are painted where they are. Points at the line
   *  it numbers; `number` is the number as printed. */
  | { kind: 'lineNumberOverlap'; number: string }
  /** A paragraph a drop cap opens (#623) that could not take it as
   *  configured. `reason`: `'shortParagraph'`, fewer lines than the
   *  initial sinks (`handling` says what `shortParagraph` did: kept the
   *  room, shrank the initial to `lines`, or left it out); `'split'`, the
   *  paragraph broke before the initial's last line, alone in a column
   *  too short for it; `'joiningScript'`, its first letter joins the next
   *  (Arabic, Syriac, N'Ko) and is not set apart; `'verticalText'`, drop
   *  caps are set in horizontal text only; `'noLetter'`, it opens with no
   *  letter or digit to set large (a reference, a formula, a note mark);
   *  `'inBox'` (#922), a `:::paragraphs{dropcap}` group or a paragraph
   *  style with a drop cap inside a `:::callout` box, where none is set
   *  (a composed page's frames take them).
   *  `text` is the paragraph's first line. Found by the layout. */
  | { kind: 'dropCap'; reason: 'shortParagraph' | 'split' | 'joiningScript' | 'verticalText' | 'noLetter' | 'inBox'; handling?: 'reserve' | 'shrink' | 'skip'; lines?: number; text: string }
  /** `codeOverflow` (#624): a code listing has lines wider than its box,
   *  fitted as `codeStyle.overflow` says: turned over (`'wrap'`), set
   *  smaller (`'shrink'`, at `scale` of its size; past `minFontScale` its
   *  lines wrap too) or cut at the box's edge (`'clip'`). `lines` counts
   *  the source lines too wide. Found by the layout. */
  | { kind: 'codeOverflow'; mode: 'wrap' | 'shrink' | 'clip'; lines: number; scale?: number; lang?: string }
  /** `floatShrunk` (#626): a floated picture was set smaller than its size
   *  to fit the room of its slot (`placement.shrink`), at `scale` of its
   *  width. `overflowPx`: at its smallest scale (`placement.minScale`) it
   *  still runs this far past the foot of the page's text block, on a page
   *  where it had nowhere else to go. Found by the layout; information
   *  more than a fault, unless it overflows. */
  | { kind: 'floatShrunk'; resourceId: string; scale: number; overflowPx?: number }
  /** `pictureBelowPrintSize` (#901): a bitmap with a print size (its own
   *  `bitmap.resolution`, or a number in `layout.bitmapResolution`) set in
   *  a column that holds it at under half of it, on a page whose text
   *  block is wider than that column: `scale` is the share of its print
   *  width it keeps, `printWidthPx` that width, `widthPx` the column's and
   *  `pageWidthPx` the text block's. A picture in the flow is never wider
   *  than its column, and the default page has two (`layout.layoutType:
   *  'double'`). Found by the layout; reported once per picture. */
  | { kind: 'pictureBelowPrintSize'; resourceId: string; scale: number; printWidthPx: number; widthPx: number; pageWidthPx: number }
  /** `emptyCaption` (#1151): a resource of a type with a caption prefix
   *  whose own caption is empty, so its caption line prints the label and
   *  number alone ("Figure 1.2."). Often meant (a numbered plate), often a
   *  caption left out; information. Reported once per resource, where it
   *  is first placed. Found by the layout. */
  | { kind: 'emptyCaption'; resourceId: string; label: string }
  /** `resourceMoved` (#1151): a resource set where its `::resource` line
   *  stands (`position: 'here'`) was too tall for the room left in its
   *  column and moved on to the next, leaving `emptyPx` (`emptyMm`) of
   *  that column empty on page `pageIndex`. Reported when the room left is at least
   *  two lines of the body grid; a wrapped picture says it with
   *  `textWrap` `'moved'`. Found by the layout. */
  | { kind: 'resourceMoved'; resourceId: string; emptyPx: number; emptyMm: number }
  /** `folioMissing` (#1163): a composed page whose running head, running
   *  foot or folio element (`elementId`, of the template's `slot`:
   *  `header`, `footer` or a decoration text reading `{pageNumber}`, a
   *  running name or `{attr.x}`) draws nothing, while `drawnOn` of the
   *  `siblings` other pages of the same `template` and `side` that mean to
   *  draw it do. `folio`: the element writes `{pageNumber}`. A page whose
   *  fence switches the element off (`when` / `unless`) or whose slot has
   *  no such element is no sibling. Found after the running heads are
   *  laid; reported once per page and element. */
  | { kind: 'folioMissing'; template: string; elementId: string; slot: 'header' | 'footer' | 'decoration'; folio: boolean; side: 'recto' | 'verso'; drawnOn: number; siblings: number }
  /** `textWrap` (#627): a resource or a box set to wrap text round it
   *  (`placement.wrap`, a box's `wrap`) that does not as asked.
   *  `'tooNarrow'`: the text beside it would be narrower than
   *  `layout.wrap.minTextWidth`, so it takes its band whole; `'fewLines'`:
   *  it is shorter than `layout.wrap.minLinesBeside` lines, so it takes
   *  its band whole; `'moved'`: an inline one was too tall for the room
   *  left in its column and moved on to the next, its anchor with it;
   *  `'verticalText'`: text wraps in horizontal text only, so in a
   *  vertical flow it takes its band whole; `'noContour'` (#883): a
   *  contour wrap (`wrap: 'contour'`, or a pushing frame's) round a
   *  picture whose shape is not known (an SVG with no
   *  `contour.points`, a bitmap with no transparency, or whose alpha
   *  channel the host did not trace), so the text runs round its box.
   *  `resourceId` names a resource, `box` a box's style. Found by the
   *  layout. */
  | { kind: 'textWrap'; reason: 'tooNarrow' | 'fewLines' | 'moved' | 'verticalText' | 'noContour'; resourceId?: string; box?: string }
  /** `columnsTooNarrow` (#634): the sub-columns of a `:::columns` group
   *  are narrower than six ems of its text, `widthPx` each, `columns` of
   *  them: few words fit a line. Found by the layout. */
  | { kind: 'columnsTooNarrow'; columns: number; widthPx: number }
  /** `afterText` (#639): a `span: 'side'` box, or a figure or table of
   *  the side column (`resourceId`), set on a page that holds no text: the
   *  text of its chapter (or of the document) ended while it still waited
   *  for room in the side column, so it took the side column of a page
   *  opened after the text. One per box or float, with the range of the
   *  box (of the block citing the float) and its page. Found by the
   *  layout. */
  | { kind: 'afterText'; resourceId?: string }
  /** `unplaced` (#639): a `span: 'side'` box, a floated box or a floated
   *  resource (`resourceId`) still waiting for a slot when the layout
   *  ended: it is on no page (the pages opened for it had no side column,
   *  say). The build reports it instead of dropping it silently. It has a
   *  source range and no page. Found by the layout. */
  | { kind: 'unplaced'; resourceId?: string }
  /** `shortListSplit` (#749): a list of `items` items, short by
   *  `bodyText.shortListMaxItems`, cut between two columns or pages. Under
   *  `bodyText.shortListSplit: 'warn'` every such list is reported; under
   *  `'avoid'` only the one no column could hold whole (a list taller than
   *  an empty column, or than the room a float left of one). One per
   *  list, with the range of the list and the page of its first item.
   *  Found by the layout. */
  | { kind: 'shortListSplit'; items: number }
  /** `tocGroupSplit` (#850): a block of the contents kept together
   *  (`toc.groups.keepTogether`, `:::toc{keep}`), headed by `title`, set in
   *  `columns` columns: taller than a full column, or in a column too short
   *  to hold it (under a page-span box, beside a float). With
   *  `toc.groups.continuation` the column it goes on in opens with its head
   *  row again. One per block, with the range of its `:::toc` and the page
   *  it starts on. Found by the layout. */
  | { kind: 'tocGroupSplit'; title: string; columns: number }
  /** `openerFloat` (#749): a float set on an opener page (the page a part
   *  or a heading's own break opens, the first page of a document that
   *  starts with a heading) under `layout.openerFloats: 'warn'`: a figure,
   *  a table or a strip (`resourceId`), or a floated box. One per float,
   *  with the range of the block citing it (of the box) and its page.
   *  Found by the layout. */
  | { kind: 'openerFloat'; resourceId?: string }
  /** `designTextTruncated` (#628): a design text element did not fit its
   *  width and lost part of a line: cut by an ellipsis (`mode`
   *  `'ellipsis-*'`, its `overflow`) or clipped with ink past its box
   *  (`'clip'`). `slot` is where the design is painted (a running head or
   *  folio, a heading design, a part page, a contents part row),
   *  `elementId` the element's id and `text` the whole text it was given.
   *  One per element and page; a running head or folio once per element
   *  and chapter (a chapter title cut on every page of its chapter is one
   *  warning). `sourceStart` / `sourceEnd` when the text mirrors a heading
   *  or a frontmatter field. Found by the layout. */
  | { kind: 'designTextTruncated'; slot: VDTDesignSlotKind; elementId: string; text: string; mode: 'ellipsis-start' | 'ellipsis-end' | 'ellipsis-middle' | 'clip' }
  /** A face the document's text was set in that the font set could not
   *  give when the build ran (#629): no face of the family was loaded nor
   *  installed, or the one that answers for the weight and slant had not
   *  loaded (`missing`: the text was measured and drawn with a fallback
   *  face), or the family has no face of that weight or slant and the
   *  browser took it from another one, as it is (the 700 for a 600) or
   *  drawn bolder or slanted (`synthesized`, #650). Checked
   *  where there is a font set (`document.fonts`, a worker's `self.fonts`,
   *  `BuildDocumentOptions.fontSet`), behind
   *  `debug.warnings.missingFont`. No page and no source range. */
  | { kind: 'fontFallback'; family: string; weight: number; style: 'normal' | 'italic'; reason: 'missing' | 'synthesized' }
  /** Characters the text sets in a face that has no glyph for them, which
   *  another face drew (#1105): the next family of the font list that has
   *  them (`supplier`, a generic family such as `serif` too), or, without
   *  `supplier`, a face the system picks. One per face: `characters` lists
   *  the first of them (each once, at most 24), `count` says how many in
   *  all. Checked by the glyph probe where there is a font set
   *  (`installGlyphProbe`), else against the `cmap` of the files
   *  registered with `registerFontCoverage`; behind
   *  `debug.warnings.missingFont`. No page and no source range. */
  | { kind: 'glyphFallback'; family: string; weight: number; style: 'normal' | 'italic'; characters: string[]; count: number; supplier?: string };
