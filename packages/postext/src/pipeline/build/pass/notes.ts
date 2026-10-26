// Footnotes and sidenotes: their measures, the room the flow reserves for
// them, chapter-end notes and setting them in their columns.
// Part of the placement pass (pass.ts), split out of it in #1276.
import { type DropCapNote, type BlockMeasureContext, type MeasuredContentBlock, measureContentBlock } from '../../measureContentBlock.js';
import { resolveParagraphStyle, type BlockStyle } from '../../styles.js';
import { footnoteParagraphStyle, noteContentBlock, noteNumberPositionOf, footnoteIdsOfLines, type FootnoteNumbering } from '../../footnotes.js';
import { dimensionToPx } from '../../../units.js';
import { type VDTColumn, type VDTPage, type VDTLine, type VDTBlock, createBoundingBox, createVDTBlock, type ResolvedConfig, type VDTDocument } from '../../../vdt.js';
import { createPageWithColumns, resetLinePositions, type PlacementCursor } from '../../placement.js';
import { trueBottom } from '../../floatSlots.js';
import { applyStyleAttrs } from '../../buildHelpers.js';
import { raggedLooseLines } from '../../raggedLines.js';
import { resolvedDirection } from '../../config.js';
import type { MeasurementCache } from '../../../measure/index.js';
import type { HeadingLevelResolver } from '../../headingStyles.js';
import type { CaptionCitations } from '../../citations.js';
import type { ContentBlock } from '../../../parse/index.js';
import type { AnchorRefContext } from '../../resourceLayout.js';
import type { Resource, ResourceType } from '../../../types.js';
import type { ResourceNumberingMap } from '../../resourceNumbering.js';
import type { OrderedListMetrics } from '../../lists.js';
import type { PassState } from './state.js';

/** What createNotes takes from the pass. */
export interface NotesDeps {
  cache: MeasurementCache | undefined;
  resolved: ResolvedConfig;
  headingLevels: HeadingLevelResolver;
  dpi: number;
  doc: VDTDocument;
  pageIndexOffset: number;
  pageWidthPx: number;
  pageHeightPx: number;
  markdownBody: string;
  bodyOffset: number;
  captionCitations: Map<string, CaptionCitations> | undefined;
  footnoteDefs: Map<string, ContentBlock>;
  footnoteNumbering: FootnoteNumbering;
  anchorRefContext: AnchorRefContext | undefined;
  contentBlocks: ContentBlock[];
  headingPrefixes: (string | undefined)[];
  headingNumbers: (number | undefined)[];
  resources: Resource[];
  resourceTypes: ResourceType[];
  resourceNumbering: ResourceNumberingMap;
  resourceById: Map<string, Resource>;
  resourceTypeById: Map<string, ResourceType>;
  resourceNumberById: Map<string, string>;
  bodyStyle: BlockStyle;
  blockquoteStyle: BlockStyle;
  listLevelIndentsPx: number[];
  orderedMetrics: OrderedListMetrics;
  orderedLevelIndentsPx: number[];
  floatedIds: Set<string>;
  cursor: PlacementCursor;
  uncappedBottoms: Map<VDTColumn, number>;
  state: PassState;
}

export function createNotes(deps: NotesDeps) {
  const {
    cache, resolved, headingLevels, dpi, doc, pageIndexOffset, pageWidthPx, pageHeightPx,
    markdownBody, bodyOffset, captionCitations, footnoteDefs, footnoteNumbering, anchorRefContext,
    contentBlocks, headingPrefixes, headingNumbers, resources, resourceTypes, resourceNumbering,
    resourceById, resourceTypeById, resourceNumberById, bodyStyle, blockquoteStyle,
    listLevelIndentsPx, orderedMetrics, orderedLevelIndentsPx, floatedIds, cursor, uncappedBottoms,
    state
  } = deps;
  /** Boxes that left the flow this pass (side column, float band, fixed),
   *  by the content index of their opening marker (see `leftFlow`). */
  const calloutsOutOfFlow = new Set<number>();
  /** Blocks whose style tracks text of a joining script, which is set
   *  untracked (see `BlockMeasureContext.joiningLetterSpacing`). */
  const joiningLetterSpacing = new Set<number>();
  /** Paragraphs whose drop cap could not be set as configured (#623). */
  const dropCapNotes = new Map<number, DropCapNote>();
  // Everything per-block measurement needs that is constant for this pass.
  const measureCtx: BlockMeasureContext = {
    resolved,
    headingLevels,
    bodyStyle,
    blockquoteStyle,
    headingPrefixes,
    headingNumbers,
    listLevelIndentsPx,
    orderedLevelIndentsPx,
    orderedMetrics,
    resourceById,
    resourceTypeById,
    resourceNumberById,
    contentBlocks,
    cache,
    bodyOffset,
    source: markdownBody,
    resources,
    resourceTypes,
    resourceNumbering,
    ...(captionCitations ? { captionCitations } : {}),
    floatedIds,
    leftFlow: calloutsOutOfFlow,
    joiningLetterSpacing,
    dropCapNotes,
    ...(footnoteNumbering.numbers.size > 0 ? { footnoteNumbers: footnoteNumbering.numbers } : {}),
    ...(anchorRefContext ? { anchorRefs: anchorRefContext } : {}),
  };

  // --- Footnotes at the column foot (`footnotes.placement: 'column'`) ------
  // A text block placed in a column reserves, at the column's foot, the
  // notes its lines cite for the first time: the column's box shrinks by
  // their height (as a bottom float band shrinks it), so the text above
  // keeps its positions and the grid. The flow counts that height before it
  // places lines (`notesPrefixCost`), so the line citing a note and the note
  // share a column. The notes are set in their reserved room once the pass
  // is placed (`setColumnNotes`).
  //
  // Sidenotes on the spread (`placement: 'spread'`, 傍注, JLReq §4.2.6; a
  // vertical document's: a horizontal one resolves to `'column'`) use the
  // same room, at the foot of the flow, which on a vertical page is its
  // left end, the fore edge of a right-bound book's odd page. A spread is
  // an even book page and the odd page after it. The notes cited on the
  // odd page are reserved there as column notes; the ones cited on the
  // even page wait for the odd page (`spreadDeferred`) and are reserved at
  // the foot of its first column of text before anything it cites. A note
  // that would leave the odd page without room for a line of its own text
  // stays on the even page, at its foot (the overflow JLReq sends there);
  // a line on the odd page whose notes no longer fit moves on, as any
  // line with column notes does, to the next spread.
  const spreadNotes = resolved.footnotes.placement === 'spread' && footnoteNumbering.numbers.size > 0;
  const columnNotes = (resolved.footnotes.placement === 'column' || spreadNotes) && footnoteNumbering.numbers.size > 0;
  const noteStyle = columnNotes ? resolveParagraphStyle(footnoteParagraphStyle(resolved), resolved) : bodyStyle;
  const noteSpaceAbovePx = dimensionToPx(resolved.footnotes.spaceAbove, dpi, bodyStyle.fontSizePx);
  const noteSpaceBelowRulePx = dimensionToPx(resolved.footnotes.spaceBelowRule, dpi, bodyStyle.fontSizePx);
  const noteRulePx = resolved.footnotes.separator.enabled ? dimensionToPx(resolved.footnotes.separator.lineWidth, dpi) : 0;
  /** The separator zone above a column's first note. */
  const noteHeadPx = noteSpaceAbovePx + noteRulePx + noteSpaceBelowRulePx;
  /** Space between two notes. */
  const noteGapPx = Math.max(0, noteStyle.marginBottomPx);
  /** Notes set (reserved) in this pass: a note is set once, where it is
   *  first cited. */
  const placedNotes = new Set<string>();
  const noteMeasures = new Map<string, MeasuredContentBlock | null>();
  const measureNote = (id: string, width: number): MeasuredContentBlock | null => {
    const key = `${id}@${width.toFixed(2)}`;
    let m = noteMeasures.get(key);
    if (m === undefined) {
      const number = footnoteNumbering.numbers.get(id) ?? '?';
      m = measureContentBlock(noteContentBlock(footnoteDefs.get(id), id, number, noteNumberPositionOf(resolved.footnotes, resolved.layout.writingMode === 'vertical-rl'), resolved.footnotes.numberGap), 0, width, measureCtx, { styleOverride: noteStyle });
      noteMeasures.set(key, m);
    }
    return m;
  };
  const noteHeight = (id: string, width: number): number =>
    Math.max(1, measureNote(id, width)?.measured.lines.length ?? 1) * noteStyle.lineHeightPx;
  /** The notes of a column: ids in order, and the room reserved for them,
   *  one slot per reservation (page coordinates). */
  const columnNotesOf = new Map<VDTColumn, { ids: string[]; slots: { top: number; height: number; ids: string[] }[] }>();
  const columnOfNotes = new Map<VDTColumn, VDTPage>();
  /** Height `ids` (not yet set) add to `col`'s foot: the separator zone
   *  when the column has no note yet, the notes and the gaps between. */
  const notesCost = (col: VDTColumn, ids: readonly string[]): number => {
    if (ids.length === 0) return 0;
    const first = !columnNotesOf.has(col);
    let h = first ? noteHeadPx : 0;
    ids.forEach((id, i) => {
      if (!first || i > 0) h += noteGapPx;
      h += noteHeight(id, col.bbox.width);
    });
    return h;
  };
  /** Sidenotes cited on the even page of a spread, waiting for its odd
   *  page (`spreadDeferredPage`, a page index) or the first page after it
   *  the flow sets text on. */
  const spreadDeferred: string[] = [];
  let spreadDeferredPage = -1;
  /** Notes cited by blocks set outside the flow (the paragraphs of a box,
   *  inline, floated or fixed): they wait for the next text the flow
   *  places, and go to the foot of its column, in citation order. */
  const pendingNotes: string[] = [];
  /** How far `doc.blocks` was read for such citations. */
  let notesScanned = 0;
  const collectPendingNotes = (): void => {
    for (; notesScanned < doc.blocks.length; notesScanned++) {
      for (const id of footnoteIdsOfLines(doc.blocks[notesScanned]!.lines)) {
        if (!placedNotes.has(id) && !pendingNotes.includes(id) && !spreadDeferred.includes(id)) pendingNotes.push(id);
      }
    }
  };
  /** Whether the page at `pageIndex` opens its spread (an even book page),
   *  so the notes it cites go to the next page. */
  const opensSpread = (pageIndex: number): boolean => spreadNotes && (pageIndex + pageIndexOffset + 1) % 2 === 0;
  /** The sidenotes waiting for the page at `pageIndex`, if any. */
  const deferredFor = (pageIndex: number): string[] => (spreadDeferred.length > 0 && pageIndex >= spreadDeferredPage ? spreadDeferred : []);
  /** Height `ids` take at the foot of a column of `width` with no note
   *  yet: the separator zone, the notes and the gaps between. */
  const freshNotesCost = (ids: readonly string[], width: number): number => {
    let h = ids.length > 0 ? noteHeadPx : 0;
    ids.forEach((id, i) => { h += (i > 0 ? noteGapPx : 0) + noteHeight(id, width); });
    return h;
  };
  /** On the even page of a spread (`pageIndex`), `col` holding the text:
   *  which of `ids` (cited there, in order) wait for the odd page and which
   *  stay at this column's foot. Each waits while the notes waiting with it
   *  leave the odd page room for a line of text — measured on this column,
   *  which the odd page's matches; a note that does not stays here, and so
   *  do the ones after it. */
  const splitSpreadNotes = (pageIndex: number, col: VDTColumn, ids: readonly string[]): { wait: string[]; here: string[] } => {
    const already = spreadDeferredPage > pageIndex ? spreadDeferred : [];
    const wait = [...already];
    const here: string[] = [];
    const room = col.bbox.height + reservedHeight(col) - bodyStyle.lineHeightPx;
    for (const id of ids) {
      if (here.length === 0 && freshNotesCost([...wait, id], col.bbox.width) <= room + 0.01) wait.push(id);
      else here.push(id);
    }
    return { wait: wait.slice(already.length), here };
  };
  /** What the notes reserved at `col`'s foot took from it. */
  const reservedHeight = (col: VDTColumn): number => {
    const entry = columnNotesOf.get(col);
    return entry ? entry.slots.reduce((h, slot) => h + slot.height, 0) : 0;
  };
  /** `cost[k]`: the notes the first `k` of `lines` cite for the first time
   *  (after the pending ones) would add to `col`'s foot. Undefined when
   *  there are none. */
  const notesPrefixCost = (col: VDTColumn, lines: readonly VDTLine[]): number[] | undefined => {
    if (!columnNotes) return undefined;
    collectPendingNotes();
    const page = cursor.pageIndex;
    // Sidenotes waiting for this page are set first; on the even page of a
    // spread only the notes that stay on it cost room.
    const waiting = deferredFor(page);
    const ids: string[] = [...pendingNotes];
    let any = ids.length > 0 || waiting.length > 0;
    const even = opensSpread(page);
    // In a column a band cap cut, the notes are set under the cut, at the
    // column's true foot (`reserveNotes`): they cost the lines above the
    // cut only what reaches over it (#673). Charged whole, a paragraph
    // that cites a note and runs to the cut gave up the note's height
    // there, and a closing band ended that many lines short in the column
    // with the note.
    const cappedBottom = uncappedBottoms.get(col);
    const underCut = cappedBottom === undefined ? 0 : Math.max(0, cappedBottom - (col.bbox.y + col.bbox.height));
    const costOf = (): number => Math.max(0, notesCost(col, [...waiting, ...(even ? splitSpreadNotes(page, col, ids).here : ids)]) - underCut);
    const cost = [costOf()];
    for (const line of lines) {
      for (const seg of line.segments ?? []) {
        const id = seg.footnoteId;
        if (id !== undefined && !placedNotes.has(id) && !ids.includes(id) && !spreadDeferred.includes(id)) { ids.push(id); any = true; }
      }
      cost.push(costOf());
    }
    return any ? cost : undefined;
  };
  /** Reserve at the placed block's column foot the pending notes and the
   *  ones the block cites first (sidenotes: the ones waiting for this
   *  page first; on the even page of a spread, only the ones that stay). */
  const reserveCitedNotes = (placed: VDTBlock): void => {
    if (!columnNotes || placed.pageIndex < 0) return;
    collectPendingNotes();
    const waiting = deferredFor(placed.pageIndex);
    const cited = footnoteIdsOfLines(placed.lines).filter((id) => !placedNotes.has(id) && !pendingNotes.includes(id) && !spreadDeferred.includes(id));
    if (cited.length === 0 && pendingNotes.length === 0 && waiting.length === 0) return;
    const page = doc.pages[placed.pageIndex];
    const col = page?.columns[placed.columnIndex];
    if (!page || !col) return;
    const anchor = placed.contentIndex ?? 0;
    if (waiting.length > 0) reserveNotes(page, col, spreadDeferred.splice(0), anchor);
    const ids = [...pendingNotes.splice(0), ...cited];
    if (opensSpread(placed.pageIndex)) {
      const { wait, here } = splitSpreadNotes(placed.pageIndex, col, ids);
      spreadDeferred.push(...wait);
      spreadDeferredPage = placed.pageIndex + 1;
      if (here.length > 0) reserveNotes(page, col, here, anchor);
      return;
    }
    if (ids.length > 0) reserveNotes(page, col, ids, anchor);
  };
  /** Reserve `ids` at `col`'s foot. */
  const reserveNotes = (page: VDTPage, col: VDTColumn, ids: string[], anchor: number): void => {
    const h = notesCost(col, ids);
    let bottom: number;
    const capped = uncappedBottoms.get(col);
    if (capped !== undefined) {
      // A column a band cap cut: the notes go under the cut, at the true
      // foot, as a bottom float does; the cut moves up only when they reach
      // above it.
      bottom = capped;
      uncappedBottoms.set(col, capped - h);
      const overlap = col.bbox.y + col.bbox.height - (capped - h);
      if (overlap > 0) {
        col.bbox.height = Math.max(0, col.bbox.height - overlap);
        col.availableHeight = Math.max(0, col.availableHeight - overlap);
      }
    } else {
      bottom = col.bbox.y + col.bbox.height;
      col.bbox.height = Math.max(0, col.bbox.height - h);
      col.availableHeight = Math.max(0, col.availableHeight - h);
    }
    let entry = columnNotesOf.get(col);
    if (!entry) {
      entry = { ids: [], slots: [] };
      columnNotesOf.set(col, entry);
      columnOfNotes.set(col, page);
    }
    entry.ids.push(...ids);
    entry.slots.push({ top: bottom - h, height: h, ids });
    for (const id of ids) placedNotes.add(id);
    for (const id of ids) noteAnchor.set(id, anchor);
  };
  /** Notes still pending when the flow ends (a box closes the document):
   *  the foot of the column the flow ended in takes them. */
  const reserveLeftoverNotes = (): void => {
    if (!columnNotes) return;
    collectPendingNotes();
    reserveLeftoverSidenotes();
    if (pendingNotes.length === 0) return;
    const page = doc.pages[cursor.pageIndex];
    const col = page?.columns[cursor.columnIndex];
    if (page && col) reserveNotes(page, col, pendingNotes.splice(0), contentBlocks.length - 1);
  };
  /** Sidenotes still waiting when the flow ends on the even page of a
   *  spread: they stay on it (JLReq §4.2.6), at the foot of the column the
   *  flow ended in when they fit under its text, else on a page of their
   *  own after it. */
  const reserveLeftoverSidenotes = (): void => {
    if (spreadDeferred.length === 0) return;
    const ids = spreadDeferred.splice(0);
    let page = doc.pages[cursor.pageIndex];
    let col = page?.columns[cursor.columnIndex];
    if (!page || !col) return;
    if (notesCost(col, ids) > col.availableHeight + 0.01) {
      page = createPageWithColumns(doc.pages.length, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, pageIndexOffset);
      doc.pages.push(page);
      col = page.columns[0];
      if (!col) return;
    }
    reserveNotes(page, col, ids, contentBlocks.length - 1);
  };
  /** `chapterEnd`: move the run of note paragraphs that closes a column
   *  down to the column's true foot (under a band cap's cut, above any
   *  bottom float band). */
  const dropChapterEndNotes = (): void => {
    for (const page of doc.pages) {
      for (const col of page.columns) {
        const blocks = col.blocks;
        let first = blocks.length;
        while (first > 0 && blocks[first - 1]!.footnoteNote !== undefined) first--;
        if (first === blocks.length) continue;
        const run = blocks.slice(first);
        const last = run[run.length - 1]!;
        const lastLine = last.lines[last.lines.length - 1];
        const foot = lastLine ? lastLine.bbox.y + lastLine.bbox.height : last.bbox.y + last.bbox.height;
        const d = trueBottom(col, uncappedBottoms) - foot;
        if (d < 0.5) continue;
        for (const b of run) {
          b.bbox = createBoundingBox(b.bbox.x, b.bbox.y + d, b.bbox.width, b.bbox.height);
          for (const line of b.lines) {
            line.bbox = createBoundingBox(line.bbox.x, line.bbox.y + d, line.bbox.width, line.bbox.height);
            line.baseline += d;
          }
        }
      }
    }
  };
  /** `chapterEnd`: the separator rule over the notes of each column, set
   *  in the space above them (`spaceBelowRule` over the first note). */
  const ruleChapterEndNotes = (): void => {
    const sep = resolved.footnotes.separator;
    if (!sep.enabled || sep.width <= 0 || noteRulePx <= 0) return;
    const color = sep.color?.hex ?? resolved.footnotes.color?.hex ?? bodyStyle.color;
    for (const page of doc.pages) {
      for (const col of page.columns) {
        const at = col.blocks.findIndex((b, i) => b.footnoteNote !== undefined && col.blocks[i - 1]?.footnoteNote === undefined);
        if (at < 0) continue;
        const notes = col.blocks.slice(at).filter((b) => b.footnoteNote !== undefined);
        const firstLine = notes[0]!.lines[0];
        if (!firstLine) continue;
        const top = firstLine.bbox.y - noteSpaceBelowRulePx - noteRulePx;
        const last = notes[notes.length - 1]!;
        (page.footnoteAreas ??= []).push({
          columnIndex: col.index,
          bbox: createBoundingBox(col.bbox.x, top, col.bbox.width, last.bbox.y + last.bbox.height - top),
          noteIds: notes.map((b) => b.footnoteNote!),
          rule: { x: col.bbox.x, y: top + noteRulePx / 2, width: col.bbox.width * sep.width, lineWidthPx: noteRulePx, color },
        });
      }
    }
  };
  /** Content index of the block citing each note (reading order). */
  const noteAnchor = new Map<string, number>();
  /** Set the notes in the room reserved for them: the reservations of a
   *  column that touch (the usual case) make one stack in citation order
   *  under the separator; a float band set between two leaves each its own
   *  room. */
  const setColumnNotes = (): void => {
    for (const [col, entry] of columnNotesOf) {
      const page = columnOfNotes.get(col)!;
      const regions: { top: number; bottom: number; ids: string[] }[] = [];
      for (const slot of entry.slots) {
        const last = regions[regions.length - 1];
        if (last && Math.abs(slot.top + slot.height - last.top) < 0.5) {
          last.top = slot.top;
          last.ids.push(...slot.ids);
        } else {
          regions.push({ top: slot.top, bottom: slot.top + slot.height, ids: [...slot.ids] });
        }
      }
      const x = col.bbox.x;
      const width = col.bbox.width;
      regions.forEach((region, r) => {
        let y = region.top;
        if (r === 0) {
          const sep = resolved.footnotes.separator;
          const rule = sep.enabled && sep.width > 0 && noteRulePx > 0
            ? {
                x,
                y: y + noteSpaceAbovePx + noteRulePx / 2,
                width: width * sep.width,
                lineWidthPx: noteRulePx,
                color: sep.color?.hex ?? noteStyle.color,
              }
            : undefined;
          (page.footnoteAreas ??= []).push({
            columnIndex: col.index,
            bbox: createBoundingBox(x, region.top, width, region.bottom - region.top),
            noteIds: entry.ids,
            ...(rule ? { rule } : {}),
          });
          y += noteHeadPx;
        }
        region.ids.forEach((id, i) => {
          if (r > 0 || i > 0) y += noteGapPx;
          const m = measureNote(id, width);
          if (!m) return;
          const blk = createVDTBlock(`fn-${id}`, 'paragraph', noteStyle.fontString, noteStyle.color, noteStyle.textAlign);
          applyStyleAttrs(blk, noteStyle);
          // The tracking the note was measured with (a runt taken up by
          // setting it one line shorter, #662): painted with it too.
          if (m.letterSpacingPx !== undefined) blk.letterSpacing = m.letterSpacingPx;
          if (m.runtTracking !== undefined) blk.runtFix = { tracking: m.runtTracking };
          blk.lines = resetLinePositions(raggedLooseLines(m.measured.lines, noteStyle.textAlign), noteStyle.lineHeightPx).map((line) => ({
            ...line,
            bbox: createBoundingBox(line.bbox.x + x, line.bbox.y + y, line.bbox.width, line.bbox.height),
            ...(line.measure ? { measure: { ...line.measure, x: line.measure.x + x } } : {}),
            baseline: line.baseline + y,
          }));
          const h = blk.lines.length * noteStyle.lineHeightPx;
          blk.bbox = createBoundingBox(x, y, width, h);
          blk.pageIndex = page.index;
          blk.columnIndex = col.index;
          blk.contentIndex = noteAnchor.get(id) ?? 0;
          blk.footnoteNote = id;
          if (m.contentBlock.direction !== undefined && m.contentBlock.direction !== resolvedDirection(resolved)) blk.direction = m.contentBlock.direction;
          blk.dirty = false;
          blk.snappedToGrid = false;
          if (blk.lines.length > 0) {
            blk.sourceStart = blk.lines[0]!.sourceStart;
            blk.sourceEnd = blk.lines[blk.lines.length - 1]!.sourceEnd;
          }
          blk.sourceMap = m.absoluteSourceMap;
          blk.plainPrefixLen = m.prefixLen;
          (page.floats ??= []).push(blk);
          doc.blocks.push(blk);
          y += h;
        });
      });
    }
  };
  return {
    calloutsOutOfFlow, joiningLetterSpacing, dropCapNotes, measureCtx, notesPrefixCost,
    reserveCitedNotes, reserveLeftoverNotes, dropChapterEndNotes, ruleChapterEndNotes,
    setColumnNotes
  };
}
