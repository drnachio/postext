// The other element kinds: repeated and leader text, vertical text, rules,
// images, paths and boxes (#1276: split out of layout.ts).
import { flowTextWidth, getMeasureWritingMode, withMeasureWritingMode } from '../../measure/vertical.js';
import { bitmapLayoutSize } from '../../bitmapResolution.js';
import { comicArtCrop } from '../../comics/art.js';
import type { ResolvedDesignTextElement, ResolvedChipStyleConfig, ResolvedDesignRuleElement, ResolvedDesignImageElement, Resource, Dimension, ResolvedDesignPathElement, ResolvedDesignBoxElement } from '../../types.js';
import { pictureTraits } from '../../vdt.js';
import { pathViewBox, parseSvgPathCached, mapPath } from '../svgPath.js';
import { buildFontString } from '../../measure/index.js';
import { graphemeCount } from '../../measure/graphemes.js';
import { type DesignLeader, LEADER_MARK } from '../placeholders.js';
import { fitLeader } from '../../measure/leader.js';
import type { DesignTextRun } from '../richText.js';
import { type AnchorResult, type AnchorReference, dimPx, type Pin, resolveFixedSize, fillToContainerEdge, fillToContainerEdgeY, edgeXFromPin, edgeYFromPin, resolveBox } from './geometry.js';
import { type ResolvedTextPrimitive, type WrappedLine, type ResolvedRulePrimitive, colorHex, type ResolvedImagePrimitive, designImageAltText, type ResolvedPathPrimitive, type ResolvedBoxPrimitive } from './primitives.js';
import type { TextMeasurement } from './text.js';
import { layoutTextElement } from './textElement.js';

/**
 * Set the one line of `m` again after itself (`DesignTextElement.repeat`,
 * #1017): as many whole copies as `room` holds, `gap` apart, `count` at
 * most. The copies stay one line, aligned as a whole: its runs are the
 * line's runs once per copy with a run of the gap's width between two
 * (a word space, read as one when the text is copied), and its `order`
 * puts the first copy on the start side (`startRight`).
 */
export function repeatLine(m: TextMeasurement, room: number, gap: number, count: number | undefined, fontString: string, startRight: boolean): void {
  const line = m.lines[0]!;
  const w = line.width;
  if (!(w > 0)) return;
  const fits = Math.floor((room - w) / (w + gap) + 1e-9) + 1;
  const n = Math.max(1, Math.min(fits, count !== undefined && count >= 1 ? Math.floor(count) : Infinity));
  if (n < 2) return;
  const base: DesignTextRun[] = line.runs ?? [{ text: line.text, fontString, width: w }];
  const r = base.length;
  const runs: DesignTextRun[] = [];
  for (let k = 0; k < n; k++) {
    for (const run of base) runs.push({ ...run });
    if (k < n - 1) runs.push({ text: ' ', fontString, width: gap });
  }
  // Copy k's runs start at k · (r + 1); the gap after it stands at
  // k · (r + 1) + r.
  const within = line.order ?? base.map((_, i) => i);
  if (line.order || startRight) {
    const order: number[] = [];
    const copies = Array.from({ length: n }, (_, k) => (startRight ? n - 1 - k : k));
    copies.forEach((k, j) => {
      for (const i of within) order.push(k * (r + 1) + i);
      if (j < n - 1) order.push(Math.min(k, copies[j + 1]!) * (r + 1) + r);
    });
    line.order = order;
  }
  line.runs = runs;
  line.text = runs.map((run) => run.text).join('');
  line.width = n * w + (n - 1) * gap;
  m.contentWidth = Math.max(m.contentWidth, line.width + (line.xOffset ?? 0));
}

/**
 * A text element of a contents part row whose text holds `{leader}`
 * (#889): one line, as wide as the room its placement gives it (an `auto`
 * width fills to the container's edge), the text before the mark at the
 * line's start, the text after it at its end, and between them the
 * contents' leader (`toc.leader`): its character repeated over the room
 * left, `gap` from either text, flush with the end so the leaders of the
 * rows line up, as an entry row's are (`pipeline/contents/toc.ts`). The text before
 * the mark gives way when the line is short of room (cut by the element's
 * `overflow`, `'ellipsis-end'` for a wrapping one); fewer than three
 * repeats, or a leader turned off, leave the room blank. A `{leader}`
 * alone keeps `gap` at both ends (#1121): its element sits between a title
 * and a page number set in elements of their own. The dots take the
 * leader's own colour and face when the contents give it one.
 */
export function layoutLeaderTextElement(
  el: ResolvedDesignTextElement,
  text: string,
  leader: DesignLeader,
  pin: AnchorResult,
  container: AnchorReference,
  dpi: number,
  anchoredToElement: boolean,
  frame: { direction?: 'ltr' | 'rtl'; mirrored?: boolean; arabicNumbers?: boolean },
): ResolvedTextPrimitive[] {
  const at = text.indexOf(LEADER_MARK);
  const before = text.slice(0, at).trimEnd();
  const after = text.slice(at + LEADER_MARK.length).split(LEADER_MARK).join('').trimStart();
  const autoWidth = el.placement.size?.width === undefined || el.placement.size.width === 'auto';
  const single = { ...el, overflow: el.overflow === 'wrap' ? 'ellipsis-end' as const : el.overflow, dropCap: undefined, paragraphIndent: undefined };
  // The row's box: the room the placement gives, one line high.
  const [box] = layoutTextElement(
    { ...single, overflow: 'clip', placement: autoWidth ? { ...el.placement, size: { ...el.placement.size, width: 'fill' } } : el.placement },
    `${before} ${after}`.trim() || ' ', pin, container, dpi, anchoredToElement, frame,
  );
  const row = box!;
  const room = row.contentWidth;
  const fontSizePx = row.fontSizePx;
  const gap = Math.max(0, dimPx(leader.gap, dpi, fontSizePx));
  // Each text on its own, as wide as it is set (cut to the room left).
  const part = (t: string, max: number): ResolvedTextPrimitive | undefined => (t
    ? layoutTextElement(
      { ...single, box: undefined, placement: { ...el.placement, size: { width: 'auto', maxWidth: { value: Math.max(0, max), unit: 'px' } } } },
      t, pin, container, dpi, anchoredToElement, frame,
    )[0]
    : undefined);
  const tail = part(after, room);
  const tailW = tail?.lines[0]?.width ?? 0;
  // A `{leader}` alone in its element (#1121) stands between two other
  // elements, a title and a page number set apart: `gap` from either.
  const lone = !before && !after;
  const gapBefore = before || lone ? gap : 0;
  const gapAfter = after || lone ? gap : 0;
  const gaps = gapBefore + gapAfter;
  const head = part(before, room - tailW - gaps);
  const headW = head?.lines[0]?.width ?? 0;
  const free = Math.max(0, room - headW - tailW - gaps);
  const tracking = row.letterSpacingPx;
  // The dots in a face of their own (#1121): the element's, with the
  // leader's family, size (`em` of the element's) and weight over it.
  const ownFace = leader.fontFamily !== undefined || leader.fontSize !== undefined || leader.fontWeight !== undefined;
  const dotsFont = ownFace
    ? buildFontString(
      leader.fontFamily ?? el.fontFamily,
      leader.fontSize ? dimPx(leader.fontSize, dpi, fontSizePx) : fontSizePx,
      (leader.fontWeight ?? el.fontWeight).toString(),
      el.italic ? 'italic' : 'normal',
    )
    : row.fontString;
  const dots = leader.enabled
    ? fitLeader(leader.char, free, (t) => Math.max(0, flowTextWidth(t, dotsFont) + tracking * graphemeCount(t)))
    : null;
  const runsOf = (p: ResolvedTextPrimitive | undefined): { runs: DesignTextRun[]; order?: number[] } => {
    const line = p?.lines[0];
    if (!line || !line.text) return { runs: [] };
    return { runs: line.runs ?? [{ text: line.text, fontString: p.fontString, width: line.width }], ...(line.order ? { order: line.order } : {}) };
  };
  const h = runsOf(head);
  const t = runsOf(tail);
  // The leader: blank room, the run, the gap before the text after it. A
  // blank run is a box as wide as its room (`inkOffset` 0).
  const blank = (width: number): DesignTextRun => ({ text: '', fontString: row.fontString, width, inkOffset: 0, leader: true });
  const fill = blank(gapBefore + free - (dots?.width ?? 0));
  const middle: DesignTextRun[] = dots
    ? [fill, { text: dots.text, fontString: dotsFont, width: dots.width, leader: true, ...(leader.color ? { color: leader.color } : {}) }, blank(gapAfter)]
    : [blank(room - headW - tailW)];
  const runs = [...h.runs, ...middle, ...t.runs];
  // Paint order: the text before the mark at the line's start, which is on
  // the right of a right-to-left row on the sheet and of a left-to-right
  // one in a mirrored flow; each text keeps its own order.
  const startRight = row.startRight === true;
  const ids = (n: number, from: number, order?: number[]) => (order ?? Array.from({ length: n }, (_, i) => i)).map((i) => i + from);
  const headIds = ids(h.runs.length, 0, h.order);
  const middleIds = ids(middle.length, h.runs.length);
  const tailIds = ids(t.runs.length, h.runs.length + middle.length, t.order);
  const order = startRight ? [...tailIds, ...middleIds.reverse(), ...headIds] : [...headIds, ...middleIds, ...tailIds];
  const identity = order.every((v, i) => v === i);
  const first = row.lines[0];
  const line: WrappedLine = {
    text: runs.map((r) => r.text).join(''),
    width: room,
    baselineY: first?.baselineY ?? 0,
    topY: first?.topY ?? 0,
    height: first?.height ?? 0,
    runs,
    ...(identity ? {} : { order }),
  };
  const truncated = head?.truncated ?? tail?.truncated;
  return [{
    ...row,
    lines: [line],
    align: 'left',
    needsClip: el.overflow === 'clip',
    ...(truncated ? { truncated } : { truncated: undefined }),
  }];
}

/**
 * One design text element laid out on its own, its box's top left corner at
 * `(x, y)` and nothing around it to clamp it: the text `text` as given (no
 * placeholders are read; inline marks are when `el.inlineMarks`). Set
 * vertically when `el.writingMode` is `'vertical-rl'` and the text is
 * measured horizontally now. Used by the comics lettering, which chooses
 * every line break itself (newlines) and sets each balloon as design text.
 */
export function layoutTextElementAt(
  el: ResolvedDesignTextElement,
  text: string,
  x: number,
  y: number,
  dpi: number,
  frame: { direction?: 'ltr' | 'rtl'; mirrored?: boolean; arabicNumbers?: boolean } = {},
): ResolvedTextPrimitive {
  const room = 1e6;
  const pin: AnchorResult = { anchorX: x, anchorY: y, pinX: 'start', pinY: 'start' };
  const container: AnchorReference = { x: x - room, y: y - room, width: 2 * room, height: 2 * room };
  const prims = el.writingMode === 'vertical-rl' && getMeasureWritingMode() !== 'vertical-rl'
    ? layoutVerticalTextElement(el, text, pin, container, dpi, false)
    : layoutTextElement(el, text, pin, container, dpi, false, frame);
  return prims[0]!;
}

const flipPin = (p: Pin): Pin => (p === 'start' ? 'end' : p === 'end' ? 'start' : 'middle');

/**
 * A text element set vertically (`writingMode: 'vertical-rl'`): laid out
 * as a horizontal text in the element's own frame turned a quarter turn
 * clockwise — its lines as long as the box is tall, stacked from the right
 * — and measured as vertical text (characters in their cells), then
 * turned back onto the page. A flow point `(fx, fy)` of that frame stands
 * at `(−fy, fx)` on the page, so the anchor, the pins and the container
 * turn with it: the top of the page is the start of a line, its right the
 * top of the frame. A drop cap is not set.
 */
export function layoutVerticalTextElement(
  el: ResolvedDesignTextElement,
  resolvedText: string,
  pin: AnchorResult,
  container: AnchorReference,
  dpi: number,
  anchoredToElement: boolean,
  seams?: readonly number[],
  chipStyles?: readonly ResolvedChipStyleConfig[],
): ResolvedTextPrimitive[] {
  const flowPin: AnchorResult = { anchorX: pin.anchorY, anchorY: -pin.anchorX, pinX: pin.pinY, pinY: flipPin(pin.pinX) };
  const flowContainer: AnchorReference = { x: container.y, y: -(container.x + container.width), width: container.height, height: container.width };
  const size = el.placement.size;
  const padding = el.box?.padding;
  const turned: ResolvedDesignTextElement = {
    ...el,
    dropCap: undefined,
    placement: {
      ...el.placement,
      size: {
        width: size?.height,
        height: size?.width,
        ...(size?.maxWidth !== undefined ? { maxWidth: size.maxWidth } : {}),
      },
    },
    ...(el.box
      ? { box: { ...el.box, ...(padding ? { padding: { top: padding.right, right: padding.bottom, bottom: padding.left, left: padding.top } } : {}) } }
      : {}),
  };
  const [main] = withMeasureWritingMode('vertical-rl', () => layoutTextElement(turned, resolvedText, flowPin, flowContainer, dpi, anchoredToElement, chipStyles ? { chipStyles } : {}, seams));
  return [{ ...main!, x: -(main!.y + main!.height), y: main!.x, width: main!.height, height: main!.width, vertical: true }];
}

export function layoutRuleElement(
  el: ResolvedDesignRuleElement,
  pin: AnchorResult,
  container: AnchorReference,
  dpi: number,
): ResolvedRulePrimitive {
  const thicknessPx = dimPx(el.thickness, dpi);
  const widthSize = resolveFixedSize(el.placement.size?.width, dpi);
  const heightSize = resolveFixedSize(el.placement.size?.height, dpi);

  let elementWidth: number;
  let elementHeight: number;
  if (el.direction === 'horizontal') {
    if (widthSize === undefined || widthSize === 'auto' || widthSize === 'fill') {
      elementWidth = Math.max(0, fillToContainerEdge(pin.anchorX, pin.pinX, container));
    } else {
      elementWidth = widthSize;
    }
    elementHeight = typeof heightSize === 'number' ? heightSize : thicknessPx;
  } else {
    if (heightSize === undefined || heightSize === 'auto' || heightSize === 'fill') {
      elementHeight = Math.max(0, fillToContainerEdgeY(pin.anchorY, pin.pinY, container));
    } else {
      elementHeight = heightSize;
    }
    elementWidth = typeof widthSize === 'number' ? widthSize : thicknessPx;
  }

  const x = edgeXFromPin(pin.anchorX, pin.pinX, elementWidth);
  const y = edgeYFromPin(pin.anchorY, pin.pinY, elementHeight);

  return {
    kind: 'rule',
    id: el.id,
    direction: el.direction,
    x,
    y,
    width: elementWidth,
    height: elementHeight,
    color: colorHex(el.color),
    thicknessPx,
  };
}

/** An image element: the resource its `resourceId` names once its
 *  placeholders are filled in (`{attr.<key>}`…), in the box its `placement.size` describes, with an
 *  `'auto'` side following the image's aspect ratio (both auto = the
 *  image's own pixel size) and the image fitted inside a fully sized box,
 *  centred. Nothing without a resolvable resource image. */
export function layoutImageElement(
  el: ResolvedDesignImageElement,
  pin: AnchorResult,
  container: AnchorReference,
  dpi: number,
  resourceById: ReadonlyMap<string, Resource> | undefined,
  /** `el.resourceId` with its placeholders filled in. */
  resourceId: string,
  /** In a vertical flow: the picture stands upright on the sheet, where the
   *  box's width runs down the page, so the box takes the picture's height
   *  as its width and its width as its height. */
  upright = false,
): ResolvedImagePrimitive | undefined {
  const resource = resourceId ? resourceById?.get(resourceId) : undefined;
  const payload = resource?.bitmap ?? resource?.svg;
  const fileId = payload?.fileId;
  if (!fileId) return undefined;
  // A bitmap's own size is its pixels at its resolution (#631).
  const own = resource?.bitmap ? bitmapLayoutSize(resource.bitmap, dpi) : payload;
  const picW = own?.width && own.width > 0 ? own.width : 1;
  const picH = own?.height && own.height > 0 ? own.height : 1;
  const natW = upright ? picH : picW;
  const natH = upright ? picW : picH;
  const widthSize = resolveFixedSize(el.placement.size?.width, dpi);
  const heightSize = resolveFixedSize(el.placement.size?.height, dpi);
  const fixedW = typeof widthSize === 'number' ? widthSize
    : widthSize === 'fill' ? Math.max(0, fillToContainerEdge(pin.anchorX, pin.pinX, container)) : undefined;
  const fixedH = typeof heightSize === 'number' ? heightSize
    : heightSize === 'fill' ? Math.max(0, fillToContainerEdgeY(pin.anchorY, pin.pinY, container)) : undefined;
  let boxW: number;
  let boxH: number;
  if (fixedW !== undefined && fixedH !== undefined) { boxW = fixedW; boxH = fixedH; }
  else if (fixedW !== undefined) { boxW = fixedW; boxH = fixedW * natH / natW; }
  else if (fixedH !== undefined) { boxH = fixedH; boxW = fixedH * natW / natH; }
  else { boxW = natW; boxH = natH; }
  const boxX = edgeXFromPin(pin.anchorX, pin.pinX, boxW);
  const boxY = edgeYFromPin(pin.anchorY, pin.pinY, boxH);
  if (el.fit === 'cover' && fixedW !== undefined && fixedH !== undefined && boxW > 0 && boxH > 0) {
    // Cover (#923): the box filled, the picture cropped, its safe area
    // kept (the comic panel's rule, `comics/art.ts`). An upright picture
    // of a vertical flow (#946) is cropped as the sheet shows it: in its
    // own upright frame, where the box is `boxH` wide and `boxW` tall.
    const cell = upright ? { x: 0, y: 0, width: boxH, height: boxW } : { x: boxX, y: boxY, width: boxW, height: boxH };
    const cut = comicArtCrop({ width: picW, height: picH, cell, fit: 'cover', ...(resource?.safeArea ? { safeArea: resource.safeArea } : {}), ...(el.focus ? { focus: el.focus } : {}) });
    const x0 = Math.max(cell.x, cut.box.x);
    const y0 = Math.max(cell.y, cut.box.y);
    const x1 = Math.min(cell.x + cell.width, cut.box.x + cut.box.width);
    const y1 = Math.min(cell.y + cell.height, cut.box.y + cut.box.height);
    const whole = cut.source.width >= 1 - 1e-6 && cut.source.height >= 1 - 1e-6;
    // The visible part back in the flow: the upright frame's x runs up the
    // flow's y from the box's foot, its y along the flow's x (the quarter
    // turn the backends paint an upright picture with).
    const shown = upright
      ? { x: boxX + y0, y: boxY + boxH - x1, width: Math.max(0, y1 - y0), height: Math.max(0, x1 - x0) }
      : { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
    return {
      kind: 'image',
      id: el.id,
      ...shown,
      fileId,
      ...(resource?.bitmap?.format ? { format: resource.bitmap.format } : {}),
      ...pictureTraits(resource, fileId),
      ...(whole ? {} : { crop: { ...cut.source } }),
      ...(upright ? { upright: true as const } : {}),
      ...altTextOf(el, resource),
    };
  }
  // Aspect-fit inside the box, centred.
  const scale = Math.min(boxW / natW, boxH / natH);
  const w = natW * scale;
  const h = natH * scale;
  return {
    kind: 'image',
    id: el.id,
    x: boxX + (boxW - w) / 2,
    y: boxY + (boxH - h) / 2,
    width: w,
    height: h,
    fileId,
    ...(resource?.bitmap?.format ? { format: resource.bitmap.format } : {}),
    ...pictureTraits(resource, fileId),
    ...(upright ? { upright: true as const } : {}),
    ...altTextOf(el, resource),
  };
}

/** The `altText` field of an image primitive: none for a decorative
 *  element (see `DesignImageElement.decorative`). */
function altTextOf(el: ResolvedDesignImageElement, resource: Resource | undefined): { altText?: string } {
  if (el.decorative) return {};
  const altText = designImageAltText(resource);
  return altText ? { altText } : {};
}

/** The black of a path that sets neither a fill nor an outline (an SVG
 *  path's default fill). */
const DEFAULT_PATH_FILL = '#000000';
/** An outline's width when the element gives none: 0.5 pt, a rule's. */
const DEFAULT_PATH_STROKE_WIDTH: Dimension = { value: 0.5, unit: 'pt' };

/** A path element (#1060): its box sized and pinned as a box's, its
 *  `viewBox` stretched to the box (`'none'`) or fitted inside it, centred
 *  (`'meet'`), the outline in page px. Path data that cannot be read, or a
 *  `viewBox` with no area, gives no outline. */
export function layoutPathElement(
  el: ResolvedDesignPathElement,
  pin: AnchorResult,
  container: AnchorReference,
  dpi: number,
): ResolvedPathPrimitive {
  const widthSize = resolveFixedSize(el.placement.size?.width, dpi);
  const heightSize = resolveFixedSize(el.placement.size?.height, dpi);
  const width = typeof widthSize === 'number' ? widthSize : Math.max(0, fillToContainerEdge(pin.anchorX, pin.pinX, container));
  const height = typeof heightSize === 'number' ? heightSize : Math.max(0, fillToContainerEdgeY(pin.anchorY, pin.pinY, container));
  const x = edgeXFromPin(pin.anchorX, pin.pinX, width);
  const y = edgeYFromPin(pin.anchorY, pin.pinY, height);
  const prim: ResolvedPathPrimitive = { kind: 'path', id: el.id, x, y, width, height, subpaths: [] };
  const vb = pathViewBox(el.viewBox);
  const parsed = typeof el.d === 'string' ? parseSvgPathCached(el.d) : undefined;
  if (!vb || !parsed?.ok) return prim;
  let sx = width / vb[0];
  let sy = height / vb[1];
  let ox = x;
  let oy = y;
  if (el.preserveAspectRatio === 'meet') {
    const k = Math.min(sx, sy);
    ox += (width - vb[0] * k) / 2;
    oy += (height - vb[1] * k) / 2;
    sx = k;
    sy = k;
  }
  prim.subpaths = mapPath(parsed.subpaths, ox, oy, sx, sy);
  const fill = el.fill?.hex ?? (el.stroke ? undefined : DEFAULT_PATH_FILL);
  if (fill) prim.fill = fill;
  if (el.stroke?.hex) {
    const widthPx = dimPx(el.width ?? DEFAULT_PATH_STROKE_WIDTH, dpi);
    const dash = (Array.isArray(el.dash) ? el.dash : []).map((d) => Math.max(0, dimPx(d, dpi)));
    prim.stroke = {
      color: el.stroke.hex,
      widthPx: Math.max(0, widthPx),
      ...(dash.length > 0 && dash.some((v) => v > 0) ? { dash } : {}),
    };
  }
  return prim;
}

export function layoutBoxElement(
  el: ResolvedDesignBoxElement,
  pin: AnchorResult,
  container: AnchorReference,
  dpi: number,
): ResolvedBoxPrimitive {
  const widthSize = resolveFixedSize(el.placement.size?.width, dpi);
  const heightSize = resolveFixedSize(el.placement.size?.height, dpi);
  let elementWidth: number;
  let elementHeight: number;
  if (widthSize === undefined || widthSize === 'auto' || widthSize === 'fill') {
    elementWidth = Math.max(0, fillToContainerEdge(pin.anchorX, pin.pinX, container));
  } else {
    elementWidth = widthSize;
  }
  if (heightSize === undefined || heightSize === 'auto' || heightSize === 'fill') {
    elementHeight = Math.max(0, fillToContainerEdgeY(pin.anchorY, pin.pinY, container));
  } else {
    elementHeight = heightSize;
  }
  const x = edgeXFromPin(pin.anchorX, pin.pinX, elementWidth);
  const y = edgeYFromPin(pin.anchorY, pin.pinY, elementHeight);
  const box = resolveBox(el.style, dpi) ?? {
    borderWidthPx: 0,
    borderRadiusPx: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
  };
  return {
    kind: 'box',
    id: el.id,
    x,
    y,
    width: elementWidth,
    height: elementHeight,
    box,
  };
}
