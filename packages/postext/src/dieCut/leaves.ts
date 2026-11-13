// Leaves and sides (#1565): which pages share a sheet of paper, and which
// page lies under another in the closed book. Page index i (0-based) is a
// recto when `pageIndexOffset + i` is even, the rule the canvas viewer
// pairs spreads by; a recto and the verso after it are one leaf. Pure.

import type { VDTDocument } from '../vdt.js';

/** Whether page `i` of a document that starts `offset` pages into its book
 *  is a recto. */
export function isRectoAt(i: number, offset = 0): boolean {
  return (((offset + i) % 2) + 2) % 2 === 0;
}

/** The leaf of page `i`, counted from the book's first (0). */
export function leafAt(i: number, offset = 0): number {
  return Math.floor((offset + i) / 2);
}

/** The document page indices of leaf `leaf`: its recto, then its verso. */
export function pagesOfLeaf(leaf: number, offset = 0): [number, number] {
  const recto = 2 * leaf - offset;
  return [recto, recto + 1];
}

/** Recto or verso: the side of its leaf page `i` of `doc` is printed on. */
export function leafSide(doc: Pick<VDTDocument, 'pageIndexOffset'>, i: number): 'recto' | 'verso' {
  return isRectoAt(i, doc.pageIndexOffset ?? 0) ? 'recto' : 'verso';
}

/** The page seen through a hole in page `i`: the recto of the next leaf
 *  under a recto (i + 2), the verso of the leaf before under a verso
 *  (i − 2). Leaves stack the same way in a right-bound book. −1 past
 *  either end of the document: the board, or the desk behind. */
export function pageBeneath(doc: Pick<VDTDocument, 'pageIndexOffset' | 'pages'>, i: number): number {
  const j = leafSide(doc, i) === 'recto' ? i + 2 : i - 2;
  return j >= 0 && j < doc.pages.length ? j : -1;
}
