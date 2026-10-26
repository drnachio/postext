// Contents blocks: group rows, the room a group needs, continuation heads
// and their warnings.
// Part of the placement pass (pass.ts), split out of it in #1276.
import { isMarkerBlock } from '../../buildHelpers.js';
import { measureContentBlock, type BlockMeasureContext } from '../../measureContentBlock.js';
import { currentColumn, FIT_EPS, advanceToNextColumn, type PlacementCursor } from '../../placement.js';
import type { ContentWarning, VDTBlock, VDTColumn, VDTDocument, VDTPage } from '../../../vdt.js';
import type { ContentBlock } from '../../../parse/index.js';
import type { BlockStyle } from '../../styles.js';
import type { HeadingClaim } from '../passTypes.js';
import type { PassState } from './state.js';

/** What createToc takes from the pass. */
export interface TocDeps {
  doc: VDTDocument;
  pageWidthPx: number;
  pageHeightPx: number;
  bodyOffset: number;
  contentBlocks: ContentBlock[];
  bodyStyle: BlockStyle;
  onNewPage: (page: VDTPage) => void;
  cursor: PlacementCursor;
  forcedBreakPages: Set<number>;
  headingClaims: Map<VDTBlock, HeadingClaim>;
  measureCtxOf: (idx: number) => BlockMeasureContext;
  state: PassState;
}

export function createToc(deps: TocDeps) {
  const {
    doc, pageWidthPx, pageHeightPx, bodyOffset, contentBlocks, bodyStyle, onNewPage, cursor,
    forcedBreakPages, headingClaims, measureCtxOf, state
  } = deps;
  /** The rows of the contents block whose lead row is `idx`, in order (its
   *  head's repeats aside). */
  const tocGroupRows = (idx: number): number[] => {
    const id = contentBlocks[idx]?.toc?.group?.id;
    const rows: number[] = [];
    if (id === undefined) return rows;
    for (let i = idx; i < contentBlocks.length; i++) {
      const b = contentBlocks[i]!;
      if (isMarkerBlock(b)) continue;
      if (b.toc?.group?.id !== id) break;
      if (b.toc.group.role !== 'continuation') rows.push(i);
    }
    return rows;
  };
  /**
   * The room the contents block led by row `idx` takes in a column `width`
   * wide, from the top of its first row (the space above it aside): `whole`
   * for every row, `lead` down to the `minEntries`-th entry under its head
   * (the least a cut block keeps with its head). The rows are spaced as
   * the layout spaces them, by the larger of the margins that meet.
   */
  const tocGroupNeed = (idx: number, width: number): { whole: number; lead: number } | undefined => {
    const rows = tocGroupRows(idx);
    if (rows.length < 2) return undefined;
    const min = contentBlocks[idx]!.toc!.group!.minEntries;
    let height = 0;
    let lead = 0;
    let prevBottom: number | undefined;
    let afterHead = -1;
    for (const i of rows) {
      const raw = contentBlocks[i]!;
      const m = measureContentBlock(raw, i, width, measureCtxOf(i));
      if (!m) return undefined;
      const style = m.kind.style;
      if (prevBottom !== undefined) height += Math.max(prevBottom, style.marginTopPx);
      height += m.measured.lines.length * style.lineHeightPx;
      prevBottom = style.marginBottomPx;
      if (raw.toc!.group!.role === 'head') afterHead = 0;
      else if (afterHead >= 0 && raw.toc!.kind === 'entry') afterHead++;
      if (afterHead >= 0 && afterHead <= min) lead = height;
    }
    return { whole: height, lead };
  };
  /**
   * Whether the repeat of a contents block's head row at `idx` is set: the
   * entry after it goes on in a fresh column, which the repeat opens. When
   * the entry does not fit in the room the cursor's column has left (an
   * entry is not cut between columns once its block is), the cursor moves
   * on to the next column first.
   */
  const tocContinuationOpens = (idx: number): boolean => {
    let next = idx + 1;
    while (next < contentBlocks.length && isMarkerBlock(contentBlocks[next])) next++;
    const entry = contentBlocks[next];
    if (entry?.toc?.group?.id !== contentBlocks[idx]!.toc!.group!.id) return false;
    const col = currentColumn(doc, cursor);
    if (col.blocks.length === 0) return true;
    const m = measureContentBlock(entry, next, col.bbox.width, measureCtxOf(next));
    if (!m) return false;
    const style = m.kind.style;
    const need = m.measured.lines.length * style.lineHeightPx + Math.max(state.pendingSpacing, style.marginTopPx);
    if (need <= col.availableHeight + FIT_EPS) return false;
    state.pendingSpacing = 0;
    advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
    return true;
  };
  /** A `headingClaimsColumn` warning (#997) for each in-column heading
   *  whose design left its column no room for a line and that the text
   *  after it did not follow: the next block opens a later column or page,
   *  and nothing explicit (`:::pagebreak`, a `breakBefore`, a column break)
   *  sent it there. A page-span opener claims its page on purpose and is
   *  not noted, nor is a heading on a page of one text column (there the
   *  column is the page: a cover). */
  const headingClaimWarnings = (): ContentWarning[] => {
    if (headingClaims.size === 0) return [];
    const order: { blk: VDTBlock; page: number; col: VDTColumn }[] = [];
    for (const page of doc.pages) {
      for (const col of page.columns) {
        if (col.kind === 'side') continue;
        for (const blk of col.blocks) order.push({ blk, page: page.index, col });
      }
    }
    const out: ContentWarning[] = [];
    order.forEach((at, i) => {
      const claim = headingClaims.get(at.blk);
      if (!claim || at.col.blocks[at.col.blocks.length - 1] !== at.blk) return;
      // On a page with one column of text the column is the page: a design
      // that fills it is a cover, as a page-span opener is.
      if (doc.pages[at.page]!.columns.filter((c) => c.kind === undefined || c.kind === 'text').length <= 1) return;
      // The design left room for a line: the column was not claimed.
      if (at.col.availableHeight >= bodyStyle.lineHeightPx - 0.01) return;
      if (at.col.forcedBreak) return;
      const next = order[i + 1];
      if (!next || next.col === at.col) return;
      // The page closed by an explicit break (a pagebreak, a heading that
      // opens its own page): the text did not move on because of the design.
      if (next.page !== at.page && forcedBreakPages.has(at.page)) return;
      out.push({
        kind: 'headingClaimsColumn',
        level: at.blk.headingLevel ?? 1,
        ...(claim.element !== undefined ? { element: claim.element } : {}),
        ...(at.blk.sourceStart !== undefined ? { sourceStart: at.blk.sourceStart } : {}),
        ...(at.blk.sourceEnd !== undefined ? { sourceEnd: at.blk.sourceEnd } : {}),
        pageIndex: at.page,
      });
    });
    return out;
  };

  /** A `tocGroupSplit` warning for each contents block set in more than
   *  one column, with its head's title and the page it is cut on. */
  const tocGroupWarnings = (): ContentWarning[] => {
    const placed = new Map<number, { title: string; columns: Set<string>; pageIndex: number; source: ContentBlock }>();
    for (const page of doc.pages) {
      for (const c of page.columns) {
        for (const b of c.blocks) {
          const raw = b.contentIndex !== undefined ? contentBlocks[b.contentIndex] : undefined;
          const group = raw?.toc?.group;
          if (!raw || !group || group.role === 'continuation') continue;
          const at = placed.get(group.id) ?? { title: group.title, columns: new Set<string>(), pageIndex: page.index, source: raw };
          at.columns.add(`${page.index}:${c.index}`);
          placed.set(group.id, at);
        }
      }
    }
    const out: ContentWarning[] = [];
    for (const at of placed.values()) {
      if (at.columns.size < 2) continue;
      out.push({
        kind: 'tocGroupSplit',
        title: at.title,
        columns: at.columns.size,
        sourceStart: at.source.sourceStart + bodyOffset,
        sourceEnd: at.source.sourceEnd + bodyOffset,
        pageIndex: at.pageIndex,
      });
    }
    return out;
  };
  return {
    tocGroupNeed, tocContinuationOpens, headingClaimWarnings, tocGroupWarnings
  };
}
