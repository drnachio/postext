// One contents entry as the engine sets it (#1444): the number right-
// aligned in a column of the level's `numberWidth`, in its own face and
// colour, the title `numberGap` after it (wrapped lines under the title),
// and the page number at the end of the line in the `pageNumber` face.
// Word's tab stops hold the columns, so an updated field keeps them.

import type { TocBlockInfo } from '../../../parse/types.js';
import type { WriterContext } from '../context.js';
import { halfPoints, hex, px, rPr, textRuns, twips, type ParaProps } from '../wml.js';
import { tocEntryStyle } from './paragraphStyle.js';

export interface TocEntryParts {
  /** The number and the tabs around it (empty for an unnumbered entry). */
  number: string;
  /** Tabs and indents of the entry's paragraph. */
  props: Pick<ParaProps, 'tabs' | 'ind'>;
  /** `w:rPr` of the page number. */
  page: string;
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
  const e = tocEntryStyle(ctx.resolved, info.level);
  const left = (entry.props.ind?.left ?? (e ? twips(u, e.indent, px(u, e.fontSize)) : 0)) + twips(u, sub.indent, size);
  return { style, props: { ind: { left, firstLine: 0 }, after: e ? twips(u, e.marginBottom, px(u, e.fontSize)) : 0 } };
}

/** The parts of a contents entry whose page number ends at `endTwips`. */
export function tocEntryParts(ctx: WriterContext, info: TocBlockInfo, endTwips: number): TocEntryParts {
  const u = ctx.units;
  const r = ctx.resolved;
  const pn = r.toc.pageNumber;
  const page = rPr({ ...ctx.styles.font(pn.fontFamily, pn.fontWeight, pn.italic), i: pn.italic, color: hex(pn.color), sz: halfPoints(u, pn.fontSize) });
  const leader: NonNullable<ParaProps['tabs']>[number] = { val: 'right', pos: endTwips, ...(r.toc.leader.enabled ? { leader: 'dot' as const } : {}) };
  const e = tocEntryStyle(r, info.level);
  if (!e || !info.numbered || !info.number) {
    return { number: '', props: { tabs: [leader] }, page };
  }
  const size = px(u, e.fontSize);
  const indent = twips(u, e.indent, size);
  const column = indent + twips(u, e.numberWidth, size);
  const text = column + twips(u, e.numberGap, size);
  const props = rPr({ ...ctx.styles.font(e.numberFontFamily, e.numberFontWeight), i: false, color: hex(e.numberColor), sz: halfPoints(u, e.numberFontSize) });
  return {
    number: `<w:r><w:tab/></w:r>${textRuns(info.number, props)}<w:r><w:tab/></w:r>`,
    props: { tabs: [{ val: 'right', pos: column }, { val: 'left', pos: text }, leader], ind: { left: text, hanging: text - indent } },
    page,
  };
}
