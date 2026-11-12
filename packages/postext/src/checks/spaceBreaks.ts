// Citations and lone operators at a line edge in a laid-out document
// (#1519): a line of running text that starts with a numbered citation or
// a piece of one, or that ends or starts on a relation or operator set
// between spaces, read off the lines with the rules the line breaker
// prices under `bodyText.citationBreaks` and `operatorBreaks: 'avoid'`
// (`measure/spaceBreaks.ts`). What `'warn'` and `'avoid'` report.
import type { VDTBlock, VDTDocument } from '../vdt.js';
import { ruledSpaces } from '../knuthPlass/spaceBreaks.js';
import { pageIsVertical } from '../vdt/flowFrames.js';
import { paragraphLines } from './paragraphLines.js';

/** A break at a ruled space: between line `line` of `block` and line
 *  `nextLine` of `nextBlock`, the next line of the paragraph (in the same
 *  block, or at the head of the next column or page the paragraph runs
 *  on in). */
export interface SpaceBreakFault {
  block: VDTBlock;
  /** Index of the line before the break in `block.lines`. */
  line: number;
  nextBlock: VDTBlock;
  /** Index of the line after the break in `nextBlock.lines`. */
  nextLine: number;
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
  /** Only the faults whose line after the break is on this page. Default:
   *  every page. */
  pageIndex?: number;
}

/**
 * The breaks of a laid-out document at a space before or inside a numbered
 * citation, or beside a lone operator, in reading order (#1519): in
 * paragraphs, list items, quotations and notes set horizontally, a
 * paragraph's lines read on across the columns and pages it runs over, as
 * the line breaker weighs them. A line that ends on a hyphen or a break of
 * its own text is no such break.
 */
export function findSpaceBreaks(doc: VDTDocument, options: FindSpaceBreaksOptions = {}): SpaceBreakFault[] {
  const body = doc.config.bodyText;
  const rules = {
    citations: options.citations ?? body.citationBreaks !== 'allow',
    operators: options.operators ?? body.operatorBreaks !== 'allow',
  };
  const out: SpaceBreakFault[] = [];
  if (!rules.citations && !rules.operators) return out;
  const vertical = (b: VDTBlock) => {
    const page = doc.pages[b.pageIndex];
    return page !== undefined && pageIsVertical(page);
  };
  for (const lines of paragraphLines(doc)) {
    for (let i = 0; i + 1 < lines.length; i++) {
      const a = lines[i]!;
      const b = lines[i + 1]!;
      if (options.pageIndex !== undefined && b.block.pageIndex !== options.pageIndex) continue;
      if (vertical(a.block) || vertical(b.block)) continue;
      const hit = spaceBreakBetween(a.at.text, b.at.text, rules);
      if (hit) out.push({ block: a.block, line: a.line, nextBlock: b.block, nextLine: b.line, ...hit });
    }
  }
  return out;
}

/** The fault of the break between two consecutive lines of one text whose
 *  texts are `before` and `after`, if they were broken at a ruled space
 *  (#1519): also those of a caption, a note or a table cell (#1542). */
export function spaceBreakBetween(before: string, after: string, rules: { citations: boolean; operators: boolean }): Pick<SpaceBreakFault, 'rule' | 'edge' | 'text'> | undefined {
  // Broken at a word space: the line before keeps no hyphen, and both
  // lines have text at the break.
  const head = before.trimEnd();
  const tail = after.trimStart();
  if (head === '' || tail === '' || /[-\u00AD\u2010]$/u.test(head)) return undefined;
  const joined = `${head} ${tail}`;
  const at = head.length;
  const hit = ruledSpaces(joined, rules).find((s) => s.at === at);
  if (!hit) return undefined;
  const edge = hit.rule === 'citation' || joined.startsWith(hit.text, at + 1) ? 'start' : 'end';
  return { rule: hit.rule, edge, text: hit.text };
}
