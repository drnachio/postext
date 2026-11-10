// Running-head elements set in a page margin (#1444): a note beside the
// text area ("Do not write in this margin") and a vertical rule down the
// margin. A header paragraph spans the text area only, so the note goes
// into a frame (`w:framePr`) placed on the page where the engine draws
// it, as wide as its box: Word and LibreOffice place frames; a reader
// without them (Google Docs) sets the frame's paragraph in the header.
// The rule is a picture of its colour, as thin and as tall as the rule,
// drawn behind the text at its place on the page (#1458): as the border of
// an empty frame as tall as the rule, it became a paragraph the height of
// the page in the header of a reader without frames.

import type { ResolvedDesignElement, ResolvedDesignRuleElement } from '../../../types.js';
import type { WriterContext } from '../context.js';
import { groundRun } from '../design/ground.js';
import { hex, paragraph, px, type ParaProps } from '../wml.js';
import { STYLE } from '../styles.js';
import type { PageBox, Target } from './place.js';

/** A page and its height, px. */
export type MarginPage = PageBox & { height: number };

/** An element's box on the page, px. */
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const length = (ctx: WriterContext, v: unknown): number => (v && typeof v === 'object' && 'unit' in v ? px(ctx.units, v as never) : 0);

/** The box of an element anchored to the page by a corner, px; undefined
 *  for any other anchor. */
function pageBox(ctx: WriterContext, el: ResolvedDesignElement, page: MarginPage): Box | undefined {
  const placement = 'placement' in el ? el.placement : undefined;
  const anchor = placement?.anchor;
  if (!anchor || anchor.to !== 'page') return undefined;
  const edge = anchor.edge ?? '';
  const m = /^(top|bottom)-(left|right)$/.exec(edge);
  if (!m) return undefined;
  const width = length(ctx, placement.size?.width);
  const height = length(ctx, placement.size?.height);
  const dx = length(ctx, placement.offset?.x);
  const dy = length(ctx, placement.offset?.y);
  const x = m[2] === 'left' ? dx : page.width + dx - width;
  const y = m[1] === 'top' ? dy : page.height + dy - height;
  return { x, y, width, height };
}

/** Whether a box stands wholly in the left or right margin. */
function inMargin(box: Box, page: MarginPage): boolean {
  const slack = 1;
  return box.x >= page.width - page.margins.right - slack || box.x + box.width <= page.margins.left + slack;
}

const tw = (ctx: WriterContext, v: number): number => Math.max(0, Math.round((v * 1440) / ctx.units.dpi));

/** A paragraph in a frame at `box` on the page. */
function framed(ctx: WriterContext, kind: Target, box: Box, props: ParaProps, content: string, exactHeight: boolean): string {
  const h = exactHeight ? ` w:h="${Math.max(20, tw(ctx, box.height))}" w:hRule="exact"` : '';
  const frame = `<w:framePr w:w="${Math.max(20, tw(ctx, box.width))}"${h} w:wrap="around" w:hAnchor="page" w:vAnchor="page" w:x="${tw(ctx, box.x)}" w:y="${tw(ctx, box.y)}"/>`;
  const style = kind === 'header' ? STYLE.header : STYLE.footer;
  return paragraph({ style, ...props }, content).replace(/(<w:pStyle [^>]*\/>)/, `$1${frame}`);
}

/** The frame of a text element that stands in a margin (`runs`: its
 *  text), or undefined when it stands over the text area. */
export function marginText(ctx: WriterContext, kind: Target, el: ResolvedDesignElement, page: MarginPage, runs: () => string): string | undefined {
  const box = pageBox(ctx, el, page);
  if (!box || box.width <= 0 || !inMargin(box, page)) return undefined;
  const align = 'align' in el ? el.align : 'left';
  const jc = align === 'center' ? 'center' : align === 'right' || align === 'end' ? 'right' : 'left';
  return framed(ctx, kind, box, { before: 0, after: 0, jc, ind: { left: 0, right: 0, firstLine: 0 }, ...(page.rtl ? { bidi: false } : {}) }, runs(), false);
}

/** A vertical rule anchored to the page, as a run that draws it: a
 *  picture of its colour behind the text, for the header's (or footer's)
 *  paragraph to hold. */
export function verticalRule(ctx: WriterContext, el: ResolvedDesignRuleElement, page: MarginPage): string | undefined {
  const box = pageBox(ctx, el, page);
  if (!box || box.height <= 0) return undefined;
  // Half a point at least, so the line shows on screen.
  const width = Math.max(px(ctx.units, el.thickness), (0.5 * ctx.units.dpi) / 72);
  return groundRun(ctx, { fill: hex(el.color) ?? '000000', box: { x: box.x, y: box.y, width, height: box.height } });
}
