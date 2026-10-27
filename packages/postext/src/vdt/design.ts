// Design slot blocks painted on running heads, folios, headings, part
// pages and boxes: text, rules, boxes, images and paths
// (#1276: split out of vdt.ts).
import type { CjkRegion, Resource } from '../types.js';
import type { BoundingBox } from './document.js';
import type { RoundedOutline } from './resourceTables.js';
import type { VDTChip } from './segments.js';

/** One run of a design text line set with inline marks (`inlineMarks`):
 *  its own font (bold, italic, a script at the reduced size) and advance.
 *  Runs are painted one after another from the line's `xOffset`. */
export interface VDTDesignTextRun {
  text: string;
  fontString: string;
  /** The leader of a contents part row (#889, `{leader}`): the dots, and
   *  the blank room around them. Read by no assistive technology: an
   *  artifact in a tagged PDF, hidden in HTML. */
  leader?: true;
  /** The run's own colour, over the block's (`#rrggbb`): a part row's
   *  leader set in a colour of its own (`toc.leader.color`, #1121). Absent
   *  on every other run. */
  color?: string;
  /** Advance of the run, tracking included. */
  width: number;
  /** Superscript / subscript offset off the baseline (px, positive down). */
  baselineShift?: number;
  /** The first of a subscript and a superscript set over each other, as
   *  on {@link VDTLineSegment.stacked}: width 0, the next run painted at
   *  the same x. */
  stacked?: boolean;
  /** Vertical text: set in one upright cell (`:tcy[…]`), as
   *  {@link VDTLineSegment.tcy}. */
  tcy?: true;
  /** Vertical text: stood upright or turned by its author (`:upright[…]`,
   *  `:sideways[…]`), as {@link VDTLineSegment.orientation}. */
  orientation?: 'upright' | 'sideways';
  /** Paint this run right to left (its bidi level is odd), as
   *  {@link VDTLineSegment.rtl}: shaped as one run, its brackets mirrored,
   *  never tracked. Absent on left-to-right runs. */
  rtl?: true;
  /** Paint-only shift of the run's glyphs, px, as on
   *  {@link VDTLineSegment.inkOffset}: present when the run's `width` is
   *  its box rather than its glyphs' advance, in a design text set by the
   *  CJK composer (#637): a full-width mark that gave up blank (negative
   *  when the blank before its glyph went), a space set at the Han–Latin
   *  width, a run that takes a Han–Latin space after it (0). Renderers
   *  paint the glyphs at `x + inkOffset` and advance by `width`; the HTML
   *  sets such a run in a box `width` wide. Absent on every other run. */
  inkOffset?: number;
  /** Paint-only stretch of the run's glyph along the line, as on
   *  {@link VDTLineSegment.inkScale}: a dash of a Chinese 破折号 (——) in a
   *  design text set by the CJK composer (#652), stretched from where
   *  `inkOffset` puts it so the pair prints as one rule over its two ems.
   *  Down a vertical line it is set (even when 1) and the dash is painted
   *  turned with the column. Absent on every other run. */
  inkScale?: number;
  /** An inline chip of the text (`:chip[…]`, #1162): a heading title's
   *  chip printed by its opener or design. `text` is the chip's one
   *  placeholder character and `width` its advance; renderers paint the
   *  box and the chip's own runs from the run's start (`chip.marginLeft`
   *  in), on the line's baseline, as on {@link VDTLineSegment.chip}.
   *  Absent on every other run. */
  chip?: VDTChip;
}

/** Line of wrapped text inside a `VDTDesignTextBlock`. */
export interface VDTDesignTextLine {
  text: string;
  /** X offset of the line's visible content inside the element's content box. */
  xOffset: number;
  /** Y offset of the line baseline relative to the element's y. */
  baselineY: number;
  /** Measured width of the visible text. */
  width: number;
  /** Present when the line mixes fonts (a text with inline marks) or is
   *  justified: paint these runs instead of `text` in the block font, each
   *  at the end of the one before. `text` stays the plain concatenation of
   *  the runs. A justified line is cut after every word space, and each
   *  run's `width` takes its spaces' share of the stretch. */
  runs?: VDTDesignTextRun[];
  /** Present on a justified line (`align: 'justify'`): the px added to every
   *  word space (U+0020 and the no-break space U+00A0), as CSS
   *  `word-spacing` adds it. The runs' widths already include it. */
  wordSpacingPx?: number;
  /** The order in which renderers advance through `runs` from `xOffset`
   *  (indices into it), when it is not 0, 1, … n − 1. As
   *  {@link VDTLine.order}: the visual order of the runs (UAX #9 L1/L2 on
   *  the line, at the block's base direction) when the block is painted
   *  on the sheet or in a left-to-right flow, its reverse when it is
   *  painted in the flow of a mirrored page (an opener, a heading design,
   *  a contents part row). A line whose text needs the bidi algorithm is
   *  always set in `runs`, cut where the direction changes. Absent on a
   *  line with no right-to-left run. */
  order?: number[];
  /** The line of a wrapping text holds a word of a joining script (Arabic)
   *  wider than the room: such a word is never cut, so it runs past the
   *  box, and the build reports an `unbreakableWordOverflow` warning, as
   *  for {@link VDTLine.wordOverflow}. Absent otherwise. */
  wordOverflow?: true;
  /** The line of a wrapping text ends in a piece of a word wider than the
   *  room, cut at a syllable or between two characters, as for
   *  {@link VDTLine.wordDivided} (#1150). Absent otherwise. */
  wordDivided?: 'syllable' | 'character';
}

/** Outline of the glyphs of a design text block, resolved to px / hex. */
export interface VDTDesignTextStroke {
  widthPx: number;
  color: string;
  /** Paint the outline only, leaving the letters unfilled. */
  hollow?: boolean;
}

/** Letters painted as dots to trace (`TextDotsStyle`), resolved to px:
 *  the painters lay the dots along each run's strokes (`textDots`). */
export interface VDTTextDots {
  spacingPx: number;
  sizePx: number;
}

/** Rounded-rectangle box style resolved to absolute px / hex values. */
export interface VDTDesignBoxStyle {
  backgroundColor?: string;
  /** The border's colour; with {@link borderSides}, the colour of the
   *  first side that has one (read by checks that want one colour). */
  borderColor?: string;
  /** The border's width; with {@link borderSides}, the widest side. */
  borderWidthPx: number;
  /** The corners' radius; with {@link borderRadiiPx}, the largest. */
  borderRadiusPx: number;
  /** One radius per corner, top-left, top-right, bottom-right,
   *  bottom-left (#1059). Absent: `borderRadiusPx` on every corner. */
  borderRadiiPx?: [number, number, number, number];
  /** The border per side (#1059), `null` for a side without one. Absent:
   *  `borderColor` / `borderWidthPx` on every side. The painters read it
   *  over those two. */
  borderSides?: Record<'top' | 'right' | 'bottom' | 'left', { color: string; widthPx: number } | null>;
}

/** Text block rendered inside a design slot (header / footer / heading). */
/** Where a design block comes from in the configuration (#857): the
 *  element of its design slot (`DesignElement.id`) and the JSON pointer of
 *  that element (`/pageTemplates/0/decoration/elements/2`,
 *  `/footer/elements/0`). Set on the blocks of a composed page's decoration
 *  and of the running heads; absent where the slot's origin is not known
 *  (a heading style's design, a callout's own overlay). */
export interface VDTDesignBlockOrigin {
  elementId?: string;
  configPath?: string;
  /** The Markdown attribute the block shows: `x` for a text element whose
   *  content is `{attr.x}` (its `sourceStart`/`sourceEnd` are the value's
   *  in the page fence or the heading) and for an image whose `resourceId`
   *  is `{attr.x}`; `label` / `title` for a frame's tab and title (the
   *  `:::frame` fence's). Absent otherwise. */
  attr?: string;
}

export interface VDTDesignTextBlock extends VDTDesignBlockOrigin {
  kind: 'text';
  bbox: BoundingBox;
  fontString: string;
  color: string;
  /** Absolute-page-coordinate baselines per line, already offset. */
  lines: VDTDesignTextLine[];
  box?: VDTDesignBoxStyle;
  /** Whether rendering should clip to `bbox`. */
  clip: boolean;
  /** Tracking applied after every glyph, in px (canvas `letterSpacing`,
   *  CSS `letter-spacing`, PDF `Tc`). Absent or 0 = none. */
  letterSpacingPx?: number;
  /** Outline stroked over the glyphs after they are filled (canvas
   *  `strokeText`, CSS `-webkit-text-stroke`, PDF text render mode 1/2).
   *  Absent = none. */
  stroke?: VDTDesignTextStroke;
  /** Letters painted as dots to trace, in the block's colour, in place of
   *  the filled glyphs (and of `stroke`). Absent = filled. */
  dotted?: VDTTextDots;
  /** Source range of the text this block displays when it mirrors document
   *  text (an opener's `{titleText}`), so editors can map clicks on the
   *  band back to the markdown. */
  sourceStart?: number;
  sourceEnd?: number;
  /** The exact title text the block renders (lines joined by `\n`) and its
   *  per-character source offsets, when the text mirrors document text. */
  sourceText?: string;
  sourceMap?: number[];
  /** Characters of `sourceText` printed before the mirrored text (#546): a
   *  heading number the design writes before `{titleText}`, "4. ". They map
   *  to the title's start; a caret or a selection of the title starts
   *  after them. Absent = none. */
  sourcePrefixLen?: number;
  /** Pagination furniture rather than document text — the title a split
   *  callout repeats on a continuation, its "Continued" marker: a tagged
   *  PDF marks it an artifact and the HTML hides it from assistive
   *  technology, so the text is read once. */
  artifact?: boolean;
  /** A continuation mark of a composed page's frame with a page number
   *  (#917): its words as written, `{page}` the number of the page the
   *  rest goes on on (`'to'`, `VDTFrame.continuesTo`) or comes from
   *  (`'from'`, `VDTFrame.continuedFrom`). The build sets `lines` from it
   *  once the pages are numbered. */
  pageMark?: { text: string; page: 'to' | 'from' };
  /** The base direction of the block's text (`DesignTextElement.direction`,
   *  by default the document's) when it is right to left: its lines'
   *  runs were ordered at that paragraph level, and an HTML line takes
   *  `dir="rtl"`. Absent for left-to-right text. */
  direction?: 'rtl';
  /** The element lost part of a line to fit its width (#628): `mode` is
   *  how (its `overflow`, or `'clip'` with ink past the box), `elementId`
   *  the element's id, `slot` where its design is painted and `text` the
   *  whole text it was given. The build reports it as a
   *  `designTextTruncated` content warning. Absent when every line shows
   *  whole. */
  truncated?: { elementId: string; slot: VDTDesignSlotKind; mode: 'ellipsis-start' | 'ellipsis-end' | 'ellipsis-middle' | 'clip'; text: string };
  /** A composed page's decoration text painted over the frames (#1189,
   *  `DesignTextElement.over`; a module's text by default): painted after
   *  every frame of the page, as an over connector's path (#1076). Absent:
   *  painted with the slot. */
  over?: true;
  /** Set vertically on a page or a slot whose text is horizontal
   *  (`DesignTextElement.writingMode: 'vertical-rl'`): the lines are laid
   *  out in the block's own frame, turned a quarter turn clockwise about
   *  its box's top right corner — a line's `xOffset` runs down from the
   *  box's top edge, its `baselineY` leftward from the box's right edge
   *  (0 there) — and painted through that frame with the vertical glyph
   *  painter. `bbox` is where the box stands. Absent on every other
   *  block. */
  vertical?: VDTVerticalText;
}

/** How the text of a vertical design block ({@link VDTDesignTextBlock.vertical})
 *  is set: the CJK region whose punctuation it takes, how many digits a
 *  number set in one cell may have (`cjk.uprightDigits`), and the central
 *  axis of each family it is set in (em above the baseline, as
 *  {@link VDTFlowFrame.centralBaselines}). */
export interface VDTVerticalText {
  region: CjkRegion;
  uprightDigits: number;
  centralBaselines: Record<string, number>;
}

/** Rendered rule inside a design slot. */
export interface VDTDesignRuleBlock extends VDTDesignBlockOrigin {
  kind: 'rule';
  bbox: BoundingBox;
  color: string;
  thicknessPx: number;
  direction: 'horizontal' | 'vertical';
}

/** Decorative rounded box. */
export interface VDTDesignBoxBlock extends VDTDesignBlockOrigin {
  kind: 'box';
  bbox: BoundingBox;
  box: VDTDesignBoxStyle;
  /** Paint the box clipped to this rounded outline (page coordinates, like
   *  `bbox`): the stripe of a callout whose frame has a `borderRadius`
   *  follows the frame's rounded corners, as CSS clips a `border-left` to
   *  `border-radius`. Absent = no clip. */
  clip?: RoundedOutline;
}

/** Image drawn from the resource image registry (e.g. a callout icon). */
export interface VDTDesignImageBlock extends VDTDesignBlockOrigin {
  kind: 'image';
  bbox: BoundingBox;
  /** Out-of-band binary id resolved at render time (canvas registry, HTML
   *  `resourceImageUrl`, PDF resource image map). */
  fileId: string;
  /** The kind of the resource's picture: whether `diagramStyle.singleInk`
   *  tints it (an SVG) or not (a bitmap). Absent on a VDT built before the
   *  field existed; the canvas and HTML backends then guess from the
   *  registered source or the URL. */
  imageKind?: 'bitmap' | 'svg';
  /** For an SVG with a print master (`Resource.svg.pdfFileId`): the
   *  master's id, which the PDF backend embeds in place of the SVG. */
  pdfFileId?: string;
  /** A picture of a vertical page's flow, sized to stand upright on the
   *  sheet: the box's `width` runs down the sheet and is the picture's
   *  height there, its `height` the picture's width. Renderers draw the
   *  picture turned back upright, filling the box. */
  upright?: true;
  /** The picture's alternative text, for a picture that is content (#213):
   *  its resource's `altText`, else its caption as plain text. HTML gives
   *  it as the `<img>`'s `alt`, a tagged PDF as the `/Alt` of a `Figure`.
   *  Absent for a `decorative` design element, for a resource with neither
   *  text, and for callout icons: such a picture is decoration (`alt=""`,
   *  an artifact). */
  altText?: string;
  /** The part of the picture shown in `bbox` (fractions of the picture as
   *  stored), for a `fit: 'cover'` element (#923): renderers draw the whole
   *  picture over `uncroppedPictureBox(bbox, crop)` clipped to `bbox`.
   *  Absent: the whole picture fills `bbox`. */
  crop?: { x: number; y: number; width: number; height: number };
  /** Paint the picture in this colour (`#rrggbb`): its silhouette, the
   *  opaque and translucent parts of the picture as stored, in one colour
   *  (#995). A label tab's picture takes the label's text colour
   *  (`label.icon.tint`). Every backend paints it: the canvas composites
   *  the decoded picture with `source-in`, the HTML filters it
   *  (`feFlood` in `SourceAlpha`), the PDF recolours a vector picture's
   *  paths and gives a bitmap a solid colour through its own alpha. A
   *  picture without transparency becomes a plain rectangle, as in a
   *  browser. Wins over `diagramStyle.singleInk`. */
  tint?: string;
}

/** One command of a {@link VDTDesignPathBlock}'s outline, in absolute page
 *  px (y down): move, line, cubic (`C`, two control points) and quadratic
 *  (`Q`, one) Bézier curves, and close. */
export type VDTPathCommand =
  | { op: 'M' | 'L'; x: number; y: number }
  | { op: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { op: 'Q'; x1: number; y1: number; x: number; y: number }
  | { op: 'Z' };

/** How a {@link VDTDesignPathBlock}'s outline is stroked: colour (`#rrggbb`
 *  or `#rrggbbaa`), width in px, dash pattern in px (on, off, …), line
 *  caps and joins. Absent cap: `'butt'`; absent join: `'miter'`. */
export interface VDTPathStroke {
  color: string;
  widthPx: number;
  dash?: number[];
  cap?: 'butt' | 'round' | 'square';
  join?: 'miter' | 'round' | 'bevel';
}

/** A mark at a point of a path (the end of a connector): a filled dot
 *  `sizePx` across centred on the point, a filled arrowhead whose tip is
 *  the point, `sizePx` long, pointing along `angle`, a ring (#1079) `sizePx`
 *  across its outer edge, or a bar (#1079) `sizePx` long across `angle`,
 *  centred on the point (see `pathMarkerOutline`). */
export interface VDTPathMarker {
  /** `dot` and `arrow` are filled; `ring` and `bar` (#1079) are stroked
   *  {@link widthPx} wide. */
  kind: 'dot' | 'arrow' | 'ring' | 'bar';
  x: number;
  y: number;
  /** Radians, the direction the line arrives in (arrows point along it). */
  angle: number;
  sizePx: number;
  color: string;
  /** The stroke width of a `ring` or a `bar` (the line's width). */
  widthPx?: number;
}

/** A vector shape a design draws (DESIGN §12.1, #1055): lines, curves and
 *  closed outlines, filled and/or stroked, with dots or arrowheads at
 *  points of it. Connectors, path elements and the shapes a rounded
 *  rectangle cannot draw paint through it. Coordinates are absolute page
 *  px like every other design block's; `bbox` holds the whole ink (stroke
 *  and markers included), for hit tests and clips. Decoration, never
 *  content: a tagged PDF marks it a Layout artifact, the HTML hides it from
 *  assistive technology, the contrast check does not read it. */
export interface VDTDesignPathBlock extends VDTDesignBlockOrigin {
  kind: 'path';
  bbox: BoundingBox;
  subpaths: VDTPathCommand[][];
  /** Fill colour; absent = no fill. */
  fill?: string;
  /** Absent: `'nonzero'`. */
  fillRule?: 'nonzero' | 'evenodd';
  /** Absent = no stroke. */
  stroke?: VDTPathStroke;
  markers?: VDTPathMarker[];
  /** The part of a box's shape the path paints (#1059: a card joined to
   *  its tab): `'fill'` its background, which the contrast check reads as
   *  the ground of the text over it; `'border'` its border, drawn as a
   *  fill {@link borderWidthPx} wide, which part palettes recolour as the
   *  box's border and preflight checks as a rule. Absent on other paths. */
  boxPart?: 'fill' | 'border';
  /** The widest side of a `boxPart: 'border'` path. */
  borderWidthPx?: number;
  /** A ring or a dot the engine draws as a box's icon, its marker or a
   *  label tab's icon (#1120, `kind: 'shape'`): part palettes recolour it
   *  as the frame's icon (its text role). Absent on other paths. */
  drawnIcon?: true;
  /** A connector painted over the frames (#1076, `DesignConnectorElement.over`):
   *  the block stays in its decoration slot, but the backends paint it
   *  after every frame of the page (`composedPaintOrder`'s `'over'` item),
   *  not with the slot's other blocks. Absent: painted with the slot. */
  over?: true;
}

export type VDTDesignBlock =
  | VDTDesignTextBlock
  | VDTDesignRuleBlock
  | VDTDesignBoxBlock
  | VDTDesignImageBlock
  | VDTDesignPathBlock;

export interface VDTDesignSlot {
  bbox: BoundingBox;
  blocks: VDTDesignBlock[];
}

/** @deprecated Use `VDTDesignSlot`. */
export type VDTHeaderFooterSlot = VDTDesignSlot;
/** @deprecated Use `VDTDesignBlock`. */
export type VDTHeaderFooterBlock = VDTDesignBlock;
/** @deprecated Use `VDTDesignTextBlock`. */
export type VDTHeaderFooterTextBlock = VDTDesignTextBlock;
/** @deprecated Use `VDTDesignRuleBlock`. */
export type VDTRuleBlock = VDTDesignRuleBlock;

/** Where a design slot is painted: a running head (`'header'`), a folio
 *  (`'footer'`), a heading design (`'heading'`), a part page or its verso
 *  (`'part'`), a part row of the contents (`'tocRow'`), a box style's
 *  design (`'box'`, #1014). */
export type VDTDesignSlotKind = 'header' | 'footer' | 'heading' | 'part' | 'tocRow' | 'box';

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

/** What a design image block records of the resource picture `fileId`
 *  (already picked from `resource`): its kind, which decides whether
 *  `diagramStyle.singleInk` tints it, and an SVG's print master. */
export function pictureTraits(
  resource: Resource | undefined,
  fileId: string,
): Pick<VDTDesignImageBlock, 'imageKind' | 'pdfFileId'> {
  if (resource?.bitmap?.fileId === fileId) return { imageKind: 'bitmap' };
  const svg = resource?.svg;
  if (svg?.fileId !== fileId) return {};
  return { imageKind: 'svg', ...(svg.pdfFileId ? { pdfFileId: svg.pdfFileId } : {}) };
}
