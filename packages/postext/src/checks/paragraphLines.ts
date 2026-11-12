// The lines of the running text paragraph by paragraph, across the columns
// and pages a paragraph runs over: what the rules the line breaker weighs
// on a whole paragraph read (#1466 hyphen rules, #1519 citation and
// operator breaks).
import type { VDTBlock, VDTDocument, VDTLine } from '../vdt.js';

/** The blocks whose lines are running text set by the line breaker. */
export const TEXT_BLOCKS: ReadonlySet<string> = new Set(['paragraph', 'listItem', 'blockquote', 'footnoteRef']);

/** A line of a paragraph: its block (the fragment in its column) and its
 *  index in `block.lines`. */
export interface ParagraphLine {
  block: VDTBlock;
  line: number;
  at: VDTLine;
}

/** The paragraphs of a document in reading order, each the lines of all
 *  its fragments: a paragraph cut between columns has a block per column,
 *  every one with its `contentIndex`. */
export function paragraphLines(doc: VDTDocument): ParagraphLine[][] {
  const out: ParagraphLine[][] = [];
  let key: string | undefined;
  for (const block of doc.blocks) {
    if (!TEXT_BLOCKS.has(block.type) || block.lines.length === 0) {
      key = undefined;
      continue;
    }
    const k = block.contentIndex !== undefined ? `${block.sourceChapter ?? ''}:${block.contentIndex}:${block.type}` : undefined;
    if (k === undefined || k !== key) out.push([]);
    key = k;
    const lines = out[out.length - 1]!;
    block.lines.forEach((at, line) => lines.push({ block, line, at }));
  }
  return out;
}
