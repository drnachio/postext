// The master items a page shows.
//
// A page names the master spread applied to it, and a master's pages may
// name another master the first is based on. The page shows the items of
// every master of that chain, the deepest one at the back. Each master
// page's items are laid on the page that applies it through that page's
// `MasterPageTransform`, which takes the master page's own frame to the
// applying page's own frame (the two differ when the pages are not the
// same size, or were moved on their spreads).
//
// A master item is not shown where it was overridden: the page lists the
// overridden items in `OverrideList`, and the item that replaced it on
// the page may name it (`OverriddenMasterPageItem`). A spread whose
// `ShowMasterItems` is off shows none.

import type { IdmlDocument, IdmlPage, IdmlPageItem, IdmlSpread } from '../model/document.js';
import { invert, multiply, type Box, type Matrix } from '../model/geometry.js';
import { itemExtent, itemIndex, pageUnder, spreadMatrix, transformBox, type Located } from './geometry.js';

export interface MasterItem {
  item: IdmlPageItem;
  master: IdmlSpread;
  masterPage: IdmlPage;
  /** Item frame → page coordinates of the document page. */
  toPage: Matrix;
  /** Its box on the document page. */
  box: Box | undefined;
  /** Masters between the page and this one: 0 for the applied master. */
  depth: number;
}

/** The page of a master spread that stands for a document page: the one
 *  on the same side of the spine; a master of one page serves both. */
export function masterPageFor(master: IdmlSpread, page: IdmlPage, spread?: IdmlSpread): IdmlPage | undefined {
  if (master.pages.length <= 1) return master.pages[0];
  if (page.side !== 'single') {
    const same = master.pages.find((p) => p.side === page.side);
    if (same) return same;
  }
  // Single pages, or a master whose pages have no side: by position.
  const at = spread ? spread.pages.indexOf(page) : 0;
  return master.pages[Math.min(Math.max(at, 0), master.pages.length - 1)];
}

function spreadOfPage(doc: IdmlDocument, page: IdmlPage): IdmlSpread | undefined {
  return doc.spreads.find((s) => s.pages.includes(page)) ?? doc.masterSpreads.find((s) => s.pages.includes(page));
}

/** The master items shown on a page of the document, back to front: the
 *  deepest master's first, each master's in its own stacking order. Only
 *  top-level items of the master spreads are given (a group comes whole).
 *  Items on hidden layers are included: the layer is the caller's to
 *  judge, as for the page's own items. */
export function masterItems(doc: IdmlDocument, page: IdmlPage): MasterItem[] {
  const spread = spreadOfPage(doc, page);
  if (!spread || !spread.showMasterItems) return [];
  const index = itemIndex(doc);

  // Everything overridden along the way: on the page itself, and on the
  // master pages of the chain (a master overrides its parent's items the
  // same way).
  const overridden = new Set<string>(page.overrideList);
  for (const at of index.values()) if (at.spread === spread && at.item.overrides) overridden.add(at.item.overrides);

  // The chain, nearest master first.
  interface Link { master: IdmlSpread; masterPage: IdmlPage; toPage: Matrix }
  const chain: Link[] = [];
  const seen = new Set<string>();
  let applying: IdmlPage = page;
  let applyingSpread: IdmlSpread | undefined = spread;
  // Applying page's own frame → the document page's coordinates.
  let toPage: Matrix = [1, 0, 0, 1, -page.bounds.left, -page.bounds.top];
  while (applying.appliedMaster && !seen.has(applying.appliedMaster)) {
    seen.add(applying.appliedMaster);
    const master = doc.masterSpreads.find((m) => m.self === applying.appliedMaster);
    if (!master) break;
    const masterPage = masterPageFor(master, applying, applyingSpread);
    if (!masterPage) break;
    toPage = multiply(toPage, applying.masterPageTransform);
    chain.push({ master, masterPage, toPage });
    for (const id of masterPage.overrideList) overridden.add(id);
    for (const at of index.values()) if (at.spread === master && at.item.overrides) overridden.add(at.item.overrides);
    // A master that hides master items shows none of its parents'.
    if (!master.showMasterItems) break;
    applying = masterPage;
    applyingSpread = master;
  }

  const out: MasterItem[] = [];
  for (let depth = chain.length - 1; depth >= 0; depth--) {
    const { master, masterPage, toPage: fromMasterPage } = chain[depth]!;
    // Master spread frame → master page's own frame → document page.
    const fromSpread = multiply(fromMasterPage, invert(masterPage.transform));
    for (const item of master.items) {
      if (overridden.has(item.self)) continue;
      const at: Located = { item, spread: master, parents: [] };
      const inSpread = spreadMatrix(at);
      const spreadBox = itemExtent(item, inSpread);
      // An item belongs to the master page it stands on; one on the
      // master's pasteboard is on no page.
      if (pageUnder(master, spreadBox) !== masterPage) continue;
      const m = multiply(fromSpread, inSpread);
      out.push({ item, master, masterPage, toPage: m, box: spreadBox ? transformBox(spreadBox, fromSpread) : undefined, depth });
    }
  }
  return out;
}

