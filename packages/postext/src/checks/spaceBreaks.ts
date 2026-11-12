// Citations and lone operators at a line edge in a laid-out document
// (#1519): a line of running text that starts with a numbered citation or
// a piece of one, or that ends or starts on a relation or operator set
// between spaces, read off the lines with the rules the line breaker
// prices under `bodyText.citationBreaks` and `operatorBreaks: 'avoid'`
// (`measure/spaces.ts`). What `'warn'` and `'avoid'` report.
import type { VDTBlock, VDTDocument } from '../vdt.js';
import { ruledSpaces } from '../measure/spaces.js';
import { pageIsVertical } from '../vdt/flowFrames.js';

/** A break at a ruled space: between lines `line` and `line + 1` of
 *  `block`. */
export interface SpaceBreakFault {
  block: VDTBlock;
  /** Index of the line before the break in `block.lines`. */
  line: number;
  rule: 'citation' | 'operator';
  /** For an operator: whether the line before ends on it (`'end'`) or the
   *  line after starts with it (`'start'`). A citation always opens the
   *  line after. */
  edge: 'end' | 'start';
  /** The citation or the operator, as the text prints it. */
  text: string;
}

/** Options for {@link findSpaceBreaks}. */
export interface FindSpaceBreaksOptions {
  /** The rules to read. Default: those of the document not at `'allow'`. */
  citations?: boolean;
  operators?: boolean;
  /** Only the faults of this page. Default: every page. */
  pageIndex?: number;
}

/** The blocks whose lines are running text set by the line breaker. */
const TEXT_BLOCKS: ReadonlySet<string> = new Set(['paragraph', 'listItem', 'blockquote', 'footnoteRef']);

/**
 * The breaks of a laid-out document at a space before or inside a numbered
 * citation, or beside a lone operator, in block and line order (#1519): in
 * paragraphs, list items, quotations and notes set horizontally. A line
 * that ends on a hyphen or a break of its own text is no such break.
 */
export function findSpaceBreaks(doc: VDTDocument, options: FindSpaceBreaksOptions = {}): SpaceBreakFault[] {
  const body = doc.config.bodyText;
  const rules = {
    citations: options.citations ?? body.citationBreaks !== 'allow',
    operators: options.operators ?? body.operatorBreaks !== 'allow',
  };
  const out: SpaceBreakFault[] = [];
  if (!rules.citations && !rules.operators) return out;
  for (const block of doc.blocks) {
    if (options.pageIndex !== undefined && block.pageIndex !== options.pageIndex) continue;
    if (!TEXT_BLOCKS.has(block.type) || block.lines.length < 2) continue;
    const page = doc.pages[block.pageIndex];
    if (page && pageIsVertical(page)) continue;
    for (let i = 0; i + 1 < block.lines.length; i++) {
      const before = block.lines[i]!.text;
      const after = block.lines[i + 1]!.text;
      // Broken at a word space: the line before keeps no hyphen, and both
      // lines have text at the break.
      const head = before.trimEnd();
      const tail = after.trimStart();
      if (head === '' || tail === '' || /[-­‐]$/u.test(head)) continue;
      const joined = `${head} ${tail}`;
      const at = head.length;
      const hit = ruledSpaces(joined, rules).find((s) => s.at === at);
      if (!hit) continue;
      const edge = hit.rule === 'citation' || joined.startsWith(hit.text, at + 1) ? 'start' : 'end';
      out.push({ block, line: i, rule: hit.rule, edge, text: hit.text });
    }
  }
  return out;
}
