// One contents entry as the engine sets it (#1444): the number right-
// aligned in a column of the level's `numberWidth`, in its own face and
// colour, the title `numberGap` after it (wrapped lines under the title),
// and the page number at the end of the line in the `pageNumber` face.
// The level's TOC N style holds the same tab stops (paragraphStyle.ts),
// so the columns outlast a field update where every entry of the level is
// numbered; the page-number tab and its leader outlast it always.

import type { ContentBlock, TocBlockInfo } from '../../../parse/types.js';
import type { ResolvedDesignTextElement } from '../../../types.js';
import { paleOnWhite } from '../design/ink.js';
import { inPartColors } from '../design/partColor.js';
import { designTextLook } from '../design/text.js';
import type { WriterContext } from '../context.js';
import { halfPoints, hex, px, rPr, textRuns, twips, type ParaProps, type RunProps } from '../wml.js';
import { tocColumns, tocEntryLook, tocEntryStyle, tocPageTab, tocTitleOverride } from './paragraphStyle.js';

export interface TocEntryParts {
  /** The number and the tabs around it (empty for an unnumbered entry). */
  number: string;
  /** Tabs and indents of the entry's paragraph. */
  props: Pick<ParaProps, 'tabs' | 'ind'>;
  /** `w:rPr` of the page number. */
  page: string;
  /** The run properties of the title, when the entry's look is not its
   *  level style's (an unnumbered entry: `toc.unnumbered`). */
  title?: RunProps;
  /** Space around the entry when it is not its level style's. */
  space?: Pick<ParaProps, 'before' | 'after'>;
}

/** The line under an entry that holds its subtitle (`{author}`), in the
 *  contents' subtitle face, under the entry's title: its style and the
 *  space after it, which is the entry's (the entry's own line then keeps
 *  none). */
export function tocSubtitleLine(ctx: WriterContext, info: TocBlockInfo, entry: TocEntryParts): { style: string; props: Pick<ParaProps, 'ind' | 'after'> } {
  const u = ctx.units;
  const sub = ctx.resolved.toc.subtitle;
  const size = px(u, sub.fontSize);
  const style = ctx.styles.custom('toc:subtitle', 'TOC subtitle', () => ({
    pPr: { keepLines: true, before: 0, after: 0, ind: { firstLine: 0 }, jc: 'left' },
    rPr: { ...ctx.styles.font(sub.fontFamily, sub.fontWeight, sub.italic), i: sub.italic, color: hex(sub.color), sz: halfPoints(u, sub.fontSize) },
  }));
  const e = tocEntryLook(ctx.resolved, info.level, Boolean(info.numbered && info.number));
  const left = (entry.props.ind?.left ?? (e ? twips(u, e.indent, px(u, e.fontSize)) : 0)) + twips(u, sub.indent, size);
  return { style, props: { ind: { left, firstLine: 0 }, after: e ? twips(u, e.marginBottom, px(u, e.fontSize)) : 0 } };
}

/** The parts of a contents entry whose page number ends at `endTwips`. */
export function tocEntryParts(ctx: WriterContext, info: TocBlockInfo, endTwips: number): TocEntryParts {
  const u = ctx.units;
  const r = ctx.resolved;
  const pn = r.toc.pageNumber;
  const page = rPr({ ...ctx.styles.font(pn.fontFamily, pn.fontWeight, pn.italic), i: pn.italic, color: hex(pn.color), sz: halfPoints(u, pn.fontSize) });
  const leader = tocPageTab(r, endTwips);
  const numbered = Boolean(info.numbered && info.number);
  const base = tocEntryStyle(r, info.level);
  const e = tocEntryLook(r, info.level, numbered);
  if (!e || !base) return { number: '', props: { tabs: [leader] }, page };
  // An unnumbered entry keeps the level's indent but takes the config's
  // unnumbered face and spacing on top of the level's (as the engine).
  const size = px(u, e.fontSize);
  const title = numbered ? undefined : tocTitleOverride(u, ctx.styles.font.bind(ctx.styles), base, e);
  const space = numbered || (e.marginTop === base.marginTop && e.marginBottom === base.marginBottom)
    ? undefined
    : { before: twips(u, e.marginTop, size), after: twips(u, e.marginBottom, size) };
  const cols = tocColumns(u, e);
  if (!numbered) return { number: '', props: { tabs: [leader], ind: { left: cols.indent, firstLine: 0 } }, page, title, space };
  const props = rPr({ ...ctx.styles.font(e.numberFontFamily, e.numberFontWeight), i: false, color: hex(e.numberColor), sz: halfPoints(u, e.numberFontSize) });
  return {
    number: `<w:r><w:tab/></w:r>${textRuns(info.number, props)}<w:r><w:tab/></w:r>`,
    props: { tabs: [{ val: 'right', pos: cols.column }, { val: 'left', pos: cols.text }, leader], ind: { left: cols.text, hanging: cols.text - cols.indent } },
    page,
  };
}

/** The style of a part row in the contents ("I Solar System"): the body
 *  face, as the engine sets the row's text, with the row's margins, kept
 *  with the entries under it. Not a TOC N level, so the row keeps its own
 *  look and none of the entries' (#1444). */
export function tocPartStyle(ctx: WriterContext): string {
  return ctx.styles.custom('toc:part', 'TOC part', () => {
    const u = ctx.units;
    const p = ctx.resolved.toc.parts;
    return {
      pPr: { keepNext: true, keepLines: true, before: twips(u, p.marginTop, ctx.styles.bodyPx), after: twips(u, p.marginBottom, ctx.styles.bodyPx), ind: { left: 0, firstLine: 0 }, jc: 'left' },
    };
  });
}

/**
 * A part row of the contents as its design prints it (#1458): the words of
 * the row's text element ("Part I · Foundations") in its face, case,
 * tracking and colour, after a square of the row's small filled box, both
 * in the part's own palette. Undefined when the row has no design: the
 * caller sets the number and the title in bold.
 */
export function tocPartRuns(ctx: WriterContext, number: string, title: string): string | undefined {
  if (ctx.plain) return undefined;
  const design = ctx.resolved.toc.parts.design;
  const text = design?.elements.find((el): el is ResolvedDesignTextElement => el.kind === 'text' && /\{(?:titleText|number)/.test(el.content ?? ''));
  if (!design || !text) return undefined;
  // The part's palette: its fence's, found by its number and title.
  let fence: ContentBlock | undefined;
  for (const ch of ctx.book) fence ??= ch.blocks.find((b) => b.type === 'containerStart' && b.containerName === 'part' && (b.containerAttrs?.number ?? '') === number && (b.containerAttrs?.title ?? '') === title);
  const elements = fence ? inPartColors(ctx, fence, [...design.elements]) : design.elements;
  const el = elements.find((e) => e.id === text.id) as ResolvedDesignTextElement;
  const words = (el.content ?? '')
    .replace(/\{number[A-Za-z]*\}/g, number)
    .replace(/\{titleText\}/g, title)
    .replace(/\{[^{}]*\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!words) return undefined;
  const u = ctx.units;
  const size = px(u, el.fontSize) || ctx.styles.bodyPx;
  const look = designTextLook(ctx, el, undefined, false, size).rPr;
  // A small filled box before the text: a square in its colour.
  const box = elements.find((e) => e.kind === 'box' && hex(e.style.backgroundColor));
  const fill = box && box.kind === 'box' ? hex(box.style.backgroundColor) : undefined;
  const square = fill && !paleOnWhite(fill) ? textRuns('\u25A0\u2002', rPr({ color: fill, sz: look.sz })) : '';
  return square + textRuns(words, rPr(look));
}
