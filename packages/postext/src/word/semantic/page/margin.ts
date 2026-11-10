// Running-head elements set in a page margin (#1444): a note beside the
// text area ("Do not write in this margin") and a vertical rule down the
// margin. A header paragraph spans the text area only, so each goes into
// a frame (`w:framePr`) placed on the page where the engine draws it: a
// text in a frame as wide as its box, a rule as the left border of an
// empty frame as tall as the rule. Word and LibreOffice place frames;
// a reader without them sets the frame's paragraph in the header.

import type { ResolvedDesignElement, ResolvedDesignRuleElement } from '../../../types.js';
import type { WriterContext } from '../context.js';
import { eighths, hex, paragraph, px, type ParaProps } from '../wml.js';
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

/** The frame of a vertical rule anchored to the page: an empty paragraph
 *  as tall as the rule, its left border the line. */
export function verticalRule(ctx: WriterContext, kind: Target, el: ResolvedDesignRuleElement, page: MarginPage): string | undefined {
  const box = pageBox(ctx, el, page);
  if (!box || box.height <= 0) return undefined;
  const line = { color: hex(el.color) ?? '000000', sz: Math.max(2, Math.min(eighths(ctx.units, el.thickness), 48)), space: 0 };
  const height = tw(ctx, box.height);
  const props: ParaProps = { before: 0, after: 0, line: { twips: Math.max(20, height), rule: 'exact' }, ind: { left: 0, right: 0, firstLine: 0 }, border: { left: line } };
  return framed(ctx, kind, { ...box, width: Math.max(box.width, (2 * ctx.units.dpi) / 72) }, props, '', true);
}
