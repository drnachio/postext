// The parity gate of the layout benchmarks (#779): a hash of what a
// reader sees of a layout. A change that moves it is a change of
// behaviour, not an optimisation.

import { createHash } from 'node:crypto';
import type { VDTDocument } from 'postext';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** What a reader sees of the layout: every block's place, every line's
 *  text and place, page by page. */
export function vdtHash(docs: readonly VDTDocument[]): string {
  const h = createHash('sha256');
  for (const doc of docs) {
    h.update(`doc ${doc.pages.length}\n`);
    for (const b of doc.blocks) {
      h.update(`${b.id} ${b.type} ${b.pageIndex}/${b.columnIndex} ${r2(b.bbox.x)},${r2(b.bbox.y)},${r2(b.bbox.width)},${r2(b.bbox.height)}\n`);
      for (const l of b.lines) h.update(` ${l.text}|${r2(l.bbox.x)},${r2(l.bbox.y)},${r2(l.bbox.width)}|${r2(l.baseline)}|${l.hyphenated ? 1 : 0}\n`);
    }
  }
  return h.digest('hex').slice(0, 16);
}
