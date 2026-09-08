import type { VDTColumn } from './vdt';

/** One vertical rule segment between two adjacent text columns of a band. */
export interface ColumnRuleSegment {
  /** Horizontal centre of the gutter. */
  x: number;
  top: number;
  bottom: number;
}

/**
 * Compute the column-rule segments of a page: one per gutter between
 * adjacent text columns of the same band, spanning the taller of the two
 * columns. Full-width `kind: 'span'` columns (page-span blocks) and
 * zero-height columns (bands closed before any text landed) never take
 * part, so the rule stops at a span block and resumes with the next band
 * — the ruling a compositor would draw. Bands are visited in column order,
 * which is band order because bands are always appended.
 */
export function columnRuleSegments(columns: readonly VDTColumn[]): ColumnRuleSegment[] {
  const byBand = new Map<number, VDTColumn[]>();
  for (const col of columns) {
    if (col.kind === 'span' || col.bbox.height <= 0.5) continue;
    const band = col.band ?? 0;
    const list = byBand.get(band);
    if (list) list.push(col);
    else byBand.set(band, [col]);
  }
  const segments: ColumnRuleSegment[] = [];
  for (const cols of byBand.values()) {
    for (let i = 0; i < cols.length - 1; i++) {
      const left = cols[i]!.bbox;
      const right = cols[i + 1]!.bbox;
      segments.push({
        x: (left.x + left.width + right.x) / 2,
        top: Math.min(left.y, right.y),
        bottom: Math.max(left.y + left.height, right.y + right.height),
      });
    }
  }
  return segments;
}
