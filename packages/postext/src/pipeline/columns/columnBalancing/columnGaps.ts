// The empty grid lines at the foot of each balanceable column and the levers
// that could fill them: headings, list ends, displays, float bands, closing
// boxes, pictures with a safe area, loose paragraphs (#1276: split out of columnBalancing.ts).
import type { VDTPage, VDTColumn, VDTBlock, VDTDocument } from '../../../vdt.js';
import { type BalanceCandidate, flexFloatKey, flexFigureKey } from './segments.js';

/** Tolerance against FP drift when converting free space to grid lines. */
const EPS = 0.01;

/** Whether a float band sits right above `col` (a figure at the head of the
 *  column): the column's content then has something to be pushed down from. */
function floatBandAbove(page: VDTPage, col: VDTColumn): boolean {
  const left = col.bbox.x;
  const right = col.bbox.x + col.bbox.width;
  return (page.floats ?? []).some((f) =>
    f.bbox.x < right - 0.5 && f.bbox.x + f.bbox.width > left + 0.5 && f.bbox.y + f.bbox.height <= col.bbox.y + EPS);
}

export interface ColumnGap {
  pageIndex: number;
  columnIndex: number;
  /** Whole empty grid lines at the bottom of the column. */
  gapLines: number;
  /** Stretch points inside this column that can absorb extra lines. */
  candidates: BalanceCandidate[];
}

function pageHasBodyContent(page: VDTPage): boolean {
  return page.columns.some((c) => c.blocks.length > 0);
}

/** Which fragment of a split block this one is: a callout frame carries its
 *  own index, a paragraph continuing into a new column carries it in its id
 *  (`…-cont-2`). 0 for a block that starts here. */
function fragmentOf(b: VDTBlock): number {
  if (b.callout?.part !== undefined) return b.callout.part;
  const m = /-cont-(\d+)$/.exec(b.id);
  return m ? Number(m[1]) : 0;
}

/** Whether a float band sits right above the column (the column's top was
 *  pushed down under it): a float on the page overlapping the column
 *  horizontally whose box ends at or above the column's top. */
function columnUnderTopFloat(page: VDTPage, col: VDTColumn): boolean {
  const floats = page.floats ?? [];
  const left = col.bbox.x;
  const right = col.bbox.x + col.bbox.width;
  return floats.some((f) =>
    f.bbox.x < right - 0.5
    && f.bbox.x + f.bbox.width > left + 0.5
    && f.bbox.y + f.bbox.height <= col.bbox.y + 0.5
    && f.bbox.y >= page.contentArea.y - 0.5,
  );
}

/** Regular flow column with a usable height — never a page-span block's
 *  full-width column, nor a band closed at its own top. */
function isTextColumn(col: VDTColumn): boolean {
  return col.kind !== 'span' && col.kind !== 'side' && col.bbox.height > 0.5;
}

/** The float band `col` starts under when that float also stands over
 *  another text column of the same band (#708): a key shared by the
 *  columns under it and how many they are. The lowest such float counts
 *  when several are stacked. Null under a float of the column's own. */
function wideFloatOver(page: VDTPage, col: VDTColumn): { key: string; under: number } | null {
  const floats = page.floats ?? [];
  const above = (f: VDTBlock, k: VDTColumn): boolean =>
    f.bbox.x < k.bbox.x + k.bbox.width - 0.5
    && f.bbox.x + f.bbox.width > k.bbox.x + 0.5
    && f.bbox.y + f.bbox.height <= k.bbox.y + 0.5
    && f.bbox.y >= page.contentArea.y - 0.5;
  let best: { index: number; bottom: number; under: number } | null = null;
  floats.forEach((f, index) => {
    if (!above(f, col)) return;
    const under = page.columns.filter((k) => isTextColumn(k) && (k.band ?? 0) === (col.band ?? 0) && above(f, k)).length;
    const bottom = f.bbox.y + f.bbox.height;
    if (under >= 2 && (!best || bottom > best.bottom)) best = { index, bottom, under };
  });
  const found = best as { index: number; bottom: number; under: number } | null;
  return found ? { key: `${page.index}:${found.index}`, under: found.under } : null;
}

/**
 * Collect the bottom gaps of every balanceable column.
 *
 * A column is balanceable when content flowed past it into a later column of
 * the same page, or — for the page's last non-empty column — when the page
 * flows naturally into a later content page (no `:::pagebreak`, heading
 * `breakBefore`, or chapter opener forced the break, and it is not the last
 * content page: a short final column at the end of a chapter is legitimate).
 *
 * Eligible headings are heading blocks that are neither the first block of
 * their column (their top margin is suppressed there so the column keeps
 * starting at the page top) nor the last (space above a trailing heading
 * would strand it at the column bottom); a heading that opens a column
 * under a float band is eligible too (it is a heading lever, not an
 * after-float point). In a closing band (a page that does not flow on, a
 * band cut level by a trailing cap) the heading at its column's head keeps
 * its place, under a float band and under a page-span opener alike: the
 * hidden block the opener leaves in its own column does not make the
 * heading after it a mid-column one (#709). List-end points are the first
 * non-list block after a run of list items — they may be last in column
 * (pushing a trailing paragraph down by at most the gap is local: the
 * element that opened the next column still does not fit). After-float
 * points are the first block of a column that starts under a float band (a
 * whole block, not a continuation, and not a callout). Loose-paragraph
 * candidates are justified paragraphs wholly contained in the column (never
 * split parts — loosening those would reshuffle lines across columns); with
 * `headings.balancing.fillShortColumns` (#1236) ragged ones too, when
 * Knuth–Plass breaks them (`bodyText.optimalRagged`).
 */
export function collectColumnGaps(
  doc: VDTDocument,
  forcedBreakPages: ReadonlySet<number>,
): ColumnGap[] {
  let lastContentPage = -1;
  for (let i = 0; i < doc.pages.length; i++) {
    if (pageHasBodyContent(doc.pages[i]!)) lastContentPage = i;
  }

  // Multiplicity of each content index across the whole document — a count
  // above 1 means the block was split across columns/pages.
  const partCount = new Map<number, number>();
  for (const page of doc.pages) {
    for (const col of page.columns) {
      for (const b of col.blocks) {
        if (b.contentIndex !== undefined) {
          partCount.set(b.contentIndex, (partCount.get(b.contentIndex) ?? 0) + 1);
        }
      }
    }
  }

  /** The trailing-callout candidate of a closing column whose last blocks
   *  are one callout box: the room between the box's foot and the foot of
   *  the lowest last line in the other text columns of its band. */
  const closingBoxGap = (d: VDTDocument, page: VDTPage, col: VDTColumn): BalanceCandidate | null => {
    const visible = col.blocks.filter((b) => !b.hidden);
    const last = visible[visible.length - 1];
    if (!last || last.containerId === undefined) return null;
    const frameAt = visible.findIndex((b) => b.type === 'callout' && b.containerId === last.containerId);
    const frame = frameAt >= 1 ? visible[frameAt]! : undefined;
    if (!frame || frame.contentIndex === undefined || (frame.callout?.part ?? 0) > 0) return null;
    if (!visible.slice(frameAt).every((b) => b.containerId === last.containerId)) return null;
    let target = -Infinity;
    for (const other of page.columns) {
      if (other === col || !isTextColumn(other) || (other.band ?? 0) !== (col.band ?? 0)) continue;
      const blocks = other.blocks.filter((b) => !b.hidden && b.lines.length > 0);
      const tail = blocks[blocks.length - 1];
      const line = tail?.lines[tail.lines.length - 1];
      if (line) target = Math.max(target, line.bbox.y + line.bbox.height);
    }
    const foot = frame.bbox.y + frame.bbox.height;
    const room = col.bbox.y + col.bbox.height - foot;
    const gapPx = Math.min(target - foot, room);
    // Only a small gap closes this way: a box pushed far down would open a
    // hole between the text above it and itself (the trailing cap levels
    // such a band instead).
    if (!(gapPx > d.baselineGrid * 0.1) || gapPx > d.baselineGrid * 6 + EPS) return null;
    return { contentIndex: frame.contentIndex, part: 0, kind: 'trailingCallout', level: 0, order: frameAt, lineCount: 0, gapPx };
  };

  // `headings.balancing.closingBox: 'off'` (EF-105): no box closing a
  // column is ever moved down, so none is a candidate.
  const boxLever = (doc.config?.headings?.balancing?.closingBox ?? 'first') !== 'off';
  // `headings.balancing.fillShortColumns` (#1236): a ragged paragraph may
  // run a line long too, when the breaker can set it so (Knuth–Plass on
  // ragged text; line by line it would only come back as it was).
  const raggedLoose = doc.config?.headings?.balancing?.fillShortColumns === true
    && doc.config?.bodyText?.optimalRagged !== false;

  const gaps: ColumnGap[] = [];
  for (let p = 0; p <= lastContentPage; p++) {
    const page = doc.pages[p]!;
    if (page.blankForParity || page.blankForForce) continue;

    // Only text columns balance. A page-span block's full-width column is
    // exactly as tall as its content, and a band closed before any text
    // landed in it is zero-height — neither has a gap to absorb. The "last
    // column of the page" is likewise the last non-empty TEXT column: a
    // trailing span column must not turn a chapter's real closing column
    // into a balanceable one.
    let lastNonEmpty = -1;
    for (let c = 0; c < page.columns.length; c++) {
      const col = page.columns[c]!;
      if (isTextColumn(col) && col.blocks.length > 0) lastNonEmpty = c;
    }
    if (lastNonEmpty === -1) continue;

    const pageFlowsOn = p < lastContentPage && !forcedBreakPages.has(p);

    for (let c = 0; c <= lastNonEmpty; c++) {
      const col = page.columns[c]!;
      if (!isTextColumn(col) || col.blocks.length === 0) continue;
      // The closing column of a page that does not flow on ends where its
      // text ends — unless a trailing cap cut it level with the columns
      // beside it: then it fills up to the cut like any other.
      // One exception: a closing column that ends with a callout box moves
      // the box down (the trailing-callout lever alone) so its foot ends
      // level with the last line of the columns beside it.
      if (c === lastNonEmpty && !pageFlowsOn && !col.trailingCap) {
        const closing = boxLever ? closingBoxGap(doc, page, col) : null;
        if (closing) gaps.push({ pageIndex: p, columnIndex: c, gapLines: 0, candidates: [closing] });
        continue;
      }
      // A `:::columnbreak` ended this column on purpose — leave its gap.
      if (col.forcedBreak) continue;
      // Text wraps round a picture or a box in this column (#627): its
      // lines are broken for where they stand, and a lever moving them
      // would set them beside nothing. Left as it is.
      if (col.exclusions && col.exclusions.length > 0) continue;

      // A column closed by a list tail: the tail's box bakes the list's
      // bottom margin and grid snap in (so the flow after it lands on the
      // grid), which can hide a whole empty line under the last item — one
      // a stretch point above could still use; the item would simply land
      // with less margin below it. Measure the room below its last line.
      let free = col.availableHeight;
      for (let i = col.blocks.length - 1; i >= 0; i--) {
        const b = col.blocks[i]!;
        if (b.hidden) continue;
        const lastLine = b.lines[b.lines.length - 1];
        if (b.type === 'listItem' && lastLine) {
          free = Math.max(free, col.bbox.y + col.bbox.height - (lastLine.bbox.y + lastLine.bbox.height));
        }
        break;
      }
      // A column of a closing band cut level by a trailing cap stretches up
      // to the tallest column beside it, not to the cut itself: when that
      // column could not fill its last line (a split kept clear of a widow)
      // the band ends one line short of the cap, and this one must end with
      // it rather than a line lower.
      // The same holds for any band cut level (a band cap before a
      // page-span box) and for the columns of a page that does not flow on:
      // they end with the tallest column of their band.
      if (col.trailingCap || col.bandCapped || !pageFlowsOn) {
        const usedBottom = (k: VDTColumn): number => k.bbox.y + (k.bbox.height - k.availableHeight);
        // A paragraph split at the cut that holds a line back (no widow
        // over the column break) closes the column: its available height
        // reads 0 though its text ends a line higher. The foot of the last
        // block is where such a column really ends.
        const textBottom = (k: VDTColumn): number => {
          const blocks = k.blocks.filter((b) => !b.hidden);
          const tail = blocks[blocks.length - 1];
          if (k.availableHeight > EPS || !tail || tail.type !== 'paragraph' || tail.containerId !== undefined) return usedBottom(k);
          return Math.min(usedBottom(k), tail.bbox.y + tail.bbox.height);
        };
        const level = Math.max(...page.columns
          .filter((k) => k !== col && isTextColumn(k) && (k.band ?? 0) === (col.band ?? 0) && k.blocks.length > 0)
          .map(textBottom), -Infinity);
        if (Number.isFinite(level)) {
          const mine = textBottom(col);
          free = Math.max(free, col.bbox.y + col.bbox.height - mine);
          // No column of such a band ends past the tallest other one: a
          // closing page ends level, it does not grow one column away.
          free = Math.min(free, Math.max(0, level - mine));
        }
      }
      let gapLines = Math.floor((free + EPS) / doc.baselineGrid);

      // A closing page — one that does not flow on (a chapter's last page,
      // a page before an explicit break), or a closing band cut level by a
      // trailing cap — ends short with its column heads level: the room
      // under a float band there would only drop one column's first line
      // below the others' to line the feet up (EF-70). The other levers
      // work inside the column and keep its head.
      const closingBand = col.trailingCap === true || !pageFlowsOn;

      const candidates: BalanceCandidate[] = [];
      // A callout box closing the column (its frame and children are the
      // column's last blocks) takes the room under its foot, up to the
      // column's last grid slot, as space above it — provided something
      // sits above it to push down from: text blocks, or a float band at
      // the column's head. A continuation fragment of a split box counts
      // like a head: under a figure it lands level with the foot of the
      // head in the column before, as any note closing a column. The box's
      // tail bakes its bottom margin and a grid snap in, so that room is
      // measured from the frame itself and taken exactly, not by the line.
      // A box heading the column under a float band is the float's room in
      // a closing band, like the after-float lever: it stays at the head.
      const visible = col.blocks.filter((b) => !b.hidden);
      const last = visible[visible.length - 1];
      if (last && last.containerId !== undefined) {
        const frameAt = visible.findIndex((b) => b.type === 'callout' && b.containerId === last.containerId);
        const frame = frameAt >= 0 ? visible[frameAt]! : undefined;
        if (
          frame
          && (frameAt >= 1 || (floatBandAbove(page, col) && !closingBand))
          && frame.contentIndex !== undefined
          && visible.slice(frameAt).every((b) => b.containerId === last.containerId)
        ) {
          const lastSlotBottom = col.bbox.y + Math.floor((col.bbox.height + EPS) / doc.baselineGrid) * doc.baselineGrid;
          // A continuation lands level with the foot of the fragment before
          // it when that one closes a column of the same page (the note's
          // head at the band bottom of the column beside), else on the
          // column's true foot — box interiors are off-grid anyway.
          const part = frame.callout?.part ?? 0;
          let target = lastSlotBottom;
          if (part > 0) {
            const trueBottom = col.bbox.y + col.bbox.height;
            const before = doc.blocks.find((b) =>
              b.type === 'callout' && b.containerId === frame.containerId && b.pageIndex === frame.pageIndex && b.callout?.part === part - 1);
            const beforeFoot = before ? before.bbox.y + before.bbox.height : undefined;
            target = beforeFoot !== undefined && beforeFoot <= trueBottom + EPS ? beforeFoot : trueBottom;
          }
          const gapPx = target - (frame.bbox.y + frame.bbox.height);
          // A box ends level with the column beside it: in a band of one
          // text column (a one-column page that ends early, its next block
          // on the next page) there is none, and the box stays under the
          // block above it rather than drop to the foot (#532).
          const alone = !page.columns.some((k) => k !== col && isTextColumn(k) && (k.band ?? 0) === (col.band ?? 0));
          if (gapPx > doc.baselineGrid * 0.1 && !alone) {
            if (boxLever) {
              candidates.push({ contentIndex: frame.contentIndex, part: frame.callout?.part ?? 0, kind: 'trailingCallout', level: 0, order: frameAt, lineCount: 0, gapPx });
            }
            // The box takes its room exactly; the whole-line levers above it
            // may only take the whole lines of it (a line more overflows the
            // column — or the cut of a capped band — and the pass is lost).
            // With the box's own lever off they still may: the margin under
            // a box that ends a column is no room anyone reads.
            gapLines = Math.max(gapLines, Math.floor(gapPx / doc.baselineGrid + EPS));
          }
        }
      }
      if (gapLines < 1 && candidates.length === 0) continue;

      // Pictures with a safe area floated over this column alone, at its
      // head (not in a closing band, whose column heads stay level, as for
      // the after-float lever) or at its foot: grown, they take the gap.
      for (const f of page.floats ?? []) {
        const rb = f.resourceBlock;
        const grow = rb?.bodyFlex?.grow ?? 0;
        if (!rb || grow < doc.baselineGrid - EPS) continue;
        if (!(f.bbox.x >= col.bbox.x - 0.5 && f.bbox.x + f.bbox.width <= col.bbox.x + col.bbox.width + 0.5)) continue;
        const atHead = f.bbox.y + f.bbox.height <= col.bbox.y + 0.5;
        const atFoot = f.bbox.y >= col.bbox.y + col.bbox.height - 0.5;
        if (!atFoot && !(atHead && !closingBand)) continue;
        candidates.push({
          contentIndex: -1,
          key: flexFloatKey(rb.resource.id),
          kind: 'flexFigure',
          level: 0,
          order: atHead ? -1 : col.blocks.length,
          lineCount: 0,
          maxLines: Math.floor(grow / doc.baselineGrid + EPS),
        });
      }

      for (let i = 0; i < col.blocks.length; i++) {
        const b = col.blocks[i]!;
        if (b.hidden || b.contentIndex === undefined) continue;
        // Callout frames and their children form one unbreakable unit whose
        // interior is off-grid by design — never a stretch point.
        if (b.containerId !== undefined) continue;

        // An inline picture with a safe area grows into the gap.
        const grow = b.type === 'resource' ? b.resourceBlock?.bodyFlex?.grow ?? 0 : 0;
        if (grow >= doc.baselineGrid - EPS) {
          candidates.push({
            contentIndex: b.contentIndex,
            key: flexFigureKey(b.contentIndex),
            kind: 'flexFigure',
            level: 0,
            order: i,
            lineCount: 0,
            maxLines: Math.floor(grow / doc.baselineGrid + EPS),
          });
        }

        // A heading opening a column under a float band is a heading lever
        // (its cap and priority), not an after-float point: the room goes
        // above a title, where the reader expects it. A paragraph resuming
        // from the column before is a lever like any other — the room goes
        // under the figure, where nobody reads a gap, and its lines land
        // back on the grid of the column beside it.
        // In a closing band that heading keeps its place, as any first block
        // under the float does there (EF-79): room above it would only drop
        // its column's head below the one beside it.
        const underFloat = i === 0 && columnUnderTopFloat(page, col);
        // So does the heading right under a page-span opener in the opener's
        // own column (#709): the opener stays there as a hidden block, so
        // the heading is the first thing its column shows, and the columns
        // beside it start level with it (`openerHeadSpacing`). A line above
        // it would lower this column's head alone.
        const opensColumn = i >= 1 && col.blocks.slice(0, i).every((k) => k.hidden);
        if (
          b.type === 'heading'
          && b.headingLevel !== undefined
          && ((i >= 1 && !(opensColumn && closingBand)) || (underFloat && !closingBand))
          && i < col.blocks.length - 1
        ) {
          candidates.push({
            contentIndex: b.contentIndex,
            kind: 'heading',
            level: b.headingLevel,
            order: i,
            lineCount: b.lines.length,
          });
        } else if (underFloat && !closingBand) {
          const wideFloat = wideFloatOver(page, col);
          candidates.push({
            contentIndex: b.contentIndex,
            part: fragmentOf(b),
            kind: 'afterFloat',
            level: 0,
            order: i,
            lineCount: b.lines.length,
            ...(wideFloat ? { wideFloat } : {}),
          });
        } else if (
          i >= 1
          && col.blocks[i - 1]!.type === 'listItem'
          && col.blocks[i - 1]!.containerId === undefined
          && b.type !== 'listItem'
          && b.type !== 'heading' // a heading after a list is a heading candidate
          && !b.id.includes('-cont-')
          && !b.tocEntry && !b.tocPart // the contents keep their own rhythm
        ) {
          candidates.push({
            contentIndex: b.contentIndex,
            kind: 'listEnd',
            level: 0,
            order: i,
            lineCount: b.lines.length,
          });
        } else if (
          i >= 1
          && (
            ((col.blocks[i - 1]!.type === 'mathDisplay' || isLastSystem(col.blocks[i - 1]!)) && col.blocks[i - 1]!.containerId === undefined)
            // …or the last block of a callout box (its children carry the
            // box's container id; the block after it is back in the flow).
            || col.blocks[i - 1]!.containerId !== undefined
          )
          && b.type !== 'heading'
          && b.type !== 'mathDisplay'
          && b.type !== 'score'
          && !b.id.includes('-cont-')
        ) {
          // The space under a display formula or a box: a whole grid line
          // more there reads as the element's own margin, not as a hole in
          // the text.
          candidates.push({
            contentIndex: b.contentIndex,
            kind: 'afterDisplay',
            level: 0,
            order: i,
            lineCount: b.lines.length,
          });
        }

        if (
          b.type === 'paragraph'
          && (b.textAlign === 'justify' || (raggedLoose && (b.textAlign === 'left' || b.textAlign === 'right')))
          && b.lines.length >= 2
          && partCount.get(b.contentIndex) === 1
        ) {
          candidates.push({
            contentIndex: b.contentIndex,
            kind: 'looseParagraph',
            level: 0,
            order: i,
            lineCount: b.lines.length,
          });
        }
      }
      gaps.push({ pageIndex: p, columnIndex: c, gapLines, candidates });
    }
  }
  return gaps;
}

/** Total empty grid lines across all balanceable columns — the quantity the
 *  convergence loop minimises. */
export function totalGapLines(
  doc: VDTDocument,
  forcedBreakPages: ReadonlySet<number>,
): number {
  return collectColumnGaps(doc, forcedBreakPages).reduce((sum, g) => sum + g.gapLines, 0);
}

/** The last system of a score (#1172): like a display formula, the space
 *  under it may take a balancing grid line. */
function isLastSystem(b: VDTBlock): boolean {
  return b.type === 'score' && b.score !== undefined && b.score.index === b.score.count - 1;
}
