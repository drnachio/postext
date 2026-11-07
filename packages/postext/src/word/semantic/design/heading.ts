// A heading drawn by its design (#1444): the texts and pictures the
// heading style's `advancedDesign` prints are written around the heading
// paragraph in reading order (top to bottom, then from the side lines
// start on), so a kicker comes above the title and a lead, byline or
// credit below it. A design that never prints the heading's own text (a
// cover that prints the book's title, a back cover, the page of an
// endpaper) leaves the heading paragraph hidden: still mapped to its
// source, out of the outline, and a line of one point. So does a heading
// the book marks `hidden`. Rules, boxes and paths are decoration: a box's
// fill shades the paragraphs printed on it, and nothing else is drawn.

import type { ContentBlock } from '../../../parse/types.js';
import { headingIsHidden } from '../../../pipeline/sections/headingStyles.js';
import { resolveDesignText } from '../../../design/placeholders.js';
import { plainDesignText } from '../../../design/richText.js';
import type { ResolvedDesignElement, ResolvedDesignImageElement, ResolvedDesignTextElement } from '../../../types.js';
import type { WriterContext } from '../context.js';
import { pictureRun } from '../media/figures.js';
import { pageGeometry } from '../sections.js';
import { STYLE } from '../styles.js';
import { generatedRuns } from '../generated.js';
import { blockSdt, hex, paragraph, px, type ParaProps } from '../wml.js';
import { covers, estimateBoxes, readingOrder, type Box } from './geometry.js';
import { hideRuns } from './hide.js';
import { designImageId, designPictures } from './pictures.js';
import { paleOnWhite } from './ink.js';
import { designTextLook, designTextParagraphs, designTextStyle, fittedSize } from './text.js';
import { designPlaceholders, headingLevelOf } from './values.js';
import type { DesignPlaceholderContext } from '../../../design/placeholders.js';

/** How the heading paragraph itself is written under a design. */
export interface HeadingLook {
  /** Its paragraph style, when the design gives the title its own look. */
  style?: string;
  /** Leave the number prefix out: a design prints the number it shows. */
  noNumber?: boolean;
  /** Generated runs the title element prints before and after the title
   *  ("{number}. " in front, a closing ornament after). Functions, called
   *  as the paragraph is written, so the map lists them in document order. */
  before?: () => string;
  after?: () => string;
  /** Paragraph properties over the style's. */
  props?: Partial<ParaProps>;
}

/** A hidden heading paragraph: no visible text, no outline level, one
 *  point high, but its text kept (mapped) for the way back. */
const HIDDEN: Partial<ParaProps> = { outlineLvl: 9, before: 0, after: 0, line: { twips: 20, rule: 'exact' }, keepNext: true };

/** The elements of a design the semantic document reads: those every
 *  opener prints (one side's when the design has odd and even ones). */
function printed(elements: readonly ResolvedDesignElement[]): ResolvedDesignElement[] {
  const hasOdd = elements.some((e) => e.parity === 'odd');
  return elements.filter((e) => {
    if (e.parity === 'even' && hasOdd) return false;
    const pages = 'pages' in e ? e.pages : undefined;
    return !pages || pages === 'all' || pages === 'opener' || pages === 'body';
  });
}

/** Whether a text element prints the heading's own title. */
function printsTitle(el: ResolvedDesignTextElement, level: number): boolean {
  const c = el.content ?? '';
  return c.includes('{titleText}') || (level === 1 && c.includes('{chapterTitle}'));
}

type Item = { box: Box; kind: 'title' } | { box: Box; kind: 'text'; el: ResolvedDesignTextElement; text: string } | { box: Box; kind: 'image'; el: ResolvedDesignImageElement; id: string };

/**
 * Heading `b` as its design prints it, or undefined when it has no design
 * and is not hidden (the caller writes it as usual). `heading` writes the
 * heading paragraph with a look.
 */
export function renderDesignedHeading(ctx: WriterContext, b: ContentBlock, heading: (look: HeadingLook) => string): string | undefined {
  const level = headingLevelOf(ctx.resolved, b);
  if (!level) return undefined;
  if (headingIsHidden(b, level)) return hideRuns(heading({ props: HIDDEN }));
  const design = level.advancedDesign;
  if (!design.enabled || !design.slot.elements.length) return undefined;
  const u = ctx.units;
  const rtl = ctx.resolved.direction === 'rtl';
  const placeholders = designPlaceholders(ctx, b);
  const elements = printed(design.slot.elements);
  const texts = new Map<string, string>();
  for (const el of elements) {
    if (el.kind !== 'text') continue;
    const t = resolveDesignText(el.content ?? '', placeholders, !!el.inlineMarks);
    texts.set(el.id, (el.inlineMarks ? plainDesignText(t) : t).trim());
  }
  // The frames: the page, and the slot's container at the top of the
  // text area (an opener) or wherever the heading stands.
  const geo = pageGeometry(ctx.resolved, u);
  const toPx = (tw: number): number => (tw * u.dpi) / 1440;
  const page = { x: 0, y: 0, width: toPx(geo.widthTw), height: toPx(geo.heightTw) };
  const textW = page.width - toPx(geo.margins.left + geo.margins.right);
  const container = { x: toPx(geo.margins.left), y: toPx(geo.margins.top), width: textW, height: px(u, design.minHeight) || (u.dpi / 25.4) * 40 };
  const boxes = estimateBoxes(elements, { page, container }, u, (id) => texts.get(id) ?? '', ctx.resources, (el) => designImageId(el.resourceId, b.attrs), rtl);
  const pictures = new Map(designPictures(b, elements, ctx.resources).map((p) => [p.elementId, p]));
  const items: Item[] = [];
  let titled = false;
  const near = (u.dpi / 25.4) * 2;
  for (const el of elements) {
    const box = boxes.get(el.id);
    if (!box) continue;
    if (el.kind === 'text') {
      if (printsTitle(el, b.level ?? 1)) {
        if (!titled) items.push({ box, kind: 'title' });
        titled = true;
        continue;
      }
      const text = texts.get(el.id) ?? '';
      if (!/[\p{L}\p{N}]/u.test(text)) continue;
      // A shadow or an outline drawn under a text is the same words a
      // hair away: only the one painted last (on top) is written.
      const twin = items.findIndex((i) => i.kind === 'text' && i.text === text && Math.abs(i.box.x - box.x) < near && Math.abs(i.box.y - box.y) < near);
      if (twin >= 0) items.splice(twin, 1);
      items.push({ box, kind: 'text', el, text });
    } else if (el.kind === 'image') {
      const p = pictures.get(el.id);
      if (p && ctx.media.has(p.id)) items.push({ box, kind: 'image', el, id: p.id });
    }
  }
  const order = readingOrder(items, rtl, u);
  const at = order.findIndex((i) => i.kind === 'title');
  const above = at < 0 ? [] : order.slice(0, at);
  const below = at < 0 ? order : order.slice(at + 1);
  // The fill under a text or a picture: the last box painted under it.
  const bands = elements.filter((e) => e.kind === 'box' && hex(e.style.backgroundColor));
  const bandOf = (box: Box): string | undefined => {
    let fill: string | undefined;
    for (const e of bands) {
      const bb = boxes.get(e.id);
      if (bb && e.kind === 'box' && covers(bb, box)) fill = hex(e.style.backgroundColor);
    }
    return fill;
  };
  const slot = b.attrs?.style ?? `L${b.level ?? 1}`;
  // A heading that opens a page keeps the page with what the design prints
  // above it: the break moves to the first of those paragraphs.
  const breaks = level.breakBefore.enabled && above.length > 0;
  const write = (item: Exclude<Item, { kind: 'title' }>, keepNext: boolean, first: ParaProps | undefined): string[] => {
    const band = bandOf(item.box);
    if (item.kind === 'text') {
      const shade = band && (paleOnWhite(hex(item.el.color)) || band !== 'FFFFFF') ? band : undefined;
      return designTextParagraphs(ctx, b, item.el, item.text, designTextStyle(ctx, slot, item.el, shade, keepNext, item.text), first);
    }
    return [picture(ctx, item.id, item.box, band, keepNext, first, geo.heightTw - geo.margins.top - geo.margins.bottom)];
  };
  const out: string[] = [];
  for (const item of above) {
    if (item.kind === 'title') continue;
    out.push(...write(item, true, out.length === 0 && breaks ? { pageBreakBefore: true } : undefined));
  }
  const titleEl = elements.find((e): e is ResolvedDesignTextElement => e.kind === 'text' && printsTitle(e, b.level ?? 1));
  const look: HeadingLook = { noNumber: true, props: breaks ? { pageBreakBefore: false } : undefined };
  if (titleEl) {
    look.style = titleStyle(ctx, slot, b, titleEl, bandOf(boxes.get(titleEl.id) ?? page));
    Object.assign(look, aroundTitle(ctx, b, titleEl, placeholders));
  }
  const head = at < 0 ? hideRuns(heading({ ...look, props: { ...look.props, ...HIDDEN } })) : heading(look);
  out.push(head);
  below.forEach((item) => {
    if (item.kind !== 'title') out.push(...write(item, false, undefined));
  });
  return out.join('');
}

/** A character no title holds, put where the title stands to find what the
 *  element prints around it. */
const MARK = '\uE000';

/** What the title element prints before and after the title (its number,
 *  a separator, a fixed word, an ornament), as generated runs: the
 *  heading paragraph keeps only the title mapped to the source. */
function aroundTitle(ctx: WriterContext, b: ContentBlock, el: ResolvedDesignTextElement, placeholders: DesignPlaceholderContext): Pick<HeadingLook, 'before' | 'after'> {
  const h = placeholders.heading!;
  const marked = { ...placeholders, heading: { ...h, titleText: MARK, chapterTitle: (b.level ?? 1) === 1 ? MARK : h.chapterTitle, ...(h.titleMarked !== undefined ? { titleMarked: MARK } : {}) } };
  const raw = resolveDesignText(el.content ?? '', marked, !!el.inlineMarks);
  const all = el.inlineMarks ? plainDesignText(raw) : raw;
  const at = all.indexOf(MARK);
  if (at < 0) return {};
  const head = all.slice(0, at).replace(/^\s+/, '');
  const tail = all.slice(at + MARK.length).split(MARK).join('').replace(/\s+$/, '');
  const runs = (t: string): (() => string) | undefined => (/[^\s]/u.test(t) ? () => generatedRuns(ctx, [{ text: t }], `design:${el.id}`) : undefined);
  return { before: runs(head), after: runs(tail) };
}

/** The heading paragraph's style under a design: its level's (or style's)
 *  Word heading style with the title element's look over it. */
function titleStyle(ctx: WriterContext, slot: string, b: ContentBlock, el: ResolvedDesignTextElement, band: string | undefined): string {
  const base = ctx.styles.heading(b.level ?? 1, b.attrs?.style);
  const size = fittedSize(ctx, el, b.text);
  return ctx.styles.custom(`title:${slot}:${b.level ?? 1}:${band ?? ''}:${Math.round(size)}`, `Design ${slot} title`, () => {
    const look = designTextLook(ctx, el, band, true, size);
    return { basedOn: base, pPr: { ...look.pPr, outlineLvl: Math.min(8, (b.level ?? 1) - 1) }, rPr: look.rPr };
  });
}

/** A design's picture, as wide as the design draws it (the column at
 *  most) and no taller than about half the text area. */
function picture(ctx: WriterContext, id: string, box: Box, band: string | undefined, keepNext: boolean, first: ParaProps | undefined, textHeightTw: number): string {
  const pic = ctx.media.get(id)!;
  ctx.usedResources.add(id);
  let w = Math.min(ctx.columnPx, box.width > 1 ? box.width : pic.widthPx);
  const maxH = ((textHeightTw * ctx.units.dpi) / 1440) * 0.55;
  if ((w * pic.heightPx) / pic.widthPx > maxH) w = (maxH * pic.widthPx) / pic.heightPx;
  const scaled = { ...pic, widthPx: w, heightPx: (w * pic.heightPx) / pic.widthPx };
  const alt = ctx.resources.get(id)?.altText ?? '';
  return blockSdt(ctx.nextSdtId(), `ptx:design:${id}`, undefined, paragraph({ style: STYLE.figure, shd: band, keepNext: keepNext || undefined, ...first }, pictureRun(ctx, scaled, id, alt, 0)));
}
