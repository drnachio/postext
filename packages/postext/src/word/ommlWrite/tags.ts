// Equation numbers (`\tag{1}`, `\tag*{A}`). MathJax sets a tagged display
// equation as a one-row table whose `mlabeledtr` row holds the label in its
// first cell and the equation in the second. OMML has no portable way to
// hold that number (Word's own `#(1)` in an equation array shows as text in
// LibreOffice and Google Docs), so the writer splits it off: the equation
// becomes an ordinary `m:oMath` and the caller sets the number beside it.

import { kids, unwrap, type MmlNode } from './mml.js';
import { rowOf } from './convert.js';

/** All the text below a node. */
function textOf(node: MmlNode): string {
  if (node.kind === 'text') return node.getText?.() ?? '';
  let out = '';
  for (const c of kids(node)) out += textOf(c);
  return out;
}

export interface TaggedEquation {
  /** The equation without its number, as a row of MathML nodes. */
  body: MmlNode[];
  /** The number as MathJax sets it: `(1)` for `\tag{1}`, `A` for `\tag*{A}`. */
  tag: string;
}

/** The equation and its number when `root` is one tagged equation, else
 *  undefined (no tag, or a multi-line environment with tags per row). */
export function splitTag(root: MmlNode): TaggedEquation | undefined {
  const table = unwrap(root);
  if (table.kind !== 'mtable') return undefined;
  const rows = kids(table);
  if (rows.length !== 1 || rows[0]!.kind !== 'mlabeledtr') return undefined;
  const cells = kids(rows[0]!);
  // Label first, then a single cell: an aligned row (`a &= b \tag{1}`)
  // has more and stays unsupported.
  if (cells.length !== 2) return undefined;
  const tag = textOf(cells[0]!).trim();
  if (!tag) return undefined;
  return { body: kids(cells[1]!).flatMap(rowOf), tag };
}
