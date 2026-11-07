// A design's elements as Word blocks, in reading order (#1444), for a
// heading's design and a part page's alike: texts (side by side ones
// sharing a line), pictures and short rules, the title paragraph where the
// title element stands, and the pieces printed on a filled box set in that
// box's shaded table.

import type { ResolvedDesignElement, ResolvedDesignImageElement, ResolvedDesignRuleElement, ResolvedDesignTextElement } from '../../../types.js';
import type { WriterContext } from '../context.js';
import { pictureRun } from '../media/figures.js';
import { pageGeometry } from '../sections.js';
import { STYLE } from '../styles.js';
import type { Dimension } from '../../../types.js';
import { blockSdt, hex, paragraph, px, type ParaProps } from '../wml.js';
import { bandInnerTwips, drawnRule, ruleParagraph, thinParagraph, withBands, type Chunk } from './bands.js';
import { covers, estimateBoxes, readingOrder, type Box } from './geometry.js';
import { paleOnWhite } from './ink.js';
import { rowParagraph, sameLine, type RowPart } from './rows.js';
import { designTextStyle } from './text.js';

/** What a design is written from and how its own pieces are written. */
export interface DesignSpec {
  /** The elements printed (palette overrides applied). */
  elements: readonly ResolvedDesignElement[];
  /** Each text element's resolved text. */
  texts: ReadonlyMap<string, string>;
  /** The slot's height (an opener's band), when it sets one. */
  minHeight?: Dimension;
  /** Name for the design's styles. */
  slot: string;
  /** The resource an image element shows. */
  imageId: (el: ResolvedDesignImageElement) => string | undefined;
  /** Picture ids by image element id (the ones Word holds). */
  pictures: ReadonlyMap<string, string>;
  /** Whether a text element prints the title. */
  isTitle: (el: ResolvedDesignTextElement) => boolean;
  /** The paragraphs of a text element in paragraph style `style`. */
  textParagraphs: (el: ResolvedDesignTextElement, text: string, style: string, first?: ParaProps) => string[];
  /** The title paragraph(s): `band` is the fill it is printed on, `props`
   *  what goes over its style (a page break placed, or cancelled). */
  title: (el: ResolvedDesignTextElement | undefined, band: string | undefined, props: Partial<ParaProps>, shown: boolean) => string;
  /** Whether the design opens a page. */
  breakBefore: boolean;
}

type Item =
  | { box: Box; kind: 'title' }
  | { box: Box; kind: 'text'; el: ResolvedDesignTextElement; text: string }
  | { box: Box; kind: 'image'; el: ResolvedDesignImageElement; id: string }
  | { box: Box; kind: 'rule'; el: ResolvedDesignRuleElement };

type TextItem = Extract<Item, { kind: 'text' }>;

/** A design as Word blocks. */
export function writeDesign(ctx: WriterContext, spec: DesignSpec): string {
  const u = ctx.units;
  const rtl = ctx.resolved.direction === 'rtl';
  // The frames: the page, and the slot's container at the top of the
  // text area (an opener) or wherever the heading stands.
  const geo = pageGeometry(ctx.resolved, u);
  const toPx = (tw: number): number => (tw * u.dpi) / 1440;
  const page = { x: 0, y: 0, width: toPx(geo.widthTw), height: toPx(geo.heightTw) };
  const textW = page.width - toPx(geo.margins.left + geo.margins.right);
  const container = { x: toPx(geo.margins.left), y: toPx(geo.margins.top), width: textW, height: px(u, spec.minHeight) || (u.dpi / 25.4) * 40 };
  const { elements, texts } = spec;
  const boxes = estimateBoxes(elements, { page, container }, u, (id) => texts.get(id) ?? '', ctx.resources, spec.imageId, rtl);
  // The fill under a piece: the last box painted under it.
  const bands = elements.filter((e) => e.kind === 'box' && hex(e.style.backgroundColor));
  const bandOf = (box: Box): Chunk['band'] => {
    let band: Chunk['band'];
    for (const e of bands) {
      const bb = boxes.get(e.id);
      if (bb && e.kind === 'box' && covers(bb, box)) band = { fill: hex(e.style.backgroundColor)!, box: bb };
    }
    return band;
  };
  // A rule in the page's margins (a running head's, a frame's) is page
  // furniture, not part of what the page reads.
  const textBottom = page.height - toPx(geo.margins.bottom);
  const inText = (box: Box): boolean => box.y >= container.y - (u.dpi / 25.4) * 2 && box.y <= textBottom;
  const items: Item[] = [];
  let titleEl: ResolvedDesignTextElement | undefined;
  const near = (u.dpi / 25.4) * 2;
  for (const el of elements) {
    const box = boxes.get(el.id);
    if (!box) continue;
    if (el.kind === 'text') {
      if (spec.isTitle(el)) {
        if (!titleEl) items.push({ box, kind: 'title' });
        titleEl ??= el;
        continue;
      }
      const text = texts.get(el.id) ?? '';
      // Words, numbers or an ornament (a fleuron, a star) under a title.
      if (!/[\p{L}\p{N}\p{So}]/u.test(text)) continue;
      // A shadow or an outline drawn under a text is the same words a
      // hair away: only the one painted last (on top) is written.
      const twin = items.findIndex((i) => i.kind === 'text' && i.text === text && Math.abs(i.box.x - box.x) < near && Math.abs(i.box.y - box.y) < near);
      if (twin >= 0) items.splice(twin, 1);
      items.push({ box, kind: 'text', el, text });
    } else if (el.kind === 'image') {
      const id = spec.pictures.get(el.id);
      if (id && ctx.media.has(id)) items.push({ box, kind: 'image', el, id });
    } else if (el.kind === 'rule' && inText(box) && drawnRule(ctx, el, box, !!bandOf(box))) items.push({ box, kind: 'rule', el });
  }
  const order = titleColumnFirst(readingOrder(items, rtl, u), u.dpi);
  const at = order.findIndex((i) => i.kind === 'title');
  const titleBand = at >= 0 ? bandOf(order[at]!.box) : undefined;
  // A design spans the text area (see layout/pageSpan.ts).
  const widthTw = Math.round((ctx.textAreaPx * 1440) / u.dpi);
  // A design that opens a page keeps the page with what it prints above
  // its title: the break moves to the first piece, or to a thin paragraph
  // before a band that comes first (a table cell cannot break a page).
  const moves = spec.breakBefore && order.length > 0 && (at !== 0 || !!titleBand);
  let pending = moves;
  const chunks: Chunk[] = [];
  // A page the design opens starts where its first piece stands: a
  // half-title a third of the way down keeps the space above it (a
  // piece on a band takes its table's inset instead).
  let placed = false;
  const drop = (band: Chunk['band'], box: Box | undefined): ParaProps | undefined => {
    if (placed) return undefined;
    placed = true;
    if (!spec.breakBefore || band || !box) return undefined;
    const gap = box.y - container.y;
    const textHeight = page.height - toPx(geo.margins.top + geo.margins.bottom);
    if (gap < (20 * u.dpi) / 25.4) return undefined;
    return { before: Math.round((Math.min(gap, textHeight * 0.4) * 1440) / u.dpi) };
  };
  const firstProps = (band: Chunk['band'], box?: Box): ParaProps | undefined => {
    const space = drop(band, box);
    if (!pending) return space;
    pending = false;
    if (!band) return { pageBreakBefore: true, ...space };
    chunks.push({ xml: thinParagraph({ pageBreakBefore: true, keepNext: true }) });
    return undefined;
  };
  const textStyle = (item: TextItem, band: Chunk['band'], keepNext: boolean): string => {
    const fill = band?.fill;
    const shade = fill && (paleOnWhite(hex(item.el.color)) || fill !== 'FFFFFF') ? fill : undefined;
    return designTextStyle(ctx, spec.slot, item.el, shade, keepNext, item.text);
  };
  const last = order.length - 1;
  // Every piece but the last keeps with what follows.
  const keeps = (i: number): boolean => i < last;
  for (let i = 0; i < order.length; i++) {
    const item = order[i]!;
    const band = bandOf(item.box);
    if (item.kind === 'title') {
      const props: Partial<ParaProps> = { ...(moves ? { pageBreakBefore: false } : {}), ...firstProps(band, item.box) };
      chunks.push({ xml: spec.title(titleEl, band?.fill, props, true), band, box: item.box });
      continue;
    }
    if (item.kind === 'rule') {
      const frame = band ? clip(band.box, container) : container;
      const first = firstProps(band, item.box);
      const xml = ruleParagraph(ctx, item.el, item.box, frame, band ? bandInnerTwips(ctx, widthTw) : widthTw, rtl, keeps(i), first);
      chunks.push({ xml, band, box: item.box });
      continue;
    }
    if (item.kind === 'image') {
      const first = firstProps(band, item.box);
      chunks.push({ xml: picture(ctx, item.id, item.box, first, keeps(i), geo.heightTw - geo.margins.top - geo.margins.bottom), band, box: item.box });
      continue;
    }
    // Texts that share a line with this one (same band, same top) share
    // its paragraph.
    let j = i + 1;
    while (j < order.length) {
      const next = order[j]!;
      if (next.kind !== 'text' || bandOf(next.box)?.box !== band?.box || !sameLine(ctx, order[j - 1] as TextItem, next, container.width)) break;
      j++;
    }
    const row = order.slice(i, j) as TextItem[];
    const first = firstProps(band, item.box);
    // Each text is written once, in document order (the map lists its
    // pieces in that order).
    const parts: RowPart[] = row.map((r) => {
      const style = textStyle(r, band, keeps(j - 1));
      return { el: r.el, box: r.box, text: r.text, style, band: band?.fill, write: (first) => spec.textParagraphs(r.el, r.text, style, first) };
    });
    if (row.length > 1) {
      const frame = band ? clip(band.box, container) : container;
      chunks.push({ xml: rowParagraph(ctx, parts, frame, band ? bandInnerTwips(ctx, widthTw) : widthTw, rtl, { ...first }), band, box: row[0]!.box });
    } else chunks.push({ xml: parts[0]!.write(first).join(''), band, box: row[0]!.box });
    i = j - 1;
  }
  if (at < 0) {
    // A title the design never prints: its paragraph goes last, hidden,
    // where it breaks no band apart.
    const tail = chunks[chunks.length - 1];
    const props = { ...(moves ? { pageBreakBefore: false } : {}), ...firstProps(undefined) };
    chunks.push({ xml: spec.title(titleEl, tail?.band?.fill, props, false), band: tail?.band, box: tail?.box });
  }
  return withBands(ctx, chunks, container, widthTw);
}

/** Boxes side by side: no common stretch across the page. */
const apart = (a: Box, b: Box): boolean => a.x + a.width <= b.x || b.x + b.width <= a.x;

/**
 * The reading order with the title's column first: a block of text set
 * in a column beside the title, level with it (a story's opening
 * paragraph next to its deck), reads after the title and what stands
 * under it in its column (the byline), not before them as top-to-bottom
 * order would have it.
 */
function titleColumnFirst(order: Item[], dpi: number): Item[] {
  const at = order.findIndex((i) => i.kind === 'title');
  if (at < 0) return order;
  const title = order[at]!.box;
  const tol = (2 * dpi) / 25.4;
  // A column block: a text several lines (of about 5 mm) tall.
  const line = (5 * dpi) / 25.4;
  const beside = (i: Item): boolean => i.kind === 'text' && apart(i.box, title) && Math.abs(i.box.y - title.y) <= tol && i.box.height > 3 * line;
  const moved = order.slice(0, at).filter(beside);
  if (!moved.length) return order;
  const rest = order.filter((i) => !moved.includes(i));
  let end = rest.indexOf(order[at]!) + 1;
  while (end < rest.length && !apart(rest[end]!.box, title)) end++;
  return [...rest.slice(0, end), ...moved, ...rest.slice(end)];
}

/** `box` cut to the width of `frame`. */
function clip(box: Box, frame: Box): Box {
  const x = Math.max(box.x, frame.x);
  return { ...box, x, width: Math.max(1, Math.min(box.x + box.width, frame.x + frame.width) - x) };
}

/** A design's picture, as wide as the design draws it (the column at
 *  most) and no taller than about half the text area. */
function picture(ctx: WriterContext, id: string, box: Box, first: ParaProps | undefined, keepNext: boolean, textHeightTw: number): string {
  const pic = ctx.media.get(id)!;
  ctx.usedResources.add(id);
  let w = Math.min(ctx.columnPx, box.width > 1 ? box.width : pic.widthPx);
  const maxH = ((textHeightTw * ctx.units.dpi) / 1440) * 0.55;
  if ((w * pic.heightPx) / pic.widthPx > maxH) w = (maxH * pic.widthPx) / pic.heightPx;
  const scaled = { ...pic, widthPx: w, heightPx: (w * pic.heightPx) / pic.widthPx };
  const alt = ctx.resources.get(id)?.altText ?? '';
  return blockSdt(ctx.nextSdtId(), `ptx:design:${id}`, undefined, paragraph({ style: STYLE.figure, keepNext: keepNext || undefined, ...first }, pictureRun(ctx, scaled, id, alt, 0)));
}
