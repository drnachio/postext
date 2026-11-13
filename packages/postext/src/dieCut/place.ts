// Die-cut placement (#1565): where each die cuts, page by page. A shape
// placed on a page cuts its whole leaf: the other side carries it
// mirrored across the sheet (x' = sheet width − x), and `leaves: N` takes
// it through the next N − 1 leaves too, each side as the one it lies on.
// Every leaf also gets the book's outline (rounded corners, a shape). Pure.

import type { ResolvedDieCutsConfig, ResolvedDieShape } from '../types.js';
import type { VDTDieCut, VDTPathCommand } from '../vdt.js';
import { mirrorPath, pathBounds } from './geometry.js';
import { isRectoAt, leafAt, pagesOfLeaf } from './leaves.js';
import { type DieCutMetrics, dieShapePath, dieWrapGapPx, leafOutline } from './shapes.js';

/** One die put on one page: its outline there (page px), how many leaves it
 *  goes through from that page's, and the gap text keeps from it. */
export interface DiePlacement {
  /** Document page index (0-based) the die is placed on. */
  pageIndex: number;
  /** The die's id (a shape's, or a cut element's). */
  id: string;
  path: VDTPathCommand[];
  leaves: number;
  wrapGapPx: number;
}

/** The longest list a page spec expands to: a range runs no further. */
const MAX_PAGES = 100000;

/** The page numbers of a spec (`'5'`, `'3-12'`, `'3,7,11-13'`), 1-based,
 *  in the order written; parts that are not numbers or ranges are left
 *  out. */
export function parsePageList(spec: string): number[] {
  const out: number[] = [];
  for (const part of spec.split(',')) {
    const p = part.trim();
    const m = /^(\d+)\s*(?:-\s*(\d+))?$/.exec(p);
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] !== undefined ? Number(m[2]) : a;
    const lo = Math.min(a, b);
    const hi = Math.min(Math.max(a, b), lo + MAX_PAGES);
    for (let n = lo; n <= hi; n++) if (n >= 1) out.push(n);
  }
  return out;
}

/** A die shape placed on document page `pageIndex`. */
export function shapePlacement(shape: ResolvedDieShape, pageIndex: number, metrics: DieCutMetrics): DiePlacement {
  return { pageIndex, id: shape.id, path: dieShapePath(shape, metrics), leaves: shape.leaves, wrapGapPx: dieWrapGapPx(shape, metrics) };
}

/** The placements `dieCuts.pages` asks for on a document of `pageCount`
 *  pages that starts `offset` pages into its book (page numbers count the
 *  book's pages), and the die ids it names that no shape has. */
export function configPlacements(
  config: ResolvedDieCutsConfig,
  metrics: DieCutMetrics,
  pageCount: number,
  offset = 0,
): { placements: DiePlacement[]; unknown: string[] } {
  const placements: DiePlacement[] = [];
  const unknown: string[] = [];
  for (const entry of config.pages) {
    const shape = config.shapes.find((s) => s.id === entry.die);
    if (!shape) {
      if (!unknown.includes(entry.die)) unknown.push(entry.die);
      continue;
    }
    for (const n of parsePageList(entry.pages)) {
      const i = n - 1 - offset;
      // A die may be placed on a page of an earlier chapter whose leaf
      // reaches into this one: kept while its leaves can.
      if (i >= pageCount) continue;
      if (i < 0 && leafAt(i, offset) + shape.leaves - 1 < leafAt(0, offset)) continue;
      placements.push(shapePlacement(shape, i, metrics));
    }
  }
  return { placements, unknown };
}

/** The holes each page of the range carries from `placements`, mirrored
 *  for its side: one list per page, `[]` for a page nothing cuts. A hole
 *  that lands twice on a page (the same die, the same box) is kept once. */
export function holesByPage(placements: readonly DiePlacement[], pageCount: number, metrics: DieCutMetrics, offset = 0): { path: VDTPathCommand[]; id: string; wrapGapPx: number }[][] {
  const out: { path: VDTPathCommand[]; id: string; wrapGapPx: number }[][] = Array.from({ length: pageCount }, () => []);
  const seen: Set<string>[] = Array.from({ length: pageCount }, () => new Set());
  for (const p of placements) {
    const first = leafAt(p.pageIndex, offset);
    const recto = isRectoAt(p.pageIndex, offset);
    let mirrored: VDTPathCommand[] | undefined;
    for (let leaf = first; leaf < first + Math.max(1, p.leaves); leaf++) {
      for (const j of pagesOfLeaf(leaf, offset)) {
        if (j < 0 || j >= pageCount) continue;
        const same = isRectoAt(j, offset) === recto;
        const path = same ? p.path : (mirrored ??= mirrorPath(p.path, metrics.width));
        const b = pathBounds(path);
        const key = b ? `${p.id}|${Math.round(b.x)}|${Math.round(b.y)}|${Math.round(b.width)}|${Math.round(b.height)}` : p.id;
        if (seen[j]!.has(key)) continue;
        seen[j]!.add(key);
        out[j]!.push({ path, id: p.id, wrapGapPx: p.wrapGapPx });
      }
    }
  }
  return out;
}

/** The holes page `pageIndex` carries from `placements` (see
 *  {@link holesByPage}), worked out for that page alone: what the flow
 *  asks of a page as it opens, before the document's length is known. */
export function holesOnPage(placements: readonly DiePlacement[], pageIndex: number, metrics: DieCutMetrics, offset = 0): { path: VDTPathCommand[]; id: string; wrapGapPx: number }[] {
  const leaf = leafAt(pageIndex, offset);
  const recto = isRectoAt(pageIndex, offset);
  const out: { path: VDTPathCommand[]; id: string; wrapGapPx: number }[] = [];
  const seen = new Set<string>();
  for (const p of placements) {
    const first = leafAt(p.pageIndex, offset);
    if (leaf < first || leaf >= first + Math.max(1, p.leaves)) continue;
    const path = isRectoAt(p.pageIndex, offset) === recto ? p.path : mirrorPath(p.path, metrics.width);
    const b = pathBounds(path);
    const key = b ? `${p.id}|${Math.round(b.x)}|${Math.round(b.y)}|${Math.round(b.width)}|${Math.round(b.height)}` : p.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ path, id: p.id, wrapGapPx: p.wrapGapPx });
  }
  return out;
}

/** What `buildDieCuts` lays out. */
export interface DieCutsInput {
  config: ResolvedDieCutsConfig;
  metrics: DieCutMetrics;
  pageCount: number;
  /** Physical pages before page 0 (`pageIndexOffset`). */
  offset?: number;
  binding?: 'left' | 'right';
  /** Every die put on a page: `dieCuts.pages`, `:::diecut` runs, cut
   *  elements. */
  placements: readonly DiePlacement[];
}

/** Each page's die-cut (see {@link VDTDieCut}), `undefined` for a page no
 *  die cuts and whose leaf keeps the plain trim. */
export function buildDieCuts(input: DieCutsInput): (VDTDieCut | undefined)[] {
  const offset = input.offset ?? 0;
  const holes = holesByPage(input.placements, input.pageCount, input.metrics, offset);
  const recto = leafOutline(input.config, input.metrics, 'recto', input.binding);
  const verso = recto ? leafOutline(input.config, input.metrics, 'verso', input.binding) : undefined;
  return holes.map((list, i) => {
    const outline = isRectoAt(i, offset) ? recto : verso;
    if (list.length === 0 && !outline) return undefined;
    const cut: VDTDieCut = {
      holes: list.map((h) => h.path),
      sources: list.map((h) => h.id),
      wrapGapPx: list.map((h) => h.wrapGapPx),
    };
    if (outline) cut.outline = outline;
    return cut;
  });
}
