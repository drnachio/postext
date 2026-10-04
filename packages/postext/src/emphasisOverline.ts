/**
 * The rule over emphasised words (`bodyText.emphasis: 'overline'`, #376):
 * the khaṭṭ fawqī Arabic books draw over a word to stress it, where Latin
 * type would slant it. The `*…*` runs of such a block are set upright
 * (their italic faces are the regular ones, `pipeline/styles.ts`); once
 * the document is laid out each run of them gets a rule as a
 * `VDTLine.marks` line, which every renderer draws as it draws the
 * Chinese marks.
 *
 * The rule stands a little over the run's ink: over the letters, and over
 * their vowel marks when they carry any. A run is the emphasised words
 * that follow each other along the line (the flow order `VDTLine.order`
 * followed), with the spaces between them; a run broken over two lines
 * gets a rule on each.
 */

import type { VDTDocument, VDTLine, VDTLineMark } from './vdt';
import { segmentFont, segmentPositions } from './cjkMarks';
import { fontEm } from './measure/vertical';
import { inkBoxOf } from './arabicMarks';

/** Gap between the run's ink and the rule, and the rule's thickness, in
 *  em of the text. */
const RULE_GAP = 0.12;
const RULE_STROKE = 0.05;

type BlockLike = Parameters<typeof segmentPositions>[1];

/** The overline marks of a line of a block set with
 *  `emphasis: 'overline'`, relative to the line; empty when it has no
 *  emphasised word. */
export function overlineMarks(line: VDTLine, block: BlockLike, color?: string): VDTLineMark[] {
  const segments = line.segments;
  if (!segments || !segments.some((s) => s.italic && s.kind === 'text')) return [];
  const { xs, widths } = segmentPositions(line, block);
  const order = line.order && line.order.length === segments.length ? line.order : segments.map((_, i) => i);
  const at = xs.slice();
  let x = xs[0] ?? line.bbox.x;
  for (const i of order) {
    at[i] = x;
    x += widths[i]!;
  }
  const out: VDTLineMark[] = [];
  let run: { from: number; to: number; top: number; em: number } | undefined;
  const flush = (): void => {
    if (run && run.to > run.from) {
      out.push({
        kind: 'line',
        x: run.from - line.bbox.x,
        y: -(run.top + RULE_GAP * run.em),
        length: run.to - run.from,
        thickness: Math.max(0.5, RULE_STROKE * run.em),
        ...(color !== undefined ? { color } : {}),
      });
    }
    run = undefined;
  };
  for (let k = 0; k < order.length; k++) {
    const i = order[k]!;
    const seg = segments[i]!;
    if (seg.kind === 'space') {
      // A space inside a run carries the rule on when the run goes on.
      if (!run) continue;
      let j = k + 1;
      while (j < order.length && segments[order[j]!]!.kind === 'space') j++;
      const next = j < order.length ? segments[order[j]!] : undefined;
      if (next?.italic && next.kind === 'text') continue;
      flush();
      continue;
    }
    if (seg.kind !== 'text' || !seg.italic || !seg.text.trim()) {
      flush();
      continue;
    }
    const font = segmentFont(seg, block);
    const em = fontEm(font);
    const top = inkBoxOf(seg.text, font).ascent - (seg.baselineShift ?? 0);
    if (!run) run = { from: at[i]!, to: at[i]! + widths[i]!, top, em };
    else {
      run.from = Math.min(run.from, at[i]!);
      run.to = Math.max(run.to, at[i]! + widths[i]!);
      run.top = Math.max(run.top, top);
      run.em = Math.max(run.em, em);
    }
  }
  flush();
  return out;
}

/** Lines already given their rules: a line object shared by two builds
 *  (a cached measurement) is ruled once. */
const ruled = new WeakSet<VDTLine>();

/** Draw the rules of every block set with `emphasis: 'overline'` (see the
 *  module comment), in the block's emphasis colour. */
export function overlineEmphasis(doc: VDTDocument): void {
  for (const block of doc.blocks) {
    if (block.emphasis !== 'overline' || block.hidden) continue;
    for (const line of block.lines) {
      if (ruled.has(line)) continue;
      const marks = overlineMarks(line, block, block.italicColor);
      ruled.add(line);
      if (marks.length > 0) line.marks = [...(line.marks ?? []), ...marks];
    }
  }
}
