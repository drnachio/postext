// A design's elements as Word blocks, in reading order (#1444), for a
// heading's design and a part page's alike: texts (side by side ones
// sharing a line), pictures and short rules, the title paragraph where the
// title element stands, and the pieces printed on a filled box set in that
// box's shaded table.

import type { ResolvedDesignElement, ResolvedDesignImageElement, ResolvedDesignRuleElement, ResolvedDesignTextElement } from '../../../types.js';
import type { WriterContext } from '../context.js';
import { pageGeometry, type PageGeometry } from '../sections.js';
import type { ResolvedConfig } from '../../../vdt.js';
import type { Dimension } from '../../../types.js';
import { hex, paragraph, px, type ParaProps, type Units } from '../wml.js';
import { backdropPicture, fillsPage, inlinePicture } from './placedPicture.js';
import { columnSets, columnTable, type ColumnText } from './columns.js';
import { partBodyChunks } from './partBody.js';
import { bandInnerTwips, drawnRule, ruleParagraph, thinParagraph, withBands, type BandFoot, type Chunk } from './bands.js';
import { covers, estimateBoxes, onSheet, readingOrder, type Box, type DesignFrames } from './geometry.js';
import { paleOnWhite } from './ink.js';
import { rowParagraph, sameLine, type RowPart } from './rows.js';
import { designTextStyle, pillOnPicture } from './text.js';

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
  /** A part page's body (its list of chapters), written when called: on
   *  the band that holds the body area, `top` px down the page, in `ink`
   *  (see partBody.ts). Left uncalled when no band holds it. */
  body?: { write: () => string; top: number; ink?: string };
}

type Item =
  | { box: Box; kind: 'title' }
  | { box: Box; kind: 'text'; el: ResolvedDesignTextElement; text: string }
  | { box: Box; kind: 'image'; el: ResolvedDesignImageElement; id: string }
  | { box: Box; kind: 'rule'; el: ResolvedDesignRuleElement };

type TextItem = Extract<Item, { kind: 'text' }>;

/**
 * The frames a design of a book set from `r` is placed against: the page,
 * and the slot's container at the top of the text area (an opener) or
 * wherever the heading stands, `minHeight` high. A vertical flow places
 * its design in the flow's frame: the sheet turned a quarter, x running
 * down it and y across it from the right.
 */
export function designFrames(r: ResolvedConfig, u: Units, minHeight: Dimension | undefined): { geo: PageGeometry; page: Box; textW: number; container: Box; vertical: boolean; flowPage: Box; frames: DesignFrames } {
  const geo = pageGeometry(r, u);
  const toPx = (tw: number): number => (tw * u.dpi) / 1440;
  const page = { x: 0, y: 0, width: toPx(geo.widthTw), height: toPx(geo.heightTw) };
  const textW = page.width - toPx(geo.margins.left + geo.margins.right);
  const container = { x: toPx(geo.margins.left), y: toPx(geo.margins.top), width: textW, height: px(u, minHeight) || (u.dpi / 25.4) * 40 };
  const vertical = r.layout.writingMode === 'vertical-rl';
  const flowPage = vertical ? { x: 0, y: 0, width: page.height, height: page.width } : page;
  const frames = vertical ? { page: flowPage, container: { x: toPx(geo.margins.top), y: toPx(geo.margins.right), width: page.height - toPx(geo.margins.top + geo.margins.bottom), height: container.height } } : { page, container };
  return { geo, page, textW, container, vertical, flowPage, frames };
}

/** A design as Word blocks. */
export function writeDesign(ctx: WriterContext, spec: DesignSpec): string {
  const u = ctx.units;
  const rtl = ctx.resolved.direction === 'rtl';
  const toPx = (tw: number): number => (tw * u.dpi) / 1440;
  const { geo, page, textW, container, vertical, flowPage, frames } = designFrames(ctx.resolved, u, spec.minHeight);
  const { elements, texts } = spec;
  const boxes = estimateBoxes(elements, frames, u, (id) => texts.get(id) ?? '', ctx.resources, spec.imageId, rtl, vertical);
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
  const textHeight = page.height - toPx(geo.margins.top + geo.margins.bottom);
  // A picture that fills the page, printed on no band, with every text
  // the page prints standing on it inside the text area (a cover under
  // its title, an endpaper), is drawn behind the text; a pale text over it
  // keeps its ink (the picture is its ground, as a band would be). A plate
  // whose caption is printed lower, in the page's foot margin where Word
  // sets no text, stays in the flow with its caption under it.
  const over = (pic: Box): boolean =>
    order.every((i) => (i.kind !== 'text' && i.kind !== 'title') || (covers(pic, i.box) && (vertical || i.box.y + i.box.height <= textBottom + MM(u, 2))));
  const backdrop = order.find((i): i is Extract<Item, { kind: 'image' }> => i.kind === 'image' && !bandOf(i.box) && fillsPage(i.box, flowPage) && over(i.box));
  const onBackdrop = (box: Box): string | undefined => (backdrop && covers(backdrop.box, box) ? BACKDROP : undefined);
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
  // On a page of its own with no band (a title page), the last piece
  // standing well below the others (an imprint at the foot of the page)
  // keeps the space above it, with room to spare so that it stays on the
  // page. `flowY` is roughly where Word has got to.
  const freePage = spec.breakBefore && !bands.length && !vertical;
  let flowY = container.y;
  const footPiece = order[order.length - 1];
  const drop = (band: Chunk['band'], box: Box | undefined): ParaProps | undefined => {
    if (freePage && box && placed && box === footPiece?.box && footPiece.kind !== 'image') {
      const gap = box.y - flowY;
      const room = textBottom - MM(u, 30) - box.height - flowY;
      const before = gap >= MM(u, 40) ? Math.max(0, Math.min(gap, room)) : 0;
      return before > 0 ? { before: Math.round((before * 1440) / u.dpi) } : undefined;
    }
    if (box) flowY = Math.max(flowY, box.y) + box.height;
    if (placed) return undefined;
    placed = true;
    if (!spec.breakBefore || band || !box) return undefined;
    const gap = box.y - container.y;
    if (gap < (20 * u.dpi) / 25.4) return undefined;
    // Over a page-filling picture the pieces stand where the print sets
    // them on it (a caption on the plate's paper foot, a headline low on a
    // cover photo), as long as they and what follows them still fit.
    const cap = backdrop ? textBottom - container.y - MM(u, 10) - restHeight(box) : textHeight * 0.4;
    return { before: Math.round((Math.max(0, Math.min(gap, cap)) * 1440) / u.dpi) };
  };
  // The height of the pieces from the one at `box` on, with a little air
  // between them.
  const restHeight = (box: Box): number => {
    const from = order.findIndex((i) => i.box === box);
    return order.slice(Math.max(0, from)).reduce((h, i) => h + (i === backdrop ? 0 : i.box.height + MM(u, 2)), 0);
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
    const fill = band?.fill ?? onBackdrop(item.box);
    const shade = fill && (paleOnWhite(hex(item.el.color)) || fill !== 'FFFFFF') ? fill : undefined;
    return designTextStyle(ctx, spec.slot, item.el, shade, keepNext, item.text);
  };
  const last = order.length - 1;
  // Every piece but the last keeps with what follows.
  const keeps = (i: number): boolean => i < last;
  // Blocks of text set side by side off any band (see columns.ts).
  const sideBySide = !rtl && !vertical;
  const columnTexts = order.map((it): ColumnText | undefined => {
    if (!sideBySide || bandOf(it.box) || onBackdrop(it.box)) return undefined;
    if (it.kind === 'text') return { el: it.el, text: it.text, box: it.box };
    return it.kind === 'title' && titleEl ? { el: titleEl, text: spec.texts.get(titleEl.id) ?? '', box: it.box } : undefined;
  });
  const sets = columnSets(ctx, columnTexts);
  const inSet = new Set(sets.flatMap((c) => c.columns.flat()));
  for (let i = 0; i < order.length; i++) {
    const item = order[i]!;
    const band = bandOf(item.box);
    if (inSet.has(i)) {
      const set = sets.find((c) => Math.min(...c.columns.flat()) === i);
      if (!set) continue;
      // A page break or a drop goes on a paragraph before the table (one
      // always stands there: LibreOffice loses a section's page numbers
      // when its first page opens with a table).
      const first = firstProps(undefined, item.box);
      chunks.push({ xml: paragraph({ ...first, keepNext: true, after: 0, line: { twips: 20, rule: 'exact' }, ind: { firstLine: 0 }, markRPr: THIN_MARK }, '') });
      const cells = set.columns.map((col) =>
        col
          .map((k) => {
            const piece = order[k]!;
            if (piece.kind === 'title') return spec.title(titleEl, undefined, moves ? { pageBreakBefore: false } : {}, true);
            const t = piece as TextItem;
            return spec.textParagraphs(t.el, t.text, textStyle(t, undefined, false)).join('');
          })
          .join(''),
      );
      // Word joins tables that touch: a thin paragraph keeps the next apart.
      chunks.push({ xml: columnTable(ctx, set, columnTexts, container, widthTw, cells) + thinParagraph({ keepNext: true }), box: item.box });
      continue;
    }
    if (item.kind === 'title') {
      const props: Partial<ParaProps> = { ...(moves ? { pageBreakBefore: false } : {}), ...firstProps(band, item.box) };
      chunks.push({ xml: spec.title(titleEl, band?.fill ?? onBackdrop(item.box), props, true), band, box: item.box });
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
      if (!band && item === backdrop) {
        // Drawn behind what the page prints: the first piece over it
        // still drops to where it stands.
        const was: boolean = placed;
        placed = true;
        const first = firstProps(band);
        placed = was;
        chunks.push({ xml: backdropPicture(ctx, item.id, vertical ? onSheet(item.box, page.width) : item.box, first) });
        continue;
      }
      const first = firstProps(band, item.box);
      // As wide as the band's cell or the text area; as tall as the page
      // leaves it once what follows has its room.
      const maxW = band ? (bandInnerTwips(ctx, widthTw) * u.dpi) / 1440 : textW;
      const below = order.slice(i + 1).reduce((h, o) => h + (o.box.y < textBottom ? o.box.height + MM(u, 3) : 0), 0);
      // Vertical lines stand side by side, not under the picture: there
      // it keeps to about half the page.
      const maxH = vertical ? textHeight * 0.55 : Math.max(textHeight * 0.55, textHeight - below - MM(u, 15));
      // The space the print leaves under it (a cover photo above its
      // kicker), a centimetre at most.
      const next = order[i + 1];
      const under = next ? Math.min(MM(u, 10), next.box.y - (item.box.y + item.box.height)) : 0;
      const after = under > MM(u, 1) ? { after: Math.round((under * 1440) / u.dpi) } : {};
      chunks.push({ xml: inlinePicture(ctx, item.id, item.box, { ...first, ...after }, keeps(i), maxW, maxH), band, box: item.box });
      continue;
    }
    // Texts that share a line with this one (same band, same top) share
    // its paragraph.
    let j = i + 1;
    while (j < order.length) {
      const next = order[j]!;
      // A text already set in a table of columns is not written again.
      if (next.kind !== 'text' || inSet.has(j) || bandOf(next.box)?.box !== band?.box || !sameLine(ctx, order[j - 1] as TextItem, next, container.width)) break;
      j++;
    }
    const row = order.slice(i, j) as TextItem[];
    const first = firstProps(band, item.box);
    // Each text is written once, in document order (the map lists its
    // pieces in that order).
    const parts: RowPart[] = row.map((r) => {
      const style = textStyle(r, band, keeps(j - 1));
      return { el: r.el, box: r.box, text: r.text, style, band: band?.fill ?? onBackdrop(r.box), write: (first) => spec.textParagraphs(r.el, r.text, style, first) };
    });
    if (row.length > 1) {
      const frame = band ? clip(band.box, container) : container;
      chunks.push({ xml: rowParagraph(ctx, parts, frame, band ? bandInnerTwips(ctx, widthTw) : widthTw, rtl, { ...first }), band, box: row[0]!.box });
    } else {
      const own = !band && onBackdrop(item.box) ? pillOnPicture(ctx, row[0]!.el, row[0]!.text, widthTw) : undefined;
      chunks.push({ xml: parts[0]!.write(own ? { ...first, ...own } : first).join(''), band, box: row[0]!.box });
    }
    i = j - 1;
  }
  if (spec.body) {
    const band = bandOf({ x: container.x + 1, y: spec.body.top, width: 1, height: 1 });
    const tail = chunks[chunks.length - 1];
    if (band && tail?.band?.box === band.box) {
      const above = Math.max(...chunks.filter((c) => c.band?.box === band.box && c.box).map((c) => c.box!.y + c.box!.height));
      chunks.push(...partBodyChunks(ctx, spec.body.write(), { band, above, top: spec.body.top, textBottom }, spec.body.ink));
    }
  }
  if (at < 0) {
    // A title the design never prints: its paragraph goes last, hidden,
    // where it breaks no band apart.
    const tail = chunks[chunks.length - 1];
    const props = { ...(moves ? { pageBreakBefore: false } : {}), ...firstProps(undefined) };
    chunks.push({ xml: spec.title(titleEl, tail?.band?.fill, props, false), band: tail?.band, box: tail?.box });
  }
  const feet = bandFeet(ctx, elements, boxes);
  const tail = chunks[chunks.length - 1]?.band;
  return withBands(ctx, chunks, container, widthTw, feet, tail ? gapAfterBand(ctx, tail.box, feet.get(tail.box), elements, boxes, container, textBottom, px(u, spec.minHeight)) : 0);
}

/** The ground of a text printed over a page-filling picture: dark, so a
 *  pale ink is kept. */
const BACKDROP = '000000';

const THIN_MARK = '<w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr>';

const MM = (u: { dpi: number }, mm: number): number => (mm * u.dpi) / 25.4;

/** The thin filled strips right under the design's bands (a foot rule as
 *  wide as its band, a few millimetres high at most), by band box: Word
 *  draws each as its band table's bottom border. */
function bandFeet(ctx: WriterContext, elements: readonly ResolvedDesignElement[], boxes: ReadonlyMap<string, Box>): Map<Box, BandFoot> {
  const u = ctx.units;
  const out = new Map<Box, BandFoot>();
  const filled = elements.filter((e): e is Extract<ResolvedDesignElement, { kind: 'box' }> => e.kind === 'box' && !!hex(e.style.backgroundColor));
  for (const band of filled) {
    const bb = boxes.get(band.id);
    if (!bb) continue;
    for (const e of filled) {
      const fb = boxes.get(e.id);
      if (e === band || !fb || fb.height <= 0 || fb.height > MM(u, 4)) continue;
      const under = Math.abs(fb.y - (bb.y + bb.height)) <= MM(u, 1);
      if (!under || fb.width < bb.width * 0.8 || fb.x > bb.x + MM(u, 1)) continue;
      // Word's widest border is 6 pt (48 eighths).
      out.set(bb, { color: hex(e.style.backgroundColor)!, sz: Math.min(48, Math.max(4, Math.round((fb.height * 72 * 8) / u.dpi))) });
      break;
    }
  }
  return out;
}

/**
 * The room a design ending in a band leaves before the text that follows
 * it (an opener band, #1444): down to the slot's foot or to the lowest
 * piece it draws below the band (a pad under its foot rule), and a body
 * line at least, as the print starts its text on the line after the
 * band. Twips; none for a band that reaches the foot of the page.
 */
function gapAfterBand(ctx: WriterContext, band: Box, foot: BandFoot | undefined, elements: readonly ResolvedDesignElement[], boxes: ReadonlyMap<string, Box>, container: Box, textBottom: number, minHeight: number): number {
  const u = ctx.units;
  const bottom = band.y + band.height + (foot ? (foot.sz / 8 / 72) * u.dpi : 0);
  if (bottom > textBottom - MM(u, 20)) return 0;
  let end = minHeight > 0 ? container.y + minHeight : bottom;
  for (const e of elements) {
    const b = boxes.get(e.id);
    if (e.kind === 'box' && b && b.y >= bottom - MM(u, 1) && b.y <= bottom + MM(u, 4)) end = Math.max(end, b.y + b.height);
  }
  const line = px(u, ctx.resolved.bodyText.lineHeight, ctx.styles.bodyPx) || u.basePx * 1.4;
  const gap = Math.min(MM(u, 12), Math.max(end - bottom, line));
  return Math.round((gap * 1440) / u.dpi);
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
export function titleColumnFirst<T extends { box: Box; kind: string }>(order: T[], dpi: number): T[] {
  const at = order.findIndex((i) => i.kind === 'title');
  if (at < 0) return order;
  const title = order[at]!.box;
  const tol = (2 * dpi) / 25.4;
  // A column block: a text several lines (of about 5 mm) tall.
  const line = (5 * dpi) / 25.4;
  const beside = (i: T): boolean => i.kind === 'text' && apart(i.box, title) && Math.abs(i.box.y - title.y) <= tol && i.box.height > 3 * line;
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

