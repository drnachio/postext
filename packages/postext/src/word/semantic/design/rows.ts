// Texts a design prints side by side on one line (#1444): a masthead's
// weather and price, a date line's issue, date and area, a journal's name
// and section. Written one paragraph each they would stack; here they
// share one paragraph, the first in its own style, each after it in a
// character style of its look, placed by tab stops at their side of the
// line (start, centre or end) as the print sets them.

import type { ResolvedDesignTextElement } from '../../../types.js';
import type { WriterContext } from '../context.js';
import { generatedRuns } from '../generated.js';
import { paragraph, type ParaProps, type RunProps } from '../wml.js';
import type { Box } from './geometry.js';
import { designTextLook, fittedSize } from './text.js';

/** A text of a row: its element, box, paragraph style, and how its
 *  paragraphs are written (called once, in document order). */
export interface RowPart {
  el: ResolvedDesignTextElement;
  box: Box;
  text: string;
  style: string;
  write: (first?: ParaProps) => string[];
  /** The fill it is printed on. */
  band?: string;
}

/** The runs of paragraphs, their properties left out. */
function runsOf(paragraphs: readonly string[]): string {
  return paragraphs.map((xml) => xml.replace(/^<w:p>(?:<w:pPr>(?:(?!<\/w:pPr>)[\s\S])*<\/w:pPr>)?/, '').replace(/<\/w:p>$/, '')).join('');
}

/** Whether two texts read as one line of `lineWidth` px: tops within a
 *  couple of millimetres, each short (well under half the line), and not
 *  printed over each other with the same alignment. */
export function sameLine(ctx: WriterContext, a: { el: ResolvedDesignTextElement; box: Box; text: string }, b: { el: ResolvedDesignTextElement; box: Box; text: string }, lineWidth: number): boolean {
  const u = ctx.units;
  const tol = (2 * u.dpi) / 25.4;
  if (Math.abs(a.box.y - b.box.y) > tol) return false;
  if (a.text.includes('\n') || b.text.includes('\n')) return false;
  const single = (p: typeof a): boolean => [...p.text].length * fittedSize(ctx, p.el, p.text) * 0.55 <= lineWidth * 0.45;
  if (!single(a) || !single(b)) return false;
  const overlap = a.box.x < b.box.x + b.box.width && b.box.x < a.box.x + a.box.width;
  return !overlap || a.el.align !== b.el.align;
}

/** Run styles made so far, per document (their names count them). */
const runStyles = new WeakMap<object, number>();

const lookOf = (ctx: WriterContext, part: RowPart): RunProps => designTextLook(ctx, part.el, part.band, false, fittedSize(ctx, part.el, part.text)).rPr;

/** Run properties Word toggles: a character style's value flips the
 *  paragraph style's rather than setting it. */
const TOGGLES = ['b', 'i', 'caps', 'smallCaps'] as const;

/** A character style with the look of a design text (face, size, weight,
 *  colour, case, tracking) set in a paragraph whose style has the look of
 *  `line`. Bold, italics and capitals toggle what the paragraph style
 *  sets, so the style holds each where the two looks differ. Its name says
 *  nothing of bold or italic: the importer reads run styles so named as
 *  marks. */
function runStyle(ctx: WriterContext, part: RowPart, line: RowPart): string {
  const own = lookOf(ctx, part);
  const base = lookOf(ctx, line);
  const rPr: RunProps = { ...own };
  for (const k of TOGGLES) rPr[k] = !!own[k] !== !!base[k] || undefined;
  return ctx.styles.define(`designRun:${part.style}:${line.style}`, 'PostextDesignRun', 'r', () => {
    const n = (runStyles.get(ctx.styles) ?? 0) + 1;
    runStyles.set(ctx.styles, n);
    return { type: 'character', name: `Postext design run ${n}`, custom: true, rPr };
  });
}

/** `runs` with run style `id` on each run. */
function styled(runs: string, id: string): string {
  return runs.replace(/<w:r>(<w:rPr>)?/g, (_m, open: string | undefined) => `<w:r><w:rPr><w:rStyle w:val="${id}"/>${open ? '' : '</w:rPr>'}`);
}

type Side = 'start' | 'center' | 'end';

/** Which side of the line an element keeps. */
function sideOf(el: ResolvedDesignTextElement, rtl: boolean): Side {
  const a = el.align;
  if (a === 'center') return 'center';
  if (a === 'end' || (a === 'right' && !rtl) || (a === 'left' && rtl)) return 'end';
  return 'start';
}

/**
 * One paragraph for the texts `parts` (in reading order) that print on one
 * line of `frame` (the text area, px), `widthTw` wide in Word. The first
 * text's paragraph style rules the line.
 */
export function rowParagraph(ctx: WriterContext, parts: readonly RowPart[], frame: Box, widthTw: number, rtl: boolean, props: Partial<ParaProps>): string {
  const toTw = (v: number): number => Math.round((v * 1440) / ctx.units.dpi);
  // Distance from the line's start, px.
  const fromStart = (b: Box, side: Side): number => {
    const left = rtl ? frame.x + frame.width - (b.x + b.width) : b.x - frame.x;
    return side === 'start' ? left : side === 'end' ? left + b.width : left + b.width / 2;
  };
  const tabs: NonNullable<ParaProps['tabs']> = [];
  let runs = '';
  parts.forEach((p, i) => {
    const side = sideOf(p.el, rtl);
    const pos = Math.min(widthTw, Math.max(0, side === 'end' && fromStart(p.box, side) >= frame.width - 2 ? widthTw : toTw(fromStart(p.box, side))));
    // A text that does not start the line goes to its tab stop.
    if (i > 0 || side !== 'start' || pos > 0) {
      tabs.push({ val: side === 'start' ? 'left' : side === 'end' ? 'right' : 'center', pos: side === 'end' ? Math.max(pos, 1) : pos });
      runs += generatedRuns(ctx, [{ text: '\t' }], 'design:tab');
    }
    const own = runsOf(p.write());
    runs += i === 0 ? own : styled(own, runStyle(ctx, p, parts[0]!));
  });
  // Tab stops in order; one stop per position.
  const sorted = tabs.sort((a, b) => a.pos - b.pos).filter((t, i, all) => i === 0 || all[i - 1]!.pos !== t.pos);
  return paragraph({ style: parts[0]!.style, ...props, tabs: sorted, jc: 'start' }, runs);
}
