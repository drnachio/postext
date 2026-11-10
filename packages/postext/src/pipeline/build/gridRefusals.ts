// Column balancing on a character grid (#632): why the columns of such a
// page may end short. Split out of balanced.ts (#1492).
import type { VDTDocument, VDTGridBalancing, BalanceLever } from '../../vdt.js';
import { collectColumnGaps, GRID_LINE_LEVERS } from '../columns/columnBalancing.js';

/**
 * Column balancing on a character grid (#632): stamp the document with why
 * its balancing is limited (`VDTDocument.gridBalancing`) and every column
 * still short with the levers the grid kept from it
 * (`VDTColumn.gridRefused`): the loose paragraphs that would have gained
 * their line off the grid (`offGrid`), and the whole-line levers under
 * `headings.balancing.gridLines: 'off'`.
 */
export function markGridRefusals(
  doc: VDTDocument,
  forcedBreakPages: ReadonlySet<number>,
  offGrid: ReadonlySet<number>,
  gridBalancing: VDTGridBalancing | undefined,
): void {
  if (gridBalancing) doc.gridBalancing = gridBalancing;
  const noLines = gridBalancing?.gridLines === 'off';
  for (const gap of collectColumnGaps(doc, forcedBreakPages)) {
    if (gap.gapLines < 1) continue;
    const refused = new Set<BalanceLever>();
    for (const c of gap.candidates) {
      if (noLines && GRID_LINE_LEVERS.includes(c.kind)) refused.add(c.kind);
      else if (c.kind === 'looseParagraph' && offGrid.has(c.contentIndex)) refused.add(c.kind);
    }
    if (refused.size === 0) continue;
    const col = doc.pages[gap.pageIndex]?.columns[gap.columnIndex];
    if (col) col.gridRefused = BALANCE_LEVER_ORDER.filter((l) => refused.has(l));
  }
}

/** The balancing levers in the order `BalanceLever` lists them. */
const BALANCE_LEVER_ORDER: readonly BalanceLever[] = ['trailingCallout', 'flexFigure', 'heading', 'listEnd', 'afterDisplay', 'afterFloat', 'looseParagraph'];
