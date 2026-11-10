// Text the semantic writer adds that is not in the source (#1444): an
// exercise's number and blanks, a placeholder for a page Word cannot hold.
// It goes into a fragment of generated text, so the importer reads it as
// the engine's (an edit to it is reported, never written into the
// Markdown) and never as a paragraph the user typed.

import type { InlineSpan } from '../../parse/types.js';
import { chipText } from './atoms.js';
import { blockId, type WriterContext } from './context.js';
import { FragmentBuilder } from './fragments.js';
import { rPr, textRuns, type RunProps } from './wml.js';

/** A piece of generated text and its look. */
export interface Piece {
  text: string;
  b?: boolean;
  i?: boolean;
  u?: boolean;
  color?: string;
  /** A face that holds the characters (a check box). */
  font?: string;
  /** A fill behind the characters (a number badge). */
  shd?: string;
}

/** Pieces as runs wrapped in one fragment of generated text. */
export function generatedRuns(ctx: WriterContext, pieces: readonly Piece[], role: string): string {
  const f = new FragmentBuilder();
  let runs = '';
  for (const p of pieces) {
    if (!p.text) continue;
    const props: RunProps = {};
    if (p.b) props.b = true;
    if (p.i) props.i = true;
    if (p.u) props.u = true;
    if (p.color) props.color = p.color;
    if (p.font) props.font = p.font;
    if (p.shd) props.shd = p.shd;
    runs += textRuns(p.text, rPr(props));
    f.push(p.text, new Array<number>(p.text.length).fill(-1), (p.b ? 'b' : '') + (p.i ? 'i' : ''));
  }
  return ctx.log.wrap(runs, f, { block: blockId(ctx), target: { kind: 'generated' }, range: [0, 0], role });
}

/** The plain words of inline spans (chips by their words, tabs as tabs). */
export function spansText(spans: readonly InlineSpan[]): string {
  return spans.map((s) => (s.chip ? chipText(s.chip) : s.tab ? '\t' : s.text)).join('');
}

/** Inline spans as pieces, keeping bold and italic. */
export function spanPieces(spans: readonly InlineSpan[]): Piece[] {
  return spans.map((s) => ({ text: s.chip ? chipText(s.chip) : s.tab ? '\t' : s.text, ...(s.bold ? { b: true } : {}), ...(s.italic ? { i: true } : {}) }));
}
