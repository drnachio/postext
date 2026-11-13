// Die-cuts on the laid-out pages (#1565): the dice `dieCuts.pages` puts on
// page numbers, the `:::diecut{die=…}` runs, and the cut elements of the
// page templates, gathered once the pages and their decoration are laid,
// then stamped on `VDTPage.dieCut` through the leaf rule (`buildDieCuts`).

import type { ContentBlock } from '../../parse/types.js';
import type { Dimension, ResolvedDieCutsConfig } from '../../types.js';
import type { VDTDesignPathBlock, VDTDocument, VDTPage } from '../../vdt.js';
import { dimensionToPx } from '../../units.js';
import { type DieCutMetrics, dieMetricsOf, dieShapeInBox } from '../../dieCut/shapes.js';
import { type DiePlacement, buildDieCuts, configPlacements, shapePlacement } from '../../dieCut/place.js';

/** A cut element's gap when neither it nor its die sets one. */
const DEFAULT_GAP: Dimension = { value: 3, unit: 'mm' };

/** The die each content block is set under: that of the innermost
 *  `:::diecut` around it, `undefined` outside any. The fence markers carry
 *  the die they open or close. */
export function dieByBlock(blocks: readonly ContentBlock[]): (string | undefined)[] {
  const out: (string | undefined)[] = new Array(blocks.length);
  const stack: { id: number | undefined; die: string }[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (b.type === 'containerStart' && b.containerName === 'diecut') {
      stack.push({ id: b.containerId, die: (b.containerAttrs?.die ?? '').trim() });
      out[i] = stack[stack.length - 1]!.die;
      continue;
    }
    if (b.type === 'containerEnd' && b.containerName === 'diecut') {
      out[i] = stack[stack.length - 1]?.die;
      const at = stack.findIndex((s) => s.id === b.containerId);
      if (at >= 0) stack.length = at;
      continue;
    }
    out[i] = stack[stack.length - 1]?.die;
  }
  return out;
}

interface IndexedBlock {
  contentIndex?: number;
}
type RunPage = Pick<VDTPage, 'columns' | 'floats'>;

/** The die of the first block of `blocks` that names its source block;
 *  `null` when none does. */
function firstDie(blocks: readonly IndexedBlock[] | undefined, byBlock: readonly (string | undefined)[]): string | undefined | null {
  for (const b of blocks ?? []) if (b.contentIndex !== undefined) return byBlock[b.contentIndex];
  return null;
}

/** The die of each page's `:::diecut` run (`undefined` outside one). A run
 *  starts and ends on a page boundary, so a page's first block decides; a
 *  page without one (a parity blank) between two pages of one run belongs
 *  to it. */
export function dieOfPages(pages: readonly RunPage[], byBlock: readonly (string | undefined)[]): (string | undefined)[] {
  const found = pages.map((page) => {
    for (const col of page.columns) {
      const d = firstDie(col.blocks, byBlock);
      if (d !== null) return d;
    }
    return firstDie(page.floats, byBlock);
  });
  return found.map((d, i) => {
    if (d !== null) return d;
    let before: string | undefined | null = null;
    for (let j = i - 1; j >= 0 && before === null; j--) before = found[j]!;
    let after: string | undefined | null = null;
    for (let j = i + 1; j < found.length && after === null; j++) after = found[j]!;
    return before && before === after ? before : undefined;
  });
}

/** The cut elements of `page`'s composed decoration as placements, taken
 *  out of the decoration (it never paints them). */
export function liftCutElements(page: VDTPage, pageIndex: number, dice: ResolvedDieCutsConfig | undefined, metrics: DieCutMetrics): DiePlacement[] {
  const deco = page.composed?.decoration;
  if (!deco || !deco.blocks.some((b) => b.kind === 'path' && b.dieCut)) return [];
  const out: DiePlacement[] = [];
  deco.blocks = deco.blocks.filter((b) => {
    if (b.kind !== 'path' || !b.dieCut) return true;
    out.push(cutPlacement(b as VDTDesignPathBlock & { dieCut: NonNullable<VDTDesignPathBlock['dieCut']> }, pageIndex, dice, metrics));
    return false;
  });
  return out;
}

function cutPlacement(b: VDTDesignPathBlock & { dieCut: NonNullable<VDTDesignPathBlock['dieCut']> }, pageIndex: number, dice: ResolvedDieCutsConfig | undefined, metrics: DieCutMetrics): DiePlacement {
  const c = b.dieCut;
  const shape = c.die !== undefined ? dice?.shapes.find((s) => s.id === c.die) : undefined;
  const path = shape ? dieShapeInBox(shape, c.box, metrics) : b.subpaths.flat();
  const leaves = typeof c.leaves === 'number' && c.leaves >= 1 ? Math.floor(c.leaves) : shape?.leaves ?? 1;
  const wrap = c.wrap ?? shape?.wrap ?? { gap: DEFAULT_GAP };
  const wrapGapPx = wrap === false ? 0 : Math.max(0, dimensionToPx(wrap.gap ?? DEFAULT_GAP, metrics.dpi, metrics.fontSizePx ?? 16));
  return { pageIndex, id: c.die ?? `#cut`, path, leaves, wrapGapPx };
}

/** The placements `doc`'s pages ask for before their decoration is laid:
 *  `dieCuts.pages`, and the `:::diecut` run each page is set in (`dies`,
 *  one per page). */
export function earlyPlacements(doc: Pick<VDTDocument, 'config' | 'trimOffset' | 'pages' | 'pageIndexOffset'>, dies: readonly (string | undefined)[]): DiePlacement[] {
  const dice = doc.config.dieCuts;
  if (!dice) return [];
  const metrics = dieMetricsOf(doc);
  const { placements } = configPlacements(dice, metrics, doc.pages.length, doc.pageIndexOffset ?? 0);
  dies.forEach((die, i) => {
    const shape = die ? dice.shapes.find((s) => s.id === die) : undefined;
    if (shape) placements.push(shapePlacement(shape, i, metrics));
  });
  return placements;
}

/**
 * Stamps `page.dieCut` on every page of `doc` a die cuts or whose leaf has
 * a shape (see `buildDieCuts`), and takes every page's cut elements out of
 * its decoration. Pages nothing cuts are left without the key.
 */
export function stampDieCuts(doc: VDTDocument, contentBlocks: readonly ContentBlock[]): void {
  const dice = doc.config.dieCuts;
  const metrics = dieMetricsOf(doc);
  const lifted = doc.pages.flatMap((page, i) => liftCutElements(page, i, dice, metrics));
  const byBlock = dieByBlock(contentBlocks);
  const dies = byBlock.some((d) => d !== undefined) ? dieOfPages(doc.pages, byBlock) : [];
  if (!dice && lifted.length === 0) {
    for (const page of doc.pages) delete page.dieCut;
    return;
  }
  const config: ResolvedDieCutsConfig = dice ?? { shapes: [], pages: [] };
  const cuts = buildDieCuts({
    config,
    metrics,
    pageCount: doc.pages.length,
    offset: doc.pageIndexOffset ?? 0,
    binding: doc.config.page.binding,
    placements: [...earlyPlacements(doc, dies), ...lifted],
  });
  doc.pages.forEach((page, i) => {
    const cut = cuts[i];
    if (cut) page.dieCut = cut;
    else delete page.dieCut;
  });
}

