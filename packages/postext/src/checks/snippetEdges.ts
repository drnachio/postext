// The line-edge rules in the short texts of a resource (#1542): stacks
// (#1463), citations and lone operators at a line edge (#1519) in captions,
// notes and table cells, read off their lines as `findStacks` and
// `findSpaceBreaks` read the running text's. Those texts are broken under
// the rules too (`lineEdgeBreaking`); what `'warn'` and `'avoid'` report.
// And the numbers too wide for their line there (#1549).
import type { VDTBlock, VDTDocument, VDTLine, VDTPage } from '../vdt.js';
import { isNumberWord } from '../measure/rich/numbers.js';
import { pageIsVertical } from '../vdt/flowFrames.js';
import { lineStacks } from './stacks.js';
import { spaceBreakBetween } from './spaceBreaks.js';

/** Where in a resource a fault lies. */
export interface SnippetPlace {
  resourceId: string;
  part: 'caption' | 'note' | 'cell';
  /** The table cell's row and column, from 0, for `part: 'cell'`. */
  cell?: { row: number; col: number };
}

/** A fault of the line-edge rules between lines `line` and `line + 1` of
 *  a resource's caption, note or table cell. */
export interface SnippetEdgeFault extends SnippetPlace {
  /** The resource block it was found in (the first placed, for a text a
   *  resource repeats on several pages). */
  block: VDTBlock;
  pageIndex: number;
  kind: 'stack' | 'citationBreak' | 'operatorBreak';
  edge: 'end' | 'start';
  /** What the lines repeat, the citation or the operator. */
  text: string;
  lines: [string, string];
}

/**
 * The faults of the line-edge rules not at `'allow'` in the captions,
 * notes and table cells of the resources placed in `doc` (a page's columns,
 * then its floats), in page order. A text a resource prints again (a
 * table's caption over each slice) is read once.
 */
export function findSnippetEdgeFaults(doc: VDTDocument): SnippetEdgeFault[] {
  const body = doc.config.bodyText;
  const stacks = body.stacks !== 'allow';
  const rules = { citations: body.citationBreaks !== 'allow', operators: body.operatorBreaks !== 'allow' };
  const out: SnippetEdgeFault[] = [];
  if (!stacks && !rules.citations && !rules.operators) return out;
  const minChars = Math.max(1, body.stackMinCharacters);
  eachSnippet(doc, (lines, place, block, page) => {
    if (lines.length < 2) return;
    const at = { ...place, block, pageIndex: page.index };
    if (stacks) {
      for (const s of lineStacks(lines, minChars, true)) {
        out.push({ ...at, kind: 'stack', edge: s.edge, text: s.text, lines: [lines[s.line]!.text, lines[s.line + 1]!.text] });
      }
    }
    if (pageIsVertical(page) || (!rules.citations && !rules.operators)) return;
    for (let i = 0; i + 1 < lines.length; i++) {
      if (lines[i]!.isLastLine) continue;
      const hit = spaceBreakBetween(lines[i]!.text, lines[i + 1]!.text, rules);
      if (hit) out.push({ ...at, kind: hit.rule === 'citation' ? 'citationBreak' : 'operatorBreak', edge: hit.edge, text: hit.text, lines: [lines[i]!.text, lines[i + 1]!.text] });
    }
  });
  return out;
}

/** A number wider than its line in a resource's caption, note or table
 *  cell (`VDTLine.numberOverflow`, #1549): the number, where it lies. */
export interface SnippetNumberOverflow extends SnippetPlace {
  block: VDTBlock;
  pageIndex: number;
  text: string;
}

/** The numbers that run past their measure in the captions, notes and
 *  table cells of the resources placed in `doc`, in page order, each text
 *  read once (see {@link findSnippetEdgeFaults}). */
export function findSnippetNumberOverflows(doc: VDTDocument): SnippetNumberOverflow[] {
  const out: SnippetNumberOverflow[] = [];
  eachSnippet(doc, (lines, place, block, page) => {
    for (const line of lines) {
      if (line.numberOverflow) out.push({ ...place, block, pageIndex: page.index, text: overflowingNumber(line.text) });
    }
  });
  return out;
}

/** The number a line flagged `numberOverflow` runs past its measure with:
 *  its first word that is one, else the whole line. */
export function overflowingNumber(text: string): string {
  return text.split(/[ \t\n\u2009]+/u).find((word) => isNumberWord(word)) ?? text.trim();
}

/** Each caption, note and table cell of the resources placed in `doc` (a
 *  page's columns, then its floats), in page order, with the resource and
 *  the part it lies in. A text a resource prints again (a table's caption
 *  over each slice) is visited once. */
function eachSnippet(doc: VDTDocument, visit: (lines: readonly VDTLine[], place: SnippetPlace, block: VDTBlock, page: VDTPage) => void): void {
  const seen = new Set<string>();
  for (const page of doc.pages) {
    for (const block of [...page.columns.flatMap((c) => c.blocks), ...(page.floats ?? [])]) {
      const rb = block.resourceBlock;
      if (!rb || block.hidden || block.comic) continue;
      const read = (lines: readonly VDTLine[], place: SnippetPlace): void => {
        if (lines.length === 0) return;
        const key = `${place.resourceId}\u0000${place.part}\u0000${place.cell?.row ?? ''},${place.cell?.col ?? ''}\u0000${lines.map((l) => l.text).join('\u0001')}`;
        if (seen.has(key)) return;
        seen.add(key);
        visit(lines, place, block, page);
      };
      const id = rb.resource.id;
      read(rb.captionLines, { resourceId: id, part: 'caption' });
      read(rb.noteLines, { resourceId: id, part: 'note' });
      for (const cell of rb.table?.cells ?? []) read(cell.lines, { resourceId: id, part: 'cell', cell: { row: cell.row, col: cell.col } });
    }
  }
}
