// A heading design's text element as Word paragraphs (#1444): the lead,
// kicker, byline or cover line the design prints, in a paragraph style
// made from the element's face, size, weight, slant, colour, case,
// tracking and alignment. A text that is exactly one `{attr.key}` is the
// heading attribute's value, mapped to its source so an edit in Word lands
// in the attribute; any other text (a template with words of its own, a
// front matter value) is generated text the importer reads as the
// engine's.

import type { ContentBlock } from '../../../parse/types.js';
import type { ResolvedDesignTextElement } from '../../../types.js';
import { abs, blockId, type WriterContext } from '../context.js';
import { FragmentBuilder } from '../fragments.js';
import { generatedRuns } from '../generated.js';
import { attrRange } from '../marks.js';
import { luminance, paleOnWhite } from './ink.js';
import { hex, paragraph, px, textRuns, twips, type ParaProps, type RunProps } from '../wml.js';

const JC: Record<string, ParaProps['jc']> = { left: 'left', right: 'right', center: 'center', justify: 'both', start: 'start', end: 'end' };

/** The paragraph style of a design text element. `slot` names the design
 *  (its heading style, or its level); `band` is the fill of the box the
 *  text is printed on, if any (a pale text on a dark band keeps its ink;
 *  the band itself is the table the paragraph stands in, see bands.ts). */
export function designTextStyle(ctx: WriterContext, slot: string, el: ResolvedDesignTextElement, band: string | undefined, keepNext: boolean, text: string): string {
  const size = fittedSize(ctx, el, text);
  const key = `design:${slot}:${el.id}:${band ?? ''}:${hex(el.color) ?? ''}:${keepNext ? 'k' : ''}:${Math.round(size)}`;
  return ctx.styles.custom(key, `Design ${slot} ${el.id}`, () => designTextLook(ctx, el, band, keepNext, size));
}

/** Rough width of a character in ems: a CJK ideograph or kana is square,
 *  a letter of a display face about 0.6. */
const charEm = (ch: string): number => (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(ch) ? 1 : 0.6);

/** The size, px, a design text is set at in Word: the design's, but small
 *  enough for its longest word to fit the column (a display title in a
 *  narrow column would otherwise break inside its words) and 72 pt at
 *  most. */
export function fittedSize(ctx: WriterContext, el: ResolvedDesignTextElement, text: string): number {
  const u = ctx.units;
  const size = px(u, el.fontSize) || u.basePx;
  const ems = Math.max(1, ...text.split(/\s+/).map((w) => [...w].reduce((n, ch) => n + charEm(ch), 0)));
  return Math.max(1, Math.min(size, (ctx.columnPx * 0.95) / ems, (72 * u.dpi) / 72));
}

/** The paragraph and run look of a design text element set at `size`
 *  px. */
export function designTextLook(ctx: WriterContext, el: ResolvedDesignTextElement, band: string | undefined, keepNext: boolean, size: number): { pPr: ParaProps; rPr: RunProps } {
  const u = ctx.units;
  const color = hex(el.color);
  // Pale ink stays on a band or on the text's own shaded box.
  const box = pill(ctx, el);
  const ink = paleOnWhite(color) && !band && !box.shd ? undefined : color;
  const lineH = el.lineHeightLength ? px(u, el.lineHeightLength, size) : size * (el.lineHeight || 1.2);
  const rPr: RunProps = {
    ...ctx.styles.font(el.fontFamily, el.fontWeight, el.italic),
    b: el.fontWeight >= 600,
    i: el.italic,
    caps: el.textTransform === 'uppercase' || undefined,
    color: ink,
    spacing: el.letterSpacing ? twips(u, el.letterSpacing, size) || undefined : undefined,
    sz: Math.max(2, Math.round((size * 144) / u.dpi)),
    ...box,
  };
  const pPr: ParaProps = {
    keepNext: keepNext || undefined,
    keepLines: true,
    before: 0,
    after: Math.round(size * 0.35 * (1440 / u.dpi)),
    line: lineOf(u, lineH),
    ind: { firstLine: 0 },
    jc: JC[el.align] ?? 'center',
    suppressAutoHyphens: true,
  };
  return { pPr, rPr };
}

/**
 * The line spacing of a design text set at `size` px with lines `lineH`
 * px apart: "at least" the design's distance, so a fallback face taller
 * than the design's still fits. A display title cannot be set tighter
 * than its face's own line in a way every reader honours (#1444): Google
 * Docs has no exact spacing and turns it into a multiple of the text's
 * line (a 72 pt opener numeral became a page tall), and LibreOffice drops
 * the fill of a table cell holding a line set below one line ("auto"
 * under 240), the opener bands. A two-line display title therefore keeps
 * its face's leading.
 */
function lineOf(u: WriterContext['units'], lineH: number): NonNullable<ParaProps['line']> {
  return { twips: Math.max(240, Math.round((lineH * 1440) / u.dpi)), rule: 'atLeast' };
}

/** The fill a text's box shows on the page: none when the box has none,
 *  or when it is as pale as a white page (it would show nothing but an
 *  edge). On a tinted paper a white pill still shows. */
function pillFill(ctx: WriterContext, el: ResolvedDesignTextElement): string | undefined {
  const fill = hex(el.box?.backgroundColor);
  if (!fill) return undefined;
  const c = ctx.resolved.page.backgroundColor;
  const paper = (c && c.hex !== 'transparent' ? hex(c) : undefined) ?? 'FFFFFF';
  const own = luminance(fill);
  return own < 0.85 || Math.abs(own - luminance(paper)) > 0.04 ? fill : undefined;
}

/**
 * A pill printed over a page-filling picture as the paragraph's shading,
 * cut to the words' width by the paragraph's indents (`frameTw` twips
 * wide): LibreOffice draws no run shading over a picture behind the text,
 * a paragraph's it does. Undefined for a text with no fill.
 */
export function pillOnPicture(ctx: WriterContext, el: ResolvedDesignTextElement, text: string, frameTw: number): Partial<ParaProps> | undefined {
  const fill = pillFill(ctx, el);
  if (!fill) return undefined;
  const u = ctx.units;
  const size = fittedSize(ctx, el, text);
  const chars = Math.max(1, ...text.split('\n').map((l) => [...l].length));
  const em = el.textTransform === 'uppercase' ? 0.55 : 0.48;
  const track = el.letterSpacing ? px(u, el.letterSpacing, size) : 0;
  // The words, a space of fill each side and a little to spare.
  const width = Math.round((((chars * (size * em + track)) + size * 1.2) * 1440) / u.dpi);
  const room = Math.max(0, frameTw - width);
  const jc = JC[el.align] ?? 'center';
  const ind = jc === 'center' ? { left: Math.round(room / 2), right: Math.round(room / 2) } : jc === 'right' || jc === 'end' ? { left: room } : { right: room };
  return { shd: fill, ind: { ...ind, firstLine: 0 } };
}

/** The box a text is set in (a chip, a pill, a label tab), as Word draws
 *  a run's: its fill as run shading, its outline as a line round the
 *  characters. */
function pill(ctx: WriterContext, el: ResolvedDesignTextElement): Pick<RunProps, 'shd' | 'bdr'> {
  const fill = pillFill(ctx, el);
  const line = hex(el.box?.borderColor);
  const width = el.box?.borderWidth ? px(ctx.units, el.box.borderWidth) : 0;
  return {
    ...(fill ? { shd: fill } : {}),
    ...(line && width > 0 ? { bdr: { color: line, sz: Math.min(96, Math.max(2, Math.round((width * 72 * 8) / ctx.units.dpi))), space: 1 } } : {}),
  };
}

/** Source range (absolute) of heading `b`'s attribute `key`, when the
 *  Markdown holds its value as the parser read it. */
function attrSource(ctx: WriterContext, b: ContentBlock, key: string): { start: number; end: number } | undefined {
  const md = ctx.chapter.markdown;
  const own = b.attrSources?.[key];
  const value = b.attrs?.[key];
  // The parser's range first, else the heading line read again.
  return [own ? { start: abs(ctx, own.start), end: abs(ctx, own.end) } : undefined, attrRange(md, abs(ctx, b.sourceStart), key)].find(
    (r): r is { start: number; end: number } => !!r && r.end > r.start && md.slice(r.start, r.end) === value,
  );
}

/** `{attr.key}` alone (spaces aside): its key. */
export function soleAttr(content: string): string | undefined {
  return /^\s*\{attr\.([A-Za-z_][A-Za-z0-9_.-]*)\}\s*$/.exec(content)?.[1];
}

/**
 * The paragraphs of a text element whose resolved text is `text`, in
 * paragraph style `style`. A text that is one attribute's value is mapped
 * to it, a paragraph per `\n` in the value; any other is generated, a
 * paragraph per line. `first` goes on the first paragraph (a page break
 * moved up from the heading).
 */
export function designTextParagraphs(ctx: WriterContext, b: ContentBlock, el: ResolvedDesignTextElement, text: string, style: string, first?: ParaProps): string[] {
  const out: string[] = [];
  const key = soleAttr(el.content ?? '');
  const range = key && !el.inlineMarks ? attrSource(ctx, b, key) : undefined;
  // A pill's words keep a space of its fill each side (generated).
  const space = (): string => generatedRuns(ctx, [{ text: '\u00a0' }], 'design:pill');
  // Written in document order, so the map lists the pieces in that order.
  const pad = (make: () => string): string => {
    if (!pillFill(ctx, el)) return make();
    const before = space();
    const runs = make();
    return before + runs + space();
  };
  if (range) {
    const md = ctx.chapter.markdown;
    // A value's `\n` (backslash, n) starts a new line where it is printed.
    let s = range.start;
    const pieces: [number, number][] = [];
    for (let k = range.start; k <= range.end; k++) {
      if (k === range.end || (md[k] === '\\' && md[k + 1] === 'n' && k + 1 < range.end)) {
        pieces.push([s, k]);
        s = k + 2;
        k++;
      }
    }
    for (const [a, z] of pieces) {
      const piece = md.slice(a, z);
      if (!piece.trim()) continue;
      const f = new FragmentBuilder();
      f.push(piece, Array.from({ length: piece.length }, (_, i) => a + i));
      const runs = pad(() => ctx.log.wrap(textRuns(piece, ''), f, { block: blockId(ctx), target: { kind: 'markdown', chapter: ctx.chapter.index }, range: [a, z], role: `attr:heading:${key}` }));
      out.push(paragraph({ style, ...(out.length ? {} : first) }, runs));
    }
    return out;
  }
  for (const line of text.split('\n')) {
    if (!/[\p{L}\p{N}\p{So}]/u.test(line)) continue;
    out.push(paragraph({ style, ...(out.length ? {} : first) }, pad(() => generatedRuns(ctx, [{ text: line.trim() }], `design:${el.id}`))));
  }
  return out;
}
