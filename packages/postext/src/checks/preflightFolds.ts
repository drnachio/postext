/**
 * The fold and relief part of the print preflight (#1667): what a binder
 * or a die-maker would send back for a cover sheet.
 *
 * - `reliefTrim`: an emboss or deboss past the trim (critical) or closer to
 *   it than 3 mm (warning): the die crushes the edge.
 * - `reliefFold`: an emboss or deboss across a fold or a score
 *   (`cutLines.foldMarks`, critical) or closer to one than 3 mm (warning):
 *   the relief cracks when the sheet is folded.
 * - `foldText` (warning): text across a fold, or closer to one than the
 *   safe zone (`print.preflight.safeZone`): the spine's text wanders onto
 *   the boards, a flap's line is lost in the fold.
 */

import type { BoundingBox, VDTDocument, VDTLine } from '../vdt.js';
import type { PreflightIssue } from './preflight.js';
import { dimensionToPx } from '../units.js';
import { flowRectToPage } from '../vdt.js';
import { pathBounds } from '../dieCut/geometry.js';

/** The nearest a relief may come to the trim or a fold. */
const RELIEF_CLEARANCE_MM = 3;
const MM_PER_IN = 25.4;

/** Fold and relief issues of `doc`. `safeZonePx` is the preflight's safe
 *  zone; `pageIndex` is book-absolute, as every preflight issue's. */
export function foldIssues(doc: VDTDocument, safeZonePx: number): PreflightIssue[] {
  const out: PreflightIssue[] = [];
  const cut = doc.config.page.cutLines;
  const dpi = doc.config.page.dpi;
  const offset = doc.pageIndexOffset ?? 0;
  const mm = (px: number) => Math.round((px / dpi) * MM_PER_IN * 10) / 10;
  const clearPx = dimensionToPx({ value: RELIEF_CLEARANCE_MM, unit: 'mm' }, dpi);
  const t = doc.trimOffset;
  const folds = (cut.foldMarks ?? []).map((f) => t + dimensionToPx(f, dpi));
  for (const page of doc.pages) {
    const pageIndex = page.index + offset;
    const trim: BoundingBox = { x: t, y: t, width: page.width - 2 * t, height: page.height - 2 * t };
    for (const plate of page.plates ?? []) {
      for (const path of plate.paths) {
        const b = pathBounds(path);
        if (!b) continue;
        const gaps = [b.x - trim.x, b.y - trim.y, trim.x + trim.width - (b.x + b.width), trim.y + trim.height - (b.y + b.height)];
        const nearest = Math.min(...gaps);
        const base = { pageIndex, rect: b, process: plate.process, source: plate.source };
        if (nearest < 0) out.push({ kind: 'reliefTrim', severity: 'critical', ...base, distanceMm: mm(nearest) });
        else if (nearest < clearPx) out.push({ kind: 'reliefTrim', severity: 'warning', ...base, distanceMm: mm(nearest) });
        for (const x of folds) {
          const d = x < b.x ? b.x - x : x > b.x + b.width ? x - b.x - b.width : -1;
          if (d < 0) out.push({ kind: 'reliefFold', severity: 'critical', ...base, distanceMm: 0 });
          else if (d < clearPx) out.push({ kind: 'reliefFold', severity: 'warning', ...base, distanceMm: mm(d) });
        }
      }
    }
    if (folds.length === 0) continue;
    // Text by a fold: one issue per fold and page, the nearest line.
    const lines = [...page.columns.flatMap((c) => c.blocks), ...(page.floats ?? []), ...page.marginNotes]
      .filter((b) => !b.hidden)
      .flatMap((b) => b.lines.filter((l) => l.text.trim()).map((l) => ({ line: l, block: b })));
    for (const x of folds) {
      let worst: { d: number; line: VDTLine; rect: BoundingBox; start?: number; end?: number } | undefined;
      for (const { line, block } of lines) {
        const r = page.flow ? flowRectToPage(page, line.bbox) : line.bbox;
        const d = x < r.x ? r.x - x : x > r.x + r.width ? x - r.x - r.width : 0;
        if (d >= safeZonePx && d > 0) continue;
        if (!worst || d < worst.d) worst = { d, line, rect: r, start: block.sourceStart, end: block.sourceEnd };
      }
      if (!worst) continue;
      out.push({
        kind: 'foldText', severity: 'warning', pageIndex, rect: worst.rect, text: worst.line.text.trim().slice(0, 40), distanceMm: mm(worst.d),
        ...(worst.start !== undefined ? { sourceStart: worst.start, ...(worst.end !== undefined ? { sourceEnd: worst.end } : {}) } : {}),
      });
    }
  }
  return out;
}
