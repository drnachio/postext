/**
 * Figure labels drawn on their picture (#860, DESIGN §2.6, §3.3).
 *
 * A `:::figure` lists `::label[TEXT]{at style}` lines; the resource holds
 * the anchors (points in fractions of the whole picture, shared by every
 * locale). Each label is set as a small caption (inline Markdown: bold,
 * italic, chips, marks, references, formulas) in its label style, wrapped
 * within its anchor's `width` and, when a word is still too wide, set
 * smaller down to the style's `minScale`. Its box stands at the anchor's
 * point as `align` / `verticalAlign` say (start and end follow the label's
 * own direction), turned by `rotate` degrees about that point.
 *
 * The label's geometry is kept in its own frame (origin at the anchor
 * point) and the point itself relative to the picture's body, so the
 * label moves with its block wherever placement, frames, spreads or the
 * memo put it, and the painters only add the body's corner:
 * {@link figureLabelMatrix}. Once the pages exist the build stamps each
 * label's `rect` (for `sourceAt`) and reports the anchors a figure names
 * wrongly or leaves without a word ({@link figureLabelWarnings}).
 */

import type { InlineSpan } from '../parse/types.js';
import type { FigureLabel } from '../parse/types.js';
import type { ColorValue, Dimension, LeaderStyle, LineCap, Resource, ResourceAnchor, ResourceType, ResolvedParagraphStyleConfig } from '../types.js';
import type {
  BoundingBox,
  ContentWarning,
  ResolvedConfig,
  ResolvedResourceBlock,
  VDTBlock,
  VDTDesignBoxStyle,
  VDTDesignPathBlock,
  VDTDocument,
  VDTFigureLabel,
  VDTFigureLabelLayout,
  VDTFigureLabelLeader,
  VDTPage,
  VDTPathMarker,
  VDTLine,
  VDTVerticalText,
} from '../vdt.js';
import type { MeasurementCache } from '../measure/index.js';
import type { ResourceNumberingMap } from '../pipeline/resources/resourceNumbering.js';
import { buildFontString } from '../measure/index.js';
import { flowTextWidth, fontFamilyOf, measureCentralBaseline, withMeasureWritingMode } from '../measure/vertical.js';
import { dimensionToPx } from '../units.js';
import { resolveColorValue } from '../defaults/shared.js';
import { layoutLabelLines } from '../pipeline/resources/resourceLayout.js';
import { uppercasePreservingLength } from '../pipeline/blocks/buildBlockKind.js';
import { firstStrongDirection } from '../design/bidiText.js';
import { withIconAlts } from './labelText.js';
import { BREAK_PLACEHOLDER, SWATCH_PLACEHOLDER } from '../parse/inlineFormatting.js';
import { flowRectToPage, flowToPage } from '../vdt.js';
import { capEnd, DEFAULT_CAP_SIZE_PER_WIDTH, DEFAULT_CONNECTOR_WIDTH, opacityOf, polylineCommands, type Pt as LinePt } from '../design/connector.js';
import { colorWithOpacity, pathInkBox } from '../design/pathBlock.js';

/** `[a, b, c, d, e, f]`, canvas `transform` order (y down). */
export type LabelMatrix = [number, number, number, number, number, number];

/** The line pitch of a label, in ems, when no paragraph style lends one. */
const LABEL_LINE_HEIGHT = 1.15;
/** Measure of a label with no `width`: as good as unbounded. */
const NO_MEASURE = 1e6;

/** A label style resolved for one label: the type and the plate. */
export interface LabelLook {
  styleId?: string;
  fontFamily: string;
  fontPx: number;
  weight: number;
  boldWeight: number;
  italic: boolean;
  color: string;
  uppercase: boolean;
  /** Ems. */
  letterSpacing: number;
  lineHeight: number;
  halo?: { color: string; widthPx: number };
  background?: string;
  paddingPx: number;
  minScale: number;
  /** Set in vertical writing (the label style's; an anchor's wins). */
  vertical?: boolean;
  /** How the lines line up inside the box (#1058); absent: as the anchor
   *  places the box. */
  align?: 'start' | 'center' | 'end';
  /** The plate's outline and corners (#1058). */
  border?: { color: string; widthPx: number };
  radiusPx?: number;
  /** A map's key (#1058): rows of symbol and text. */
  legend?: boolean;
  /** The style's leader look (#1057), as written. */
  leader?: LeaderStyle;
}

const hexOf = (value: ColorValue | undefined, resolved: ResolvedConfig, fallback: ColorValue): string =>
  resolveColorValue(value, resolved.colorPalette, fallback).hex;

const px = (dim: Dimension | undefined, dpi: number, em: number): number | undefined => {
  if (!dim || typeof dim.value !== 'number' || !Number.isFinite(dim.value)) return undefined;
  try {
    return dimensionToPx(dim, dpi, em);
  } catch {
    return undefined;
  }
};

/**
 * The look of a label set in style `styleId` (the label's own `style`,
 * else its anchor's): the body text's type, under the paragraph style the
 * label style borrows (`paragraphStyle`), under the label style's own
 * fields. An unknown or absent style is the body text's type.
 */
export function resolveLabelLook(styleId: string | undefined, resolved: ResolvedConfig): LabelLook {
  const dpi = resolved.page.dpi;
  const body = resolved.bodyText;
  const style = styleId !== undefined ? resolved.labelStyles?.find((s) => s.id === styleId) : undefined;
  const para: ResolvedParagraphStyleConfig | undefined = style?.paragraphStyle
    ? resolved.paragraphStyles.find((p) => p.id === style.paragraphStyle)
    : undefined;
  const bodyPx = px(body.fontSize, dpi, 16) ?? 16;
  const paraPx = para ? px(para.fontSize, dpi, bodyPx) ?? bodyPx : bodyPx;
  const fontPx = px(style?.fontSize, dpi, paraPx) ?? paraPx;
  const lineHeight = para
    ? Math.max(0.8, (px(para.lineHeight, dpi, paraPx) ?? paraPx * LABEL_LINE_HEIGHT) / paraPx)
    : LABEL_LINE_HEIGHT;
  const haloWidth = style?.halo ? px(style.halo.width, dpi, fontPx) : undefined;
  const borderWidth = style?.border ? px(style.border.width, dpi, fontPx) : undefined;
  const radius = px(style?.radius, dpi, fontPx);
  const align = style?.align === 'start' || style?.align === 'center' || style?.align === 'end' ? style.align : undefined;
  return {
    ...(style ? { styleId: style.id } : {}),
    fontFamily: style?.fontFamily ?? para?.fontFamily ?? body.fontFamily,
    fontPx,
    weight: style?.fontWeight ?? para?.fontWeight ?? body.fontWeight,
    boldWeight: Math.max(para?.boldFontWeight ?? body.boldFontWeight, style?.fontWeight ?? 0),
    // A borrowed paragraph style's slant and capitals hold unless the
    // label style says otherwise: 'italic' / 'uppercase' turn them on,
    // 'normal' / 'none' written turn them off (#955).
    italic: style?.fontStyle !== undefined ? style.fontStyle === 'italic' : para?.italic === true,
    color: hexOf(style?.color ?? para?.color, resolved, body.color),
    uppercase: style?.textTransform !== undefined ? style.textTransform === 'uppercase' : para?.textTransform === 'uppercase',
    letterSpacing: typeof style?.letterSpacing === 'number' && Number.isFinite(style.letterSpacing) ? style.letterSpacing : 0,
    lineHeight,
    ...(style?.halo && haloWidth !== undefined && haloWidth > 0
      ? { halo: { color: hexOf(style.halo.color, resolved, { hex: '#ffffff', model: 'hex' }), widthPx: haloWidth } }
      : {}),
    ...(style?.background ? { background: hexOf(style.background, resolved, { hex: '#ffffff', model: 'hex' }) } : {}),
    paddingPx: Math.max(0, px(style?.padding, dpi, fontPx) ?? 0),
    minScale: style ? Math.min(1, Math.max(0.1, style.minScale)) : 0.85,
    ...(style?.writingMode === 'vertical-rl' ? { vertical: true } : {}),
    ...(align ? { align } : {}),
    ...(style?.border && borderWidth !== undefined && borderWidth > 0
      ? { border: { color: hexOf(style.border.color, resolved, { hex: '#000000', model: 'hex' }), widthPx: borderWidth } }
      : {}),
    ...(radius !== undefined && radius > 0 ? { radiusPx: radius } : {}),
    ...(style?.kind === 'legend' ? { legend: true } : {}),
    ...(style?.leader && typeof style.leader === 'object' ? { leader: style.leader } : {}),
  };
}

/** Where a label stands on the picture: its anchor (looked up on the
 *  resource) or its percentages, with the anchor's label fields. */
export interface LabelPlace {
  /** Fractions of the whole picture. */
  x: number;
  y: number;
  anchor?: ResourceAnchor;
}

/** The place of `label` on `resource`; undefined when it names an anchor
 *  the resource lacks. */
export function labelPlace(label: Pick<VDTFigureLabel, 'at'>, resource: Pick<Resource, 'anchors'>): LabelPlace | undefined {
  if ('anchor' in label.at) {
    const id = label.at.anchor;
    const anchor = resource.anchors?.find((a) => a.id === id);
    if (!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return undefined;
    return { x: anchor.x, y: anchor.y, anchor };
  }
  const { x, y } = label.at;
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
}

/** A point of the whole picture (fractions) in px from the top-left of the
 *  body as drawn: through its crop (`bodySource`) and its size. */
export function pictureToBody(rb: Pick<ResolvedResourceBlock, 'bodyRect' | 'bodySource'>, fx: number, fy: number): { x: number; y: number } {
  const src = rb.bodySource ?? { x: 0, y: 0, width: 1, height: 1 };
  const w = src.width > 0 ? src.width : 1;
  const h = src.height > 0 ? src.height : 1;
  return { x: ((fx - src.x) / w) * rb.bodyRect.width, y: ((fy - src.y) / h) * rb.bodyRect.height };
}

/** The width of the whole picture in px, as its body draws it. */
const pictureWidthPx = (rb: Pick<ResolvedResourceBlock, 'bodyRect' | 'bodySource'>): number =>
  rb.bodyRect.width / (rb.bodySource && rb.bodySource.width > 0 ? rb.bodySource.width : 1);

/** The height of the whole picture in px, as its body draws it. */
const pictureHeightPx = (rb: Pick<ResolvedResourceBlock, 'bodyRect' | 'bodySource'>): number =>
  rb.bodyRect.height / (rb.bodySource && rb.bodySource.height > 0 ? rb.bodySource.height : 1);

/** What laying the labels out needs besides the block. */
export interface FigureLabelContext {
  resolved: ResolvedConfig;
  resourceNumbering?: ResourceNumberingMap;
  resourceTypes?: ResourceType[];
  resources?: Resource[];
  cache?: MeasurementCache;
}

const upperSpans = (spans: readonly InlineSpan[]): InlineSpan[] =>
  spans.map((s) => (s.text ? { ...s, text: uppercasePreservingLength(s.text) } : s)).map((s) =>
    s.chip ? { ...s, chip: { ...s.chip, spans: s.chip.spans.map((c) => ({ ...c, text: uppercasePreservingLength(c.text) })) } } : s);

const moveLine = (line: VDTLine, dx: number, dy: number): VDTLine => ({
  ...line,
  bbox: { x: line.bbox.x + dx, y: line.bbox.y + dy, width: line.bbox.width, height: line.bbox.height },
  baseline: line.baseline + dy,
  ...(line.measure ? { measure: { ...line.measure, x: line.measure.x + dx } } : {}),
});

/** The segment index of the inline symbol that opens `line` (its first
 *  segment that is not a space), or -1. */
function openingSymbol(line: VDTLine): number {
  const segs = line.segments;
  if (!segs) return -1;
  const i = segs.findIndex((s) => s.kind !== 'space');
  return i >= 0 && segs[i]!.kind === 'swatch' && segs[i]!.swatch?.icon ? i : -1;
}

/**
 * The rows of a legend (#1058) with the symbol that opens each row hung in
 * one column: every such symbol's segment widened to the widest of them,
 * the symbol centred in it, so the words after them start at one edge. A
 * row with no symbol first is left as it is. The segments are copies: the
 * measured lines may be shared with a cache.
 */
export function hangLegendSymbols(lines: readonly VDTLine[]): VDTLine[] {
  const at = lines.map(openingSymbol);
  let column = 0;
  lines.forEach((line, k) => {
    if (at[k]! >= 0) column = Math.max(column, line.segments![at[k]!]!.width);
  });
  return lines.map((line, k) => {
    const i = at[k]!;
    if (i < 0) return line;
    const seg = line.segments![i]!;
    const extra = column - seg.width;
    if (extra <= 1e-9) return line;
    const icon = seg.swatch!.icon!;
    const segments = line.segments!.slice();
    segments[i] = { ...seg, width: column, swatch: { ...seg.swatch, icon: { ...icon, insetPx: (icon.insetPx ?? 0) + extra / 2 } } };
    return { ...line, segments, bbox: { ...line.bbox, width: line.bbox.width + extra } };
  });
}

/** A label's spans with each `\\` that ends a word made a forced line
 *  break, as in a caption: two characters for two (the break and a space
 *  the next line drops), so the source map holds. */
function withForcedBreaks(spans: InlineSpan[]): InlineSpan[] {
  return spans.map((s) => (s.text.includes('\\\\') ? { ...s, text: s.text.replace(/\\\\(?=\s|$)/g, `${BREAK_PLACEHOLDER} `) } : s));
}

/** The plain text a label's spans read as (a chip's words included). */
function spanText(spans: readonly InlineSpan[]): string {
  return spans.map((s) => (s.chip ? s.chip.spans.map((c) => c.text).join('') : s.text)).join('');
}

const CJK_CHAR = '\\u2E80-\\u303F\\u3040-\\u30FF\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uAC00-\\uD7AF\\uFF00-\\uFFEF';
const PIECES = new RegExp(`[${CJK_CHAR}]|[^${CJK_CHAR}\\s]+`, 'gu');

/** The pieces of `text` a line cannot be cut inside: the words between
 *  spaces, and each Chinese, Japanese or Korean character on its own. */
function unbreakablePieces(text: string): string[] {
  return text.match(PIECES) ?? [];
}

/**
 * Lay out one label: its lines in its look, wrapped within `widthPx` (none:
 * one line per forced break), set smaller (down to `minScale`) while a
 * line is wider, then placed about the anchor point by `align` and
 * `verticalAlign`.
 */
export function layOutLabel(
  spans: readonly InlineSpan[],
  look: LabelLook,
  place: { x: number; y: number; widthPx?: number; align?: ResourceAnchor['align']; verticalAlign?: ResourceAnchor['verticalAlign']; rotate?: number; vertical?: boolean },
  ctx: FigureLabelContext,
): VDTFigureLabelLayout | undefined {
  const text = withForcedBreaks(look.uppercase ? upperSpans(spans) : [...spans]);
  const plain = spanText(text);
  if (plain.trim().length === 0) return undefined;
  // Vertical writing (#902): measured as a vertical page's flow is, in the
  // label's own frame, which the matrix then turns a quarter turn
  // clockwise; the text reads top to bottom in columns from right to left.
  const vertical = place.vertical ?? look.vertical ?? false;
  const region = ctx.resolved.cjk.region;
  const inMode = <T,>(fn: () => T): T => (vertical ? withMeasureWritingMode('vertical-rl', fn, region) : fn());
  // The placeholder of a swatch or an inline symbol (#1058) that opens a
  // row is no letter: the words after it say the direction.
  const rtl = !vertical && firstStrongDirection(plain.replaceAll(SWATCH_PLACEHOLDER, '')) === 'rtl';
  const widthPx = place.widthPx !== undefined && place.widthPx > 0 ? place.widthPx : undefined;
  const fontsAt = (sizePx: number): [string, string, string, string] => {
    const w = look.weight === 400 ? 'normal' : String(look.weight);
    const b = String(look.boldWeight);
    const slant = look.italic ? 'italic' : 'normal';
    const flip = look.italic ? 'normal' : 'italic';
    return [
      buildFontString(look.fontFamily, sizePx, w, slant),
      buildFontString(look.fontFamily, sizePx, b, slant),
      buildFontString(look.fontFamily, sizePx, w, flip),
      buildFontString(look.fontFamily, sizePx, b, flip),
    ];
  };
  const measure = (scale: number) => inMode(() => {
    const sizePx = look.fontPx * scale;
    const fonts = fontsAt(sizePx);
    const lines = layoutLabelLines({
      spans: text,
      fonts,
      fontPx: sizePx,
      lineHeightPx: sizePx * look.lineHeight,
      maxWidthPx: widthPx ?? NO_MEASURE,
      ...(look.letterSpacing !== 0 ? { letterSpacingPx: look.letterSpacing * sizePx } : {}),
      direction: rtl ? 'rtl' : 'ltr',
      resolved: ctx.resolved,
      ...(ctx.resourceNumbering ? { resourceNumbering: ctx.resourceNumbering } : {}),
      ...(ctx.resourceTypes ? { resourceTypes: ctx.resourceTypes } : {}),
      ...(ctx.resources ? { resources: ctx.resources } : {}),
      ...(ctx.cache ? { cache: ctx.cache } : {}),
    });
    const widest = lines.reduce((m, l) => Math.max(m, l.bbox.width), 0);
    // A word wider than the measure is divided by the measurer: the label
    // does not fit.
    const cut = widthPx !== undefined && (widest > widthPx + 0.01 || lines.some((l) => l.hyphenated && !l.hardHyphen));
    return { lines, fonts, widest, sizePx, cut };
  });
  let scale = 1;
  if (widthPx !== undefined) {
    // The widest word sets the first guess.
    const font = fontsAt(look.fontPx)[0];
    const tracking = look.letterSpacing * look.fontPx;
    const word = inMode(() => unbreakablePieces(plain).reduce((m, w) => Math.max(m, flowTextWidth(w, font) + tracking * [...w].length), 0));
    if (word > widthPx) scale = Math.max(look.minScale, (widthPx / word) * 0.999);
  }
  let set = measure(scale);
  // Still cut or wider than the measure: a little smaller, down to the
  // style's floor.
  for (let round = 0; round < 6 && set.cut && scale > look.minScale + 1e-6; round++) {
    scale = Math.max(look.minScale, scale * Math.min(0.97, widthPx! / Math.max(set.widest, widthPx! + 1e-6)));
    set = measure(scale);
  }
  if (set.lines.length === 0) return undefined;
  // A legend (#1058): the symbol that opens each row hangs in a column as
  // wide as the widest.
  const setLines = look.legend && !vertical ? hangLegendSymbols(set.lines) : set.lines;
  const boxW = setLines === set.lines ? set.widest : setLines.reduce((m, l) => Math.max(m, l.bbox.width), 0);
  const pitch = set.sizePx * look.lineHeight;
  const boxH = Math.max(pitch * setLines.length, setLines.reduce((m, l) => Math.max(m, l.bbox.y + l.bbox.height), 0));
  const align = place.align ?? 'center';
  // `start` is the label's own start: its left edge, its right edge right
  // to left.
  const sideOf = (a: 'start' | 'center' | 'end'): 'left' | 'center' | 'right' => (a === 'center' ? 'center' : (a === 'start') !== rtl ? 'left' : 'right');
  const side = sideOf(align);
  // The lines inside the box: the style's `align` (#1058), a legend's rows
  // at their start, else as the box stands at its point.
  const lineSide = look.align ? sideOf(look.align) : look.legend ? sideOf('start') : side;
  const left = side === 'center' ? -boxW / 2 : side === 'left' ? 0 : -boxW;
  const vAlign = place.verticalAlign ?? 'middle';
  const top = vAlign === 'top' ? 0 : vAlign === 'bottom' ? -boxH : -boxH / 2;
  const lines = setLines.map((line) => {
    const slack = Math.max(0, boxW - line.bbox.width);
    const dx = lineSide === 'center' ? slack / 2 : lineSide === 'left' ? 0 : slack;
    return moveLine(line, left + dx - line.bbox.x, top);
  });
  const box: BoundingBox = { x: left, y: top, width: boxW, height: boxH };
  const pad = look.paddingPx;
  const plateRect = { x: left - pad, y: top - pad, width: boxW + 2 * pad, height: boxH + 2 * pad };
  // A vertical label's frame is the flow frame of a vertical page: turned
  // a quarter turn clockwise on the picture, and further by `rotate`.
  const turn = (place.rotate !== undefined && Number.isFinite(place.rotate) ? place.rotate : 0) + (vertical ? 90 : 0);
  const rotate = Math.abs(turn % 360) > 1e-9 ? turn % 360 : undefined;
  const verticalText: VDTVerticalText | undefined = vertical ? verticalTextOf(set.lines, set.fonts, region, ctx) : undefined;
  return {
    x: place.x,
    y: place.y,
    ...(rotate !== undefined ? { rotate } : {}),
    lines,
    box,
    fontString: set.fonts[0],
    boldFontString: set.fonts[1],
    italicFontString: set.fonts[2],
    boldItalicFontString: set.fonts[3],
    color: look.color,
    ...(look.halo ? { halo: { color: look.halo.color, widthPx: look.halo.widthPx * scale } } : {}),
    ...(look.background || look.border
      ? {
          background: {
            ...(look.background ? { color: look.background } : {}),
            rect: plateRect,
            ...(look.border ? { border: look.border } : {}),
            ...(look.radiusPx !== undefined ? { radiusPx: look.radiusPx } : {}),
          },
        }
      : {}),
    ...(look.legend && !vertical ? { legend: true as const } : {}),
    ...(scale < 1 - 1e-6 ? { scale } : {}),
    ...(set.cut ? { overflow: true as const } : {}),
    ...(look.styleId !== undefined ? { styleId: look.styleId } : {}),
    ...(rtl ? { direction: 'rtl' as const } : {}),
    ...(verticalText ? { vertical: verticalText } : {}),
  };
}

/** How a vertical label is painted: the document's region and upright
 *  digits, and the central axis of each family it is set in. */
function verticalTextOf(lines: readonly VDTLine[], fonts: readonly string[], region: VDTVerticalText['region'], ctx: FigureLabelContext): VDTVerticalText {
  const centralBaselines: Record<string, number> = {};
  const add = (font: string | undefined): void => {
    if (!font) return;
    const family = fontFamilyOf(font);
    if (family && !(family in centralBaselines)) centralBaselines[family] = measureCentralBaseline(family);
  };
  for (const font of fonts) add(font);
  for (const line of lines) {
    for (const seg of line.segments ?? []) {
      add(seg.fontString);
      for (const run of seg.chip?.runs ?? []) add(run.fontString);
    }
  }
  return { region, uprightDigits: ctx.resolved.cjk.uprightDigits, centralBaselines };
}

/**
 * The labels of a figure laid out on its picture: `labels` (the VDT's,
 * `figureLabels`) with the `layout` of each one that can be drawn, read
 * from `parsed` (the parser's, the same order) for its inline Markdown.
 * A table, a video or a picture with no body draws none; a label whose
 * anchor is unknown is left without a layout.
 */
export function layOutFigureLabels(
  labels: readonly VDTFigureLabel[],
  parsed: readonly Pick<FigureLabel, 'spans'>[] | undefined,
  rb: ResolvedResourceBlock,
  ctx: FigureLabelContext,
): VDTFigureLabel[] {
  if (rb.kind !== 'bitmap' && rb.kind !== 'svg') return [...labels];
  if (!(rb.bodyRect.width > 0) || !(rb.bodyRect.height > 0)) return [...labels];
  const pictureW = pictureWidthPx(rb);
  const pictureH = pictureHeightPx(rb);
  return labels.map((label, i) => {
    const place = labelPlace(label, rb.resource);
    if (!place) return label;
    const anchor = place.anchor;
    // Set away from its point (#1057): the box stands at `labelAt`, the
    // point stays where a leader ends.
    const away = anchor ? validLabelAt(anchor.labelAt) : undefined;
    const at = pictureToBody(rb, away?.x ?? place.x, away?.y ?? place.y);
    const look = resolveLabelLook(label.style ?? anchor?.style, ctx.resolved);
    const spans = parsed?.[i]?.spans ?? [{ text: label.text, bold: false, italic: false }];
    // The anchor's writing mode wins over the style's; a vertical label's
    // measure is a share of the picture's height.
    const vertical = anchor?.writingMode !== undefined ? anchor.writingMode === 'vertical-rl' : look.vertical === true;
    const layout = layOutLabel(spans, look, {
      x: at.x,
      y: at.y,
      vertical,
      ...(anchor?.width !== undefined && anchor.width > 0 ? { widthPx: anchor.width * (vertical ? pictureH : pictureW) } : {}),
      ...(anchor?.align ? { align: anchor.align } : {}),
      ...(anchor?.verticalAlign ? { verticalAlign: anchor.verticalAlign } : {}),
      ...(anchor?.rotate !== undefined ? { rotate: anchor.rotate } : {}),
    }, ctx);
    if (!layout) return label;
    const leader = anchor ? labelLeader(label, anchor, away !== undefined, look, layout, pictureToBody(rb, place.x, place.y), ctx.resolved) : undefined;
    return { ...label, layout: leader ? { ...layout, leader } : layout };
  });
}

/** `labelAt` when it is a point of the picture (two finite numbers). */
function validLabelAt(v: unknown): { x: number; y: number } | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const { x, y } = v as { x?: unknown; y?: unknown };
  return typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
}

const capOrNone = (v: unknown, fallback: LineCap): Exclude<LineCap, 'none'> | undefined => {
  const c = v === 'dot' || v === 'arrow' || v === 'ring' || v === 'bar' || v === 'none' ? v : fallback;
  return c === 'none' ? undefined : c;
};

/** The share of the label's type size left between its words and its
 *  leader, when it has no plate. */
const LEADER_GAP_EM = 0.25;

/**
 * The leader of a label set at `anchor` (#1057), or undefined when it has
 * none: the label's own `leader` attribute, else the anchor's `leader`,
 * else a label set away from its point whose style has a leader look. The
 * look is the style's `leader` under the anchor's (an object), field by
 * field; the colour defaults to the label's text colour, the end at the
 * point to a dot.
 */
function labelLeader(
  label: Pick<VDTFigureLabel, 'leader'>,
  anchor: ResourceAnchor,
  away: boolean,
  look: LabelLook,
  layout: VDTFigureLabelLayout,
  point: { x: number; y: number },
  resolved: ResolvedConfig,
): VDTFigureLabelLeader | undefined {
  const own = anchor.leader;
  const on = label.leader ?? (own === false ? false : own !== undefined && own !== null ? true : away && look.leader !== undefined);
  if (!on) return undefined;
  const style: LeaderStyle = { ...(look.leader ?? {}), ...(own && typeof own === 'object' ? own : {}) };
  const dpi = resolved.page.dpi;
  const widthPx = Math.max(0, px(style.width, dpi, look.fontPx) ?? dimensionToPx(DEFAULT_CONNECTOR_WIDTH, dpi));
  const capSizePx = Math.max(0, px(style.capSize, dpi, look.fontPx) ?? widthPx * DEFAULT_CAP_SIZE_PER_WIDTH);
  const dash = Array.isArray(style.dash) ? style.dash.map((d) => px(d, dpi, look.fontPx)).filter((v): v is number => v !== undefined && v >= 0) : [];
  const color = style.color ? hexOf(style.color, resolved, { hex: look.color, model: 'hex' }) : look.color;
  const startCap = capOrNone(style.startCap, 'none');
  const endCap = capOrNone(style.endCap, 'dot');
  const opacity = opacityOf(style.opacity);
  return {
    x: point.x,
    y: point.y,
    routing: style.routing === 'elbow' ? 'elbow' : 'straight',
    stroke: { color, widthPx, ...(dash.length > 0 && dash.some((v) => v > 0) ? { dash } : {}) },
    ...(startCap ? { startCap } : {}),
    ...(endCap ? { endCap } : {}),
    capSizePx,
    ...(opacity !== undefined && opacity < 1 ? { opacity } : {}),
    gapPx: layout.background ? 0 : look.fontPx * (layout.scale ?? 1) * LEADER_GAP_EM,
  };
}

/**
 * The leader of a drawn label (#1057) as a path in the block's frame, the
 * body's top-left corner at (`bodyX`, `bodyY`), or undefined when it has
 * none or its point lies under the label's box. The line leaves the box
 * (its plate, else its lines' box, `gapPx` out) from the middle of the
 * side facing the point (the side with the wider clear gap to it), in the
 * label's own frame, so it never runs over the label's words, a turned
 * label's included; an elbow leaves that side square and turns once onto
 * the point.
 */
export function figureLabelLeaderPath(layout: VDTFigureLabelLayout, bodyX: number, bodyY: number): VDTDesignPathBlock | undefined {
  const leader = layout.leader;
  if (!leader) return undefined;
  const m = figureLabelMatrix(layout, bodyX, bodyY);
  const q = pointInLabel(layout, bodyX, bodyY, bodyX + leader.x, bodyY + leader.y);
  const e = figureLabelExtent(layout);
  const g = leader.gapPx;
  const r = { x: e.x - g, y: e.y - g, width: e.width + 2 * g, height: e.height + 2 * g };
  const down = q.y - (r.y + r.height);
  const up = r.y - q.y;
  const right = q.x - (r.x + r.width);
  const left = r.x - q.x;
  const v = Math.max(down, up);
  const h = Math.max(right, left);
  if (v <= 0 && h <= 0) return undefined;
  let start: LinePt;
  let bend: LinePt;
  if (v >= h) {
    start = { x: r.x + r.width / 2, y: down >= up ? r.y + r.height : r.y };
    bend = { x: start.x, y: q.y };
  } else {
    start = { x: right >= left ? r.x + r.width : r.x, y: r.y + r.height / 2 };
    bend = { x: q.x, y: start.y };
  }
  const own: LinePt[] = leader.routing === 'elbow' ? [start, bend, { x: q.x, y: q.y }] : [start, { x: q.x, y: q.y }];
  const pts: LinePt[] = own.map((p) => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] }));
  const length = pts.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - pts[i]!.x, p.y - pts[i]!.y), 0);
  if (length < Math.max(1, leader.capSizePx)) return undefined;
  const marks: VDTPathMarker[] = [];
  // The look's opacity (#1079) on the colour the part palette left.
  const stroke = leader.opacity !== undefined ? { ...leader.stroke, color: colorWithOpacity(leader.stroke.color, leader.opacity) } : leader.stroke;
  if (leader.startCap) capEnd(pts, 0, leader.startCap, leader.capSizePx, stroke.color, marks, stroke.widthPx);
  if (leader.endCap) capEnd(pts, 1, leader.endCap, leader.capSizePx, stroke.color, marks, stroke.widthPx);
  const subpaths = [polylineCommands(pts, 0)].filter((sp) => sp.length > 0);
  return {
    kind: 'path',
    bbox: pathInkBox({ subpaths, stroke, markers: marks }),
    subpaths,
    stroke,
    ...(marks.length > 0 ? { markers: marks } : {}),
  };
}

/** The leaders of a figure's drawn labels (#1057) in the block's frame,
 *  the body's corner at (`bodyX`, `bodyY`), in the labels' order. */
export function figureLabelLeaderPaths(rb: Pick<ResolvedResourceBlock, 'labels'>, bodyX: number, bodyY: number): VDTDesignPathBlock[] {
  const out: VDTDesignPathBlock[] = [];
  for (const label of rb.labels ?? []) {
    const path = label.layout ? figureLabelLeaderPath(label.layout, bodyX, bodyY) : undefined;
    if (path) out.push(path);
  }
  return out;
}

/** A leader's point reflected about the body's vertical axis, as the rest
 *  of a label's geometry is on a mirrored page. */
const flipLeader = (leader: VDTFigureLabelLeader | undefined, bodyWidth: number): { leader?: VDTFigureLabelLeader } =>
  leader ? { leader: { ...leader, x: bodyWidth - leader.x } } : {};

/**
 * Where anchor `anchorId` of the picture of `block` (a figure laid on
 * `page`) stands on the page's sheet (#1057), through the picture's crop,
 * safe area and scale as its labels are: undefined when the block is no
 * picture or its resource lacks the anchor. A picture is painted the right
 * way round on a mirrored page and upright on a vertical one, so the point
 * is read on the body's box as the sheet shows it.
 */
export function figureAnchorPointOnPage(page: Pick<VDTPage, 'flow'>, block: Pick<VDTBlock, 'bbox' | 'resourceBlock'>, anchorId: string): { x: number; y: number } | undefined {
  const rb = block.resourceBlock;
  if (!rb || (rb.kind !== 'bitmap' && rb.kind !== 'svg')) return undefined;
  const anchor = rb.resource.anchors?.find((a) => a.id === anchorId);
  if (!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return undefined;
  if (!(rb.bodyRect.width > 0) || !(rb.bodyRect.height > 0)) return undefined;
  const p = pictureToBody(rb, anchor.x, anchor.y);
  if (rb.rotation) {
    // A quarter-turned block: its body's frame turned onto the block's,
    // which stands in the flow.
    const { bx, by, turn } = bodyFrame(block);
    const [x, y] = turn ? apply(turn, bx + p.x, by + p.y) : [bx + p.x, by + p.y];
    return flowToPage(page, x, y);
  }
  // A picture is painted the right way round on a mirrored page, upright
  // on a vertical one: the point is read on the body's box on the sheet.
  const body = flowRectToPage(page, { x: block.bbox.x + rb.bodyRect.x, y: block.bbox.y + rb.bodyRect.y, width: rb.bodyRect.width, height: rb.bodyRect.height });
  return { x: body.x + (p.x / rb.bodyRect.width) * body.width, y: body.y + (p.y / rb.bodyRect.height) * body.height };
}


// ---------------------------------------------------------------------------
// Painting and hit-testing
// ---------------------------------------------------------------------------

/** The matrix that puts a label's frame on the block's frame, the body's
 *  top-left corner at (`bodyX`, `bodyY`): `translate(body + point) ·
 *  rotate(rotate)`. */
export function figureLabelMatrix(layout: Pick<VDTFigureLabelLayout, 'x' | 'y' | 'rotate'>, bodyX: number, bodyY: number): LabelMatrix {
  const t = ((layout.rotate ?? 0) * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  // A quarter turn lands exactly (no 1e-17 shear).
  const c = Math.abs(cos) < 1e-12 ? 0 : cos;
  const s = Math.abs(sin) < 1e-12 ? 0 : sin;
  return [c, s, -s, c, bodyX + layout.x, bodyY + layout.y];
}

/** A label's plate (#1058) as a design box's style, for the painters of
 *  boxes: its fill, its outline drawn inside the plate, its corners. */
export function labelPlateBox(plate: NonNullable<VDTFigureLabelLayout['background']>): VDTDesignBoxStyle {
  return {
    ...(plate.color ? { backgroundColor: plate.color } : {}),
    ...(plate.border ? { borderColor: plate.border.color } : {}),
    borderWidthPx: plate.border?.widthPx ?? 0,
    borderRadiusPx: plate.radiusPx ?? 0,
  };
}

/** What a label paints in its own frame: its background, else its lines'
 *  box. */
export function figureLabelExtent(layout: VDTFigureLabelLayout): BoundingBox {
  return layout.background?.rect ?? layout.box;
}

const apply = (m: LabelMatrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** The upright box a label covers in the block's frame. */
export function figureLabelBounds(layout: VDTFigureLabelLayout, bodyX: number, bodyY: number): BoundingBox {
  const m = figureLabelMatrix(layout, bodyX, bodyY);
  const r = figureLabelExtent(layout);
  const pts = [apply(m, r.x, r.y), apply(m, r.x + r.width, r.y), apply(m, r.x, r.y + r.height), apply(m, r.x + r.width, r.y + r.height)];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** The point `(x, y)` of the block's frame in a label's own frame. */
export function pointInLabel(layout: VDTFigureLabelLayout, bodyX: number, bodyY: number, x: number, y: number): { x: number; y: number } {
  const m = figureLabelMatrix(layout, bodyX, bodyY);
  const dx = x - m[4];
  const dy = y - m[5];
  // The inverse of a rotation is its transpose.
  return { x: m[0] * dx + m[1] * dy, y: m[2] * dx + m[3] * dy };
}

/** The top-left corner of a resource block's body in its own frame, and
 *  the quarter turn that puts that frame on the block's (a rotated
 *  block). */
function bodyFrame(block: Pick<VDTBlock, 'bbox' | 'resourceBlock'>): { bx: number; by: number; turn?: LabelMatrix } {
  const rb = block.resourceBlock!;
  const rot = rb.rotation;
  if (!rot) return { bx: block.bbox.x + rb.bodyRect.x, by: block.bbox.y + rb.bodyRect.y };
  const turn: LabelMatrix = rot.direction === 'ccw' ? [0, -1, 1, 0, rot.originX, rot.originY] : [0, 1, -1, 0, rot.originX, rot.originY];
  return { bx: rb.bodyRect.x, by: rb.bodyRect.y, turn };
}

/** The upright box a drawn label covers in its block's frame, through a
 *  quarter-turned block's turn. */
function labelRectInBlock(block: Pick<VDTBlock, 'bbox' | 'resourceBlock'>, layout: VDTFigureLabelLayout): BoundingBox {
  const { bx, by, turn } = bodyFrame(block);
  const r = figureLabelBounds(layout, bx, by);
  if (!turn) return r;
  const pts = [apply(turn, r.x, r.y), apply(turn, r.x + r.width, r.y), apply(turn, r.x, r.y + r.height), apply(turn, r.x + r.width, r.y + r.height)];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/**
 * Stamp `rect` on every drawn label of the document (#860): the upright
 * box it covers in its block's frame, through a quarter-turned block's
 * turn. A label not drawn loses any `rect` it had.
 */
export function stampFigureLabelRects(doc: VDTDocument): void {
  const seen = new Set<VDTBlock>();
  const visit = (block: VDTBlock): void => {
    if (seen.has(block)) return;
    seen.add(block);
    const labels = block.resourceBlock?.labels;
    if (!labels || labels.length === 0) return;
    for (const label of labels) {
      if (!label.layout) {
        delete label.rect;
        continue;
      }
      label.rect = labelRectInBlock(block, label.layout);
    }
  };
  for (const block of doc.blocks) visit(block);
  for (const page of doc.pages) {
    for (const col of page.columns) for (const block of col.blocks) visit(block);
    for (const block of page.floats ?? []) visit(block);
    // The half of a spread frame painted on the facing page (#861) is a
    // copy of its blocks moved onto that page: its labels get their boxes
    // there, so the facing page answers for the labels it shows.
    for (const frame of page.composed?.frames ?? []) for (const block of frame.facingBlocks ?? []) visit(block);
  }
}

/** The spine of a spread sheet and the band the binding takes. */
export interface SpineBand {
  /** The band along the spread's axis: `lo` to `hi`, centred on the spine. */
  lo: number;
  hi: number;
  spine: number;
  /** `'x'` on horizontal pages; `'y'` where the sheet runs down the flow (#926). */
  axis: 'x' | 'y';
}

/** Below this a label touches the band without entering it (px). */
const BAND_EPS = 0.5;

/**
 * `block` with every label that reaches into the binding band moved off it
 * (#990). A figure across the spine of a spread paints its half on each
 * page, so a label whose box meets the band is cut by the fold and read
 * on neither page. Each such label slides along the spread to the side its
 * anchor point lies on (ties: the first page, as a frame's are) until its
 * box stands at the band's edge; an anchor that says `gutter: 'cross'`
 * keeps its place. The block comes back unchanged (the same object) when
 * no label moves, and a changed one is a copy: the labels of a measured
 * block may be shared with a cache.
 */
export function keepLabelsOffGutter(block: VDTBlock, band: SpineBand): VDTBlock {
  const rb = block.resourceBlock;
  if (!rb?.labels || rb.labels.length === 0) return block;
  const { bx, by, turn } = bodyFrame(block);
  const along = (p: { x: number; y: number }): number => (band.axis === 'x' ? p.x : p.y);
  let moved = false;
  const labels = rb.labels.map((label) => {
    const layout = label.layout;
    if (!layout) return label;
    const place = labelPlace(label, rb.resource);
    if (place?.anchor?.gutter === 'cross') return label;
    const r = labelRectInBlock(block, layout);
    const lo = band.axis === 'x' ? r.x : r.y;
    const hi = lo + (band.axis === 'x' ? r.width : r.height);
    if (hi <= band.lo + BAND_EPS || lo >= band.hi - BAND_EPS) return label;
    // The side of the anchor point, in the block's frame.
    const [px, py] = turn ? apply(turn, bx + layout.x, by + layout.y) : [bx + layout.x, by + layout.y];
    const pt = { x: px, y: py };
    const first = along(pt) <= band.spine + BAND_EPS;
    const delta = first ? band.lo - hi : band.hi - lo;
    const d = band.axis === 'x' ? { x: delta, y: 0 } : { x: 0, y: delta };
    // The move in the body's own frame: the transpose of a turn undoes it.
    const own = turn ? { x: turn[0] * d.x + turn[1] * d.y, y: turn[2] * d.x + turn[3] * d.y } : d;
    moved = true;
    return { ...label, layout: { ...layout, x: layout.x + own.x, y: layout.y + own.y } };
  });
  return moved ? { ...block, resourceBlock: { ...rb, labels } } : block;
}

/**
 * The glyph of a drawn label under the point `(x, y)` of its block's
 * frame: the index into `label.text`'s source map, or undefined off its
 * lines. Lines are read from their plain ranges; a label whose lines lack
 * them spreads its text over its lines in order.
 */
export function labelGlyphAt(label: VDTFigureLabel, block: Pick<VDTBlock, 'bbox' | 'resourceBlock'>, x: number, y: number): number | undefined {
  const layout = label.layout;
  if (!layout || layout.lines.length === 0) return undefined;
  const { bx, by, turn } = bodyFrame(block);
  let px = x;
  let py = y;
  if (turn) {
    // Into the block's upright frame: the transpose of the quarter turn.
    const dx = x - turn[4];
    const dy = y - turn[5];
    px = turn[0] * dx + turn[1] * dy;
    py = turn[2] * dx + turn[3] * dy;
  }
  const p = pointInLabel(layout, bx, by, px, py);
  let li = 0;
  let best = Infinity;
  layout.lines.forEach((line, i) => {
    const d = p.y < line.bbox.y ? line.bbox.y - p.y : p.y > line.bbox.y + line.bbox.height ? p.y - line.bbox.y - line.bbox.height : 0;
    if (d < best) { best = d; li = i; }
  });
  const line = layout.lines[li]!;
  const n = label.text.length;
  if (n === 0) return undefined;
  const start = line.plainStart ?? Math.floor((li * n) / layout.lines.length);
  const end = line.plainEnd ?? Math.floor(((li + 1) * n) / layout.lines.length);
  const len = Math.max(1, end - start);
  let frac = line.bbox.width > 0 ? (p.x - line.bbox.x) / line.bbox.width : 0;
  frac = Math.max(0, Math.min(0.9999, frac));
  if (layout.direction === 'rtl') frac = 0.9999 - frac;
  return Math.max(0, Math.min(n - 1, start + Math.floor(frac * len)));
}

// ---------------------------------------------------------------------------
// Right-to-left pages
// ---------------------------------------------------------------------------

/** Layouts already turned for a mirrored page. */
const mirrored = new WeakSet<VDTFigureLabelLayout>();

/**
 * A label layout for the flow of a mirrored page (a right-to-left book):
 * its point, its turn and its lines reflected about the body's vertical
 * axis, so that the page's reflection puts it back where the picture shows
 * it, reading as written. `bodyWidth` is the body's width; `orient` turns
 * a line's run order for the frame as the build does for captions.
 */
export function mirrorLabelLayout(layout: VDTFigureLabelLayout, bodyWidth: number, orient: (line: VDTLine) => VDTLine): VDTFigureLabelLayout {
  if (mirrored.has(layout)) return layout;
  const flipBox = (r: BoundingBox): BoundingBox => ({ ...r, x: -(r.x + r.width) });
  // The lines of a vertical label keep the order they were set in: its
  // cells are painted from the frame turned back (`unmirrorLabelLayout`),
  // where the text runs down the column as on any page (#955).
  const out: VDTFigureLabelLayout = {
    ...layout,
    x: bodyWidth - layout.x,
    ...(layout.rotate !== undefined ? { rotate: -layout.rotate } : {}),
    lines: layout.lines.map((line) => {
      const o = layout.vertical ? line : orient(line);
      return {
        ...o,
        bbox: { ...o.bbox, x: -(o.bbox.x + o.bbox.width) },
        ...(o.measure ? { measure: { ...o.measure, x: -(o.measure.x + o.measure.width) } } : {}),
      };
    }),
    box: flipBox(layout.box),
    ...(layout.background ? { background: { ...layout.background, rect: flipBox(layout.background.rect) } } : {}),
    ...(layout.vertical ? { mirrored: true as const } : {}),
    ...flipLeader(layout.leader, bodyWidth),
  };
  mirrored.add(out);
  return out;
}

/**
 * The layout of a vertical label (`mirrored`) as it was set, before
 * {@link mirrorLabelLayout} reflected it for the flow of a mirrored page:
 * the geometry reflected back about the body's axis. The painters of such
 * a flow reflect their frame back about the body, so this layout lands on
 * the sheet where the label's anchor says, its cells running down the
 * column and standing upright, whatever the page's direction.
 */
export function unmirrorLabelLayout(layout: VDTFigureLabelLayout, bodyWidth: number): VDTFigureLabelLayout {
  if (!layout.mirrored) return layout;
  const flipBox = (r: BoundingBox): BoundingBox => ({ ...r, x: -(r.x + r.width) });
  const { mirrored: _mirrored, ...rest } = layout;
  void _mirrored;
  return {
    ...rest,
    x: bodyWidth - layout.x,
    ...(layout.rotate !== undefined ? { rotate: -layout.rotate } : {}),
    lines: layout.lines.map((line) => ({
      ...line,
      bbox: { ...line.bbox, x: -(line.bbox.x + line.bbox.width) },
      ...(line.measure ? { measure: { ...line.measure, x: -(line.measure.x + line.measure.width) } } : {}),
    })),
    box: flipBox(layout.box),
    ...(layout.background ? { background: { ...layout.background, rect: flipBox(layout.background.rect) } } : {}),
    ...flipLeader(layout.leader, bodyWidth),
  };
}

/** The run order of a line of `n` segments turned the other way: the
 *  reverse of `order` (`undefined` = 0 … n − 1), or `undefined` when that
 *  is the logical order. It is its own inverse, as the build's turn for a
 *  mirrored frame is. */
function reversedOrder(order: readonly number[] | undefined, n: number): number[] | undefined {
  const visual = order ?? Array.from({ length: n }, (_, i) => i);
  const flow = [...visual].reverse();
  return flow.every((v, i) => v === i) ? undefined : flow;
}

/**
 * The layout of a label of a mirrored page (a right-to-left book) as it
 * stands on the sheet, for a renderer that does not paint through the
 * page's reflection (the SVG layer of a reflowable EPUB, #969): its point
 * and its lines reflected back about the body's axis, and the run order of
 * each line turned back, so `order` is the order of the segments from left
 * to right on the sheet. A vertical label comes back as
 * {@link unmirrorLabelLayout} gives it. A layout of a page that is not
 * mirrored must not be given: nothing marks one.
 */
export function labelLayoutOnSheet(layout: VDTFigureLabelLayout, bodyWidth: number): VDTFigureLabelLayout {
  if (layout.mirrored) return unmirrorLabelLayout(layout, bodyWidth);
  const flipBox = (r: BoundingBox): BoundingBox => ({ ...r, x: -(r.x + r.width) });
  return {
    ...layout,
    x: bodyWidth - layout.x,
    ...(layout.rotate !== undefined ? { rotate: -layout.rotate } : {}),
    lines: layout.lines.map((line) => {
      const n = line.segments?.length ?? 0;
      const next: VDTLine = {
        ...line,
        bbox: { ...line.bbox, x: -(line.bbox.x + line.bbox.width) },
        ...(line.measure ? { measure: { ...line.measure, x: -(line.measure.x + line.measure.width) } } : {}),
      };
      if (n >= 2) {
        const order = reversedOrder(line.order, n);
        if (order) next.order = order;
        else delete next.order;
      }
      return next;
    }),
    box: flipBox(layout.box),
    ...(layout.background ? { background: { ...layout.background, rect: flipBox(layout.background.rect) } } : {}),
    ...flipLeader(layout.leader, bodyWidth),
  };
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** The labels of a figure that are not drawn as text: what its picture's
 *  alternative text still names (`altWithLabels`). */
export function undrawnLabels(labels: readonly VDTFigureLabel[] | undefined): VDTFigureLabel[] | undefined {
  if (!labels) return undefined;
  const out = labels.filter((l) => !l.layout);
  return out.length > 0 ? out : undefined;
}

/** A drawn label's words as read, its lines joined by a space (a legend's
 *  rows by a semicolon), each inline symbol read as its alternative text
 *  in brackets, or not at all when it has none (#1058). */
export function figureLabelReading(label: VDTFigureLabel): string {
  const lines = label.layout?.lines;
  if (!lines || lines.length === 0) return withIconAlts(label.text, label.icons).replace(/[￼]/g, '').replace(/\s+/g, ' ').trim();
  const rows = lines.map((l) => figureLabelLineReading(l)).filter(Boolean);
  return rows.join(label.layout?.legend ? '; ' : ' ');
}

/** One line of a drawn label as read (see {@link figureLabelReading}). */
export function figureLabelLineReading(line: VDTLine): string {
  const segs = line.segments;
  const text = segs?.some((s) => s.swatch?.icon)
    ? segs.map((s) => (s.swatch?.icon ? (s.swatch.icon.alt ? `[${s.swatch.icon.alt}]` : '') : s.text)).join('')
    : line.text;
  return text.replace(/[￼]/g, '').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Warnings
// ---------------------------------------------------------------------------

type Pt = [number, number];

/** The share of a line box, at its top and at its foot, that holds no ink. */
const INK_MARGIN = 0.12;

/** The shapes a label covers in the body's frame, as convex quadrilaterals:
 *  its plate when it has one, else the box of each of its lines (a short
 *  line beside a long one leaves its side free). */
function labelShapes(layout: VDTFigureLabelLayout): Pt[][] {
  const m = figureLabelMatrix(layout, 0, 0);
  const quad = (r: BoundingBox): Pt[] => [apply(m, r.x, r.y), apply(m, r.x + r.width, r.y), apply(m, r.x + r.width, r.y + r.height), apply(m, r.x, r.y + r.height)];
  if (layout.background) return [quad(layout.background.rect)];
  // A line's box is taller than its ink (it is the line pitch): the band
  // the letters stand in is its middle, so two names set one under the
  // other at a tighter leading than the label's own do not meet.
  return layout.lines
    .filter((l) => l.bbox.width > 0 && l.bbox.height > 0)
    .map((l) => quad({ x: l.bbox.x, y: l.bbox.y + l.bbox.height * INK_MARGIN, width: l.bbox.width, height: l.bbox.height * (1 - 2 * INK_MARGIN) }));
}

/** How far two convex polygons run into each other: the shortest push that
 *  frees them (separating axis test), 0 when they do not meet. */
export function polygonPenetration(a: readonly Pt[], b: readonly Pt[]): number {
  let depth = Infinity;
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      let nx = q[1] - p[1];
      let ny = p[0] - q[0];
      const len = Math.hypot(nx, ny);
      if (len < 1e-12) continue;
      nx /= len;
      ny /= len;
      const proj = (pts: readonly Pt[]): [number, number] => {
        let lo = Infinity;
        let hi = -Infinity;
        for (const pt of pts) {
          const d = pt[0] * nx + pt[1] * ny;
          if (d < lo) lo = d;
          if (d > hi) hi = d;
        }
        return [lo, hi];
      };
      const [aLo, aHi] = proj(a);
      const [bLo, bHi] = proj(b);
      const overlap = Math.min(aHi, bHi) - Math.max(aLo, bLo);
      if (overlap <= 0) return 0;
      if (overlap < depth) depth = overlap;
    }
  }
  return Number.isFinite(depth) ? depth : 0;
}

/** The share of a line's height two labels may run into each other before
 *  they count as meeting: line boxes are taller than the ink. */
const OVERLAP_TOLERANCE = 0.12;

/** The pairs of labels whose lines meet: for each label (by index) the
 *  indices of the earlier labels it meets. `allowed[i]` leaves label `i`
 *  out: no pair it belongs to is reported (#977). */
export function overlappingLabels(labels: readonly Pick<VDTFigureLabel, 'layout'>[], allowed?: readonly boolean[]): Map<number, number[]> {
  const shapes = labels.map((l) => (l.layout ? labelShapes(l.layout) : []));
  const heights = labels.map((l) => l.layout?.lines.reduce((m, line) => Math.min(m, line.bbox.height), Infinity) ?? Infinity);
  const bounds = shapes.map((quads) => {
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const q of quads) for (const [x, y] of q) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return [x0, y0, x1, y1] as const;
  });
  const out = new Map<number, number[]>();
  for (let j = 1; j < labels.length; j++) {
    if (shapes[j]!.length === 0) continue;
    if (allowed?.[j]) continue;
    for (let i = 0; i < j; i++) {
      if (shapes[i]!.length === 0 || allowed?.[i]) continue;
      const a = bounds[i]!;
      const b = bounds[j]!;
      if (a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1]) continue;
      const tolerance = OVERLAP_TOLERANCE * Math.min(heights[i]!, heights[j]!);
      const meet = shapes[i]!.some((p) => shapes[j]!.some((q) => polygonPenetration(p, q) > Math.max(tolerance, 0.25)));
      if (meet) {
        const list = out.get(j);
        if (list) list.push(i);
        else out.set(j, [i]);
      }
    }
  }
  return out;
}

/**
 * The symbols of the picture (its `avoid` zones, in fractions of the whole
 * picture) each label runs onto: for each label (by index) the 0-based
 * indices of the zones its lines or plate meet (#969). `allowed[i]` leaves
 * label `i` out. The zones are rectangles in the body's frame, through the
 * picture's crop, so a picture shown smaller or cropped to its safe area
 * moves them with the art.
 */
export function labelsOverSymbols(
  labels: readonly Pick<VDTFigureLabel, 'layout'>[],
  zones: readonly NonNullable<Resource['avoid']>[number][],
  rb: Pick<ResolvedResourceBlock, 'bodyRect' | 'bodySource'>,
  allowed?: readonly boolean[],
): Map<number, number[]> {
  const out = new Map<number, number[]>();
  if (zones.length === 0) return out;
  const boxes: Pt[][] = zones.map((z) => {
    const a = pictureToBody(rb, z.x, z.y);
    const b = pictureToBody(rb, z.x + z.width, z.y + z.height);
    return [[a.x, a.y], [b.x, a.y], [b.x, b.y], [a.x, b.y]];
  });
  labels.forEach((label, i) => {
    if (!label.layout || allowed?.[i]) return;
    const shapes = labelShapes(label.layout);
    const height = label.layout.lines.reduce((m, line) => Math.min(m, line.bbox.height), Infinity);
    const tolerance = Math.max(OVERLAP_TOLERANCE * height, 0.25);
    boxes.forEach((box, z) => {
      if (shapes.some((q) => polygonPenetration(q, box) > tolerance)) {
        const list = out.get(i);
        if (list) list.push(z);
        else out.set(i, [z]);
      }
    });
  });
  return out;
}

const shortText = (label: Pick<VDTFigureLabel, 'text'>): string => label.text.replace(/\s+/g, ' ').trim().slice(0, 40);
const anchorOf = (label: Pick<VDTFigureLabel, 'at'>): string | undefined => ('anchor' in label.at ? label.at.anchor : undefined);

/**
 * The anchors the figures of `doc` name wrongly (`labelAnchorUnknown`, at
 * the label's text) or leave without a word (`anchorUnlabelled`, a note
 * at the figure: an anchor that names a label style and that no label of
 * the figure stands at), the labels that do not fit their measure
 * (`labelOverflow`) and those whose boxes meet (`labelOverlap`, #902),
 * each on the page its figure landed on.
 */
export function figureLabelWarnings(doc: VDTDocument, figureSource: (block: VDTBlock) => { start: number; end: number } | undefined): ContentWarning[] {
  const out: ContentWarning[] = [];
  const locale = doc.config?.locale;
  const seen = new Set<string>();
  const visit = (block: VDTBlock): void => {
    const rb = block.resourceBlock;
    const labels = rb?.labels;
    if (!rb || !labels || labels.length === 0 || block.pageIndex < 0) return;
    // A figure laid out more than once (the slices of a table, a picture
    // met twice): once.
    const key = `${rb.resource.id}@${labels[0]!.sourceStart}`;
    if (seen.has(key)) return;
    seen.add(key);
    const anchors = rb.resource.anchors ?? [];
    const known = anchors.map((a) => a.id);
    const used = new Set<string>();
    for (const label of labels) {
      if (!('anchor' in label.at)) continue;
      const id = label.at.anchor;
      used.add(id);
      if (known.includes(id)) continue;
      out.push({
        kind: 'labelAnchorUnknown',
        resourceId: rb.resource.id,
        anchor: id,
        known,
        ...(locale ? { locale } : {}),
        ...(label.id ? { labelId: label.id } : {}),
        sourceStart: label.sourceStart,
        sourceEnd: label.sourceEnd,
        pageIndex: block.pageIndex,
      });
    }
    // Labels that do not fit their measure even at the smallest scale
    // their style allows (#902).
    for (const label of labels) {
      const layout = label.layout;
      if (!layout?.overflow) continue;
      const anchor = anchorOf(label);
      const width = anchor !== undefined ? anchors.find((a) => a.id === anchor)?.width : undefined;
      out.push({
        kind: 'labelOverflow',
        resourceId: rb.resource.id,
        text: shortText(label),
        ...(anchor !== undefined ? { anchor } : {}),
        widthPct: width !== undefined ? Math.round(width * 1000) / 10 : 0,
        scale: Math.round((layout.scale ?? 1) * 1000) / 1000,
        ...(locale ? { locale } : {}),
        ...(label.id ? { labelId: label.id } : {}),
        sourceStart: label.sourceStart,
        sourceEnd: label.sourceEnd,
        pageIndex: block.pageIndex,
      });
    }
    // Labels whose boxes meet: reported once, on the later of the two in
    // the order written (#902). A label whose anchor, or whose style,
    // says `overlap: 'allow'` is left out: the source prints it so (#977).
    const allowed = labels.map((l) => {
      const anchor = anchors.find((a) => a.id === anchorOf(l));
      const style = doc.config?.labelStyles?.find((st) => st.id === (l.style ?? anchor?.style));
      return (anchor?.overlap ?? style?.overlap) === 'allow';
    });
    for (const [j, earlier] of overlappingLabels(labels, allowed)) {
      const label = labels[j]!;
      const other = labels[earlier[0]!]!;
      const anchor = anchorOf(label);
      const otherAnchor = anchorOf(other);
      out.push({
        kind: 'labelOverlap',
        resourceId: rb.resource.id,
        text: shortText(label),
        ...(anchor !== undefined ? { anchor } : {}),
        with: shortText(other),
        ...(otherAnchor !== undefined ? { withAnchor: otherAnchor } : {}),
        count: earlier.length,
        ...(locale ? { locale } : {}),
        ...(label.id ? { labelId: label.id } : {}),
        sourceStart: label.sourceStart,
        sourceEnd: label.sourceEnd,
        pageIndex: block.pageIndex,
      });
    }
    // Labels that run onto a symbol of the picture, marked as one of its
    // `avoid` zones (#969): the first symbol and how many in all.
    for (const [j, zones] of labelsOverSymbols(labels, rb.resource.avoid ?? [], rb, allowed)) {
      const label = labels[j]!;
      const anchor = anchorOf(label);
      out.push({
        kind: 'labelOverlap',
        resourceId: rb.resource.id,
        text: shortText(label),
        ...(anchor !== undefined ? { anchor } : {}),
        with: `symbol ${zones[0]! + 1}`,
        withSymbol: zones[0]! + 1,
        count: zones.length,
        ...(locale ? { locale } : {}),
        ...(label.id ? { labelId: label.id } : {}),
        sourceStart: label.sourceStart,
        sourceEnd: label.sourceEnd,
        pageIndex: block.pageIndex,
      });
    }
    const where = figureSource(block);
    for (const a of anchors) {
      if (!a.style || used.has(a.id)) continue;
      out.push({
        kind: 'anchorUnlabelled',
        resourceId: rb.resource.id,
        anchor: a.id,
        style: a.style,
        ...(locale ? { locale } : {}),
        ...(where ? { sourceStart: where.start, sourceEnd: where.end } : {}),
        pageIndex: block.pageIndex,
      });
    }
  };
  for (const page of doc.pages) {
    for (const col of page.columns) for (const block of col.blocks) visit(block);
    for (const block of page.floats ?? []) visit(block);
  }
  for (const block of doc.blocks) visit(block);
  return out;
}
