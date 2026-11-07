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
import { paleOnWhite } from './ink.js';
import { hex, paragraph, px, textRuns, twips, type ParaProps, type RunProps } from '../wml.js';

const JC: Record<string, ParaProps['jc']> = { left: 'left', right: 'right', center: 'center', justify: 'both', start: 'start', end: 'end' };

/** The paragraph style of a design text element. `slot` names the design
 *  (its heading style, or its level); `band` is the fill of the box the
 *  text is printed on, if any (a pale text on a dark band keeps both). */
export function designTextStyle(ctx: WriterContext, slot: string, el: ResolvedDesignTextElement, band: string | undefined, keepNext: boolean, text: string): string {
  const size = fittedSize(ctx, el, text);
  const key = `design:${slot}:${el.id}:${band ?? ''}:${keepNext ? 'k' : ''}:${Math.round(size)}`;
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
  const ink = paleOnWhite(color) && !band ? undefined : color;
  const lineH = el.lineHeightLength ? px(u, el.lineHeightLength, size) : size * (el.lineHeight || 1.2);
  const rPr: RunProps = {
    ...ctx.styles.font(el.fontFamily, el.fontWeight, el.italic),
    b: el.fontWeight >= 600,
    i: el.italic,
    caps: el.textTransform === 'uppercase' || undefined,
    color: ink,
    spacing: el.letterSpacing ? twips(u, el.letterSpacing, size) || undefined : undefined,
    sz: Math.max(2, Math.round((size * 144) / u.dpi)),
  };
  const pPr: ParaProps = {
    keepNext: keepNext || undefined,
    keepLines: true,
    before: 0,
    after: Math.round(size * 0.35 * (1440 / u.dpi)),
    line: { twips: Math.max(240, Math.round((lineH * 1440) / u.dpi)), rule: 'atLeast' },
    ind: { firstLine: 0 },
    jc: JC[el.align] ?? 'center',
    shd: band,
    suppressAutoHyphens: true,
  };
  return { pPr, rPr };
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
      const runs = ctx.log.wrap(textRuns(piece, ''), f, { block: blockId(ctx), target: { kind: 'markdown', chapter: ctx.chapter.index }, range: [a, z], role: `attr:heading:${key}` });
      out.push(paragraph({ style, ...(out.length ? {} : first) }, runs));
    }
    return out;
  }
  for (const line of text.split('\n')) {
    if (!/[\p{L}\p{N}]/u.test(line)) continue;
    out.push(paragraph({ style, ...(out.length ? {} : first) }, generatedRuns(ctx, [{ text: line.trim() }], `design:${el.id}`)));
  }
  return out;
}
