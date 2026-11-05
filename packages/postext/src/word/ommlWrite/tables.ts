// `mtable` → a matrix (`m:m`) or, for the display alignments (`aligned`,
// `align*`, `gathered`, which MathJax marks displaystyle), an equation array
// (`m:eqArr`) whose rows carry Word's `&` alignment marks.

import { explicitAttr, kids, unsupported, type MmlNode } from './mml.js';
import { mathRun, type RunOptions } from './runs.js';
import { rowOf, small, wrap } from './convert.js';
import { convertRow } from './rows.js';

const JC: Record<string, string> = { left: 'left', right: 'right', center: 'center' };

function cellsOf(row: MmlNode): MmlNode[] {
  if (row.kind === 'mlabeledtr') unsupported('equation tag');
  if (row.kind !== 'mtr') unsupported(`table row ${row.kind}`);
  return kids(row);
}

function cellContent(cell: MmlNode, opts: RunOptions): string {
  // mtd → its inferred row.
  return convertRow(kids(cell).flatMap(rowOf), opts);
}

export function convertTable(node: MmlNode, opts: RunOptions): string {
  const rows = kids(node).map(cellsOf);
  if (explicitAttr(node, 'displaystyle') === 'true') {
    const amp = mathRun('&', {}, opts);
    const ds = { ...opts, display: true };
    return wrap('eqArr', rows.map((cells) => wrap('e', cells.map((c) => cellContent(c, ds)).join(amp))).join(''));
  }
  opts = small(opts);
  const cols = Math.max(1, ...rows.map((r) => r.length));
  // CT_MCS holds at most 64 column entries.
  if (cols > 64) unsupported(`matrix of ${cols} columns`);
  // CT_M needs at least one row: an empty environment is one empty row.
  if (rows.length === 0) rows.push([]);
  const aligns = (explicitAttr(node, 'columnalign') ?? '').split(/\s+/).filter(Boolean);
  let mcs = '';
  for (let i = 0; i < cols; i++) {
    // MathML repeats the last value for the remaining columns.
    const a = aligns[Math.min(i, aligns.length - 1)] ?? 'center';
    mcs += `<m:mc><m:mcPr><m:count m:val="1"/><m:mcJc m:val="${JC[a] ?? 'center'}"/></m:mcPr></m:mc>`;
  }
  const body = rows.map((cells) => {
    let r = '';
    for (let i = 0; i < cols; i++) r += wrap('e', cells[i] ? cellContent(cells[i]!, opts) : '');
    return wrap('mr', r);
  }).join('');
  return wrap('m', `<m:mPr><m:mcs>${mcs}</m:mcs></m:mPr>${body}`);
}
