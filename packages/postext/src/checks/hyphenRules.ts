// The hyphen rules in a laid-out document (#1466): hyphen ladders (more
// than `hyphenation.maxConsecutive` lines in a row of a paragraph ending on
// a hyphen) and the last word of a paragraph divided, read off the lines as
// the line breaker weighs them under `'avoid'`. What `'warn'` and `'avoid'`
// report, and what the Sandbox lists in Review.
import type { VDTBlock, VDTDocument, VDTLine } from '../vdt.js';

/** A fault of the hyphen rules. */
export interface HyphenFault {
  /** `'ladder'`: `lines` lines in a row end on a hyphen, more than the
   *  limit. `'lastWord'`: the paragraph's last line holds only the rest of
   *  the word the line before divides. */
  kind: 'ladder' | 'lastWord';
  /** The block of the first line concerned (the ladder's first line, the
   *  line before the last), and that line's index in `block.lines`. */
  block: VDTBlock;
  line: number;
  /** The lines concerned, in reading order: a ladder's lines, or the last
   *  two lines of the paragraph. */
  lines: VDTLine[];
  /** The block of the last of them (another fragment of the paragraph when
   *  it runs on in the next column). */
  lastBlock: VDTBlock;
}

/** Options for {@link findHyphenFaults}. */
export interface FindHyphenFaultsOptions {
  /** Look for ladders, longer than `maxConsecutive` lines. Default: under
   *  the document's `hyphenation.ladders` other than `'allow'`. */
  ladders?: boolean;
  /** Default: the document's `hyphenation.maxConsecutive`. */
  maxConsecutive?: number;
  /** Look for the last word divided. Default: under the document's
   *  `hyphenation.lastWord` other than `'allow'`. */
  lastWord?: boolean;
  /** Only the faults that start on this page. Default: every page. */
  pageIndex?: number;
}

/** The blocks whose lines are running text set by the line breaker. */
const TEXT_BLOCKS: ReadonlySet<string> = new Set(['paragraph', 'listItem', 'blockquote', 'footnoteRef']);

/** The line ends on a hyphen: a divided word, or a word's own hyphen (a
 *  break after a dash or at a URL joint is no hyphen). */
export function endsOnHyphen(line: VDTLine): boolean {
  if (!line.hyphenated) return false;
  const t = line.text.trimEnd();
  const last = t[t.length - 1];
  return last === '-' || last === '‐' || last === '­';
}

/** No word space in the line: it holds one word, or a piece of one. */
function oneWord(line: VDTLine): boolean {
  return !/\s/u.test(line.text.trim());
}

/** The paragraphs of a document in reading order, each the lines of all
 *  its fragments: a paragraph cut between columns has a block per column,
 *  every one with its `contentIndex`. */
function paragraphs(doc: VDTDocument): { block: VDTBlock; line: number; at: VDTLine }[][] {
  const out: { block: VDTBlock; line: number; at: VDTLine }[][] = [];
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

/**
 * The hyphen ladders and the divided last words of a laid-out document, in
 * reading order (#1466). A ladder is reported once, with all its lines; a
 * paragraph of one line has no last word divided.
 */
export function findHyphenFaults(doc: VDTDocument, options: FindHyphenFaultsOptions = {}): HyphenFault[] {
  const h = doc.config.bodyText.hyphenation;
  const ladders = options.ladders ?? h.ladders !== 'allow';
  const lastWord = options.lastWord ?? h.lastWord !== 'allow';
  const max = Math.max(1, Math.round(options.maxConsecutive ?? h.maxConsecutive));
  const out: HyphenFault[] = [];
  const push = (kind: HyphenFault['kind'], run: { block: VDTBlock; line: number; at: VDTLine }[]) => {
    const first = run[0]!;
    if (options.pageIndex !== undefined && first.block.pageIndex !== options.pageIndex) return;
    out.push({ kind, block: first.block, line: first.line, lines: run.map((r) => r.at), lastBlock: run[run.length - 1]!.block });
  };
  for (const lines of paragraphs(doc)) {
    if (ladders) {
      let start = 0;
      for (let i = 0; i <= lines.length; i++) {
        if (i < lines.length && endsOnHyphen(lines[i]!.at)) continue;
        if (i - start > max) push('ladder', lines.slice(start, i));
        start = i + 1;
      }
    }
    const n = lines.length;
    if (lastWord && n >= 2 && endsOnHyphen(lines[n - 2]!.at) && oneWord(lines[n - 1]!.at)) push('lastWord', lines.slice(n - 2));
  }
  return out;
}
