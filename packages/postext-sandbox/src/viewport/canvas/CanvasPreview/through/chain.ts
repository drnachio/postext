// Which painted pages a die-cut page shows (#1567). A page with holes is
// painted with the pages beneath drawn into them, so its pixels depend on
// theirs: the pages beneath must be painted first, a change to one of them
// repaints every page that shows it, and the paint key of a holed page
// carries the keys of the pages it shows. Pure: the canvas hooks keep the
// state, this decides.

import { leafSide, seeThrough, type VDTDocument, type VDTPage } from 'postext';

type ChainDoc = Pick<VDTDocument, 'pages' | 'pageIndexOffset'>;

/** The see-through dependencies of one document. */
export interface ThroughChain {
  /** The pages each holed page shows through its holes, nearest first (the
   *  book's end, −1, left out). */
  seen: ReadonlyMap<number, readonly number[]>;
  /** The pages a page's pixels depend on: what it shows, and what those
   *  pages show in their own holes, nearest first. */
  reach: ReadonlyMap<number, readonly number[]>;
  /** The pages whose pixels depend on page k (the inverse of `reach`),
   *  nearest first: what to repaint when k repaints. */
  dependents: ReadonlyMap<number, readonly number[]>;
}

const byDistance = (from: number) => (a: number, b: number): number => Math.abs(a - from) - Math.abs(b - from) || a - b;

/**
 * The see-through chain of `doc`, or `undefined` for a document without a
 * hole (every page paints on its own, at no extra cost). A page cut only by
 * its leaf's outline shows nothing beneath: what is past the outline is
 * the viewer's background.
 */
export function throughChain(doc: ChainDoc): ThroughChain | undefined {
  const seen = new Map<number, number[]>();
  for (let i = 0; i < doc.pages.length; i++) {
    if (!doc.pages[i]?.dieCut?.holes.length) continue;
    const pages = seeThrough(doc, i).map((l) => l.pageIndex).filter((j) => j >= 0);
    seen.set(i, pages);
  }
  if (seen.size === 0) return undefined;
  const reach = new Map<number, number[]>();
  const reachOf = (i: number, visiting: Set<number>): number[] => {
    const known = reach.get(i);
    if (known) return known;
    const out = new Set<number>();
    visiting.add(i);
    for (const j of seen.get(i) ?? []) {
      if (visiting.has(j)) continue;
      out.add(j);
      for (const k of reachOf(j, visiting)) out.add(k);
    }
    visiting.delete(i);
    const list = [...out].filter((j) => j !== i).sort(byDistance(i));
    reach.set(i, list);
    return list;
  };
  for (const i of seen.keys()) reachOf(i, new Set());
  const dependents = new Map<number, number[]>();
  for (const [i, pages] of reach) {
    for (const j of pages) {
      const list = dependents.get(j) ?? [];
      list.push(i);
      dependents.set(j, list);
    }
  }
  for (const [j, list] of dependents) list.sort(byDistance(j));
  return { seen, reach, dependents };
}

/**
 * `indices` in an order that paints a page after every page it shows. A
 * recto shows the rectos after it (i + 2, i + 4…) and a verso the versos
 * before it, so versos go first to last and rectos last to first. Without
 * a chain the order is left as it is.
 */
export function paintOrder(doc: ChainDoc, indices: Iterable<number>, chain: ThroughChain | undefined): number[] {
  const list = [...indices];
  if (!chain) return list;
  const versos = list.filter((i) => leafSide(doc, i) === 'verso').sort((a, b) => a - b);
  const rectos = list.filter((i) => leafSide(doc, i) === 'recto').sort((a, b) => b - a);
  return [...versos, ...rectos];
}

/**
 * What page `i` shows through its holes as part of its paint key: the keys
 * of the pages it reaches (`keyOf`, a composed page's paint key), joined.
 * `''` for a page that shows nothing beneath; `undefined` when a page it
 * shows has no key (a flowing page: always repainted).
 */
export function throughPaintKey(
  doc: ChainDoc,
  i: number,
  chain: ThroughChain | undefined,
  keyOf: (page: VDTPage) => string | undefined,
): string | undefined {
  const pages = chain?.reach.get(i);
  if (!pages || pages.length === 0) return '';
  const keys: string[] = [];
  for (const j of pages) {
    const page = doc.pages[j];
    const key = page ? keyOf(page) : undefined;
    if (key === undefined) return undefined;
    keys.push(`${j}:${key}`);
  }
  return keys.join('/');
}

/** Bitmap pixels per page px of a page painted only to be seen through a
 *  hole: half the visible pages' scale (the hole shows a part of it, often
 *  in the shade of the cut), never more than theirs. */
export function hiddenScale(bitmapScale: number): number {
  return Math.min(bitmapScale, Math.max(0.35, bitmapScale * 0.5));
}
