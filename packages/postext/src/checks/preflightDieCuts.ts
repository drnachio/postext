/**
 * The die-cut part of the print preflight (#1565): what a die-maker or a
 * binder would send back.
 *
 * - `dieCutText` (warning): text set within its hole's wrap gap of a cut
 *   edge, or under the hole (a hole that does not wrap counts from its
 *   edge), from the laid-out lines. One per hole and page.
 * - `dieCutTrim`: a hole that runs past the trim (critical) or comes closer
 *   to it than 3 mm (warning): the die tears the edge.
 * - `dieCutGutter` (critical): a hole that reaches the spine fold, where the
 *   leaves are sewn or glued.
 * - `dieCutUnknown` (warning): a page of `dieCuts.pages` or a `:::diecut`
 *   that names a die `dieCuts.shapes` lacks: nothing is cut there.
 */

import type { BoundingBox, VDTDocument, VDTLine } from '../vdt.js';
import type { PreflightIssue } from './preflight.js';
import { dimensionToPx } from '../units.js';
import { flowRectToPage } from '../vdt.js';
import { flattenPath, pathBounds, rectPolygonDistance } from '../dieCut/geometry.js';
import { leafSide } from '../dieCut/leaves.js';

/** The nearest a hole may come to the trim. */
const TRIM_CLEARANCE_MM = 3;
const MM_PER_IN = 25.4;

/** The span a line is painted in: its natural box, cut to its measure
 *  when it has one (a line set short beside a wrap is justified into its
 *  measure, its spaces shrunk). */
function inkOf(line: VDTLine): BoundingBox {
  const b = line.bbox;
  const m = line.measure;
  if (!m) return b;
  const x0 = Math.max(b.x, m.x);
  const x1 = Math.min(b.x + b.width, m.x + m.width);
  return x1 > x0 ? { x: x0, y: b.y, width: x1 - x0, height: b.height } : b;
}

/** Die-cut issues of `doc` (see the module comment). `pageIndex` is
 *  book-absolute, as every preflight issue's. */
export function dieCutIssues(doc: VDTDocument): PreflightIssue[] {
  const out: PreflightIssue[] = [];
  const offset = doc.pageIndexOffset ?? 0;
  const dpi = doc.config.page.dpi;
  const mm = (px: number) => Math.round((px / dpi) * MM_PER_IN * 10) / 10;
  const clearPx = dimensionToPx({ value: TRIM_CLEARANCE_MM, unit: 'mm' }, dpi);
  const binding = doc.config.page.binding;

  // Dice named and missing: the config's placements, then the runs.
  const dice = doc.config.dieCuts;
  const named = new Set((dice?.shapes ?? []).map((s) => s.id));
  for (const p of dice?.pages ?? []) {
    if (!named.has(p.die)) out.push({ kind: 'dieCutUnknown', severity: 'warning', pageIndex: offset, die: p.die });
  }
  for (const w of doc.contentWarnings ?? []) {
    if (w.kind !== 'dieCutUnknown') continue;
    out.push({
      kind: 'dieCutUnknown', severity: 'warning', pageIndex: (w.pageIndex ?? 0) + offset, die: w.die,
      ...(w.sourceStart !== undefined ? { sourceStart: w.sourceStart, ...(w.sourceEnd !== undefined ? { sourceEnd: w.sourceEnd } : {}) } : {}),
    });
  }

  doc.pages.forEach((page, i) => {
    const cut = page.dieCut;
    if (!cut || cut.holes.length === 0) return;
    const pageIndex = page.index + offset;
    const t = doc.trimOffset;
    const trim: BoundingBox = { x: t, y: t, width: page.width - 2 * t, height: page.height - 2 * t };
    // The spine is on the left of a recto in a left-bound book.
    const spineLeft = (leafSide(doc, i) === 'recto') === (binding !== 'right');
    const lines = [...page.columns.flatMap((c) => c.blocks), ...(page.floats ?? []), ...page.marginNotes]
      .filter((b) => !b.hidden)
      .flatMap((b) => b.lines.filter((l) => l.text.trim()).map((l) => ({ line: l, block: b })));
    cut.holes.forEach((hole, h) => {
      const die = cut.sources[h] ?? '';
      const b = pathBounds(hole);
      if (!b) return;
      // Against the trim and the fold.
      const spineGap = spineLeft ? b.x - trim.x : trim.x + trim.width - (b.x + b.width);
      const foreGap = spineLeft ? trim.x + trim.width - (b.x + b.width) : b.x - trim.x;
      const gaps = [foreGap, b.y - trim.y, trim.y + trim.height - (b.y + b.height)];
      if (spineGap < clearPx) out.push({ kind: 'dieCutGutter', severity: 'critical', pageIndex, rect: b, die });
      const nearest = Math.min(...gaps);
      if (nearest < 0) out.push({ kind: 'dieCutTrim', severity: 'critical', pageIndex, rect: b, die, distanceMm: mm(nearest) });
      else if (nearest < clearPx) out.push({ kind: 'dieCutTrim', severity: 'warning', pageIndex, rect: b, die, distanceMm: mm(nearest) });
      // Text by the cut edge.
      const gap = cut.wrapGapPx[h] ?? 0;
      const reach = Math.max(gap - 1, 0);
      let polys: ReturnType<typeof flattenPath> | undefined;
      let worst: { d: number; text: string; rect: BoundingBox; src?: { start?: number; end?: number } } | undefined;
      for (const { line, block } of lines) {
        const r = page.flow ? flowRectToPage(page, inkOf(line)) : inkOf(line);
        if (r.x > b.x + b.width + reach || r.x + r.width < b.x - reach || r.y > b.y + b.height + reach || r.y + r.height < b.y - reach) continue;
        polys ??= flattenPath(hole);
        const d = rectPolygonDistance(r, polys);
        if (d >= reach && d > 0) continue;
        if (!worst || d < worst.d) worst = { d, text: line.text.trim().slice(0, 40), rect: r, src: { start: block.sourceStart, end: block.sourceEnd } };
      }
      if (worst) {
        out.push({
          kind: 'dieCutText', severity: 'warning', pageIndex, rect: worst.rect, die, text: worst.text, distanceMm: mm(worst.d),
          ...(worst.src?.start !== undefined ? { sourceStart: worst.src.start, ...(worst.src.end !== undefined ? { sourceEnd: worst.src.end } : {}) } : {}),
        });
      }
    });
  });
  return out;
}
