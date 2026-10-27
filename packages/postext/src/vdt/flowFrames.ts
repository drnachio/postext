// Vertical and mirrored flow frames: how a page set top to bottom or
// right to left maps flow coordinates to page coordinates and back
// (#1276: split out of vdt.ts).
import type { TextAlign } from './blocks.js';
import { type BoundingBox, createBoundingBox } from './document.js';
import type { VDTLine } from './lines.js';
import type { VDTPage } from './pages.js';
import type { VDTResourceRotation } from './resources.js';

/**
 * The frame a vertical page's flow is laid out in (`VDTPage.flow`). The
 * engine sets a `'vertical-rl'` page as a horizontal page turned a quarter
 * turn clockwise: the flow is laid out in a frame `page.height` wide and
 * `page.width` tall, whose x axis runs down the sheet (the direction of a
 * vertical line) and whose y axis runs leftward (the direction lines
 * advance). `rotation` maps that frame onto the page exactly as a `'cw'`
 * resource rotation does: `{ direction: 'cw', originX: page.width,
 * originY: 0, width: page.height, height: page.width }`, so a flow point
 * `(x, y)` lands at page `(page.width − y, x)` (see {@link flowToPage}).
 */
export interface VDTVerticalFlowFrame {
  writingMode: 'vertical-rl';
  rotation: VDTResourceRotation;
  /** Where the ideographic em box's centre sits above the alphabetic
   *  baseline, in ems, per font family (the first family of a font string,
   *  unquoted): the axis upright characters are centred on and turned
   *  about. Measured once per family by the layout, so every renderer
   *  turns a character about the same point. A family missing here takes
   *  {@link DEFAULT_CENTRAL_BASELINE}. */
  centralBaselines?: Record<string, number>;
  /** The horizontal advance, in ems, of each dash the flow stretches to
   *  fill its cell (— – ― ⸺ ⸻ －, `VerticalGlyph.stretch`), per font family
   *  (keyed as {@link centralBaselines}) and dash: what a renderer with no
   *  font metrics of its own (the HTML output) stretches the glyph by, as
   *  the canvas and the PDF do from theirs. Only the dashes the page's flow
   *  sets; absent when it sets none. */
  dashAdvances?: Record<string, Record<string, number>>;
}

/**
 * The frame a right-to-left page's flow is laid out in (`VDTPage.flow`,
 * a document whose resolved `direction` is `'rtl'`). The engine sets a
 * right-to-left page as the mirror image of a left-to-right one: the flow
 * is laid out exactly as a left-to-right page (first column at the flow's
 * left, list markers and indents at the left, the footnote rule at the
 * left end, page numbers of the contents at the right…) and the frame
 * turns it over the sheet's vertical axis, a flow point `(x, y)` landing
 * at page `(mirror.originX − x, y)` (`originX` = `page.width`). So the
 * first column stands on the right, markers and indents on the right, and
 * a right-bound book's recto, whose spine is on its right, has it on the
 * flow's left, where a left-bound book's recto has it (see
 * `flowPageMirrored` in the pipeline).
 *
 * Renderers paint the flow through the mirror and turn every glyph run,
 * picture and formula back about its own box, so text and images never
 * read mirrored; rules, frames and backgrounds paint mirrored as they
 * are. Within a line the segments advance along the flow's x axis in
 * `VDTLine.order`, which on such a page is the reverse of their visual
 * order on the sheet.
 */
export interface VDTMirroredFlowFrame {
  writingMode: 'horizontal-tb';
  direction: 'rtl';
  mirror: {
    /** Page x the flow's x is measured back from: `page.width`. */
    originX: number;
  };
}

/** The frame a page's flow is laid out in, when it is not the sheet's
 *  own: a vertical page's ({@link VDTVerticalFlowFrame}) or a right-to-left
 *  page's ({@link VDTMirroredFlowFrame}). */
export type VDTFlowFrame = VDTVerticalFlowFrame | VDTMirroredFlowFrame;

/** Where the ideographic em box's centre sits above the alphabetic
 *  baseline, in ems, when the font was not measured: the value of every
 *  Source Han / Noto CJK face (em box from −0.12 to 0.88 em). */
export const DEFAULT_CENTRAL_BASELINE = 0.38;

/** The page's flow frame when the flow is set vertically, else
 *  `undefined`. */
export function verticalFlowOf(page: Pick<VDTPage, 'flow'>): VDTVerticalFlowFrame | undefined {
  const flow = page.flow;
  return flow && flow.writingMode === 'vertical-rl' ? flow : undefined;
}

/** Whether a page's flow is set vertically (`page.flow` is a
 *  `'vertical-rl'` frame). */
export function pageIsVertical(page: Pick<VDTPage, 'flow'>): boolean {
  return page.flow?.writingMode === 'vertical-rl';
}

/** Whether a page's flow is laid out mirrored, right to left
 *  ({@link VDTMirroredFlowFrame}). */
/**
 * The side a line is set from, as the renderers align it (#371): its
 * block's `textAlign`, except on a line with a {@link VDTLine.measure} (a
 * block set against its frame's direction), whose start side is the right
 * of its span: `left` (the start; also the last line of a justified
 * paragraph, `justify` coming back as `right`) is flush right, `right` (the
 * end) flush left, and a centred line stays centred. A span flagged `wrap`
 * (a line beside a wrapped picture, #627) keeps the block's alignment. A justified line that
 * is not its paragraph's last is filled across the span either way.
 */
export function lineTextAlign(line: Pick<VDTLine, 'measure'>, textAlign: TextAlign): TextAlign {
  if (!line.measure || line.measure.wrap) return textAlign;
  return textAlign === 'right' ? 'left' : textAlign === 'center' ? 'center' : 'right';
}

/** A rule leader (`VDTLineSegment.leader: 'rule'`, #622) at a text size of
 *  `fontSizePx`: its centre `dy` px under the baseline and its stroke
 *  `thickness` px, the same on every renderer. */
export function leaderRuleGeometry(fontSizePx: number): { dy: number; thickness: number } {
  return { dy: fontSizePx * 0.1, thickness: Math.max(0.5, fontSizePx * 0.05) };
}

export function pageIsMirrored(page: Pick<VDTPage, 'flow'>): boolean {
  return page.flow?.writingMode === 'horizontal-tb' && page.flow.direction === 'rtl';
}

/** Map a point of a page's flow frame to page coordinates: the identity on
 *  a left-to-right horizontal page, `(page.width − y, x)` on a vertical
 *  one, `(page.width − x, y)` on a right-to-left one. */
export function flowToPage(page: Pick<VDTPage, 'flow'>, x: number, y: number): { x: number; y: number } {
  const flow = page.flow;
  if (!flow) return { x, y };
  if (flow.writingMode === 'horizontal-tb') return { x: flow.mirror.originX - x, y };
  const r = flow.rotation;
  return { x: r.originX - y, y: r.originY + x };
}

/** Map a page point into the page's flow frame (the inverse of
 *  {@link flowToPage}; the mirror is its own inverse). */
export function pageToFlow(page: Pick<VDTPage, 'flow'>, x: number, y: number): { x: number; y: number } {
  const flow = page.flow;
  if (!flow) return { x, y };
  if (flow.writingMode === 'horizontal-tb') return { x: flow.mirror.originX - x, y };
  const r = flow.rotation;
  return { x: y - r.originY, y: r.originX - x };
}

/** Map an axis-aligned rect of a page's flow frame to the page: width and
 *  height swap on a vertical page; a right-to-left page mirrors it. */
export function flowRectToPage(page: Pick<VDTPage, 'flow'>, rect: BoundingBox): BoundingBox {
  if (!page.flow) return rect;
  const a = flowToPage(page, rect.x, rect.y);
  const b = flowToPage(page, rect.x + rect.width, rect.y + rect.height);
  return createBoundingBox(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
}

/** Map an axis-aligned page rect into the page's flow frame (the inverse
 *  of {@link flowRectToPage}). */
export function pageRectToFlow(page: Pick<VDTPage, 'flow'>, rect: BoundingBox): BoundingBox {
  if (!page.flow) return rect;
  const a = pageToFlow(page, rect.x, rect.y);
  const b = pageToFlow(page, rect.x + rect.width, rect.y + rect.height);
  return createBoundingBox(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
}

/** The flow frame of a vertical page `width` × `height` px (physical). */
export function verticalFlowFrame(width: number, height: number): VDTVerticalFlowFrame {
  return {
    writingMode: 'vertical-rl',
    rotation: { direction: 'cw', originX: width, originY: 0, width: height, height: width },
  };
}

/** The flow frame of a right-to-left page `width` px wide (physical). */
export function mirroredFlowFrame(width: number): VDTMirroredFlowFrame {
  return { writingMode: 'horizontal-tb', direction: 'rtl', mirror: { originX: width } };
}
